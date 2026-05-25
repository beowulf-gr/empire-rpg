import { describe, expect, it } from 'vitest'
import {
  executeRaiseLoans,
  executeRepayLoan,
  executeSeasonalInterest,
  loanInterest,
  LoanError,
  totalInterestPerSeason,
} from './loans'
import type { Loan } from './loans'
import { executeRecruitMinister } from './ministers'
import { createStartingDomain } from '../createDomain'
import { createRng } from '../rng'
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

function stubRng(d20Value: number) {
  return {
    next: () => 0,
    dN: (_n: number) => d20Value,
    d20: () => d20Value,
    d100: () => 1,
    d10: () => 1,
    d6: () => 1,
    d4: () => 1,
    pick: <T,>(arr: readonly T[]) => arr[0],
    rollTable: <T,>(t: readonly { min: number; max: number; value: T }[]) => t[0].value,
  }
}

// ============================================================
// loanInterest / totalInterestPerSeason
// ============================================================

describe('loanInterest', () => {
  it('rounds 10% up — a 5 gp loan costs 1 gp/season', () => {
    const loan: Loan = {
      id: 'l',
      principal: 5,
      startedYear: 1,
      startedSeason: 'spring',
      missedInterestSeasons: 0,
    }
    expect(loanInterest(loan)).toBe(1)
  })
  it('a 100 gp loan costs 10 gp/season', () => {
    const loan: Loan = {
      id: 'l',
      principal: 100,
      startedYear: 1,
      startedSeason: 'spring',
      missedInterestSeasons: 0,
    }
    expect(loanInterest(loan)).toBe(10)
  })
})

describe('totalInterestPerSeason', () => {
  it('sums interest across loans', () => {
    const realm: RealmState = {
      ...fresh(),
      loans: [
        { id: 'a', principal: 50,  startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
        { id: 'b', principal: 100, startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
        { id: 'c', principal: 25,  startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
      ],
    }
    // 5 + 10 + 3 = 18
    expect(totalInterestPerSeason(realm)).toBe(18)
  })
})

// ============================================================
// executeRaiseLoans
// ============================================================

describe('executeRaiseLoans', () => {
  it('grants min(desired, total - 20) on success', () => {
    let realm = withResources(fresh(), { gold: 5 })
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 5 },
      uuids('hire'),
    ).state
    // After hire: gold = 5 - 2 = 3.
    // Treasurer 5 + d20=20 = 25 → max grant = 5 gp. Player asks for 3. Grant: 3.
    const { state, events } = executeRaiseLoans(
      realm,
      { desired: 3 },
      stubRng(20),
      uuids('loan'),
    )
    expect(state.resources.gold).toBe(6) // 3 + 3 borrowed
    expect(state.loans).toHaveLength(1)
    expect(state.loans[0].principal).toBe(3)
    expect(events[0].type).toBe('raise_loans')
    expect(events[0].payload).toMatchObject({ granted: 3, desired: 3 })
  })

  it('caps the grant at (total - 20) when desired exceeds it', () => {
    let realm = withResources(fresh(), { gold: 5 })
    realm = executeRecruitMinister(
      realm,
      { role: 'treasurer', name: 'T', level: 5 },
      uuids('hire'),
    ).state
    // Treasurer 5 + d20=20 = 25 → max grant = 5. Player asks 100. Grant: 5.
    const { state } = executeRaiseLoans(
      realm,
      { desired: 100 },
      stubRng(20),
      uuids('loan'),
    )
    expect(state.loans[0].principal).toBe(5)
  })

  it('refuses the loan when total <= 20', () => {
    const realm = withResources(fresh(), { gold: 5 })
    // Vacant Treasurer (-2) + d20=20 = 18 → max grant = 0. Refused.
    const { state, events } = executeRaiseLoans(
      realm,
      { desired: 50 },
      stubRng(20),
      uuids('loan'),
    )
    expect(state.loans).toHaveLength(0)
    expect(state.resources.gold).toBe(5) // unchanged
    expect(events[0].type).toBe('raise_loans_refused')
    // Action still counts as taken (Limited)
    expect(state.actionsThisSeason.some((l) => l.actionId === 'raise_loans')).toBe(true)
  })

  it('throws on second call same season (Limited)', () => {
    let realm = withResources(fresh(), { gold: 5 })
    realm = executeRaiseLoans(realm, { desired: 1 }, stubRng(20), uuids('a')).state
    expect(() =>
      executeRaiseLoans(realm, { desired: 1 }, stubRng(20), uuids('b')),
    ).toThrow(LoanError)
  })

  it('throws on non-positive desired', () => {
    expect(() =>
      executeRaiseLoans(fresh(), { desired: 0 }, stubRng(20), uuids('l')),
    ).toThrow(/positive integer/)
    expect(() =>
      executeRaiseLoans(fresh(), { desired: -10 }, stubRng(20), uuids('l')),
    ).toThrow(/positive integer/)
  })
})

// ============================================================
// executeRepayLoan
// ============================================================

describe('executeRepayLoan', () => {
  it('full repayment clears the loan', () => {
    const realm: RealmState = {
      ...withResources(fresh(), { gold: 10 }),
      loans: [
        { id: 'l1', principal: 5, startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
      ],
    }
    const { state, events } = executeRepayLoan(realm, { loanId: 'l1', amount: 5 })
    expect(state.loans).toHaveLength(0)
    expect(state.resources.gold).toBe(5)
    expect(events[0].payload).toMatchObject({
      payment: 5,
      remaining: 0,
      cleared: true,
    })
  })

  it('partial repayment reduces principal but keeps the loan', () => {
    const realm: RealmState = {
      ...withResources(fresh(), { gold: 10 }),
      loans: [
        { id: 'l1', principal: 20, startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
      ],
    }
    const { state, events } = executeRepayLoan(realm, { loanId: 'l1', amount: 7 })
    expect(state.loans).toHaveLength(1)
    expect(state.loans[0].principal).toBe(13) // 20 - 7
    expect(state.resources.gold).toBe(3) // 10 - 7
    expect(events[0].payload).toMatchObject({
      payment: 7,
      remaining: 13,
      cleared: false,
    })
  })

  it('caps payment at outstanding principal — no overpayment', () => {
    const realm: RealmState = {
      ...withResources(fresh(), { gold: 50 }),
      loans: [
        { id: 'l1', principal: 5, startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
      ],
    }
    const { state } = executeRepayLoan(realm, { loanId: 'l1', amount: 100 })
    expect(state.loans).toHaveLength(0)
    expect(state.resources.gold).toBe(45) // 50 - 5 (capped, not 50 - 100)
  })

  it('preserves missedInterestSeasons after partial repayment', () => {
    const realm: RealmState = {
      ...withResources(fresh(), { gold: 10 }),
      loans: [
        { id: 'l1', principal: 20, startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 3 },
      ],
    }
    const { state } = executeRepayLoan(realm, { loanId: 'l1', amount: 5 })
    expect(state.loans[0].missedInterestSeasons).toBe(3)
  })

  it('throws on unknown loan id', () => {
    expect(() =>
      executeRepayLoan(fresh(), { loanId: 'nope', amount: 5 }),
    ).toThrow(/No loan/)
  })

  it('throws on non-positive amount', () => {
    const realm: RealmState = {
      ...withResources(fresh(), { gold: 10 }),
      loans: [
        { id: 'l1', principal: 5, startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
      ],
    }
    expect(() => executeRepayLoan(realm, { loanId: 'l1', amount: 0 })).toThrow(/positive integer/)
    expect(() => executeRepayLoan(realm, { loanId: 'l1', amount: -3 })).toThrow(/positive integer/)
  })

  it('throws when realm cannot afford the requested amount', () => {
    const realm: RealmState = {
      ...withResources(fresh(), { gold: 2 }),
      loans: [
        { id: 'l1', principal: 5, startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
      ],
    }
    expect(() => executeRepayLoan(realm, { loanId: 'l1', amount: 5 })).toThrow(/Not enough gold/)
  })
})

// ============================================================
// executeSeasonalInterest
// ============================================================

describe('executeSeasonalInterest', () => {
  it('emits a no-loans event when none exist', () => {
    const realm = fresh()
    const { state, events } = executeSeasonalInterest(realm, createRng(1))
    expect(state).toBe(realm)
    expect(events[0]).toMatchObject({
      type: 'seasonal_interest',
      payload: { loans: 0 },
    })
  })

  it('skips the season the loan was taken', () => {
    // Loan started in spring; we're processing spring's season_start (e.g.,
    // year 2 spring). For the actual "skip the season it was taken" check
    // to fire, the loan's startedYear+startedSeason must match the current.
    const realm: RealmState = {
      ...withResources(fresh(), { gold: 100 }),
      loans: [
        { id: 'l1', principal: 50, startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
      ],
      season: 'spring',
      year: 1,
    }
    const { state, events } = executeSeasonalInterest(realm, createRng(1))
    expect(state.resources.gold).toBe(100) // untouched
    const payload = events[0].payload as { paidCount: number; skippedCount: number }
    expect(payload.paidCount).toBe(0)
    expect(payload.skippedCount).toBe(0)
  })

  it('charges interest on a loan from a previous season', () => {
    const realm: RealmState = {
      ...withResources(fresh(), { gold: 100 }),
      loans: [
        { id: 'l1', principal: 50, startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
      ],
      season: 'summer',
      year: 1,
    }
    const { state, events } = executeSeasonalInterest(realm, createRng(1))
    expect(state.resources.gold).toBe(95) // 100 - 5
    const payload = events[0].payload as { paidCount: number; totalPaid: number }
    expect(payload.paidCount).toBe(1)
    expect(payload.totalPaid).toBe(5)
  })

  it('charges interest in subsequent years even in the same calendar season', () => {
    // Loan from spring year 1; now spring year 2 → charge interest.
    const realm: RealmState = {
      ...withResources(fresh(), { gold: 100 }),
      loans: [
        { id: 'l1', principal: 50, startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
      ],
      season: 'spring',
      year: 2,
    }
    const { state } = executeSeasonalInterest(realm, createRng(1))
    expect(state.resources.gold).toBe(95)
  })

  it('skips and increments missedInterestSeasons when gold is too low', () => {
    const realm: RealmState = {
      ...withResources(fresh(), { gold: 2 }),
      loans: [
        { id: 'l1', principal: 50, startedYear: 1, startedSeason: 'spring', missedInterestSeasons: 0 },
      ],
      season: 'summer',
      year: 1,
    }
    const { state, events } = executeSeasonalInterest(realm, createRng(1))
    expect(state.resources.gold).toBe(2) // unchanged — couldn't pay
    expect(state.loans[0].missedInterestSeasons).toBe(1)
    const payload = events[0].payload as { skippedCount: number; paidCount: number }
    expect(payload.skippedCount).toBe(1)
    expect(payload.paidCount).toBe(0)
  })
})
