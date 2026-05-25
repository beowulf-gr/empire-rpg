import { describe, expect, it } from 'vitest'
import {
  applyCompletedSellGoods,
  applyCompletedTrade,
  buyGoodsCost,
  executeBuyGoods,
  hasTradeRoute,
  rollEconomicsCheck,
  RESOURCE_SELL_RATIO,
  startSellGoods,
  TradeError,
} from './economy'
import { executeRecruitMinister } from './ministers'
import { createStartingDomain } from '../createDomain'
import { createRng } from '../rng'
import type { AreaState, RealmState } from '../state'
import type { OngoingAction } from './types'

function uuids(prefix = 'id') {
  let n = 0
  return () => `${prefix}-${n++}`
}

function fresh(): RealmState {
  return createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'Vatra',
    ownerId: 'o',
    uuid: uuids('realm'),
    skipBootSpring: true,
  })
}

/**
 * Adds roads so the trade-route check passes — roads from a starter
 * stronghold's area to a 4-adjacent perimeter tile, satisfying the 3i
 * graph traversal without introducing a +2 Port bonus on economics rolls.
 *
 * This keeps existing test math (vacant Treasurer, no marketplace, no
 * port → total = d20 - 2) intact while still enabling Buy/Sell.
 */
function withRoads(state: RealmState): RealmState {
  const stronghold = state.strongholds[0]
  if (!stronghold) {
    throw new Error('withRoads expects a realm with at least one stronghold.')
  }
  const sArea = state.areas.find((a) => a.id === stronghold.areaId)!
  // Compute bounding box for perimeter detection (mirrors geography.ts).
  let minX = state.areas[0].positionX, maxX = state.areas[0].positionX
  let minY = state.areas[0].positionY, maxY = state.areas[0].positionY
  for (const a of state.areas) {
    if (a.positionX < minX) minX = a.positionX
    if (a.positionX > maxX) maxX = a.positionX
    if (a.positionY < minY) minY = a.positionY
    if (a.positionY > maxY) maxY = a.positionY
  }
  const isPerimeter = (a: AreaState) =>
    a.positionX === minX || a.positionX === maxX ||
    a.positionY === minY || a.positionY === maxY
  // Find a perimeter tile 4-adjacent to the stronghold's area.
  const perimeterNeighbor = state.areas.find((a) => {
    if (a.id === sArea.id) return false
    const dx = Math.abs(a.positionX - sArea.positionX)
    const dy = Math.abs(a.positionY - sArea.positionY)
    return dx + dy === 1 && isPerimeter(a)
  })
  if (!perimeterNeighbor) {
    throw new Error('withRoads couldn’t find a perimeter neighbor — adjust starter realm.')
  }
  return { ...state, roadAreaIds: [perimeterNeighbor.id] }
}

/** Strip starter resources to a clean baseline, then set what we want. */
function withResources(
  state: RealmState,
  resources: Partial<RealmState['resources']>,
): RealmState {
  return {
    ...state,
    resources: {
      food: 0, lumber: 0, stone: 0, gold: 0,
      copper: 0, iron: 0, silver: 0,
      gold_metal: 0, mithral: 0, adamantine: 0,
      ...resources,
    },
  }
}

// ============================================================
// Connectivity
// ============================================================

describe('hasTradeRoute', () => {
  it('returns false for a starter realm with no port and no roads', () => {
    expect(hasTradeRoute(fresh())).toBe(false)
  })
  it('returns true with a Port stronghold (added by withRoads helper)', () => {
    expect(hasTradeRoute(withRoads(fresh()))).toBe(true)
  })
  it('returns false with isolated roads not connected to any stronghold', () => {
    const realm = fresh()
    // Road on a corner tile that no stronghold is adjacent to.
    const corner = realm.areas.find((a) => a.positionX === 4 && a.positionY === 0)!
    const seeded: RealmState = { ...realm, roadAreaIds: [corner.id] }
    expect(hasTradeRoute(seeded)).toBe(false)
  })
})

// ============================================================
// rollEconomicsCheck
// ============================================================

describe('rollEconomicsCheck', () => {
  it('takes the -2 vacancy penalty when no Treasurer is in office', () => {
    const realm = fresh()
    const out = rollEconomicsCheck(realm, createRng(1))
    expect(out.treasurerBonus).toBe(-2)
    expect(out.treasurerName).toBeNull()
  })

  it('uses Treasurer level when filled', () => {
    let realm = withResources(fresh(), { gold: 5 })
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'Coinwise', level: 6 },
      uuids('hire'),
    ).state
    const out = rollEconomicsCheck(realm, createRng(1))
    expect(out.treasurerBonus).toBe(6)
    expect(out.treasurerName).toBe('Coinwise')
  })

  it('adds +2 per Marketplace and +2 per Port (additive stacking)', () => {
    const realm = fresh()
    const seeded: RealmState = {
      ...realm,
      strongholds: [
        ...realm.strongholds,
        { id: 'm1', areaId: realm.areas[0].id, kind: 'marketplace', parentStrongholdId: null, mineResourceType: null, source: 'official' },
        { id: 'm2', areaId: realm.areas[0].id, kind: 'marketplace', parentStrongholdId: null, mineResourceType: null, source: 'official' },
        { id: 'p1', areaId: realm.areas[0].id, kind: 'port', parentStrongholdId: null, mineResourceType: null, source: 'official' },
      ],
    }
    const out = rollEconomicsCheck(seeded, createRng(1))
    // 2 marketplaces × 2 = 4, 1 port × 2 = 2
    expect(out.marketplaceBonus).toBe(4)
    expect(out.portBonus).toBe(2)
  })

  it('flags critFail on natural 1', () => {
    // Need a deterministic d20=1. Easiest: handcraft an Rng stub.
    const stubRng = {
      next: () => 0,
      dN: (_n: number) => 1,
      d20: () => 1,
      d100: () => 1,
      d10: () => 1,
      d6: () => 1,
      d4: () => 1,
      pick: <T,>(arr: readonly T[]) => arr[0],
      rollTable: <T,>(t: readonly { min: number; max: number; value: T }[]) => t[0].value,
    }
    const out = rollEconomicsCheck(fresh(), stubRng)
    expect(out.natural).toBe(1)
    expect(out.critFail).toBe(true)
  })

  it('flags critFail when total < 10 even on a non-1 natural', () => {
    const stubRng = {
      next: () => 0,
      dN: (_n: number) => 5,
      d20: () => 5,
      d100: () => 5,
      d10: () => 5,
      d6: () => 5,
      d4: () => 5,
      pick: <T,>(arr: readonly T[]) => arr[0],
      rollTable: <T,>(t: readonly { min: number; max: number; value: T }[]) => t[0].value,
    }
    // Vacant treasurer (-2) + d20=5 → total=3 → critFail
    const out = rollEconomicsCheck(fresh(), stubRng)
    expect(out.natural).toBe(5)
    expect(out.total).toBe(3)
    expect(out.critFail).toBe(true)
  })
})

// ============================================================
// startSellGoods — validation
// ============================================================

describe('startSellGoods — validation', () => {
  const realm = withRoads(withResources(fresh(), { food: 100 }))

  it('throws on non-positive quantity', () => {
    expect(() => startSellGoods(realm, { resource: 'food', quantity: 0 }, createRng(1))).toThrow(TradeError)
    expect(() => startSellGoods(realm, { resource: 'food', quantity: -3 }, createRng(1))).toThrow(/positive integer/)
  })

  it('throws on non-integer quantity', () => {
    expect(() => startSellGoods(realm, { resource: 'food', quantity: 2.5 }, createRng(1))).toThrow(/positive integer/)
  })

  it('throws when realm lacks the resource', () => {
    const dry = withResources(realm, { food: 5 })
    expect(() => startSellGoods(dry, { resource: 'food', quantity: 10 }, createRng(1))).toThrow(/Not enough/)
  })

  it('throws when no trade route exists', () => {
    const stranded = withResources(fresh(), { food: 100 })
    expect(() => startSellGoods(stranded, { resource: 'food', quantity: 20 }, createRng(1))).toThrow(/trade route/)
  })
})

// ============================================================
// startSellGoods — outcome math
// ============================================================

describe('startSellGoods — outcome math', () => {
  // Use a stub Rng to control the d20.
  function stubRng(d20Value: number) {
    return {
      next: () => 0,
      dN: (_n: number) => d20Value,
      d20: () => d20Value,
      d100: () => 1,
      d10: () => 1,
      d6: () => 1,
      d4: () => 1,
      pick: <T,>(arr: readonly T[]) => arr[0],
      rollTable: <T,>(t: readonly { min: number; max: number; value: T }[]) => t[0].value,
    }
  }

  it('deducts the resource immediately and queues a 1-season ongoing action', () => {
    const realm = withRoads(withResources(fresh(), { food: 100 }))
    // Vacant Treasurer (-2). d20 = 22 → can't roll 22, so use treasurer = 4.
    // Actually keep it simple: vacant treasurer, d20=20 → total = 18 → no success but not crit fail.
    const { state, events } = startSellGoods(
      realm,
      { resource: 'food', quantity: 20 },
      stubRng(20),
      uuids('sell'),
    )
    expect(state.resources.food).toBe(80) // 100 - 20
    expect(state.ongoingActions).toHaveLength(1)
    expect(state.ongoingActions[0].actionId).toBe('sell_goods')
    expect(state.ongoingActions[0].seasonsRemaining).toBe(1)

    // total = 20 + (-2) = 18, margin = -2, no reduction, base ratio 20.
    // 20 food / 20 ratio = 1 gp.
    expect(state.ongoingActions[0].parameters).toMatchObject({
      resource: 'food',
      quantity: 20,
      effectiveRatio: 20,
      goldRevenue: 1,
    })
    expect(events[0].type).toBe('sell_goods_pending')
  })

  it('on success (total = DC) reduces ratio by 1', () => {
    let realm = withRoads(withResources(fresh(), { food: 100, gold: 5 }))
    // Treasurer level 5 → roll d20=17 → total = 17 + 5 = 22, margin = 2, reduction = 1.
    // Ratio: 20 - 1 = 19. 100 / 19 = 5 gp.
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 5 },
      uuids('hire'),
    ).state
    const { state } = startSellGoods(
      realm,
      { resource: 'food', quantity: 100 },
      stubRng(17),
      uuids('sell'),
    )
    const oa = state.ongoingActions[0]
    expect(oa.parameters).toMatchObject({
      effectiveRatio: 19,
      goldRevenue: Math.floor(100 / 19), // 5
    })
  })

  it('on success +20 (margin >= 20) reduces ratio by 3', () => {
    // Treasurer level 20 costs 7 gp to recruit; fund the realm first.
    let realm = withRoads(withResources(fresh(), { food: 200, gold: 10 }))
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 20 },
      uuids('hire'),
    ).state
    // Treasurer level 20 + d20=20 → total = 40, margin = 20, reduction = 1 + 2 = 3.
    const { state } = startSellGoods(
      realm,
      { resource: 'food', quantity: 200 },
      stubRng(20),
      uuids('sell'),
    )
    const oa = state.ongoingActions[0]
    expect(oa.parameters).toMatchObject({
      effectiveRatio: 17, // 20 - 3
      goldRevenue: Math.floor(200 / 17), // 11
    })
  })

  it('floors ratio at 1', () => {
    let realm = withRoads(withResources(fresh(), { gold_metal: 5, gold: 10 }))
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 20 },
      uuids('hire'),
    ).state
    // Treasurer 20 + d20=20 = 40 → margin=20 → reduction=3.
    // gold_metal base ratio 1. 1 - 3 = -2 → floor to 1.
    const { state } = startSellGoods(
      realm,
      { resource: 'gold_metal', quantity: 5 },
      stubRng(20),
      uuids('sell'),
    )
    const oa = state.ongoingActions[0]
    expect(oa.parameters).toMatchObject({
      effectiveRatio: 1,
      goldRevenue: 5,
    })
  })

  it('crit fail bumps ratio by 1d4 (here d4=1 by stub)', () => {
    const realm = withRoads(withResources(fresh(), { food: 100 }))
    // Vacant treasurer (-2) + d20=1 → critFail. d4=1 stub bumps ratio by 1.
    // Ratio: 20 + 1 = 21. 100 / 21 = 4.
    const { state, events } = startSellGoods(
      realm,
      { resource: 'food', quantity: 100 },
      stubRng(1),
      uuids('sell'),
    )
    const oa = state.ongoingActions[0]
    expect(oa.parameters).toMatchObject({
      effectiveRatio: 21,
      goldRevenue: 4,
    })
    const payload = events[0].payload as { check: { critFail: boolean; critFailPenalty: number } }
    expect(payload.check.critFail).toBe(true)
    expect(payload.check.critFailPenalty).toBe(1)
  })

  it('banker conspiracy doubles the final ratio when a loan is in default', () => {
    let realm = withRoads(withResources(fresh(), { food: 200 }))
    // Inject a loan with 4 missed seasons → conspiracy active
    realm = {
      ...realm,
      loans: [
        {
          id: 'l1',
          principal: 50,
          startedYear: 1,
          startedSeason: 'spring',
          missedInterestSeasons: 4,
        },
      ],
    }
    // Vacant Treasurer (-2) + d20=20 = 18 → no success bonus.
    // Base ratio 20 → after winter penalty 0 (spring) → 20. Conspiracy doubles → 40.
    // 200 food / 40 = 5 gp.
    const { state } = startSellGoods(
      realm,
      { resource: 'food', quantity: 200 },
      stubRng(20),
      uuids('sell'),
    )
    expect(state.ongoingActions[0].parameters).toMatchObject({
      effectiveRatio: 40,
      goldRevenue: 5,
    })
  })

  it('winter adds +2 to the ratio', () => {
    const realm: RealmState = {
      ...withRoads(withResources(fresh(), { food: 100 })),
      season: 'winter',
    }
    // Vacant treasurer (-2) + d20=20 → total=18, no success. Base ratio 20 + winter 2 = 22.
    const { state } = startSellGoods(
      realm,
      { resource: 'food', quantity: 100 },
      stubRng(20),
      uuids('sell'),
    )
    expect(state.ongoingActions[0].parameters).toMatchObject({
      effectiveRatio: 22,
      goldRevenue: Math.floor(100 / 22), // 4
    })
  })
})

// ============================================================
// applyCompletedSellGoods + dispatch
// ============================================================

describe('applyCompletedSellGoods', () => {
  it('adds the agreed gold to the treasury', () => {
    const realm = withResources(fresh(), { gold: 0 })
    const ongoing: OngoingAction = {
      id: 'sell-1',
      actionId: 'sell_goods',
      startedYear: 1,
      startedSeason: 'spring',
      seasonsRemaining: 0,
      parameters: { resource: 'food', quantity: 20, effectiveRatio: 20, goldRevenue: 1 },
    }
    const { state, events } = applyCompletedSellGoods(realm, ongoing)
    expect(state.resources.gold).toBe(1)
    expect(events[0].type).toBe('sell_goods_complete')
    expect(events[0].payload).toMatchObject({
      resource: 'food',
      quantity: 20,
      effectiveRatio: 20,
      goldRevenue: 1,
    })
  })
})

describe('applyCompletedTrade dispatch', () => {
  it('returns null for non-trade actions', () => {
    const realm = fresh()
    const ongoing: OngoingAction = {
      id: 'oa',
      actionId: 'build_roads',
      startedYear: 1,
      startedSeason: 'spring',
      seasonsRemaining: 0,
      parameters: { areaIds: [] },
    }
    expect(applyCompletedTrade(realm, ongoing)).toBeNull()
  })
})

// ============================================================
// Integration — end-to-end through endSeason
// ============================================================

describe('Sell Goods end-to-end', () => {
  it('gold arrives at the start of the next season', async () => {
    const { endSeason } = await import('./orchestrator')
    let realm = withRoads(withResources(fresh(), { food: 100 }))
    // Vacant Treasurer, d20 deterministic via real RNG (seed)
    const out = startSellGoods(
      realm,
      { resource: 'food', quantity: 60 },
      createRng(7),
      uuids('sell'),
    )
    realm = out.state
    expect(realm.ongoingActions).toHaveLength(1)
    const expected = (out.state.ongoingActions[0].parameters as { goldRevenue: number }).goldRevenue
    const before = realm.resources.gold

    // Advance one season — the OngoingAction should complete and pay out.
    const after = endSeason(realm, createRng(7))
    expect(after.state.ongoingActions).toHaveLength(0)
    expect(after.state.resources.gold).toBe(before + expected)
    const completionEvt = after.events.find((e) => e.type === 'sell_goods_complete')
    expect(completionEvt).toBeDefined()
  })
})

// ============================================================
// Sanity — the price table is well-formed
// ============================================================

describe('Premium minerals — Sell Goods', () => {
  it('selling 5 mithral with vacant Treasurer + d20=20 yields 5×2 = 10 gp', () => {
    const realm = withRoads(withResources(fresh(), { mithral: 10 }))
    // Vacant Treasurer (-2) + d20=20 = 18 → margin -2 → no bonus, base gp/unit 2.
    const { state } = startSellGoods(
      realm,
      { resource: 'mithral', quantity: 5 },
      stubRng(20),
      uuids('sell'),
    )
    const oa = state.ongoingActions[0]
    expect(oa.parameters).toMatchObject({
      effectiveRatio: 2,
      goldRevenue: 10,
    })
  })

  it('selling adamantine with a level-20 Treasurer pushes gp/unit higher', () => {
    let realm = withRoads(withResources(fresh(), { adamantine: 5, gold: 10 }))
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 20 },
      uuids('hire'),
    ).state
    // Treasurer +20 + d20=20 = 40, margin = 20 → +3 gp/unit. Base 3 + 3 = 6 gp/unit.
    const { state } = startSellGoods(
      realm,
      { resource: 'adamantine', quantity: 5 },
      stubRng(20),
      uuids('sell'),
    )
    const oa = state.ongoingActions[0]
    expect(oa.parameters).toMatchObject({
      effectiveRatio: 6,
      goldRevenue: 30, // 5 × 6
    })
  })

  it('selling mithral with crit-fail loses gp/unit (floor 1)', () => {
    const realm = withRoads(withResources(fresh(), { mithral: 5 }))
    // Vacant Treasurer (-2) + d20=1 → critFail. d4=1 stub → -1 gp/unit. Base 2 - 1 = 1 (floor).
    const { state } = startSellGoods(
      realm,
      { resource: 'mithral', quantity: 5 },
      stubRng(1),
      uuids('sell'),
    )
    const oa = state.ongoingActions[0]
    expect(oa.parameters).toMatchObject({
      effectiveRatio: 1,
      goldRevenue: 5,
    })
  })
})

describe('Premium minerals — Buy Goods', () => {
  it('cost = quantity × gp/unit (no rounding artifact)', () => {
    expect(buyGoodsCost('mithral', 1)).toBe(2)
    expect(buyGoodsCost('mithral', 3)).toBe(6)
    expect(buyGoodsCost('adamantine', 4)).toBe(12)
  })

  it('happy-path buy: 2 mithral for 4 gp', () => {
    const realm = withRoads(withResources(fresh(), { gold: 10 }))
    // Vacant Treasurer + d20=12 = 10 → margin 0 → success. No bonus.
    const { state, events } = executeBuyGoods(
      realm,
      { resource: 'mithral', quantity: 2 },
      stubRng(12),
    )
    expect(state.resources.mithral).toBe(2)
    expect(state.resources.gold).toBe(6) // 10 - 4
    expect(events[0].type).toBe('buy_goods')
  })
})

describe('RESOURCE_SELL_RATIO', () => {
  it('all entries are positive integers', () => {
    for (const v of Object.values(RESOURCE_SELL_RATIO)) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThan(0)
    }
  })
  it('matches the digest §3 conversion table', () => {
    expect(RESOURCE_SELL_RATIO.food).toBe(20)
    expect(RESOURCE_SELL_RATIO.lumber).toBe(15)
    expect(RESOURCE_SELL_RATIO.stone).toBe(12)
    expect(RESOURCE_SELL_RATIO.copper).toBe(10)
    expect(RESOURCE_SELL_RATIO.iron).toBe(10)
    expect(RESOURCE_SELL_RATIO.silver).toBe(5)
    expect(RESOURCE_SELL_RATIO.gold_metal).toBe(1)
  })
})

// ============================================================
// Buy Goods (3e.2)
// ============================================================

describe('buyGoodsCost', () => {
  it('rounds the gp cost up — 30 food at 20-per-gp = 2 gp', () => {
    expect(buyGoodsCost('food', 30)).toBe(2)
  })
  it('partial unit still costs 1 gp', () => {
    expect(buyGoodsCost('food', 1)).toBe(1)
  })
  it('exact ratio returns whole gp', () => {
    expect(buyGoodsCost('food', 40)).toBe(2)
    expect(buyGoodsCost('lumber', 15)).toBe(1)
    expect(buyGoodsCost('lumber', 30)).toBe(2)
  })
})

function stubRng(d20Value: number) {
  return {
    next: () => 0,
    dN: (_n: number) => d20Value,
    d20: () => d20Value,
    d100: () => 1,
    d10: () => 1,
    d6: () => 1,
    d4: () => 1,
    pick: <T,>(arr: readonly T[]) => arr[0],
    rollTable: <T,>(t: readonly { min: number; max: number; value: T }[]) => t[0].value,
  }
}

describe('executeBuyGoods — validation', () => {
  const realm = withRoads(withResources(fresh(), { gold: 10 }))

  it('throws on non-positive quantity', () => {
    expect(() => executeBuyGoods(realm, { resource: 'food', quantity: 0 }, createRng(1)))
      .toThrow(/positive integer/)
  })

  it('throws on non-integer quantity', () => {
    expect(() => executeBuyGoods(realm, { resource: 'food', quantity: 1.5 }, createRng(1)))
      .toThrow(/positive integer/)
  })

  it('throws when realm lacks gold', () => {
    const broke = withRoads(withResources(fresh(), { gold: 0 }))
    // 30 food = 2 gp; broke realm has 0 gp.
    expect(() => executeBuyGoods(broke, { resource: 'food', quantity: 30 }, createRng(1)))
      .toThrow(/Not enough gold/)
  })

  it('throws when no trade route exists', () => {
    const stranded = withResources(fresh(), { gold: 10 })
    expect(() => executeBuyGoods(stranded, { resource: 'food', quantity: 20 }, createRng(1)))
      .toThrow(/trade route/)
  })
})

describe('executeBuyGoods — outcomes', () => {
  it('success at exactly DC: pay gp, gain quantity, no bonus', () => {
    // Vacant Treasurer (-2) + d20 = 12 → total = 10 (= DC), margin 0, bonus 0.
    // Cost: 30 food = 2 gp.
    const realm = withRoads(withResources(fresh(), { gold: 10 }))
    const { state, events } = executeBuyGoods(
      realm,
      { resource: 'food', quantity: 30 },
      stubRng(12),
    )
    expect(state.resources.gold).toBe(8) // 10 - 2
    expect(state.resources.food).toBe(30)
    expect(events[0].type).toBe('buy_goods')
    expect(events[0].payload).toMatchObject({
      delivered: 30,
      bonus: 0,
      cost: 2,
      margin: 0,
    })
  })

  it('beat by 10+ → +1 free unit at the same price', () => {
    // Vacant Treasurer (-2) + d20 = 22? Can't roll 22, max is 20 + (-2) = 18.
    // Need a Treasurer to push the total higher. Treasurer level 5, d20=20 → 23, margin=13, bonus +1.
    let realm = withRoads(withResources(fresh(), { gold: 10 }))
    realm = (
      // executeRecruitMinister doesn't take an Rng — costs 2 gp for level 5.
      executeRecruitMinister(
        realm,
        { role: 'treasurer', name: 'T', level: 5 },
        uuids('hire'),
      )
    ).state
    // After hire: gold = 10 - 2 = 8.
    const { state, events } = executeBuyGoods(
      realm,
      { resource: 'food', quantity: 20 }, // cost 1 gp
      stubRng(20),
    )
    // 20 + 5 = 25, margin = 15, bonus = 1.
    expect(state.resources.food).toBe(21) // 20 paid for + 1 free
    expect(state.resources.gold).toBe(7) // 8 - 1
    expect(events[0].payload).toMatchObject({
      delivered: 21,
      bonus: 1,
      cost: 1,
      margin: 15,
    })
  })

  it('crit fail (nat 1) → gouged: goods delivered with +1d4 markup', () => {
    let realm = withRoads(withResources(fresh(), { gold: 10 }))
    // Recruit huge Treasurer to push the total above DC normally
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 18 },
      uuids('hire'),
    ).state
    // After hire: gold = 10 - 6 = 4.
    // Nat 1 → critFail. d4=1 stub. Base cost = 1 gp (20 food / 20 ratio).
    // Total cost = 1 + 1 = 2 gp.
    const { state, events } = executeBuyGoods(
      realm,
      { resource: 'food', quantity: 20 },
      stubRng(1),
    )
    expect(state.resources.food).toBe(20) // delivered despite crit-fail
    expect(state.resources.gold).toBe(2) // 4 - 2 (base 1 + markup 1)
    expect(events[0].type).toBe('buy_goods_gouged')
    expect(events[0].payload).toMatchObject({
      delivered: 20,
      cost: 1,
      critFailMarkup: 1,
      totalCost: 2,
    })
  })

  it('crit fail with insufficient gold for markup → deal falls through', () => {
    // No Treasurer (-2). d20=1 → critFail, d4=1 markup. Base cost = 1 gp.
    // Total needed = 2 gp. Realm has only 1 gp → can't pay markup.
    const realm = withRoads(withResources(fresh(), { gold: 1 }))
    const { state, events } = executeBuyGoods(
      realm,
      { resource: 'food', quantity: 20 },
      stubRng(1),
    )
    // No transaction
    expect(state).toBe(realm)
    expect(events[0].type).toBe('buy_goods_failed')
    const payload = events[0].payload as { reason: string; critFailMarkup: number }
    expect(payload.reason).toBe('crit_fail_cannot_pay_markup')
    expect(payload.critFailMarkup).toBe(1)
  })

  it('plain failure (missed DC, no crit fail) → no purchase', () => {
    // d20=8, vacant Treasurer (-2). Total = 6. DC = 10. critFail because total < 10.
    // To get a non-critFail miss we need total >= 10 but margin < 0 — impossible.
    // Force a non-critFail miss by raising the bonus: Treasurer +5 gives total 13 = pass.
    // So we need DC raised. Use winter (DC 15). Treasurer +5 + d20=8 = 13. critFail false.
    // Margin = -2 → plain failure path.
    let realm = withRoads(withResources(fresh(), { gold: 10 }))
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 5 },
      uuids('hire'),
    ).state
    realm = { ...realm, season: 'winter' }
    const { state, events } = executeBuyGoods(
      realm,
      { resource: 'food', quantity: 20 },
      stubRng(8),
    )
    expect(events[0].type).toBe('buy_goods_failed')
    const payload = events[0].payload as { check: { critFail: boolean } }
    expect(payload.check.critFail).toBe(false)
    // Gold unchanged (only recruit cost was deducted before buy attempt)
    expect(state.resources.gold).toBe(8) // 10 - 2 from recruit
  })

  it('winter raises DC by +5 (success at DC 10 fails in winter)', () => {
    const realm: RealmState = {
      ...withRoads(withResources(fresh(), { gold: 10 })),
      season: 'winter',
    }
    // Vacant Treasurer (-2) + d20 = 12 → total = 10. DC is 15 in winter → fail.
    const { state, events } = executeBuyGoods(
      realm,
      { resource: 'food', quantity: 20 },
      stubRng(12),
    )
    expect(state).toBe(realm)
    expect(events[0].type).toBe('buy_goods_failed')
    const p = events[0].payload as { dc: number }
    expect(p.dc).toBe(15)
  })

  it('marketplace + port bonuses count toward the DC check', () => {
    const realm = fresh()
    // Add roads + 1 marketplace (+2) + 1 port (+2). With vacant Treasurer (-2) + d20=8,
    // total = 8 + (-2) + 2 + 2 = 10 → meets DC 10 → success.
    const seeded: RealmState = {
      ...withResources(realm, { gold: 10 }),
      roadAreaIds: [realm.areas[0].id],
      strongholds: [
        ...realm.strongholds,
        { id: 'mp', areaId: realm.areas[0].id, kind: 'marketplace', parentStrongholdId: null, mineResourceType: null, source: 'official' },
        { id: 'pt', areaId: realm.areas[1].id, kind: 'port', parentStrongholdId: null, mineResourceType: null, source: 'official' },
      ],
    }
    const { state, events } = executeBuyGoods(
      seeded,
      { resource: 'food', quantity: 20 },
      stubRng(8),
    )
    expect(state.resources.food).toBe(20)
    expect(events[0].type).toBe('buy_goods')
  })
})
