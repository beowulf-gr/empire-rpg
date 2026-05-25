import { useState } from 'react'
import type { Race } from '../../../types/rules'
import type { RealmState } from '../../../rules/state'
import { areaHasRoad } from '../../../rules/state'
import { totalIdlePopulation } from '../../../rules/actions/populationCommit'
import { useStartConstruction } from '../../../hooks/useStartConstruction'
import { isWorkforceMixValid, WorkforceMixPicker } from '../WorkforceMixPicker'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

export function BuildRoadsPanel({ realm, realmId, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [raceMix, setRaceMix] = useState<Partial<Record<Race, number>> | undefined>(undefined)
  const start = useStartConstruction()

  const toggle = (areaId: string) => {
    setSelected((s) =>
      s.includes(areaId) ? s.filter((x) => x !== areaId) : s.length < 4 ? [...s, areaId] : s,
    )
  }

  const strongholdAreaIds = new Set(realm.strongholds.map((s) => s.areaId))
  const isolated = !selected.some((id) => realm.roadAreaIds.includes(id) || strongholdAreaIds.has(id))
  const popNeeded = 1 + (isolated && selected.length > 0 ? 1 : 0)
  const idle = totalIdlePopulation(realm)
  const popShortfall = idle < popNeeded
  const mixOk = isWorkforceMixValid(realm, raceMix, popNeeded)

  const submit = async () => {
    if (selected.length === 0) return
    try {
      await start.mutateAsync({
        realmId,
        kind: 'build_roads',
        params: { areaIds: selected, raceMix },
      })
      onClose()
    } catch {
      // error already surfaced by react-query state
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Build Roads</h3>
          <p className="text-sm text-stone-500">
            Pick up to <strong>4 areas</strong> to road through. Cost: 1 stone, 2 lumber, 1 pop, 2 seasons.
            If none of the picked areas connects to a stronghold or existing road, +1 lumber and +1 pop.
          </p>
          <div className="mt-2 text-xs text-stone-500">
            Selected: <strong>{selected.length}/4</strong>
            {selected.length > 0 && isolated && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                Isolated — surcharge applies.
              </span>
            )}
            <span className="ml-2">
              Idle workers: <strong className={popShortfall ? 'text-red-600 dark:text-red-400' : ''}>{idle}</strong>
              {selected.length > 0 && (
                <span> / need {popNeeded}{popShortfall && ' — free workers via Move Settlers / Harvest Terrain first'}</span>
              )}
            </span>
          </div>
        </header>

        <div className="px-5 py-4 overflow-y-auto">
          <div className="grid grid-cols-5 gap-2">
            {realm.areas.map((a, idx) => {
              const isSelected = selected.includes(a.id)
              const hasStronghold = strongholdAreaIds.has(a.id)
              const hasRoad = areaHasRoad(realm, a.id)
              const limit = !isSelected && selected.length >= 4
              return (
                <button
                  key={a.id}
                  onClick={() => toggle(a.id)}
                  disabled={limit}
                  className={`aspect-square border rounded p-2 text-xs flex flex-col justify-between text-center disabled:opacity-30 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'border-stone-900 dark:border-stone-100 bg-stone-100 dark:bg-stone-800'
                      : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900'
                  }`}
                >
                  <div className="capitalize font-medium">{a.terrain}</div>
                  <div className="text-[9px] text-stone-500">#{idx + 1}</div>
                  <div className="text-[9px] text-stone-500">
                    {hasStronghold && '⌂ '}
                    {hasRoad && '═'}
                  </div>
                </button>
              )
            })}
          </div>

          {selected.length > 0 && !popShortfall && (
            <div className="mt-3">
              <WorkforceMixPicker
                realm={realm}
                required={popNeeded}
                value={raceMix}
                onChange={setRaceMix}
              />
            </div>
          )}

          {start.error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {start.error.message}
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
            disabled={selected.length === 0 || popShortfall || !mixOk || start.isPending}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {start.isPending ? 'Starting…' : `Start (${selected.length} area${selected.length === 1 ? '' : 's'})`}
          </button>
        </footer>
      </div>
    </div>
  )
}
