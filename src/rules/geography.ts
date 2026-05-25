/**
 * Geography & adjacency helpers (Phase 3i).
 *
 * Areas in a realm are laid out on an integer (positionX, positionY) grid.
 * Two areas are *adjacent* if their Manhattan distance is exactly 1 — i.e.,
 * 4-cardinal neighbors (no diagonals).
 *
 * The realm has a perimeter (the outer edge of its grid) which represents
 * "where our roads exit to foreign markets". An area is on the perimeter
 * if its position is at the min or max of any axis.
 *
 * Roads form a graph: two roaded areas are linked if they are 4-adjacent.
 * A stronghold "plugs into" the road network if its area has a road on it
 * OR is 4-adjacent to a roaded area.
 *
 * The trade-route question — "can our realm trade with the outside?" —
 * answers via two paths:
 *   1. We own a port. Ports trade directly with passing ships. ✓
 *   2. Some stronghold is graph-connected through the road network to a
 *      perimeter area. The road exits the realm there to a foreign market.
 *
 * If neither path holds, the realm is landlocked and roadless — no trade.
 */

import type { AreaState, RealmState } from './state'

// ============================================================
// Adjacency
// ============================================================

/**
 * Returns true if `a` and `b` are 4-cardinal neighbors (Manhattan distance 1).
 */
export function areAdjacent(a: AreaState, b: AreaState): boolean {
  if (a.id === b.id) return false
  const dx = Math.abs(a.positionX - b.positionX)
  const dy = Math.abs(a.positionY - b.positionY)
  return dx + dy === 1
}

/**
 * Returns the 4-adjacent areas of `area` from the given pool.
 */
export function adjacentAreas(area: AreaState, all: AreaState[]): AreaState[] {
  return all.filter((a) => areAdjacent(area, a))
}

// ============================================================
// Perimeter
// ============================================================

interface GridBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Computes the bounding box of the area grid. */
function gridBounds(areas: AreaState[]): GridBounds {
  if (areas.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  let minX = areas[0].positionX
  let maxX = areas[0].positionX
  let minY = areas[0].positionY
  let maxY = areas[0].positionY
  for (const a of areas) {
    if (a.positionX < minX) minX = a.positionX
    if (a.positionX > maxX) maxX = a.positionX
    if (a.positionY < minY) minY = a.positionY
    if (a.positionY > maxY) maxY = a.positionY
  }
  return { minX, maxX, minY, maxY }
}

/**
 * Returns true if `area` sits on the realm's perimeter — i.e., on any
 * outer edge of its bounding box. These are the areas where a road can
 * "exit" the realm to a foreign market.
 */
export function isPerimeterArea(area: AreaState, allAreas: AreaState[]): boolean {
  const b = gridBounds(allAreas)
  return (
    area.positionX === b.minX ||
    area.positionX === b.maxX ||
    area.positionY === b.minY ||
    area.positionY === b.maxY
  )
}

/** All perimeter area IDs in the realm. */
export function perimeterAreaIds(state: RealmState): Set<string> {
  const b = gridBounds(state.areas)
  const out = new Set<string>()
  for (const a of state.areas) {
    if (
      a.positionX === b.minX ||
      a.positionX === b.maxX ||
      a.positionY === b.minY ||
      a.positionY === b.maxY
    ) {
      out.add(a.id)
    }
  }
  return out
}

// ============================================================
// "Near a stronghold or road" — used by Convert Terrain
// ============================================================

/**
 * Is `area` itself a stronghold/road tile, OR is it 4-adjacent to one?
 * Used by Convert Terrain to determine the "isolated" surcharge.
 */
export function nearStrongholdOrRoad(state: RealmState, area: AreaState): boolean {
  const strongholdIds = new Set(state.strongholds.map((s) => s.areaId))
  const roadIds = new Set(state.roadAreaIds)
  if (strongholdIds.has(area.id) || roadIds.has(area.id)) return true
  for (const other of state.areas) {
    if (areAdjacent(area, other) && (strongholdIds.has(other.id) || roadIds.has(other.id))) {
      return true
    }
  }
  return false
}

// ============================================================
// Road-network graph traversal
// ============================================================

/**
 * Returns the set of road-area IDs reachable from `startAreaId` through
 * the road network. Two roaded areas are connected when 4-adjacent.
 *
 * If `startAreaId` itself doesn't have a road, the traversal still walks
 * into adjacent roaded tiles — the "stronghold plugs in via adjacency"
 * rule. The starting area is NOT added to the returned set unless it
 * itself has a road.
 */
export function reachableRoadAreas(
  state: RealmState,
  startAreaId: string,
): Set<string> {
  const roadIds = new Set(state.roadAreaIds)
  const areaById = new Map(state.areas.map((a) => [a.id, a]))
  const start = areaById.get(startAreaId)
  if (!start) return new Set()

  const visited = new Set<string>()
  const queue: string[] = []

  // Seed: the start tile if roaded, plus all roaded tiles 4-adjacent to it.
  if (roadIds.has(startAreaId)) {
    visited.add(startAreaId)
    queue.push(startAreaId)
  }
  for (const other of state.areas) {
    if (areAdjacent(start, other) && roadIds.has(other.id) && !visited.has(other.id)) {
      visited.add(other.id)
      queue.push(other.id)
    }
  }

  // BFS through the road network.
  while (queue.length > 0) {
    const id = queue.shift()!
    const here = areaById.get(id)
    if (!here) continue
    for (const other of state.areas) {
      if (visited.has(other.id)) continue
      if (!roadIds.has(other.id)) continue
      if (areAdjacent(here, other)) {
        visited.add(other.id)
        queue.push(other.id)
      }
    }
  }

  return visited
}

// ============================================================
// Trade-route status
// ============================================================

export interface TradeRouteStatus {
  /** Overall: can the realm trade with outside markets right now? */
  active: boolean
  /** Number of ports the realm owns (each is its own trade route). */
  portCount: number
  /**
   * IDs of strongholds that are graph-connected through the road network
   * to a perimeter area. Empty if no such strongholds exist.
   */
  connectedStrongholdIds: string[]
  /** Total roaded areas in the realm. */
  roadAreaCount: number
}

/**
 * Computes a snapshot of the realm's trade connectivity. Used by the
 * Sell/Buy panels for the "no trade route" message and by the dashboard
 * Trade Routes section.
 */
export function tradeRouteStatus(state: RealmState): TradeRouteStatus {
  const ports = state.strongholds.filter((s) => s.kind === 'port')
  const portCount = ports.length

  // Path 2: is some stronghold graph-connected to a perimeter area?
  const perimeter = perimeterAreaIds(state)
  const connectedStrongholdIds: string[] = []
  for (const s of state.strongholds) {
    const reachable = reachableRoadAreas(state, s.areaId)
    // The stronghold's own area also counts if it's on the perimeter and
    // has a road on it (the road exits there directly).
    if (reachable.size === 0) {
      // Stronghold isn't plugged into the road network — but it could
      // still be on the perimeter if its tile has a road.
      // (No road → no road-network path → can't trade via roads.)
      continue
    }
    const reachesEdge = Array.from(reachable).some((id) => perimeter.has(id))
    if (reachesEdge) {
      connectedStrongholdIds.push(s.id)
    }
  }

  return {
    active: portCount > 0 || connectedStrongholdIds.length > 0,
    portCount,
    connectedStrongholdIds,
    roadAreaCount: state.roadAreaIds.length,
  }
}
