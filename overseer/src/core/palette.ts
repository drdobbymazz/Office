// Art direction in numbers. Every renderer and the UI take their colours from
// here so the game reads as one piece of work.
//
// THE LOOK
// - A cosy, slightly toy-like cutaway office. Flat shapes, soft gradients,
//   rounded corners, no textures, no pixel art, no photo-realism.
// - PEOPLE and things you can interact with: saturated colours, a dark warm
//   OUTLINE (INK), a soft contact shadow under the feet. They must pop.
// - THE BUILDING and furniture: muted, lower contrast, NO outlines (shapes are
//   separated by value, with a slightly darker edge or inner shadow at most).
//   Each room has its own wall colour so you always know where you are.
// - Light comes from the top-left. Highlights are subtle lighter shapes, shade
//   is a darker shape of the same hue (never plain black or grey).
// - UI: deep indigo-charcoal panels, chunky rounded shapes, thick outlines,
//   pressable "3D" buttons, big icons. Jewel tones, not candy colours.

import type { ChaosCategory, RoomId } from './types';

/** Outline colour for characters and interactive props (never pure black). */
export const INK = 0x2a2140;
/** Outline width in world units for characters at scale 1. */
export const OUTLINE = 3;

export const SKY = {
  // gradient stops [top, bottom] per time of day; blend between them
  dawn: [0x7a6fd0, 0xffb58a] as const,
  day: [0x4aa8ff, 0xbfe6ff] as const,
  dusk: [0x4b3f9e, 0xff8f6b] as const,
  night: [0x0d1030, 0x2a2f6b] as const
};

export interface RoomColors {
  /** Back wall, main colour. */
  wall: number;
  /** Lower part of the wall (wainscot / skirting band). */
  wallLow: number;
  /** Floor surface (seen as a thin band; also carpet tint). */
  floor: number;
  /** Trim, shelves, accents. */
  accent: number;
}

export const ROOM_COLORS: Record<Exclude<RoomId, 'street' | 'lift'>, RoomColors> = {
  lobby: { wall: 0x9ed2cb, wallLow: 0x7fbab3, floor: 0xd9c7a8, accent: 0x2f8f88 },
  sales: { wall: 0xf2c9a0, wallLow: 0xe0ad80, floor: 0x8fa3b8, accent: 0xd9713a },
  hall0: { wall: 0xd8d4e2, wallLow: 0xbcb6cc, floor: 0xb9b2a6, accent: 0x7a7391 },
  ops: { wall: 0xb9d3f0, wallLow: 0x9bbce0, floor: 0x8fa3b8, accent: 0x3f76b8 },
  copy: { wall: 0xd9d2c5, wallLow: 0xc2b9a8, floor: 0xa59c8e, accent: 0x7d7566 },
  boss: { wall: 0xc9909b, wallLow: 0x8a5a4a, floor: 0x7a4a55, accent: 0xd9a441 },
  meeting: { wall: 0xc3b7e8, wallLow: 0xa99bd6, floor: 0x7f89a8, accent: 0x6a54b8 },
  hall1: { wall: 0xd8d4e2, wallLow: 0xbcb6cc, floor: 0xb9b2a6, accent: 0x7a7391 },
  kitchen: { wall: 0xf4e3a1, wallLow: 0xe6cf7c, floor: 0xd8d2c8, accent: 0xe08a2f },
  server: { wall: 0x4a5578, wallLow: 0x3a4466, floor: 0x2f3650, accent: 0x38e0c0 },
  roof: { wall: 0x8f96a8, wallLow: 0x7c8394, floor: 0x9aa0ae, accent: 0x5f6678 }
};

export const BUILDING = {
  /** Outer wall / cutaway edge. */
  shell: 0x3c3a5c,
  shellLight: 0x57547e,
  /** Slab between floors. */
  slab: 0x4a4770,
  brick: 0xb5654a,
  brickDark: 0x94503a,
  /** Window glass by day; tint it with the sky at other times. */
  glass: 0xbfe3ff,
  wood: 0xa9744a,
  woodDark: 0x7d5334,
  metal: 0xaab2c4,
  metalDark: 0x7a8296,
  plant: 0x4fae6a,
  plantDark: 0x357a4a,
  pavement: 0x8d8fa3,
  road: 0x55576b
};

/** UI design tokens (also mirrored as CSS variables by the UI layer). */
export const UI = {
  bg: 0x14122b,        // deepest background
  panel: 0x211e42,     // panels and sheets
  panelHi: 0x2e2a5a,   // raised surfaces, cards
  line: 0x0c0a1c,      // thick outlines around UI shapes
  text: 0xf6f2ff,
  textDim: 0xa9a3cf,
  amber: 0xffa51f,     // primary accent (call to action)
  blue: 0x2f7dff,      // secondary accent
  good: 0x2fd08a,
  bad: 0xff4d5e,
  warn: 0xffc53d
};

export const CATEGORY_COLORS: Record<ChaosCategory, { base: number; dark: number; light: number }> = {
  disaster: { base: 0xe0483e, dark: 0x9c2a2a, light: 0xff8a70 },
  weird: { base: 0x8b5cf6, dark: 0x5a34b8, light: 0xc0a2ff },
  treat: { base: 0x2fb170, dark: 0x1c7a4c, light: 0x7fe3ad },
  mind: { base: 0x2f8fe0, dark: 0x1c5fa3, light: 0x86c5ff }
};

/** Colour per emotion, for auras, bubble accents and UI chips. */
export const EMOTION_COLORS = {
  neutral: 0xb8b4d0, happy: 0xffc53d, excited: 0xff9a2e, amused: 0xffd86b, smug: 0xc084fc,
  love: 0xff5c9a, sad: 0x5b9bff, angry: 0xff4d4d, scared: 0x9b8cff, surprised: 0xffe14d,
  confused: 0xa3b1c6, embarrassed: 0xff8fa3, disgusted: 0x8bc34a, bored: 0x9aa0ae, tired: 0x7c88b0,
  suspicious: 0x6ed3c0, nervous: 0xb7a6ff, proud: 0xffb347, mischievous: 0xf472b6, determined: 0xff7043
} as const;

// ── tiny colour helpers (0xRRGGBB numbers) ──────────────────────────────────

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
export const darken = (c: number, t: number): number => mix(c, 0x1a1030, t);
export const lighten = (c: number, t: number): number => mix(c, 0xffffff, t);
export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
