import { describe, expect, it } from 'vitest'
import { abilityMod } from './state'

describe('abilityMod', () => {
  it('returns 0 for score 10 and 11 (D&D 3e baseline)', () => {
    expect(abilityMod(10)).toBe(0)
    expect(abilityMod(11)).toBe(0)
  })

  it('returns +1 for score 12 and 13', () => {
    expect(abilityMod(12)).toBe(1)
    expect(abilityMod(13)).toBe(1)
  })

  it('returns -1 for score 8 and 9', () => {
    expect(abilityMod(8)).toBe(-1)
    expect(abilityMod(9)).toBe(-1)
  })

  it('returns +3 for score 16 (canonical CHA: 16 (+3) example)', () => {
    expect(abilityMod(16)).toBe(3)
  })

  it('returns +4 for score 18', () => {
    expect(abilityMod(18)).toBe(4)
  })

  it('returns -5 for score 1 (the minimum)', () => {
    expect(abilityMod(1)).toBe(-5)
  })

  it('returns +5 for score 20', () => {
    expect(abilityMod(20)).toBe(5)
  })
})
