import { describe, expect, it } from 'vitest'
import { executeOrcsIdlePenalty } from './executors'
import { createStartingDomain } from '../createDomain'
import { createRng } from '../rng'
import type { MilitaryUnit } from './military'
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

function withOrcs(realm: RealmState, count: number): RealmState {
  return {
    ...realm,
    populations: [
      ...realm.populations,
      { id: 'orcs-1', race: 'orcs', count, homeAreaId: null, workAreaId: null },
    ],
  }
}

function addMusteredOrcUnits(realm: RealmState, n: number): RealmState {
  const units: MilitaryUnit[] = Array.from({ length: n }).map((_, i) => ({
    id: `orc-mustered-${i}`,
    source: 'mustered',
    size: 'medium',
    level: 1,
    cr: 0.5,
    race: 'orcs',
    assignedStrongholdId: null,
    equipmentGp: 100,
    magicGp: 0,
  }))
  return { ...realm, militaryUnits: [...realm.militaryUnits, ...units] }
}

describe('executeOrcsIdlePenalty — no orcs', () => {
  it('is a no-op when no orcs are in the realm', () => {
    const realm = fresh()
    const { state, events } = executeOrcsIdlePenalty(realm, createRng(1))
    expect(state.orcIdlePenalty).toBe(0)
    expect(events[0].payload).toMatchObject({ orcsPresent: false })
  })

  it('resets a non-zero penalty when orcs disappear (they all emigrated/died)', () => {
    const realm = { ...fresh(), orcIdlePenalty: -4 }
    const { state, events } = executeOrcsIdlePenalty(realm, createRng(1))
    expect(state.orcIdlePenalty).toBe(0)
    expect(events[0].payload).toMatchObject({
      orcsPresent: false,
      previousPenalty: -4,
      newPenalty: 0,
    })
  })
})

describe('executeOrcsIdlePenalty — orcs present, not enough mustered', () => {
  it('drops the penalty by -1 when no orcs are mustered', () => {
    const realm = withOrcs(fresh(), 4)
    const { state, events } = executeOrcsIdlePenalty(realm, createRng(1))
    expect(state.orcIdlePenalty).toBe(-1)
    expect(events[0].payload).toMatchObject({
      orcsPresent: true,
      orcPopulation: 4,
      orcMustered: 0,
      halfNeeded: 2,
      enoughMustered: false,
      previousPenalty: 0,
      newPenalty: -1,
    })
  })

  it('accumulates over consecutive idle years', () => {
    let realm = withOrcs(fresh(), 4)
    realm = executeOrcsIdlePenalty(realm, createRng(1)).state
    realm = executeOrcsIdlePenalty(realm, createRng(1)).state
    realm = executeOrcsIdlePenalty(realm, createRng(1)).state
    expect(realm.orcIdlePenalty).toBe(-3)
  })

  it('rounds up "half" — 5 orcs need 3 mustered, 2 isn\'t enough', () => {
    let realm = withOrcs(fresh(), 5)
    realm = addMusteredOrcUnits(realm, 2)
    const { state, events } = executeOrcsIdlePenalty(realm, createRng(1))
    expect(state.orcIdlePenalty).toBe(-1)
    expect(events[0].payload).toMatchObject({
      halfNeeded: 3,
      orcMustered: 2,
      enoughMustered: false,
    })
  })
})

describe('executeOrcsIdlePenalty — at least half mustered', () => {
  it('recovers +1 toward 0 when half mustered (4 orcs, 2 mustered)', () => {
    let realm = { ...withOrcs(fresh(), 4), orcIdlePenalty: -3 }
    realm = addMusteredOrcUnits(realm, 2)
    const { state, events } = executeOrcsIdlePenalty(realm, createRng(1))
    expect(state.orcIdlePenalty).toBe(-2)
    expect(events[0].payload).toMatchObject({
      enoughMustered: true,
      previousPenalty: -3,
      newPenalty: -2,
    })
  })

  it('does not turn into a bonus — floors at 0', () => {
    let realm = { ...withOrcs(fresh(), 4), orcIdlePenalty: 0 }
    realm = addMusteredOrcUnits(realm, 4)
    const { state } = executeOrcsIdlePenalty(realm, createRng(1))
    expect(state.orcIdlePenalty).toBe(0)
  })

  it('with a -1 penalty and full muster, recovers to 0 (no overflow)', () => {
    let realm = { ...withOrcs(fresh(), 4), orcIdlePenalty: -1 }
    realm = addMusteredOrcUnits(realm, 4)
    const { state } = executeOrcsIdlePenalty(realm, createRng(1))
    expect(state.orcIdlePenalty).toBe(0)
  })
})

describe('executeOrcsIdlePenalty — only counts orc mustered units', () => {
  it('does NOT count human mustered units toward the half-threshold', () => {
    let realm = withOrcs(fresh(), 4) // need 2 orc-mustered to satisfy
    // Add 2 HUMAN mustered units — irrelevant for the orc check.
    const humanUnits: MilitaryUnit[] = [
      {
        id: 'human-mustered-1',
        source: 'mustered',
        size: 'medium',
        level: 1,
        cr: 0.5,
        race: 'humans',
        assignedStrongholdId: null,
        equipmentGp: 100,
        magicGp: 0,
      },
      {
        id: 'human-mustered-2',
        source: 'mustered',
        size: 'medium',
        level: 1,
        cr: 0.5,
        race: 'humans',
        assignedStrongholdId: null,
        equipmentGp: 100,
        magicGp: 0,
      },
    ]
    realm = { ...realm, militaryUnits: humanUnits }
    const { state } = executeOrcsIdlePenalty(realm, createRng(1))
    expect(state.orcIdlePenalty).toBe(-1) // not satisfied
  })
})
