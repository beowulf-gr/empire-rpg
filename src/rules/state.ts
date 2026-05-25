/**
 * In-memory RealmState — the shape the rules engine operates on.
 *
 * It mirrors the database tables but flattens them into a single object so
 * pure functions can take a RealmState in and return a new RealmState out.
 *
 * To/from-DB conversion lives in src/lib/realmIo.ts. The engine itself never
 * touches Supabase.
 */

import {
  STRONGHOLD_SETTLEMENT_CAP_BONUS,
  TERRAIN_STATS,
} from '../types/rules'
import type {
  ClimateTemplate,
  MineResource,
  Race,
  RealmScale,
  ResourcePool,
  Season,
  StrongholdKind,
  Terrain,
} from '../types/rules'
import type { ActionLog, OngoingAction } from './actions/types'

/**
 * Shape of one population chunk currently committed to an OngoingAction
 * (Build Roads, Build Stronghold, Convert Terrain, Produce Trade Goods).
 *
 * Mirrors `CommittedPopChunk` in actions/populationCommit.ts but redeclared
 * here to avoid a circular import (state.ts is imported by populationCommit).
 * Both types must stay in sync.
 */
interface CommittedPopChunkLike {
  race: Race
  count: number
  originalHomeAreaId: string | null
}

/** Reads `popCommitted` (if any) off an OngoingAction's parameters bag. */
function chunksOf(oa: OngoingAction): CommittedPopChunkLike[] {
  const raw = oa.parameters?.popCommitted
  return Array.isArray(raw) ? (raw as CommittedPopChunkLike[]) : []
}

export interface AreaState {
  id: string
  terrain: Terrain
  secondaryTerrain: Terrain | null
  /**
   * Minerals available on this area (hills/mountains only). Empty array =
   * unsurveyed (or stone-only). Hills always hold 0 or 1; mountains hold
   * 0, 1, or 2:
   *   - Mountains, two rolls land on the SAME mineral → length 1
   *     (single rich vein, +2 per harvest).
   *   - Mountains, two rolls differ → length 2 (two veins, +1 each per
   *     harvest).
   *   - A successful Survey-for-new-vein action can add an extra mineral
   *     to mountains, capping at 2.
   * Items are ResourceKey strings ('iron', 'silver', etc.). The legacy
   * `'stone'` sentinel from old saves is cleaned up to [] on load by
   * realmIo.
   */
  mineralResults: string[]
  /**
   * Player's choice of harvest mode for hills/mountains:
   *   - `'stone'` (default for both terrains): the area produces stone.
   *   - `'mineral'`: produces every mineral in `mineralResults` (must be
   *     non-empty — the player surveys before switching to mineral mode).
   * `null` is treated as `'stone'`. Other terrain types ignore this field.
   */
  harvestMode: 'stone' | 'mineral' | null
  positionX: number
  positionY: number
}

/**
 * A "stack" of population units. Identity = (race, homeAreaId, workAreaId).
 * Two stacks with matching identity are merged.
 *
 * - homeAreaId:  where these units live. Always set; counts against the area's
 *                settlement cap. Overcrowding causes loyalty penalties.
 * - workAreaId:  where these units work to harvest resources. NULL means idle
 *                (not contributing to any area's harvest).
 *
 * Most pop has homeAreaId === workAreaId (live and work in the same place).
 * A pop unit can live in a populous town and walk to a hill to mine, in
 * which case homeAreaId !== workAreaId.
 */
export interface PopulationStack {
  id: string
  race: Race
  count: number
  homeAreaId: string | null
  workAreaId: string | null
}

// ============================================================
// Loyalty groups (Phase 3a)
// ============================================================

export type LoyaltyGroupKind = 'commoners' | 'military' | 'minister' | 'faction'

/**
 * One discrete loyalty entity tracked by the realm. The book defines several
 * groups that should have a loyalty score: the General Population (commoners),
 * the Military, individual Ministers, and Important Factions (temples, guilds,
 * archmages, master criminals, etc.).
 *
 * For MVP every realm starts with a single 'commoners' group. As Phase 3+
 * implements military mustering and minister recruitment, additional groups
 * are added at the same time those entities come into existence.
 *
 * Identity:
 *   - id is stable across saves
 *   - kind tags the broad category (drives default DC modifiers, UI grouping)
 *   - attachedTo optionally links to a specific entity (minister id, military
 *     unit id, faction handle) — null for the realm-wide commoners group
 *
 * Mechanics:
 *   - score is the current loyalty number (positive = loyal, negative = unrest)
 *   - baseWillSave is added to the d20 during loyalty checks (per-group Will)
 *   - The realm-wide MVP default for baseWillSave is +2 (per the digest)
 */
export interface LoyaltyGroup {
  id: string
  kind: LoyaltyGroupKind
  label: string
  baseWillSave: number
  score: number
  attachedTo?: string
}

export interface StrongholdState {
  id: string
  areaId: string
  kind: StrongholdKind
  parentStrongholdId: string | null
  mineResourceType: MineResource | null
  source: 'official' | 'homebrew'
  /**
   * Player-given name for this stronghold (e.g. "Stormhaven", "Castle Black").
   * Optional so test fixtures predating the field still type-check. When
   * absent, the UI falls back to an auto-generated default like "City #1"
   * via `defaultStrongholdName(...)`.
   */
  name?: string | null
}

/**
 * The player character ruling this realm. Their stats stand in for any
 * minister role that's currently vacant — book §3: "if a role is vacant,
 * the ruler covers it personally and suffers a -2 circumstance penalty
 * on related checks."
 *
 * Ability scores follow D&D 3rd-edition convention (10/11 = +0, 12/13 = +1,
 * etc.). `abilityMod(score)` derives the modifier we actually plug into d20
 * rolls. Skill totals are pre-computed (ability mod + ranks + circumstance),
 * the same number the player would write on their character sheet.
 */
export interface RulerStats {
  name: string
  /** 10/11 = +0, 12/13 = +1, 14/15 = +2, 16/17 = +3, 18/19 = +4, … */
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
  /** Diplomacy skill total (already includes Cha mod + ranks + circumstance). */
  diplomacy: number
  /** Knowledge (economics) skill total — used by all Treasurer-flavoured checks. */
  knowledgeEconomics: number
}

/** Returns the D&D 3e ability modifier for a given ability score. */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * Returns a friendly display name for a stronghold. Uses the player-given
 * name if set, otherwise falls back to "{Kind} #{N}" where N is the
 * 1-based index of this stronghold among other strongholds of the same
 * kind on the realm (stable ordering by id).
 */
export function strongholdDisplayName(
  s: StrongholdState,
  all: StrongholdState[],
): string {
  if (s.name && s.name.trim().length > 0) return s.name
  const sameKind = all
    .filter((x) => x.kind === s.kind)
    .sort((a, b) => a.id.localeCompare(b.id))
  const idx = sameKind.findIndex((x) => x.id === s.id) + 1
  const label = STRONGHOLD_NAME_LABEL[s.kind] ?? s.kind
  return `${label} #${idx}`
}

/** Display labels for default stronghold names (e.g. "City #1"). */
const STRONGHOLD_NAME_LABEL: Record<StrongholdKind, string> = {
  village: 'Village',
  town: 'Town',
  city: 'City',
  keep: 'Keep',
  castle: 'Castle',
  citadel: 'Citadel',
  mine: 'Mine',
  wall: 'Wall',
  marketplace: 'Marketplace',
  port: 'Port',
  craftsmens_guild: "Craftsmen's Guild",
  wizards_academy: "Wizards' Academy",
  grand_temple: 'Grand Temple',
}

export interface TurnEvent {
  type: string
  payload: Record<string, unknown>
}

/**
 * Optional player-supplied prologue captured at realm creation. Used by the
 * "Tell our story" feature to seed an LLM-generated chronicle. All fields are
 * optional — the user may leave any/all blank.
 */
export interface OriginStory {
  founding?: string | null
  rulerBackground?: string | null
  notableCircumstances?: string | null
}

/**
 * Optional player-supplied epilogue captured when the player marks the realm
 * as a finalized chronicle. Used by the "Tell our story" feature. All fields
 * are optional.
 */
export interface EndingStory {
  outcome?: string | null
  finalNote?: string | null
}

export interface RealmState {
  id: string
  ownerId: string
  name: string
  scale: RealmScale
  climateTemplate: ClimateTemplate
  year: number
  season: Season

  /**
   * Public URL of the user-uploaded cover photo banner shown at the top of
   * the realm detail page. Null/undefined when no image has been uploaded.
   * The bucket (`realm-images`) is public; paths are keyed by owner_id so
   * RLS only allows the realm's owner to write. Optional because test
   * fixtures predate the field — readers should treat undefined as null.
   */
  coverImageUrl?: string | null

  /**
   * Public URL of the user-uploaded Ruler portrait shown next to the Ruler
   * stat block. Same storage conventions as coverImageUrl.
   */
  rulerPortraitUrl?: string | null

  /**
   * Optional prologue captured at realm creation. Null until the player
   * fills in the origin-story dialog (or skips it explicitly). Used only by
   * the "Tell our story" feature.
   */
  originStory?: OriginStory | null

  /**
   * Optional epilogue captured when the player marks the realm as a final
   * chronicle (vs. an ongoing one). Null until that point.
   */
  endingStory?: EndingStory | null

  /** The player character ruling this realm. */
  ruler: RulerStats

  resources: ResourcePool
  populations: PopulationStack[]
  areas: AreaState[]
  strongholds: StrongholdState[]

  /**
   * Per-group loyalty tracking. New realms start with a single 'commoners'
   * group; military/minister/faction groups are added when those subsystems
   * are wired up in later phases.
   */
  loyaltyGroups: LoyaltyGroup[]

  /**
   * Crisis state from the most recent Allocate Food. Drives next Spring's
   * Morale Upkeep DC: famine→20, shortage→15, none→5 (average year).
   */
  lastFoodCrisis: 'none' | 'shortage' | 'famine'

  /**
   * Set of area IDs that have a road. Roads are required for trade actions
   * (Sell Goods, Buy Goods) and bypass off-area construction penalties for
   * Convert Terrain. Built via the Build Roads action; tracked at the realm
   * level so we don't need a DB migration on the areas table.
   */
  roadAreaIds: string[]

  /**
   * Military units the realm currently has. Created by Muster Soldiers (after
   * a 1-season training) or Hire Soldiers (instant). Disbanded automatically
   * by Annual Military Upkeep when food/gold runs out. Each unit has a
   * matching LoyaltyGroup (kind='military', attachedTo=unit.id) that morale
   * upkeep iterates alongside everything else.
   */
  militaryUnits: import('./actions/military').MilitaryUnit[]

  /**
   * Ministers currently serving the realm (Treasurer, General, Prime Minister).
   * At most one per role. Created by the Recruit Ministers action (3d.2). Each
   * minister has a matching LoyaltyGroup (kind='minister', attachedTo=minister.id).
   * A vacant role applies a -2 circumstance penalty when the ruler covers it.
   */
  ministers: import('./actions/ministers').Minister[]

  /**
   * Outstanding loans owed by the realm. Each loan accrues 10% simple interest
   * per season (paid from gold at the start of every season except the season
   * it was taken). Created by Raise Loans (3e.5); cleared by Repay Loan or by
   * paying down to zero. Skipping interest for too long unlocks a banker
   * conspiracy penalty (Sell Goods conversion ratios doubled — not yet wired).
   */
  loans: import('./actions/loans').Loan[]

  /**
   * Finished trade goods produced via the Produce Trade Goods action (3e.6).
   * Stored separately from the resource pool because they have their own sale
   * prices and (for weapons & magic items) can be issued to military units
   * via the Unit Outfitting Table instead of being sold.
   */
  tradeGoods: import('./actions/tradeGoods').TradeGoodInventory

  /**
   * Pre-emptive bribes the ruler has committed to spend on the next Morale
   * Upkeep round (per book §5). Each entry pairs a loyalty group with the
   * gp allocated. Gold is deducted at allocation time, not during morale
   * upkeep. The bribe applies +2 per gp for group entities (commoners,
   * military, faction) and +5 per gp for individuals (ministers). On a
   * successful check, the briber also gains +1 loyalty for that group.
   * Cleared after morale_upkeep fires.
   */
  pendingBribes: import('./actions/bribery').MoraleBribe[]

  /** Events emitted during the current season (cleared by useEndSeason after persisting). */
  pendingEvents: TurnEvent[]

  /** Modifier applied to all resource production this year (e.g. +0.1 for Good Weather). */
  weatherModifier: number

  /** Food surplus (positive) or shortfall (negative) carried from previous Fall. */
  lastYearFoodBalance: number

  /**
   * Cumulative loyalty penalty owed to orcs for years their warrior potential
   * has been wasted (book §4): if fewer than half the orc population units
   * are mustered, this drops by -1 each spring; if at least half are mustered,
   * it ticks back up by +1. Floors at 0 — never becomes a bonus.
   *
   * Stored separately because the penalty persists across seasons and the
   * book treats it as a state variable, not a per-check calculation.
   */
  orcIdlePenalty: number

  /**
   * Discretionary actions the player has taken THIS season. Cleared when the
   * season advances. Used by the dashboard to mark action buttons as completed
   * and (for actions with `Limited` descriptor) to prevent re-clicking.
   */
  actionsThisSeason: ActionLog[]

  /**
   * Multi-season actions in progress (Build Roads, Build Castle, etc.). Each
   * entry's seasonsRemaining decrements at every season transition; entries
   * complete and apply their effect when seasonsRemaining hits 0.
   */
  ongoingActions: OngoingAction[]
}

// ============================================================
// Helpers
// ============================================================

/**
 * Total realm population — counts the visible stacks PLUS any pop currently
 * committed to in-flight ongoing actions (Build Roads, Produce Trade Goods,
 * etc.). Without the committed addend the dashboard total would seesaw as
 * workers temporarily disappeared into actions, and food allocation would
 * skip feeding the construction crews.
 */
export function totalPopulation(state: RealmState, race?: Race): number {
  const visible = state.populations.reduce((sum, stack) => {
    if (race && stack.race !== race) return sum
    return sum + stack.count
  }, 0)
  return visible + committedPopulation(state, race)
}

/**
 * Total pop currently committed to ongoing actions (drained from
 * state.populations via commitIdlePopulation). Returns 0 when no construction
 * or production is in flight.
 */
export function committedPopulation(state: RealmState, race?: Race): number {
  let n = 0
  for (const oa of state.ongoingActions) {
    for (const chunk of chunksOf(oa)) {
      if (race && chunk.race !== race) continue
      n += chunk.count
    }
  }
  return n
}

/**
 * Population living on the given area — includes committed pop whose
 * `originalHomeAreaId` matches. While a worker is off building a road they
 * still belong to their home settlement; the dashboard would otherwise show
 * one fewer resident every time a build was in flight.
 */
export function populationLivingOnArea(state: RealmState, areaId: string): number {
  let n = 0
  for (const s of state.populations) {
    if (s.homeAreaId === areaId) n += s.count
  }
  for (const oa of state.ongoingActions) {
    for (const chunk of chunksOf(oa)) {
      if (chunk.originalHomeAreaId === areaId) n += chunk.count
    }
  }
  return n
}

/** Total population whose workAreaId is the given area (workforce for harvest). */
export function populationWorkingArea(state: RealmState, areaId: string): number {
  return state.populations.reduce(
    (sum, s) => (s.workAreaId === areaId ? sum + s.count : sum),
    0,
  )
}

/** Population working a specific area, broken down by race. */
export function populationByRaceWorkingArea(
  state: RealmState,
  areaId: string,
): Partial<Record<Race, number>> {
  const out: Partial<Record<Race, number>> = {}
  for (const stack of state.populations) {
    if (stack.workAreaId !== areaId) continue
    out[stack.race] = (out[stack.race] ?? 0) + stack.count
  }
  return out
}

/**
 * Population living in a specific area, broken down by race. Includes
 * committed pop matched by their original home (see populationLivingOnArea).
 */
export function populationByRaceOnArea(
  state: RealmState,
  areaId: string,
): Partial<Record<Race, number>> {
  const out: Partial<Record<Race, number>> = {}
  for (const stack of state.populations) {
    if (stack.homeAreaId !== areaId) continue
    out[stack.race] = (out[stack.race] ?? 0) + stack.count
  }
  for (const oa of state.ongoingActions) {
    for (const chunk of chunksOf(oa)) {
      if (chunk.originalHomeAreaId !== areaId) continue
      out[chunk.race] = (out[chunk.race] ?? 0) + chunk.count
    }
  }
  return out
}

// ============================================================
// Living space (settlement capacity)
// ============================================================

/** Sum of stronghold settlement-cap bonuses for the given area. */
export function strongholdSettlementCapBonus(
  state: RealmState,
  areaId: string,
): number {
  let n = 0
  for (const s of state.strongholds) {
    if (s.areaId === areaId) n += STRONGHOLD_SETTLEMENT_CAP_BONUS[s.kind]
  }
  return n
}

/**
 * Effective living capacity of an area = terrain base + sum of stronghold
 * bonuses on the tile. Used by the spring Assign Population check, the
 * dashboard area card, and the Move Settlers panel.
 */
export function livingSpaceForArea(state: RealmState, areaId: string): number {
  const area = state.areas.find((a) => a.id === areaId)
  if (!area) return 0
  return TERRAIN_STATS[area.terrain].settlementCap + strongholdSettlementCapBonus(state, areaId)
}

/** Realm-wide living capacity = sum of livingSpaceForArea across all areas. */
export function totalLivingSpace(state: RealmState): number {
  return state.areas.reduce((sum, area) => sum + livingSpaceForArea(state, area.id), 0)
}

// ============================================================
// Roads
// ============================================================

export function areaHasRoad(state: RealmState, areaId: string): boolean {
  return state.roadAreaIds.includes(areaId)
}

// ============================================================
// Loyalty helpers
// ============================================================

/** Returns the realm-wide commoners group, or null if missing. */
export function findCommonersGroup(state: RealmState): LoyaltyGroup | null {
  return state.loyaltyGroups.find((g) => g.kind === 'commoners') ?? null
}

/**
 * Returns a new RealmState with the given loyalty group's score adjusted by
 * `delta`. If `groupId` doesn't match any group, returns state unchanged.
 */
export function adjustLoyaltyScore(
  state: RealmState,
  groupId: string,
  delta: number,
): RealmState {
  return {
    ...state,
    loyaltyGroups: state.loyaltyGroups.map((g) =>
      g.id === groupId ? { ...g, score: g.score + delta } : g,
    ),
  }
}

/**
 * Convenience: adjusts the commoners group's score (the 95% case for events
 * and actions that move "the realm" rather than a specific faction). No-op if
 * the realm has no commoners group.
 */
export function adjustCommonerLoyalty(state: RealmState, delta: number): RealmState {
  const commoners = findCommonersGroup(state)
  if (!commoners) return state
  return adjustLoyaltyScore(state, commoners.id, delta)
}

/**
 * Loyalty score bands from rules-digest.md section "Range table" (loyalty).
 * The book lists seven descriptive bands; the UI collapses them into five
 * visual tones (crisis / unhappy / neutral / positive / fanatic) so colour
 * usage stays manageable.
 *
 *   Score range  Label                Tone
 *   <= -10       Open revolt          crisis
 *   -9 to -5     Open displeasure     crisis
 *   -4 to -1     Discontent           unhappy
 *   0            Acceptance           neutral
 *   1 to 4       Patriotism           positive
 *   5 to 9       Pride                positive
 *   >= 10        Fanatical            fanatic
 */
export type LoyaltyTone =
  | 'crisis'
  | 'unhappy'
  | 'neutral'
  | 'positive'
  | 'fanatic'

export interface LoyaltyDescription {
  tone: LoyaltyTone
  label: string
}

export function loyaltyDescription(score: number): LoyaltyDescription {
  if (score <= -10) return { tone: 'crisis', label: 'Open revolt' }
  if (score <= -5) return { tone: 'crisis', label: 'Open displeasure' }
  if (score <= -1) return { tone: 'unhappy', label: 'Discontent' }
  if (score === 0) return { tone: 'neutral', label: 'Acceptance' }
  if (score <= 4) return { tone: 'positive', label: 'Patriotism' }
  if (score <= 9) return { tone: 'positive', label: 'Pride' }
  return { tone: 'fanatic', label: 'Fanatical' }
}
