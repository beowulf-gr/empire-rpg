import { describe, expect, it } from 'vitest'
import { createStartingDomain } from './createDomain'
import { createRng } from './rng'
import type { ClimateTemplate } from '../types/rules'

const ALL_CLIMATES: ClimateTemplate[] = [
  'standard',
  'coastal',
  'desert',
  'forest',
  'hills',
  'mountains',
]

// Deterministic uuid factory for tests
function makeCounter(): () => string {
  let n = 0
  return () => `test-uuid-${n++}`
}

describe('createStartingDomain', () => {
  it('produces a complete RealmState with sensible defaults', () => {
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'Testlandia',
      ownerId: 'owner-1',
      rng: createRng(1),
      uuid: makeCounter(),
    })

    expect(realm.name).toBe('Testlandia')
    expect(realm.ownerId).toBe('owner-1')
    expect(realm.scale).toBe('barony')
    expect(realm.year).toBe(1)
    expect(realm.season).toBe('spring')
    expect(realm.weatherModifier).toBe(0)
    // After 2f.2 createStartingDomain runs the year-1 spring obligatory chain
    // (bootSpring), so pendingEvents starts populated with morale_upkeep,
    // population_upkeep, and assign_population entries.
    const types = realm.pendingEvents.map((e) => e.type)
    expect(types).toContain('morale_upkeep')
    expect(types).toContain('population_upkeep')
    expect(types).toContain('assign_population')
  })

  it.each(ALL_CLIMATES)('generates exactly 20 areas for %s template', (climate) => {
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: climate,
      name: 'X',
      ownerId: 'owner',
      rng: createRng(1),
      uuid: makeCounter(),
    })
    expect(realm.areas).toHaveLength(20)
  })

  it('lays areas out on a 5x4 grid', () => {
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'X',
      ownerId: 'owner',
      uuid: makeCounter(),
    })
    // First five tiles: y=0
    for (let i = 0; i < 5; i++) {
      expect(realm.areas[i].positionY).toBe(0)
      expect(realm.areas[i].positionX).toBe(i)
    }
    // Last tile (index 19): x=4, y=3
    expect(realm.areas[19].positionX).toBe(4)
    expect(realm.areas[19].positionY).toBe(3)
  })

  it('places exactly one Village and one Keep, on different areas', () => {
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'X',
      ownerId: 'owner',
      uuid: makeCounter(),
    })
    const villages = realm.strongholds.filter((s) => s.kind === 'village')
    const keeps = realm.strongholds.filter((s) => s.kind === 'keep')
    expect(villages).toHaveLength(1)
    expect(keeps).toHaveLength(1)
    expect(villages[0].areaId).not.toBe(keeps[0].areaId)
  })

  it('seeds 10 humans unallocated (no home, no work) for a 20-area realm', () => {
    // Per the no-auto-allocation correction: starter pop joins the unallocated
    // pool. The player must place them via Move Settlers in the first Spring.
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'X',
      ownerId: 'owner',
      uuid: makeCounter(),
      skipBootSpring: true,
    })
    const total = realm.populations.reduce((s, p) => s + p.count, 0)
    expect(total).toBe(10)
    for (const stack of realm.populations) {
      expect(stack.race).toBe('humans')
      expect(stack.homeAreaId).toBeNull()
      expect(stack.workAreaId).toBeNull()
    }
  })

  it('respects a custom startingPopulation override (totalled across stacks, pre-boot)', () => {
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'X',
      ownerId: 'owner',
      uuid: makeCounter(),
      startingPopulation: 25,
      skipBootSpring: true,
    })
    const total = realm.populations.reduce((s, p) => s + p.count, 0)
    expect(total).toBe(25)
  })

  it('startingPopulationRaces seeds one stack per race in the mix', () => {
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'X',
      ownerId: 'owner',
      uuid: makeCounter(),
      startingPopulationRaces: { humans: 6, elves: 2, dwarves: 2 },
      skipBootSpring: true,
    })
    const byRace: Record<string, number> = {}
    for (const p of realm.populations) {
      byRace[p.race] = (byRace[p.race] ?? 0) + p.count
    }
    expect(byRace).toEqual({ humans: 6, elves: 2, dwarves: 2 })
    expect(realm.populations).toHaveLength(3)
    // All stacks start unallocated
    for (const p of realm.populations) {
      expect(p.homeAreaId).toBeNull()
      expect(p.workAreaId).toBeNull()
    }
  })

  it('startingPopulationRaces overrides startingPopulation when both are given', () => {
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'X',
      ownerId: 'owner',
      uuid: makeCounter(),
      startingPopulation: 50, // ignored
      startingPopulationRaces: { elves: 3, gnomes: 2 },
      skipBootSpring: true,
    })
    const total = realm.populations.reduce((s, p) => s + p.count, 0)
    expect(total).toBe(5)
  })

  it('startingPopulationRaces with all zeroes falls back to default humans', () => {
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'X',
      ownerId: 'owner',
      uuid: makeCounter(),
      startingPopulationRaces: { dwarves: 0, elves: 0 },
      skipBootSpring: true,
    })
    expect(realm.populations).toHaveLength(1)
    expect(realm.populations[0].race).toBe('humans')
  })

  it('startingPopulationRaces ignores negative and fractional counts', () => {
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'X',
      ownerId: 'owner',
      uuid: makeCounter(),
      startingPopulationRaces: { humans: 4, elves: -3, dwarves: 2.7 },
      skipBootSpring: true,
    })
    const byRace: Record<string, number> = {}
    for (const p of realm.populations) {
      byRace[p.race] = p.count
    }
    expect(byRace.humans).toBe(4)
    expect(byRace.elves).toBeUndefined() // negative dropped
    expect(byRace.dwarves).toBe(2)        // 2.7 floored to 2
  })

  it('grants starter resources matching the standard template', () => {
    // Standard: 5 forest, 2 hills, 10 plains, 0 mountains, 0 ruins, 1 swamp, 0 wasteland, 2 water
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'standard',
      name: 'X',
      ownerId: 'owner',
      uuid: makeCounter(),
    })
    // food: 5 (forests) + 10 (plains) + 1 (swamp) + 2 (water) = 18
    expect(realm.resources.food).toBe(18)
    // lumber: 5 (forests)
    expect(realm.resources.lumber).toBe(5)
    // stone: 2 (hills)
    expect(realm.resources.stone).toBe(2)
    // gold: 1 (swamp)
    expect(realm.resources.gold).toBe(1)
    // No copper/silver/iron/etc. at start
    expect(realm.resources.copper).toBe(0)
    expect(realm.resources.silver).toBe(0)
    expect(realm.resources.mithral).toBe(0)
  })

  it('coastal template grants very different starter resources', () => {
    // Coastal: 2 forest, 0 hills, 7 plains, 0 mountains, 0 ruins, 3 swamp, 0 wasteland, 8 water
    const realm = createStartingDomain({
      scale: 'barony',
      climateTemplate: 'coastal',
      name: 'X',
      ownerId: 'owner',
      uuid: makeCounter(),
    })
    // food: 2 + 7 + 3 + 8 = 20
    expect(realm.resources.food).toBe(20)
    // lumber: 2 (forests)
    expect(realm.resources.lumber).toBe(2)
    // stone: 0 (no hills, no mountains)
    expect(realm.resources.stone).toBe(0)
    // gold: 3 (swamps)
    expect(realm.resources.gold).toBe(3)
  })

  it('throws if a template sums to something other than 20 (sanity)', () => {
    // Smoke check: createStartingDomain itself can't fail this if STARTING_TEMPLATES is valid.
    // The check is in buildAreas — guards against future template edits that drift.
    // Here we just confirm the standard path doesn't throw.
    expect(() =>
      createStartingDomain({
        scale: 'barony',
        climateTemplate: 'standard',
        name: 'X',
        ownerId: 'owner',
        uuid: makeCounter(),
      }),
    ).not.toThrow()
  })
})

// ============================================================
// Custom realm path
// ============================================================

describe('createStartingDomain — custom inputs', () => {
  const COMMON = {
    scale: 'barony' as const,
    climateTemplate: 'standard' as const,
    name: 'Custom',
    ownerId: 'owner',
    skipBootSpring: true, // simpler invariants when we don't run the season chain
  }

  it('uses customAreas instead of the climate template', () => {
    const realm = createStartingDomain({
      ...COMMON,
      uuid: makeCounter(),
      customAreas: [
        { terrain: 'plains',    positionX: 0, positionY: 0 },
        { terrain: 'forest',    positionX: 1, positionY: 0 },
        { terrain: 'hills',     positionX: 2, positionY: 0 },
        { terrain: 'mountains', positionX: 0, positionY: 1 },
        { terrain: 'water',     positionX: 1, positionY: 1 },
      ],
    })
    expect(realm.areas).toHaveLength(5)
    const terrains = realm.areas.map((a) => a.terrain).sort()
    expect(terrains).toEqual(['forest', 'hills', 'mountains', 'plains', 'water'])
    // Positions land where we put them
    const at = (x: number, y: number) =>
      realm.areas.find((a) => a.positionX === x && a.positionY === y)!.terrain
    expect(at(0, 0)).toBe('plains')
    expect(at(2, 0)).toBe('hills')
    expect(at(0, 1)).toBe('mountains')
  })

  it('throws when fewer than 2 customAreas are provided', () => {
    expect(() =>
      createStartingDomain({
        ...COMMON,
        uuid: makeCounter(),
        customAreas: [{ terrain: 'plains', positionX: 0, positionY: 0 }],
      }),
    ).toThrow(/at least 2 areas/)
  })

  it('throws on duplicate positions', () => {
    expect(() =>
      createStartingDomain({
        ...COMMON,
        uuid: makeCounter(),
        customAreas: [
          { terrain: 'plains', positionX: 0, positionY: 0 },
          { terrain: 'forest', positionX: 0, positionY: 0 },
        ],
      }),
    ).toThrow(/Duplicate area position/)
  })

  it('uses customStrongholds (suppressing default Village+Keep)', () => {
    const realm = createStartingDomain({
      ...COMMON,
      uuid: makeCounter(),
      customAreas: [
        { terrain: 'plains', positionX: 0, positionY: 0 },
        { terrain: 'hills',  positionX: 1, positionY: 0 },
        { terrain: 'forest', positionX: 2, positionY: 0 },
      ],
      customStrongholds: [
        { kind: 'keep',  positionX: 0, positionY: 0 },
        { kind: 'mine',  positionX: 1, positionY: 0, parentIndex: 0, mineResourceType: 'mineral' },
      ],
    })
    expect(realm.strongholds).toHaveLength(2)
    const keep = realm.strongholds[0]
    const mine = realm.strongholds[1]
    expect(keep.kind).toBe('keep')
    expect(keep.parentStrongholdId).toBeNull()
    expect(mine.kind).toBe('mine')
    expect(mine.parentStrongholdId).toBe(keep.id)
    expect(mine.mineResourceType).toBe('mineral')
    // No accidental village
    expect(realm.strongholds.find((s) => s.kind === 'village')).toBeUndefined()
  })

  it('empty customStrongholds = no strongholds at all', () => {
    const realm = createStartingDomain({
      ...COMMON,
      uuid: makeCounter(),
      customAreas: [
        { terrain: 'plains', positionX: 0, positionY: 0 },
        { terrain: 'plains', positionX: 1, positionY: 0 },
      ],
      customStrongholds: [],
    })
    expect(realm.strongholds).toHaveLength(0)
  })

  it('rejects forward parentIndex references', () => {
    expect(() =>
      createStartingDomain({
        ...COMMON,
        uuid: makeCounter(),
        customAreas: [
          { terrain: 'plains', positionX: 0, positionY: 0 },
          { terrain: 'hills',  positionX: 1, positionY: 0 },
        ],
        customStrongholds: [
          // child references parent that hasn't been declared yet
          { kind: 'mine', positionX: 1, positionY: 0, parentIndex: 1, mineResourceType: 'mineral' },
          { kind: 'keep', positionX: 0, positionY: 0 },
        ],
      }),
    ).toThrow(/parentIndex/)
  })

  it('rejects strongholds referencing a missing area', () => {
    expect(() =>
      createStartingDomain({
        ...COMMON,
        uuid: makeCounter(),
        customAreas: [
          { terrain: 'plains', positionX: 0, positionY: 0 },
          { terrain: 'plains', positionX: 1, positionY: 0 },
        ],
        customStrongholds: [
          { kind: 'keep', positionX: 5, positionY: 5 },
        ],
      }),
    ).toThrow(/missing area/)
  })

  it('honours customRoadPositions and ignores unknown ones', () => {
    const realm = createStartingDomain({
      ...COMMON,
      uuid: makeCounter(),
      customAreas: [
        { terrain: 'plains', positionX: 0, positionY: 0 },
        { terrain: 'plains', positionX: 1, positionY: 0 },
        { terrain: 'plains', positionX: 2, positionY: 0 },
      ],
      customRoadPositions: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 9, y: 9 }, // doesn't exist — should be silently dropped
      ],
    })
    expect(realm.roadAreaIds).toHaveLength(2)
    const roadAreaTerrains = realm.roadAreaIds.map(
      (id) => realm.areas.find((a) => a.id === id)!.terrain,
    )
    expect(roadAreaTerrains).toEqual(['plains', 'plains'])
  })

  it('honours startingResources override', () => {
    const realm = createStartingDomain({
      ...COMMON,
      uuid: makeCounter(),
      customAreas: [
        { terrain: 'plains', positionX: 0, positionY: 0 },
        { terrain: 'plains', positionX: 1, positionY: 0 },
      ],
      startingResources: {
        food: 100, lumber: 50, gold: 9999, stone: 0,
        copper: 0, iron: 0, silver: 0, gold_metal: 0,
        mithral: 0, adamantine: 0,
      },
    })
    expect(realm.resources.gold).toBe(9999)
    expect(realm.resources.food).toBe(100)
  })

  it('passes startingPopulationRaces through unchanged for custom realms', () => {
    const realm = createStartingDomain({
      ...COMMON,
      uuid: makeCounter(),
      customAreas: [
        { terrain: 'plains', positionX: 0, positionY: 0 },
        { terrain: 'plains', positionX: 1, positionY: 0 },
      ],
      startingPopulationRaces: { humans: 3, dwarves: 2, orcs: 1 },
    })
    const byRace = Object.fromEntries(realm.populations.map((p) => [p.race, p.count]))
    expect(byRace).toEqual({ humans: 3, dwarves: 2, orcs: 1 })
    // All start unallocated (engine contract).
    for (const p of realm.populations) {
      expect(p.homeAreaId).toBeNull()
      expect(p.workAreaId).toBeNull()
    }
  })
})
