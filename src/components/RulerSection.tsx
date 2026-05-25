import { useState } from 'react'
import { abilityMod, type RealmState, type RulerStats } from '../rules/state'
import { useUpdateRuler } from '../hooks/useUpdateRuler'
import { ImageUpload } from './ImageUpload'
import {
  useRemoveRealmImage,
  useUploadRealmImage,
} from '../hooks/useUploadRealmImage'
import { SectionIcon } from './SectionIcon'

interface Props {
  realm: RealmState
}

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

const ABILITY_FIELDS: { key: keyof Pick<RulerStats, 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'>; short: string; label: string }[] = [
  { key: 'strength',     short: 'STR', label: 'Strength' },
  { key: 'dexterity',    short: 'DEX', label: 'Dexterity' },
  { key: 'constitution', short: 'CON', label: 'Constitution' },
  { key: 'intelligence', short: 'INT', label: 'Intelligence' },
  { key: 'wisdom',       short: 'WIS', label: 'Wisdom' },
  { key: 'charisma',     short: 'CHA', label: 'Charisma' },
]

/**
 * The realm-page card that shows the player character's name + stats in a
 * character-sheet style (ability scores with their derived modifiers in
 * parentheses, plus the two skill totals that drive minister-vacancy checks).
 * Includes an Edit button that opens a modal for tweaking the stats later.
 */
export function RulerSection({ realm }: Props) {
  const [editing, setEditing] = useState(false)
  const r = realm.ruler
  const uploadImage = useUploadRealmImage()
  const removeImage = useRemoveRealmImage()
  const portraitPending =
    (uploadImage.isPending && uploadImage.variables?.kind === 'portrait') ||
    (removeImage.isPending && removeImage.variables?.kind === 'portrait')
  const portraitError =
    uploadImage.error && uploadImage.variables?.kind === 'portrait'
      ? uploadImage.error.message
      : removeImage.error && removeImage.variables?.kind === 'portrait'
        ? removeImage.error.message
        : null

  return (
    <section className="mb-6 border border-stone-200 dark:border-stone-800 rounded-lg p-4">
      <header className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-lg font-serif font-semibold flex items-center gap-2">
            <SectionIcon name="ruler" />
            Ruler
          </h2>
          <p className="text-sm text-stone-500">
            <span className="font-medium text-stone-700 dark:text-stone-300">{r.name}</span>
            <span className="ml-2">covers any vacant minister role personally (-2 circumstance penalty).</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-stone-500 hover:underline"
        >
          Edit
        </button>
      </header>

      {/* Portrait on the left, stat block on the right. Stacks vertically
          on narrow screens — portrait first so the layout always begins
          with the visual anchor. */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="shrink-0 flex justify-center sm:justify-start">
          <ImageUpload
            currentUrl={realm.rulerPortraitUrl}
            onUpload={(file) =>
              uploadImage.mutate({
                realmId: realm.id,
                ownerId: realm.ownerId,
                kind: 'portrait',
                file,
              })
            }
            onRemove={() =>
              removeImage.mutate({ realmId: realm.id, kind: 'portrait' })
            }
            pending={portraitPending}
            error={portraitError}
            shape="portrait"
            placeholderLabel="Add ruler portrait"
            alt={`Portrait of ${r.name}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
            {ABILITY_FIELDS.map((f) => {
              const score = r[f.key] as number
              const mod = abilityMod(score)
              return (
                <div
                  key={f.key}
                  className="text-center border border-stone-200 dark:border-stone-800 rounded-md p-2"
                >
                  <div className="text-[10px] uppercase tracking-wide text-stone-500">{f.short}</div>
                  <div className="font-mono text-lg leading-tight">{score}</div>
                  <div className="font-mono text-xs text-stone-500">({fmtMod(mod)})</div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="border border-stone-200 dark:border-stone-800 rounded-md p-2 flex items-baseline justify-between">
              <span className="text-stone-500">Diplomacy</span>
              <span className="font-mono">{fmtMod(r.diplomacy)}</span>
            </div>
            <div className="border border-stone-200 dark:border-stone-800 rounded-md p-2 flex items-baseline justify-between">
              <span className="text-stone-500">Knowledge (economics)</span>
              <span className="font-mono">{fmtMod(r.knowledgeEconomics)}</span>
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <EditRulerModal
          realm={realm}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  )
}

interface EditProps {
  realm: RealmState
  onClose: () => void
}

function EditRulerModal({ realm, onClose }: EditProps) {
  const [draft, setDraft] = useState<RulerStats>({ ...realm.ruler })
  const update = useUpdateRuler(realm.id)

  const updateAbility = (key: keyof RulerStats, value: number) => {
    setDraft((prev) => ({ ...prev, [key]: Math.max(1, Math.floor(value)) }))
  }

  const submit = async () => {
    const payload: RulerStats = { ...draft, name: draft.name.trim() || 'The Ruler' }
    try {
      await update.mutateAsync(payload)
      onClose()
    } catch {
      /* surfaced via update.error */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl">Edit ruler</h3>
        </header>

        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="text-sm">Ruler name</span>
            <input
              type="text"
              maxLength={64}
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ABILITY_FIELDS.map((f) => {
              const score = draft[f.key] as number
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
                    onChange={(e) => updateAbility(f.key, Number(e.target.value))}
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
                <span className="ml-2 text-stone-500">(no General)</span>
              </span>
              <input
                type="number"
                value={draft.diplomacy}
                onChange={(e) => setDraft((prev) => ({ ...prev, diplomacy: Math.floor(Number(e.target.value)) }))}
                className="w-14 rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-center"
                aria-label="Diplomacy total"
              />
            </label>
            <label className="border border-stone-200 dark:border-stone-800 rounded-md p-2 flex items-center justify-between">
              <span className="text-xs">
                <span className="font-medium">Knowledge (econ.)</span>
                <span className="ml-2 text-stone-500">(no Treasurer)</span>
              </span>
              <input
                type="number"
                value={draft.knowledgeEconomics}
                onChange={(e) => setDraft((prev) => ({ ...prev, knowledgeEconomics: Math.floor(Number(e.target.value)) }))}
                className="w-14 rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-center"
                aria-label="Knowledge (economics) total"
              />
            </label>
          </div>

          {update.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {update.error.message}
            </p>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={update.isPending}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
