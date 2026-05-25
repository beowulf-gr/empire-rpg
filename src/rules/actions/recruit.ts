/**
 * Recruit Settlers (book §6.1) — interactive, spring-only, Limited.
 *
 * Each spring the ruler may attempt up to three settler checks, one per
 * race. Each check rolls:
 *
 *   d20 + Charisma mod + Prime Minister bonus + commoner loyalty + 4 × gp
 *
 * The Prime Minister substitutes for the ruler's Charisma when present
 * (and applies the level-based bonus); a vacant PM slot incurs the -2
 * vacancy penalty. Each gp committed to the check pays for "incentives"
 * — wagons, pamphlets, heralded promises — and adds +4 to the check.
 *
 * Settler-check table (digest §6.1):
 *
 *   ≤ 10  → 0 settlers
 *   11–15 → 1 settler
 *   16–20 → 2 settlers
 *   +5 above 20 → +1 more  (so 21–25 = 3, 26–30 = 4, …)
 *
 * Limits enforced by the engine:
 *   - season must be spring
 *   - at most three recruit_settlers calls per spring
 *   - each race may be attempted at most once per spring
 *   - gp cost must be available in state.resources.gold
 *
 * Settlers always land in the unallocated pool (homeAreaId = null,
 * workAreaId = null) so the player must place them via Move Settlers.
 * This deliberately avoids the famine trap of the old auto-recruit, where
 * uncontrollable population growth could overwhelm food stores.
 */

import type { Race } from '../../types/rules'
import type { PopulationStack, RealmState, TurnEvent } from '../state'
import { abilityMod, findCommonersGroup } from '../state'
import type { Rng } from '../rng'
import type { ActionId, ActionLog } from './types'
import { ministerCheckBonus, VACANCY_PENALTY } from './ministers'

export class RecruitSettlersError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecruitSettlersError'
  }
}

export interface RecruitSettlersParams {
  /** Race the recruitment effort targets — must not have been attempted this spring. */
  race: Race
  /**
   * Gold "incentives" to spend on the check. Each gp = +4 to the d20 roll.
   * Must be a non-negative integer; 0 is allowed for a no-budget attempt.
   */
  gpBonus: number
}

export interface RecruitSettlersOutcome {
  state: RealmState
  events: TurnEvent[]
}

/** Max settler checks per spring per the book. */
export const RECRUIT_SETTLERS_PER_SPRING = 3

/** Returns the number of settler checks already taken this spring. */
export function recruitChecksThisSpring(state: RealmState): number {
  return state.actionsThisSeason.filter((l) => l.actionId === 'recruit_settlers').length
}

/** Returns the set of races already attempted this spring (each once max). */
export function recruitedRacesThisSpring(state: RealmState): Set<Race> {
  const out = new Set<Race>()
  for (const log of state.actionsThisSeason) {
    if (log.actionId !== 'recruit_settlers') continue
    const race = log.meta?.race
    if (typeof race === 'string') out.add(race as Race)
  }
  return out
}

/**
 * Settler-check table (book §6.1). Exported for tests + the panel preview.
 *
 *   ≤ 10  → 0
 *   11-15 → 1
 *   16-20 → 2
 *   +5 above 20 → +1 (21-25 = 3, 26-30 = 4, …)
 */
export function settlerCheckResult(total: number): number {
  if (total <= 10) return 0
  if (total <= 15) return 1
  if (total <= 20) return 2
  return 2 + Math.ceil((total - 20) / 5)
}

/**
 * Returns the static modifiers used by the settler check (everything except
 * the d20 roll and gpBonus). Useful for the Recruit Settlers panel preview
 * so the player can see what they're rolling against before committing gold.
 */
export function settlerCheckBaseBonus(state: RealmState): {
  charismaMod: number
  ministerBonus: number
  ministerName: string | null
  ministerLevel: number | null
  loyaltyMod: number
} {
  const commoners = findCommonersGroup(state)
  // The settler check already pulls the ruler's Charisma in as `charismaMod`,
  // so when the PM role is vacant we DON'T want ministerCheckBonus to add
  // it a second time via its ruler-covered path. We override the vacant
  // bonus to a plain -2 (the book's circumstance penalty) and let
  // charismaMod carry the ruler's social presence.
  const charismaMod = abilityMod(state.ruler.charisma)
  const { bonus: ministerBonus, minister } = ministerCheckBonus(
    state,
    'prime_minister',
    { vacantBonus: VACANCY_PENALTY },
  )
  return {
    charismaMod,
    ministerBonus,
    ministerName: minister?.name ?? null,
    ministerLevel: minister?.level ?? null,
    loyaltyMod: commoners?.score ?? 0,
  }
}

/**
 * Adds N settlers of `race` to the unallocated pool (home=null, work=null).
 * Merges with an existing matching stack if one is present.
 */
function addRecruitsToPool(
  populations: PopulationStack[],
  race: Race,
  count: number,
  uuid: () => string,
): PopulationStack[] {
  const idx = populations.findIndex(
    (p) => p.race === race && p.homeAreaId === null && p.workAreaId === null,
  )
  if (idx >= 0) {
    return populations.map((p, i) => (i === idx ? { ...p, count: p.count + count } : p))
  }
  return [
    ...populations,
    { id: uuid(), race, count, homeAreaId: null, workAreaId: null },
  ]
}

/**
 * Run one settler-check attempt for the given race. Validates spring,
 * the per-spring 3-check cap, the per-race-once rule, and gold budget;
 * spends gold, rolls the check, and (on success) appends recruits to the
 * unallocated pool.
 *
 * Always appends an entry to actionsThisSeason — even a check that returns
 * 0 settlers counts toward the 3-check cap, which matches the book.
 */
export function executeRecruitSettlers(
  state: RealmState,
  params: RecruitSettlersParams,
  rng: Rng,
  uuid: () => string = () => crypto.randomUUID(),
): RecruitSettlersOutcome {
  const { race, gpBonus } = params

  if (state.season !== 'spring') {
    throw new RecruitSettlersError(
      `Recruit Settlers is a spring action (current season: ${state.season}).`,
    )
  }
  if (!Number.isInteger(gpBonus) || gpBonus < 0) {
    throw new RecruitSettlersError(`gpBonus must be a non-negative integer (got ${gpBonus}).`)
  }
  if (gpBonus > state.resources.gold) {
    throw new RecruitSettlersError(
      `Not enough gold (need ${gpBonus}, have ${state.resources.gold}).`,
    )
  }
  if (recruitChecksThisSpring(state) >= RECRUIT_SETTLERS_PER_SPRING) {
    throw new RecruitSettlersError(
      `Already used all ${RECRUIT_SETTLERS_PER_SPRING} settler checks this spring.`,
    )
  }
  if (recruitedRacesThisSpring(state).has(race)) {
    throw new RecruitSettlersError(
      `${race} have already been recruited this spring (one check per race).`,
    )
  }

  const { charismaMod, ministerBonus, ministerName, ministerLevel, loyaltyMod } =
    settlerCheckBaseBonus(state)

  const roll = rng.d20()
  const gpModifier = gpBonus * 4
  const total = roll + charismaMod + ministerBonus + loyaltyMod + gpModifier
  const settlers = settlerCheckResult(total)

  // Deduct gp and add settlers (if any).
  const nextResources = { ...state.resources, gold: state.resources.gold - gpBonus }
  const nextPopulations =
    settlers > 0 ? addRecruitsToPool(state.populations, race, settlers, uuid) : state.populations

  const log: ActionLog = {
    actionId: 'recruit_settlers' as ActionId,
    takenAt: new Date().toISOString(),
    meta: { race, gpBonus, total, settlers },
  }

  const event: TurnEvent = {
    type: 'recruit_settlers',
    payload: {
      race,
      roll,
      charismaMod,
      ministerBonus,
      ministerName,
      ministerLevel,
      loyaltyMod,
      gpBonus,
      gpModifier,
      total,
      settlers,
      checksUsed: recruitChecksThisSpring(state) + 1,
      checksRemaining: RECRUIT_SETTLERS_PER_SPRING - recruitChecksThisSpring(state) - 1,
    },
  }

  return {
    state: {
      ...state,
      resources: nextResources,
      populations: nextPopulations,
      actionsThisSeason: [...state.actionsThisSeason, log],
    },
    events: [event],
  }
}
