import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { saveRealm } from '../lib/realmIo'
import type { RealmState } from '../rules/state'
import { queryKeys } from './queryKeys'

/**
 * Clears `pendingEvents` on a realm. Used when the player dismisses the
 * season-transition dialog so the events don't reappear on page reload.
 *
 * Optimistic: cache updates first, server save next, rollback on error.
 */
export function useClearPendingEvents() {
  const queryClient = useQueryClient()

  return useMutation<RealmState, Error, string, { previous: RealmState }>({
    onMutate: async (realmId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.realms.detail(realmId) })
      const previous = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!previous) throw new Error('Realm not loaded')
      const cleared: RealmState = { ...previous, pendingEvents: [] }
      queryClient.setQueryData(queryKeys.realms.detail(realmId), cleared)
      return { previous }
    },
    mutationFn: async (realmId) => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not in cache')
      await saveRealm(supabase, cached)
      return cached
    },
    onError: (_err, realmId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.realms.detail(realmId), context.previous)
      }
    },
  })
}
