// Shared vocabulary for the whole game.
// Pure types and tiny constants only. No imports from other layers, no DOM, no Pixi.
// Every module (sim, brain, render, audio, UI) speaks in these terms.

export interface Vec {
  x: number;
  y: number;
}

/** 1 = facing right, -1 = facing left. */
export type Facing = 1 | -1;

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

/** The ten staff of Clipwell Ltd. */
export const CAST_IDS = [
  'diane', 'marcus', 'rosa', 'tobi', 'priya', 'lena', 'nigel', 'bea', 'oleg', 'gus'
] as const;
export type CastId = (typeof CAST_IDS)[number];

/** Anyone on screen: a cast member, or a temporary visitor such as "visitor:inspector". */
export type CharId = string;

export function isCastId(id: string): id is CastId {
  return (CAST_IDS as readonly string[]).includes(id);
}

/**
 * What a person is feeling. Chosen by the LLM for every line, shown on the face,
 * in the body language, and in the UI. `intensity` (0..1) scales it everywhere:
 * sad at 0.9 means actual tears, angry at 0.9 means red face and steam.
 */
export const EMOTIONS = [
  'neutral', 'happy', 'excited', 'amused', 'smug', 'love', 'sad', 'angry', 'scared',
  'surprised', 'confused', 'embarrassed', 'disgusted', 'bored', 'tired', 'suspicious',
  'nervous', 'proud', 'mischievous', 'determined'
] as const;
export type EmotionId = (typeof EMOTIONS)[number];

/**
 * Body animation. The rig plays these; the sim picks them.
 * `seated` in CharacterRenderState is a separate flag, so most upper-body
 * animations (type, phone, talk, laugh, sleep ...) work standing or sitting.
 */
export const ANIMS = [
  // locomotion (cycle speed follows CharacterRenderState.speed)
  'idle', 'walk', 'run', 'panicRun', 'sneak',
  // work and props
  'type', 'write', 'phone', 'drink', 'eat', 'operate', 'carry', 'mop', 'extinguish',
  // social gestures
  'talk', 'listen', 'laugh', 'cry', 'cheer', 'clap', 'wave', 'point', 'shrug',
  'facepalm', 'think', 'nod', 'shakeHead', 'whisper', 'shout', 'bow',
  // reactions
  'cower', 'duck', 'swat', 'shiver', 'startle', 'gasp', 'stomp', 'dizzy',
  // states
  'sleep', 'lie', 'float', 'held', 'fall', 'land', 'zapped', 'frozen', 'dance', 'beamUp'
] as const;
export type AnimId = (typeof ANIMS)[number];

/** Something held in the hand. The rig draws it. */
export type HeldProp =
  | 'coffee' | 'phone' | 'papers' | 'clipboard' | 'laptop' | 'box' | 'trophy'
  | 'extinguisher' | 'mop' | 'wrench' | 'plunger' | 'flashlight' | 'net'
  | 'pizza' | 'donut' | 'cake' | 'cash' | 'balloon';

/** Something worn on the head on top of the normal look. The rig draws it. */
export type Headgear = 'crown' | 'partyHat' | 'tinfoil' | 'hardhat';

/**
 * A temporary condition on a person. Drives prompts ("is soaking wet"),
 * face/body overlays in the rig (wet, sooty, frizzy, tiny, giant), and
 * floating auras in the FX layer (love hearts, rage steam, Zzz ...).
 */
export type StatusKind =
  | 'love'        // smitten with data.target
  | 'rage'        // furious at data.target
  | 'truth'       // cannot lie
  | 'paranoid'    // convinced they are being watched
  | 'caffeinated' // far too much espresso
  | 'sleepy' | 'asleep'
  | 'tiny' | 'giant'
  | 'swapped'     // mind swapped with data.target
  | 'crowned'     // boss for a day
  | 'party'       // birthday person
  | 'rich'        // grabbed a pile of bonus cash
  | 'spooked'     // saw the ghost
  | 'abducted'    // currently aboard / just returned by the UFO
  | 'stung'
  | 'dizzy'
  | 'wet' | 'sooty' | 'frizzy'
  | 'frozen';     // time is stopped for them

export interface StatusEffect {
  kind: StatusKind;
  /** Sim time (seconds) when it wears off. Infinity = until removed. */
  until: number;
  /** Other person involved (love/rage/swapped). */
  target?: CharId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Places
// ─────────────────────────────────────────────────────────────────────────────

/** 0 = ground floor, 1 = first floor, 2 = roof. */
export type FloorIndex = 0 | 1 | 2;

export type RoomId =
  | 'street'                       // pavement outside the front door (floor 0, x < 0)
  | 'lobby' | 'sales' | 'ops' | 'copy'          // ground floor, left to right
  | 'boss' | 'meeting' | 'kitchen' | 'server'   // first floor, left to right
  | 'roof'
  | 'hall0' | 'hall1'              // the bit of corridor in front of the lift on each floor
  | 'lift';                        // inside the lift car

/** Rooms the player can aim an event at. */
export const TARGET_ROOMS = [
  'lobby', 'sales', 'ops', 'copy', 'boss', 'meeting', 'kitchen', 'server', 'roof'
] as const satisfies readonly RoomId[];
export type TargetRoomId = (typeof TARGET_ROOMS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Overseer powers ("chaos")
// ─────────────────────────────────────────────────────────────────────────────

export const CHAOS_IDS = [
  // disasters
  'fire', 'flood', 'blackout', 'quake', 'fireDrill', 'liftJam', 'wifiDown', 'printerRampage',
  // weird
  'ufo', 'ghost', 'zeroG', 'timeFreeze', 'smite', 'shrink', 'giant', 'bodySwap', 'disco', 'bees', 'raccoon',
  // treats
  'pizza', 'puppy', 'moneyRain', 'birthday', 'espresso',
  // mind games
  'love', 'rage', 'truth', 'sleep', 'paranoia', 'rumour', 'meeting', 'inspector', 'crown', 'secretLeak'
] as const;
export type ChaosId = (typeof CHAOS_IDS)[number];

export type ChaosCategory = 'disaster' | 'weird' | 'treat' | 'mind';

/** What the player must pick before the event can start. */
export type ChaosTargetKind = 'none' | 'room' | 'person' | 'pair';

export interface ChaosTarget {
  room?: TargetRoomId;
  /** The person (or the first of a pair: the one it happens TO). */
  who?: CharId;
  /** The second person of a pair (the one it is ABOUT). */
  other?: CharId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Things people say, and the log of what happened
// ─────────────────────────────────────────────────────────────────────────────

export type SpeechKind = 'say' | 'shout' | 'whisper' | 'think';

/** A line currently shown over someone's head. */
export interface Speech {
  /** Unique per utterance. */
  id: string;
  who: CharId;
  kind: SpeechKind;
  text: string;
  /** performance.now()-style ms timestamp when it started. */
  startedAt: number;
  /** Total ms the bubble should stay up (typing time + reading time). */
  durationMs: number;
  /** Characters per second for the typewriter reveal and voice blips. */
  cps: number;
}

export type FeedKind =
  | 'say'       // someone said something (who, text)
  | 'think'     // a private thought (who, text)
  | 'event'     // something happened in the world, stated plainly
  | 'overseer'  // something the player did
  | 'shift'     // a relationship changed
  | 'system';   // connection notices, day start/end

export interface FeedItem {
  id: string;
  day: number;
  /** Minutes since midnight in game time, e.g. 9 * 60 + 30. */
  clock: number;
  kind: FeedKind;
  who?: CharId;
  /** Second person involved (who they spoke to, who the shift is about). */
  other?: CharId;
  text: string;
  emotion?: EmotionId;
  room?: RoomId;
  /** Icon id from the UI icon set (e.g. the chaos id). */
  icon?: string;
}

/** A plan a person has formed (usually chosen by the LLM) and will act on. */
export const PLAN_KINDS = [
  'work',      // go back to the desk and work
  'talk',      // go and chat with target
  'confront',  // go and have it out with target
  'flirt',     // go and flirt with target
  'gossip',    // go and tell target something juicy
  'prank',     // go and prank target
  'comfort',   // go and cheer target up
  'coffee',    // get a coffee
  'snack',     // get food
  'break',     // go somewhere quiet for a bit (roof, sofa)
  'hide',      // hide in the loo or the supply closet
  'wander',    // stroll about and see what is going on
  'nap',       // sneak a nap
  'fix',       // go and deal with the problem (fire, flood, power ...)
  'flee',      // get away from here
  'snoop'      // go through target's desk while they are away
] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export interface Plan {
  kind: PlanKind;
  /** A person for social plans, a room for places; null when not needed. */
  target: CharId | RoomId | null;
  /** A few plain words on what it is about: "the missing stapler". */
  about: string;
}

/** How one person's feeling toward another changed. */
export const SHIFT_KINDS = [
  'likes_more', 'likes_less', 'trusts_more', 'trusts_less', 'admires', 'resents', 'fancies', 'fears'
] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];

export interface RelationShift {
  who: CharId;
  about: CharId;
  change: ShiftKind;
}

/** A gesture attached to a spoken line. */
export const LINE_ACTS = [
  'none', 'laugh', 'cry', 'point', 'shrug', 'facepalm', 'cheer', 'clap', 'wave', 'nod',
  'shake_head', 'stomp', 'cower', 'gasp', 'whisper', 'shout', 'step_closer', 'back_away',
  'storm_off', 'walk_off'
] as const;
export type LineAct = (typeof LINE_ACTS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers every layer can use
// ─────────────────────────────────────────────────────────────────────────────

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (v: number): number => clamp(v, 0, 1);

/** "09:30" from minutes since midnight. */
export function formatClock(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`;
}
