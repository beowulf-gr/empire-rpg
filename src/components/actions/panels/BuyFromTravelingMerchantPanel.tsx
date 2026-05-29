import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import {
  executeBuyFromTravelingMerchant,
  MERCHANT_BUY_UNITS_PER_GOLD,
  MERCHANT_RESOURCES,
  type MerchantResource,
} from '../../../rules/actions/travelingMerchant'
import { isLimitedActionExhausted } from '../../../rules/actions/limited'
import { queryKeys } from '../../../hooks/queryKeys'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

const RESOURCE_LABELS: Record<MerchantResource, string> = {
  food: 'Food',
  lumber: 'Lumber',
  stone: 'Stone',
  copper: 'Copper',
  iron: 'Iron',
}

export function BuyFromTravelingMerchantPanel({ realm, realmId, onClose }: Props) {
  const queryClient = useQueryClient()
  const [resource, setResource] = useState<MerchantResource>('stone')

  const isWinter = realm.season === 'winter'
  const alreadyTaken = isLimitedActionExhausted(realm, 'buy_from_traveling_merchant')
  const insufficientGold = realm.resources.gold < 1
  const unitsReceived = MERCHANT_BUY_UNITS_PER_GOLD[resource]

  const buy = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const { state } = executeBuyFromTravelingMerchant(cached, { resource })
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  const canSubmit = !isWinter && !alreadyTaken && !insufficientGold && !buy.isPending

  const submit = async () => {
    try {
      await buy.mutateAsync()
      onClose()
    } catch {
      /* surfaced via buy.error */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">
            Buy from Traveling Merchant
          </h3>
          <p className="text-sm text-stone-500">
            A wandering trader arrives at your gate. He takes 1 gold and hands
            over a small parcel of common goods — half what the open market
            would offer. No port or road required; the merchant comes to you.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {isWinter && (
            <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 rounded p-2" role="alert">
              The merchant does not visit in winter — the roads are too dangerous. Wait for spring.
            </div>
          )}
          {alreadyTaken && !isWinter && (
            <div className="text-sm text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 rounded p-2" role="alert">
              You've already bought from the merchant this season. He'll be back next season.
            </div>
          )}
          {insufficientGold && !isWinter && !alreadyTaken && (
            <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 rounded p-2" role="alert">
              You need at least 1 gold (you have {realm.resources.gold}).
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium">Resource</span>
            <select
              value={resource}
              onChange={(e) => setResource(e.target.value as MerchantResource)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            >
              {MERCHANT_RESOURCES.map((r) => (
                <option key={r} value={r}>
                  {RESOURCE_LABELS[r]} — 1 gp buys {MERCHANT_BUY_UNITS_PER_GOLD[r]} unit
                  {MERCHANT_BUY_UNITS_PER_GOLD[r] === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>

          <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm">
            You'll trade: <strong>1 gold</strong> →{' '}
            <strong>
              {unitsReceived} {RESOURCE_LABELS[resource]}
            </strong>
            <div className="text-xs text-stone-500 mt-1">
              Currently in treasury: {realm.resources.gold} gold, {realm.resources[resource]}{' '}
              {RESOURCE_LABELS[resource].toLowerCase()}.
            </div>
          </div>

          {buy.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {buy.error.message}
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
            disabled={!canSubmit}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {buy.isPending ? 'Trading…' : 'Buy for 1 gold'}
          </button>
        </footer>
      </div>
    </div>
  )
}
