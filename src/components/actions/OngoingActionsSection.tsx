import { findActionById } from '../../rules/actions/registry'
import type { OngoingAction } from '../../rules/actions/types'
import { SectionIcon } from '../SectionIcon'

interface Props {
  ongoing: OngoingAction[]
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Lists ongoing multi-season actions with their seasons-remaining counter.
 * Hidden when the list is empty so a fresh realm doesn't show an empty box.
 */
export function OngoingActionsSection({ ongoing }: Props) {
  if (ongoing.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="empire-subheading text-xl font-serif font-semibold mb-3 flex items-center gap-2">
        <SectionIcon name="ongoing" />
        Ongoing Actions
      </h2>
      <ul className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded">
        {ongoing.map((oa) => {
          const def = findActionById(oa.actionId)
          const name = def?.name ?? oa.actionId
          const detail = describeOngoingAction(oa)
          return (
            <li key={oa.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="font-medium">{name}</span>
                  <span className="ml-2 text-xs text-stone-500">
                    started {cap(oa.startedSeason)}, year {oa.startedYear}
                  </span>
                </div>
                <div className="text-sm text-stone-500">
                  {oa.seasonsRemaining} season{oa.seasonsRemaining === 1 ? '' : 's'} remaining
                </div>
              </div>
              {detail && <div className="mt-1 text-xs text-stone-500">{detail}</div>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function describeOngoingAction(oa: OngoingAction): string | null {
  const p = oa.parameters as Record<string, unknown>
  switch (oa.actionId) {
    case 'build_roads': {
      const ids = (p.areaIds as string[]) ?? []
      return `Crossing ${ids.length} area${ids.length === 1 ? '' : 's'}${p.isolated ? ' (isolated)' : ''}.`
    }
    case 'build_stronghold':
      return `Building ${p.kind} on area ${p.areaId}.`
    case 'convert_terrain':
      return `Converting wasteland → ${p.newTerrain}${p.isolated ? ' (isolated)' : ''}.`
    case 'survey_for_new_vein':
      return `Prospecting for a new mineral vein.`
    default:
      return null
  }
}
