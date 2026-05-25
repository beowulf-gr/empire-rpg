import { describe, expect, it } from 'vitest'
import {
  annualMinisterCost,
  executeAnnualMinisterUpkeep,
  executeRecruitMinister,
  findMinisterByRole,
  ministerCheckBonus,
  recruitMinisterCost,
  RecruitMinisterError,
  totalAnnualMinisterCost,
  VACANCY_PENALTY,
  vacantRoles,
} from './ministers'
import { createStartingDomain } from '../createDomain'
import { createRng } from '../rng'
import { executeRecruitSettlers } from './recruit'
import type { Minister } from './ministers'
import type { RealmState } from '../state'

function uuids(prefix = 'id') {
  let n = 0
  return () => `${prefix}-${n++}`
}

function fresh(): RealmState {
  return createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'TestRealm',
    ownerId: 'o',
    uuid: uuids('realm'),
    skipBootSpring: true,
  })
}

function fund(state: RealmState, gold: number): RealmState {
  return { ...state, resources: { ...state.resources, gold } }
}

// ============================================================
// Cost helpers
// ============================================================

describe('annualMinisterCost', () => {
  it('rounds up: levels 1-3 cost 1 gp/yr, levels 4-6 cost 2, etc.', () => {
    const make = (level: number): Minister => ({
      id: 'x', role: 'treasurer', name: 'X', level,
      hiredYear: 1, hiredSeason: 'spring',
    })
    expect(annualMinisterCost(make(1))).toBe(1)
    expect(annualMinisterCost(make(3))).toBe(1)
    expect(annualMinisterCost(make(4))).toBe(2)
    expect(annualMinisterCost(make(6))).toBe(2)
    expect(annualMinisterCost(make(7))).toBe(3)
    expect(annualMinisterCost(make(20))).toBe(7)
  })
})

describe('totalAnnualMinisterCost', () => {
  it('sums per-minister costs', () => {
    const ms: Minister[] = [
      { id: 'a', role: 'treasurer',      name: 'A', level: 3, hiredYear: 1, hiredSeason: 'spring' },
      { id: 'b', role: 'general',        name: 'B', level: 6, hiredYear: 1, hiredSeason: 'spring' },
      { id: 'c', role: 'prime_minister', name: 'C', level: 7, hiredYear: 1, hiredSeason: 'spring' },
    ]
    // 1 + 2 + 3 = 6
    expect(totalAnnualMinisterCost(ms)).toBe(6)
  })
})

describe('recruitMinisterCost', () => {
  it('charges ceil(level/3) gp in spring', () => {
    expect(recruitMinisterCost(1, 'spring')).toBe(1)
    expect(recruitMinisterCost(3, 'spring')).toBe(1)
    expect(recruitMinisterCost(4, 'spring')).toBe(2)
    expect(recruitMinisterCost(9, 'spring')).toBe(3)
  })
  it('adds +1 gp out of season (summer/fall/winter)', () => {
    expect(recruitMinisterCost(3, 'summer')).toBe(2)
    expect(recruitMinisterCost(3, 'fall')).toBe(2)
    expect(recruitMinisterCost(3, 'winter')).toBe(2)
    expect(recruitMinisterCost(6, 'winter')).toBe(3) // base 2 + 1
  })
})

// ============================================================
// vacantRoles / findMinisterByRole
// ============================================================

describe('vacantRoles', () => {
  it('returns all three roles for an empty council', () => {
    expect(vacantRoles([])).toEqual(['treasurer', 'general', 'prime_minister'])
  })
  it('omits filled roles', () => {
    const ms: Minister[] = [
      { id: 'a', role: 'treasurer', name: 'A', level: 3, hiredYear: 1, hiredSeason: 'spring' },
    ]
    expect(vacantRoles(ms)).toEqual(['general', 'prime_minister'])
  })
})

// ============================================================
// executeRecruitMinister
// ============================================================

describe('executeRecruitMinister', () => {
  it('hires into a vacant role and creates a matching loyalty group', () => {
    const realm = fund(fresh(), 5)
    const { state, events } = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'Kraythor', level: 3 },
      uuids('hire'),
    )

    // Cost: ceil(3/3) = 1 gold
    expect(state.resources.gold).toBe(4)

    const m = findMinisterByRole(state.ministers, 'treasurer')!
    expect(m).toBeDefined()
    expect(m.name).toBe('Kraythor')
    expect(m.level).toBe(3)
    expect(m.role).toBe('treasurer')

    const lg = state.loyaltyGroups.find(
      (g) => g.kind === 'minister' && g.attachedTo === m.id,
    )
    expect(lg).toBeDefined()
    expect(lg?.score).toBe(0)
    expect(lg?.baseWillSave).toBe(2)

    expect(events[0].type).toBe('minister_recruited')
    expect(events[0].payload).toMatchObject({
      role: 'treasurer',
      level: 3,
      cost: 1,
      replaced: null,
    })
  })

  it('charges +1 gold off-season', () => {
    const summerRealm: RealmState = { ...fund(fresh(), 5), season: 'summer' }
    const { state } = executeRecruitMinister(
      summerRealm,
      { role: 'general', name: 'Iron Marshal', level: 3 },
      uuids('hire'),
    )
    // ceil(3/3) = 1, +1 off-season = 2 gp
    expect(state.resources.gold).toBe(3)
  })

  it('uses a generic name when blank', () => {
    const realm = fund(fresh(), 5)
    const { state } = executeRecruitMinister(
      realm,
      { role: 'prime_minister', name: '', level: 1 },
      uuids('hire'),
    )
    const m = findMinisterByRole(state.ministers, 'prime_minister')!
    // Realm.name is "TestRealm" in the test fixture
    expect(m.name).toBe('Prime Minister of TestRealm')
  })

  it('dismisses the previous minister when the role is already filled', () => {
    let realm = fund(fresh(), 10)
    // Share one factory across both hires so old+new ministers get distinct ids.
    const idGen = uuids('hire')
    // First hire — Treasurer level 3, cost 1 gp → gold 9
    let r = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'Old Tims', level: 3 },
      idGen,
    )
    realm = r.state
    const oldMinister = findMinisterByRole(realm.ministers, 'treasurer')!
    const oldGroup = realm.loyaltyGroups.find(
      (g) => g.kind === 'minister' && g.attachedTo === oldMinister.id,
    )!
    expect(oldMinister.name).toBe('Old Tims')
    expect(oldGroup).toBeDefined()

    // Replace with a higher-level minister — level 6, cost 2 gp → gold 7
    r = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'New Tims', level: 6 },
      idGen,
    )
    realm = r.state

    expect(realm.resources.gold).toBe(7)
    expect(realm.ministers).toHaveLength(1)
    const current = findMinisterByRole(realm.ministers, 'treasurer')!
    expect(current.name).toBe('New Tims')
    expect(current.level).toBe(6)

    // Old loyalty group is gone; new one exists
    const lingering = realm.loyaltyGroups.find((g) => g.id === oldGroup.id)
    expect(lingering).toBeUndefined()
    const newGroup = realm.loyaltyGroups.find(
      (g) => g.kind === 'minister' && g.attachedTo === current.id,
    )
    expect(newGroup).toBeDefined()

    // Event reports who was replaced
    expect(r.events[0].payload).toMatchObject({
      replaced: oldMinister.id,
      replacedName: 'Old Tims',
    })
  })

  it('throws when not enough gold', () => {
    const realm = fund(fresh(), 0)
    expect(() =>
      executeRecruitMinister(
        realm,
        { role: 'treasurer', name: 'X', level: 3 },
        uuids('hire'),
      ),
    ).toThrow(RecruitMinisterError)
  })

  it('throws on level < 1', () => {
    const realm = fund(fresh(), 5)
    expect(() =>
      executeRecruitMinister(realm, { role: 'general', name: 'X', level: 0 }, uuids()),
    ).toThrow(/at least 1/)
  })

  it('throws on level > 20', () => {
    const realm = fund(fresh(), 100)
    expect(() =>
      executeRecruitMinister(
        realm,
        { role: 'general', name: 'X', level: 21 },
        uuids('hire'),
      ),
    ).toThrow(/cannot exceed/)
  })

  it('throws on non-integer level', () => {
    const realm = fund(fresh(), 5)
    expect(() =>
      executeRecruitMinister(realm, { role: 'general', name: 'X', level: 2.5 }, uuids()),
    ).toThrow(/integer/)
  })

  it('does not affect other roles or other state', () => {
    const realm = fund(fresh(), 5)
    const { state } = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 1 },
      uuids('hire'),
    )
    expect(findMinisterByRole(state.ministers, 'general')).toBeNull()
    expect(findMinisterByRole(state.ministers, 'prime_minister')).toBeNull()
    // Resources other than gold untouched
    expect(state.resources.food).toBe(realm.resources.food)
    expect(state.resources.lumber).toBe(realm.resources.lumber)
  })
})

// ============================================================
// executeAnnualMinisterUpkeep
// ============================================================

describe('executeAnnualMinisterUpkeep', () => {
  it('emits a no-ministers event when the council is empty', () => {
    const realm = fresh()
    const { state, events } = executeAnnualMinisterUpkeep(realm, createRng(1))
    expect(state).toBe(realm)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'minister_upkeep',
      payload: { ministers: 0 },
    })
  })

  it('deducts gold for each minister the realm can afford', () => {
    let realm = fund(fresh(), 10)
    const idGen = uuids('hire')
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'A', level: 3 }, // 1 gp
      idGen,
    ).state
    realm = executeRecruitMinister(
      realm,
      { role: 'general', name: 'B', level: 6 }, // 2 gp
      idGen,
    ).state
    // After two hires: gold = 10 - 1 - 2 = 7
    expect(realm.resources.gold).toBe(7)

    const { state, events } = executeAnnualMinisterUpkeep(realm, createRng(1))

    // Annual upkeep: 1 + 2 = 3 gp
    expect(state.resources.gold).toBe(4)
    expect(state.ministers).toHaveLength(2)
    const evt = events[0]
    expect(evt.payload).toMatchObject({
      ministers: 2,
      retainedCount: 2,
      dismissedCount: 0,
      goldPaid: 3,
    })
  })

  it('dismisses a minister whose stipend cannot be paid and removes their loyalty group', () => {
    let realm = fund(fresh(), 10)
    const idGen = uuids('hire')
    // Hire a level-9 Prime Minister (cost 3 gp) → 7 gp left
    realm = executeRecruitMinister(
      realm,
      { role: 'prime_minister', name: 'Costly', level: 9 },
      idGen,
    ).state
    // Drain gold so we can't pay the 3 gp annual stipend next spring
    realm = { ...realm, resources: { ...realm.resources, gold: 1 } }

    const ministerId = findMinisterByRole(realm.ministers, 'prime_minister')!.id
    expect(
      realm.loyaltyGroups.find((g) => g.kind === 'minister' && g.attachedTo === ministerId),
    ).toBeDefined()

    const { state, events } = executeAnnualMinisterUpkeep(realm, createRng(1))

    expect(state.ministers).toHaveLength(0)
    expect(
      state.loyaltyGroups.find((g) => g.kind === 'minister' && g.attachedTo === ministerId),
    ).toBeUndefined()
    // No gold deducted because we couldn't pay
    expect(state.resources.gold).toBe(1)

    const evt = events[0]
    expect(evt.payload).toMatchObject({
      ministers: 1,
      retainedCount: 0,
      dismissedCount: 1,
      goldPaid: 0,
    })
    const dismissals = (evt.payload as { dismissals: { ministerId: string; cost: number }[] })
      .dismissals
    expect(dismissals[0].ministerId).toBe(ministerId)
    expect(dismissals[0].cost).toBe(3)
  })

  it('partially pays — keeps the affordable ones, dismisses the unaffordable', () => {
    let realm = fund(fresh(), 10)
    const idGen = uuids('hire')
    // Treasurer level 3 (cost 1 gp), General level 9 (cost 3 gp), Prime Min level 6 (cost 2 gp).
    // Recruit costs: 1 + 3 + 2 = 6 gp → starts with gold 10, leaves 4 gp.
    realm = executeRecruitMinister(realm, { role: 'treasurer', name: 'T', level: 3 }, idGen).state
    realm = executeRecruitMinister(realm, { role: 'general', name: 'G', level: 9 }, idGen).state
    realm = executeRecruitMinister(realm, { role: 'prime_minister', name: 'P', level: 6 }, idGen).state
    expect(realm.resources.gold).toBe(4)

    // Annual upkeep needed: 1 + 3 + 2 = 6 gp. We only have 4.
    // Iteration order = state.ministers order: T, G, P.
    //   T: cost 1, can pay → 3 gp left, kept
    //   G: cost 3, can pay → 0 gp left, kept
    //   P: cost 2, cannot pay → dismissed
    const { state, events } = executeAnnualMinisterUpkeep(realm, createRng(1))

    expect(state.resources.gold).toBe(0)
    expect(state.ministers.map((m) => m.role).sort()).toEqual(['general', 'treasurer'])
    expect(findMinisterByRole(state.ministers, 'prime_minister')).toBeNull()

    const evt = events[0]
    expect(evt.payload).toMatchObject({
      ministers: 3,
      retainedCount: 2,
      dismissedCount: 1,
      goldPaid: 4,
    })
  })
})

// ============================================================
// ministerCheckBonus (3d.4 — vacancy penalty + level bonus)
// ============================================================

describe('ministerCheckBonus', () => {
  it('returns -2 (VACANCY_PENALTY) and minister=null for an empty role', () => {
    const realm = fresh()
    expect(realm.ministers).toEqual([])
    const out = ministerCheckBonus(realm, 'treasurer')
    expect(out.bonus).toBe(VACANCY_PENALTY)
    expect(out.bonus).toBe(-2)
    expect(out.minister).toBeNull()
  })

  it('returns +minister.level when the role is filled', () => {
    let realm = fund(fresh(), 5)
    realm = executeRecruitMinister(
      realm,
      { role: 'general', name: 'Iron Marshal', level: 7 },
      uuids('hire'),
    ).state
    const out = ministerCheckBonus(realm, 'general')
    expect(out.bonus).toBe(7)
    expect(out.minister?.name).toBe('Iron Marshal')
  })

  it('only applies to the requested role', () => {
    let realm = fund(fresh(), 5)
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 5 },
      uuids('hire'),
    ).state
    expect(ministerCheckBonus(realm, 'treasurer').bonus).toBe(5)
    // Other roles still vacant → -2
    expect(ministerCheckBonus(realm, 'general').bonus).toBe(-2)
    expect(ministerCheckBonus(realm, 'prime_minister').bonus).toBe(-2)
  })

  it('options.vacantBonus overrides the default -2 fallback (and skips ruler stats)', () => {
    const realm = {
      ...fresh(),
      ruler: { ...fresh().ruler, knowledgeEconomics: 7 },
    }
    const out = ministerCheckBonus(realm, 'treasurer', { vacantBonus: 0 })
    expect(out.bonus).toBe(0)
    expect(out.rulerCovered).toBe(false)
  })

  it('on vacant role, applies ruler stat + VACANCY_PENALTY (treasurer → Knowledge economics)', () => {
    const realm = {
      ...fresh(),
      ruler: { ...fresh().ruler, knowledgeEconomics: 5 },
    }
    const out = ministerCheckBonus(realm, 'treasurer')
    expect(out.bonus).toBe(5 + VACANCY_PENALTY) // 5 - 2 = 3
    expect(out.bonus).toBe(3)
    expect(out.rulerCovered).toBe(true)
    expect(out.rulerStat).toBe(5)
    expect(out.minister).toBeNull()
  })

  it('on vacant role, general uses ruler.diplomacy', () => {
    const realm = {
      ...fresh(),
      ruler: { ...fresh().ruler, diplomacy: 8 },
    }
    const out = ministerCheckBonus(realm, 'general')
    expect(out.bonus).toBe(8 - 2) // 6
    expect(out.rulerCovered).toBe(true)
    expect(out.rulerStat).toBe(8)
  })

  it('on vacant role, prime_minister uses abilityMod(ruler.charisma)', () => {
    const realm = {
      ...fresh(),
      ruler: { ...fresh().ruler, charisma: 16 }, // mod +3
    }
    const out = ministerCheckBonus(realm, 'prime_minister')
    expect(out.bonus).toBe(3 - 2) // 1
    expect(out.rulerStat).toBe(3)
  })

  it('a filled minister role does NOT use ruler stats', () => {
    let realm = fund(fresh(), 5)
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 6 },
      uuids('hire'),
    ).state
    // Even with a hilariously high ruler Knowledge (economics), the minister wins
    realm = { ...realm, ruler: { ...realm.ruler, knowledgeEconomics: 99 } }
    const out = ministerCheckBonus(realm, 'treasurer')
    expect(out.bonus).toBe(6)
    expect(out.rulerCovered).toBe(false)
    expect(out.rulerStat).toBeNull()
  })
})

// ============================================================
// Integration: Prime Minister flows into the settler check
// ============================================================

describe('Recruit Settlers honors Prime Minister bonus', () => {
  it('applies -2 vacancy penalty when no Prime Minister', () => {
    const realm = fresh()
    const { events } = executeRecruitSettlers(
      realm,
      { race: 'humans', gpBonus: 0 },
      createRng(1),
      uuids('settler'),
    )
    const recruit = events.find((e) => e.type === 'recruit_settlers')!
    expect(recruit.payload).toMatchObject({
      ministerBonus: -2,
      ministerName: null,
      ministerLevel: null,
    })
  })

  it('adds Prime Minister level when the role is filled', () => {
    let realm = fund(fresh(), 5)
    realm = executeRecruitMinister(
      realm,
      { role: 'prime_minister', name: 'Voice', level: 4 },
      uuids('hire'),
    ).state
    const { events } = executeRecruitSettlers(
      realm,
      { race: 'humans', gpBonus: 0 },
      createRng(1),
      uuids('settler'),
    )
    const recruit = events.find((e) => e.type === 'recruit_settlers')!
    expect(recruit.payload).toMatchObject({
      ministerBonus: 4,
      ministerName: 'Voice',
      ministerLevel: 4,
    })
  })
})
