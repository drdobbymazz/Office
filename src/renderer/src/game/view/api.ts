// Contracts between the game logic and what is drawn on the office floor.
//
//   sim ──RenderFrame──▶ floor (scene/office/GameFloor) ──▶ ActorView  (scene/office/actor), one per person
//                                                       ──▶ FxView     (scene/office/fx)
//
// The office itself is the existing Tiled map drawn by TiledMapRenderer. The
// sim knows nothing about Pixi; the views know nothing about the sim: they only
// draw what these structures say.
//
// COORDINATES: world pixels on the map (a tile is 16 px; the map is 544 x 352,
// plus 64 px of pavement below it). x right, y down. A person's position is
// their FEET: the bottom-centre of the tile they stand on.
//
// DRAW ORDER, bottom to top (GameFloor assembles this):
//   map tile layers       floor, walls, furniture (existing art)
//   fx.floor              things lying on the floor: water, puddles, scorch marks, shadows, light pools
//   the sorted layer      people AND anything else that should overlap them correctly
//                         (fire, creatures, items, the ghost), ordered by y: a larger y is in front
//   fx.air                everything above: smoke, falling things, the saucer, darkness, tints, lightning
//   fx.screen             full-screen flashes (screen space, not moved by the camera)
// Speech bubbles are drawn by the UI, not here.

import type { Container, Renderer } from 'pixi.js';
import type {
  AnimId, CharId, Dir, EmotionId, Headgear, HeldProp, RoomId, Speech, StatusKind, Vec
} from '@/game/core/types';

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

/** Everything the sprite needs to draw one person this frame. Written by the sim. */
export interface PersonState {
  id: CharId;
  /** Which pixel character to draw: a cast name ('michael' ...) or a visitor id ('visitor:inspector'). */
  sprite: string;
  /** Feet position in world pixels. */
  x: number;
  y: number;
  /**
   * Height above the floor in pixels: picked up by the player, thrown, floating
   * in zero gravity, being beamed up. The body is drawn this much higher while
   * its shadow stays on the floor at (x, y).
   */
  lift: number;
  facing: Dir;
  anim: AnimId;
  /** Chooses a variation of an anim (dance move, idle fidget). Any integer. */
  variant: number;
  /** Sitting on a chair. The sprite tucks in and hides the legs, as the original game does. */
  seated: boolean;
  /** Ground speed in px/second: sets the pace of the walk cycle. */
  speed: number;
  /** Velocity in px/second, for swing and lean (held, thrown, panicking). */
  vx: number;
  vy: number;
  emotion: EmotionId;
  /** 0..1 strength of the emotion. */
  intensity: number;
  /** Mouth moves as if speaking. */
  talking: boolean;
  /** 1 = normal. The sim animates this (tiny about 0.45, giant about 1.7). */
  scale: number;
  /** 0..1 opacity. */
  alpha: number;
  visible: boolean;
  prop: HeldProp | null;
  headgear: Headgear | null;
  /** Conditions on them. The sprite shows wet / sooty / frizzy / asleep / dizzy on the body. */
  statuses: readonly StatusKind[];
  /** The player has this person selected. */
  selected: boolean;
}

/**
 * One drawn, animated person. Implemented in scene/office/actor.
 * `container` goes into the sorted layer; the view positions it and sets its
 * zIndex itself in update(). `shadow` goes into fx.floor's parent layer (the
 * floor passes it in) so shadows always sit under everyone.
 */
export interface ActorView {
  readonly id: CharId;
  readonly container: Container;
  /** A small soft shadow, positioned by update(); the floor adds it below the people. */
  readonly shadow: Container;
  /** Advance animation by dt seconds and apply the state. Call every frame. */
  update(dt: number, state: PersonState): void;
  /** Top of the head in world pixels (for speech bubbles and emotes). */
  headTop(): Vec;
  /** Middle of the body in world pixels. */
  chest(): Vec;
  /** Rough hit box in world pixels: {x, y} is the top-left. */
  hitBox(): { x: number; y: number; w: number; h: number };
  destroy(): void;
}

/** Exported by scene/office/actor/index.ts. */
export type CreateActorView = (id: CharId, sprite: string) => ActorView;

/**
 * Portrait of a person showing an emotion, as a PNG data URL, drawn in the
 * same pixel style as the existing cards. `scale` is the integer upscale of
 * the 18 x 28 portrait (3 -> 54 x 84 px). Exported by scene/office/actor/index.ts.
 */
export type PortraitUrl = (sprite: string, emotion: EmotionId, scale: number, naked?: boolean) => string;

// ─────────────────────────────────────────────────────────────────────────────
// Effects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A lasting effect in the office. The sim keeps a list of these and changes
 * their numbers over time; the FX view makes each one look good and animates
 * the detail itself (flames flicker, water ripples). Removing an instance from
 * the list ends it (with a short fade where that looks better).
 * All positions are world pixels; a room is its tile rectangle (core/world.ts).
 */
export type EffectInstance =
  /** Flames at a spot on the floor. size 0..1 (1 covers about three tiles). */
  | { id: string; kind: 'fire'; x: number; y: number; size: number }
  /** Smoke hanging over a room. density 0..1. */
  | { id: string; kind: 'smoke'; room: RoomId; density: number }
  /** Ceiling sprinklers raining into a room. */
  | { id: string; kind: 'sprinklers'; room: RoomId }
  /** Water covering a room's floor. level 0..1 (1 = ankle deep, clearly visible). spoutX/Y is where it gushes from while spraying. */
  | { id: string; kind: 'flood'; room: RoomId; level: number; spoutX: number; spoutY: number; spraying: boolean }
  /** Darkness over rooms. level 0..1. emergency = dim red emergency lighting. */
  | { id: string; kind: 'dark'; rooms: RoomId[] | 'all'; level: number; emergency: boolean }
  /** A soft pool of light that cuts through 'dark' (phone torch, a screen, an emergency lamp). */
  | { id: string; kind: 'light'; x: number; y: number; radius: number; color: number }
  /** Strobing red alarm light over the whole office. */
  | { id: string; kind: 'alarm' }
  /** Dust and bits falling, things rattling. power 0..1. (Camera shake is separate.) */
  | { id: string; kind: 'quake'; power: number }
  /** Things spraying out from a point: paper, snacks, cash, water. power 0..1. */
  | { id: string; kind: 'spray'; what: 'paper' | 'snacks' | 'cash' | 'water' | 'confetti'; x: number; y: number; power: number }
  /** The flying saucer hovering over (x, y) on the floor at `height` px, with a tractor beam of strength beam 0..1. */
  | { id: string; kind: 'ufo'; x: number; y: number; height: number; beam: number }
  /** A ghost. alpha 0..1. */
  | { id: string; kind: 'ghost'; x: number; y: number; facing: Dir; alpha: number; mood: 'drift' | 'boo' | 'sad' }
  /** A small animal or custom wandering creature. */
  | {
      id: string;
      kind: 'creature';
      species: 'raccoon' | 'puppy' | 'pigeon' | 'bear' | 'horse' | 'dragon' | 'cat' | 'dino' | 'robot' | 'alien' | 'shark';
      x: number;
      y: number;
      facing: Dir;
      anim: 'idle' | 'run' | 'sit' | 'eat' | 'jump' | 'fly' | 'happy';
      carrying: boolean;
    }
  /** A swarm of bees around a point. */
  | { id: string; kind: 'bees'; x: number; y: number; spread: number; count: number }
  /** Mirror-ball spots sweeping the whole floor, coloured floor lights, a darker wash. level 0..1. */
  | { id: string; kind: 'disco'; level: number }
  /** Things falling into a room from above. rate 0..1. */
  | { id: string; kind: 'rain'; room: RoomId; what: 'cash' | 'confetti' | 'paper'; rate: number }
  /** Balloons bobbing about a room. */
  | { id: string; kind: 'balloons'; room: RoomId; count: number }
  /** A thing that has appeared on the floor. */
  | { id: string; kind: 'item'; item: 'pizzaBoxes' | 'cake' | 'gift' | 'cashPile' | 'puddle' | 'scorch' | 'paperPile' | 'wetFloorSign' | 'foam' | 'snackPile' | 'chalkOutline' | 'scuffle' | 'brokenParts' | 'briefcase'; x: number; y: number }
  /** Something summoned by a free-text event, drawn as a big emoji standing on the floor. */
  | { id: string; kind: 'emoji'; emoji: string; x: number; y: number; size: number; bob: boolean; /** Pixels above the ground (no shadow): a badge over someone's head. */ lift?: number }
  /** Time is stopped: a cool tint and hanging sparkles. level 0..1. */
  | { id: string; kind: 'timeFreeze'; level: number }
  /** No gravity: drifting dust and small office objects. level 0..1. */
  | { id: string; kind: 'zeroG'; level: number }
  /** A glowing beam between two points (shrink ray, mind-swap link). */
  | { id: string; kind: 'beam'; from: Vec; to: Vec; color: number; width: number }
  /** A cloud hanging at a spot: 'stink' green fumes, 'magic' sparkles, 'gloom' dark mist, 'steam'. */
  | { id: string; kind: 'cloud'; what: 'stink' | 'magic' | 'gloom' | 'steam'; x: number; y: number; radius: number }
  /** A shutter or jammed door across a gap, w x h px, top-left at (x, y). */
  | { id: string; kind: 'barrier'; x: number; y: number; w: number; h: number }
  /** Marks over every desk monitor: 'off' dark screens, 'nosignal' a little crossed-out wifi sign. `at` = screen centres. */
  | { id: string; kind: 'screens'; state: 'off' | 'nosignal'; at: Vec[] }
  /** The light of the time of day over the whole map. hour 0..24. */
  | { id: string; kind: 'daylight'; hour: number };

export type EffectKind = EffectInstance['kind'];

export type EmoteIcon =
  | 'alert' | 'question' | 'dots' | 'heart' | 'brokenHeart' | 'anger' | 'sweat' | 'idea' | 'music'
  | 'zzz' | 'skull' | 'star' | 'eye' | 'money' | 'no' | 'yes' | 'laugh' | 'tear' | 'fire' | 'coffee' | 'paper';

export type BurstKind =
  | 'confetti' | 'hearts' | 'stars' | 'cash' | 'paper' | 'feathers' | 'bubbles' | 'notes'
  | 'sweat' | 'tears' | 'anger' | 'zzz' | 'skulls' | 'sparkles' | 'dust' | 'crumbs' | 'water' | 'snacks' | 'clothes';

/** A one-shot effect. Fire and forget. Positions are world pixels. */
export type FxCue =
  /** A bolt from the top of the map down to (x, y). */
  | { kind: 'lightning'; x: number; y: number }
  | { kind: 'flash'; color: number; alpha: number; ms: number }
  | { kind: 'explosion'; x: number; y: number; size: number }
  | { kind: 'poof'; x: number; y: number; color?: number }
  | { kind: 'splash'; x: number; y: number }
  | { kind: 'sparks'; x: number; y: number }
  | { kind: 'impact'; x: number; y: number; power: number }
  | { kind: 'burst'; what: BurstKind; x: number; y: number; count?: number }
  /** An icon that pops above a person's head and floats away. */
  | { kind: 'emote'; who: CharId; icon: EmoteIcon }
  | { kind: 'floatText'; x: number; y: number; text: string; color: number }
  | { kind: 'ring'; x: number; y: number; color: number }
  | { kind: 'swirl'; x: number; y: number; color: number }
  | { kind: 'zap'; from: Vec; to: Vec; color: number };

/** What the FX view is told about people each frame (for emotes and status effects). */
export interface FxPerson {
  id: CharId;
  /** Feet position and top-of-head y, world pixels. */
  x: number;
  y: number;
  headY: number;
  scale: number;
  visible: boolean;
  statuses: readonly StatusKind[];
}

export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Screen pixels per world pixel. */
  zoom: number;
}

export interface FxFrame {
  /** Seconds since start, already scaled by game speed. */
  time: number;
  people: readonly FxPerson[];
  view: ViewRect;
  /** Screen size in CSS pixels. */
  screenW: number;
  screenH: number;
}

/**
 * Implemented in scene/office/fx. `floor` and `air` are world space; `screen`
 * is screen space. Things that must overlap people correctly are added by the
 * FX view directly to the `sorted` container it is given (set each child's
 * zIndex to its floor y).
 */
export interface FxView {
  readonly floor: Container;
  readonly air: Container;
  readonly screen: Container;
  /** Make the lasting effects match this list (add new ids, update, fade out missing ones). */
  sync(effects: readonly EffectInstance[]): void;
  cue(c: FxCue): void;
  update(dt: number, frame: FxFrame): void;
  /** Remove everything at once (new day, reset). */
  clear(): void;
  destroy(): void;
}

export type CreateFxView = (renderer: Renderer, sorted: Container) => FxView;

// ─────────────────────────────────────────────────────────────────────────────
// One frame of the office, as the sim hands it to the floor
// ─────────────────────────────────────────────────────────────────────────────

export interface RenderFrame {
  /** Sim seconds. */
  time: number;
  people: readonly PersonState[];
  effects: readonly EffectInstance[];
  /** Lines currently over people's heads. */
  speeches: readonly Speech[];
  /** Time is frozen (the floor stops ambient animation). */
  frozen: boolean;
}
