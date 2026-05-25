/**
 * Seedable RNG for the rules engine.
 *
 * Most of the rules involve dice rolls (d20, d100, d10, etc.). We use a
 * deterministic PRNG so:
 *  - Tests can assert exact outcomes by passing a fixed seed.
 *  - Replays of a season produce the same result given the same starting state.
 *
 * The algorithm is mulberry32 — a 32-bit PRNG that's small, fast, and good
 * enough for game randomness (it's not cryptographically secure, which is
 * fine here).
 *
 * Usage:
 *   const rng = createRng(42)        // deterministic
 *   const rng = createRng()          // seeded from Math.random()
 *   rng.d20()                        // 1..20
 *   rng.dN(6)                        // 1..6
 *   rng.pick(['a', 'b', 'c'])        // weighted-uniform choice
 */

export interface Rng {
  /** Returns a float in [0, 1). */
  next(): number
  /** Returns an integer in [1, n] inclusive. */
  dN(n: number): number
  /** Returns 1..20. */
  d20(): number
  /** Returns 1..100. */
  d100(): number
  /** Returns 1..10. */
  d10(): number
  /** Returns 1..6. */
  d6(): number
  /** Returns 1..4. */
  d4(): number
  /** Picks a random element. Throws on empty array. */
  pick<T>(items: readonly T[]): T
  /**
   * Picks an entry from a weighted probability table where each row maps a
   * d100 range [min, max] (inclusive) to a value. The ranges must cover 1..100
   * without gaps for correctness.
   */
  rollTable<T>(table: readonly { min: number; max: number; value: T }[]): T
}

/**
 * Creates a deterministic RNG. If no seed is given, derives one from Math.random().
 */
export function createRng(seed?: number): Rng {
  // Initialize state from seed (or random fallback)
  let state = (seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0
  if (state === 0) state = 1 // mulberry32 needs non-zero seed

  // mulberry32 — the core PRNG step
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const dN = (n: number): number => {
    if (n <= 0) throw new Error(`dN requires n > 0, got ${n}`)
    return Math.floor(next() * n) + 1
  }

  const pick = <T,>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error('pick: empty array')
    return items[Math.floor(next() * items.length)]
  }

  const rollTable = <T,>(
    table: readonly { min: number; max: number; value: T }[],
  ): T => {
    if (table.length === 0) throw new Error('rollTable: empty table')
    // Derive dice size from the table itself: largest `max` is the dN we roll.
    // This lets the same helper drive a d20 events table AND a d100 mineral table.
    const tableMax = table.reduce((m, row) => Math.max(m, row.max), 0)
    const r = dN(tableMax)
    for (const row of table) {
      if (r >= row.min && r <= row.max) return row.value
    }
    // If the rows have gaps (e.g. 1-30 then 51-100), a roll might land in
    // the gap. That's a bug in the table definition — surface it loudly.
    throw new Error(`rollTable: roll ${r} not covered by table (max=${tableMax})`)
  }

  return {
    next,
    dN,
    d20: () => dN(20),
    d100: () => dN(100),
    d10: () => dN(10),
    d6: () => dN(6),
    d4: () => dN(4),
    pick,
    rollTable,
  }
}
