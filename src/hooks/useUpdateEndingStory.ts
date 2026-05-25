import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { saveRealm } from '../lib/realmIo'
import type { EndingStory, RealmState } from '../rules/state'
import { queryKeys } from './queryKeys'

/**
 * Replaces the realm's `endingStory` with the provided value. Passing
 * `null` clears it (e.g. if the player decides to "un-finalize" their
 * chronicle and resume play). The serializer in realmIo trims and drops
 * empty fields, so an all-empty story persists as NULL.
 *
 * Optimistic: writes to the cache immediately, then persists.
 */
export function useUpdateEndingStory(realmId: string) {
  const queryClient = useQueryClient()

  return useMutation<RealmState, Error, EndingStory | null>({
    mutationFn: async (next) => {
      const cached = queryClient.getQueryData<RealmState>(
        queryKeys.realms.detail(realmId),
      )
      if (!cached) throw new Error('Realm not loaded')
      const updated: RealmState = { ...cached, endingStory: next }
      queryClient.setQueryData(queryKeys.realms.detail(realmId), updated)
      await saveRealm(supabase, updated)
      return updated
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })
}
