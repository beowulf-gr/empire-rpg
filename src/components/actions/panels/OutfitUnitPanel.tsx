import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import {
  executeOutfitUnit,
  gearGpAdded,
  gearGpPerSupply,
  SUPPLY_PER_100GP,
  totalGearGpPerSoldier,
} from '../../../rules/actions/outfit'
import type { OutfitGoodKind } from '../../../rules/actions/outfit'
import { unitDisplayName } from '../../../rules/actions/military'
import { TRADE_GOOD_LABEL } from '../../../rules/actions/tradeGoods'
import { queryKeys } from '../../../hooks/queryKeys'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

export function OutfitUnitPanel({ realm, realmId, onClose }: Props) {
  const queryClient = useQueryClient()

  const initialUnitId = realm.militaryUnits[0]?.id ?? ''
  const [unitId, setUnitId] = useState<string>(initialUnitId)
  const [kind, setKind] = useState<OutfitGoodKind>('weapons_and_armor')
  const [supplyAmount, setSupplyAmount] = useState<number>(1)

  const outfit = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const { state } = executeOutfitUnit(cached, { unitId, kind, supplyAmount })
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  const unit = realm.militaryUnits.find((u) => u.id === unitId)
  const have = realm.tradeGoods[kind] ?? 0

  const insufficientSupply = supplyAmount > have
  const invalidAmount = !Number.isInteger(supplyAmount) || supplyAmount <= 0
  const noUnit = !unit
  const canSubmit = !noUnit && !insufficientSupply && !invalidAmount && !outfit.isPending

  const submit = async () => {
    try {
      await outfit.mutateAsync()
      onClose()
    } catch {
      /* surfaced via outfit.error */
    }
  }

  // Per-supply gear preview
  const perSupply = unit ? gearGpPerSupply(unit.size) : 0
  const totalAdded = unit ? gearGpAdded(unit.size, supplyAmount) : 0
  const newEquipmentGp = unit && kind === 'weapons_and_armor'
    ? unit.equipmentGp + totalAdded
    : unit?.equipmentGp ?? 0
  const newMagicGp = unit && kind === 'magic_items'
    ? unit.magicGp + totalAdded
    : unit?.magicGp ?? 0
  const newTotal = newEquipmentGp + newMagicGp

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Outfit Unit</h3>
          <p className="text-sm text-stone-500">
            Issue Weapons & Armor or Magic Items to a unit. Gear value per soldier improves
            the unit's effectiveness in mass combat (chapter 2). Larger units need more
            supply to reach the same gp/soldier — see the Unit Outfitting Table (book §2.6).
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {realm.militaryUnits.length === 0 ? (
            <div className="text-sm text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
              No military units. Muster or hire one first.
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-sm font-medium">Unit</span>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
                >
                  {realm.militaryUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {unitDisplayName(u)} — eq {u.equipmentGp} gp/soldier
                      {u.magicGp > 0 && ` + magic ${u.magicGp}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Issue type</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as OutfitGoodKind)}
                  className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
                >
                  <option value="weapons_and_armor">
                    {TRADE_GOOD_LABEL.weapons_and_armor} (have {realm.tradeGoods.weapons_and_armor})
                  </option>
                  <option value="magic_items">
                    {TRADE_GOOD_LABEL.magic_items} (have {realm.tradeGoods.magic_items})
                  </option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Supply units to issue</span>
                <input
                  type="number"
                  min="1"
                  max={have}
                  step="1"
                  value={supplyAmount}
                  onChange={(e) => setSupplyAmount(Math.floor(Number(e.target.value)) || 0)}
                  disabled={have === 0}
                  className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
                />
                <span className="text-xs text-stone-500 mt-1 block">
                  You have {have} {kind.replace(/_/g, ' ')}.
                </span>
              </label>

              {unit && (
                <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm space-y-1">
                  <div className="text-stone-500 text-xs">
                    Outfitting Table (size {unit.size})
                  </div>
                  <ul className="text-xs space-y-0.5">
                    <li>
                      Per supply: <strong>+{perSupply} gp/soldier</strong>{' '}
                      <span className="text-stone-500">
                        ({SUPPLY_PER_100GP[unit.size]} supply = 100 gp/soldier per the table)
                      </span>
                    </li>
                    {supplyAmount > 0 && (
                      <li>
                        This issue: <strong>+{totalAdded} gp/soldier</strong> of{' '}
                        {kind === 'weapons_and_armor' ? 'equipment' : 'magic'}
                      </li>
                    )}
                  </ul>
                  {supplyAmount > 0 && !insufficientSupply && (
                    <div className="text-xs text-stone-500 mt-2">
                      After: equipment <strong>{newEquipmentGp}</strong> + magic{' '}
                      <strong>{newMagicGp}</strong> ={' '}
                      <strong>{newTotal} gp/soldier total</strong>{' '}
                      <span className="text-stone-500">
                        (was {totalGearGpPerSoldier(unit)} gp/soldier)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {invalidAmount && supplyAmount !== 0 && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  Quantity must be a whole number ≥ 1.
                </p>
              )}
              {insufficientSupply && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  You only have {have} {kind.replace(/_/g, ' ')}.
                </p>
              )}
              {outfit.error && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {outfit.error.message}
                </p>
              )}
            </>
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
            {outfit.isPending ? 'Issuing…' : 'Issue gear'}
          </button>
        </footer>
      </div>
    </div>
  )
}
