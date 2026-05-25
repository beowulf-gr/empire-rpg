import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from './queryKeys'

/**
 * Deletes a realm and (via DB-level ON DELETE CASCADE) all of its
 * areas, populations, strongholds, and turn_history rows.
 *
 * RLS ensures users can only delete realms they own — the WHERE clause
 * is belt-and-braces.
 *
 * On success we invalidate every cache under the 'realms' root key so
 * both the list and any stale per-realm detail caches are refetched.
 */
export function useDeleteRealm() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: async (realmId) => {
      const { error } = await supabase.from('realms').delete().eq('id', realmId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.all })
    },
  })
}
