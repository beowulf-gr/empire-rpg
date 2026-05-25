import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ResourceKey } from '../../../types/rules'
import type { RealmState } from '../../../rules/state'
import { findCommonersGroup, loyaltyDescription } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import { executeRaiseTaxes } from '../../../rules/actions/taxation'
import { queryKeys } from '../../../hooks/queryKeys'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  food: 'Food',
  lumber: 'Lumber',
  stone: 'Stone',
  gold: 'Gold',
  copper: 'Copper',
  iron: 'Iron',
  silver: 'Silver',
  gold_metal: 'Gold (ore)',
  mithral: 'Mithral',
  adamantine: 'Adamantine',
}

export function RaiseTaxesPanel({ realm, realmId, onClose }: Props) {
  const queryClient = useQueryClient()

  const tax = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const { state } = executeRaiseTaxes(cached)
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  // Preview: what will the pool look like after taxes?
  const previewDelta: Partial<Record<ResourceKey, number>> = {}
  for (const key of Object.keys(realm.resources) as ResourceKey[]) {
    const before = realm.resources[key]
    const after = Math.floor(before * 1.1)
    if (after !== before) previewDelta[key] = after - before
  }
  const totalAffected = Object.keys(previewDelta).length
  const noBenefit = totalAffected === 0

  const commoners = findCommonersGroup(realm)
  const loyaltyBefore = commoners?.score ?? 0
  const loyaltyAfter = loyaltyBefore - 2
  const loyaltyAfterDesc = loyaltyDescription(loyaltyAfter)
  const willCrossIntoCrisis =
    loyaltyDescription(loyaltyBefore).tone !== 'crisis' && loyaltyAfterDesc.tone === 'crisis'

  const submit = async () => {
    try {
      await tax.mutateAsync()
      onClose()
    } catch {
      /* surfaced via tax.error */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Raise Taxes</h3>
          <p className="text-sm text-stone-500">
            Squeeze the realm for an extra 10% of every resource pool (rounded down). Your
            people resent it: -2 commoner loyalty. Limited — once per season. Best done in
            fall right after harvest, when there's the most to skim.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          <div>
            <div className="text-sm font-medium mb-1.5">Resource changes</div>
            {noBenefit ? (
              <div className="text-sm text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                10% of every pool rounds down to zero. The tax raises nothing. Your commoners
                will still take the loyalty hit.
              </div>
            ) : (
              <ul className="text-sm grid grid-cols-2 gap-x-4 gap-y-0.5">
                {Object.entries(previewDelta).map(([key, gain]) => {
                  const k = key as ResourceKey
                  const before = realm.resources[k]
                  const after = before + (gain ?? 0)
                  return (
                    <li key={key} className="flex justify-between">
                      <span className="text-stone-500">{RESOURCE_LABELS[k]}</span>
                      <span>
                        {before} → <strong>{after}</strong>{' '}
                        <span className="text-emerald-700 dark:text-emerald-400 text-xs">
                          (+{gain})
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div>
            <div className="text-sm font-medium mb-1.5">Commoner loyalty</div>
            <div className="text-sm">
              {loyaltyBefore >= 0 ? '+' : ''}{loyaltyBefore}{' '}
              <span className="text-stone-500">→</span>{' '}
              <strong>
                {loyaltyAfter >= 0 ? '+' : ''}{loyaltyAfter}
              </strong>{' '}
              <span className="text-xs text-stone-500">({loyaltyAfterDesc.label})</span>
            </div>
            {willCrossIntoCrisis && (
              <div className="mt-2 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 rounded p-2">
                ⚠ This drops loyalty into crisis territory. A revolt check fires next spring.
              </div>
            )}
          </div>

          {tax.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {tax.error.message}
            </p>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={tax.isPending}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {tax.isPending ? 'Collecting…' : 'Collect taxes'}
          </button>
        </footer>
      </div>
    </div>
  )
}
