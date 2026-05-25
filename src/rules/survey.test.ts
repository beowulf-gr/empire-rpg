import { describe, expect, it } from 'vitest'
import {
  applyCompletedSurveyForNewVein,
  setHarvestMode,
  surveyForMinerals,
  SurveyError,
} from './survey'
import { createStartingDomain } from './createDomain'
import { createRng } from './rng'
import type { AreaState, RealmState } from './state'

function uuids() {
  let n = 0
  return () => `id-${n++}`
}

function fresh(): RealmState {
  return createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'X',
    ownerId: 'o',
    uuid: uuids(),
    skipBootSpring: true,
  })
}

function withArea(realm: RealmState, area: AreaState): RealmState {
  return { ...realm, areas: [...realm.areas, area] }
}

const HILLS: AreaState = {
  id: 'h-1',
  terrain: 'hills',
  secondaryTerrain: null,
  mineralResults: [],
  harvestMode: null,
  positionX: 0,
  positionY: 0,
}

const MOUNTAINS: AreaState = {
  id: 'm-1',
  terrain: 'mountains',
  secondaryTerrain: null,
  mineralResults: [],
  harvestMode: null,
  positionX: 0,
  positionY: 0,
}

const PLAINS: AreaState = {
  id: 'p-1',
  terrain: 'plains',
  secondaryTerrain: null,
  mineralResults: [],
  harvestMode: null,
  positionX: 0,
  positionY: 0,
}

describe('surveyForMinerals - hills', () => {
  it('always succeeds, stamps a mineral, sets harvestMode to mineral', () => {
    const realm = withArea(fresh(), HILLS)
    const { state, event, minerals } = surveyForMinerals(realm, HILLS.id, createRng(7))
    expect(minerals.length).toBe(1)
    const updated = state.areas.find((a) => a.id === HILLS.id)!
    expect(updated.harvestMode).toBe('mineral')
    expect(updated.mineralResults).toEqual(minerals)
    expect(event.type).toBe('survey_minerals')
    expect(event.payload).toMatchObject({
      terrain: 'hills',
      outcome: 'success',
      minerals,
    })
    expect(typeof (event.payload as { roll: number }).roll).toBe('number')
  })

  it('different seeds produce (potentially) different minerals', () => {
    const realm = withArea(fresh(), HILLS)
    const found = new Set<string>()
    for (let seed = 1; seed <= 50; seed++) {
      const { minerals } = surveyForMinerals(realm, HILLS.id, createRng(seed))
      for (const m of minerals) found.add(m)
    }
    expect(found.size).toBeGreaterThanOrEqual(2)
  })
})

describe('surveyForMinerals - mountains', () => {
  it('same-mineral rolls dedupe to a single-element list', () => {
    const realm = withArea(fresh(), MOUNTAINS)
    let twin: ReturnType<typeof surveyForMinerals> | null = null
    for (let seed = 1; seed <= 400 && !twin; seed++) {
      const r = surveyForMinerals(realm, MOUNTAINS.id, createRng(seed))
      if (r.minerals.length === 1) twin = r
    }
    expect(twin).not.toBeNull()
    const updated = twin!.state.areas.find((a) => a.id === MOUNTAINS.id)!
    expect(updated.harvestMode).toBe('mineral')
    expect(updated.mineralResults).toEqual(twin!.minerals)
    expect(twin!.event.payload).toMatchObject({
      terrain: 'mountains',
      outcome: 'success',
    })
  })

  it('different mineral rolls store BOTH minerals (twin veins)', () => {
    const realm = withArea(fresh(), MOUNTAINS)
    let twin: ReturnType<typeof surveyForMinerals> | null = null
    for (let seed = 1; seed <= 400 && !twin; seed++) {
      const r = surveyForMinerals(realm, MOUNTAINS.id, createRng(seed))
      if (r.minerals.length === 2) twin = r
    }
    expect(twin).not.toBeNull()
    expect(twin!.minerals[0]).not.toBe(twin!.minerals[1])
    const updated = twin!.state.areas.find((a) => a.id === MOUNTAINS.id)!
    expect(updated.mineralResults).toEqual(twin!.minerals)
    expect(updated.harvestMode).toBe('mineral')
  })

  it('already-surveyed area: no new roll, just toggles mode (reactivated)', () => {
    const surveyed: AreaState = { ...MOUNTAINS, mineralResults: ['iron'], harvestMode: 'stone' }
    const realm = withArea(fresh(), surveyed)
    const { state, event, minerals } = surveyForMinerals(realm, MOUNTAINS.id, createRng(1))
    expect(minerals).toEqual(['iron'])
    const after = state.areas.find((a) => a.id === MOUNTAINS.id)!
    expect(after.harvestMode).toBe('mineral')
    expect(event.payload).toMatchObject({ outcome: 'reactivated', minerals: ['iron'] })
  })
})

describe('surveyForMinerals - errors', () => {
  it('throws on unknown area', () => {
    const realm = fresh()
    expect(() => surveyForMinerals(realm, 'no-such-area', createRng(1))).toThrow(SurveyError)
  })

  it('throws on non-hills/mountains terrain', () => {
    const realm = withArea(fresh(), PLAINS)
    expect(() => surveyForMinerals(realm, PLAINS.id, createRng(1))).toThrow(/Only hills and mountains/)
  })
})

describe('setHarvestMode', () => {
  it('flips a hills area between stone and mineral when surveyed', () => {
    const surveyed: AreaState = { ...HILLS, mineralResults: ['silver'], harvestMode: 'mineral' }
    const realm = withArea(fresh(), surveyed)
    const toStone = setHarvestMode(realm, HILLS.id, 'stone')
    expect(toStone.areas.find((a) => a.id === HILLS.id)?.harvestMode).toBe('stone')
    const backToMineral = setHarvestMode(toStone, HILLS.id, 'mineral')
    expect(backToMineral.areas.find((a) => a.id === HILLS.id)?.harvestMode).toBe('mineral')
  })

  it('refuses mineral mode on unsurveyed area', () => {
    const realm = withArea(fresh(), HILLS)
    expect(() => setHarvestMode(realm, HILLS.id, 'mineral')).toThrow(/Survey for minerals first/)
  })

  it('refuses non-hills/mountains terrain', () => {
    const realm = withArea(fresh(), PLAINS)
    expect(() => setHarvestMode(realm, PLAINS.id, 'stone')).toThrow(/only applies to hills/)
  })
})

describe('applyCompletedSurveyForNewVein', () => {
  it('hills below 95 yields threshold_fail, no area change', () => {
    const surveyed: AreaState = { ...HILLS, mineralResults: ['iron'], harvestMode: 'mineral' }
    const realm = withArea(fresh(), surveyed)
    const rng = { ...createRng(1), d100: () => 50 }
    const out = applyCompletedSurveyForNewVein(realm, HILLS.id, rng)
    expect(out.added).toBeNull()
    expect((out.event.payload as { outcome: string }).outcome).toBe('threshold_fail')
    const area = out.state.areas.find((a) => a.id === HILLS.id)!
    expect(area.mineralResults).toEqual(['iron'])
  })

  it('mountains pass threshold and find new mineral added to list', () => {
    const surveyed: AreaState = { ...MOUNTAINS, mineralResults: ['iron'], harvestMode: 'mineral' }
    const realm = withArea(fresh(), surveyed)
    let n = 0
    const rolls = [95, 91]
    const rng = { ...createRng(1), d100: () => rolls[n++] }
    const out = applyCompletedSurveyForNewVein(realm, MOUNTAINS.id, rng)
    expect(out.added).toBe('silver')
    const area = out.state.areas.find((a) => a.id === MOUNTAINS.id)!
    expect(area.mineralResults).toEqual(['iron', 'silver'])
  })

  it('passes threshold but rolls an existing mineral yields duplicate, no change', () => {
    const surveyed: AreaState = { ...MOUNTAINS, mineralResults: ['iron'], harvestMode: 'mineral' }
    const realm = withArea(fresh(), surveyed)
    let n = 0
    const rolls = [95, 50]
    const rng = { ...createRng(1), d100: () => rolls[n++] }
    const out = applyCompletedSurveyForNewVein(realm, MOUNTAINS.id, rng)
    expect(out.added).toBeNull()
    expect((out.event.payload as { outcome: string }).outcome).toBe('duplicate')
  })

  it('mountains already at 2 minerals yields capacity_full', () => {
    const surveyed: AreaState = { ...MOUNTAINS, mineralResults: ['iron', 'silver'], harvestMode: 'mineral' }
    const realm = withArea(fresh(), surveyed)
    let n = 0
    const rolls = [95, 5]
    const rng = { ...createRng(1), d100: () => rolls[n++] }
    const out = applyCompletedSurveyForNewVein(realm, MOUNTAINS.id, rng)
    expect(out.added).toBeNull()
    expect((out.event.payload as { outcome: string }).outcome).toBe('capacity_full')
    const area = out.state.areas.find((a) => a.id === MOUNTAINS.id)!
    expect(area.mineralResults).toEqual(['iron', 'silver'])
  })

  it('hills pass threshold and replace the single existing mineral', () => {
    const surveyed: AreaState = { ...HILLS, mineralResults: ['iron'], harvestMode: 'mineral' }
    const realm = withArea(fresh(), surveyed)
    let n = 0
    const rolls = [99, 91]
    const rng = { ...createRng(1), d100: () => rolls[n++] }
    const out = applyCompletedSurveyForNewVein(realm, HILLS.id, rng)
    expect(out.added).toBe('silver')
    const area = out.state.areas.find((a) => a.id === HILLS.id)!
    expect(area.mineralResults).toEqual(['silver'])
  })
})
