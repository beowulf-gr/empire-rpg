import type { Terrain } from '../types/rules'

/**
 * Art-key for a card image: the "what's-on-this-tile" half of the filename
 * convention. See AreaCard.tsx for the full naming scheme.
 */
export type AreaArtKey =
  | 'empty'
  | 'village'
  | 'town'
  | 'city'
  | 'keep'
  | 'castle'
  | 'citadel'
  | 'mine'

/**
 * Inline-SVG placeholder for an area's card art. Used when no user-supplied
 * image is found under `src/assets/cards/areas/{terrain}-{artKey}.{ext}`.
 *
 * Each terrain has its own colour palette + a simple stylised landscape; on
 * top of that, a building silhouette is layered when artKey isn't 'empty'.
 * These are deliberately rough — drop real artwork into the assets folder to
 * replace them; the filename convention is documented in AreaCard.tsx.
 */

interface PaletteEntry {
  sky:    string
  ground: string
  accent: string
  detail: string
}

const PALETTE: Record<Terrain, PaletteEntry> = {
  plains:    { sky: '#bfd9f0', ground: '#d4c878', accent: '#a89c4f', detail: '#7d6e3a' },
  forest:    { sky: '#a4c3d4', ground: '#3a5232', accent: '#1e3a1a', detail: '#0f1f0e' },
  hills:     { sky: '#c1d2e2', ground: '#b07b3e', accent: '#8a5a23', detail: '#5b3815' },
  mountains: { sky: '#c8d4d8', ground: '#6e6259', accent: '#3a3530', detail: '#f6f6f6' },
  swamp:     { sky: '#7d8c70', ground: '#3f4a32', accent: '#6e7c4a', detail: '#1e2814' },
  ruins:     { sky: '#cdc7b8', ground: '#968d80', accent: '#5d564a', detail: '#3c352c' },
  wasteland: { sky: '#e6dab2', ground: '#c6b594', accent: '#8c7959', detail: '#5e4f36' },
  water:     { sky: '#a6c4d9', ground: '#6a87a3', accent: '#3d5d7a', detail: '#ffffff' },
}

interface Props {
  terrain: Terrain
  artKey: AreaArtKey
}

export function TerrainPlaceholder({ terrain, artKey }: Props) {
  const p = PALETTE[terrain]

  return (
    <svg
      viewBox="0 0 100 60"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      aria-hidden="true"
    >
      {/* Sky */}
      <rect width="100" height="60" fill={p.sky} />

      {/* Terrain-specific landscape */}
      {renderLandscape(terrain, p)}

      {/* Building silhouette for non-empty art keys */}
      {artKey !== 'empty' && renderBuilding(artKey, p)}

      {/* Faint frame to make it obviously a placeholder */}
      <rect x="0.5" y="0.5" width="99" height="59" fill="none" stroke={p.detail} strokeOpacity="0.25" strokeWidth="0.5" />
    </svg>
  )
}

// ============================================================
// Landscape sub-renderers — pure SVG so they tree-shake cleanly
// ============================================================

function renderLandscape(terrain: Terrain, p: PaletteEntry) {
  switch (terrain) {
    case 'plains':
      return (
        <>
          <rect y="40" width="100" height="20" fill={p.ground} />
          {/* Wheat lines */}
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={i} x1={5 + i * 17} y1="40" x2={5 + i * 17} y2="50" stroke={p.detail} strokeOpacity="0.4" strokeWidth="0.5" />
          ))}
        </>
      )
    case 'forest':
      return (
        <>
          <rect y="40" width="100" height="20" fill={p.ground} />
          {/* Triangle trees */}
          {[10, 25, 40, 55, 70, 85].map((x, i) => (
            <g key={i} transform={`translate(${x},${20 + (i % 2) * 6})`}>
              <polygon points="0,16 -5,8 -3,8 -4,4 -1,4 0,0 1,4 4,4 3,8 5,8" fill={p.accent} />
              <rect x="-0.5" y="14" width="1" height="3" fill={p.detail} />
            </g>
          ))}
        </>
      )
    case 'hills':
      return (
        <>
          <path d="M0,50 Q15,35 30,45 T60,42 T100,48 L100,60 L0,60 Z" fill={p.ground} />
          <path d="M0,55 Q25,45 50,52 T100,55 L100,60 L0,60 Z" fill={p.accent} opacity="0.7" />
        </>
      )
    case 'mountains':
      return (
        <>
          <polygon points="0,60 25,15 45,40 60,25 90,55 100,40 100,60" fill={p.ground} />
          {/* Snow caps */}
          <polygon points="22,18 28,18 25,15" fill={p.detail} />
          <polygon points="58,28 62,28 60,25" fill={p.detail} />
        </>
      )
    case 'swamp':
      return (
        <>
          <rect y="40" width="100" height="20" fill={p.ground} />
          {/* Puddles */}
          <ellipse cx="20" cy="50" rx="8" ry="2" fill={p.accent} />
          <ellipse cx="55" cy="53" rx="10" ry="2.5" fill={p.accent} />
          <ellipse cx="85" cy="48" rx="6" ry="1.5" fill={p.accent} />
          {/* Reeds */}
          {[15, 35, 65, 80].map((x, i) => (
            <line key={i} x1={x} y1="40" x2={x} y2="36" stroke={p.detail} strokeWidth="0.5" />
          ))}
        </>
      )
    case 'ruins':
      return (
        <>
          <rect y="40" width="100" height="20" fill={p.ground} />
          {/* Broken columns */}
          {[15, 40, 70].map((x, i) => (
            <g key={i} transform={`translate(${x},${28 + (i % 2) * 4})`}>
              <rect width="6" height="14" fill={p.detail} />
              <rect y="-3" width="8" height="3" x="-1" fill={p.accent} />
            </g>
          ))}
        </>
      )
    case 'wasteland':
      return (
        <>
          <rect y="40" width="100" height="20" fill={p.ground} />
          {/* Cracked ground lines */}
          <path d="M5,50 L20,48 L25,52 L40,49" stroke={p.detail} strokeOpacity="0.4" fill="none" />
          <path d="M50,53 L65,50 L80,54 L95,51" stroke={p.detail} strokeOpacity="0.4" fill="none" />
          {/* Sun */}
          <circle cx="80" cy="15" r="6" fill={p.detail} opacity="0.5" />
        </>
      )
    case 'water':
      return (
        <>
          <rect y="30" width="100" height="30" fill={p.ground} />
          {/* Wavelets */}
          {[40, 47, 54].map((y) => (
            <path key={y} d={`M0,${y} Q12.5,${y - 1.5} 25,${y} T50,${y} T75,${y} T100,${y}`} stroke={p.detail} strokeOpacity="0.5" fill="none" />
          ))}
        </>
      )
  }
}

// ============================================================
// Building silhouettes — escalate with tier
// ============================================================

function renderBuilding(key: AreaArtKey, p: PaletteEntry) {
  // All buildings sit on a common ground band around y=40–60. We position the
  // primary structure in the lower-middle area and scale with tier.
  switch (key) {
    case 'village':
      return (
        <g transform="translate(38,32)">
          <rect x="0" y="8" width="10" height="8" fill={p.detail} />
          <polygon points="-1,8 5,2 11,8" fill={p.accent} />
          <rect x="14" y="10" width="8" height="6" fill={p.detail} />
          <polygon points="13,10 18,5 23,10" fill={p.accent} />
        </g>
      )
    case 'town':
      return (
        <g transform="translate(32,26)">
          <rect x="0" y="10" width="10" height="12" fill={p.detail} />
          <polygon points="-1,10 5,3 11,10" fill={p.accent} />
          <rect x="13" y="12" width="10" height="10" fill={p.detail} />
          <polygon points="12,12 18,5 24,12" fill={p.accent} />
          <rect x="26" y="14" width="8" height="8" fill={p.detail} />
          <polygon points="25,14 30,8 35,14" fill={p.accent} />
          {/* Town centre */}
          <rect x="14" y="6" width="4" height="6" fill={p.accent} />
        </g>
      )
    case 'city':
      return (
        <g transform="translate(20,18)">
          {/* Wall */}
          <rect x="0" y="22" width="60" height="6" fill={p.detail} />
          {[3, 12, 21, 30, 39, 48, 57].map((x) => (
            <rect key={x} x={x} y="20" width="3" height="3" fill={p.detail} />
          ))}
          {/* Multiple buildings inside */}
          <rect x="6" y="12" width="8" height="10" fill={p.detail} />
          <polygon points="5,12 10,6 15,12" fill={p.accent} />
          <rect x="18" y="8" width="6" height="14" fill={p.detail} />
          <polygon points="17,8 21,3 25,8" fill={p.accent} />
          <rect x="28" y="10" width="10" height="12" fill={p.detail} />
          <polygon points="27,10 33,4 39,10" fill={p.accent} />
          <rect x="42" y="6" width="8" height="16" fill={p.detail} />
          <polygon points="41,6 46,0 51,6" fill={p.accent} />
        </g>
      )
    case 'keep':
      return (
        <g transform="translate(40,22)">
          <rect x="0" y="10" width="14" height="18" fill={p.detail} />
          {/* Crenellations */}
          {[0, 4, 8, 12].map((x) => (
            <rect key={x} x={x} y="7" width="2" height="3" fill={p.detail} />
          ))}
          <rect x="5" y="20" width="4" height="8" fill={p.accent} />
        </g>
      )
    case 'castle':
      return (
        <g transform="translate(28,16)">
          {/* Two flanking towers + central keep */}
          <rect x="0" y="12" width="8" height="22" fill={p.detail} />
          {[0, 3, 6].map((x) => (
            <rect key={x} x={x} y="9" width="2" height="3" fill={p.detail} />
          ))}
          <rect x="32" y="12" width="8" height="22" fill={p.detail} />
          {[32, 35, 38].map((x) => (
            <rect key={x} x={x} y="9" width="2" height="3" fill={p.detail} />
          ))}
          <rect x="10" y="16" width="20" height="18" fill={p.detail} />
          <polygon points="8,16 20,4 32,16" fill={p.accent} />
          <rect x="17" y="26" width="6" height="8" fill={p.accent} />
        </g>
      )
    case 'citadel':
      return (
        <g transform="translate(15,10)">
          {/* Tiered fortress */}
          <rect x="0" y="32" width="70" height="10" fill={p.detail} />
          {[0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66].map((x) => (
            <rect key={x} x={x} y="29" width="3" height="3" fill={p.detail} />
          ))}
          <rect x="10" y="20" width="50" height="12" fill={p.detail} />
          <rect x="22" y="8" width="26" height="12" fill={p.detail} />
          <polygon points="20,8 35,-2 50,8" fill={p.accent} />
          {/* Towers */}
          <rect x="0" y="10" width="6" height="22" fill={p.detail} />
          <polygon points="-1,10 3,5 7,10" fill={p.accent} />
          <rect x="64" y="10" width="6" height="22" fill={p.detail} />
          <polygon points="63,10 67,5 71,10" fill={p.accent} />
          {/* Banner */}
          <line x1="35" y1="-2" x2="35" y2="-8" stroke={p.detail} />
          <polygon points="35,-8 41,-6 35,-4" fill={p.accent} />
        </g>
      )
    case 'mine':
      return (
        <g transform="translate(40,30)">
          {/* Mine entrance arch */}
          <path d="M0,18 L0,8 Q8,0 16,8 L16,18 Z" fill={p.detail} />
          <path d="M3,18 L3,10 Q8,5 13,10 L13,18 Z" fill="#1a0e08" />
          {/* Pile of stones */}
          <circle cx="22" cy="17" r="2" fill={p.accent} />
          <circle cx="25" cy="18" r="1.5" fill={p.accent} />
          <circle cx="20" cy="18" r="1" fill={p.accent} />
        </g>
      )
    default:
      return null
  }
}
