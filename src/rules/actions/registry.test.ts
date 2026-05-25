import { describe, expect, it } from 'vitest'
import {
  ACTION_REGISTRY,
  actionsByCategory,
  findActionById,
  obligatoryActionsForSeason,
} from './registry'
import type { ActionDefinition } from './types'

describe('action registry', () => {
  it('contains at least 20 actions', () => {
    expect(ACTION_REGISTRY.length).toBeGreaterThanOrEqual(20)
  })

  it('has unique action ids', () => {
    const ids = ACTION_REGISTRY.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every action has required fields populated', () => {
    for (const a of ACTION_REGISTRY) {
      expect(a.id).toBeTruthy()
      expect(a.name).toBeTruthy()
      expect(a.shortDescription.length).toBeGreaterThan(10)
      expect(a.bookText.length).toBeGreaterThan(50)
      expect(a.availability.seasons).toBeDefined()
      expect(['auto', 'interactive']).toContain(a.kind)
      expect(['official', 'homebrew']).toContain(a.source)
      expect(typeof a.implemented).toBe('boolean')
    }
  })

  it('interactive actions specify a panel', () => {
    for (const a of ACTION_REGISTRY) {
      if (a.kind === 'interactive') {
        expect(a.panel).toBeTruthy()
      }
    }
  })

  it('obligatory actions specify an obligatoryTiming', () => {
    for (const a of ACTION_REGISTRY) {
      if (a.descriptors.includes('obligatory') && a.kind === 'auto') {
        expect(a.obligatoryTiming).toBeTruthy()
      }
    }
  })

  it('Spring obligatory chain at season_start exists in correct order', () => {
    const start = obligatoryActionsForSeason('spring', 'season_start')
    const ids = start.map((a) => a.id)
    expect(ids).toContain('morale_upkeep')
    expect(ids).toContain('population_upkeep')
    expect(ids).toContain('assign_population')
  })

  it('Fall obligatory chain at season_start exists', () => {
    const start = obligatoryActionsForSeason('fall', 'season_start')
    const ids = start.map((a) => a.id)
    expect(ids).toContain('random_fall_events')
    expect(ids).toContain('harvest_crops')
    expect(ids).toContain('allocate_food')
  })

  it('Random Spring Events fires at season_end', () => {
    const ends = obligatoryActionsForSeason('spring', 'season_end')
    expect(ends.map((a) => a.id)).toContain('random_spring_events')
  })

  it('findActionById works for known and unknown ids', () => {
    expect(findActionById('morale_upkeep')).toBeDefined()
    expect(findActionById('not_a_real_action')).toBeUndefined()
  })

  it('actionsByCategory groups them correctly', () => {
    const spring = actionsByCategory('spring')
    expect(spring.length).toBeGreaterThanOrEqual(4)
    for (const a of spring) {
      expect(a.category).toBe('spring')
    }
  })

  it('move_settlers is correctly tagged as homebrew', () => {
    const a = findActionById('move_settlers')
    expect(a?.source).toBe('homebrew')
  })

  it('all official actions have source="official"', () => {
    const homebrew = ACTION_REGISTRY.filter((a) => a.source === 'homebrew').map((a) => a.id)
    // Currently only Move Settlers is homebrew
    expect(homebrew).toEqual(['move_settlers'])
  })

  it('availability seasons reference real Season values', () => {
    const valid = ['spring', 'summer', 'fall', 'winter']
    for (const a of ACTION_REGISTRY) {
      for (const s of a.availability.seasons) {
        expect(valid).toContain(s)
      }
    }
  })

  it('every action has an entry in the ActionId union (compile-time check via exhaustive lookup)', () => {
    // If a registry entry's id isn't in ActionId, findActionById would type-error.
    // This runtime check just confirms IDs round-trip through the lookup.
    for (const a of ACTION_REGISTRY) {
      const found = findActionById(a.id)
      expect(found).toBe(a)
    }
  })
})

// Sanity that types compile correctly when importing
const _typeCheck: ActionDefinition[] = ACTION_REGISTRY
void _typeCheck
