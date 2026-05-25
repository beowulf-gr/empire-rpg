/**
 * Population reassignment — the canonical way to change population assignments.
 *
 * Each population stack has identity (race, homeAreaId, workAreaId).
 * Two stacks with matching identity are merged.
 *
 * Two operations are exposed:
 *
 *   movePopulationHome — change where pop LIVES (settlement). Housing is now
 *     INDEPENDENT of work by default: moving home leaves workAreaId untouched.
 *     Pass `keepWork: false` to also reset work to the new home (legacy "work
 *     follows home" behaviour — almost never wanted now that work assignment
 *     auto-houses; left in place for migrations or scripted setup).
 *
 *   setPopulationWork — change where pop WORKS (harvest). Home stays put.
 *     workAreaId can be null to set pop idle. The source may be the
 *     unallocated pool (homeAreaId=null); in that case, pass
 *     `autoHouseIfSpace: true` to also house the unit in the destination
 *     area when that area has free living space. This implements the rule
 *     "you assign them to harvest an area, and if they are unhoused and the
 *     area has living space remaining, they are housed there."
 *
 * Both throw AssignPopulationError on invalid moves (not enough source pop,
 * unknown area id, etc.). Both are pure: they take a state and return a new
 * state.
 *
 * The book gates these to Spring's "Assign Population" / "Allocate Projects →
 * Harvest Terrain" actions. The UI layer enforces season locking; the engine
 * itself doesn't care.
 */

import type { Race } from '../types/rules'
import {
  livingSpaceForArea,
  populationLivingOnArea,
  type PopulationStack,
  type RealmState,
} from './state'

export class AssignPopulationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssignPopulationError'
  }
}

// ============================================================
// Move home (relocate where pop lives)
// ============================================================

export interface MoveHomeInput {
  race: Race
  fromHomeAreaId: string | null
  toHomeAreaId: string | null
  count: number
  /**
   * If true (the default), leave the source stack's workAreaId alone.
   * Set to false to also overwrite work with toHomeAreaId (legacy
   * "work-follows-home" behaviour).
   */
  keepWork?: boolean
}

export function movePopulationHome(
  state: RealmState,
  input: MoveHomeInput,
  uuid: () => string = () => crypto.randomUUID(),
): RealmState {
  const { race, fromHomeAreaId, toHomeAreaId, count, keepWork = true } = input

  if (count <= 0) {
    throw new AssignPopulationError(`count must be > 0, got ${count}`)
  }
  if (fromHomeAreaId === toHomeAreaId) return state
  if (fromHomeAreaId !== null) validateAreaExists(state, fromHomeAreaId, 'source home')
  if (toHomeAreaId !== null) validateAreaExists(state, toHomeAreaId, 'destination home')

  // Find ANY stack with this race living at the source. We may need to draw
  // from multiple stacks (different work assignments) if count is large.
  const sources = state.populations
    .map((p, i) => ({ stack: p, index: i }))
    .filter(({ stack }) => stack.race === race && stack.homeAreaId === fromHomeAreaId)

  const totalAvailable = sources.reduce((sum, { stack }) => sum + stack.count, 0)
  if (totalAvailable < count) {
    throw new AssignPopulationError(
      `not enough ${race} ${fromHomeAreaId === null ? 'in the unallocated pool' : 'living at ' + fromHomeAreaId} (have ${totalAvailable}, need ${count})`,
    )
  }

  // Draw `count` units from source stacks (largest-count first for stability)
  let remaining = count
  const ordered = [...sources].sort((a, b) => b.stack.count - a.stack.count)
  let nextPopulations: PopulationStack[] = [...state.populations]

  for (const { stack, index } of ordered) {
    if (remaining <= 0) break
    const take = Math.min(stack.count, remaining)
    nextPopulations[index] = { ...stack, count: stack.count - take }

    // Move into destination — preserve OR reset work depending on keepWork
    const newWorkAreaId = keepWork ? stack.workAreaId : toHomeAreaId
    nextPopulations = mergeOrAddDestination(
      nextPopulations,
      race,
      toHomeAreaId,
      newWorkAreaId,
      take,
      uuid,
    )
    remaining -= take
  }

  return { ...state, populations: nextPopulations.filter((p) => p.count > 0) }
}

// ============================================================
// Set work (change where pop harvests)
// ============================================================

export interface SetWorkInput {
  race: Race
  /**
   * Home of the source stack. Pass `null` to source from the unallocated
   * pool (homeAreaId=null). When sourcing from the pool you'll usually
   * want `autoHouseIfSpace: true` so the unit moves into the work area
   * if there's living space.
   */
  homeAreaId: string | null
  fromWorkAreaId: string | null
  toWorkAreaId: string | null
  count: number
  /**
   * When true AND the source is the pool (homeAreaId=null) AND a non-null
   * `toWorkAreaId` is given AND that area has free living space, the moved
   * unit's homeAreaId becomes the work area (auto-housing). Otherwise the
   * unit is set to work but stays in the pool (unhoused). Has no effect
   * when sourcing from an already-housed stack.
   */
  autoHouseIfSpace?: boolean
}

export function setPopulationWork(
  state: RealmState,
  input: SetWorkInput,
  uuid: () => string = () => crypto.randomUUID(),
): RealmState {
  const {
    race,
    homeAreaId,
    fromWorkAreaId,
    toWorkAreaId,
    count,
    autoHouseIfSpace = false,
  } = input

  if (count <= 0) {
    throw new AssignPopulationError(`count must be > 0, got ${count}`)
  }
  if (fromWorkAreaId === toWorkAreaId) return state
  if (homeAreaId !== null) validateAreaExists(state, homeAreaId, 'home')
  if (fromWorkAreaId !== null) validateAreaExists(state, fromWorkAreaId, 'source work')
  if (toWorkAreaId !== null) validateAreaExists(state, toWorkAreaId, 'destination work')

  const sourceIdx = state.populations.findIndex(
    (p) =>
      p.race === race &&
      p.homeAreaId === homeAreaId &&
      p.workAreaId === fromWorkAreaId,
  )
  if (sourceIdx === -1) {
    throw new AssignPopulationError(
      `no ${race} stack found at home=${homeAreaId} work=${fromWorkAreaId}`,
    )
  }
  const source = state.populations[sourceIdx]
  if (source.count < count) {
    throw new AssignPopulationError(
      `not enough ${race} (have ${source.count}, need ${count})`,
    )
  }

  // Decide if we auto-house. Only relevant when sourcing from the pool, a
  // real work area is being set, and the caller opted in via the flag.
  // Living-space check uses the *current* state before we move anyone in,
  // so it's a snapshot — if the area is one short, we accept the unit; if
  // it's already at capacity, we keep them unhoused. Capacity-blocked
  // overflow is intentional: the player can manually relocate residents
  // later via Move Settlers.
  const shouldAutoHouse =
    autoHouseIfSpace &&
    homeAreaId === null &&
    toWorkAreaId !== null &&
    populationLivingOnArea(state, toWorkAreaId) < livingSpaceForArea(state, toWorkAreaId)

  const destinationHomeAreaId = shouldAutoHouse ? toWorkAreaId : homeAreaId

  let nextPopulations: PopulationStack[] = state.populations.map((p, i) =>
    i === sourceIdx ? { ...p, count: p.count - count } : p,
  )
  nextPopulations = mergeOrAddDestination(
    nextPopulations,
    race,
    destinationHomeAreaId,
    toWorkAreaId,
    count,
    uuid,
  )
  return { ...state, populations: nextPopulations.filter((p) => p.count > 0) }
}

// ============================================================
// Internal helpers
// ============================================================

function validateAreaExists(state: RealmState, areaId: string, label: string): void {
  if (!state.areas.some((a) => a.id === areaId)) {
    throw new AssignPopulationError(`${label} area ${areaId} not in realm`)
  }
}

function mergeOrAddDestination(
  populations: PopulationStack[],
  race: Race,
  homeAreaId: string | null,
  workAreaId: string | null,
  count: number,
  uuid: () => string,
): PopulationStack[] {
  const idx = populations.findIndex(
    (p) =>
      p.race === race &&
      p.homeAreaId === homeAreaId &&
      p.workAreaId === workAreaId,
  )
  if (idx === -1) {
    return [
      ...populations,
      { id: uuid(), race, count, homeAreaId, workAreaId },
    ]
  }
  return populations.map((p, i) =>
    i === idx ? { ...p, count: p.count + count } : p,
  )
}
