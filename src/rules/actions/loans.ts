/**
 * Loans (3e.5)
 *
 * Three pieces:
 *
 *   - Loan model. Simple interest at 10% per season on the *original*
 *     principal, paid from gold at the start of every season EXCEPT the
 *     season the loan was taken (per book §7).
 *
 *   - Raise Loans action. Limited (once per season). Player picks a
 *     desired principal; engine rolls Knowledge(economics) and grants
 *     `min(desired, max(0, total - 20))` gp. If total ≤ 20 the lender
 *     refuses and no loan is created.
 *
 *   - Repay Loan action. Player-initiated; pay back the full principal in
 *     gold to clear the debt.
 *
 *   - Seasonal interest auto-action. Runs at every season_start; for each
 *     active loan, deducts 10% × principal (rounded up to a whole gp). If
 *     gold is insufficient, the payment is skipped and `missedInterestSeasons`
 *     increments — when that hits 4 (a full year's worth) the banker
 *     conspiracy penalty would kick in (deferred).
 */

import type { Season } from '../../types/rules'
import type { RealmState, TurnEvent } from '../state'
import type { Rng } from '../rng'
import type { ActionLog } from './types'
import { rollEconomicsCheck } from './economy'

// ============================================================
// Types
// ============================================================

export class LoanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoanError'
  }
}

export interface Loan {
  id: string
  /** Original amount borrowed; doesn't change until the loan is repaid. */
  principal: number
  startedYear: number
  startedSeason: Season
  /**
   * Counts seasons the realm could not afford to pay interest. When this
   * reaches 4 (one full year) the banker-conspiracy mechanic activates.
   * For now it's a passive counter — a future phase will hook it into
   * Sell Goods conversion ratios.
   */
  missedInterestSeasons: number
}

interface LoanOutcome {
  state: RealmState
  events: TurnEvent[]
}

export const LOAN_INTEREST_RATE = 0.1
const RAISE_LOANS_DC = 20

/**
 * Per-season interest cost for a single loan, rounded up so the realm
 * always pays in whole gp.
 */
export function loanInterest(loan: Loan): number {
  return Math.ceil(loan.principal * LOAN_INTEREST_RATE)
}

/** Total interest the realm owes per season across all active loans. */
export function totalInterestPerSeason(state: RealmState): number {
  return state.loans.reduce((sum, l) => sum + loanInterest(l), 0)
}

/**
 * Number of consecutive missed-interest seasons that triggers the banker
 * conspiracy penalty. Per book §7: "Skip interest for a year and bankers
 * conspire against you" — a year is four seasons.
 */
export const BANKER_CONSPIRACY_THRESHOLD = 4

/**
 * Returns true if any active loan has missed enough consecutive interest
 * payments to trigger the banker conspiracy. Sell Goods uses this flag to
 * double its conversion ratios.
 */
export function bankerConspiracyActive(state: RealmState): boolean {
  return state.loans.some(
    (l) => l.missedInterestSeasons >= BANKER_CONSPIRACY_THRESHOLD,
  )
}

// ============================================================
// Raise Loans — interactive, Limited
// ============================================================

export interface RaiseLoanParams {
  /**
   * The maximum principal the player wants. The lender may grant less if
   * the economics check doesn't justify the full amount; if total ≤ 20
   * (DC) the lender refuses and no loan is created.
   */
  desired: number
}

export function executeRaiseLoans(
  state: RealmState,
  params: RaiseLoanParams,
  rng: Rng,
  uuid: () => string = () => crypto.randomUUID(),
): LoanOutcome {
  if (state.actionsThisSeason.some((l) => l.actionId === 'raise_loans')) {
    throw new LoanError('Raise Loans is Limited — already taken this season.')
  }
  if (!Number.isInteger(params.desired) || params.desired <= 0) {
    throw new LoanError(
      `Desired principal must be a positive integer (got ${params.desired}).`,
    )
  }

  const check = rollEconomicsCheck(state, rng)
  const maxAvailable = Math.max(0, check.total - RAISE_LOANS_DC)
  const granted = Math.min(params.desired, maxAvailable)

  const log: ActionLog = {
    actionId: 'raise_loans',
    takenAt: new Date().toISOString(),
  }

  if (granted <= 0) {
    // Refused — no loan, no gp transfer, but the action still counts as
    // taken so the player can't retry this season.
    return {
      state: { ...state, actionsThisSeason: [...state.actionsThisSeason, log] },
      events: [
        {
          type: 'raise_loans_refused',
          payload: {
            desired: params.desired,
            check: {
              natural: check.natural,
              total: check.total,
              treasurerBonus: check.treasurerBonus,
              treasurerName: check.treasurerName,
              marketplaceBonus: check.marketplaceBonus,
              portBonus: check.portBonus,
              critFail: check.critFail,
            },
            dc: RAISE_LOANS_DC,
          },
        },
      ],
    }
  }

  const loan: Loan = {
    id: uuid(),
    principal: granted,
    startedYear: state.year,
    startedSeason: state.season,
    missedInterestSeasons: 0,
  }

  return {
    state: {
      ...state,
      resources: {
        ...state.resources,
        gold: state.resources.gold + granted,
      },
      loans: [...state.loans, loan],
      actionsThisSeason: [...state.actionsThisSeason, log],
    },
    events: [
      {
        type: 'raise_loans',
        payload: {
          loanId: loan.id,
          desired: params.desired,
          granted,
          interestPerSeason: loanInterest(loan),
          check: {
            natural: check.natural,
            total: check.total,
            treasurerBonus: check.treasurerBonus,
            treasurerName: check.treasurerName,
            marketplaceBonus: check.marketplaceBonus,
            portBonus: check.portBonus,
            critFail: check.critFail,
          },
          dc: RAISE_LOANS_DC,
        },
      },
    ],
  }
}

// ============================================================
// Repay Loan — pay any amount toward principal (full repayment clears it)
// ============================================================

export interface RepayLoanParams {
  loanId: string
  /**
   * How many gp to pay. If equal to or greater than the remaining
   * principal, the loan is fully cleared. Otherwise the principal is
   * reduced and the loan stays on the books with smaller future interest
   * (recomputed off the lower principal).
   */
  amount: number
}

export function executeRepayLoan(
  state: RealmState,
  params: RepayLoanParams,
): LoanOutcome {
  const loan = state.loans.find((l) => l.id === params.loanId)
  if (!loan) {
    throw new LoanError(`No loan with id ${params.loanId}.`)
  }
  if (!Number.isInteger(params.amount) || params.amount <= 0) {
    throw new LoanError(`Repayment amount must be a positive integer (got ${params.amount}).`)
  }

  // Cap the payment at the outstanding principal BEFORE the affordability
  // check — overpaying a 5 gp loan with `amount: 100` should pay 5, not
  // throw "not enough gold". The realm only ever owes the principal.
  const payment = Math.min(params.amount, loan.principal)
  if (state.resources.gold < payment) {
    throw new LoanError(
      `Not enough gold (want to pay ${payment}, have ${state.resources.gold}).`,
    )
  }
  const remaining = loan.principal - payment

  if (remaining <= 0) {
    // Full clear
    return {
      state: {
        ...state,
        resources: { ...state.resources, gold: state.resources.gold - payment },
        loans: state.loans.filter((l) => l.id !== loan.id),
      },
      events: [
        {
          type: 'loan_repaid',
          payload: {
            loanId: loan.id,
            principal: loan.principal,
            payment,
            remaining: 0,
            cleared: true,
          },
        },
      ],
    }
  }

  // Partial repayment: reduce principal, keep the loan on the books.
  // missedInterestSeasons is preserved — paying down doesn't forgive missed
  // interest history (the banker conspiracy clock keeps ticking).
  return {
    state: {
      ...state,
      resources: { ...state.resources, gold: state.resources.gold - payment },
      loans: state.loans.map((l) =>
        l.id === loan.id ? { ...l, principal: remaining } : l,
      ),
    },
    events: [
      {
        type: 'loan_repaid',
        payload: {
          loanId: loan.id,
          principal: loan.principal,
          payment,
          remaining,
          cleared: false,
        },
      },
    ],
  }
}

// ============================================================
// Seasonal Interest — auto, runs at every season_start
// ============================================================

/**
 * For each loan that wasn't taken this season, deducts 10% of principal
 * (rounded up). Loans whose interest can't be paid have their
 * missedInterestSeasons counter incremented; the principal isn't capitalized
 * (still simple interest).
 */
export function executeSeasonalInterest(
  state: RealmState,
  _rng: Rng,
): LoanOutcome {
  if (state.loans.length === 0) {
    return {
      state,
      events: [
        {
          type: 'seasonal_interest',
          payload: { phase: state.season, loans: 0 },
        },
      ],
    }
  }

  let next = state
  let totalPaid = 0
  const paid: { loanId: string; interest: number }[] = []
  const skipped: { loanId: string; interest: number; missedNow: number }[] = []
  let updatedLoans: Loan[] = state.loans

  for (const loan of state.loans) {
    // Skip the season the loan was taken.
    if (loan.startedYear === state.year && loan.startedSeason === state.season) {
      continue
    }
    const due = loanInterest(loan)
    if (next.resources.gold >= due) {
      next = {
        ...next,
        resources: { ...next.resources, gold: next.resources.gold - due },
      }
      totalPaid += due
      paid.push({ loanId: loan.id, interest: due })
    } else {
      const updated: Loan = {
        ...loan,
        missedInterestSeasons: loan.missedInterestSeasons + 1,
      }
      updatedLoans = updatedLoans.map((l) => (l.id === loan.id ? updated : l))
      skipped.push({
        loanId: loan.id,
        interest: due,
        missedNow: updated.missedInterestSeasons,
      })
    }
  }

  return {
    state: { ...next, loans: updatedLoans },
    events: [
      {
        type: 'seasonal_interest',
        payload: {
          phase: state.season,
          loans: state.loans.length,
          paidCount: paid.length,
          skippedCount: skipped.length,
          totalPaid,
          paid,
          skipped,
        },
      },
    ],
  }
}
