import { describe, expect, it } from 'vitest'
import {
  clampNegativeDeltaForGoblins,
  commonersLoyaltyModifier,
  goblinMajorityShare,
  racialCompositionMod,
  undeadPresencePenalty,
} from './raceLoyalty'
import { createStartingDomain } from '../createDomain'
import type { RealmState } from '../state'

function uuids() {
  let n = 0
  return () => `id-${n++}`
}

function realmWithPops(pops: { race: RealmState['populations'][number]['race']; count: number }[]): RealmState {
  const base = createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'X',
    ownerId: 'o',
    uuid: uuids(),
    skipBootSpring: true,
  })
  return {
    ...base,
    populations: pops.map((p, i) => ({
      id: `pop-${i}`,
      race: p.race,
      count: p.count,
      homeAreaId: null,
      workAreaId: null,
    })),
  }
}

describe('racialCompositionMod', () => {
  it('returns 0 for an all-humans realm', () => {
    const realm = realmWithPops([{ race: 'humans', count: 10 }])
    expect(racialCompositionMod(realm)).toBe(0)
  })

  it('returns +2 for an all-dwarves realm', () => {
    const realm = realmWithPops([{ race: 'dwarves', count: 10 }])
    expect(racialCompositionMod(realm)).toBe(2)
  })

  it('returns -5 for an all-orcs realm', () => {
    const realm = realmWithPops([{ race: 'orcs', count: 10 }])
    expect(racialCompositionMod(realm)).toBe(-5)
  })

  it('weighted average for a 50/50 humans + dwarves mix → +1', () => {
    const realm = realmWithPops([
      { race: 'humans', count: 5 },
      { race: 'dwarves', count: 5 },
    ])
    expect(racialCompositionMod(realm)).toBe(1) // round(2 × 0.5) = 1
  })

  it('excludes undead from the weighted average', () => {
    const realm = realmWithPops([
      { race: 'humans', count: 5 },
      { race: 'undead', count: 5 },
    ])
    // Only humans count → 0
    expect(racialCompositionMod(realm)).toBe(0)
  })

  it('returns 0 when no non-undead population exists', () => {
    const realm = realmWithPops([{ race: 'undead', count: 5 }])
    expect(racialCompositionMod(realm)).toBe(0)
  })
})

describe('undeadPresencePenalty', () => {
  it('returns 0 when no undead are in the realm', () => {
    const realm = realmWithPops([{ race: 'humans', count: 10 }])
    expect(undeadPresencePenalty(realm)).toBe(0)
  })

  it('returns -2 when any undead exist', () => {
    const realm = realmWithPops([
      { race: 'humans', count: 10 },
      { race: 'undead', count: 1 },
    ])
    expect(undeadPresencePenalty(realm)).toBe(-2)
  })

  it('returns 0 when an undead stack is empty (count 0)', () => {
    const realm = realmWithPops([
      { race: 'humans', count: 10 },
      { race: 'undead', count: 0 },
    ])
    expect(undeadPresencePenalty(realm)).toBe(0)
  })
})

describe('commonersLoyaltyModifier', () => {
  it('combines composition and undead penalty', () => {
    // All dwarves (+2) plus an undead unit (-2 globally) → total 0
    const realm = realmWithPops([
      { race: 'dwarves', count: 10 },
      { race: 'undead', count: 1 },
    ])
    const mod = commonersLoyaltyModifier(realm)
    expect(mod.composition).toBe(2)
    expect(mod.undeadPenalty).toBe(-2)
    expect(mod.orcIdle).toBe(0)
    expect(mod.total).toBe(0)
  })

  it('adds the orc idle penalty to the total', () => {
    const base = realmWithPops([
      { race: 'orcs', count: 5 },
    ])
    const realm = { ...base, orcIdlePenalty: -3 }
    const mod = commonersLoyaltyModifier(realm)
    expect(mod.composition).toBe(-5)
    expect(mod.undeadPenalty).toBe(0)
    expect(mod.orcIdle).toBe(-3)
    expect(mod.total).toBe(-8)
  })
})

describe('goblinMajorityShare', () => {
  it('returns 0 with no goblins', () => {
    const realm = realmWithPops([{ race: 'humans', count: 10 }])
    expect(goblinMajorityShare(realm)).toBe(0)
  })

  it('returns 1.0 with all goblins', () => {
    const realm = realmWithPops([{ race: 'goblins', count: 10 }])
    expect(goblinMajorityShare(realm)).toBe(1)
  })

  it('returns 0.6 with 6 goblins and 4 humans', () => {
    const realm = realmWithPops([
      { race: 'goblins', count: 6 },
      { race: 'humans', count: 4 },
    ])
    expect(goblinMajorityShare(realm)).toBeCloseTo(0.6, 5)
  })

  it('excludes undead from the denominator', () => {
    const realm = realmWithPops([
      { race: 'goblins', count: 6 },
      { race: 'undead', count: 100 },
    ])
    // Goblins are 6/6 of the non-undead pop → 1.0
    expect(goblinMajorityShare(realm)).toBe(1)
  })
})

describe('clampNegativeDeltaForGoblins', () => {
  it('passes through positive deltas unchanged', () => {
    const realm = realmWithPops([{ race: 'goblins', count: 10 }])
    expect(clampNegativeDeltaForGoblins(realm, 2)).toBe(2)
  })

  it('passes through zero unchanged', () => {
    const realm = realmWithPops([{ race: 'goblins', count: 10 }])
    expect(clampNegativeDeltaForGoblins(realm, 0)).toBe(0)
  })

  it('clamps negative delta to 0 when goblins are the majority', () => {
    const realm = realmWithPops([
      { race: 'goblins', count: 7 },
      { race: 'humans', count: 3 },
    ])
    expect(clampNegativeDeltaForGoblins(realm, -2)).toBe(0)
  })

  it('does NOT clamp when goblins are exactly half', () => {
    const realm = realmWithPops([
      { race: 'goblins', count: 5 },
      { race: 'humans', count: 5 },
    ])
    expect(clampNegativeDeltaForGoblins(realm, -2)).toBe(-2)
  })

  it('does NOT clamp when goblins are a minority', () => {
    const realm = realmWithPops([
      { race: 'goblins', count: 3 },
      { race: 'humans', count: 7 },
    ])
    expect(clampNegativeDeltaForGoblins(realm, -2)).toBe(-2)
  })
})
