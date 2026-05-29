import { describe, expect, it } from 'vitest'
import {
  executeBuyFromTravelingMerchant,
  executeSellToTravelingMerchant,
  TravelingMerchantError,
  MERCHANT_BUY_UNITS_PER_GOLD,
  MERCHANT_SELL_UNITS_PER_GOLD,
  MERCHANT_TRADE_GOOD_UNITS_PER_GOLD,
} from './travelingMerchant'
import { createStartingDomain } from '../createDomain'
import { EMPTY_TRADE_GOODS } from './tradeGoods'
import type { RealmState } from '../state'
import type { Season } from '../../types/rules'

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

function inSeason(state: RealmState, season: Season): RealmState {
  return { ...state, season }
}

// ============================================================
// Buy — rate math
// ============================================================

describe('executeBuyFromTravelingMerchant — rate table', () => {
  it('exposes the documented "half the normal Buy rate" units per gold', () => {
    expect(MERCHANT_BUY_UNITS_PER_GOLD).toEqual({
      food: 10,
      lumber: 7,
      stone: 6,
      copper: 5,
      iron: 5,
    })
  })

  it.each([
    ['food', 10],
    ['lumber', 7],
    ['stone', 6],
    ['copper', 5],
    ['iron', 5],
  ] as const)('1 gold buys %d units of %s', (resource, expected) => {
    const realm = withResources(inSeason(fresh(), 'spring'), { gold: 1 })
    const { state, events } = executeBuyFromTravelingMerchant(realm, { resource })
    expect(state.resources.gold).toBe(0)
    expect(state.resources[resource]).toBe(expected)
    expect(events[0].type).toBe('buy_from_traveling_merchant')
    expect(events[0].payload).toMatchObject({ resource, unitsReceived: expected, goldSpent: 1 })
  })

  it('logs the action for limited-cap tracking', () => {
    const realm = withResources(inSeason(fresh(), 'spring'), { gold: 1 })
    const { state } = executeBuyFromTravelingMerchant(realm, { resource: 'stone' })
    expect(state.actionsThisSeason.map((l) => l.actionId)).toContain(
      'buy_from_traveling_merchant',
    )
  })
})

// ============================================================
// Buy — failure modes
// ============================================================

describe('executeBuyFromTravelingMerchant — failure modes', () => {
  it('refuses to trade in winter', () => {
    const realm = withResources(inSeason(fresh(), 'winter'), { gold: 5 })
    expect(() =>
      executeBuyFromTravelingMerchant(realm, { resource: 'stone' }),
    ).toThrow(TravelingMerchantError)
    expect(() =>
      executeBuyFromTravelingMerchant(realm, { resource: 'stone' }),
    ).toThrow(/winter/)
  })

  it('throws when the treasury has less than 1 gold', () => {
    const realm = withResources(inSeason(fresh(), 'spring'), { gold: 0 })
    expect(() =>
      executeBuyFromTravelingMerchant(realm, { resource: 'stone' }),
    ).toThrow(/Not enough gold/)
  })

  it('enforces the 1-per-season cap', () => {
    let realm = withResources(inSeason(fresh(), 'spring'), { gold: 5 })
    realm = executeBuyFromTravelingMerchant(realm, { resource: 'stone' }).state
    expect(() =>
      executeBuyFromTravelingMerchant(realm, { resource: 'food' }),
    ).toThrow(/Limited.*already taken/)
  })

  it('refuses silver / gold ore / mithral / adamantine', () => {
    const realm = withResources(inSeason(fresh(), 'spring'), { gold: 5 })
    // TS would block these at compile time; the runtime guard catches
    // untyped callers (e.g. DB loads, hand-built UI events).
    for (const banned of ['silver', 'gold_metal', 'mithral', 'adamantine']) {
      expect(() =>
        executeBuyFromTravelingMerchant(realm, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resource: banned as any,
        }),
      ).toThrow(TravelingMerchantError)
    }
  })

  it('the limited cap is independent from Sell (you can do one of each per season)', () => {
    let realm = withResources(inSeason(fresh(), 'spring'), { gold: 1, food: 100 })
    realm = executeBuyFromTravelingMerchant(realm, { resource: 'stone' }).state
    // Sell should still be allowed in the same season.
    realm = executeSellToTravelingMerchant(realm, {
      kind: 'resource',
      resource: 'food',
    }).state
    expect(realm.resources.gold).toBe(1) // -1 from buy, +1 from sell
    expect(realm.actionsThisSeason.map((l) => l.actionId)).toEqual(
      expect.arrayContaining([
        'buy_from_traveling_merchant',
        'sell_to_traveling_merchant',
      ]),
    )
  })

  it('does NOT require a trade route (port or road)', () => {
    // fresh() doesn't build a port or road, so this is the "no infrastructure"
    // case the merchant action exists to handle.
    const realm = withResources(inSeason(fresh(), 'spring'), { gold: 1 })
    expect(realm.strongholds.some((s) => s.kind === 'port')).toBe(false)
    // Shouldn't throw despite lacking trade route.
    expect(() =>
      executeBuyFromTravelingMerchant(realm, { resource: 'stone' }),
    ).not.toThrow()
  })
})

// ============================================================
// Sell — rate math
// ============================================================

describe('executeSellToTravelingMerchant — resource rate table', () => {
  it('exposes the documented "double the normal Sell ratio" units per gold', () => {
    expect(MERCHANT_SELL_UNITS_PER_GOLD).toEqual({
      food: 40,
      lumber: 30,
      stone: 24,
      copper: 20,
      iron: 20,
    })
  })

  it.each([
    ['food', 40],
    ['lumber', 30],
    ['stone', 24],
    ['copper', 20],
    ['iron', 20],
  ] as const)('selling %d units of %s pays 1 gold', (resource, units) => {
    const realm = withResources(inSeason(fresh(), 'spring'), { [resource]: units })
    const { state, events } = executeSellToTravelingMerchant(realm, {
      kind: 'resource',
      resource,
    })
    expect(state.resources.gold).toBe(1)
    expect(state.resources[resource]).toBe(0)
    expect(events[0]).toMatchObject({
      type: 'sell_to_traveling_merchant',
      payload: { kind: 'resource', resource, unitsHandedOver: units, goldEarned: 1 },
    })
  })
})

describe('executeSellToTravelingMerchant — trade goods', () => {
  it('accepts Weapons & Armor at 2 units per gold', () => {
    expect(MERCHANT_TRADE_GOOD_UNITS_PER_GOLD.weapons_and_armor).toBe(2)
    const realm: RealmState = {
      ...inSeason(fresh(), 'spring'),
      tradeGoods: { ...EMPTY_TRADE_GOODS, weapons_and_armor: 5 },
    }
    const { state, events } = executeSellToTravelingMerchant(realm, {
      kind: 'trade_good',
      tradeGood: 'weapons_and_armor',
    })
    expect(state.tradeGoods.weapons_and_armor).toBe(3)
    expect(state.resources.gold).toBe(state.resources.gold) // sanity
    expect(events[0].payload).toMatchObject({
      kind: 'trade_good',
      tradeGood: 'weapons_and_armor',
      unitsHandedOver: 2,
      goldEarned: 1,
    })
  })

  it('accepts Wooden Goods at 2 units per gold', () => {
    const realm: RealmState = {
      ...inSeason(fresh(), 'spring'),
      tradeGoods: { ...EMPTY_TRADE_GOODS, wooden_goods: 3 },
    }
    const { state } = executeSellToTravelingMerchant(realm, {
      kind: 'trade_good',
      tradeGood: 'wooden_goods',
    })
    expect(state.tradeGoods.wooden_goods).toBe(1)
  })

  it('refuses Exotic Items and Magic Items', () => {
    const realm: RealmState = {
      ...inSeason(fresh(), 'spring'),
      tradeGoods: { ...EMPTY_TRADE_GOODS, exotic_items: 100, magic_items: 100 },
    }
    for (const banned of ['exotic_items', 'magic_items']) {
      expect(() =>
        executeSellToTravelingMerchant(realm, {
          kind: 'trade_good',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tradeGood: banned as any,
        }),
      ).toThrow(TravelingMerchantError)
    }
  })
})

// ============================================================
// Sell — failure modes
// ============================================================

describe('executeSellToTravelingMerchant — failure modes', () => {
  it('refuses to trade in winter', () => {
    const realm = withResources(inSeason(fresh(), 'winter'), { stone: 100 })
    expect(() =>
      executeSellToTravelingMerchant(realm, { kind: 'resource', resource: 'stone' }),
    ).toThrow(/winter/)
  })

  it('throws when you have less than the required units', () => {
    const realm = withResources(inSeason(fresh(), 'spring'), { stone: 10 }) // need 24
    expect(() =>
      executeSellToTravelingMerchant(realm, { kind: 'resource', resource: 'stone' }),
    ).toThrow(/Not enough stone/)
  })

  it('throws when trade good stock is insufficient', () => {
    const realm: RealmState = {
      ...inSeason(fresh(), 'spring'),
      tradeGoods: { ...EMPTY_TRADE_GOODS, weapons_and_armor: 1 },
    }
    expect(() =>
      executeSellToTravelingMerchant(realm, {
        kind: 'trade_good',
        tradeGood: 'weapons_and_armor',
      }),
    ).toThrow(/Not enough weapons_and_armor/)
  })

  it('enforces the 1-per-season cap', () => {
    let realm = withResources(inSeason(fresh(), 'spring'), { stone: 100 })
    realm = executeSellToTravelingMerchant(realm, {
      kind: 'resource',
      resource: 'stone',
    }).state
    expect(() =>
      executeSellToTravelingMerchant(realm, {
        kind: 'resource',
        resource: 'stone',
      }),
    ).toThrow(/Limited.*already taken/)
  })

  it('refuses banned premium / rare resources', () => {
    const realm = withResources(inSeason(fresh(), 'spring'), {
      silver: 100, gold_metal: 100, mithral: 100, adamantine: 100,
    })
    for (const banned of ['silver', 'gold_metal', 'mithral', 'adamantine']) {
      expect(() =>
        executeSellToTravelingMerchant(realm, {
          kind: 'resource',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resource: banned as any,
        }),
      ).toThrow(TravelingMerchantError)
    }
  })
})
