import { describe, expect, it } from 'vitest'
import { assertLimitedNotTaken, isLimitedActionExhausted } from './limited'
import { createStartingDomain } from '../createDomain'
import { createRng } from '../rng'
import type { RealmState } from '../state'
import { executeRaiseTaxes } from './taxation'
import { executeRecruitSettlers } from './recruit'
import { executeLevelUpUnit } from './military'

function uuids(prefix = 'id') {
  let n = 0
  return () => `${prefix}-${n++}`
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

// ============================================================
// assertLimitedNotTaken
// ============================================================

describe('assertLimitedNotTaken', () => {
  it('passes when the action has no entry in actionsThisSeason', () => {
    expect(() =>
      assertLimitedNotTaken(fresh(), 'raise_loans', 'Raise Loans'),
    ).not.toThrow()
  })

  it('throws when the action already has an entry', () => {
    const realm: RealmState = {
      ...fresh(),
      actionsThisSeason: [{ actionId: 'raise_loans', takenAt: new Date().toISOString() }],
    }
    expect(() =>
      assertLimitedNotTaken(realm, 'raise_loans', 'Raise Loans'),
    ).toThrow(/Limited/)
  })

  it('only fires for the matching actionId, not other limited actions', () => {
    const realm: RealmState = {
      ...fresh(),
      actionsThisSeason: [{ actionId: 'raise_taxes', takenAt: new Date().toISOString() }],
    }
    expect(() =>
      assertLimitedNotTaken(realm, 'raise_loans', 'Raise Loans'),
    ).not.toThrow()
  })
})

// ============================================================
// isLimitedActionExhausted — single-use Limited
// ============================================================

describe('isLimitedActionExhausted — single-use (raise_loans / raise_taxes)', () => {
  it('returns false for a fresh realm', () => {
    expect(isLimitedActionExhausted(fresh(), 'raise_loans')).toBe(false)
    expect(isLimitedActionExhausted(fresh(), 'raise_taxes')).toBe(false)
  })

  it('returns true after Raise Taxes is taken (no other Limited is affected)', () => {
    const realm = { ...fresh(), resources: { ...fresh().resources, food: 10, gold: 10 } }
    const { state } = executeRaiseTaxes(realm)
    expect(isLimitedActionExhausted(state, 'raise_taxes')).toBe(true)
    expect(isLimitedActionExhausted(state, 'raise_loans')).toBe(false)
  })
})

// ============================================================
// isLimitedActionExhausted — recruit_settlers (3 per spring)
// ============================================================

describe('isLimitedActionExhausted — recruit_settlers (3/spring cap)', () => {
  it('returns false with 0 and 2 checks used', () => {
    let realm = fresh()
    expect(isLimitedActionExhausted(realm, 'recruit_settlers')).toBe(false)
    realm = executeRecruitSettlers(
      realm,
      { race: 'humans', gpBonus: 0 },
      createRng(1),
      uuids('a'),
    ).state
    expect(isLimitedActionExhausted(realm, 'recruit_settlers')).toBe(false)
    realm = executeRecruitSettlers(
      realm,
      { race: 'elves', gpBonus: 0 },
      createRng(2),
      uuids('b'),
    ).state
    expect(isLimitedActionExhausted(realm, 'recruit_settlers')).toBe(false)
  })

  it('returns true once all 3 checks are used this spring', () => {
    let realm = fresh()
    realm = executeRecruitSettlers(realm, { race: 'humans', gpBonus: 0 }, createRng(1), uuids('a')).state
    realm = executeRecruitSettlers(realm, { race: 'elves',  gpBonus: 0 }, createRng(2), uuids('b')).state
    realm = executeRecruitSettlers(realm, { race: 'dwarves', gpBonus: 0 }, createRng(3), uuids('c')).state
    expect(isLimitedActionExhausted(realm, 'recruit_settlers')).toBe(true)
  })
})

// ============================================================
// isLimitedActionExhausted — level_up_unit (per-unit cap)
// ============================================================

function injectMustered(realm: RealmState, count = 1): RealmState {
  const units = Array.from({ length: count }).map((_, i) => ({
    id: `mock-mustered-${i}`,
    source: 'mustered' as const,
    size: 'medium' as const,
    level: 1,
    cr: 0.5,
    race: 'humans' as const,
    assignedStrongholdId: null,
    equipmentGp: 100,
    magicGp: 0,
  }))
  return {
    ...realm,
    militaryUnits: [...realm.militaryUnits, ...units],
    loyaltyGroups: [
      ...realm.loyaltyGroups,
      ...units.map((u, i) => ({
        id: `lg-${i}`,
        kind: 'military' as const,
        label: 'mock',
        baseWillSave: 2,
        score: 0,
        attachedTo: u.id,
      })),
    ],
  }
}

describe('isLimitedActionExhausted — level_up_unit (per-unit cap)', () => {
  it('returns false when there are no mustered units (idle, not exhausted)', () => {
    expect(isLimitedActionExhausted(fresh(), 'level_up_unit')).toBe(false)
  })

  it('returns false while at least one mustered unit hasn\'t been levelled this year', () => {
    let realm = injectMustered({ ...fresh(), resources: { ...fresh().resources, gold: 10 } }, 2)
    realm = executeLevelUpUnit(realm, { unitId: 'mock-mustered-0' }).state
    expect(isLimitedActionExhausted(realm, 'level_up_unit')).toBe(false)
  })

  it('returns true once every mustered unit has been levelled this spring', () => {
    let realm = injectMustered({ ...fresh(), resources: { ...fresh().resources, gold: 10 } }, 2)
    realm = executeLevelUpUnit(realm, { unitId: 'mock-mustered-0' }).state
    realm = executeLevelUpUnit(realm, { unitId: 'mock-mustered-1' }).state
    expect(isLimitedActionExhausted(realm, 'level_up_unit')).toBe(true)
  })
})
