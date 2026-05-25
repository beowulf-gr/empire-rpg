/**
 * Survey for New Vein — the follow-up survey action.
 *
 * Two phases, same shape as a construction action:
 *
 *   1. startSurveyForNewVein: validate (area is hills/mountains, already
 *      surveyed, area must already have at least one mineral), commit 1
 *      idle population unit, queue an OngoingAction with seasonsRemaining
 *      = 2 + off-season penalty.
 *
 *   2. applyCompletedSurveyForNewVeinAction: when the ongoing action's
 *      timer ticks to zero, return the committed worker to their home and
 *      run the d100 threshold check + mineral table roll via
 *      applyCompletedSurveyForNewVein in survey.ts.
 *
 * Wired into the orchestrator's tickOngoingActions dispatcher chain
 * alongside the existing applyCompleted* handlers.
 */

import type { Season } from '../../types/rules'
import type { RealmState, TurnEvent } from '../state'
import type { Rng } from '../rng'
import { applyCompletedSurveyForNewVein as resolveNewVeinRoll } from '../survey'
import type { OngoingAction } from './types'
import {
  commitIdlePopulation,
  returnCommittedPopulation,
  type CommittedPopChunk,
} from './populationCommit'

export class SurveyForNewVeinError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SurveyForNewVeinError'
  }
}

export interface SurveyForNewVeinParams {
  areaId: string
}

interface StartResult {
  state: RealmState
  events: TurnEvent[]
}

/** Off-season duration penalty (matches construction.ts). */
function offSeasonPenalty(season: Season): number {
  switch (season) {
    case 'spring': return 0
    case 'summer': return 1
    case 'fall':   return 2
    case 'winter': return Number.POSITIVE_INFINITY // prohibited
  }
}

let nextOngoingId = 0
function makeId(): string {
  return `oa-survey-vein-${Date.now()}-${nextOngoingId++}`
}

/**
 * Queues the multi-season Survey for New Vein action. Validates that the
 * area exists, is hills/mountains, and has already been surveyed (this is
 * a *follow-up* survey, not the initial one — the initial survey runs
 * synchronously via surveyForMinerals). Commits 1 idle pop.
 */
export function startSurveyForNewVein(
  state: RealmState,
  params: SurveyForNewVeinParams,
  currentYear: number,
  currentSeason: Season,
): StartResult {
  const area = state.areas.find((a) => a.id === params.areaId)
  if (!area) {
    throw new SurveyForNewVeinError(`Unknown area: ${params.areaId}.`)
  }
  if (area.terrain !== 'hills' && area.terrain !== 'mountains') {
    throw new SurveyForNewVeinError(
      `Only hills or mountains can be re-surveyed for new veins (got ${area.terrain}).`,
    )
  }
  if (area.mineralResults.length === 0) {
    throw new SurveyForNewVeinError(
      'Run the initial survey first — there\'s nothing to expand on yet.',
    )
  }
  if (area.terrain === 'mountains' && area.mineralResults.length >= 2) {
    throw new SurveyForNewVeinError(
      'This mountain already has two veins (the maximum). No room for a new strike.',
    )
  }

  const penalty = offSeasonPenalty(currentSeason)
  if (!Number.isFinite(penalty)) {
    throw new SurveyForNewVeinError('Cannot start a survey in winter.')
  }

  // Commit 1 idle worker for the duration. commitIdlePopulation throws
  // a PopulationCommitError on insufficient pop; let that propagate.
  const { state: afterCommit, committed } = commitIdlePopulation(state, 1)

  const duration = 2 + penalty
  const ongoing: OngoingAction = {
    id: makeId(),
    actionId: 'survey_for_new_vein',
    startedYear: currentYear,
    startedSeason: currentSeason,
    seasonsRemaining: duration,
    parameters: {
      areaId: params.areaId,
      popCommitted: committed,
    },
    paidCost: { population: 1, seasons: duration },
  }

  return {
    state: { ...afterCommit, ongoingActions: [...afterCommit.ongoingActions, ongoing] },
    events: [
      {
        type: 'survey_for_new_vein_started',
        payload: {
          areaId: params.areaId,
          terrain: area.terrain,
          duration,
        },
      },
    ],
  }
}

/**
 * Dispatcher hook for orchestrator.tickOngoingActions. Returns null if this
 * ongoing action isn't a Survey-for-new-vein; otherwise resolves the d100
 * roll, applies the area update, and returns the workers home.
 */
export function applyCompletedSurveyForNewVeinAction(
  state: RealmState,
  ongoing: OngoingAction,
  rng: Rng,
): StartResult | null {
  if (ongoing.actionId !== 'survey_for_new_vein') return null

  const areaId = ongoing.parameters?.areaId as string | undefined
  const popCommitted =
    (ongoing.parameters?.popCommitted as CommittedPopChunk[] | undefined) ?? []
  if (!areaId) {
    // Defensive — return any committed pop and emit a no-op event.
    const restored = returnCommittedPopulation(state, popCommitted)
    return {
      state: restored,
      events: [
        {
          type: 'survey_new_vein',
          payload: { outcome: 'invalid', reason: 'missing areaId' },
        },
      ],
    }
  }

  const rollResult = resolveNewVeinRoll(state, areaId, rng)
  const restored = returnCommittedPopulation(rollResult.state, popCommitted)
  return {
    state: restored,
    events: [rollResult.event],
  }
}
