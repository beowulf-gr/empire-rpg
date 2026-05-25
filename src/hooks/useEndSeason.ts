import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { loadRealm, saveRealm } from '../lib/realmIo'
import { endSeason } from '../rules/actions/orchestrator'
import { createRng } from '../rules/rng'
import type { RealmState, TurnEvent } from '../rules/state'
import type { Json } from '../types/database'
import { queryKeys } from './queryKeys'

export interface EndSeasonResult {
  /** Realm state AFTER the season was resolved. */
  state: RealmState
  /** The season we just ended (e.g. "spring" if End Spring was clicked). */
  endedSeason: RealmState['season']
  /** The year that season belonged to (year may have ticked up after). */
  endedYear: number
  /** All events emitted during the transition (end-of-old + start-of-new). */
  events: TurnEvent[]
}

/**
 * Advances a realm by one season:
 *   1. Loads the latest state from the server.
 *   2. Calls endSeason from the orchestrator: runs end-of-old-season auto
 *      actions, ticks ongoing actions, transitions, then runs start-of-new
 *      auto actions.
 *   3. Inserts a turn_history row with all events (tagged by the OLD season).
 *   4. Saves the realm with cleared pendingEvents.
 *
 * Returns events to the dashboard so the season-transition pop-up can render
 * everything that happened.
 */
export function useEndSeason() {
  const queryClient = useQueryClient()

  return useMutation<EndSeasonResult, Error, { realmId: string }>({
    mutationFn: async ({ realmId }) => {
      const oldState = await loadRealm(supabase, realmId)
      const endedSeason = oldState.season
      const endedYear = oldState.year

      // The events emitted during the transition. Note: we run with
      // pendingEvents=[] so the resulting events are ONLY this transition's.
      const stateForResolve: RealmState = { ...oldState, pendingEvents: [] }
      const { state: newState, events } = endSeason(stateForResolve, createRng())

      if (events.length > 0) {
        const insertRes = await supabase.from('turn_history').insert({
          realm_id: realmId,
          year: endedYear,
          season: endedSeason,
          events: events as unknown as Json,
        })
        if (insertRes.error) throw insertRes.error
      }

      // The orchestrator doesn't write to pendingEvents; we don't either.
      // Make the saved state's pendingEvents explicit so subsequent loads
      // start clean.
      const stateToSave: RealmState = { ...newState, pendingEvents: [] }
      await saveRealm(supabase, stateToSave)

      return { state: stateToSave, endedSeason, endedYear, events }
    },
    onSuccess: ({ state }) => {
      queryClient.setQueryData(queryKeys.realms.detail(state.id), state)
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.all })
    },
  })
}
