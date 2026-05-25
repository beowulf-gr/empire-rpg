import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  loyaltyDescription,
  type LoyaltyGroup,
  type RealmState,
} from '../rules/state'
import {
  findMoraleBribe,
  moraleBribeBonusPerGp,
  setMoraleBribe,
} from '../rules/actions/bribery'
import { saveRealm } from '../lib/realmIo'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../hooks/queryKeys'
import { SectionIcon } from './SectionIcon'

interface Props {
  realm: RealmState
  realmId?: string
}

const KIND_LABELS: Record<LoyaltyGroup['kind'], string> = {
  commoners: 'Commoners',
  military: 'Military',
  minister: 'Minister',
  faction: 'Faction',
}

const TONE_CLASSES = {
  crisis:   'text-red-700 dark:text-red-400',
  unhappy:  'text-amber-700 dark:text-amber-400',
  neutral:  'text-stone-600 dark:text-stone-400',
  positive: 'text-emerald-700 dark:text-emerald-400',
  fanatic:  'text-emerald-800 dark:text-emerald-300 font-semibold',
} as const

/**
 * Loyalty panel — one row per loyalty group with score, descriptor band, and
 * a small tooltip summarizing the d20-vs-DC mechanic.
 *
 * Per-group bribery slot (3g.7): each row has a small +/- control for the
 * gp committed to bribing that group on the next morale check. Gold is
 * deducted at allocation time; bribes apply at the next spring's morale
 * upkeep and are cleared regardless of outcome.
 *
 * Hidden when no groups exist.
 */
export function LoyaltySection({ realm, realmId }: Props) {
  const queryClient = useQueryClient()
  const bribe = useMutation({
    mutationFn: async (vars: { groupId: string; gp: number }) => {
      const cached = realmId
        ? queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
        : null
      if (!realmId || !cached) throw new Error('Realm not loaded')
      const next = setMoraleBribe(cached, vars.groupId, vars.gp)
      queryClient.setQueryData(queryKeys.realms.detail(realmId), next)
      await saveRealm(supabase, next)
      return next
    },
    onSettled: () => {
      if (realmId) queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  if (realm.loyaltyGroups.length === 0) return null

  const adjust = (groupId: string, delta: number) => {
    const current = findMoraleBribe(realm, groupId)?.gp ?? 0
    const next = Math.max(0, current + delta)
    void bribe.mutateAsync({ groupId, gp: next })
  }

  return (
    <section className="mb-8">
      <h2 className="empire-subheading text-xl font-serif font-semibold mb-1 flex items-center gap-2">
        <SectionIcon name="loyalty" />
        Loyalty
      </h2>
      {realmId && (
        <p className="text-xs text-stone-500 mb-3">
          Bribes (1 gp = +2 to a group, +5 to a minister) are committed immediately and
          applied at next spring's Morale Upkeep. On a successful check, +1 loyalty as
          bread-and-circuses bonus.
        </p>
      )}
      <ul className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded">
        {realm.loyaltyGroups.map((g) => {
          const desc = loyaltyDescription(g.score)
          const bribeGp = findMoraleBribe(realm, g.id)?.gp ?? 0
          const perGp = moraleBribeBonusPerGp(realm, g.id)
          const bonus = bribeGp * perGp
          return (
            <li
              key={g.id}
              className="px-4 py-3 flex items-baseline justify-between gap-3 flex-wrap"
              title={`Will save +${g.baseWillSave}. Loyalty checks roll d20 + score + Will vs DC.`}
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium">{g.label}</span>
                <span className="ml-2 text-xs uppercase tracking-wide text-stone-500">
                  {KIND_LABELS[g.kind]}
                </span>
              </div>
              <div className="flex items-baseline gap-3 shrink-0">
                <span className={`text-sm ${TONE_CLASSES[desc.tone]}`}>{desc.label}</span>
                <span className="font-mono font-semibold text-lg w-10 text-right">
                  {g.score >= 0 ? `+${g.score}` : g.score}
                </span>
              </div>
              {realmId && (
                <div className="basis-full flex items-center gap-2 text-xs text-stone-500">
                  <span>Bribe:</span>
                  <button
                    type="button"
                    onClick={() => adjust(g.id, -1)}
                    disabled={bribeGp === 0 || bribe.isPending}
                    className="w-6 h-6 border border-stone-300 dark:border-stone-700 rounded hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
                    aria-label="Decrease bribe"
                  >
                    −
                  </button>
                  <span className="font-mono w-8 text-center">{bribeGp} gp</span>
                  <button
                    type="button"
                    onClick={() => adjust(g.id, +1)}
                    disabled={realm.resources.gold === 0 || bribe.isPending}
                    className="w-6 h-6 border border-stone-300 dark:border-stone-700 rounded hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
                    aria-label="Increase bribe"
                  >
                    +
                  </button>
                  {bribeGp > 0 && (
                    <span className="text-stone-500">
                      = +{bonus} on next morale check
                    </span>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {bribe.error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">
          {bribe.error.message}
        </p>
      )}
    </section>
  )
}
