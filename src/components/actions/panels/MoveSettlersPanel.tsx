import { TERRAIN_STATS, type Race } from '../../../types/rules'
import {
  livingSpaceForArea,
  populationByRaceOnArea,
  populationLivingOnArea,
  type AreaState,
  type RealmState,
} from '../../../rules/state'
import {
  useAssignPopulation,
  type AssignPopulationVars,
} from '../../../hooks/useAssignPopulation'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

const STRONGHOLD_BADGE: Record<string, { letter: string; title: string }> = {
  village: { letter: 'V', title: 'Village' },
  town: { letter: 'T', title: 'Town' },
  city: { letter: 'C', title: 'City' },
  keep: { letter: 'K', title: 'Keep' },
  castle: { letter: 'Ca', title: 'Castle' },
  citadel: { letter: 'Ci', title: 'Citadel' },
  mine: { letter: 'M', title: 'Mine' },
  wall: { letter: 'W', title: 'Wall' },
  marketplace: { letter: 'Mk', title: 'Marketplace' },
  port: { letter: 'P', title: 'Port' },
  craftsmens_guild: { letter: 'G', title: "Craftsmen's Guild" },
  wizards_academy: { letter: 'A', title: "Wizards' Academy" },
  grand_temple: { letter: 'Te', title: 'Grand Temple' },
}

const RACE_LABEL: Record<Race, string> = {
  humans: 'Humans',
  dwarves: 'Dwarves',
  elves: 'Elves',
  gnomes: 'Gnomes',
  halflings: 'Halflings',
  orcs: 'Orcs',
  goblins: 'Goblins',
  undead: 'Undead',
}

// Short single-letter chip labels for the dense per-area grid.
const RACE_CHIP: Record<Race, string> = {
  humans: 'H',
  dwarves: 'D',
  elves: 'E',
  gnomes: 'G',
  halflings: 'h',
  orcs: 'O',
  goblins: 'g',
  undead: 'U',
}

const RACE_ORDER: Race[] = [
  'humans', 'dwarves', 'elves', 'gnomes', 'halflings', 'orcs', 'goblins', 'undead',
]

/** Pool count per race (homeAreaId=null, regardless of work). */
function unallocatedByRace(realm: RealmState): Partial<Record<Race, number>> {
  const out: Partial<Record<Race, number>> = {}
  for (const p of realm.populations) {
    if (p.homeAreaId !== null || p.count <= 0) continue
    out[p.race] = (out[p.race] ?? 0) + p.count
  }
  return out
}

export function MoveSettlersPanel({ realm, realmId, onClose }: Props) {
  const assign = useAssignPopulation()
  const pool = unallocatedByRace(realm)
  const poolTotal = Object.values(pool).reduce((s, n) => s + (n ?? 0), 0)
  const poolRaces = RACE_ORDER.filter((r) => (pool[r] ?? 0) > 0)

  const strongholdsByArea = new Map<string, typeof realm.strongholds>()
  for (const s of realm.strongholds) {
    const list = strongholdsByArea.get(s.areaId) ?? []
    list.push(s)
    strongholdsByArea.set(s.areaId, list)
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-serif font-semibold text-xl">Move Settlers</h3>
            <span className="text-xs text-stone-500">(homebrew)</span>
          </div>
          <p className="text-sm text-stone-500">
            <strong>+</strong> takes one settler of the chosen race from the unallocated pool and homes them here.
            <strong> −</strong> sends a resident back to the pool. Housing is separate from work assignment —
            use <em>Harvest Terrain</em> to set where they actually labour.
          </p>
          <div className="mt-2 text-sm">
            <span className={poolTotal > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-stone-500'}>
              Unallocated pool: {poolTotal}
            </span>
            {poolRaces.length > 0 && (
              <span className="ml-2 text-xs text-stone-500">
                ({poolRaces.map((r) => `${pool[r]} ${RACE_LABEL[r].toLowerCase()}`).join(' · ')})
              </span>
            )}
            {poolTotal > 0 && (
              <span className="ml-2 text-xs text-stone-500">
                (must be 0 before End Season)
              </span>
            )}
          </div>
        </header>

        <div className="px-5 py-4 overflow-y-auto">
          <div className="grid grid-cols-5 gap-2">
            {realm.areas.map((area, idx) => (
              <SettlementAreaCard
                key={area.id}
                area={area}
                index={idx + 1}
                realm={realm}
                realmId={realmId}
                pool={pool}
                strongholds={strongholdsByArea.get(area.id) ?? []}
                isPending={assign.isPending}
                onMove={(vars) => assign.mutate(vars)}
              />
            ))}
          </div>

          {assign.error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {assign.error.message}
            </p>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}

function SettlementAreaCard({
  area,
  index,
  realm,
  realmId,
  pool,
  strongholds,
  isPending,
  onMove,
}: {
  area: AreaState
  index: number
  realm: RealmState
  realmId: string
  pool: Partial<Record<Race, number>>
  strongholds: typeof realm.strongholds
  isPending: boolean
  onMove: (vars: AssignPopulationVars) => void
}) {
  const stats = TERRAIN_STATS[area.terrain]
  const livingHere = populationLivingOnArea(realm, area.id)
  const settlementCap = livingSpaceForArea(realm, area.id)
  const bonus = settlementCap - stats.settlementCap
  const overcrowded = livingHere > settlementCap

  // Which races are relevant for this area: those living here OR available in the pool.
  const byRace = populationByRaceOnArea(realm, area.id)
  const racesShown = RACE_ORDER.filter((r) => (byRace[r] ?? 0) > 0 || (pool[r] ?? 0) > 0)

  const move = (race: Race, dir: 'in' | 'out') =>
    onMove({
      realmId,
      op: 'move-home',
      input: {
        race,
        fromHomeAreaId: dir === 'in' ? null : area.id,
        toHomeAreaId: dir === 'in' ? area.id : null,
        count: 1,
      },
    })

  return (
    <div
      className={`aspect-square border rounded p-2 text-[10px] flex flex-col justify-between bg-white dark:bg-stone-900 ${
        overcrowded
          ? 'border-amber-400 dark:border-amber-700'
          : 'border-stone-200 dark:border-stone-800'
      }`}
    >
      <div className="capitalize font-medium text-center text-xs">
        #{index} {area.terrain}
      </div>

      <div className="flex flex-wrap gap-1 justify-center min-h-[18px]">
        {strongholds.map((s) => (
          <span
            key={s.id}
            title={STRONGHOLD_BADGE[s.kind]?.title ?? s.kind}
            className="inline-block px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-700 text-[10px] font-mono"
          >
            {STRONGHOLD_BADGE[s.kind]?.letter ?? '?'}
          </span>
        ))}
      </div>

      {/* Per-race rows. Empty when no race has anything to add or remove here. */}
      <div className="space-y-1">
        {racesShown.length === 0 ? (
          <div className="text-center text-stone-400 text-[9px]">No settlers</div>
        ) : (
          racesShown.map((race) => {
            const here = byRace[race] ?? 0
            const inPool = pool[race] ?? 0
            const canAdd = !isPending && inPool > 0
            const canRemove = !isPending && here > 0
            return (
              <div key={race} className="flex items-center gap-1">
                <span
                  title={RACE_LABEL[race]}
                  className="font-mono text-[9px] w-3 text-stone-500 text-center"
                >
                  {RACE_CHIP[race]}
                </span>
                <button
                  onClick={() => move(race, 'out')}
                  disabled={!canRemove}
                  aria-label={`Send 1 ${RACE_LABEL[race]} home back to pool`}
                  className="w-4 h-4 rounded border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:cursor-not-allowed text-[9px] leading-none flex items-center justify-center"
                >
                  −
                </button>
                <span className="font-mono text-[10px] flex-1 text-center">{here}</span>
                <button
                  onClick={() => move(race, 'in')}
                  disabled={!canAdd}
                  title={canAdd ? `Add 1 ${RACE_LABEL[race]} from pool (${inPool} left)` : `No ${RACE_LABEL[race].toLowerCase()} in pool`}
                  aria-label={`Add 1 ${RACE_LABEL[race]} from pool`}
                  className="w-4 h-4 rounded border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:cursor-not-allowed text-[9px] leading-none flex items-center justify-center"
                >
                  +
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="text-center text-stone-500 text-[9px] mt-1"
        title={bonus > 0 ? `Terrain ${stats.settlementCap} + strongholds +${bonus}` : undefined}
      >
        <span className={overcrowded ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>
          {livingHere}
        </span>
        /{settlementCap}
      </div>
    </div>
  )
}
