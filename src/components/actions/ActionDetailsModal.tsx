import type { ActionDefinition } from '../../rules/actions/types'

interface Props {
  action: ActionDefinition
  onClose: () => void
  onTakeAction?: () => void
  takeActionLabel?: string
  takeActionDisabled?: boolean
}

const DESCRIPTOR_LABELS: Record<string, string> = {
  limited: 'Limited',
  obligatory: 'Obligatory',
  construction: 'Construction',
  political: 'Political',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function describeCost(cost: ActionDefinition['cost']): string | null {
  if (!cost) return null
  if (cost.variable) return cost.note ?? 'Variable cost.'
  const parts: string[] = []
  if (cost.gold) parts.push(`${cost.gold} gold`)
  if (cost.lumber) parts.push(`${cost.lumber} lumber`)
  if (cost.stone) parts.push(`${cost.stone} stone`)
  if (cost.food) parts.push(`${cost.food} food`)
  if (cost.population) parts.push(`${cost.population} pop`)
  if (cost.seasons) parts.push(`${cost.seasons} season${cost.seasons === 1 ? '' : 's'}`)
  return parts.join(' · ') || null
}

/**
 * Modal dialog that shows the full book write-up for an action. Has an
 * optional "Take this action" button at the bottom for interactive actions
 * — wired up by the parent.
 */
export function ActionDetailsModal({
  action,
  onClose,
  onTakeAction,
  takeActionLabel = 'Take this action',
  takeActionDisabled = false,
}: Props) {
  const cost = describeCost(action.cost)
  const seasons = action.availability.seasons.map(cap).join(', ') || 'Any season'
  const restricted = action.availability.restricted ?? []
  const prohibited = action.availability.prohibited ?? []

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-serif font-semibold text-xl">{action.name}</h3>
            {action.source === 'homebrew' && (
              <span className="text-xs text-stone-500">(homebrew)</span>
            )}
          </div>
          {action.descriptors.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {action.descriptors.map((d) => (
                <span
                  key={d}
                  className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-700"
                >
                  {DESCRIPTOR_LABELS[d] ?? d}
                </span>
              ))}
            </div>
          )}
        </header>

        <div className="px-5 py-4 overflow-y-auto text-sm space-y-3">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-stone-500">Season(s):</dt>
            <dd>{seasons}</dd>
            {prohibited.length > 0 && (
              <>
                <dt className="text-stone-500">Prohibited:</dt>
                <dd>{prohibited.map(cap).join(', ')}</dd>
              </>
            )}
            {restricted.length > 0 && (
              <>
                <dt className="text-stone-500">Restricted:</dt>
                <dd>
                  {restricted.map((r) => `${cap(r.season)} (${r.penalty})`).join('; ')}
                </dd>
              </>
            )}
            {cost && (
              <>
                <dt className="text-stone-500">Cost:</dt>
                <dd>{cost}</dd>
              </>
            )}
          </dl>

          <div className="pt-2 border-t border-stone-200 dark:border-stone-800 leading-relaxed whitespace-pre-line">
            {action.bookText}
          </div>

          {!action.implemented && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⓘ This action's effect isn't implemented yet — coming in a later phase.
            </p>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Close
          </button>
          {onTakeAction && (
            <button
              onClick={onTakeAction}
              disabled={takeActionDisabled}
              className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
            >
              {takeActionLabel}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
