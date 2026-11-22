// The week: which chapter is next, Branch Standing, each day's result, what
// later days remember, and saving all of it. Saved apart from the sandbox
// world: 'story.state.v1' (this file's state) and 'story.world.v1' (the office
// at the start of the current day, so "Try the day again" starts it exactly as
// it was, and the office at the end of the last day played).

import type { StoryUi } from '@/game/app/gameApi';
import type { CastId } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import { displayName } from '@/game/core/cast';
import type { Sim, SaveData } from '@/game/sim';
import { createRng } from '@/game/sim/rng';
import { loadJson, removeKey, saveJson } from '@/game/storage';
import { CHAPTER_DEFS } from './chapters';
import { StoryDay, type StoryDayHooks } from './day';
import { CHAPTERS, STANDING_START, allCosts, applyChanges, budgetFor, endingFor, standingChanges, type EndingId } from './rules';
import { LEAK, endingText } from './text';
import type { ChapterDef, ChapterResult, WeekNotes } from './types';

export const STATE_KEY = 'story.state.v1';
export const WORLD_KEY = 'story.world.v1';

/** Where the story keeps its saves (the browser's storage in the game; a map in tests). */
export interface StoryStore {
  load<T>(key: string): T | null;
  save(key: string, value: unknown): boolean;
  remove(key: string): void;
}

export const browserStore: StoryStore = { load: loadJson, save: saveJson, remove: removeKey };

/** A store that lives in memory only. */
export function memoryStore(): StoryStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    load<T>(key: string): T | null {
      const raw = data.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    save(key, value) {
      data.set(key, JSON.stringify(value));
      return true;
    },
    remove(key) {
      data.delete(key);
    }
  };
}

export interface StoryState {
  version: 1;
  seed: number;
  /** 1..5: the chapter being played, or just played. */
  chapter: number;
  /** 'day': the chapter is to be played; 'done': its result is in; 'ended': the week is over. */
  stage: 'day' | 'done' | 'ended';
  standing: number;
  /** Standing and notes as they were when this chapter began (for "Try the day again"). */
  standingAtStart: number;
  notesAtStart: WeekNotes;
  notes: WeekNotes;
  results: (ChapterResult | null)[];
}

interface StoryWorld {
  /** The office at the start of the current chapter's day. */
  start: SaveData | null;
  /** The office at the end of the last day played (the next day starts from it). */
  end: SaveData | null;
}

export interface StorySaved {
  chapter: number;
  chapters: number;
  title: string;
  weekday: string;
  standing: number;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function cleanState(raw: unknown): StoryState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<StoryState>;
  if (r.version !== 1) return null;
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const chapter = Math.max(1, Math.min(CHAPTERS, Math.floor(num(r.chapter, 1))));
  const notes = (n: unknown): WeekNotes | null => {
    if (!n || typeof n !== 'object') return null;
    const w = n as WeekNotes;
    return isCastId(w.leak) ? { ...w } : null;
  };
  const seed = Math.floor(num(r.seed, 1)) >>> 0 || 1;
  const live = notes(r.notes) ?? { leak: pickLeak(seed) };
  const results = Array.from({ length: CHAPTERS }, (_, i) => {
    const x = Array.isArray(r.results) ? r.results[i] : null;
    return x && typeof x === 'object' && typeof x.won === 'boolean' ? x : null;
  });
  return {
    version: 1,
    seed,
    chapter,
    stage: r.stage === 'done' || r.stage === 'ended' ? r.stage : 'day',
    standing: Math.max(0, Math.min(100, num(r.standing, STANDING_START))),
    standingAtStart: Math.max(0, Math.min(100, num(r.standingAtStart, num(r.standing, STANDING_START)))),
    notesAtStart: notes(r.notesAtStart) ?? clone(live),
    notes: live,
    results
  };
}

/** Thursday's leak, the same for the whole week. */
export function pickLeak(seed: number): CastId {
  const rng = createRng((seed ^ 0x51ed27) >>> 0);
  return rng.pick(LEAK.candidates);
}

export class Story {
  private world: StoryWorld;

  private constructor(private store: StoryStore, public state: StoryState, world?: StoryWorld) {
    this.world = world ?? { start: null, end: null };
  }

  /** A new week from Monday morning. Replaces any story saved before. */
  static create(store: StoryStore, seed: number): Story {
    const s = (Math.floor(seed) >>> 0) || 1;
    const notes: WeekNotes = { leak: pickLeak(s) };
    const story = new Story(store, {
      version: 1, seed: s, chapter: 1, stage: 'day', standing: STANDING_START, standingAtStart: STANDING_START,
      notesAtStart: clone(notes), notes, results: Array.from({ length: CHAPTERS }, () => null)
    });
    story.save();
    return story;
  }

  /** The saved story, or null when there is none (or it cannot be read). */
  static load(store: StoryStore): Story | null {
    const state = cleanState(store.load<unknown>(STATE_KEY));
    if (!state) return null;
    const w = store.load<Partial<StoryWorld>>(WORLD_KEY);
    return new Story(store, state, { start: w?.start ?? null, end: w?.end ?? null });
  }

  /** For the title screen: the story waiting to be continued, or null. */
  static peek(store: StoryStore): StorySaved | null {
    const state = cleanState(store.load<unknown>(STATE_KEY));
    if (!state || state.stage === 'ended') return null;
    // A finished day carries on with the next one.
    const ch = state.stage === 'done' && state.chapter < CHAPTERS ? state.chapter + 1 : state.chapter;
    const def = CHAPTER_DEFS[ch - 1];
    return { chapter: ch, chapters: CHAPTERS, title: def.title, weekday: def.weekday, standing: state.standing };
  }

  static clear(store: StoryStore): void {
    store.remove(STATE_KEY);
    store.remove(WORLD_KEY);
  }

  save(): void {
    this.store.save(STATE_KEY, this.state);
    this.store.save(WORLD_KEY, this.world);
  }

  get def(): ChapterDef {
    return CHAPTER_DEFS[this.state.chapter - 1];
  }

  get chapter(): number {
    return this.state.chapter;
  }

  get standing(): number {
    return this.state.standing;
  }

  get stage(): StoryState['stage'] {
    return this.state.stage;
  }

  get result(): ChapterResult | null {
    return this.state.results[this.state.chapter - 1];
  }

  /** The random seed for the current day's simulation (the same day always starts the same way). */
  simSeed(): number {
    return ((this.state.seed ^ Math.imul(this.state.chapter, 0x2545f491)) >>> 0) || 1;
  }

  /**
   * The save to build the current day's office from: the start of this day if it has
   * been started before, else the end of yesterday, else nothing (Monday, from scratch).
   */
  daySave(): SaveData | null {
    return this.world.start ?? this.world.end ?? null;
  }

  /** The office at the start of the current day, for "Try the day again". */
  get startSnapshot(): SaveData | null {
    return this.world.start;
  }

  /** Note the office as it stands at the start of the day (08:50), and save. */
  recordStart(save: SaveData): void {
    this.world.start = clone(save);
    this.world.end = null;
    this.save();
  }

  /** Set up today's chapter on a simulation that has just begun the day. */
  beginDay(sim: Sim, hooks?: StoryDayHooks): StoryDay {
    const day = new StoryDay(sim, this.def, this.state.notes, { seed: this.state.seed, hooks });
    day.setup();
    return day;
  }

  /** The day is over: settle it, move Branch Standing, and save. Returns the result. */
  finishDay(day: StoryDay, endSave: SaveData | null): ChapterResult {
    const existing = this.result;
    if (this.state.stage !== 'day' && existing) return existing;
    const t = day.tally();
    const changes = standingChanges(t);
    const before = this.state.standing;
    const after = applyChanges(before, changes);
    const result: ChapterResult = { won: t.won, text: t.lines, changes, standingBefore: before, standingAfter: after, extras: t.extras };
    this.state.results[this.state.chapter - 1] = result;
    this.state.standing = after;
    this.state.stage = 'done';
    if (endSave) this.world.end = clone(endSave);
    this.save();
    return result;
  }

  /** Play the current day again from its start. Returns the save it starts from. */
  retry(): SaveData | null {
    this.state.standing = this.state.standingAtStart;
    this.state.notes = clone(this.state.notesAtStart);
    this.state.results[this.state.chapter - 1] = null;
    this.state.stage = 'day';
    this.world.end = null;
    this.save();
    return this.world.start;
  }

  /** On from a finished day: the next chapter, or the end of the week. */
  advance(): 'next' | 'ending' {
    if (this.state.stage === 'ended') return 'ending';
    if (this.state.stage !== 'done') return 'next';
    if (this.state.chapter >= CHAPTERS) {
      this.state.stage = 'ended';
      this.save();
      return 'ending';
    }
    this.state.chapter += 1;
    this.state.stage = 'day';
    this.state.standingAtStart = this.state.standing;
    this.state.notesAtStart = clone(this.state.notes);
    this.world.start = null;
    this.save();
    return 'next';
  }

  endingId(): EndingId {
    return endingFor(this.state.standing);
  }

  ending(): { id: EndingId; title: string; text: string[] } {
    const id = this.endingId();
    const n = this.state.notes;
    const t = endingText(id, {
      call: n.call, accounts: n.accounts, figgis: n.figgis, leakName: displayName(n.leak), leakFound: n.leakFound, inspection: n.inspection
    });
    return { id, ...t };
  }

  /** Everything the screens need. `day` is the live day (null on the ending screen). */
  ui(day: StoryDay | null): StoryUi {
    const def = this.def;
    const result = this.result;
    const goal = day ? day.goalUi() : {
      id: def.goal.id, title: def.goal.title, detail: def.goal.detail, icon: def.goal.icon,
      progress: result?.won ? 1 : 0, status: '', state: result ? (result.won ? 'won' : 'lost') : 'open'
    } as StoryUi['goal'];
    const side = day ? day.sideUi() : def.extras.map((x) => {
      const done = !!result?.extras.includes(x.title);
      return { id: x.id, title: x.title, detail: x.detail, icon: x.icon, progress: done ? 1 : 0, status: '', state: result ? (done ? 'won' : 'lost') : 'open' } as StoryUi['side'][number];
    });
    const budget = budgetFor(def.chapter);
    return {
      chapter: def.chapter,
      chapters: CHAPTERS,
      title: def.title,
      weekday: def.weekday,
      intro: [...def.intro],
      hints: [...def.hints],
      goal,
      side,
      standing: this.state.standing,
      influence: day ? { left: day.influence.left, max: day.influence.max } : { left: budget, max: budget },
      costs: allCosts(),
      locked: { ...def.locked },
      accuse: day ? day.accuseUi() : null,
      result: result && this.state.stage !== 'day'
        ? { won: result.won, text: [...result.text], changes: result.changes.map((c) => ({ ...c })), standingBefore: result.standingBefore, standingAfter: result.standingAfter }
        : null,
      ending: this.state.stage === 'ended' ? this.ending() : null,
      week: CHAPTER_DEFS.map((d, i) => {
        const r = this.state.results[i];
        return { chapter: d.chapter, title: d.title, weekday: d.weekday, result: r ? (r.won ? 'won' : 'lost') : null };
      })
    };
  }
}
