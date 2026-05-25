import { describe, expect, it } from 'vitest'
import { applyResourceDelta, harvestArea, harvestRealm } from './harvest'
import { createStartingDomain } from './createDomain'
import { createRng } from './rng'
import type { AreaState, RealmState } from './state'
import { EMPTY_RESOURCE_POOL } from '../types/rules'

function uuids() {
  let n = 0
  return () => `id-${n++}`
}

/** Build a minimal realm with a single area + N humans assigned to it. */
function realmWithSingleArea(area: AreaState, humansAssigned: number): RealmState {
  return {
    id: 'realm',
    ownerId: 'owner',
    name: 'TestRealm',
    scale: 'barony',
    climateTemplate: 'standard',
    year: 1,
    season: 'spring',
    resources: { ...EMPTY_RESOURCE_POOL },
    populations: humansAssigned > 0
      ? [{ id: 'p1', race: 'humans', count: humansAssigned, homeAreaId: area.id, workAreaId: area.id }]
      : [],
    areas: [area],
    strongholds: [],
    loyaltyGroups: [
      { id: 'g1', kind: 'commoners', label: 'General population', baseWillSave: 2, score: 0 },
    ],
    lastFoodCrisis: 'none',
    roadAreaIds: [],
    militaryUnits: [],
    ministers: [],
    loans: [],
    tradeGoods: { exotic_items: 0, magic_items: 0, weapons_and_armor: 0, wooden_goods: 0 },
    pendingBribes: [],
    pendingEvents: [],
    weatherModifier: 0,
    lastYearFoodBalance: 0,
    actionsThisSeason: [],
    ongoingActions: [],
    ruler: {
      name: 'Test Ruler',
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
      diplomacy: 0,
      knowledgeEconomics: 0,
    },
    orcIdlePenalty: 0,
  }
}

const PLAINS: AreaState = {
  id: 'plains-1', terrain: 'plains', secondaryTerrain: null, mineralResults: [], harvestMode: null,
  positionX: 0, positionY: 0,
}
const FOREST: AreaState = {
  id: 'forest-1', terrain: 'forest', secondaryTerrain: null, mineralResults: [], harvestMode: null,
  positionX: 0, positionY: 0,
}
const HILLS: AreaState = {
  id: 'hills-1', terrain: 'hills', secondaryTerrain: null, mineralResults: [], harvestMode: null,
  positionX: 0, positionY: 0,
}
const MOUNTAINS: AreaState = {
  id: 'mountains-1', terrain: 'mountains', secondaryTerrain: null, mineralResults: [], harvestMode: null,
  positionX: 0, positionY: 0,
}
const SWAMP: AreaState = {
  id: 'swamp-1', terrain: 'swamp', secondaryTerrain: null, mineralResults: [], harvestMode: null,
  positionX: 0, positionY: 0,
}
const WATER: AreaState = {
  id: 'water-1', terrain: 'water', secondaryTerrain: null, mineralResults: [], harvestMode: null,
  positionX: 0, positionY: 0,
}
const WASTELAND: AreaState = {
  id: 'wasteland-1', terrain: 'wasteland', secondaryTerrain: null, mineralResults: [], harvestMode: null,
  positionX: 0, positionY: 0,
}

describe('harvestArea — base production by terrain', () => {
  it('plains with 1 human produces 4 food', () => {
    const realm = realmWithSingleArea(PLAINS, 1)
    const r = harvestArea(PLAINS, realm, createRng(1))
    expect(r.active).toBe(true)
    expect(r.produced).toEqual({ food: 4 })
  })

  it('plains with 0 humans produces nothing (active=false)', () => {
    const realm = realmWithSingleArea(PLAINS, 0)
    const r = harvestArea(PLAINS, realm, createRng(1))
    expect(r.active).toBe(false)
    expect(r.produced).toEqual({})
  })

  it('forest with 1 human produces 4 lumber + 1 food', () => {
    const realm = realmWithSingleArea(FOREST, 1)
    const r = harvestArea(FOREST, realm, createRng(1))
    expect(r.produced).toEqual({ lumber: 4, food: 1 })
  })

  it('hills with 2 humans produces 2 stone (MVP default)', () => {
    const realm = realmWithSingleArea(HILLS, 2)
    const r = harvestArea(HILLS, realm, createRng(1))
    expect(r.produced.stone).toBe(2)
  })

  it('hills with 1 human (below 2-pop minimum) produces nothing', () => {
    const realm = realmWithSingleArea(HILLS, 1)
    const r = harvestArea(HILLS, realm, createRng(1))
    expect(r.active).toBe(false)
  })

  it('swamp with 2 humans produces 1 food + 1 gold', () => {
    const realm = realmWithSingleArea(SWAMP, 2)
    const r = harvestArea(SWAMP, realm, createRng(1))
    expect(r.produced).toEqual({ food: 1, gold: 1 })
  })

  it('water with 1 human produces 2 food', () => {
    const realm = realmWithSingleArea(WATER, 1)
    const r = harvestArea(WATER, realm, createRng(1))
    expect(r.produced).toEqual({ food: 2 })
  })

  it('wasteland never produces anything', () => {
    const realm = realmWithSingleArea(WASTELAND, 5)
    const r = harvestArea(WASTELAND, realm, createRng(1))
    expect(r.active).toBe(false)
  })

  it('hills default to 2 stone when harvestMode is unset', () => {
    const realm = realmWithSingleArea(HILLS, 2)
    const r = harvestArea(HILLS, realm, createRng(1))
    expect(r.produced).toEqual({ stone: 2 })
    // Surveying happens via surveyForMinerals now — harvestArea never rolls
    // d100 on its own.
    expect(r.events.some((e) => e.type === 'mineral_discovered')).toBe(false)
  })

  it('hills in mineral mode with a stamped mineral produce 1 of that mineral', () => {
    const hillsWithIron: AreaState = {
      ...HILLS,
      mineralResults: ['iron'],
      harvestMode: 'mineral',
    }
    const realm = realmWithSingleArea(hillsWithIron, 2)
    const r = harvestArea(hillsWithIron, realm, createRng(1))
    expect(r.produced).toEqual({ iron: 1 })
  })

  it('mountains default to 4 stone when harvestMode is unset (no auto-roll)', () => {
    const realm = realmWithSingleArea(MOUNTAINS, 2)
    const r = harvestArea(MOUNTAINS, realm, createRng(1))
    expect(r.produced).toEqual({ stone: 4 })
    expect(r.events.some((e) => e.type === 'mineral_discovered')).toBe(false)
    expect(r.areaUpdates).toBeUndefined()
  })

  it('mountains in mineral mode with one mineral produce +2 of that mineral', () => {
    const mountainWithIron: AreaState = {
      ...MOUNTAINS,
      mineralResults: ['iron'],
      harvestMode: 'mineral',
    }
    const realm = realmWithSingleArea(mountainWithIron, 2)
    const r = harvestArea(mountainWithIron, realm, createRng(1))
    expect(r.produced).toEqual({ iron: 2 })
  })

  it('mountains with two different minerals produce +1 of each (twin veins)', () => {
    const mountainTwin: AreaState = {
      ...MOUNTAINS,
      mineralResults: ['iron', 'silver'],
      harvestMode: 'mineral',
    }
    const realm = realmWithSingleArea(mountainTwin, 2)
    const r = harvestArea(mountainTwin, realm, createRng(1))
    expect(r.produced).toEqual({ iron: 1, silver: 1 })
  })

  it('mountains in mineral mode with no mineralResults fall back to base (defensive)', () => {
    // Shouldn't happen via the UI but guard against state corruption.
    const broken: AreaState = { ...MOUNTAINS, harvestMode: 'mineral', mineralResults: [] }
    const realm = realmWithSingleArea(broken, 2)
    const r = harvestArea(broken, realm, createRng(1))
    expect(r.produced).toEqual({ stone: 4 })
  })
})

describe('harvestArea — race modifiers', () => {
  it('elves on a forest add +1 lumber and +1 food', () => {
    const realm: RealmState = {
      ...realmWithSingleArea(FOREST, 0),
      populations: [{ id: 'p', race: 'elves', count: 1, homeAreaId: FOREST.id, workAreaId: FOREST.id }],
    }
    const r = harvestArea(FOREST, realm, createRng(1))
    // Base 4 lumber + 1 food; elf bonus +1 lumber +1 food = 5/2
    expect(r.produced).toEqual({ lumber: 5, food: 2 })
  })

  it('elves on plains do NOT add any bonus (forest-only)', () => {
    const realm: RealmState = {
      ...realmWithSingleArea(PLAINS, 0),
      populations: [{ id: 'p', race: 'elves', count: 1, homeAreaId: PLAINS.id, workAreaId: PLAINS.id }],
    }
    const r = harvestArea(PLAINS, realm, createRng(1))
    expect(r.produced).toEqual({ food: 4 })
  })

  it('dwarves on hills add +1 stone', () => {
    const realm: RealmState = {
      ...realmWithSingleArea(HILLS, 0),
      populations: [{ id: 'p', race: 'dwarves', count: 2, homeAreaId: HILLS.id, workAreaId: HILLS.id }],
    }
    const r = harvestArea(HILLS, realm, createRng(1))
    expect(r.produced.stone).toBe(3) // 2 base + 1 dwarf bonus
  })

  it('goblins on plains apply -1 to food (final = 3)', () => {
    const realm: RealmState = {
      ...realmWithSingleArea(PLAINS, 0),
      populations: [{ id: 'p', race: 'goblins', count: 1, homeAreaId: PLAINS.id, workAreaId: PLAINS.id }],
    }
    const r = harvestArea(PLAINS, realm, createRng(1))
    expect(r.produced.food).toBe(3)
  })

  it('double-pop goblins on plains double output (book example: 2 goblins → 6 food)', () => {
    // Plains harvestPop = 1; 2 goblins triggers the doubling.
    const realm: RealmState = {
      ...realmWithSingleArea(PLAINS, 0),
      populations: [{ id: 'p', race: 'goblins', count: 2, homeAreaId: PLAINS.id, workAreaId: PLAINS.id }],
    }
    const r = harvestArea(PLAINS, realm, createRng(1))
    // (4 base - 1 goblin penalty) × 2 = 6
    expect(r.produced.food).toBe(6)
  })

  it('triple-pop goblins on plains still only double (book: ≥2× threshold, no further scaling)', () => {
    const realm: RealmState = {
      ...realmWithSingleArea(PLAINS, 0),
      populations: [{ id: 'p', race: 'goblins', count: 3, homeAreaId: PLAINS.id, workAreaId: PLAINS.id }],
    }
    const r = harvestArea(PLAINS, realm, createRng(1))
    expect(r.produced.food).toBe(6)
  })

  it('orcs on plains apply -1 to food (same as goblins, no doubling)', () => {
    const realm: RealmState = {
      ...realmWithSingleArea(PLAINS, 0),
      populations: [{ id: 'p', race: 'orcs', count: 2, homeAreaId: PLAINS.id, workAreaId: PLAINS.id }],
    }
    const r = harvestArea(PLAINS, realm, createRng(1))
    expect(r.produced.food).toBe(3) // 4 - 1, NOT doubled
  })

  it('undead on plains zero out food production', () => {
    const realm: RealmState = {
      ...realmWithSingleArea(PLAINS, 0),
      populations: [{ id: 'p', race: 'undead', count: 1, homeAreaId: PLAINS.id, workAreaId: PLAINS.id }],
    }
    const r = harvestArea(PLAINS, realm, createRng(1))
    expect(r.produced.food).toBe(0)
  })

  it('mixed humans + elves on forest applies elf bonus once', () => {
    const realm: RealmState = {
      ...realmWithSingleArea(FOREST, 0),
      populations: [
        { id: 'p1', race: 'humans', count: 1, homeAreaId: FOREST.id, workAreaId: FOREST.id },
        { id: 'p2', race: 'elves', count: 1, homeAreaId: FOREST.id, workAreaId: FOREST.id },
      ],
    }
    const r = harvestArea(FOREST, realm, createRng(1))
    // Base 4/1 + elves 1/1 = 5 lumber, 2 food. Humans add nothing.
    expect(r.produced).toEqual({ lumber: 5, food: 2 })
  })
})

describe('harvestArea — weather modifier', () => {
  it('+10% good weather scales production up', () => {
    const realm: RealmState = { ...realmWithSingleArea(PLAINS, 1), weatherModifier: 0.1 }
    const r = harvestArea(PLAINS, realm, createRng(1))
    expect(r.produced.food).toBeCloseTo(4.4, 5)
  })

  it('-10% poor weather scales production down', () => {
    const realm: RealmState = { ...realmWithSingleArea(PLAINS, 1), weatherModifier: -0.1 }
    const r = harvestArea(PLAINS, realm, createRng(1))
    expect(r.produced.food).toBeCloseTo(3.6, 5)
  })
})

describe('harvestRealm — aggregation', () => {
  it('aggregates produced resources across all areas', () => {
    // Build a realm with the standard template, fully assigned (10 humans across 10 plains)
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'X',
      ownerId: 'o',
      uuid: uuids(),
    })
    // Assign all 10 humans evenly to the 10 plains tiles
    const plains = realm.areas.filter((a) => a.terrain === 'plains')
    expect(plains).toHaveLength(10)
    const populations = plains.map((p, i) => ({
      id: `p${i}`, race: 'humans' as const, count: 1, homeAreaId: p.id, workAreaId: p.id,
    }))
    const assigned: RealmState = { ...realm, populations }

    const { results, delta } = harvestRealm(assigned, createRng(42))
    const activeCount = results.filter((r) => r.active).length
    expect(activeCount).toBe(10)
    expect(delta.food).toBe(40) // 10 plains × 4 food
  })
})

describe('applyResourceDelta', () => {
  it('adds positive delta values', () => {
    const pool = { ...EMPTY_RESOURCE_POOL, food: 10 }
    const next = applyResourceDelta(pool, { food: 5, lumber: 3 })
    expect(next.food).toBe(15)
    expect(next.lumber).toBe(3)
  })

  it('floors at 0 when subtracting more than available', () => {
    const pool = { ...EMPTY_RESOURCE_POOL, food: 5 }
    const next = applyResourceDelta(pool, { food: -10 })
    expect(next.food).toBe(0)
  })

  it('returns a new pool (immutable)', () => {
    const pool = { ...EMPTY_RESOURCE_POOL, food: 10 }
    const next = applyResourceDelta(pool, { food: 1 })
    expect(next).not.toBe(pool)
    expect(pool.food).toBe(10)
  })
})
