/**
 * Action definitions — the unified system for everything a player can do.
 *
 * Every interaction with the realm goes through an Action: morale checks,
 * harvest, building roads, hiring mercenaries, dispatching diplomats. Each
 * action has a static definition (this file) plus an effect implementation
 * (in src/rules/actions/<action_id>.ts, added in step 2f.2 onward).
 *
 * The dashboard renders these as a list of buttons grouped by status:
 *   Mandatory (auto-resolved at season transition)
 *   Available this season
 *   Available with a penalty (out-of-season)
 *   Generic (any season)
 *
 * Hover → short description + cost. "More details" → full book text modal.
 */

import type { Season } from '../../types/rules'

export type ActionDescriptor = 'limited' | 'obligatory' | 'construction' | 'political'

export type ActionCategory = 'spring' | 'summer' | 'fall' | 'winter' | 'generic'

/**
 * Auto: clicking the action runs its effect immediately.
 * Interactive: clicking opens a panel where the player picks parameters.
 */
export type ActionKind = 'auto' | 'interactive'

/**
 * Cost summary shown on hover. Numbers are in "units" (the realm's scale
 * determines what a unit means). Set `variable: true` for actions whose cost
 * depends on parameters chosen at runtime.
 */
export interface ActionCost {
  gold?: number
  lumber?: number
  stone?: number
  food?: number
  population?: number
  /** Duration in seasons. For multi-season ongoing actions. */
  seasons?: number
  /** True if the cost is parameterized (e.g. construction varies by stronghold type). */
  variable?: boolean
  /** Human-readable description shown when variable === true or for non-numeric costs. */
  note?: string
}

/**
 * Per-season availability: which seasons the action is allowed in, which
 * forbid it, and which apply a penalty.
 */
export interface ActionAvailability {
  /** Seasons in which this action runs at its standard cost. Empty = generic (any season). */
  seasons: Season[]
  /** Seasons in which this action is forbidden. */
  prohibited?: Season[]
  /** Seasons in which it can be taken with a penalty (out-of-season Spring actions, etc.). */
  restricted?: { season: Season; penalty: string }[]
}

/**
 * Identifiers for each panel an interactive action might open. Listed here
 * (rather than as free strings) so the UI router can compile-check that every
 * panel kind has a matching component.
 */
export type ActionPanel =
  | 'AssignPopulation'
  | 'MoveSettlers'
  | 'HarvestTerrain'
  | 'SurveyForNewVein'
  | 'BuildRoads'
  | 'BuildStronghold'
  | 'ConvertTerrain'
  | 'HireSoldiers'
  | 'MusterSoldiers'
  | 'LevelUpUnit'
  | 'RecruitMinisters'
  | 'RecruitSettlers'
  | 'OutfitUnit'
  | 'BuyGoods'
  | 'SellGoods'
  | 'ProduceTradeGoods'
  | 'SellTradeGoods'
  | 'RaiseLoans'
  | 'RaiseTaxes'
  | 'DispatchDiplomats'
  | 'SackEnemyLands'
  | 'ManageForces'

/**
 * When the engine auto-runs an obligatory action during the season transition,
 * does it run AT THE START of the new season or AT THE END of the old one?
 *
 * Per chapter 1:
 *   - Spring obligatory chain (Morale Upkeep → Pop Upkeep → Assign Pop check)
 *     runs at the start of Spring.
 *   - Random Spring Events fires at the END of Spring.
 *   - Random Fall Events / Harvest / Allocate Food runs at the START of Fall
 *     (book wording: "the beginning of the fall phase").
 */
export type ObligatoryTiming = 'season_start' | 'season_end'

export interface ActionDefinition {
  /** Unique stable id, used in actionsThisSeason logs. snake_case. */
  id: ActionId

  /** Display name as shown on the button (book casing). */
  name: string

  /** Where this action is grouped in the UI. */
  category: ActionCategory

  /** Tags rendered next to the name (Limited / Obligatory / Construction / Political). */
  descriptors: ActionDescriptor[]

  /** One-to-two sentence summary for the hover tooltip. */
  shortDescription: string

  /** Full book write-up shown in the "More details" modal. May be paraphrased
   *  pending verification against the physical book. */
  bookText: string

  cost?: ActionCost
  availability: ActionAvailability
  kind: ActionKind

  /** For interactive actions: which UI panel to open on click. */
  panel?: ActionPanel

  /** For obligatory auto-actions: when in the season transition they fire. */
  obligatoryTiming?: ObligatoryTiming

  /** Distinguishes book content from house-rule additions (e.g. Move Settlers). */
  source: 'official' | 'homebrew'

  /** False = button shown but disabled with a "Coming soon" tag. Lets the UI
   *  surface every action even before its effect is implemented. */
  implemented: boolean
}

// ============================================================
// ActionId — the canonical list. New ids must be added here AND in registry.ts.
// ============================================================

export type ActionId =
  // Spring obligatory (auto)
  | 'morale_upkeep'
  | 'population_upkeep'
  | 'assign_population'
  | 'random_spring_events'
  // Fall obligatory (auto)
  | 'random_fall_events'
  | 'harvest_crops'
  | 'allocate_food'
  // Spring obligatory (auto) — military annual upkeep
  | 'military_upkeep'
  // Spring obligatory (auto) — minister annual upkeep
  | 'minister_upkeep'
  // Spring obligatory (auto) — elf emigration check
  | 'elves_emigration'
  // Spring obligatory (auto) — orcs cumulative idle-warriors penalty
  | 'orcs_idle_penalty'
  // Every-season obligatory (auto) — interest on outstanding loans
  | 'seasonal_interest'
  // Summer obligatory (auto)
  | 'manage_forces'
  // Allocate Projects (Construction) — split into sub-actions for clarity
  | 'build_roads'
  | 'build_stronghold'
  | 'convert_terrain'
  | 'harvest_terrain'
  | 'survey_for_new_vein'
  // Soldiers / ministers / settlers
  | 'hire_soldiers'
  | 'muster_soldiers'
  | 'level_up_unit'
  | 'recruit_ministers'
  | 'recruit_settlers'
  | 'outfit_unit'
  // Combat-adjacent
  | 'sack_enemy_lands'
  | 'adventure'
  // Generic economy / diplomacy
  | 'buy_goods'
  | 'sell_goods'
  | 'produce_trade_goods'
  | 'sell_trade_goods'
  | 'raise_loans'
  | 'raise_taxes'
  | 'dispatch_diplomats'
  // Homebrew
  | 'move_settlers'

// ============================================================
// Per-realm runtime state for actions
// ============================================================

/** Recorded entry for an action that's been completed this season. */
export interface ActionLog {
  actionId: ActionId
  /** ISO timestamp when the action was taken. */
  takenAt: string
  /** Optional structured payload describing parameters or outcome. */
  meta?: Record<string, unknown>
}

/**
 * A multi-season action that's still running. Examples:
 *   - Build Roads (2 seasons)
 *   - Build Castle (4 seasons)
 *   - Convert Terrain (2 seasons, +1 if started off-spring, +2 if started in fall)
 */
export interface OngoingAction {
  id: string
  actionId: ActionId
  /** Year+season when the action started. */
  startedYear: number
  startedSeason: Season
  /** How many more seasons until completion (decrements each transition). */
  seasonsRemaining: number
  /** Action-specific parameters captured at start (which area, which kind, etc.). */
  parameters: Record<string, unknown>
  /** Cost already paid up-front. Listed here for the UI to show. */
  paidCost?: ActionCost
}
