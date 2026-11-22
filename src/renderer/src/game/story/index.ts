// Story mode ("Closing Time"): five days, one main job a day, Branch Standing
// and a daily influence budget. See story.ts (the week), day.ts (one day),
// chapters.ts (the five days' logic), rules.ts (the numbers), text.ts (the words).

export { Story, browserStore, memoryStore, pickLeak, STATE_KEY, WORLD_KEY } from './story';
export type { StoryState, StoryStore, StorySaved } from './story';
export { StoryDay } from './day';
export type { StoryDayHooks } from './day';
export { CHAPTER_DEFS, FIGGIS, SALES, BULLPEN_STAFF, registerFiggis } from './chapters';
export * from './rules';
export type { ChapterDef, ChapterResult, GoalState, PlayerAction, WeekNotes } from './types';
