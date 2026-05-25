/**
 * Orchestrator — endSeason and bootSpring.
 *
 * Replaces the old monolithic resolveSeason. The flow is:
 *
 *   endSeason(state, rng):
 *     1. Run end-of-current-season auto-actions (e.g. random_spring_events)
 *     2. Decrement ongoing actions, completing those that hit 0
 *     3. Transition season pointer (year++ on winter→spring; clear weather)
 *     4. Run start-of-new-season auto-actions (e.g. morale, pop_upkeep)
 *     5. Clear actionsThisSeason for the new season
 *     6. Return new state + all events emitted
 *
 *   bootSpring(state, rng):
 *     Used at realm creation to run the year-1-spring start-of-season chain.
 *     Returns the same shape as endSeason (events go into pendingEvents).
 *
 * The dashboard's End Season button calls endSeason via useEndSeason; the
 * resulting events are surfaced in a season-transition pop-up.
 */

import type { Season } from '../../types/rules'
import type { RealmState, TurnEvent } from '../state'
import type { Rng } from '../rng'
import type { ActionId } from './types'
import { obligatoryActionsForSeason } from './registry'
import { applyCompletedConstruction } from './construction'
import { applyCompletedMilitary, executeAnnualMilitaryUpkeep } from './military'
import { executeAnnualMinisterUpkeep } from './ministers'
import { applyCompletedTrade } from './economy'
import { executeSeasonalInterest } from './loans'
import { applyCompletedTradeGoods } from './tradeGoods'
import { applyCompletedSurveyForNewVeinAction } from './surveyForNewVein'
import {
  executeAllocateFood,
  executeAssignPopulationCheck,
  executeElvesEmigration,
  executeHarvestCrops,
  executeMoraleUpkeep,
  executeOrcsIdlePenalty,
  executePopulationUpkeep,
  executeRandomFallEvents,
  executeRandomSpringEvents,
  type ExecutorResult,
} from './executors'

const NEXT_SEASON: Record<Season, Season> = {
  spring: 'summer',
  summer: 'fall',
  fall: 'winter',
  winter: 'spring',
}

/**
 * Maps every auto-resolved action id to its executor. Adding a new
 * implemented obligatory action means: register here AND add the entry to
 * the action registry with `kind: 'auto'`, `descriptors: ['obligatory']`,
 * `obligatoryTiming`, and `implemented: true`.
 */
const AUTO_EXECUTORS: Partial<
  Record<ActionId, (state: RealmState, rng: Rng) => ExecutorResult>
> = {
  orcs_idle_penalty: executeOrcsIdlePenalty,
  morale_upkeep: executeMoraleUpkeep,
  elves_emigration: executeElvesEmigration,
  population_upkeep: executePopulationUpkeep,
  assign_population: (state, _rng) => executeAssignPopulationCheck(state),
  military_upkeep: executeAnnualMilitaryUpkeep,
  minister_upkeep: executeAnnualMinisterUpkeep,
  seasonal_interest: executeSeasonalInterest,
  random_spring_events: executeRandomSpringEvents,
  random_fall_events: executeRandomFallEvents,
  harvest_crops: executeHarvestCrops,
  allocate_food: executeAllocateFood,
}

export interface SeasonResolution {
  state: RealmState
  events: TurnEvent[]
}

/**
 * Runs all obligatory auto-actions for `season` at the given timing. Skips
 * any action whose id isn't in AUTO_EXECUTORS (handles registry entries
 * marked `implemented: false`).
 */
function runChain(
  state: RealmState,
  rng: Rng,
  season: Season,
  timing: 'season_start' | 'season_end',
): SeasonResolution {
  const actions = obligatoryActionsForSeason(season, timing)
  let s = state
  const events: TurnEvent[] = []
  for (const def of actions) {
    if (!def.implemented) continue
    const exec = AUTO_EXECUTORS[def.id]
    if (!exec) continue
    const out = exec(s, rng)
    s = out.state
    events.push(...out.events)
  }
  return { state: s, events }
}

/**
 * Decrements seasonsRemaining on every ongoing action by 1. Entries that
 * reach 0 are removed (their effects will be applied via a separate hook
 * once construction actions are implemented in Phase 3). For MVP no
 * ongoing actions exist yet, so this is a no-op pass-through.
 */
function tickOngoingActions(
  state: RealmState,
  rng: Rng,
): { state: RealmState; events: TurnEvent[] } {
  const events: TurnEvent[] = []
  // First, decrement every ongoing action by 1 season
  const decremented = state.ongoingActions.map((oa) => ({
    ...oa,
    seasonsRemaining: oa.seasonsRemaining - 1,
  }))
  // Partition: completed (≤0) get their effects applied; the rest stay queued
  const stillRunning = decremented.filter((oa) => oa.seasonsRemaining > 0)
  const completed = decremented.filter((oa) => oa.seasonsRemaining <= 0)

  let nextState: RealmState = { ...state, ongoingActions: stillRunning }
  for (const oa of completed) {
    // Generic "completed" event so the dialog can render the basic line first,
    // then the action-specific apply emits its own (e.g. roads_built).
    events.push({
      type: 'ongoing_action_complete',
      payload: { actionId: oa.actionId, parameters: oa.parameters },
    })
    // Try the dispatchers in order: military (muster), trade (sell goods),
    // produce trade goods, survey-for-new-vein, then construction. Each
    // returns null when the action isn't theirs.
    const military = applyCompletedMilitary(nextState, oa)
    const trade = military ? null : applyCompletedTrade(nextState, oa)
    const tradeGoods = military || trade ? null : applyCompletedTradeGoods(nextState, oa)
    const survey =
      military || trade || tradeGoods
        ? null
        : applyCompletedSurveyForNewVeinAction(nextState, oa, rng)
    const out =
      military ?? trade ?? tradeGoods ?? survey ?? applyCompletedConstruction(nextState, oa)
    nextState = out.state
    events.push(...out.events)
  }
  return { state: nextState, events }
}

/**
 * Pure season pointer transition. Year++ and weather reset on winter→spring.
 * No event emission — events are handled by the auto-action chains above/below.
 */
function transitionSeason(state: RealmState): RealmState {
  const next = NEXT_SEASON[state.season]
  if (state.season === 'winter') {
    return {
      ...state,
      season: next,
      year: state.year + 1,
      weatherModifier: 0,
    }
  }
  return { ...state, season: next }
}

// ============================================================
// Public API
// ============================================================

/**
 * Advance a realm by one season. Used by the End Season button.
 *
 * @returns the new state + all events emitted during the transition (both
 *          end-of-old-season and start-of-new-season). The UI surfaces these
 *          in a single pop-up so the player sees everything that happened.
 */
export function endSeason(state: RealmState, rng: Rng): SeasonResolution {
  let s = state
  const events: TurnEvent[] = []

  // 1. End-of-current-season auto-actions
  const endChain = runChain(s, rng, s.season, 'season_end')
  s = endChain.state
  events.push(...endChain.events)

  // 2. Tick ongoing actions
  const ticked = tickOngoingActions(s, rng)
  s = ticked.state
  events.push(...ticked.events)

  // 3. Transition pointer
  s = transitionSeason(s)

  // 4. Start-of-new-season auto-actions
  const startChain = runChain(s, rng, s.season, 'season_start')
  s = startChain.state
  events.push(...startChain.events)

  // 5. Reset per-season action log
  s = { ...s, actionsThisSeason: [] }

  return { state: s, events }
}

/**
 * Used at realm creation to fire the year-1 spring start-of-season chain.
 * Without this, year 1 would skip morale, population_upkeep, and the
 * assign_population check, deviating from the book.
 */
export function bootSpring(state: RealmState, rng: Rng): SeasonResolution {
  return runChain(state, rng, 'spring', 'season_start')
}
