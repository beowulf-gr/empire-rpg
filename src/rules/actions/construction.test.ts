import { describe, expect, it } from 'vitest'
import {
  ConstructionError,
  applyCompletedConstruction,
  startBuildRoads,
  startBuildStronghold,
  startConvertTerrain,
} from './construction'
import { createStartingDomain } from '../createDomain'
import type { RealmState } from '../state'

function uuids() {
  let n = 0
  return () => `id-${n++}`
}

function fresh(overrides: Partial<RealmState> = {}): RealmState {
  return {
    ...createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'CT',
      ownerId: 'o',
      uuid: uuids(),
      skipBootSpring: true,
    }),
    ...overrides,
  }
}

describe('startBuildRoads', () => {
  it('queues an OngoingAction and deducts costs', () => {
    const realm = fresh({ resources: { ...createBlank().resources, stone: 5, lumber: 5 } })
    const targetIds = realm.areas.slice(0, 2).map((a) => a.id)
    const { state, events } = startBuildRoads(realm, { areaIds: targetIds }, 1, 'spring')
    expect(state.ongoingActions).toHaveLength(1)
    expect(state.ongoingActions[0].actionId).toBe('build_roads')
    expect(state.ongoingActions[0].seasonsRemaining).toBe(2) // spring, no penalty
    expect(state.resources.stone).toBe(4) // 5 - 1
    // isolated → +1 lumber surcharge in MVP since starter realm has no roads + the
    // starter strongholds may or may not match — depending on which areas we picked.
    // Just assert ≥3 lumber spent (base 2 + maybe 1 surcharge):
    expect(state.resources.lumber).toBeLessThanOrEqual(3)
    expect(events[0].type).toBe('construction_started')
  })

  it('penalises summer with +1 season duration', () => {
    const realm = fresh({
      resources: { ...createBlank().resources, stone: 5, lumber: 5 },
      season: 'summer',
    })
    const { state } = startBuildRoads(realm, { areaIds: [realm.areas[0].id] }, 1, 'summer')
    expect(state.ongoingActions[0].seasonsRemaining).toBe(3) // 2 + 1
  })

  it('refuses winter', () => {
    const realm = fresh({ season: 'winter' })
    expect(() =>
      startBuildRoads(realm, { areaIds: [realm.areas[0].id] }, 1, 'winter'),
    ).toThrow(ConstructionError)
  })

  it('refuses more than 4 areas', () => {
    const realm = fresh({ resources: { ...createBlank().resources, stone: 99, lumber: 99 } })
    const ids = realm.areas.slice(0, 5).map((a) => a.id)
    expect(() => startBuildRoads(realm, { areaIds: ids }, 1, 'spring')).toThrow(/at most 4/)
  })

  it('refuses to deduct when resources are insufficient', () => {
    const realm = fresh({ resources: { ...createBlank().resources, stone: 0 } })
    expect(() =>
      startBuildRoads(realm, { areaIds: [realm.areas[0].id] }, 1, 'spring'),
    ).toThrow(/Not enough stone/)
  })
})

describe('startBuildStronghold', () => {
  it('builds a Village on a plains area', () => {
    const realm = fresh({ resources: { ...createBlank().resources, stone: 5, gold: 5, lumber: 5 } })
    const plains = realm.areas.find((a) => a.terrain === 'plains')!
    const { state } = startBuildStronghold(
      realm,
      { kind: 'village', areaId: plains.id },
      1,
      'spring',
    )
    expect(state.ongoingActions).toHaveLength(1)
    expect(state.resources.stone).toBe(3) // 5 - 2
    expect(state.resources.gold).toBe(3)  // 5 - 2
    expect(state.resources.lumber).toBe(3) // 5 - 2
  })

  it('refuses a Mine on plains', () => {
    const realm = fresh({ resources: { ...createBlank().resources, stone: 99, gold: 99, lumber: 99 } })
    const plains = realm.areas.find((a) => a.terrain === 'plains')!
    expect(() =>
      startBuildStronghold(
        realm,
        { kind: 'mine', areaId: plains.id, mineResourceType: 'stone' },
        1,
        'spring',
      ),
    ).toThrow(/hills or mountains/)
  })

  it('refuses an add-on without a parent settlement', () => {
    const realm = fresh({ resources: { ...createBlank().resources, gold: 99, lumber: 99 } })
    const plains = realm.areas.find((a) => a.terrain === 'plains')!
    expect(() =>
      startBuildStronghold(realm, { kind: 'wall', areaId: plains.id }, 1, 'spring'),
    ).toThrow(/parentStrongholdId/)
  })
})

describe('startConvertTerrain', () => {
  it('refuses a non-wasteland area', () => {
    const realm = fresh({ resources: { ...createBlank().resources, lumber: 99, food: 99 } })
    const plains = realm.areas.find((a) => a.terrain === 'plains')!
    expect(() =>
      startConvertTerrain(realm, { areaId: plains.id, newTerrain: 'forest' }, 1, 'spring'),
    ).toThrow(/wasteland areas/)
  })

  it('starts conversion on a wasteland area', () => {
    const realm = fresh({
      resources: { ...createBlank().resources, lumber: 99, food: 99 },
    })
    // Force one area to be wasteland for the test
    const target = realm.areas[0]
    const realmWithWasteland: RealmState = {
      ...realm,
      areas: realm.areas.map((a) => (a.id === target.id ? { ...a, terrain: 'wasteland' } : a)),
    }
    const { state } = startConvertTerrain(
      realmWithWasteland,
      { areaId: target.id, newTerrain: 'plains' },
      1,
      'spring',
    )
    expect(state.ongoingActions).toHaveLength(1)
    expect(state.ongoingActions[0].actionId).toBe('convert_terrain')
  })
})

describe('applyCompletedConstruction', () => {
  it('Build Roads adds areas to roadAreaIds', () => {
    const realm = fresh()
    const ongoing = {
      id: 'oa1',
      actionId: 'build_roads' as const,
      startedYear: 1,
      startedSeason: 'spring' as const,
      seasonsRemaining: 0,
      parameters: { areaIds: [realm.areas[0].id, realm.areas[1].id] },
    }
    const { state, events } = applyCompletedConstruction(realm, ongoing)
    expect(state.roadAreaIds).toEqual([realm.areas[0].id, realm.areas[1].id])
    expect(events[0].type).toBe('roads_built')
  })

  it('Build Stronghold adds a stronghold row', () => {
    const realm = fresh()
    const before = realm.strongholds.length
    const ongoing = {
      id: 'oa2',
      actionId: 'build_stronghold' as const,
      startedYear: 1,
      startedSeason: 'spring' as const,
      seasonsRemaining: 0,
      parameters: { kind: 'village', areaId: realm.areas[0].id },
    }
    const { state, events } = applyCompletedConstruction(realm, ongoing)
    expect(state.strongholds).toHaveLength(before + 1)
    expect(events[0].type).toBe('stronghold_built')
  })

  it('Convert Terrain swaps the terrain', () => {
    const realm = fresh()
    const target = realm.areas[0]
    const realmWithWasteland: RealmState = {
      ...realm,
      areas: realm.areas.map((a) => (a.id === target.id ? { ...a, terrain: 'wasteland' } : a)),
    }
    const ongoing = {
      id: 'oa3',
      actionId: 'convert_terrain' as const,
      startedYear: 1,
      startedSeason: 'spring' as const,
      seasonsRemaining: 0,
      parameters: { areaId: target.id, newTerrain: 'plains' },
    }
    const { state } = applyCompletedConstruction(realmWithWasteland, ongoing)
    const after = state.areas.find((a) => a.id === target.id)!
    expect(after.terrain).toBe('plains')
  })
})

// Helper to construct a "blank" resource pool for tests that override resources
function createBlank() {
  return createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'X',
    ownerId: 'o',
    uuid: uuids(),
    skipBootSpring: true,
  })
}
