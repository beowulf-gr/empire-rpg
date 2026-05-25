import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import { executeHireSoldiers, maxMercenaryCR } from '../../../rules/actions/military'
import type { MilitaryUnitSize } from '../../../rules/actions/military'
import { findMinisterByRole } from '../../../rules/actions/ministers'
import { createRng } from '../../../rules/rng'
import { queryKeys } from '../../../hooks/queryKeys'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}



const SIZE_OPTIONS: { value: MilitaryUnitSize; label: string; payMul: number }[] = [
  { value: 'solo',       label: 'Solo (×⅛)',         payMul: 0.125 },
  { value: 'tiny',       label: 'Tiny (×¼)',         payMul: 0.25 },
  { value: 'small',      label: 'Small (×½)',        payMul: 0.5 },
  { value: 'medium',     label: 'Medium-size (×1)',  payMul: 1 },
  { value: 'large',      label: 'Large (×2)',        payMul: 2 },
  { value: 'huge',       label: 'Huge (×4)',         payMul: 4 },
  { value: 'gargantuan', label: 'Gargantuan (×8)',   payMul: 8 },
  { value: 'colossal',   label: 'Colossal (×12)',    payMul: 12 },
]

const FOOD_BY_SIZE: Record<MilitaryUnitSize, number> = {
  solo: 0, tiny: 0, small: 0.5, medium: 1, large: 2, huge: 4, gargantuan: 8, colossal: 12,
}

export function HireSoldiersPanel({ realm, realmId, onClose }: Props) {
  const [size, setSize] = useState<MilitaryUnitSize>('medium')
  const [cr, setCr] = useState<number>(1)
  const [diplomacyBribeGp, setDiplomacyBribeGp] = useState<number>(0)
  const queryClient = useQueryClient()

  const hire = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const { state } = executeHireSoldiers(
        cached,
        { size, cr, diplomacyBribeGp },
        createRng(),
      )
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  const sizeOption = SIZE_OPTIONS.find((s) => s.value === size)!
  const baseGoldCost = Math.ceil(2 * cr * sizeOption.payMul)
  const offSeasonPenalty = realm.season === 'spring' ? 0 : 1
  const wagesCost = baseGoldCost + offSeasonPenalty
  const foodCost = Math.ceil(FOOD_BY_SIZE[size])
  const totalGoldCost = wagesCost + diplomacyBribeGp

  // Diplomacy check preview
  const general = findMinisterByRole(realm.ministers, 'general')
  const generalBonus = general ? general.level : -2
  const bribeBonus = 2 * diplomacyBribeGp
  const lowRoll = 1 + generalBonus + bribeBonus
  const avgRoll = 10 + generalBonus + bribeBonus
  const highRoll = 20 + generalBonus + bribeBonus
  const minMaxCR = maxMercenaryCR(lowRoll)
  const expectedMaxCR = maxMercenaryCR(avgRoll)
  const bestMaxCR = maxMercenaryCR(highRoll)

  const submit = async () => {
    try {
      await hire.mutateAsync()
      onClose()
    } catch {
      /* surfaced */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Hire Soldiers</h3>
          <p className="text-sm text-stone-500">
            Recruit a mercenary unit. The book uses a Diplomacy check to determine max CR; for
            MVP you pick CR directly. Pay = 2 × CR × pay multiplier per year (paid up front).
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Unit size</span>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as MilitaryUnitSize)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            >
              {SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Challenge Rating (CR)</span>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={cr}
              onChange={(e) => setCr(Number(e.target.value) || 0.5)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            />
            <span className="text-xs text-stone-500 mt-1 block">
              Higher CR = stronger unit but costlier. Common range: 0.5–5.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Diplomacy bribe (gp)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={diplomacyBribeGp}
              onChange={(e) => setDiplomacyBribeGp(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            />
            <span className="text-xs text-stone-500 mt-1 block">
              Each gp = +2 to the Diplomacy check (book §2.6). Lost on a failed roll.
            </span>
          </label>

          <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm space-y-1">
            <div className="text-stone-500 text-xs">Diplomacy check (DC 25 = CR 1, +1 CR per +10)</div>
            <ul className="text-xs space-y-0.5">
              <li>
                General:{' '}
                {general ? (
                  <span>+{general.level} ({general.name})</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">-2 (vacant role)</span>
                )}
              </li>
              <li>Bribe: +{bribeBonus} ({diplomacyBribeGp}× +2)</li>
              <li>
                Likely max CR — worst {minMaxCR === 0 ? '(none)' : minMaxCR}, average{' '}
                {expectedMaxCR === 0 ? '(none)' : expectedMaxCR}, best{' '}
                {bestMaxCR === 0 ? '(none)' : bestMaxCR}.
              </li>
              {cr > expectedMaxCR && (
                <li className="text-amber-600 dark:text-amber-400">
                  ⚠ Requested CR {cr} likely exceeds the average outcome — bribe more or lower CR.
                </li>
              )}
            </ul>
          </div>

          <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm">
            <div>
              Total cost: <strong>{totalGoldCost} gold</strong> + <strong>{foodCost} food</strong>
              <span className="text-xs text-stone-500 ml-2">
                ({wagesCost} wages
                {offSeasonPenalty > 0 && `, incl. +${offSeasonPenalty} off-season`}
                {diplomacyBribeGp > 0 && `, +${diplomacyBribeGp} bribe`})
              </span>
            </div>
            <div className="text-xs text-stone-500">
              Annual upkeep next spring will be {baseGoldCost} gp + {foodCost} food (no off-season, no bribe).
            </div>
          </div>

          {hire.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {hire.error.message}
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
            disabled={hire.isPending}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {hire.isPending ? 'Hiring…' : 'Hire'}
          </button>
        </footer>
      </div>
    </div>
  )
}
