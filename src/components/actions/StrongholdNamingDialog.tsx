import { useEffect, useState } from 'react'
import { strongholdDisplayName, type RealmState, type StrongholdState } from '../../rules/state'
import { useUpdateStrongholdNames } from '../../hooks/useUpdateStrongholdNames'

interface Props {
  realm: RealmState
  /**
   * Strongholds to prompt for. Defaults to ALL of the realm's strongholds
   * when omitted — used right after realm creation. Pass a subset for the
   * "rename starter strongholds" affordance.
   */
  strongholds?: StrongholdState[]
  /** Title shown in the header. */
  title?: string
  /** Optional intro copy under the title. */
  description?: string
  onClose: () => void
}

/**
 * Modal that lists strongholds with editable name inputs, pre-filled with
 * the existing name (or the default "{Kind} #N" label when none is set).
 * Used both for the post-creation prompt and for ad-hoc renames from the
 * Strongholds section. Submitting saves all changes in one mutation.
 */
export function StrongholdNamingDialog({
  realm,
  strongholds,
  title = 'Name your strongholds',
  description,
  onClose,
}: Props) {
  const targets = strongholds ?? realm.strongholds
  const update = useUpdateStrongholdNames(realm.id)

  // Seed the input map with each stronghold's current name or its display
  // default. Players can clear an input to use the default later.
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const s of targets) {
      out[s.id] = s.name ?? strongholdDisplayName(s, realm.strongholds)
    }
    return out
  })

  // Re-seed if the modal is re-opened with a different set of targets.
  useEffect(() => {
    setDraft((current) => {
      const next: Record<string, string> = {}
      for (const s of targets) {
        next[s.id] = current[s.id] ?? s.name ?? strongholdDisplayName(s, realm.strongholds)
      }
      return next
    })
  }, [targets, realm.strongholds])

  const submit = async () => {
    try {
      await update.mutateAsync(draft)
      onClose()
    } catch {
      // surfaced via update.error
    }
  }

  // Group by kind so the list reads tidily (all Cities, then Towns, etc.).
  const grouped = new Map<StrongholdState['kind'], StrongholdState[]>()
  for (const s of targets) {
    const list = grouped.get(s.kind) ?? []
    list.push(s)
    grouped.set(s.kind, list)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl">{title}</h3>
          {description && (
            <p className="text-sm text-stone-500 mt-1">{description}</p>
          )}
        </header>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          {[...grouped.entries()].map(([kind, list]) => (
            <div key={kind}>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">
                {kind.replace(/_/g, ' ')}
              </div>
              {list.map((s) => (
                <div key={s.id} className="flex items-center gap-2 mb-2">
                  <label className="text-xs text-stone-400 w-20 shrink-0 font-mono">
                    {strongholdDisplayName(s, realm.strongholds).split(' #')[1]
                      ? '#' + strongholdDisplayName(s, realm.strongholds).split(' #')[1]
                      : ''}
                  </label>
                  <input
                    type="text"
                    value={draft[s.id] ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, [s.id]: e.target.value })
                    }
                    placeholder={strongholdDisplayName(s, realm.strongholds)}
                    className="flex-1 px-2 py-1 text-sm border border-stone-300 dark:border-stone-700 rounded bg-white dark:bg-stone-800"
                  />
                </div>
              ))}
            </div>
          ))}

          {update.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {update.error.message}
            </p>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={update.isPending}
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md font-medium"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={update.isPending}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {update.isPending ? 'Saving…' : 'Save names'}
          </button>
        </footer>
      </div>
    </div>
  )
}
