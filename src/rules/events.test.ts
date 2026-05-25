import { describe, expect, it } from 'vitest'
import { humanAdaptabilityBonus, resolveRandomEvent } from './events'
import { createStartingDomain } from './createDomain'
import { createRng } from './rng'
import type { RealmState } from './state'

function uuids() {
  let n = 0
  return () => `id-${n++}`
}

function freshRealm(): RealmState {
  return createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'EventTest',
    ownerId: 'o',
    uuid: uuids(),
  })
}

describe('resolveRandomEvent', () => {
  it('emits exactly one event of a known type', () => {
    const realm = freshRealm()
    const known = [
      'incursion', 'infestation', 'poor_weather',
      'good_weather', 'beneficial_find', 'no_event',
    ]
    // Try several seeds to exercise different branches
    for (let seed = 1; seed < 20; seed++) {
      const out = resolveRandomEvent(realm, createRng(seed), 'spring_end')
      expect(known).toContain(out.event.type)
    }
  })

  it('poor_weather sets weatherModifier to -0.1', () => {
    // Find a seed that lands on Poor Weather (d20 = 6..8)
    let found = false
    for (let seed = 1; seed < 200 && !found; seed++) {
      const out = resolveRandomEvent(freshRealm(), createRng(seed), 'spring_end')
      if (out.event.type === 'poor_weather') {
        expect(out.state.weatherModifier).toBe(-0.1)
        found = true
      }
    }
    expect(found).toBe(true)
  })

  it('good_weather sets weatherModifier to +0.1', () => {
    let found = false
    for (let seed = 1; seed < 200 && !found; seed++) {
      const out = resolveRandomEvent(freshRealm(), createRng(seed), 'spring_end')
      if (out.event.type === 'good_weather') {
        expect(out.state.weatherModifier).toBeCloseTo(0.1, 5)
        found = true
      }
    }
    expect(found).toBe(true)
  })

  it('infestation reduces a non-zero resource', () => {
    let found = false
    for (let seed = 1; seed < 500 && !found; seed++) {
      const realm = freshRealm()
      const out = resolveRandomEvent(realm, createRng(seed), 'spring_end')
      if (out.event.type === 'infestation') {
        const { lostResource, amount } = out.event.payload as Record<string, unknown>
        if (lostResource !== null) {
          // The targeted resource should have decreased by `amount`
          const key = lostResource as keyof typeof realm.resources
          expect(out.state.resources[key]).toBeLessThanOrEqual(realm.resources[key])
          expect(out.state.resources[key]).toBe(
            realm.resources[key] - (amount as number),
          )
        }
        found = true
      }
    }
    expect(found).toBe(true)
  })

  it('beneficial_find with treasury mode adds gold', () => {
    let found = false
    for (let seed = 1; seed < 1000 && !found; seed++) {
      const realm = freshRealm()
      const out = resolveRandomEvent(realm, createRng(seed), 'spring_end')
      if (out.event.type === 'beneficial_find') {
        const payload = out.event.payload as { mode: string; gold?: number }
        if (payload.mode === 'treasury_gold') {
          expect(payload.gold).toBeGreaterThanOrEqual(1)
          expect(payload.gold).toBeLessThanOrEqual(4)
          expect(out.state.resources.gold).toBe(realm.resources.gold + (payload.gold ?? 0))
          found = true
        }
      }
    }
    expect(found).toBe(true)
  })

  it('incursion event includes a creature, unit count, and arrival season', () => {
    let found = false
    for (let seed = 1; seed < 100 && !found; seed++) {
      const out = resolveRandomEvent(freshRealm(), createRng(seed), 'spring_end')
      if (out.event.type === 'incursion') {
        const p = out.event.payload as Record<string, unknown>
        expect(p.creature).toBeTruthy()
        expect(p.numUnits).toBeGreaterThanOrEqual(1)
        expect(p.numUnits).toBeLessThanOrEqual(4)
        expect(['spring', 'summer', 'fall', 'winter']).toContain(p.arrivalSeason)
        found = true
      }
    }
    expect(found).toBe(true)
  })

  it('humanAdaptabilityBonus returns 0 for a fresh realm (no working pops)', () => {
    expect(humanAdaptabilityBonus(freshRealm())).toBe(0)
  })

  it('humanAdaptabilityBonus returns 2 when all working pops are humans', () => {
    const base = freshRealm()
    const realm: RealmState = {
      ...base,
      populations: [
        { id: 'p1', race: 'humans', count: 5, homeAreaId: base.areas[0].id, workAreaId: base.areas[0].id },
      ],
    }
    expect(humanAdaptabilityBonus(realm)).toBe(2)
  })

  it('humanAdaptabilityBonus returns 0 if any non-human is also working', () => {
    const base = freshRealm()
    const realm: RealmState = {
      ...base,
      populations: [
        { id: 'p1', race: 'humans', count: 5, homeAreaId: base.areas[0].id, workAreaId: base.areas[0].id },
        { id: 'p2', race: 'dwarves', count: 1, homeAreaId: base.areas[1].id, workAreaId: base.areas[1].id },
      ],
    }
    expect(humanAdaptabilityBonus(realm)).toBe(0)
  })

  it('humanAdaptabilityBonus ignores unassigned (workAreaId null) populations', () => {
    const base = freshRealm()
    const realm: RealmState = {
      ...base,
      populations: [
        { id: 'p1', race: 'humans', count: 5, homeAreaId: base.areas[0].id, workAreaId: base.areas[0].id },
        { id: 'p2', race: 'dwarves', count: 1, homeAreaId: null, workAreaId: null },
      ],
    }
    // Dwarves aren't working — bonus stays at +2
    expect(humanAdaptabilityBonus(realm)).toBe(2)
  })

  it('over many rolls, event distribution is sane (~35% no_event)', () => {
    // d20 9..15 = 7/20 = 35% no_event
    const counts: Record<string, number> = {}
    for (let i = 0; i < 5000; i++) {
      const out = resolveRandomEvent(freshRealm(), createRng(i + 1), 'spring_end')
      counts[out.event.type] = (counts[out.event.type] ?? 0) + 1
    }
    const noEventPct = (counts.no_event ?? 0) / 5000
    expect(noEventPct).toBeGreaterThan(0.30)
    expect(noEventPct).toBeLessThan(0.40)
  })
})
