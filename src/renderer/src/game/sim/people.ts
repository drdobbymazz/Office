// One person on the floor: the sim's mutable record, which also serves as the
// read-only SimPerson view handed to other systems.

import type {
  AnimId, CharId, Dir, EmotionId, Headgear, HeldProp, Plan, RoomId, Speech, StatusEffect, StatusKind, Tile
} from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import { CAST, VISITORS, displayName, type CharacterDef } from '@/game/core/cast';
import { roomAt, tileAt } from '@/game/core/world';
import type { PersonState } from '@/game/view/api';
import type { SimPerson } from '@/game/core/simApi';
import type { Job } from './jobs';

export type MoveStyle = 'walk' | 'run' | 'panic' | 'brisk';
export const SPEEDS: Record<MoveStyle, number> = { walk: 48, brisk: 62, run: 90, panic: 110 };

/** A short reaction played over whatever they are doing. */
export interface Reaction {
  anim: AnimId;
  until: number;
  face: Dir | null;
  /** Hold still while it plays. */
  still: boolean;
}

export interface SeizeEntry {
  key: string;
  anim: AnimId;
  seated: boolean;
  variant: number;
  doing: string;
  hidden: boolean;
}

/** Physics while held by the player, thrown, or dropping onto a tile. */
export interface AirState {
  mode: 'held' | 'drop' | 'fly' | 'land' | 'lie' | 'slide';
  vx: number;
  vy: number;
  vz: number;
  /** Finger target while held. */
  tx: number;
  ty: number;
  t: number;
  airtime: number;
  topSpeed: number;
  hard: boolean;
  /** Where a drop / slide ends. */
  goal: Tile | null;
  /** Started over furniture: no wall bounces until over open floor. */
  ghost: boolean;
}

/** A walk in progress: a polyline in world pixels plus progress along it. */
export interface Walk {
  pts: number[];
  cum: number[];
  len: number;
  s: number;
  v: number;
  style: MoveStyle;
  goal: Tile;
  tiles: Tile[];
}

let personCounter = 0;

export class Person implements SimPerson {
  readonly id: CharId;
  readonly num: number;
  readonly name: string;
  readonly isCast: boolean;
  readonly def: CharacterDef | null;
  readonly sprite: string;

  x = 0;
  y = 0;
  lift = 0;
  facing: Dir = 'down';
  present = false;
  /** Present but not drawn and not on the floor (aboard the saucer). */
  hidden = false;

  emotion: EmotionId = 'neutral';
  intensity = 0.3;
  emotionUntil = 0;
  mood = 0.1;
  energy = 1;
  stress = 0.2;
  statuses: StatusEffect[] = [];
  plan: Plan | null = null;
  thought = '';
  doing = '';
  sceneId: string | null = null;
  speech: Speech | null = null;
  speechEnds = 0;
  talkEnds = 0;
  prop: HeldProp | null = null;
  propUntil = Infinity;
  headgear: Headgear | null = null;
  scale = 1;

  // ── control ──
  job: Job | null = null;
  /** The job they were doing before a scene took them over. */
  stash: Job | null = null;
  walk: Walk | null = null;
  /** No route right now: retrying. */
  waiting = false;
  retryAt = 0;
  reaction: Reaction | null = null;
  seizes: SeizeEntry[] = [];
  /** Positioned directly by a chaos script (saucer beam): stay exactly there. */
  placed = false;
  air: AirState | null = null;
  /** Tile reserved for resting (destination or where they stand). */
  res: Tile | null = null;
  /** Override for facing while idle (talking to someone). */
  faceTo: Dir | null = null;
  faceUntil = 0;

  // ── watchdog ──
  stuckFor = 0;
  lastRescue = -999;
  rescues = 0;
  trapped = false;
  progX = 0;
  progY = 0;

  // ── day ──
  arriveAt = 0;
  leaveAt = Infinity;
  lunchAt = Infinity;
  hadLunch = false;
  goingHome = false;
  wentHome = false;
  routineSteps = 0;
  planTries = 0;
  ambientCooldownUntil = 0;
  nearSince = 0;

  // ── render ──
  readonly state: PersonState;
  readonly statusKinds: StatusKind[] = [];
  prevX = 0;
  prevY = 0;
  rvx = 0;
  rvy = 0;
  private tileCache: Tile = { x: 0, y: 0 };
  private tileCx = NaN;
  private tileCy = NaN;

  constructor(id: CharId) {
    this.id = id;
    this.num = ++personCounter;
    this.isCast = isCastId(id);
    this.def = this.isCast ? CAST[id as keyof typeof CAST] : null;
    this.name = displayName(id);
    this.sprite = id;
    if (this.def) {
      this.emotion = this.def.baseline;
    } else if (!VISITORS[id]) {
      this.emotion = 'neutral';
    }
    this.state = {
      id, sprite: id, x: 0, y: 0, lift: 0, facing: 'down', anim: 'idle', variant: 0, seated: false,
      speed: 0, vx: 0, vy: 0, emotion: this.emotion, intensity: 0.3, talking: false, scale: 1, alpha: 1,
      visible: false, prop: null, headgear: null, statuses: this.statusKinds, selected: false
    };
  }

  get tile(): Tile {
    if (this.x !== this.tileCx || this.y !== this.tileCy) {
      const t = tileAt(this.x, this.y);
      this.tileCache = t;
      this.tileCx = this.x;
      this.tileCy = this.y;
    }
    return this.tileCache;
  }

  get room(): RoomId {
    return roomAt(this.tile);
  }

  get pronoun(): 'he' | 'she' | 'they' {
    return this.def ? this.def.pronoun : 'they';
  }

  get his(): string {
    return this.def ? (this.def.pronoun === 'she' ? 'her' : 'his') : 'their';
  }

  get seized(): boolean {
    return this.seizes.length > 0;
  }

  get held(): boolean {
    return this.air !== null && this.air.mode === 'held';
  }

  get airborne(): boolean {
    return this.air !== null;
  }

  has(kind: StatusKind): boolean {
    for (const s of this.statuses) if (s.kind === kind) return true;
    return false;
  }

  status(kind: StatusKind): StatusEffect | undefined {
    for (const s of this.statuses) if (s.kind === kind) return s;
    return undefined;
  }

  get frozen(): boolean {
    return this.has('frozen');
  }

  get asleep(): boolean {
    return this.has('asleep');
  }

  /** On the floor and able to act at all. */
  get onFloor(): boolean {
    return this.present && !this.hidden;
  }

  get available(): boolean {
    return this.present && !this.hidden && !this.air && !this.seized && !this.frozen && !this.asleep && this.sceneId === null && !this.goingHome;
  }

  get speaking(): boolean {
    return this.speech !== null;
  }

  get walking(): boolean {
    return this.walk !== null;
  }

  /** Standing or sitting still on their own tile (the invariant the tests check). */
  get resting(): boolean {
    return this.onFloor && !this.air && !this.walk && !this.waiting;
  }
}

export function resetPersonCounter(): void {
  personCounter = 0;
}
