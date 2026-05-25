import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import {
  executeLevelUpUnit,
  levelUpCost,
  unitDisplayName,
  unitsLeveledThisSpring,
} from '../../../rules/actions/military'
import { queryKeys } from '../../../hooks/queryKeys'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

export function LevelUpUnitPanel({ realm, realmId, onClose }: Props) {
  const queryClient = useQueryClient()
  const wrongSeason = realm.season !== 'spring'

  const musteredUnits = useMemo(
    () => realm.militaryUnits.filter((u) => u.source === 'mustered'),
    [realm.militaryUnits],
  )
  const leveledThisSpring = useMemo(() => unitsLeveledThisSpring(realm), [realm])

  // Default to the first non-locked mustered unit if any.
  const firstAvailable =
    musteredUnits.find((u) => !leveledThisSpring.has(u.id)) ?? musteredUnits[0]
  const [unitId, setUnitId] = useState<string>(firstAvailable?.id ?? '')

  const selected = musteredUnits.find((u) => u.id === unitId) ?? null
  const cost = selected ? levelUpCost(selected.level) : 0
  const insufficientGold = selected ? realm.resources.gold < cost : false
  const alreadyLeveled = selected ? leveledThisSpring.has(selected.id) : false

  const levelUp = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const { state } = executeLevelUpUnit(cached, { unitId })
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  const canSubmit =
    !wrongSeason &&
    !!selected &&
    !alreadyLeveled &&
    !insufficientGold &&
    !levelUp.isPending

  const submit = async () => {
    if (!canSubmit) return
    try {
      await levelUp.mutateAsync()
      onClose()
    } catch {
      /* error surfaced via levelUp.error */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Level Up Unit</h3>
          <p className="text-sm text-stone-500">
            Spend (1 + current level) gp to raise a mustered unit's level by 1.
            Each unit may only be levelled once per year. Higher levels also add +1 gp/year to upkeep.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {wrongSeason && (
            <p className="text-sm text-amber-700 dark:text-amber-400" role="alert">
              Level Up Unit is a spring-only action.
            </p>
          )}

          {musteredUnits.length === 0 ? (
            <p className="text-stone-500 text-sm">
              You have no mustered units to level up. Mustered warriors are created via Muster Soldiers.
              (Mercenaries arrive at their hired CR and cannot be levelled.)
            </p>
          ) : (
            <>
              <label className="block">
                <span className="text-sm font-medium">Unit to level up</span>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
                >
                  {musteredUnits.map((u) => {
                    const locked = leveledThisSpring.has(u.id)
                    return (
                      <option key={u.id} value={u.id} disabled={locked}>
                        {unitDisplayName(u)} — costs {levelUpCost(u.level)} gp
                        {locked ? ' (levelled this year)' : ''}
                      </option>
                    )
                  })}
                </select>
              </label>

              {selected && (
                <div className="text-sm space-y-1 rounded-md border border-stone-200 dark:border-stone-800 p-3 bg-stone-50 dark:bg-stone-950">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Current level</span>
                    <span className="font-medium">{selected.level}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">New level</span>
                    <span className="font-medium">{selected.level + 1}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Cost</span>
                    <span className="font-medium">{cost} gp</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Gold available</span>
                    <span className="font-medium">{realm.resources.gold}</span>
                  </div>
                  <div className="flex justify-between text-xs text-stone-500 pt-1 border-t border-stone-200 dark:border-stone-800">
                    <span>Annual upkeep after level-up</span>
                    <span>+1 gp/year vs. current</span>
                  </div>
                </div>
              )}

              {alreadyLeveled && (
                <p className="text-sm text-amber-700 dark:text-amber-400" role="alert">
                  This unit has already been levelled up this year.
                </p>
              )}
              {insufficientGold && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  Not enough gold (need {cost}, have {realm.resources.gold}).
                </p>
              )}
            </>
          )}

          {levelUp.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {levelUp.error instanceof Error ? levelUp.error.message : String(levelUp.error)}
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
            {levelUp.isPending ? 'Training…' : `Spend ${cost} gp`}
          </button>
        </footer>
      </div>
    </div>
  )
}
