// Endless Saga ("Free + Arcs"): weekly 5-day arcs that cycle endlessly across
// seasons with carried bonds, reactive twists, AI Showrunner continuity, and
// zero influence/lock restrictions.

export { Saga, SAGA_STATE_KEY, SAGA_WORLD_KEY } from './saga';
export { SagaDay, SAGA_EXTRA_STANDING } from './day';
export type { SagaDayHooks } from './day';
export { SAGA_ARCS, SAGA_EXTRAS, SAGA_MOLE_CANDIDATES, arcById, pickArcDeck, pickSagaMole } from './arcs';
export type {
  SagaAiEpisode, SagaArcDef, SagaArcId, SagaChapterDef, SagaDayTally, SagaExtraDef, SagaExtraKind,
  SagaGoalSpec, SagaNotes, SagaSaved, SagaSeasonRecord, SagaState
} from './types';
