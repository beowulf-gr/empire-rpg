/**
 * createStartingDomain — builds a fresh RealmState from scratch.
 *
 * Follows §11 of rules-digest.md ("Realm Creation"):
 *  - 20 areas distributed per the chosen climate template
 *  - 1 starter Village and 1 starter Keep
 *  - Starting population = half the area count, all humans, distributed 1 per
 *    habitable area starting from the most habitable terrain types
 *  - Each starter pop unit lives AND works in the same area (workAreaId = homeAreaId)
 *  - Starter resources = 1 unit of each producible resource per producing area
 */

import {
  EMPTY_RESOURCE_POOL,
  STARTING_TEMPLATES,
  TERRAIN_STATS,
  type ClimateTemplate,
  type MineResource,
  type Race,
  type RealmScale,
  type ResourcePool,
  type StrongholdKind,
  type Terrain,
} from '../types/rules'
import {
  type AreaState,
  type PopulationStack,
  type RealmState,
  type RulerStats,
  type StrongholdState,
} from './state'
import { createRng, type Rng } from './rng'
import { bootSpring } from './actions/orchestrator'

export interface CreateDomainOptions {
  scale: RealmScale
  climateTemplate: ClimateTemplate
  name: string
  ownerId: string
  rng?: Rng
  uuid?: () => string
  startingPopulation?: number
  /**
   * Optional race composition for the starter populace. When provided, each
   * race with a positive count becomes its own unallocated PopulationStack.
   * The sum overrides `startingPopulation` if both are given. When omitted
   * (or all zeroes), all starter pop is humans — preserves the old behaviour.
   */
  startingPopulationRaces?: Partial<Record<Race, number>>
  /**
   * Optional ruler stats for the player character. If omitted, the realm
   * starts with a placeholder ruler at all-10 ability scores and 0-skill
   * totals — the player should edit this on the realm page.
   */
  ruler?: RulerStats
  /**
   * If true, skip the year-1 Spring obligatory chain (Morale Upkeep,
   * Population Upkeep, Assign Population). Useful in tests that need a
   * deterministic pre-boot realm. Default false (production behavior).
   */
  skipBootSpring?: boolean
  /**
   * Custom area grid for "found a custom realm" flow. When provided, this
   * replaces the climate-template-based area generation entirely — the
   * `climateTemplate` field still flows through onto the RealmState so
   * weather/seasonality references work, but the terrain mix and positions
   * come from this list. Must contain at least 2 entries (otherwise the
   * starter stronghold placement can't satisfy its "village + keep on
   * different tiles" rule).
   */
  customAreas?: ReadonlyArray<CustomAreaSpec>
  /**
   * Custom starter strongholds. When provided (even as an empty array),
   * suppresses the default Village + Keep auto-placement. Each entry
   * references an area by position (since the caller can't know the
   * minted area IDs). For improvements that nest under another
   * stronghold, set `parentIndex` to that stronghold's position within
   * this same list.
   */
  customStrongholds?: ReadonlyArray<CustomStrongholdSpec>
  /**
   * Custom starter roads — list of (x,y) positions that should have a
   * road at game start. When provided (even empty) it replaces the
   * default (which is no roads). Positions that don't match any area
   * are silently ignored.
   */
  customRoadPositions?: ReadonlyArray<{ x: number; y: number }>
  /**
   * Override the auto-computed starting resource pool. When provided, this
   * full pool replaces the rule-based default entirely (the caller is
   * expected to supply every key — use `EMPTY_RESOURCE_POOL` as a base
   * and spread overrides on top).
   */
  startingResources?: ResourcePool
}

/** Position + terrain for a single area in a custom realm. */
export interface CustomAreaSpec {
  terrain: Terrain
  positionX: number
  positionY: number
  secondaryTerrain?: Terrain | null
}

/**
 * One stronghold to place at game start. References its area by position
 * (since the caller can't know the area IDs that createStartingDomain will
 * mint). Improvements use `parentIndex` to point at an earlier entry in the
 * same list.
 */
export interface CustomStrongholdSpec {
  kind: StrongholdKind
  positionX: number
  positionY: number
  parentIndex?: number | null
  mineResourceType?: MineResource | null
}

// Order of preference when distributing starter pop and placing strongholds.
// Higher number = more habitable.
const HABITABILITY_RANK: Record<Terrain, number> = {
  plains: 8,
  forest: 7,
  hills: 6,
  swamp: 5,
  water: 4,
  mountains: 3,
  ruins: 2,
  wasteland: 1,
}

export function createStartingDomain(opts: CreateDomainOptions): RealmState {
  const rng = opts.rng ?? createRng()
  const uuid = opts.uuid ?? (() => crypto.randomUUID())

  const areas = opts.customAreas
    ? buildCustomAreas(opts.customAreas, uuid)
    : buildAreas(opts.climateTemplate, uuid)

  const strongholds = opts.customStrongholds
    ? buildCustomStrongholds(opts.customStrongholds, areas, uuid)
    : placeStarterStrongholds(areas, uuid)

  const populations = distributeStarterPopulation(
    areas,
    opts.startingPopulation ?? Math.floor(areas.length / 2),
    opts.startingPopulationRaces,
    uuid,
  )

  const resources = opts.startingResources
    ? { ...opts.startingResources }
    : computeStarterResources(areas)

  const roadAreaIds = opts.customRoadPositions
    ? resolveRoadPositions(opts.customRoadPositions, areas)
    : []

  const ruler: RulerStats = opts.ruler ?? {
    name: 'The Ruler',
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
    diplomacy: 0,
    knowledgeEconomics: 0,
  }

  const initialState: RealmState = {
    id: uuid(),
    ownerId: opts.ownerId,
    name: opts.name,
    scale: opts.scale,
    climateTemplate: opts.climateTemplate,
    year: 1,
    season: 'spring',
    coverImageUrl: null,
    rulerPortraitUrl: null,
    ruler,
    resources,
    populations,
    areas,
    strongholds,
    loyaltyGroups: [
      {
        id: uuid(),
        kind: 'commoners',
        label: 'General population',
        baseWillSave: 2,
        score: 0,
      },
    ],
    lastFoodCrisis: 'none',
    roadAreaIds,
    militaryUnits: [],
    ministers: [],
    loans: [],
    tradeGoods: { exotic_items: 0, magic_items: 0, weapons_and_armor: 0, wooden_goods: 0 },
    pendingBribes: [],
    pendingEvents: [],
    weatherModifier: 0,
    lastYearFoodBalance: 0,
    orcIdlePenalty: 0,
    actionsThisSeason: [],
    ongoingActions: [],
  }

  if (opts.skipBootSpring) return initialState

  // Boot the year-1 spring obligatory chain (Morale Upkeep, Pop Upkeep,
  // Assign Population check). The events go into pendingEvents so the
  // dashboard can surface them in a season-transition pop-up on first load.
  const booted = bootSpring(initialState, rng)
  return {
    ...booted.state,
    pendingEvents: [...initialState.pendingEvents, ...booted.events],
  }
}

function buildAreas(template: ClimateTemplate, uuid: () => string): AreaState[] {
  const counts = STARTING_TEMPLATES[template]
  const terrains: Terrain[] = []
  for (const [terrain, n] of Object.entries(counts) as [Terrain, number][]) {
    for (let i = 0; i < n; i++) terrains.push(terrain)
  }
  if (terrains.length !== 20) {
    throw new Error(`Template "${template}" sums to ${terrains.length}, expected 20`)
  }
  const COLS = 5
  return terrains.map((terrain, i) => ({
    id: uuid(),
    terrain,
    secondaryTerrain: null,
    mineralResults: [],
    harvestMode: null, // hills/mountains default to stone; other terrains ignore this
    positionX: i % COLS,
    positionY: Math.floor(i / COLS),
  }))
}

/**
 * Places the starter Village and Keep on the two most habitable areas (different tiles).
 */
function placeStarterStrongholds(
  areas: AreaState[],
  uuid: () => string,
): StrongholdState[] {
  const sorted = [...areas].sort(
    (a, b) => HABITABILITY_RANK[b.terrain] - HABITABILITY_RANK[a.terrain],
  )
  if (sorted.length < 2) {
    throw new Error('Cannot place starter strongholds: fewer than 2 areas')
  }
  return [
    { id: uuid(), areaId: sorted[0].id, kind: 'village', parentStrongholdId: null, mineResourceType: null, source: 'official' },
    { id: uuid(), areaId: sorted[1].id, kind: 'keep',    parentStrongholdId: null, mineResourceType: null, source: 'official' },
  ]
}

/**
 * Build areas from a user-supplied custom layout. Validates basic structural
 * constraints (at least 2 areas, no overlapping positions) but trusts the
 * terrain values — they're already typed as Terrain so unrecognised values
 * never reach here.
 */
function buildCustomAreas(
  specs: ReadonlyArray<CustomAreaSpec>,
  uuid: () => string,
): AreaState[] {
  if (specs.length < 2) {
    throw new Error(
      `Custom realm must have at least 2 areas (got ${specs.length})`,
    )
  }
  const seen = new Set<string>()
  for (const s of specs) {
    const key = `${s.positionX},${s.positionY}`
    if (seen.has(key)) {
      throw new Error(`Duplicate area position (${s.positionX},${s.positionY})`)
    }
    seen.add(key)
  }
  return specs.map((s) => ({
    id: uuid(),
    terrain: s.terrain,
    secondaryTerrain: s.secondaryTerrain ?? null,
    mineralResults: [],
    harvestMode: null,
    positionX: s.positionX,
    positionY: s.positionY,
  }))
}

/**
 * Build strongholds from a user-supplied list, mapping positions onto the
 * freshly-minted area IDs and resolving `parentIndex` into `parentStrongholdId`.
 * Strongholds are minted in the input order so a child can reliably reference
 * an earlier parent by its index.
 */
function buildCustomStrongholds(
  specs: ReadonlyArray<CustomStrongholdSpec>,
  areas: AreaState[],
  uuid: () => string,
): StrongholdState[] {
  // Position-keyed area lookup so we can map specs onto minted IDs.
  const areaByPos = new Map<string, AreaState>()
  for (const a of areas) areaByPos.set(`${a.positionX},${a.positionY}`, a)

  // First pass: mint stable IDs for each spec so children can reference parents.
  const ids: string[] = specs.map(() => uuid())

  return specs.map((s, i) => {
    const area = areaByPos.get(`${s.positionX},${s.positionY}`)
    if (!area) {
      throw new Error(
        `Stronghold #${i} (${s.kind}) references missing area at (${s.positionX},${s.positionY})`,
      )
    }
    if (s.parentIndex != null) {
      if (s.parentIndex < 0 || s.parentIndex >= i) {
        // A child can only reference a strictly earlier index — that way
        // the topological order matches the array order.
        throw new Error(
          `Stronghold #${i} parentIndex ${s.parentIndex} must point at an earlier entry`,
        )
      }
    }
    return {
      id: ids[i],
      areaId: area.id,
      kind: s.kind,
      parentStrongholdId: s.parentIndex != null ? ids[s.parentIndex] : null,
      mineResourceType: s.mineResourceType ?? null,
      source: 'official',
    }
  })
}

/**
 * Resolve a list of (x,y) road positions onto area IDs. Positions that
 * don't match any area are silently dropped — caller is responsible for
 * supplying sensible coordinates.
 */
function resolveRoadPositions(
  positions: ReadonlyArray<{ x: number; y: number }>,
  areas: AreaState[],
): string[] {
  const byPos = new Map<string, string>()
  for (const a of areas) byPos.set(`${a.positionX},${a.positionY}`, a.id)
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of positions) {
    const id = byPos.get(`${p.x},${p.y}`)
    if (id && !seen.has(id)) {
      out.push(id)
      seen.add(id)
    }
  }
  return out
}

/**
 * Builds the starter population stacks. All units start unallocated
 * (homeAreaId/workAreaId = null) — the player must place them during their
 * first Spring via Move Settlers / Harvest Terrain.
 *
 * If `mix` is provided with at least one positive count, each race becomes
 * its own stack and `mix` overrides `total` entirely. Otherwise all `total`
 * units are humans (the historical default).
 */
function distributeStarterPopulation(
  _areas: AreaState[],
  total: number,
  mix: Partial<Record<Race, number>> | undefined,
  uuid: () => string,
): PopulationStack[] {
  // Normalise the mix: keep only positive integer counts.
  const entries: [Race, number][] = []
  if (mix) {
    for (const [race, count] of Object.entries(mix) as [Race, number | undefined][]) {
      if (typeof count === 'number' && count > 0 && Number.isFinite(count)) {
        entries.push([race, Math.floor(count)])
      }
    }
  }

  if (entries.length === 0) {
    if (total <= 0) return []
    return [
      {
        id: uuid(),
        race: 'humans' as const,
        count: total,
        homeAreaId: null,
        workAreaId: null,
      },
    ]
  }

  return entries.map(([race, count]) => ({
    id: uuid(),
    race,
    count,
    homeAreaId: null,
    workAreaId: null,
  }))
}

function computeStarterResources(areas: AreaState[]): ResourcePool {
  const pool: ResourcePool = { ...EMPTY_RESOURCE_POOL }
  for (const area of areas) {
    const stats = TERRAIN_STATS[area.terrain]
    const prod = stats.production
    if (prod.food !== undefined) pool.food += 1
    if (prod.lumber !== undefined) pool.lumber += 1
    if (prod.gold !== undefined) pool.gold += 1
    if (area.terrain === 'hills' || area.terrain === 'mountains') pool.stone += 1
  }
  return pool
}
