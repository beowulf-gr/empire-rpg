import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { saveRealm } from '../lib/realmIo'
import {
  startBuildRoads,
  startBuildStronghold,
  startConvertTerrain,
  // Re-use this hook for muster_soldiers since it also queues an OngoingAction
  type BuildRoadsParams,
  type BuildStrongholdParams,
  type ConvertTerrainParams,
} from '../rules/actions/construction'
import {
  startMusterSoldiers,
  type MusterSoldiersParams,
} from '../rules/actions/military'
import {
  startSurveyForNewVein,
  type SurveyForNewVeinParams,
} from '../rules/actions/surveyForNewVein'
import type { RealmState, TurnEvent } from '../rules/state'
import { queryKeys } from './queryKeys'

export type ConstructionStart =
  | { realmId: string; kind: 'build_roads'; params: BuildRoadsParams }
  | { realmId: string; kind: 'build_stronghold'; params: BuildStrongholdParams }
  | { realmId: string; kind: 'convert_terrain'; params: ConvertTerrainParams }
  | { realmId: string; kind: 'muster_soldiers'; params: MusterSoldiersParams }
  | { realmId: string; kind: 'survey_for_new_vein'; params: SurveyForNewVeinParams }

interface Result {
  state: RealmState
  events: TurnEvent[]
}

/**
 * Starts a construction action. Validation, cost deduction, and OngoingAction
 * creation happen in the engine (construction.ts). Errors propagate as
 * ConstructionError (engine) → React Query error.
 *
 * Optimistic: cache updates first, server save next. Rollback on error.
 */
export function useStartConstruction() {
  const queryClient = useQueryClient()

  return useMutation<Result, Error, ConstructionStart, { previous: RealmState }>({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.realms.detail(vars.realmId) })
      const previous = queryClient.getQueryData<RealmState>(
        queryKeys.realms.detail(vars.realmId),
      )
      if (!previous) throw new Error('Realm not loaded — refresh and try again.')
      const { state, events } = startOne(previous, vars)
      queryClient.setQueryData(queryKeys.realms.detail(vars.realmId), state)
      void events
      return { previous }
    },
    mutationFn: async (vars) => {
      const current = queryClient.getQueryData<RealmState>(
        queryKeys.realms.detail(vars.realmId),
      )
      if (!current) throw new Error('Realm not in cache after optimistic update.')
      await saveRealm(supabase, current)
      // Re-derive events for the dialog (events are recomputed because the
      // optimistic step already applied them; the second invocation returns
      // the same delta against the previous state).
      return { state: current, events: [] }
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.realms.detail(vars.realmId), context.previous)
      }
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(vars.realmId) })
    },
  })
}

function startOne(state: RealmState, vars: ConstructionStart): Result {
  switch (vars.kind) {
    case 'build_roads':
      return startBuildRoads(state, vars.params, state.year, state.season)
    case 'build_stronghold':
      return startBuildStronghold(state, vars.params, state.year, state.season)
    case 'convert_terrain':
      return startConvertTerrain(state, vars.params, state.year, state.season)
    case 'muster_soldiers':
      return startMusterSoldiers(state, vars.params, state.year, state.season)
    case 'survey_for_new_vein':
      return startSurveyForNewVein(state, vars.params, state.year, state.season)
  }
}
