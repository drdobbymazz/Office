// Story mode ("Closing Time"): five days, one main job a day, Branch Standing
// and a daily influence budget. See story.ts (the week), day.ts (one day),
// chapters.ts (the five days' logic), rules.ts (the numbers), text.ts (the words).

export { Story, browserStore, memoryStore, pickLeak, STATE_KEY, WORLD_KEY } from './story';
export type { StoryState, StoryStore, StorySaved } from './story';
export { StoryDay } from './day';
export type { StoryDayHooks } from './day';
export { CHAPTER_DEFS, FIGGIS, SALES, BULLPEN_STAFF, registerFiggis } from './chapters';
export { PARK_CHAPTER_DEFS, RANGER, registerRanger } from './parkChapters';
export { ParkIntroScene, PARK_INTRO_PREROLL } from './parkIntro';
export { ParkFinaleScene } from './parkFinale';
export { EPISODES, OFFICE_EPISODE, PARK_EPISODE, episodeById } from './episodes';
export type { EpisodeDef } from './episodes';
export * from './rules';
export { ENDING_RULE } from './text';
export { PARK_ENDING_RULE, PARK_EPISODE_META } from './parkText';
export type { ChapterDef, ChapterResult, EpisodeId, GoalState, PlayerAction, WeekNotes } from './types';
