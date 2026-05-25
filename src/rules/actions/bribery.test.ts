import { describe, expect, it } from 'vitest'
import {
  BriberyError,
  findMoraleBribe,
  moraleBribeBonusPerGp,
  setMoraleBribe,
  totalCommittedBribes,
} from './bribery'
import { executeMoraleUpkeep } from './executors'
import { executeRecruitMinister } from './ministers'
import { createStartingDomain } from '../createDomain'
import { createRng } from '../rng'
import type { RealmState } from '../state'

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

describe('moraleBribeBonusPerGp', () => {
  it('returns +5 for ministers, +2 for everyone else', () => {
    let realm = withResources(fresh(), { gold: 5 })
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 3 },
      uuids('hire'),
    ).state
    const commoners = realm.loyaltyGroups.find((g) => g.kind === 'commoners')!
    const minister = realm.loyaltyGroups.find((g) => g.kind === 'minister')!
    expect(moraleBribeBonusPerGp(realm, commoners.id)).toBe(2)
    expect(moraleBribeBonusPerGp(realm, minister.id)).toBe(5)
  })
})

describe('setMoraleBribe', () => {
  it('deducts gold and stores the bribe', () => {
    const realm = withResources(fresh(), { gold: 10 })
    const groupId = realm.loyaltyGroups[0].id
    const next = setMoraleBribe(realm, groupId, 3)
    expect(next.resources.gold).toBe(7)
    expect(findMoraleBribe(next, groupId)?.gp).toBe(3)
  })

  it('refunds the difference when reducing an existing bribe', () => {
    let realm = withResources(fresh(), { gold: 10 })
    const groupId = realm.loyaltyGroups[0].id
    realm = setMoraleBribe(realm, groupId, 4) // gold 6
    realm = setMoraleBribe(realm, groupId, 1) // gold 9 (refund 3)
    expect(realm.resources.gold).toBe(9)
    expect(findMoraleBribe(realm, groupId)?.gp).toBe(1)
  })

  it('removes the bribe entry on gp=0 (full refund)', () => {
    let realm = withResources(fresh(), { gold: 10 })
    const groupId = realm.loyaltyGroups[0].id
    realm = setMoraleBribe(realm, groupId, 4) // gold 6
    realm = setMoraleBribe(realm, groupId, 0) // gold 10 (full refund, entry removed)
    expect(realm.resources.gold).toBe(10)
    expect(findMoraleBribe(realm, groupId)).toBeNull()
    expect(realm.pendingBribes).toHaveLength(0)
  })

  it('throws when not enough gold', () => {
    const realm = withResources(fresh(), { gold: 1 })
    const groupId = realm.loyaltyGroups[0].id
    expect(() => setMoraleBribe(realm, groupId, 5)).toThrow(BriberyError)
  })

  it('throws on negative or non-integer gp', () => {
    const realm = withResources(fresh(), { gold: 10 })
    const groupId = realm.loyaltyGroups[0].id
    expect(() => setMoraleBribe(realm, groupId, -1)).toThrow(/non-negative integer/)
    expect(() => setMoraleBribe(realm, groupId, 1.5)).toThrow(/non-negative integer/)
  })

  it('throws on unknown groupId', () => {
    const realm = withResources(fresh(), { gold: 10 })
    expect(() => setMoraleBribe(realm, 'nope', 1)).toThrow(/No loyalty group/)
  })
})

describe('totalCommittedBribes', () => {
  it('sums across all bribes', () => {
    let realm = withResources(fresh(), { gold: 20 })
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 3 },
      uuids('hire'),
    ).state
    const commoners = realm.loyaltyGroups.find((g) => g.kind === 'commoners')!
    const minister = realm.loyaltyGroups.find((g) => g.kind === 'minister')!
    realm = setMoraleBribe(realm, commoners.id, 3)
    realm = setMoraleBribe(realm, minister.id, 2)
    expect(totalCommittedBribes(realm)).toBe(5)
  })
})

describe('executeMoraleUpkeep — bribery integration', () => {
  it('applies +2/gp to a commoner roll and clears the bribe', () => {
    let realm = withResources(fresh(), { gold: 10 })
    const commoners = realm.loyaltyGroups.find((g) => g.kind === 'commoners')!
    realm = setMoraleBribe(realm, commoners.id, 1) // +2 to commoner check
    const { state, events } = executeMoraleUpkeep(realm, createRng(1))
    // Bribe consumed
    expect(state.pendingBribes).toEqual([])
    // Event payload includes bribe info for the commoners check
    const check = events.find(
      (e) => e.type === 'morale_check' && (e.payload as { kind: string }).kind === 'commoners',
    )!
    expect(check.payload).toMatchObject({ bribeGp: 1, bribeBonus: 2 })
  })

  it('successful bribed check adds +1 loyalty (bread and circuses)', () => {
    let realm = withResources(fresh(), { gold: 10 })
    // Drop commoner loyalty to make a clean DC test: score 0, baseWillSave 2.
    // DC will be 5 (no food crisis). Roll min outcome with seed.
    const commoners = realm.loyaltyGroups.find((g) => g.kind === 'commoners')!
    realm = setMoraleBribe(realm, commoners.id, 5) // +10 bonus = guaranteed pass
    const before = commoners.score
    const { state, events } = executeMoraleUpkeep(realm, createRng(1))
    const updated = state.loyaltyGroups.find((g) => g.kind === 'commoners')!
    // Pass with margin 0-9 → delta 0; bribe adds +1; net change should be at least +1.
    // Crit pass would give +2 + 1 = +3.
    expect(updated.score - before).toBeGreaterThanOrEqual(1)
    const check = events.find(
      (e) => e.type === 'morale_check' && (e.payload as { kind: string }).kind === 'commoners',
    )!
    expect((check.payload as { bribeLoyaltyBonus: number }).bribeLoyaltyBonus).toBe(1)
  })

  it('failed check despite bribery: gold is gone, no +1 loyalty', () => {
    // Engineer a guaranteed failure: huge negative score so even +bribe can't reach DC.
    let realm = withResources(fresh(), { gold: 10 })
    const commoners = realm.loyaltyGroups.find((g) => g.kind === 'commoners')!
    realm = {
      ...realm,
      loyaltyGroups: realm.loyaltyGroups.map((g) =>
        g.id === commoners.id ? { ...g, score: -50, baseWillSave: 0 } : g,
      ),
      // Force a famine DC of 20 to make failure inevitable.
      lastFoodCrisis: 'famine',
    }
    realm = setMoraleBribe(realm, commoners.id, 1) // +2, still nowhere near DC 20
    expect(realm.resources.gold).toBe(9) // 1 gp deducted
    const { state, events } = executeMoraleUpkeep(realm, createRng(1))
    expect(state.pendingBribes).toEqual([])
    const check = events.find(
      (e) => e.type === 'morale_check' && (e.payload as { kind: string }).kind === 'commoners',
    )!
    expect((check.payload as { bribeLoyaltyBonus: number }).bribeLoyaltyBonus).toBe(0)
    // Gold not refunded (you spent it before the roll)
    expect(state.resources.gold).toBe(9)
  })
})
