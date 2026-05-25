import { useState } from 'react'
import type { Terrain } from '../../types/rules'

/** All terrain types the player can paint, in the order shown in the palette. */
export const PAINT_TERRAINS: readonly Terrain[] = [
  'plains',
  'forest',
  'hills',
  'mountains',
  'water',
  'swamp',
  'ruins',
  'wasteland',
]

/**
 * Muted, parchment-friendly palette for each terrain. Designed to harmonise
 * with the cream backdrop and dark-ink theme rather than fighting it. Text
 * colour is always white on the saturated/darker tones and dark on the
 * lighter ones — `textDark` controls which.
 */
export const TERRAIN_PAINTS: Record<Terrain, { bg: string; label: string; textDark: boolean }> = {
  plains:    { bg: '#d4c878', label: 'Plains',    textDark: true },
  forest:    { bg: '#4f6b3f', label: 'Forest',    textDark: false },
  hills:     { bg: '#b07b3e', label: 'Hills',     textDark: false },
  mountains: { bg: '#6e6259', label: 'Mountains', textDark: false },
  water:     { bg: '#6a87a3', label: 'Water',     textDark: false },
  swamp:     { bg: '#748256', label: 'Swamp',     textDark: false },
  ruins:     { bg: '#968d80', label: 'Ruins',     textDark: false },
  wasteland: { bg: '#c6b594', label: 'Wasteland', textDark: true },
}

/** Hard caps. 49 ≈ enough for a 7×7 kingdom; 2 = engine minimum. */
export const MIN_AREAS = 2
export const MAX_AREAS = 49

/**
 * Pick column count that hits the cleanest rectangle for `n` areas.
 *
 *  - Width is capped at 7 (the user's preferred maximum).
 *  - We never pick width < 3 unless `n` is itself < 3 (otherwise a slightly
 *    awkward count like 22 would collapse to 2×11, which is hideous).
 *  - Among valid widths, the one with the fewest empty trailing cells wins.
 *  - Ties are broken by preferring the wider grid (user's stated taste).
 *
 * Examples:  25 → 5 cols (5×5)   28 → 7 cols (7×4)   22 → 6 cols (6×4, 2 empties)
 */
export function autoPickCols(n: number): number {
  if (n <= 0) return 1
  if (n <= 2) return n
  let bestCols = 3
  let bestWaste = Infinity
  const minCols = Math.min(3, n)
  for (let cols = Math.min(7, n); cols >= minCols; cols--) {
    const rows = Math.ceil(n / cols)
    const waste = cols * rows - n
    if (waste < bestWaste || (waste === bestWaste && cols > bestCols)) {
      bestCols = cols
      bestWaste = waste
    }
  }
  return bestCols
}

interface Props {
  /** Flat row-major list of terrains, one per area. Length = total areas. */
  terrains: readonly Terrain[]
  /** Column count: an explicit 1–7 or 'auto' (pick by area count). */
  colsMode: number | 'auto'
  onTerrainsChange: (next: Terrain[]) => void
  onColsModeChange: (mode: number | 'auto') => void
}

export function CustomAreaBuilder({
  terrains,
  colsMode,
  onTerrainsChange,
  onColsModeChange,
}: Props) {
  const [selectedPaint, setSelectedPaint] = useState<Terrain>('plains')
  const [isPainting, setIsPainting] = useState(false)

  const cols = colsMode === 'auto' ? autoPickCols(terrains.length) : colsMode
  const rows = Math.max(1, Math.ceil(terrains.length / cols))

  const setTotalAreas = (next: number) => {
    const clamped = Math.max(MIN_AREAS, Math.min(MAX_AREAS, Math.floor(next)))
    if (clamped === terrains.length) return
    if (clamped > terrains.length) {
      // Growing: pad with plains.
      onTerrainsChange([...terrains, ...Array(clamped - terrains.length).fill('plains')])
    } else {
      onTerrainsChange(terrains.slice(0, clamped))
    }
  }

  const paint = (index: number) => {
    if (index < 0 || index >= terrains.length) return
    if (terrains[index] === selectedPaint) return
    const next = [...terrains]
    next[index] = selectedPaint
    onTerrainsChange(next)
  }

  return (
    <div className="border border-stone-300 dark:border-stone-700 rounded-md p-4 bg-[var(--paper-2)]/40">
      <div className="text-sm font-medium mb-3">Land areas</div>

      {/* Top controls: total + grid-width selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <label className="block">
          <span className="text-xs text-stone-500">Total areas</span>
          <div className="flex items-center gap-1 mt-1">
            <button
              type="button"
              onClick={() => setTotalAreas(terrains.length - 1)}
              disabled={terrains.length <= MIN_AREAS}
              aria-label="Decrease total areas"
              className="w-7 h-7 border border-stone-300 dark:border-stone-700 rounded hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
            >
              -
            </button>
            <input
              type="number"
              min={MIN_AREAS}
              max={MAX_AREAS}
              value={terrains.length}
              onChange={(e) => setTotalAreas(Number(e.target.value))}
              className="w-16 rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1 text-center"
            />
            <button
              type="button"
              onClick={() => setTotalAreas(terrains.length + 1)}
              disabled={terrains.length >= MAX_AREAS}
              aria-label="Increase total areas"
              className="w-7 h-7 border border-stone-300 dark:border-stone-700 rounded hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
            >
              +
            </button>
            <span className="text-xs text-stone-500 ml-2">
              ({MIN_AREAS}–{MAX_AREAS})
            </span>
          </div>
        </label>

        <label className="block">
          <span className="text-xs text-stone-500">Grid width</span>
          <select
            value={colsMode === 'auto' ? 'auto' : String(colsMode)}
            onChange={(e) => {
              const v = e.target.value
              onColsModeChange(v === 'auto' ? 'auto' : Number(v))
            }}
            className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-2 py-1.5"
          >
            <option value="auto">Auto ({autoPickCols(terrains.length)} cols)</option>
            {[1, 2, 3, 4, 5, 6, 7].map((c) => (
              <option key={c} value={c}>
                {c} {c === 1 ? 'column' : 'columns'}
              </option>
            ))}
          </select>
          <span className="text-xs text-stone-500 mt-1 block">
            Grid: {cols} × {rows}
            {cols * rows > terrains.length &&
              ` (${cols * rows - terrains.length} unused cell${cols * rows - terrains.length === 1 ? '' : 's'})`}
          </span>
        </label>
      </div>

      {/* Terrain palette — click a swatch to select the paint, then paint cells. */}
      <div className="mb-3">
        <div className="text-xs text-stone-500 mb-1.5">
          Pick a terrain, then click (or click-and-drag) on the grid to paint it.
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PAINT_TERRAINS.map((t) => {
            const p = TERRAIN_PAINTS[t]
            const active = selectedPaint === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedPaint(t)}
                aria-label={`Paint ${p.label}`}
                aria-pressed={active}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all ${
                  active
                    ? 'border-stone-900 dark:border-stone-100 ring-2 ring-stone-900/30 dark:ring-stone-100/30'
                    : 'border-stone-300 dark:border-stone-700 opacity-80 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: p.bg,
                  color: p.textDark ? '#3a2d1d' : 'white',
                }}
              >
                <span className="text-xs font-medium">{p.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* The paintable grid. */}
      <div
        className="grid gap-1 select-none touch-none"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        onMouseUp={() => setIsPainting(false)}
        onMouseLeave={() => setIsPainting(false)}
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
          const x = i % cols
          const y = Math.floor(i / cols)
          return (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                setIsPainting(true)
                paint(i)
              }}
              onMouseEnter={() => {
                if (isPainting) paint(i)
              }}
              aria-label={`Area ${i + 1} (row ${y + 1}, column ${x + 1}): ${p.label}. Click to paint ${TERRAIN_PAINTS[selectedPaint].label}.`}
              className="aspect-square rounded-sm border border-black/15 hover:ring-2 hover:ring-stone-900/40 dark:hover:ring-stone-100/40 transition-shadow"
              style={{
                backgroundColor: p.bg,
                color: p.textDark ? '#3a2d1d' : 'white',
              }}
              title={p.label}
            >
              <span className="text-[10px] font-medium uppercase tracking-tight opacity-80">
                {p.label.slice(0, 3)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Small terrain key/legend for accessibility — also useful at a glance. */}
      <div className="mt-3 text-xs text-stone-500">
        Adjacency is 4-cardinal (north / south / east / west) based on
        position. Unused cells in a partial last row aren't part of the realm.
      </div>
    </div>
  )
}
