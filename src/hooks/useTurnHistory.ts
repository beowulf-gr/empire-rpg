import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { TurnEvent } from '../rules/state'
import { queryKeys } from './queryKeys'

export type Season = 'spring' | 'summer' | 'fall' | 'winter'

export interface TurnHistoryRow {
  id: string
  year: number
  season: Season
  events: TurnEvent[]
  createdAt: string
}

const SEASON_ORDER: Record<Season, number> = {
  spring: 0,
  summer: 1,
  fall: 2,
  winter: 3,
}

/**
 * Loads every turn_history row for a realm, ordered chronologically
 * (year ASC, season ASC). Each row is one season-end transition with
 * the events that fired during it.
 *
 * Pass `undefined` to disable.
 */
export function useTurnHistory(realmId: string | undefined) {
  return useQuery<TurnHistoryRow[]>({
    queryKey: queryKeys.turnHistory.forRealm(realmId),
    enabled: !!realmId,
    queryFn: async () => {
      if (!realmId) throw new Error('useTurnHistory called without an id')
      const { data, error } = await supabase
        .from('turn_history')
        .select('id, year, season, events, created_at')
        .eq('realm_id', realmId)
        .order('year', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      const rows: TurnHistoryRow[] = (data ?? []).map((r) => ({
        id: r.id as string,
        year: r.year as number,
        season: r.season as Season,
        events: (r.events as unknown as TurnEvent[]) ?? [],
        createdAt: r.created_at as string,
      }))
      // Belt-and-suspenders: enforce stable season ordering even if the
      // DB sort by created_at is off (e.g. two rows persisted in the same ms).
      rows.sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year
        return SEASON_ORDER[a.season] - SEASON_ORDER[b.season]
      })
      return rows
    },
  })
}
