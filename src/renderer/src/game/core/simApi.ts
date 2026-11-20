// The surface of the simulation that other systems drive: the director (which
// plays out what the language model writes) and the chaos events (which stage
// fires, floods, saucers ...). The sim (game/sim/) implements this.
//
// STATUS: this is the agreed shape. The sim's author may ADD methods and
// fields, and may tighten types, but should keep these names and meanings so
// code written against it keeps working.

import type {
  AnimId, CastId, ChaosId, ChaosTarget, CharId, Dir, EmotionId, FeedKind, Headgear, HeldProp,
  LineAct, Plan, RoomId, Speech, SpeechKind, StatusEffect, StatusKind, Tile, Vec
} from './types';
import type { FixSkill } from './cast';
import type { GameBus } from './bus';
import type { EffectInstance, EmoteIcon, FxCue } from '@/game/view/api';
import type { LoopId, SfxId } from '@/game/audio/api';
import type { BarkKind, SceneTrigger } from '@/game/brain/api';

/** Read-only view of one person. */
export interface SimPerson {
  readonly id: CharId;
  readonly name: string;
  /** Cast member (false = visitor). */
  readonly isCast: boolean;
  /** Feet position in world pixels, and the tile under them. */
  readonly x: number;
  readonly y: number;
  readonly tile: Tile;
  readonly room: RoomId;
  readonly facing: Dir;
  /** In the office and on the floor (not gone home, not aboard the saucer). */
  readonly present: boolean;
  /** Free to be given things to do (not asleep, frozen, held, airborne, in a scene). */
  readonly available: boolean;
  readonly emotion: EmotionId;
  readonly intensity: number;
  /** -1..1 */
  readonly mood: number;
  /** 0..1 */
  readonly energy: number;
  /** 0..1 */
  readonly stress: number;
  readonly statuses: readonly StatusEffect[];
  readonly plan: Plan | null;
  readonly thought: string;
  /** A few plain words: "typing at his desk", "running from the fire". */
  readonly doing: string;
  /** Id of the scene they are speaking in, if any. */
  readonly sceneId: string | null;
  readonly speaking: boolean;
}

/** Somewhere to go. */
export type Dest =
  | { anchor: string }
  | { room: RoomId }
  | { tile: Tile }
  | { near: CharId };

export interface GoOptions {
  style?: 'walk' | 'run' | 'panic';
  /** Called when they arrive (not called if interrupted). */
  then?: () => void;
  /** What they are doing, in plain words, for the UI: "going to confront Jim". */
  doing?: string;
}

export interface SayOptions {
  kind?: SpeechKind;
  emotion?: EmotionId;
  intensity?: number;
  act?: LineAct;
  to?: CharId | 'all' | null;
  /** Do not add it to the feed (for throwaway reflex barks). */
  quiet?: boolean;
}

/** A job someone walks to and performs (putting out a fire, resetting the power). */
export interface TaskSpec {
  at: Dest;
  /** Seconds of work once there. */
  seconds: number;
  anim: AnimId;
  prop?: HeldProp;
  style?: 'walk' | 'run';
  doing: string;
}

/** Ask the director for a scene. It decides when the model is free. */
export interface SceneAsk {
  /** Who speaks (1-4). If omitted, the director picks from `room`. */
  people?: CharId[];
  room?: RoomId;
  trigger: SceneTrigger;
  /** One plain sentence: what set this off. */
  why: string;
  /** 0 background chatter .. 10 the player just did this. */
  priority: number;
  minLines?: number;
  maxLines?: number;
  /** Drop the request if it has not started within this many seconds. */
  staleAfter?: number;
}

export interface SimApi {
  readonly bus: GameBus;
  /** Sim seconds since the save began. */
  readonly time: number;
  readonly day: number;
  /** Minutes since midnight. */
  readonly clock: number;
  /** 0..100 */
  readonly chaos: number;
  /** Deterministic-ish random in [0, 1). */
  rng(): number;

  // ── people: reading ──
  people(): readonly SimPerson[];
  person(id: CharId): SimPerson | undefined;
  peopleIn(room: RoomId): SimPerson[];
  /** People within `radius` px of a point. */
  peopleNear(x: number, y: number, radius: number): SimPerson[];
  /** -100..100 how `who` feels about `about`. */
  bond(who: CharId, about: CharId): number;
  /** Plain words for a bond: "can't stand", "likes", "adores". */
  bondLabel(who: CharId, about: CharId): string;
  /** Best available person to fix a kind of problem, nearest first. */
  findFixer(skill: FixSkill, near: Vec): CharId | null;

  // ── people: puppeteering ──
  /** Speak a line: bubble, voice blips, feed entry, mouth movement. Returns the Speech (for its duration). */
  say(who: CharId, text: string, opts?: SayOptions): Speech;
  /** An instant reflex line from the written bank. */
  bark(who: CharId, kind: BarkKind): void;
  chaosBark(who: CharId, chaos: ChaosId): void;
  emote(who: CharId, icon: EmoteIcon): void;
  /** Set what they visibly feel. Fades back to their resting mood after holdSec. */
  feel(who: CharId, emotion: EmotionId, intensity: number, holdSec?: number): void;
  /** Play a short reaction, then carry on with what they were doing. */
  react(who: CharId, anim: AnimId, seconds: number, opts?: { face?: Dir }): void;
  face(who: CharId, toward: CharId | Vec): void;
  /** Drop whatever they are doing and go somewhere. */
  goTo(who: CharId, dest: Dest, opts?: GoOptions): void;
  /** Run out of a room to somewhere safer. */
  fleeFrom(who: CharId, room: RoomId): void;
  /** Leave the building for the pavement outside. */
  evacuate(who: CharId): void;
  /** Back to their normal routine. */
  resume(who: CharId): void;
  /** Send someone to do a job. `done` runs when the work is finished. */
  assign(who: CharId, task: TaskSpec, done?: () => void): void;
  /**
   * Take over a person completely under a named key (asleep, frozen, dancing,
   * abducted ...). They do nothing else until release() with the same key.
   */
  seize(who: CharId, key: string, pose: { anim: AnimId; seated?: boolean; variant?: number; doing: string }): void;
  release(who: CharId, key: string): void;
  isSeized(who: CharId): boolean;
  addStatus(who: CharId, kind: StatusKind, seconds: number, target?: CharId): void;
  removeStatus(who: CharId, kind: StatusKind): void;
  hasStatus(who: CharId, kind: StatusKind): boolean;
  setPlan(who: CharId, plan: Plan | null): void;
  setThought(who: CharId, thought: string): void;
  setProp(who: CharId, prop: HeldProp | null): void;
  setHeadgear(who: CharId, gear: Headgear | null): void;
  /** Move instantly to a tile. */
  teleport(who: CharId, tile: Tile): void;
  /** Throw across the floor with a velocity (px/second) and an upward kick; they land and get up. */
  launch(who: CharId, vx: number, vy: number, up: number): void;
  /** Directly place a seized person at a world position and height (saucer beam, floating). */
  place(who: CharId, x: number, y: number, lift: number): void;

  // ── the office ──
  addEffect(e: EffectInstance): void;
  /** Change fields of an existing effect. */
  patchEffect(id: string, patch: Record<string, unknown>): void;
  removeEffect(id: string): void;
  /** Make tiles impassable under a key (a jammed door, a fire); null clears the key. */
  setBlocked(key: string, tiles: Tile[] | null): void;
  fx(cue: FxCue): void;
  sfx(id: SfxId, x?: number): void;
  loop(id: LoopId, on: boolean): void;
  shake(power: number, ms: number): void;
  spawnVisitor(id: string, at: Dest): void;
  removeVisitor(id: string): void;

  // ── story ──
  /** A plain line in the feed. */
  narrate(text: string, opts?: { icon?: string; room?: RoomId; kind?: FeedKind }): void;
  /** Add a memory to people: a list of ids, everyone in a room, or 'all'. */
  remember(who: CharId[] | RoomId | 'all', text: string): void;
  /** Change how `who` feels about `about` by delta (-100..100 scale). */
  shiftBond(who: CharId, about: CharId, delta: number, why?: string): void;
  bumpChaos(amount: number): void;
  bumpMood(who: CharId | 'all', amount: number): void;
  /** A true statement for prompts while `key` is set: "The break room is on fire." */
  setFact(key: string, text: string | null): void;
  /** Count an incident (resets the "days without incident" count). */
  incident(): void;
  /** Reveal someone's secret to the player (and note that the office knows). */
  revealSecret(who: CastId): void;
  requestScene(ask: SceneAsk): void;
}

// ── Chaos events plug into the sim like this ─────────────────────────────────

export interface ChaosRun {
  /** Advance by dt seconds. */
  update(dt: number): void;
  /** True once finished; the sim then calls end() and drops it. */
  readonly done: boolean;
  /** Tidy up: remove effects, release people. Must be safe to call at any time. */
  end(): void;
  /** Short label for the UI: "Fire in the break room". */
  readonly label: string;
  readonly room: RoomId | null;
}

export interface ChaosScript {
  id: ChaosId;
  /** Return a plain reason if it cannot start right now, else null. */
  blocked?(sim: SimApi, target: ChaosTarget): string | null;
  start(sim: SimApi, target: ChaosTarget): ChaosRun;
}
