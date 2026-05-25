import type { RealmState } from '../rules/state'
import { unitDisplayName, unitUpkeep } from '../rules/actions/military'
import type { MilitaryUnit } from '../rules/actions/military'
import {
  gearTier,
  totalGearGpPerSoldier,
  unitSoldierCount,
} from '../rules/actions/outfit'
import { SectionIcon } from './SectionIcon'

interface Props {
  realm: RealmState
}

const SOURCE_LABELS: Record<MilitaryUnit['source'], string> = {
  mustered:  'Mustered',
  mercenary: 'Mercenary',
}

const TIER_TONE: Record<ReturnType<typeof gearTier>['tone'], string> = {
  low:       'text-amber-700 dark:text-amber-400',
  standard:  'text-stone-600 dark:text-stone-400',
  good:      'text-emerald-700 dark:text-emerald-400',
  elite:     'text-emerald-800 dark:text-emerald-300 font-semibold',
  legendary: 'text-purple-700 dark:text-purple-400 font-semibold',
}

const SIZE_LABEL: Record<MilitaryUnit['size'], string> = {
  solo: 'Solo', tiny: 'Tiny', small: 'Small', medium: 'Medium-size',
  large: 'Large', huge: 'Huge', gargantuan: 'Gargantuan', colossal: 'Colossal',
}

export function MilitarySection({ realm }: Props) {
  if (realm.militaryUnits.length === 0) return null

  // Total upkeep next spring (so player can plan)
  const totals = realm.militaryUnits.reduce(
    (acc, u) => {
      const { food, gold } = unitUpkeep(u)
      acc.food += food
      acc.gold += gold
      return acc
    },
    { food: 0, gold: 0 },
  )

  return (
    <section className="mb-8">
      <h2 className="empire-subheading text-xl font-serif font-semibold mb-3 flex items-center gap-2">
        <SectionIcon name="military" />
        Military{' '}
        <span className="text-sm text-stone-500 font-normal">
          ({realm.militaryUnits.length} unit{realm.militaryUnits.length === 1 ? '' : 's'})
        </span>
      </h2>

      <div className="text-sm text-stone-500 mb-3">
        Yearly upkeep: <strong>{totals.food} food</strong> + <strong>{totals.gold} gold</strong>.
        Units that can't be supported in spring auto-disband.
      </div>

      <ul className="space-y-2">
        {realm.militaryUnits.map((u) => {
          const upkeep = unitUpkeep(u)
          const soldiers = unitSoldierCount(u, realm.scale)
          const tier = gearTier(u)
          const totalGear = totalGearGpPerSoldier(u)
          const stronghold = u.assignedStrongholdId
            ? realm.strongholds.find((s) => s.id === u.assignedStrongholdId)
            : null
          return (
            <li
              key={u.id}
              className="border border-stone-200 dark:border-stone-800 rounded p-3 bg-white dark:bg-stone-900"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <span className="font-medium">{unitDisplayName(u)}</span>
                  <span className="ml-2 text-xs uppercase tracking-wide text-stone-500">
                    {SOURCE_LABELS[u.source]}
                  </span>
                </div>
                <div className={`text-sm ${TIER_TONE[tier.tone]}`}>{tier.label}</div>
              </div>

              <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                <div>
                  <dt className="text-stone-500">Size</dt>
                  <dd>{SIZE_LABEL[u.size]} · {soldiers.toLocaleString()} soldiers</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Level / CR</dt>
                  <dd>
                    {u.source === 'mustered'
                      ? `Level ${u.level}`
                      : `CR ${u.cr}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Equipment</dt>
                  <dd>{u.equipmentGp} gp/soldier</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Magic</dt>
                  <dd>
                    {u.magicGp > 0 ? `${u.magicGp} gp/soldier` : (
                      <span className="text-stone-500">none</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Total gear</dt>
                  <dd className="font-medium">{totalGear} gp/soldier</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Upkeep</dt>
                  <dd>{upkeep.food}f + {upkeep.gold}g/year</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-stone-500">Stationed</dt>
                  <dd>
                    {stronghold ? (
                      <span>at {stronghold.kind}</span>
                    ) : (
                      <span className="text-stone-500 italic">not assigned (Manage Forces)</span>
                    )}
                  </dd>
                </div>
              </dl>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
