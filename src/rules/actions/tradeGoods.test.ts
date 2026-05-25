import { describe, expect, it } from 'vitest'
import {
  applyCompletedProduceTradeGoods,
  applyCompletedTradeGoods,
  availableProductionSlots,
  inFlightProductions,
  MINERAL_GP_PER_UNIT,
  mineralUnitsForGpValue,
  startProduceTradeGoods,
  strongholdProductionCapacity,
  TRADE_GOOD_RECIPES,
} from './tradeGoods'
import { createStartingDomain } from '../createDomain'
import type { RealmState, StrongholdState } from '../state'
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

function addStronghold(
  state: RealmState,
  kind: StrongholdState['kind'],
  areaId?: string,
): { state: RealmState; id: string } {
  const id = `s-${state.strongholds.length}`
  const s: StrongholdState = {
    id,
    areaId: areaId ?? state.areas[0].id,
    kind,
    parentStrongholdId: null,
    mineResourceType: null,
    source: 'official',
  }
  return { state: { ...state, strongholds: [...state.strongholds, s] }, id }
}

// ============================================================
// mineralUnitsForGpValue
// ============================================================

describe('mineralUnitsForGpValue', () => {
  it('1 gp of iron = 10 iron', () => {
    expect(mineralUnitsForGpValue('iron', 1)).toBe(10)
  })
  it('1 gp of silver = 5 silver', () => {
    expect(mineralUnitsForGpValue('silver', 1)).toBe(5)
  })
  it('1 gp of mithral rounds up to 1 mithral (worth 2 gp)', () => {
    expect(mineralUnitsForGpValue('mithral', 1)).toBe(1)
    expect(MINERAL_GP_PER_UNIT.mithral).toBe(2)
  })
  it('1 gp of adamantine rounds up to 1 adamantine (worth 3 gp)', () => {
    expect(mineralUnitsForGpValue('adamantine', 1)).toBe(1)
  })
  it('4 gp of mithral = 2 mithral', () => {
    expect(mineralUnitsForGpValue('mithral', 4)).toBe(2)
  })
  it('4 gp of iron = 40 iron', () => {
    expect(mineralUnitsForGpValue('iron', 4)).toBe(40)
  })
})

// ============================================================
// Capacity helpers
// ============================================================

describe('strongholdProductionCapacity', () => {
  it('Village = 1, Town = 4, City = 8, others = 0', () => {
    let realm = fresh()
    let sV: { state: RealmState; id: string }
    let sT: { state: RealmState; id: string }
    let sC: { state: RealmState; id: string }
    let sK: { state: RealmState; id: string }
    sV = addStronghold(realm, 'village')
    realm = sV.state
    sT = addStronghold(realm, 'town')
    realm = sT.state
    sC = addStronghold(realm, 'city')
    realm = sC.state
    sK = addStronghold(realm, 'keep')
    realm = sK.state

    expect(strongholdProductionCapacity(sV.id, realm)).toBe(1)
    expect(strongholdProductionCapacity(sT.id, realm)).toBe(4)
    expect(strongholdProductionCapacity(sC.id, realm)).toBe(8)
    expect(strongholdProductionCapacity(sK.id, realm)).toBe(0)
  })
})

describe('availableProductionSlots', () => {
  it('reflects in-flight productions', () => {
    let realm = withResources(fresh(), { lumber: 100 })
    const town = addStronghold(realm, 'town')
    realm = town.state
    realm = addStronghold(realm, 'craftsmens_guild').state
    expect(availableProductionSlots(town.id, realm)).toBe(4)
    realm = startProduceTradeGoods(
      realm,
      { kind: 'wooden_goods', strongholdId: town.id },
      uuids('oa'),
    ).state
    expect(inFlightProductions(town.id, realm)).toBe(1)
    expect(availableProductionSlots(town.id, realm)).toBe(3)
  })
})

// ============================================================
// startProduceTradeGoods — wooden goods (simple recipe)
// ============================================================

describe('startProduceTradeGoods — wooden goods', () => {
  it('queues a 1-season ongoing action and deducts 10 lumber', () => {
    let realm = withResources(fresh(), { lumber: 30 })
    const village = addStronghold(realm, 'village')
    realm = village.state
    realm = addStronghold(realm, 'craftsmens_guild').state
    const { state, events } = startProduceTradeGoods(
      realm,
      { kind: 'wooden_goods', strongholdId: village.id },
      uuids('oa'),
    )
    expect(state.resources.lumber).toBe(20)
    expect(state.ongoingActions).toHaveLength(1)
    expect(state.ongoingActions[0].actionId).toBe('produce_trade_goods')
    expect(state.ongoingActions[0].seasonsRemaining).toBe(1)
    expect(events[0].type).toBe('trade_goods_started')
  })

  it('throws when not enough lumber', () => {
    let realm = withResources(fresh(), { lumber: 5 })
    const village = addStronghold(realm, 'village')
    realm = village.state
    realm = addStronghold(realm, 'craftsmens_guild').state
    expect(() =>
      startProduceTradeGoods(realm, { kind: 'wooden_goods', strongholdId: village.id }, uuids('oa')),
    ).toThrow(/Not enough lumber/)
  })

  it('throws when capacity is exhausted', () => {
    let realm = withResources(fresh(), { lumber: 100 })
    const village = addStronghold(realm, 'village')
    realm = village.state
    realm = addStronghold(realm, 'craftsmens_guild').state
    // Village has 1 slot. Start once → 0 free.
    realm = startProduceTradeGoods(realm, { kind: 'wooden_goods', strongholdId: village.id }, uuids('oa1')).state
    expect(() =>
      startProduceTradeGoods(realm, { kind: 'wooden_goods', strongholdId: village.id }, uuids('oa2')),
    ).toThrow(/No free production slots/)
  })

  it('throws on a non-producing stronghold (e.g., Keep)', () => {
    let realm = withResources(fresh(), { lumber: 100 })
    const keep = addStronghold(realm, 'keep')
    realm = keep.state
    expect(() =>
      startProduceTradeGoods(realm, { kind: 'wooden_goods', strongholdId: keep.id }, uuids('oa')),
    ).toThrow(/cannot produce trade goods/)
  })
})

// ============================================================
// Weapons & Armor — needs Craftsmen's Guild
// ============================================================

describe('startProduceTradeGoods — weapons_and_armor', () => {
  it('throws without a Craftsmens Guild', () => {
    let realm = withResources(fresh(), { iron: 50 })
    const town = addStronghold(realm, 'town')
    realm = town.state
    expect(() =>
      startProduceTradeGoods(realm, { kind: 'weapons_and_armor', strongholdId: town.id }, uuids('oa')),
    ).toThrow(/Craftsmen/)
  })

  it('succeeds with a Craftsmens Guild — deducts 5 iron', () => {
    let realm = withResources(fresh(), { iron: 50 })
    const town = addStronghold(realm, 'town')
    realm = town.state
    const guild = addStronghold(realm, 'craftsmens_guild')
    realm = guild.state
    const { state } = startProduceTradeGoods(
      realm,
      { kind: 'weapons_and_armor', strongholdId: town.id },
      uuids('oa'),
    )
    expect(state.resources.iron).toBe(45)
    expect(state.ongoingActions).toHaveLength(1)
  })
})

// ============================================================
// Magic Items — needs academy or elves, mineral worth 4 gp
// ============================================================

describe('startProduceTradeGoods — magic_items', () => {
  it('throws without academy or elves', () => {
    let realm = withResources(fresh(), { iron: 100 })
    const town = addStronghold(realm, 'town')
    realm = town.state
    expect(() =>
      startProduceTradeGoods(
        realm,
        { kind: 'magic_items', strongholdId: town.id, mineral: 'iron' },
        uuids('oa'),
      ),
    ).toThrow(/Wizards' Academy or any elf/)
  })

  it('succeeds with a Wizards Academy and consumes 4 gp worth of iron (40 iron)', () => {
    let realm = withResources(fresh(), { iron: 100 })
    const town = addStronghold(realm, 'town')
    realm = town.state
    const academy = addStronghold(realm, 'wizards_academy')
    realm = academy.state
    const { state } = startProduceTradeGoods(
      realm,
      { kind: 'magic_items', strongholdId: town.id, mineral: 'iron' },
      uuids('oa'),
    )
    expect(state.resources.iron).toBe(60) // 100 - 40
    expect(state.ongoingActions[0].seasonsRemaining).toBe(4)
  })

  it('succeeds with elves (no academy) and 2 mithral', () => {
    let realm = withResources(fresh(), { mithral: 5 })
    const town = addStronghold(realm, 'town')
    realm = town.state
    // Add elf population
    realm = {
      ...realm,
      populations: [
        ...realm.populations,
        { id: 'elf-1', race: 'elves', count: 3, homeAreaId: realm.areas[0].id, workAreaId: null },
      ],
    }
    const { state } = startProduceTradeGoods(
      realm,
      { kind: 'magic_items', strongholdId: town.id, mineral: 'mithral' },
      uuids('oa'),
    )
    // 4 gp of mithral = ceil(4 / 2) = 2 mithral
    expect(state.resources.mithral).toBe(3)
  })

  it('throws when not enough of the chosen mineral', () => {
    let realm = withResources(fresh(), { mithral: 1 })
    const town = addStronghold(realm, 'town')
    realm = town.state
    const academy = addStronghold(realm, 'wizards_academy')
    realm = academy.state
    expect(() =>
      startProduceTradeGoods(
        realm,
        { kind: 'magic_items', strongholdId: town.id, mineral: 'mithral' },
        uuids('oa'),
      ),
    ).toThrow(/Not enough mithral/)
  })

  it('throws when mineral not specified for a recipe that needs one', () => {
    let realm = withResources(fresh(), { iron: 100 })
    const town = addStronghold(realm, 'town')
    realm = town.state
    const academy = addStronghold(realm, 'wizards_academy')
    realm = academy.state
    expect(() =>
      startProduceTradeGoods(
        realm,
        { kind: 'magic_items', strongholdId: town.id },
        uuids('oa'),
      ),
    ).toThrow(/mineral type/)
  })
})

// ============================================================
// Exotic Items — mineral worth 1 gp
// ============================================================

describe('startProduceTradeGoods — exotic_items', () => {
  it('throws without a Craftsmens Guild', () => {
    let realm = withResources(fresh(), { copper: 30 })
    const village = addStronghold(realm, 'village')
    realm = village.state
    expect(() =>
      startProduceTradeGoods(
        realm,
        { kind: 'exotic_items', strongholdId: village.id, mineral: 'copper' },
        uuids('oa'),
      ),
    ).toThrow(/Craftsmen/)
  })

  it('1 gp of copper = 10 copper', () => {
    let realm = withResources(fresh(), { copper: 30 })
    const village = addStronghold(realm, 'village')
    realm = village.state
    realm = addStronghold(realm, 'craftsmens_guild').state
    const { state } = startProduceTradeGoods(
      realm,
      { kind: 'exotic_items', strongholdId: village.id, mineral: 'copper' },
      uuids('oa'),
    )
    expect(state.resources.copper).toBe(20)
  })

  it('1 gp of mithral = 1 mithral (rounded up)', () => {
    let realm = withResources(fresh(), { mithral: 3 })
    const village = addStronghold(realm, 'village')
    realm = village.state
    realm = addStronghold(realm, 'craftsmens_guild').state
    const { state } = startProduceTradeGoods(
      realm,
      { kind: 'exotic_items', strongholdId: village.id, mineral: 'mithral' },
      uuids('oa'),
    )
    expect(state.resources.mithral).toBe(2)
  })
})

// ============================================================
// Completion
// ============================================================

describe('applyCompletedProduceTradeGoods', () => {
  it('adds 1 to the inventory of the produced kind', () => {
    let realm = withResources(fresh(), { lumber: 100 })
    const village = addStronghold(realm, 'village')
    realm = village.state
    realm = addStronghold(realm, 'craftsmens_guild').state
    realm = startProduceTradeGoods(
      realm,
      { kind: 'wooden_goods', strongholdId: village.id },
      uuids('oa'),
    ).state
    const ongoing = realm.ongoingActions[0]
    const { state, events } = applyCompletedProduceTradeGoods(realm, ongoing)
    expect(state.tradeGoods.wooden_goods).toBe(1)
    expect(events[0].type).toBe('trade_goods_complete')
  })
})

describe('applyCompletedTradeGoods dispatch', () => {
  it('returns null for non-trade-goods actions', () => {
    const realm = fresh()
    const ongoing: OngoingAction = {
      id: 'x',
      actionId: 'build_roads',
      startedYear: 1,
      startedSeason: 'spring',
      seasonsRemaining: 0,
      parameters: { areaIds: [] },
    }
    expect(applyCompletedTradeGoods(realm, ongoing)).toBeNull()
  })
})

// ============================================================
// Recipes table sanity
// ============================================================

describe('TRADE_GOOD_RECIPES', () => {
  it('matches digest §8: durations + sale prices', () => {
    expect(TRADE_GOOD_RECIPES.exotic_items.seasons).toBe(1)
    expect(TRADE_GOOD_RECIPES.exotic_items.salePrice).toBe(2)
    expect(TRADE_GOOD_RECIPES.magic_items.seasons).toBe(4)
    expect(TRADE_GOOD_RECIPES.magic_items.salePrice).toBe(6)
    expect(TRADE_GOOD_RECIPES.weapons_and_armor.seasons).toBe(1)
    expect(TRADE_GOOD_RECIPES.weapons_and_armor.salePrice).toBe(1)
    expect(TRADE_GOOD_RECIPES.wooden_goods.seasons).toBe(1)
    expect(TRADE_GOOD_RECIPES.wooden_goods.salePrice).toBe(1)
  })
})

// ============================================================
// Integration — production completes and inventory updates after one season
// ============================================================

describe('Produce Trade Goods end-to-end', () => {
  it('a 1-season production lands in the inventory after one endSeason', async () => {
    const { endSeason } = await import('./orchestrator')
    let realm = withResources(fresh(), { lumber: 100 })
    const village = addStronghold(realm, 'village')
    realm = village.state
    realm = addStronghold(realm, 'craftsmens_guild').state
    realm = startProduceTradeGoods(
      realm,
      { kind: 'wooden_goods', strongholdId: village.id },
      uuids('oa'),
    ).state
    expect(realm.ongoingActions).toHaveLength(1)
    expect(realm.tradeGoods.wooden_goods).toBe(0)

    const { state, events } = endSeason(realm, await import('../rng').then((m) => m.createRng(7)))
    expect(state.ongoingActions).toHaveLength(0)
    expect(state.tradeGoods.wooden_goods).toBe(1)
    expect(events.some((e) => e.type === 'trade_goods_complete')).toBe(true)
  })
})

// ============================================================
// executeSellTradeGoods (3g.6)
// ============================================================

describe('executeSellTradeGoods', () => {
  function withInventory(state: RealmState, inv: Partial<RealmState['tradeGoods']>): RealmState {
    return {
      ...state,
      tradeGoods: {
        exotic_items: 0,
        magic_items: 0,
        weapons_and_armor: 0,
        wooden_goods: 0,
        ...inv,
      },
    }
  }

  /**
   * Adds a Port stronghold to enable the trade-route check (post-3i graph
   * model needs an actual port or roads connecting a stronghold to the
   * realm perimeter — adding a port is the simpler test setup).
   */
  function withPort(state: RealmState): RealmState {
    return {
      ...state,
      strongholds: [
        ...state.strongholds,
        {
          id: 'test-port',
          areaId: state.areas[0].id,
          kind: 'port',
          parentStrongholdId: null,
          mineResourceType: null,
          source: 'official',
        },
      ],
    }
  }

  it('exotic_items at 2 gp/unit, 5 units = 10 gp', async () => {
    const { executeSellTradeGoods } = await import('./tradeGoods')
    const realm = withInventory(
      withPort(fresh()),
      { exotic_items: 5 },
    )
    const { state, events } = executeSellTradeGoods(realm, {
      kind: 'exotic_items',
      quantity: 5,
    })
    expect(state.tradeGoods.exotic_items).toBe(0)
    expect(state.resources.gold).toBe(realm.resources.gold + 10)
    expect(events[0].type).toBe('trade_goods_sold')
    expect(events[0].payload).toMatchObject({ goldRevenue: 10 })
  })

  it('magic_items at 6 gp/unit, partial sale', async () => {
    const { executeSellTradeGoods } = await import('./tradeGoods')
    const realm = withInventory(
      withPort(fresh()),
      { magic_items: 4 },
    )
    const { state } = executeSellTradeGoods(realm, { kind: 'magic_items', quantity: 2 })
    expect(state.tradeGoods.magic_items).toBe(2) // 4 - 2 sold
    expect(state.resources.gold).toBe(realm.resources.gold + 12) // 2 × 6
  })

  it('throws when no trade route', async () => {
    const { executeSellTradeGoods } = await import('./tradeGoods')
    const realm = withInventory(fresh(), { exotic_items: 5 })
    expect(() =>
      executeSellTradeGoods(realm, { kind: 'exotic_items', quantity: 1 }),
    ).toThrow(/trade route/)
  })

  it('throws when inventory insufficient', async () => {
    const { executeSellTradeGoods } = await import('./tradeGoods')
    const realm = withInventory(
      withPort(fresh()),
      { exotic_items: 1 },
    )
    expect(() =>
      executeSellTradeGoods(realm, { kind: 'exotic_items', quantity: 5 }),
    ).toThrow(/Not enough/)
  })

  it('throws on non-positive quantity', async () => {
    const { executeSellTradeGoods } = await import('./tradeGoods')
    const realm = withInventory(
      withPort(fresh()),
      { exotic_items: 5 },
    )
    expect(() =>
      executeSellTradeGoods(realm, { kind: 'exotic_items', quantity: 0 }),
    ).toThrow(/positive|quantity/i)
  })
})
