import { useState } from 'react'
import type { RealmState } from '../../../rules/state'
import { totalIdlePopulation } from '../../../rules/actions/populationCommit'
import { useStartConstruction } from '../../../hooks/useStartConstruction'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

const MINERAL_LABEL: Record<string, string> = {
  adamantine: 'Adamantine',
  copper: 'Copper',
  gold_metal: 'Gold',
  iron: 'Iron',
  mithral: 'Mithral',
  silver: 'Silver',
}

/**
 * Survey for New Vein panel — pick an already-surveyed hills or mountain
 * area, commit 1 idle pop for 2 seasons (longer off-spring), and on
 * completion roll a d100 to find a new ore vein per the book §4 (hills
 * need 95+, mountains need 90+).
 *
 * Only surveyed hills appear (un-surveyed hills/mountains use the
 * synchronous Survey button on Harvest Terrain). Mountains already at
 * two veins are shown but disabled — the rule caps mountains at two.
 */
export function SurveyForNewVeinPanel({ realm, realmId, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const start = useStartConstruction()

  const idle = totalIdlePopulation(realm)
  const popShortfall = idle < 1

  // Eligible areas: hills/mountains that have been surveyed (mineralResults
  // non-empty). Mountains already at the 2-mineral cap can be picked but
  // the button warns the player they're maxed out.
  const eligibleAreas = realm.areas
    .map((a, idx) => ({ area: a, idx }))
    .filter(({ area }) =>
      (area.terrain === 'hills' || area.terrain === 'mountains') &&
      area.mineralResults.length > 0,
    )

  const submit = async () => {
    if (!selected) return
    try {
      await start.mutateAsync({
        realmId,
        kind: 'survey_for_new_vein',
        params: { areaId: selected },
      })
      onClose()
    } catch {
      // surfaced via mutation.error
    }
  }

  const selectedArea = selected ? realm.areas.find((a) => a.id === selected) : null
  const isMountainsFull =
    selectedArea?.terrain === 'mountains' && selectedArea.mineralResults.length >= 2

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Survey for New Vein</h3>
          <p className="text-sm text-stone-500">
            Pick an already-surveyed hills or mountain area. 1 worker spends 2 seasons
            (longer if started off-spring) prospecting. After that, d100 — hills need
            <strong> 95+</strong>, mountains need <strong>90+</strong> — and on a pass
            we roll the mineral table to see if a new vein turns up. Mountains can hold
            up to 2 distinct minerals; hills only ever hold 1 (a successful roll there
            replaces the old seam).
          </p>
          <div className="mt-2 text-xs text-stone-500">
            Idle workers:{' '}
            <strong className={popShortfall ? 'text-red-600 dark:text-red-400' : ''}>{idle}</strong>{' '}
            / need 1
            {popShortfall && ' — free a worker via Move Settlers / Harvest Terrain first.'}
          </div>
        </header>

        <div className="px-5 py-4 overflow-y-auto">
          {eligibleAreas.length === 0 ? (
            <p className="text-sm text-stone-500 italic">
              No surveyed hills or mountains yet. Survey an area first via the Harvest
              Terrain panel (toggle to mineral mode), then come back here to look for
              additional veins.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {eligibleAreas.map(({ area, idx }) => {
                const isSelected = selected === area.id
                const mountainsFull =
                  area.terrain === 'mountains' && area.mineralResults.length >= 2
                const label = area.mineralResults
                  .map((m) => MINERAL_LABEL[m] ?? m)
                  .join(' + ')
                return (
                  <button
                    key={area.id}
                    onClick={() => setSelected(isSelected ? null : area.id)}
                    disabled={mountainsFull}
                    className={`text-left border rounded px-2 py-2 text-sm transition-colors ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700'
                        : mountainsFull
                          ? 'border-stone-200 dark:border-stone-800 opacity-50 cursor-not-allowed'
                          : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <div className="font-medium capitalize">
                      #{idx + 1} {area.terrain}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5 truncate">{label}</div>
                    {mountainsFull && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                        Mountain at 2-vein cap
                      </div>
                    )}
                  </button>
                )
              })}
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
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md font-medium"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!selected || popShortfall || isMountainsFull || start.isPending}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {start.isPending ? 'Starting…' : 'Start Survey'}
          </button>
        </footer>
      </div>
    </div>
  )
}
