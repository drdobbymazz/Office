// Endless Saga state machine: multi-season 5-day arcs, persistent Branch Standing
// momentum, cross-season world continuity, AI Showrunner episode hooks, and
// isolated browser persistence ('saga.state.v1' & 'saga.world.v1').

import type { StoryUi } from '@/game/app/gameApi';
import type { SagaEpisodeRequest, SagaEpisodeResult } from '@/game/brain/api';
import { displayName } from '@/game/core/cast';
import type { CastId } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import type { SaveData, Sim } from '@/game/sim';
import { CHAPTERS, STANDING_START, applyChanges, endingFor, type EndingId } from '@/game/story/rules';
import type { StoryStore } from '@/game/story/story';
import type { ChapterResult } from '@/game/story/types';
import { SAGA_EXTRAS, SAGA_MOLE_CANDIDATES, arcById, pickArcDeck, pickSagaMole } from './arcs';
import { SagaDay, type SagaDayHooks } from './day';
import type {
  SagaAiEpisode, SagaArcDef, SagaArcId, SagaChapterDef, SagaNotes, SagaSaved, SagaSeasonRecord, SagaState
} from './types';

export const SAGA_STATE_KEY = 'saga.state.v1';
export const SAGA_WORLD_KEY = 'saga.world.v1';

interface SagaWorld {
  start: SaveData | null;
  end: SaveData | null;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function freshNotes(mole: CastId): SagaNotes {
  return {
    mole,
    lastEvents: [],
    lastChaosPeak: 0,
    lastMorale: 50,
    lastIncidents: 0,
    lastWon: null,
    lastDayTitle: null,
    eliminatedNames: [],
    quitNames: [],
    customEvents: [],
    reactiveTwists: [],
    stats: { whispers: 0, announcements: 0, powers: 0, customs: 0, carried: {} }
  };
}

function cleanState(raw: unknown): SagaState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SagaState>;
  if (r.version !== 1) return null;
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const seed = Math.floor(num(r.seed, 1)) >>> 0 || 1;
  const season = Math.max(1, Math.floor(num(r.season, 1)));
  const chapter = Math.max(1, Math.min(CHAPTERS, Math.floor(num(r.chapter, 1))));
  const arcId = arcById(String(r.arcId ?? '')).id;
  const arcQueue = Array.isArray(r.arcQueue)
    ? r.arcQueue.map((id) => arcById(String(id)).id).filter((id) => id !== arcId)
    : pickArcDeck(seed, arcId).filter((id) => id !== arcId);
  const moleRaw = r.notes && typeof r.notes === 'object' ? (r.notes as SagaNotes).mole : undefined;
  const mole = moleRaw && isCastId(moleRaw) ? moleRaw : pickSagaMole(seed);
  const notes = r.notes && typeof r.notes === 'object'
    ? { ...freshNotes(mole), ...clone(r.notes), mole }
    : freshNotes(mole);
  const notesAtStart = r.notesAtStart && typeof r.notesAtStart === 'object'
    ? { ...freshNotes(mole), ...clone(r.notesAtStart) }
    : clone(notes);
  const results = Array.from({ length: CHAPTERS }, (_, i) => {
    const x = Array.isArray(r.results) ? r.results[i] : null;
    return x && typeof x === 'object' && typeof x.won === 'boolean' ? x : null;
  });
  return {
    version: 1,
    seed,
    season,
    arcId,
    arcQueue,
    chapter,
    stage: r.stage === 'done' || r.stage === 'ended' ? r.stage : 'day',
    standing: Math.max(-200, Math.min(300, num(r.standing, STANDING_START))),
    standingAtStart: Math.max(-200, Math.min(300, num(r.standingAtStart, STANDING_START))),
    notesAtStart,
    notes,
    results,
    tries: Array.from({ length: CHAPTERS }, (_, i) => {
      const t = Array.isArray(r.tries) ? Number(r.tries[i]) : 0;
      return Number.isFinite(t) && t > 0 ? Math.floor(t) : 0;
    }),
    aiEpisode: r.aiEpisode && typeof r.aiEpisode === 'object' ? clone(r.aiEpisode) : null,
    history: Array.isArray(r.history) ? clone(r.history) : []
  };
}

export class Saga {
  private world: SagaWorld;

  private constructor(private store: StoryStore, public state: SagaState, world?: SagaWorld) {
    this.world = world ?? { start: null, end: null };
  }

  static create(store: StoryStore, seed: number): Saga {
    const s = Math.floor(seed) >>> 0 || 1;
    const deck = pickArcDeck(s);
    const arcId = deck[0];
    const mole = pickSagaMole(s);
    const notes = freshNotes(mole);
    const saga = new Saga(store, {
      version: 1,
      seed: s,
      season: 1,
      arcId,
      arcQueue: deck.slice(1),
      chapter: 1,
      stage: 'day',
      standing: STANDING_START,
      standingAtStart: STANDING_START,
      notesAtStart: clone(notes),
      notes,
      results: Array.from({ length: CHAPTERS }, () => null),
      tries: Array.from({ length: CHAPTERS }, () => 0),
      aiEpisode: null,
      history: []
    });
    saga.save();
    return saga;
  }

  static load(store: StoryStore): Saga | null {
    const state = cleanState(store.load<unknown>(SAGA_STATE_KEY));
    if (!state) return null;
    const w = store.load<Partial<SagaWorld>>(SAGA_WORLD_KEY);
    return new Saga(store, state, { start: w?.start ?? null, end: w?.end ?? null });
  }

  static peek(store: StoryStore): SagaSaved | null {
    const state = cleanState(store.load<unknown>(SAGA_STATE_KEY));
    if (!state) return null;
    if (state.stage === 'ended') {
      const nextArcId = state.arcQueue[0] ?? pickArcDeck((state.seed + state.season * 97) >>> 0, state.arcId)[0];
      const nextArc = arcById(nextArcId);
      const def = nextArc.chapters[0];
      return {
        season: state.season + 1,
        chapter: 1,
        chapters: CHAPTERS,
        arcTitle: nextArc.title,
        title: def.title,
        weekday: def.weekday,
        standing: carryOverStanding(state.standing)
      };
    }
    const arc = arcById(state.arcId);
    const ch = state.stage === 'done' && state.chapter < CHAPTERS ? state.chapter + 1 : state.chapter;
    const def = arc.chapters[ch - 1];
    return {
      season: state.season,
      chapter: ch,
      chapters: CHAPTERS,
      arcTitle: arc.title,
      title: state.aiEpisode && state.aiEpisode.season === state.season && state.aiEpisode.chapter === ch
        ? state.aiEpisode.title
        : def.title,
      weekday: def.weekday,
      standing: state.standing
    };
  }

  static clear(store: StoryStore): void {
    store.remove(SAGA_STATE_KEY);
    store.remove(SAGA_WORLD_KEY);
  }

  save(): void {
    this.store.save(SAGA_STATE_KEY, this.state);
    this.store.save(SAGA_WORLD_KEY, this.world);
  }

  get arc(): SagaArcDef {
    return arcById(this.state.arcId);
  }

  get def(): SagaChapterDef {
    return this.arc.chapters[this.state.chapter - 1];
  }

  get season(): number {
    return this.state.season;
  }

  get chapter(): number {
    return this.state.chapter;
  }

  get standing(): number {
    return this.state.standing;
  }

  get stage(): SagaState['stage'] {
    return this.state.stage;
  }

  get result(): ChapterResult | null {
    return this.state.results[this.state.chapter - 1];
  }

  simSeed(): number {
    return ((this.state.seed ^ Math.imul(this.state.season * 13 + this.state.chapter, 0x2545f491)) >>> 0) || 1;
  }

  daySave(): SaveData | null {
    return this.world.start ?? this.world.end ?? null;
  }

  get endSnapshot(): SaveData | null {
    return this.world.end ?? this.world.start;
  }

  recordStart(save: SaveData): void {
    this.world.start = clone(save);
    this.world.end = null;
    this.save();
  }

  /** Set up today's SagaDay on a fresh or resumed simulation. */
  beginDay(sim: Sim, hooks?: SagaDayHooks): SagaDay {
    const ai = this.matchingAiEpisode();
    const day = new SagaDay(sim, this.arc, this.def, this.state.notes, ai, hooks);
    day.setup();
    return day;
  }

  private matchingAiEpisode(): SagaAiEpisode | null {
    const ai = this.state.aiEpisode;
    if (!ai) return null;
    return ai.season === this.state.season && ai.chapter === this.state.chapter ? ai : null;
  }

  /** Finish the day, record all reactive events, compute Standing, and save. */
  finishDay(day: SagaDay, endSave: SaveData | null): ChapterResult {
    const existing = this.result;
    if (this.state.stage !== 'day' && existing) return existing;
    const t = day.tally();

    const st = this.state.notes.stats;
    st.whispers += day.used.whisper;
    st.announcements += day.used.announce;
    st.powers += day.used.powers.length;
    st.customs += day.used.anything;
    for (const [id, n] of Object.entries(day.carriedToday)) {
      if (isCastId(id)) st.carried[id] = (st.carried[id] ?? 0) + (n ?? 0);
    }

    this.state.notes.lastEvents = t.events.slice(-8);
    this.state.notes.lastChaosPeak = t.chaosPeak;
    this.state.notes.lastMorale = t.morale;
    this.state.notes.lastIncidents = t.incidents;
    this.state.notes.lastWon = t.won;
    this.state.notes.lastDayTitle = this.matchingAiEpisode()?.title ?? this.def.title;
    if (day.reactiveTwist) {
      this.state.notes.reactiveTwists = [...this.state.notes.reactiveTwists.slice(-5), day.reactiveTwist];
    }
    for (const txt of day.customEventTexts) {
      if (!this.state.notes.customEvents.includes(txt)) {
        this.state.notes.customEvents = [...this.state.notes.customEvents.slice(-5), txt];
      }
    }
    for (const ev of t.events) {
      const mElim = /^(.+?) was eliminated mid-shift$/.exec(ev);
      if (mElim && !this.state.notes.eliminatedNames.includes(mElim[1])) {
        this.state.notes.eliminatedNames.push(mElim[1]);
      }
      const mQuit = /^(.+?) walked out and quit$/.exec(ev);
      if (mQuit && !this.state.notes.quitNames.includes(mQuit[1])) {
        this.state.notes.quitNames.push(mQuit[1]);
      }
    }

    const before = this.state.standing;
    const after = applyChanges(before, t.changes);
    const result: ChapterResult = {
      won: t.won,
      text: t.lines,
      changes: t.changes,
      standingBefore: before,
      standingAfter: after,
      extras: t.extras
    };
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

  /** Replay the current chapter from its 08:50 start snapshot. */
  retry(): SaveData | null {
    if (!(this.state.stage === 'done' && this.result && !this.result.won)) this.bumpTries();
    if (this.def.goal.kind === 'accuse_mole') {
      const was = this.state.notesAtStart.mole;
      const seed = (this.state.seed ^ Math.imul(this.state.tries[this.state.chapter - 1] + 1, 0x2c1b3c6d)) >>> 0;
      const nextMole = pickSagaMole(seed, SAGA_MOLE_CANDIDATES.includes(was) ? [was] : undefined);
      this.state.notesAtStart.mole = nextMole;
    }
    this.state.standing = this.state.standingAtStart;
    this.state.notes = clone(this.state.notesAtStart);
    this.state.results[this.state.chapter - 1] = null;
    this.state.stage = 'day';
    this.world.end = null;
    this.save();
    return this.world.start;
  }

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

  /** Build the AI Showrunner prompt payload for tomorrow (or Season N+1 Monday). */
  buildEpisodeRequest(day: SagaDay, dayLog: readonly string[]): SagaEpisodeRequest {
    const isEnd = this.state.chapter >= CHAPTERS;
    const targetSeason = isEnd ? this.state.season + 1 : this.state.season;
    const targetChapter = isEnd ? 1 : this.state.chapter + 1;
    const targetArc = isEnd ? arcById(this.peekNextArcId()) : this.arc;
    const nextDef = targetArc.chapters[targetChapter - 1];
    const m = day.sim.meters();
    return {
      id: `saga-${targetSeason}-${targetChapter}`,
      season: targetSeason,
      day: targetChapter,
      weekday: nextDef.weekday,
      arcTitle: targetArc.title,
      arcPremise: targetArc.premise,
      standing: this.state.standing,
      yesterday: {
        title: this.matchingAiEpisode()?.title ?? this.def.title,
        won: this.result?.won ?? false,
        chaosPeak: day.peakChaosPct,
        incidents: day.sim.incidentsToday,
        morale: m.morale,
        events: day.dayEvents.slice(-8),
        log: dayLog.filter((l) => !/arriving for work|five o'clock/i.test(l)).slice(-10)
      },
      tomorrow: {
        title: nextDef.title,
        goalTitle: nextDef.goalInfo.title,
        goalDetail: nextDef.goalInfo.detail,
        featured: nextDef.featured.map((f) => displayName(f.id))
      }
    };
  }

  applyAiEpisode(targetSeason: number, targetChapter: number, res: SagaEpisodeResult): void {
    // Discard stale responses if the player already restarted or moved past that episode.
    if (targetSeason < this.state.season) return;
    if (targetSeason === this.state.season && targetChapter < this.state.chapter) return;
    this.state.aiEpisode = {
      season: targetSeason,
      chapter: targetChapter,
      title: res.title,
      recap: res.recap,
      hook: res.hook,
      twistFact: res.twistFact,
      topics: res.topics.slice(0, 2),
      source: res.source
    };
    this.save();
  }

  private peekNextArcId(): SagaArcId {
    if (this.state.arcQueue.length > 0) return this.state.arcQueue[0];
    return pickArcDeck((this.state.seed + this.state.season * 97) >>> 0, this.state.arcId)[0];
  }

  /** Roll completed season into history, spin up Season N+1 with a fresh arc & carried bonds. */
  startNextSeason(): void {
    const wonDays = this.state.results.filter((r) => r?.won).length;
    const record: SagaSeasonRecord = {
      season: this.state.season,
      arcId: this.state.arcId,
      arcTitle: this.arc.title,
      ending: this.endingId(),
      standing: this.state.standing,
      wonDays
    };
    const nextHistory = [...this.state.history, record].slice(-10);
    const nextSeason = this.state.season + 1;
    let queue = this.state.arcQueue.slice();
    if (!queue.length) {
      queue = pickArcDeck((this.state.seed + nextSeason * 97) >>> 0, this.state.arcId);
    }
    const nextArcId = queue.shift() ?? 'corporate_audit';
    const nextStanding = carryOverStanding(this.state.standing);
    const nextMole = pickSagaMole((this.state.seed ^ Math.imul(nextSeason, 0x45d9f3b)) >>> 0);
    const nextNotes = freshNotes(nextMole);
    nextNotes.lastEvents = [...this.state.notes.lastEvents];
    nextNotes.lastDayTitle = `Season ${this.state.season}: ${this.arc.title}`;
    nextNotes.lastWon = this.endingId() === 'saved';

    // Preserve AI episode if it was already written specifically for the next season premiere.
    const keepAi =
      this.state.aiEpisode && this.state.aiEpisode.season === nextSeason && this.state.aiEpisode.chapter === 1
        ? this.state.aiEpisode
        : null;

    this.state.season = nextSeason;
    this.state.arcId = nextArcId;
    this.state.arcQueue = queue;
    this.state.chapter = 1;
    this.state.stage = 'day';
    this.state.standing = nextStanding;
    this.state.standingAtStart = nextStanding;
    this.state.notes = nextNotes;
    this.state.notesAtStart = clone(nextNotes);
    this.state.results = Array.from({ length: CHAPTERS }, () => null);
    this.state.tries = Array.from({ length: CHAPTERS }, () => 0);
    this.state.aiEpisode = keepAi;
    this.state.history = nextHistory;
    // Keep world.end intact as yesterday's world so long-term cast memories & bonds continue!
    this.world.start = null;
    this.save();
  }

  get fridayWon(): boolean {
    return !!this.state.results[CHAPTERS - 1]?.won;
  }

  endingId(): EndingId {
    return endingFor(this.state.standing, this.fridayWon);
  }

  ending(): { id: EndingId; title: string; text: string[]; epilogue: string[] } {
    const id = this.endingId();
    const arc = this.arc;
    const sNum = this.state.season;
    const wonDays = this.state.results.filter((r) => r?.won).length;
    const title =
      id === 'saved'
        ? `SEASON ${sNum} TRIUMPH`
        : id === 'scraped'
          ? `SEASON ${sNum}: SURVIVED BY A THREAD`
          : `SEASON ${sNum}: CORPORATE SHAKEUP`;
    const text =
      id === 'saved'
        ? [
            `${arc.title} wrapped with Scranton standing tall (${wonDays} of 5 days won, standing ${Math.round(this.state.standing)}).`,
            'Head office backed off for now—though next season\'s trouble is already warming up.'
          ]
        : id === 'scraped'
          ? [
              `${arc.title} ended in bruising compromise (${wonDays} of 5 days won, standing ${Math.round(this.state.standing)}).`,
              'Everyone keeps their desks into next season, with bruised egos and fresh scores to settle.'
            ]
          : [
              `Head office lost patience during ${arc.title} (standing ${Math.round(this.state.standing)}), threatening restructuring.`,
              'Fortunately the Scranton crew refuses to leave cleanly—carry the chaos into a fiery comeback next season.'
            ];

    const n = this.state.notes;
    const epilogue: string[] = [];
    if (n.eliminatedNames.length) epilogue.push(`Mid-season casualties: ${n.eliminatedNames.join(', ')}.`);
    if (n.quitNames.length) epilogue.push(`Walked out mid-shift: ${n.quitNames.join(', ')}.`);
    if (n.customEvents.length) epilogue.push(`Signature stunts: "${n.customEvents.slice(-2).join('", "')}".`);
    const st = n.stats;
    epilogue.push(
      `Overseer tally: ${st.powers} powers, ${st.customs} custom stunts, ${st.whispers} whispers, ${st.announcements} announcements.`
    );
    return { id, title, text, epilogue };
  }

  /** Build unified `StoryUi` consumed by the shared React HUD, Briefing, Director, and Ending screens. */
  ui(day: SagaDay | null): StoryUi {
    const arc = this.arc;
    const def = this.def;
    const ai = this.matchingAiEpisode();
    const result = this.result;

    const goal = day
      ? day.goalUi()
      : {
          id: def.goalInfo.id,
          title: def.goalInfo.title,
          detail: def.goalInfo.detail,
          icon: def.goalInfo.icon,
          progress: result?.won ? 1 : 0,
          status: '',
          state: result ? (result.won ? 'won' : 'lost') : 'open'
        } as StoryUi['goal'];

    const side = day
      ? day.sideUi()
      : def.extras.map((id) => {
          const ex = SAGA_EXTRAS[id];
          const done = !!result?.extras.some((t) => t === ex.title);
          return {
            id: ex.id,
            title: ex.title,
            detail: ex.detail,
            icon: ex.icon,
            progress: done ? 1 : 0,
            status: '',
            state: result ? (done ? 'won' : 'lost') : 'open'
          } as StoryUi['side'][number];
        });

    const recap = buildRecap(this.state.season, this.state.chapter, this.state.notes, ai);

    return {
      chapter: def.chapter,
      chapters: CHAPTERS,
      title: ai?.title || def.title,
      weekday: def.weekday,
      intro: ai ? [ai.hook, ...def.intro.slice(1)] : [...def.intro],
      hints: [...def.hints],
      goal,
      side,
      standing: this.state.standing,
      // Endless Saga has zero costs and zero locks!
      influence: { left: 0, max: 0 },
      costs: {},
      locked: {},
      accuse: day ? day.accuseUi() : null,
      result:
        result && this.state.stage !== 'day'
          ? {
              won: result.won,
              text: [...result.text],
              changes: result.changes.map((c) => ({ ...c })),
              standingBefore: result.standingBefore,
              standingAfter: result.standingAfter
            }
          : null,
      ending: this.state.stage === 'ended' ? this.ending() : null,
      week: arc.chapters.map((d, i) => {
        const r = this.state.results[i];
        return { chapter: d.chapter, title: d.title, weekday: d.weekday, result: r ? (r.won ? 'won' : 'lost') : null };
      }),
      recap,
      help: [],
      warns: {},
      suggest: { whisper: [...def.suggest.whisper], announce: [...def.suggest.announce] },
      canFinish: !!day && this.state.stage === 'day' && day.settled,
      saga: {
        season: this.state.season,
        arcId: arc.id,
        arcTitle: arc.title,
        arcTagline: arc.tagline,
        faces: def.featured.map((f) => ({ id: f.id, face: f.face })),
        icon: def.icon,
        aiCrafted: ai?.source === 'model',
        twist: day?.reactiveTwist ?? (ai ? ai.twistFact : null),
        history: [...this.state.history]
      }
    };
  }
}

function carryOverStanding(standing: number): number {
  return Math.max(30, Math.min(68, Math.round(standing * 0.55 + 22)));
}

function buildRecap(season: number, chapter: number, notes: SagaNotes, ai: SagaAiEpisode | null): string | null {
  if (ai?.recap) return ai.recap;
  if (chapter === 1 && season === 1) return null;
  if (notes.lastEvents.length) {
    return `Previously${notes.lastDayTitle ? ` (${notes.lastDayTitle})` : ''}: ${notes.lastEvents.slice(-2).join('; ')}.`;
  }
  if (notes.lastDayTitle) {
    return `Previously in ${notes.lastDayTitle}: ${notes.lastWon ? 'Scranton carried the day' : 'things went sideways'} at ${Math.round(notes.lastChaosPeak)}% chaos.`;
  }
  return null;
}
