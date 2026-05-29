import type { Season } from '../../types/rules'
import { ACTION_REGISTRY } from '../../rules/actions/registry'
import type { ActionDefinition, ActionId } from '../../rules/actions/types'
import { ActionButton } from './ActionButton'
import { SectionIcon } from '../SectionIcon'

interface Props {
  season: Season
  /** Action ids that have already been taken this season (auto or interactive). */
  takenIds: Set<ActionId>
  /** Called when the player clicks an interactive action's button. Parent opens the panel. */
  onTakeAction: (action: ActionDefinition) => void
}

/**
 * The four season-relevance subsections each part of the UI is split into.
 *
 *   mandatory: obligatory + auto-resolved in this season
 *   available: discretionary action whose home season matches
 *   penalty:   action available this season at a penalty
 *   generic:   any-season actions (Buy, Sell, Trade Goods, Loans, Taxes, Diplomacy)
 */
interface Buckets {
  mandatory: ActionDefinition[]
  available: ActionDefinition[]
  penalty: ActionDefinition[]
  generic: ActionDefinition[]
}

function emptyBuckets(): Buckets {
  return { mandatory: [], available: [], penalty: [], generic: [] }
}

function bucketCount(b: Buckets): number {
  return b.mandatory.length + b.available.length + b.penalty.length + b.generic.length
}

/**
 * Sort every registered action into one of four season-relevance subsections
 * AND one of two availability parts:
 *
 *   - `available` (part 1): action is NOT in takenIds — user can take it now.
 *   - `unavailable` (part 2): action IS in takenIds — auto-completed mandatory,
 *     exhausted limited, or otherwise "already done this season".
 *
 * Actions that have no place this season at all (wrong season + no penalty
 * restriction) are dropped from both parts.
 */
function bucketize(
  season: Season,
  takenIds: Set<ActionId>,
): { available: Buckets; unavailable: Buckets } {
  const available = emptyBuckets()
  const unavailable = emptyBuckets()

  for (const a of ACTION_REGISTRY) {
    const isHomeSeason = a.availability.seasons.includes(season)
    const isProhibited = a.availability.prohibited?.includes(season) ?? false
    const restriction = a.availability.restricted?.find((r) => r.season === season)

    let subsection: keyof Buckets | null = null

    if (a.descriptors.includes('obligatory') && a.kind === 'auto' && isHomeSeason) {
      subsection = 'mandatory'
    } else if (a.category === 'generic') {
      if (isProhibited) continue
      subsection = restriction ? 'penalty' : 'generic'
    } else if (isHomeSeason) {
      subsection = 'available'
    } else if (restriction) {
      subsection = 'penalty'
    } else {
      continue // wrong season, no restriction → not relevant this season at all
    }

    const part = takenIds.has(a.id) ? unavailable : available
    part[subsection].push(a)
  }

  return { available, unavailable }
}

export function ActionsSection({ season, takenIds, onTakeAction }: Props) {
  const { available, unavailable } = bucketize(season, takenIds)

  const renderAction = (a: ActionDefinition, statusOverride?: 'penalty') => {
    const restriction = a.availability.restricted?.find((r) => r.season === season)
    const taken = takenIds.has(a.id)

    let status: 'idle' | 'completed' | 'penalty' | 'unavailable' = 'idle'
    if (taken) status = 'completed'
    else if (statusOverride === 'penalty') status = 'penalty'
    else if (!a.implemented) status = 'idle' // still clickable but the modal will warn

    return (
      <ActionButton
        key={a.id}
        action={a}
        status={status}
        statusNote={statusOverride === 'penalty' ? restriction?.penalty : undefined}
        onTakeAction={a.kind === 'interactive' ? () => onTakeAction(a) : undefined}
      />
    )
  }

  const renderBuckets = (b: Buckets) => (
    <>
      {b.mandatory.length > 0 && (
        <Group title="Mandatory this season" hint="Auto-resolved when the season transitions.">
          {b.mandatory.map((a) => renderAction(a))}
        </Group>
      )}
      {b.available.length > 0 && (
        <Group title="Available this season">
          {b.available.map((a) => renderAction(a))}
        </Group>
      )}
      {b.penalty.length > 0 && (
        <Group title="Available with a penalty">
          {b.penalty.map((a) => renderAction(a, 'penalty'))}
        </Group>
      )}
      {b.generic.length > 0 && (
        <Group title="Generic (any season)">
          {b.generic.map((a) => renderAction(a))}
        </Group>
      )}
    </>
  )

  const unavailableCount = bucketCount(unavailable)
  const availableCount = bucketCount(available)

  return (
    <section className="mb-8">
      <h2 className="empire-subheading text-xl font-serif font-semibold mb-3 flex items-center gap-2">
        <SectionIcon name="actions" />
        Actions
      </h2>

      {availableCount > 0 ? (
        renderBuckets(available)
      ) : (
        <p className="text-sm text-stone-500 italic mb-3">
          No actions available this season. Expand the section below to review what's
          already been resolved or used up.
        </p>
      )}

      {unavailableCount > 0 && (
        <details className="group mt-4 border-t border-[var(--paper-edge)] pt-3">
          <summary
            className="cursor-pointer list-none flex items-baseline justify-between text-sm font-semibold text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 [&::-webkit-details-marker]:hidden"
          >
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block text-xs transition-transform duration-150 group-open:rotate-90"
              >
                ▶
              </span>
              Unavailable / completed ({unavailableCount})
            </span>
            <span className="text-xs text-stone-500 font-normal">
              Auto-resolved obligatories and exhausted Limited actions
            </span>
          </summary>
          <div className="mt-3">{renderBuckets(unavailable)}</div>
        </details>
      )}
    </section>
  )
}

function Group({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">{title}</h3>
        {hint && <span className="text-xs text-stone-500">{hint}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>
    </div>
  )
}
