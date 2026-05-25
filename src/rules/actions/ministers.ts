/**
 * Ministers — Phase 3d.
 *
 * Per the digest §2.5 there are exactly three minister roles:
 *
 *   - treasurer       — Knowledge (economics) for buy/sell/taxation
 *   - general         — commands the army (chapter 2 mass combat)
 *   - prime_minister  — Diplomacy and other social skills
 *
 * Hiring is handled by the Recruit Ministers spring action: pay X gp →
 * install a minister at level (3·X) into the chosen role. If a minister
 * already serves in that role, the new hire replaces them (the old
 * minister is dismissed and their loyalty group is removed).
 *
 * Each minister has its own LoyaltyGroup (kind='minister', attachedTo =
 * minister.id) — the same per-entity pattern we use for military units.
 *
 * Annual upkeep, vacancy penalties, and level-bonuses on related checks
 * come in 3d.3 and 3d.4.
 */

import type { LoyaltyGroup, RealmState, TurnEvent } from '../state'
import { abilityMod } from '../state'
import type { Rng } from '../rng'

export type MinisterRole = 'treasurer' | 'general' | 'prime_minister'

export const MINISTER_ROLES: MinisterRole[] = [
  'treasurer',
  'general',
  'prime_minister',
]

/** Display labels — UI uses these so the engine doesn't need to know about React. */
export const MINISTER_ROLE_LABEL: Record<MinisterRole, string> = {
  treasurer: 'Treasurer',
  general: 'General',
  prime_minister: 'Prime Minister',
}

/** One-line description of what each minister does — surfaced in the UI. */
export const MINISTER_ROLE_DESCRIPTION: Record<MinisterRole, string> = {
  treasurer: 'Handles Knowledge (economics) checks for buy/sell/taxation.',
  general: 'Commands the army; relevant once mass combat (chapter 2) ships.',
  prime_minister:
    'The diplomatic & social face of the realm. Used in Morale Upkeep and Dispatch Diplomats.',
}

/**
 * One minister currently serving the realm.
 *
 *   - id     stable across saves; used as LoyaltyGroup.attachedTo as well
 *   - role   exactly one of the three book roles; only one minister per role
 *   - name   purely flavor; can be set by the player when recruiting
 *   - level  character level; drives both annual hiring cost (1 gp / 3 levels
 *            per year) and bonuses on relevant checks (added in 3d.4)
 *   - hiredYear / hiredSeason  when they joined the realm; useful for the
 *            UI ("hired Spring of Year 3") and for any future seniority rules
 */
export interface Minister {
  id: string
  role: MinisterRole
  name: string
  level: number
  hiredYear: number
  hiredSeason: 'spring' | 'summer' | 'fall' | 'winter'
}

// ============================================================
// Helpers
// ============================================================

/** Returns the minister currently serving in `role`, or null if vacant. */
export function findMinisterByRole(
  ministers: Minister[],
  role: MinisterRole,
): Minister | null {
  return ministers.find((m) => m.role === role) ?? null
}

/** Returns the list of roles that currently have no minister assigned. */
export function vacantRoles(ministers: Minister[]): MinisterRole[] {
  return MINISTER_ROLES.filter((role) => !findMinisterByRole(ministers, role))
}

/**
 * Annual hiring cost in gp: 1 gp per 3 levels per year, rounded UP so a
 * level-1 minister costs 1 gp, a level-3 costs 1 gp, level-4 costs 2 gp, etc.
 * Used by Population Upkeep / the new annual-minister-cost step in 3d.3.
 */
export function annualMinisterCost(minister: Minister): number {
  return Math.ceil(minister.level / 3)
}

/** Sum of annual cost across all current ministers. */
export function totalAnnualMinisterCost(ministers: Minister[]): number {
  return ministers.reduce((sum, m) => sum + annualMinisterCost(m), 0)
}

// ============================================================
// Vacancy penalty + minister-level bonus on related checks (3d.4)
// ============================================================

/**
 * Per the digest §2.5: a vacant minister role applies a -2 circumstance
 * penalty on the relevant check when the ruler personally covers it.
 *
 * This constant is exported so future check sites (Buy/Sell/Loans,
 * Dispatch Diplomats, etc.) reuse the same value rather than hardcoding -2.
 */
export const VACANCY_PENALTY = -2

/**
 * The ruler stat that stands in when a minister role is vacant. Book §3:
 * "If a role is vacant, the ruler covers it personally."
 *
 *   - Treasurer       → ruler.knowledgeEconomics (already a full skill total)
 *   - General         → ruler.diplomacy          (Diplomacy drives Hire Soldiers)
 *   - Prime Minister  → ruler.charisma → ability mod
 *
 * The Prime Minister returns a derived ability modifier rather than a raw
 * score so it composes cleanly with the d20 check sites that already expect
 * a small integer.
 */
export function rulerStatForRole(state: RealmState, role: MinisterRole): number {
  switch (role) {
    case 'treasurer':       return state.ruler.knowledgeEconomics
    case 'general':         return state.ruler.diplomacy
    case 'prime_minister':  return abilityMod(state.ruler.charisma)
  }
}

/**
 * Returns the modifier to apply to a check that the named minister role
 * would normally handle:
 *
 *   - role is filled  → +minister.level (the minister's character level
 *                       acts as a circumstance/skill bonus on the roll)
 *   - role is vacant  → rulerStatForRole(state, role) + VACANCY_PENALTY (-2)
 *                       — the ruler covers it personally, with the book's
 *                       -2 circumstance penalty for the dual-hat situation
 *
 * The third return field (`rulerCovered`) lets UI panels distinguish
 * "level 3 Treasurer rolling +3" from "ruler covering vacancy, +5 Knowledge
 * economics -2 penalty = +3" — same total, very different story.
 *
 * If you want a different fallback (e.g. 0 when no minister, instead of
 * ruler + -2), pass `{ vacantBonus: 0 }` — most callers should leave it
 * alone so the book penalty applies.
 */
export function ministerCheckBonus(
  state: RealmState,
  role: MinisterRole,
  options?: { vacantBonus?: number },
): {
  bonus: number
  minister: Minister | null
  /** When true the role is vacant and the ruler is covering it personally. */
  rulerCovered: boolean
  /** When ruler-covered, the ruler stat that was rolled in. Null otherwise. */
  rulerStat: number | null
} {
  const minister = findMinisterByRole(state.ministers, role)
  if (minister) {
    return { bonus: minister.level, minister, rulerCovered: false, rulerStat: null }
  }
  if (options?.vacantBonus !== undefined) {
    // Caller explicitly overrode the vacancy behaviour — typically 0 for
    // optional bonuses ("Treasurer adds extra if present, no penalty if
    // absent"). Ruler stats don't apply in that mode.
    return {
      bonus: options.vacantBonus,
      minister: null,
      rulerCovered: false,
      rulerStat: null,
    }
  }
  const stat = rulerStatForRole(state, role)
  return {
    bonus: stat + VACANCY_PENALTY,
    minister: null,
    rulerCovered: true,
    rulerStat: stat,
  }
}

// ============================================================
// Recruit Ministers — instant action
// ============================================================

export class RecruitMinisterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecruitMinisterError'
  }
}

export interface RecruitMinisterParams {
  role: MinisterRole
  /**
   * Display name for the minister. Stored as flavor only; if the player
   * leaves it blank, a generic role-based name is substituted.
   */
  name: string
  /**
   * Level the minister will be installed at. Minimum 1, soft-capped at 20
   * (the D&D 3e character ceiling). Recruit cost = ceil(level / 3) gp,
   * +1 gp if hired outside spring.
   */
  level: number
}

const MAX_MINISTER_LEVEL = 20

/**
 * Recruit cost in gp for a target level. Same formula as the annual cost
 * (1 gp per 3 levels, rounded up). Out-of-season recruiting adds +1 gp
 * per the registry's off-season penalty.
 */
export function recruitMinisterCost(
  level: number,
  season: RealmState['season'],
): number {
  const base = Math.ceil(Math.max(0, level) / 3)
  return season === 'spring' ? base : base + 1
}

/**
 * Executes the Recruit Ministers action. Pure function — caller supplies
 * a uuid factory for testability.
 *
 * Behavior:
 *   - level must be >= 1 (and <= 20)
 *   - gp cost is deducted from state.resources.gold
 *   - if the role is already filled, the existing minister is dismissed
 *     (their loyalty group is removed) and replaced with the new hire
 *   - the new minister gets a fresh LoyaltyGroup (kind='minister') at
 *     score 0, baseWillSave +2
 *   - emits a single 'minister_recruited' event (with replaced=oldId|null)
 */
export function executeRecruitMinister(
  state: RealmState,
  params: RecruitMinisterParams,
  uuid: () => string = () => crypto.randomUUID(),
): { state: RealmState; events: TurnEvent[] } {
  const { role, level } = params
  const name = params.name.trim() || `${MINISTER_ROLE_LABEL[role]} of ${state.name}`

  if (!Number.isInteger(level)) {
    throw new RecruitMinisterError(`Level must be an integer (got ${level}).`)
  }
  if (level < 1) {
    throw new RecruitMinisterError(`Level must be at least 1 (got ${level}).`)
  }
  if (level > MAX_MINISTER_LEVEL) {
    throw new RecruitMinisterError(
      `Level cannot exceed ${MAX_MINISTER_LEVEL} (got ${level}).`,
    )
  }

  const cost = recruitMinisterCost(level, state.season)
  if (state.resources.gold < cost) {
    throw new RecruitMinisterError(
      `Not enough gold to recruit a level-${level} ${MINISTER_ROLE_LABEL[role]} ` +
        `(need ${cost}, have ${state.resources.gold}).`,
    )
  }

  // If a minister already serves in this role, dismiss them.
  const previous = findMinisterByRole(state.ministers, role)
  const ministersAfterDismiss = previous
    ? state.ministers.filter((m) => m.id !== previous.id)
    : state.ministers
  const loyaltyAfterDismiss = previous
    ? state.loyaltyGroups.filter(
        (g) => !(g.kind === 'minister' && g.attachedTo === previous.id),
      )
    : state.loyaltyGroups

  // Install the new minister.
  const minister: Minister = {
    id: uuid(),
    role,
    name,
    level,
    hiredYear: state.year,
    hiredSeason: state.season,
  }
  const loyaltyGroup: LoyaltyGroup = {
    id: uuid(),
    kind: 'minister',
    label: `${name} (${MINISTER_ROLE_LABEL[role]})`,
    baseWillSave: 2,
    score: 0,
    attachedTo: minister.id,
  }

  const next: RealmState = {
    ...state,
    resources: { ...state.resources, gold: state.resources.gold - cost },
    ministers: [...ministersAfterDismiss, minister],
    loyaltyGroups: [...loyaltyAfterDismiss, loyaltyGroup],
  }

  return {
    state: next,
    events: [
      {
        type: 'minister_recruited',
        payload: {
          ministerId: minister.id,
          role,
          name,
          level,
          cost,
          replaced: previous?.id ?? null,
          replacedName: previous?.name ?? null,
        },
      },
    ],
  }
}

// ============================================================
// Annual Minister Upkeep — auto, runs at start of spring
// ============================================================

/**
 * Removes a minister from a RealmState and discards their loyalty group.
 * Pure helper — does not emit events.
 */
function dismissMinister(state: RealmState, ministerId: string): RealmState {
  return {
    ...state,
    ministers: state.ministers.filter((m) => m.id !== ministerId),
    loyaltyGroups: state.loyaltyGroups.filter(
      (g) => !(g.kind === 'minister' && g.attachedTo === ministerId),
    ),
  }
}

/**
 * Annual stipend for every minister currently serving the realm.
 *
 * Each spring (after Morale Upkeep, alongside Military Upkeep) the realm
 * must pay each minister `annualMinisterCost(m)` gp. Ministers the realm
 * can't pay are dismissed automatically (their loyalty group is removed).
 * Mirrors `executeAnnualMilitaryUpkeep`.
 *
 * The Rng parameter is unused for now; kept for signature uniformity with
 * other auto-executors and in case future house rules want random-roll
 * outcomes (e.g. unhappy ministers extorting more gold).
 */
export function executeAnnualMinisterUpkeep(
  state: RealmState,
  _rng: Rng,
): { state: RealmState; events: TurnEvent[] } {
  if (state.ministers.length === 0) {
    return {
      state,
      events: [{ type: 'minister_upkeep', payload: { phase: 'spring', ministers: 0 } }],
    }
  }

  let next = state
  let goldPaid = 0
  const retained: { ministerId: string; cost: number }[] = []
  const dismissals: {
    ministerId: string
    role: MinisterRole
    name: string
    level: number
    cost: number
    reason: string
  }[] = []

  // Iterate the original list (state.ministers) so dismissals don't shift the
  // loop. `next` accumulates the deductions/removals as we go.
  for (const minister of state.ministers) {
    const cost = annualMinisterCost(minister)
    if (next.resources.gold >= cost) {
      next = {
        ...next,
        resources: { ...next.resources, gold: next.resources.gold - cost },
      }
      goldPaid += cost
      retained.push({ ministerId: minister.id, cost })
    } else {
      next = dismissMinister(next, minister.id)
      dismissals.push({
        ministerId: minister.id,
        role: minister.role,
        name: minister.name,
        level: minister.level,
        cost,
        reason: `Could not pay ${cost} gp annual stipend (had ${next.resources.gold} gp).`,
      })
    }
  }

  return {
    state: next,
    events: [
      {
        type: 'minister_upkeep',
        payload: {
          phase: 'spring',
          ministers: state.ministers.length,
          retainedCount: retained.length,
          dismissedCount: dismissals.length,
          retained,
          dismissals,
          goldPaid,
        },
      },
    ],
  }
}
