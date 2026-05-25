import type { RealmState } from '../rules/state'
import {
  MINISTER_ROLES,
  MINISTER_ROLE_DESCRIPTION,
  MINISTER_ROLE_LABEL,
  annualMinisterCost,
  findMinisterByRole,
  totalAnnualMinisterCost,
} from '../rules/actions/ministers'
import { loyaltyDescription } from '../rules/state'
import type { MinisterRole } from '../rules/actions/ministers'
import { SectionIcon } from './SectionIcon'

interface Props {
  realm: RealmState
}

const ROLE_ORDER: MinisterRole[] = MINISTER_ROLES

export function MinistersSection({ realm }: Props) {
  const totalCost = totalAnnualMinisterCost(realm.ministers)
  const ministerCount = realm.ministers.length
  const vacancies = ROLE_ORDER.filter((r) => !findMinisterByRole(realm.ministers, r))

  return (
    <section className="mb-8">
      <h2 className="empire-subheading text-xl font-serif font-semibold mb-3 flex items-center gap-2">
        <SectionIcon name="ministers" />
        Ministers{' '}
        <span className="text-sm text-stone-500 font-normal">
          ({ministerCount}/3 filled)
        </span>
      </h2>

      <div className="text-sm text-stone-500 mb-3">
        Yearly stipend: <strong>{totalCost} gold</strong>. Unpaid ministers resign at spring.{' '}
        {vacancies.length > 0 && (
          <span>
            Vacant role{vacancies.length === 1 ? '' : 's'}: ruler personally covers them and takes a{' '}
            <strong>-2 circumstance penalty</strong> on related checks.
          </span>
        )}
      </div>

      <ul className="grid sm:grid-cols-3 gap-2">
        {ROLE_ORDER.map((role) => (
          <MinisterCard key={role} realm={realm} role={role} />
        ))}
      </ul>
    </section>
  )
}

function MinisterCard({ realm, role }: { realm: RealmState; role: MinisterRole }) {
  const minister = findMinisterByRole(realm.ministers, role)
  const label = MINISTER_ROLE_LABEL[role]
  const desc = MINISTER_ROLE_DESCRIPTION[role]

  if (!minister) {
    return (
      <li className="border border-dashed border-stone-300 dark:border-stone-700 rounded p-3 bg-stone-50 dark:bg-stone-900/50">
        <div className="font-medium">{label}</div>
        <div className="text-sm text-stone-500 italic">Vacant — ruler covers (-2 penalty).</div>
        <div className="text-xs text-stone-500 mt-1.5">{desc}</div>
      </li>
    )
  }

  // Look up the minister's loyalty group (created by executeRecruitMinister).
  const loyalty = realm.loyaltyGroups.find(
    (g) => g.kind === 'minister' && g.attachedTo === minister.id,
  )
  const loyaltyText = loyalty ? loyaltyDescription(loyalty.score) : null

  return (
    <li className="border border-stone-200 dark:border-stone-800 rounded p-3 bg-white dark:bg-stone-900">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-medium truncate" title={minister.name}>
          {minister.name}
        </div>
        <div className="text-xs text-stone-500 uppercase tracking-wide">{label}</div>
      </div>
      <div className="text-sm text-stone-500 mt-0.5">
        Level {minister.level} · {annualMinisterCost(minister)} gp/yr
      </div>
      {loyalty && loyaltyText && (
        <div className="text-xs mt-1.5">
          <span className="text-stone-500">Loyalty</span>{' '}
          <span
            className={
              loyaltyText.tone === 'crisis'
                ? 'text-red-600 dark:text-red-400 font-medium'
                : loyaltyText.tone === 'unhappy'
                  ? 'text-amber-600 dark:text-amber-400'
                  : loyaltyText.tone === 'fanatic' || loyaltyText.tone === 'positive'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-stone-700 dark:text-stone-300'
            }
          >
            {loyalty.score >= 0 ? '+' : ''}{loyalty.score} ({loyaltyText.label})
          </span>
        </div>
      )}
    </li>
  )
}
