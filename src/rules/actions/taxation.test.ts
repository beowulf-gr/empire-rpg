import { describe, expect, it } from 'vitest'
import { executeRaiseTaxes, TaxError } from './taxation'
import { createStartingDomain } from '../createDomain'
import { findCommonersGroup } from '../state'
import type { RealmState } from '../state'

function uuids(prefix = 'id') {
  let n = 0
  return () => `${prefix}-${n++}`
}

function fresh(): RealmState {
  return createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'Vatra',
    ownerId: 'o',
    uuid: uuids('realm'),
    skipBootSpring: true,
  })
}

function withResources(
  state: RealmState,
  resources: Partial<RealmState['resources']>,
): RealmState {
  return {
    ...state,
    resources: {
      food: 0, lumber: 0, stone: 0, gold: 0,
      copper: 0, iron: 0, silver: 0,
      gold_metal: 0, mithral: 0, adamantine: 0,
      ...resources,
    },
  }
}

describe('executeRaiseTaxes — resource math', () => {
  it('adds floor(0.10 × n) to each pool', () => {
    const realm = withResources(fresh(), {
      food: 100,    // +10 → 110
      lumber: 50,   // +5  → 55
      stone: 25,    // +2  → 27
      gold: 9,      // +0  → 9 (floor(0.9) = 0)
      iron: 0,      // +0  → 0
    })
    const { state } = executeRaiseTaxes(realm)
    expect(state.resources.food).toBe(110)
    expect(state.resources.lumber).toBe(55)
    expect(state.resources.stone).toBe(27)
    expect(state.resources.gold).toBe(9)
    expect(state.resources.iron).toBe(0)
  })

  it('floors fractional gains (no round-up exploit on tiny pools)', () => {
    const realm = withResources(fresh(), { food: 5 }) // 0.5 → 0
    const { state } = executeRaiseTaxes(realm)
    expect(state.resources.food).toBe(5)
  })

  it('emits a delta event payload listing only changed pools', () => {
    const realm = withResources(fresh(), { food: 100, gold: 9 })
    const { events } = executeRaiseTaxes(realm)
    const evt = events[0]
    expect(evt.type).toBe('raise_taxes')
    const payload = evt.payload as { delta: Record<string, number>; loyaltyDelta: number }
    expect(payload.delta).toEqual({ food: 10 })
    expect(payload.loyaltyDelta).toBe(-2)
  })
})

describe('executeRaiseTaxes — loyalty', () => {
  it('drops commoner loyalty by 2', () => {
    const realm = fresh()
    const before = findCommonersGroup(realm)?.score ?? 0
    const { state } = executeRaiseTaxes(realm)
    const after = findCommonersGroup(state)?.score
    expect(after).toBe(before - 2)
  })

  it('still applies the loyalty hit even when no resources are gained', () => {
    const realm = withResources(fresh(), {}) // all 0
    const before = findCommonersGroup(realm)?.score ?? 0
    const { state } = executeRaiseTaxes(realm)
    const after = findCommonersGroup(state)?.score
    expect(after).toBe(before - 2)
  })
})

describe('executeRaiseTaxes — Limited enforcement', () => {
  it('appends an actionsThisSeason entry on success', () => {
    const realm = fresh()
    const { state } = executeRaiseTaxes(realm)
    expect(state.actionsThisSeason).toHaveLength(1)
    expect(state.actionsThisSeason[0].actionId).toBe('raise_taxes')
  })

  it('throws if already taken this season', () => {
    let realm = fresh()
    realm = executeRaiseTaxes(realm).state
    expect(() => executeRaiseTaxes(realm)).toThrow(TaxError)
    expect(() => executeRaiseTaxes(realm)).toThrow(/Limited/)
  })
})
