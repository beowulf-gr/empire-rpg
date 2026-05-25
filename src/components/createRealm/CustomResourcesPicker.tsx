import { useMemo } from 'react'
import {
  EMPTY_RESOURCE_POOL,
  TERRAIN_STATS,
  type ResourceKey,
  type ResourcePool,
  type Terrain,
} from '../../types/rules'

/** Display order on screen. Base goods first, then minerals. */
const BASE_KEYS: ResourceKey[] = ['food', 'lumber', 'stone', 'gold']
const MINERAL_KEYS: ResourceKey[] = [
  'copper',
  'iron',
  'silver',
  'gold_metal',
  'mithral',
  'adamantine',
]

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  food:       'Food',
  lumber:     'Lumber',
  stone:      'Stone',
  gold:       'Gold',
  copper:     'Copper',
  iron:       'Iron',
  silver:     'Silver',
  gold_metal: 'Gold ore',
  mithral:    'Mithral',
  adamantine: 'Adamantine',
}

/**
 * Mirrors `computeStarterResources` in the rules engine so we can preview
 * what "Auto" mode will produce for the current terrain layout, and so the
 * "Use the auto values" button can pre-fill the custom inputs sensibly.
 *
 * Keep this in sync with `createDomain.ts → computeStarterResources`.
 */
export function previewAutoResources(terrains: readonly Terrain[]): ResourcePool {
  const pool: ResourcePool = { ...EMPTY_RESOURCE_POOL }
  for (const terrain of terrains) {
    const prod = TERRAIN_STATS[terrain].production
    if (prod.food !== undefined) pool.food += 1
    if (prod.lumber !== undefined) pool.lumber += 1
    if (prod.gold !== undefined) pool.gold += 1
    if (terrain === 'hills' || terrain === 'mountains') pool.stone += 1
  }
  return pool
}

interface Props {
  /** Current resource mode. */
  mode: 'auto' | 'custom'
  /** Current custom values (used when mode === 'custom'). */
  custom: ResourcePool
  /** Terrain list — used for the auto preview. */
  terrains: readonly Terrain[]
  onModeChange: (mode: 'auto' | 'custom') => void
  onCustomChange: (next: ResourcePool) => void
}

export function CustomResourcesPicker({
  mode,
  custom,
  terrains,
  onModeChange,
  onCustomChange,
}: Props) {
  const auto = useMemo(() => previewAutoResources(terrains), [terrains])

  const updateResource = (key: ResourceKey, value: number) => {
    onCustomChange({
      ...custom,
      [key]: Math.max(0, Math.floor(value)),
    })
  }

  const fillFromAuto = () => onCustomChange(auto)
  const clearAll = () => onCustomChange({ ...EMPTY_RESOURCE_POOL })

  return (
    <fieldset className="border border-stone-300 dark:border-stone-700 rounded-md p-4 bg-[var(--paper-2)]/40">
      <legend className="text-sm font-medium px-1">Starting resources</legend>

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <ModeOption
          value="auto"
          current={mode}
          onSelect={onModeChange}
          title="Auto (per rules)"
          description={`The rules engine computes the pool from your terrain. Preview: ${formatPoolPreview(auto)}.`}
        />
        <ModeOption
          value="custom"
          current={mode}
          onSelect={onModeChange}
          title="Custom"
          description="Specify the exact amount of every resource your realm starts with."
        />
      </div>

      {mode === 'custom' && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button
              type="button"
              onClick={fillFromAuto}
              className="text-xs text-[var(--wine)] hover:underline"
            >
              Fill from auto preview
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-stone-500 hover:underline"
            >
              Clear all
            </button>
          </div>

          <div className="text-xs text-stone-500 mb-1">Base goods</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {BASE_KEYS.map((k) => (
              <ResourceField
                key={k}
                k={k}
                value={custom[k]}
                onChange={(v) => updateResource(k, v)}
              />
            ))}
          </div>

          <div className="text-xs text-stone-500 mb-1">Minerals</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MINERAL_KEYS.map((k) => (
              <ResourceField
                key={k}
                k={k}
                value={custom[k]}
                onChange={(v) => updateResource(k, v)}
              />
            ))}
          </div>
        </div>
      )}

      {mode === 'auto' && (
        <p className="text-xs text-stone-500 italic">
          The engine grants 1 of each producible resource per area that
          produces it, plus 1 stone per hills or mountains tile. Your current
          terrain mix would yield: {formatPoolPreview(auto)}.
        </p>
      )}
    </fieldset>
  )
}

interface ResourceFieldProps {
  k: ResourceKey
  value: number
  onChange: (v: number) => void
}

function ResourceField({ k, value, onChange }: ResourceFieldProps) {
  return (
    <label className="flex items-center justify-between border border-stone-200 dark:border-stone-800 rounded-md px-2 py-1.5">
      <span className="text-xs font-medium">{RESOURCE_LABELS[k]}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-1.5 py-0.5 text-sm text-center"
        aria-label={`${RESOURCE_LABELS[k]} starting amount`}
      />
    </label>
  )
}

interface ModeOptionProps {
  value: 'auto' | 'custom'
  current: 'auto' | 'custom'
  onSelect: (v: 'auto' | 'custom') => void
  title: string
  description: string
}

function ModeOption({ value, current, onSelect, title, description }: ModeOptionProps) {
  const active = value === current
  return (
    <label
      className={`block border rounded-md p-2.5 cursor-pointer transition-colors ${
        active
          ? 'border-stone-900 dark:border-stone-100 bg-stone-50 dark:bg-stone-900'
          : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900'
      }`}
    >
      <input
        type="radio"
        name="resources-mode"
        value={value}
        checked={active}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-stone-500 mt-0.5">{description}</div>
    </label>
  )
}

/** Compact, human-readable rendering of non-zero entries in the pool. */
function formatPoolPreview(pool: ResourcePool): string {
  const parts: string[] = []
  for (const k of [...BASE_KEYS, ...MINERAL_KEYS]) {
    if (pool[k] > 0) parts.push(`${pool[k]} ${RESOURCE_LABELS[k].toLowerCase()}`)
  }
  return parts.length ? parts.join(', ') : 'nothing'
}
