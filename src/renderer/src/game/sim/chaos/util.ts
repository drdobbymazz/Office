// Shared shapes for the chaos scripts: a Run base class that keeps track of
// everything a script changes (effects, seizes, blocked tiles, loops, facts,
// headgear, props, statuses, visitors) so end() can always undo it, a timeline,
// the "wait for a fixer" helper, crowd reactions and small maths.

import type { ChaosId, CharId, Headgear, HeldProp, RoomId, StatusKind, Tile, Vec } from '@/game/core/types';
import { CAST_IDS, isCastId } from '@/game/core/types';
import type { EffectInstance, EmoteIcon } from '@/game/view/api';
import type { LoopId } from '@/game/audio/api';
import type { ChaosRun, SeizePose, SimApi, SimPerson, TaskSpec } from '@/game/core/simApi';
import { CHAOS } from '@/game/core/chaos';
import { CAST, type FixSkill } from '@/game/core/cast';
import { chaosLine, type TextVars } from '@/game/core/content/fill';
import type { ChaosText } from '@/game/core/content/types';
import { feetOf, findPath, monitorPx, roomRectPx, walkableTilesIn } from '@/game/core/world';
import type { Dir } from '@/game/core/types';

// ── small maths ──────────────────────────────────────────────────────────────

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * clamp01(k);
/** Smoothstep easing of k in 0..1. */
export const ease = (k: number): number => {
  const c = clamp01(k);
  return c * c * (3 - 2 * c);
};
/** A value tweened from a to b between times t0 and t1 (eased). */
export const tween = (t: number, t0: number, t1: number, a: number, b: number): number =>
  lerp(a, b, ease((t - t0) / Math.max(0.0001, t1 - t0)));

// ── people ───────────────────────────────────────────────────────────────────

export function nerveOf(id: CharId): number {
  return isCastId(id) ? CAST[id].temperament.nerve : 0.5;
}
/** Dwight, Creed, Stanley, Meredith and the like: stand their ground. */
export const isBrave = (id: CharId): boolean => nerveOf(id) >= 0.75;
/** Andy, Kelly, Toby, Michael and the like: panic. */
export const isNervous = (id: CharId): boolean => nerveOf(id) < 0.45;

/** Shuffled copy (sim.rng only). */
export function shuffle<T>(sim: SimApi, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(sim.rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick<T>(sim: SimApi, list: readonly T[]): T | undefined {
  return list.length ? list[Math.floor(sim.rng() * list.length)] : undefined;
}

/** Cast members on the floor, optionally in one room. */
export function staff(sim: SimApi, room?: RoomId): SimPerson[] {
  return (room ? sim.peopleIn(room) : [...sim.people()]).filter((p) => p.isCast && p.present);
}

/** The nearest present person to a point, other than those excluded. */
export function nearestTo(sim: SimApi, x: number, y: number, exclude: readonly CharId[] = [], castOnly = true): SimPerson | undefined {
  let best: SimPerson | undefined;
  let bestD = Infinity;
  for (const p of sim.people()) {
    if (!p.present || exclude.includes(p.id) || (castOnly && !p.isCast)) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** People free for a scene, first `n`. */
export function availableIds(sim: SimApi, ids: readonly CharId[], n = 4): CharId[] {
  return ids.filter((id) => sim.person(id)?.available).slice(0, n);
}

export interface ReactOpts {
  /** How many get a spoken reflex (the rest emote). Default 2. */
  barks?: number;
  icon?: EmoteIcon;
  /** Called for the brave. */
  bold?: (id: CharId) => void;
  /** Called for the nervous. */
  scared?: (id: CharId) => void;
  /** Called for everyone else (default: scared if given). */
  middling?: (id: CharId) => void;
}

/** Everyone listed reacts at once: a couple bark, the rest emote, and each acts by nerve. */
export function reactAll(sim: SimApi, ids: readonly CharId[], chaos: ChaosId, o: ReactOpts = {}): void {
  let barks = o.barks ?? 2;
  for (const id of ids) {
    const p = sim.person(id);
    if (!p || !p.present) continue;
    if (barks > 0 && p.available) {
      sim.chaosBark(id, chaos);
      barks--;
    } else {
      sim.emote(id, o.icon ?? 'alert');
    }
    if (isBrave(id)) o.bold?.(id);
    else if (isNervous(id)) o.scared?.(id);
    else (o.middling ?? o.scared)?.(id);
  }
}

export function screensAt(): Vec[] {
  return CAST_IDS.map((id) => monitorPx(id));
}

/** A random walkable tile in a room. */
export function randomTileIn(sim: SimApi, room: RoomId): Tile {
  const tiles = walkableTilesIn(room);
  return tiles[Math.floor(sim.rng() * tiles.length)] ?? { x: 16, y: 20 };
}

export function roomCentre(room: RoomId): Vec {
  const r = roomRectPx(room);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// ── the Run base class ───────────────────────────────────────────────────────

/** An effect without its id (distributive, so each kind keeps its own fields). */
export type EffectInput = EffectInstance extends infer E ? (E extends { id: string } ? Omit<E, 'id'> : never) : never;

let serial = 0;
/** Loops are shared by every event: keep a count per sim so one event never silences another. */
const loopCounts = new WeakMap<SimApi, Map<LoopId, number>>();

interface Step {
  at: number;
  fn: () => void;
  ran: boolean;
}

export abstract class Run implements ChaosRun {
  done = false;
  readonly ownStartLine = true;
  /** Seconds since the start. */
  protected t = 0;
  protected readonly key: string;
  /** Hard time limit: close() is called when it passes. */
  protected limit: number;

  private steps: Step[] = [];
  private closed = false;
  private ended = false;
  private effects = new Set<string>();
  private blocks = new Set<string>();
  private hazards = new Set<string>();
  private loops = new Set<LoopId>();
  private factOn = false;
  private seized = new Set<CharId>();
  private gear = new Set<CharId>();
  private props = new Set<CharId>();
  private statuses: { who: CharId; kind: StatusKind }[] = [];
  private visitors = new Set<string>();

  constructor(
    protected readonly sim: SimApi,
    readonly id: ChaosId,
    readonly label: string,
    readonly room: RoomId | null,
    protected readonly vars: TextVars
  ) {
    this.key = `${id}:${++serial}`;
    this.limit = CHAOS[id].duration + 8;
  }

  // ── time ──

  /** Run fn once, `sec` seconds after the start. */
  protected at(sec: number, fn: () => void): void {
    this.steps.push({ at: sec, fn, ran: false });
  }

  /** Run fn once, `sec` seconds from now. */
  protected after(sec: number, fn: () => void): void {
    this.at(this.t + sec, fn);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    for (let i = 0; i < this.steps.length && !this.done; i++) {
      const s = this.steps[i];
      if (s.ran || s.at > this.t) continue;
      s.ran = true;
      s.fn();
    }
    if (this.steps.length > 24) this.steps = this.steps.filter((s) => !s.ran);
    if (!this.done) this.tick(dt);
    if (!this.done && this.t >= this.limit) this.close();
  }

  /** Per-frame work. */
  protected tick(_dt: number): void {}

  /** Finish now, with the closing beat (narration, aftermath). Safe to call twice. */
  protected close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.onClose();
    } finally {
      this.done = true;
    }
  }

  /** The closing beat: narration, memories, aftermath scene. */
  protected onClose(): void {}

  /** Tidy up anything still in play. Called by the sim; safe at any moment. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.done = true;
    const sim = this.sim;
    try {
      this.onEnd();
    } catch (err) {
      console.error(`[chaos] ${this.id} onEnd threw`, err);
    }
    for (const id of this.effects) sim.removeEffect(id);
    this.effects.clear();
    for (const k of this.blocks) sim.setBlocked(k, null);
    this.blocks.clear();
    for (const k of this.hazards) sim.setHazard(k, null);
    this.hazards.clear();
    for (const l of [...this.loops]) this.loop(l, false);
    if (this.factOn) sim.setFact(this.key, null);
    this.factOn = false;
    for (const who of this.seized) sim.release(who, this.key);
    this.seized.clear();
    for (const who of this.gear) sim.setHeadgear(who, null);
    this.gear.clear();
    for (const who of this.props) sim.setProp(who, null);
    this.props.clear();
    for (const s of this.statuses) sim.removeStatus(s.who, s.kind);
    this.statuses = [];
    for (const v of this.visitors) if (sim.person(v)) sim.removeVisitor(v);
    this.visitors.clear();
  }

  /** Extra tidying for a script (resume a fixer ...). Runs before the tracked things are undone. */
  protected onEnd(): void {}

  // ── tracked changes ──

  protected eid(name: string): string {
    return `${this.key}:${name}`;
  }

  /** Add an effect (id is made unique by the run). Returns the id. */
  protected effect(name: string, e: EffectInput): string {
    const id = this.eid(name);
    this.effects.add(id);
    this.sim.addEffect({ ...e, id } as EffectInstance);
    return id;
  }

  protected patch(name: string, p: Record<string, unknown>): void {
    this.sim.patchEffect(this.eid(name), p);
  }

  protected unEffect(name: string): void {
    const id = this.eid(name);
    this.effects.delete(id);
    this.sim.removeEffect(id);
  }

  protected hasEffect(name: string): boolean {
    return this.effects.has(this.eid(name));
  }

  protected block(name: string, tiles: Tile[] | null): void {
    const k = this.eid(name);
    if (tiles && tiles.length) this.blocks.add(k);
    else this.blocks.delete(k);
    this.sim.setBlocked(k, tiles);
  }

  protected hazard(room: RoomId | null): void {
    if (room) this.hazards.add(this.key);
    else this.hazards.delete(this.key);
    this.sim.setHazard(this.key, room);
  }

  protected loop(id: LoopId, on: boolean): void {
    let counts = loopCounts.get(this.sim);
    if (!counts) {
      counts = new Map();
      loopCounts.set(this.sim, counts);
    }
    const n = counts.get(id) ?? 0;
    if (on) {
      if (this.loops.has(id)) return;
      this.loops.add(id);
      counts.set(id, n + 1);
      this.sim.loop(id, true);
    } else {
      if (!this.loops.has(id)) return;
      this.loops.delete(id);
      counts.set(id, Math.max(0, n - 1));
      if (n <= 1) this.sim.loop(id, false);
    }
  }

  /** The catalogue fact for this event while it lasts (null clears it). */
  protected fact(on: boolean): void {
    this.factOn = on;
    this.sim.setFact(this.key, on ? this.line('fact') : null);
  }

  protected seize(who: CharId, pose: SeizePose): void {
    if (!this.sim.person(who)?.present) return;
    this.seized.add(who);
    this.sim.seize(who, this.key, pose);
  }

  /** Seize and hold exactly where they are, even mid-stride (they claim no tile until released). */
  protected pin(who: CharId, pose: SeizePose): void {
    this.seize(who, pose);
    const p = this.sim.person(who);
    if (p && p.present && !this.sim.isAirborne(who)) this.sim.place(who, p.x, p.y, 0);
  }

  protected isHeld(who: CharId): boolean {
    return this.seized.has(who);
  }

  protected release(who: CharId): void {
    if (!this.seized.delete(who)) return;
    this.sim.release(who, this.key);
  }

  protected releaseAll(): void {
    for (const who of [...this.seized]) this.release(who);
  }

  protected heldIds(): CharId[] {
    return [...this.seized];
  }

  protected hat(who: CharId, gear: Headgear | null): void {
    if (gear) this.gear.add(who);
    else this.gear.delete(who);
    this.sim.setHeadgear(who, gear);
  }

  protected prop(who: CharId, prop: HeldProp | null): void {
    if (prop) this.props.add(who);
    else this.props.delete(who);
    this.sim.setProp(who, prop);
  }

  /** A status that IS the event (tiny, love, crowned ...): removed when the run ends. */
  protected status(who: CharId, kind: StatusKind, seconds: number, target?: CharId): void {
    this.statuses.push({ who, kind });
    this.sim.addStatus(who, kind, seconds, target);
  }

  protected unStatus(who: CharId, kind: StatusKind): void {
    this.statuses = this.statuses.filter((s) => !(s.who === who && s.kind === kind));
    this.sim.removeStatus(who, kind);
  }

  protected visitor(id: string, at: Parameters<SimApi['spawnVisitor']>[1]): void {
    this.visitors.add(id);
    this.sim.spawnVisitor(id, at);
  }

  protected unVisitor(id: string): void {
    this.visitors.delete(id);
    if (this.sim.person(id)) this.sim.removeVisitor(id);
  }

  // ── words ──

  protected line(which: keyof ChaosText): string {
    return chaosLine(this.id, which, this.vars);
  }

  protected narrate(which: keyof ChaosText): void {
    this.sim.narrate(this.line(which), { icon: this.id, room: this.room ?? undefined });
  }

  protected remember(who: CharId[] | RoomId | 'all', weight = 1.5): void {
    const ids = Array.isArray(who) ? who.filter((id) => isCastId(id)) : who;
    if (Array.isArray(ids) && !ids.length) return;
    this.sim.remember(ids, this.line('memory'), weight);
  }

  protected name(id: CharId | null | undefined): string {
    return (id && this.sim.person(id)?.name) || 'someone';
  }

  // ── camera ──

  protected focus(x: number, y: number, w = 96, h = 80, holdMs = 3000, weight = 1): void {
    this.sim.bus.emit('focus', { x: x - w / 2, y: y - h / 2 - 12, w, h, weight, holdMs });
  }

  protected focusRoom(room: RoomId, holdMs = 3000, weight = 0.9): void {
    const r = roomRectPx(room);
    this.sim.bus.emit('focus', { x: r.x, y: r.y, w: r.w, h: r.h, weight, holdMs });
  }

  protected focusOn(ids: readonly CharId[], holdMs = 3000, weight = 1): void {
    const ps = ids.map((id) => this.sim.person(id)).filter((p): p is SimPerson => !!p && p.present);
    if (!ps.length) return;
    const x0 = Math.min(...ps.map((p) => p.x)) - 32;
    const x1 = Math.max(...ps.map((p) => p.x)) + 32;
    const y0 = Math.min(...ps.map((p) => p.y)) - 48;
    const y1 = Math.max(...ps.map((p) => p.y)) + 16;
    this.sim.bus.emit('focus', { x: x0, y: y0, w: x1 - x0, h: y1 - y0, weight, holdMs });
  }
}

// ── waiting for a fixer ──────────────────────────────────────────────────────

export interface FixerOpts {
  skill: FixSkill;
  /** Where the problem is (for choosing the nearest fixer). */
  near: () => Vec;
  task: TaskSpec;
  /** When the first call goes out. Default 2.5 s. */
  firstAt?: number;
  /** Give up after this many people have been tried. Default 4. */
  maxTries?: number;
  /** Bark for whoever takes it on. */
  chaos?: ChaosId;
  /** Finished the work. */
  onDone: (who: CharId) => void;
  /** Someone has taken the job (they are on their way). */
  onCalled?: (who: CharId) => void;
}

/** Finds the nearest able person, sends them, and tries someone else if they are carried off. */
export class Fixer {
  who: CharId | null = null;
  fixed = false;
  private tries = 0;
  private next: number;
  private now = 0;
  private cancelled = false;

  constructor(private sim: SimApi, private o: FixerOpts) {
    this.next = o.firstAt ?? 2.5;
  }

  /** Call every frame with the run's time. */
  update(t: number): void {
    this.now = t;
    if (this.fixed || this.cancelled || this.who || t < this.next || this.tries >= (this.o.maxTries ?? 4)) return;
    this.tries++;
    const w = this.sim.findFixer(this.o.skill, this.o.near());
    if (!w) {
      this.next = t + 3;
      return;
    }
    this.who = w;
    const sim = this.sim;
    if (this.o.chaos) sim.chaosBark(w, this.o.chaos);
    sim.feel(w, 'determined', 0.85, 10);
    this.o.onCalled?.(w);
    sim.assign(w, this.o.task, () => {
      if (this.who !== w || this.cancelled) return;
      this.fixed = true;
      this.o.onDone(w);
    }, () => {
      if (this.who !== w) return;
      this.who = null;
      this.next = this.now + 2;
    });
  }

  /** At work on the spot (not still walking there). */
  get working(): boolean {
    if (!this.who) return false;
    const p = this.sim.person(this.who);
    return !!p && p.doing === this.o.task.doing;
  }

  /** Stop: the problem went away by itself. Sends the fixer back to their routine. */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    const w = this.who;
    if (w && !this.fixed) {
      const p = this.sim.person(w);
      if (p && (p.doing === this.o.task.doing || p.doing === (this.o.task.walkDoing ?? this.o.task.doing))) {
        this.sim.resume(w);
        if (this.o.task.prop) this.sim.setProp(w, null);
      }
    }
  }
}

/** The world-pixel feet position of a tile. */
export const px = (t: Tile): Vec => feetOf(t);

// ── something small that runs along the floor (a raccoon, a puppy) ───────────

/** Follows a tile route at a steady speed, in world pixels. */
export class PathMover {
  x: number;
  y: number;
  facing: Dir = 'down';
  private route: Vec[] = [];

  constructor(start: Vec) {
    this.x = start.x;
    this.y = start.y;
  }

  /** Head for a tile along walkable floor (straight line if there is no route). */
  goTo(from: Tile, to: Tile): void {
    const path = findPath(from, to);
    this.route = (path && path.length ? path : [to]).map((t) => feetOf(t));
  }

  get arrived(): boolean {
    return this.route.length === 0;
  }

  update(dt: number, speed: number): void {
    let step = speed * dt;
    while (step > 0 && this.route.length) {
      const n = this.route[0];
      const dx = n.x - this.x;
      const dy = n.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) this.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      if (d <= step) {
        this.x = n.x;
        this.y = n.y;
        this.route.shift();
        step -= d;
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
        step = 0;
      }
    }
  }
}
