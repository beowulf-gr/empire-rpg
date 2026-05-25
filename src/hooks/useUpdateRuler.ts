import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { saveRealm } from '../lib/realmIo'
import type { RealmState, RulerStats } from '../rules/state'
import { queryKeys } from './queryKeys'

/**
 * Updates the player-character ruler stats on a realm. The mutation reads
 * the current realm from the React Query cache, splices in the new ruler
 * block, and persists via saveRealm. The mutation is structured so the
 * detail cache updates immediately (optimistic-style) and we then refetch
 * to confirm.
 */
export function useUpdateRuler(realmId: string) {
  const queryClient = useQueryClient()

  return useMutation<RealmState, Error, RulerStats>({
    mutationFn: async (nextRuler) => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const updated: RealmState = { ...cached, ruler: { ...nextRuler } }
      queryClient.setQueryData(queryKeys.realms.detail(realmId), updated)
      await saveRealm(supabase, updated)
      return updated
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })
}
