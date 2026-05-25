import { useState } from 'react'
import type { RealmState } from '../../../rules/state'
import type { Race, Terrain } from '../../../types/rules'
import { totalIdlePopulation } from '../../../rules/actions/populationCommit'
import { useStartConstruction } from '../../../hooks/useStartConstruction'
import { isWorkforceMixValid, WorkforceMixPicker } from '../WorkforceMixPicker'

const CONVERT_POP_COST = 2

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

const TARGET_TERRAINS: { value: Terrain; label: string }[] = [
  { value: 'plains',    label: 'Plains' },
  { value: 'forest',    label: 'Forest' },
  { value: 'hills',     label: 'Hills' },
  { value: 'mountains', label: 'Mountains' },
  { value: 'swamp',     label: 'Swamp' },
  { value: 'water',     label: 'Water' },
]

export function ConvertTerrainPanel({ realm, realmId, onClose }: Props) {
  const wastelands = realm.areas.filter((a) => a.terrain === 'wasteland')
  const [areaId, setAreaId] = useState<string>(wastelands[0]?.id ?? '')
  const [target, setTarget] = useState<Terrain>('plains')
  const [raceMix, setRaceMix] = useState<Partial<Record<Race, number>> | undefined>(undefined)
  const start = useStartConstruction()
  const idle = totalIdlePopulation(realm)
  const popShortfall = idle < CONVERT_POP_COST
  const mixOk = isWorkforceMixValid(realm, raceMix, CONVERT_POP_COST)

  const submit = async () => {
    if (!areaId) return
    try {
      await start.mutateAsync({
        realmId,
        kind: 'convert_terrain',
        params: { areaId, newTerrain: target, raceMix },
      })
      onClose()
    } catch {
      /* error surfaced */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Convert Terrain</h3>
          <p className="text-sm text-stone-500">
            Transform a wasteland into productive terrain. Cost: 3 lumber, 2 food, 2 pop, 2 seasons.
            If the area isn't adjacent to a road or stronghold, +5 lumber and +2 seasons.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {wastelands.length === 0 ? (
            <p className="text-stone-500 text-sm">This realm has no wasteland areas to convert.</p>
          ) : (
            <>
              <label className="block">
                <span className="text-sm font-medium">Wasteland area</span>
                <select
                  value={areaId}
                  onChange={(e) => setAreaId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
                >
                  {wastelands.map((a) => {
                    const idx = realm.areas.findIndex((x) => x.id === a.id) + 1
                    return (
                      <option key={a.id} value={a.id}>
                        Wasteland #{idx} (position {a.positionX},{a.positionY})
                      </option>
                    )
                  })}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Convert to</span>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value as Terrain)}
                  className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
                >
                  {TARGET_TERRAINS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>

              <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-xs text-stone-500">
                Pop cost: <strong>{CONVERT_POP_COST}</strong> (drawn from idle, return home on completion).{' '}
                Idle workers:{' '}
                <strong className={popShortfall ? 'text-red-600 dark:text-red-400' : ''}>
                  {idle}
                </strong>
                {popShortfall && (
                  <span className="block mt-1 text-red-600 dark:text-red-400">
                    Free workers via Move Settlers / Harvest Terrain first.
                  </span>
                )}
              </div>

              {!popShortfall && (
                <WorkforceMixPicker
                  realm={realm}
                  required={CONVERT_POP_COST}
                  value={raceMix}
                  onChange={setRaceMix}
                />
              )}
            </>
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
            disabled={!areaId || start.isPending || popShortfall || !mixOk}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {start.isPending ? 'Starting…' : 'Start'}
          </button>
        </footer>
      </div>
    </div>
  )
}
