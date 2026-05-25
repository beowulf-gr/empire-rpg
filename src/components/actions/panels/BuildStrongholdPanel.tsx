import { useState } from 'react'
import type { RealmState } from '../../../rules/state'
import type { MineResource, Race, StrongholdKind } from '../../../types/rules'
import { totalIdlePopulation } from '../../../rules/actions/populationCommit'
import { useStartConstruction } from '../../../hooks/useStartConstruction'
import { isWorkforceMixValid, WorkforceMixPicker } from '../WorkforceMixPicker'

/** Population cost per stronghold kind — mirrors the engine's STRONGHOLD_COSTS table. */
const STRONGHOLD_POP_COST: Record<StrongholdKind, number> = {
  village: 1, town: 1, city: 2,
  keep: 1, castle: 2, citadel: 4,
  mine: 1, wall: 1, marketplace: 1, port: 1,
  craftsmens_guild: 1, wizards_academy: 1, grand_temple: 1,
}

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

const KIND_OPTIONS: { value: StrongholdKind; label: string; group: string }[] = [
  // Settlements
  { value: 'village', label: 'Village (tier 3 settlement)', group: 'Settlements' },
  { value: 'town',    label: 'Town (tier 2 settlement)',    group: 'Settlements' },
  { value: 'city',    label: 'City (tier 1 settlement)',    group: 'Settlements' },
  // Fortifications
  { value: 'keep',    label: 'Keep (tier 3 fortification)', group: 'Fortifications' },
  { value: 'castle',  label: 'Castle (tier 2 fortification)', group: 'Fortifications' },
  { value: 'citadel', label: 'Citadel (tier 1, homebrew)',  group: 'Fortifications' },
  // Resource
  { value: 'mine',    label: 'Mine (hills/mountains)',      group: 'Resource' },
  // Add-ons
  { value: 'wall',              label: 'Wall (Town/City)',                group: 'Add-ons' },
  { value: 'marketplace',       label: 'Marketplace (Town/City)',         group: 'Add-ons' },
  { value: 'port',              label: 'Port (Town/City near water)',     group: 'Add-ons' },
  { value: 'craftsmens_guild',  label: "Craftsmen's Guild (Town/City)",   group: 'Add-ons' },
  { value: 'wizards_academy',   label: "Wizards' Academy (City only)",    group: 'Add-ons' },
  { value: 'grand_temple',      label: 'Grand Temple (City only)',        group: 'Add-ons' },
]

const STRONGHOLD_NAMES: Record<StrongholdKind, string> = {
  village: 'Village',
  town: 'Town',
  city: 'City',
  keep: 'Keep',
  castle: 'Castle',
  citadel: 'Citadel',
  mine: 'Mine',
  wall: 'Wall',
  marketplace: 'Marketplace',
  port: 'Port',
  craftsmens_guild: "Craftsmen's Guild",
  wizards_academy: "Wizards' Academy",
  grand_temple: 'Grand Temple',
}

function describeStrongholdsOnArea(realm: RealmState, areaId: string): string {
  const list = realm.strongholds.filter((s) => s.areaId === areaId)
  if (list.length === 0) return ''
  // Group identical kinds with counts: "Village×2, Keep"
  const counts = new Map<StrongholdKind, number>()
  for (const s of list) {
    counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([k, n]) => (n > 1 ? `${STRONGHOLD_NAMES[k]}×${n}` : STRONGHOLD_NAMES[k]))
    .join(', ')
}

const ADDON_KINDS: StrongholdKind[] = [
  'wall', 'marketplace', 'port', 'craftsmens_guild', 'wizards_academy', 'grand_temple',
]

export function BuildStrongholdPanel({ realm, realmId, onClose }: Props) {
  const [kind, setKind] = useState<StrongholdKind>('village')
  const [areaId, setAreaId] = useState<string>(realm.areas[0]?.id ?? '')
  const [mineResourceType, setMineResourceType] = useState<MineResource>('stone')
  const [parentStrongholdId, setParentStrongholdId] = useState<string>('')
  const [raceMix, setRaceMix] = useState<Partial<Record<Race, number>> | undefined>(undefined)
  // The player can name the new stronghold here. Pre-filled with the
  // default "{Kind} #N" label where N is the next index for that kind on
  // the realm. Empty string means "use the default" on completion.
  const defaultName = (() => {
    const n = realm.strongholds.filter((s) => s.kind === kind).length + 1
    return `${STRONGHOLD_NAMES[kind]} #${n}`
  })()
  const [name, setName] = useState<string>(defaultName)
  // When the kind changes, refresh the default unless the user has
  // already typed something distinct (heuristic: matches old default).
  const [lastDefault, setLastDefault] = useState<string>(defaultName)
  if (lastDefault !== defaultName) {
    if (name === lastDefault) setName(defaultName)
    setLastDefault(defaultName)
  }

  const start = useStartConstruction()
  const popNeeded = STRONGHOLD_POP_COST[kind]
  const idle = totalIdlePopulation(realm)
  const popShortfall = idle < popNeeded
  const mixOk = isWorkforceMixValid(realm, raceMix, popNeeded)

  const isAddon = ADDON_KINDS.includes(kind)
  const isMine = kind === 'mine'

  // Available parent strongholds on the chosen area (for add-ons)
  const parentCandidates = realm.strongholds.filter((s) => {
    if (s.areaId !== areaId) return false
    if (kind === 'wizards_academy' || kind === 'grand_temple') return s.kind === 'city'
    if (isAddon) return s.kind === 'town' || s.kind === 'city'
    return false
  })

  const submit = async () => {
    if (!areaId) return
    try {
      await start.mutateAsync({
        realmId,
        kind: 'build_stronghold',
        params: {
          kind,
          areaId,
          mineResourceType: isMine ? mineResourceType : undefined,
          parentStrongholdId: isAddon ? parentStrongholdId || undefined : undefined,
          raceMix,
          name: name.trim().length > 0 ? name.trim() : undefined,
        },
      })
      onClose()
    } catch {
      /* error surfaced */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Build Stronghold</h3>
          <p className="text-sm text-stone-500">
            Erect a settlement, fortification, mine, or add-on on a chosen area. Costs and
            duration vary by type — see the action's details for the full table.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as StrongholdKind)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            >
              {['Settlements', 'Fortifications', 'Resource', 'Add-ons'].map((group) => (
                <optgroup key={group} label={group}>
                  {KIND_OPTIONS.filter((o) => o.group === group).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultName}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            />
            <span className="mt-1 block text-xs text-stone-500">
              Leave as-is to keep the default, or type a custom name (e.g. "Stormhaven").
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Area</span>
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            >
              {realm.areas.map((a, idx) => {
                const existing = describeStrongholdsOnArea(realm, a.id)
                return (
                  <option key={a.id} value={a.id}>
                    #{idx + 1} {a.terrain}{existing ? ` — ${existing}` : ''}
                  </option>
                )
              })}
            </select>
          </label>

          {isMine && (
            <label className="block">
              <span className="text-sm font-medium">Mine type</span>
              <select
                value={mineResourceType}
                onChange={(e) => setMineResourceType(e.target.value as MineResource)}
                className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
              >
                <option value="stone">Stone</option>
                <option value="mineral">Mineral</option>
              </select>
            </label>
          )}

          {isAddon && (
            <label className="block">
              <span className="text-sm font-medium">Parent settlement on this area</span>
              <select
                value={parentStrongholdId}
                onChange={(e) => setParentStrongholdId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
              >
                <option value="">— select —</option>
                {parentCandidates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.kind} (id: {s.id.slice(0, 6)}…)
                  </option>
                ))}
              </select>
              {parentCandidates.length === 0 && (
                <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">
                  No qualifying parent on this area. Build a Town or City first.
                </span>
              )}
            </label>
          )}

          {(() => {
            const isSettlement = kind === 'village' || kind === 'town' || kind === 'city'
            return (
              <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-xs text-stone-500">
                Pop cost: <strong>{popNeeded}</strong> (drawn from idle).{' '}
                Idle workers:{' '}
                <strong className={popShortfall ? 'text-red-600 dark:text-red-400' : ''}>
                  {idle}
                </strong>
                {popShortfall && (
                  <span className="block mt-1 text-red-600 dark:text-red-400">
                    Free workers via Move Settlers / Harvest Terrain first.
                  </span>
                )}
                {isSettlement && (
                  <span className="block mt-1">
                    Workers will settle on this area as residents on completion.
                  </span>
                )}
                {!isSettlement && (
                  <span className="block mt-1">
                    Workers return home (idle) on completion.
                  </span>
                )}
              </div>
            )
          })()}

          {!popShortfall && (
            <WorkforceMixPicker
              realm={realm}
              required={popNeeded}
              value={raceMix}
              onChange={setRaceMix}
            />
          )}

          {start.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {start.error.message}
            </p>
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
            disabled={
              !areaId ||
              start.isPending ||
              (isAddon && !parentStrongholdId) ||
              popShortfall ||
              !mixOk
            }
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {start.isPending ? 'Starting…' : 'Start'}
          </button>
        </footer>
      </div>
    </div>
  )
}
