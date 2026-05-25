import { useEffect, useMemo, useState } from 'react'
import type { Terrain } from '../../types/rules'
import type { AreaState, RealmState } from '../../rules/state'

const TERRAIN_ORDER: Terrain[] = [
  'plains', 'forest', 'hills', 'mountains', 'water', 'swamp', 'ruins', 'wasteland',
]

const TERRAIN_LABELS: Record<Terrain, string> = {
  plains:    'Plains',
  forest:    'Forest',
  hills:     'Hills',
  mountains: 'Mountains',
  water:     'Water',
  swamp:     'Swamp',
  ruins:     'Ruins',
  wasteland: 'Wasteland',
}

interface Props {
  realm: RealmState
  onSave: (next: RealmState) => void
  pending: boolean
  error: string | null
}

/**
 * Free-form edit of the realm's land areas. The DM can:
 *  - Change the terrain of any existing area
 *  - Delete an area — automatically cascades to roads on it, strongholds
 *    on it (and their improvements via parent-FK CASCADE in the DB), and
 *    population refs (home/work nulled)
 *  - Add a new area at a chosen (x,y) position with a chosen terrain
 *
 * Positions of existing areas are read-only — to move an area, delete it
 * and add a fresh one at the new spot. Simplifies validation; the
 * use-case is unusual enough that this isn't a real ergonomics loss.
 */
export function AreasEditor({ realm, onSave, pending, error }: Props) {
  const [draft, setDraft] = useState<RealmState>(realm)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Reset when the underlying realm changes (cache invalidation).
  useEffect(() => {
    setDraft(realm)
    setNewX(nextFreePosition(realm).x)
    setNewY(nextFreePosition(realm).y)
  }, [realm])

  // Add-form state — held outside the draft to avoid mixing UI controls
  // with the saved data model.
  const initialFree = useMemo(() => nextFreePosition(realm), [realm])
  const [newTerrain, setNewTerrain] = useState<Terrain>('plains')
  const [newX, setNewX] = useState<number>(initialFree.x)
  const [newY, setNewY] = useState<number>(initialFree.y)

  const dirty = useMemo(() => realmsDiffer(draft, realm), [draft, realm])

  const updateTerrain = (areaId: string, terrain: Terrain) => {
    setDraft((d) => ({
      ...d,
      areas: d.areas.map((a) => (a.id === areaId ? { ...a, terrain } : a)),
    }))
  }

  const removeArea = (areaId: string) => {
    setDraft((d) => cascadeRemoveArea(d, areaId))
  }

  const positionCollision = useMemo(
    () =>
      draft.areas.some(
        (a) => a.positionX === newX && a.positionY === newY,
      ),
    [draft.areas, newX, newY],
  )

  const addArea = () => {
    if (positionCollision) return
    const fresh: AreaState = {
      id: crypto.randomUUID(),
      terrain: newTerrain,
      secondaryTerrain: null,
      mineralResults: [],
      harvestMode: null,
      positionX: newX,
      positionY: newY,
    }
    setDraft((d) => ({ ...d, areas: [...d.areas, fresh] }))
    // Pre-fill the next slot so the DM can add several in a row.
    const next = nextFreePosition({ ...draft, areas: [...draft.areas, fresh] })
    setNewX(next.x)
    setNewY(next.y)
  }

  const handleSave = () => {
    if (!dirty || pending) return
    if (draft.areas.length < 1) return // engine probably needs ≥ 1, certainly ≥ 0
    onSave(draft)
    setSavedAt(Date.now())
  }
  const handleDiscard = () => setDraft(realm)

  return (
    <section className="border border-stone-300 dark:border-stone-700 rounded-md p-4 bg-[var(--paper-2)]/40">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-lg font-semibold">Areas</h2>
        <span className="text-xs text-[var(--ink-soft)]">
          {draft.areas.length} {draft.areas.length === 1 ? 'area' : 'areas'}
        </span>
      </div>

      {draft.areas.length === 0 ? (
        <p className="text-sm italic text-[var(--ink-soft)] mb-3">
          No areas. Add at least one below before saving.
        </p>
      ) : (
        <ul className="space-y-1.5 mb-4">
          {draft.areas.map((a, i) => {
            const cascade = computeCascade(draft, a.id)
            return (
              <li
                key={a.id}
                className="grid grid-cols-1 sm:grid-cols-[4rem_8rem_5rem_1fr_auto] gap-2 items-center border border-stone-200 dark:border-stone-800 rounded-md p-2"
              >
                <span className="text-xs text-stone-500">#{i + 1}</span>
                <select
                  value={a.terrain}
                  onChange={(e) => updateTerrain(a.id, e.target.value as Terrain)}
                  className="rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-sm"
                  aria-label={`Terrain of area ${i + 1}`}
                >
                  {TERRAIN_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {TERRAIN_LABELS[t]}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-stone-500 tabular">
                  ({a.positionX}, {a.positionY})
                </span>
                <span className="text-xs text-[var(--ink-soft)]">
                  {describeCascade(cascade)}
                </span>
                <button
                  type="button"
                  onClick={() => removeArea(a.id)}
                  className="text-xs text-[var(--wine)] hover:underline px-1"
                  aria-label={`Delete area ${i + 1} (cascades)`}
                  title="Removes the area and cascades to its roads, strongholds, and population refs"
                >
                  Delete
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Add-area form */}
      <div className="border border-stone-200 dark:border-stone-800 rounded-md p-2.5 bg-stone-50/50 dark:bg-stone-900/50 mb-3">
        <div className="text-xs text-stone-500 mb-2">Add a new area</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <label className="block">
            <span className="text-xs text-stone-500">Terrain</span>
            <select
              value={newTerrain}
              onChange={(e) => setNewTerrain(e.target.value as Terrain)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5 text-sm"
            >
              {TERRAIN_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TERRAIN_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">X</span>
            <input
              type="number"
              min={0}
              value={newX}
              onChange={(e) => setNewX(Math.max(0, Math.floor(Number(e.target.value))))}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5 text-sm text-center"
            />
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">Y</span>
            <input
              type="number"
              min={0}
              value={newY}
              onChange={(e) => setNewY(Math.max(0, Math.floor(Number(e.target.value))))}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5 text-sm text-center"
            />
          </label>
          <button
            type="button"
            onClick={addArea}
            disabled={positionCollision}
            className="empire-button px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add area
          </button>
        </div>
        {positionCollision && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5">
            Another area already occupies ({newX}, {newY}). Pick a free slot.
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
          {pending ? 'Saving…' : 'Save areas'}
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

// ============================================================
// Cascade helpers
// ============================================================

interface CascadeImpact {
  roadsRemoved: number
  strongholdsRemoved: number
  populationRefsNulled: number
}

/** What gets removed/changed if `areaId` were deleted from `realm`. */
function computeCascade(realm: RealmState, areaId: string): CascadeImpact {
  // Strongholds directly on the area — plus all their descendants via
  // parentStrongholdId (improvements of improvements, if any).
  const directlyOn = realm.strongholds.filter((s) => s.areaId === areaId)
  const descendantIds = collectDescendants(realm.strongholds, directlyOn.map((s) => s.id))
  const totalStrongholdsRemoved = directlyOn.length + descendantIds.size

  return {
    roadsRemoved: realm.roadAreaIds.includes(areaId) ? 1 : 0,
    strongholdsRemoved: totalStrongholdsRemoved,
    populationRefsNulled: realm.populations.reduce(
      (n, p) => n + (p.homeAreaId === areaId ? 1 : 0) + (p.workAreaId === areaId ? 1 : 0),
      0,
    ),
  }
}

function describeCascade(c: CascadeImpact): string {
  const parts: string[] = []
  if (c.strongholdsRemoved > 0)
    parts.push(`${c.strongholdsRemoved} stronghold${c.strongholdsRemoved === 1 ? '' : 's'}`)
  if (c.roadsRemoved > 0) parts.push('1 road')
  if (c.populationRefsNulled > 0)
    parts.push(
      `${c.populationRefsNulled} pop ref${c.populationRefsNulled === 1 ? '' : 's'}`,
    )
  return parts.length > 0 ? `Delete cascades: ${parts.join(' · ')}` : ''
}

/** Returns the set of stronghold IDs that descend from any of `rootIds`. */
function collectDescendants(strongholds: readonly { id: string; parentStrongholdId: string | null }[], rootIds: string[]): Set<string> {
  const roots = new Set(rootIds)
  const descendants = new Set<string>()
  let grew = true
  while (grew) {
    grew = false
    for (const s of strongholds) {
      if (s.parentStrongholdId && (roots.has(s.parentStrongholdId) || descendants.has(s.parentStrongholdId)) && !descendants.has(s.id) && !roots.has(s.id)) {
        descendants.add(s.id)
        grew = true
      }
    }
  }
  return descendants
}

/**
 * Apply the full cascade for removing an area:
 *   - Drop the area itself
 *   - Drop strongholds on the area + their descendants
 *   - Drop the area from roadAreaIds
 *   - Null any population homeAreaId/workAreaId that referenced it
 */
function cascadeRemoveArea(realm: RealmState, areaId: string): RealmState {
  const directlyOn = realm.strongholds.filter((s) => s.areaId === areaId).map((s) => s.id)
  const descendants = collectDescendants(realm.strongholds, directlyOn)
  const remove = new Set<string>([...directlyOn, ...descendants])

  return {
    ...realm,
    areas: realm.areas.filter((a) => a.id !== areaId),
    strongholds: realm.strongholds.filter((s) => !remove.has(s.id)),
    roadAreaIds: realm.roadAreaIds.filter((id) => id !== areaId),
    populations: realm.populations.map((p) => ({
      ...p,
      homeAreaId: p.homeAreaId === areaId ? null : p.homeAreaId,
      workAreaId: p.workAreaId === areaId ? null : p.workAreaId,
    })),
  }
}

/**
 * Pick a sensible default (x,y) for a freshly added area — the first free
 * row-major slot in a 7-wide grid starting at (0,0). Falls back to a slot
 * after the rightmost/lowest existing area if the 7-wide grid is full.
 */
function nextFreePosition(realm: RealmState): { x: number; y: number } {
  const occupied = new Set(realm.areas.map((a) => `${a.positionX},${a.positionY}`))
  // Try a 7-column grid first.
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 7; x++) {
      if (!occupied.has(`${x},${y}`)) return { x, y }
    }
  }
  // Should never happen — but fallback to one past the largest Y.
  const maxY = realm.areas.reduce((m, a) => Math.max(m, a.positionY), -1)
  return { x: 0, y: maxY + 1 }
}

/** Whether the editable RealmState surface in this editor differs. */
function realmsDiffer(a: RealmState, b: RealmState): boolean {
  if (a.areas.length !== b.areas.length) return true
  if (a.strongholds.length !== b.strongholds.length) return true
  if (a.roadAreaIds.length !== b.roadAreaIds.length) return true
  if (a.populations.length !== b.populations.length) return true

  // Areas
  for (let i = 0; i < a.areas.length; i++) {
    const x = a.areas[i]
    const y = b.areas[i]
    if (x.id !== y.id || x.terrain !== y.terrain || x.positionX !== y.positionX || x.positionY !== y.positionY) {
      return true
    }
  }
  // Strongholds (ID-only)
  const aSh = new Set(a.strongholds.map((s) => s.id))
  for (const s of b.strongholds) if (!aSh.has(s.id)) return true
  // Roads
  const aRoads = new Set(a.roadAreaIds)
  for (const r of b.roadAreaIds) if (!aRoads.has(r)) return true
  // Population home/work refs (count + ID set)
  for (let i = 0; i < a.populations.length; i++) {
    const x = a.populations[i]
    const y = b.populations[i]
    if (x.id !== y.id || x.homeAreaId !== y.homeAreaId || x.workAreaId !== y.workAreaId) {
      return true
    }
  }
  return false
}
