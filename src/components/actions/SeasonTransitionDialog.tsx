import type { Season } from '../../types/rules'
import type { TurnEvent } from '../../rules/state'
import { describeEvent } from './describeEvent'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface Props {
  /** Heading shown at the top — e.g. "End of Spring of year 1" or "Year 1 begins". */
  title: string
  /** Optional subtitle — e.g. the new season after the transition. */
  subtitle?: string
  events: TurnEvent[]
  /** Optional realm context so describeEvent can resolve area indices and action names. */
  realm?: import('../../rules/state').RealmState
  onDismiss: () => void
  /** Disables the dismiss button while a server save is in flight. */
  dismissing?: boolean
}

/**
 * Centered modal dialog that lists all events from a season transition
 * (or from a freshly-created realm's bootSpring chain). Replaces the
 * earlier inline SeasonSummary panel.
 */
export function SeasonTransitionDialog({
  title,
  subtitle,
  events,
  realm,
  onDismiss,
  dismissing = false,
}: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-lg">{title}</h3>
          {subtitle && (
            <p className="text-sm text-stone-500 mt-1">{subtitle}</p>
          )}
        </header>

        <ul className="px-5 py-4 overflow-y-auto space-y-2 text-sm">
          {events.length === 0 && (
            <li className="text-stone-500">Nothing to report.</li>
          )}
          {events.map((e, i) => (
            <li key={i} className="leading-snug">
              {describeEvent(e, realm)}
            </li>
          ))}
        </ul>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            onClick={onDismiss}
            disabled={dismissing}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {dismissing ? 'Saving…' : 'Continue'}
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Helper to format a transition title from old + new season/year. */
export function formatTransitionTitle(
  endedSeason: Season,
  endedYear: number,
  newSeason: Season,
  newYear: number,
): { title: string; subtitle: string } {
  return {
    title: `End of ${cap(endedSeason)}, year ${endedYear}`,
    subtitle: `Now ${cap(newSeason)}, year ${newYear}.`,
  }
}
