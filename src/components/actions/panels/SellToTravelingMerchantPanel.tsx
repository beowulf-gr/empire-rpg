import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import {
  executeSellToTravelingMerchant,
  MERCHANT_RESOURCES,
  MERCHANT_SELL_UNITS_PER_GOLD,
  MERCHANT_TRADE_GOODS,
  MERCHANT_TRADE_GOOD_UNITS_PER_GOLD,
  type MerchantResource,
  type MerchantTradeGood,
  type SellToMerchantParams,
} from '../../../rules/actions/travelingMerchant'
import { TRADE_GOOD_LABEL } from '../../../rules/actions/tradeGoods'
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

/**
 * The picker holds the discriminated-union choice as a single string key so
 * the <select> can drive it. Resources are prefixed `r:`, trade goods `t:`.
 */
type Choice =
  | { kind: 'resource'; key: MerchantResource }
  | { kind: 'trade_good'; key: MerchantTradeGood }

function parseChoice(s: string): Choice {
  if (s.startsWith('r:')) {
    return { kind: 'resource', key: s.slice(2) as MerchantResource }
  }
  return { kind: 'trade_good', key: s.slice(2) as MerchantTradeGood }
}

function serializeChoice(c: Choice): string {
  return c.kind === 'resource' ? `r:${c.key}` : `t:${c.key}`
}

export function SellToTravelingMerchantPanel({ realm, realmId, onClose }: Props) {
  const queryClient = useQueryClient()
  const [choice, setChoice] = useState<Choice>({ kind: 'resource', key: 'stone' })

  const isWinter = realm.season === 'winter'
  const alreadyTaken = isLimitedActionExhausted(realm, 'sell_to_traveling_merchant')

  const unitsRequired =
    choice.kind === 'resource'
      ? MERCHANT_SELL_UNITS_PER_GOLD[choice.key]
      : MERCHANT_TRADE_GOOD_UNITS_PER_GOLD[choice.key]

  const have =
    choice.kind === 'resource'
      ? realm.resources[choice.key]
      : realm.tradeGoods[choice.key]

  const insufficientStock = have < unitsRequired

  const label =
    choice.kind === 'resource'
      ? RESOURCE_LABELS[choice.key]
      : TRADE_GOOD_LABEL[choice.key]

  const sell = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const params: SellToMerchantParams =
        choice.kind === 'resource'
          ? { kind: 'resource', resource: choice.key }
          : { kind: 'trade_good', tradeGood: choice.key }
      const { state } = executeSellToTravelingMerchant(cached, params)
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  const canSubmit = !isWinter && !alreadyTaken && !insufficientStock && !sell.isPending

  const submit = async () => {
    try {
      await sell.mutateAsync()
      onClose()
    } catch {
      /* surfaced via sell.error */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">
            Sell to Traveling Merchant
          </h3>
          <p className="text-sm text-stone-500">
            Hand over a parcel and earn 1 gold on the spot. The merchant pays
            half what the open market would — he needs to flip the goods at a
            profit. No port or road needed.
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
              You've already sold to the merchant this season. He'll be back next season.
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium">What to sell</span>
            <select
              value={serializeChoice(choice)}
              onChange={(e) => setChoice(parseChoice(e.target.value))}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            >
              <optgroup label="Raw resources (rate: 2× normal)">
                {MERCHANT_RESOURCES.map((r) => (
                  <option key={`r:${r}`} value={`r:${r}`}>
                    {RESOURCE_LABELS[r]} — give {MERCHANT_SELL_UNITS_PER_GOLD[r]} for 1 gp
                  </option>
                ))}
              </optgroup>
              <optgroup label="Finished trade goods (2 units = 1 gp)">
                {MERCHANT_TRADE_GOODS.map((t) => (
                  <option key={`t:${t}`} value={`t:${t}`}>
                    {TRADE_GOOD_LABEL[t]} — give {MERCHANT_TRADE_GOOD_UNITS_PER_GOLD[t]} for 1 gp
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm">
            You'll trade:{' '}
            <strong>
              {unitsRequired} {label}
            </strong>{' '}
            → <strong>1 gold</strong>
            <div className="text-xs text-stone-500 mt-1">
              You have {have} {label.toLowerCase()} in stock.
            </div>
          </div>

          {insufficientStock && !isWinter && !alreadyTaken && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              Not enough {label.toLowerCase()} (need {unitsRequired}, have {have}).
            </p>
          )}
          {sell.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {sell.error.message}
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
            {sell.isPending ? 'Trading…' : 'Sell for 1 gold'}
          </button>
        </footer>
      </div>
    </div>
  )
}
