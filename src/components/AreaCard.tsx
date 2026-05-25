import { useMemo } from 'react'
import type { StrongholdKind, Terrain } from '../types/rules'
import { TERRAIN_STATS } from '../types/rules'
import {
  livingSpaceForArea,
  populationLivingOnArea,
  populationWorkingArea,
  type AreaState,
  type RealmState,
  type StrongholdState,
} from '../rules/state'
import { TerrainPlaceholder, type AreaArtKey } from './AreaArt'

/**
 * Vite eagerly imports every image file under src/assets/cards/areas/ so the
 * user can drop in PNG / JPG / WebP / SVG art without editing this file. The
 * naming convention each file must follow is:
 *
 *     {terrain}-{art_key}.{png|jpg|jpeg|webp|svg}
 *
 * where terrain ∈ {forest, plains, hills, mountains, swamp, ruins, wasteland,
 * water} and art_key is one of: empty, village, town, city, keep, castle,
 * citadel, mine.
 *
 * Examples:
 *     plains-empty.png       — a plain field with no buildings
 *     plains-village.png     — a plain field with a village
 *     mountains-citadel.jpg  — a mountain with a citadel on top
 *
 * If a specific (terrain, art_key) combo isn't on disk, the resolver falls
 * back to `{terrain}-empty`, and if that's also missing it falls back to the
 * inline SVG TerrainPlaceholder. So you can stage a few key images and the
 * rest will still render.
 */
const RAW_IMAGES = import.meta.glob(
  '../assets/cards/areas/*.{png,jpg,jpeg,webp,svg}',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>

/**
 * Maps `{terrain}-{art_key}` → resolved image URL, for fast lookup. Built
 * once at module load.
 */
const IMAGE_INDEX: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const path in RAW_IMAGES) {
    // Strip directory and extension to get the lookup key.
    const file = path.split('/').pop() ?? ''
    const key = file.replace(/\.[a-z]+$/i, '')
    out[key] = RAW_IMAGES[path]
  }
  return out
})()

/**
 * Picks the most-prominent stronghold on the area and returns the art key.
 * Tier ranking (per the user's spec):
 *   - Tier 1 (highest): city → citadel
 *   - Tier 2: town → castle
 *   - Tier 3 (lowest): village → keep → mine
 *   - Otherwise: 'empty'
 *
 * Add-on strongholds (wall, marketplace, port, guilds, etc.) never change the
 * card art — only the primary settlement / fortification / mine does.
 */
export function pickAreaArtKey(strongholds: StrongholdState[]): AreaArtKey {
  const kinds = new Set<StrongholdKind>(strongholds.map((s) => s.kind))
  // Tier 1
  if (kinds.has('city'))    return 'city'
  if (kinds.has('citadel')) return 'citadel'
  // Tier 2
  if (kinds.has('town'))    return 'town'
  if (kinds.has('castle'))  return 'castle'
  // Tier 3
  if (kinds.has('village')) return 'village'
  if (kinds.has('keep'))    return 'keep'
  if (kinds.has('mine'))    return 'mine'
  return 'empty'
}

/** Resolve a (terrain, art_key) pair to a real image URL, or null if none on disk. */
function resolveImage(terrain: Terrain, key: AreaArtKey): string | null {
  return (
    IMAGE_INDEX[`${terrain}-${key}`] ??
    // Fall back to the bare terrain (empty variant) when the combo isn't on disk
    IMAGE_INDEX[`${terrain}-empty`] ??
    IMAGE_INDEX[`${terrain}`] ??
    null
  )
}

interface Props {
  area: AreaState
  realm: RealmState
  strongholds: StrongholdState[]
  /** Optional 1-based index to show in the title bar (e.g. "Area 3 — Forest"). */
  indexLabel?: string
}

const TERRAIN_LABEL: Record<Terrain, string> = {
  forest:    'Forest',
  plains:    'Plains',
  hills:     'Hills',
  mountains: 'Mountains',
  swamp:     'Swamp',
  ruins:     'Ruins',
  wasteland: 'Wasteland',
  water:     'Water',
}

const ART_KEY_LABEL: Record<AreaArtKey, string> = {
  empty:   'Unsettled',
  village: 'Village',
  town:    'Town',
  city:    'City',
  keep:    'Keep',
  castle:  'Castle',
  citadel: 'Citadel',
  mine:    'Mine',
}

/**
 * Primary (non-add-on) stronghold kinds, listed in tier-descending order so
 * that "City · Citadel · Keep" reads consistently regardless of build order.
 * Add-ons (wall, marketplace, port, etc.) get their own badges via
 * ADDON_BADGE — they don't show up in the subtitle.
 */
const PRIMARY_ORDER: StrongholdKind[] = [
  'city', 'citadel', 'town', 'castle', 'village', 'keep', 'mine',
]

const PRIMARY_LABEL: Partial<Record<StrongholdKind, string>> = {
  city:    'City',
  citadel: 'Citadel',
  town:    'Town',
  castle:  'Castle',
  village: 'Village',
  keep:    'Keep',
  mine:    'Mine',
}

const ADDON_BADGE: Partial<Record<StrongholdKind, { letter: string; title: string }>> = {
  wall:             { letter: 'W',  title: 'Wall' },
  marketplace:      { letter: 'Mk', title: 'Marketplace' },
  port:             { letter: 'P',  title: 'Port' },
  craftsmens_guild: { letter: 'G',  title: "Craftsmen's Guild" },
  wizards_academy:  { letter: 'A',  title: "Wizards' Academy" },
  grand_temple:     { letter: 'Te', title: 'Grand Temple' },
}

/**
 * CCG / MTG-styled area tile. The frame is split horizontally:
 *
 *   ┌───────────────────────┐
 *   │  Title bar (terrain)  │ ← terrain name + index
 *   ├───────────────────────┤
 *   │                       │
 *   │       artwork         │ ← image for (terrain, primary stronghold)
 *   │                       │
 *   ├───────────────────────┤
 *   │  subtitle / stats     │ ← stronghold type, pop, work, capacity
 *   └───────────────────────┘
 *
 * The outer border is a thick dark stroke (MTG-style). A coloured glow ring
 * indicates productivity (green = harvest-ready, amber = overcrowded).
 */
export function AreaCard({ area, realm, strongholds, indexLabel }: Props) {
  const stats = TERRAIN_STATS[area.terrain]
  const livingHere = populationLivingOnArea(realm, area.id)
  const workingHere = populationWorkingArea(realm, area.id)
  const cap = livingSpaceForArea(realm, area.id)
  const productive = stats.harvestPop > 0 && workingHere >= stats.harvestPop
  const overcrowded = livingHere > cap

  const artKey = useMemo(() => pickAreaArtKey(strongholds), [strongholds])
  // Subtitle lists every primary stronghold on the tile in tier order, one
  // per line, with counts when there's more than one of a kind. E.g. a tile
  // with 1 city + 2 towns + 1 citadel + 3 villages reads:
  //   City
  //   Citadel
  //   Town x2
  //   Village x3
  // (Add-ons like Wall / Marketplace live in the badges row, not here.)
  const strongholdLines = useMemo<string[]>(() => {
    const counts = new Map<StrongholdKind, number>()
    for (const s of strongholds) {
      if (PRIMARY_LABEL[s.kind]) {
        counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1)
      }
    }
    const lines = PRIMARY_ORDER.filter((kind) => counts.has(kind)).map((kind) => {
      const n = counts.get(kind)!
      return n > 1 ? `${PRIMARY_LABEL[kind]} x${n}` : PRIMARY_LABEL[kind]!
    })
    return lines.length > 0 ? lines : [ART_KEY_LABEL[artKey]]
  }, [strongholds, artKey])
  // Add-on badges — one chip per add-on stronghold on the tile (wall,
  // marketplace, port, guilds, etc.). Duplicates would show as multiple
  // chips but the data model doesn't currently allow them.
  const addOns = strongholds
    .map((s) => ADDON_BADGE[s.kind])
    .filter((b): b is { letter: string; title: string } => Boolean(b))

  const ring = productive
    ? 'ring-2 ring-emerald-400/70 dark:ring-emerald-600/70'
    : overcrowded
      ? 'ring-2 ring-amber-400/70 dark:ring-amber-600/70'
      : ''

  const resolvedSrc = resolveImage(area.terrain, artKey)

  return (
    <div
      className={[
        // Outer MTG-style frame
        'relative rounded-lg overflow-hidden bg-[var(--paper-2,#e9dec5)]',
        'border-[3px] border-stone-900 dark:border-stone-100',
        'shadow-md flex flex-col text-stone-900 dark:text-stone-100',
        ring,
      ].join(' ')}
    >
      {/* Title bar */}
      <div className="px-2 py-1 bg-stone-900 text-[var(--paper,#f4ecd6)] text-[11px] font-serif font-semibold flex items-center justify-between gap-1">
        <span className="truncate">
          {indexLabel ? `${indexLabel} · ` : ''}
          {TERRAIN_LABEL[area.terrain]}
        </span>
        {addOns.length > 0 && (
          <span className="flex gap-0.5">
            {addOns.map((b, i) => (
              <span
                key={i}
                className="inline-block px-1 py-px rounded bg-[var(--paper,#f4ecd6)]/20 text-[9px] font-mono"
                title={b.title}
              >
                {b.letter}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Artwork — top half */}
      <div className="aspect-[5/3] bg-stone-200 dark:bg-stone-800 border-b-2 border-stone-900 dark:border-stone-100 overflow-hidden">
        {resolvedSrc ? (
          <img
            src={resolvedSrc}
            alt={`${TERRAIN_LABEL[area.terrain]} — ${ART_KEY_LABEL[artKey]}`}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <TerrainPlaceholder terrain={area.terrain} artKey={artKey} />
        )}
      </div>

      {/* Subtitle / stats — bottom half. The stronghold list reserves
          height for 7 lines (the maximum number of distinct primary
          stronghold kinds: city, citadel, town, castle, village, keep,
          mine) so all cards in a row share the same height regardless of
          what's built on them. */}
      <div className="px-2 py-2 text-[11px] leading-tight flex flex-col bg-[var(--paper,#f4ecd6)] dark:bg-stone-900">
        <ul className="font-serif italic text-stone-700 dark:text-stone-300 space-y-0.5 min-h-[8.4em]">
          {strongholdLines.map((line) => (
            <li key={line} className="truncate">
              {line}
            </li>
          ))}
        </ul>

        {/* Spacer + stats */}
        <div className="mt-3 space-y-1">
          <div
            className="flex items-baseline justify-between"
            title={
              overcrowded
                ? 'Overcrowded — loyalty penalty next spring'
                : 'Residents / capacity'
            }
          >
            <span className="text-stone-500 text-[9px] uppercase tracking-wide">live</span>
            <span className="font-mono">
              <span className={overcrowded ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>
                {livingHere}
              </span>
              <span className="text-stone-500"> / {cap}</span>
            </span>
          </div>
          <div
            className="flex items-baseline justify-between"
            title={productive ? 'Will harvest at fall' : 'Below minimum — no harvest'}
          >
            <span className="text-stone-500 text-[9px] uppercase tracking-wide">work</span>
            <span className="font-mono">
              <span className={productive ? 'text-emerald-700 dark:text-emerald-300 font-semibold' : ''}>
                {workingHere}
              </span>
              {stats.harvestPop > 0 && <span className="text-stone-500"> / {stats.harvestPop}</span>}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
