/**
 * Harvest computation - per area and aggregated across the whole realm.
 *
 * Inputs: a RealmState (areas + populations + resources + weather modifier).
 * Output: a list of per-area HarvestResult (produced resources, area updates,
 * events) plus an aggregate ResourcePool delta.
 *
 * Rules implemented (section 4 and race section in rules-digest.md):
 *  - Each area produces its base output if at least its harvestPop units are
 *    assigned. Below that, no production.
 *  - Each *race* present on an area applies its per-area modifier ONCE
 *    (not per-pop-unit; the book's modifiers read "per area").
 *  - Hills default to 2 stone (a Survey action can later flip them to 1 mineral).
 *  - Mountains in mineral mode produce every mineral stored on the tile.
 *    A single rich vein yields +2 of that mineral per harvest; two distinct
 *    veins yield +1 of each per harvest (total still 2 mineral units). The
 *    minerals are stamped onto area.mineralResults by the Survey action
 *    and reused on subsequent harvests.
 *  - Ruins produce 1d10 - 4 gold (random per harvest).
 *  - Weather modifier (+0.10 / -0.10) scales all production at the end.
 *
 * MVP simplifications (deferred to a later phase):
 *  - Hills harvest-mode toggle (Survey for mineral) not yet exposed in UI.
 *  - Goblin "double pop" doubling mechanic is not implemented.
 *  - Trade-good production lives in a separate Produce Trade Goods flow, not here.
 */

import type {
  Race,
  ResourceKey,
  ResourcePool,
  Terrain,
} from '../types/rules'
import { TERRAIN_STATS } from '../types/rules'
import {
  populationByRaceWorkingArea,
  populationWorkingArea,
  type AreaState,
  type RealmState,
  type TurnEvent,
} from './state'
import type { Rng } from './rng'

export interface HarvestResult {
  areaId: string
  produced: Partial<ResourcePool>
  /** Reserved hook for future area mutations during harvest. */
  areaUpdates?: Partial<AreaState>
  events: TurnEvent[]
  /** True if at least the minimum pop was assigned and the area produced something. */
  active: boolean
}

// The d100 mineral table + lookup helper live in ./survey.ts - see
// surveyForMinerals(). Mineral production in this file simply reads the
// pre-rolled area.mineralResults set there.

const MINERAL_KEYS: readonly ResourceKey[] = [
  'adamantine',
  'copper',
  'gold_metal',
  'iron',
  'mithral',
  'silver',
]

/**
 * Race-specific per-area production modifier.
 * Applied once per area where the race is present. Receives a snapshot of the
 * base production AND the terrain so it can scale bonuses to whatever the area
 * is actually producing (e.g. dwarves' +0.5 mineral applies to the rolled
 * mineral type, not a generic "mineral" key).
 */
type RaceProductionModifier = (
  base: Partial<ResourcePool>,
  terrain: Terrain,
) => Partial<ResourcePool>

/** Returns ALL mineral keys currently being produced (1-2 entries). */
function findMineralKeys(base: Partial<ResourcePool>): ResourceKey[] {
  const out: ResourceKey[] = []
  for (const k of MINERAL_KEYS) {
    if ((base[k] ?? 0) > 0) out.push(k)
  }
  return out
}

const RACE_MODIFIERS: Record<Race, RaceProductionModifier> = {
  humans: () => ({}),
  halflings: () => ({}),
  elves: (_, terrain) =>
    terrain === 'forest' ? { lumber: 1, food: 1 } : {},
  dwarves: (base, terrain) => {
    if (terrain === 'hills') return { stone: 1 }
    if (terrain === 'mountains') {
      const keys = findMineralKeys(base)
      // Mineral mountain: +0.5 of EACH mineral being mined (twin-vein
      // mountains get the bonus applied to both); stone mountain: +1 stone.
      if (keys.length === 0) return { stone: 1 }
      const out: Partial<ResourcePool> = {}
      for (const k of keys) out[k] = 0.5
      return out
    }
    return {}
  },
  gnomes: (base, terrain) => {
    if (terrain === 'hills') return { stone: 0.5 }
    if (terrain === 'mountains') {
      const keys = findMineralKeys(base)
      // Mineral mountain: +0.25 of EACH mineral; stone mountain: +0.5 stone.
      if (keys.length === 0) return { stone: 0.5 }
      const out: Partial<ResourcePool> = {}
      for (const k of keys) out[k] = 0.25
      return out
    }
    return {}
  },
  goblins: (base) => {
    // -1 to each resource the area produces (book section 4). Goblin "double pop"
    // doubling is applied separately in harvestArea, not as a per-race delta.
    const out: Partial<ResourcePool> = {}
    for (const key of Object.keys(base) as ResourceKey[]) {
      out[key] = -1
    }
    return out
  },
  orcs: (base) => {
    // Book section 4: "Like goblins, reduce the output of any area the orcs work by
    // 1 unit for each resource that area produces." Orcs do NOT get the
    // goblin doubling - they're just penalised.
    const out: Partial<ResourcePool> = {}
    for (const key of Object.keys(base) as ResourceKey[]) {
      out[key] = -1
    }
    return out
  },
  undead: (base) => {
    // Undead can't farm - zero out food production.
    if (base.food !== undefined) return { food: -base.food }
    return {}
  },
}

/**
 * Computes one area's harvest. Pure except for the injected RNG (which is
 * still deterministic given a fixed seed).
 */
export function harvestArea(
  area: AreaState,
  state: RealmState,
  rng: Rng,
): HarvestResult {
  const stats = TERRAIN_STATS[area.terrain]
  const totalPop = populationWorkingArea(state, area.id)
  const events: TurnEvent[] = []

  // Below the minimum pop, area doesn't produce
  if (totalPop < stats.harvestPop || stats.harvestPop === 0) {
    return { areaId: area.id, produced: {}, events, active: false }
  }

  // Start with base production for this terrain
  const produced: Partial<ResourcePool> = {}
  if (stats.production.food !== undefined) produced.food = stats.production.food
  if (stats.production.lumber !== undefined) produced.lumber = stats.production.lumber
  if (stats.production.gold !== undefined) produced.gold = stats.production.gold

  // Hills / mountains: respect the player's harvestMode choice. Default
  // mode is 'stone' for both. The survey-for-minerals roll happens in
  // surveyForMinerals when the player toggles to mineral mode; it stamps
  // mineralResults with the discovered mineral keys. If the player toggles
  // to mineral mode without any stored minerals (shouldn't happen via the
  // UI but guard against it) the area falls back to stone production.
  let updatedArea: Partial<AreaState> | undefined
  if (area.terrain === 'hills') {
    if (area.harvestMode === 'mineral' && area.mineralResults.length > 0) {
      // Hills produce 1 mineral per harvest - they only ever hold a single
      // mineral in the list. Read the first entry just in case.
      const mineral = area.mineralResults[0] as ResourceKey
      produced[mineral] = (produced[mineral] ?? 0) + 1
    } else {
      produced.stone = 2
    }
  } else if (area.terrain === 'mountains') {
    if (area.harvestMode === 'mineral' && area.mineralResults.length > 0) {
      // Mountains: total mineral yield per harvest is 2 units. Single vein
      // gives +2 of that mineral. Twin veins give +1 of each (still 2 total).
      const perVein = area.mineralResults.length === 1 ? 2 : 1
      for (const m of area.mineralResults) {
        const k = m as ResourceKey
        produced[k] = (produced[k] ?? 0) + perVein
      }
    } else {
      produced.stone = (produced.stone ?? 0) + 4
    }
  }

  // Ruins: random gold (1d10 - 4)
  if (area.terrain === 'ruins' && stats.production.randomGold) {
    const r = rng.d10() + stats.production.randomGold.modifier
    if (r > 0) {
      produced.gold = (produced.gold ?? 0) + r
      events.push({ type: 'ruins_yield', payload: { areaId: area.id, gold: r } })
    }
  }

  // Apply race modifiers - once per race present on this area
  const racesPresent = populationByRaceWorkingArea(state, area.id)
  for (const race of Object.keys(racesPresent) as Race[]) {
    const mod = RACE_MODIFIERS[race](produced, area.terrain)
    for (const [key, val] of Object.entries(mod) as [ResourceKey, number][]) {
      produced[key] = (produced[key] ?? 0) + val
    }
  }

  // Goblin "double pop" (book section 4): "you can assign twice as many of them to
  // harvest an area as normal. If you do this, double the goblin's production.
  // This double takes place AFTER subtracting one for poor work efforts."
  //
  // We trigger doubling when goblins on this area are >= 2 x the terrain's
  // harvestPop minimum. Only the goblin race needs to be present - mixed-race
  // assignments don't get the bonus.
  const goblinCount = racesPresent.goblins ?? 0
  if (goblinCount > 0 && stats.harvestPop > 0 && goblinCount >= 2 * stats.harvestPop) {
    for (const key of Object.keys(produced) as ResourceKey[]) {
      // Doubling after the -1 mod; output values already have the penalty.
      // We don't double minerals stamped from a vein (mountains: the vein
      // produces a flat amount per harvest), but we do double the resource
      // outputs from the base/race calc.
      produced[key] = (produced[key] ?? 0) * 2
    }
  }

  // Floor at 0 - can't have negative production
  for (const key of Object.keys(produced) as ResourceKey[]) {
    if ((produced[key] ?? 0) < 0) produced[key] = 0
  }

  // Apply weather modifier (multiplicative): +/-10% across the board
  if (state.weatherModifier !== 0) {
    for (const key of Object.keys(produced) as ResourceKey[]) {
      produced[key] = (produced[key] ?? 0) * (1 + state.weatherModifier)
    }
  }

  return { areaId: area.id, produced, areaUpdates: updatedArea, events, active: true }
}

/**
 * Aggregates harvestArea across all areas in the realm. Returns a list of
 * per-area results (for the year-end summary modal) and a combined delta to
 * apply to the resource pool.
 */
export function harvestRealm(
  state: RealmState,
  rng: Rng,
): { results: HarvestResult[]; delta: Partial<ResourcePool> } {
  const results = state.areas.map((area) => harvestArea(area, state, rng))

  const delta: Partial<ResourcePool> = {}
  for (const r of results) {
    for (const [key, val] of Object.entries(r.produced) as [ResourceKey, number][]) {
      delta[key] = (delta[key] ?? 0) + val
    }
  }
  return { results, delta }
}

/**
 * Applies a Partial<ResourcePool> delta to a ResourcePool, returning a new pool.
 * Floors values at 0 (we never let resources go negative - shortfalls become events).
 */
export function applyResourceDelta(
  pool: ResourcePool,
  delta: Partial<ResourcePool>,
): ResourcePool {
  const next = { ...pool }
  for (const [key, val] of Object.entries(delta) as [ResourceKey, number][]) {
    next[key] = Math.max(0, next[key] + val)
  }
  return next
}
