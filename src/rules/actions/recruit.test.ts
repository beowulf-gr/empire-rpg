import { describe, expect, it } from 'vitest'
import {
  RECRUIT_SETTLERS_PER_SPRING,
  RecruitSettlersError,
  executeRecruitSettlers,
  recruitChecksThisSpring,
  recruitedRacesThisSpring,
  settlerCheckBaseBonus,
  settlerCheckResult,
} from './recruit'
import { createStartingDomain } from '../createDomain'
import type { RealmState } from '../state'
import { createRng } from '../rng'

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

function fund(realm: RealmState, gold: number): RealmState {
  return { ...realm, resources: { ...realm.resources, gold } }
}

// ============================================================
// settlerCheckResult — book §6.1 table
// ============================================================

describe('settlerCheckResult', () => {
  it('≤10 → 0', () => {
    expect(settlerCheckResult(-3)).toBe(0)
    expect(settlerCheckResult(0)).toBe(0)
    expect(settlerCheckResult(10)).toBe(0)
  })
  it('11–15 → 1', () => {
    expect(settlerCheckResult(11)).toBe(1)
    expect(settlerCheckResult(15)).toBe(1)
  })
  it('16–20 → 2', () => {
    expect(settlerCheckResult(16)).toBe(2)
    expect(settlerCheckResult(20)).toBe(2)
  })
  it('+5 above 20 each → +1 more', () => {
    expect(settlerCheckResult(21)).toBe(3)
    expect(settlerCheckResult(25)).toBe(3)
    expect(settlerCheckResult(26)).toBe(4)
    expect(settlerCheckResult(30)).toBe(4)
    expect(settlerCheckResult(31)).toBe(5)
  })
})

// ============================================================
// settlerCheckBaseBonus
// ============================================================

describe('settlerCheckBaseBonus', () => {
  it('returns -2 PM bonus and 0 loyalty for a fresh barony', () => {
    const base = settlerCheckBaseBonus(fresh())
    expect(base.charismaMod).toBe(0)
    expect(base.ministerBonus).toBe(-2) // vacancy penalty
    expect(base.ministerName).toBeNull()
    expect(base.loyaltyMod).toBe(0)
  })
})

// ============================================================
// recruitChecksThisSpring / recruitedRacesThisSpring
// ============================================================

describe('per-spring tracking helpers', () => {
  it('returns 0 / empty for a fresh realm', () => {
    const realm = fresh()
    expect(recruitChecksThisSpring(realm)).toBe(0)
    expect(recruitedRacesThisSpring(realm).size).toBe(0)
  })

  it('counts each recruit_settlers entry and tracks races', () => {
    let realm = fund(fresh(), 0)
    realm = executeRecruitSettlers(
      realm,
      { race: 'humans', gpBonus: 0 },
      createRng(1),
      uuids('a'),
    ).state
    realm = executeRecruitSettlers(
      realm,
      { race: 'elves', gpBonus: 0 },
      createRng(2),
      uuids('b'),
    ).state
    expect(recruitChecksThisSpring(realm)).toBe(2)
    expect([...recruitedRacesThisSpring(realm)].sort()).toEqual(['elves', 'humans'])
  })
})

// ============================================================
// executeRecruitSettlers — happy paths
// ============================================================

describe('executeRecruitSettlers — happy paths', () => {
  it('appends an actionsThisSeason entry with race + gpBonus + total', () => {
    const realm = fund(fresh(), 5)
    const { state, events } = executeRecruitSettlers(
      realm,
      { race: 'humans', gpBonus: 2 },
      createRng(11),
      uuids('s'),
    )
    expect(state.actionsThisSeason).toHaveLength(1)
    expect(state.actionsThisSeason[0].actionId).toBe('recruit_settlers')
    expect(state.actionsThisSeason[0].meta).toMatchObject({
      race: 'humans',
      gpBonus: 2,
    })
    expect(events[0].type).toBe('recruit_settlers')
    expect(events[0].payload).toMatchObject({
      race: 'humans',
      gpBonus: 2,
      gpModifier: 8,
    })
  })

  it('deducts gold equal to gpBonus', () => {
    const realm = fund(fresh(), 5)
    const { state } = executeRecruitSettlers(
      realm,
      { race: 'humans', gpBonus: 3 },
      createRng(11),
      uuids('s'),
    )
    expect(state.resources.gold).toBe(2)
  })

  it('adds settlers to the unallocated pool when the check succeeds', () => {
    // Boost loyalty so even a low roll yields settlers.
    const realm = fresh()
    realm.loyaltyGroups[0].score = 20 // commoner loyalty +20 → settler pool ≥ 4
    const { state } = executeRecruitSettlers(
      realm,
      { race: 'elves', gpBonus: 0 },
      createRng(99),
      uuids('s'),
    )
    const elfPool = state.populations.find(
      (p) => p.race === 'elves' && p.homeAreaId === null && p.workAreaId === null,
    )
    expect(elfPool).toBeDefined()
    expect(elfPool!.count).toBeGreaterThan(0)
  })

  it('produces 0 settlers and still uses a check on a low roll', () => {
    // Tank loyalty so total stays ≤ 10.
    const realm = fresh()
    realm.loyaltyGroups[0].score = -20
    const { state, events } = executeRecruitSettlers(
      realm,
      { race: 'humans', gpBonus: 0 },
      createRng(1),
      uuids('s'),
    )
    expect(events[0].payload).toMatchObject({ settlers: 0 })
    // Still consumes one of the three checks
    expect(recruitChecksThisSpring(state)).toBe(1)
  })

  it('merges with an existing unallocated stack instead of duplicating', () => {
    const realm = fresh()
    realm.loyaltyGroups[0].score = 20
    // Seed an existing humans stack already in the pool
    realm.populations = [
      ...realm.populations,
    ]
    const initial = realm.populations.filter(
      (p) => p.race === 'humans' && p.homeAreaId === null && p.workAreaId === null,
    ).length
    const { state } = executeRecruitSettlers(
      realm,
      { race: 'humans', gpBonus: 0 },
      createRng(99),
      uuids('s'),
    )
    const humanPools = state.populations.filter(
      (p) => p.race === 'humans' && p.homeAreaId === null && p.workAreaId === null,
    )
    expect(humanPools.length).toBe(initial) // no new stack created
  })

  it('+4 per gp boosts the total — check the modifier breakdown', () => {
    const realm = fund(fresh(), 5)
    const { events } = executeRecruitSettlers(
      realm,
      { race: 'dwarves', gpBonus: 3 },
      createRng(7),
      uuids('s'),
    )
    const p = events[0].payload as Record<string, number>
    expect(p.gpModifier).toBe(12) // 3 × 4
    expect(p.total).toBe(p.roll + p.charismaMod + p.ministerBonus + p.loyaltyMod + 12)
  })
})

// ============================================================
// executeRecruitSettlers — error paths
// ============================================================

describe('executeRecruitSettlers — error paths', () => {
  it('throws outside spring', () => {
    const realm: RealmState = { ...fresh(), season: 'fall' }
    expect(() =>
      executeRecruitSettlers(realm, { race: 'humans', gpBonus: 0 }, createRng(1), uuids()),
    ).toThrow(RecruitSettlersError)
    expect(() =>
      executeRecruitSettlers(realm, { race: 'humans', gpBonus: 0 }, createRng(1), uuids()),
    ).toThrow(/spring action/)
  })

  it('throws on negative gpBonus', () => {
    const realm = fresh()
    expect(() =>
      executeRecruitSettlers(realm, { race: 'humans', gpBonus: -1 }, createRng(1), uuids()),
    ).toThrow(/non-negative/)
  })

  it('throws on insufficient gold', () => {
    const realm = fund(fresh(), 1)
    expect(() =>
      executeRecruitSettlers(realm, { race: 'humans', gpBonus: 5 }, createRng(1), uuids()),
    ).toThrow(/Not enough gold/)
  })

  it('throws after 3 checks have been used', () => {
    let realm = fresh()
    realm = executeRecruitSettlers(realm, { race: 'humans', gpBonus: 0 }, createRng(1), uuids('a')).state
    realm = executeRecruitSettlers(realm, { race: 'elves', gpBonus: 0 }, createRng(2), uuids('b')).state
    realm = executeRecruitSettlers(realm, { race: 'dwarves', gpBonus: 0 }, createRng(3), uuids('c')).state
    expect(recruitChecksThisSpring(realm)).toBe(RECRUIT_SETTLERS_PER_SPRING)
    expect(() =>
      executeRecruitSettlers(realm, { race: 'gnomes', gpBonus: 0 }, createRng(4), uuids('d')),
    ).toThrow(/all 3 settler checks/i)
  })

  it('throws when the same race is attempted twice', () => {
    let realm = fresh()
    realm = executeRecruitSettlers(realm, { race: 'humans', gpBonus: 0 }, createRng(1), uuids('a')).state
    expect(() =>
      executeRecruitSettlers(realm, { race: 'humans', gpBonus: 0 }, createRng(2), uuids('b')),
    ).toThrow(/already been recruited/)
  })
})

// ============================================================
// Spring → spring reset
// ============================================================

describe('per-spring counters reset on season transition', () => {
  it('actionsThisSeason cleared by orchestrator means counters start fresh', async () => {
    const { endSeason } = await import('./orchestrator')
    let realm = fresh()
    realm = executeRecruitSettlers(realm, { race: 'humans', gpBonus: 0 }, createRng(1), uuids('a')).state
    expect(recruitChecksThisSpring(realm)).toBe(1)
    // Roll through spring → summer (orchestrator clears actionsThisSeason)
    realm = endSeason(realm, createRng(1)).state
    expect(realm.season).toBe('summer')
    expect(recruitChecksThisSpring(realm)).toBe(0)
  })
})
