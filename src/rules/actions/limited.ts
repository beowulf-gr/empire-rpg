/**
 * Limited-descriptor enforcement helpers.
 *
 * Each Limited action has its own definition of "exhausted":
 *   - raise_loans / raise_taxes  → single-use per season (entry in actionsThisSeason)
 *   - recruit_settlers           → up to 3 checks per spring (book §6.1)
 *   - level_up_unit              → once per mustered unit per year; exhausted only
 *                                  when EVERY mustered unit has been levelled this
 *                                  spring (or there are no mustered units to level)
 *
 * Single-use Limited actions get a generic check via `assertLimitedNotTaken`.
 * The UI calls `isLimitedActionExhausted` to drive the "completed" visual state
 * for action buttons.
 */

import type { RealmState } from '../state'
import type { ActionId } from './types'
import {
  RECRUIT_SETTLERS_PER_SPRING,
  recruitChecksThisSpring,
} from './recruit'
import { unitsLeveledThisSpring } from './military'

/** Action ids whose Limited descriptor maps to "exactly once per season". */
const SINGLE_USE_LIMITED: ReadonlySet<ActionId> = new Set<ActionId>([
  'raise_loans',
  'raise_taxes',
  'buy_from_traveling_merchant',
  'sell_to_traveling_merchant',
])

/**
 * Throws a generic Error if the single-use Limited action is already taken
 * this season. Use this from any action executor whose Limited cap is the
 * plain "once per season" version. Actions with bespoke caps (e.g. settlers'
 * 3/spring) should keep their own custom enforcement.
 */
export function assertLimitedNotTaken(
  state: RealmState,
  actionId: ActionId,
  displayName: string,
): void {
  if (state.actionsThisSeason.some((l) => l.actionId === actionId)) {
    throw new Error(`${displayName} is Limited — already taken this season.`)
  }
}

/**
 * Returns true if the Limited action's per-season cap is fully consumed, so
 * the UI should render its button as "completed".
 *
 * For non-Limited actions, or Limited actions that aren't yet implemented,
 * returns false. Falls back to a single-use check if the action appears in
 * actionsThisSeason and has no bespoke cap rule.
 */
export function isLimitedActionExhausted(
  state: RealmState,
  actionId: ActionId,
): boolean {
  switch (actionId) {
    case 'recruit_settlers':
      return recruitChecksThisSpring(state) >= RECRUIT_SETTLERS_PER_SPRING

    case 'level_up_unit': {
      // Exhausted iff every mustered unit has been levelled this spring,
      // OR there are no mustered units at all (nothing to do).
      const mustered = state.militaryUnits.filter((u) => u.source === 'mustered')
      if (mustered.length === 0) return false // not really "exhausted"; just blank
      const levelled = unitsLeveledThisSpring(state)
      return mustered.every((u) => levelled.has(u.id))
    }

    default:
      // Generic fallback: single-use Limited actions are exhausted after one
      // entry in actionsThisSeason. (Includes raise_loans, raise_taxes, and
      // any future single-use Limited additions.)
      if (SINGLE_USE_LIMITED.has(actionId)) {
        return state.actionsThisSeason.some((l) => l.actionId === actionId)
      }
      // Non-Limited or unmapped — leave button in idle state.
      return false
  }
}
