import { useState } from 'react'
import { TERRAIN_STATS, type Race, type Terrain } from '../../../types/rules'
import {
  populationByRaceWorkingArea,
  populationWorkingArea,
  type AreaState,
  type RealmState,
} from '../../../rules/state'
import {
  useAssignPopulation,
  type AssignPopulationVars,
} from '../../../hooks/useAssignPopulation'
import { useSurveyArea } from '../../../hooks/useSurveyArea'
import type { SurveyResult } from '../../../rules/survey'
import { SurveyResultDialog } from '../SurveyResultDialog'

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

const MINERAL_SHORT: Record<string, string> = {
  adamantine: 'Adamant.',
  copper: 'Copper',
  gold_metal: 'Gold',
  iron: 'Iron',
  mithral: 'Mithral',
  silver: 'Silver',
}

function formatYieldShort(terrain: Terrain): string {
  switch (terrain) {
    case 'plains':    return '4F'
    case 'forest':    return '4L · 1F'
    case 'hills':     return '2S · or 1 ore'
    case 'mountains': return '2 ore · or 4S'
    case 'swamp':     return '1F · 1G'
    case 'water':     return '2F'
    case 'ruins':     return '0-6G'
    case 'wasteland': return '—'
  }
}

function formatYieldLong(terrain: Terrain): string {
  switch (terrain) {
    case 'plains':    return 'Produces 4 food per area.'
    case 'forest':    return 'Produces 4 lumber + 1 food per area.'
    case 'hills':     return 'Produces 2 stone OR 1 mineral per area.'
    case 'mountains': return 'Produces 2 mineral OR 4 stone per area.'
    case 'swamp':     return 'Produces 1 food + 1 gold per area.'
    case 'water':     return 'Produces 2 food per area.'
    case 'ruins':     return 'Produces 1d10 - 4 gold per area (random).'
    case 'wasteland': return 'Produces nothing.'
  }
}

/** Idle pop broken down by race (workAreaId === null). */
function idleByRace(realm: RealmState): Partial<Record<Race, number>> {
  const out: Partial<Record<Race, number>> = {}
  for (const p of realm.populations) {
    if (p.workAreaId !== null || p.count <= 0) continue
    out[p.race] = (out[p.race] ?? 0) + p.count
  }
  return out
}

export function HarvestTerrainPanel({ realm, realmId, onClose }: Props) {
  const assign = useAssignPopulation()
  const survey = useSurveyArea()
  const [surveyDialog, setSurveyDialog] = useState<{
    result: SurveyResult
    areaIndex: number
  } | null>(null)
  const idle = idleByRace(realm)
  const idleTotal = Object.values(idle).reduce((s, n) => s + (n ?? 0), 0)
  const idleRaces = RACE_ORDER.filter((r) => (idle[r] ?? 0) > 0)

  const strongholdsByArea = new Map<string, typeof realm.strongholds>()
  for (const s of realm.strongholds) {
    const list = strongholdsByArea.get(s.areaId) ?? []
    list.push(s)
    strongholdsByArea.set(s.areaId, list)
  }

  const totalWorkers = realm.populations.reduce(
    (sum, p) => sum + (p.workAreaId !== null ? p.count : 0),
    0,
  )
  const activeAreas = realm.areas.filter(
    (a) => populationWorkingArea(realm, a.id) >= TERRAIN_STATS[a.terrain].harvestPop &&
           TERRAIN_STATS[a.terrain].harvestPop > 0,
  ).length

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-serif font-semibold text-xl">Harvest Terrain</h3>
            <span className="text-xs text-stone-500">Construction</span>
          </div>
          <p className="text-sm text-stone-500">
            <strong>+</strong> assigns one idle worker of the chosen race to harvest here. Unhoused workers
            are automatically housed in this area if it has free living space.
            <strong> −</strong> sends a worker back to the idle pool (their home doesn't change).
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <span className={idleTotal > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-stone-500'}>
              Idle: <strong>{idleTotal}</strong>
            </span>
            {idleRaces.length > 0 && (
              <span className="text-stone-500">
                ({idleRaces.map((r) => `${idle[r]} ${RACE_LABEL[r].toLowerCase()}`).join(' · ')})
              </span>
            )}
            <span className="text-stone-500">·</span>
            <span className="text-stone-500">
              <strong>{totalWorkers}</strong> working ·
              <strong> {activeAreas}</strong> area{activeAreas === 1 ? '' : 's'} active
            </span>
          </div>
        </header>

        <div className="px-5 py-4 overflow-y-auto">
          <div className="grid grid-cols-5 gap-2">
            {realm.areas.map((area, idx) => (
              <WorkerAreaCard
                key={area.id}
                area={area}
                index={idx + 1}
                realm={realm}
                realmId={realmId}
                idle={idle}
                strongholds={strongholdsByArea.get(area.id) ?? []}
                isPending={assign.isPending}
                isSurveyPending={survey.isPending}
                onMove={(vars) => assign.mutate(vars)}
                onSurvey={() =>
                  survey.mutate(
                    { realmId, op: 'survey', areaId: area.id },
                    {
                      onSuccess: ({ survey: result }) => {
                        if (result) setSurveyDialog({ result, areaIndex: idx + 1 })
                      },
                    },
                  )
                }
                onSetMode={(mode) =>
                  survey.mutate({ realmId, op: 'set-mode', areaId: area.id, mode })
                }
              />
            ))}
          </div>
          {assign.error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {assign.error.message}
            </p>
          )}
          {survey.error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {survey.error.message}
            </p>
          )}
        </div>

        {surveyDialog && (
          <SurveyResultDialog
            result={surveyDialog.result}
            areaIndex={surveyDialog.areaIndex}
            onClose={() => setSurveyDialog(null)}
          />
        )}

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

function WorkerAreaCard({
  area,
  index,
  realm,
  realmId,
  idle,
  strongholds,
  isPending,
  isSurveyPending,
  onMove,
  onSurvey,
  onSetMode,
}: {
  area: AreaState
  index: number
  realm: RealmState
  realmId: string
  idle: Partial<Record<Race, number>>
  strongholds: typeof realm.strongholds
  isPending: boolean
  isSurveyPending: boolean
  onMove: (vars: AssignPopulationVars) => void
  onSurvey: () => void
  onSetMode: (mode: 'stone' | 'mineral') => void
}) {
  const stats = TERRAIN_STATS[area.terrain]
  const workingHere = populationWorkingArea(realm, area.id)
  const minWorkers = stats.harvestPop
  const productive = minWorkers > 0 && workingHere >= minWorkers
  const wastedAssignment = minWorkers > 0 && workingHere > 0 && workingHere < minWorkers
  // Cap workers at the terrain's harvestPop. Extra workers don't produce
  // any extra resources (the engine already produces at the base rate),
  // so we stop the player from over-staffing what amounts to a no-op.
  // (Goblin "double pop" doubling is a separate mechanic — when wired up,
  // it'll lift this cap to 2× for goblin-only areas.)
  const atCap = minWorkers > 0 && workingHere >= minWorkers

  const byRace = populationByRaceWorkingArea(realm, area.id)
  const racesShown = RACE_ORDER.filter((r) => (byRace[r] ?? 0) > 0 || (idle[r] ?? 0) > 0)

  // Stone/mineral toggle for hills + mountains.
  const supportsMode = area.terrain === 'hills' || area.terrain === 'mountains'
  const mode: 'stone' | 'mineral' = area.harvestMode === 'mineral' ? 'mineral' : 'stone'
  const surveyed = area.mineralResults.length > 0
  const mineralLabel = area.mineralResults
    .map((m) => MINERAL_SHORT[m] ?? m)
    .join(' + ')
  const handleStoneClick = () => {
    if (mode === 'stone') return
    onSetMode('stone')
  }
  const handleMineralClick = () => {
    if (mode === 'mineral') return
    if (surveyed) {
      // Already surveyed — flip mode without rolling. The hook still uses
      // 'set-mode' op which doesn't trigger a dialog.
      onSetMode('mineral')
    } else {
      // Unsurveyed — kick off the survey roll. Hook opens the dialog on success.
      onSurvey()
    }
  }

  const handleAdd = (race: Race) => {
    // Find an idle stack of this race (work=null). Prefer pool stacks
    // (homeAreaId=null) so the auto-housing kicks in for unhoused units; if
    // none are available, fall back to a housed-but-idle stack so the
    // player can still re-assign settled commoners to a different field.
    const poolStack = realm.populations.find(
      (p) => p.race === race && p.workAreaId === null && p.homeAreaId === null && p.count > 0,
    )
    const housedIdle = realm.populations.find(
      (p) => p.race === race && p.workAreaId === null && p.homeAreaId !== null && p.count > 0,
    )
    const source = poolStack ?? housedIdle
    if (!source) return
    onMove({
      realmId,
      op: 'set-work',
      input: {
        race,
        homeAreaId: source.homeAreaId,
        fromWorkAreaId: null,
        toWorkAreaId: area.id,
        count: 1,
        // Only meaningful for pool sources — auto-housing in the work area
        // when there's free living space. Has no effect when the unit is
        // already housed somewhere.
        autoHouseIfSpace: true,
      },
    })
  }

  const handleRemove = (race: Race) => {
    const worker = realm.populations.find(
      (p) => p.race === race && p.workAreaId === area.id && p.count > 0,
    )
    if (!worker) return
    onMove({
      realmId,
      op: 'set-work',
      input: {
        race,
        homeAreaId: worker.homeAreaId ?? '',
        fromWorkAreaId: area.id,
        toWorkAreaId: null,
        count: 1,
      },
    })
  }

  const borderClass = productive
    ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30'
    : wastedAssignment
      ? 'border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30'
      : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'

  return (
    <div
      className={`aspect-square border rounded p-2 text-[10px] flex flex-col justify-between ${borderClass}`}
      title={formatYieldLong(area.terrain)}
    >
      <div className="text-center">
        <div className="capitalize font-medium text-xs">#{index} {area.terrain}</div>
        <div className="text-[9px] text-stone-500 font-mono mt-0.5">
          {formatYieldShort(area.terrain)}
        </div>
      </div>

      {supportsMode && (
        // Tiny two-button toggle: Stone | Mineral. Clicking Mineral on an
        // un-surveyed area kicks off the d100 survey and opens a dialog
        // with the result. The current pick is shown filled.
        <div className="flex items-center justify-center gap-0.5 text-[9px]">
          <button
            onClick={handleStoneClick}
            disabled={isSurveyPending}
            title="Harvest as stone"
            className={`px-1.5 py-0.5 rounded-l border transition-colors ${
              mode === 'stone'
                ? 'bg-stone-700 dark:bg-stone-300 text-stone-50 dark:text-stone-900 border-stone-700 dark:border-stone-300'
                : 'border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            Stone
          </button>
          <button
            onClick={handleMineralClick}
            disabled={isSurveyPending}
            title={
              surveyed
                ? `Harvest as ${mineralLabel || 'mineral'}`
                : 'Survey for minerals (rolls d100' + (area.terrain === 'mountains' ? ' twice' : '') + ')'
            }
            className={`px-1.5 py-0.5 rounded-r border transition-colors ${
              mode === 'mineral'
                ? 'bg-amber-600 dark:bg-amber-500 text-amber-50 dark:text-amber-950 border-amber-700 dark:border-amber-500'
                : 'border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            {surveyed
              ? (mineralLabel || 'Mineral')
              : 'Survey'}
          </button>
        </div>
      )}

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

      <div className="space-y-1">
        {minWorkers === 0 ? (
          <div className="text-center text-stone-400 text-[9px]">No yield</div>
        ) : racesShown.length === 0 ? (
          <div className="text-center text-stone-400 text-[9px]">No workers</div>
        ) : (
          racesShown.map((race) => {
            const here = byRace[race] ?? 0
            const available = idle[race] ?? 0
            const canAdd = !isPending && available > 0 && !atCap
            const canRemove = !isPending && here > 0
            const addTitle = atCap
              ? `Already at min ${minWorkers} worker${minWorkers === 1 ? '' : 's'} — extra workers don't increase yield.`
              : available > 0
                ? `Set 1 idle ${RACE_LABEL[race]} to work here (${available} idle)`
                : `No idle ${RACE_LABEL[race].toLowerCase()}`
            return (
              <div key={race} className="flex items-center gap-1">
                <span
                  title={RACE_LABEL[race]}
                  className="font-mono text-[9px] w-3 text-stone-500 text-center"
                >
                  {RACE_CHIP[race]}
                </span>
                <button
                  onClick={() => handleRemove(race)}
                  disabled={!canRemove}
                  aria-label={`Stop 1 ${RACE_LABEL[race]} from working here`}
                  className="w-4 h-4 rounded border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:cursor-not-allowed text-[9px] leading-none flex items-center justify-center"
                >
                  −
                </button>
                <span className="font-mono text-[10px] flex-1 text-center">{here}</span>
                <button
                  onClick={() => handleAdd(race)}
                  disabled={!canAdd}
                  title={addTitle}
                  aria-label={`Set 1 idle ${RACE_LABEL[race]} to work here`}
                  className="w-4 h-4 rounded border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:cursor-not-allowed text-[9px] leading-none flex items-center justify-center"
                >
                  +
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="text-center text-stone-500 text-[9px] mt-1">
        <span className={productive ? 'text-emerald-700 dark:text-emerald-300 font-medium' : ''}>
          {workingHere}
        </span>
        {minWorkers > 0 ? `/ min ${minWorkers}` : ''}
      </div>
    </div>
  )
}
