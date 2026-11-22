// One story day on one simulation: the chapter's logic, today's influence
// budget, the goals and how they stand, and what the day comes to at five.
// The game (or a test) calls update() every frame and asks before spending.

import type { ActionId, StoryGoalUi } from '@/game/app/gameApi';
import type { ChaosId, CharId } from '@/game/core/types';
import type { Sim } from '@/game/sim';
import { createRng } from '@/game/sim/rng';
import { weekFacts } from './chapters';
import { EXTRA_INFLUENCE, budgetFor, costOf, standingChanges, type DayTally } from './rules';
import { NOT_ENOUGH } from './text';
import type { ChapterCtx, ChapterDef, ChapterRun, GoalState, PlayerAction, WeekNotes } from './types';

export interface StoryDayHooks {
  /** A goal was settled (main or extra), for a toast and a sound. */
  onGoal?(g: { id: string; title: string; state: 'won' | 'lost'; main: boolean }): void;
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

  constructor(sim: Sim, def: ChapterDef, private notes: WeekNotes, private opts: { seed: number; hooks?: StoryDayHooks } = { seed: 1 }) {
    this.sim = sim;
    this.def = def;
    const budget = budgetFor(def.chapter);
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
    for (const [key, text] of weekFacts(this.notes, this.def.chapter)) this.sim.setFact(key, text);
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
    for (const x of this.def.extras) if (this.extras.get(x.id) === 'open') this.settleExtra(x.id, x.atFive);
    this.resolvedAt5 = true;
    this.timers = [];
  }

  private settleMain(state: 'won' | 'lost', lines: string[]): void {
    if (this.mainState !== 'open') return;
    this.mainState = state;
    this.lines = lines.filter(Boolean);
    this.opts.hooks?.onGoal?.({ id: this.def.goal.id, title: this.def.goal.title, state, main: true });
  }

  private settleExtra(id: string, state: 'won' | 'lost'): void {
    if (this.extras.get(id) !== 'open') return;
    this.extras.set(id, state);
    if (state === 'won') this.influence.left += EXTRA_INFLUENCE;
    const def = this.def.extras.find((x) => x.id === id);
    this.opts.hooks?.onGoal?.({ id, title: def?.title ?? id, state, main: false });
  }

  // ── influence ──────────────────────────────────────────────────────────────

  costOf(action: ActionId): number {
    return costOf(action);
  }

  /** Why an action cannot be done right now (locked, or not enough influence), or null. */
  refusal(action: ActionId): string | null {
    const locked = (this.def.locked as Partial<Record<string, string>>)[action];
    if (locked) return locked;
    const cost = costOf(action);
    if (cost > this.influence.left) return NOT_ENOUGH(cost, this.influence.left);
    return null;
  }

  /** Pay for an action. False (and nothing spent) if it is refused. */
  spend(action: ActionId): boolean {
    if (this.refusal(action)) return false;
    this.influence.left -= costOf(action);
    return true;
  }

  /** Give back what an action cost (it did not happen after all). */
  refund(action: ActionId): void {
    this.influence.left += costOf(action);
  }

  /**
   * Check, pay, do: `act` returns null when it happened, or a plain reason when it did
   * not, in which case the influence is given back. Returns the reason, or null.
   */
  attempt(action: ActionId, act: () => string | null): string | null {
    const no = this.refusal(action);
    if (no) return no;
    this.influence.left -= costOf(action);
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
