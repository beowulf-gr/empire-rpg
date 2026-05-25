/**
 * Morale-check bribery (3g.7) — book §5.
 *
 * The ruler may spend 1 gp to give any one loyalty group a +2 bonus to its
 * spring morale check (or +5 to an individual minister). On success this
 * also adds +1 loyalty as bribery — bread and circuses repair reputation.
 *
 * Players allocate bribes during a season. Gold is deducted at allocation
 * time so the commitment is binding (no "I changed my mind" gaming). The
 * morale_upkeep executor reads pendingBribes when it runs at the start of
 * the next spring; bribes are cleared afterward regardless of outcome.
 *
 * Adjusting an existing bribe replaces the prior allocation: gold is
 * refunded for the old amount and re-deducted for the new amount.
 */

import type { RealmState } from '../state'

export interface MoraleBribe {
  /** Loyalty group id (any kind: commoners / military / minister / faction). */
  groupId: string
  /** How many gp the ruler is paying. > 0. */
  gp: number
}

export class BriberyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BriberyError'
  }
}

/**
 * Returns the per-gp morale bonus for a given loyalty group.
 *
 *   - Individuals (ministers): +5 per gp (book wording)
 *   - Groups (commoners, military, faction): +2 per gp
 *
 * Future factions could be marked individual via a flag on the group;
 * for now only ministers are individuals.
 */
export function moraleBribeBonusPerGp(
  state: RealmState,
  groupId: string,
): number {
  const group = state.loyaltyGroups.find((g) => g.id === groupId)
  if (!group) return 2 // safe default
  return group.kind === 'minister' ? 5 : 2
}

/**
 * Sets (or removes) the bribe amount allocated to `groupId`. Gold is
 * adjusted by the difference between the new and previous amount.
 *
 *   - gp = 0 removes the bribe and refunds prior gold.
 *   - gp > 0 sets the bribe; gold is debited (or refunded) by the delta.
 */
export function setMoraleBribe(
  state: RealmState,
  groupId: string,
  gp: number,
): RealmState {
  if (!Number.isInteger(gp) || gp < 0) {
    throw new BriberyError(`Bribe must be a non-negative integer (got ${gp}).`)
  }
  const group = state.loyaltyGroups.find((g) => g.id === groupId)
  if (!group) {
    throw new BriberyError(`No loyalty group with id ${groupId}.`)
  }
  const existing = state.pendingBribes.find((b) => b.groupId === groupId)
  const previous = existing?.gp ?? 0
  const delta = gp - previous // positive = need more gold; negative = refund
  if (delta > 0 && state.resources.gold < delta) {
    throw new BriberyError(
      `Not enough gold to increase bribe (need ${delta} more, have ${state.resources.gold}).`,
    )
  }

  const otherBribes = state.pendingBribes.filter((b) => b.groupId !== groupId)
  const updatedBribes: MoraleBribe[] =
    gp === 0 ? otherBribes : [...otherBribes, { groupId, gp }]

  return {
    ...state,
    resources: { ...state.resources, gold: state.resources.gold - delta },
    pendingBribes: updatedBribes,
  }
}

/**
 * Returns the bribe (if any) allocated for the given group, or null.
 */
export function findMoraleBribe(
  state: RealmState,
  groupId: string,
): MoraleBribe | null {
  return state.pendingBribes.find((b) => b.groupId === groupId) ?? null
}

/** Sum of gp committed across all bribes — useful for the dashboard. */
export function totalCommittedBribes(state: RealmState): number {
  return state.pendingBribes.reduce((s, b) => s + b.gp, 0)
}
