import { useState } from 'react'
import type { OriginStory, RealmState } from '../rules/state'
import { useUpdateOriginStory } from '../hooks/useUpdateOriginStory'

interface Props {
  realm: RealmState
  /**
   * Called when the user closes the dialog (Save, Skip, or Cancel). The
   * parent decides what to do after (typically: clear a query param so the
   * dialog doesn't re-open on refresh).
   */
  onClose: () => void
  /** Title shown in the header. Defaults to a creation-flow phrasing. */
  title?: string
  /** Optional intro copy under the title. */
  description?: string
}

const FIELDS: ReadonlyArray<{
  key: keyof OriginStory
  label: string
  placeholder: string
}> = [
  {
    key: 'founding',
    label: 'How was your realm founded?',
    placeholder:
      'e.g. Founded after the Long Winter when the Stoneheart clan claimed the foothills.',
  },
  {
    key: 'rulerBackground',
    label: 'What kind of ruler are you?',
    placeholder:
      'e.g. A young knight-errant who inherited the throne after the old king fell in battle.',
  },
  {
    key: 'notableCircumstances',
    label: 'Anything notable about the realm or its situation?',
    placeholder:
      'e.g. The realm sits atop ancient dwarven ruins. Old gold lies buried below.',
  },
]

/**
 * Optional second post-creation modal. Lets the player jot down a prologue
 * for their realm — used later by the "Tell our story" feature to seed an
 * LLM-generated chronicle. Every field is optional and Skip leaves
 * originStory NULL.
 */
export function OriginStoryDialog({
  realm,
  onClose,
  title = 'Tell us about your realm',
  description = 'Optional — used only if you later ask Empire to "Tell our story." Leave any field blank to skip it.',
}: Props) {
  const update = useUpdateOriginStory(realm.id)

  const [draft, setDraft] = useState<Record<keyof OriginStory, string>>({
    founding: realm.originStory?.founding ?? '',
    rulerBackground: realm.originStory?.rulerBackground ?? '',
    notableCircumstances: realm.originStory?.notableCircumstances ?? '',
  })

  const setField = (key: keyof OriginStory, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const save = async () => {
    // Build the OriginStory object — empty strings become null. Serializer
    // in realmIo will also normalise, but this keeps cache consistent.
    const next: OriginStory = {
      founding: draft.founding.trim() || null,
      rulerBackground: draft.rulerBackground.trim() || null,
      notableCircumstances: draft.notableCircumstances.trim() || null,
    }
    const allEmpty = !next.founding && !next.rulerBackground && !next.notableCircumstances
    try {
      await update.mutateAsync(allEmpty ? null : next)
      onClose()
    } catch {
      // surfaced via update.error
    }
  }

  const skip = async () => {
    // Skipping in the creation flow shouldn't overwrite anything the player
    // may have already filled in via the manual "Edit prologue" affordance
    // we'll add later. So Skip is just close — no save.
    onClose()
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
                htmlFor={`origin-story-${field.key}`}
                className="block text-sm font-medium mb-1"
              >
                {field.label}
              </label>
              <textarea
                id={`origin-story-${field.key}`}
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
            onClick={skip}
            disabled={update.isPending}
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md font-medium"
          >
            Skip
          </button>
          <button
            onClick={save}
            disabled={update.isPending}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {update.isPending ? 'Saving...' : 'Save prologue'}
          </button>
        </footer>
      </div>
    </div>
  )
}
