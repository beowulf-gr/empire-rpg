import { describe, expect, it } from 'vitest'
import {
  commitIdlePopulation,
  commitIdlePopulationByRace,
  idlePopulationByRace,
  PopulationCommitError,
  returnCommittedPopulation,
  settleCommittedPopulation,
  totalIdlePopulation,
} from './populationCommit'
import { createStartingDomain } from '../createDomain'
import type { PopulationStack, RealmState } from '../state'

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

describe('totalIdlePopulation', () => {
  it('counts only stacks with workAreaId === null', () => {
    const realm = fresh()
    // Starter realm has 10 unallocated humans (homeAreaId=null, workAreaId=null) — all idle.
    expect(totalIdlePopulation(realm)).toBe(10)
  })

  it('ignores working pop', () => {
    const realm = fresh()
    const seeded: RealmState = {
      ...realm,
      populations: [
        { id: 'p1', race: 'humans', count: 5, homeAreaId: realm.areas[0].id, workAreaId: realm.areas[0].id },
        { id: 'p2', race: 'humans', count: 3, homeAreaId: realm.areas[0].id, workAreaId: null },
        { id: 'p3', race: 'humans', count: 2, homeAreaId: null, workAreaId: null },
      ],
    }
    expect(totalIdlePopulation(seeded)).toBe(5) // 3 + 2
  })
})

describe('commitIdlePopulation', () => {
  it('throws when idle < requested', () => {
    const realm: RealmState = { ...fresh(), populations: [] }
    expect(() => commitIdlePopulation(realm, 1)).toThrow(PopulationCommitError)
    expect(() => commitIdlePopulation(realm, 1)).toThrow(/Need 1 idle worker/)
  })

  it('drains stacks in order until count is satisfied', () => {
    const realm: RealmState = {
      ...fresh(),
      populations: [
        { id: 'p1', race: 'humans', count: 2, homeAreaId: 'area-3', workAreaId: null },
        { id: 'p2', race: 'elves', count: 3, homeAreaId: null, workAreaId: null },
      ],
    }
    const { state, committed } = commitIdlePopulation(realm, 4)
    // Drained 2 humans + 2 elves (partial from second stack)
    expect(committed).toEqual([
      { race: 'humans', count: 2, originalHomeAreaId: 'area-3' },
      { race: 'elves', count: 2, originalHomeAreaId: null },
    ])
    // First stack gone (count 0); second stack has 1 left
    expect(state.populations).toEqual([
      { id: 'p2', race: 'elves', count: 1, homeAreaId: null, workAreaId: null },
    ])
  })

  it('skips working stacks', () => {
    const realm: RealmState = {
      ...fresh(),
      populations: [
        { id: 'p1', race: 'humans', count: 5, homeAreaId: 'area-1', workAreaId: 'area-1' }, // working
        { id: 'p2', race: 'humans', count: 1, homeAreaId: null, workAreaId: null }, // idle
      ],
    }
    expect(() => commitIdlePopulation(realm, 2)).toThrow(/only 1 available/)
  })

  it('returns unchanged state when count is 0', () => {
    const realm = fresh()
    const { state, committed } = commitIdlePopulation(realm, 0)
    expect(state).toBe(realm)
    expect(committed).toEqual([])
  })
})

describe('idlePopulationByRace', () => {
  it('returns counts keyed by race, ignoring working stacks and zero counts', () => {
    const realm: RealmState = {
      ...fresh(),
      populations: [
        { id: 'p1', race: 'humans', count: 5, homeAreaId: null, workAreaId: null },
        { id: 'p2', race: 'dwarves', count: 3, homeAreaId: null, workAreaId: null },
        { id: 'p3', race: 'humans', count: 2, homeAreaId: 'a1', workAreaId: 'a1' }, // working — ignored
        { id: 'p4', race: 'elves', count: 0, homeAreaId: null, workAreaId: null }, // empty — ignored
      ],
    }
    expect(idlePopulationByRace(realm)).toEqual({ humans: 5, dwarves: 3 })
  })

  it('merges multiple idle stacks of the same race', () => {
    const realm: RealmState = {
      ...fresh(),
      populations: [
        { id: 'p1', race: 'humans', count: 2, homeAreaId: 'a1', workAreaId: null }, // homed but idle
        { id: 'p2', race: 'humans', count: 3, homeAreaId: null, workAreaId: null },
      ],
    }
    expect(idlePopulationByRace(realm)).toEqual({ humans: 5 })
  })
})

describe('commitIdlePopulationByRace', () => {
  it('returns empty committed for empty/zero mix', () => {
    const realm = fresh()
    expect(commitIdlePopulationByRace(realm, {})).toEqual({ state: realm, committed: [] })
    expect(commitIdlePopulationByRace(realm, { humans: 0 })).toEqual({ state: realm, committed: [] })
  })

  it('drains the requested mix from the idle pool', () => {
    const realm: RealmState = {
      ...fresh(),
      populations: [
        { id: 'h1', race: 'humans', count: 5, homeAreaId: null, workAreaId: null },
        { id: 'd1', race: 'dwarves', count: 3, homeAreaId: null, workAreaId: null },
        { id: 'e1', race: 'elves', count: 2, homeAreaId: null, workAreaId: null },
      ],
    }
    const { state, committed } = commitIdlePopulationByRace(realm, {
      humans: 2, dwarves: 1, elves: 1,
    })
    expect(committed).toEqual([
      { race: 'humans', count: 2, originalHomeAreaId: null },
      { race: 'dwarves', count: 1, originalHomeAreaId: null },
      { race: 'elves', count: 1, originalHomeAreaId: null },
    ])
    // Pool left: 3 humans, 2 dwarves, 1 elf
    expect(idlePopulationByRace(state)).toEqual({ humans: 3, dwarves: 2, elves: 1 })
  })

  it('throws when any race is short, naming the race', () => {
    const realm: RealmState = {
      ...fresh(),
      populations: [
        { id: 'h1', race: 'humans', count: 2, homeAreaId: null, workAreaId: null },
      ],
    }
    expect(() => commitIdlePopulationByRace(realm, { humans: 3 })).toThrow(PopulationCommitError)
    expect(() => commitIdlePopulationByRace(realm, { humans: 3 })).toThrow(
      /Need 3 idle humans? unit/,
    )
  })

  it('throws if the race has no idle stacks at all', () => {
    const realm: RealmState = {
      ...fresh(),
      populations: [
        { id: 'h1', race: 'humans', count: 5, homeAreaId: null, workAreaId: null },
      ],
    }
    expect(() => commitIdlePopulationByRace(realm, { elves: 1 })).toThrow(
      /only 0 available/,
    )
  })

  it('splits across multiple stacks of the same race (preserving originalHomeAreaId)', () => {
    const realm: RealmState = {
      ...fresh(),
      populations: [
        { id: 'h1', race: 'humans', count: 2, homeAreaId: 'a-1', workAreaId: null },
        { id: 'h2', race: 'humans', count: 3, homeAreaId: null,  workAreaId: null },
      ],
    }
    const { committed } = commitIdlePopulationByRace(realm, { humans: 4 })
    // First stack drained fully, second partially.
    expect(committed).toEqual([
      { race: 'humans', count: 2, originalHomeAreaId: 'a-1' },
      { race: 'humans', count: 2, originalHomeAreaId: null },
    ])
  })

  it('floors fractional counts and ignores negatives/NaN entries', () => {
    const realm: RealmState = {
      ...fresh(),
      populations: [
        { id: 'h1', race: 'humans', count: 5, homeAreaId: null, workAreaId: null },
      ],
    }
    const { committed } = commitIdlePopulationByRace(realm, {
      humans: 2.7,
      elves: -3,
      dwarves: NaN,
    })
    expect(committed).toEqual([{ race: 'humans', count: 2, originalHomeAreaId: null }])
  })

  it('commits round-trip with returnCommittedPopulation (race + home preserved)', () => {
    const realm: RealmState = {
      ...fresh(),
      populations: [
        { id: 'h1', race: 'humans', count: 5, homeAreaId: 'a-1', workAreaId: null },
        { id: 'e1', race: 'elves', count: 2, homeAreaId: null, workAreaId: null },
      ],
    }
    const { state: drained, committed } = commitIdlePopulationByRace(realm, {
      humans: 2, elves: 1,
    })
    const restored = returnCommittedPopulation(drained, committed, uuids('ret'))
    expect(idlePopulationByRace(restored)).toEqual({ humans: 5, elves: 2 })
  })
})

describe('returnCommittedPopulation', () => {
  it('restores chunks to their original homeAreaId as idle', () => {
    const realm: RealmState = {
      ...fresh(),
      populations: [], // start empty
    }
    const restored = returnCommittedPopulation(
      realm,
      [
        { race: 'humans', count: 2, originalHomeAreaId: 'area-3' },
        { race: 'elves', count: 1, originalHomeAreaId: null },
      ],
      uuids('ret'),
    )
    expect(restored.populations).toHaveLength(2)
    expect(restored.populations[0]).toMatchObject({
      race: 'humans',
      count: 2,
      homeAreaId: 'area-3',
      workAreaId: null,
    })
    expect(restored.populations[1]).toMatchObject({
      race: 'elves',
      count: 1,
      homeAreaId: null,
      workAreaId: null,
    })
  })

  it('merges with an existing matching stack (race + home + workAreaId=null)', () => {
    const existing: PopulationStack = {
      id: 'p-existing',
      race: 'humans',
      count: 3,
      homeAreaId: 'area-1',
      workAreaId: null,
    }
    const realm: RealmState = { ...fresh(), populations: [existing] }
    const restored = returnCommittedPopulation(
      realm,
      [{ race: 'humans', count: 2, originalHomeAreaId: 'area-1' }],
      uuids('ret'),
    )
    expect(restored.populations).toHaveLength(1)
    expect(restored.populations[0]).toMatchObject({
      id: 'p-existing',
      count: 5, // 3 + 2
    })
  })
})

describe('settleCommittedPopulation', () => {
  it('settles chunks at the target area as residents (homeAreaId = workAreaId = areaId)', () => {
    const realm = fresh()
    const targetArea = realm.areas[0]
    const settled = settleCommittedPopulation(
      { ...realm, populations: [] },
      [{ race: 'humans', count: 2, originalHomeAreaId: 'somewhere' }],
      targetArea.id,
      uuids('s'),
    )
    expect(settled.populations).toHaveLength(1)
    expect(settled.populations[0]).toMatchObject({
      race: 'humans',
      count: 2,
      homeAreaId: targetArea.id,
      workAreaId: targetArea.id,
    })
  })

  it('falls back to unallocated idle when target area does not exist', () => {
    const realm = fresh()
    const settled = settleCommittedPopulation(
      { ...realm, populations: [] },
      [{ race: 'humans', count: 2, originalHomeAreaId: null }],
      'no-such-area',
      uuids('s'),
    )
    expect(settled.populations[0]).toMatchObject({
      homeAreaId: null,
      workAreaId: null,
    })
  })
})

// ============================================================
// Integration — round-trip through Build Roads
// ============================================================

describe('Build Roads — pop commit + return integration', () => {
  it('throws when no idle pop, succeeds when there is', async () => {
    const { startBuildRoads } = await import('./construction')
    const noIdle: RealmState = {
      ...fresh(),
      populations: [{ id: 'p1', race: 'humans', count: 1, homeAreaId: 'a', workAreaId: 'a' }],
      resources: { ...fresh().resources, stone: 5, lumber: 5 },
    }
    expect(() => startBuildRoads(noIdle, { areaIds: [fresh().areas[0].id] }, 1, 'spring'))
      .toThrow(PopulationCommitError)

    // With idle pop, it succeeds
    const okRealm: RealmState = {
      ...fresh(),
      populations: [{ id: 'p1', race: 'humans', count: 5, homeAreaId: null, workAreaId: null }],
      resources: { ...fresh().resources, stone: 5, lumber: 5 },
    }
    const { state } = startBuildRoads(
      okRealm,
      { areaIds: [okRealm.strongholds[0].areaId] }, // connects to existing stronghold → not isolated
      1,
      'spring',
    )
    // 1 pop committed, 4 left idle
    expect(totalIdlePopulation(state)).toBe(4)
    // OngoingAction stores the committed chunks
    expect(state.ongoingActions).toHaveLength(1)
    expect((state.ongoingActions[0].parameters.popCommitted as { count: number }[]))
      .toEqual([{ race: 'humans', count: 1, originalHomeAreaId: null }])
  })

  it('completes and returns pop to idle after the road is built', async () => {
    const { endSeason } = await import('./orchestrator')
    const { startBuildRoads } = await import('./construction')
    const { createRng } = await import('../rng')
    let realm: RealmState = {
      ...fresh(),
      populations: [{ id: 'p1', race: 'humans', count: 5, homeAreaId: null, workAreaId: null }],
      resources: { ...fresh().resources, stone: 5, lumber: 5 },
    }
    realm = startBuildRoads(realm, { areaIds: [realm.strongholds[0].areaId] }, 1, 'spring').state
    expect(totalIdlePopulation(realm)).toBe(4)
    // 2 seasons to complete
    realm = endSeason(realm, createRng(7)).state
    realm = endSeason(realm, createRng(7)).state
    // Roads built, pop returned
    expect(realm.ongoingActions).toHaveLength(0)
    expect(totalIdlePopulation(realm)).toBe(5)
  })
})

// ============================================================
// Integration — Build Stronghold settlement vs non-settlement
// ============================================================

describe('Build Stronghold — settlement vs non-settlement pop outcome', () => {
  it('Village build: workers settle as residents of the new village area', async () => {
    const { endSeason } = await import('./orchestrator')
    const { startBuildStronghold } = await import('./construction')
    const { createRng } = await import('../rng')
    let realm: RealmState = {
      ...fresh(),
      populations: [{ id: 'p1', race: 'humans', count: 5, homeAreaId: null, workAreaId: null }],
      resources: { ...fresh().resources, stone: 10, gold: 10, lumber: 10 },
    }
    const targetArea = realm.areas.find((a) => a.terrain === 'plains')!
    realm = startBuildStronghold(realm, { kind: 'village', areaId: targetArea.id }, 1, 'spring').state
    expect(totalIdlePopulation(realm)).toBe(4) // 1 borrowed
    // 2 seasons to complete
    realm = endSeason(realm, createRng(7)).state
    realm = endSeason(realm, createRng(7)).state
    expect(realm.ongoingActions).toHaveLength(0)
    // Pop settled at target area: homeAreaId === targetArea.id, workAreaId === targetArea.id
    const settled = realm.populations.find(
      (p) => p.homeAreaId === targetArea.id && p.workAreaId === targetArea.id,
    )
    expect(settled?.count).toBe(1)
    // Idle pool should be 4 (the 4 we didn't borrow)
    expect(totalIdlePopulation(realm)).toBe(4)
  })

  it('Keep build: workers return to idle (NOT settled at the area)', async () => {
    const { endSeason } = await import('./orchestrator')
    const { startBuildStronghold } = await import('./construction')
    const { createRng } = await import('../rng')
    let realm: RealmState = {
      ...fresh(),
      populations: [{ id: 'p1', race: 'humans', count: 5, homeAreaId: null, workAreaId: null }],
      resources: { ...fresh().resources, stone: 10, gold: 10, lumber: 10 },
    }
    const targetArea = realm.areas.find((a) => a.terrain === 'plains')!
    realm = startBuildStronghold(realm, { kind: 'keep', areaId: targetArea.id }, 1, 'spring').state
    realm = endSeason(realm, createRng(7)).state
    realm = endSeason(realm, createRng(7)).state
    expect(totalIdlePopulation(realm)).toBe(5) // returned home
    // No residents settled at the target
    const onTarget = realm.populations.find((p) => p.homeAreaId === targetArea.id)
    expect(onTarget).toBeUndefined()
  })
})
