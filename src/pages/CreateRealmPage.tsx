import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCreateRealm } from '../hooks/useCreateRealm'
import type { ClimateTemplate, Race, RealmScale, Terrain } from '../types/rules'
import { abilityMod, type RulerStats } from '../rules/state'
import { AppShell } from '../components/AppShell'
import {
  CustomAreaBuilder,
  autoPickCols as autoColsFromTerrains,
} from '../components/createRealm/CustomAreaBuilder'
import {
  CustomBuildingsBuilder,
  type PlacedStronghold,
} from '../components/createRealm/CustomBuildingsBuilder'
import { CustomResourcesPicker } from '../components/createRealm/CustomResourcesPicker'
import { EMPTY_RESOURCE_POOL, type ResourcePool } from '../types/rules'

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

type SetupMode = 'standard' | 'custom'

const DEFAULT_RULER: RulerStats = {
  name: '',
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
  diplomacy: 0,
  knowledgeEconomics: 0,
}

const ABILITY_FIELDS: { key: keyof Pick<RulerStats, 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'>; label: string; short: string }[] = [
  { key: 'strength',     label: 'Strength',     short: 'STR' },
  { key: 'dexterity',    label: 'Dexterity',    short: 'DEX' },
  { key: 'constitution', label: 'Constitution', short: 'CON' },
  { key: 'intelligence', label: 'Intelligence', short: 'INT' },
  { key: 'wisdom',       label: 'Wisdom',       short: 'WIS' },
  { key: 'charisma',     label: 'Charisma',     short: 'CHA' },
]

const RACE_ORDER: Race[] = [
  'humans', 'dwarves', 'elves', 'gnomes', 'halflings', 'orcs', 'goblins', 'undead',
]

const RACE_LABELS: Record<Race, string> = {
  humans: 'Humans',
  dwarves: 'Dwarves',
  elves: 'Elves',
  gnomes: 'Gnomes',
  halflings: 'Halflings',
  orcs: 'Orcs',
  goblins: 'Goblins',
  undead: 'Undead',
}

const RACE_NOTES: Record<Race, string> = {
  humans: '+2 events bonus when no other race works your land.',
  dwarves: '+1 stone in hills, +1 stone / +0.5 mineral in mountains; can craft metal items.',
  elves: '+1 lumber and +1 food in forests; bypasses the Wizards\' Academy requirement for magic items.',
  gnomes: '+0.5 stone in hills, +0.5 stone / +0.25 mineral in mountains; can craft magic items.',
  halflings: 'Unassigned halflings give +1 Gather Info and +1 availability checks.',
  orcs: '-1 per resource they harvest, but can muster as 1st-level warriors for free.',
  goblins: '-1 per resource, but can be packed 2× per area to double output (after penalty).',
  undead: 'No food upkeep, no farming; their presence imposes -2 loyalty on non-evil followers.',
}

const SCALE_DEFAULT_POP: Record<RealmScale, number> = {
  barony: 10,
  kingdom: 10,
  empire: 10,
}

const SCALES: { value: RealmScale; label: string; description: string }[] = [
  { value: 'barony',  label: 'Barony',  description: 'A small domain of one or two villages, a few hundred soldiers, a few miles across.' },
  { value: 'kingdom', label: 'Kingdom', description: 'A nation that spans many baronies, with armies in the thousands.' },
  { value: 'empire',  label: 'Empire',  description: 'A superpower spanning many kingdoms, with worldwide influence.' },
]

const CLIMATES: { value: ClimateTemplate; label: string; summary: string }[] = [
  { value: 'standard',  label: 'Standard (mixed)', summary: '5 forest · 2 hills · 10 plains · 1 swamp · 2 water' },
  { value: 'coastal',   label: 'Coastal',          summary: '2 forest · 7 plains · 3 swamp · 8 water' },
  { value: 'desert',    label: 'Desert',           summary: '2 forest · 2 hills · 8 plains · 2 mountains · 5 wasteland · 1 water' },
  { value: 'forest',    label: 'Deep forest',      summary: '10 forest · 2 hills · 6 plains · 1 ruins · 1 swamp' },
  { value: 'hills',     label: 'Hill country',     summary: '4 forest · 8 hills · 6 plains · 2 mountains' },
  { value: 'mountains', label: 'Mountain range',   summary: '3 forest · 2 hills · 4 plains · 6 mountains · 1 ruins · 4 wasteland' },
]

export function CreateRealmPage() {
  const navigate = useNavigate()
  const { mutateAsync, isPending, error } = useCreateRealm()

  const [mode, setMode] = useState<SetupMode>('standard')

  const [name, setName] = useState('')
  const [scale, setScale] = useState<RealmScale>('barony')
  const [climate, setClimate] = useState<ClimateTemplate>('standard')

  // Custom-mode-only state — flat row-major terrain list + grid-width
  // preference. The (positionX, positionY) of each area is derived from
  // its index and the resolved cols at submit time. Default starter is
  // 10 plains tiles so the grid renders something meaningful right away.
  const [customTerrains, setCustomTerrains] = useState<Terrain[]>(() =>
    Array(10).fill('plains') as Terrain[],
  )
  const [customCols, setCustomCols] = useState<number | 'auto'>('auto')
  // Buildings + roads — both keyed by area index (i.e. the position in
  // customTerrains). At submit time we'll convert these into the
  // engine's position-keyed CustomStrongholdSpec / customRoadPositions.
  const [customStrongholds, setCustomStrongholds] = useState<PlacedStronghold[]>([])
  const [customRoads, setCustomRoads] = useState<Set<number>>(() => new Set())
  // Resources: auto = let the engine compute from terrain; custom = use exact values.
  const [customResourcesMode, setCustomResourcesMode] = useState<'auto' | 'custom'>('auto')
  const [customResources, setCustomResources] = useState<ResourcePool>(() => ({
    ...EMPTY_RESOURCE_POOL,
  }))

  // When the area count shrinks, drop strongholds + roads that pointed at
  // now-deleted indices. Cheap to recompute on every render.
  const trimmedStrongholds = customStrongholds.filter(
    (s) => s.areaIndex < customTerrains.length,
  )
  const trimmedRoads = useMemo(() => {
    const next = new Set<number>()
    for (const i of customRoads) if (i < customTerrains.length) next.add(i)
    return next
  }, [customRoads, customTerrains.length])

  const [ruler, setRuler] = useState<RulerStats>({ ...DEFAULT_RULER })

  const updateRulerAbility = (key: keyof RulerStats, value: number) => {
    setRuler((prev) => ({ ...prev, [key]: Math.max(1, Math.floor(value)) }))
  }

  const target = SCALE_DEFAULT_POP[scale]
  const [populationRaces, setPopulationRaces] = useState<Record<Race, number>>({
    humans: target,
    dwarves: 0,
    elves: 0,
    gnomes: 0,
    halflings: 0,
    orcs: 0,
    goblins: 0,
    undead: 0,
  })

  const total = useMemo(
    () => RACE_ORDER.reduce((s, r) => s + (populationRaces[r] ?? 0), 0),
    [populationRaces],
  )
  // Population must match the target ONLY in standard mode. In custom mode
  // any non-negative total is allowed.
  const popMismatch = mode === 'standard' && total !== target

  const updateRace = (race: Race, value: number) => {
    setPopulationRaces((prev) => ({ ...prev, [race]: Math.max(0, Math.floor(value)) }))
  }

  const resetToHumans = () => {
    setPopulationRaces({
      humans: target,
      dwarves: 0,
      elves: 0,
      gnomes: 0,
      halflings: 0,
      orcs: 0,
      goblins: 0,
      undead: 0,
    })
  }

  // Custom-mode-specific validation. The engine requires at least 2 areas,
  // and every add-on stronghold must have a parent on its tile (the UI
  // already enforces this when building the list, but we re-check here in
  // case state was corrupted).
  const customAreasInvalid = mode === 'custom' && customTerrains.length < 2
  const orphanAddons =
    mode === 'custom' &&
    trimmedStrongholds.some((s) => {
      const ADDONS = new Set([
        'wall',
        'marketplace',
        'port',
        'craftsmens_guild',
        'wizards_academy',
        'grand_temple',
      ])
      return ADDONS.has(s.kind) && !s.parentLocalId
    })
  const customInvalid = customAreasInvalid || orphanAddons

  /**
   * Convert the React state into the engine specs createStartingDomain
   * expects. Positions are derived from the area index and the resolved
   * grid width; the same width is used to map stronghold + road indices
   * onto (x,y) coords.
   */
  const buildCustomPayload = () => {
    const resolvedCols =
      customCols === 'auto' ? autoColsFromTerrains(customTerrains.length) : customCols

    const customAreasOut = customTerrains.map((terrain, i) => ({
      terrain,
      positionX: i % resolvedCols,
      positionY: Math.floor(i / resolvedCols),
    }))

    // Strongholds preserve their input order so child parentIndex always
    // points at a strictly earlier entry — addStronghold appends to the
    // list, so the natural order already satisfies that constraint.
    const localIdToIndex = new Map<string, number>()
    trimmedStrongholds.forEach((s, i) => localIdToIndex.set(s.localId, i))
    const customStrongholdsOut = trimmedStrongholds.map((s) => ({
      kind: s.kind,
      positionX: s.areaIndex % resolvedCols,
      positionY: Math.floor(s.areaIndex / resolvedCols),
      parentIndex: s.parentLocalId != null ? localIdToIndex.get(s.parentLocalId) ?? null : null,
      mineResourceType: s.mineResourceType,
    }))

    const customRoadPositionsOut = Array.from(trimmedRoads).map((i) => ({
      x: i % resolvedCols,
      y: Math.floor(i / resolvedCols),
    }))

    return {
      customAreas: customAreasOut,
      customStrongholds: customStrongholdsOut,
      customRoadPositions: customRoadPositionsOut,
      startingResources:
        customResourcesMode === 'custom' ? customResources : undefined,
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || popMismatch || customInvalid) return
    const rulerPayload: RulerStats = {
      ...ruler,
      name: ruler.name.trim() || 'The Ruler',
    }
    const customPayload = mode === 'custom' ? buildCustomPayload() : {}
    const realm = await mutateAsync({
      name,
      scale,
      climateTemplate: climate,
      populationRaces,
      ruler: rulerPayload,
      ...customPayload,
    })
    navigate(`/realms/${realm.id}?name-strongholds=1&origin-story=1`, { replace: true })
  }

  return (
    <AppShell
      topBar={
        <Link to="/realms" className="hover:text-[var(--wine)] transition-colors">
          ← All realms
        </Link>
      }
    >
      <div className="max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="empire-heading text-4xl font-serif font-bold">Found a new realm</h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)] italic">
          Set the stage for your reign — name your land, choose your seat, gather your people.
        </p>
      </header>

      {/* Standard / Custom mode toggle. Sits above the form so its scope is
          unmistakable. The two modes share name/scale/ruler — only the land
          layout, buildings, populace target, and starting resources differ. */}
      <fieldset className="mb-8" aria-label="Setup mode">
        <legend className="text-sm font-medium mb-2">Setup mode</legend>
        <div className="grid grid-cols-2 gap-2">
          <ModeOption
            value="standard"
            current={mode}
            onSelect={setMode}
            title="Standard"
            description="20 areas auto-generated from a climate template. Default Village + Keep placed for you. Population auto-balanced."
          />
          <ModeOption
            value="custom"
            current={mode}
            onSelect={setMode}
            title="Custom"
            description="Pick your own number of areas and paint each terrain. Choose strongholds and roads. Free-form starting resources and population."
          />
        </div>
      </fieldset>

      <form onSubmit={handleSubmit} className="space-y-6">
        <label className="block">
          <span className="text-sm font-medium">Realm name</span>
          <input
            type="text"
            required
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Marches of Dunmoor"
            className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-500"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium mb-2">Scale</legend>
          <div className="space-y-2">
            {SCALES.map((s) => (
              <label
                key={s.value}
                className={`block border rounded-md p-3 cursor-pointer ${
                  scale === s.value
                    ? 'border-stone-900 dark:border-stone-100 bg-stone-50 dark:bg-stone-900'
                    : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900'
                }`}
              >
                <input
                  type="radio"
                  name="scale"
                  value={s.value}
                  checked={scale === s.value}
                  onChange={() => setScale(s.value)}
                  className="sr-only"
                />
                <div className="font-medium">{s.label}</div>
                <div className="text-sm text-stone-500">{s.description}</div>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium mb-2">Your ruler</legend>
          <p className="text-xs text-stone-500 mb-3">
            The player character on the throne. Their ability scores and skills stand in for any minister role that's vacant (the ruler covers it personally, with a -2 circumstance penalty).
          </p>
          <label className="block mb-3">
            <span className="text-sm">Ruler name</span>
            <input
              type="text"
              maxLength={64}
              value={ruler.name}
              onChange={(e) => setRuler((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Lord Aelric Stoneheart"
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {ABILITY_FIELDS.map((f) => {
              const score = ruler[f.key] as number
              const mod = abilityMod(score)
              return (
                <label
                  key={f.key}
                  className="border border-stone-200 dark:border-stone-800 rounded-md p-2 flex items-center justify-between"
                >
                  <span className="text-xs">
                    <span className="font-semibold tracking-wide">{f.short}</span>
                    <span className="ml-2 text-stone-500">({fmtMod(mod)})</span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={score}
                    onChange={(e) => updateRulerAbility(f.key, Number(e.target.value))}
                    className="w-14 rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-center"
                    aria-label={f.label}
                  />
                </label>
              )
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="border border-stone-200 dark:border-stone-800 rounded-md p-2 flex items-center justify-between">
              <span className="text-xs">
                <span className="font-medium">Diplomacy</span>
                <span className="ml-2 text-stone-500">(used if no General)</span>
              </span>
              <input
                type="number"
                value={ruler.diplomacy}
                onChange={(e) => setRuler((prev) => ({ ...prev, diplomacy: Math.floor(Number(e.target.value)) }))}
                className="w-14 rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-center"
                aria-label="Diplomacy total"
              />
            </label>
            <label className="border border-stone-200 dark:border-stone-800 rounded-md p-2 flex items-center justify-between">
              <span className="text-xs">
                <span className="font-medium">Knowledge (econ.)</span>
                <span className="ml-2 text-stone-500">(used if no Treasurer)</span>
              </span>
              <input
                type="number"
                value={ruler.knowledgeEconomics}
                onChange={(e) => setRuler((prev) => ({ ...prev, knowledgeEconomics: Math.floor(Number(e.target.value)) }))}
                className="w-14 rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-center"
                aria-label="Knowledge (economics) total"
              />
            </label>
          </div>
        </fieldset>

        {/* ────────────────────────────────────────────────────────────────
            STANDARD MODE
        ──────────────────────────────────────────────────────────────── */}
        {mode === 'standard' && (
          <>
            <label className="block">
              <span className="text-sm font-medium">Climate / starting terrain</span>
              <select
                value={climate}
                onChange={(e) => setClimate(e.target.value as ClimateTemplate)}
                className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-500"
              >
                {CLIMATES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label} — {c.summary}
                  </option>
                ))}
              </select>
              <span className="text-xs text-stone-500 mt-1 block">
                All starting realms have 20 land areas. The climate determines how that 20 is split between terrain types.
              </span>
            </label>

            <PopulacePicker
              populationRaces={populationRaces}
              total={total}
              target={target}
              popMismatch={popMismatch}
              mode="standard"
              onChange={updateRace}
              onReset={resetToHumans}
            />
          </>
        )}

        {/* ────────────────────────────────────────────────────────────────
            CUSTOM MODE
        ──────────────────────────────────────────────────────────────── */}
        {mode === 'custom' && (
          <div className="space-y-4">
            <CustomAreaBuilder
              terrains={customTerrains}
              colsMode={customCols}
              onTerrainsChange={setCustomTerrains}
              onColsModeChange={setCustomCols}
            />
            <CustomBuildingsBuilder
              terrains={customTerrains}
              colsMode={customCols}
              strongholds={trimmedStrongholds}
              roadAreaIndices={trimmedRoads}
              onStrongholdsChange={setCustomStrongholds}
              onRoadAreaIndicesChange={setCustomRoads}
            />
            <PopulacePicker
              populationRaces={populationRaces}
              total={total}
              target={target}
              popMismatch={false}
              mode="custom"
              onChange={updateRace}
              onReset={resetToHumans}
            />
            <CustomResourcesPicker
              mode={customResourcesMode}
              custom={customResources}
              terrains={customTerrains}
              onModeChange={setCustomResourcesMode}
              onCustomChange={setCustomResources}
            />
          </div>
        )}

        {mode === 'custom' && customAreasInvalid && (
          <p className="text-sm text-amber-700 dark:text-amber-400" role="alert">
            A realm needs at least 2 areas — add a few more on the grid above.
          </p>
        )}
        {mode === 'custom' && !customAreasInvalid && orphanAddons && (
          <p className="text-sm text-amber-700 dark:text-amber-400" role="alert">
            Some add-on strongholds (Wall, Marketplace, etc.) have no parent on
            their tile. Edit the offending tile to pick a parent or remove the
            add-on.
          </p>
        )}
        {error && (
          <p className="text-sm text-[var(--rust)]" role="alert">
            {error.message}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending || !name.trim() || popMismatch || customInvalid}
            className="empire-button px-6 py-2.5 rounded-md font-medium"
            title={
              customAreasInvalid
                ? 'Custom realms need at least 2 areas.'
                : orphanAddons
                  ? 'Some add-on strongholds have no parent on their tile. Fix or remove them.'
                  : undefined
            }
          >
            {isPending ? 'Crowning the ruler…' : 'Found realm'}
          </button>
          <Link
            to="/realms"
            className="empire-button-ghost px-6 py-2.5 rounded-md font-medium"
          >
            Cancel
          </Link>
        </div>
      </form>
      </div>
    </AppShell>
  )
}

interface ModeOptionProps {
  value: SetupMode
  current: SetupMode
  onSelect: (v: SetupMode) => void
  title: string
  description: string
}

function ModeOption({ value, current, onSelect, title, description }: ModeOptionProps) {
  const active = value === current
  return (
    <label
      className={`block border rounded-md p-3 cursor-pointer transition-colors ${
        active
          ? 'border-stone-900 dark:border-stone-100 bg-stone-50 dark:bg-stone-900'
          : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900'
      }`}
    >
      <input
        type="radio"
        name="setup-mode"
        value={value}
        checked={active}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <div className="font-medium">{title}</div>
      <div className="text-xs text-stone-500 mt-1">{description}</div>
    </label>
  )
}

interface PopulacePickerProps {
  populationRaces: Record<Race, number>
  total: number
  target: number
  popMismatch: boolean
  mode: SetupMode
  onChange: (race: Race, value: number) => void
  onReset: () => void
}

/**
 * Shared per-race population picker. The same +/- UI is used in both modes
 * — only the surrounding text and the validation footer differ. In standard
 * mode the player must hit the scale's target exactly; in custom mode they
 * can pick any non-negative total.
 */
function PopulacePicker({
  populationRaces,
  total,
  target,
  popMismatch,
  mode,
  onChange,
  onReset,
}: PopulacePickerProps) {
  const isCustom = mode === 'custom'
  return (
    <fieldset className={isCustom ? 'border border-stone-300 dark:border-stone-700 rounded-md p-4 bg-[var(--paper-2)]/40' : undefined}>
      <div className="flex items-baseline justify-between mb-2">
        <legend className="text-sm font-medium">Starting populace</legend>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-stone-500 hover:underline"
        >
          {isCustom ? `Reset to ${target} humans` : `Reset to ${target} humans`}
        </button>
      </div>
      <p className="text-xs text-stone-500 mb-3">
        {isCustom
          ? 'Pick any number of starter population units across the races you want on your land. They start unallocated — you place them on areas during your first Spring.'
          : `Allocate ${target} starter population units across the races that should live on your land. They start unallocated — you place them on areas during your first Spring.`}
      </p>
      <div className="space-y-2">
        {RACE_ORDER.map((race) => (
          <div
            key={race}
            className="flex items-center gap-3 border border-stone-200 dark:border-stone-800 rounded-md p-2"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{RACE_LABELS[race]}</div>
              <div className="text-xs text-stone-500 truncate">{RACE_NOTES[race]}</div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onChange(race, (populationRaces[race] ?? 0) - 1)}
                disabled={(populationRaces[race] ?? 0) <= 0}
                aria-label={`Decrease ${RACE_LABELS[race]}`}
                className="w-7 h-7 border border-stone-300 dark:border-stone-700 rounded hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
              >
                -
              </button>
              <input
                type="number"
                min={0}
                value={populationRaces[race]}
                onChange={(e) => onChange(race, Number(e.target.value))}
                className="w-14 rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-center"
                aria-label={`${RACE_LABELS[race]} count`}
              />
              <button
                type="button"
                onClick={() => onChange(race, (populationRaces[race] ?? 0) + 1)}
                aria-label={`Increase ${RACE_LABELS[race]}`}
                className="w-7 h-7 border border-stone-300 dark:border-stone-700 rounded hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className={`mt-2 text-sm ${popMismatch ? 'text-amber-700 dark:text-amber-400' : 'text-stone-500'}`}>
        {isCustom ? (
          <>Total: <strong>{total}</strong></>
        ) : (
          <>
            Total: <strong>{total}</strong> / {target}
            {popMismatch && ` — adjust counts so the sum equals ${target}.`}
          </>
        )}
      </div>
    </fieldset>
  )
}
