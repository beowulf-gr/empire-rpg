import { describe, expect, it } from 'vitest'
import {
  realmStateFromRows,
  realmStateToRows,
  type AreaRow,
  type PopulationRow,
  type RealmRow,
  type StrongholdRow,
} from './realmIo'
import { createStartingDomain } from '../rules/createDomain'
import type { RealmState } from '../rules/state'
import type { Json } from '../types/database'

function uuids() {
  let n = 0
  return () => `id-${n++}`
}

function freshRealm(): RealmState {
  return createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'IO Test',
    ownerId: 'owner-id',
    uuid: uuids(),
  })
}

describe('realmIo round-trip', () => {
  it('state → rows → state preserves all fields', () => {
    const original = freshRealm()
    const payloads = realmStateToRows(original)

    // Reshape the Insert payloads into Row shape (created_at fields filled with anything plausible)
    const realmRow: RealmRow = {
      id: payloads.realm.id!,
      owner_id: payloads.realm.owner_id,
      name: payloads.realm.name,
      scale: payloads.realm.scale ?? 'barony',
      climate_template: payloads.realm.climate_template ?? 'standard',
      current_year: payloads.realm.current_year ?? 1,
      current_season: payloads.realm.current_season ?? 'spring',
      resource_pool: payloads.realm.resource_pool ?? {},
      settings: payloads.realm.settings ?? {},
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
      cover_image_url: null,
      ruler_portrait_url: null,
      origin_story: null,
      ending_story: null,
    }
    const areaRows: AreaRow[] = payloads.areas.map((a) => ({
      id: a.id!,
      realm_id: a.realm_id,
      terrain: a.terrain,
      secondary_terrain: a.secondary_terrain ?? null,
      mineral_result: a.mineral_result ?? null,
      harvest_mode: a.harvest_mode ?? null,
      position_x: a.position_x ?? 0,
      position_y: a.position_y ?? 0,
      created_at: '2026-04-29T00:00:00Z',
    }))
    const popRows: PopulationRow[] = payloads.populations.map((p) => ({
      id: p.id!,
      realm_id: p.realm_id,
      race: p.race,
      count: p.count ?? 0,
      home_area_id: p.home_area_id ?? null,
      work_area_id: p.work_area_id ?? null,
      created_at: '2026-04-29T00:00:00Z',
    }))
    const strRows: StrongholdRow[] = payloads.strongholds.map((s) => ({
      id: s.id!,
      realm_id: s.realm_id,
      area_id: s.area_id,
      kind: s.kind,
      parent_stronghold_id: s.parent_stronghold_id ?? null,
      mine_resource_type: s.mine_resource_type ?? null,
      source: s.source ?? 'official',
      name: s.name ?? null,
      created_at: '2026-04-29T00:00:00Z',
    }))

    const restored = realmStateFromRows(realmRow, areaRows, popRows, strRows)

    expect(restored.id).toBe(original.id)
    expect(restored.ownerId).toBe(original.ownerId)
    expect(restored.name).toBe(original.name)
    expect(restored.scale).toBe(original.scale)
    expect(restored.climateTemplate).toBe(original.climateTemplate)
    expect(restored.year).toBe(original.year)
    expect(restored.season).toBe(original.season)
    expect(restored.resources).toEqual(original.resources)
    expect(restored.loyaltyGroups).toEqual(original.loyaltyGroups)
    expect(restored.lastFoodCrisis).toBe(original.lastFoodCrisis)
    expect(restored.weatherModifier).toBe(original.weatherModifier)
    expect(restored.lastYearFoodBalance).toBe(original.lastYearFoodBalance)
    expect(restored.pendingEvents).toEqual(original.pendingEvents)
    expect(restored.ruler).toEqual(original.ruler)
  })

  it('round-trip preserves customised ruler stats', () => {
    const original: RealmState = {
      ...freshRealm(),
      ruler: {
        name: 'Lord Aelric Stoneheart',
        strength: 14,
        dexterity: 12,
        constitution: 13,
        intelligence: 15,
        wisdom: 11,
        charisma: 16,
        diplomacy: 8,
        knowledgeEconomics: 5,
      },
    }
    const payloads = realmStateToRows(original)
    const realmRow: RealmRow = {
      id: payloads.realm.id!,
      owner_id: payloads.realm.owner_id,
      name: payloads.realm.name,
      scale: payloads.realm.scale ?? 'barony',
      climate_template: payloads.realm.climate_template ?? 'standard',
      current_year: payloads.realm.current_year ?? 1,
      current_season: payloads.realm.current_season ?? 'spring',
      resource_pool: payloads.realm.resource_pool ?? {},
      settings: payloads.realm.settings ?? {},
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
      cover_image_url: null,
      ruler_portrait_url: null,
      origin_story: null,
      ending_story: null,
    }
    // Reuse the existing freshRealm() row-reshape pattern; only the settings
    // (where ruler lives) actually need to round-trip for this assertion, so
    // we pass empty child arrays. The areas/populations/strongholds aren't
    // checked here.
    const restored = realmStateFromRows(realmRow, [], [], [])
    expect(restored.ruler).toEqual(original.ruler)
  })

  it('round-trip preserves all 20 areas with their terrain', () => {
    const original = freshRealm()
    const payloads = realmStateToRows(original)
    const areaRows: AreaRow[] = payloads.areas.map((a) => ({
      id: a.id!,
      realm_id: a.realm_id,
      terrain: a.terrain,
      secondary_terrain: a.secondary_terrain ?? null,
      mineral_result: a.mineral_result ?? null,
      harvest_mode: a.harvest_mode ?? null,
      position_x: a.position_x ?? 0,
      position_y: a.position_y ?? 0,
      created_at: '2026-04-29T00:00:00Z',
    }))
    const realmRow: RealmRow = {
      id: payloads.realm.id!,
      owner_id: payloads.realm.owner_id,
      name: payloads.realm.name,
      scale: payloads.realm.scale ?? 'barony',
      climate_template: payloads.realm.climate_template ?? 'standard',
      current_year: payloads.realm.current_year ?? 1,
      current_season: payloads.realm.current_season ?? 'spring',
      resource_pool: payloads.realm.resource_pool ?? {},
      settings: payloads.realm.settings ?? {},
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
      cover_image_url: null,
      ruler_portrait_url: null,
      origin_story: null,
      ending_story: null,
    }
    const restored = realmStateFromRows(realmRow, areaRows, [], [])
    expect(restored.areas).toHaveLength(20)
    // Every original terrain should be present in the restored areas
    const origTerrains = original.areas.map((a) => a.terrain).sort()
    const restoredTerrains = restored.areas.map((a) => a.terrain).sort()
    expect(restoredTerrains).toEqual(origTerrains)
  })

  it('round-trip preserves the starter Village + Keep with correct sources', () => {
    const original = freshRealm()
    // Add a homebrew Citadel to verify source field round-trips
    const customized: RealmState = {
      ...original,
      strongholds: [
        ...original.strongholds,
        {
          id: 'citadel-1',
          areaId: original.areas[0].id,
          kind: 'citadel',
          parentStrongholdId: null,
          mineResourceType: null,
          source: 'homebrew',
        },
      ],
    }
    const payloads = realmStateToRows(customized)
    const strRows: StrongholdRow[] = payloads.strongholds.map((s) => ({
      id: s.id!,
      realm_id: s.realm_id,
      area_id: s.area_id,
      kind: s.kind,
      parent_stronghold_id: s.parent_stronghold_id ?? null,
      mine_resource_type: s.mine_resource_type ?? null,
      source: s.source ?? 'official',
      name: s.name ?? null,
      created_at: '2026-04-29T00:00:00Z',
    }))
    const realmRow: RealmRow = {
      id: payloads.realm.id!,
      owner_id: payloads.realm.owner_id,
      name: payloads.realm.name,
      scale: payloads.realm.scale ?? 'barony',
      climate_template: payloads.realm.climate_template ?? 'standard',
      current_year: payloads.realm.current_year ?? 1,
      current_season: payloads.realm.current_season ?? 'spring',
      resource_pool: payloads.realm.resource_pool ?? {},
      settings: payloads.realm.settings ?? {},
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
      cover_image_url: null,
      ruler_portrait_url: null,
      origin_story: null,
      ending_story: null,
    }
    const restored = realmStateFromRows(realmRow, [], [], strRows)

    expect(restored.strongholds).toHaveLength(3)
    const citadel = restored.strongholds.find((s) => s.kind === 'citadel')
    expect(citadel).toBeDefined()
    expect(citadel!.source).toBe('homebrew')
    const keep = restored.strongholds.find((s) => s.kind === 'keep')
    expect(keep!.source).toBe('official')
  })

  it('round-trip preserves engine-only state via the settings JSONB', () => {
    const base = freshRealm()
    const original: RealmState = {
      ...base,
      // Set a non-default commoner score and crisis to exercise the round-trip
      loyaltyGroups: base.loyaltyGroups.map((g) =>
        g.kind === 'commoners' ? { ...g, score: 4 } : g,
      ),
      lastFoodCrisis: 'shortage',
      weatherModifier: -0.1,
      lastYearFoodBalance: -3,
      pendingEvents: [
        { type: 'morale_upkeep', payload: { phase: 'spring', dc: 5 } },
        { type: 'good_weather', payload: { modifier: 0.1 } },
      ],
    }
    const payloads = realmStateToRows(original)
    const realmRow: RealmRow = {
      id: payloads.realm.id!,
      owner_id: payloads.realm.owner_id,
      name: payloads.realm.name,
      scale: payloads.realm.scale ?? 'barony',
      climate_template: payloads.realm.climate_template ?? 'standard',
      current_year: payloads.realm.current_year ?? 1,
      current_season: payloads.realm.current_season ?? 'spring',
      resource_pool: payloads.realm.resource_pool ?? {},
      settings: payloads.realm.settings ?? {},
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
      cover_image_url: null,
      ruler_portrait_url: null,
      origin_story: null,
      ending_story: null,
    }
    const restored = realmStateFromRows(realmRow, [], [], [])
    const restoredCommoners = restored.loyaltyGroups.find((g) => g.kind === 'commoners')
    expect(restoredCommoners?.score).toBe(4)
    expect(restored.lastFoodCrisis).toBe('shortage')
    expect(restored.weatherModifier).toBeCloseTo(-0.1, 5)
    expect(restored.lastYearFoodBalance).toBe(-3)
    expect(restored.pendingEvents).toEqual(original.pendingEvents)
  })

  it('parseSettings tolerates a null or malformed settings blob', () => {
    const realmRow: RealmRow = {
      id: 'r1',
      owner_id: 'o1',
      name: 'X',
      scale: 'barony',
      climate_template: 'standard',
      current_year: 1,
      current_season: 'spring',
      resource_pool: {} as Json,
      settings: null as unknown as Json,
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
      cover_image_url: null,
      ruler_portrait_url: null,
      origin_story: null,
      ending_story: null,
    }
    const restored = realmStateFromRows(realmRow, [], [], [])
    expect(restored.loyaltyGroups).toEqual([])
    expect(restored.lastFoodCrisis).toBe('none')
    expect(restored.weatherModifier).toBe(0)
    expect(restored.lastYearFoodBalance).toBe(0)
    expect(restored.pendingEvents).toEqual([])
  })

  it('parseResourcePool fills missing keys with 0', () => {
    const realmRow: RealmRow = {
      id: 'r1',
      owner_id: 'o1',
      name: 'X',
      scale: 'barony',
      climate_template: 'standard',
      current_year: 1,
      current_season: 'spring',
      // Only food provided; other 9 resource keys missing
      resource_pool: { food: 50 } as Json,
      settings: {} as Json,
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
      cover_image_url: null,
      ruler_portrait_url: null,
      origin_story: null,
      ending_story: null,
    }
    const restored = realmStateFromRows(realmRow, [], [], [])
    expect(restored.resources.food).toBe(50)
    expect(restored.resources.lumber).toBe(0)
    expect(restored.resources.gold).toBe(0)
  })

  it('areas come back sorted by position (y, x)', () => {
    // Build a realm and then shuffle the order in which areas come from DB
    const original = freshRealm()
    const payloads = realmStateToRows(original)
    const areaRows: AreaRow[] = payloads.areas.map((a) => ({
      id: a.id!,
      realm_id: a.realm_id,
      terrain: a.terrain,
      secondary_terrain: a.secondary_terrain ?? null,
      mineral_result: a.mineral_result ?? null,
      harvest_mode: a.harvest_mode ?? null,
      position_x: a.position_x ?? 0,
      position_y: a.position_y ?? 0,
      created_at: '2026-04-29T00:00:00Z',
    }))
    // Reverse the rows so they come in opposite order from creation
    const reversed = [...areaRows].reverse()
    const realmRow: RealmRow = {
      id: payloads.realm.id!,
      owner_id: payloads.realm.owner_id,
      name: payloads.realm.name,
      scale: payloads.realm.scale ?? 'barony',
      climate_template: payloads.realm.climate_template ?? 'standard',
      current_year: payloads.realm.current_year ?? 1,
      current_season: payloads.realm.current_season ?? 'spring',
      resource_pool: payloads.realm.resource_pool ?? {},
      settings: payloads.realm.settings ?? {},
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
      cover_image_url: null,
      ruler_portrait_url: null,
      origin_story: null,
      ending_story: null,
    }
    const restored = realmStateFromRows(realmRow, reversed, [], [])
    // Should be sorted by (y, x) ascending: (0,0), (1,0), ..., (4,0), (0,1), ...
    for (let i = 1; i < restored.areas.length; i++) {
      const prev = restored.areas[i - 1]
      const curr = restored.areas[i]
      const prevKey = prev.positionY * 100 + prev.positionX
      const currKey = curr.positionY * 100 + curr.positionX
      expect(currKey).toBeGreaterThanOrEqual(prevKey)
    }
  })
})

describe('realmIo origin/ending story', () => {
  function buildRealmRow(payloadRealm: ReturnType<typeof realmStateToRows>['realm']): RealmRow {
    return {
      id: payloadRealm.id!,
      owner_id: payloadRealm.owner_id,
      name: payloadRealm.name,
      scale: payloadRealm.scale ?? 'barony',
      climate_template: payloadRealm.climate_template ?? 'standard',
      current_year: payloadRealm.current_year ?? 1,
      current_season: payloadRealm.current_season ?? 'spring',
      resource_pool: payloadRealm.resource_pool ?? {},
      settings: payloadRealm.settings ?? {},
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
      cover_image_url: null,
      ruler_portrait_url: null,
      origin_story: payloadRealm.origin_story ?? null,
      ending_story: payloadRealm.ending_story ?? null,
    }
  }

  it('round-trips a fully populated origin and ending story', () => {
    const original: RealmState = {
      ...freshRealm(),
      originStory: {
        founding: 'Founded after the Long Winter by the Stoneheart clan.',
        rulerBackground: 'Lord Aelric was a knight-errant before his coronation.',
        notableCircumstances: 'The realm sits atop ancient dwarven ruins.',
      },
      endingStory: {
        outcome: 'Conquered all enemies and became the greatest in the land.',
        finalNote: 'A festival is held every year in honor of the founders.',
      },
    }
    const payloads = realmStateToRows(original)
    const realmRow = buildRealmRow(payloads.realm)
    const restored = realmStateFromRows(realmRow, [], [], [])

    expect(restored.originStory).toEqual(original.originStory)
    expect(restored.endingStory).toEqual(original.endingStory)
  })

  it('normalises empty stories to null on both load and save', () => {
    const original: RealmState = {
      ...freshRealm(),
      originStory: { founding: '   ', rulerBackground: '', notableCircumstances: null },
      endingStory: { outcome: '', finalNote: '   ' },
    }
    const payloads = realmStateToRows(original)
    expect(payloads.realm.origin_story).toBeNull()
    expect(payloads.realm.ending_story).toBeNull()

    const realmRow = buildRealmRow(payloads.realm)
    const restored = realmStateFromRows(realmRow, [], [], [])
    expect(restored.originStory).toBeNull()
    expect(restored.endingStory).toBeNull()
  })

  it('preserves partial origin stories (only some fields filled in)', () => {
    const original: RealmState = {
      ...freshRealm(),
      originStory: {
        founding: 'A border march carved out of the wild.',
        notableCircumstances: null,
      },
    }
    const payloads = realmStateToRows(original)
    const realmRow = buildRealmRow(payloads.realm)
    const restored = realmStateFromRows(realmRow, [], [], [])

    expect(restored.originStory).toEqual({
      founding: 'A border march carved out of the wild.',
      rulerBackground: null,
      notableCircumstances: null,
    })
    expect(restored.endingStory).toBeNull()
  })

  it('trims leading/trailing whitespace from story fields', () => {
    const original: RealmState = {
      ...freshRealm(),
      originStory: {
        founding: '  Mountain refuge of the Old Folk.  ',
        rulerBackground: null,
        notableCircumstances: null,
      },
    }
    const payloads = realmStateToRows(original)
    const realmRow = buildRealmRow(payloads.realm)
    const restored = realmStateFromRows(realmRow, [], [], [])

    expect(restored.originStory?.founding).toBe('Mountain refuge of the Old Folk.')
  })

  it('treats a fresh realm with no story as null after load', () => {
    const original = freshRealm()
    const payloads = realmStateToRows(original)
    expect(payloads.realm.origin_story).toBeNull()
    expect(payloads.realm.ending_story).toBeNull()

    const realmRow = buildRealmRow(payloads.realm)
    const restored = realmStateFromRows(realmRow, [], [], [])
    expect(restored.originStory).toBeNull()
    expect(restored.endingStory).toBeNull()
  })
})
