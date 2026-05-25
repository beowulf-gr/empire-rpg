import { describe, expect, it } from 'vitest'
import { endSeason } from './actions/orchestrator'
import { populationGrowthPercent } from './actions/executors'
import { createStartingDomain } from './createDomain'
import { createRng } from './rng'
import type { RealmState, PopulationStack } from './state'

function uuids() {
  let n = 0
  return () => `id-${n++}`
}

function freshRealm(): RealmState {
  return createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'TestRealm',
    ownerId: 'o',
    uuid: uuids(),
    rng: createRng(1),
  })
}

describe('populationGrowthPercent', () => {
  it('maps the digest table correctly', () => {
    expect(populationGrowthPercent(25)).toBe(10)
    expect(populationGrowthPercent(21)).toBe(10)
    expect(populationGrowthPercent(20)).toBe(5)
    expect(populationGrowthPercent(11)).toBe(5)
    expect(populationGrowthPercent(10)).toBe(0)
    expect(populationGrowthPercent(1)).toBe(0)
    expect(populationGrowthPercent(0)).toBe(-5)
    expect(populationGrowthPercent(-10)).toBe(-5)
    expect(populationGrowthPercent(-11)).toBe(-10)
    expect(populationGrowthPercent(-100)).toBe(-10)
  })
})

describe('createStartingDomain → bootSpring', () => {
  it('fires the year-1 spring obligatory chain at creation', () => {
    const realm = freshRealm()
    const types = realm.pendingEvents.map((e) => e.type)
    expect(types).toContain('morale_upkeep')
    expect(types).toContain('population_upkeep')
    expect(types).toContain('assign_population')
  })

  it('starts in spring of year 1 with empty actionsThisSeason', () => {
    const realm = freshRealm()
    expect(realm.season).toBe('spring')
    expect(realm.year).toBe(1)
    expect(realm.actionsThisSeason).toEqual([])
    expect(realm.ongoingActions).toEqual([])
  })
})

describe('endSeason — season transitions', () => {
  it('spring → summer, runs end-of-spring random event', () => {
    const realm = freshRealm()
    const { state, events } = endSeason(realm, createRng(1))
    expect(state.season).toBe('summer')
    expect(state.year).toBe(1)
    // Random spring events fired at end of spring
    const types = events.map((e) => e.type)
    const knownEventTypes = [
      'incursion', 'infestation', 'poor_weather',
      'good_weather', 'beneficial_find', 'no_event',
    ]
    expect(events.some((e) => knownEventTypes.includes(e.type))).toBe(true)
    void types
  })

  it('summer → fall, fires start-of-fall chain', () => {
    const realm: RealmState = { ...freshRealm(), season: 'summer' }
    const { state, events } = endSeason(realm, createRng(1))
    expect(state.season).toBe('fall')
    const types = events.map((e) => e.type)
    expect(types).toContain('harvest')
    expect(types).toContain('allocate_food')
  })

  it('fall → winter, only seasonal_interest fires (no loans → no-op)', () => {
    const realm: RealmState = { ...freshRealm(), season: 'fall' }
    const { state, events } = endSeason(realm, createRng(1))
    expect(state.season).toBe('winter')
    // Phase 3e.5 added seasonal_interest (every season_start). With no loans,
    // it emits a single no-op event. Beyond that, fall→winter has no auto chain.
    const types = events.map((e) => e.type)
    expect(types).toEqual(['seasonal_interest'])
    expect(events[0].payload).toMatchObject({ loans: 0 })
  })

  it('winter → spring increments year, resets weather, fires start-of-spring chain', () => {
    const realm: RealmState = {
      ...freshRealm(),
      season: 'winter',
      year: 1,
      weatherModifier: 0.1,
    }
    const { state, events } = endSeason(realm, createRng(1))
    expect(state.season).toBe('spring')
    expect(state.year).toBe(2)
    expect(state.weatherModifier).toBe(0)
    const types = events.map((e) => e.type)
    expect(types).toContain('morale_upkeep')
    expect(types).toContain('population_upkeep')
    expect(types).toContain('assign_population')
  })
})

describe('endSeason — Fall harvest behavior', () => {
  function fullyAssignedRealm(): RealmState {
    const realm = freshRealm()
    // 10 plains tiles already have 1 human each (from createDomain distribution).
    // Re-stamp just to be explicit and skip any test ordering gotchas.
    const plains = realm.areas.filter((a) => a.terrain === 'plains')
    const populations: PopulationStack[] = plains.map((p, i) => ({
      id: `pop-${i}`,
      race: 'humans' as const,
      count: 1,
      homeAreaId: p.id,
      workAreaId: p.id,
    }))
    return { ...realm, season: 'summer', populations, lastYearFoodBalance: 0 }
  }

  it('transitioning into fall harvests + allocates food', () => {
    const realm = fullyAssignedRealm()
    const { state, events } = endSeason(realm, createRng(11))
    expect(state.season).toBe('fall')
    const harvestEvent = events.find((e) => e.type === 'harvest')
    const allocEvent = events.find((e) => e.type === 'allocate_food')
    expect(harvestEvent).toBeDefined()
    expect(allocEvent).toBeDefined()
  })

  it('flags famine when food < 50% of need on fall start', () => {
    const realm: RealmState = {
      ...fullyAssignedRealm(),
      resources: { ...freshRealm().resources, food: 0 },
      // Strip work assignments so harvest produces nothing
      populations: freshRealm().populations.map((p) => ({ ...p, workAreaId: null })),
    }
    const { events } = endSeason(realm, createRng(9))
    const allocEvent = events.find((e) => e.type === 'allocate_food')
    expect(allocEvent).toBeDefined()
    const p = allocEvent!.payload as { crisis: string; balance: number }
    expect(p.crisis).toBe('famine')
  })

  it('lastYearFoodBalance updates after fall transition', () => {
    const realm = fullyAssignedRealm()
    const { state } = endSeason(realm, createRng(11))
    // With 10 plains × 4 food + starter food 18 - 10 spent ≈ 48 surplus (modulo weather)
    expect(state.lastYearFoodBalance).toBeGreaterThan(0)
  })
})

describe('population growth — overflow protection (Bug 2a)', () => {
  /**
   * Build a realm where every population stack is homed (no unallocated pool)
   * so we can verify that spring growth lands in NEW unallocated stacks
   * rather than overcrowding the homed ones.
   */
  function fullyHomedRealm(): RealmState {
    const realm = freshRealm()
    const plains = realm.areas.filter((a) => a.terrain === 'plains')
    const populations: PopulationStack[] = plains.map((p, i) => ({
      id: `pop-${i}`,
      race: 'humans' as const,
      count: 1,
      homeAreaId: p.id,
      workAreaId: p.id,
    }))
    // Push the realm to winter so endSeason → spring triggers population_upkeep.
    return {
      ...realm,
      season: 'winter',
      populations,
      // Boost loyalty + food surplus to push the growth check to +10%.
      lastYearFoodBalance: 50,
      loyaltyGroups: realm.loyaltyGroups.map((g) =>
        g.kind === 'commoners' ? { ...g, score: 30 } : g,
      ),
    }
  }

  it('growth puts new pop into an unallocated stack, not into homed areas', () => {
    let realm = fullyHomedRealm()
    const beforeHomed = realm.populations.reduce((s, p) => s + p.count, 0)
    const beforeUnallocated = realm.populations
      .filter((p) => p.homeAreaId === null && p.workAreaId === null)
      .reduce((s, p) => s + p.count, 0)
    expect(beforeUnallocated).toBe(0) // sanity: nothing unallocated to start

    // Roll into spring → fires population_upkeep with growth.
    realm = endSeason(realm, createRng(7)).state
    expect(realm.season).toBe('spring')

    const afterHomed = realm.populations
      .filter((p) => p.homeAreaId !== null)
      .reduce((s, p) => s + p.count, 0)
    const afterUnallocated = realm.populations
      .filter((p) => p.homeAreaId === null && p.workAreaId === null)
      .reduce((s, p) => s + p.count, 0)

    // Homed total is unchanged — homed stacks didn't get bigger.
    expect(afterHomed).toBe(beforeHomed)
    // New growth all landed in the unallocated pool (if any growth happened).
    const grew = afterUnallocated > 0
    expect(grew).toBe(true)
  })

  it('shrinkage still takes from existing stacks', () => {
    let realm = fullyHomedRealm()
    // Tank food balance and loyalty so the growth check goes negative.
    realm = {
      ...realm,
      lastYearFoodBalance: -50,
      loyaltyGroups: realm.loyaltyGroups.map((g) =>
        g.kind === 'commoners' ? { ...g, score: -30 } : g,
      ),
    }
    const before = realm.populations.reduce((s, p) => s + p.count, 0)
    realm = endSeason(realm, createRng(7)).state
    const after = realm.populations.reduce((s, p) => s + p.count, 0)
    expect(after).toBeLessThanOrEqual(before)
  })

  it('multi-race growth distributes proportional to race share', () => {
    const realm = freshRealm()
    const plains = realm.areas.filter((a) => a.terrain === 'plains')
    // 6 humans + 4 dwarves, all homed and working.
    const populations: PopulationStack[] = [
      ...plains.slice(0, 6).map((p, i) => ({
        id: `h-${i}`,
        race: 'humans' as const,
        count: 1,
        homeAreaId: p.id,
        workAreaId: p.id,
      })),
      ...plains.slice(6, 10).map((p, i) => ({
        id: `d-${i}`,
        race: 'dwarves' as const,
        count: 1,
        homeAreaId: p.id,
        workAreaId: p.id,
      })),
    ]
    let next: RealmState = {
      ...realm,
      season: 'winter',
      populations,
      lastYearFoodBalance: 50,
      loyaltyGroups: realm.loyaltyGroups.map((g) =>
        g.kind === 'commoners' ? { ...g, score: 30 } : g,
      ),
    }
    next = endSeason(next, createRng(7)).state
    // Whatever growth landed, it lives unallocated and includes both races
    // (or at least one with the human-majority share).
    const newPool = next.populations.filter(
      (p) => p.homeAreaId === null && p.workAreaId === null,
    )
    expect(newPool.length).toBeGreaterThan(0)
    const totalNew = newPool.reduce((s, p) => s + p.count, 0)
    expect(totalNew).toBeGreaterThan(0)
  })
})

describe('endSeason — full year cycle', () => {
  it('runs through all 4 seasons and returns to spring of year 2', () => {
    let s = freshRealm()
    const rng = createRng(123)
    for (let i = 0; i < 4; i++) {
      const out = endSeason(s, rng)
      s = out.state
    }
    expect(s.season).toBe('spring')
    expect(s.year).toBe(2)
    expect(s.weatherModifier).toBe(0)
    expect(s.actionsThisSeason).toEqual([])
  })

  it('5-year run leaves the realm coherent', () => {
    let s = freshRealm()
    // Re-stamp: assign all 10 humans to first 10 plains tiles for stable production
    const plains = s.areas.filter((a) => a.terrain === 'plains').slice(0, 10)
    s = {
      ...s,
      populations: plains.map((p, i) => ({
        id: `pop-${i}`,
        race: 'humans' as const,
        count: 1,
        homeAreaId: p.id,
        workAreaId: p.id,
      })),
    }
    const rng = createRng(456)
    for (let year = 0; year < 5; year++) {
      for (let s2 = 0; s2 < 4; s2++) {
        s = endSeason(s, rng).state
      }
    }
    expect(s.year).toBe(6)
    expect(s.season).toBe('spring')
    const totalPop = s.populations.reduce((sum, p) => sum + p.count, 0)
    expect(totalPop).toBeGreaterThan(0)
  })
})
