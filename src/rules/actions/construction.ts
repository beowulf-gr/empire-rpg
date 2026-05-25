/**
 * Construction actions — Build Roads, Build Stronghold, Convert Terrain.
 *
 * Each construction has two phases:
 *
 *   1. start*(state, params, currentSeason): validate parameters, compute the
 *      true duration (base + off-season penalty), deduct the up-front cost
 *      from the resource pool, and append an OngoingAction to the realm.
 *
 *   2. apply*(state, ongoing): runs at completion when the orchestrator's
 *      tickOngoingActions decrements seasonsRemaining to 0. Mutates the realm
 *      to reflect what was built (mark roads, add stronghold row, swap terrain).
 *
 * applyCompletedConstruction is the single dispatch point used by the
 * orchestrator — it looks at ongoing.actionId and calls the right handler.
 */

import type {
  MineResource,
  Race,
  RealmScale,
  Season,
  StrongholdKind,
  Terrain,
} from '../../types/rules'
import { SLOT_CAPS, MINE_CAP, STRONGHOLD_META, TERRAIN_STATS } from '../../types/rules'
import type { RealmState, StrongholdState, TurnEvent } from '../state'
import type { ActionId, OngoingAction } from './types'
import {
  commitIdlePopulation,
  commitIdlePopulationByRace,
  returnCommittedPopulation,
  settleCommittedPopulation,
  type CommittedPopChunk,
} from './populationCommit'
import { areAdjacent, nearStrongholdOrRoad as nearStrongholdOrRoadGeo } from '../geography'

// ============================================================
// Types
// ============================================================

/**
 * Optional per-race workforce mix for a construction action. When provided,
 * the engine consumes exactly the specified counts from the idle pool via
 * `commitIdlePopulationByRace` instead of auto-picking; the player chose
 * which races contribute. Sum MUST equal the action's total population cost
 * or `startXxx` throws. Omit (or pass undefined) for the default auto-pick.
 */
export type WorkforceMix = Partial<Record<Race, number>>

export interface BuildRoadsParams {
  areaIds: string[] // up to 4 contiguous areas (validation is loose for MVP)
  raceMix?: WorkforceMix
}

export interface BuildStrongholdParams {
  kind: StrongholdKind
  areaId: string
  /** Required for mines. */
  mineResourceType?: MineResource
  /** Required for add-ons (wall, marketplace, port, guild, academy, temple). */
  parentStrongholdId?: string
  raceMix?: WorkforceMix
  /**
   * Player-given name for the resulting stronghold. Saved verbatim onto
   * the new StrongholdState when the action completes. Empty/whitespace
   * is treated as null (UI falls back to the default "{Kind} #N" label).
   */
  name?: string
}

export interface ConvertTerrainParams {
  areaId: string
  newTerrain: Terrain // must NOT be 'wasteland'
  raceMix?: WorkforceMix
}

/** Anything that can fail during a start* call. */
export class ConstructionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConstructionError'
  }
}

interface StartResult {
  state: RealmState
  events: TurnEvent[]
}

// ============================================================
// Helpers
// ============================================================

/** Off-season duration penalty per the registry: spring=0, summer=+1, fall=+2 (winter prohibited). */
function offSeasonPenalty(season: Season): number {
  switch (season) {
    case 'spring': return 0
    case 'summer': return 1
    case 'fall':   return 2
    case 'winter': return Number.POSITIVE_INFINITY // prohibited
  }
}

/**
 * Generic resource deduction with validation. Throws ConstructionError if any
 * resource is short. Returns a new state with the costs deducted.
 */
function deductCost(
  state: RealmState,
  cost: { gold?: number; lumber?: number; stone?: number; food?: number },
): RealmState {
  const r = { ...state.resources }
  for (const [key, val] of Object.entries(cost) as [keyof typeof r, number][]) {
    if (val === undefined) continue
    if (r[key] < val) {
      throw new ConstructionError(`Not enough ${key}: have ${r[key]}, need ${val}`)
    }
    r[key] = r[key] - val
  }
  return { ...state, resources: r }
}

function makeOngoingId(): string {
  return crypto.randomUUID()
}

/**
 * Borrows `count` workers from the idle pool, honouring an optional player
 * race-mix. When `raceMix` is omitted (or empty/all-zero), we fall back to
 * the auto-pick `commitIdlePopulation(count)` — preserves the historical
 * behaviour for callers that don't care which races contribute.
 *
 * When `raceMix` is provided, the sum of its counts must equal `count`
 * exactly — overshoot or undershoot is an error so the player can't
 * accidentally short-staff or over-pay a project.
 */
function commitWorkforce(
  state: RealmState,
  count: number,
  raceMix: WorkforceMix | undefined,
): { state: RealmState; committed: CommittedPopChunk[] } {
  if (!raceMix) return commitIdlePopulation(state, count)
  // Normalise + sum: floor fractions, drop non-positive entries.
  let total = 0
  const normalised: WorkforceMix = {}
  for (const [race, n] of Object.entries(raceMix) as [Race, number | undefined][]) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue
    const v = Math.floor(n)
    if (v <= 0) continue
    normalised[race] = v
    total += v
  }
  if (total === 0) return commitIdlePopulation(state, count)
  if (total !== count) {
    throw new ConstructionError(
      `Workforce mix totals ${total} but the action needs exactly ${count}.`,
    )
  }
  return commitIdlePopulationByRace(state, normalised)
}

// ============================================================
// Build Roads
// ============================================================

/**
 * Per registry: 1 pop, 1 stone, 2 lumber, 2 seasons, can cross up to 4 areas.
 * If not starting from a stronghold or existing road: +1 pop, +1 lumber.
 *
 * For MVP we don't model a road graph topologically; an area either has a
 * road or not. "Connected" is an existence flag.
 */
export function startBuildRoads(
  state: RealmState,
  params: BuildRoadsParams,
  currentYear: number,
  currentSeason: Season,
): StartResult {
  if (params.areaIds.length === 0) {
    throw new ConstructionError('Pick at least one area to road through.')
  }
  if (params.areaIds.length > 4) {
    throw new ConstructionError('A single Build Roads can cross at most 4 areas.')
  }
  for (const id of params.areaIds) {
    if (!state.areas.some((a) => a.id === id)) {
      throw new ConstructionError(`Area ${id} is not in this realm.`)
    }
  }
  const penalty = offSeasonPenalty(currentSeason)
  if (!Number.isFinite(penalty)) {
    throw new ConstructionError('Build Roads is prohibited in winter.')
  }

  // "Isolated" surcharge per book: the new road must START at a stronghold
  // or existing road. We interpret that as: at least one of the chosen
  // areas must HAVE a stronghold/road on it OR be 4-adjacent to one. If
  // none of the chosen areas qualifies, the road is isolated and incurs
  // the +1 lumber, +1 pop surcharge.
  const strongholdAreaIds = new Set(state.strongholds.map((s) => s.areaId))
  const roadAreaIdSet = new Set(state.roadAreaIds)
  const isolated = !params.areaIds.some((id) => {
    if (roadAreaIdSet.has(id) || strongholdAreaIds.has(id)) return true
    const here = state.areas.find((a) => a.id === id)
    if (!here) return false
    return state.areas.some(
      (other) => areAdjacent(here, other) && (roadAreaIdSet.has(other.id) || strongholdAreaIds.has(other.id)),
    )
  })

  const cost = {
    stone: 1,
    lumber: 2 + (isolated ? 1 : 0),
    population: 1 + (isolated ? 1 : 0),
  }
  const afterResources = deductCost(state, { stone: cost.stone, lumber: cost.lumber })
  // Borrow workers from the idle pool. Throws if insufficient.
  const { state: next, committed } = commitWorkforce(
    afterResources,
    cost.population,
    params.raceMix,
  )
  const duration = 2 + penalty

  const ongoing: OngoingAction = {
    id: makeOngoingId(),
    actionId: 'build_roads',
    startedYear: currentYear,
    startedSeason: currentSeason,
    seasonsRemaining: duration,
    parameters: { areaIds: params.areaIds, isolated, popCommitted: committed },
    paidCost: { stone: cost.stone, lumber: cost.lumber, population: cost.population, seasons: duration },
  }

  return {
    state: { ...next, ongoingActions: [...next.ongoingActions, ongoing] },
    events: [
      {
        type: 'construction_started',
        payload: {
          actionId: 'build_roads',
          duration,
          areaIds: params.areaIds,
          isolated,
        },
      },
    ],
  }
}

function applyBuildRoads(state: RealmState, ongoing: OngoingAction): StartResult {
  const areaIds = (ongoing.parameters.areaIds as string[]) ?? []
  const popCommitted = (ongoing.parameters.popCommitted as CommittedPopChunk[]) ?? []
  const newSet = new Set([...state.roadAreaIds, ...areaIds])
  // Workers return home (idle) — Build Roads doesn't consume pop.
  const withRoads: RealmState = { ...state, roadAreaIds: Array.from(newSet) }
  const final = returnCommittedPopulation(withRoads, popCommitted)
  return {
    state: final,
    events: [
      {
        type: 'roads_built',
        payload: { areaIds, popReturned: popCommitted.reduce((s, c) => s + c.count, 0) },
      },
    ],
  }
}

// ============================================================
// Build Stronghold
// ============================================================

const STRONGHOLD_COSTS: Record<StrongholdKind, { stone: number; gold: number; lumber: number; population: number; seasons: number }> = {
  village:          { stone: 2,  gold: 2,  lumber: 2,  population: 1, seasons: 2 },
  town:             { stone: 5,  gold: 5,  lumber: 5,  population: 1, seasons: 2 },
  city:             { stone: 10, gold: 10, lumber: 10, population: 2, seasons: 4 },
  keep:             { stone: 5,  gold: 4,  lumber: 4,  population: 1, seasons: 2 },
  castle:           { stone: 10, gold: 8,  lumber: 8,  population: 2, seasons: 4 },
  citadel:          { stone: 20, gold: 16, lumber: 16, population: 4, seasons: 8 }, // homebrew
  mine:             { stone: 4,  gold: 3,  lumber: 3,  population: 1, seasons: 2 },
  wall:             { stone: 2,  gold: 1,  lumber: 2,  population: 1, seasons: 2 },
  marketplace:      { stone: 0,  gold: 2,  lumber: 2,  population: 1, seasons: 2 },
  port:             { stone: 0,  gold: 2,  lumber: 4,  population: 1, seasons: 2 },
  craftsmens_guild: { stone: 0,  gold: 2,  lumber: 2,  population: 1, seasons: 2 },
  wizards_academy:  { stone: 0,  gold: 4,  lumber: 2,  population: 1, seasons: 2 },
  grand_temple:     { stone: 4,  gold: 4,  lumber: 4,  population: 1, seasons: 4 },
}

/** Settlements: village/town/city. Tier 3/2/1 respectively. */
const SETTLEMENT_KINDS: StrongholdKind[] = ['village', 'town', 'city']
/** Fortifications: keep/castle/citadel. */
const FORTIFICATION_KINDS: StrongholdKind[] = ['keep', 'castle', 'citadel']
const ADDON_KINDS: StrongholdKind[] = [
  'wall', 'marketplace', 'port', 'craftsmens_guild', 'wizards_academy', 'grand_temple',
]

/**
 * Slot validation for stronghold stacking (homebrew §2.3.1):
 *   Tier 1 (top):  1 slot — City XOR Citadel
 *   Tier 2 (mid):  N slots — any mix of Town and Castle
 *   Tier 3 (bot):  N slots — any mix of Village and Keep
 *
 * Where N depends on realm scale (Empire 9, Kingdom 5, Barony 2 at tier 3 etc.).
 */
function validateSettlementOrFortification(
  state: RealmState,
  scale: RealmScale,
  areaId: string,
  kind: StrongholdKind,
): void {
  const meta = STRONGHOLD_META[kind]
  if (!meta.tier) return // not a tiered stronghold (mine/add-on)

  const onArea = state.strongholds.filter((s) => s.areaId === areaId)
  const tier1 = onArea.filter((s) => STRONGHOLD_META[s.kind].tier === 1).length
  const tier2 = onArea.filter((s) => STRONGHOLD_META[s.kind].tier === 2).length
  const tier3 = onArea.filter((s) => STRONGHOLD_META[s.kind].tier === 3).length

  const caps = SLOT_CAPS[scale]
  if (meta.tier === 1 && tier1 >= caps[1]) {
    throw new ConstructionError(`This area already has its top-tier stronghold (City or Citadel).`)
  }
  if (meta.tier === 2 && tier2 >= caps[2]) {
    throw new ConstructionError(`This area is at its tier-2 cap (${caps[2]} towns/castles max for ${scale}).`)
  }
  if (meta.tier === 3 && tier3 >= caps[3]) {
    throw new ConstructionError(`This area is at its tier-3 cap (${caps[3]} villages/keeps max for ${scale}).`)
  }
}

export function startBuildStronghold(
  state: RealmState,
  params: BuildStrongholdParams,
  currentYear: number,
  currentSeason: Season,
): StartResult {
  const { kind, areaId, mineResourceType, parentStrongholdId } = params

  const area = state.areas.find((a) => a.id === areaId)
  if (!area) throw new ConstructionError(`Area ${areaId} is not in this realm.`)

  // Type-specific validation
  if (kind === 'mine') {
    if (area.terrain !== 'hills' && area.terrain !== 'mountains') {
      throw new ConstructionError(`Mines can only be built on hills or mountains.`)
    }
    if (!mineResourceType) {
      throw new ConstructionError(`Mine requires a mineResourceType (stone or mineral).`)
    }
    const existingMines = state.strongholds.filter(
      (s) => s.areaId === areaId && s.kind === 'mine' && s.mineResourceType === mineResourceType,
    )
    if (existingMines.length >= 1) {
      throw new ConstructionError(`This area already has a ${mineResourceType} mine.`)
    }
    const totalMines = state.strongholds.filter((s) => s.areaId === areaId && s.kind === 'mine').length
    if (totalMines >= MINE_CAP[state.scale]) {
      throw new ConstructionError(`This area is at the mine cap (${MINE_CAP[state.scale]} for ${state.scale}).`)
    }
  } else if (ADDON_KINDS.includes(kind)) {
    if (!parentStrongholdId) {
      throw new ConstructionError(`${kind} is an add-on; it requires a parentStrongholdId (Town or City).`)
    }
    const parent = state.strongholds.find((s) => s.id === parentStrongholdId)
    if (!parent) throw new ConstructionError(`Parent stronghold not found.`)
    if (parent.areaId !== areaId) {
      throw new ConstructionError(`Add-on must be on the same area as its parent settlement.`)
    }
    // Wizards' Academy and Grand Temple require a City specifically; the others a Town or City
    const cityRequired: StrongholdKind[] = ['wizards_academy', 'grand_temple']
    if (cityRequired.includes(kind) && parent.kind !== 'city') {
      throw new ConstructionError(`${kind} requires a City.`)
    }
    if (!cityRequired.includes(kind) && parent.kind !== 'town' && parent.kind !== 'city') {
      throw new ConstructionError(`${kind} requires a Town or City.`)
    }
  } else if (SETTLEMENT_KINDS.includes(kind) || FORTIFICATION_KINDS.includes(kind)) {
    validateSettlementOrFortification(state, state.scale, areaId, kind)
  }

  const penalty = offSeasonPenalty(currentSeason)
  if (!Number.isFinite(penalty)) {
    throw new ConstructionError('Stronghold construction is prohibited in winter.')
  }

  const cost = STRONGHOLD_COSTS[kind]
  const afterResources = deductCost(state, { stone: cost.stone, gold: cost.gold, lumber: cost.lumber })
  // Borrow workers — they'll either settle here (village/town/city) or
  // return home (everything else) when the build completes.
  const { state: next, committed } = commitWorkforce(
    afterResources,
    cost.population,
    params.raceMix,
  )
  const duration = cost.seasons + penalty

  const ongoing: OngoingAction = {
    id: makeOngoingId(),
    actionId: 'build_stronghold',
    startedYear: currentYear,
    startedSeason: currentSeason,
    seasonsRemaining: duration,
    parameters: {
      kind,
      areaId,
      mineResourceType,
      parentStrongholdId,
      name: params.name,
      popCommitted: committed,
    },
    paidCost: {
      stone: cost.stone,
      gold: cost.gold,
      lumber: cost.lumber,
      population: cost.population,
      seasons: duration,
    },
  }

  return {
    state: { ...next, ongoingActions: [...next.ongoingActions, ongoing] },
    events: [
      {
        type: 'construction_started',
        payload: { actionId: 'build_stronghold', kind, areaId, duration },
      },
    ],
  }
}

function applyBuildStronghold(state: RealmState, ongoing: OngoingAction): StartResult {
  const { kind, areaId, mineResourceType, parentStrongholdId, name } = ongoing.parameters as {
    kind: StrongholdKind
    areaId: string
    mineResourceType?: MineResource
    parentStrongholdId?: string
    name?: string
  }
  const popCommitted = (ongoing.parameters.popCommitted as CommittedPopChunk[]) ?? []
  const meta = STRONGHOLD_META[kind]
  const newStronghold: StrongholdState = {
    id: makeOngoingId(),
    areaId,
    kind,
    parentStrongholdId: parentStrongholdId ?? null,
    mineResourceType: mineResourceType ?? null,
    source: meta.source,
    name: name && name.trim().length > 0 ? name.trim() : null,
  }
  const withStronghold: RealmState = {
    ...state,
    strongholds: [...state.strongholds, newStronghold],
  }
  // Settlements (village/town/city): the construction crew stays as the
  // settlement's first residents. Everything else: workers go home.
  const isSettlement = SETTLEMENT_KINDS.includes(kind)
  const final = isSettlement
    ? settleCommittedPopulation(withStronghold, popCommitted, areaId)
    : returnCommittedPopulation(withStronghold, popCommitted)
  const popTotal = popCommitted.reduce((s, c) => s + c.count, 0)
  return {
    state: final,
    events: [
      {
        type: 'stronghold_built',
        payload: {
          kind,
          areaId,
          strongholdId: newStronghold.id,
          popOutcome: isSettlement ? 'settled_at_area' : 'returned_to_idle',
          popCount: popTotal,
        },
      },
    ],
  }
}

// ============================================================
// Convert Terrain
// ============================================================

export function startConvertTerrain(
  state: RealmState,
  params: ConvertTerrainParams,
  currentYear: number,
  currentSeason: Season,
): StartResult {
  const { areaId, newTerrain } = params
  const area = state.areas.find((a) => a.id === areaId)
  if (!area) throw new ConstructionError(`Area ${areaId} is not in this realm.`)
  if (area.terrain !== 'wasteland') {
    throw new ConstructionError(`Convert Terrain only works on wasteland areas.`)
  }
  if (newTerrain === 'wasteland') {
    throw new ConstructionError(`Pick a non-wasteland target terrain.`)
  }

  const penalty = offSeasonPenalty(currentSeason)
  if (!Number.isFinite(penalty)) {
    throw new ConstructionError('Convert Terrain is prohibited in winter.')
  }

  // The book's "must connect to road or stronghold" rule: if not, +5 lumber and
  // +2 seasons. For MVP we apply the penalty if neither this area nor an
  // adjacent area has a road or stronghold. (Adjacency uses the simple grid
  // position — neighbours up/down/left/right.)
  const isolated = !nearStrongholdOrRoadGeo(state, area)
  const baseCost = { lumber: 3, food: 2 }
  const cost = isolated ? { lumber: baseCost.lumber + 5, food: baseCost.food } : baseCost

  const afterResources = deductCost(state, cost)
  // Convert Terrain commits 2 workers (per the registry); they return home
  // when the action completes.
  const { state: next, committed } = commitWorkforce(afterResources, 2, params.raceMix)
  const duration = (isolated ? 4 : 2) + penalty

  const ongoing: OngoingAction = {
    id: makeOngoingId(),
    actionId: 'convert_terrain',
    startedYear: currentYear,
    startedSeason: currentSeason,
    seasonsRemaining: duration,
    parameters: { areaId, newTerrain, isolated, popCommitted: committed },
    paidCost: { lumber: cost.lumber, food: cost.food, population: 2, seasons: duration },
  }

  return {
    state: { ...next, ongoingActions: [...next.ongoingActions, ongoing] },
    events: [
      {
        type: 'construction_started',
        payload: { actionId: 'convert_terrain', areaId, newTerrain, duration, isolated },
      },
    ],
  }
}

function applyConvertTerrain(state: RealmState, ongoing: OngoingAction): StartResult {
  const { areaId, newTerrain } = ongoing.parameters as { areaId: string; newTerrain: Terrain }
  const popCommitted = (ongoing.parameters.popCommitted as CommittedPopChunk[]) ?? []
  const withTerrain: RealmState = {
    ...state,
    areas: state.areas.map((a) =>
      a.id === areaId
        ? { ...a, terrain: newTerrain, secondaryTerrain: null, mineralResults: [], harvestMode: null }
        : a,
    ),
  }
  // Workers go home after the terrain conversion is done.
  const final = returnCommittedPopulation(withTerrain, popCommitted)
  return {
    state: final,
    events: [
      {
        type: 'terrain_converted',
        payload: {
          areaId,
          newTerrain,
          popReturned: popCommitted.reduce((s, c) => s + c.count, 0),
        },
      },
    ],
  }
}

// ============================================================
// Dispatch — used by the orchestrator on completion
// ============================================================

export function applyCompletedConstruction(state: RealmState, ongoing: OngoingAction): StartResult {
  switch (ongoing.actionId as ActionId) {
    case 'build_roads':       return applyBuildRoads(state, ongoing)
    case 'build_stronghold':  return applyBuildStronghold(state, ongoing)
    case 'convert_terrain':   return applyConvertTerrain(state, ongoing)
    default:
      return { state, events: [] }
  }
}

// Use TERRAIN_STATS to satisfy the import lint for now (placeholder for a
// future "list buildable terrains for a wasteland" helper).
void TERRAIN_STATS
