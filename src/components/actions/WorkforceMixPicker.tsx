import { useState } from 'react'
import type { Race } from '../../types/rules'
import type { RealmState } from '../../rules/state'
import { idlePopulationByRace } from '../../rules/actions/populationCommit'

interface Props {
  realm: RealmState
  /** Total population the action requires; the mix must sum to this. */
  required: number
  /** Current mix; undefined = auto-pick (the engine's default). */
  value: Partial<Record<Race, number>> | undefined
  onChange: (mix: Partial<Record<Race, number>> | undefined) => void
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

const RACE_ORDER: Race[] = [
  'humans', 'dwarves', 'elves', 'gnomes', 'halflings', 'orcs', 'goblins', 'undead',
]

/**
 * Collapsible "Customise workforce" panel for construction / production
 * actions. When collapsed, the engine auto-picks from the idle pool (current
 * behaviour). When expanded and the player sets non-zero counts, the parent
 * panel posts `value` through as `raceMix` to the engine.
 *
 * The component validates locally:
 *   - Each race count is clamped to [0, that race's idle count]
 *   - The total must match `required` before the parent enables submit
 *
 * Returns `undefined` when expanded but the mix is all-zero (treated as
 * "I changed my mind; auto-pick anyway"). Returns the partial record when
 * any race has a positive count.
 */
export function WorkforceMixPicker({ realm, required, value, onChange }: Props) {
  const idle = idlePopulationByRace(realm)
  const idleRaces = RACE_ORDER.filter((r) => (idle[r] ?? 0) > 0)
  const [expanded, setExpanded] = useState(value !== undefined)

  const mix = value ?? {}
  const total = RACE_ORDER.reduce((s, r) => s + (mix[r] ?? 0), 0)
  const mismatch = total !== required

  const toggle = () => {
    if (expanded) {
      onChange(undefined) // collapsing → auto-pick
      setExpanded(false)
    } else {
      setExpanded(true)
      // Seed with all-zero so the parent sees an empty mix; the form lights up
      // the mismatch warning until the player allocates.
      onChange({})
    }
  }

  const update = (race: Race, n: number) => {
    const available = idle[race] ?? 0
    const clamped = Math.max(0, Math.min(available, Math.floor(n)))
    const next = { ...mix, [race]: clamped }
    onChange(next)
  }

  if (idleRaces.length <= 1) {
    // Only one race in the idle pool — picker would be pointless. Skip silently.
    return null
  }

  return (
    <div className="border border-stone-200 dark:border-stone-800 rounded-md">
      <button
        type="button"
        onClick={toggle}
        className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-900"
      >
        <span>
          Customise workforce
          {expanded && (
            <span className={`ml-2 text-xs ${mismatch ? 'text-amber-600 dark:text-amber-400' : 'text-stone-500'}`}>
              {total}/{required}{mismatch ? ' — sum must equal ' + required : ' ✓'}
            </span>
          )}
          {!expanded && <span className="ml-2 text-xs text-stone-500">(auto-pick from idle)</span>}
        </span>
        <span className="text-xs text-stone-500">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1">
          <p className="text-xs text-stone-500 mb-2">
            Pick exactly {required} worker{required === 1 ? '' : 's'} from your idle pool.
          </p>
          {idleRaces.map((race) => {
            const available = idle[race] ?? 0
            const v = mix[race] ?? 0
            return (
              <div key={race} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">
                  {RACE_LABEL[race]}{' '}
                  <span className="text-xs text-stone-500">(idle: {available})</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => update(race, v - 1)}
                    disabled={v <= 0}
                    aria-label={`Decrease ${RACE_LABEL[race]}`}
                    className="w-6 h-6 border border-stone-300 dark:border-stone-700 rounded hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={available}
                    value={v}
                    onChange={(e) => update(race, Number(e.target.value))}
                    className="w-12 text-center rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-1 py-0.5"
                    aria-label={`${RACE_LABEL[race]} contributing to workforce`}
                  />
                  <button
                    type="button"
                    onClick={() => update(race, v + 1)}
                    disabled={v >= available}
                    aria-label={`Increase ${RACE_LABEL[race]}`}
                    className="w-6 h-6 border border-stone-300 dark:border-stone-700 rounded hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Validates a workforce mix from the picker against the action's required
 * population. Returns true when:
 *   - `mix` is undefined (auto-pick — always valid)
 *   - `mix` is provided AND its values are all within their idle limits
 *     AND its sum exactly equals `required`
 */
export function isWorkforceMixValid(
  realm: RealmState,
  mix: Partial<Record<Race, number>> | undefined,
  required: number,
): boolean {
  if (mix === undefined) return true
  let total = 0
  const idle = idlePopulationByRace(realm)
  for (const [race, n] of Object.entries(mix) as [Race, number | undefined][]) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return false
    const v = Math.floor(n)
    if (v > (idle[race] ?? 0)) return false
    total += v
  }
  return total === required
}
