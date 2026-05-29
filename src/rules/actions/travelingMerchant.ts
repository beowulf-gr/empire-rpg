/**
 * Traveling Merchant — Buy / Sell with an itinerant trader.
 *
 * Homebrew escape valve for the "inland realm with no stone source" soft-lock
 * (no hills/mountains and no coastal access → can't build roads or a port →
 * no way to import stone). The traveling merchant comes to you, so this
 * action bypasses the usual port-or-road trade-route requirement.
 *
 * Constraints (per Vassilis's design, 2026-05-25):
 *
 *   - Spend (Buy) or earn (Sell) at most **1 gold per season** per action.
 *     Buy and Sell have *separate* per-season caps, so you can do one of each.
 *     Enforced via the standard SINGLE_USE_LIMITED mechanism in limited.ts.
 *
 *   - Buy at **half the normal Buy Goods rate** (units per gp):
 *       food   10  (vs 20)
 *       lumber  7  (vs 15 — floor(15/2))
 *       stone   6  (vs 12)
 *       copper  5  (vs 10)
 *       iron    5  (vs 10)
 *
 *   - Sell at **double the normal Sell Goods ratio** (units per gp):
 *       food   40  (vs 20)
 *       lumber 30  (vs 15)
 *       stone  24  (vs 12)
 *       copper 20  (vs 10)
 *       iron   20  (vs 10)
 *
 *   - Trade goods (Sell side only): the merchant takes Weapons & Armor and
 *     Wooden Goods at **2 units = 1 gp** (vs 1 unit = 1 gp normally).
 *     He won't touch Exotic Items or Magic Items — too risky for his cart.
 *
 *   - Premium and rare materials (silver, gold ore, mithral, adamantine) are
 *     **not available** on either side — the merchant doesn't carry them and
 *     won't take them off your hands.
 *
 *   - **Forbidden in winter** — the roads are too dangerous; he stays home.
 *
 *   - **No Knowledge(economics) check** — fixed rate, take it or leave it.
 *
 *   - **Instant** — gold and goods change hands on the spot (no
 *     OngoingAction queue).
 *
 *   - **No trade-route requirement** — this is the whole point.
 */

import type { RealmState, TurnEvent } from '../state'
import type { ActionLog } from './types'
import { assertLimitedNotTaken } from './limited'
import { RESOURCE_SELL_RATIO, type SellableResource } from './economy'

// ============================================================
// Errors
// ============================================================

export class TravelingMerchantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TravelingMerchantError'
  }
}

// ============================================================
// Allowed resources
// ============================================================

/**
 * Resources the traveling merchant trades in. Excludes silver, gold_metal,
 * mithral, adamantine. Same set for buy and sell sides.
 */
export type MerchantResource = 'food' | 'lumber' | 'stone' | 'copper' | 'iron'

export const MERCHANT_RESOURCES: readonly MerchantResource[] = [
  'food',
  'lumber',
  'stone',
  'copper',
  'iron',
] as const

/** Trade goods the merchant will buy (sell-side only). */
export type MerchantTradeGood = 'weapons_and_armor' | 'wooden_goods'

export const MERCHANT_TRADE_GOODS: readonly MerchantTradeGood[] = [
  'weapons_and_armor',
  'wooden_goods',
] as const

// ============================================================
// Rate tables (precomputed from RESOURCE_SELL_RATIO)
// ============================================================

/**
 * Units of `resource` the player receives for spending 1 gold via the
 * traveling merchant. Half the normal Buy Goods rate, rounded down.
 */
export const MERCHANT_BUY_UNITS_PER_GOLD: Record<MerchantResource, number> = {
  food: Math.floor(RESOURCE_SELL_RATIO.food / 2), // 10
  lumber: Math.floor(RESOURCE_SELL_RATIO.lumber / 2), // 7
  stone: Math.floor(RESOURCE_SELL_RATIO.stone / 2), // 6
  copper: Math.floor(RESOURCE_SELL_RATIO.copper / 2), // 5
  iron: Math.floor(RESOURCE_SELL_RATIO.iron / 2), // 5
}

/**
 * Units of `resource` the player must hand over to earn 1 gold via the
 * traveling merchant. Double the normal Sell Goods conversion ratio.
 */
export const MERCHANT_SELL_UNITS_PER_GOLD: Record<MerchantResource, number> = {
  food: RESOURCE_SELL_RATIO.food * 2, // 40
  lumber: RESOURCE_SELL_RATIO.lumber * 2, // 30
  stone: RESOURCE_SELL_RATIO.stone * 2, // 24
  copper: RESOURCE_SELL_RATIO.copper * 2, // 20
  iron: RESOURCE_SELL_RATIO.iron * 2, // 20
}

/**
 * Units of `tradeGood` the player must hand over to earn 1 gold. Half the
 * normal Sell Trade Goods rate of 1 gp/unit → 2 units/gp.
 */
export const MERCHANT_TRADE_GOOD_UNITS_PER_GOLD: Record<MerchantTradeGood, number> = {
  weapons_and_armor: 2,
  wooden_goods: 2,
}

// ============================================================
// Buy from Traveling Merchant
// ============================================================

export interface BuyFromMerchantParams {
  resource: MerchantResource
}

interface MerchantOutcome {
  state: RealmState
  events: TurnEvent[]
}

/**
 * The merchant hands you `MERCHANT_BUY_UNITS_PER_GOLD[resource]` units of
 * the chosen raw resource in exchange for 1 gold. Instant.
 *
 * Failure modes (all throw TravelingMerchantError):
 *   - Winter: he's not making the trip.
 *   - Action already taken this season (Limited cap).
 *   - Treasury has less than 1 gold.
 *   - Resource not in MERCHANT_RESOURCES (shouldn't happen at the type level,
 *     but defended against for runtime safety from untyped callers).
 */
export function executeBuyFromTravelingMerchant(
  state: RealmState,
  params: BuyFromMerchantParams,
): MerchantOutcome {
  const { resource } = params

  if (state.season === 'winter') {
    throw new TravelingMerchantError(
      'The traveling merchant does not visit in winter — the roads are too dangerous.',
    )
  }

  if (!MERCHANT_RESOURCES.includes(resource)) {
    throw new TravelingMerchantError(
      `The traveling merchant does not stock ${resource}.`,
    )
  }

  assertLimitedNotTaken(
    state,
    'buy_from_traveling_merchant',
    'Buy from Traveling Merchant',
  )

  if (state.resources.gold < 1) {
    throw new TravelingMerchantError(
      `Not enough gold (need 1, have ${state.resources.gold}).`,
    )
  }

  const unitsReceived = MERCHANT_BUY_UNITS_PER_GOLD[resource]

  const next: RealmState = {
    ...state,
    resources: {
      ...state.resources,
      gold: state.resources.gold - 1,
      [resource]: state.resources[resource as SellableResource] + unitsReceived,
    },
    actionsThisSeason: [
      ...state.actionsThisSeason,
      {
        actionId: 'buy_from_traveling_merchant',
        takenAt: new Date().toISOString(),
      } satisfies ActionLog,
    ],
  }

  return {
    state: next,
    events: [
      {
        type: 'buy_from_traveling_merchant',
        payload: {
          resource,
          unitsReceived,
          goldSpent: 1,
        },
      },
    ],
  }
}

// ============================================================
// Sell to Traveling Merchant
// ============================================================

/**
 * The merchant accepts either a raw resource or one of the two simple trade
 * goods. The discriminant `kind` tells the engine which inventory to draw
 * from.
 */
export type SellToMerchantParams =
  | { kind: 'resource'; resource: MerchantResource }
  | { kind: 'trade_good'; tradeGood: MerchantTradeGood }

/**
 * You hand the merchant the required units (resource or trade good) and he
 * pays you 1 gold on the spot. Instant — no OngoingAction.
 *
 * Failure modes (all throw TravelingMerchantError):
 *   - Winter (see Buy).
 *   - Action already taken this season (Limited cap).
 *   - Not enough of the chosen resource / trade good in stock to cover the
 *     required units-per-gold.
 *   - Invalid kind / resource / tradeGood (runtime defence).
 */
export function executeSellToTravelingMerchant(
  state: RealmState,
  params: SellToMerchantParams,
): MerchantOutcome {
  if (state.season === 'winter') {
    throw new TravelingMerchantError(
      'The traveling merchant does not visit in winter — the roads are too dangerous.',
    )
  }

  assertLimitedNotTaken(
    state,
    'sell_to_traveling_merchant',
    'Sell to Traveling Merchant',
  )

  if (params.kind === 'resource') {
    const { resource } = params
    if (!MERCHANT_RESOURCES.includes(resource)) {
      throw new TravelingMerchantError(
        `The traveling merchant won't buy ${resource}.`,
      )
    }
    const unitsRequired = MERCHANT_SELL_UNITS_PER_GOLD[resource]
    const have = state.resources[resource as SellableResource]
    if (have < unitsRequired) {
      throw new TravelingMerchantError(
        `Not enough ${resource} to sell (need ${unitsRequired} for 1 gold, have ${have}).`,
      )
    }
    const next: RealmState = {
      ...state,
      resources: {
        ...state.resources,
        [resource]: have - unitsRequired,
        gold: state.resources.gold + 1,
      },
      actionsThisSeason: [
        ...state.actionsThisSeason,
        {
          actionId: 'sell_to_traveling_merchant',
          takenAt: new Date().toISOString(),
        } satisfies ActionLog,
      ],
    }
    return {
      state: next,
      events: [
        {
          type: 'sell_to_traveling_merchant',
          payload: {
            kind: 'resource',
            resource,
            unitsHandedOver: unitsRequired,
            goldEarned: 1,
          },
        },
      ],
    }
  }

  // kind === 'trade_good'
  const { tradeGood } = params
  if (!MERCHANT_TRADE_GOODS.includes(tradeGood)) {
    throw new TravelingMerchantError(
      `The traveling merchant won't take ${tradeGood} — too risky for his cart.`,
    )
  }
  const unitsRequired = MERCHANT_TRADE_GOOD_UNITS_PER_GOLD[tradeGood]
  const have = state.tradeGoods[tradeGood]
  if (have < unitsRequired) {
    throw new TravelingMerchantError(
      `Not enough ${tradeGood} to sell (need ${unitsRequired} for 1 gold, have ${have}).`,
    )
  }
  const next: RealmState = {
    ...state,
    tradeGoods: {
      ...state.tradeGoods,
      [tradeGood]: have - unitsRequired,
    },
    resources: {
      ...state.resources,
      gold: state.resources.gold + 1,
    },
    actionsThisSeason: [
      ...state.actionsThisSeason,
      {
        actionId: 'sell_to_traveling_merchant',
        takenAt: new Date().toISOString(),
      } satisfies ActionLog,
    ],
  }
  return {
    state: next,
    events: [
      {
        type: 'sell_to_traveling_merchant',
        payload: {
          kind: 'trade_good',
          tradeGood,
          unitsHandedOver: unitsRequired,
          goldEarned: 1,
        },
      },
    ],
  }
}
