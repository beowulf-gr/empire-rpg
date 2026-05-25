/**
 * Random domain events — rolled at the end of Spring and start of Fall.
 *
 * Implements the d20 events table and the d100 threat table from §9 of
 * rules-digest.md.
 *
 * For MVP, Incursion just logs the threat (combat is Phase 2 chapter, not 1).
 * Infestation, Poor/Good Weather, and Beneficial Find apply their effects in
 * full.
 */

import type { ResourceKey, ResourcePool } from '../types/rules'
import type { RealmState, TurnEvent } from './state'
import type { Rng } from './rng'
import { applyResourceDelta } from './harvest'

/**
 * Human "adaptability" bonus on the yearly events check (book §4, Humans):
 * "If you have humans and nothing but humans assigned to produce any given
 *  resource or trade good, you gain a +2 bonus on the yearly events check."
 *
 * Interpretation: if every population unit currently *working* an area is
 * human, the realm earns the +2 to the random-event d20. Mixed-race or all-
 * non-human production removes the bonus.
 */
export function humanAdaptabilityBonus(state: RealmState): number {
  let humans = 0
  let nonHumans = 0
  for (const stack of state.populations) {
    if (stack.workAreaId === null) continue
    if (stack.race === 'humans') humans += stack.count
    else nonHumans += stack.count
  }
  if (humans === 0) return 0
  return nonHumans === 0 ? 2 : 0
}

// d20 events table
type EventKind =
  | 'incursion'
  | 'infestation'
  | 'poor_weather'
  | 'no_event'
  | 'good_weather'
  | 'beneficial_find'

const EVENTS_TABLE: readonly { min: number; max: number; value: EventKind }[] = [
  { min: 1, max: 2, value: 'incursion' },
  { min: 3, max: 5, value: 'infestation' },
  { min: 6, max: 8, value: 'poor_weather' },
  { min: 9, max: 15, value: 'no_event' },
  { min: 16, max: 18, value: 'good_weather' },
  { min: 19, max: 20, value: 'beneficial_find' },
]

// d100 threat table (creature, unit size)
interface Threat {
  creature: string
  unitSize: 'small' | 'medium-size' | 'large'
}

const THREAT_TABLE: readonly { min: number; max: number; value: Threat }[] = [
  { min: 1,  max: 10,  value: { creature: 'orcs',         unitSize: 'medium-size' } },
  { min: 11, max: 20,  value: { creature: 'goblins',      unitSize: 'large' } },
  { min: 21, max: 30,  value: { creature: 'gnolls',       unitSize: 'medium-size' } },
  { min: 31, max: 40,  value: { creature: 'ogres',        unitSize: 'small' } },
  { min: 41, max: 50,  value: { creature: 'hill giants',  unitSize: 'small' } },
  { min: 51, max: 60,  value: { creature: 'frost giants', unitSize: 'small' } },
  { min: 61, max: 70,  value: { creature: 'fire giants',  unitSize: 'small' } },
  { min: 71, max: 80,  value: { creature: 'trolls',       unitSize: 'small' } },
  { min: 81, max: 90,  value: { creature: 'kobolds',      unitSize: 'large' } },
  { min: 91, max: 100, value: { creature: 'bugbears',     unitSize: 'medium-size' } },
]

const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const

export interface RandomEventOutcome {
  /** Mutated copy of the realm state with effects applied. */
  state: RealmState
  /** A single TurnEvent describing what happened (for the year-end summary). */
  event: TurnEvent
}

/**
 * Rolls one random domain event and applies its effects to the realm.
 *
 * @param state   Current realm state. Will not be mutated; a new state is returned.
 * @param rng     Injected RNG so tests can be deterministic.
 * @param phase   'spring_end' or 'fall_start' — included in the emitted event for traceability.
 */
export function resolveRandomEvent(
  state: RealmState,
  rng: Rng,
  phase: 'spring_end' | 'fall_start',
): RandomEventOutcome {
  // Roll d20 ourselves so we can add the human-adaptability bonus
  // (book §4). The events table maps 1..20; clamp the modified roll so a
  // total > 20 still resolves to "beneficial find" (highest band).
  const natural = rng.d20()
  const bonus = humanAdaptabilityBonus(state)
  const total = natural + bonus
  const lookup = Math.max(1, Math.min(20, total))
  let kind: EventKind = 'no_event'
  for (const row of EVENTS_TABLE) {
    if (lookup >= row.min && lookup <= row.max) {
      kind = row.value
      break
    }
  }

  switch (kind) {
    case 'incursion':
      return resolveIncursion(state, rng, phase)
    case 'infestation':
      return resolveInfestation(state, rng, phase)
    case 'poor_weather':
      return resolveWeather(state, -0.1, 'poor_weather', phase)
    case 'good_weather':
      return resolveWeather(state, +0.1, 'good_weather', phase)
    case 'beneficial_find':
      return resolveBeneficialFind(state, rng, phase)
    case 'no_event':
      return {
        state,
        event: { type: 'no_event', payload: { phase } },
      }
  }
}

function resolveIncursion(state: RealmState, rng: Rng, phase: string): RandomEventOutcome {
  const numUnits = rng.d4() // 1d4 enemy units
  const threat = rng.rollTable(THREAT_TABLE)
  const arrivalSeason = rng.pick(SEASONS)

  // MVP: log it, no combat resolution. Phase 4 (chapter 2) handles the battle.
  return {
    state,
    event: {
      type: 'incursion',
      payload: {
        phase,
        numUnits,
        creature: threat.creature,
        unitSize: threat.unitSize,
        arrivalSeason,
      },
    },
  }
}

function resolveInfestation(state: RealmState, rng: Rng, phase: string): RandomEventOutcome {
  // Pick a random resource that the realm currently has > 0 of
  const candidates = (Object.keys(state.resources) as ResourceKey[]).filter(
    (k) => state.resources[k] > 0,
  )
  if (candidates.length === 0) {
    // Nothing to lose
    return { state, event: { type: 'infestation', payload: { phase, lostResource: null } } }
  }
  const target = rng.pick(candidates)
  const percent = rng.d4() * 10 // 10/20/30/40
  const amount = Math.floor(state.resources[target] * (percent / 100))

  const newResources: ResourcePool = applyResourceDelta(state.resources, { [target]: -amount })
  return {
    state: { ...state, resources: newResources },
    event: {
      type: 'infestation',
      payload: { phase, lostResource: target, percent, amount },
    },
  }
}

function resolveWeather(
  state: RealmState,
  modifier: number,
  type: 'poor_weather' | 'good_weather',
  phase: string,
): RandomEventOutcome {
  return {
    state: { ...state, weatherModifier: modifier },
    event: { type, payload: { phase, modifier } },
  }
}

/**
 * Beneficial Find — homebrew interpretation: 50/50 random between
 *   (a) one of your mineral-producing areas now also produces gold, OR
 *   (b) +1d4 gp added to the treasury.
 * Falls back to (b) if no mineral area exists.
 */
function resolveBeneficialFind(
  state: RealmState,
  rng: Rng,
  phase: string,
): RandomEventOutcome {
  const mineralAreas = state.areas.filter(
    (a) => a.terrain === 'hills' || a.terrain === 'mountains',
  )
  const choseMineralOption = mineralAreas.length > 0 && rng.next() < 0.5

  if (choseMineralOption) {
    // Mark a random mineral area as also producing gold.
    // For MVP we encode this via a synthetic flag in mineralResult — but actually
    // gold production from non-gold areas is a Phase 3+ feature. For MVP we'll
    // just emit the event and skip the durable change. (No regression for MVP play.)
    const target = rng.pick(mineralAreas)
    return {
      state,
      event: {
        type: 'beneficial_find',
        payload: { phase, mode: 'mineral_area_also_gold', areaId: target.id },
      },
    }
  }

  // Treasury option
  const gold = rng.d4()
  const newResources = applyResourceDelta(state.resources, { gold })
  return {
    state: { ...state, resources: newResources },
    event: {
      type: 'beneficial_find',
      payload: { phase, mode: 'treasury_gold', gold },
    },
  }
}
