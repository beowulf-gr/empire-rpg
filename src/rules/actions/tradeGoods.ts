/**
 * Produce Trade Goods (3e.6)
 *
 * Player assigns idle pop to a stronghold to convert raw resources into
 * finished goods. Goods accumulate in a separate trade-goods inventory
 * (NOT in the resource pool) and can later be sold (3e+) or used to
 * outfit military units (chapter 2).
 *
 * Four recipes, each with costs, durations, and prerequisites per the
 * digest §8:
 *
 *   Exotic Items     mineral worth 1 gp + 1 pop + 1 season  → 2 gp/unit
 *   Magic Items      mineral worth 4 gp + 1 pop + 4 seasons → 6 gp/unit
 *                    requires Wizards' Academy OR elf population
 *   Weapons & Armor  5 iron + 1 pop + 1 season              → 1 gp/unit
 *                    requires Craftsmen's Guild
 *   Wooden Goods     10 lumber + 1 pop + 1 season           → 1 gp/unit
 *
 * Production capacity per stronghold per season (book §6):
 *   Village = 1, Town = 4, City = 8
 *
 * In our OngoingAction model the "capacity per season" is interpreted as
 * "concurrent in-flight productions" — a Town can have 4 productions
 * running simultaneously, a Village just 1.
 *
 * Population behavior matches construction (3b): pop is shown as a cost
 * but not physically deducted from RealmState. Flagged for revisit when
 * we model worker pools properly.
 */

import type { Race, ResourceKey } from '../../types/rules'
import type { RealmState, TurnEvent } from '../state'
import type { ActionId, OngoingAction } from './types'
import { ConstructionError } from './construction'
import { hasTradeRoute } from './economy'
import {
  commitIdlePopulation,
  commitIdlePopulationByRace,
  returnCommittedPopulation,
  type CommittedPopChunk,
} from './populationCommit'

// ============================================================
// Types
// ============================================================

export type TradeGoodKind =
  | 'exotic_items'
  | 'magic_items'
  | 'weapons_and_armor'
  | 'wooden_goods'

export interface TradeGoodInventory {
  exotic_items: number
  magic_items: number
  weapons_and_armor: number
  wooden_goods: number
}

export const EMPTY_TRADE_GOODS: TradeGoodInventory = {
  exotic_items: 0,
  magic_items: 0,
  weapons_and_armor: 0,
  wooden_goods: 0,
}

export const TRADE_GOOD_KINDS: TradeGoodKind[] = [
  'exotic_items',
  'magic_items',
  'weapons_and_armor',
  'wooden_goods',
]

export const TRADE_GOOD_LABEL: Record<TradeGoodKind, string> = {
  exotic_items: 'Exotic Items',
  magic_items: 'Magic Items',
  weapons_and_armor: 'Weapons & Armor',
  wooden_goods: 'Wooden Goods',
}

/** Mineral resource keys — used to satisfy "mineral worth N gp" requirements. */
export const MINERAL_RESOURCES = [
  'copper',
  'iron',
  'silver',
  'gold_metal',
  'mithral',
  'adamantine',
] as const

export type MineralResource = (typeof MINERAL_RESOURCES)[number]

/** GP value per single unit of each mineral, per digest §3. */
export const MINERAL_GP_PER_UNIT: Record<MineralResource, number> = {
  copper: 0.1, // 10 copper = 1 gp
  iron: 0.1,
  silver: 0.2, // 5 silver = 1 gp
  gold_metal: 1,
  mithral: 2,
  adamantine: 3,
}

// ============================================================
// Recipes
// ============================================================

export interface TradeGoodRecipe {
  kind: TradeGoodKind
  /** Number of seasons this production takes. */
  seasons: number
  /** Population units committed (matches construction — currently informational). */
  population: number
  /** Sale price per unit of finished good (book §8). */
  salePrice: number
  /** Generic resource cost (e.g., iron 5 for Weapons & Armor). */
  resourceCost?: { resource: ResourceKey; amount: number }
  /** "Mineral worth N gp" requirement (Exotic / Magic Items). Player picks the mineral. */
  mineralValueGp?: number
  /**
   * Prerequisites that must hold for this recipe to be available. Each
   * predicate is checked against the realm state at start time.
   */
  requires: ((state: RealmState) => string | null)[]
}

const requiresCraftsmensGuild = (state: RealmState): string | null =>
  state.strongholds.some((s) => s.kind === 'craftsmens_guild')
    ? null
    : "Requires a Craftsmen's Guild somewhere in the realm."

const requiresWizardsAcademyOrElves = (state: RealmState): string | null => {
  const hasAcademy = state.strongholds.some((s) => s.kind === 'wizards_academy')
  if (hasAcademy) return null
  const hasElves = state.populations.some((p) => p.race === 'elves' && p.count > 0)
  if (hasElves) return null
  return "Requires a Wizards' Academy or any elf population unit."
}

/**
 * Per the strongholds table (rules-digest.md section 2): "Craftsmen's
 * Guild ... Town can produce weapons/armor, wooden goods, exotic items."
 * That coverage isn't repeated in the section 8 trade-goods table, but
 * the strongholds table is authoritative, so weapons/armor, wooden
 * goods, AND exotic items all require a Craftsmen's Guild somewhere in
 * the realm. Magic items have their own prereq (Wizards' Academy or any
 * elf population — elves are described elsewhere in the book as able to
 * craft magic items independently of a guild).
 */
export const TRADE_GOOD_RECIPES: Record<TradeGoodKind, TradeGoodRecipe> = {
  exotic_items: {
    kind: 'exotic_items',
    seasons: 1,
    population: 1,
    salePrice: 2,
    mineralValueGp: 1,
    requires: [requiresCraftsmensGuild],
  },
  magic_items: {
    kind: 'magic_items',
    seasons: 4,
    population: 1,
    salePrice: 6,
    mineralValueGp: 4,
    requires: [requiresWizardsAcademyOrElves],
  },
  weapons_and_armor: {
    kind: 'weapons_and_armor',
    seasons: 1,
    population: 1,
    salePrice: 1,
    resourceCost: { resource: 'iron', amount: 5 },
    requires: [requiresCraftsmensGuild],
  },
  wooden_goods: {
    kind: 'wooden_goods',
    seasons: 1,
    population: 1,
    salePrice: 1,
    resourceCost: { resource: 'lumber', amount: 10 },
    requires: [requiresCraftsmensGuild],
  },
}

/**
 * Units of `mineral` needed to satisfy a "worth N gp" requirement. Always
 * rounds UP — fractional units don't exist, so 1 gp of mithral costs 1
 * mithral (2 gp value, more than enough).
 */
export function mineralUnitsForGpValue(
  mineral: MineralResource,
  targetGpValue: number,
): number {
  const gpPerUnit = MINERAL_GP_PER_UNIT[mineral]
  return Math.ceil(targetGpValue / gpPerUnit)
}

// ============================================================
// Capacity
// ============================================================

/** Goods/season capacity by stronghold tier. Per digest §6.4 / §8. */
export const STRONGHOLD_PRODUCTION_CAPACITY: Partial<
  Record<import('../../types/rules').StrongholdKind, number>
> = {
  village: 1,
  town: 4,
  city: 8,
}

/**
 * Returns the number of trade-good productions a given stronghold can run
 * at once. Add-ons (wall, marketplace, etc.) have no capacity. Returns 0
 * for non-producing strongholds.
 */
export function strongholdProductionCapacity(strongholdId: string, state: RealmState): number {
  const s = state.strongholds.find((x) => x.id === strongholdId)
  if (!s) return 0
  return STRONGHOLD_PRODUCTION_CAPACITY[s.kind] ?? 0
}

/** Counts in-flight Produce Trade Goods OngoingActions targeting `strongholdId`. */
export function inFlightProductions(strongholdId: string, state: RealmState): number {
  return state.ongoingActions.filter(
    (oa) =>
      oa.actionId === 'produce_trade_goods' &&
      (oa.parameters as { strongholdId?: string }).strongholdId === strongholdId,
  ).length
}

/** Available production slots = capacity − in-flight. */
export function availableProductionSlots(strongholdId: string, state: RealmState): number {
  return Math.max(
    0,
    strongholdProductionCapacity(strongholdId, state) - inFlightProductions(strongholdId, state),
  )
}

// ============================================================
// Start Produce Trade Goods
// ============================================================

export interface ProduceTradeGoodsParams {
  kind: TradeGoodKind
  strongholdId: string
  /** Required when the recipe specifies `mineralValueGp`. */
  mineral?: MineralResource
  /**
   * Optional per-race workforce mix. When omitted, the production crew is
   * auto-picked from the idle pool. When provided, the sum must equal the
   * recipe's `population` cost exactly or this throws.
   */
  raceMix?: Partial<Record<Race, number>>
}

interface TradeGoodOutcome {
  state: RealmState
  events: TurnEvent[]
}

export function startProduceTradeGoods(
  state: RealmState,
  params: ProduceTradeGoodsParams,
  uuid: () => string = () => crypto.randomUUID(),
): TradeGoodOutcome {
  const recipe = TRADE_GOOD_RECIPES[params.kind]
  if (!recipe) {
    throw new ConstructionError(`Unknown trade good: ${params.kind}.`)
  }

  // Stronghold + capacity
  const s = state.strongholds.find((x) => x.id === params.strongholdId)
  if (!s) {
    throw new ConstructionError(`No stronghold with id ${params.strongholdId}.`)
  }
  const capacity = strongholdProductionCapacity(params.strongholdId, state)
  if (capacity === 0) {
    throw new ConstructionError(
      `${s.kind} cannot produce trade goods. Use a Village (1/season), Town (4) or City (8).`,
    )
  }
  if (availableProductionSlots(params.strongholdId, state) <= 0) {
    throw new ConstructionError(
      `No free production slots at this ${s.kind} (${capacity} max, all in use).`,
    )
  }

  // Recipe prerequisites
  for (const req of recipe.requires) {
    const err = req(state)
    if (err) throw new ConstructionError(err)
  }

  // Resource cost
  let next = state
  let mineralUsed: { mineral: MineralResource; amount: number } | undefined
  if (recipe.resourceCost) {
    const { resource, amount } = recipe.resourceCost
    if (state.resources[resource] < amount) {
      throw new ConstructionError(
        `Not enough ${resource} (need ${amount}, have ${state.resources[resource]}).`,
      )
    }
    next = {
      ...next,
      resources: {
        ...next.resources,
        [resource]: state.resources[resource] - amount,
      },
    }
  }
  if (recipe.mineralValueGp !== undefined) {
    if (!params.mineral) {
      throw new ConstructionError(
        `${TRADE_GOOD_LABEL[params.kind]} requires a mineral type to be specified.`,
      )
    }
    const need = mineralUnitsForGpValue(params.mineral, recipe.mineralValueGp)
    if (state.resources[params.mineral] < need) {
      throw new ConstructionError(
        `Not enough ${params.mineral} (need ${need} for ${recipe.mineralValueGp} gp value, have ${state.resources[params.mineral]}).`,
      )
    }
    next = {
      ...next,
      resources: {
        ...next.resources,
        [params.mineral]: state.resources[params.mineral] - need,
      },
    }
    mineralUsed = { mineral: params.mineral, amount: need }
  }

  // Borrow workers from idle pool. Throws if insufficient — production
  // crews aren't free. Honour a player-specified race mix when given.
  let committed: CommittedPopChunk[]
  if (params.raceMix) {
    let mixTotal = 0
    const normalised: Partial<Record<Race, number>> = {}
    for (const [race, n] of Object.entries(params.raceMix) as [Race, number | undefined][]) {
      if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue
      const v = Math.floor(n)
      normalised[race] = v
      mixTotal += v
    }
    if (mixTotal === 0) {
      const r = commitIdlePopulation(next, recipe.population)
      next = r.state; committed = r.committed
    } else {
      if (mixTotal !== recipe.population) {
        throw new ConstructionError(
          `Workforce mix totals ${mixTotal} but ${TRADE_GOOD_LABEL[params.kind]} needs exactly ${recipe.population}.`,
        )
      }
      const r = commitIdlePopulationByRace(next, normalised)
      next = r.state; committed = r.committed
    }
  } else {
    const r = commitIdlePopulation(next, recipe.population)
    next = r.state; committed = r.committed
  }

  // Queue OngoingAction
  const ongoing: OngoingAction = {
    id: uuid(),
    actionId: 'produce_trade_goods' as ActionId,
    startedYear: state.year,
    startedSeason: state.season,
    seasonsRemaining: recipe.seasons,
    parameters: {
      kind: params.kind,
      strongholdId: params.strongholdId,
      mineralUsed: mineralUsed ?? null,
      popCommitted: committed,
    },
    paidCost: {
      ...(recipe.resourceCost
        ? { [recipe.resourceCost.resource]: recipe.resourceCost.amount }
        : {}),
      population: recipe.population,
      seasons: recipe.seasons,
    },
  }

  return {
    state: { ...next, ongoingActions: [...next.ongoingActions, ongoing] },
    events: [
      {
        type: 'trade_goods_started',
        payload: {
          kind: params.kind,
          strongholdId: params.strongholdId,
          strongholdKind: s.kind,
          areaId: s.areaId,
          seasons: recipe.seasons,
          mineralUsed: mineralUsed ?? null,
          resourceCost: recipe.resourceCost ?? null,
        },
      },
    ],
  }
}

// ============================================================
// Completion
// ============================================================

interface ProduceOngoingParams {
  kind: TradeGoodKind
  strongholdId: string
  mineralUsed: { mineral: MineralResource; amount: number } | null
}

export function applyCompletedProduceTradeGoods(
  state: RealmState,
  ongoing: OngoingAction,
): TradeGoodOutcome {
  const { kind, strongholdId } = ongoing.parameters as unknown as ProduceOngoingParams
  const popCommitted = (ongoing.parameters.popCommitted as CommittedPopChunk[]) ?? []
  const s = state.strongholds.find((x) => x.id === strongholdId)
  const withGood: RealmState = {
    ...state,
    tradeGoods: {
      ...state.tradeGoods,
      [kind]: state.tradeGoods[kind] + 1,
    },
  }
  // Craftsmen go home (idle) — production doesn't consume them.
  const final = returnCommittedPopulation(withGood, popCommitted)
  return {
    state: final,
    events: [
      {
        type: 'trade_goods_complete',
        payload: {
          kind,
          strongholdId,
          strongholdKind: s?.kind ?? null,
          areaId: s?.areaId ?? null,
          popReturned: popCommitted.reduce((s2, c) => s2 + c.count, 0),
        },
      },
    ],
  }
}

/**
 * Dispatch hook for the orchestrator (mirrors applyCompletedTrade in
 * economy.ts and applyCompletedMilitary in military.ts).
 */
export function applyCompletedTradeGoods(
  state: RealmState,
  ongoing: OngoingAction,
): TradeGoodOutcome | null {
  if ((ongoing.actionId as ActionId) === 'produce_trade_goods') {
    return applyCompletedProduceTradeGoods(state, ongoing)
  }
  return null
}

// ============================================================
// Sell Trade Goods (3g.6) — instant
// ============================================================

export interface SellTradeGoodsParams {
  kind: TradeGoodKind
  quantity: number
}

/**
 * Convert finished trade goods into gold at the book sale price. Instant
 * (no OngoingAction) — unlike Sell Goods (raw resources), trade goods
 * are already finished products with a fixed market value, so the
 * Treasurer doesn't need to negotiate a delayed shipment.
 *
 * Requires a trade route (Port or any road) to reach buyers.
 */
export function executeSellTradeGoods(
  state: RealmState,
  params: SellTradeGoodsParams,
): TradeGoodOutcome {
  const recipe = TRADE_GOOD_RECIPES[params.kind]
  if (!recipe) {
    throw new ConstructionError(`Unknown trade good: ${params.kind}.`)
  }
  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    throw new ConstructionError(
      `Quantity must be a positive integer (got ${params.quantity}).`,
    )
  }
  if (state.tradeGoods[params.kind] < params.quantity) {
    throw new ConstructionError(
      `Not enough ${TRADE_GOOD_LABEL[params.kind]} (have ${state.tradeGoods[params.kind]}, want ${params.quantity}).`,
    )
  }
  if (!hasTradeRoute(state)) {
    throw new ConstructionError(
      'No trade route. Build a Port or any road segment to reach buyers.',
    )
  }

  const goldRevenue = params.quantity * recipe.salePrice
  return {
    state: {
      ...state,
      resources: {
        ...state.resources,
        gold: state.resources.gold + goldRevenue,
      },
      tradeGoods: {
        ...state.tradeGoods,
        [params.kind]: state.tradeGoods[params.kind] - params.quantity,
      },
    },
    events: [
      {
        type: 'trade_goods_sold',
        payload: {
          kind: params.kind,
          quantity: params.quantity,
          salePrice: recipe.salePrice,
          goldRevenue,
        },
      },
    ],
  }
}

