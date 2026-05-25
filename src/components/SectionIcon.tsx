/**
 * Small decorative icon shown next to a section heading on the realm page.
 *
 * Currently renders inline SVG placeholders so the app ships without any
 * binary assets. To swap a placeholder for a real image:
 *
 *   1. Drop the file into `src/assets/icons/section/{name}.png` (or .svg).
 *   2. In this file, replace the matching entry in PLACEHOLDERS with:
 *          import populationIcon from '../assets/icons/section/population.png'
 *      and render `<img src={populationIcon} ... />` instead of the inline SVG.
 *
 * The wrapper sizing (24×24) is consistent across all section headings so
 * the icons line up. Names below mirror the section titles on RealmDetailPage
 * — add new entries here when you add new sections.
 */

import type { ReactNode } from 'react'

export type SectionIconName =
  | 'resources'
  | 'ruler'
  | 'population'
  | 'loyalty'
  | 'military'
  | 'ministers'
  | 'trade_goods'
  | 'trade_routes'
  | 'actions'
  | 'ongoing'
  | 'areas'
  | 'strongholds'

interface Props {
  name: SectionIconName
  /** Override the default 24×24 size for one-off uses (e.g. compact rows). */
  size?: number
  className?: string
}

const STROKE = 'currentColor'

/**
 * Placeholder inline SVGs. Each is a single-stroke icon drawn from a 24×24
 * viewBox so they read at any size and inherit the heading's text colour.
 * Once real images are dropped into `src/assets/icons/section/`, swap the
 * matching entry below for an <img> tag.
 */
const PLACEHOLDERS: Record<SectionIconName, ReactNode> = {
  // A pile of coins
  resources: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
      <path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
      <path d="M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
    </>
  ),
  // A simple crown
  ruler: (
    <>
      <path d="M3 8l3 8h12l3-8-5 3-4-6-4 6-5-3z" />
      <path d="M6 19h12" />
    </>
  ),
  // Little person silhouette
  population: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M5 21c0-4 3.1-7 7-7s7 3 7 7" />
    </>
  ),
  // A heart for loyalty
  loyalty: (
    <>
      <path d="M12 20s-7-4.5-7-10a4.5 4.5 0 0 1 7-3.6A4.5 4.5 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </>
  ),
  // Crossed swords
  military: (
    <>
      <path d="M4 4l9 9" />
      <path d="M4 12l4 4" />
      <path d="M20 4l-9 9" />
      <path d="M20 12l-4 4" />
      <path d="M9 19l-4 1 1-4" />
      <path d="M15 19l4 1-1-4" />
    </>
  ),
  // Scroll for ministers
  ministers: (
    <>
      <path d="M5 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5z" />
      <path d="M18 6h2v12a2 2 0 0 1-2 2" />
      <path d="M8 8h7M8 12h7M8 16h5" />
    </>
  ),
  // Stack of crates
  trade_goods: (
    <>
      <rect x="3" y="9" width="8" height="6" />
      <rect x="13" y="9" width="8" height="6" />
      <rect x="8" y="3" width="8" height="6" />
      <rect x="8" y="15" width="8" height="6" />
    </>
  ),
  // Winding road
  trade_routes: (
    <>
      <path d="M4 20c2-3 0-5 2-8s4-1 6-4 0-5 2-6" />
      <circle cx="4" cy="20" r="1.5" />
      <circle cx="20" cy="2" r="1.5" />
    </>
  ),
  // Hand pointing
  actions: (
    <>
      <path d="M9 11V5a2 2 0 1 1 4 0v6" />
      <path d="M13 7a2 2 0 1 1 4 0v6" />
      <path d="M17 9a2 2 0 1 1 4 0v6c0 3-2 5-5 5h-4l-5-4a2 2 0 0 1 1-3l3 1V11" />
    </>
  ),
  // Hourglass for ongoing
  ongoing: (
    <>
      <path d="M6 2h12" />
      <path d="M6 22h12" />
      <path d="M6 2c0 5 6 7 6 10s-6 5-6 10" />
      <path d="M18 2c0 5-6 7-6 10s6 5 6 10" />
    </>
  ),
  // Map/grid for areas
  areas: (
    <>
      <path d="M3 5l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 3v16" />
      <path d="M15 5v16" />
    </>
  ),
  // Tower silhouette
  strongholds: (
    <>
      <path d="M5 21V9l3-3v-3h2v3l2-2 2 2v-3h2v3l3 3v12z" />
      <path d="M10 21v-5h4v5" />
    </>
  ),
}

export function SectionIcon({ name, size = 22, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={STROKE}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 text-[var(--wine,#7a2e2e)] ${className ?? ''}`}
      aria-hidden="true"
    >
      {PLACEHOLDERS[name]}
    </svg>
  )
}
