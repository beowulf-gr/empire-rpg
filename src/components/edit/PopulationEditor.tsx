import { useEffect, useMemo, useState } from 'react'
import type { Race } from '../../types/rules'
import type { PopulationStack, RealmState } from '../../rules/state'

const RACE_ORDER: Race[] = [
  'humans', 'dwarves', 'elves', 'gnomes', 'halflings', 'orcs', 'goblins', 'undead',
]

const RACE_LABELS: Record<Race, string> = {
  humans:    'Humans',
  dwarves:   'Dwarves',
  elves:     'Elves',
  gnomes:    'Gnomes',
  halflings: 'Halflings',
  orcs:      'Orcs',
  goblins:   'Goblins',
  undead:    'Undead',
}

interface Props {
  realm: RealmState
  onSave: (next: RealmState) => void
  pending: boolean
  error: string | null
}

/**
 * Free-form CRUD on PopulationStack rows. The DM can:
 *  - Add a new stack (race + count + home + work)
 *  - Edit any field on an existing stack — including the race, useful for
 *    reclassifying populations after a homebrew event
 *  - Delete a stack outright
 *
 * Stacks with `count <= 0` are filtered out at save time. New stacks get a
 * fresh `crypto.randomUUID()` ID — saveRealm's upsert + delete-not-in-list
 * sequence treats new and existing rows symmetrically.
 */
export function PopulationEditor({ realm, onSave, pending, error }: Props) {
  const [draft, setDraft] = useState<PopulationStack[]>(() =>
    realm.populations.map((p) => ({ ...p })),
  )
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Reset draft when the underlying realm changes (e.g. another mutation
  // invalidated the cache).
  useEffect(() => {
    setDraft(realm.populations.map((p) => ({ ...p })))
  }, [realm.populations])

  const dirty = useMemo(() => stacksDiffer(draft, realm.populations), [draft, realm.populations])

  // Area lookup for the home/work selects.
  const areaOptions = useMemo(
    () =>
      realm.areas.map((a, i) => ({
        id: a.id,
        label: `Area ${i + 1} — ${a.terrain} (row ${a.positionY + 1} col ${a.positionX + 1})`,
      })),
    [realm.areas],
  )

  const updateStack = (id: string, patch: Partial<PopulationStack>) => {
    setDraft((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeStack = (id: string) => {
    setDraft((prev) => prev.filter((s) => s.id !== id))
  }

  const addStack = () => {
    setDraft((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        race: 'humans',
        count: 1,
        homeAreaId: null,
        workAreaId: null,
      },
    ])
  }

  const handleSave = () => {
    if (!dirty || pending) return
    // Filter out 0-count stacks at save time — they represent stacks the
    // DM zeroed out and didn't bother deleting.
    const cleaned = draft.filter((s) => s.count > 0)
    onSave({ ...realm, populations: cleaned })
    setSavedAt(Date.now())
  }

  const handleDiscard = () => setDraft(realm.populations.map((p) => ({ ...p })))

  return (
    <section className="border border-stone-300 dark:border-stone-700 rounded-md p-4 bg-[var(--paper-2)]/40">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-lg font-semibold">Population</h2>
        <span className="text-xs text-[var(--ink-soft)]">
          Stacks with count 0 are dropped on save.
        </span>
      </div>

      {draft.length === 0 ? (
        <p className="text-sm italic text-[var(--ink-soft)] mb-3">
          No population stacks. Click "Add stack" to create one.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {draft.map((stack) => (
            <li
              key={stack.id}
              className="grid grid-cols-1 sm:grid-cols-[10rem_5rem_1fr_1fr_auto] gap-2 items-center border border-stone-200 dark:border-stone-800 rounded-md p-2"
            >
              <select
                value={stack.race}
                onChange={(e) =>
                  updateStack(stack.id, { race: e.target.value as Race })
                }
                className="rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-sm"
                aria-label="Race"
              >
                {RACE_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {RACE_LABELS[r]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={stack.count}
                onChange={(e) =>
                  updateStack(stack.id, {
                    count: Math.max(0, Math.floor(Number(e.target.value))),
                  })
                }
                className="rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-sm text-center"
                aria-label="Count"
              />
              <select
                value={stack.homeAreaId ?? ''}
                onChange={(e) =>
                  updateStack(stack.id, {
                    homeAreaId: e.target.value === '' ? null : e.target.value,
                  })
                }
                className="rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-sm"
                aria-label="Home area"
                title="Where the population lives"
              >
                <option value="">— Home: unallocated —</option>
                {areaOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    Home: {a.label}
                  </option>
                ))}
              </select>
              <select
                value={stack.workAreaId ?? ''}
                onChange={(e) =>
                  updateStack(stack.id, {
                    workAreaId: e.target.value === '' ? null : e.target.value,
                  })
                }
                className="rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-sm"
                aria-label="Work area"
                title="Where the population harvests"
              >
                <option value="">— Work: unallocated —</option>
                {areaOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    Work: {a.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeStack(stack.id)}
                className="text-xs text-[var(--wine)] hover:underline px-1"
                aria-label={`Delete this ${RACE_LABELS[stack.race]} stack`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-4">
        <button
          type="button"
          onClick={addStack}
          className="empire-button-ghost px-3 py-1 rounded-md text-sm"
        >
          + Add stack
        </button>
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
          {pending ? 'Saving…' : 'Save population'}
        </button>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={!dirty || pending}
          className="empire-button-ghost px-4 py-1.5 rounded-md text-sm"
        >
          Discard changes
        </button>
        {!dirty && savedAt && !pending && !error && (
          <span className="text-xs text-[var(--ink-soft)] italic">Saved.</span>
        )}
      </div>
    </section>
  )
}

/**
 * Deep-ish equality check between two PopulationStack arrays. Order matters
 * (we treat reordering as a change so the user can hit "Discard" to restore
 * the original sort).
 */
function stacksDiffer(a: PopulationStack[], b: readonly PopulationStack[]): boolean {
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.race !== y.race ||
      x.count !== y.count ||
      x.homeAreaId !== y.homeAreaId ||
      x.workAreaId !== y.workAreaId
    ) {
      return true
    }
  }
  return false
}
