import { useState } from 'react'
import type { EndingStory, RealmState } from '../rules/state'
import { useUpdateEndingStory } from '../hooks/useUpdateEndingStory'

interface Props {
  realm: RealmState
  onClose: () => void
  /**
   * Called after a successful save, in addition to onClose. Used by the
   * "Tell our story" flow to chain the LLM call once the ending story is
   * persisted. Not invoked on Cancel.
   */
  onSaved?: () => void
  /** Title shown in the header. */
  title?: string
  /** Optional intro copy under the title. */
  description?: string
}

const FIELDS: ReadonlyArray<{
  key: keyof EndingStory
  label: string
  placeholder: string
}> = [
  {
    key: 'outcome',
    label: 'How did your realm\'s story end?',
    placeholder:
      'e.g. Conquered all its enemies and became the greatest in the land. / Ransacked by barbarians and swept away completely. / The ruler abdicated to retire among the stars.',
  },
  {
    key: 'finalNote',
    label: 'Any final note or epilogue you want included?',
    placeholder:
      'e.g. A festival is still held every year in honor of the founders. / Only ruins remain where the capital once stood.',
  },
]

/**
 * Modal that captures the player's epilogue when they choose to "finalize"
 * a chronicle. Sibling of OriginStoryDialog. All fields are optional; if
 * the player saves with everything blank we persist NULL.
 */
export function EndingStoryDialog({
  realm,
  onClose,
  onSaved,
  title = 'How did it end?',
  description = 'Optional — used only when Empire generates your chronicle. Leave blank fields you\'d rather not pin down.',
}: Props) {
  const update = useUpdateEndingStory(realm.id)

  const [draft, setDraft] = useState<Record<keyof EndingStory, string>>({
    outcome: realm.endingStory?.outcome ?? '',
    finalNote: realm.endingStory?.finalNote ?? '',
  })

  const setField = (key: keyof EndingStory, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const save = async () => {
    const next: EndingStory = {
      outcome: draft.outcome.trim() || null,
      finalNote: draft.finalNote.trim() || null,
    }
    const allEmpty = !next.outcome && !next.finalNote
    try {
      await update.mutateAsync(allEmpty ? null : next)
      // When onSaved is supplied the parent owns the next-step transition
      // (e.g. opening StoryGenerationDialog). Calling onClose too would
      // race with that transition and snap the stage back to idle.
      if (onSaved) onSaved()
      else onClose()
    } catch {
      // surfaced via update.error
    }
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

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label
                htmlFor={`ending-story-${field.key}`}
                className="block text-sm font-medium mb-1"
              >
                {field.label}
              </label>
              <textarea
                id={`ending-story-${field.key}`}
                rows={3}
                value={draft[field.key]}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-2 py-1 text-sm border border-stone-300 dark:border-stone-700 rounded bg-white dark:bg-stone-800 resize-y"
              />
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
            onClick={save}
            disabled={update.isPending}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {update.isPending ? 'Saving...' : 'Save epilogue'}
          </button>
        </footer>
      </div>
    </div>
  )
}
