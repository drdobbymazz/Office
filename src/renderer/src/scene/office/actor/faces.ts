// Facial expressions for the pixel people.
//
// A face is four small numbers: a brow shape, an eye shape, a mouth shape and
// a set of extra marks (blush, tears, sweat, the anger mark, skin going pale or
// red). Every emotion maps to a face at three strengths (a hint, clear,
// extreme). "rest" means the person's own recipe brow / mouth, so each person's
// neutral face is pixel-identical to the existing art.
//
// Coordinates are the 18-wide head of portraitArt.ts: head skin x 4..13,
// eyes on row 9 (left x 5-6, right x 10-11, mirrored about x = 8), nose x 7-8
// rows 11-12, mouth rows 13-15.

import type { EmotionId } from '@/game/core/types';
import { PX, SKIN, OUTLINE, set, rgbAt, alphaAt, eq, drawFace, type Buf, type Recipe, type RGB, type FaceHooks } from '../portraitArt';

export const BROW = {
  rest: 0, flat: 1, raised: 2, angry: 3, angryHeavy: 4, worried: 5, worriedHigh: 6, low: 7, quirkL: 8, quirkR: 9, soft: 10
} as const;
export const EYES = {
  rest: 0, wide: 1, scared: 2, shut: 3, happy: 4, squeeze: 5, half: 6, glanceL: 7, glanceR: 8, heart: 9,
  spiralA: 10, spiralB: 11, cross: 12, narrow: 13, halfL: 14, halfR: 15, sparkle: 16, teary: 17, content: 18,
  wink: 19, odd: 20
} as const;
export const MOUTH = {
  rest: 0, neutral: 1, smile: 2, grin: 3, sad: 4, o: 5, shout: 6, shoutTeeth: 7, open: 8, laugh: 9, wobbly: 10,
  smirk: 11, smirkBig: 12, gritted: 13, tongue: 14, flat: 15, wavy: 16, talk: 17, yawn: 18, cheshire: 19, pout: 20,
  talkSmall: 21
} as const;
export const FX = {
  blush: 1, blush2: 2, tear1: 4, tear2: 8, tearPhase: 16, sweat: 32, sweat2: 64, anger: 128, pale: 256, red: 512,
  gloom: 1024, bags: 2048, green: 4096, laughTear: 8192
} as const;

export interface Face { brow: number; eyes: number; mouth: number; fx: number }

/** Packs a face into one integer (cache key part). */
export function faceKey(f: Face): number {
  return f.brow + 16 * (f.eyes + 32 * (f.mouth + 32 * f.fx));
}
export function unpackFace(k: number, out: Face): Face {
  out.brow = k % 16; k = Math.floor(k / 16);
  out.eyes = k % 32; k = Math.floor(k / 32);
  out.mouth = k % 32; k = Math.floor(k / 32);
  out.fx = k;
  return out;
}

const B = BROW, E = EYES, M = MOUTH, F = FX;
type Row = readonly [number, number, number, number];
/** [hint, clear, extreme] faces per emotion: [brow, eyes, mouth, fx]. */
const TABLE: Record<EmotionId, readonly [Row, Row, Row]> = {
  neutral:     [[B.rest, E.rest, M.rest, 0], [B.rest, E.rest, M.rest, 0], [B.rest, E.rest, M.rest, 0]],
  happy:       [[B.rest, E.rest, M.smile, 0], [B.soft, E.sparkle, M.open, 0], [B.raised, E.happy, M.laugh, F.blush]],
  excited:     [[B.raised, E.wide, M.open, 0], [B.raised, E.sparkle, M.laugh, F.blush], [B.raised, E.sparkle, M.shout, F.blush2]],
  amused:      [[B.rest, E.glanceR, M.smirk, 0], [B.rest, E.happy, M.grin, 0], [B.worried, E.squeeze, M.laugh, F.laughTear]],
  smug:        [[B.flat, E.half, M.smirk, 0], [B.quirkL, E.half, M.smirk, 0], [B.quirkL, E.halfR, M.smirkBig, 0]],
  love:        [[B.soft, E.rest, M.smile, F.blush], [B.soft, E.content, M.smile, F.blush2], [B.soft, E.heart, M.open, F.blush2]],
  sad:         [[B.worried, E.rest, M.sad, 0], [B.worried, E.teary, M.sad, F.tear1], [B.worriedHigh, E.shut, M.shout, F.tear2]],
  angry:       [[B.angry, E.narrow, M.flat, 0], [B.angryHeavy, E.narrow, M.gritted, 0], [B.angryHeavy, E.narrow, M.shoutTeeth, F.anger | F.red]],
  scared:      [[B.worried, E.wide, M.wavy, 0], [B.worriedHigh, E.scared, M.wobbly, F.sweat], [B.worriedHigh, E.scared, M.shout, F.pale | F.gloom | F.sweat]],
  surprised:   [[B.raised, E.rest, M.o, 0], [B.raised, E.wide, M.talk, 0], [B.raised, E.scared, M.yawn, 0]],
  confused:    [[B.quirkL, E.glanceR, M.flat, 0], [B.quirkL, E.rest, M.wavy, 0], [B.quirkL, E.odd, M.wobbly, F.sweat]],
  embarrassed: [[B.soft, E.glanceR, M.smile, F.blush], [B.worried, E.glanceL, M.wavy, F.blush2], [B.worried, E.squeeze, M.wobbly, F.red | F.sweat]],
  disgusted:   [[B.quirkR, E.half, M.pout, 0], [B.angry, E.half, M.wobbly, 0], [B.angry, E.squeeze, M.tongue, F.green]],
  bored:       [[B.flat, E.half, M.neutral, 0], [B.low, E.half, M.flat, 0], [B.low, E.halfR, M.pout, 0]],
  tired:       [[B.soft, E.half, M.rest, 0], [B.worried, E.half, M.neutral, F.bags], [B.worried, E.shut, M.yawn, F.bags]],
  suspicious:  [[B.flat, E.glanceL, M.flat, 0], [B.quirkR, E.halfL, M.flat, 0], [B.quirkR, E.halfL, M.wavy, 0]],
  nervous:     [[B.worried, E.rest, M.wavy, 0], [B.worried, E.glanceR, M.wavy, F.sweat], [B.worriedHigh, E.scared, M.gritted, F.sweat | F.sweat2]],
  proud:       [[B.raised, E.rest, M.smile, 0], [B.raised, E.content, M.smile, 0], [B.raised, E.content, M.grin, F.blush]],
  mischievous: [[B.flat, E.glanceR, M.smirk, 0], [B.angry, E.wink, M.cheshire, 0], [B.angryHeavy, E.halfR, M.cheshire, 0]],
  determined:  [[B.low, E.rest, M.flat, 0], [B.angry, E.rest, M.flat, 0], [B.angry, E.sparkle, M.gritted, F.sweat]]
};

/** 0 = resting face, 1..3 = hint / clear / extreme. */
export function levelOf(intensity: number): number {
  if (intensity < 0.08) return 0;
  if (intensity < 0.4) return 1;
  if (intensity < 0.75) return 2;
  return 3;
}

export function emotionFace(emotion: EmotionId, intensity: number, out: Face): Face {
  const lv = levelOf(intensity);
  const rows = TABLE[emotion] ?? TABLE.neutral;
  const r = lv === 0 ? TABLE.neutral[0] : rows[lv - 1];
  out.brow = r[0]; out.eyes = r[1]; out.mouth = r[2]; out.fx = r[3];
  return out;
}

/** Eyes that are already closed or replaced: blinking leaves them alone. */
export function eyesCanBlink(eyes: number): boolean {
  return !(eyes === E.shut || eyes === E.happy || eyes === E.squeeze || eyes === E.content || eyes === E.heart ||
    eyes === E.spiralA || eyes === E.spiralB || eyes === E.cross);
}

/** Mouth used on the "open" beat while talking, chosen to suit the expression. */
export function talkMouth(mouth: number): number {
  switch (mouth) {
    case M.smile: case M.grin: case M.open: case M.laugh: case M.cheshire: case M.smirk: case M.smirkBig: case M.tongue:
      return M.open;
    case M.gritted: case M.shoutTeeth: return M.shoutTeeth;
    case M.shout: case M.yawn: return M.shout;
    case M.wobbly: case M.wavy: case M.sad: return M.talkSmall;
    default: return M.talk;
  }
}

// ─── drawing ─────────────────────────────────────────────────────────────────

const WHITE: RGB = [250, 248, 244];
const PUPIL: RGB = [46, 38, 42];
const MOUTH_C: RGB = [158, 86, 80];
const MOUTH_DARK: RGB = [92, 34, 42];
const TONGUE: RGB = [226, 112, 116];
const TEETH: RGB = [252, 250, 246];
const HEART: RGB = [226, 52, 84];
const TEAR: RGB = [120, 186, 250];
const TEAR_HI: RGB = [214, 238, 255];
const SWEAT: RGB = [150, 206, 250];
const ANGER: RGB = [222, 46, 46];
const GLOOM: RGB = [112, 96, 176];
const BROW_DARK: RGB = [52, 36, 36];

/** The right-eye x for a left-eye x: the eyes mirror about x = 8. */
const mx = (x: number) => 16 - x;
/** Paint over what is there; a < 255 mixes with the pixel below and stays opaque. */
function mix(buf: Buf, x: number, y: number, c: RGB, a = 255): void {
  if (a >= 255 || alphaAt(buf, x, y) !== 255) { set(buf, x, y, c, a >= 255 ? 255 : a); return; }
  const b = rgbAt(buf, x, y), t = a / 255;
  set(buf, x, y, [Math.round(b[0] + (c[0] - b[0]) * t), Math.round(b[1] + (c[1] - b[1]) * t), Math.round(b[2] + (c[2] - b[2]) * t)]);
}
function both(buf: Buf, x: number, y: number, c: RGB, a = 255): void { mix(buf, x, y, c, a); mix(buf, mx(x), y, c, a); }

function drawBrow(buf: Buf, kind: number, line: RGB): void {
  switch (kind) {
    case B.flat: for (const x of [5, 6]) both(buf, x, 7, line); break;
    case B.raised: for (const x of [5, 6]) both(buf, x, 6, line); break;
    case B.angry: both(buf, 5, 7, line); both(buf, 6, 8, line); break;
    case B.angryHeavy:
      both(buf, 4, 6, BROW_DARK); both(buf, 5, 6, BROW_DARK); both(buf, 5, 7, BROW_DARK); both(buf, 6, 7, BROW_DARK); both(buf, 6, 8, BROW_DARK);
      break;
    case B.worried: both(buf, 5, 8, line); both(buf, 6, 7, line); break;
    case B.worriedHigh: both(buf, 4, 8, line); both(buf, 5, 7, line); both(buf, 6, 6, line); break;
    case B.low: for (const x of [5, 6]) both(buf, x, 8, BROW_DARK); break;
    case B.quirkL: set(buf, 4, 7, line); set(buf, 5, 6, line); set(buf, 6, 6, line); set(buf, 10, 8, BROW_DARK); set(buf, 11, 8, BROW_DARK); break;
    case B.quirkR: set(buf, 5, 8, BROW_DARK); set(buf, 6, 8, BROW_DARK); set(buf, 10, 6, line); set(buf, 11, 6, line); set(buf, 12, 7, line); break;
    case B.soft: both(buf, 5, 7, line); break;
  }
}

function lashFlick(buf: Buf, r: Recipe): void {
  if (!r.lashes) return;
  const lash: RGB = [54, 40, 48];
  set(buf, 4, 8, lash); set(buf, 12, 8, lash);
}

function drawEyes(buf: Buf, kind: number, r: Recipe): void {
  const s = SKIN[r.skin];
  const lashed = !!r.lashes;
  const openPair = (lp: number, rp: number) => {
    set(buf, 5, 9, WHITE); set(buf, 6, 9, WHITE); set(buf, 10, 9, WHITE); set(buf, 11, 9, WHITE);
    set(buf, lp, 9, PUPIL); set(buf, rp, 9, PUPIL);
    if (lashed) {
      const lash: RGB = [54, 40, 48];
      for (const x of [5, 6, 10, 11]) set(buf, x, 8, lash);
      set(buf, 4, 8, lash); set(buf, 12, 8, lash);
    }
  };
  switch (kind) {
    case E.rest: case E.narrow: case E.teary:
      openPair(6, 10);
      if (lashed && kind !== E.narrow) { set(buf, 5, 9, [252, 250, 248]); set(buf, 10, 9, [252, 250, 248]); }
      if (kind === E.teary) { both(buf, 5, 10, TEAR); both(buf, 6, 10, TEAR_HI); }
      break;
    case E.glanceL: openPair(5, 10); break;
    case E.glanceR: openPair(6, 11); break;
    case E.wide:
      for (const y of [8, 9]) { both(buf, 5, y, WHITE); both(buf, 6, y, WHITE); }
      set(buf, 6, 8, PUPIL); set(buf, 6, 9, PUPIL); set(buf, 10, 8, PUPIL); set(buf, 10, 9, PUPIL);
      lashFlick(buf, r);
      break;
    case E.scared:
      for (const y of [8, 9, 10]) { both(buf, 5, y, WHITE); both(buf, 6, y, WHITE); }
      set(buf, 6, 9, PUPIL); set(buf, 10, 9, PUPIL);
      break;
    case E.sparkle:
      for (const y of [8, 9]) { both(buf, 5, y, PUPIL); both(buf, 6, y, PUPIL); }
      set(buf, 5, 8, WHITE); set(buf, 10, 8, WHITE);
      lashFlick(buf, r);
      break;
    case E.shut:
      for (const x of [5, 6]) both(buf, x, 9, PUPIL);
      lashFlick(buf, r);
      break;
    case E.happy: // ^ ^
      both(buf, 4, 9, PUPIL); both(buf, 5, 8, PUPIL); both(buf, 6, 9, PUPIL);
      break;
    case E.content: // u u : closed, pleased
      both(buf, 4, 8, PUPIL); both(buf, 5, 9, PUPIL); both(buf, 6, 8, PUPIL);
      break;
    case E.squeeze: // > <
      set(buf, 5, 8, PUPIL); set(buf, 6, 9, PUPIL); set(buf, 5, 10, PUPIL);
      set(buf, 11, 8, PUPIL); set(buf, 10, 9, PUPIL); set(buf, 11, 10, PUPIL);
      break;
    case E.half: case E.halfL: case E.halfR: {
      for (const x of [5, 6]) both(buf, x, 9, s.line);
      both(buf, 5, 10, WHITE); both(buf, 6, 10, WHITE);
      const lp = kind === E.halfL ? 5 : 6, rp = kind === E.halfR ? 11 : 10;
      set(buf, lp, 10, PUPIL); set(buf, rp, 10, PUPIL);
      break;
    }
    case E.heart:
      for (const cx of [5, 11]) {
        set(buf, cx - 1, 8, HEART); set(buf, cx + 1, 8, HEART);
        set(buf, cx - 1, 9, HEART); set(buf, cx, 9, HEART); set(buf, cx + 1, 9, HEART);
        set(buf, cx, 10, HEART);
        set(buf, cx - 1, 8, [255, 150, 170]);
      }
      break;
    case E.spiralA: case E.spiralB:
      for (const cx of [5, 11]) {
        const ring: [number, number][] = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
        // a ring with a moving gap and a dot inside it: reads as a turning swirl
        set(buf, cx, 9, WHITE);
        const gap = kind === E.spiralA ? (cx === 5 ? 1 : 5) : (cx === 5 ? 5 : 1);
        ring.forEach(([dx, dy], i) => set(buf, cx + dx, 9 + dy, i === gap ? WHITE : PUPIL));
      }
      break;
    case E.cross:
      for (const cx of [5, 11]) {
        set(buf, cx - 1, 8, PUPIL); set(buf, cx + 1, 8, PUPIL); set(buf, cx, 9, PUPIL);
        set(buf, cx - 1, 10, PUPIL); set(buf, cx + 1, 10, PUPIL);
      }
      break;
    case E.wink: // left open, right ^
      set(buf, 5, 9, WHITE); set(buf, 6, 9, PUPIL);
      if (lashed) set(buf, 4, 8, [54, 40, 48]);
      set(buf, 10, 9, PUPIL); set(buf, 11, 8, PUPIL); set(buf, 12, 9, PUPIL);
      break;
    case E.odd: // one wide, one squinting
      for (const y of [8, 9]) { set(buf, 5, y, WHITE); set(buf, 6, y, WHITE); }
      set(buf, 6, 9, PUPIL);
      set(buf, 10, 9, s.line); set(buf, 11, 9, s.line); set(buf, 10, 10, PUPIL);
      break;
  }
}

const REST_MOUTHS: Record<string, [number, number][]> = {
  neutral: [[7, 14], [8, 14], [9, 14], [10, 14]],
  smile: [[7, 14], [8, 14], [9, 14], [10, 14], [6, 13], [11, 13]],
  frown: [[7, 15], [8, 15], [9, 15], [10, 15], [6, 14], [11, 14]],
  grin: [[7, 14], [8, 14], [9, 14], [10, 14], [7, 13], [8, 13], [9, 13], [10, 13], [6, 13], [11, 13]],
};

function px(buf: Buf, pts: readonly (readonly [number, number])[], c: RGB): void { for (const [x, y] of pts) set(buf, x, y, c); }

function drawMouth(buf: Buf, kind: number, r: Recipe): void {
  switch (kind) {
    case M.rest: px(buf, REST_MOUTHS[r.mouth ?? 'neutral'], MOUTH_C); break;
    case M.neutral: px(buf, REST_MOUTHS.neutral, MOUTH_C); break;
    case M.smile: px(buf, REST_MOUTHS.smile, MOUTH_C); break;
    case M.grin: px(buf, REST_MOUTHS.grin, MOUTH_C); for (const x of [7, 8, 9, 10]) set(buf, x, 13, TEETH); break;
    case M.sad: px(buf, [[7, 13], [8, 13], [9, 13], [10, 13], [6, 14], [11, 14]], MOUTH_C); break;
    case M.flat: px(buf, [[7, 14], [8, 14], [9, 14], [10, 14]], MOUTH_DARK); break;
    case M.o: px(buf, [[8, 13], [9, 13], [8, 14], [9, 14]], MOUTH_DARK); break;
    case M.talk:
      px(buf, [[8, 13], [9, 13], [7, 14], [10, 14], [8, 15], [9, 15]], MOUTH_C);
      px(buf, [[8, 14], [9, 14]], MOUTH_DARK);
      break;
    case M.talkSmall: px(buf, [[7, 14], [10, 14]], MOUTH_C); px(buf, [[8, 14], [9, 14]], MOUTH_DARK); break;
    case M.yawn:
      px(buf, [[8, 12], [9, 12], [7, 13], [10, 13], [7, 14], [10, 14], [7, 15], [10, 15], [8, 16], [9, 16]], MOUTH_C);
      px(buf, [[8, 13], [9, 13], [8, 14], [9, 14]], MOUTH_DARK); px(buf, [[8, 15], [9, 15]], TONGUE);
      break;
    case M.shout: case M.shoutTeeth:
      px(buf, [[7, 13], [8, 13], [9, 13], [10, 13], [6, 14], [7, 14], [8, 14], [9, 14], [10, 14], [11, 14], [7, 15], [10, 15]], MOUTH_DARK);
      px(buf, [[8, 15], [9, 15]], TONGUE);
      if (kind === M.shoutTeeth) px(buf, [[7, 13], [8, 13], [9, 13], [10, 13]], TEETH);
      break;
    case M.open:
      px(buf, [[6, 13], [11, 13]], MOUTH_C);
      px(buf, [[7, 13], [8, 13], [9, 13], [10, 13]], TEETH);
      px(buf, [[7, 14], [10, 14]], MOUTH_DARK); px(buf, [[8, 14], [9, 14]], TONGUE);
      break;
    case M.laugh:
      px(buf, [[5, 12], [12, 12]], MOUTH_C);
      px(buf, [[6, 13], [7, 13], [8, 13], [9, 13], [10, 13], [11, 13]], TEETH);
      px(buf, [[6, 14], [7, 14], [10, 14], [11, 14], [7, 15], [10, 15]], MOUTH_DARK);
      px(buf, [[8, 14], [9, 14], [8, 15], [9, 15]], TONGUE);
      break;
    case M.cheshire:
      px(buf, [[5, 12], [12, 12], [6, 13], [11, 13]], MOUTH_C);
      px(buf, [[7, 13], [8, 13], [9, 13], [10, 13]], TEETH);
      px(buf, [[7, 14], [8, 14], [9, 14], [10, 14]], MOUTH_C);
      set(buf, 8, 13, [210, 206, 200]);
      break;
    case M.wobbly: px(buf, [[6, 14], [7, 14], [8, 13], [9, 13], [10, 14], [11, 14]], MOUTH_DARK); break;
    case M.wavy: px(buf, [[7, 14], [8, 13], [9, 13], [10, 14]], MOUTH_C); break;
    case M.smirk: px(buf, [[7, 14], [8, 14], [9, 14], [10, 13]], MOUTH_C); break;
    case M.smirkBig: px(buf, [[6, 14], [7, 14], [8, 14], [9, 14], [10, 13], [11, 12]], MOUTH_C); break;
    case M.gritted:
      px(buf, [[6, 13], [7, 13], [8, 13], [9, 13], [10, 13], [11, 13], [6, 14], [11, 14], [6, 15], [7, 15], [8, 15], [9, 15], [10, 15], [11, 15]], MOUTH_DARK);
      px(buf, [[7, 14], [8, 14], [9, 14], [10, 14]], TEETH);
      set(buf, 8, 14, [196, 190, 186]); set(buf, 10, 14, [196, 190, 186]);
      break;
    case M.tongue:
      px(buf, [[6, 13], [7, 14], [8, 14], [9, 14], [10, 14], [11, 13]], MOUTH_C);
      px(buf, [[8, 15], [9, 15], [9, 16]], TONGUE);
      break;
    case M.pout: px(buf, [[8, 14], [9, 14], [7, 15], [10, 15]], MOUTH_C); break;
  }
}

function tint(buf: Buf, r: Recipe, to: RGB, amt: number): void {
  const s = SKIN[r.skin];
  const pal = [s.hi, s.base, s.sh];
  for (let y = 2; y <= 19; y++) {
    for (let x = 1; x <= 16; x++) {
      if (alphaAt(buf, x, y) !== 255) continue;
      const c = rgbAt(buf, x, y);
      if (!pal.some((p) => eq(p, c))) continue;
      set(buf, x, y, [
        Math.round(c[0] + (to[0] - c[0]) * amt), Math.round(c[1] + (to[1] - c[1]) * amt), Math.round(c[2] + (to[2] - c[2]) * amt)
      ]);
    }
  }
}

/** The extra marks that sit over the hair and glasses: tears, sweat, the anger mark, tints. */
function drawTopMarks(buf: Buf, f: Face, r: Recipe): void {
  if (f.fx & F.pale) tint(buf, r, [206, 214, 232], 0.55);
  if (f.fx & F.red) tint(buf, r, [236, 92, 80], 0.45);
  if (f.fx & F.green) tint(buf, r, [168, 204, 120], 0.4);
  if (f.fx & F.blush2) { for (const x of [4, 5]) both(buf, x, 12, [236, 116, 120], 210); }
  if (f.fx & F.bags) { both(buf, 5, 10, [150, 110, 150], 170); both(buf, 6, 10, [150, 110, 150], 170); }
  const ph = (f.fx & F.tearPhase) ? 1 : 0;
  if (f.fx & F.tear2) {
    for (const x of [5, 11]) {
      for (let y = 10; y <= 15; y++) set(buf, x, y, TEAR);
      set(buf, x, 11 + ph * 2, TEAR_HI);
      set(buf, x, 16 + ph, TEAR); // the drop falling off the chin line
    }
  } else if (f.fx & F.tear1) {
    set(buf, 5, 10 + ph, TEAR); set(buf, 11, 10 + ph, TEAR);
  }
  if (f.fx & F.laughTear) { set(buf, 4, 10, TEAR); set(buf, 12, 10, TEAR); set(buf, 12, 11, TEAR_HI); }
  if (f.fx & F.sweat) {
    set(buf, 15, 4, SWEAT); set(buf, 15, 5, SWEAT); set(buf, 16, 5, SWEAT); set(buf, 15, 6, SWEAT); set(buf, 16, 6, SWEAT);
    set(buf, 15, 5, [236, 248, 255]);
  }
  if (f.fx & F.sweat2) { set(buf, 1, 6, SWEAT); set(buf, 1, 7, SWEAT); set(buf, 2, 7, SWEAT); }
  if (f.fx & F.anger) {
    // the "vein" mark: four little brackets
    const pts: [number, number][] = [[13, 0], [15, 0], [12, 1], [13, 1], [15, 1], [16, 1], [12, 3], [13, 3], [15, 3], [16, 3], [13, 4], [15, 4]];
    for (const [x, y] of pts) set(buf, x, y, ANGER);
  }
}

/**
 * Face hooks for portraitArt.drawHeadGroup. `dx` shifts the features sideways
 * (a three-quarter view when facing left or right).
 */
export function faceHooks(f: Face, dx = 0): FaceHooks {
  const allRest = f.brow === B.rest && f.eyes === E.rest && f.mouth === M.rest && f.fx === 0;
  return {
    face(buf, r) {
      PX.ox += dx;
      if (allRest) {
        drawFace(buf, r.skin, r.brow ?? 'flat', r.mouth ?? 'neutral', r.blush ?? false, r.lashes ?? false);
      } else {
        const s = SKIN[r.skin];
        if (f.brow === B.rest) drawRestBrow(buf, r);
        drawEyes(buf, f.eyes, r);
        set(buf, 8, 11, s.sh); set(buf, 8, 12, s.sh); set(buf, 7, 12, s.sh);
        drawMouth(buf, f.mouth, r);
        const blush = (f.fx & F.blush) || ((r.blush ?? false) && !(f.fx & (F.pale | F.green)));
        if (blush) for (const x of [5, 12]) mix(buf, x, 12, [235, 140, 136], f.fx & F.blush ? 200 : 140);
      }
      PX.ox -= dx;
    },
    afterHair(buf, r) {
      PX.ox += dx;
      if (f.brow !== B.rest) drawBrow(buf, f.brow, SKIN[r.skin].line);
      if (f.fx & F.gloom) for (const x of [6, 8, 10, 12]) { set(buf, x, 2, GLOOM); set(buf, x, 3, GLOOM); set(buf, x, 4, GLOOM); }
      PX.ox -= dx;
    },
    top(buf, r) {
      PX.ox += dx;
      drawTopMarks(buf, f, r);
      PX.ox -= dx;
    }
  };
}

function drawRestBrow(buf: Buf, r: Recipe): void {
  const s = SKIN[r.skin];
  const brow = r.brow ?? 'flat';
  if (brow === 'flat') for (const x of [5, 6, 10, 11]) set(buf, x, 7, s.line);
  else if (brow === 'angry') { set(buf, 5, 8, s.line); set(buf, 6, 7, s.line); set(buf, 10, 7, s.line); set(buf, 11, 8, s.line); }
  else if (brow === 'raised') for (const x of [5, 6, 10, 11]) set(buf, x, 6, s.line);
  else if (brow === 'soft') { for (const x of [5, 11]) set(buf, x, 7, s.line); for (const x of [6, 10]) set(buf, x, 7, s.sh); }
}

export { OUTLINE };
