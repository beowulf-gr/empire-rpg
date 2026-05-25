import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { saveRealm } from '../lib/realmIo'
import type { RealmState } from '../rules/state'
import { queryKeys } from './queryKeys'

/**
 * Generic "save this entire RealmState" mutation used by the DM-tools
 * editor. The editor pages compute the next state locally (no rules-engine
 * mediation, since the whole point is to bypass the rules), then call this
 * hook to persist + sync the cache.
 *
 * Optimistic: the cache flips to the new state immediately so the form
 * stays consistent with what the user just edited. On error the previous
 * cache is restored. We always invalidate on settled so any drift between
 * client and server (e.g. an updated_at the engine doesn't know about) is
 * resolved by the next read.
 */
export function useReplaceRealm() {
  const queryClient = useQueryClient()

  return useMutation<RealmState, Error, RealmState, { previous: RealmState | undefined }>({
    onMutate: async (next) => {
      const key = queryKeys.realms.detail(next.id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<RealmState>(key)
      queryClient.setQueryData(key, next)
      return { previous }
    },

    mutationFn: async (next) => {
      await saveRealm(supabase, next)
      return next
    },

    onError: (_err, next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.realms.detail(next.id), context.previous)
      }
    },

    onSettled: (_data, _err, next) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(next.id) })
    },
  })
}
