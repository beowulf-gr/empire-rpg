import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { saveRealm } from '../lib/realmIo'
import type { OriginStory, RealmState } from '../rules/state'
import { queryKeys } from './queryKeys'

/**
 * Replaces the realm's `originStory` with the provided value. Passing
 * `null` clears it. The serializer in realmIo trims and drops empty
 * fields, so values like { founding: '   ', rulerBackground: 'X' } save
 * as { rulerBackground: 'X' } and an all-empty story persists as NULL.
 *
 * Optimistic: writes to the cache immediately, then persists.
 */
export function useUpdateOriginStory(realmId: string) {
  const queryClient = useQueryClient()

  return useMutation<RealmState, Error, OriginStory | null>({
    mutationFn: async (next) => {
      const cached = queryClient.getQueryData<RealmState>(
        queryKeys.realms.detail(realmId),
      )
      if (!cached) throw new Error('Realm not loaded')
      const updated: RealmState = { ...cached, originStory: next }
      queryClient.setQueryData(queryKeys.realms.detail(realmId), updated)
      await saveRealm(supabase, updated)
      return updated
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })
}
