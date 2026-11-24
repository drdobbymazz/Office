// One story day on one simulation: the chapter's logic, today's influence
// budget, the goals and how they stand, and what the day comes to at five.
// The game (or a test) calls update() every frame and asks before spending.

import type { ActionId, StoryGoalUi } from '@/game/app/gameApi';
import type { ChaosId, CharId, RoomId } from '@/game/core/types';
import type { Sim } from '@/game/sim';
import { createRng } from '@/game/sim/rng';
import { weekFacts } from './chapters';
import { EXTRA_INFLUENCE, budgetFor, costOf, standingChanges, type DayTally } from './rules';
import { NOT_ENOUGH } from './text';
import type { ChapterCtx, ChapterDef, ChapterRun, GoalState, PlayerAction, ScriptLine, WeekNotes } from './types';

type ScriptOpts = Parameters<ChapterCtx['script']>[1];

export interface StoryDayHooks {
  /** A goal was settled (main or extra), for a toast, a banner and a sound. */
  onGoal?(g: { id: string; title: string; state: 'won' | 'lost'; main: boolean }): void;
  /**
   * Play a scripted scene through the director (so it does not talk over a model scene). Without
   * this hook the day plays the lines itself, one after another.
   */
  script?(lines: ScriptLine[], opts: NonNullable<ScriptOpts>): void;
}

const FIVE = 17 * 60;

export class StoryDay {
  readonly def: ChapterDef;
  readonly sim: Sim;
  readonly influence: { left: number; max: number };
  private mainState: GoalState = 'open';
  private extras = new Map<string, GoalState>();
  /** The plain sentences on how the main goal ended. */
  lines: string[] = [];
  readonly used: ChapterCtx['used'] = { powers: [], whisper: 0, announce: 0, cue: 0, anything: 0 };
  private run: ChapterRun;
  private offs: (() => void)[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private resolvedAt5 = false;
  private morale: number | null = null;
  private incidents: number | null = null;
  private disposed = false;

  constructor(
    sim: Sim,
    def: ChapterDef,
    private notes: WeekNotes,
    private opts: { seed: number; hooks?: StoryDayHooks; weekFacts?: (notes: WeekNotes, chapter: number) => [string, string][] } = { seed: 1 },
  ) {
    this.sim = sim;
    this.def = def;
    const budget = def.budget ?? budgetFor(def.chapter);
    this.influence = { left: budget, max: budget };
    for (const x of def.extras) this.extras.set(x.id, 'open');
    const rng = createRng((opts.seed ^ Math.imul(def.chapter, 0x9e3779b1)) >>> 0);
    const self = this;
    const ctx: ChapterCtx = {
      sim,
      notes,
      rng,
      main: () => self.mainState,
      extra: (id) => self.extras.get(id) ?? 'lost',
      win: (lines) => self.settleMain('won', lines),
      lose: (lines) => self.settleMain('lost', lines),
      setExtra: (id, st) => self.settleExtra(id, st),
      used: this.used,
      after: (seconds, fn) => {
        self.timers.push({ at: sim.time + Math.max(0, seconds), fn });
      },
      script: (lines, o = {}) => {
        if (self.disposed) return;
        if (self.opts.hooks?.script) self.opts.hooks.script(lines, o);
        else self.playScript(lines, o);
      }
    };
    this.run = def.create(ctx);
    const bus = sim.bus;
    this.offs.push(
      bus.on('chaosStart', (e) => this.run.onChaosStart?.({ id: e.id, target: e.target, room: e.room })),
      bus.on('chaosEnd', (e) => this.run.onChaosEnd?.(e.id)),
      bus.on('sceneDone', (e) => this.run.onSceneDone?.(e)),
      bus.on('pickedUp', (e) => this.run.onPickedUp?.(e.who))
    );
  }

  /** Right after the day begins: the chapter's rules, yesterday's news, today's set-up. */
  setup(): void {
    this.sim.setLocks(this.def.locked);
    const facts = this.opts.weekFacts ?? weekFacts;
    for (const [key, text] of facts(this.notes, this.def.chapter)) this.sim.setFact(key, text);
    this.run.setup();
  }

  get chapter(): number {
    return this.def.chapter;
  }

  get main(): GoalState {
    return this.mainState;
  }

  extraState(id: string): GoalState {
    return this.extras.get(id) ?? 'lost';
  }

  /** The chapter's logic (tests read its numbers). */
  get logic(): ChapterRun {
    return this.run;
  }

  /** True once five o'clock has settled every goal. */
  get over(): boolean {
    return this.resolvedAt5;
  }

  update(dt: number): void {
    if (this.disposed) return;
    const now = this.sim.time;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= now);
      this.timers = this.timers.filter((t) => t.at > now);
      for (const t of due) {
        try {
          t.fn();
        } catch (err) {
          console.error('[story] timer failed', err);
        }
      }
    }
    if (!this.resolvedAt5) {
      try {
        this.run.update(dt);
      } catch (err) {
        console.error('[story] chapter update failed', err);
      }
    }
    if (!this.resolvedAt5 && this.sim.clock >= FIVE) this.resolve();
  }

  /** Five o'clock: whatever is still open is settled now. Safe to call twice. */
  resolve(): void {
    if (this.resolvedAt5) return;
    this.morale = this.sim.meters().morale;
    this.incidents = this.sim.incidentsToday;
    try {
      this.run.atFive?.();
    } catch (err) {
      console.error('[story] atFive failed', err);
    }
    if (this.mainState === 'open') this.settleMain('lost', [`${this.def.change[1]}.`]);
    // An extra that simply ran out of day is not announced as a failure: the report says what was done.
    for (const x of this.def.extras) if (this.extras.get(x.id) === 'open') this.settleExtra(x.id, x.atFive, x.atFive === 'lost');
    this.resolvedAt5 = true;
    this.timers = [];
  }

  private settleMain(state: 'won' | 'lost', lines: string[]): void {
    if (this.mainState !== 'open') return;
    this.mainState = state;
    this.lines = lines.filter(Boolean);
    this.opts.hooks?.onGoal?.({ id: this.def.goal.id, title: this.def.goal.title, state, main: true });
  }

  private settleExtra(id: string, state: 'won' | 'lost', quietly = false): void {
    if (this.extras.get(id) !== 'open') return;
    this.extras.set(id, state);
    if (state === 'won') this.influence.left += EXTRA_INFLUENCE;
    // With the day's job lost, an extra that fell with it is not announced as a second failure.
    if (quietly || (state === 'lost' && this.mainState === 'lost')) return;
    const def = this.def.extras.find((x) => x.id === id);
    this.opts.hooks?.onGoal?.({ id, title: def?.title ?? id, state, main: false });
  }

  /** The default way to play a scripted scene: each line in turn, timed by how long it takes to say. */
  private playScript(lines: ScriptLine[], o: NonNullable<ScriptOpts>): void {
    const queue = [...lines];
    const later = (seconds: number, fn: () => void): void => {
      this.timers.push({ at: this.sim.time + Math.max(0, seconds), fn });
    };
    const next = (): void => {
      if (this.disposed) return;
      const line = queue.shift();
      if (!line) {
        o.done?.();
        return;
      }
      if (line.voice) {
        this.sim.narrate(`${line.voice.name}: "${line.text}"`, { icon: line.voice.icon ?? 'phone', room: line.voice.room ?? o.room, beat: true });
        later(Math.max(2.5, line.text.length / 14) + 0.6, next);
        return;
      }
      const p = line.who ? this.sim.person(line.who) : undefined;
      if (!line.who || !p || !p.present) {
        next();
        return;
      }
      const sp = this.sim.say(line.who, line.text, { kind: line.kind, emotion: line.emotion, to: line.to ?? null });
      later(sp.durationMs / 1000 + 0.6, next);
    };
    next();
  }

  // ── what the rest of the game asks the chapter ─────────────────────────────

  /** What the office is talking about now, for small talk. */
  topics(): string[] {
    try {
      return (this.run.topics?.() ?? []).filter((t) => typeof t === 'string' && t.trim().length > 0);
    } catch {
      return [];
    }
  }

  /** 0..1: how much is at stake right now, for the music. */
  stakes(): number {
    if (this.resolvedAt5) return 0;
    try {
      return clamp01(this.run.stakes?.() ?? 0);
    } catch {
      return 0;
    }
  }

  /** A scene's change in feeling, after the chapter has had its say (see ChapterRun.vetoShift). */
  vetoShift(who: CharId, about: CharId, delta: number): number {
    if (this.disposed || this.resolvedAt5) return delta;
    try {
      const v = this.run.vetoShift?.(who, about, delta);
      return typeof v === 'number' && Number.isFinite(v) ? v : delta;
    } catch {
      return delta;
    }
  }

  /** Nothing left today can change the main goal's result. */
  get settled(): boolean {
    if (this.resolvedAt5) return true;
    try {
      return this.run.settled ? this.run.settled() : this.mainState !== 'open';
    } catch {
      return this.mainState !== 'open';
    }
  }

  warnsUi(): Partial<Record<ActionId, string>> {
    if (this.resolvedAt5) return {};
    try {
      return { ...(this.run.warns?.() ?? {}) };
    } catch {
      return {};
    }
  }

  /** The chapter's own floor tags for right now, or null when it has none (the fixed ones are used). */
  marksUi(): { id: string; label?: string }[] | null {
    if (this.disposed || !this.run.marks) return null;
    try {
      return this.run.marks().map((m) => ({ id: m.id, ...(m.label ? { label: m.label } : {}) }));
    } catch {
      return null;
    }
  }

  // ── influence ──────────────────────────────────────────────────────────────

  costOf(action: ActionId): number {
    const own = this.def.costs?.[action];
    return typeof own === 'number' ? own : costOf(action);
  }

  /** Why an action cannot be done right now (locked, or not enough influence), or null. */
  refusal(action: ActionId): string | null {
    const locked = (this.def.locked as Partial<Record<string, string>>)[action];
    if (locked) return locked;
    const cost = this.costOf(action);
    if (cost > this.influence.left) return NOT_ENOUGH(cost, this.influence.left);
    return null;
  }

  /** Pay for an action. False (and nothing spent) if it is refused. */
  spend(action: ActionId): boolean {
    if (this.refusal(action)) return false;
    this.influence.left -= this.costOf(action);
    return true;
  }

  /** Give back what an action cost (it did not happen after all). */
  refund(action: ActionId): void {
    this.influence.left += this.costOf(action);
  }

  /**
   * Check, pay, do: `act` returns null when it happened, or a plain reason when it did
   * not, in which case the influence is given back. Returns the reason, or null.
   */
  attempt(action: ActionId, act: () => string | null): string | null {
    const no = this.refusal(action);
    if (no) return no;
    this.influence.left -= this.costOf(action);
    let reason: string | null;
    try {
      reason = act();
    } catch (err) {
      console.error('[story] action failed', err);
      reason = 'That did not work. Try again.';
    }
    if (reason) this.refund(action);
    return reason;
  }

  /** Tell the chapter what the player just did (after it happened). */
  note(a: PlayerAction): void {
    if (a.kind === 'power' && a.id) this.used.powers.push(a.id);
    else if (a.kind !== 'power') this.used[a.kind] += 1;
    try {
      this.run.onAction?.(a);
    } catch (err) {
      console.error('[story] onAction failed', err);
    }
  }

  accuse(who: CharId): void {
    if (this.disposed || this.resolvedAt5) return;
    this.run.accuse?.(who);
  }

  pinned(who: CharId): boolean {
    return !!this.run.pinned?.(who);
  }

  /** A time worth skipping ahead to (at least a quarter of an hour off), while the day's job is still open; else null. */
  nextBeat(): number | null {
    if (this.disposed || this.resolvedAt5 || this.mainState !== 'open') return null;
    // Not before everyone is in and the morning's opening captions have been shown.
    if (this.sim.clock < 9 * 60 + 5) return null;
    try {
      const t = this.run.nextBeat?.();
      return typeof t === 'number' && Number.isFinite(t) && t - this.sim.clock >= 15 && t < FIVE ? t : null;
    } catch {
      return null;
    }
  }

  /** How long people summoned to a room wait there today (sim seconds), or undefined for the usual. */
  summonStay(room: RoomId): number | undefined {
    if (this.disposed || this.resolvedAt5) return undefined;
    try {
      const v = this.run.summonStay?.(room);
      return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
    } catch {
      return undefined;
    }
  }

  // ── for the UI and the report ──────────────────────────────────────────────

  goalUi(): StoryGoalUi {
    const g = this.def.goal;
    let st = { progress: 0, status: '' };
    try {
      st = this.run.status();
    } catch {
      /* a status line is not worth a crash */
    }
    return { id: g.id, title: g.title, detail: g.detail, icon: g.icon, progress: clamp01(st.progress), status: st.status, state: this.mainState };
  }

  sideUi(): StoryGoalUi[] {
    return this.def.extras.map((x) => {
      const state = this.extras.get(x.id) ?? 'open';
      return { id: x.id, title: x.title, detail: x.detail, icon: x.icon, progress: state === 'won' ? 1 : 0, status: '', state };
    });
  }

  accuseUi(): { triesLeft: number; accused: CharId[]; label: string } | null {
    if (this.resolvedAt5) return null;
    return this.run.accuseUi?.() ?? null;
  }

  lockedUi(): Partial<Record<ChaosId, string>> {
    return { ...this.def.locked };
  }

  /** What the day comes to (settles anything still open first). */
  tally(): DayTally & { lines: string[] } {
    this.resolve();
    const won = this.mainState === 'won';
    return {
      won,
      goalText: won ? this.def.change[0] : this.def.change[1],
      extras: this.def.extras.filter((x) => this.extras.get(x.id) === 'won').map((x) => x.title),
      incidents: this.incidents ?? this.sim.incidentsToday,
      morale: this.morale ?? this.sim.meters().morale,
      lines: this.lines
    };
  }

  /** The standing changes this day would bring, for tests and the report. */
  changes(): ReturnType<typeof standingChanges> {
    return standingChanges(this.tally());
  }

  dispose(): void {
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs = [];
    this.timers = [];
    try {
      this.sim.setLocks({});
    } catch {
      /* the sim may be gone */
    }
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
