import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import { hasTradeRoute } from '../../../rules/actions/economy'
import {
  TRADE_GOOD_KINDS,
  TRADE_GOOD_LABEL,
  TRADE_GOOD_RECIPES,
  executeSellTradeGoods,
} from '../../../rules/actions/tradeGoods'
import type { TradeGoodKind } from '../../../rules/actions/tradeGoods'
import { queryKeys } from '../../../hooks/queryKeys'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

export function SellTradeGoodsPanel({ realm, realmId, onClose }: Props) {
  const queryClient = useQueryClient()
  const tradeOK = hasTradeRoute(realm)

  // Pick a default of the kind the realm has the most of.
  const initialKind: TradeGoodKind = (() => {
    let best: TradeGoodKind = 'exotic_items'
    let max = realm.tradeGoods.exotic_items
    for (const k of TRADE_GOOD_KINDS) {
      if (realm.tradeGoods[k] > max) {
        best = k
        max = realm.tradeGoods[k]
      }
    }
    return best
  })()

  const [kind, setKind] = useState<TradeGoodKind>(initialKind)
  const [quantity, setQuantity] = useState<number>(0)

  const sell = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const { state } = executeSellTradeGoods(cached, { kind, quantity })
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  const recipe = TRADE_GOOD_RECIPES[kind]
  const have = realm.tradeGoods[kind]
  const insufficient = quantity > have
  const invalidQty = !Number.isInteger(quantity) || quantity <= 0
  const goldRevenue = quantity > 0 ? quantity * recipe.salePrice : 0
  const canSubmit = tradeOK && !insufficient && !invalidQty && !sell.isPending

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
          <h3 className="font-serif font-semibold text-xl mb-1">Sell Trade Goods</h3>
          <p className="text-sm text-stone-500">
            Sell finished goods at their book price (no Treasurer check, no negotiation).
            Gold arrives instantly. Requires a trade route.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {!tradeOK && (
            <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 rounded p-2" role="alert">
              No trade route. Build a Port — or run a road from a stronghold to the realm's edge — so goods can reach foreign markets.
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium">Trade good</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as TradeGoodKind)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            >
              {TRADE_GOOD_KINDS.map((k) => {
                const r = TRADE_GOOD_RECIPES[k]
                return (
                  <option key={k} value={k}>
                    {TRADE_GOOD_LABEL[k]} (have {realm.tradeGoods[k]}, {r.salePrice} gp/unit)
                  </option>
                )
              })}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Quantity to sell</span>
            <input
              type="number"
              min="1"
              max={have}
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.floor(Number(e.target.value)) || 0)}
              disabled={have === 0}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            />
            <span className="text-xs text-stone-500 mt-1 block">
              You have {have} {TRADE_GOOD_LABEL[kind]}.
            </span>
          </label>

          {quantity > 0 && (
            <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm">
              Revenue: <strong>{goldRevenue} gold</strong>
              <span className="text-xs text-stone-500"> · {quantity} × {recipe.salePrice} gp</span>
            </div>
          )}

          {invalidQty && quantity !== 0 && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              Quantity must be a whole number ≥ 1.
            </p>
          )}
          {insufficient && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              You only have {have} {TRADE_GOOD_LABEL[kind]}.
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
            {sell.isPending ? 'Selling…' : 'Sell'}
          </button>
        </footer>
      </div>
    </div>
  )
}
