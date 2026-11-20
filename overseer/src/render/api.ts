// Contracts between the simulation and the three renderers.
//
//   sim ──RenderFrame──▶ stage ──▶ BuildingView   (render/building)
//                              ──▶ CharacterView  (render/characters), one per person
//                              ──▶ FxView         (render/fx)
//
// The sim knows nothing about Pixi. Each view knows nothing about the sim: it
// only draws what the state structures below say. The stage (render/stage.ts)
// owns the Pixi Application, the camera and the layer order, and calls the
// views every frame.
//
// LAYER ORDER, bottom to top (the stage assembles this):
//   building.sky        sky, sun/moon, clouds, skyline, street, alley
//   building.back       back walls, windows, wall props, furniture against the wall, lift interior
//   [people, layer 'lift']   riders standing inside the lift car
//   building.liftDoors  the sliding lift doors and their frames
//   fx.behind           things behind people (ghost, beams, floor decals, puddles)
//   [people, layer 'back']   seated at a desk / behind the meeting table
//   building.mid        furniture FRONTS that hide seated people's legs
//   [people, layer 'front']  everyone walking or standing
//   fx.front            fire, water, smoke, particles, creatures
//   building.front      the cutaway frame: wall and slab edges, roof parapet, foreground
//   fx.overlay          darkness, tints, UFO, lightning (world space)
//   [people, layer 'top']    held by the player, beamed up, flung through the air
//   fx.screen           full-screen flashes (screen space, not moved by the camera)

import type { Container, Renderer } from 'pixi.js';
import type {
  AnimId, CharId, EmotionId, Facing, FloorIndex, Headgear, HeldProp, RoomId, Speech, StatusKind, Vec
} from '@/core/types';
import type { CharacterLook } from '@/core/look';

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

export type PersonLayer = 'lift' | 'back' | 'front' | 'top';

/** Everything the rig needs to draw one person this frame. Written by the sim. */
export interface CharacterRenderState {
  id: CharId;
  /** Feet position, world units (y is the floor baseline unless airborne). */
  x: number;
  y: number;
  /** Depth lane, -1 (far) .. 1 (near). The stage sorts by it and nudges y by z * 5. */
  z: number;
  layer: PersonLayer;
  facing: Facing;
  anim: AnimId;
  /** Chooses a variation of an anim (dance move, idle fidget). Any integer. */
  variant: number;
  /** Legs folded on a seat (see world.SEAT_H). Works with most upper-body anims. */
  seated: boolean;
  /** Ground speed in units/second. Sets the pace of walk / run cycles. */
  speed: number;
  /** Velocity in units/second, for swing, lag and tumble (held, fall, float). */
  vx: number;
  vy: number;
  emotion: EmotionId;
  /** 0..1 strength of the emotion. */
  intensity: number;
  /** Mouth moves as if speaking. */
  talking: boolean;
  /** World point the eyes (and a little of the head) track. null = straight ahead. */
  lookAt: Vec | null;
  /** 1 = normal. The sim animates this (tiny ~0.42, giant ~1.6). */
  scale: number;
  /** 0..1 opacity (fading through a door). */
  alpha: number;
  visible: boolean;
  prop: HeldProp | null;
  headgear: Headgear | null;
  /** Conditions currently on them. The rig shows wet / sooty / frizzy / asleep on the body. */
  statuses: readonly StatusKind[];
  /** The player has this person selected. */
  selected: boolean;
}

/**
 * One drawn, animated person. Implemented in render/characters.
 * `container` has its origin at the FEET; the figure extends upward (negative y)
 * about CHAR_H * look.build.height units at scale 1. The stage sets nothing on
 * the container except its parent: update() places and poses it.
 */
export interface CharacterView {
  readonly id: CharId;
  readonly container: Container;
  /** Advance animation by dt seconds and apply the state. Call every frame. */
  update(dt: number, state: CharacterRenderState): void;
  /** Top of the head in the container's PARENT space (for speech bubbles, emotes). */
  headTop(): Vec;
  /** Centre of the chest in parent space (for auras, beams, hit tests). */
  chest(): Vec;
  /** Tip of the free hand in parent space (rarely needed; for held-prop effects). */
  hand(): Vec;
  /** Rough hit box in parent space: {x, y} is the top-left. */
  hitBox(): { x: number; y: number; w: number; h: number };
  destroy(): void;
}

/** Factory exported by render/characters/index.ts. */
export type CreateCharacterView = (id: CharId, look: CharacterLook) => CharacterView;

/**
 * Head-and-shoulders portrait for the UI, as a data URL (PNG, transparent
 * background, `size` x `size` CSS pixels at 2x density).
 * Exported by render/characters/index.ts.
 */
export type RenderPortrait = (
  renderer: Renderer, look: CharacterLook, emotion: EmotionId, size: number
) => Promise<string>;

// ─────────────────────────────────────────────────────────────────────────────
// The building
// ─────────────────────────────────────────────────────────────────────────────

/** Dynamic state of the building and its props. Written by the sim. */
export interface EnvState {
  /** Hour of the day, 0..24 (9.5 = 09:30). Drives sky, sun, window light, lamps. */
  hour: number;
  /** Light level per room, 0 (pitch dark) .. 1 (lights on). Missing = 1. */
  light: Partial<Record<RoomId, number>>;
  /** Fire alarm beacons are flashing. */
  alarm: boolean;
  lift: {
    /** Where the car is, as a floor number that glides between stops (0..2). */
    floor: number;
    /** How open the doors are on each floor, 0 closed .. 1 open. */
    doors: [number, number, number];
    /** -1 going down, 1 going up, 0 idle. */
    arrow: -1 | 0 | 1;
    stuck: boolean;
    /** Car light on (off during a blackout). */
    lit: boolean;
  };
  /** How open each ordinary door is, 0..1, by anchor id (door.entrance, door.wc, door.closet, stairs.L0 ...). */
  doors: Record<string, number>;
  /** State of each stateful prop (see world.PROP_STATES and MONITOR_STATES). Missing = first state. */
  props: Record<string, string>;
  /** Number shown on the "DAYS WITHOUT INCIDENT" board in the lobby. */
  incidentFreeDays: number;
  /** Bar heights 0..1 on the sales leaderboard. */
  salesBoard: { marcus: number; rosa: number };
  /** 0..1: hanging lamps swing, pictures tilt, things rattle. */
  shake: number;
  /** Time is frozen: clock hands, fans and screens stop. */
  frozen: boolean;
}

/**
 * The drawn building. Implemented in render/building.
 * All containers are in WORLD space (same coordinates as core/world.ts).
 */
export interface BuildingView {
  readonly sky: Container;
  readonly back: Container;
  readonly liftDoors: Container;
  readonly mid: Container;
  readonly front: Container;
  update(dt: number, env: EnvState, time: number): void;
  /** The visible world rectangle changed (for parallax and culling). Optional to use. */
  setView(view: ViewRect): void;
  destroy(): void;
}

export type CreateBuildingView = () => BuildingView;

export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Screen pixels per world unit. */
  zoom: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Effects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A lasting effect in the world. The sim keeps a list of these and changes
 * their numbers over time; the FX view makes each one look good and animates
 * the detail (flames flicker, water ripples) by itself. Removing an instance
 * from the list ends it (with a short fade where that looks better).
 */
export type EffectInstance =
  /** Flames at a spot. size 0..1 (1 = a third of a room). */
  | { id: string; kind: 'fire'; room: RoomId; x: number; y: number; size: number }
  /** Smoke filling the top of a room. */
  | { id: string; kind: 'smoke'; room: RoomId; density: number }
  /** Ceiling sprinklers raining into a room. */
  | { id: string; kind: 'sprinklers'; room: RoomId }
  /** Water. level 0..1 (1 = knee deep, about 42 units). A jet sprays from the ceiling at leakX while spraying. */
  | { id: string; kind: 'flood'; room: RoomId; level: number; leakX: number; spraying: boolean }
  /** Darkness over rooms. level 0..1. emergency = dim red emergency lighting. */
  | { id: string; kind: 'dark'; rooms: RoomId[] | 'all'; level: number; emergency: boolean }
  /** A soft pool of light that cuts through 'dark' (phone torch, emergency lamp). */
  | { id: string; kind: 'light'; x: number; y: number; radius: number; color: number }
  /** Strobing red alarm light in every room. */
  | { id: string; kind: 'alarm' }
  /** Dust falling from ceilings, things rattling. power 0..1. (Camera shake is separate.) */
  | { id: string; kind: 'quake'; power: number }
  /** Sheets of paper shooting out from a point. power 0..1. */
  | { id: string; kind: 'paperStorm'; room: RoomId; x: number; y: number; power: number }
  /** The flying saucer. beam 0..1 is the tractor beam, reaching down to beamToY. */
  | { id: string; kind: 'ufo'; x: number; y: number; beam: number; beamToY: number }
  /** A ghost. alpha 0..1. */
  | { id: string; kind: 'ghost'; x: number; y: number; facing: Facing; alpha: number; mood: 'drift' | 'boo' | 'sad' }
  /** A small animal. */
  | { id: string; kind: 'creature'; species: 'raccoon' | 'puppy' | 'pigeon'; x: number; y: number; facing: Facing; anim: 'idle' | 'run' | 'sit' | 'eat' | 'jump' | 'fly' | 'happy'; carrying: boolean }
  /** A swarm of bees around a point. */
  | { id: string; kind: 'bees'; x: number; y: number; spread: number; count: number }
  /** Mirror balls and sweeping coloured lights in every room. level 0..1. */
  | { id: string; kind: 'disco'; level: number }
  /** Things falling from a room's ceiling. rate 0..1. */
  | { id: string; kind: 'rain'; room: RoomId; what: 'cash' | 'confetti' | 'paper' | 'water'; rate: number }
  /** Balloons bobbing against a room's ceiling. */
  | { id: string; kind: 'balloons'; room: RoomId; count: number }
  /** A thing that has appeared on the floor. */
  | { id: string; kind: 'item'; item: 'pizzaBoxes' | 'cake' | 'gift' | 'cashPile' | 'puddle' | 'scorch' | 'paperPile' | 'wetFloorSign' | 'foam'; x: number; y: number }
  /** Something summoned by a free-text event, drawn as a big emoji. */
  | { id: string; kind: 'emoji'; emoji: string; x: number; y: number; size: number; bob: boolean; facing: Facing }
  /** Time is stopped: cool tint, hanging sparkles. level 0..1. */
  | { id: string; kind: 'timeFreeze'; level: number }
  /** No gravity: drifting dust and small objects everywhere. level 0..1. */
  | { id: string; kind: 'zeroG'; level: number }
  /** Sparks and flicker at the lift doors on a floor. */
  | { id: string; kind: 'liftSparks'; floor: FloorIndex }
  /** A glowing beam between two points (shrink ray, mind-swap link). */
  | { id: string; kind: 'beam'; from: Vec; to: Vec; color: number; width: number }
  /** A cloud hanging at a spot: 'stink' green fumes, 'magic' sparkles, 'gloom' dark mist, 'steam'. */
  | { id: string; kind: 'cloud'; what: 'stink' | 'magic' | 'gloom' | 'steam'; x: number; y: number; radius: number };

export type EffectKind = EffectInstance['kind'];

export type EmoteIcon =
  | 'alert' | 'question' | 'dots' | 'heart' | 'brokenHeart' | 'anger' | 'sweat' | 'idea' | 'music'
  | 'zzz' | 'skull' | 'star' | 'eye' | 'money' | 'no' | 'yes' | 'laugh' | 'tear' | 'fire' | 'coffee' | 'clip';

export type BurstKind =
  | 'confetti' | 'hearts' | 'stars' | 'cash' | 'paper' | 'feathers' | 'bubbles' | 'leaves' | 'notes'
  | 'sweat' | 'tears' | 'anger' | 'zzz' | 'skulls' | 'sparkles' | 'dust' | 'crumbs' | 'water';

/** A one-shot effect. Fire and forget. */
export type FxCue =
  | { kind: 'lightning'; x: number; yTop: number; yBottom: number }
  | { kind: 'flash'; color: number; alpha: number; ms: number }
  | { kind: 'explosion'; x: number; y: number; size: number }
  | { kind: 'poof'; x: number; y: number; color?: number }
  | { kind: 'splash'; x: number; y: number }
  | { kind: 'sparks'; x: number; y: number }
  | { kind: 'impact'; x: number; y: number; power: number }
  | { kind: 'burst'; what: BurstKind; x: number; y: number; count?: number }
  | { kind: 'emote'; who: CharId; icon: EmoteIcon }
  | { kind: 'floatText'; x: number; y: number; text: string; color: number }
  | { kind: 'ring'; x: number; y: number; color: number }
  | { kind: 'swirl'; x: number; y: number; color: number }
  | { kind: 'zap'; from: Vec; to: Vec; color: number };

/** What the FX view is told about people each frame (for auras and emotes). */
export interface FxPerson {
  id: CharId;
  /** Chest position and head-top y, world units. */
  x: number;
  y: number;
  headY: number;
  scale: number;
  visible: boolean;
  statuses: readonly StatusKind[];
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

/** Implemented in render/fx. `behind`, `front`, `overlay` are world space; `screen` is screen space. */
export interface FxView {
  readonly behind: Container;
  readonly front: Container;
  readonly overlay: Container;
  readonly screen: Container;
  /** Make the lasting effects match this list (add new ids, update, fade out missing ones). */
  sync(effects: readonly EffectInstance[]): void;
  cue(c: FxCue): void;
  update(dt: number, frame: FxFrame): void;
  /** Remove everything at once (new day, reset). */
  clear(): void;
  destroy(): void;
}

export type CreateFxView = (renderer: Renderer) => FxView;

// ─────────────────────────────────────────────────────────────────────────────
// One frame of the world, as the sim hands it to the stage
// ─────────────────────────────────────────────────────────────────────────────

export interface RenderFrame {
  /** Sim seconds. */
  time: number;
  people: readonly CharacterRenderState[];
  env: EnvState;
  effects: readonly EffectInstance[];
  /** Lines currently over people's heads. */
  speeches: readonly Speech[];
}
