/**
 * Outfit Unit (Phase 3j) — issue Weapons & Armor or Magic Items trade
 * goods to a military unit per book §2.6 Unit Outfitting Table.
 *
 * The book's table:
 *
 *   Size        | Supply units to grant 100 gp/soldier of gear
 *   ----------- | --------------------------------------------
 *   Solo        | 1/8
 *   Tiny        | 1/4
 *   Small       | 1/2
 *   Medium-size | 1
 *   Large       | 2
 *   Huge        | 4
 *   Gargantuan  | 8
 *   Colossal    | 16
 *
 * "Multiples scale linearly: 2× the listed amount → 200 gp/soldier."
 *
 * So gp-of-gear-per-soldier added = (supplies / supplyPer100Gp[size]) × 100.
 *
 * Weapons & Armor go into MilitaryUnit.equipmentGp; Magic Items into
 * MilitaryUnit.magicGp. Tracked separately because magic items will get
 * discrete treatment in chapter-2 mass combat.
 */

import type { RealmState, TurnEvent } from '../state'
import type { MilitaryUnit, MilitaryUnitSize } from './military'
import type { TradeGoodKind, TradeGoodInventory } from './tradeGoods'

// ============================================================
// Errors
// ============================================================

export class OutfitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutfitError'
  }
}

// ============================================================
// Tables
// ============================================================

/**
 * Supply units required to grant 100 gp/soldier of gear, indexed by unit
 * size. Per book §2.6 Unit Outfitting Table.
 */
export const SUPPLY_PER_100GP: Record<MilitaryUnitSize, number> = {
  solo: 1 / 8,
  tiny: 1 / 4,
  small: 1 / 2,
  medium: 1,
  large: 2,
  huge: 4,
  gargantuan: 8,
  colossal: 16,
}

/**
 * The two trade goods that can outfit a unit. Wooden Goods and Exotic
 * Items don't translate to combat gear (the book doesn't list them in
 * the Outfitting Table — they're general trade commodities for Sell).
 */
export type OutfitGoodKind = 'weapons_and_armor' | 'magic_items'

const OUTFIT_GOOD_KINDS: OutfitGoodKind[] = ['weapons_and_armor', 'magic_items']

export function isOutfitGoodKind(k: TradeGoodKind): k is OutfitGoodKind {
  return OUTFIT_GOOD_KINDS.includes(k as OutfitGoodKind)
}

// ============================================================
// Math helpers
// ============================================================

/**
 * Computes the gp/soldier of gear added when `supplyAmount` units of a
 * supply good are issued to a unit of `size`. Fractional supplies are
 * not supported (positive integers only) — the table accommodates small
 * sizes by giving them >1 gp/soldier per supply unit (e.g., 1 W&A → 800
 * gp/soldier on a Solo).
 */
export function gearGpPerSupply(size: MilitaryUnitSize): number {
  return Math.round(100 / SUPPLY_PER_100GP[size])
}

/**
 * gp/soldier added when issuing N supply units to a unit of given size.
 * Always an integer multiple of the per-supply value.
 */
export function gearGpAdded(size: MilitaryUnitSize, supplyAmount: number): number {
  return supplyAmount * gearGpPerSupply(size)
}

/** Total gear value per soldier (equipment + magic). */
export function totalGearGpPerSoldier(unit: MilitaryUnit): number {
  return unit.equipmentGp + unit.magicGp
}

/**
 * Qualitative tier label for a unit's combined gear value. Useful for
 * the dashboard. These bands are arbitrary but match the rough power
 * progression in 3e equipment scaling (commoner kit ~50 gp, basic
 * militia ~150, armored knight ~500, magic-item-adorned ~1000+).
 */
export function gearTier(unit: MilitaryUnit): {
  label: string
  tone: 'low' | 'standard' | 'good' | 'elite' | 'legendary'
} {
  const total = totalGearGpPerSoldier(unit)
  if (total < 100) return { label: 'Underequipped', tone: 'low' }
  if (total < 250) return { label: 'Standard', tone: 'standard' }
  if (total < 500) return { label: 'Well-equipped', tone: 'good' }
  if (total < 1000) return { label: 'Elite', tone: 'elite' }
  return { label: 'Legendary', tone: 'legendary' }
}

// ============================================================
// Soldier counts
// ============================================================

/**
 * Soldiers per unit at Barony scale. Per book §2.6 Medium = 150
 * (Barony) / 750 (Kingdom) / 1500 (Empire). Other sizes scaled by the
 * same multipliers as the supply table — Solo = 1 (a champion / lone
 * hero rather than 1/8 of 150).
 */
const SOLDIERS_BARONY: Record<MilitaryUnitSize, number> = {
  solo: 1,
  tiny: 5,
  small: 50,
  medium: 150,
  large: 300,
  huge: 600,
  gargantuan: 1200,
  colossal: 2400,
}

const SCALE_SOLDIER_MULT: Record<RealmState['scale'], number> = {
  barony: 1,
  kingdom: 5,
  empire: 10,
}

/** Total soldiers in a unit, for display. */
export function unitSoldierCount(unit: MilitaryUnit, scale: RealmState['scale']): number {
  return SOLDIERS_BARONY[unit.size] * SCALE_SOLDIER_MULT[scale]
}

// ============================================================
// Execute
// ============================================================

export interface OutfitUnitParams {
  unitId: string
  /** Which trade good to issue. Restricted to W&A or Magic Items. */
  kind: OutfitGoodKind
  /** Number of trade-good units to issue. Positive integer. */
  supplyAmount: number
}

interface OutfitOutcome {
  state: RealmState
  events: TurnEvent[]
}

export function executeOutfitUnit(
  state: RealmState,
  params: OutfitUnitParams,
): OutfitOutcome {
  const { unitId, kind, supplyAmount } = params

  const unit = state.militaryUnits.find((u) => u.id === unitId)
  if (!unit) {
    throw new OutfitError(`No military unit with id ${unitId}.`)
  }
  if (!isOutfitGoodKind(kind)) {
    throw new OutfitError(`${kind} cannot be issued to military units.`)
  }
  if (!Number.isInteger(supplyAmount) || supplyAmount <= 0) {
    throw new OutfitError(
      `Supply amount must be a positive integer (got ${supplyAmount}).`,
    )
  }
  const have = state.tradeGoods[kind] ?? 0
  if (have < supplyAmount) {
    throw new OutfitError(
      `Not enough ${kind} (have ${have}, need ${supplyAmount}).`,
    )
  }

  const gpAddedPerSoldier = gearGpAdded(unit.size, supplyAmount)
  const updatedUnit: MilitaryUnit =
    kind === 'weapons_and_armor'
      ? { ...unit, equipmentGp: unit.equipmentGp + gpAddedPerSoldier }
      : { ...unit, magicGp: unit.magicGp + gpAddedPerSoldier }

  const newInventory: TradeGoodInventory = {
    ...state.tradeGoods,
    [kind]: have - supplyAmount,
  }

  return {
    state: {
      ...state,
      militaryUnits: state.militaryUnits.map((u) =>
        u.id === unitId ? updatedUnit : u,
      ),
      tradeGoods: newInventory,
    },
    events: [
      {
        type: 'unit_outfitted',
        payload: {
          unitId,
          kind,
          supplyAmount,
          gpAddedPerSoldier,
          newEquipmentGp: updatedUnit.equipmentGp,
          newMagicGp: updatedUnit.magicGp,
        },
      },
    ],
  }
}
