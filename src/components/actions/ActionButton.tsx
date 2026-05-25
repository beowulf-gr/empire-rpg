import { useState } from 'react'
import type { ActionDefinition } from '../../rules/actions/types'
import { ActionDetailsModal } from './ActionDetailsModal'

interface Props {
  action: ActionDefinition
  /**
   * Called when the player wants to actually invoke the action (not just view
   * details). For auto/obligatory actions this isn't needed (they fire in
   * transitions). For interactive actions the parent opens the panel here.
   */
  onTakeAction?: () => void
  /** Visual state — "completed" means the action ran already this season (auto). */
  status?: 'idle' | 'completed' | 'penalty' | 'unavailable'
  /** Free-text reason rendered when status === 'unavailable' or 'penalty'. */
  statusNote?: string
}

const DESCRIPTOR_LABELS: Record<string, string> = {
  limited: 'Limited',
  obligatory: 'Obligatory',
  construction: 'Construction',
  political: 'Political',
}

function describeShortCost(cost: ActionDefinition['cost']): string | null {
  if (!cost) return null
  if (cost.variable) return 'variable cost'
  const parts: string[] = []
  if (cost.gold) parts.push(`${cost.gold}g`)
  if (cost.lumber) parts.push(`${cost.lumber}L`)
  if (cost.stone) parts.push(`${cost.stone}S`)
  if (cost.food) parts.push(`${cost.food}F`)
  if (cost.population) parts.push(`${cost.population}p`)
  if (cost.seasons) parts.push(`${cost.seasons}sn`)
  return parts.length ? parts.join(' ') : null
}

/**
 * One action in the actions menu. Click → opens the panel (via onTakeAction)
 * or the details modal if onTakeAction isn't provided. Hover shows a tooltip.
 */
export function ActionButton({ action, onTakeAction, status = 'idle', statusNote }: Props) {
  const [showDetails, setShowDetails] = useState(false)

  const isObligatory = action.descriptors.includes('obligatory')
  const isCompleted = status === 'completed'
  const isPenalty = status === 'penalty'
  const isUnavailable = status === 'unavailable'

  const shortCost = describeShortCost(action.cost)

  // Visual: greyed out if completed/unavailable, amber border if penalty
  // Visual treatment: a base class for the variant + an opacity fade for
  // stub actions so the player can tell at a glance which buttons actually
  // do something today.
  // Theme: parchment surface, gold accent on obligatory actions, amber for
  // penalty, gentle fade on completed/unavailable.
  const baseVariant = isCompleted
    ? 'border-[var(--paper-edge)] bg-[color-mix(in_oklab,var(--paper)_70%,var(--paper-2)_30%)] opacity-60'
    : isUnavailable
      ? 'border-[var(--paper-edge)] opacity-40 cursor-not-allowed'
      : isPenalty
        ? 'border-amber-500/70 dark:border-amber-600/60 hover:bg-amber-50/60 dark:hover:bg-amber-950/30'
        : isObligatory
          ? 'border-[var(--gold)]/60 bg-[color-mix(in_oklab,var(--paper-2)_85%,var(--gold)_15%)] hover:bg-[color-mix(in_oklab,var(--paper-2)_70%,var(--gold)_30%)]'
          : 'border-[var(--paper-edge)] bg-[var(--paper-2)] hover:bg-[color-mix(in_oklab,var(--paper-2)_85%,var(--ink)_8%)]'

  const stubFade = !action.implemented && !isCompleted && !isUnavailable ? ' opacity-75' : ''

  const buttonClass =
    'group relative w-full text-left px-3 py-2 rounded-md border transition-colors ' +
    baseVariant +
    stubFade

  const handleClick = () => {
    if (isUnavailable || isCompleted) return
    // Unimplemented actions: always show the details modal (with the full
    // book text and a disabled "Take this action" button) instead of calling
    // the parent's no-op handler. Avoids dead-feeling clicks.
    if (!action.implemented) {
      setShowDetails(true)
      return
    }
    if (onTakeAction) onTakeAction()
    else setShowDetails(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isUnavailable}
        className={buttonClass}
        title={action.shortDescription}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-sm">
            {isCompleted && <span className="mr-1.5 text-emerald-600 dark:text-emerald-400">✓</span>}
            {action.name}
          </span>
          <div className="flex gap-1 flex-wrap justify-end">
            {action.descriptors.map((d) => (
              <span
                key={d}
                className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200"
              >
                {DESCRIPTOR_LABELS[d] ?? d}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-stone-500">
          <span className="line-clamp-2">{action.shortDescription}</span>
          {shortCost && <span className="shrink-0 font-mono">{shortCost}</span>}
        </div>

        {(statusNote || !action.implemented) && (
          <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
            {statusNote ?? 'Coming soon'}
          </div>
        )}

        {/* "More details" link — separate clickable region, doesn't trigger the parent button */}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            setShowDetails(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              setShowDetails(true)
            }
          }}
          className="inline-block mt-1 text-[11px] text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 underline cursor-pointer"
        >
          More details →
        </span>
      </button>

      {showDetails && (
        <ActionDetailsModal
          action={action}
          onClose={() => setShowDetails(false)}
          onTakeAction={
            onTakeAction && !isCompleted && !isUnavailable
              ? () => {
                  setShowDetails(false)
                  onTakeAction()
                }
              : undefined
          }
          takeActionDisabled={!action.implemented}
          takeActionLabel={action.implemented ? 'Take this action' : 'Coming soon'}
        />
      )}
    </>
  )
}
