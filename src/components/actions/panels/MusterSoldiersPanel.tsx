import { useState } from 'react'
import type { RealmState } from '../../../rules/state'
import type { Race } from '../../../types/rules'
import { useStartConstruction } from '../../../hooks/useStartConstruction'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

const RACE_LABELS: Record<Race, string> = {
  humans: 'Humans', dwarves: 'Dwarves', elves: 'Elves', gnomes: 'Gnomes',
  goblins: 'Goblins', halflings: 'Halflings', orcs: 'Orcs', undead: 'Undead',
}

export function MusterSoldiersPanel({ realm, realmId, onClose }: Props) {
  // Available source stacks: settled population (homeAreaId !== null) by area
  const candidates = realm.populations.filter(
    (p) => p.homeAreaId !== null && p.count > 0,
  )
  const [stackId, setStackId] = useState<string>(candidates[0]?.id ?? '')
  const start = useStartConstruction()

  const submit = async () => {
    const stack = realm.populations.find((p) => p.id === stackId)
    if (!stack || !stack.homeAreaId) return
    try {
      await start.mutateAsync({
        realmId,
        kind: 'muster_soldiers' as const,
        params: { race: stack.race, homeAreaId: stack.homeAreaId },
      } as never)
      onClose()
    } catch {
      /* surfaced */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Muster Soldiers</h3>
          <p className="text-sm text-stone-500">
            Convert 1 population unit into a Medium-size 1st-level warrior unit.
            Cost: 1 gold (equipment) + 1 food (year 1) + 1 population. Trains over 1 season.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {candidates.length === 0 ? (
            <p className="text-stone-500 text-sm">
              No settled population to muster. Use Move Settlers to give humans a home first.
            </p>
          ) : (
            <label className="block">
              <span className="text-sm font-medium">Source population stack</span>
              <select
                value={stackId}
                onChange={(e) => setStackId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
              >
                {candidates.map((p) => {
                  const idx = realm.areas.findIndex((a) => a.id === p.homeAreaId) + 1
                  const area = realm.areas.find((a) => a.id === p.homeAreaId)!
                  return (
                    <option key={p.id} value={p.id}>
                      {RACE_LABELS[p.race]} ({p.count}) — area #{idx} {area.terrain}
                    </option>
                  )
                })}
              </select>
            </label>
          )}

          {start.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
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
            disabled={!stackId || start.isPending}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {start.isPending ? 'Mustering…' : 'Muster'}
          </button>
        </footer>
      </div>
    </div>
  )
}
