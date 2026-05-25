/**
 * Economy actions — Sell Goods (3e.1), Buy Goods (3e.2 will land here too).
 *
 * Two pieces:
 *
 *   1. Price/conversion table (RESOURCE_SELL_RATIO) — base "units per gp"
 *      ratios from rules-digest.md §3. Lower is better for the seller. The
 *      Treasurer's Knowledge(economics) check can reduce these toward a
 *      floor of 1; a botched check can raise them.
 *
 *   2. rollEconomicsCheck(state, rng) — common Knowledge(economics) helper
 *      used by Sell, Buy, and (later) Loans. Rolls d20 + Treasurer level
 *      (or -2 vacancy) + 2 per Marketplace + 2 per Port. Crit-fail flag
 *      fires on natural 1 OR total < 10 per the book.
 *
 *   3. Sell Goods:
 *        startSellGoods(state, params, rng, uuid?)
 *          → validates, rolls the check, deducts the resource immediately,
 *            queues an OngoingAction with seasonsRemaining=1.
 *        applyCompletedSellGoods(state, ongoing)
 *          → runs at next-season tick; adds the agreed gold to the treasury.
 *
 * Connectivity: book requires "a stronghold connected to a port or trade
 * center." For MVP we accept "any port stronghold OR any road built". A
 * proper graph traversal arrives when 3f (Diplomacy / neighbors) lands.
 */

import type { ResourceKey } from '../../types/rules'
import type { RealmState, TurnEvent } from '../state'
import type { Rng } from '../rng'
import type { ActionId, OngoingAction } from './types'
import { ministerCheckBonus } from './ministers'
import { bankerConspiracyActive } from './loans'

// ============================================================
// Errors
// ============================================================

export class TradeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TradeError'
  }
}

// ============================================================
// Resource conversion table
// ============================================================

/**
 * Every non-gold resource is sellable. Premium minerals (mithral,
 * adamantine) have inverse ratios — 1 unit yields MORE than 1 gp — so
 * the Sell/Buy code special-cases them via PREMIUM_MINERAL_GP_PER_UNIT.
 */
export type SellableResource = Exclude<ResourceKey, 'gold'>

/**
 * Standard ratio: N units = 1 gp. Lower = more valuable per unit.
 * Treasurer's Knowledge(economics) success can reduce this toward a floor
 * of 1; a botched check can raise it.
 */
export const RESOURCE_SELL_RATIO: Record<
  Exclude<SellableResource, 'mithral' | 'adamantine'>,
  number
> = {
  food: 20,
  lumber: 15,
  stone: 12,
  copper: 10,
  iron: 10,
  silver: 5,
  gold_metal: 1,
}

/**
 * Premium minerals — gp value per single unit (book §3). Treasurer's
 * Knowledge(economics) success ADDS to gp/unit; a botched check
 * REDUCES it (floor 1). Crit fail subtracts 1d4.
 */
export const PREMIUM_MINERAL_GP_PER_UNIT: Record<
  Extract<SellableResource, 'mithral' | 'adamantine'>,
  number
> = {
  mithral: 2,
  adamantine: 3,
}

export const SELLABLE_RESOURCES: SellableResource[] = [
  'food',
  'lumber',
  'stone',
  'copper',
  'iron',
  'silver',
  'gold_metal',
  'mithral',
  'adamantine',
]

/** Returns true if the resource uses the premium "gp per unit" model. */
export function isPremiumMineral(
  r: SellableResource,
): r is 'mithral' | 'adamantine' {
  return r === 'mithral' || r === 'adamantine'
}

// ============================================================
// Connectivity (port-or-graph-connected gate)
// ============================================================

import { tradeRouteStatus } from '../geography'

/**
 * Returns true if the realm has a viable trade route to outside markets:
 *   - At least one Port stronghold (ports trade directly with passing ships), OR
 *   - At least one stronghold graph-connected via the road network to a
 *     realm-perimeter area (roads exit there to a foreign market).
 *
 * Promoted from the loose "any port OR any road exists" check in 3e.1
 * to the proper graph traversal in 3i.
 */
export function hasTradeRoute(state: RealmState): boolean {
  return tradeRouteStatus(state).active
}

// ============================================================
// Knowledge(economics) check
// ============================================================

export interface EconomicsCheck {
  /** The natural d20 roll (before any modifiers). */
  natural: number
  /** Treasurer.level if filled, -2 vacancy penalty if empty. */
  treasurerBonus: number
  /** Treasurer's display name (or null when vacant). */
  treasurerName: string | null
  /** +2 per Marketplace. Stacks per the homebrew add-on rules. */
  marketplaceBonus: number
  /** +2 per Port. Stacks per the homebrew add-on rules. */
  portBonus: number
  /** Sum of natural + all bonuses (the "check total" compared to DC). */
  total: number
  /**
   * Critical failure: natural 1 OR (total < 10) per the book. Sell Goods
   * uses this to bump the conversion ratio by 1d4; Buy Goods reads it as
   * a "no goods at all" failure mode.
   */
  critFail: boolean
}

export function rollEconomicsCheck(state: RealmState, rng: Rng): EconomicsCheck {
  const natural = rng.d20()
  const { bonus: treasurerBonus, minister } = ministerCheckBonus(state, 'treasurer')
  const marketplaceBonus =
    state.strongholds.filter((s) => s.kind === 'marketplace').length * 2
  const portBonus =
    state.strongholds.filter((s) => s.kind === 'port').length * 2
  const total = natural + treasurerBonus + marketplaceBonus + portBonus
  const critFail = natural === 1 || total < 10
  return {
    natural,
    treasurerBonus,
    treasurerName: minister?.name ?? null,
    marketplaceBonus,
    portBonus,
    total,
    critFail,
  }
}

// ============================================================
// Sell Goods
// ============================================================

export interface SellGoodsParams {
  resource: SellableResource
  /** How many units of `resource` to put up for sale. */
  quantity: number
}

interface SellOutcome {
  state: RealmState
  events: TurnEvent[]
}

/**
 * Starts a Sell Goods transaction. The resource is taken from the pool
 * immediately; gold arrives next season via applyCompletedSellGoods.
 */
export function startSellGoods(
  state: RealmState,
  params: SellGoodsParams,
  rng: Rng,
  uuid: () => string = () => crypto.randomUUID(),
): SellOutcome {
  const { resource, quantity } = params

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new TradeError(`Quantity must be a positive integer (got ${quantity}).`)
  }
  const isPremium = isPremiumMineral(resource)
  if (!isPremium && !(resource in RESOURCE_SELL_RATIO)) {
    throw new TradeError(`Cannot sell ${resource}.`)
  }
  if (state.resources[resource] < quantity) {
    throw new TradeError(
      `Not enough ${resource} (have ${state.resources[resource]}, want to sell ${quantity}).`,
    )
  }
  if (!hasTradeRoute(state)) {
    throw new TradeError(
      'No trade route. Build a Port or at least one road segment to reach buyers.',
    )
  }

  const check = rollEconomicsCheck(state, rng)
  const isWinter = state.season === 'winter'
  const bankerConspiracy = bankerConspiracyActive(state)
  const SELL_DC = 20
  const margin = check.total - SELL_DC

  let effectiveRatio: number
  let goldRevenue: number
  let critFailPenalty = 0
  const winterPenalty = isWinter ? 2 : 0
  // For premium minerals we track gp/unit symmetrically: success adds, fail subtracts.
  // Set in either branch and copied into the event payload below.
  let baseRatio: number
  let gpPerUnit: number | null = null

  if (isPremium) {
    // Premium minerals: gp per unit, never < 1.
    const baseGp = PREMIUM_MINERAL_GP_PER_UNIT[resource]
    baseRatio = baseGp // surfaced as "ratio" in the payload (gp/unit form)
    const bump = margin >= 0 ? Math.floor(margin / 10) + 1 : 0
    let effectiveGpPerUnit = baseGp + bump
    if (check.critFail) {
      critFailPenalty = rng.d4()
      effectiveGpPerUnit -= critFailPenalty
    }
    effectiveGpPerUnit -= winterPenalty // Winter -2 to gp/unit (mirror of +2 ratio penalty)
    if (bankerConspiracy) effectiveGpPerUnit = Math.floor(effectiveGpPerUnit / 2)
    effectiveGpPerUnit = Math.max(1, effectiveGpPerUnit) // floor 1 gp/unit
    gpPerUnit = effectiveGpPerUnit
    effectiveRatio = effectiveGpPerUnit // for payload uniformity
    goldRevenue = quantity * effectiveGpPerUnit
  } else {
    // Standard resources: N units per gp.
    baseRatio = RESOURCE_SELL_RATIO[resource]
    // Per book: each +10 over DC 20 reduces the ratio by 1, floor 1.
    const reduction = margin >= 0 ? Math.floor(margin / 10) + 1 : 0
    effectiveRatio = Math.max(1, baseRatio - reduction)
    if (check.critFail) {
      critFailPenalty = rng.d4()
      effectiveRatio += critFailPenalty
    }
    effectiveRatio += winterPenalty
    // Banker conspiracy doubles the final ratio per book §7.
    if (bankerConspiracy) effectiveRatio *= 2
    goldRevenue = Math.floor(quantity / effectiveRatio)
  }

  // Reduction value surfaced in the event payload (number of "ratio bumps"
  // earned from the success). Computed identically regardless of premium.
  const reduction = margin >= 0 ? Math.floor(margin / 10) + 1 : 0

  // Deduct the resource immediately. Gold is paid out next season.
  const next: RealmState = {
    ...state,
    resources: {
      ...state.resources,
      [resource]: state.resources[resource] - quantity,
    },
  }

  const ongoing: OngoingAction = {
    id: uuid(),
    actionId: 'sell_goods' as ActionId,
    startedYear: state.year,
    startedSeason: state.season,
    seasonsRemaining: 1,
    parameters: {
      resource,
      quantity,
      effectiveRatio,
      goldRevenue,
    } satisfies SellOngoingParams,
  }

  return {
    state: { ...next, ongoingActions: [...next.ongoingActions, ongoing] },
    events: [
      {
        type: 'sell_goods_pending',
        payload: {
          resource,
          quantity,
          baseRatio,
          effectiveRatio,
          goldRevenue,
          bankerConspiracy,
          isPremium,
          gpPerUnit,
          check: {
            natural: check.natural,
            total: check.total,
            treasurerBonus: check.treasurerBonus,
            treasurerName: check.treasurerName,
            marketplaceBonus: check.marketplaceBonus,
            portBonus: check.portBonus,
            critFail: check.critFail,
            critFailPenalty,
            winterPenalty,
            margin,
            reduction,
          },
        },
      },
    ],
  }
}

interface SellOngoingParams {
  resource: SellableResource
  quantity: number
  effectiveRatio: number
  goldRevenue: number
}

/**
 * Called by the orchestrator on the next season transition. Adds the
 * agreed gold revenue to the realm's treasury.
 */
export function applyCompletedSellGoods(
  state: RealmState,
  ongoing: OngoingAction,
): SellOutcome {
  const { resource, quantity, effectiveRatio, goldRevenue } =
    ongoing.parameters as unknown as SellOngoingParams
  return {
    state: {
      ...state,
      resources: { ...state.resources, gold: state.resources.gold + goldRevenue },
    },
    events: [
      {
        type: 'sell_goods_complete',
        payload: { resource, quantity, effectiveRatio, goldRevenue },
      },
    ],
  }
}

/**
 * Dispatch hook used by the orchestrator. Returns null when this isn't an
 * economy-related ongoing action (so the caller falls through to other
 * dispatchers like construction / military).
 */
export function applyCompletedTrade(
  state: RealmState,
  ongoing: OngoingAction,
): SellOutcome | null {
  switch (ongoing.actionId as ActionId) {
    case 'sell_goods':
      return applyCompletedSellGoods(state, ongoing)
    default:
      return null
  }
}

// ============================================================
// Buy Goods (3e.2)
// ============================================================

export interface BuyGoodsParams {
  /**
   * Which resource to buy. Same set as Sell Goods — premium minerals
   * deferred to Produce Trade Goods.
   */
  resource: SellableResource
  /**
   * Number of units to acquire (after the merchant fee). Must be a
   * positive integer.
   */
  quantity: number
}

interface BuyOutcome {
  state: RealmState
  events: TurnEvent[]
}

const BUY_DC_BASE = 10
const BUY_DC_WINTER_PENALTY = 5

/**
 * Cost-in-gold for Q units of `resource` at the listed price.
 *
 * Standard resources: 1 gp purchases `baseRatio` units. Cost is rounded
 * UP so the realm always pays a whole gp.
 * Premium minerals: cost = quantity × gp/unit (mithral 2 gp/unit, etc.).
 */
export function buyGoodsCost(
  resource: SellableResource,
  quantity: number,
): number {
  if (isPremiumMineral(resource)) {
    return quantity * PREMIUM_MINERAL_GP_PER_UNIT[resource]
  }
  return Math.ceil(quantity / RESOURCE_SELL_RATIO[resource])
}

/**
 * Executes Buy Goods. Instant — no OngoingAction. Outcome paths:
 *
 *   - Critical failure (nat 1 OR total < 10): the merchant gouges you.
 *     Goods delivered, but the price is bumped by 1d4 gp. If you can't
 *     pay the markup, the deal falls through (no gold spent, no goods).
 *     Homebrew per Vassilis's policy choice (mirrors Sell's '+1d4 ratio').
 *   - Plain failure (margin < 0, no critFail): "not for sale". No gold
 *     spent, no goods received.
 *   - Success (DC ≤ total < DC+10): pay gp, gain `quantity` units.
 *   - Beat by 10+: bonus +1 free unit on top.
 *
 * Winter raises the DC by +5 per the book.
 *
 * The caller checks gold-affordability up front (we throw TradeError if
 * insufficient at the *base* price — the player should know they can't
 * afford it before rolling).
 */
export function executeBuyGoods(
  state: RealmState,
  params: BuyGoodsParams,
  rng: Rng,
): BuyOutcome {
  const { resource, quantity } = params

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new TradeError(`Quantity must be a positive integer (got ${quantity}).`)
  }
  if (!isPremiumMineral(resource) && !(resource in RESOURCE_SELL_RATIO)) {
    throw new TradeError(`Cannot buy ${resource}.`)
  }
  if (!hasTradeRoute(state)) {
    throw new TradeError(
      'No trade route. Build a Port or at least one road segment to reach merchants.',
    )
  }

  const cost = buyGoodsCost(resource, quantity)
  if (state.resources.gold < cost) {
    throw new TradeError(
      `Not enough gold (need ${cost}, have ${state.resources.gold}).`,
    )
  }

  const check = rollEconomicsCheck(state, rng)
  const dc = state.season === 'winter' ? BUY_DC_BASE + BUY_DC_WINTER_PENALTY : BUY_DC_BASE
  const margin = check.total - dc

  const checkPayload = {
    natural: check.natural,
    total: check.total,
    treasurerBonus: check.treasurerBonus,
    treasurerName: check.treasurerName,
    marketplaceBonus: check.marketplaceBonus,
    portBonus: check.portBonus,
    critFail: check.critFail,
  }

  // Critical failure path (homebrew): gouged, pay 1d4 extra gp for the same
  // units. If we can't afford the markup, the deal falls through.
  if (check.critFail) {
    const markup = rng.d4()
    const totalCost = cost + markup
    if (state.resources.gold < totalCost) {
      return {
        state,
        events: [
          {
            type: 'buy_goods_failed',
            payload: {
              resource, quantity, cost, dc, check: checkPayload, margin,
              critFailMarkup: markup,
              reason: 'crit_fail_cannot_pay_markup',
            },
          },
        ],
      }
    }
    const next: RealmState = {
      ...state,
      resources: {
        ...state.resources,
        gold: state.resources.gold - totalCost,
        [resource]: state.resources[resource] + quantity,
      },
    }
    return {
      state: next,
      events: [
        {
          type: 'buy_goods_gouged',
          payload: {
            resource,
            quantity,
            delivered: quantity,
            cost,
            critFailMarkup: markup,
            totalCost,
            dc,
            check: checkPayload,
            margin,
          },
        },
      ],
    }
  }

  // Plain failure: missed DC.
  if (margin < 0) {
    return {
      state,
      events: [
        {
          type: 'buy_goods_failed',
          payload: { resource, quantity, cost, dc, check: checkPayload, margin },
        },
      ],
    }
  }

  // Success: deduct gold, deliver goods, apply bonus on margin ≥ 10.
  const bonus = margin >= 10 ? 1 : 0
  const delivered = quantity + bonus

  const next: RealmState = {
    ...state,
    resources: {
      ...state.resources,
      gold: state.resources.gold - cost,
      [resource]: state.resources[resource] + delivered,
    },
  }

  return {
    state: next,
    events: [
      {
        type: 'buy_goods',
        payload: {
          resource,
          quantity,
          delivered,
          bonus,
          cost,
          dc,
          check: checkPayload,
          margin,
        },
      },
    ],
  }
}
