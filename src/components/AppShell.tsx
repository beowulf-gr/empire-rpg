import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  /**
   * What appears in the small top banner. Usually a "← back" link plus
   * maybe a logged-in indicator; the page-title heading lives in the
   * children, just below the banner.
   */
  topBar?: ReactNode
  /**
   * Page content. The shell takes care of width, padding, and the
   * background flourish; the page provides its own H1 with the
   * `.empire-heading` class for the gold rule.
   */
  children: ReactNode
  /**
   * Use this for full-width landing pages (Home / Login / Signup) that
   * want their own layout. Defaults to `max-w-5xl` centred.
   */
  wide?: boolean
}

/**
 * Single page shell used by every authenticated page. Provides:
 *   - A slim top bar with the realm logotype + back link slot
 *   - A consistent inner gutter
 *   - The shared parchment + gold-flourish backdrop
 *
 * Public landing/login pages don't use this — they have their own
 * full-height centred layouts.
 */
export function AppShell({ topBar, children, wide }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--paper-edge)] bg-[color-mix(in_oklab,var(--paper)_70%,var(--paper-2)_30%)] backdrop-blur-sm sticky top-0 z-10">
        <div className={`mx-auto px-6 py-3 flex items-baseline justify-between ${wide ? '' : 'max-w-5xl'}`}>
          <Link
            to="/realms"
            className="font-serif text-lg font-semibold tracking-wide hover:text-[var(--wine)] transition-colors"
            style={{ color: 'var(--ink)' }}
          >
            <span className="text-[var(--wine)]">⚜</span> Empire
          </Link>
          <div className="text-sm text-[var(--ink-soft)]">{topBar}</div>
        </div>
      </header>
      <main className={`mx-auto w-full ${wide ? '' : 'max-w-5xl'} px-6 py-8 flex-1`}>
        {children}
      </main>
    </div>
  )
}
