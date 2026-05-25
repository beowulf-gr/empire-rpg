import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { loadRealm } from '../lib/realmIo'
import type { RealmState } from '../rules/state'
import { queryKeys } from './queryKeys'

/**
 * Loads a single realm — the realm row plus its areas, populations, and
 * strongholds — and stitches them into a complete RealmState.
 *
 * Pass `undefined` to disable the query (e.g. while waiting for a route param
 * to resolve).
 *
 * The returned RealmState is what the rules engine and the dashboard UI both
 * operate on, so this hook is the single point of "data shaped for the game".
 */
export function useRealm(realmId: string | undefined) {
  return useQuery<RealmState>({
    queryKey: queryKeys.realms.detail(realmId),
    enabled: !!realmId,
    queryFn: async () => {
      if (!realmId) throw new Error('useRealm called without an id')
      return loadRealm(supabase, realmId)
    },
  })
}
