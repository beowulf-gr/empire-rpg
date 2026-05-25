/**
 * Military mustering, hiring, and upkeep.
 *
 *   startMusterSoldiers — Spring action. Pop unit + 1 gold equipment + 1 food
 *     (1 year). Trains over 1 season as an OngoingAction. On completion the
 *     mustered unit is added to the realm and gets a loyalty group.
 *
 *   executeHireSoldiers — Spring action. Pay 1 year's wages and food up front,
 *     unit is available immediately (no ongoing).
 *
 *   executeAnnualMilitaryUpkeep — Auto, runs at start of Spring before
 *     population_upkeep. For each unit, deducts food + gold per the upkeep
 *     tables. Units that can't be supported automatically disband (their
 *     loyalty group is removed too).
 *
 * Each unit has its own LoyaltyGroup with kind='military' and attachedTo=unit.id,
 * so morale_upkeep iterates them naturally with everything else.
 */

import type { Race } from '../../types/rules'
import type { LoyaltyGroup, RealmState, TurnEvent } from '../state'
import type { Rng } from '../rng'
import type { ActionId, OngoingAction } from './types'
import { ConstructionError } from './construction'
import { ministerCheckBonus } from './ministers'

// ============================================================
// Types
// ============================================================

export type MilitaryUnitSize =
  | 'solo'
  | 'tiny'
  | 'small'
  | 'medium'
  | 'large'
  | 'huge'
  | 'gargantuan'
  | 'colossal'

export type MilitarySource = 'mustered' | 'mercenary'

export interface MilitaryUnit {
  id: string
  source: MilitarySource
  size: MilitaryUnitSize
  /** For mustered units: unit level. Starts at 1. */
  level: number
  /** For mercenaries: their CR. Effectively defines pay. */
  cr: number
  /** For mustered units: race of the soldiers. */
  race?: Race
  /** Stronghold linked via Manage Forces. Null until Summer's Manage Forces fires. */
  assignedStrongholdId: string | null
  /**
   * Equipment value per soldier in gp — weapons + armor (book §2.6).
   * Mustered units begin at 100 (the "Equipment kit: 100 gp/soldier per gp
   * spent" from the recruit cost). Mercenaries also start at 100 (they
   * arrive with their own kit). Outfit Unit adds Weapons & Armor trade
   * goods to push this higher; chapter-2 mass combat will translate this
   * into AC/damage modifiers.
   */
  equipmentGp: number
  /**
   * Magic-item value per soldier in gp. 0 by default. Outfit Unit adds
   * Magic Items trade goods. Tracked separately from equipment because
   * (a) magic items have higher unit value, (b) chapter 2 will treat
   * them as discrete enchantments rather than passive AC/damage bumps.
   */
  magicGp: number
}

export interface MusterSoldiersParams {
  race: Race
  homeAreaId: string
  size?: MilitaryUnitSize // defaults to 'medium' per the book (auto-mustered as Medium-size)
}

export interface HireSoldiersParams {
  cr: number
  size: MilitaryUnitSize
  /**
   * Optional gp spent on the Diplomacy check itself (separate from wages).
   * Each gp grants +2 circumstance bonus per book §2.6. Bribe gp is lost
   * if the check fails (mercenaries take the bribe and walk).
   */
  diplomacyBribeGp?: number
}

/**
 * Maximum CR the realm can hire given a Diplomacy total. Per book §2.6:
 *   total < 15  → 0 (no mercenaries available at all)
 *   15..24      → 0.5 (CR ½)
 *   25..34      → 1
 *   each +10    → +1 CR
 */
export function maxMercenaryCR(diplomacyTotal: number): number {
  if (diplomacyTotal < 15) return 0
  if (diplomacyTotal < 25) return 0.5
  return 1 + Math.floor((diplomacyTotal - 25) / 10)
}

// ============================================================
// Tables
// ============================================================

interface UpkeepRow {
  food: number
  gold: number
}

/** Mustered unit upkeep per the digest. */
const MUSTERED_UPKEEP: Record<MilitaryUnitSize, UpkeepRow> = {
  solo:       { food: 0, gold: 1 },
  tiny:       { food: 0, gold: 1 },
  small:      { food: 0, gold: 1 },
  medium:     { food: 1, gold: 1 },
  large:      { food: 2, gold: 1 },
  huge:       { food: 4, gold: 2 },
  gargantuan: { food: 6, gold: 4 },
  colossal:   { food: 8, gold: 6 },
}

/**
 * Mercenary Food Table (book §2.6, Military Unit Food Table).
 * The Small entry is 1/2 food/year — since our resource pool is integer-only
 * we round up to 1 in `mercenaryFoodUpkeep` (slight 50% overcharge for Smalls;
 * acceptable as the alternative is tracking fractional food per unit).
 */
const MERCENARY_FOOD: Record<MilitaryUnitSize, number> = {
  solo: 0, tiny: 0, small: 0.5, medium: 1, large: 2, huge: 4, gargantuan: 8, colossal: 12,
}

/**
 * Mercenary Pay Rate Table (book §2.6); pay = 2 × CR × multiplier per year.
 * Note: the rules digest has a stray secondary "pay multiplier" table with
 * Colossal = ×16, but the canonical book table reads ×12 for Colossal —
 * the food and pay columns share the same multiplier, which is what we use.
 */
const MERCENARY_PAY_MULTIPLIER: Record<MilitaryUnitSize, number> = {
  solo: 0.125, tiny: 0.25, small: 0.5, medium: 1, large: 2, huge: 4, gargantuan: 8, colossal: 12,
}

function mercenaryGoldUpkeep(unit: MilitaryUnit): number {
  return Math.ceil(2 * unit.cr * MERCENARY_PAY_MULTIPLIER[unit.size])
}

function mercenaryFoodUpkeep(unit: MilitaryUnit): number {
  return Math.ceil(MERCENARY_FOOD[unit.size])
}

/**
 * Mercenary equipment value per soldier in gp (book §2.6):
 * "Multiply a unit's CR by 200 to determine how many gp of equipment each
 * member has, to a maximum of 1,500 gp."
 */
export function mercenaryEquipmentGp(cr: number): number {
  return Math.min(1500, Math.max(0, Math.round(200 * cr)))
}

export function unitUpkeep(unit: MilitaryUnit): UpkeepRow {
  if (unit.source === 'mercenary') {
    return { food: mercenaryFoodUpkeep(unit), gold: mercenaryGoldUpkeep(unit) }
  }
  const base = MUSTERED_UPKEEP[unit.size]
  // Mustered: +1 gp per level above 1st
  return { food: base.food, gold: base.gold + Math.max(0, unit.level - 1) }
}

// ============================================================
// Helpers
// ============================================================

function makeId(): string {
  return crypto.randomUUID()
}

/** Adds a loyalty group entry for a freshly-created military unit. */
function addUnitLoyaltyGroup(state: RealmState, unit: MilitaryUnit, label: string): RealmState {
  const group: LoyaltyGroup = {
    id: makeId(),
    kind: 'military',
    label,
    baseWillSave: 2,
    score: 0,
    attachedTo: unit.id,
  }
  return { ...state, loyaltyGroups: [...state.loyaltyGroups, group] }
}

/** Removes the loyalty group attached to a disbanded unit. */
function removeUnitLoyaltyGroup(state: RealmState, unitId: string): RealmState {
  return {
    ...state,
    loyaltyGroups: state.loyaltyGroups.filter(
      (g) => !(g.kind === 'military' && g.attachedTo === unitId),
    ),
  }
}

const SIZE_LABELS: Record<MilitaryUnitSize, string> = {
  solo: 'Solo', tiny: 'Tiny', small: 'Small', medium: 'Medium-size',
  large: 'Large', huge: 'Huge', gargantuan: 'Gargantuan', colossal: 'Colossal',
}

export function unitDisplayName(unit: MilitaryUnit): string {
  if (unit.source === 'mercenary') {
    return `${SIZE_LABELS[unit.size]} mercenary unit (CR ${unit.cr})`
  }
  return `${SIZE_LABELS[unit.size]} ${unit.race ?? ''} warriors (level ${unit.level})`.trim()
}

// ============================================================
// Off-season penalty for military actions
// ============================================================

function offSeasonPenalty(season: RealmState['season']): number {
  // Per registry: Hire Soldiers / Muster Soldiers add a penalty out of season.
  // For MVP we model muster as +1 season training duration if started in summer/fall/winter
  // (mustered units take 1 season base). Hire mercenaries pay an extra gold (out of MVP scope —
  // skipped for simplicity).
  switch (season) {
    case 'spring': return 0
    case 'summer': return 1
    case 'fall':   return 1
    case 'winter': return 1
  }
}

// ============================================================
// Muster Soldiers — start an OngoingAction
// ============================================================

export function startMusterSoldiers(
  state: RealmState,
  params: MusterSoldiersParams,
  currentYear: number,
  currentSeason: RealmState['season'],
): { state: RealmState; events: TurnEvent[] } {
  const size: MilitaryUnitSize = params.size ?? 'medium'
  const upkeep = MUSTERED_UPKEEP[size]
  const equipmentGold = 1

  // Validate source population
  const sourceIdx = state.populations.findIndex(
    (p) => p.race === params.race && p.homeAreaId === params.homeAreaId && p.count > 0,
  )
  if (sourceIdx < 0) {
    throw new ConstructionError(
      `No ${params.race} living at the chosen area to muster from.`,
    )
  }

  // Validate resources: 1 gold (equipment) + first-year food
  if (state.resources.gold < equipmentGold) {
    throw new ConstructionError(`Not enough gold (need ${equipmentGold}).`)
  }
  if (state.resources.food < upkeep.food) {
    throw new ConstructionError(`Not enough food for the unit's first year (need ${upkeep.food}).`)
  }

  // Deduct: 1 pop + 1 gold + first-year food
  const newPopulations = state.populations.map((p, i) =>
    i === sourceIdx ? { ...p, count: p.count - 1 } : p,
  ).filter((p) => p.count > 0)

  const next: RealmState = {
    ...state,
    populations: newPopulations,
    resources: {
      ...state.resources,
      gold: state.resources.gold - equipmentGold,
      food: state.resources.food - upkeep.food,
    },
  }

  const duration = 1 + offSeasonPenalty(currentSeason)
  const ongoing: OngoingAction = {
    id: makeId(),
    actionId: 'muster_soldiers',
    startedYear: currentYear,
    startedSeason: currentSeason,
    seasonsRemaining: duration,
    parameters: { size, race: params.race, homeAreaId: params.homeAreaId },
    paidCost: { gold: equipmentGold, food: upkeep.food, population: 1, seasons: duration },
  }

  return {
    state: { ...next, ongoingActions: [...next.ongoingActions, ongoing] },
    events: [
      {
        type: 'construction_started',
        payload: { actionId: 'muster_soldiers', size, race: params.race, duration },
      },
    ],
  }
}

// ============================================================
// Level Up Unit — Spring action, mustered units only
// ============================================================

export class LevelUpUnitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LevelUpUnitError'
  }
}

export interface LevelUpUnitParams {
  unitId: string
}

/** Cost to raise a unit from `currentLevel` to `currentLevel + 1` (book §2.6: 1 + level gp). */
export function levelUpCost(currentLevel: number): number {
  return 1 + currentLevel
}

/** Returns the set of mustered unit ids that have already been leveled up this spring. */
export function unitsLeveledThisSpring(state: RealmState): Set<string> {
  const out = new Set<string>()
  for (const entry of state.actionsThisSeason) {
    if (entry.actionId === 'level_up_unit') {
      const id = (entry.meta as { unitId?: string } | undefined)?.unitId
      if (typeof id === 'string') out.add(id)
    }
  }
  return out
}

export function executeLevelUpUnit(
  state: RealmState,
  params: LevelUpUnitParams,
): { state: RealmState; events: TurnEvent[] } {
  if (state.season !== 'spring') {
    throw new LevelUpUnitError('Level Up Unit is a spring action.')
  }

  const unit = state.militaryUnits.find((u) => u.id === params.unitId)
  if (!unit) {
    throw new LevelUpUnitError('Unit not found.')
  }
  if (unit.source !== 'mustered') {
    throw new LevelUpUnitError(
      'Only mustered units can be levelled up — mercenaries already arrive at their hired CR.',
    )
  }
  if (unitsLeveledThisSpring(state).has(unit.id)) {
    throw new LevelUpUnitError('This unit has already been levelled up this year.')
  }

  const cost = levelUpCost(unit.level)
  if (state.resources.gold < cost) {
    throw new LevelUpUnitError(
      `Not enough gold (need ${cost} for level ${unit.level} → ${unit.level + 1}).`,
    )
  }

  const fromLevel = unit.level
  const toLevel = unit.level + 1
  const nextUnits = state.militaryUnits.map((u) =>
    u.id === unit.id ? { ...u, level: toLevel } : u,
  )

  // Refresh the unit's loyalty-group label so the display name stays in sync.
  const nextGroups = state.loyaltyGroups.map((g) =>
    g.kind === 'military' && g.attachedTo === unit.id
      ? { ...g, label: unitDisplayName({ ...unit, level: toLevel }) }
      : g,
  )

  const next: RealmState = {
    ...state,
    militaryUnits: nextUnits,
    loyaltyGroups: nextGroups,
    resources: { ...state.resources, gold: state.resources.gold - cost },
    actionsThisSeason: [
      ...state.actionsThisSeason,
      {
        actionId: 'level_up_unit',
        takenAt: new Date().toISOString(),
        meta: { unitId: unit.id, fromLevel, toLevel, cost },
      },
    ],
  }

  return {
    state: next,
    events: [
      {
        type: 'unit_levelled_up',
        payload: {
          unitId: unit.id,
          fromLevel,
          toLevel,
          cost,
          size: unit.size,
          race: unit.race ?? null,
        },
      },
    ],
  }
}

/** Called by the orchestrator when a muster_soldiers OngoingAction completes. */
export function applyCompletedMuster(
  state: RealmState,
  ongoing: OngoingAction,
): { state: RealmState; events: TurnEvent[] } {
  const { size, race } = ongoing.parameters as {
    size: MilitaryUnitSize
    race: Race
    homeAreaId: string
  }
  const unit: MilitaryUnit = {
    id: makeId(),
    source: 'mustered',
    size,
    level: 1,
    cr: 0.5, // 1st-level warrior CR
    race,
    assignedStrongholdId: null,
    equipmentGp: 100, // book §2.6: "100 gp/soldier per gp spent" on muster
    magicGp: 0,
  }
  const withUnit: RealmState = {
    ...state,
    militaryUnits: [...state.militaryUnits, unit],
  }
  const final = addUnitLoyaltyGroup(withUnit, unit, unitDisplayName(unit))
  return {
    state: final,
    events: [
      { type: 'unit_mustered', payload: { unitId: unit.id, size, race } },
    ],
  }
}

// ============================================================
// Hire Soldiers — instant
// ============================================================

export function executeHireSoldiers(
  state: RealmState,
  params: HireSoldiersParams,
  rng?: Rng,
): { state: RealmState; events: TurnEvent[] } {
  const { cr, size } = params
  const diplomacyBribeGp = params.diplomacyBribeGp ?? 0
  if (cr <= 0) throw new ConstructionError(`CR must be positive.`)
  if (!Number.isFinite(diplomacyBribeGp) || diplomacyBribeGp < 0) {
    throw new ConstructionError(`Diplomacy bribe gp must be ≥ 0.`)
  }

  // Cost = 1 year's wages + 1 year's food. Out-of-season adds +1 gold.
  const baseGoldCost = Math.ceil(2 * cr * MERCENARY_PAY_MULTIPLIER[size])
  const offSeasonPenalty = state.season === 'spring' ? 0 : 1
  const wagesCost = baseGoldCost + offSeasonPenalty
  const foodCost = Math.ceil(MERCENARY_FOOD[size])

  // Pre-flight gold check covers wages + bribe (food checked after).
  if (state.resources.gold < wagesCost + diplomacyBribeGp) {
    throw new ConstructionError(
      `Not enough gold (need ${wagesCost + diplomacyBribeGp} = ${wagesCost} wages + ${diplomacyBribeGp} bribe).`,
    )
  }
  if (state.resources.food < foodCost) {
    throw new ConstructionError(`Not enough food (need ${foodCost}).`)
  }

  // Diplomacy check (book §2.6). General level applies; vacant role -2.
  // No marketplace/port bonus — this is social, not economics.
  // Caller may omit `rng` for tests that pre-decide the outcome; fall back
  // to a fresh RNG so production paths still work without ceremony.
  const checkRng = rng ?? { d20: () => 10 + Math.floor(Math.random() * 11) } as Rng
  const natural = checkRng.d20 ? checkRng.d20() : 10
  const { bonus: generalBonus, minister: general } = ministerCheckBonus(state, 'general')
  const total = natural + generalBonus + 2 * diplomacyBribeGp
  const maxCR = maxMercenaryCR(total)

  if (cr > maxCR) {
    // Failure: bribe gp was already paid to merchants and is lost. Wages
    // and food are NOT charged — no unit hired.
    const next: RealmState = {
      ...state,
      resources: {
        ...state.resources,
        gold: state.resources.gold - diplomacyBribeGp,
      },
    }
    return {
      state: next,
      events: [
        {
          type: 'hire_soldiers_failed',
          payload: {
            size,
            requestedCR: cr,
            maxCR,
            diplomacyBribeGp,
            check: {
              natural,
              total,
              generalBonus,
              generalName: general?.name ?? null,
            },
          },
        },
      ],
    }
  }

  const unit: MilitaryUnit = {
    id: makeId(),
    source: 'mercenary',
    size,
    level: 1,
    cr,
    assignedStrongholdId: null,
    // Book §2.6: mercenaries arrive with 200 × CR gp/soldier of equipment (cap 1500).
    equipmentGp: mercenaryEquipmentGp(cr),
    magicGp: 0,
  }
  const next: RealmState = {
    ...state,
    militaryUnits: [...state.militaryUnits, unit],
    resources: {
      ...state.resources,
      gold: state.resources.gold - wagesCost - diplomacyBribeGp,
      food: state.resources.food - foodCost,
    },
  }
  const final = addUnitLoyaltyGroup(next, unit, unitDisplayName(unit))
  return {
    state: final,
    events: [
      {
        type: 'unit_hired',
        payload: {
          unitId: unit.id,
          size,
          cr,
          goldCost: wagesCost + diplomacyBribeGp,
          wagesCost,
          diplomacyBribeGp,
          foodCost,
          offSeasonPenalty,
          maxCR,
          check: {
            natural,
            total,
            generalBonus,
            generalName: general?.name ?? null,
          },
        },
      },
    ],
  }
}

// ============================================================
// Annual Military Upkeep — auto, runs at start of spring
// ============================================================

export function executeAnnualMilitaryUpkeep(
  state: RealmState,
  _rng: Rng,
): { state: RealmState; events: TurnEvent[] } {
  if (state.militaryUnits.length === 0) {
    return {
      state,
      events: [{ type: 'military_upkeep', payload: { phase: 'spring', units: 0 } }],
    }
  }

  let next = state
  const supported: string[] = []
  const disbanded: { unitId: string; reason: string }[] = []

  for (const unit of state.militaryUnits) {
    const { food, gold } = unitUpkeep(unit)
    const haveFood = next.resources.food >= food
    const haveGold = next.resources.gold >= gold
    if (haveFood && haveGold) {
      next = {
        ...next,
        resources: {
          ...next.resources,
          food: next.resources.food - food,
          gold: next.resources.gold - gold,
        },
      }
      supported.push(unit.id)
    } else {
      // Auto-disband: remove the unit + its loyalty group
      next = {
        ...next,
        militaryUnits: next.militaryUnits.filter((u) => u.id !== unit.id),
      }
      next = removeUnitLoyaltyGroup(next, unit.id)
      disbanded.push({
        unitId: unit.id,
        reason: !haveFood ? 'insufficient food' : 'insufficient gold',
      })
    }
  }

  return {
    state: next,
    events: [
      {
        type: 'military_upkeep',
        payload: {
          phase: 'spring',
          units: state.militaryUnits.length,
          supported: supported.length,
          disbandedCount: disbanded.length,
          disbanded,
        },
      },
    ],
  }
}

// ============================================================
// Dispatch glue used by the orchestrator
// ============================================================

export function applyCompletedMilitary(
  state: RealmState,
  ongoing: OngoingAction,
): { state: RealmState; events: TurnEvent[] } | null {
  if ((ongoing.actionId as ActionId) === 'muster_soldiers') {
    return applyCompletedMuster(state, ongoing)
  }
  return null
}
