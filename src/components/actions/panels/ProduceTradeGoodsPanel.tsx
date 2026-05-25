import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import {
  availableProductionSlots,
  MINERAL_GP_PER_UNIT,
  MINERAL_RESOURCES,
  mineralUnitsForGpValue,
  strongholdProductionCapacity,
  TRADE_GOOD_KINDS,
  TRADE_GOOD_LABEL,
  TRADE_GOOD_RECIPES,
  startProduceTradeGoods,
} from '../../../rules/actions/tradeGoods'
import type { MineralResource, TradeGoodKind } from '../../../rules/actions/tradeGoods'
import { totalIdlePopulation } from '../../../rules/actions/populationCommit'
import { queryKeys } from '../../../hooks/queryKeys'
import type { Race } from '../../../types/rules'
import { isWorkforceMixValid, WorkforceMixPicker } from '../WorkforceMixPicker'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

/**
 * Always-visible prerequisite labels per recipe — the player should know
 * what's gating each kind even when the realm currently satisfies it.
 * Kept in sync with the `requires` arrays on TRADE_GOOD_RECIPES.
 */
const RECIPE_PREREQ_LABEL: Record<TradeGoodKind, string | null> = {
  exotic_items: "Requires a Craftsmen's Guild somewhere in the realm.",
  magic_items: "Requires a Wizards' Academy or any elf population unit.",
  weapons_and_armor: "Requires a Craftsmen's Guild somewhere in the realm.",
  wooden_goods: "Requires a Craftsmen's Guild somewhere in the realm.",
}

export function ProduceTradeGoodsPanel({ realm, realmId, onClose }: Props) {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<TradeGoodKind>('exotic_items')
  const [strongholdId, setStrongholdId] = useState<string>('')
  const [mineral, setMineral] = useState<MineralResource>('iron')
  const [raceMix, setRaceMix] = useState<Partial<Record<Race, number>> | undefined>(undefined)

  // Strongholds with production capacity (Village/Town/City).
  const producerStrongholds = useMemo(() => {
    return realm.strongholds
      .filter((s) => strongholdProductionCapacity(s.id, realm) > 0)
      .map((s) => {
        const cap = strongholdProductionCapacity(s.id, realm)
        const free = availableProductionSlots(s.id, realm)
        const area = realm.areas.find((a) => a.id === s.areaId)
        const idx = realm.areas.findIndex((a) => a.id === s.areaId) + 1
        return { stronghold: s, cap, free, area, idx }
      })
  }, [realm])

  // Default-pick the first stronghold with free capacity once data is ready.
  if (!strongholdId && producerStrongholds.length > 0) {
    const first = producerStrongholds.find((p) => p.free > 0) ?? producerStrongholds[0]
    setStrongholdId(first.stronghold.id)
  }

  const recipe = TRADE_GOOD_RECIPES[kind]
  const selected = producerStrongholds.find((p) => p.stronghold.id === strongholdId)

  // Validate prerequisites. The engine returns an error string when the
  // prereq isn't met; null when it's satisfied. We surface the failing
  // one as a blocker, plus a static label for each recipe so the player
  // always knows what's gating the recipe even when their realm currently
  // satisfies it.
  const prereqError = recipe.requires
    .map((r) => r(realm))
    .find((err) => err !== null) ?? null
  const prereqLabel = RECIPE_PREREQ_LABEL[kind]

  // Mineral cost (if recipe needs one)
  const mineralUnitsNeeded =
    recipe.mineralValueGp !== undefined
      ? mineralUnitsForGpValue(mineral, recipe.mineralValueGp)
      : 0

  // Resource cost
  const resourceShortfall = (() => {
    if (recipe.resourceCost) {
      const have = realm.resources[recipe.resourceCost.resource]
      if (have < recipe.resourceCost.amount) {
        return `Need ${recipe.resourceCost.amount} ${recipe.resourceCost.resource}, have ${have}.`
      }
    }
    if (recipe.mineralValueGp !== undefined) {
      const have = realm.resources[mineral]
      if (have < mineralUnitsNeeded) {
        return `Need ${mineralUnitsNeeded} ${mineral}, have ${have}.`
      }
    }
    return null
  })()

  const noStronghold = !selected
  const noFreeSlot = selected ? selected.free === 0 : true
  const idle = totalIdlePopulation(realm)
  const popShortfall = idle < recipe.population
  const mixOk = isWorkforceMixValid(realm, raceMix, recipe.population)

  const canSubmit =
    !noStronghold && !noFreeSlot && !prereqError && !resourceShortfall && !popShortfall && mixOk

  const start = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const params =
        recipe.mineralValueGp !== undefined
          ? { kind, strongholdId, mineral, raceMix }
          : { kind, strongholdId, raceMix }
      const { state } = startProduceTradeGoods(cached, params)
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  const submit = async () => {
    try {
      await start.mutateAsync()
      onClose()
    } catch {
      /* surfaced via start.error */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Produce Trade Goods</h3>
          <p className="text-sm text-stone-500">
            Convert raw resources into finished goods at a Village (1/season),
            Town (4/season), or City (8/season). Goods accumulate in their own
            inventory; sell them later or issue them to military units.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {producerStrongholds.length === 0 ? (
            <div className="text-sm text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
              No production-capable strongholds. Build a Village, Town, or City first.
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-sm font-medium">Trade good</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as TradeGoodKind)}
                  className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
                >
                  {TRADE_GOOD_KINDS.map((k) => {
                    const r = TRADE_GOOD_RECIPES[k]
                    return (
                      <option key={k} value={k}>
                        {TRADE_GOOD_LABEL[k]} — {r.seasons} season{r.seasons === 1 ? '' : 's'}, sells {r.salePrice} gp
                      </option>
                    )
                  })}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Stronghold</span>
                <select
                  value={strongholdId}
                  onChange={(e) => setStrongholdId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
                >
                  {producerStrongholds.map((p) => {
                    const label = `${p.stronghold.kind} on area #${p.idx} — ${p.free}/${p.cap} slot${p.cap === 1 ? '' : 's'} free`
                    return (
                      <option key={p.stronghold.id} value={p.stronghold.id}>
                        {label}
                      </option>
                    )
                  })}
                </select>
              </label>

              {recipe.mineralValueGp !== undefined && (
                <label className="block">
                  <span className="text-sm font-medium">Mineral to use</span>
                  <select
                    value={mineral}
                    onChange={(e) => setMineral(e.target.value as MineralResource)}
                    className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
                  >
                    {MINERAL_RESOURCES.map((m) => {
                      const need = mineralUnitsForGpValue(m, recipe.mineralValueGp!)
                      const have = realm.resources[m]
                      const ok = have >= need
                      return (
                        <option key={m} value={m}>
                          {m} (need {need}, have {have}{ok ? '' : ' — short'}, {MINERAL_GP_PER_UNIT[m]} gp/unit)
                        </option>
                      )
                    })}
                  </select>
                  <span className="text-xs text-stone-500 mt-1 block">
                    Recipe needs minerals worth {recipe.mineralValueGp} gp. Fractional units round up.
                  </span>
                </label>
              )}

              <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm space-y-1">
                <div className="text-stone-500 text-xs">Cost</div>
                <ul className="text-xs space-y-0.5">
                  {recipe.resourceCost && (
                    <li>
                      {recipe.resourceCost.amount} {recipe.resourceCost.resource}
                    </li>
                  )}
                  {recipe.mineralValueGp !== undefined && (
                    <li>
                      {mineralUnitsNeeded} {mineral} (≈ {recipe.mineralValueGp} gp value)
                    </li>
                  )}
                  <li>
                    {recipe.population} population (drawn from idle, return home on completion).{' '}
                    Idle workers:{' '}
                    <strong className={popShortfall ? 'text-red-600 dark:text-red-400' : ''}>
                      {idle}
                    </strong>
                  </li>
                  <li>
                    {recipe.seasons} season{recipe.seasons === 1 ? '' : 's'} duration
                  </li>
                </ul>
              </div>

              {prereqError ? (
                <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 rounded p-2" role="alert">
                  {prereqError}
                </div>
              ) : prereqLabel ? (
                <div className="text-xs text-stone-500 italic">
                  {prereqLabel} <span className="text-emerald-600 dark:text-emerald-400 not-italic">✓ satisfied</span>
                </div>
              ) : null}
              {noStronghold && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  Pick a stronghold.
                </p>
              )}
              {noFreeSlot && selected && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  No free production slots at this {selected.stronghold.kind}.
                </p>
              )}
              {resourceShortfall && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {resourceShortfall}
                </p>
              )}
              {popShortfall && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  Need {recipe.population} idle worker{recipe.population === 1 ? '' : 's'},
                  only {idle} available. Free workers via Move Settlers / Harvest Terrain first.
                </p>
              )}
              {!popShortfall && recipe.population > 0 && (
                <WorkforceMixPicker
                  realm={realm}
                  required={recipe.population}
                  value={raceMix}
                  onChange={setRaceMix}
                />
              )}
              {start.error && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {start.error.message}
                </p>
              )}
            </>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!canSubmit || start.isPending}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {start.isPending ? 'Starting…' : 'Start production'}
          </button>
        </footer>
      </div>
    </div>
  )
}
