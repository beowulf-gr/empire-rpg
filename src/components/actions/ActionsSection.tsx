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
 * Bucket actions by relevance to the current season.
 *
 *   mandatory: obligatory + auto-resolved this season (always shown as completed
 *              once they've fired; for MVP they fire during transitions)
 *   available: discretionary action whose home season matches
 *   penalty:   action available this season at a penalty
 *   generic:   any-season actions (Buy, Sell, Trade Goods, Loans, Taxes, Diplomacy)
 */
function bucketize(season: Season): {
  mandatory: ActionDefinition[]
  available: ActionDefinition[]
  penalty: ActionDefinition[]
  generic: ActionDefinition[]
} {
  const mandatory: ActionDefinition[] = []
  const available: ActionDefinition[] = []
  const penalty: ActionDefinition[] = []
  const generic: ActionDefinition[] = []

  for (const a of ACTION_REGISTRY) {
    const isHomeSeason = a.availability.seasons.includes(season)
    const isProhibited = a.availability.prohibited?.includes(season) ?? false
    const restriction = a.availability.restricted?.find((r) => r.season === season)

    if (a.descriptors.includes('obligatory') && a.kind === 'auto' && isHomeSeason) {
      mandatory.push(a)
      continue
    }

    if (a.category === 'generic') {
      // Generic actions: home-season for them is "any" (they have all 4 listed). Only
      // bucket here if no penalty applies in current season; otherwise mark as penalty.
      if (isProhibited) continue
      if (restriction) penalty.push(a)
      else generic.push(a)
      continue
    }

    if (isHomeSeason) {
      available.push(a)
      continue
    }
    if (restriction) {
      penalty.push(a)
      continue
    }
    // Otherwise: not available this season at all → skip
  }

  return { mandatory, available, penalty, generic }
}

export function ActionsSection({ season, takenIds, onTakeAction }: Props) {
  const { mandatory, available, penalty, generic } = bucketize(season)

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

  return (
    <section className="mb-8">
      <h2 className="empire-subheading text-xl font-serif font-semibold mb-3 flex items-center gap-2">
        <SectionIcon name="actions" />
        Actions
      </h2>

      {mandatory.length > 0 && (
        <Group title="Mandatory this season" hint="Auto-resolved when the season transitions.">
          {mandatory.map((a) => renderAction(a))}
        </Group>
      )}

      {available.length > 0 && (
        <Group title="Available this season">
          {available.map((a) => renderAction(a))}
        </Group>
      )}

      {penalty.length > 0 && (
        <Group title="Available with a penalty">
          {penalty.map((a) => renderAction(a, 'penalty'))}
        </Group>
      )}

      {generic.length > 0 && (
        <Group title="Generic (any season)">
          {generic.map((a) => renderAction(a))}
        </Group>
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
