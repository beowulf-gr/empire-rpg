import { describe, expect, it } from 'vitest'
import {
  adjacentAreas,
  areAdjacent,
  isPerimeterArea,
  nearStrongholdOrRoad,
  perimeterAreaIds,
  reachableRoadAreas,
  tradeRouteStatus,
} from './geography'
import { createStartingDomain } from './createDomain'
import type { AreaState, RealmState, StrongholdState } from './state'

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

function makeArea(id: string, x: number, y: number): AreaState {
  return {
    id,
    terrain: 'plains',
    secondaryTerrain: null,
    mineralResults: [],
    harvestMode: null,
    positionX: x,
    positionY: y,
  }
}

function makeStronghold(id: string, areaId: string, kind: StrongholdState['kind'] = 'keep'): StrongholdState {
  return {
    id,
    areaId,
    kind,
    parentStrongholdId: null,
    mineResourceType: null,
    source: 'official',
  }
}

// ============================================================
// Adjacency
// ============================================================

describe('areAdjacent', () => {
  it('returns true for 4-cardinal neighbors', () => {
    const a = makeArea('a', 1, 1)
    expect(areAdjacent(a, makeArea('b', 0, 1))).toBe(true)
    expect(areAdjacent(a, makeArea('b', 2, 1))).toBe(true)
    expect(areAdjacent(a, makeArea('b', 1, 0))).toBe(true)
    expect(areAdjacent(a, makeArea('b', 1, 2))).toBe(true)
  })

  it('returns false for diagonals', () => {
    const a = makeArea('a', 1, 1)
    expect(areAdjacent(a, makeArea('b', 0, 0))).toBe(false)
    expect(areAdjacent(a, makeArea('b', 2, 2))).toBe(false)
  })

  it('returns false for the same area', () => {
    const a = makeArea('a', 1, 1)
    expect(areAdjacent(a, a)).toBe(false)
  })

  it('returns false for distant areas', () => {
    const a = makeArea('a', 1, 1)
    expect(areAdjacent(a, makeArea('b', 1, 5))).toBe(false)
  })
})

describe('adjacentAreas', () => {
  it('returns 4 neighbors for an interior tile', () => {
    const all = [
      makeArea('c', 1, 1), // center
      makeArea('n', 1, 0), makeArea('s', 1, 2),
      makeArea('e', 2, 1), makeArea('w', 0, 1),
      makeArea('x', 5, 5), // far away
    ]
    const center = all[0]
    const adj = adjacentAreas(center, all)
    expect(adj.map((a) => a.id).sort()).toEqual(['e', 'n', 's', 'w'])
  })
})

// ============================================================
// Perimeter
// ============================================================

describe('isPerimeterArea / perimeterAreaIds', () => {
  it('marks edge tiles of a 5×4 grid as perimeter', () => {
    const realm = fresh()
    // Standard climate creates a 5×4 grid (20 areas). Position bounds: x∈[0,4], y∈[0,3].
    const corner = realm.areas.find((a) => a.positionX === 0 && a.positionY === 0)!
    expect(isPerimeterArea(corner, realm.areas)).toBe(true)
    const interior = realm.areas.find((a) => a.positionX === 2 && a.positionY === 1)
    if (interior) {
      expect(isPerimeterArea(interior, realm.areas)).toBe(false)
    }
  })

  it('all 5×4 corners + edges are 14 perimeter tiles (20 - 6 interior)', () => {
    const realm = fresh()
    const ids = perimeterAreaIds(realm)
    // 5×4 grid: perimeter = 2×5 + 2×(4-2) = 10 + 4 = 14
    expect(ids.size).toBe(14)
  })
})

// ============================================================
// nearStrongholdOrRoad
// ============================================================

describe('nearStrongholdOrRoad', () => {
  it('returns true for an area that has a stronghold on it', () => {
    const realm = fresh()
    const here = realm.areas.find((a) => a.id === realm.strongholds[0].areaId)!
    expect(nearStrongholdOrRoad(realm, here)).toBe(true)
  })

  it('returns true for an area adjacent to a stronghold', () => {
    const realm = fresh()
    const strongholdAreaId = realm.strongholds[0].areaId
    const sArea = realm.areas.find((a) => a.id === strongholdAreaId)!
    const adj = realm.areas.find(
      (a) =>
        a.id !== strongholdAreaId &&
        Math.abs(a.positionX - sArea.positionX) +
          Math.abs(a.positionY - sArea.positionY) ===
          1,
    )!
    expect(nearStrongholdOrRoad(realm, adj)).toBe(true)
  })

  it('returns true for an area adjacent to a road', () => {
    const realm = fresh()
    // Pick an area with no stronghold near it.
    const isolated = realm.areas.find(
      (a) =>
        !realm.strongholds.some((s) => s.areaId === a.id) &&
        !realm.areas.some(
          (b) =>
            realm.strongholds.some((s) => s.areaId === b.id) &&
            Math.abs(a.positionX - b.positionX) +
              Math.abs(a.positionY - b.positionY) ===
              1,
        ),
    )!
    expect(nearStrongholdOrRoad(realm, isolated)).toBe(false)
    // Now lay a road on a 4-adjacent tile.
    const adj = realm.areas.find(
      (a) =>
        Math.abs(a.positionX - isolated.positionX) +
          Math.abs(a.positionY - isolated.positionY) ===
          1,
    )!
    const seeded: RealmState = { ...realm, roadAreaIds: [adj.id] }
    expect(nearStrongholdOrRoad(seeded, isolated)).toBe(true)
  })
})

// ============================================================
// reachableRoadAreas
// ============================================================

describe('reachableRoadAreas', () => {
  it('returns empty when no roads exist', () => {
    const realm = fresh()
    expect(reachableRoadAreas(realm, realm.areas[0].id).size).toBe(0)
  })

  it('walks a connected road chain', () => {
    const realm = fresh()
    // Pick a chain of three 4-adjacent areas: (0,0)-(1,0)-(2,0).
    const a = realm.areas.find((p) => p.positionX === 0 && p.positionY === 0)!
    const b = realm.areas.find((p) => p.positionX === 1 && p.positionY === 0)!
    const c = realm.areas.find((p) => p.positionX === 2 && p.positionY === 0)!
    const seeded: RealmState = { ...realm, roadAreaIds: [a.id, b.id, c.id] }
    // Start from the FIRST tile (which has a road) — should reach all three.
    const reachable = reachableRoadAreas(seeded, a.id)
    expect(reachable).toEqual(new Set([a.id, b.id, c.id]))
  })

  it('plugs a stronghold-area into adjacent road network even without its own road', () => {
    const realm = fresh()
    const sArea = realm.areas.find((p) => p.positionX === 1 && p.positionY === 1)!
    const adj = realm.areas.find((p) => p.positionX === 1 && p.positionY === 0)!
    const far = realm.areas.find((p) => p.positionX === 1 && p.positionY === 0 ? false : false)
    void far
    const seeded: RealmState = {
      ...realm,
      roadAreaIds: [adj.id], // road on adjacent tile only
    }
    const reachable = reachableRoadAreas(seeded, sArea.id)
    expect(reachable.has(adj.id)).toBe(true)
    // sArea itself isn't in reachable since it has no road
    expect(reachable.has(sArea.id)).toBe(false)
  })

  it('does not jump across a non-roaded gap', () => {
    const realm = fresh()
    // Roads at (0,0) and (2,0); (1,0) is unrouted → traversal stops.
    const a = realm.areas.find((p) => p.positionX === 0 && p.positionY === 0)!
    const c = realm.areas.find((p) => p.positionX === 2 && p.positionY === 0)!
    const seeded: RealmState = { ...realm, roadAreaIds: [a.id, c.id] }
    const reachable = reachableRoadAreas(seeded, a.id)
    expect(reachable).toEqual(new Set([a.id]))
  })
})

// ============================================================
// tradeRouteStatus
// ============================================================

describe('tradeRouteStatus', () => {
  it('starter realm: no port, no roads → not active', () => {
    const realm = fresh()
    const status = tradeRouteStatus(realm)
    expect(status.active).toBe(false)
    expect(status.portCount).toBe(0)
    expect(status.connectedStrongholdIds).toEqual([])
    expect(status.roadAreaCount).toBe(0)
  })

  it('any port → active', () => {
    const realm = fresh()
    const seeded: RealmState = {
      ...realm,
      strongholds: [
        ...realm.strongholds,
        makeStronghold('p1', realm.areas[0].id, 'port'),
      ],
    }
    const status = tradeRouteStatus(seeded)
    expect(status.active).toBe(true)
    expect(status.portCount).toBe(1)
  })

  it('stronghold connected via roads to perimeter → active', () => {
    const realm = fresh()
    // Find an interior stronghold's area, then road a path from it to a
    // perimeter tile. Starter realm places strongholds on the most
    // habitable plains tiles, which may already be on the perimeter — so
    // we engineer a setup explicitly.
    const interior = realm.areas.find((a) => a.positionX === 2 && a.positionY === 1)!
    const adjPerimeter = realm.areas.find((a) => a.positionX === 2 && a.positionY === 0)! // y=0 is perimeter
    const seeded: RealmState = {
      ...realm,
      strongholds: [makeStronghold('k1', interior.id, 'keep')],
      roadAreaIds: [adjPerimeter.id],
    }
    const status = tradeRouteStatus(seeded)
    expect(status.active).toBe(true)
    expect(status.connectedStrongholdIds).toContain('k1')
  })

  it('stronghold with road but not reaching perimeter → not active (no port)', () => {
    const realm = fresh()
    // Interior stronghold + road only on the stronghold's interior tile.
    const interior = realm.areas.find((a) => a.positionX === 2 && a.positionY === 1)!
    const seeded: RealmState = {
      ...realm,
      strongholds: [makeStronghold('k1', interior.id, 'keep')],
      roadAreaIds: [interior.id], // road exists, but doesn't reach the edge
    }
    const status = tradeRouteStatus(seeded)
    expect(status.active).toBe(false)
  })

  it('stronghold ON a perimeter area with a road on it → active', () => {
    const realm = fresh()
    const corner = realm.areas.find((a) => a.positionX === 0 && a.positionY === 0)!
    const seeded: RealmState = {
      ...realm,
      strongholds: [makeStronghold('k1', corner.id, 'keep')],
      roadAreaIds: [corner.id],
    }
    const status = tradeRouteStatus(seeded)
    expect(status.active).toBe(true)
  })
})
