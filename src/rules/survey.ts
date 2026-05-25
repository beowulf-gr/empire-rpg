/**
 * Survey for minerals - the player's "switch this hills/mountain area from
 * stone harvest to mineral harvest" action.
 *
 * Per the digest section 4 and the book's mineral rules:
 *
 *   Hills: when the player toggles to mineral mode for the first time, roll
 *     d100 once on the mineral table. The result picks the single mineral
 *     this area will produce forever.
 *
 *   Mountains: roll d100 twice. The two minerals are BOTH stored. If both
 *     rolls land on the same mineral the area only produces that one (a
 *     single rich vein, +2 per harvest); if they differ, the area produces
 *     both at +1 each per harvest.
 *
 * Survey for new vein (book follow-up action): after the initial survey, a
 * player can spend 1 pop unit and 2 seasons on the area. On completion roll
 * d100 - hills need 95+, mountains need 90+ - and on a pass, roll the
 * mineral table again. If the discovered mineral is new (not already on
 * the area), it's added. Mountains cap at 2 distinct minerals; hills stay
 * at 1 (any new-vein roll on hills replaces the old mineral - flavour is
 * "you found a richer seam"). The ongoing-action plumbing lives in
 * actions/surveyForNewVein.ts; the dice work is here so all the mineral-
 * table logic lives in one file.
 *
 * Switching back from mineral mode to stone mode is free and reversible.
 */

import type { ResourceKey } from '../types/rules'
import type { AreaState, RealmState, TurnEvent } from './state'
import type { Rng } from './rng'

// ============================================================
// d100 mineral table - mirrors the table in rules-digest.md section 4.
// Hills roll on this once; mountains roll twice.
// ============================================================

const MINERAL_TABLE: readonly { min: number; max: number; value: ResourceKey }[] = [
  { min: 1,  max: 3,   value: 'adamantine' },
  { min: 4,  max: 20,  value: 'copper' },
  { min: 21, max: 27,  value: 'gold_metal' },
  { min: 28, max: 87,  value: 'iron' },
  { min: 88, max: 90,  value: 'mithral' },
  { min: 91, max: 100, value: 'silver' },
]

function lookupMineral(roll: number): ResourceKey {
  for (const row of MINERAL_TABLE) {
    if (roll >= row.min && roll <= row.max) return row.value
  }
  throw new Error(`lookupMineral: roll ${roll} not in 1..100`)
}

// ============================================================
// Errors
// ============================================================

export class SurveyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SurveyError'
  }
}

// ============================================================
// surveyForMinerals - initial survey (hills: 1 roll, mountains: 2 rolls)
// ============================================================

export interface SurveyResult {
  state: RealmState
  /** Single 'survey_minerals' event describing the rolls + outcome. */
  event: TurnEvent
  /**
   * Discovered minerals. Always at least 1 entry on hills/mountains success;
   * 1 or 2 entries on mountains (deduplicated when both rolls matched).
   * Empty array on "reactivated" (already-surveyed re-toggle). The legacy
   * single-mineral consumers can read minerals[0] ?? null.
   */
  minerals: ResourceKey[]
}

/**
 * Run a survey on a hills or mountain area. Updates mineralResults and
 * harvestMode on success. The mountain rule from the book reads "roll
 * twice; if you get the same mineral, only that one is mined." The
 * implementation matches that by deduplicating identical rolls into a
 * single-element array (a single rich vein), while distinct rolls produce
 * a two-element array (two adjacent veins).
 *
 * If the area already has minerals stored we DON'T re-roll - we just flip
 * the harvestMode (the rare-mineral lottery only happens once; use the
 * Survey-for-new-vein action to expand the list).
 */
export function surveyForMinerals(
  state: RealmState,
  areaId: string,
  rng: Rng,
): SurveyResult {
  const area = state.areas.find((a) => a.id === areaId)
  if (!area) throw new SurveyError(`Area ${areaId} is not in this realm.`)
  if (area.terrain !== 'hills' && area.terrain !== 'mountains') {
    throw new SurveyError(`Only hills and mountains can be surveyed (got ${area.terrain}).`)
  }

  // Already surveyed: just toggle to mineral mode, no new roll.
  if (area.mineralResults.length > 0) {
    const updated = patchArea(state, areaId, { harvestMode: 'mineral' })
    return {
      state: updated,
      event: {
        type: 'survey_minerals',
        payload: {
          areaId,
          terrain: area.terrain,
          outcome: 'reactivated',
          minerals: [...area.mineralResults],
        },
      },
      minerals: [...area.mineralResults] as ResourceKey[],
    }
  }

  // Hills: roll d100 once. Always succeeds.
  if (area.terrain === 'hills') {
    const roll = rng.d100()
    const mineral = lookupMineral(roll)
    const updated = patchArea(state, areaId, {
      mineralResults: [mineral],
      harvestMode: 'mineral',
    })
    return {
      state: updated,
      event: {
        type: 'survey_minerals',
        payload: {
          areaId,
          terrain: 'hills',
          outcome: 'success',
          minerals: [mineral],
          roll,
        },
      },
      minerals: [mineral],
    }
  }

  // Mountains: roll d100 twice. ALWAYS succeed. Same mineral both rolls
  // dedupes to a single-element list; different rolls become a two-element list.
  const rollA = rng.d100()
  const rollB = rng.d100()
  const mineralA = lookupMineral(rollA)
  const mineralB = lookupMineral(rollB)
  const minerals = mineralA === mineralB ? [mineralA] : [mineralA, mineralB]
  const updated = patchArea(state, areaId, {
    mineralResults: minerals,
    harvestMode: 'mineral',
  })
  return {
    state: updated,
    event: {
      type: 'survey_minerals',
      payload: {
        areaId,
        terrain: 'mountains',
        outcome: 'success',
        minerals,
        rollA,
        rollB,
        mineralA,
        mineralB,
      },
    },
    minerals,
  }
}

// ============================================================
// surveyForNewVein - applied at the END of the multi-season action.
// ============================================================

export interface NewVeinResult {
  state: RealmState
  event: TurnEvent
  /** Mineral that was added to the area, or null if no new vein was found. */
  added: ResourceKey | null
}

/**
 * Resolves the "spend 1 pop x 2 seasons to look for a new ore vein" action
 * after it ticks down to zero. Two-step roll per the book:
 *
 *   1. d100 threshold check. Hills require 95+, mountains require 90+.
 *   2. On pass: roll the mineral table. If the result is a NEW mineral
 *      (not already in area.mineralResults), add it (mountains: cap at
 *      2 entries; hills: replace the single existing mineral with the new
 *      one). If the result duplicates an existing mineral, count it as
 *      "no new vein" - the survey turned up the seam you already knew
 *      about.
 *
 * Either way emits a survey_new_vein event with the rolls + outcome so
 * the season-transition dialog can describe what happened.
 */
export function applyCompletedSurveyForNewVein(
  state: RealmState,
  areaId: string,
  rng: Rng,
): NewVeinResult {
  const area = state.areas.find((a) => a.id === areaId)
  if (!area) {
    return {
      state,
      event: {
        type: 'survey_new_vein',
        payload: { areaId, outcome: 'invalid', reason: 'area missing' },
      },
      added: null,
    }
  }
  if (area.terrain !== 'hills' && area.terrain !== 'mountains') {
    return {
      state,
      event: {
        type: 'survey_new_vein',
        payload: { areaId, outcome: 'invalid', reason: 'wrong terrain' },
      },
      added: null,
    }
  }

  const threshold = area.terrain === 'mountains' ? 90 : 95
  const thresholdRoll = rng.d100()
  if (thresholdRoll < threshold) {
    return {
      state,
      event: {
        type: 'survey_new_vein',
        payload: {
          areaId,
          terrain: area.terrain,
          outcome: 'threshold_fail',
          thresholdRoll,
          threshold,
        },
      },
      added: null,
    }
  }

  // Passed the threshold - roll on the minerals table.
  const veinRoll = rng.d100()
  const candidate = lookupMineral(veinRoll)
  const alreadyHas = area.mineralResults.includes(candidate)

  if (alreadyHas) {
    return {
      state,
      event: {
        type: 'survey_new_vein',
        payload: {
          areaId,
          terrain: area.terrain,
          outcome: 'duplicate',
          thresholdRoll,
          threshold,
          veinRoll,
          mineral: candidate,
        },
      },
      added: null,
    }
  }

  // Mountains cap at 2 minerals; if we'd be the 3rd, treat as "no new vein"
  // (the seam exists but there's no room to exploit it).
  if (area.terrain === 'mountains' && area.mineralResults.length >= 2) {
    return {
      state,
      event: {
        type: 'survey_new_vein',
        payload: {
          areaId,
          terrain: area.terrain,
          outcome: 'capacity_full',
          thresholdRoll,
          threshold,
          veinRoll,
          mineral: candidate,
        },
      },
      added: null,
    }
  }

  // Hills: keep just the new mineral (single-mineral terrain - the new
  // seam supplants the old). Mountains: append to existing list.
  const newMinerals =
    area.terrain === 'hills' ? [candidate] : [...area.mineralResults, candidate]
  const updated = patchArea(state, areaId, { mineralResults: newMinerals })
  return {
    state: updated,
    event: {
      type: 'survey_new_vein',
      payload: {
        areaId,
        terrain: area.terrain,
        outcome: 'success',
        thresholdRoll,
        threshold,
        veinRoll,
        mineral: candidate,
        // For hills, the displaced previous mineral (if any) - for flavour.
        replacedMineral:
          area.terrain === 'hills' && area.mineralResults.length > 0
            ? area.mineralResults[0]
            : null,
      },
    },
    added: candidate,
  }
}

/**
 * Toggles a hills/mountain area's harvestMode between 'stone' and 'mineral'.
 * Throws if the area isn't hills/mountains or if the caller tries to set
 * 'mineral' on an unsurveyed area (use surveyForMinerals first).
 */
export function setHarvestMode(
  state: RealmState,
  areaId: string,
  mode: 'stone' | 'mineral',
): RealmState {
  const area = state.areas.find((a) => a.id === areaId)
  if (!area) throw new SurveyError(`Area ${areaId} is not in this realm.`)
  if (area.terrain !== 'hills' && area.terrain !== 'mountains') {
    throw new SurveyError(`Harvest mode only applies to hills/mountains.`)
  }
  if (mode === 'mineral' && area.mineralResults.length === 0) {
    throw new SurveyError(`Survey for minerals first - the area hasn't been surveyed yet.`)
  }
  return patchArea(state, areaId, { harvestMode: mode })
}

// ============================================================
// Helper
// ============================================================

function patchArea(state: RealmState, areaId: string, patch: Partial<AreaState>): RealmState {
  return {
    ...state,
    areas: state.areas.map((a) => (a.id === areaId ? { ...a, ...patch } : a)),
  }
}
