import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ResourceKey } from '../../../types/rules'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import {
  hasTradeRoute,
  isPremiumMineral,
  PREMIUM_MINERAL_GP_PER_UNIT,
  RESOURCE_SELL_RATIO,
  SELLABLE_RESOURCES,
  startSellGoods,
} from '../../../rules/actions/economy'
import type { SellableResource } from '../../../rules/actions/economy'
import { bankerConspiracyActive } from '../../../rules/actions/loans'
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

export function SellGoodsPanel({ realm, realmId, onClose }: Props) {
  const queryClient = useQueryClient()

  const tradeOK = hasTradeRoute(realm)
  // Pick a sensible default: the resource the realm has most of among sellables.
  const initialResource = (() => {
    let best: SellableResource = 'food'
    let bestCount = realm.resources.food
    for (const r of SELLABLE_RESOURCES) {
      if (realm.resources[r] > bestCount) {
        best = r
        bestCount = realm.resources[r]
      }
    }
    return best
  })()

  const [resource, setResource] = useState<SellableResource>(initialResource)
  const [quantity, setQuantity] = useState<number>(0)

  const sell = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const { state } = startSellGoods(cached, { resource, quantity }, createRng())
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
  const conspiracy = bankerConspiracyActive(realm)
  const conspiracyMul = conspiracy ? 2 : 1
  const premium = isPremiumMineral(resource)

  // Compute revenue ranges. Two models:
  //   premium: gp/unit, success bumps gp/unit upward, fail/winter/conspiracy bring it down (floor 1).
  //   standard: units/gp, success bumps ratio downward (floor 1), fail/winter/conspiracy multiply it up.
  let worstRevenue: number
  let bestRevenue: number
  let expectedRevenue: number
  let baseRatioLabel: string
  let expectedRatioLabel: string
  if (premium) {
    const baseGp = PREMIUM_MINERAL_GP_PER_UNIT[resource]
    const worstGp = Math.max(1, Math.floor((baseGp - 4 - (isWinter ? 2 : 0)) / conspiracyMul))
    const expectedGp = Math.max(1, Math.floor((baseGp - (isWinter ? 2 : 0)) / conspiracyMul))
    const bestGp = baseGp + 3 // a couple of bonus brackets
    worstRevenue = quantity * worstGp
    expectedRevenue = quantity * expectedGp
    bestRevenue = quantity * bestGp
    baseRatioLabel = `${baseGp} gp/unit`
    expectedRatioLabel = `${expectedGp} gp/unit`
  } else {
    const baseRatio = RESOURCE_SELL_RATIO[resource]
    const worstRatio = (baseRatio + 4 + (isWinter ? 2 : 0)) * conspiracyMul
    const expectedRatio = (isWinter ? baseRatio + 2 : baseRatio) * conspiracyMul
    worstRevenue = Math.floor(quantity / Math.max(1, worstRatio))
    expectedRevenue = Math.floor(quantity / Math.max(1, expectedRatio))
    bestRevenue = Math.floor(quantity / Math.max(1, 1 * conspiracyMul))
    baseRatioLabel = `${baseRatio}:1 gp`
    expectedRatioLabel = `${expectedRatio}:1`
  }

  const haveResource = realm.resources[resource]
  const insufficient = quantity > haveResource
  const invalidQty = !Number.isInteger(quantity) || quantity <= 0
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
          <h3 className="font-serif font-semibold text-xl mb-1">Sell Goods</h3>
          <p className="text-sm text-stone-500">
            Trade resources for gold. Treasurer rolls Knowledge(economics) DC 20; +10 over the
            DC reduces the units-per-gp ratio by 1 (floor 1). Winter +2 ratio. Gold arrives at
            the start of the next season.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {!tradeOK && (
            <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 rounded p-2" role="alert">
              No trade route. Build a Port — or run a road from a stronghold to the realm's edge — so goods can reach foreign markets.
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
                const have = realm.resources[r]
                const priceLabel = isPremiumMineral(r)
                  ? `1 unit = ${PREMIUM_MINERAL_GP_PER_UNIT[r]} gp`
                  : `${RESOURCE_SELL_RATIO[r]}:1 gp`
                return (
                  <option key={r} value={r}>
                    {RESOURCE_LABELS[r]} (have {have}, base {priceLabel})
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
              max={haveResource}
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.floor(Number(e.target.value)) || 0)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            />
            <span className="text-xs text-stone-500 mt-1 block">
              You have {haveResource} {RESOURCE_LABELS[resource]}.
            </span>
          </label>

          <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm space-y-1">
            <div className="text-stone-500 text-xs">Roll modifiers</div>
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
              {isWinter && <li className="text-amber-600 dark:text-amber-400">Winter: +2 ratio penalty</li>}
              {conspiracy && (
                <li className="text-red-600 dark:text-red-400">
                  Banker conspiracy active: final ratio doubled (you missed interest 4+ seasons).
                </li>
              )}
            </ul>
          </div>

          {quantity > 0 && (
            <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm space-y-1">
              <div>
                Expected revenue (no bonus, no penalty):{' '}
                <strong>{expectedRevenue} gold</strong>{' '}
                <span className="text-xs text-stone-500">at {expectedRatioLabel}</span>
              </div>
              <div className="text-xs text-stone-500">
                Range with rolls: {worstRevenue}–{bestRevenue} gp{' '}
                {premium
                  ? '(premium minerals: gp/unit moves ±d4 with the check)'
                  : '(worst = crit-fail; best = ratio floored at 1)'}
                . Base: {baseRatioLabel}.
              </div>
              <div className="text-xs text-stone-500">
                Gold arrives at the start of next season.
              </div>
            </div>
          )}

          {invalidQty && quantity !== 0 && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              Quantity must be a whole number ≥ 1.
            </p>
          )}
          {insufficient && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              You only have {haveResource} {RESOURCE_LABELS[resource]}.
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
