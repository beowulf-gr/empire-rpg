/**
 * Empire RPG rules engine — barrel re-exports.
 */

export { createRng } from './rng'
export type { Rng } from './rng'

export {
  committedPopulation,
  livingSpaceForArea,
  populationByRaceOnArea,
  populationByRaceWorkingArea,
  populationLivingOnArea,
  populationWorkingArea,
  strongholdSettlementCapBonus,
  totalLivingSpace,
  totalPopulation,
} from './state'
export type {
  AreaState,
  PopulationStack,
  RealmState,
  StrongholdState,
  TurnEvent,
} from './state'

export { createStartingDomain } from './createDomain'
export type { CreateDomainOptions } from './createDomain'

export { harvestArea, harvestRealm, applyResourceDelta } from './harvest'
export type { HarvestResult } from './harvest'

// Survey-for-minerals — player's stone/mineral choice on hills/mountains
export { setHarvestMode, surveyForMinerals, SurveyError } from './survey'
export type { SurveyResult } from './survey'

export { resolveRandomEvent } from './events'
export type { RandomEventOutcome } from './events'

// Season + orchestrator (post-2f.2)
export { endSeason, resolveSeason, populationGrowthPercent } from './season'
export type { SeasonResolution } from './season'
export { bootSpring } from './actions/orchestrator'

export {
  AssignPopulationError,
  movePopulationHome,
  setPopulationWork,
} from './assignPopulation'
export type { MoveHomeInput, SetWorkInput } from './assignPopulation'

// Action registry + types
export {
  ACTION_REGISTRY,
  actionsByCategory,
  findActionById,
  obligatoryActionsForSeason,
} from './actions/registry'

// Limited-descriptor enforcement helpers
export {
  assertLimitedNotTaken,
  isLimitedActionExhausted,
} from './actions/limited'

// Level Up Unit (mustered units, spring, max one level-up per unit per year)
export {
  LevelUpUnitError,
  executeLevelUpUnit,
  levelUpCost,
  unitsLeveledThisSpring,
} from './actions/military'
export type { LevelUpUnitParams } from './actions/military'

// Recruit Settlers (interactive, spring, Limited 3×)
export {
  RECRUIT_SETTLERS_PER_SPRING,
  RecruitSettlersError,
  executeRecruitSettlers,
  recruitChecksThisSpring,
  recruitedRacesThisSpring,
  settlerCheckBaseBonus,
  settlerCheckResult,
} from './actions/recruit'
export type {
  RecruitSettlersOutcome,
  RecruitSettlersParams,
} from './actions/recruit'
export type {
  ActionCategory,
  ActionCost,
  ActionDefinition,
  ActionDescriptor,
  ActionId,
  ActionKind,
  ActionLog,
  ActionPanel,
  OngoingAction,
  ObligatoryTiming,
} from './actions/types'
