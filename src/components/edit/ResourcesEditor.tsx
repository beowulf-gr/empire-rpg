import { useEffect, useState } from 'react'
import type { ResourceKey, ResourcePool } from '../../types/rules'
import type { RealmState } from '../../rules/state'

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

interface Props {
  realm: RealmState
  onSave: (next: RealmState) => void
  pending: boolean
  error: string | null
}

/**
 * Free-form resource edit. Pre-populates with the realm's current pool;
 * the player can adjust any value (including arbitrarily large grants for
 * tabletop cheats) and "Save". Negative inputs are clamped to zero —
 * the rules engine assumes non-negative pools everywhere.
 */
export function ResourcesEditor({ realm, onSave, pending, error }: Props) {
  const [draft, setDraft] = useState<ResourcePool>(() => ({ ...realm.resources }))
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // If the underlying realm changes (e.g. another mutation invalidated the
  // cache), reset the draft. The savedAt timestamp picks up the change too
  // so we know the latest save took effect server-side.
  useEffect(() => {
    setDraft({ ...realm.resources })
  }, [realm.resources])

  const setValue = (k: ResourceKey, v: number) => {
    setDraft((prev) => ({ ...prev, [k]: Math.max(0, Math.floor(v)) }))
  }

  const dirty =
    BASE_KEYS.concat(MINERAL_KEYS).some((k) => draft[k] !== realm.resources[k])

  const handleSave = () => {
    if (!dirty || pending) return
    onSave({ ...realm, resources: { ...draft } })
    setSavedAt(Date.now())
  }

  const handleReset = () => setDraft({ ...realm.resources })

  return (
    <section className="border border-stone-300 dark:border-stone-700 rounded-md p-4 bg-[var(--paper-2)]/40">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-lg font-semibold">Resources</h2>
        <span className="text-xs text-[var(--ink-soft)]">
          Negative values clamp to zero.
        </span>
      </div>

      <div className="text-xs text-stone-500 mb-1">Base goods</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {BASE_KEYS.map((k) => (
          <Field key={k} k={k} value={draft[k]} onChange={(v) => setValue(k, v)} />
        ))}
      </div>

      <div className="text-xs text-stone-500 mb-1">Minerals</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        {MINERAL_KEYS.map((k) => (
          <Field key={k} k={k} value={draft[k]} onChange={(v) => setValue(k, v)} />
        ))}
      </div>

      {error && (
        <p className="text-sm text-[var(--rust)] mb-3" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || pending}
          className="empire-button px-4 py-1.5 rounded-md text-sm font-medium"
        >
          {pending ? 'Saving…' : 'Save resources'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={!dirty || pending}
          className="empire-button-ghost px-4 py-1.5 rounded-md text-sm"
        >
          Discard changes
        </button>
        {!dirty && savedAt && !pending && !error && (
          <span className="text-xs text-[var(--ink-soft)] italic">
            Saved.
          </span>
        )}
      </div>
    </section>
  )
}

interface FieldProps {
  k: ResourceKey
  value: number
  onChange: (v: number) => void
}

function Field({ k, value, onChange }: FieldProps) {
  return (
    <label className="flex items-center justify-between border border-stone-200 dark:border-stone-800 rounded-md px-2 py-1.5">
      <span className="text-xs font-medium">{RESOURCE_LABELS[k]}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-1.5 py-0.5 text-sm text-center"
        aria-label={`${RESOURCE_LABELS[k]} amount`}
      />
    </label>
  )
}
