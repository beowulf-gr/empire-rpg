import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ResourceKey } from '../../../types/rules'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import {
  buyGoodsCost,
  executeBuyGoods,
  hasTradeRoute,
  isPremiumMineral,
  PREMIUM_MINERAL_GP_PER_UNIT,
  RESOURCE_SELL_RATIO,
  SELLABLE_RESOURCES,
} from '../../../rules/actions/economy'
import type { SellableResource } from '../../../rules/actions/economy'
import { findMinisterByRole } from '../../../rules/actions/ministers'
import { createRng } from '../../../rules/rng'
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

export function BuyGoodsPanel({ realm, realmId, onClose }: Props) {
  const queryClient = useQueryClient()

  const tradeOK = hasTradeRoute(realm)
  const [resource, setResource] = useState<SellableResource>('food')
  const [quantity, setQuantity] = useState<number>(0)

  const buy = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const { state } = executeBuyGoods(cached, { resource, quantity }, createRng())
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  const treasurer = findMinisterByRole(realm.ministers, 'treasurer')
  const marketplaceCount = realm.strongholds.filter((s) => s.kind === 'marketplace').length
  const portCount = realm.strongholds.filter((s) => s.kind === 'port').length
  const isWinter = realm.season === 'winter'
  const dc = isWinter ? 15 : 10
  const cost = quantity > 0 ? buyGoodsCost(resource, quantity) : 0

  const insufficientGold = realm.resources.gold < cost
  const invalidQty = !Number.isInteger(quantity) || quantity <= 0
  const canSubmit = tradeOK && !insufficientGold && !invalidQty && !buy.isPending

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
          <h3 className="font-serif font-semibold text-xl mb-1">Buy Goods</h3>
          <p className="text-sm text-stone-500">
            Purchase resources from outside merchants. Treasurer rolls Knowledge(economics)
            DC 10. Failure → "not for sale" — no gold spent. Beat by 10+ → +1 free unit.
            Winter raises DC by +5.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {!tradeOK && (
            <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 rounded p-2" role="alert">
              No trade route. Build a Port — or run a road from a stronghold to the realm's edge — so merchants can reach you.
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium">Resource</span>
            <select
              value={resource}
              onChange={(e) => setResource(e.target.value as SellableResource)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            >
              {SELLABLE_RESOURCES.map((r) => {
                const priceLabel = isPremiumMineral(r)
                  ? `${PREMIUM_MINERAL_GP_PER_UNIT[r]} gp = 1 unit (premium)`
                  : `1 gp = ${RESOURCE_SELL_RATIO[r]} unit${RESOURCE_SELL_RATIO[r] === 1 ? '' : 's'}`
                return (
                  <option key={r} value={r}>
                    {RESOURCE_LABELS[r]} ({priceLabel})
                  </option>
                )
              })}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Quantity to buy</span>
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.floor(Number(e.target.value)) || 0)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            />
            <span className="text-xs text-stone-500 mt-1 block">
              You have {realm.resources.gold} gold.
            </span>
          </label>

          <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm space-y-1">
            <div className="text-stone-500 text-xs">Check (DC {dc})</div>
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
              {isWinter && <li className="text-amber-600 dark:text-amber-400">Winter: +5 to DC (now {dc})</li>}
            </ul>
          </div>

          {quantity > 0 && (
            <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm">
              Cost: <strong>{cost} gold</strong> for {quantity} {RESOURCE_LABELS[resource]}
              {' · '}<span className="text-xs text-stone-500">+1 bonus unit if you beat DC by 10+.</span>
            </div>
          )}

          {invalidQty && quantity !== 0 && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              Quantity must be a whole number ≥ 1.
            </p>
          )}
          {insufficientGold && quantity > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              Not enough gold (need {cost}, have {realm.resources.gold}).
            </p>
          )}
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
            {buy.isPending ? 'Buying…' : 'Buy'}
          </button>
        </footer>
      </div>
    </div>
  )
}
