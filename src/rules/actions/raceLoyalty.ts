/**
 * Race-based loyalty modifiers (book §4) — applied during Morale Upkeep and
 * the Elves' spring emigration check.
 *
 * The book attaches per-race loyalty baselines to commoner factions. We model
 * the realm with a SINGLE commoners loyalty group, so the per-race numbers
 * are folded into one realm-wide modifier via a population-weighted average.
 *
 * Race baselines:
 *   - Dwarves: +2 (loyalty to a non-dwarf ruler if well-treated)
 *   - Elves:    0 (no loyalty mod, but spring emigration check applies)
 *   - Gnomes:   0
 *   - Halflings:0
 *   - Humans:   0
 *   - Orcs:    -5 (plus the per-year unused-warrior penalty, not yet wired)
 *   - Goblins: -5 ("immune to penalties" — see goblinMajorityShare)
 *   - Undead:  treated as 0 in the average (no loyalty score). Their *presence*
 *              imposes a flat -2 on every non-undead loyalty group via
 *              `undeadPresencePenalty`.
 */

import type { Race } from '../../types/rules'
import type { RealmState } from '../state'

/** Per-race baseline applied to commoner loyalty checks. */
const RACE_LOYALTY_MOD: Record<Race, number> = {
  humans: 0,
  halflings: 0,
  elves: 0,
  gnomes: 0,
  dwarves: 2,
  orcs: -5,
  goblins: -5,
  undead: 0, // tracked separately via undeadPresencePenalty
}

/**
 * Returns the population-weighted loyalty modifier for the realm's commoners,
 * derived from current race composition. Undead are excluded from the average
 * (their loyalty is captured by `undeadPresencePenalty` instead). Rounds to
 * the nearest integer so the d20 check stays whole-number.
 *
 * Examples (barony, 10 pop):
 *   - 10 humans               →  0
 *   - 5 humans, 5 dwarves     → +1  (round(0×0.5 + 2×0.5) = round(1) = 1)
 *   - 10 dwarves              → +2
 *   - 5 humans, 5 goblins     → -3  (round(0×0.5 + -5×0.5) = round(-2.5) = -2 or -3)
 *   - 10 orcs                 → -5
 */
export function racialCompositionMod(state: RealmState): number {
  let total = 0
  let weighted = 0
  for (const stack of state.populations) {
    if (stack.race === 'undead') continue
    total += stack.count
    weighted += stack.count * RACE_LOYALTY_MOD[stack.race]
  }
  if (total === 0) return 0
  return Math.round(weighted / total)
}

/**
 * If any undead population exists, every non-undead loyalty group suffers
 * -2 on its loyalty check. Returns -2 in that case, otherwise 0.
 */
export function undeadPresencePenalty(state: RealmState): number {
  const anyUndead = state.populations.some(
    (s) => s.race === 'undead' && s.count > 0,
  )
  return anyUndead ? -2 : 0
}

/**
 * Returns the goblin share of the realm's non-undead population, in [0, 1].
 * Used to decide whether goblins' "immune to penalties" rule kicks in for
 * the commoners group — if goblins are a clear majority of the populace,
 * negative outcomes on the loyalty check don't push the score down.
 */
export function goblinMajorityShare(state: RealmState): number {
  let goblins = 0
  let total = 0
  for (const stack of state.populations) {
    if (stack.race === 'undead') continue
    total += stack.count
    if (stack.race === 'goblins') goblins += stack.count
  }
  if (total === 0) return 0
  return goblins / total
}

/**
 * Combined race-driven modifier on a commoners loyalty check:
 *   racialComposition + undeadPresencePenalty + orcIdlePenalty.
 *
 * Military groups don't get the racial-composition piece (their race comes
 * from how they were mustered), but they DO get the undead penalty —
 * military morale collapses when undead walk the realm.
 *
 * The orc idle penalty (`state.orcIdlePenalty`) is added in raw — it
 * already represents accumulated displeasure from years of wasted warrior
 * potential, and the executor that updates it floors at 0.
 */
export function commonersLoyaltyModifier(state: RealmState): {
  composition: number
  undeadPenalty: number
  orcIdle: number
  total: number
} {
  const composition = racialCompositionMod(state)
  const undeadPenalty = undeadPresencePenalty(state)
  const orcIdle = state.orcIdlePenalty
  return {
    composition,
    undeadPenalty,
    orcIdle,
    total: composition + undeadPenalty + orcIdle,
  }
}

/**
 * Goblin "immune to penalties" clamp (book §4):
 * "They never suffer penalties to this score for lack of supplies, poor
 *  treatment, or other adverse conditions."
 *
 * We interpret this as: if goblins make up more than half of the commoners,
 * any negative `delta` returned by `resolveMoraleCheck` is suppressed to 0.
 * The goblins' baseline is already a -5 composition mod, so the floor is
 * effectively their starting place.
 */
export function clampNegativeDeltaForGoblins(
  state: RealmState,
  delta: number,
): number {
  if (delta >= 0) return delta
  return goblinMajorityShare(state) > 0.5 ? 0 : delta
}
