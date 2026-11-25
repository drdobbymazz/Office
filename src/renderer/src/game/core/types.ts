// Shared vocabulary for the office game.
// Pure types and tiny constants only: no DOM, no Pixi, no imports from other layers.
// The sim, the brain, the floor renderer, the audio and the UI all speak in these terms.

export interface Vec {
  x: number;
  y: number;
}

/** A cell of the office map (16 x 16 px). */
export interface Tile {
  x: number;
  y: number;
}

/** Which way a person faces on the top-down floor. 'down' faces the viewer. */
export type Dir = 'up' | 'down' | 'left' | 'right';

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

/** The staff. Same names as OfficeCharacterName in scene/office/cast.ts. */
export const CAST_IDS = [
  'michael', 'jim', 'pam', 'dwight', 'kevin', 'angela', 'oscar', 'stanley',
  'phyllis', 'andy', 'kelly', 'ryan', 'toby', 'creed', 'meredith'
] as const;
export type CastId = (typeof CAST_IDS)[number];

/** Anyone on the floor: a cast member, or a visitor such as "visitor:inspector". */
export type CharId = string;

export function isCastId(id: string): id is CastId {
  return (CAST_IDS as readonly string[]).includes(id);
}

/**
 * What a person is feeling. Chosen by the language model for every line, shown
 * on the pixel face, in how the sprite moves, and in the UI. `intensity` (0..1)
 * scales it: sad at 0.9 is tears, angry at 0.9 is a red face and stomping.
 */
export const EMOTIONS = [
  'neutral', 'happy', 'excited', 'amused', 'smug', 'love', 'sad', 'angry', 'scared',
  'surprised', 'confused', 'embarrassed', 'disgusted', 'bored', 'tired', 'suspicious',
  'nervous', 'proud', 'mischievous', 'determined'
] as const;
export type EmotionId = (typeof EMOTIONS)[number];

/**
 * What a person's body is doing. The sim picks one; the sprite shows it with
 * pixel frames (arms, legs, face) plus smooth motion (bob, hop, shake, tilt).
 * `seated` in PersonState is a separate flag.
 */
export const ANIMS = [
  // moving about (cycle speed follows PersonState.speed)
  'idle', 'walk', 'run', 'panic',
  // work and props
  'type', 'phone', 'drink', 'eat', 'operate', 'carry', 'mop', 'extinguish',
  // social
  'talk', 'laugh', 'cry', 'cheer', 'wave', 'point', 'shrug', 'facepalm', 'think', 'nod', 'shake',
  // reactions
  'cower', 'startle', 'shiver', 'stomp', 'dizzy',
  // states
  'sleep', 'lie', 'float', 'held', 'fall', 'land', 'zapped', 'frozen', 'dance', 'beamUp',
  // expressive, spicy & physical stunts
  'strip', 'kiss', 'makeOut', 'lapDance', 'grinding', 'spank', 'selfTouch', 'seduce',
  'twerk', 'backflip', 'kneel', 'flex',
  'whip', 'tieUp', 'worship', 'dominate', 'lick', 'peep', 'tableDance'
] as const;
export type AnimId = (typeof ANIMS)[number];

/** Something carried. Drawn as a tiny pixel object by the sprite. */
export type HeldProp =
  | 'coffee' | 'phone' | 'papers' | 'clipboard' | 'box' | 'trophy'
  | 'extinguisher' | 'mop' | 'wrench' | 'flashlight' | 'net'
  | 'pizza' | 'donut' | 'cake' | 'cash' | 'balloon'
  | 'case' | 'tape';

/** Something worn on the head. Drawn by the sprite. */
export type Headgear = 'crown' | 'partyHat' | 'tinfoil';

/**
 * A temporary condition on a person. Drives prompts ("is soaking wet"), marks
 * on the sprite (wet, sooty, frizzy), and small floating effects (hearts, Zzz).
 */
export type StatusKind =
  | 'love'        // smitten with `target`
  | 'rage'        // furious at `target`
  | 'truth'       // cannot lie
  | 'paranoid'    // sure they are being watched
  | 'caffeinated' // far too much espresso
  | 'sleepy' | 'asleep'
  | 'tiny' | 'giant'
  | 'swapped'     // mind swapped with `target`
  | 'crowned'     // boss for a day
  | 'party'       // birthday person
  | 'rich'        // grabbed bonus cash
  | 'spooked'     // saw the ghost
  | 'abducted'    // aboard, or just back from, the saucer
  | 'stung'
  | 'dizzy'
  | 'wet' | 'sooty' | 'frizzy'
  | 'frozen'      // time is stopped for them
  | 'knockedOut'  // out cold on the floor
  | 'eliminated'  // taken out for the day
  | 'guilty'      // took someone out and everyone saw
  | 'quit'        // walked out for the day
  | 'naked'         // stripped down: the body renders uncensored in the skin palette
  | 'censored'      // legacy status kind, kept for saves/UI badges: no overlay is drawn any more
  | 'flustered'     // blushing and rattled after a bold romantic moment
  | 'aroused'       // visibly turned on with lowered inhibitions
  | 'afterglow'     // rumpled and glowing straight out of a hookup
  | 'scandal'       // center of juicy workplace romance/exposure gossip (past-tense)
  | 'bound'         // playfully cuffed/tied up in a power-play dare
  | 'dominated'     // submissive / worship power-play dare with `target`
  | 'blackmailed'   // squirming under compromising office dirt held by `target`
  | 'voyeur'        // caught peeping on scandalous office antics
  | 'exhibitionist'; // riding a shameless daredevil rush to show off / strip

export interface StatusEffect {
  kind: StatusKind;
  /** Sim time (seconds) when it wears off. Infinity = until removed. */
  until: number;
  /** The other person involved (love / rage / swapped). */
  target?: CharId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Places (see core/world.ts for where they are on the map)
// ─────────────────────────────────────────────────────────────────────────────

export type RoomId =
  | 'boss'      // Michael's office, top-left
  | 'meeting'   // the conference room, top middle
  | 'annex'     // the two desks between the conference room and accounting
  | 'accounts'  // the accounting corner, top-right (and the water cooler)
  | 'bullpen'   // the open-plan sales floor, two rows of desks, with the front door
  | 'kitchen'   // the break room, bottom-right: coffee, vending machine, fridge, cafe table
  | 'outside';  // the pavement beyond the front door

/** Rooms the player can aim an event at. */
export const TARGET_ROOMS = ['boss', 'meeting', 'annex', 'accounts', 'bullpen', 'kitchen'] as const satisfies readonly RoomId[];
export type TargetRoomId = (typeof TARGET_ROOMS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Overseer powers ("chaos")
// ─────────────────────────────────────────────────────────────────────────────

export const CHAOS_IDS = [
  // disasters
  'fire', 'flood', 'blackout', 'quake', 'fireDrill', 'lockIn', 'wifiDown', 'snackStorm',
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
  | 'event'     // something happened in the office, stated plainly
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
  /** Story narration worth showing on the floor as a caption, not only in the Log. */
  beat?: boolean;
  /** A story moment that needs the player: the game drops back to normal speed for it. */
  slow?: boolean;
}

/** A plan a person has formed (usually chosen by the model) and will act on. */
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
  'break',     // go somewhere quiet for a bit
  'hide',      // hide somewhere out of the way
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
  /** Optional custom relationship note written by the model. */
  note?: string;
}

/** A gesture attached to a spoken line. */
export const LINE_ACTS = [
  'none', 'laugh', 'cry', 'point', 'shrug', 'facepalm', 'cheer', 'wave', 'nod',
  'shake_head', 'stomp', 'cower', 'gasp', 'whisper', 'shout', 'step_closer', 'back_away',
  'storm_off', 'walk_off', 'flirt', 'flex', 'kneel', 'dance',
  'dominate', 'blush', 'peep', 'tease'
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
