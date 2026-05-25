/**
 * Season transition — thin facade over the orchestrator and helpers.
 *
 * Historical context: prior to 2f.2 this file held resolveSeason, a monolithic
 * function that ran each season's mechanics inline. That's been split into
 * per-action executors in src/rules/actions/executors.ts and an orchestrator
 * in src/rules/actions/orchestrator.ts.
 *
 * This file now re-exports the public-facing pieces so the rest of the codebase
 * (tests, hooks, barrel) doesn't need to know the new path.
 */

import type { Rng } from './rng'
import type { RealmState } from './state'
import { endSeason, type SeasonResolution } from './actions/orchestrator'

export { populationGrowthPercent } from './actions/executors'

/**
 * @deprecated since 2f.2 — kept as an alias for endSeason. Will be removed
 * once all callers migrate to endSeason directly.
 */
export function resolveSeason(state: RealmState, rng: Rng): RealmState {
  return endSeason(state, rng).state
}

export { endSeason }
export type { SeasonResolution }
