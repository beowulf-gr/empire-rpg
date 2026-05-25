/**
 * Execute functions for the obligatory auto-resolved actions.
 *
 * Each executor is a pure function:
 *
 *   execute(state, rng) -> { state: nextState, events: TurnEvent[] }
 *
 * Called by the orchestrator (endSeason / bootSpring). The orchestrator
 * stitches multiple executors together for season transitions.
 *
 * Kept as plain functions, not classes/objects, so each one is easy to test
 * in isolation (see executors.test.ts in step 2f.7).
 */

import type { Race, ResourceKey } from '../../types/rules'
import type { LoyaltyGroup, PopulationStack, RealmState, TurnEvent } from '../state'
import {
  adjustCommonerLoyalty,
  adjustLoyaltyScore,
  committedPopulation,
  findCommonersGroup,
  totalLivingSpace,
  totalPopulation,
} from '../state'
import type { Rng } from '../rng'
import { applyResourceDelta, harvestRealm } from '../harvest'
import { resolveRandomEvent } from '../events'
import { findMoraleBribe, moraleBribeBonusPerGp } from './bribery'
import {
  clampNegativeDeltaForGoblins,
  commonersLoyaltyModifier,
  undeadPresencePenalty,
} from './raceLoyalty'

export interface ExecutorResult {
  state: RealmState
  events: TurnEvent[]
}

// ============================================================
// Morale Upkeep — Spring start, obligatory
// ============================================================

/**
 * Determines the realm's morale DC from current conditions per the digest §5:
 *   famine                 → 20
 *   food shortage          → 15
 *   excessive taxation /
 *     bad crops / decline  → 10  (Phase 3+: tax tracking)
 *   average year           → 5   (default)
 *   benevolent leader      → 0   (Phase 3+: derived from sustained loyalty)
 *   golden age             → -5  (Phase 3+)
 *
 * For MVP we drive DC entirely from lastFoodCrisis. Other conditions are
 * placeholders — they'll feed in here once the underlying mechanics exist.
 */
function determineMoraleDC(state: RealmState): { dc: number; conditions: string } {
  switch (state.lastFoodCrisis) {
    case 'famine':
      return { dc: 20, conditions: 'Blatant mismanagement, famine' }
    case 'shortage':
      return { dc: 15, conditions: 'Food shortages' }
    case 'none':
    default:
      return { dc: 5, conditions: 'Average year' }
  }
}

/**
 * Resolves a single group's loyalty check vs the realm's morale DC. Returns
 * the score delta to apply to the group:
 *   pass by 10+   → +2
 *   pass          →  0
 *   miss by 1-9   → -1
 *   miss by 10+   → -2
 *
 * Bribery: a non-zero bribeBonus is added to the d20 + score + Will save.
 * On a successful check (margin ≥ 0) bribery also adds +1 to the score
 * delta as the "bread and circuses" loyalty repair. The +1 is included
 * in the returned delta so callers can apply it transparently.
 *
 * Score below -5 after the check triggers a revolt (caller emits the event).
 */
function resolveMoraleCheck(
  group: LoyaltyGroup,
  dc: number,
  rng: Rng,
  bribeBonus = 0,
  raceMod = 0,
): { roll: number; total: number; outcome: 'crit_pass' | 'pass' | 'fail' | 'crit_fail'; delta: number; bribeLoyaltyBonus: number; raceMod: number } {
  const roll = rng.d20()
  const total = roll + group.score + group.baseWillSave + bribeBonus + raceMod
  const margin = total - dc
  let outcome: 'crit_pass' | 'pass' | 'fail' | 'crit_fail'
  let delta: number
  if (margin >= 10) {
    outcome = 'crit_pass'
    delta = 2
  } else if (margin >= 0) {
    outcome = 'pass'
    delta = 0
  } else if (margin > -10) {
    outcome = 'fail'
    delta = -1
  } else {
    outcome = 'crit_fail'
    delta = -2
  }
  // Bribery's "+1 loyalty on success" only fires when (a) a bribe was paid
  // and (b) the check actually succeeded. Critical pass already gives +2;
  // bribery adds +1 on top of that.
  const bribeLoyaltyBonus = bribeBonus > 0 && (outcome === 'pass' || outcome === 'crit_pass') ? 1 : 0
  return { roll, total, outcome, delta: delta + bribeLoyaltyBonus, bribeLoyaltyBonus, raceMod }
}

/**
 * Real Morale Upkeep — runs at start of each Spring.
 *
 *   1. Determine DC from current conditions (food crisis, etc.)
 *   2. For each loyalty group: roll d20 + score + baseWillSave vs DC
 *   3. Apply ±2/0/-1/-2 to that group's score
 *   4. If new score ≤ -5, mark group as revolting (Phase 3b will wire actual revolt mechanics)
 *
 * Emits one summary 'morale_upkeep' event + one 'morale_check' per group,
 * all surfaced in the season-transition pop-up.
 */
export function executeMoraleUpkeep(state: RealmState, rng: Rng): ExecutorResult {
  const { dc, conditions } = determineMoraleDC(state)

  const events: TurnEvent[] = [
    {
      type: 'morale_upkeep',
      payload: {
        phase: 'spring',
        dc,
        conditions,
        groupCount: state.loyaltyGroups.length,
      },
    },
  ]

  // Race-driven modifiers applied to commoners and military loyalty checks:
  // composition baseline + undead-presence penalty (book §4).
  const commonersMods = commonersLoyaltyModifier(state)
  const militaryUndeadPenalty = undeadPresencePenalty(state)

  let next = state
  for (const group of state.loyaltyGroups) {
    // Apply any pre-emptive bribery for this group.
    const bribe = findMoraleBribe(state, group.id)
    const bribePerGp = moraleBribeBonusPerGp(state, group.id)
    const bribeGp = bribe?.gp ?? 0
    const bribeBonus = bribeGp * bribePerGp

    // Race-driven check modifier varies by group kind.
    let raceMod = 0
    if (group.kind === 'commoners') raceMod = commonersMods.total
    else if (group.kind === 'military') raceMod = militaryUndeadPenalty
    // Ministers and other group kinds don't get racial mods directly.

    const checkResult = resolveMoraleCheck(group, dc, rng, bribeBonus, raceMod)
    const { roll, total, outcome, bribeLoyaltyBonus } = checkResult
    // Goblin "immune to penalties" — clamp negative deltas for commoner groups
    // when goblins dominate the populace.
    const clampedDelta =
      group.kind === 'commoners'
        ? clampNegativeDeltaForGoblins(state, checkResult.delta)
        : checkResult.delta
    next = adjustLoyaltyScore(next, group.id, clampedDelta)
    const newScore = group.score + clampedDelta
    const revolt = newScore <= -5
    events.push({
      type: 'morale_check',
      payload: {
        groupId: group.id,
        label: group.label,
        kind: group.kind,
        dc,
        roll,
        baseWillSave: group.baseWillSave,
        previousScore: group.score,
        total,
        outcome,
        scoreDelta: clampedDelta,
        rawScoreDelta: checkResult.delta,
        newScore,
        revolt,
        bribeGp,
        bribeBonus,
        bribeLoyaltyBonus,
        raceMod,
        racialComposition: group.kind === 'commoners' ? commonersMods.composition : 0,
        undeadPenalty:
          group.kind === 'commoners' || group.kind === 'military'
            ? (group.kind === 'commoners' ? commonersMods.undeadPenalty : militaryUndeadPenalty)
            : 0,
        orcIdlePenalty: group.kind === 'commoners' ? commonersMods.orcIdle : 0,
        goblinClamp: clampedDelta !== checkResult.delta,
      },
    })
  }

  // Bribes are consumed regardless of outcome — gold was already spent.
  next = { ...next, pendingBribes: [] }

  return { state: next, events }
}

// ============================================================
// Population Upkeep — Spring start, obligatory
// ============================================================

/**
 * Maps a population-growth check total to a growth percentage per the digest.
 * Exported for tests.
 */
export function populationGrowthPercent(total: number): number {
  if (total >= 21) return 10
  if (total >= 11) return 5
  if (total >= 1) return 0
  if (total >= -10) return -5
  return -10
}

/**
 * Applies a percentage growth/decline to the realm.
 *
 * GROWTH (delta > 0): new units always arrive in the unallocated pool
 * (homeAreaId=null, workAreaId=null) so they can't overflow areas that are
 * already at their settlement cap. The growth is distributed across races
 * proportional to their existing population share, with the leftover (from
 * rounding) assigned by largest-remainder method.
 *
 * DECLINE (delta < 0): pops shrink from the largest existing stacks first
 * (current behaviour preserved — the book is silent on who exactly dies in
 * a famine, so it falls evenly across the visible population).
 */
function applyPopulationGrowth(
  populations: PopulationStack[],
  percent: number,
): PopulationStack[] {
  if (populations.length === 0 || percent === 0) return populations
  const total = populations.reduce((s, p) => s + p.count, 0)
  if (total === 0) return populations
  const factor = 1 + percent / 100
  const targetTotal = Math.max(0, Math.round(total * factor))
  let delta = targetTotal - total
  if (delta === 0) return populations

  const next = populations.map((p) => ({ ...p }))

  if (delta > 0) {
    // ---- Growth: split delta across races by population share, then add
    // the resulting counts to each race's unallocated-pool stack (creating
    // one if it doesn't exist yet). Largest-remainder fixes rounding so
    // the per-race counts sum to `delta` exactly.
    const byRace = new Map<Race, number>()
    for (const p of next) byRace.set(p.race, (byRace.get(p.race) ?? 0) + p.count)

    type Alloc = { race: Race; count: number; rem: number }
    const allocations: Alloc[] = []
    for (const [race, cnt] of byRace) {
      const exact = (cnt / total) * delta
      const floor = Math.floor(exact)
      allocations.push({ race, count: floor, rem: exact - floor })
    }
    let leftover = delta - allocations.reduce((s, a) => s + a.count, 0)
    allocations.sort((a, b) => b.rem - a.rem)
    let i = 0
    while (leftover > 0 && allocations.length > 0) {
      allocations[i % allocations.length].count += 1
      leftover -= 1
      i += 1
    }

    for (const a of allocations) {
      if (a.count <= 0) continue
      const existing = next.find(
        (p) => p.race === a.race && p.homeAreaId === null && p.workAreaId === null,
      )
      if (existing) {
        existing.count += a.count
      } else {
        next.push({
          id: crypto.randomUUID(),
          race: a.race,
          count: a.count,
          homeAreaId: null,
          workAreaId: null,
        })
      }
    }
  } else {
    // ---- Decline: take from largest existing stacks one unit at a time.
    const indices = next.map((_, i) => i).sort((a, b) => next[b].count - next[a].count)
    let i = 0
    while (delta < 0 && next.some((p) => p.count > 0)) {
      const idx = indices[i % indices.length]
      if (next[idx].count > 0) {
        next[idx].count -= 1
        delta += 1
      }
      i += 1
      if (i > total * 10) break
    }
  }
  return next.filter((p) => p.count > 0)
}

/**
 * Population Upkeep — Spring start, obligatory.
 *
 * Computes the realm's annual growth check (d20 + food balance + loyalty/2),
 * applies the resulting percentage to the visible population, and emits the
 * `population_upkeep` event. Recruitment is NOT done here — the book treats
 * "Recruit Settlers" as a separate discretionary action the ruler may take
 * up to three times in spring (one per race, optionally with gp bonuses).
 * See `executeRecruitSettlers` and the Recruit Settlers panel.
 */
// ============================================================
// Orcs Idle-Warriors Penalty — Spring start, obligatory (no-op if no orcs)
// ============================================================

/**
 * Recomputes the realm's cumulative orc-idle loyalty penalty per book §4:
 *   "For each year that passes without at least half the orc population
 *    units used as soldiers, the orcs suffer a cumulative -1 penalty to
 *    loyalty. Reduce this penalty by 1 for each year that the orcs are
 *    mustered. This penalty cannot be transformed into a bonus."
 *
 * "Used as soldiers" = mustered military units with race === 'orcs'. We
 * count the visible head-count of orc population (excluding mustered units,
 * which are tracked as a separate MilitaryUnit) and compare against the
 * number of orc mustered units; "at least half mustered" means the count
 * of orc military units is ≥ half the orc population units.
 *
 * Floor is 0 — the penalty can never reverse into a bonus.
 *
 * The penalty itself is applied to commoners loyalty at Morale Upkeep time
 * via `commonersLoyaltyModifier`; this executor only updates the state
 * field and emits the per-year event.
 */
export function executeOrcsIdlePenalty(state: RealmState, _rng: Rng): ExecutorResult {
  const orcPopulation = state.populations
    .filter((p) => p.race === 'orcs')
    .reduce((sum, p) => sum + p.count, 0)
  const orcMustered = state.militaryUnits.filter(
    (u) => u.source === 'mustered' && u.race === 'orcs',
  ).length

  if (orcPopulation === 0) {
    // No orcs in the realm — no change, no penalty. Reset to 0 just in case
    // the player previously had orcs and they've all left.
    const reset = state.orcIdlePenalty !== 0 ? 0 : state.orcIdlePenalty
    return {
      state: reset === state.orcIdlePenalty ? state : { ...state, orcIdlePenalty: reset },
      events: [
        {
          type: 'orcs_idle_penalty',
          payload: {
            phase: 'spring',
            orcsPresent: false,
            previousPenalty: state.orcIdlePenalty,
            newPenalty: reset,
          },
        },
      ],
    }
  }

  const halfNeeded = Math.ceil(orcPopulation / 2)
  const enoughMustered = orcMustered >= halfNeeded

  // -1 if not enough mustered, +1 (toward 0) if at least half are mustered.
  const previous = state.orcIdlePenalty
  const stepped = enoughMustered ? previous + 1 : previous - 1
  const newPenalty = Math.min(0, stepped) // floor at 0

  return {
    state: { ...state, orcIdlePenalty: newPenalty },
    events: [
      {
        type: 'orcs_idle_penalty',
        payload: {
          phase: 'spring',
          orcsPresent: true,
          orcPopulation,
          orcMustered,
          halfNeeded,
          enoughMustered,
          previousPenalty: previous,
          newPenalty,
        },
      },
    ],
  }
}

// ============================================================
// Elves Emigration — Spring start, obligatory (only fires if elves present)
// ============================================================

/** DC of the spring emigration check. The book leaves this to the DM; we use
 *  the same average-year DC the Morale Upkeep table uses (5), reasoning that
 *  a baseline "is this realm still worth staying in" check should mirror the
 *  baseline loyalty check. Harder years → more elves drift away. */
export const ELVES_EMIGRATION_DC = 5

/**
 * Elves Emigration — book §4: "Each spring, the elves check for emigration
 * as if their loyalty was +0. If their loyalty slips below zero, double it
 * for purposes of the emigration check."
 *
 * For each elves population stack with at least 1 unit, we roll d20 plus a
 * modifier derived from the commoners' current loyalty:
 *   - commoners score ≥ 0  →  emigration mod = 0
 *   - commoners score < 0  →  emigration mod = 2 × commonersScore
 *
 * On a fail (total < DC) one elf unit leaves the realm. If the realm has no
 * elves the executor is a no-op (still emits a summary event).
 */
export function executeElvesEmigration(state: RealmState, rng: Rng): ExecutorResult {
  const elfStacks = state.populations.filter((p) => p.race === 'elves' && p.count > 0)
  if (elfStacks.length === 0) {
    return {
      state,
      events: [{ type: 'elves_emigration', payload: { phase: 'spring', elvesPresent: false } }],
    }
  }

  const commoners = findCommonersGroup(state)
  const commonersScore = commoners?.score ?? 0
  const emigrationMod = commonersScore < 0 ? 2 * commonersScore : 0
  const dc = ELVES_EMIGRATION_DC

  const events: TurnEvent[] = []
  let next = state
  let totalLeft = 0
  const stackChecks: {
    stackId: string
    roll: number
    total: number
    leaving: boolean
  }[] = []

  for (const stack of elfStacks) {
    const roll = rng.d20()
    const total = roll + emigrationMod
    const leaving = total < dc
    stackChecks.push({ stackId: stack.id, roll, total, leaving })
    if (leaving) {
      // One elf unit slips away — find the matching stack in `next` and
      // decrement. Stacks that drop to 0 are filtered out so the realm
      // doesn't keep ghost entries.
      next = {
        ...next,
        populations: next.populations
          .map((p) => (p.id === stack.id ? { ...p, count: p.count - 1 } : p))
          .filter((p) => p.count > 0),
      }
      totalLeft += 1
    }
  }

  events.push({
    type: 'elves_emigration',
    payload: {
      phase: 'spring',
      elvesPresent: true,
      dc,
      commonersScore,
      emigrationMod,
      stackChecks,
      totalLeft,
    },
  })

  return { state: next, events }
}

export function executePopulationUpkeep(state: RealmState, rng: Rng): ExecutorResult {
  const commoners = findCommonersGroup(state)
  const commonerScore = commoners?.score ?? 0
  const foodMod = state.lastYearFoodBalance
  const loyaltyMod = Math.ceil(commonerScore / 2)
  const growthRoll = rng.d20()
  const growthTotal = growthRoll + foodMod + loyaltyMod
  const growthPercent = populationGrowthPercent(growthTotal)

  // Growth applies to visible pop only — workers committed to in-flight
  // construction or production aren't at home making babies. They keep their
  // count and rejoin the realm when their action completes.
  const previousTotal = totalPopulation(state)
  const committedCount = committedPopulation(state)
  const grownPopulations =
    growthPercent !== 0 ? applyPopulationGrowth(state.populations, growthPercent) : state.populations
  const grownTotal =
    grownPopulations.reduce((s, p) => s + p.count, 0) + committedCount

  const growthEvent: TurnEvent = {
    type: 'population_upkeep',
    payload: {
      phase: 'spring',
      roll: growthRoll,
      foodMod,
      loyaltyMod,
      total: growthTotal,
      growthPercent,
      previousTotal,
      newTotal: grownTotal,
    },
  }

  return {
    state: { ...state, populations: grownPopulations },
    events: [growthEvent],
  }
}

// ============================================================
// Assign Population (the OBLIGATORY check) — Spring start, obligatory
//
// This is the book's "Assign Population" Limited Obligatory action: it just
// verifies total pop ≤ total living space and applies an overcrowding penalty
// to commoner loyalty. It does NOT relocate residents — that's the
// (homebrew) Move Settlers interactive action.
// ============================================================

export function executeAssignPopulationCheck(state: RealmState): ExecutorResult {
  // Living space = terrain base + stronghold bonuses (village +1, town +2,
  // city +4, keep/castle +1, citadel +2). See STRONGHOLD_SETTLEMENT_CAP_BONUS.
  const livingSpace = totalLivingSpace(state)
  // Only count pop with a home — unallocated pop doesn't take living space.
  const total = state.populations
    .filter((p) => p.homeAreaId !== null)
    .reduce((s, p) => s + p.count, 0)

  if (total <= livingSpace) {
    const event: TurnEvent = {
      type: 'assign_population',
      payload: { phase: 'spring', total, livingSpace, overcrowding: 0, loyaltyDelta: 0 },
    }
    return { state, events: [event] }
  }

  // Overcrowding: -1 to commoner loyalty per 2 population over capacity
  const overcrowding = total - livingSpace
  const loyaltyDelta = -Math.floor(overcrowding / 2)
  const commoners = findCommonersGroup(state)
  const event: TurnEvent = {
    type: 'assign_population',
    payload: {
      phase: 'spring',
      total,
      livingSpace,
      overcrowding,
      loyaltyDelta,
      groupId: commoners?.id ?? null,
    },
  }
  return {
    state: loyaltyDelta !== 0 ? adjustCommonerLoyalty(state, loyaltyDelta) : state,
    events: [event],
  }
}

// ============================================================
// Random Spring Events — Spring END, obligatory
// ============================================================

export function executeRandomSpringEvents(state: RealmState, rng: Rng): ExecutorResult {
  const out = resolveRandomEvent(state, rng, 'spring_end')
  return { state: out.state, events: [out.event] }
}

// ============================================================
// Random Fall Events — Fall START, obligatory
// ============================================================

export function executeRandomFallEvents(state: RealmState, rng: Rng): ExecutorResult {
  const out = resolveRandomEvent(state, rng, 'fall_start')
  return { state: out.state, events: [out.event] }
}

// ============================================================
// Harvest Crops — Fall START, obligatory
// ============================================================

export function executeHarvestCrops(state: RealmState, rng: Rng): ExecutorResult {
  const { results, delta } = harvestRealm(state, rng)

  // Floor fractional production at integer values for the resource pool
  const flooredDelta: Partial<Record<ResourceKey, number>> = {}
  for (const [key, val] of Object.entries(delta) as [ResourceKey, number][]) {
    flooredDelta[key] = Math.floor(val)
  }

  // Apply any returned area patches (currently the only consumer is
  // legacy mineral discoveries — surveying now happens in the survey
  // panel, not in harvest, so areaUpdates is normally empty; left here
  // as a forward-compat hook in case harvestArea wants to mutate area
  // state later).
  let nextState = state
  for (const r of results) {
    if (r.areaUpdates) {
      nextState = {
        ...nextState,
        areas: nextState.areas.map((a) =>
          a.id === r.areaId ? { ...a, ...r.areaUpdates } : a,
        ),
      }
    }
  }

  const event: TurnEvent = {
    type: 'harvest',
    payload: {
      phase: 'fall',
      delta: flooredDelta,
      activeAreas: results.filter((r) => r.active).length,
      totalAreas: results.length,
    },
  }
  return {
    state: { ...nextState, resources: applyResourceDelta(nextState.resources, flooredDelta) },
    events: [event],
  }
}

// ============================================================
// Allocate Food — Fall START, obligatory
// ============================================================

export function executeAllocateFood(state: RealmState, _rng: Rng): ExecutorResult {
  const popUnits = totalPopulation(state)
  const foodOnHand = state.resources.food
  const foodNeeded = popUnits
  const foodSpent = Math.min(foodOnHand, foodNeeded)
  const balance = foodOnHand - foodNeeded

  let crisis: 'none' | 'shortage' | 'famine' = 'none'
  if (popUnits > 0) {
    if (foodOnHand < foodNeeded * 0.5) crisis = 'famine'
    else if (foodOnHand < foodNeeded * 0.75) crisis = 'shortage'
    else if (foodOnHand < foodNeeded) crisis = 'shortage'
  }

  // Apply commoner loyalty modifier per the digest §5 modifier table.
  // Famine = -2, plus the higher Morale Upkeep DC next spring also bites.
  // Abundance (>2x need) = +2 to commoners.
  let loyaltyDelta = 0
  if (crisis === 'famine') loyaltyDelta = -2
  else if (crisis === 'shortage') loyaltyDelta = -1
  else if (popUnits > 0 && foodOnHand >= foodNeeded * 2) loyaltyDelta = +2

  let nextState: RealmState = {
    ...state,
    resources: { ...state.resources, food: foodOnHand - foodSpent },
    lastYearFoodBalance: balance,
    lastFoodCrisis: crisis,
  }
  if (loyaltyDelta !== 0) {
    nextState = adjustCommonerLoyalty(nextState, loyaltyDelta)
  }

  const event: TurnEvent = {
    type: 'allocate_food',
    payload: {
      phase: 'fall',
      popUnits,
      foodNeeded,
      foodSpent,
      balance,
      crisis,
      loyaltyDelta,
    },
  }
  return { state: nextState, events: [event] }
}

// Phase 3c — re-export for the orchestrator's AUTO_EXECUTORS map
export { executeAnnualMilitaryUpkeep } from './military'
