import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { RealmRow } from '../lib/realmIo'
import { useAuth } from './useAuth'
import { queryKeys } from './queryKeys'

/**
 * Returns the current user's realms (most recent first).
 *
 * Wrapped in TanStack Query so:
 *   - Multiple components mounting RealmsPage share one fetch.
 *   - The list refreshes automatically after a useCreateRealm() mutation
 *     (Phase 2c) invalidates queryKeys.realms.list.
 *   - We get loading / error states for free.
 *
 * Authorization is enforced by Supabase Row-Level Security: even if we forget
 * to filter by owner_id here, the user only sees their own realms. Belt + braces.
 */
export function useRealms() {
  const { user } = useAuth()
  return useQuery<RealmRow[]>({
    queryKey: queryKeys.realms.list(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('realms')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}
