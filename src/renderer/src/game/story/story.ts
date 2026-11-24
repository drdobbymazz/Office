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
import { EPISODES, OFFICE_EPISODE, episodeById, type EpisodeDef } from './episodes';
import { CHAPTERS, ENDING, STANDING_START, allCosts, applyChanges, budgetFor, endingFor, standingChanges, type EndingId } from './rules';
import { LEAK, endingText, epilogueLines } from './text';
import type { ChapterDef, ChapterResult, EpisodeId, SuggestIdea, WeekNotes } from './types';

export const STATE_KEY = 'story.state.v1';
export const WORLD_KEY = 'story.world.v1';
/** The chapter with the leak (a retry picks a new one). */
const LEAK_CHAPTER = 4;

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
  episodeId?: EpisodeId;
  introSeen?: boolean;
  seed: number;
  /** 1..N: the chapter being played, or just played. */
  chapter: number;
  /** 'day': the chapter is to be played; 'done': its result is in; 'ended': the week is over. */
  stage: 'day' | 'done' | 'ended';
  standing: number;
  /** Standing and notes as they were when this chapter began (for "Try the day again"). */
  standingAtStart: number;
  notesAtStart: WeekNotes;
  notes: WeekNotes;
  results: (ChapterResult | null)[];
  /** How many times each chapter has been started again (retried) or lost; help shows once it is 1 or more. */
  tries: number[];
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

function cleanState(raw: unknown, ep: EpisodeDef = OFFICE_EPISODE): StoryState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<StoryState>;
  if (r.version !== 1) return null;
  const count = ep.chapters.length;
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const chapter = Math.max(1, Math.min(count, Math.floor(num(r.chapter, 1))));
  const notes = (n: unknown): WeekNotes | null => {
    if (!n || typeof n !== 'object') return null;
    const w = n as WeekNotes;
    if (ep.id === 'office') return isCastId(w.leak) ? { ...w } : null;
    return { ...w };
  };
  const seed = Math.floor(num(r.seed, 1)) >>> 0 || 1;
  const parkNotes = (n: unknown): WeekNotes | null => {
    if (!n || typeof n !== 'object') return null;
    const w = n as Partial<WeekNotes>;
    return { ...w, leak: typeof w.leak === 'string' && isCastId(w.leak) ? w.leak : pickLeak(seed) };
  };
  const readNotes = (n: unknown): WeekNotes | null => (ep.id === 'office' ? notes(n) : parkNotes(n));
  const live = readNotes(r.notes) ?? { leak: pickLeak(seed) };
  const results = Array.from({ length: count }, (_, i) => {
    const x = Array.isArray(r.results) ? r.results[i] : null;
    return x && typeof x === 'object' && typeof x.won === 'boolean' ? x : null;
  });
  return {
    version: 1,
    episodeId: ep.id,
    introSeen: typeof r.introSeen === 'boolean' ? r.introSeen : !ep.hasIntro,
    seed,
    chapter,
    stage: r.stage === 'done' || r.stage === 'ended' ? r.stage : 'day',
    // Standing is never capped (the report's arithmetic must add up); only absurd values are refused.
    standing: Math.max(-200, Math.min(300, num(r.standing, ep.standingStart))),
    standingAtStart: Math.max(-200, Math.min(300, num(r.standingAtStart, num(r.standing, ep.standingStart)))),
    notesAtStart: readNotes(r.notesAtStart) ?? clone(live),
    notes: live,
    results,
    tries: Array.from({ length: count }, (_, i) => {
      const t = Array.isArray(r.tries) ? Number(r.tries[i]) : 0;
      return Number.isFinite(t) && t > 0 ? Math.floor(t) : 0;
    })
  };
}

/** Thursday's leak, the same for the whole week. */
export function pickLeak(seed: number): CastId {
  const rng = createRng((seed ^ 0x51ed27) >>> 0);
  return rng.pick(LEAK.candidates);
}

export class Story {
  private world: StoryWorld;

  readonly episode: EpisodeDef;

  private constructor(
    private store: StoryStore,
    public state: StoryState,
    world?: StoryWorld,
    episode: EpisodeDef = OFFICE_EPISODE,
  ) {
    this.episode = episode;
    this.world = world ?? { start: null, end: null };
  }

  /** A new episode run from chapter 1. Replaces any save for this episode. */
  static create(store: StoryStore, seed: number, episodeId: EpisodeId = 'office'): Story {
    const ep = episodeById(episodeId);
    const count = ep.chapters.length;
    const s = (Math.floor(seed) >>> 0) || 1;
    const notes: WeekNotes = { leak: pickLeak(s) };
    const story = new Story(
      store,
      {
        version: 1,
        episodeId: ep.id,
        introSeen: !ep.hasIntro,
        seed: s,
        chapter: 1,
        stage: 'day',
        standing: ep.standingStart,
        standingAtStart: ep.standingStart,
        notesAtStart: clone(notes),
        notes,
        results: Array.from({ length: count }, () => null),
        tries: Array.from({ length: count }, () => 0),
      },
      undefined,
      ep,
    );
    story.save();
    return story;
  }

  /** The saved story for an episode, or null when there is none (or it cannot be read). */
  static load(store: StoryStore, episodeId: EpisodeId = 'office'): Story | null {
    const ep = episodeById(episodeId);
    const state = cleanState(store.load<unknown>(ep.stateKey), ep);
    if (!state) return null;
    const w = store.load<Partial<StoryWorld>>(ep.worldKey);
    return new Story(store, state, { start: w?.start ?? null, end: w?.end ?? null }, ep);
  }

  /** For the title screen: the Episode 1 story waiting to be continued, or null. */
  static peek(store: StoryStore): StorySaved | null {
    return Story.peekEpisode(store, 'office');
  }

  /** Saved summary for any episode (or null when ended / absent). */
  static peekEpisode(store: StoryStore, episodeId: EpisodeId): StorySaved | null {
    const ep = episodeById(episodeId);
    const state = cleanState(store.load<unknown>(ep.stateKey), ep);
    if (!state || state.stage === 'ended') return null;
    const count = ep.chapters.length;
    // A finished day carries on with the next one.
    const ch = state.stage === 'done' && state.chapter < count ? state.chapter + 1 : state.chapter;
    const def = ep.chapters[ch - 1];
    return { chapter: ch, chapters: count, title: def.title, weekday: def.weekday, standing: state.standing };
  }

  static peekAll(store: StoryStore): Record<EpisodeId, StorySaved | null> {
    return {
      office: Story.peekEpisode(store, 'office'),
      park: Story.peekEpisode(store, 'park'),
    };
  }

  needsIntro(): boolean {
    return this.episode.hasIntro && !this.state.introSeen;
  }

  markIntroSeen(): void {
    if (this.state.introSeen) return;
    this.state.introSeen = true;
    this.save();
  }

  static clear(store: StoryStore, episodeId?: EpisodeId): void {
    const targets = episodeId ? [episodeById(episodeId)] : EPISODES;
    for (const ep of targets) {
      store.remove(ep.stateKey);
      store.remove(ep.worldKey);
    }
  }

  save(): void {
    this.store.save(this.episode.stateKey, this.state);
    this.store.save(this.episode.worldKey, this.world);
  }

  get def(): ChapterDef {
    return this.episode.chapters[this.state.chapter - 1];
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

  /** The office at the end of the last day played (for the week's last scene). */
  get endSnapshot(): SaveData | null {
    return this.world.end ?? this.world.start;
  }

  /** Who the player picked up today (for the ending's epilogue). Cleared when a day begins. */
  private carriedToday: Partial<Record<CastId, number>> = {};
  private stopCounting: (() => void) | null = null;

  /** Set up today's chapter on a simulation that has just begun the day. */
  beginDay(sim: Sim, hooks?: StoryDayHooks): StoryDay {
    this.stopCounting?.();
    this.carriedToday = {};
    this.stopCounting = sim.bus.on('pickedUp', (e) => {
      if (isCastId(e.who)) this.carriedToday[e.who] = (this.carriedToday[e.who] ?? 0) + 1;
    });
    const day = new StoryDay(sim, this.def, this.state.notes, {
      seed: this.state.seed,
      hooks,
      weekFacts: this.episode.weekFacts,
    });
    day.setup();
    return day;
  }

  /** Add the day's tools and pick-ups to the week's tally (kept in the notes, so a retry undoes them). */
  private tallyWeek(day: StoryDay): void {
    const st = (this.state.notes.stats ??= { whispers: 0, announcements: 0, powers: 0, carried: {} });
    st.whispers += day.used.whisper;
    st.announcements += day.used.announce;
    st.powers += day.used.powers.length;
    for (const [id, n] of Object.entries(this.carriedToday)) st.carried[id as CastId] = (st.carried[id as CastId] ?? 0) + (n ?? 0);
    this.carriedToday = {};
    this.stopCounting?.();
    this.stopCounting = null;
  }

  /** The day is over: settle it, move Branch Standing, and save. Returns the result. */
  finishDay(day: StoryDay, endSave: SaveData | null): ChapterResult {
    const existing = this.result;
    if (this.state.stage !== 'day' && existing) return existing;
    const t = day.tally();
    this.tallyWeek(day);
    const changes = standingChanges(t);
    const before = this.state.standing;
    const after = applyChanges(before, changes);
    const result: ChapterResult = { won: t.won, text: t.lines, changes, standingBefore: before, standingAfter: after, extras: t.extras };
    this.state.results[this.state.chapter - 1] = result;
    this.state.standing = after;
    this.state.stage = 'done';
    if (!result.won) this.bumpTries();
    if (endSave) this.world.end = clone(endSave);
    this.save();
    return result;
  }

  private bumpTries(): void {
    const i = this.state.chapter - 1;
    this.state.tries[i] = (this.state.tries[i] ?? 0) + 1;
  }

  /** Play the current day again from its start. Returns the save it starts from. */
  retry(): SaveData | null {
    // A day already counted as lost has had its try; a retry from the middle of a day counts as one.
    if (!(this.state.stage === 'done' && this.result && !this.result.won)) this.bumpTries();
    // Thursday again: someone else is the leak this time (the report may have named the last one).
    if (this.episode.id === 'office' && this.state.chapter === LEAK_CHAPTER) {
      const was = this.state.notesAtStart.leak;
      const rng = createRng((this.state.seed ^ Math.imul(this.state.tries[LEAK_CHAPTER - 1] + 1, 0x2c1b3c6d)) >>> 0);
      this.state.notesAtStart.leak = rng.pick(LEAK.candidates.filter((id) => id !== was));
    }
    this.state.standing = this.state.standingAtStart;
    this.state.notes = clone(this.state.notesAtStart);
    this.state.results[this.state.chapter - 1] = null;
    this.state.stage = 'day';
    this.world.end = null;
    this.save();
    return this.world.start;
  }

  /** On from a finished day: the next chapter, or the end of the episode. */
  advance(): 'next' | 'ending' {
    if (this.state.stage === 'ended') return 'ending';
    if (this.state.stage !== 'done') return 'next';
    if (this.state.chapter >= this.episode.chapters.length) {
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

  /** Final chapter passed (the best ending needs it). */
  get fridayWon(): boolean {
    return !!this.state.results[this.episode.chapters.length - 1]?.won;
  }

  endingId(): EndingId {
    return this.episode.endingFor(this.state.standing, this.fridayWon);
  }

  ending(): { id: EndingId; title: string; text: string[]; epilogue: string[] } {
    return this.episode.buildEnding(this.state.standing, this.fridayWon, this.state.notes);
  }

  /** Everything the screens need. `day` is the live day (null on the ending screen). */
  ui(day: StoryDay | null): StoryUi {
    const def = this.def;
    const ep = this.episode;
    const count = ep.chapters.length;
    const result = this.result;
    const goal = day ? day.goalUi() : {
      id: def.goal.id, title: def.goal.title, detail: def.goal.detail, icon: def.goal.icon,
      progress: result?.won ? 1 : 0, status: '', state: result ? (result.won ? 'won' : 'lost') : 'open'
    } as StoryUi['goal'];
    const side = day ? day.sideUi() : def.extras.map((x) => {
      const done = !!result?.extras.includes(x.title);
      return { id: x.id, title: x.title, detail: x.detail, icon: x.icon, progress: done ? 1 : 0, status: '', state: result ? (done ? 'won' : 'lost') : 'open' } as StoryUi['side'][number];
    });
    const budget = def.budget ?? budgetFor(def.chapter);
    return {
      episodeId: ep.id,
      episodeName: ep.title,
      episodeSubtitle: ep.subtitle,
      unitLabel: ep.unitLabel,
      standingLabel: ep.standingLabel,
      standingNote: ep.standingNote,
      endingRule: ep.endingRule,
      chapter: def.chapter,
      chapters: count,
      title: def.title,
      weekday: def.weekday,
      intro: [...def.intro],
      hints: [...def.hints],
      goal,
      side,
      standing: this.state.standing,
      influence: day ? { left: day.influence.left, max: day.influence.max } : { left: budget, max: budget },
      costs: { ...allCosts(), ...(def.costs ?? {}) },
      locked: { ...def.locked },
      accuse: day ? day.accuseUi() : null,
      result: result && this.state.stage !== 'day'
        ? { won: result.won, text: [...result.text], changes: result.changes.map((c) => ({ ...c })), standingBefore: result.standingBefore, standingAfter: result.standingAfter }
        : null,
      ending: this.state.stage === 'ended' ? this.ending() : null,
      week: ep.chapters.map((d, i) => {
        const r = this.state.results[i];
        return { chapter: d.chapter, title: d.title, weekday: d.weekday, result: r ? (r.won ? 'won' : 'lost') : null };
      }),
      recap: this.safe(() => def.recap?.(this.state.notes) ?? null, null),
      help: (this.state.tries[def.chapter - 1] ?? 0) > 0 ? [...(def.help ?? [])] : [],
      warns: day ? day.warnsUi() : {},
      ...this.suggestUi(def),
      skipTo: day && this.state.stage === 'day' ? day.nextBeat() : null,
      canFinish: !!day && this.state.stage === 'day' && day.settled
    };
  }

  /** The day's suggestions: those for anyone, and those that fit one person. Answers wait for a failed try. */
  private suggestUi(def: ChapterDef): Pick<StoryUi, 'suggest' | 'suggestFor'> {
    const helpOn = (this.state.tries[def.chapter - 1] ?? 0) > 0;
    const open = (ideas: SuggestIdea[] | undefined): { text: string; for?: string[] }[] =>
      (ideas ?? []).map((i) => (typeof i === 'string' ? { text: i } : i)).filter((i) => !('help' in i && i.help) || helpOn);
    const whisper = open(def.suggest?.whisper);
    const suggestFor: Record<string, string[]> = {};
    for (const i of whisper) for (const who of i.for ?? []) (suggestFor[who] ??= []).push(i.text);
    return {
      suggest: { whisper: whisper.filter((i) => !i.for).map((i) => i.text), announce: open(def.suggest?.announce).map((i) => i.text) },
      suggestFor
    };
  }

  private safe<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch {
      return fallback;
    }
  }
}
