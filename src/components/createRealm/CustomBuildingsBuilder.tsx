import { useState } from 'react'
import type { StrongholdKind, Terrain } from '../../types/rules'
import { TERRAIN_PAINTS, autoPickCols } from './CustomAreaBuilder'

// ============================================================
// Stronghold classification — mirrors construction.ts. Add-on
// kinds must point at a parent stronghold on the same area.
// ============================================================

const SETTLEMENT_KINDS: StrongholdKind[] = ['village', 'town', 'city']
const FORTIFICATION_KINDS: StrongholdKind[] = ['keep', 'castle', 'citadel']
const ADDON_KINDS: StrongholdKind[] = [
  'wall',
  'marketplace',
  'port',
  'craftsmens_guild',
  'wizards_academy',
  'grand_temple',
]

const STRONGHOLD_ORDER: StrongholdKind[] = [
  // Settlements
  'village', 'town', 'city',
  // Fortifications
  'keep', 'castle', 'citadel',
  // Special / standalone
  'mine',
  // Add-ons
  'port', 'wall', 'marketplace', 'craftsmens_guild', 'wizards_academy', 'grand_temple',
]

const STRONGHOLD_LABELS: Record<StrongholdKind, string> = {
  village:            'Village',
  town:               'Town',
  city:               'City',
  keep:               'Keep',
  castle:             'Castle',
  citadel:            'Citadel',
  mine:               'Mine',
  port:               'Port',
  wall:               'Wall',
  marketplace:        'Marketplace',
  craftsmens_guild:   "Craftsmen's Guild",
  wizards_academy:    "Wizards' Academy",
  grand_temple:       'Grand Temple',
}

const STRONGHOLD_BADGE: Record<StrongholdKind, string> = {
  village:            'V',
  town:               'T',
  city:               'C',
  keep:               'Kp',
  castle:             'Cs',
  citadel:            'Cd',
  mine:               'Mn',
  port:               'Po',
  wall:               'Wa',
  marketplace:        'Mk',
  craftsmens_guild:   'Cg',
  wizards_academy:    'Wz',
  grand_temple:       'Gt',
}

function isAddon(kind: StrongholdKind): boolean {
  return ADDON_KINDS.includes(kind)
}

/**
 * Group label for the kind dropdown. Helps the player navigate the long
 * stronghold list.
 */
function strongholdGroup(kind: StrongholdKind): string {
  if (SETTLEMENT_KINDS.includes(kind)) return 'Settlement'
  if (FORTIFICATION_KINDS.includes(kind)) return 'Fortification'
  if (kind === 'mine') return 'Mine'
  return 'Add-on (needs a parent)'
}

// ============================================================
// Types passed in/out of the component
// ============================================================

/**
 * A stronghold placed on the custom realm. Tracked by `areaIndex` (the
 * flat row-major index of the area in the terrain list) and `parentLocalId`
 * (the local React ID of another PlacedStronghold). At submit time the
 * parent owner of CreateRealmPage converts these to area positions and
 * topological parentIndex values for the engine.
 */
export interface PlacedStronghold {
  /** Stable per-React-session ID used for parent linking. */
  localId: string
  kind: StrongholdKind
  areaIndex: number
  parentLocalId: string | null
  mineResourceType: 'stone' | 'mineral' | null
}

interface Props {
  terrains: readonly Terrain[]
  colsMode: number | 'auto'
  strongholds: readonly PlacedStronghold[]
  roadAreaIndices: ReadonlySet<number>
  onStrongholdsChange: (next: PlacedStronghold[]) => void
  onRoadAreaIndicesChange: (next: Set<number>) => void
}

// ============================================================
// Component
// ============================================================

export function CustomBuildingsBuilder({
  terrains,
  colsMode,
  strongholds,
  roadAreaIndices,
  onStrongholdsChange,
  onRoadAreaIndicesChange,
}: Props) {
  const cols = colsMode === 'auto' ? autoPickCols(terrains.length) : colsMode
  const rows = Math.max(1, Math.ceil(terrains.length / cols))

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  // "Add stronghold" form state — lives on the per-cell editor.
  const [addKind, setAddKind] = useState<StrongholdKind>('keep')
  const [addParentLocalId, setAddParentLocalId] = useState<string>('')
  const [addMineMode, setAddMineMode] = useState<'stone' | 'mineral'>('stone')

  // Re-clamp selection if total areas shrinks beneath it.
  if (selectedIndex !== null && selectedIndex >= terrains.length) {
    queueMicrotask(() => setSelectedIndex(null))
  }

  const toggleRoad = (i: number) => {
    const next = new Set(roadAreaIndices)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    onRoadAreaIndicesChange(next)
  }

  const addStronghold = () => {
    if (selectedIndex === null) return
    const parentLocalId =
      isAddon(addKind) && addParentLocalId ? addParentLocalId : null
    const newSh: PlacedStronghold = {
      localId: makeLocalId(),
      kind: addKind,
      areaIndex: selectedIndex,
      parentLocalId,
      mineResourceType: addKind === 'mine' ? addMineMode : null,
    }
    onStrongholdsChange([...strongholds, newSh])
    setAddParentLocalId('')
  }

  const removeStronghold = (localId: string) => {
    // Also delete any children that point at this stronghold (cascade).
    const ids = new Set<string>([localId])
    let grew = true
    while (grew) {
      grew = false
      for (const s of strongholds) {
        if (s.parentLocalId && ids.has(s.parentLocalId) && !ids.has(s.localId)) {
          ids.add(s.localId)
          grew = true
        }
      }
    }
    onStrongholdsChange(strongholds.filter((s) => !ids.has(s.localId)))
  }

  const selectedStrongholds = strongholds.filter(
    (s) => selectedIndex !== null && s.areaIndex === selectedIndex,
  )
  // Eligible parents on the selected cell — only "base" strongholds count.
  const parentCandidatesHere = selectedStrongholds.filter(
    (s) => !isAddon(s.kind),
  )

  const strongholdsByArea = new Map<number, PlacedStronghold[]>()
  for (const s of strongholds) {
    const list = strongholdsByArea.get(s.areaIndex) ?? []
    list.push(s)
    strongholdsByArea.set(s.areaIndex, list)
  }

  return (
    <div className="border border-stone-300 dark:border-stone-700 rounded-md p-4 bg-[var(--paper-2)]/40">
      <div className="text-sm font-medium mb-1">Strongholds &amp; roads</div>
      <p className="text-xs text-stone-500 mb-3">
        Click a tile to place strongholds or toggle a road on it. All building
        is free and instant at this stage — improvements (Wall, Marketplace,
        etc.) just need a host settlement on the same tile.
      </p>

      {/* The grid — mirrors the area builder but read-only for terrain. */}
      <div
        className="grid gap-1 select-none"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols * rows }, (_, i) => {
          if (i >= terrains.length) {
            return (
              <div
                key={i}
                className="aspect-square border border-dashed border-stone-300 dark:border-stone-700 rounded-sm opacity-30"
                aria-hidden="true"
              />
            )
          }
          const terrain = terrains[i]
          const p = TERRAIN_PAINTS[terrain]
          const here = strongholdsByArea.get(i) ?? []
          const hasRoad = roadAreaIndices.has(i)
          const isSelected = selectedIndex === i
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedIndex(i)}
              aria-label={`Area ${i + 1}: ${p.label}${here.length ? ', ' + here.length + ' stronghold(s)' : ''}${hasRoad ? ', has road' : ''}${isSelected ? ' (selected)' : ''}`}
              className={`aspect-square rounded-sm border relative transition-shadow ${
                isSelected
                  ? 'ring-2 ring-[var(--wine)] border-[var(--wine)]'
                  : 'border-black/15 hover:ring-2 hover:ring-stone-900/40 dark:hover:ring-stone-100/40'
              }`}
              style={{
                backgroundColor: p.bg,
                color: p.textDark ? '#3a2d1d' : 'white',
              }}
            >
              {/* Stronghold count badge — top-right corner */}
              {here.length > 0 && (
                <span
                  className="absolute top-0.5 right-0.5 text-[10px] leading-none font-semibold px-1 py-0.5 rounded-sm bg-white/85 text-black"
                  title={here.map((s) => STRONGHOLD_LABELS[s.kind]).join(', ')}
                >
                  {here.length === 1
                    ? STRONGHOLD_BADGE[here[0].kind]
                    : `${STRONGHOLD_BADGE[here[0].kind]}+${here.length - 1}`}
                </span>
              )}
              {/* Road indicator — bottom-left dash */}
              {hasRoad && (
                <span
                  className="absolute bottom-0.5 left-0.5 text-[10px] leading-none font-bold px-1 py-0.5 rounded-sm bg-[var(--gold)]/90 text-black"
                  title="Road"
                  aria-hidden="true"
                >
                  ═
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Per-cell editor */}
      {selectedIndex !== null && selectedIndex < terrains.length && (
        <CellEditor
          index={selectedIndex}
          terrain={terrains[selectedIndex]}
          cols={cols}
          hasRoad={roadAreaIndices.has(selectedIndex)}
          onToggleRoad={() => toggleRoad(selectedIndex)}
          strongholdsHere={selectedStrongholds}
          parentCandidates={parentCandidatesHere}
          addKind={addKind}
          onAddKindChange={setAddKind}
          addParentLocalId={addParentLocalId}
          onAddParentLocalIdChange={setAddParentLocalId}
          addMineMode={addMineMode}
          onAddMineModeChange={setAddMineMode}
          onAddStronghold={addStronghold}
          onRemoveStronghold={removeStronghold}
          allStrongholds={strongholds}
        />
      )}

      {selectedIndex === null && (
        <p className="mt-4 text-xs text-stone-500 italic">
          No tile selected — click any tile above to edit its strongholds and road.
        </p>
      )}
    </div>
  )
}

// ============================================================
// Per-cell editor
// ============================================================

interface CellEditorProps {
  index: number
  terrain: Terrain
  cols: number
  hasRoad: boolean
  onToggleRoad: () => void
  strongholdsHere: PlacedStronghold[]
  parentCandidates: PlacedStronghold[]
  addKind: StrongholdKind
  onAddKindChange: (k: StrongholdKind) => void
  addParentLocalId: string
  onAddParentLocalIdChange: (id: string) => void
  addMineMode: 'stone' | 'mineral'
  onAddMineModeChange: (m: 'stone' | 'mineral') => void
  onAddStronghold: () => void
  onRemoveStronghold: (localId: string) => void
  /** All strongholds across all cells — used to look up a parent's label. */
  allStrongholds: readonly PlacedStronghold[]
}

function CellEditor({
  index,
  terrain,
  cols,
  hasRoad,
  onToggleRoad,
  strongholdsHere,
  parentCandidates,
  addKind,
  onAddKindChange,
  addParentLocalId,
  onAddParentLocalIdChange,
  addMineMode,
  onAddMineModeChange,
  onAddStronghold,
  onRemoveStronghold,
  allStrongholds,
}: CellEditorProps) {
  const x = index % cols
  const y = Math.floor(index / cols)
  const addOnNeedsParent = isAddon(addKind)
  const addOnButNoParent = addOnNeedsParent && parentCandidates.length === 0
  const labelByLocalId = new Map<string, string>()
  for (const s of allStrongholds) labelByLocalId.set(s.localId, STRONGHOLD_LABELS[s.kind])

  // Validation: mine requires hills/mountains; we warn (not block).
  const mineOnWrongTerrain =
    addKind === 'mine' && terrain !== 'hills' && terrain !== 'mountains'

  return (
    <div className="mt-4 border-t border-stone-300 dark:border-stone-700 pt-3">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-medium">
          Area #{index + 1}{' '}
          <span className="text-stone-500 capitalize font-normal">
            ({terrain}, row {y + 1} col {x + 1})
          </span>
        </div>
      </div>

      {/* Road toggle */}
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={hasRoad}
          onChange={onToggleRoad}
          className="rounded"
        />
        <span className="text-sm">Road on this tile</span>
      </label>

      {/* Existing strongholds */}
      <div className="mb-3">
        <div className="text-xs text-stone-500 mb-1">Strongholds here</div>
        {strongholdsHere.length === 0 ? (
          <div className="text-xs italic text-stone-500">None</div>
        ) : (
          <ul className="space-y-1">
            {strongholdsHere.map((s) => {
              const parentLabel = s.parentLocalId
                ? labelByLocalId.get(s.parentLocalId)
                : null
              return (
                <li
                  key={s.localId}
                  className="flex items-center justify-between border border-stone-200 dark:border-stone-800 rounded-md px-2 py-1.5 text-sm"
                >
                  <span>
                    <span className="font-medium">{STRONGHOLD_LABELS[s.kind]}</span>
                    {s.mineResourceType && (
                      <span className="text-xs text-stone-500 ml-1">
                        ({s.mineResourceType})
                      </span>
                    )}
                    {parentLabel && (
                      <span className="text-xs text-stone-500 ml-1">
                        — in {parentLabel}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveStronghold(s.localId)}
                    aria-label={`Remove ${STRONGHOLD_LABELS[s.kind]}`}
                    className="text-xs text-[var(--wine)] hover:underline"
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Add stronghold */}
      <div className="border border-stone-200 dark:border-stone-800 rounded-md p-2.5 bg-stone-50/50 dark:bg-stone-900/50">
        <div className="text-xs text-stone-500 mb-2">Add a stronghold</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-stone-500">Kind</span>
            <select
              value={addKind}
              onChange={(e) => onAddKindChange(e.target.value as StrongholdKind)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5 text-sm"
            >
              {STRONGHOLD_ORDER.map((k) => (
                <option key={k} value={k}>
                  {STRONGHOLD_LABELS[k]} — {strongholdGroup(k)}
                </option>
              ))}
            </select>
          </label>

          {addOnNeedsParent && (
            <label className="block">
              <span className="text-xs text-stone-500">Parent (on this tile)</span>
              <select
                value={addParentLocalId}
                onChange={(e) => onAddParentLocalIdChange(e.target.value)}
                disabled={parentCandidates.length === 0}
                className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5 text-sm disabled:opacity-60"
              >
                <option value="">— pick a parent —</option>
                {parentCandidates.map((s) => (
                  <option key={s.localId} value={s.localId}>
                    {STRONGHOLD_LABELS[s.kind]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {addKind === 'mine' && (
            <label className="block">
              <span className="text-xs text-stone-500">Mine mode</span>
              <select
                value={addMineMode}
                onChange={(e) =>
                  onAddMineModeChange(e.target.value as 'stone' | 'mineral')
                }
                className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5 text-sm"
              >
                <option value="stone">Stone</option>
                <option value="mineral">Mineral (needs survey later)</option>
              </select>
            </label>
          )}
        </div>

        {addOnButNoParent && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
            Place a Village / Town / City / Keep / Castle / Citadel here first
            — {STRONGHOLD_LABELS[addKind]} is an add-on.
          </p>
        )}
        {mineOnWrongTerrain && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
            Mines are normally built on hills or mountains. The engine accepts
            the placement, but it won't do anything useful here.
          </p>
        )}

        <button
          type="button"
          onClick={onAddStronghold}
          disabled={addOnNeedsParent && !addParentLocalId}
          className="empire-button px-3 py-1.5 rounded-md text-sm font-medium mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add {STRONGHOLD_LABELS[addKind]}
        </button>
      </div>
    </div>
  )
}

let counter = 0
function makeLocalId(): string {
  counter += 1
  return `local-${counter}-${Math.random().toString(36).slice(2, 8)}`
}
