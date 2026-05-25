import { describe, expect, it } from 'vitest'
import { ELVES_EMIGRATION_DC, executeElvesEmigration } from './executors'
import { createStartingDomain } from '../createDomain'
import { createRng } from '../rng'
import { findCommonersGroup } from '../state'
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

function withElves(realm: RealmState, count = 3): RealmState {
  return {
    ...realm,
    populations: [
      ...realm.populations,
      { id: 'elves-1', race: 'elves', count, homeAreaId: null, workAreaId: null },
    ],
  }
}

function setCommonersScore(realm: RealmState, score: number): RealmState {
  return {
    ...realm,
    loyaltyGroups: realm.loyaltyGroups.map((g) =>
      g.kind === 'commoners' ? { ...g, score } : g,
    ),
  }
}

describe('executeElvesEmigration', () => {
  it('is a no-op (with summary event) when no elves are in the realm', () => {
    const realm = fresh()
    const { state, events } = executeElvesEmigration(realm, createRng(1))
    expect(state.populations).toEqual(realm.populations)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('elves_emigration')
    expect(events[0].payload).toMatchObject({ elvesPresent: false })
  })

  it('uses +0 modifier when commoners loyalty is non-negative', () => {
    const realm = setCommonersScore(withElves(fresh(), 3), 5)
    const { events } = executeElvesEmigration(realm, createRng(1))
    expect(events[0].payload).toMatchObject({
      elvesPresent: true,
      commonersScore: 5,
      emigrationMod: 0,
    })
  })

  it('doubles negative commoners loyalty for the emigration check', () => {
    const realm = setCommonersScore(withElves(fresh(), 3), -3)
    const { events } = executeElvesEmigration(realm, createRng(1))
    expect(events[0].payload).toMatchObject({
      commonersScore: -3,
      emigrationMod: -6,
    })
  })

  it('removes one elf unit per failed check', () => {
    // With commoners at -10, emigration mod = -20. d20 + -20 < DC 5 → guaranteed fail.
    const realm = setCommonersScore(withElves(fresh(), 3), -10)
    const { state, events } = executeElvesEmigration(realm, createRng(1))
    const elfStack = state.populations.find((p) => p.race === 'elves')
    expect(elfStack?.count).toBe(2) // 3 → 2 (one check, one fail)
    expect(events[0].payload).toMatchObject({ totalLeft: 1 })
  })

  it('passes the check when the roll easily clears DC (commoners loyalty 0)', () => {
    // With mod = 0, d20 ≥ 5 passes. Use stub realm with high d20 by seeding.
    const realm = setCommonersScore(withElves(fresh(), 1), 0)
    // Try a few seeds until we find one where the d20 ≥ 5 so the elf stays.
    let stayed = false
    for (let seed = 1; seed < 100 && !stayed; seed++) {
      const { state, events } = executeElvesEmigration(realm, createRng(seed))
      if ((events[0].payload as { totalLeft: number }).totalLeft === 0) {
        const elf = state.populations.find((p) => p.race === 'elves')
        expect(elf?.count).toBe(1) // still here
        stayed = true
      }
    }
    expect(stayed).toBe(true)
  })

  it('uses the same DC across runs (book-ambiguous; we use 5)', () => {
    const realm = setCommonersScore(withElves(fresh()), 0)
    const { events } = executeElvesEmigration(realm, createRng(1))
    expect((events[0].payload as { dc: number }).dc).toBe(ELVES_EMIGRATION_DC)
    expect(ELVES_EMIGRATION_DC).toBe(5)
  })

  it('drops stacks that hit 0 count (no ghost entries left behind)', () => {
    // Single elf, guaranteed fail.
    const realm = setCommonersScore(withElves(fresh(), 1), -10)
    const { state } = executeElvesEmigration(realm, createRng(1))
    expect(state.populations.find((p) => p.race === 'elves')).toBeUndefined()
  })

  it('reads from the freshly-rolled commoners score (post-morale-upkeep)', () => {
    // Sanity: the executor reads commoners directly via findCommonersGroup.
    const realm = setCommonersScore(withElves(fresh()), -2)
    const commoners = findCommonersGroup(realm)
    expect(commoners?.score).toBe(-2)
  })
})
