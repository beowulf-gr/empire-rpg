import { describe, expect, it } from 'vitest'
import { autoPickCols } from './CustomAreaBuilder'

describe('autoPickCols', () => {
  it("matches the user's stated examples", () => {
    expect(autoPickCols(25)).toBe(5) // 5×5
    expect(autoPickCols(28)).toBe(7) // 7×4
  })

  it('caps width at 7', () => {
    expect(autoPickCols(49)).toBe(7) // 7×7
    // Above 49 is technically beyond MAX_AREAS but the function still
    // shouldn't exceed 7. Perfect-fit beats width — n=50 prefers 5×10
    // (waste 0) over 7×8 (waste 6), same way 25 → 5×5 not 7×4.
    expect(autoPickCols(50)).toBeLessThanOrEqual(7)
    expect(autoPickCols(50)).toBe(5)
  })

  it('handles tiny counts without collapsing', () => {
    expect(autoPickCols(1)).toBe(1)
    expect(autoPickCols(2)).toBe(2)
    expect(autoPickCols(3)).toBeGreaterThanOrEqual(3)
  })

  it('prefers wider grids on ties', () => {
    // 12 has two zero-waste options: 6×2 and 4×3. 6 wider → 6.
    expect(autoPickCols(12)).toBe(6)
    // 24 has 6×4 and 4×6 and 3×8 — but only 6×4 has cols ≤ 7 and ≥ 3.
    // Actually 6×4 = 24, 4×6 = 24, 3×8 = 24 all waste 0. Widest wins → 6.
    expect(autoPickCols(24)).toBe(6)
  })

  it('falls back to 3+ cols even when narrower would have less waste', () => {
    // 22 has zero-waste options at 2×11 and 1×22, both width < 3.
    // The widest 3+-col option is 6×4 = 24 (waste 2). 6 wider than 4 → 6.
    expect(autoPickCols(22)).toBe(6)
  })

  it('handles perfect squares cleanly', () => {
    expect(autoPickCols(9)).toBe(3)   // 3×3
    expect(autoPickCols(16)).toBe(4)  // 4×4
    expect(autoPickCols(25)).toBe(5)  // 5×5
    expect(autoPickCols(36)).toBe(6)  // 6×6
  })

  it('produces a sensible rectangle for every count 2..49', () => {
    for (let n = 2; n <= 49; n++) {
      const cols = autoPickCols(n)
      const rows = Math.ceil(n / cols)
      const waste = cols * rows - n
      // Bounded width
      expect(cols).toBeGreaterThanOrEqual(Math.min(3, n))
      expect(cols).toBeLessThanOrEqual(7)
      // Never waste more than 6 cells (i.e. less than a full row when wide)
      expect(waste).toBeLessThan(cols)
    }
  })
})
