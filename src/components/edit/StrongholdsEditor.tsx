import { useEffect, useMemo, useState } from 'react'
import type { StrongholdKind } from '../../types/rules'
import type { RealmState, StrongholdState } from '../../rules/state'

// ============================================================
// Stronghold classification — mirrors construction.ts
// ============================================================

const SETTLEMENT_KINDS: StrongholdKind[] = ['village', 'town', 'city']
const FORTIFICATION_KINDS: StrongholdKind[] = ['keep', 'castle', 'citadel']
const ADDON_KINDS = new Set<StrongholdKind>([
  'wall',
  'marketplace',
  'port',
  'craftsmens_guild',
  'wizards_academy',
  'grand_temple',
])

const STRONGHOLD_ORDER: StrongholdKind[] = [
  'village', 'town', 'city',
  'keep', 'castle', 'citadel',
  'mine',
  'port', 'wall', 'marketplace', 'craftsmens_guild', 'wizards_academy', 'grand_temple',
]

const STRONGHOLD_LABELS: Record<StrongholdKind, string> = {
  village:          'Village',
  town:             'Town',
  city:             'City',
  keep:             'Keep',
  castle:           'Castle',
  citadel:          'Citadel',
  mine:             'Mine',
  port:             'Port',
  wall:             'Wall',
  marketplace:      'Marketplace',
  craftsmens_guild: "Craftsmen's Guild",
  wizards_academy:  "Wizards' Academy",
  grand_temple:     'Grand Temple',
}

function strongholdGroup(kind: StrongholdKind): string {
  if (SETTLEMENT_KINDS.includes(kind)) return 'Settlement'
  if (FORTIFICATION_KINDS.includes(kind)) return 'Fortification'
  if (kind === 'mine') return 'Mine'
  return 'Add-on'
}

// ============================================================
// Component
// ============================================================

interface Props {
  realm: RealmState
  onSave: (next: RealmState) => void
  pending: boolean
  error: string | null
}

/**
 * Free-form CRUD on strongholds. The DM can:
 *  - Move an existing stronghold to a different area
 *  - Change its parent (for add-ons) or mine mode (for mines)
 *  - Delete a stronghold, cascading children via parentStrongholdId
 *  - Add a brand new stronghold of any kind, with parent if an add-on
 *
 * Kind is fixed at creation — to change a stronghold's kind, delete + add.
 * This avoids cascade weirdness (e.g. turning a Keep into a Wall would
 * orphan its add-ons mid-edit).
 */
export function StrongholdsEditor({ realm, onSave, pending, error }: Props) {
  const [draft, setDraft] = useState<StrongholdState[]>(() =>
    realm.strongholds.map((s) => ({ ...s })),
  )
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    setDraft(realm.strongholds.map((s) => ({ ...s })))
  }, [realm.strongholds])

  const dirty = useMemo(() => listsDiffer(draft, realm.strongholds), [draft, realm.strongholds])

  const areaLabel = useMemo(() => {
    const map = new Map<string, string>()
    realm.areas.forEach((a, i) => {
      map.set(a.id, `Area ${i + 1} — ${a.terrain} (${a.positionX}, ${a.positionY})`)
    })
    return map
  }, [realm.areas])

  // Add-stronghold form state
  const [addKind, setAddKind] = useState<StrongholdKind>('keep')
  const [addAreaId, setAddAreaId] = useState<string>(realm.areas[0]?.id ?? '')
  const [addParentId, setAddParentId] = useState<string>('')
  const [addMineMode, setAddMineMode] = useState<'stone' | 'mineral'>('stone')

  const addOnNeedsParent = ADDON_KINDS.has(addKind)
  const parentCandidates = draft.filter(
    (s) => s.areaId === addAreaId && !ADDON_KINDS.has(s.kind),
  )

  const updateStronghold = (id: string, patch: Partial<StrongholdState>) => {
    setDraft((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeStronghold = (id: string) => {
    setDraft((prev) => {
      // Cascade: drop the stronghold + any descendant via parentStrongholdId
      const ids = new Set<string>([id])
      let grew = true
      while (grew) {
        grew = false
        for (const s of prev) {
          if (s.parentStrongholdId && ids.has(s.parentStrongholdId) && !ids.has(s.id)) {
            ids.add(s.id)
            grew = true
          }
        }
      }
      return prev.filter((s) => !ids.has(s.id))
    })
  }

  const addStronghold = () => {
    if (!addAreaId) return
    if (addOnNeedsParent && !addParentId) return
    setDraft((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        areaId: addAreaId,
        kind: addKind,
        parentStrongholdId: addOnNeedsParent ? addParentId : null,
        mineResourceType: addKind === 'mine' ? addMineMode : null,
        source: 'homebrew',
      },
    ])
    if (addOnNeedsParent) setAddParentId('')
  }

  const handleSave = () => {
    if (!dirty || pending) return
    onSave({ ...realm, strongholds: draft })
    setSavedAt(Date.now())
  }
  const handleDiscard = () => setDraft(realm.strongholds.map((s) => ({ ...s })))

  return (
    <section className="border border-stone-300 dark:border-stone-700 rounded-md p-4 bg-[var(--paper-2)]/40">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-lg font-semibold">Strongholds</h2>
        <span className="text-xs text-[var(--ink-soft)]">
          {draft.length} {draft.length === 1 ? 'stronghold' : 'strongholds'}
        </span>
      </div>

      {draft.length === 0 ? (
        <p className="text-sm italic text-[var(--ink-soft)] mb-3">
          No strongholds. Use the form below to add one.
        </p>
      ) : (
        <ul className="space-y-1.5 mb-4">
          {draft.map((s) => {
            const parentLabel = s.parentStrongholdId
              ? STRONGHOLD_LABELS[
                  draft.find((p) => p.id === s.parentStrongholdId)?.kind ?? 'keep'
                ]
              : null
            // Only allow parent re-selection from siblings on the same area.
            const eligibleParents = draft.filter(
              (p) => p.id !== s.id && p.areaId === s.areaId && !ADDON_KINDS.has(p.kind),
            )
            return (
              <li
                key={s.id}
                className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_1fr_auto] gap-2 items-center border border-stone-200 dark:border-stone-800 rounded-md p-2"
              >
                <span className="text-sm">
                  <span className="font-medium">{STRONGHOLD_LABELS[s.kind]}</span>
                  <span className="text-xs text-stone-500 ml-1">
                    ({strongholdGroup(s.kind)})
                  </span>
                </span>
                <select
                  value={s.areaId}
                  onChange={(e) => {
                    // Moving to a new area may invalidate the parent link —
                    // null it out so the user picks a fresh parent on the
                    // new area (the database FK doesn't enforce
                    // same-area but the rules engine assumes it).
                    updateStronghold(s.id, {
                      areaId: e.target.value,
                      parentStrongholdId: null,
                    })
                  }}
                  className="rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-sm"
                  aria-label="Area"
                >
                  {realm.areas.map((a, i) => (
                    <option key={a.id} value={a.id}>
                      Area {i + 1} — {a.terrain} ({a.positionX}, {a.positionY})
                    </option>
                  ))}
                </select>
                {ADDON_KINDS.has(s.kind) ? (
                  <select
                    value={s.parentStrongholdId ?? ''}
                    onChange={(e) =>
                      updateStronghold(s.id, {
                        parentStrongholdId: e.target.value || null,
                      })
                    }
                    className="rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-sm"
                    aria-label="Parent stronghold"
                    title="Add-ons normally attach to a settlement or fortification on the same tile"
                  >
                    <option value="">— no parent —</option>
                    {eligibleParents.map((p) => (
                      <option key={p.id} value={p.id}>
                        Parent: {STRONGHOLD_LABELS[p.kind]}
                      </option>
                    ))}
                  </select>
                ) : s.kind === 'mine' ? (
                  <select
                    value={s.mineResourceType ?? 'stone'}
                    onChange={(e) =>
                      updateStronghold(s.id, {
                        mineResourceType: e.target.value as 'stone' | 'mineral',
                      })
                    }
                    className="rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-sm"
                    aria-label="Mine mode"
                  >
                    <option value="stone">Stone</option>
                    <option value="mineral">Mineral</option>
                  </select>
                ) : (
                  <span className="text-xs text-stone-500 italic">
                    {parentLabel ? `in ${parentLabel}` : ''}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeStronghold(s.id)}
                  className="text-xs text-[var(--wine)] hover:underline px-1"
                  title="Cascades to any improvements pointing at this stronghold"
                >
                  Delete
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Add stronghold form */}
      <div className="border border-stone-200 dark:border-stone-800 rounded-md p-2.5 bg-stone-50/50 dark:bg-stone-900/50 mb-3">
        <div className="text-xs text-stone-500 mb-2">Add a stronghold</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
          <label className="block">
            <span className="text-xs text-stone-500">Kind</span>
            <select
              value={addKind}
              onChange={(e) => {
                const k = e.target.value as StrongholdKind
                setAddKind(k)
                if (!ADDON_KINDS.has(k)) setAddParentId('')
              }}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5 text-sm"
            >
              {STRONGHOLD_ORDER.map((k) => (
                <option key={k} value={k}>
                  {STRONGHOLD_LABELS[k]} — {strongholdGroup(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">Area</span>
            <select
              value={addAreaId}
              onChange={(e) => {
                setAddAreaId(e.target.value)
                setAddParentId('')
              }}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5 text-sm"
            >
              {realm.areas.length === 0 && <option value="">No areas</option>}
              {realm.areas.map((a, i) => (
                <option key={a.id} value={a.id}>
                  Area {i + 1} — {a.terrain} ({a.positionX}, {a.positionY})
                </option>
              ))}
            </select>
          </label>
          {addOnNeedsParent && (
            <label className="block">
              <span className="text-xs text-stone-500">Parent</span>
              <select
                value={addParentId}
                onChange={(e) => setAddParentId(e.target.value)}
                disabled={parentCandidates.length === 0}
                className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5 text-sm disabled:opacity-60"
              >
                <option value="">— pick a parent —</option>
                {parentCandidates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {STRONGHOLD_LABELS[s.kind]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {addKind === 'mine' && (
            <label className="block">
              <span className="text-xs text-stone-500">Mode</span>
              <select
                value={addMineMode}
                onChange={(e) => setAddMineMode(e.target.value as 'stone' | 'mineral')}
                className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5 text-sm"
              >
                <option value="stone">Stone</option>
                <option value="mineral">Mineral</option>
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={addStronghold}
            disabled={!addAreaId || (addOnNeedsParent && !addParentId)}
            className="empire-button px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add {STRONGHOLD_LABELS[addKind]}
          </button>
        </div>
        {addOnNeedsParent && parentCandidates.length === 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5">
            No eligible parent on this tile — place a Village / Town / City /
            Keep / Castle / Citadel first.
          </p>
        )}
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
          {pending ? 'Saving…' : 'Save strongholds'}
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

      {/* Tiny inert helper showing the per-area count + which areas have
          orphan add-ons (parent on a different area). */}
      <OrphanReport draft={draft} areaLabel={areaLabel} />
    </section>
  )
}

/**
 * Surface any add-ons whose parent now lives on a different tile. The
 * database doesn't enforce same-area, but the rules engine assumes it —
 * so flag the cases for the DM to fix or accept.
 */
function OrphanReport({
  draft,
  areaLabel,
}: {
  draft: StrongholdState[]
  areaLabel: Map<string, string>
}) {
  const idToSh = new Map(draft.map((s) => [s.id, s]))
  const orphans = draft.filter((s) => {
    if (!ADDON_KINDS.has(s.kind) || !s.parentStrongholdId) return false
    const parent = idToSh.get(s.parentStrongholdId)
    return parent && parent.areaId !== s.areaId
  })
  if (orphans.length === 0) return null
  return (
    <div className="mt-3 text-xs text-amber-700 dark:text-amber-400">
      ⚠ {orphans.length} add-on{orphans.length === 1 ? '' : 's'} sit on a
      different tile than {orphans.length === 1 ? 'its parent' : 'their parents'}.
      Engine actions assume same-area; consider moving or re-parenting.
      {orphans.slice(0, 3).map((o) => {
        const parent = idToSh.get(o.parentStrongholdId!)
        return (
          <div key={o.id} className="mt-1">
            • {STRONGHOLD_LABELS[o.kind]} on {areaLabel.get(o.areaId) ?? '?'}
            {parent && (
              <>
                {' '}— parent is on {areaLabel.get(parent.areaId) ?? '?'}
              </>
            )}
          </div>
        )
      })}
      {orphans.length > 3 && (
        <div className="mt-1 italic">…and {orphans.length - 3} more.</div>
      )}
    </div>
  )
}

/** Shallow per-field equality on stronghold arrays. */
function listsDiffer(
  a: StrongholdState[],
  b: readonly StrongholdState[],
): boolean {
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.kind !== y.kind ||
      x.areaId !== y.areaId ||
      x.parentStrongholdId !== y.parentStrongholdId ||
      x.mineResourceType !== y.mineResourceType ||
      x.source !== y.source
    ) {
      return true
    }
  }
  return false
}
