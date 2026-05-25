import { describe, expect, it } from 'vitest'
import {
  applyCompletedMuster,
  executeAnnualMilitaryUpkeep,
  executeHireSoldiers,
  executeLevelUpUnit,
  LevelUpUnitError,
  levelUpCost,
  mercenaryEquipmentGp,
  startMusterSoldiers,
  unitsLeveledThisSpring,
  unitUpkeep,
} from './military'
import { ConstructionError } from './construction'
import { createStartingDomain } from '../createDomain'
import { movePopulationHome } from '../assignPopulation'
import { createRng } from '../rng'
import type { RealmState } from '../state'

function uuids() {
  let n = 0
  return () => `id-${n++}`
}

function fresh(): RealmState {
  return createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'X',
    ownerId: 'o',
    uuid: uuids(),
    skipBootSpring: true,
  })
}

describe('unitUpkeep', () => {
  it('Medium-size mustered = 1 food + 1 gold (level 1)', () => {
    expect(unitUpkeep({ id: 'a', source: 'mustered', size: 'medium', level: 1, cr: 0.5, race: 'humans', assignedStrongholdId: null, equipmentGp: 100, magicGp: 0 }))
      .toEqual({ food: 1, gold: 1 })
  })
  it('Medium-size mustered level 3 = 1 food + 3 gold (+1 per level over 1)', () => {
    expect(unitUpkeep({ id: 'a', source: 'mustered', size: 'medium', level: 3, cr: 0.5, race: 'humans', assignedStrongholdId: null, equipmentGp: 100, magicGp: 0 }))
      .toEqual({ food: 1, gold: 3 })
  })
  it('Large mercenary CR 1 = 2 food + 4 gold (2×1×2)', () => {
    expect(unitUpkeep({ id: 'a', source: 'mercenary', size: 'large', level: 1, cr: 1, assignedStrongholdId: null, equipmentGp: 100, magicGp: 0 }))
      .toEqual({ food: 2, gold: 4 })
  })
})

describe('startMusterSoldiers', () => {
  it('queues an OngoingAction and removes 1 pop + costs', () => {
    const realm = fresh()
    // Place 1 human on a plains tile so we can muster from there
    const plains = realm.areas.find((a) => a.terrain === 'plains')!
    const seeded = movePopulationHome(
      realm,
      { race: 'humans', fromHomeAreaId: null, toHomeAreaId: plains.id, count: 1 },
    )
    const withFunds: RealmState = {
      ...seeded,
      resources: { ...seeded.resources, gold: 5, food: 5 },
    }
    const { state } = startMusterSoldiers(
      withFunds,
      { race: 'humans', homeAreaId: plains.id },
      1,
      'spring',
    )
    expect(state.ongoingActions).toHaveLength(1)
    expect(state.ongoingActions[0].actionId).toBe('muster_soldiers')
    expect(state.resources.gold).toBe(4) // -1 equipment
    expect(state.resources.food).toBe(4) // -1 first-year food
    // Pop on plains tile is gone (was 1, now 0; stack filtered out by movePopulationHome filter)
    const stillThere = state.populations.find(
      (p) => p.race === 'humans' && p.homeAreaId === plains.id,
    )
    expect(stillThere).toBeUndefined()
  })

  it('throws when no source population exists', () => {
    const realm = fresh()
    expect(() =>
      startMusterSoldiers(
        realm,
        { race: 'humans', homeAreaId: realm.areas[0].id },
        1,
        'spring',
      ),
    ).toThrow(ConstructionError)
  })
})

describe('applyCompletedMuster', () => {
  it('adds the unit and creates a matching loyalty group', () => {
    const realm = fresh()
    const ongoing = {
      id: 'oa',
      actionId: 'muster_soldiers' as const,
      startedYear: 1,
      startedSeason: 'spring' as const,
      seasonsRemaining: 0,
      parameters: { size: 'medium' as const, race: 'humans' as const, homeAreaId: 'whatever' },
    }
    const { state, events } = applyCompletedMuster(realm, ongoing)
    expect(state.militaryUnits).toHaveLength(1)
    const unit = state.militaryUnits[0]
    expect(unit.source).toBe('mustered')
    expect(unit.size).toBe('medium')
    expect(unit.level).toBe(1)
    // Loyalty group attached
    const loyaltyGroup = state.loyaltyGroups.find(
      (g) => g.kind === 'military' && g.attachedTo === unit.id,
    )
    expect(loyaltyGroup).toBeDefined()
    expect(events[0].type).toBe('unit_mustered')
  })
})

// Stub Rng with a fixed d20 (d4 also returns the same value, but we don't use d4 here).
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

/**
 * Helper for tests that don't care about the diplomacy mechanic — just want
 * a unit on the books. Inserts a Medium CR 1 mercenary directly with the
 * book wages cost (2 gp + 1 food) deducted, plus a matching loyalty group.
 */
function injectMedCRMerc(realm: RealmState): RealmState {
  const unitId = 'mock-merc-1'
  return {
    ...realm,
    resources: {
      ...realm.resources,
      gold: realm.resources.gold - 2,
      food: realm.resources.food - 1,
    },
    militaryUnits: [
      ...realm.militaryUnits,
      { id: unitId, source: 'mercenary', size: 'medium', level: 1, cr: 1, assignedStrongholdId: null, equipmentGp: 100, magicGp: 0 },
    ],
    loyaltyGroups: [
      ...realm.loyaltyGroups,
      { id: 'mock-lg-1', kind: 'military', label: 'Mock mercs', baseWillSave: 2, score: 0, attachedTo: unitId },
    ],
  }
}

describe('mercenaryEquipmentGp', () => {
  it('CR 1 = 200 gp/soldier', () => {
    expect(mercenaryEquipmentGp(1)).toBe(200)
  })
  it('CR ½ = 100 gp/soldier', () => {
    expect(mercenaryEquipmentGp(0.5)).toBe(100)
  })
  it('CR 5 = 1000 gp/soldier', () => {
    expect(mercenaryEquipmentGp(5)).toBe(1000)
  })
  it('CR 8 = 1500 gp/soldier (cap)', () => {
    expect(mercenaryEquipmentGp(8)).toBe(1500)
  })
  it('caps at 1500 gp for very high CR', () => {
    expect(mercenaryEquipmentGp(20)).toBe(1500)
  })
})

describe('executeHireSoldiers — equipment value', () => {
  it('hired CR 1 mercenary arrives with 200 gp equipment per soldier', () => {
    const realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 10, food: 5 },
    }
    const { state } = executeHireSoldiers(
      realm,
      { cr: 1, size: 'medium', diplomacyBribeGp: 4 },
      stubRng(20),
    )
    expect(state.militaryUnits).toHaveLength(1)
    expect(state.militaryUnits[0].equipmentGp).toBe(200)
  })

  it('hired CR 8 mercenary caps equipment at 1500 gp', () => {
    // Need maxCR ≥ 8: DC 25 + 70 = 95. With General -2 and d20=20, bribe must give +77.
    // Each gp = +2, so 39 gp bribe → +78, total = 20 - 2 + 78 = 96 → maxCR = (96-25)/10 + 1 = 8.
    const realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 1000, food: 100 },
    }
    const { state } = executeHireSoldiers(
      realm,
      { cr: 8, size: 'medium', diplomacyBribeGp: 39 },
      stubRng(20),
    )
    expect(state.militaryUnits).toHaveLength(1)
    expect(state.militaryUnits[0].equipmentGp).toBe(1500)
  })
})

describe('executeHireSoldiers', () => {
  it('hires a Medium CR 1 mercenary when the diplomacy check passes', () => {
    // To hit DC 25 (CR 1 minimum) with vacant General (-2), bribe of 4 gp gives +8.
    // d20=20: total = 20 - 2 + 8 = 26 → maxCR = 1 (just enough).
    const realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 10, food: 5 },
    }
    const { state, events } = executeHireSoldiers(
      realm,
      { cr: 1, size: 'medium', diplomacyBribeGp: 4 },
      stubRng(20),
    )
    expect(state.militaryUnits).toHaveLength(1)
    // 10 gold - 2 wages - 4 bribe = 4
    expect(state.resources.gold).toBe(4)
    expect(state.resources.food).toBe(4)
    expect(events[0].type).toBe('unit_hired')
    expect(events[0].payload).toMatchObject({
      wagesCost: 2,
      diplomacyBribeGp: 4,
      maxCR: 1,
    })
  })

  it('failed Diplomacy check loses the bribe gp but not wages', () => {
    const realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 10, food: 5 },
    }
    // Vacant General (-2) + d20=10 + 0 bribe = 8 → maxCR = 0 → CR 1 fails.
    const { state, events } = executeHireSoldiers(
      realm,
      { cr: 1, size: 'medium' },
      stubRng(10),
    )
    expect(state.militaryUnits).toHaveLength(0)
    expect(state.resources.gold).toBe(10) // wages NOT deducted
    expect(state.resources.food).toBe(5)
    expect(events[0].type).toBe('hire_soldiers_failed')
  })

  it('throws when not enough gold for wages + bribe', () => {
    const realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 0 },
    }
    expect(() =>
      executeHireSoldiers(realm, { cr: 1, size: 'medium' }, stubRng(20)),
    ).toThrow(/Not enough gold/)
  })

  it('out-of-season adds +1 gold to the hire cost', () => {
    const summerRealm: RealmState = {
      ...fresh(),
      season: 'summer',
      resources: { ...fresh().resources, gold: 10, food: 5 },
    }
    const { state, events } = executeHireSoldiers(
      summerRealm,
      { cr: 1, size: 'medium', diplomacyBribeGp: 4 },
      stubRng(20),
    )
    // wages 2 + 1 off-season + 4 bribe = 7. 10 - 7 = 3.
    expect(state.resources.gold).toBe(3)
    expect(events[0].payload).toMatchObject({
      wagesCost: 3,
      offSeasonPenalty: 1,
    })
  })

  it('spring hire has no off-season penalty', () => {
    const realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 10, food: 5 },
    }
    const { events } = executeHireSoldiers(
      realm,
      { cr: 1, size: 'medium', diplomacyBribeGp: 4 },
      stubRng(20),
    )
    expect(events[0].payload).toMatchObject({
      wagesCost: 2,
      offSeasonPenalty: 0,
    })
  })
})

describe('executeAnnualMilitaryUpkeep', () => {
  it('supports units that the realm can afford', () => {
    // Skip the diplomacy roll — directly inject a Medium CR 1 merc.
    let realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 5, food: 5 },
    }
    realm = injectMedCRMerc(realm)
    // After mock-hire: gold 3, food 4. Upkeep = 2 gold + 1 food. After: gold 1, food 3.
    const { state, events } = executeAnnualMilitaryUpkeep(realm, createRng(1))
    expect(state.militaryUnits).toHaveLength(1)
    expect(state.resources.gold).toBe(1)
    expect(state.resources.food).toBe(3)
    const evt = events.find((e) => e.type === 'military_upkeep')!
    expect(evt.payload).toMatchObject({ supported: 1, disbandedCount: 0 })
  })

  it('disbands units the realm cannot afford and removes their loyalty group', () => {
    let realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 3, food: 1 },
    }
    realm = injectMedCRMerc(realm)
    // After mock-hire: gold 1, food 0. Upkeep needs 2 gold + 1 food → can't pay.
    const { state, events } = executeAnnualMilitaryUpkeep(realm, createRng(1))
    expect(state.militaryUnits).toHaveLength(0)
    expect(state.loyaltyGroups.find((g) => g.kind === 'military' && g.label === 'Mock mercs')).toBeUndefined()
    const evt = events.find((e) => e.type === 'military_upkeep')!
    expect(evt.payload).toMatchObject({ supported: 0, disbandedCount: 1 })
  })

  it('emits a no-units event when the realm has no army', () => {
    const realm = fresh()
    const { events } = executeAnnualMilitaryUpkeep(realm, createRng(1))
    const evt = events.find((e) => e.type === 'military_upkeep')!
    expect(evt.payload).toMatchObject({ units: 0 })
  })
})

describe('Hire Soldiers Diplomacy mechanic', () => {
  it('General level adds to the Diplomacy roll', async () => {
    const { executeRecruitMinister } = await import('./ministers')
    let realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 20, food: 5 },
    }
    realm = executeRecruitMinister(
      realm,
      { role: 'general', name: 'Iron Marshal', level: 18 },
      uuids(),
    ).state
    // Recruit cost ceil(18/3) = 6 gp → 14 gold left.
    // d20=10 + General +18 + 0 bribe = 28 → maxCR = 1.
    const { state, events } = executeHireSoldiers(
      realm,
      { cr: 1, size: 'medium' },
      stubRng(10),
    )
    expect(state.militaryUnits).toHaveLength(1)
    expect(events[0].type).toBe('unit_hired')
    expect(events[0].payload).toMatchObject({
      maxCR: 1,
      check: { generalBonus: 18, generalName: 'Iron Marshal' },
    })
  })

  it('Diplomacy bribe (+2/gp) can push a vacant General over the DC', () => {
    const realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 20, food: 5 },
    }
    // Vacant General (-2). 6 gp bribe = +12. d20=15 → 15 - 2 + 12 = 25 → maxCR 1.
    const { state, events } = executeHireSoldiers(
      realm,
      { cr: 1, size: 'medium', diplomacyBribeGp: 6 },
      stubRng(15),
    )
    expect(state.militaryUnits).toHaveLength(1)
    // 20 gold - 2 wages - 6 bribe = 12
    expect(state.resources.gold).toBe(12)
    expect((events[0].payload as { check: { total: number } }).check.total).toBe(25)
  })

  it('failed Diplomacy keeps wages but loses bribe gp', () => {
    const realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 20, food: 5 },
    }
    // Vacant General (-2). 1 gp bribe = +2. d20=10 → 10 - 2 + 2 = 10 → maxCR = 0.
    // CR 1 fails. Wages NOT charged; 1 gp bribe IS lost.
    const { state, events } = executeHireSoldiers(
      realm,
      { cr: 1, size: 'medium', diplomacyBribeGp: 1 },
      stubRng(10),
    )
    expect(state.militaryUnits).toHaveLength(0)
    expect(state.resources.gold).toBe(19) // 20 - 1 bribe
    expect(events[0].type).toBe('hire_soldiers_failed')
  })

  it('CR 0.5 mercenary needs only DC 15', () => {
    const realm: RealmState = {
      ...fresh(),
      resources: { ...fresh().resources, gold: 20, food: 5 },
    }
    // Vacant General (-2). d20=17 → 17 - 2 + 0 = 15 → maxCR 0.5.
    const { state } = executeHireSoldiers(
      realm,
      { cr: 0.5, size: 'medium' },
      stubRng(17),
    )
    expect(state.militaryUnits).toHaveLength(1)
    expect(state.militaryUnits[0].cr).toBe(0.5)
  })

  it('maxMercenaryCR table is correct at thresholds', async () => {
    const { maxMercenaryCR } = await import('./military')
    expect(maxMercenaryCR(14)).toBe(0)
    expect(maxMercenaryCR(15)).toBe(0.5)
    expect(maxMercenaryCR(24)).toBe(0.5)
    expect(maxMercenaryCR(25)).toBe(1)
    expect(maxMercenaryCR(34)).toBe(1)
    expect(maxMercenaryCR(35)).toBe(2)
    expect(maxMercenaryCR(45)).toBe(3)
  })
})

// ============================================================
// executeLevelUpUnit
// ============================================================

/** Inserts a mustered Medium-size warrior unit at the given level. */
function injectMusteredUnit(realm: RealmState, level = 1, unitId = 'mock-mustered-1'): RealmState {
  return {
    ...realm,
    militaryUnits: [
      ...realm.militaryUnits,
      {
        id: unitId,
        source: 'mustered',
        size: 'medium',
        level,
        cr: 0.5,
        race: 'humans',
        assignedStrongholdId: null,
        equipmentGp: 100,
        magicGp: 0,
      },
    ],
    loyaltyGroups: [
      ...realm.loyaltyGroups,
      { id: `lg-${unitId}`, kind: 'military', label: 'Mock warriors', baseWillSave: 2, score: 0, attachedTo: unitId },
    ],
  }
}

describe('levelUpCost', () => {
  it('returns 1 + currentLevel', () => {
    expect(levelUpCost(1)).toBe(2)
    expect(levelUpCost(2)).toBe(3)
    expect(levelUpCost(5)).toBe(6)
  })
})

describe('executeLevelUpUnit — happy path', () => {
  it('raises level, deducts 1 + level gold, and logs the action', () => {
    const realm = injectMusteredUnit({ ...fresh(), resources: { ...fresh().resources, gold: 10 } }, 1)
    const { state, events } = executeLevelUpUnit(realm, { unitId: 'mock-mustered-1' })
    const unit = state.militaryUnits.find((u) => u.id === 'mock-mustered-1')!
    expect(unit.level).toBe(2)
    expect(state.resources.gold).toBe(8) // 10 - 2
    expect(events[0].type).toBe('unit_levelled_up')
    expect(events[0].payload).toMatchObject({ fromLevel: 1, toLevel: 2, cost: 2 })
    expect(state.actionsThisSeason).toHaveLength(1)
    expect(state.actionsThisSeason[0].actionId).toBe('level_up_unit')
    expect(state.actionsThisSeason[0].meta).toMatchObject({
      unitId: 'mock-mustered-1',
      fromLevel: 1,
      toLevel: 2,
      cost: 2,
    })
  })

  it('cost scales with current level (level 4 → 5 = 5 gp)', () => {
    const realm = injectMusteredUnit({ ...fresh(), resources: { ...fresh().resources, gold: 10 } }, 4)
    const { state } = executeLevelUpUnit(realm, { unitId: 'mock-mustered-1' })
    expect(state.resources.gold).toBe(5) // 10 - 5
    expect(state.militaryUnits[0].level).toBe(5)
  })

  it('updates the unit\'s loyalty-group label to reflect the new level', () => {
    const realm = injectMusteredUnit({ ...fresh(), resources: { ...fresh().resources, gold: 10 } }, 1)
    const { state } = executeLevelUpUnit(realm, { unitId: 'mock-mustered-1' })
    const group = state.loyaltyGroups.find((g) => g.attachedTo === 'mock-mustered-1')!
    expect(group.label).toMatch(/level 2/)
  })

  it('unitUpkeep reflects the new level after a level-up (+1 gp/year per level over 1st)', () => {
    const realm = injectMusteredUnit({ ...fresh(), resources: { ...fresh().resources, gold: 10 } }, 1)
    const { state } = executeLevelUpUnit(realm, { unitId: 'mock-mustered-1' })
    const unit = state.militaryUnits[0]
    expect(unitUpkeep(unit)).toEqual({ food: 1, gold: 2 }) // base 1 + (level 2 - 1) = 2
  })
})

describe('executeLevelUpUnit — error paths', () => {
  it('throws outside spring', () => {
    const realm = injectMusteredUnit({
      ...fresh(),
      season: 'fall',
      resources: { ...fresh().resources, gold: 10 },
    }, 1)
    expect(() => executeLevelUpUnit(realm, { unitId: 'mock-mustered-1' })).toThrow(LevelUpUnitError)
    expect(() => executeLevelUpUnit(realm, { unitId: 'mock-mustered-1' })).toThrow(/spring/i)
  })

  it('throws when the unit does not exist', () => {
    const realm = { ...fresh(), resources: { ...fresh().resources, gold: 10 } }
    expect(() => executeLevelUpUnit(realm, { unitId: 'no-such-unit' })).toThrow(/Unit not found/)
  })

  it('throws when the unit is a mercenary, not mustered', () => {
    let realm: RealmState = { ...fresh(), resources: { ...fresh().resources, gold: 10, food: 5 } }
    realm = injectMedCRMerc(realm)
    expect(() => executeLevelUpUnit(realm, { unitId: 'mock-merc-1' })).toThrow(/mustered/i)
  })

  it('throws when the unit has already been levelled up this spring', () => {
    let realm = injectMusteredUnit({ ...fresh(), resources: { ...fresh().resources, gold: 10 } }, 1)
    realm = executeLevelUpUnit(realm, { unitId: 'mock-mustered-1' }).state
    expect(() => executeLevelUpUnit(realm, { unitId: 'mock-mustered-1' })).toThrow(/already been levelled/)
  })

  it('throws on insufficient gold', () => {
    const realm = injectMusteredUnit({ ...fresh(), resources: { ...fresh().resources, gold: 1 } }, 1)
    expect(() => executeLevelUpUnit(realm, { unitId: 'mock-mustered-1' })).toThrow(/Not enough gold/)
  })
})

describe('unitsLeveledThisSpring', () => {
  it('returns an empty set for a fresh realm', () => {
    expect(unitsLeveledThisSpring(fresh()).size).toBe(0)
  })

  it('returns each unitId after successful level-ups (and ignores other action logs)', () => {
    let realm = injectMusteredUnit({ ...fresh(), resources: { ...fresh().resources, gold: 100 } }, 1, 'mock-a')
    realm = injectMusteredUnit(realm, 1, 'mock-b')
    realm = executeLevelUpUnit(realm, { unitId: 'mock-a' }).state
    realm = executeLevelUpUnit(realm, { unitId: 'mock-b' }).state
    expect([...unitsLeveledThisSpring(realm)].sort()).toEqual(['mock-a', 'mock-b'])
  })

  it('resets when the season rolls over (orchestrator clears actionsThisSeason)', async () => {
    const { endSeason } = await import('./orchestrator')
    let realm = injectMusteredUnit({ ...fresh(), resources: { ...fresh().resources, gold: 100, food: 50 } }, 1)
    realm = executeLevelUpUnit(realm, { unitId: 'mock-mustered-1' }).state
    expect(unitsLeveledThisSpring(realm).size).toBe(1)
    realm = endSeason(realm, createRng(1)).state
    expect(realm.season).toBe('summer')
    expect(unitsLeveledThisSpring(realm).size).toBe(0)
  })
})
