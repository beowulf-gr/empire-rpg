import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { saveRealm } from '../lib/realmIo'
import type { RealmState } from '../rules/state'
import { setHarvestMode, surveyForMinerals, type SurveyResult } from '../rules/survey'
import { createRng } from '../rules/rng'
import { queryKeys } from './queryKeys'

export type SurveyVars =
  | {
      realmId: string
      op: 'survey'
      areaId: string
    }
  | {
      realmId: string
      op: 'set-mode'
      areaId: string
      mode: 'stone' | 'mineral'
    }

/**
 * Performs a survey-for-minerals OR a simple stone/mineral mode toggle on a
 * hills/mountain area. The survey op rolls d100 (twice for mountains) and
 * returns the full SurveyResult so the parent panel can show a dialog with
 * the rolls + discovered mineral. The set-mode op is a no-roll flip used
 * when the area is already surveyed.
 *
 * On success: cache is updated and persisted via saveRealm.
 */
export function useSurveyArea() {
  const queryClient = useQueryClient()

  return useMutation<
    { state: RealmState; survey: SurveyResult | null },
    Error,
    SurveyVars
  >({
    mutationFn: async (vars) => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(vars.realmId))
      if (!cached) throw new Error('Realm not loaded')

      if (vars.op === 'set-mode') {
        const next = setHarvestMode(cached, vars.areaId, vars.mode)
        queryClient.setQueryData(queryKeys.realms.detail(vars.realmId), next)
        await saveRealm(supabase, next)
        return { state: next, survey: null }
      }

      // Survey: seed RNG from the realm clock + areaId + survey-attempt
      // count so re-clicks produce different rolls (no replay determinism).
      const seed =
        Date.now() ^
        (cached.year * 1000 + (cached.season === 'spring' ? 0 : 1)) ^
        vars.areaId.charCodeAt(0)
      const rng = createRng(seed >>> 0)
      const result = surveyForMinerals(cached, vars.areaId, rng)
      queryClient.setQueryData(queryKeys.realms.detail(vars.realmId), result.state)
      await saveRealm(supabase, result.state)
      return { state: result.state, survey: result }
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(vars.realmId) })
    },
  })
}
