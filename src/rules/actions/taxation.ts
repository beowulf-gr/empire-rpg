/**
 * Taxation & loans — Raise Taxes (3e.4), Raise Loans (3e.5 will land here).
 *
 * Both are flat treasury actions distinct from the buy/sell market in
 * economy.ts. Raise Taxes is a one-shot trade-off: -2 commoner loyalty
 * for +10% of every current resource pool (rounded down).
 *
 * Limited descriptor enforcement — Raise Taxes is once per season. The
 * executor checks state.actionsThisSeason and throws if already taken
 * this season; on success, it appends an ActionLog entry so the UI's
 * taken-set can mark the button completed.
 */

import type { ResourceKey } from '../../types/rules'
import type { RealmState, TurnEvent } from '../state'
import { adjustLoyaltyScore, findCommonersGroup } from '../state'
import type { ActionLog } from './types'

export class TaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TaxError'
  }
}

interface TaxOutcome {
  state: RealmState
  events: TurnEvent[]
}

/**
 * Raise Taxes — Limited (once per season). Applies +10% (rounded down)
 * to every resource currently in the pool, then drops commoner loyalty
 * by 2.
 *
 * Rationale for floor rounding:
 *   - Strict 10%: exact for amounts ≥ 10; smaller pools get 0 boost,
 *     which is realistic ("you can't tax what isn't there").
 *   - Round-half-up would produce a 20% effective bump on tiny pools
 *     (e.g., 5 food + 0.5 → 6) and feels exploity.
 */
export function executeRaiseTaxes(state: RealmState): TaxOutcome {
  // Limited gate
  if (state.actionsThisSeason.some((l) => l.actionId === 'raise_taxes')) {
    throw new TaxError(
      'Raise Taxes is Limited — already taken this season.',
    )
  }

  const previousResources = { ...state.resources }
  const newResources = { ...state.resources }
  const delta: Partial<Record<ResourceKey, number>> = {}

  for (const key of Object.keys(state.resources) as ResourceKey[]) {
    const before = state.resources[key]
    const after = Math.floor(before * 1.1)
    newResources[key] = after
    if (after !== before) delta[key] = after - before
  }

  const next: RealmState = {
    ...state,
    resources: newResources,
  }

  // -2 commoner loyalty per the book.
  const commoners = findCommonersGroup(next)
  const withLoyalty = commoners
    ? adjustLoyaltyScore(next, commoners.id, -2)
    : next

  // Append the action log so the UI marks the button completed and a
  // second click is rejected.
  const log: ActionLog = {
    actionId: 'raise_taxes',
    takenAt: new Date().toISOString(),
  }

  return {
    state: {
      ...withLoyalty,
      actionsThisSeason: [...withLoyalty.actionsThisSeason, log],
    },
    events: [
      {
        type: 'raise_taxes',
        payload: {
          delta,
          loyaltyDelta: -2,
          previousResources,
          newResources,
          loyaltyBefore: commoners?.score ?? null,
          loyaltyAfter: (commoners?.score ?? 0) - 2,
        },
      },
    ],
  }
}
