import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import {
  executeRaiseLoans,
  executeRepayLoan,
  loanInterest,
  totalInterestPerSeason,
} from '../../../rules/actions/loans'
import { findMinisterByRole } from '../../../rules/actions/ministers'
import { createRng } from '../../../rules/rng'
import { queryKeys } from '../../../hooks/queryKeys'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

export function RaiseLoansPanel({ realm, realmId, onClose }: Props) {
  const [desired, setDesired] = useState<number>(10)
  const queryClient = useQueryClient()

  const raise = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const { state } = executeRaiseLoans(cached, { desired }, createRng())
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  const repay = useMutation({
    mutationFn: async (vars: { loanId: string; amount: number }) => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const { state } = executeRepayLoan(cached, vars)
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  // Per-loan partial-repayment input. We store it per loan id so each row's
  // input is independent.
  const [repayInputs, setRepayInputs] = useState<Record<string, number>>({})

  const treasurer = findMinisterByRole(realm.ministers, 'treasurer')
  const marketplaceCount = realm.strongholds.filter((s) => s.kind === 'marketplace').length
  const portCount = realm.strongholds.filter((s) => s.kind === 'port').length
  const alreadyTakenThisSeason = realm.actionsThisSeason.some(
    (l) => l.actionId === 'raise_loans',
  )
  const invalidDesired = !Number.isInteger(desired) || desired <= 0
  const canSubmit = !alreadyTakenThisSeason && !invalidDesired && !raise.isPending

  // Approximate range: best case = nat 20 + treasurer + add-ons + 2-per-port + 2-per-mkt - 20.
  const bonusSum = (treasurer?.level ?? -2) + marketplaceCount * 2 + portCount * 2
  const bestCase = Math.max(0, 20 + bonusSum - 20)
  const worstCase = Math.max(0, 1 + bonusSum - 20)
  const expected = Math.max(0, 10 + bonusSum - 20) // average d10.5

  const submit = async () => {
    try {
      await raise.mutateAsync()
      onClose()
    } catch {
      /* surfaced via raise.error */
    }
  }

  const repayLoan = async (loanId: string, amount: number) => {
    try {
      await repay.mutateAsync({ loanId, amount })
    } catch {
      /* surfaced via repay.error */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Raise Loans</h3>
          <p className="text-sm text-stone-500">
            Treasurer rolls Knowledge(economics). The lender grants up to (total − 20) gp.
            Each loan accrues 10% simple interest per season — paid every season except the
            one in which it was taken.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {/* Existing loans */}
          {realm.loans.length > 0 ? (
            <section>
              <div className="text-sm font-medium mb-1.5">
                Outstanding loans ({realm.loans.length})
                <span className="text-stone-500 font-normal">
                  {' '}· total interest {totalInterestPerSeason(realm)} gp/season
                </span>
              </div>
              <ul className="border border-stone-200 dark:border-stone-800 rounded divide-y divide-stone-200 dark:divide-stone-800">
                {realm.loans.map((loan) => {
                  const due = loanInterest(loan)
                  const inputAmount = repayInputs[loan.id] ?? loan.principal
                  const canAffordFull = realm.resources.gold >= loan.principal
                  const canAffordInput = realm.resources.gold >= inputAmount
                  const validAmount =
                    Number.isInteger(inputAmount) && inputAmount > 0 && inputAmount <= loan.principal
                  return (
                    <li key={loan.id} className="px-3 py-2 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-sm">
                          <strong>{loan.principal} gp</strong>
                          <span className="text-stone-500">
                            {' '}· taken {loan.startedSeason} year {loan.startedYear}
                          </span>
                          <div className="text-xs text-stone-500">
                            Interest: {due} gp/season
                            {loan.missedInterestSeasons > 0 && (
                              <span className="text-amber-600 dark:text-amber-400 ml-2">
                                ({loan.missedInterestSeasons} season{loan.missedInterestSeasons === 1 ? '' : 's'} missed)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max={loan.principal}
                          step="1"
                          value={inputAmount}
                          onChange={(e) =>
                            setRepayInputs({
                              ...repayInputs,
                              [loan.id]: Math.floor(Number(e.target.value)) || 0,
                            })
                          }
                          className="w-20 text-xs px-2 py-1 rounded border border-stone-300 dark:border-stone-700 bg-transparent"
                        />
                        <span className="text-xs text-stone-500">gp</span>
                        <button
                          onClick={() => void repayLoan(loan.id, inputAmount)}
                          disabled={!validAmount || !canAffordInput || repay.isPending}
                          className="text-xs px-3 py-1 border border-stone-300 dark:border-stone-700 rounded hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
                          title={!canAffordInput ? `Need ${inputAmount} gp` : 'Pay this amount toward the loan'}
                        >
                          Pay
                        </button>
                        {loan.principal > 1 && canAffordFull && (
                          <button
                            onClick={() => void repayLoan(loan.id, loan.principal)}
                            disabled={repay.isPending}
                            className="text-xs px-3 py-1 border border-stone-300 dark:border-stone-700 rounded hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
                            title="Pay off the full principal"
                          >
                            Pay all ({loan.principal} gp)
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {repay.error && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">
                  {repay.error.message}
                </p>
              )}
            </section>
          ) : (
            <p className="text-sm text-stone-500">No outstanding loans.</p>
          )}

          {/* New loan */}
          <section className="border-t border-stone-200 dark:border-stone-800 pt-4">
            <div className="text-sm font-medium mb-1.5">Take a new loan</div>
            {alreadyTakenThisSeason && (
              <div className="text-sm text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 rounded p-2 mb-3">
                Raise Loans is Limited — already taken this season. Try again next season.
              </div>
            )}

            <label className="block">
              <span className="text-sm font-medium">Desired principal (gp)</span>
              <input
                type="number"
                min="1"
                step="1"
                value={desired}
                onChange={(e) => setDesired(Math.floor(Number(e.target.value)) || 1)}
                disabled={alreadyTakenThisSeason}
                className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
              />
              <span className="text-xs text-stone-500 mt-1 block">
                The lender grants up to (check total − 20). If the roll comes up short you
                receive the lower amount; on a hopeless roll, no loan.
              </span>
            </label>

            <div className="border-t border-stone-200 dark:border-stone-800 pt-3 mt-3 text-sm space-y-1">
              <div className="text-stone-500 text-xs">Estimated grant range</div>
              <ul className="text-xs space-y-0.5">
                <li>
                  Treasurer:{' '}
                  {treasurer ? (
                    <span>+{treasurer.level} ({treasurer.name})</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">-2 (vacant role)</span>
                  )}
                </li>
                <li>Marketplaces: +{marketplaceCount * 2} ({marketplaceCount}× +2)</li>
                <li>Ports: +{portCount * 2} ({portCount}× +2)</li>
                <li>
                  Worst (nat 1): up to <strong>{worstCase} gp</strong>
                  {' '}· Average (~10): <strong>{expected} gp</strong>
                  {' '}· Best (nat 20): <strong>{bestCase} gp</strong>
                </li>
              </ul>
              {desired > 0 && (
                <div className="text-xs text-stone-500">
                  If granted in full, this loan would cost {Math.ceil(desired * 0.1)} gp/season in interest.
                </div>
              )}
            </div>

            {raise.error && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2" role="alert">
                {raise.error.message}
              </p>
            )}
          </section>
        </div>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Close
          </button>
          <button
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {raise.isPending ? 'Borrowing…' : 'Take loan'}
          </button>
        </footer>
      </div>
    </div>
  )
}
