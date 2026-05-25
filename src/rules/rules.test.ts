import { describe, expect, it } from 'vitest'
import {
  EMPTY_RESOURCE_POOL,
  RESOURCE_GOLD_RATIO,
  SCALE_DEFINITIONS,
  SLOT_CAPS,
  STARTING_TEMPLATES,
  STRONGHOLD_META,
  TERRAIN_STATS,
} from '../types/rules'

describe('rules data tables', () => {
  it('all 10 resources start at 0', () => {
    expect(Object.values(EMPTY_RESOURCE_POOL).every((v) => v === 0)).toBe(true)
    expect(Object.keys(EMPTY_RESOURCE_POOL)).toHaveLength(10)
  })

  it('resource gold ratios match the digest', () => {
    expect(RESOURCE_GOLD_RATIO.food).toBe(20)
    expect(RESOURCE_GOLD_RATIO.lumber).toBe(15)
    expect(RESOURCE_GOLD_RATIO.stone).toBe(12)
    expect(RESOURCE_GOLD_RATIO.copper).toBe(10)
    expect(RESOURCE_GOLD_RATIO.silver).toBe(5)
  })

  it('scale definitions match the realm scale table', () => {
    expect(SCALE_DEFINITIONS.barony.populationUnit).toBe(100)
    expect(SCALE_DEFINITIONS.kingdom.goldUnit).toBe(10_000)
    expect(SCALE_DEFINITIONS.empire.landUnit).toBe(400)
  })

  it('Citadel is marked as homebrew', () => {
    expect(STRONGHOLD_META.citadel.source).toBe('homebrew')
    expect(STRONGHOLD_META.castle.source).toBe('official')
  })

  it('slot caps follow the 1-3-9 / 1-2-5 / 1-1-2 pattern', () => {
    expect(SLOT_CAPS.empire).toEqual({ 1: 1, 2: 3, 3: 9 })
    expect(SLOT_CAPS.kingdom).toEqual({ 1: 1, 2: 2, 3: 5 })
    expect(SLOT_CAPS.barony).toEqual({ 1: 1, 2: 1, 3: 2 })
  })

  it('standard starting template totals 20 areas', () => {
    const total = Object.values(STARTING_TEMPLATES.standard).reduce((a, b) => a + b, 0)
    expect(total).toBe(20)
  })

  it('plains produce 4 food per area', () => {
    expect(TERRAIN_STATS.plains.production.food).toBe(4)
    expect(TERRAIN_STATS.plains.harvestPop).toBe(1)
    expect(TERRAIN_STATS.plains.settlementCap).toBe(4)
  })
})
