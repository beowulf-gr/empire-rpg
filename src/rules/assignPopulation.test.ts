import { describe, expect, it } from 'vitest'
import {
  AssignPopulationError,
  movePopulationHome,
  setPopulationWork,
} from './assignPopulation'
import { createStartingDomain } from './createDomain'

function uuids() {
  let n = 0
  return () => `aid-${n++}`
}

function fresh() {
  return createStartingDomain({
    scale: 'barony',
    climateTemplate: 'standard',
    name: 'Assign Test',
    ownerId: 'o',
    uuid: uuids(),
    skipBootSpring: true,
  })
}

describe('starter realm distribution', () => {
  it('starter pop is unallocated (no home, no work)', () => {
    const realm = fresh()
    const total = realm.populations.reduce((s, p) => s + p.count, 0)
    expect(total).toBe(10)
    for (const p of realm.populations) {
      expect(p.homeAreaId).toBeNull()
      expect(p.workAreaId).toBeNull()
    }
  })
})

describe('movePopulationHome', () => {
  it('moves pop from the unallocated pool to an area (work stays untouched)', () => {
    const realm = fresh()
    const toArea = realm.areas.find((a) => a.terrain === 'plains')!

    const next = movePopulationHome(
      realm,
      { race: 'humans', fromHomeAreaId: null, toHomeAreaId: toArea.id, count: 3 },
      uuids(),
    )

    const unallocated = next.populations.find(
      (p) => p.race === 'humans' && p.homeAreaId === null,
    )
    expect(unallocated?.count).toBe(7)

    const moved = next.populations.find(
      (p) => p.race === 'humans' && p.homeAreaId === toArea.id,
    )
    expect(moved?.count).toBe(3)
    // Default keepWork=true means the work assignment isn't dragged along.
    // Source had workAreaId=null (pool), so moved units stay idle.
    expect(moved?.workAreaId).toBeNull()
  })

  it('keepWork=false drags work along to the new home', () => {
    const realm = fresh()
    const homeA = realm.areas.find((a) => a.terrain === 'plains')!

    const next = movePopulationHome(
      realm,
      {
        race: 'humans',
        fromHomeAreaId: null,
        toHomeAreaId: homeA.id,
        count: 1,
        keepWork: false,
      },
      uuids(),
    )
    const moved = next.populations.find(
      (p) => p.race === 'humans' && p.homeAreaId === homeA.id,
    )
    expect(moved?.workAreaId).toBe(homeA.id)
  })

  it('throws if not enough population at the source', () => {
    const realm = fresh()
    expect(() =>
      movePopulationHome(realm, {
        race: 'humans',
        fromHomeAreaId: null,
        toHomeAreaId: realm.areas[0].id,
        count: 99,
      }),
    ).toThrow(AssignPopulationError)
  })

  it('is a no-op when source and destination match (both null)', () => {
    const realm = fresh()
    const next = movePopulationHome(realm, {
      race: 'humans',
      fromHomeAreaId: null,
      toHomeAreaId: null,
      count: 1,
    })
    expect(next).toBe(realm)
  })
})

describe('setPopulationWork', () => {
  it('changes work area while leaving home unchanged', () => {
    const realm = fresh()
    const homeArea = realm.areas.find((a) => a.terrain === 'plains')!
    const workArea = realm.areas.find(
      (a) => a.id !== homeArea.id && a.terrain === 'plains',
    )!

    // Allocate 1 human to homeArea with work-follows-home (legacy keepWork=false)
    let s = movePopulationHome(
      realm,
      {
        race: 'humans',
        fromHomeAreaId: null,
        toHomeAreaId: homeArea.id,
        count: 1,
        keepWork: false,
      },
      uuids(),
    )
    // Now move their work to workArea
    s = setPopulationWork(
      s,
      {
        race: 'humans',
        homeAreaId: homeArea.id,
        fromWorkAreaId: homeArea.id,
        toWorkAreaId: workArea.id,
        count: 1,
      },
      uuids(),
    )

    const moved = s.populations.find(
      (p) =>
        p.race === 'humans' &&
        p.homeAreaId === homeArea.id &&
        p.workAreaId === workArea.id,
    )
    expect(moved?.count).toBe(1)
    const original = s.populations.find(
      (p) =>
        p.race === 'humans' &&
        p.homeAreaId === homeArea.id &&
        p.workAreaId === homeArea.id,
    )
    expect(original).toBeUndefined()
  })

  it('can set work to null (idle)', () => {
    const realm = fresh()
    const homeArea = realm.areas.find((a) => a.terrain === 'plains')!
    let s = movePopulationHome(
      realm,
      {
        race: 'humans',
        fromHomeAreaId: null,
        toHomeAreaId: homeArea.id,
        count: 1,
        keepWork: false,
      },
      uuids(),
    )
    s = setPopulationWork(
      s,
      {
        race: 'humans',
        homeAreaId: homeArea.id,
        fromWorkAreaId: homeArea.id,
        toWorkAreaId: null,
        count: 1,
      },
      uuids(),
    )
    const idle = s.populations.find(
      (p) => p.race === 'humans' && p.homeAreaId === homeArea.id && p.workAreaId === null,
    )
    expect(idle?.count).toBe(1)
  })

  it('throws on insufficient pop in the source slot', () => {
    const realm = fresh()
    const homeArea = realm.areas.find((a) => a.terrain === 'plains')!
    expect(() =>
      setPopulationWork(realm, {
        race: 'humans',
        homeAreaId: homeArea.id,
        fromWorkAreaId: homeArea.id,
        toWorkAreaId: null,
        count: 99,
      }),
    ).toThrow(AssignPopulationError) // throws "no humans stack found at home=…" since nothing's there yet
  })

  it('auto-houses a pool unit when assigning it to work an area with space', () => {
    const realm = fresh()
    const target = realm.areas.find((a) => a.terrain === 'plains')!

    const next = setPopulationWork(
      realm,
      {
        race: 'humans',
        homeAreaId: null,
        fromWorkAreaId: null,
        toWorkAreaId: target.id,
        count: 1,
        autoHouseIfSpace: true,
      },
      uuids(),
    )

    // The moved unit should now BOTH live AND work at the target area.
    const housed = next.populations.find(
      (p) =>
        p.race === 'humans' &&
        p.homeAreaId === target.id &&
        p.workAreaId === target.id,
    )
    expect(housed?.count).toBe(1)
    // The pool shrinks by one.
    const pool = next.populations.find(
      (p) => p.race === 'humans' && p.homeAreaId === null && p.workAreaId === null,
    )
    expect(pool?.count).toBe(9)
  })

  it('without autoHouseIfSpace, a pool unit goes to work but stays unhoused', () => {
    const realm = fresh()
    const target = realm.areas.find((a) => a.terrain === 'plains')!

    const next = setPopulationWork(
      realm,
      {
        race: 'humans',
        homeAreaId: null,
        fromWorkAreaId: null,
        toWorkAreaId: target.id,
        count: 1,
      },
      uuids(),
    )
    const unhousedWorker = next.populations.find(
      (p) => p.race === 'humans' && p.homeAreaId === null && p.workAreaId === target.id,
    )
    expect(unhousedWorker?.count).toBe(1)
  })
})
