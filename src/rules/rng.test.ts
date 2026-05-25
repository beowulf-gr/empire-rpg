import { describe, expect, it } from 'vitest'
import { createRng } from './rng'

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 10 }, () => a.d100())
    const seqB = Array.from({ length: 10 }, () => b.d100())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 20 }, () => a.d100())
    const seqB = Array.from({ length: 20 }, () => b.d100())
    expect(seqA).not.toEqual(seqB)
  })

  it('d20 values stay within 1..20', () => {
    const rng = createRng(123)
    for (let i = 0; i < 1000; i++) {
      const v = rng.d20()
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(20)
    }
  })

  it('d100 values stay within 1..100', () => {
    const rng = createRng(456)
    for (let i = 0; i < 1000; i++) {
      const v = rng.d100()
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  it('rollTable selects values according to range', () => {
    const table = [
      { min: 1, max: 50, value: 'low' },
      { min: 51, max: 100, value: 'high' },
    ]
    const rng = createRng(7)
    const counts: Record<string, number> = { low: 0, high: 0 }
    for (let i = 0; i < 1000; i++) {
      counts[rng.rollTable(table)]++
    }
    // Roughly half-half, well within tolerance
    expect(counts.low).toBeGreaterThan(400)
    expect(counts.high).toBeGreaterThan(400)
    expect(counts.low + counts.high).toBe(1000)
  })

  it('pick returns elements from the array', () => {
    const rng = createRng(99)
    const items = ['a', 'b', 'c'] as const
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items))
    }
  })

  it('pick throws on empty array', () => {
    const rng = createRng(1)
    expect(() => rng.pick([])).toThrow()
  })

  it('dN throws on n <= 0', () => {
    const rng = createRng(1)
    expect(() => rng.dN(0)).toThrow()
    expect(() => rng.dN(-1)).toThrow()
  })

  it('rollTable derives dice size from the table max', () => {
    // A d20-shaped table — rollTable should roll d20, not d100.
    const d20Table = [
      { min: 1, max: 10, value: 'low' },
      { min: 11, max: 20, value: 'high' },
    ]
    const rng = createRng(11)
    // Should never throw — every d20 roll falls into one of the ranges
    for (let i = 0; i < 500; i++) {
      expect(['low', 'high']).toContain(rng.rollTable(d20Table))
    }
  })

  it('rollTable throws if a roll lands in a gap between table rows', () => {
    // Table with a gap at 31..50 — d100 may roll there and throw.
    const gapTable = [
      { min: 1, max: 30, value: 'a' },
      { min: 51, max: 100, value: 'b' },
    ]
    const rng = createRng(11)
    let threw = false
    try {
      for (let i = 0; i < 500; i++) rng.rollTable(gapTable)
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})
