/**
 * Population commit/return helpers (Phase 3h).
 *
 * Construction (Build Roads, Build Stronghold, Convert Terrain) and
 * production (Produce Trade Goods) borrow workers from the realm's idle
 * pool while the action is in flight. On completion, the pop either
 * returns home (most actions) or settles permanently as residents of a
 * new village/town/city.
 *
 * The "idle pool" is any PopulationStack with workAreaId === null. Pop
 * with a homeAreaId is fine — they live somewhere but aren't currently
 * working a tile, so they're free to be drafted for construction.
 *
 * To support clean returns, we record per-chunk metadata about where
 * each borrowed unit came from. On completion we restore each chunk to
 * its original homeAreaId (workAreaId stays null — they're idle until
 * the player re-assigns them via Harvest Terrain).
 */

import type { Race } from '../../types/rules'
import type { PopulationStack, RealmState } from '../state'

// ============================================================
// Types
// ============================================================

/**
 * Metadata about a chunk of borrowed pop, stored in OngoingAction.parameters.
 * On completion we either return them to `originalHomeAreaId` (idle) or
 * settle them at a new area (for village/town/city builds).
 */
export interface CommittedPopChunk {
  race: Race
  count: number
  /**
   * Where this chunk came from. null = unallocated pool. Used to restore
   * the worker to their original home if the action returns pop.
   */
  originalHomeAreaId: string | null
}

export class PopulationCommitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PopulationCommitError'
  }
}

// ============================================================
// Counting
// ============================================================

/** Total idle pop (workAreaId === null) across the realm. */
export function totalIdlePopulation(state: RealmState): number {
  return state.populations.reduce(
    (sum, p) => (p.workAreaId === null ? sum + p.count : sum),
    0,
  )
}

/** Idle pop broken down by race (workAreaId === null). Zero races are omitted. */
export function idlePopulationByRace(state: RealmState): Partial<Record<Race, number>> {
  const out: Partial<Record<Race, number>> = {}
  for (const p of state.populations) {
    if (p.workAreaId !== null || p.count <= 0) continue
    out[p.race] = (out[p.race] ?? 0) + p.count
  }
  return out
}

// ============================================================
// Commit
// ============================================================

/**
 * Removes `count` total idle pop from the realm. Throws if insufficient.
 * Returns the new state plus a list of chunks describing what was taken
 * and where each chunk came from (so it can be returned later).
 *
 * Source order: stacks are walked in their existing array order, with
 * each stack drained as much as needed. Race composition is whatever
 * happens to be idle — the engine doesn't try to balance races.
 */
export function commitIdlePopulation(
  state: RealmState,
  count: number,
): { state: RealmState; committed: CommittedPopChunk[] } {
  if (count <= 0) {
    return { state, committed: [] }
  }
  const idle = totalIdlePopulation(state)
  if (idle < count) {
    throw new PopulationCommitError(
      `Need ${count} idle worker${count === 1 ? '' : 's'}, only ${idle} available. ` +
        `Free workers via Move Settlers or stop assigning them via Harvest Terrain.`,
    )
  }

  let remaining = count
  const committed: CommittedPopChunk[] = []
  const next: PopulationStack[] = []

  for (const stack of state.populations) {
    if (remaining <= 0 || stack.workAreaId !== null) {
      next.push(stack)
      continue
    }
    if (stack.count <= remaining) {
      // Drain the entire stack.
      committed.push({
        race: stack.race,
        count: stack.count,
        originalHomeAreaId: stack.homeAreaId,
      })
      remaining -= stack.count
      // Stack disappears (count becomes 0)
    } else {
      // Partial draw.
      committed.push({
        race: stack.race,
        count: remaining,
        originalHomeAreaId: stack.homeAreaId,
      })
      next.push({ ...stack, count: stack.count - remaining })
      remaining = 0
    }
  }

  return {
    state: { ...state, populations: next },
    committed,
  }
}

/**
 * Race-aware variant of `commitIdlePopulation`. Consumes exactly the counts
 * specified in `mix` from the idle pool. Throws if any race is short, or if
 * the mix totals zero (use `commitIdlePopulation(state, 0)` for that case).
 *
 * Within a single race the source order is still "walk stacks in array
 * order, drain each as needed" — same as `commitIdlePopulation`. So if two
 * idle-human stacks exist (e.g. some originally homed in area A, some in B),
 * the first one in array order is drained first.
 *
 * This is what construction/production callers use when the player wants to
 * specify *which* races contribute to a workforce. Callers that don't care
 * should keep using `commitIdlePopulation(count)`.
 */
export function commitIdlePopulationByRace(
  state: RealmState,
  mix: Partial<Record<Race, number>>,
): { state: RealmState; committed: CommittedPopChunk[] } {
  // Normalise: drop races with zero/negative counts; floor fractions.
  const normalised: Partial<Record<Race, number>> = {}
  let total = 0
  for (const [race, count] of Object.entries(mix) as [Race, number | undefined][]) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue
    const n = Math.floor(count)
    if (n <= 0) continue
    normalised[race] = n
    total += n
  }
  if (total === 0) return { state, committed: [] }

  // Pre-flight check: every race must have at least its requested count idle.
  const available = idlePopulationByRace(state)
  for (const [race, count] of Object.entries(normalised) as [Race, number][]) {
    const have = available[race] ?? 0
    if (have < count) {
      throw new PopulationCommitError(
        `Need ${count} idle ${race} unit${count === 1 ? '' : 's'} but only ${have} available.`,
      )
    }
  }

  // Drain each race's idle stacks in array order, recording chunks for return.
  const remainingByRace: Partial<Record<Race, number>> = { ...normalised }
  const committed: CommittedPopChunk[] = []
  const next: PopulationStack[] = []

  for (const stack of state.populations) {
    if (stack.workAreaId !== null) {
      next.push(stack)
      continue
    }
    const need = remainingByRace[stack.race] ?? 0
    if (need <= 0) {
      next.push(stack)
      continue
    }
    if (stack.count <= need) {
      committed.push({
        race: stack.race,
        count: stack.count,
        originalHomeAreaId: stack.homeAreaId,
      })
      remainingByRace[stack.race] = need - stack.count
      // Stack disappears.
    } else {
      committed.push({
        race: stack.race,
        count: need,
        originalHomeAreaId: stack.homeAreaId,
      })
      next.push({ ...stack, count: stack.count - need })
      remainingByRace[stack.race] = 0
    }
  }

  return { state: { ...state, populations: next }, committed }
}

// ============================================================
// Return
// ============================================================

/**
 * Adds the committed chunks back as idle pop, preserving each chunk's
 * original home. workAreaId is always null on return — the player must
 * use Harvest Terrain to re-assign work.
 *
 * Stacks are merged with existing matching (race, homeAreaId, workAreaId=null)
 * stacks if any exist; otherwise a new stack is appended.
 */
export function returnCommittedPopulation(
  state: RealmState,
  committed: CommittedPopChunk[],
  uuid: () => string = () => crypto.randomUUID(),
): RealmState {
  let next = state.populations
  for (const chunk of committed) {
    const idx = next.findIndex(
      (p) =>
        p.race === chunk.race &&
        p.homeAreaId === chunk.originalHomeAreaId &&
        p.workAreaId === null,
    )
    if (idx >= 0) {
      next = next.map((p, i) => (i === idx ? { ...p, count: p.count + chunk.count } : p))
    } else {
      next = [
        ...next,
        {
          id: uuid(),
          race: chunk.race,
          count: chunk.count,
          homeAreaId: chunk.originalHomeAreaId,
          workAreaId: null,
        },
      ]
    }
  }
  return { ...state, populations: next }
}

// ============================================================
// Settle (consume → become residents)
// ============================================================

/**
 * Settles the committed chunks at `areaId` permanently. Each chunk's
 * homeAreaId AND workAreaId become `areaId` — they're the new residents
 * who also work the area. Used when a Village/Town/City build completes:
 * the construction crew stays as the settlement's first inhabitants.
 *
 * If `areaId` doesn't exist (unlikely — area was deleted somehow), we
 * fall back to returning them to idle as unallocated.
 */
export function settleCommittedPopulation(
  state: RealmState,
  committed: CommittedPopChunk[],
  areaId: string,
  uuid: () => string = () => crypto.randomUUID(),
): RealmState {
  const areaExists = state.areas.some((a) => a.id === areaId)
  if (!areaExists) {
    return returnCommittedPopulation(
      state,
      committed.map((c) => ({ ...c, originalHomeAreaId: null })),
      uuid,
    )
  }

  let next = state.populations
  for (const chunk of committed) {
    const idx = next.findIndex(
      (p) =>
        p.race === chunk.race &&
        p.homeAreaId === areaId &&
        p.workAreaId === areaId,
    )
    if (idx >= 0) {
      next = next.map((p, i) => (i === idx ? { ...p, count: p.count + chunk.count } : p))
    } else {
      next = [
        ...next,
        {
          id: uuid(),
          race: chunk.race,
          count: chunk.count,
          homeAreaId: areaId,
          workAreaId: areaId,
        },
      ]
    }
  }
  return { ...state, populations: next }
}
