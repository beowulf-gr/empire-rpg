import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { saveRealm } from '../lib/realmIo'
import {
  movePopulationHome,
  setPopulationWork,
  type MoveHomeInput,
  type SetWorkInput,
} from '../rules/assignPopulation'
import type { RealmState } from '../rules/state'
import { queryKeys } from './queryKeys'

/**
 * Discriminated-union variables for the two operations the engine exposes:
 *   - move-home: change where pop LIVES (settlement)
 *   - set-work:  change where pop WORKS (harvest assignment)
 *
 * Both are gated by the UI to Spring season; the engine doesn't enforce that
 * (it's a UX-level concern, not a rules-engine concern).
 */
export type AssignPopulationVars =
  | { realmId: string; op: 'move-home'; input: MoveHomeInput }
  | { realmId: string; op: 'set-work'; input: SetWorkInput }

/**
 * Mutation that updates population assignments. Optimistic: the cache is
 * updated in onMutate so +/- buttons feel instant. mutationFn just persists
 * the cached state to the server. On error we roll back.
 */
export function useAssignPopulation() {
  const queryClient = useQueryClient()

  return useMutation<RealmState, Error, AssignPopulationVars, { previous: RealmState }>({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.realms.detail(vars.realmId) })
      const previous = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(vars.realmId))
      if (!previous) {
        throw new Error('Realm not loaded — refresh and try again.')
      }
      const optimistic =
        vars.op === 'move-home'
          ? movePopulationHome(previous, vars.input)
          : setPopulationWork(previous, vars.input)
      queryClient.setQueryData(queryKeys.realms.detail(vars.realmId), optimistic)
      return { previous }
    },

    mutationFn: async (vars) => {
      const current = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(vars.realmId))
      if (!current) {
        throw new Error('Realm not in cache after optimistic update.')
      }
      await saveRealm(supabase, current)
      return current
    },

    onError: (_err, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.realms.detail(vars.realmId), context.previous)
      }
    },

    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(vars.realmId) })
    },
  })
}
