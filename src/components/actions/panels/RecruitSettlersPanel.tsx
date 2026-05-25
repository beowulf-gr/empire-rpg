import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import { createRng } from '../../../rules/rng'
import {
  RECRUIT_SETTLERS_PER_SPRING,
  executeRecruitSettlers,
  recruitChecksThisSpring,
  recruitedRacesThisSpring,
  settlerCheckBaseBonus,
  settlerCheckResult,
} from '../../../rules/actions/recruit'
import type { Race } from '../../../types/rules'
import { queryKeys } from '../../../hooks/queryKeys'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

const RACE_LABELS: Record<Race, string> = {
  humans: 'Humans',
  dwarves: 'Dwarves',
  elves: 'Elves',
  gnomes: 'Gnomes',
  goblins: 'Goblins',
  halflings: 'Halflings',
  orcs: 'Orcs',
  undead: 'Undead',
}

const RACE_ORDER: Race[] = [
  'humans',
  'dwarves',
  'elves',
  'gnomes',
  'halflings',
  'orcs',
  'goblins',
  'undead',
]

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/**
 * Shape of the recruit_settlers event payload — captured locally so the
 * panel can display a "last attempt" card after each roll. Kept loose
 * (numbers + strings) to avoid pulling internal types in.
 */
interface LastAttempt {
  race: Race
  roll: number
  charismaMod: number
  ministerBonus: number
  ministerName: string | null
  loyaltyMod: number
  gpBonus: number
  gpModifier: number
  total: number
  settlers: number
  checksRemaining: number
}

export function RecruitSettlersPanel({ realm, realmId, onClose }: Props) {
  const queryClient = useQueryClient()
  const checksUsed = recruitChecksThisSpring(realm)
  const checksLeft = RECRUIT_SETTLERS_PER_SPRING - checksUsed
  const racesAlreadyTried = recruitedRacesThisSpring(realm)
  const wrongSeason = realm.season !== 'spring'

  // Default to the first available race
  const defaultRace = RACE_ORDER.find((r) => !racesAlreadyTried.has(r)) ?? 'humans'
  const [race, setRace] = useState<Race>(defaultRace)
  const [gpBonus, setGpBonus] = useState<number>(0)
  // After a successful roll we pin its result so the player can see the
  // breakdown before deciding their next move. Cleared by "Try another race".
  const [lastAttempt, setLastAttempt] = useState<LastAttempt | null>(null)

  const base = useMemo(() => settlerCheckBaseBonus(realm), [realm])
  // Static modifier sum (everything except the d20 roll). Used for the
  // panel's "expected range" preview.
  const staticMod =
    base.charismaMod + base.ministerBonus + base.loyaltyMod + gpBonus * 4

  // Worst case = roll 1, best case = roll 20.
  const minTotal = 1 + staticMod
  const maxTotal = 20 + staticMod
  const minSettlers = settlerCheckResult(minTotal)
  const maxSettlers = settlerCheckResult(maxTotal)

  const insufficientGold = gpBonus > realm.resources.gold
  const raceAlreadyTried = racesAlreadyTried.has(race)
  const noChecksLeft = checksLeft <= 0
  const invalidGp = !Number.isInteger(gpBonus) || gpBonus < 0

  const recruit = useMutation<LastAttempt, Error>({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      // Each call seeds its own RNG so the d20 doesn't repeat across rapid
      // clicks — using realm clock + race + checksUsed gives a stable but
      // distinct seed per attempt.
      const seed =
        Date.now() ^
        (cached.year * 1000 + (cached.season === 'spring' ? 0 : 1)) ^
        race.charCodeAt(0) ^
        recruitChecksThisSpring(cached)
      const rng = createRng(seed >>> 0)
      const { state, events } = executeRecruitSettlers(cached, { race, gpBonus }, rng)
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      // The first event from executeRecruitSettlers is always the
      // `recruit_settlers` summary. Pull its payload out for the result card.
      const payload = events[0].payload as unknown as LastAttempt
      return payload
    },
    onSuccess: (payload) => {
      setLastAttempt(payload)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  const canSubmit =
    !wrongSeason &&
    !noChecksLeft &&
    !raceAlreadyTried &&
    !insufficientGold &&
    !invalidGp &&
    !recruit.isPending &&
    lastAttempt === null

  const submit = async () => {
    try {
      await recruit.mutateAsync()
    } catch {
      /* surfaced via recruit.error */
    }
  }

  /**
   * "Try another race" handler. Clears the pinned result, picks the next
   * untried race from the fresh cache, and resets gpBonus. If no checks
   * remain we close the panel — there's nothing more to do.
   */
  const tryAnother = () => {
    setLastAttempt(null)
    const fresh = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
    const tried = fresh ? recruitedRacesThisSpring(fresh) : racesAlreadyTried
    const remaining = fresh ? RECRUIT_SETTLERS_PER_SPRING - recruitChecksThisSpring(fresh) : checksLeft
    if (remaining <= 0) {
      onClose()
      return
    }
    const next = RACE_ORDER.find((r) => !tried.has(r))
    if (next) setRace(next)
    setGpBonus(0)
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-serif font-semibold text-xl">Recruit Settlers</h3>
            <span className="text-xs text-stone-500">
              Check {checksUsed + 1} of {RECRUIT_SETTLERS_PER_SPRING}
            </span>
          </div>
          <p className="text-sm text-stone-500">
            Attract new arrivals of one race. d20 + Charisma + Prime Minister + commoner loyalty + 4 × gp spent.
            Each race may be tried once per spring.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {wrongSeason && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Recruit Settlers is a spring action. Current season: {realm.season}.
            </p>
          )}
          {!wrongSeason && noChecksLeft && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              All {RECRUIT_SETTLERS_PER_SPRING} settler checks have already been used this spring.
            </p>
          )}

          <fieldset disabled={wrongSeason || noChecksLeft || lastAttempt !== null}>
            <legend className="text-sm font-medium mb-1.5">Race</legend>
            <div className="grid grid-cols-4 gap-1.5">
              {RACE_ORDER.map((r) => {
                const tried = racesAlreadyTried.has(r)
                const selected = race === r
                return (
                  <label
                    key={r}
                    className={`border rounded-md px-2 py-1.5 text-center text-sm cursor-pointer transition-colors ${
                      tried
                        ? 'border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-800/40 text-stone-400 dark:text-stone-600 cursor-not-allowed'
                        : selected
                          ? 'border-stone-900 dark:border-stone-100 bg-stone-100 dark:bg-stone-800'
                          : 'border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="race"
                      value={r}
                      checked={selected}
                      disabled={tried}
                      onChange={() => setRace(r)}
                      className="sr-only"
                    />
                    <div>{RACE_LABELS[r]}</div>
                    {tried && <div className="text-[9px] mt-0.5">tried</div>}
                  </label>
                )
              })}
            </div>
          </fieldset>

          <label className={`block ${wrongSeason || noChecksLeft || lastAttempt !== null ? 'opacity-50' : ''}`}>
            <span className="text-sm font-medium">Gold incentives</span>
            <div className="mt-1 flex items-baseline gap-2">
              <input
                type="number"
                min="0"
                max={realm.resources.gold}
                step="1"
                value={gpBonus}
                disabled={wrongSeason || noChecksLeft || lastAttempt !== null}
                onChange={(e) => setGpBonus(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                className="w-24 rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
              />
              <span className="text-xs text-stone-500">
                gp ({fmtMod(gpBonus * 4)} to the roll · {realm.resources.gold} available)
              </span>
            </div>
          </label>

          <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm space-y-1">
            <div className="text-xs text-stone-500">Modifier breakdown:</div>
            <div className="flex flex-wrap gap-x-3 text-xs font-mono">
              <span>Cha {fmtMod(base.charismaMod)}</span>
              <span title={base.ministerName ? `${base.ministerName} (lvl ${base.ministerLevel})` : 'Vacant — ruler covers, -2 penalty'}>
                PM {fmtMod(base.ministerBonus)}
                {!base.ministerName && <span className="text-amber-600 dark:text-amber-400"> (vacant)</span>}
              </span>
              <span>Loyalty {fmtMod(base.loyaltyMod)}</span>
              <span>Gold {fmtMod(gpBonus * 4)}</span>
              <span className="text-stone-500">·</span>
              <span>Static: {fmtMod(staticMod)}</span>
            </div>
            <div className="text-xs text-stone-500">
              Roll d20{fmtMod(staticMod)} → {minTotal}–{maxTotal} → <strong>{minSettlers}</strong>
              {minSettlers !== maxSettlers && <> – <strong>{maxSettlers}</strong></>} settlers.
            </div>
          </div>

          {insufficientGold && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              Not enough gold (need {gpBonus}, have {realm.resources.gold}).
            </p>
          )}
          {recruit.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {recruit.error.message}
            </p>
          )}

          {lastAttempt && (
            <div
              className={`rounded-md border p-3 text-sm space-y-1 ${
                lastAttempt.settlers > 0
                  ? 'border-emerald-400/70 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30'
                  : 'border-amber-400/70 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30'
              }`}
              role="status"
            >
              <div className="font-medium">
                {RACE_LABELS[lastAttempt.race]} recruitment —{' '}
                {lastAttempt.settlers > 0 ? (
                  <span className="text-emerald-700 dark:text-emerald-300">
                    +{lastAttempt.settlers} new {RACE_LABELS[lastAttempt.race].toLowerCase()}
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">no new arrivals</span>
                )}
              </div>
              <div className="text-xs font-mono text-stone-600 dark:text-stone-400 tabular">
                rolled {lastAttempt.roll} {fmtMod(lastAttempt.charismaMod)} Cha{' '}
                {fmtMod(lastAttempt.ministerBonus)} PM
                {lastAttempt.ministerName ? ` (${lastAttempt.ministerName})` : ' (vacant)'}{' '}
                {fmtMod(lastAttempt.loyaltyMod)} loyalty
                {lastAttempt.gpBonus > 0 && (
                  <> {fmtMod(lastAttempt.gpModifier)} ({lastAttempt.gpBonus}gp incentives)</>
                )}{' '}
                = <strong className="text-stone-900 dark:text-stone-100">{lastAttempt.total}</strong>
              </div>
              <div className="text-xs text-stone-500">
                {lastAttempt.settlers > 0
                  ? 'They joined your unallocated pool — use Move Settlers to find them a home.'
                  : 'The check landed too low — no settlers attracted (the gp incentive was still spent).'}
                {lastAttempt.checksRemaining > 0 && (
                  <> {lastAttempt.checksRemaining} check{lastAttempt.checksRemaining === 1 ? '' : 's'} left this spring.</>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2">
          {lastAttempt ? (
            // Result pinned: offer "Done" or "Try another race" (only if a
            // race is still untried).
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Done
              </button>
              {lastAttempt.checksRemaining > 0 && (
                <button
                  onClick={tryAnother}
                  className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90"
                >
                  Try another race
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void submit()}
                disabled={!canSubmit}
                className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
              >
                {recruit.isPending ? 'Rolling…' : `Roll for ${RACE_LABELS[race]}`}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
