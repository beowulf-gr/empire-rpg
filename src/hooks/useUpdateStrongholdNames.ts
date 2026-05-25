import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { saveRealm } from '../lib/realmIo'
import type { RealmState } from '../rules/state'
import { queryKeys } from './queryKeys'

/**
 * Updates the player-given `name` field on one or more strongholds in a
 * realm. Accepts a partial map of `{strongholdId: newName}` and merges it
 * into the existing list (untouched strongholds keep their current name).
 * Empty strings are stored as `null` so the UI falls back to the default
 * "{Kind} #N" label.
 *
 * Used by:
 *   - The post-creation naming dialog (sends all starter strongholds).
 *   - The Strongholds section's inline rename button.
 *   - The Build Stronghold panel (sends the new stronghold's id + name on
 *     completion).
 */
export function useUpdateStrongholdNames(realmId: string) {
  const queryClient = useQueryClient()

  return useMutation<RealmState, Error, Record<string, string>>({
    mutationFn: async (nameById) => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const updated: RealmState = {
        ...cached,
        strongholds: cached.strongholds.map((s) => {
          if (!(s.id in nameById)) return s
          const trimmed = nameById[s.id].trim()
          return { ...s, name: trimmed.length === 0 ? null : trimmed }
        }),
      }
      queryClient.setQueryData(queryKeys.realms.detail(realmId), updated)
      await saveRealm(supabase, updated)
      return updated
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })
}
