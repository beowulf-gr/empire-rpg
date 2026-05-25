import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { saveRealm } from '../lib/realmIo'
import {
  createStartingDomain,
  type CustomAreaSpec,
  type CustomStrongholdSpec,
} from '../rules/createDomain'
import type { RealmState, RulerStats } from '../rules/state'
import type {
  ClimateTemplate,
  Race,
  RealmScale,
  ResourcePool,
} from '../types/rules'
import { useAuth } from './useAuth'
import { queryKeys } from './queryKeys'

export interface CreateRealmInput {
  name: string
  scale: RealmScale
  climateTemplate: ClimateTemplate
  /**
   * Optional starting populace mix. Each entry maps a race to the unit
   * count placed unallocated at realm creation. Omit (or pass empty) to
   * fall back to "all humans, half the area count". The sum overrides any
   * implicit starting-population default.
   */
  populationRaces?: Partial<Record<Race, number>>
  /** Optional ruler stats for the player character. */
  ruler?: RulerStats
  /**
   * Custom-mode inputs. When `customAreas` is provided, the engine bypasses
   * the climate-template area generator. The other custom-* fields are
   * independent of each other; see CreateDomainOptions for semantics.
   */
  customAreas?: ReadonlyArray<CustomAreaSpec>
  customStrongholds?: ReadonlyArray<CustomStrongholdSpec>
  customRoadPositions?: ReadonlyArray<{ x: number; y: number }>
  startingResources?: ResourcePool
}

/**
 * Creates a brand-new realm:
 *   1. Generate a complete starter RealmState client-side (createStartingDomain).
 *      All UUIDs, area layouts, starter pop, and starter resources come from
 *      the rules engine — the server is just a dumb store.
 *   2. Persist it via saveRealm (single realm row + 20 areas + populations + 2 strongholds).
 *   3. Invalidate the realms list so the new entry appears immediately.
 *
 * Returns the freshly-created RealmState on success so the caller can navigate
 * straight to /realms/{id}.
 */
export function useCreateRealm() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation<RealmState, Error, CreateRealmInput>({
    mutationFn: async (input) => {
      if (!user) throw new Error('You must be signed in to create a realm.')
      const realm = createStartingDomain({
        scale: input.scale,
        climateTemplate: input.climateTemplate,
        name: input.name.trim(),
        ownerId: user.id,
        startingPopulationRaces: input.populationRaces,
        ruler: input.ruler,
        customAreas: input.customAreas,
        customStrongholds: input.customStrongholds,
        customRoadPositions: input.customRoadPositions,
        startingResources: input.startingResources,
      })
      await saveRealm(supabase, realm)
      return realm
    },
    onSuccess: () => {
      // Invalidates both list and detail caches under the 'realms' root key.
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.all })
    },
  })
}
