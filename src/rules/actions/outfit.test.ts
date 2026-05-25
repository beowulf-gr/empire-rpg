import { describe, expect, it } from 'vitest'
import {
  executeOutfitUnit,
  gearGpAdded,
  gearGpPerSupply,
  gearTier,
  isOutfitGoodKind,
  OutfitError,
  SUPPLY_PER_100GP,
  totalGearGpPerSoldier,
  unitSoldierCount,
} from './outfit'
import type { MilitaryUnit } from './military'
import { createStartingDomain } from '../createDomain'
import type { RealmState } from '../state'

function uuids(prefix = 'id') {
  let n = 0
  return () => `${prefix}-${n++}`
}

function fresh(): RealmState {
  return createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'Test',
    ownerId: 'o',
    uuid: uuids('realm'),
    skipBootSpring: true,
  })
}

function makeUnit(overrides: Partial<MilitaryUnit> = {}): MilitaryUnit {
  return {
    id: 'u-1',
    source: 'mustered',
    size: 'medium',
    level: 1,
    cr: 0.5,
    race: 'humans',
    assignedStrongholdId: null,
    equipmentGp: 100,
    magicGp: 0,
    ...overrides,
  }
}

// ============================================================
// SUPPLY_PER_100GP table sanity (matches digest §2.6)
// ============================================================

describe('SUPPLY_PER_100GP', () => {
  it('matches the book Unit Outfitting Table', () => {
    expect(SUPPLY_PER_100GP.solo).toBe(1 / 8)
    expect(SUPPLY_PER_100GP.tiny).toBe(1 / 4)
    expect(SUPPLY_PER_100GP.small).toBe(1 / 2)
    expect(SUPPLY_PER_100GP.medium).toBe(1)
    expect(SUPPLY_PER_100GP.large).toBe(2)
    expect(SUPPLY_PER_100GP.huge).toBe(4)
    expect(SUPPLY_PER_100GP.gargantuan).toBe(8)
    expect(SUPPLY_PER_100GP.colossal).toBe(16)
  })
})

describe('gearGpPerSupply', () => {
  it('Solo: 1 supply = 800 gp/soldier (8× value because 1/8 supplies = 100 gp)', () => {
    expect(gearGpPerSupply('solo')).toBe(800)
  })
  it('Medium: 1 supply = 100 gp/soldier', () => {
    expect(gearGpPerSupply('medium')).toBe(100)
  })
  it('Large: 1 supply = 50 gp/soldier (need 2 supplies for 100 gp)', () => {
    expect(gearGpPerSupply('large')).toBe(50)
  })
  it('Colossal: 1 supply = 6 gp/soldier (need 16 supplies for 100 gp; rounded)', () => {
    // 100/16 = 6.25 → rounded to 6
    expect(gearGpPerSupply('colossal')).toBe(6)
  })
})

describe('gearGpAdded', () => {
  it('scales linearly with supply count', () => {
    expect(gearGpAdded('medium', 1)).toBe(100)
    expect(gearGpAdded('medium', 4)).toBe(400)
    expect(gearGpAdded('large', 4)).toBe(200) // 4 × 50
  })
})

// ============================================================
// totalGearGpPerSoldier / gearTier
// ============================================================

describe('totalGearGpPerSoldier', () => {
  it('sums equipment + magic', () => {
    expect(totalGearGpPerSoldier(makeUnit({ equipmentGp: 100, magicGp: 50 }))).toBe(150)
  })
})

describe('gearTier', () => {
  it('< 100 = Underequipped', () => {
    expect(gearTier(makeUnit({ equipmentGp: 50, magicGp: 0 })).label).toBe('Underequipped')
  })
  it('100..249 = Standard', () => {
    expect(gearTier(makeUnit({ equipmentGp: 100, magicGp: 0 })).label).toBe('Standard')
    expect(gearTier(makeUnit({ equipmentGp: 200, magicGp: 0 })).label).toBe('Standard')
  })
  it('250..499 = Well-equipped', () => {
    expect(gearTier(makeUnit({ equipmentGp: 250, magicGp: 0 })).label).toBe('Well-equipped')
    expect(gearTier(makeUnit({ equipmentGp: 400, magicGp: 50 })).label).toBe('Well-equipped')
  })
  it('500..999 = Elite', () => {
    expect(gearTier(makeUnit({ equipmentGp: 500, magicGp: 0 })).label).toBe('Elite')
  })
  it('1000+ = Legendary', () => {
    expect(gearTier(makeUnit({ equipmentGp: 600, magicGp: 500 })).label).toBe('Legendary')
  })
})

// ============================================================
// unitSoldierCount
// ============================================================

describe('unitSoldierCount', () => {
  it('Medium-size at Barony = 150', () => {
    expect(unitSoldierCount(makeUnit({ size: 'medium' }), 'barony')).toBe(150)
  })
  it('Medium-size at Kingdom = 750 (×5)', () => {
    expect(unitSoldierCount(makeUnit({ size: 'medium' }), 'kingdom')).toBe(750)
  })
  it('Medium-size at Empire = 1500 (×10)', () => {
    expect(unitSoldierCount(makeUnit({ size: 'medium' }), 'empire')).toBe(1500)
  })
  it('Solo at Barony = 1 (a champion, not 1/8 of a unit)', () => {
    expect(unitSoldierCount(makeUnit({ size: 'solo' }), 'barony')).toBe(1)
  })
  it('Colossal at Empire = 24000', () => {
    expect(unitSoldierCount(makeUnit({ size: 'colossal' }), 'empire')).toBe(24000)
  })
})

// ============================================================
// isOutfitGoodKind
// ============================================================

describe('isOutfitGoodKind', () => {
  it('accepts weapons_and_armor and magic_items', () => {
    expect(isOutfitGoodKind('weapons_and_armor')).toBe(true)
    expect(isOutfitGoodKind('magic_items')).toBe(true)
  })
  it('rejects exotic_items and wooden_goods', () => {
    expect(isOutfitGoodKind('exotic_items')).toBe(false)
    expect(isOutfitGoodKind('wooden_goods')).toBe(false)
  })
})

// ============================================================
// executeOutfitUnit
// ============================================================

describe('executeOutfitUnit', () => {
  function withInventoryAndUnit(): RealmState {
    const realm = fresh()
    return {
      ...realm,
      militaryUnits: [makeUnit({ id: 'u-1', size: 'medium' })],
      tradeGoods: {
        exotic_items: 0,
        magic_items: 5,
        weapons_and_armor: 5,
        wooden_goods: 0,
      },
    }
  }

  it('issuing 1 W&A to a Medium unit: +100 equipmentGp, deducts 1 supply', () => {
    const realm = withInventoryAndUnit()
    const { state, events } = executeOutfitUnit(realm, {
      unitId: 'u-1',
      kind: 'weapons_and_armor',
      supplyAmount: 1,
    })
    expect(state.militaryUnits[0].equipmentGp).toBe(200) // 100 + 100
    expect(state.militaryUnits[0].magicGp).toBe(0)
    expect(state.tradeGoods.weapons_and_armor).toBe(4)
    expect(events[0].type).toBe('unit_outfitted')
    expect(events[0].payload).toMatchObject({
      kind: 'weapons_and_armor',
      supplyAmount: 1,
      gpAddedPerSoldier: 100,
      newEquipmentGp: 200,
    })
  })

  it('issuing 2 Magic Items to a Medium unit: +200 magicGp, equipmentGp unchanged', () => {
    const realm = withInventoryAndUnit()
    const { state } = executeOutfitUnit(realm, {
      unitId: 'u-1',
      kind: 'magic_items',
      supplyAmount: 2,
    })
    expect(state.militaryUnits[0].equipmentGp).toBe(100) // unchanged
    expect(state.militaryUnits[0].magicGp).toBe(200)
    expect(state.tradeGoods.magic_items).toBe(3)
  })

  it('Large unit needs 2 W&A for 100 gp/soldier (so 1 W&A = +50)', () => {
    const realm = withInventoryAndUnit()
    realm.militaryUnits[0] = makeUnit({ id: 'u-1', size: 'large' })
    const { state } = executeOutfitUnit(realm, {
      unitId: 'u-1',
      kind: 'weapons_and_armor',
      supplyAmount: 1,
    })
    expect(state.militaryUnits[0].equipmentGp).toBe(150) // 100 + 50
  })

  it('Solo unit gets 800 gp/soldier per W&A (1/8 → ×8)', () => {
    const realm = withInventoryAndUnit()
    realm.militaryUnits[0] = makeUnit({ id: 'u-1', size: 'solo' })
    const { state } = executeOutfitUnit(realm, {
      unitId: 'u-1',
      kind: 'weapons_and_armor',
      supplyAmount: 1,
    })
    expect(state.militaryUnits[0].equipmentGp).toBe(900) // 100 + 800
  })

  it('throws when supply is insufficient', () => {
    const realm = withInventoryAndUnit()
    expect(() =>
      executeOutfitUnit(realm, {
        unitId: 'u-1',
        kind: 'weapons_and_armor',
        supplyAmount: 100,
      }),
    ).toThrow(/Not enough/)
  })

  it('throws on unknown unit', () => {
    const realm = withInventoryAndUnit()
    expect(() =>
      executeOutfitUnit(realm, {
        unitId: 'nope',
        kind: 'weapons_and_armor',
        supplyAmount: 1,
      }),
    ).toThrow(OutfitError)
  })

  it('throws on non-positive supply amount', () => {
    const realm = withInventoryAndUnit()
    expect(() =>
      executeOutfitUnit(realm, {
        unitId: 'u-1',
        kind: 'weapons_and_armor',
        supplyAmount: 0,
      }),
    ).toThrow(/positive integer/)
  })

  it('does not affect other units in the realm', () => {
    const realm = withInventoryAndUnit()
    realm.militaryUnits = [
      makeUnit({ id: 'u-1', size: 'medium' }),
      makeUnit({ id: 'u-2', size: 'medium', equipmentGp: 100, magicGp: 0 }),
    ]
    const { state } = executeOutfitUnit(realm, {
      unitId: 'u-1',
      kind: 'weapons_and_armor',
      supplyAmount: 1,
    })
    expect(state.militaryUnits[0].equipmentGp).toBe(200)
    expect(state.militaryUnits[1].equipmentGp).toBe(100) // untouched
  })
})
