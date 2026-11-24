// The hub of the simulation: owns the people, the grid, the clock and every
// sub-system, and implements SimApi (the surface chaos scripts and the
// director drive). The per-frame tick lives here too.

import type {
  AnimId, CastId, ChaosId, ChaosTarget, CharId, Dir, EmotionId, FeedItem, FeedKind, Headgear, HeldProp,
  LineAct, Plan, RoomId, Speech, StatusKind, Tile, Vec
} from '@/game/core/types';
import { CAST_IDS, PLAN_KINDS, clamp, clamp01, isCastId } from '@/game/core/types';
import { CAST, VISITORS, displayName, voiceOf, type FixSkill } from '@/game/core/cast';
import {
  ROOMS, TILE, WORLD_H, WORLD_W, anchor, deskOf, feetOf, findAnchor, roomAt, roomRectPx, roomsFor, tileAt
} from '@/game/core/world';
import type { GameBus } from '@/game/core/bus';
import type {
  ChaosScript, DirectorSimApi, Dest, FleeOptions, GoOptions, OpenSceneOpts, SayOptions, SceneAsk, SceneHandle,
  SeizePose, SimPerson, TaskSpec
} from '@/game/core/simApi';
import type { EffectInstance, EmoteIcon, FxCue, RenderFrame } from '@/game/view/api';
import type { LoopId, SfxId } from '@/game/audio/api';
import type { BarkKind, PersonBrief, Reflexes } from '@/game/brain/api';
import { createRng, type Rng } from './rng';
import { Nav, cellOf, inGrid } from './nav';
import { Person, type MoveStyle } from './people';
import { Clock, type DayPhase } from './clock';
import { MeterState } from './meters';
import { MemoryBook } from './memory';
import { Bonds } from './bonds';
import { ChemistryBook } from './chemistry';
import { SceneManager } from './scenes';
import { ChaosRegistry } from './chaosRegistry';
import {
  cancelJob, idleAct, makeJob, reserve, restartJob, setJob, settleJob, settleSeized, updateJob, watchdog,
  type Job, type Want
} from './jobs';
import { nextRoutine, placePhrase } from './routine';
import { planJob } from './plans';
import { dragTo as handDragTo, drop as handDrop, fallFrom, launch as handLaunch, lingerAfterRelease, pickUp as handPickUp, updateAir } from './handling';
import { goneHome, sendHome as daySendHome, startDay, updateDay } from './day';
import { briefFor as makeBrief, factsOf } from './brief';
import { cleanSave, SAVE_VERSION, type SaveData } from './save';
import { buildFrame, metersUi } from './frame';
import type { Meters } from '@/game/app/gameApi';

export interface CoreOptions {
  bus: GameBus;
  reflexes: Reflexes;
  seed?: number;
  dayMinutes: number;
  sandbox?: boolean;
  save?: SaveData | null;
  /** Wall clock in ms, used only for Speech.startedAt and UI timestamps. */
  now?: () => number;
}

const SUBSTEP = 0.05;
const RECENT_PER_ROOM = 12;
const DAYLOG_CAP = 240;

const GESTURES: Partial<Record<LineAct, [AnimId, number]>> = {
  laugh: ['laugh', 1.4], cry: ['cry', 2.2], point: ['point', 1.1], shrug: ['shrug', 1.0], facepalm: ['facepalm', 1.3],
  cheer: ['cheer', 1.4], wave: ['wave', 1.1], nod: ['nod', 0.9], shake_head: ['shake', 1.0], stomp: ['stomp', 1.1],
  cower: ['cower', 1.6], gasp: ['startle', 0.7]
};


export class SimCore implements DirectorSimApi {
  readonly bus: GameBus;
  readonly reflexes: Reflexes;
  readonly rng: Rng;
  readonly nav = new Nav();
  readonly clockState: Clock;
  readonly meterState = new MeterState();
  readonly memory = new MemoryBook();
  readonly bondsTable = new Bonds();
  readonly chemistryBook = new ChemistryBook();
  readonly scenes: SceneManager;
  readonly chaosReg: ChaosRegistry;
  readonly sandbox: boolean;
  readonly now: () => number;

  time = 0;
  list: Person[] = [];
  private map = new Map<CharId, Person>();
  effects: EffectInstance[] = [];
  readonly factMap = new Map<string, string>();
  readonly factExpiries = new Map<string, number>();
  readonly hazards = new Map<string, RoomId>();
  speeches: Speech[] = [];
  holdingId: CharId | null = null;
  selectedId: CharId | null = null;
  private revealed = new Set<CastId>();
  readonly dayLogLines: string[] = [];
  readonly recent = new Map<RoomId, { who: string; say: string }[]>();
  readonly feedLog: FeedItem[] = [];
  readonly stats = { rescues: 0, teleports: 0, forcedHome: 0, daysEnded: 0, forcedLog: [] as string[] };
  private counter = 0;
  private ambientT = 0;
  private ambientGlobalUntil = 0;
  private daylight: EffectInstance & { kind: 'daylight' } = { id: 'daylight', kind: 'daylight', hour: 9 };
  /** Kept for RenderFrame (no per-frame garbage). */
  readonly frameState: RenderFrame = { time: 0, people: [], effects: this.effects, speeches: this.speeches, frozen: false };

  constructor(opts: CoreOptions) {
    this.bus = opts.bus;
    this.reflexes = opts.reflexes;
    this.rng = createRng(opts.seed ?? 1);
    this.clockState = new Clock(opts.dayMinutes);
    this.sandbox = !!opts.sandbox;
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0));
    this.scenes = new SceneManager(this);
    this.chaosReg = new ChaosRegistry(this, this.sandbox);
    for (const id of CAST_IDS) this.addPerson(new Person(id));
    this.effects.push(this.daylight);
    let day = 1;
    const save = opts.save ? cleanSave(opts.save) : null;
    if (save) {
      this.bondsTable.load(save.bonds);
      this.chemistryBook.load(save.chemistry, save.flings);
      this.memory.load(save);
      this.meterState.stock = save.meters.stock;
      this.meterState.stockHistory = save.meters.stockHistory.length ? [...save.meters.stockHistory] : [save.meters.stock];
      this.meterState.morale = save.meters.morale;
      this.meterState.incidentFreeDays = save.incidentFreeDays;
      this.meterState.incidentsTotal = save.incidentsTotal;
      for (const id of save.revealedSecrets) this.revealed.add(id);
      day = save.dayDone ? save.day + 1 : save.day;
    }
    startDay(this, day);
  }

  // ── small helpers used by the sub-systems ──────────────────────────────────

  private addPerson(p: Person): void {
    this.list.push(p);
    this.map.set(p.id, p);
  }

  byId(id: CharId | null | undefined): Person | undefined {
    return id ? this.map.get(id) : undefined;
  }

  nameOf(id: string): string {
    return displayName(id);
  }

  roomName(room: RoomId | string): string {
    return roomsFor().find((r) => r.id === room)?.name ?? ROOMS.find((r) => r.id === room)?.name ?? String(room);
  }

  feet(t: Tile): Vec {
    return feetOf(t);
  }

  isAt(p: Person, t: Tile): boolean {
    const f = feetOf(t);
    return Math.abs(p.x - f.x) < 0.5 && Math.abs(p.y - f.y) < 0.5;
  }

  isHazard(room: RoomId): boolean {
    for (const r of this.hazards.values()) if (r === room) return true;
    return false;
  }

  speedMult(p: Person): number {
    let m = 1;
    if (p.has('caffeinated')) m *= 1.6;
    if (p.has('tiny')) m *= 0.75;
    if (p.has('giant')) m *= 0.85;
    if (p.has('dizzy')) m *= 0.8;
    if (p.has('sleepy')) m *= 0.75;
    return m;
  }

  fallbackTile(p: Person): Tile {
    const home = p.def ? deskOf(p.def.id).tile : anchor('door.entrance').tile;
    return this.nav.nearestFree(home, p.num) ?? home;
  }

  teleportPerson(p: Person, tile: Tile): void {
    const t = this.nav.nearestFree(tile, p.num) ?? this.fallbackTile(p);
    if (this.holdingId === p.id) this.holdingId = null;
    p.air = null;
    p.lift = 0;
    p.placed = false;
    p.walk = null;
    p.waiting = false;
    const f = feetOf(t);
    p.x = f.x;
    p.y = f.y;
    p.prevX = f.x;
    p.prevY = f.y;
    p.progX = f.x;
    p.progY = f.y;
    reserve(this, p, t);
    if (p.job) restartJob(p, p.job);
  }

  sendHome(p: Person): void {
    daySendHome(this, p);
  }

  startJob(p: Person, job: Job): void {
    setJob(this, p, job);
  }

  /** Re-issue the person's plan as a job (after being put down, or freed). */
  replan(p: Person): void {
    const plan = p.plan;
    if (!plan) return;
    if (p.planTries++ > 3) {
      p.plan = null;
      return;
    }
    const job = planJob(this, p, plan);
    if (!job) {
      p.plan = null;
      return;
    }
    setJob(this, p, job);
  }

  walkOff(p: Person, storm: boolean): void {
    const desk = p.def ? deskOf(p.def.id) : null;
    const want: Want = desk && !this.isHazard(desk.room) ? { kind: 'anchor', id: desk.id } : { kind: 'away', room: p.room };
    setJob(this, p, makeJob('leaveScene', want, {
      style: storm ? 'brisk' : 'walk',
      doing: storm ? 'storming off' : 'walking away',
      act: desk ? { anim: storm ? 'stomp' : 'type', seated: !storm, face: desk.face, doing: storm ? `fuming at ${p.his} desk` : `back at ${p.his} desk`, seconds: 8 } : null
    }));
  }

  dirTo(from: Vec, to: Vec): Dir {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return 'down';
    return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }

  faceToward(p: Person, target: Person | Vec, seconds: number): void {
    if (target === p) return;
    p.faceTo = this.dirTo(p, target);
    p.faceUntil = this.time + seconds;
  }

  focusOn(people: readonly Person[], weight: number, holdMs: number): void {
    if (!people.length) return;
    const r = this.scenes.rectFor(people.map((p) => p.id));
    this.bus.emit('focus', { ...r, weight, holdMs });
  }

  logEvent(text: string): void {
    this.dayLogLines.push(text);
    if (this.dayLogLines.length > DAYLOG_CAP) this.dayLogLines.shift();
  }

  secretOut(id: CastId): boolean {
    return this.revealed.has(id);
  }

  revealedList(): CastId[] {
    return [...this.revealed];
  }

  clearEffects(): void {
    this.effects.length = 0;
    this.effects.push(this.daylight);
  }

  removeAllVisitors(): void {
    for (const p of [...this.list]) if (!p.isCast) this.removeVisitor(p.id);
  }

  private nextId(prefix: string): string {
    return `${prefix}${++this.counter}`;
  }

  private emitFeed(kind: FeedKind, text: string, extra: Partial<FeedItem> = {}): void {
    const item: FeedItem = { id: this.nextId('f'), day: this.day, clock: Math.floor(this.clock), kind, text, ...extra };
    this.feedLog.push(item);
    if (this.feedLog.length > 200) this.feedLog.shift();
    this.bus.emit('feed', item);
  }

  // ── SimApi: reading ────────────────────────────────────────────────────────

  get day(): number {
    return this.clockState.day;
  }

  get clock(): number {
    return this.clockState.clock;
  }

  get chaos(): number {
    return this.meterState.chaos;
  }

  get weekday(): string {
    return this.clockState.weekday;
  }

  get phase(): DayPhase {
    return this.clockState.phase;
  }

  people(): readonly SimPerson[] {
    return this.list;
  }

  person(id: CharId): SimPerson | undefined {
    return this.map.get(id);
  }

  peopleIn(room: RoomId): SimPerson[] {
    return this.list.filter((p) => p.onFloor && p.room === room);
  }

  peopleNear(x: number, y: number, radius: number): SimPerson[] {
    const r2 = radius * radius;
    return this.list.filter((p) => p.onFloor && (p.x - x) ** 2 + (p.y - y) ** 2 <= r2);
  }

  bond(who: CharId, about: CharId): number {
    return this.bondsTable.score(who, about);
  }

  bondLabel(who: CharId, about: CharId): string {
    return this.bondsTable.label(who, about);
  }

  chemistry(who: CharId, about: CharId): number {
    return this.chemistryBook.score(who, about);
  }

  shiftChemistry(who: CharId, about: CharId, delta: number): number {
    if (!Number.isFinite(delta) || who === about) return this.chemistry(who, about);
    const before = this.chemistryBook.label(who, about);
    const next = this.chemistryBook.shift(who, about, delta);
    const after = this.chemistryBook.label(who, about);
    if (after && after !== before && isCastId(who) && isCastId(about)) {
      this.emitFeed('shift', `${this.nameOf(who)} now ${after} ${this.nameOf(about)}.`, { who, other: about });
    }
    return next;
  }

  isFling(a: CharId, b: CharId): boolean {
    return this.chemistryBook.isFling(a, b);
  }

  markFling(a: CharId, b: CharId): boolean {
    const added = this.chemistryBook.markFling(a, b);
    if (added && isCastId(a) && isCastId(b)) {
      this.emitFeed('shift', `${this.nameOf(a)} and ${this.nameOf(b)} started a secret office fling.`, { who: a, other: b });
    }
    return added;
  }

  flings(): [CastId, CastId][] {
    return this.chemistryBook.flings();
  }

  findFixer(skill: FixSkill, near: Vec): CharId | null {
    let best: Person | null = null;
    let bestD = Infinity;
    for (const p of this.list) {
      if (!p.def || !p.def.fixes.includes(skill) || !p.available) continue;
      if (p.job && (p.job.kind === 'task' || p.job.kind === 'home')) continue;
      const d = (p.x - near.x) ** 2 + (p.y - near.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ? best.id : null;
  }

  // ── SimApi: puppeteering ───────────────────────────────────────────────────

  say(who: CharId, text: string, opts: SayOptions = {}): Speech {
    const p = this.map.get(who);
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 720);
    const voice = voiceOf(who);
    const fast = p && p.has('caffeinated') ? 1.5 : 1;
    const cps = clamp(26 * voice.speed * fast, 12, 60);
    const typing = clean.length / cps;
    const durationMs = Math.round(clamp(typing + 1.4, 1.4, 30) * 1000);
    const kind = opts.kind ?? 'say';
    const speech: Speech = { id: this.nextId('s'), who, kind, text: clean, startedAt: this.now(), durationMs, cps };
    if (!p || !p.onFloor || !clean) {
      // Nobody to say it: hand back an inert speech that is never shown.
      return { ...speech, durationMs: 0 };
    }
    if (p.speech) this.hush(who);
    p.speech = speech;
    p.speechEnds = this.time + durationMs / 1000;
    p.talkEnds = this.time + typing;
    this.speeches.push(speech);
    this.bus.emit('speech', speech);
    if (opts.emotion) this.feel(who, opts.emotion, opts.intensity ?? 0.6, durationMs / 1000 + 2);
    const to = opts.to && opts.to !== 'all' ? this.map.get(opts.to) : undefined;
    if (to && to !== p) this.faceToward(p, to, durationMs / 1000);
    else if (!p.job?.act?.seated) {
      p.faceTo = 'down';
      p.faceUntil = this.time + Math.min(3, durationMs / 1000);
    }
    if (opts.act) this.gesture(p, opts.act);
    const room = p.room;
    if (!opts.quiet) {
      this.emitFeed(kind === 'think' ? 'think' : 'say', clean, {
        who, other: opts.to && opts.to !== 'all' ? opts.to : undefined, emotion: opts.emotion ?? p.emotion, room
      });
      if (kind !== 'think') this.logEvent(`${p.name}: "${clean}"`);
    }
    if (kind !== 'think') {
      let list = this.recent.get(room);
      if (!list) {
        list = [];
        this.recent.set(room, list);
      }
      list.push({ who: p.name, say: clean });
      if (list.length > RECENT_PER_ROOM) list.shift();
    }
    return speech;
  }

  /** The body language for a line. */
  gesture(p: Person, act: LineAct): void {
    const g = GESTURES[act];
    if (!g) return;
    if (p.air || p.seized || p.frozen) return;
    p.reaction = { anim: g[0], until: this.time + g[1], face: null, still: true };
  }

  hush(who: CharId): void {
    const p = this.map.get(who);
    if (!p || !p.speech) return;
    const sp = p.speech;
    p.speech = null;
    p.talkEnds = 0;
    const i = this.speeches.indexOf(sp);
    if (i >= 0) this.speeches.splice(i, 1);
    this.bus.emit('speechEnd', { id: sp.id, who });
  }

  private safeBark(fn: () => string, fallback: string): string {
    try {
      const s = fn();
      return typeof s === 'string' && s.trim() ? s : fallback;
    } catch {
      return fallback;
    }
  }

  bark(who: CharId, kind: BarkKind): void {
    const p = this.map.get(who);
    if (!p || !p.onFloor) return;
    const text = this.safeBark(() => this.reflexes.bark(who, kind), kind === 'scared' ? 'Aah!' : 'Hey!');
    const shout = kind === 'scared' || kind === 'startled' || kind === 'angry' || kind === 'pickedUp' || kind === 'zapped';
    this.say(who, text, { kind: shout ? 'shout' : 'say', quiet: true });
  }

  chaosBark(who: CharId, chaos: ChaosId): void {
    const p = this.map.get(who);
    if (!p || !p.onFloor) return;
    const text = this.safeBark(() => this.reflexes.chaosBark(who, chaos), 'What is happening?');
    this.say(who, text, { kind: 'shout' });
  }

  emote(who: CharId, icon: EmoteIcon): void {
    if (!this.map.get(who)?.onFloor) return;
    this.fx({ kind: 'emote', who, icon });
  }

  feel(who: CharId, emotion: EmotionId, intensity: number, holdSec = 6): void {
    const p = this.map.get(who);
    if (!p) return;
    p.emotion = emotion;
    p.intensity = clamp01(Number.isFinite(intensity) ? intensity : 0.5);
    p.emotionUntil = this.time + Math.max(0, holdSec);
  }

  react(who: CharId, anim: AnimId, seconds: number, opts?: { face?: Dir }): void {
    const p = this.map.get(who);
    if (!p || !p.onFloor || p.air || p.seized || p.frozen) return;
    const seated = !!(p.job && p.job.phase === 'act' && p.job.act?.seated);
    p.reaction = { anim, until: this.time + clamp(seconds, 0.1, 10), face: opts?.face ?? (seated ? null : 'down'), still: true };
  }

  face(who: CharId, toward: CharId | Vec): void {
    const p = this.map.get(who);
    if (!p) return;
    const t = typeof toward === 'string' ? this.map.get(toward) : toward;
    if (t) this.faceToward(p, t, 4);
  }

  private wantOf(dest: Dest): Want | null {
    if ('anchor' in dest) return findAnchor(dest.anchor) ? { kind: 'anchor', id: dest.anchor } : null;
    if ('room' in dest) return ROOMS.some((r) => r.id === dest.room) ? { kind: 'room', room: dest.room } : null;
    if ('tile' in dest) return dest.tile && Number.isFinite(dest.tile.x) && Number.isFinite(dest.tile.y) ? { kind: 'tile', tile: { x: Math.round(dest.tile.x), y: Math.round(dest.tile.y) } } : null;
    if ('near' in dest) return this.map.get(dest.near) ? { kind: 'near', who: dest.near } : null;
    return null;
  }

  private placeOf(dest: Dest): string {
    if ('anchor' in dest) return placePhrase(this, dest.anchor);
    if ('room' in dest) return `in ${this.roomName(dest.room)}`;
    if ('near' in dest) return `near ${this.nameOf(dest.near)}`;
    return `in ${this.roomName(roomAt(dest.tile))}`;
  }

  /** Can a script direct this person right now? */
  private directable(p: Person | undefined): p is Person {
    return !!p && p.onFloor && !p.air && !p.seized && !p.goingHome;
  }

  goTo(who: CharId, dest: Dest, opts: GoOptions = {}): void {
    const p = this.map.get(who);
    if (!this.directable(p)) return;
    const want = this.wantOf(dest);
    if (!want) return;
    this.scenes.breakFor(p, 'sent elsewhere');
    const style: MoveStyle = opts.style ?? 'walk';
    const place = this.placeOf(dest);
    const stay = opts.stay ?? 30;
    const a = 'anchor' in dest ? findAnchor(dest.anchor) : undefined;
    setJob(this, p, makeJob('go', want, {
      style,
      braveHazard: !!opts.braveHazard,
      doing: opts.doing ?? `heading ${place.replace(/^(in|at|by|near) /, 'to ')}`,
      act: stay > 0 ? {
        ...idleAct(opts.stayDoing ?? `waiting ${place}`, stay),
        seated: !!a && (a.kind === 'seat' || a.kind === 'desk'),
        face: a ? a.face : null,
        faceWho: 'near' in dest ? dest.near : undefined
      } : null,
      onArrive: opts.then
    }));
  }

  fleeFrom(who: CharId, room: RoomId, opts: FleeOptions = {}): void {
    const p = this.map.get(who);
    if (!this.directable(p)) return;
    this.scenes.breakFor(p, 'fled');
    const nerve = p.def ? p.def.temperament.nerve : 0.5;
    setJob(this, p, makeJob('flee', { kind: 'away', room }, {
      style: opts.style ?? (nerve < 0.5 ? 'panic' : 'run'),
      doing: opts.doing ?? `running out of ${this.roomName(room)}`,
      act: idleAct(`keeping well clear of ${this.roomName(room)}`, opts.stay ?? 10, null, nerve < 0.4 ? 'cower' : 'idle')
    }));
  }

  evacuate(who: CharId): void {
    const p = this.map.get(who);
    if (!this.directable(p)) return;
    this.scenes.breakFor(p, 'evacuated');
    const face = this.rng() < 0.6 ? 'down' : this.rng() < 0.5 ? 'left' : 'right';
    setJob(this, p, makeJob('evacuate', { kind: 'outside' }, {
      style: 'run',
      braveHazard: true,
      doing: 'leaving the building',
      act: idleAct('waiting outside on the pavement', 120, face)
    }));
  }

  leaveEarly(who: CharId, doing = 'walking out'): void {
    const p = this.map.get(who);
    if (!p || !p.present || p.goingHome) return;
    this.scenes.breakFor(p, 'left');
    p.plan = null;
    p.goingHome = true;
    if (p.air || p.seized) return;
    setJob(this, p, makeJob('home', { kind: 'anchor', id: 'exit.street' }, {
      style: 'brisk',
      braveHazard: true,
      doing,
      then: () => goneHome(this, p)
    }));
  }

  resume(who: CharId): void {
    const p = this.map.get(who);
    if (!p || !p.onFloor || p.seized || p.goingHome) return;
    if (p.sceneId) this.scenes.breakFor(p, 'resumed');
    p.plan = null;
    if (!p.air) cancelJob(p);
  }

  assign(who: CharId, task: TaskSpec, done?: () => void, failed?: () => void): void {
    const p = this.map.get(who);
    const want = task ? this.wantOf(task.at) : null;
    if (!this.directable(p) || !want) {
      failed?.();
      return;
    }
    this.scenes.breakFor(p, 'given a job');
    setJob(this, p, makeJob('task', want, {
      style: task.style ?? 'walk',
      braveHazard: true,
      doing: task.walkDoing ?? task.doing,
      act: { anim: task.anim, seated: false, face: null, prop: task.prop ?? undefined, doing: task.doing, seconds: Math.max(0.1, task.seconds) },
      then: () => {
        if (task.prop && p.prop === task.prop) p.prop = null;
        done?.();
      },
      onFail: failed
    }));
  }

  seize(who: CharId, key: string, pose: SeizePose): void {
    const p = this.map.get(who);
    if (!p || !p.present) return;
    this.scenes.breakFor(p, 'seized');
    if (!p.air) cancelJob(p);
    p.reaction = null;
    p.seizes = p.seizes.filter((s) => s.key !== key);
    p.seizes.push({ key, anim: pose.anim, seated: !!pose.seated, variant: pose.variant ?? 0, doing: pose.doing, hidden: !!pose.hidden });
    p.doing = pose.doing;
    if (pose.hidden) {
      p.hidden = true;
      reserve(this, p, null);
      if (p.speech) this.hush(p.id);
      if (this.holdingId === p.id) {
        this.holdingId = null;
        p.air = null;
      }
    }
  }

  release(who: CharId, key: string): void {
    const p = this.map.get(who);
    if (!p) return;
    const before = p.seizes.length;
    p.seizes = p.seizes.filter((s) => s.key !== key);
    if (before === p.seizes.length || p.seizes.length) {
      if (p.seizes.length) p.doing = p.seizes[p.seizes.length - 1].doing;
      return;
    }
    p.hidden = false;
    if (!p.present) return;
    if (p.placed) {
      p.placed = false;
      fallFrom(this, p);
    }
    if (!p.air) {
      // Put down by the player while held (time stopped): they stay where they were put for a while.
      if (lingerAfterRelease(p)) return;
      if (!p.res || !this.isAt(p, p.res)) p.job = settleJob('getting back to it');
      if (p.goingHome) this.sendHome(p);
    }
  }

  isSeized(who: CharId): boolean {
    return !!this.map.get(who)?.seized;
  }

  isAirborne(who: CharId): boolean {
    return !!this.map.get(who)?.air;
  }

  addStatus(who: CharId, kind: StatusKind, seconds: number, target?: CharId): void {
    const p = this.map.get(who);
    if (!p) return;
    const until = Number.isFinite(seconds) ? this.time + Math.max(0, seconds) : Infinity;
    const existing = p.status(kind);
    if (existing) {
      existing.until = Math.max(existing.until, until);
      if (target) existing.target = target;
    } else {
      p.statuses.push({ kind, until, target });
    }
    if (kind === 'asleep' || kind === 'frozen' || kind === 'knockedOut' || kind === 'eliminated') {
      this.scenes.breakFor(p, kind);
      p.reaction = null;
    }
  }

  removeStatus(who: CharId, kind: StatusKind): void {
    const p = this.map.get(who);
    if (!p) return;
    p.statuses = p.statuses.filter((s) => s.kind !== kind);
  }

  hasStatus(who: CharId, kind: StatusKind): boolean {
    return !!this.map.get(who)?.has(kind);
  }

  setPlan(who: CharId, plan: Plan | null): void {
    const p = this.map.get(who);
    if (!p) return;
    if (plan && !(PLAN_KINDS as readonly string[]).includes(plan.kind)) return;
    p.plan = plan ? { kind: plan.kind, target: plan.target ?? null, about: plan.about ?? '' } : null;
    p.planTries = 0;
    if (!plan) {
      if (p.job && (p.job.kind === 'plan' || p.job.kind === 'planWait')) cancelJob(p);
      return;
    }
    if (p.available && p.present) this.replan(p);
  }

  setThought(who: CharId, thought: string): void {
    const p = this.map.get(who);
    if (p) p.thought = String(thought ?? '').slice(0, 200);
  }

  convince(who: CharId, text: string | null, fromPlayer = false): void {
    const p = this.map.get(who);
    if (!p) return;
    const t = String(text ?? '').trim().slice(0, 200);
    p.conviction = t ? { text: t, since: this.clock, ...(fromPlayer ? { fromPlayer: true } : {}) } : null;
  }

  setHiddenNote(who: CharId, text: string | null): void {
    const p = this.map.get(who);
    if (!p) return;
    const t = String(text ?? '').trim().slice(0, 300);
    p.hiddenNote = t || null;
  }

  setProp(who: CharId, prop: HeldProp | null): void {
    const p = this.map.get(who);
    if (!p) return;
    p.prop = prop;
    p.propUntil = Infinity;
  }

  setHeadgear(who: CharId, gear: Headgear | null): void {
    const p = this.map.get(who);
    if (p) p.headgear = gear;
  }

  teleport(who: CharId, tile: Tile): void {
    const p = this.map.get(who);
    if (!p || !p.present || !tile || !Number.isFinite(tile.x) || !Number.isFinite(tile.y)) return;
    p.hidden = false;
    this.teleportPerson(p, { x: Math.round(tile.x), y: Math.round(tile.y) });
  }

  launch(who: CharId, vx: number, vy: number, up: number): void {
    const p = this.map.get(who);
    if (!p || !p.onFloor) return;
    handLaunch(this, p, vx, vy, up);
  }

  place(who: CharId, x: number, y: number, lift: number): void {
    const p = this.map.get(who);
    if (!p || !p.seized || !Number.isFinite(x) || !Number.isFinite(y)) return;
    // The player's hand (or a throw) wins over a script placing them.
    if (p.air) return;
    if (!p.placed) reserve(this, p, null);
    p.placed = true;
    p.x = clamp(x, 4, WORLD_W - 4);
    p.y = clamp(y, 4, WORLD_H);
    p.lift = Math.max(0, Number.isFinite(lift) ? lift : 0);
  }

  // ── SimApi: the office ─────────────────────────────────────────────────────

  addEffect(e: EffectInstance): void {
    if (!e || !e.id) return;
    const i = this.effects.findIndex((x) => x.id === e.id);
    if (i >= 0) this.effects[i] = e;
    else this.effects.push(e);
  }

  patchEffect(id: string, patch: Record<string, unknown>): void {
    const e = this.effects.find((x) => x.id === id);
    if (e) Object.assign(e, patch, { id: e.id, kind: e.kind });
  }

  removeEffect(id: string): void {
    if (id === 'daylight') return;
    const i = this.effects.findIndex((x) => x.id === id);
    if (i >= 0) this.effects.splice(i, 1);
  }

  effect(id: string): EffectInstance | undefined {
    return this.effects.find((x) => x.id === id);
  }

  setBlocked(key: string, tiles: Tile[] | null): void {
    this.nav.setBlocked(key, tiles);
    if (!tiles || !tiles.length) return;
    // Anyone standing on a newly blocked tile steps off it.
    for (const p of this.list) {
      if (!p.onFloor || p.air || p.seized || !p.res) continue;
      if (!this.nav.isBlocked(p.res.x, p.res.y)) continue;
      if (p.job) {
        p.job.tile = null;
        if (p.job.phase === 'act') p.job.phase = 'walk';
        p.walk = null;
      } else {
        p.job = settleJob(p.doing);
      }
    }
  }

  canBlock(tiles: Tile[]): boolean {
    if (!Array.isArray(tiles) || !tiles.length) return true;
    const door = anchor('door.entrance').tile;
    const count = (): number => {
      const d = this.nav.distances(door);
      let n = 0;
      for (let i = 0; i < d.length; i++) if (d[i] >= 0) n++;
      return n;
    };
    const before = count();
    let removed = 0;
    const seen = new Set<string>();
    const reach = this.nav.distances(door);
    for (const t of tiles) {
      const k = `${t.x},${t.y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (inGrid(t.x, t.y) && reach[cellOf(t.x, t.y)] >= 0) removed++;
      if (t.x === door.x && t.y === door.y) return false;
    }
    this.nav.setBlocked('__probe', tiles);
    const after = count();
    this.nav.setBlocked('__probe', null);
    return after === before - removed;
  }

  setHazard(key: string, room: RoomId | null): void {
    if (room) this.hazards.set(key, room);
    else this.hazards.delete(key);
  }

  fx(cue: FxCue): void {
    this.bus.emit('fx', cue);
  }

  sfx(id: SfxId, x?: number): void {
    this.bus.emit('sfx', x === undefined ? { id } : { id, x });
  }

  loop(id: LoopId, on: boolean): void {
    this.bus.emit('loop', { id, on });
  }

  shake(power: number, ms: number): void {
    this.bus.emit('shake', { power: clamp01(power), ms });
  }

  spawnVisitor(id: string, at: Dest): void {
    if (isCastId(id)) return;
    let p = this.map.get(id);
    if (p && p.present) return;
    if (!p) {
      p = new Person(id);
      this.addPerson(p);
    }
    const want = this.wantOf(at) ?? { kind: 'anchor', id: 'exit.street' };
    let tile: Tile = anchor('exit.street').tile;
    if (want.kind === 'anchor') tile = anchor(want.id).tile;
    else if (want.kind === 'tile') tile = want.tile;
    else if (want.kind === 'near') tile = this.map.get(want.who)?.tile ?? tile;
    else if (want.kind === 'room') tile = tileAt(roomRectPx(want.room).x + 24, roomRectPx(want.room).y + 40);
    const t = this.nav.nearestFree(tile, p.num) ?? tile;
    p.present = true;
    p.hidden = false;
    p.wentHome = false;
    p.goingHome = false;
    p.statuses = [];
    p.emotion = 'neutral';
    p.doing = VISITORS[id] ? `visiting the office` : 'visiting';
    const f = feetOf(t);
    p.x = f.x;
    p.y = f.y;
    p.prevX = f.x;
    p.prevY = f.y;
    p.state.alpha = 0;
    reserve(this, p, t);
    p.job = makeJob('settle', { kind: 'tile', tile: t }, { act: idleAct('standing about', 4) });
  }

  removeVisitor(id: string): void {
    const p = this.map.get(id);
    if (!p || p.isCast) return;
    this.scenes.breakFor(p, 'left');
    cancelJob(p, false);
    if (p.speech) this.hush(id);
    if (this.holdingId === id) this.holdingId = null;
    reserve(this, p, null);
    p.present = false;
    p.air = null;
    p.seizes = [];
    this.map.delete(id);
    this.list = this.list.filter((x) => x !== p);
  }

  // ── SimApi: story ──────────────────────────────────────────────────────────

  narrate(text: string, opts: { icon?: string; room?: RoomId; kind?: FeedKind; beat?: boolean; slow?: boolean } = {}): void {
    const t = String(text ?? '').trim();
    if (!t) return;
    this.emitFeed(opts.kind ?? 'event', t, { icon: opts.icon, room: opts.room, ...(opts.beat ? { beat: true } : {}), ...(opts.slow ? { slow: true } : {}) });
    this.logEvent(t);
  }

  remember(who: CharId[] | RoomId | 'all', text: string, weight = 1): void {
    const t = String(text ?? '').trim();
    if (!t) return;
    let ids: CharId[];
    if (Array.isArray(who)) ids = who;
    else if (who === 'all') ids = this.list.filter((p) => p.isCast).map((p) => p.id);
    else ids = this.list.filter((p) => p.isCast && p.onFloor && p.room === who).map((p) => p.id);
    for (const id of ids) {
      if (!isCastId(id)) continue;
      this.memory.add(id, { day: this.day, clock: Math.floor(this.clock), text: t, weight: clamp(weight, 0.1, 5) });
    }
  }

  shiftBond(who: CharId, about: CharId, delta: number, why?: string): void {
    if (!Number.isFinite(delta) || who === about) return;
    const r = this.bondsTable.shift(who, about, delta, why);
    if (r.before !== r.after) {
      const label = r.after.startsWith('is ') ? `is now ${r.after.slice(3)}` : `now ${r.after}`;
      this.emitFeed('shift', `${this.nameOf(who)} ${label} ${this.nameOf(about)}.`, { who, other: about });
    }
  }

  bumpChaos(amount: number): void {
    if (Number.isFinite(amount)) this.meterState.bumpChaos(amount);
  }

  bumpMood(who: CharId | 'all', amount: number): void {
    if (!Number.isFinite(amount)) return;
    const targets = who === 'all' ? this.list.filter((p) => p.onFloor) : [this.map.get(who)].filter((p): p is Person => !!p);
    for (const p of targets) p.mood = clamp(p.mood + amount, -1, 1);
  }

  setFact(key: string, text: string | null, ttlSecs?: number): void {
    if (text && text.trim()) {
      this.factMap.set(key, text.trim());
      if (ttlSecs && ttlSecs > 0) this.factExpiries.set(key, this.time + ttlSecs);
      else this.factExpiries.delete(key);
    } else {
      this.factMap.delete(key);
      this.factExpiries.delete(key);
    }
  }

  incident(): void {
    this.meterState.incident();
  }

  revealSecret(who: CastId): void {
    if (!isCastId(who) || this.revealed.has(who)) return;
    this.revealed.add(who);
    this.remember('all', `Everyone found out ${CAST[who].name}'s secret: ${CAST[who].persona.secret}.`, 2);
  }

  requestScene(ask: SceneAsk): void {
    this.scenes.request(ask);
  }

  // ── Director surface ───────────────────────────────────────────────────────

  takeSceneAsks(): SceneAsk[] {
    return this.scenes.take();
  }

  openScene(opts: OpenSceneOpts): SceneHandle | null {
    return this.scenes.open(opts);
  }

  briefFor(who: CharId, others: readonly CharId[]): PersonBrief {
    return makeBrief(this, who, others);
  }

  facts(): string[] {
    return factsOf(this);
  }

  recentLines(room: RoomId, n: number): { who: string; say: string }[] {
    const list = this.recent.get(room) ?? [];
    return list.slice(Math.max(0, list.length - Math.max(0, n))).map((l) => ({ ...l }));
  }

  dayLog(): string[] {
    return [...this.dayLogLines];
  }

  memoriesFor(who: CharId, about: readonly CharId[] = []): string[] {
    return this.memory.relevant(who, about, this.day, this.clock, 3);
  }

  setTakeaways(list: readonly { who: CharId; text: string }[]): void {
    for (const t of list ?? []) if (t && isCastId(t.who)) this.memory.addTakeaway(t.who, t.text);
  }

  // ── Player handling ────────────────────────────────────────────────────────

  pickUp(who: CharId): boolean {
    const p = this.map.get(who);
    if (!p) return false;
    return handPickUp(this, p);
  }

  dragTo(x: number, y: number): void {
    handDragTo(this, x, y);
  }

  drop(vx = 0, vy = 0): void {
    const p = this.holdingId ? this.map.get(this.holdingId) : undefined;
    if (p) handDrop(this, p, vx, vy);
    this.holdingId = null;
  }

  poke(who: CharId): void {
    const p = this.map.get(who);
    if (!p || !p.onFloor || p.air) return;
    this.fx({ kind: 'ring', x: p.x, y: p.y - 14, color: 0xffffff });
    this.sfx('boing', p.x);
    if (p.frozen) return;
    if (p.has('asleep')) {
      this.removeStatus(p.id, 'asleep');
      this.emote(p.id, 'alert');
    }
    this.react(p.id, 'startle', 0.6);
    this.emote(p.id, 'alert');
    this.bark(p.id, 'poked');
    const nerve = p.def ? p.def.temperament.nerve : 0.5;
    this.bumpMood(p.id, -0.02 - (1 - nerve) * 0.03);
    this.feel(p.id, nerve > 0.6 ? 'confused' : 'surprised', 0.6, 2.5);
    p.stress = clamp01(p.stress + 0.04);
  }

  // ── Chaos ──────────────────────────────────────────────────────────────────

  registerChaos(script: ChaosScript): void {
    this.chaosReg.register(script);
  }

  startChaos(id: ChaosId, target: ChaosTarget = {}, opts: { force?: boolean } = {}): string | null {
    return this.chaosReg.start(id, target, !!opts.force);
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  serialize(): SaveData {
    const mem = this.memory.serialize();
    const bonds: SaveData['bonds'] = {};
    for (const [k, v] of this.bondsTable.entries()) bonds[k] = v;
    const chemistry: Record<string, number> = {};
    for (const [k, v] of this.chemistryBook.entries()) chemistry[k] = v;
    return {
      version: SAVE_VERSION,
      day: this.day,
      dayDone: this.phase === 'over',
      bonds,
      chemistry,
      flings: this.chemistryBook.flings(),
      memories: mem.memories,
      takeaways: mem.takeaways,
      meters: { stock: this.meterState.stock, stockHistory: [...this.meterState.stockHistory], morale: this.meterState.morale },
      incidentFreeDays: this.meterState.incidentFreeDays,
      incidentsTotal: this.meterState.incidentsTotal,
      revealedSecrets: [...this.revealed]
    };
  }

  beginDay(n?: number): void {
    startDay(this, n ?? this.day + 1);
  }

  // ── The tick ───────────────────────────────────────────────────────────────

  update(dt: number): void {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.25);
    const steps = Math.ceil(dt / SUBSTEP - 1e-9);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.tick(h);
  }

  private tick(dt: number): void {
    this.time += dt;
    this.clockState.advance(dt);
    updateDay(this);
    this.expireStatuses();
    this.chaosReg.update(dt);
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      const x0 = p.x;
      const y0 = p.y;
      this.updatePerson(p, dt);
      this.afterMove(p, x0, y0, dt);
    }
    this.scenes.update();
    this.expireSpeeches();
    this.ambientT += dt;
    if (this.ambientT >= 1) {
      this.ambientT = 0;
      this.ambient();
    }
    this.updateMeters(dt);
    this.daylight.hour = this.clock / 60;
  }

  private expireStatuses(): void {
    for (const [key, until] of this.factExpiries) {
      if (until <= this.time) {
        this.factMap.delete(key);
        this.factExpiries.delete(key);
      }
    }
    for (const p of this.list) {
      if (!p.statuses.length) continue;
      let changed = false;
      for (const s of p.statuses) if (s.until <= this.time) changed = true;
      if (!changed) continue;
      const wasAsleep = p.has('asleep');
      const wasKo = p.has('knockedOut');
      const wasNaked = p.has('naked');
      p.statuses = p.statuses.filter((s) => s.until > this.time);
      if (wasAsleep && !p.has('asleep') && p.onFloor) this.emote(p.id, 'alert');
      if (wasKo && !p.has('knockedOut') && p.onFloor) {
        this.emote(p.id, 'alert');
        this.addStatus(p.id, 'dizzy', 6);
        this.feel(p.id, 'confused', 0.7, 6);
        if (p.job?.kind === 'settle' || !p.job) p.doing = 'getting up';
      }
      if (wasNaked && !p.has('naked')) {
        this.setFact(`naked:${p.id}`, null);
        this.setFact(`dressed:${p.id}`, `${p.name} put their clothes back on and is fully dressed again.`, 90);
        this.remember('all', `${p.name} put their clothes back on and is fully dressed again.`, 3.5);
        if (p.onFloor) {
          this.narrate(`${p.name} puts their clothes back on.`, { kind: 'event', icon: 'tell', room: p.room });
          this.feel(p.id, 'embarrassed', 0.5, 6);
        }
      }
    }
  }

  private expireSpeeches(): void {
    for (let i = this.speeches.length - 1; i >= 0; i--) {
      const sp = this.speeches[i];
      const p = this.map.get(sp.who);
      if (!p || !p.onFloor) {
        this.speeches.splice(i, 1);
        if (p && p.speech === sp) p.speech = null;
        this.bus.emit('speechEnd', { id: sp.id, who: sp.who });
        continue;
      }
      if (this.time >= p.speechEnds) {
        this.speeches.splice(i, 1);
        if (p.speech === sp) p.speech = null;
      }
    }
  }

  private restingMood(p: Person): EmotionId {
    if (p.has('love')) return 'love';
    if (p.has('rage')) return 'angry';
    if (p.has('aroused')) return p.mood > 0.35 ? 'love' : 'mischievous';
    if (p.has('afterglow')) return p.mood > 0.2 ? 'smug' : 'happy';
    if (p.has('flustered')) return p.mood > 0.2 ? 'love' : 'embarrassed';
    if (p.has('spooked') || p.has('paranoid')) return 'nervous';
    if (p.has('asleep') || p.energy < 0.2) return 'tired';
    if (p.mood < -0.45) return 'sad';
    if (p.stress > 0.7) return 'nervous';
    if (p.mood > 0.6) return 'happy';
    return p.def ? p.def.baseline : 'neutral';
  }

  private updateFeelings(p: Person, dt: number): void {
    if (this.time > p.emotionUntil) {
      const rest = this.restingMood(p);
      if (p.emotion !== rest) {
        p.intensity -= 0.2 * dt;
        if (p.intensity <= 0.35) {
          p.emotion = rest;
          p.intensity = 0.3;
        }
      } else {
        p.intensity += (0.3 - p.intensity) * Math.min(1, dt * 0.5);
      }
    }
    // Mood drifts back toward a mild baseline; stress eases.
    p.mood += (0.1 - p.mood) * Math.min(1, dt * 0.004);
    p.stress = Math.max(0, p.stress - dt * 0.004);
    if (this.isHazard(p.room)) p.stress = Math.min(1, p.stress + dt * 0.05);
    p.energy = Math.max(0, p.energy - dt * 0.0008);
    if (p.prop && this.time > p.propUntil) p.prop = null;
    const scaleTarget = p.has('tiny') ? 0.45 : p.has('giant') ? 1.7 : 1;
    p.scale += (scaleTarget - p.scale) * Math.min(1, dt * 4);
    if (Math.abs(p.scale - scaleTarget) < 0.002) p.scale = scaleTarget;
  }

  private updatePerson(p: Person, dt: number): void {
    if (!p.present) return;
    this.updateFeelings(p, dt);
    if (p.air) {
      updateAir(this, p, dt);
      return;
    }
    if (p.frozen) return;
    if (p.hidden) return;
    if (p.seized) {
      p.walk = null;
      settleSeized(this, p, dt);
      return;
    }
    if (p.asleep || p.has('knockedOut')) {
      if (p.walk || p.waiting) {
        p.walk = null;
        p.waiting = false;
        if (p.job) p.job.tile = null;
      }
      if (p.has('knockedOut')) p.doing = 'knocked out';
      settleSeized(this, p, dt);
      return;
    }
    // A plan waiting to be carried out takes over from the routine.
    if (p.plan && !p.sceneId && !p.goingHome && (!p.job || p.job.kind === 'routine' || p.job.kind === 'settle')) this.replan(p);
    if (!p.job) this.nextJob(p);
    if (p.reaction) {
      if (this.time >= p.reaction.until) p.reaction = null;
      else if (p.reaction.still) {
        if (p.walk) p.walk.v = 0;
        return;
      }
    }
    if (!updateJob(this, p, dt)) {
      this.nextJob(p);
      updateJob(this, p, 0);
    }
    watchdog(this, p, dt);
  }

  /** Facing while walking, and a smoothed velocity for the sprite's sway. */
  private afterMove(p: Person, x0: number, y0: number, dt: number): void {
    const dx = p.x - x0;
    const dy = p.y - y0;
    if (p.walk && Math.abs(dx) + Math.abs(dy) > 0.01) {
      p.facing = Math.abs(dx) >= Math.abs(dy) * 0.9 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }
    if (p.air) {
      p.rvx = p.air.vx;
      p.rvy = p.air.vy;
    } else if (dt > 0) {
      const k = Math.min(1, dt * 12);
      p.rvx += (dx / dt - p.rvx) * k;
      p.rvy += (dy / dt - p.rvy) * k;
    }
  }

  /** Nothing to do: the day, a scene or the routine decides what comes next. */
  private nextJob(p: Person): void {
    if (p.goingHome) this.sendHome(p);
    else if (p.sceneId) p.job = makeJob('gather', { kind: 'here' }, { act: idleAct('talking', Infinity) });
    else if (p.isCast) setJob(this, p, nextRoutine(this, p));
    else p.job = makeJob('settle', { kind: 'here' }, { act: idleAct('standing about', 8) });
  }

  private ambient(): void {
    if (this.clockState.phase !== 'working' || this.time < this.ambientGlobalUntil) return;
    const idle = this.list.filter((p) => p.isCast && p.available && p.resting && !p.plan && p.ambientCooldownUntil <= this.time
      && (!p.job || p.job.phase === 'act'));
    for (const p of idle) {
      if (p.nearSince === 0) p.nearSince = this.time;
    }
    for (const p of this.list) if (!idle.includes(p)) p.nearSince = 0;
    for (let i = 0; i < idle.length; i++) {
      for (let j = i + 1; j < idle.length; j++) {
        const a = idle[i];
        const b = idle[j];
        if (a.room !== b.room || (a.x - b.x) ** 2 + (a.y - b.y) ** 2 > 40 * 40) continue;
        if (this.time - a.nearSince < 4 || this.time - b.nearSince < 4) continue;
        const where = a.doing.match(/ (at|by|in) (.+)$/);
        // "at his desk" is somebody's desk: say whose ("at Oscar's desk"), not "both at his desk".
        const place = where ? `${where[1]} ${where[2].replace(/^(his|her|their) /, `${a.name}'s `)}` : `in ${this.roomName(a.room)}`;
        this.requestScene({
          people: [a.id, b.id],
          room: a.room,
          trigger: 'ambient',
          why: `${a.name} and ${b.name} run into each other ${place}.`,
          priority: 1,
          staleAfter: 15,
          minLines: 2,
          maxLines: 4
        });
        a.ambientCooldownUntil = this.time + 60;
        b.ambientCooldownUntil = this.time + 60;
        this.ambientGlobalUntil = this.time + 12;
        return;
      }
    }
  }

  private updateMeters(dt: number): void {
    let n = 0;
    let mood = 0;
    let working = 0;
    for (const p of this.list) {
      if (!p.isCast || !p.onFloor) continue;
      n++;
      mood += p.mood;
      const j = p.job;
      if (j && j.phase === 'act' && j.act && (j.act.anim === 'type' || j.act.anim === 'phone') && p.def && p.res && p.res.x === deskOf(p.def.id).tile.x && p.res.y === deskOf(p.def.id).tile.y) working++;
    }
    const active = this.clockState.phase === 'working';
    this.meterState.update(dt, this.rng, n ? mood / n : null, n && active ? working / n : null);
  }

  // ── Output ─────────────────────────────────────────────────────────────────

  frame(): RenderFrame {
    return buildFrame(this);
  }

  meters(): Meters {
    return metersUi(this);
  }
}
