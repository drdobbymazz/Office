// Composes one actor frame: a person in a pose, with a face, props, headgear
// and status marks, as an RGBA buffer.
//
// The person is the existing 18 x 32 sprite from portraitArt.ts (same recipes,
// same head, same clothes, same outline). The frame canvas is padded around it
// (ACTOR_W x ACTOR_H) so arms, props and hats can reach past the 18 x 32 box.
// The feet sit at (FEET_X, FEET_Y) in the padded canvas.
//
// Arms are 1 px sleeves with a hand, defined relative to the shoulder; the
// right arm mirrors the left. Legs are small rectangles per pose.

import {
  PX, SKIN, OUTLINE, SCENE_W, SCENE_H, set, rect, alphaAt, rgbAt, eq, shades, outlinePass, drawSceneTorso, drawHeadBack,
  drawHeadGroup, defaultPants, recipeFor, compose, type Buf, type Recipe, type RGB
} from '../portraitArt';
import { faceHooks, unpackFace, type Face } from './faces';

export const PAD_X = 7;
export const PAD_Y = 8;
export const ACTOR_W = SCENE_W + PAD_X * 2; // 32
export const ACTOR_H = SCENE_H + PAD_Y + 2; // 42
export const FEET_X = PAD_X + SCENE_W / 2; // 16
export const FEET_Y = PAD_Y + SCENE_H; // 40

export const VIEW = { front: 0, back: 1, right: 2, left: 3 } as const;

// ─── arm poses ───────────────────────────────────────────────────────────────
// [dx, dy] from the shoulder (x = 3, or 2 when heavy; y = 19). Negative dx is
// away from the body. `s` = sleeve pixels, `h` = hand pixels. `face` = the hand
// rests on the face, so it gets an inked edge to stand out from the skin.
interface ArmDef { s: readonly (readonly [number, number])[]; h: readonly (readonly [number, number])[]; face?: boolean; front?: boolean }
const col = (dx: number, y0: number, y1: number): [number, number][] => {
  const out: [number, number][] = [];
  if (y0 <= y1) for (let y = y0; y <= y1; y++) out.push([dx, y]);
  else for (let y = y0; y >= y1; y--) out.push([dx, y]);
  return out;
};

export const ARM = {
  down: 0, swingF: 1, swingB: 2, up: 3, v: 4, out: 5, outDown: 6, forward: 7, forwardUp: 8, cheek: 9, eyes: 10,
  head: 11, shrug: 12, hips: 13, chin: 14, belly: 15, phone: 16, mouth: 17, carry: 18, hugHi: 19, hugLo: 20,
  flailA: 21, flailB: 22, across: 23, robotUp: 24, robotDown: 25, point: 26, waveA: 27, waveB: 28, limp: 29,
  fist: 30, hidden: 31, sideF: 32, sideB: 33, sideFwd: 34, sideFwdUp: 35, sidePoint: 36, mopHi: 37, mopLo: 38,
  hose: 39
} as const;

const ARMS: ArmDef[] = [];
ARMS[ARM.down] = { s: col(0, 1, 5), h: [[0, 6]] };
ARMS[ARM.swingF] = { s: col(0, 1, 4), h: [[0, 5]] };
ARMS[ARM.swingB] = { s: [...col(0, 1, 4), [-1, 5]], h: [[-1, 6]] };
ARMS[ARM.up] = { s: [[-1, -1], ...col(-2, -2, -6)], h: [[-2, -7], [-2, -8]] };
ARMS[ARM.v] = { s: [[-1, -1], [-2, -2], [-3, -3], [-4, -4], [-5, -5]], h: [[-6, -6], [-6, -7]] };
ARMS[ARM.out] = { s: [[-1, 0], [-2, 0], [-3, 0], [-4, 0], [-5, 0]], h: [[-6, 0]] };
ARMS[ARM.outDown] = { s: [[-1, 1], [-2, 2], [-3, 3], [-3, 4]], h: [[-4, 5]] };
ARMS[ARM.forward] = { s: [...col(0, 1, 3), [1, 4]], h: [[2, 4], [3, 4]], front: true };
ARMS[ARM.forwardUp] = { s: [...col(0, 1, 2), [1, 3]], h: [[2, 3], [3, 3]], front: true };
ARMS[ARM.cheek] = { s: [[-1, -1], [-1, -2], [-1, -3], [-1, -4]], h: [[0, -5], [1, -5], [0, -6], [1, -6]], face: true };
ARMS[ARM.eyes] = { s: [...col(-1, -1, -7), [0, -8]], h: [[1, -9], [2, -9], [3, -9], [1, -10], [2, -10], [3, -10]], face: true };
ARMS[ARM.head] = { s: [[-1, -1], [-2, -2], ...col(-2, -3, -9), [-1, -10]], h: [[0, -11], [1, -12], [2, -12], [3, -12]], face: true };
ARMS[ARM.shrug] = { s: [[-1, 1], [-2, 1], [-3, 1]], h: [[-4, 0], [-4, -1]] };
ARMS[ARM.hips] = { s: [[-1, 1], [-2, 2], [-2, 3], [-1, 4]], h: [[0, 5]] };
ARMS[ARM.chin] = { s: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 2], [4, 1], [4, 0]], h: [[4, -1], [4, -2]], face: true, front: true };
ARMS[ARM.belly] = { s: [...col(0, 1, 3), [1, 4]], h: [[2, 4], [3, 4], [4, 4]], front: true };
ARMS[ARM.phone] = { s: col(-1, -1, -5), h: [[0, -6], [0, -7]], face: true };
ARMS[ARM.mouth] = { s: [[0, 1], [0, 2], [1, 2], [2, 1], [3, 0], [3, -1], [3, -2]], h: [[3, -3], [4, -3], [4, -4]], face: true, front: true };
ARMS[ARM.carry] = { s: col(0, 1, 3), h: [[1, 3], [1, 4]], front: true };
ARMS[ARM.hugHi] = { s: [[0, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2]], h: [[6, 2], [7, 1]], front: true };
ARMS[ARM.hugLo] = { s: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3]], h: [[6, 3], [7, 2]], front: true };
ARMS[ARM.flailA] = { s: [[-1, -1], [-2, -2], [-3, -2], [-4, -3]], h: [[-5, -4], [-5, -5]] };
ARMS[ARM.flailB] = { s: [[-1, 0], [-2, 1], [-3, 1], [-4, 2]], h: [[-5, 2], [-6, 1]] };
ARMS[ARM.across] = { s: [[0, 1], [1, 2], [2, 3], [3, 4]], h: [[4, 5], [5, 5]], front: true };
ARMS[ARM.robotUp] = { s: [[-1, 0], [-2, 0], [-3, 0], [-3, -1], [-3, -2]], h: [[-3, -3], [-3, -4]] };
ARMS[ARM.robotDown] = { s: [[-1, 0], [-2, 0], [-3, 0], [-3, 1], [-3, 2]], h: [[-3, 3], [-3, 4]] };
ARMS[ARM.point] = { s: [[-1, 0], [-2, 0], [-3, 0], [-4, 0], [-5, 0]], h: [[-6, 0], [-6, 1], [-7, 0]] };
ARMS[ARM.waveA] = { s: [[-1, -1], [-2, -2], [-2, -3], [-2, -4]], h: [[-2, -5], [-2, -6], [-3, -6]] };
ARMS[ARM.waveB] = { s: [[-1, -1], [-2, -2], [-3, -3], [-4, -4]], h: [[-5, -5], [-5, -6], [-6, -6]] };
ARMS[ARM.limp] = { s: [[0, 1], [-1, 2], [-1, 3], [-1, 4], [-1, 5]], h: [[-2, 6]] };
ARMS[ARM.fist] = { s: [[0, 1], [0, 2], [-1, 3], [-1, 4]], h: [[-1, 5], [-2, 5], [-1, 6], [-2, 6]] };
ARMS[ARM.hidden] = { s: [], h: [] };
// side views (applied to the arm on the side the person faces: "forward" is outward)
ARMS[ARM.sideF] = { s: [...col(0, 1, 2), [-1, 3], [-1, 4]], h: [[-2, 5]] };
ARMS[ARM.sideB] = { s: [...col(0, 1, 2), [1, 3], [1, 4]], h: [[2, 5]], front: true };
ARMS[ARM.sideFwd] = { s: [[0, 1], [0, 2], [-1, 3], [-2, 3]], h: [[-3, 3], [-4, 3]] };
ARMS[ARM.sideFwdUp] = { s: [[0, 1], [0, 2], [-1, 2], [-2, 2]], h: [[-3, 2], [-4, 2]] };
ARMS[ARM.sidePoint] = { s: [[-1, 0], [-2, 0], [-3, 0], [-4, 0]], h: [[-5, 0], [-6, 0], [-7, 0]] };
ARMS[ARM.mopHi] = { s: [[0, 1], [-1, 2], [-2, 2]], h: [[-3, 1], [-3, 2]] };
ARMS[ARM.mopLo] = { s: [[0, 1], [0, 2], [-1, 3], [-2, 4]], h: [[-3, 4], [-3, 5]] };
ARMS[ARM.hose] = { s: [[0, 1], [0, 2], [-1, 3], [-2, 3]], h: [[-3, 3], [-3, 2]] };

/** Arm poses that hold something in the hand (a prop goes there). */
const HOLDING = new Set<number>([
  ARM.forward, ARM.forwardUp, ARM.phone, ARM.mouth, ARM.carry, ARM.point, ARM.sideFwd, ARM.sideFwdUp, ARM.sidePoint,
  ARM.out, ARM.mopHi, ARM.mopLo, ARM.hose, ARM.waveA, ARM.v, ARM.up
]);

// ─── legs ────────────────────────────────────────────────────────────────────
export const LEGS = {
  stand: 0, walkA: 1, walkB: 2, runA: 3, runB: 4, runFloat: 5, crouch: 6, spread: 7, kickA: 8, kickB: 9, dangle: 10,
  together: 11, sitSide: 12, sideStand: 13, sideA: 14, sideB: 15, sidePassA: 16, sidePassB: 17, stompUp: 18,
  danceL: 19, danceR: 20, sideRunA: 21, sideRunB: 22, kneel: 23
} as const;

const SHOE: RGB = [44, 40, 48];

// ─── frame spec ──────────────────────────────────────────────────────────────
export interface FrameSpec {
  view: number;
  armL: number;
  armR: number;
  legs: number;
  /** Upper body (torso, arms, head) offset in px: -2..3. */
  bodyDy: number;
  /** Head offset on top of that: -1..3 down, -1..1 across. */
  headDy: number;
  headDx: number;
  /** Packed face (faces.faceKey). */
  face: number;
  /** 0 = none, else 1 + index in PROPS. */
  prop: number;
  /** 0 = none, 1 crown, 2 party hat, 3 tinfoil. */
  headgear: number;
  /** Status marks: STATUS bits. */
  status: number;
  /** 0 normal, 1 dark x-ray, 2 light x-ray. */
  xray: number;
}

/** Props carried at the side rather than held up in front. */
const SIDE_HELD = new Set(['mop', 'extinguisher', 'balloon', 'net']);

export const STATUS = { wet: 1, sooty: 2, frizzy: 4, stung: 8, dripPhase: 16, naked: 32 } as const;

export const PROPS = [
  'coffee', 'phone', 'papers', 'clipboard', 'box', 'trophy', 'extinguisher', 'mop', 'wrench', 'flashlight', 'net',
  'pizza', 'donut', 'cake', 'cash', 'balloon',
  // Added after the others: a frame's prop is stored as its index here, so new ones go last.
  'case', 'tape'
] as const;
export const HEADGEAR = ['crown', 'partyHat', 'tinfoil'] as const;

export function newSpec(): FrameSpec {
  return { view: 0, armL: 0, armR: 0, legs: 0, bodyDy: 0, headDy: 0, headDx: 0, face: 0, prop: 0, headgear: 0, status: 0, xray: 0 };
}

/** One integer per distinct frame (below 2^53): view 2b, arms 6b+6b, legs 5b, offsets, props, status, x-ray; face last. */
export function specKey(s: FrameSpec, faceIndex: number): number {
  let k = s.view;
  k = k * 64 + s.armL;
  k = k * 64 + s.armR;
  k = k * 32 + s.legs;
  k = k * 8 + (s.bodyDy + 2);
  k = k * 8 + (s.headDy + 2);
  k = k * 4 + (s.headDx + 1);
  k = k * 32 + s.prop;
  k = k * 4 + s.headgear;
  k = k * 64 + s.status;
  k = k * 4 + s.xray;
  return k * 2048 + faceIndex; // 2+6+6+5+3+3+2+5+2+6+2 = 42 bits, + 11 = 53
}

// ─── drawing ─────────────────────────────────────────────────────────────────
interface Ctx {
  r: Recipe;
  heavy: boolean;
  sl: number;
  sr: number;
  /** Bare skin for arms + legs: clothing layers are skipped (stripped). */
  naked: boolean;
  /** hand positions (body coords) of the last drawn arms */
  hand: [number, number, number, number];
  armPix: number[];
}

function drawLegs(buf: Buf, r: Recipe, legs: number, view: number, top: number, naked = false): void {
  const skin = SKIN[r.skin];
  const [, base, sh] = naked ? [skin.hi, skin.base, skin.sh] : shades(defaultPants(r));
  const foot = naked ? skin.sh : SHOE;
  const flip = view === VIEW.left;
  const X = (x: number) => (flip ? 17 - x : x);
  const R = (x0: number, y0: number, x1: number, y1: number, c: RGB) => {
    const a = X(x0), b = X(x1);
    rect(buf, Math.min(a, b), y0, Math.max(a, b), y1, c);
  };
  // a front-view leg: thigh from `top`, optional shin offset, shoe
  const leg = (x0: number, y1: number, shinDx = 0, kneeY = 28, shoeX = x0, shoeW = 3, shade = true) => {
    const kneeTop = Math.min(kneeY, y1 + 1);
    R(x0, top, x0 + 2, kneeTop - 1, base);
    if (y1 >= kneeTop) R(x0 + shinDx, kneeTop, x0 + 2 + shinDx, y1, base);
    if (shade) {
      for (let y = top; y < kneeTop; y++) set(buf, X(x0 + 2), y, sh);
      for (let y = kneeTop; y <= y1; y++) set(buf, X(x0 + 2 + shinDx), y, sh);
    }
    if (naked) {
      // bare thigh/shin catch the light on the outer edge
      for (let y = top; y < kneeTop; y++) set(buf, X(x0), y, skin.hi);
      for (let y = kneeTop; y <= y1; y++) set(buf, X(x0 + shinDx), y, skin.hi);
    }
    R(shoeX, y1 + 1, shoeX + shoeW - 1, y1 + 1, foot);
  };
  switch (legs) {
    case LEGS.stand: leg(5, 30); leg(10, 30); break;
    case LEGS.walkA: leg(5, 30); leg(10, 28); break;
    case LEGS.walkB: leg(5, 28); leg(10, 30); break;
    case LEGS.runA: leg(5, 30, -1, 28, 3); leg(10, 26, 0, 27, 10); break;
    case LEGS.runB: leg(5, 26, 0, 27, 5); leg(10, 30, 1, 28, 12); break;
    case LEGS.runFloat: leg(5, 29); leg(10, 29); break;
    case LEGS.crouch: R(5, top, 7, 26, base); R(10, top, 12, 26, base); leg(4, 30, 0, 27, 3); leg(11, 30, 0, 27, 12); break;
    case LEGS.kneel: R(5, top, 12, 28, base); R(4, 29, 13, 30, base); R(3, 31, 6, 31, foot); R(11, 31, 14, 31, foot); break;
    case LEGS.spread: leg(5, 30, -1, 28, 3); leg(10, 30, 1, 28, 12); break;
    case LEGS.kickA: leg(5, 28, -2, 27, 2); leg(10, 30, 0, 28, 10, 2); break;
    case LEGS.kickB: leg(5, 30, 0, 28, 6, 2); leg(10, 28, 2, 27, 13); break;
    case LEGS.dangle: leg(5, 30, 0, 28, 6, 2); leg(10, 30, 0, 28, 10, 2); break;
    case LEGS.together: leg(6, 30); leg(9, 30); break;
    case LEGS.stompUp: leg(5, 27, 0, 26, 5); leg(10, 30); break;
    case LEGS.danceL: leg(5, 30, -1, 28, 3); leg(10, 30); break;
    case LEGS.danceR: leg(5, 30); leg(10, 30, 1, 28, 12); break;
    // side views (drawn facing right; mirrored for left)
    case LEGS.sitSide:
      R(6, top, 13, 27, base); for (let x = 6; x <= 13; x++) set(buf, X(x), 27, sh);
      R(11, 28, 13, 30, base); set(buf, X(13), 28, sh); set(buf, X(13), 29, sh); set(buf, X(13), 30, sh);
      R(11, 31, 15, 31, foot);
      break;
    case LEGS.sideStand:
      R(6, top, 8, 30, sh); R(8, top, 11, 30, base);
      R(6, 31, 12, 31, foot);
      break;
    case LEGS.sideA: case LEGS.sideB: case LEGS.sideRunA: case LEGS.sideRunB: {
      const run = legs === LEGS.sideRunA || legs === LEGS.sideRunB;
      const nearFwd = legs === LEGS.sideA || legs === LEGS.sideRunA;
      const fwd = (c: RGB) => { R(8, top, 10, 27, c); R(run ? 11 : 10, 28, run ? 13 : 12, run ? 29 : 30, c); R(run ? 12 : 11, run ? 30 : 31, run ? 15 : 14, run ? 30 : 31, foot); };
      const back = (c: RGB) => { R(6, top, 8, 27, c); R(run ? 3 : 5, run ? 27 : 28, run ? 5 : 7, run ? 28 : 30, c); R(run ? 1 : 3, run ? 29 : 31, run ? 3 : 5, run ? 29 : 31, foot); };
      if (nearFwd) { back(sh); fwd(base); } else { fwd(sh); back(base); }
      break;
    }
    case LEGS.sidePassA: case LEGS.sidePassB: {
      const lifted = (c: RGB) => { R(7, top, 9, 27, c); R(6, 28, 8, 29, c); R(5, 30, 8, 30, foot); };
      const planted = (c: RGB) => { R(8, top, 10, 30, c); R(8, 31, 12, 31, foot); };
      if (legs === LEGS.sidePassA) { lifted(sh); planted(base); } else { planted(sh); lifted(base); }
      break;
    }
  }
}

/** When an arm is drawn: 0 before the torso (hidden behind it), 1 before the head, 2 over everything. */
function armPhase(def: ArmDef, back: boolean): number {
  if (back) return def.front ? 0 : 1;
  return def.face || def.front ? 2 : 1;
}

function drawArm(buf: Buf, c: Ctx, pose: number, right: boolean, phase: number, back: boolean): void {
  const def = ARMS[pose];
  if (!def || armPhase(def, back) !== phase) return;
  const [, cbase, csh] = shades(c.r.c1);
  const skin = SKIN[c.r.skin];
  // Dark clothes: posed sleeves are lifted a little so they do not vanish into the outline.
  const lum = c.r.c1[0] * 0.3 + c.r.c1[1] * 0.59 + c.r.c1[2] * 0.11;
  const posed: RGB = lum < 90 ? [Math.min(255, cbase[0] + 26), Math.min(255, cbase[1] + 26), Math.min(255, cbase[2] + 30)] : cbase;
  const sleeve = c.naked ? skin.base : pose === ARM.down || pose === ARM.swingF || pose === ARM.swingB ? csh : posed;
  const sx = right ? c.sr : c.sl;
  const X = (dx: number) => (right ? sx - dx : sx + dx);
  const n = def.s.length;
  def.s.forEach(([dx, dy], i) => {
    const bare = !c.naked && c.r.shortSleeves && i >= 2 && i >= n - 3;
    set(buf, X(dx), 19 + dy, bare ? skin.base : sleeve);
    c.armPix.push(X(dx), 19 + dy);
  });
  const handSet: number[] = [];
  for (const [dx, dy] of def.h) {
    set(buf, X(dx), 19 + dy, skin.base);
    handSet.push(X(dx), 19 + dy);
    c.armPix.push(X(dx), 19 + dy);
  }
  if (def.h.length) {
    const last = def.h[def.h.length - 1];
    const first = def.h[0];
    const hx = X(first[0]), hy = 19 + first[1];
    if (right) { c.hand[2] = hx; c.hand[3] = hy; } else { c.hand[0] = hx; c.hand[1] = hy; }
    void last;
  }
  if ((def.face || def.front) && !back) inkHand(buf, handSet, def.s, X, skin.line, c.r);
}

/** Hands over skin or clothes get an inked edge so they read as hands. */
function inkHand(buf: Buf, hand: number[], sleeve: ArmDef['s'], X: (dx: number) => number, line: RGB, r: Recipe): void {
  const skin = SKIN[r.skin];
  const skinPal = [skin.hi, skin.base, skin.sh];
  const isHand = (x: number, y: number) => { for (let i = 0; i < hand.length; i += 2) if (hand[i] === x && hand[i + 1] === y) return true; return false; };
  const isSleeve = (x: number, y: number) => sleeve.some(([dx, dy]) => X(dx) === x && 19 + dy === y);
  for (let i = 0; i < hand.length; i += 2) {
    const x = hand[i], y = hand[i + 1];
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + ax, ny = y + ay;
      if (isHand(nx, ny) || isSleeve(nx, ny)) continue;
      if (alphaAt(buf, nx, ny) !== 255) continue;
      const c = rgbAt(buf, nx, ny);
      if (skinPal.some((p) => eq(p, c))) set(buf, nx, ny, line);
    }
  }
}

// ─── props ───────────────────────────────────────────────────────────────────
function drawProp(buf: Buf, prop: string, hx: number, hy: number, carried: boolean, view: number, dir: number): void {
  const P = (pts: readonly (readonly [number, number])[], c: RGB) => { for (const [x, y] of pts) set(buf, hx + x * dir, hy + y, c); };
  const Rr = (x0: number, y0: number, x1: number, y1: number, c: RGB) => {
    const a = hx + x0 * dir, b = hx + x1 * dir;
    rect(buf, Math.min(a, b), hy + y0, Math.max(a, b), hy + y1, c);
  };
  switch (prop) {
    case 'coffee':
      Rr(0, -2, 1, 0, [240, 238, 232]); Rr(0, -2, 1, -2, [112, 70, 42]); P([[2, -1]], [240, 238, 232]); P([[0, 0]], [200, 196, 190]);
      break;
    case 'phone': Rr(0, -2, 0, 0, [36, 36, 46]); P([[0, -1]], [120, 200, 240]); break;
    case 'papers': Rr(-1, -3, 1, 0, [246, 246, 240]); P([[0, -2], [-1, -1]], [170, 176, 190]); P([[1, -3]], [214, 214, 206]); break;
    case 'clipboard':
      Rr(-1, -4, 2, 0, [156, 112, 62]); Rr(-1, -3, 1, -1, [246, 246, 240]); P([[0, -2]], [150, 156, 170]); P([[0, -4], [1, -4]], [200, 204, 212]);
      break;
    case 'box':
      if (carried) {
        rect(buf, 5, 19, 12, 24, [196, 150, 92]); rect(buf, 5, 19, 12, 19, [222, 182, 120]); rect(buf, 8, 19, 9, 24, [228, 204, 146]);
        rect(buf, 5, 24, 12, 24, [156, 116, 66]);
      } else { Rr(-1, -3, 2, 0, [196, 150, 92]); Rr(0, -3, 1, 0, [228, 204, 146]); }
      break;
    case 'trophy':
      Rr(-1, -5, 1, -3, [244, 200, 60]); P([[-2, -5], [2, -5], [0, -2]], [244, 200, 60]); Rr(-1, -1, 1, 0, [180, 132, 40]); P([[-1, -5]], [255, 240, 160]);
      break;
    case 'extinguisher':
      Rr(0, 0, 1, 5, [212, 42, 42]); P([[0, 0], [0, 1]], [240, 110, 100]); P([[0, -1], [1, -1]], [40, 40, 46]); P([[2, -1], [3, -2]], [40, 40, 46]);
      break;
    case 'mop':
      for (let y = -7; y <= 10; y++) set(buf, hx + Math.round((y + 7) * -0.15) * dir, hy + y, [176, 132, 80]);
      Rr(-4, 10, 2, 11, [206, 206, 196]); P([[-3, 11], [-1, 11], [1, 11]], [160, 160, 150]);
      break;
    case 'wrench': Rr(0, -4, 0, 0, [170, 176, 186]); P([[-1, -4], [1, -4], [-1, -5], [1, -5]], [170, 176, 186]); break;
    case 'flashlight': Rr(0, -1, 2, 0, [52, 52, 60]); P([[3, -1], [3, 0]], [255, 236, 120]); P([[4, -1], [5, -2], [4, 0], [5, 1]], [255, 246, 190]); break;
    case 'net':
      for (let y = -9; y <= 0; y++) set(buf, hx, hy + y, [176, 132, 80]);
      P([[-2, -13], [-1, -14], [0, -14], [1, -14], [2, -13], [-2, -12], [2, -12], [-1, -11], [0, -10], [1, -11]], [236, 236, 236]);
      P([[-1, -12], [0, -12], [1, -12], [0, -13], [0, -11]], [190, 196, 206]);
      break;
    case 'pizza':
      if (carried) { rect(buf, 4, 20, 13, 21, [222, 192, 132]); rect(buf, 4, 20, 13, 20, [240, 214, 160]); set(buf, 8, 20, [200, 50, 50]); set(buf, 9, 20, [200, 50, 50]); }
      else { P([[0, -2], [1, -2], [2, -2], [0, -1], [1, -1], [0, 0]], [244, 190, 80]); P([[0, -3], [1, -3], [2, -3]], [210, 150, 80]); P([[1, -2]], [210, 50, 50]); }
      break;
    case 'donut':
      P([[-1, -2], [0, -3], [1, -2], [0, -1], [-1, -3], [1, -3], [-1, -1], [1, -1]], [236, 120, 170]); P([[0, -2]], [120, 70, 50]); P([[-1, -3]], [255, 220, 120]);
      break;
    case 'cake':
      if (carried) {
        rect(buf, 5, 18, 12, 21, [250, 246, 236]); rect(buf, 5, 18, 12, 18, [240, 130, 170]); set(buf, 8, 16, [255, 216, 80]); set(buf, 8, 17, [120, 170, 230]);
        rect(buf, 4, 22, 13, 22, [200, 200, 210]);
      } else { Rr(-1, -2, 2, 0, [250, 246, 236]); Rr(-1, -2, 2, -2, [240, 130, 170]); P([[0, -3]], [120, 170, 230]); P([[0, -4]], [255, 216, 80]); }
      break;
    case 'cash': Rr(-1, -1, 1, 0, [110, 172, 92]); P([[0, -1]], [70, 120, 60]); P([[-1, -2], [0, -2]], [140, 200, 120]); break;
    case 'balloon':
      for (let y = -12; y <= -1; y++) set(buf, hx + (y < -8 ? 1 : 0) * dir, hy + y, [230, 230, 230]);
      Rr(-1, -19, 3, -14, [226, 54, 62]); P([[-1, -19], [3, -19], [-1, -14], [3, -14]], [0, 0, 0]);
      P([[0, -18], [0, -17]], [255, 160, 160]); P([[1, -13]], [180, 40, 46]);
      break;
    case 'case': {
      // A dark briefcase: body, a lighter top edge, two pale clasps, the handle in the hand.
      // (Not pure black: clearBlack() turns pure black pixels transparent.)
      const body: RGB = [70, 50, 44], edge: RGB = [112, 82, 66], clasp: RGB = [244, 218, 130];
      if (carried) {
        rect(buf, 5, 20, 12, 24, body); rect(buf, 5, 20, 12, 20, edge); set(buf, 7, 21, clasp); set(buf, 10, 21, clasp);
        set(buf, 8, 19, [40, 32, 30]); set(buf, 9, 19, [40, 32, 30]);
      } else {
        P([[0, 0], [1, 0]], [40, 32, 30]);
        Rr(-1, 1, 3, 4, body); Rr(-1, 1, 3, 1, edge); P([[-1, 2], [2, 2]], clasp);
      }
      break;
    }
    case 'tape':
      // A video cassette: near-black shell, two pale reels and a white label strip.
      if (carried) {
        rect(buf, 6, 20, 11, 23, [36, 34, 42]); rect(buf, 6, 20, 11, 20, [246, 246, 240]); set(buf, 7, 22, [196, 200, 210]); set(buf, 10, 22, [196, 200, 210]);
      } else { Rr(-1, -3, 3, 0, [36, 34, 42]); Rr(-1, -3, 3, -3, [246, 246, 240]); P([[0, -1], [2, -1]], [196, 200, 210]); }
      break;
  }
  void view;
}

/** Remove the corner pixels a balloon rect left black (transparent instead). */
function clearBlack(buf: Buf): void {
  for (let i = 0; i < buf.length; i += 4) if (buf[i + 3] === 255 && buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 0) buf[i + 3] = 0;
}

function drawHeadgear(buf: Buf, kind: number): void {
  if (kind === 1) { // crown
    const g: RGB = [244, 202, 58], d: RGB = [196, 146, 34];
    rect(buf, 5, 0, 12, 2, g); rect(buf, 5, 2, 12, 2, d);
    for (const x of [5, 8, 9, 12]) set(buf, x, -1, g);
    set(buf, 5, -2, g); set(buf, 12, -2, g); set(buf, 8, -2, g); set(buf, 9, -2, g);
    set(buf, 7, 1, [214, 40, 60]); set(buf, 10, 1, [60, 120, 220]); set(buf, 6, 0, [255, 244, 170]);
  } else if (kind === 2) { // party hat
    const a: RGB = [80, 166, 232], b: RGB = [250, 208, 72];
    rect(buf, 6, 1, 11, 2, a); rect(buf, 7, -1, 10, 0, b); rect(buf, 8, -3, 9, -2, a);
    set(buf, 6, 2, b); set(buf, 11, 1, b); set(buf, 9, -1, a);
    set(buf, 8, -4, [252, 252, 252]); set(buf, 9, -4, [252, 252, 252]); set(buf, 8, -5, [252, 252, 252]);
  } else if (kind === 3) { // tinfoil
    const m: RGB = [196, 202, 212], h: RGB = [244, 246, 250], d: RGB = [146, 152, 166];
    rect(buf, 4, 1, 13, 3, m); rect(buf, 6, -1, 11, 0, m); rect(buf, 8, -3, 9, -2, m);
    for (const [x, y] of [[6, 1], [9, 2], [12, 1], [7, -1], [8, -3], [5, 3], [10, 0]] as const) set(buf, x, y, h);
    for (const [x, y] of [[8, 1], [11, 2], [4, 2], [10, -1], [13, 3]] as const) set(buf, x, y, d);
  }
}

function drawFrizz(buf: Buf, r: Recipe): void {
  const [, base] = shades(r.hairc);
  const pts: [number, number][] = [[3, 1], [2, 0], [5, 0], [6, -1], [8, 0], [9, -1], [11, 0], [12, -1], [14, 1], [15, 0],
    [2, 3], [1, 2], [15, 3], [16, 2], [2, 6], [1, 5], [15, 6], [16, 5], [7, 1], [10, 1]];
  for (const [x, y] of pts) set(buf, x, y, base);
  for (const [x, y] of [[6, -1], [12, -1], [1, 2]] as const) set(buf, x, y, [60, 52, 50]);
}

function drawStung(buf: Buf): void {
  for (const [x, y] of [[6, 5], [12, 11]] as const) {
    set(buf, x, y, [230, 70, 70]); set(buf, x + 1, y, [230, 70, 70]); set(buf, x, y + 1, [200, 50, 56]); set(buf, x + 1, y + 1, [200, 50, 56]);
    set(buf, x, y, [255, 170, 160]);
  }
  set(buf, 8, 12, [236, 80, 80]); set(buf, 8, 11, [255, 150, 140]);
}

function soot(buf: Buf): void {
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] !== 255) continue;
    buf[i] = Math.round(buf[i] * 0.78); buf[i + 1] = Math.round(buf[i + 1] * 0.76); buf[i + 2] = Math.round(buf[i + 2] * 0.76);
  }
}
function sootSpots(buf: Buf, headOy: number, bodyOy: number): void {
  const d: RGB = [62, 58, 62];
  PX.oy = headOy; for (const [x, y] of [[6, 12], [7, 12], [11, 8], [9, 5], [12, 13]] as const) set(buf, x, y, d);
  PX.oy = bodyOy; for (const [x, y] of [[6, 21], [7, 22], [11, 23], [10, 20], [5, 24]] as const) set(buf, x, y, d);
}

function drips(buf: Buf, phase: number, headOy: number, bodyOy: number): void {
  const c: RGB = [110, 178, 246], hi: RGB = [200, 232, 255];
  PX.oy = headOy;
  set(buf, 2, 10 + phase, c); set(buf, 15, 12 + phase * 2, c); set(buf, 15, 11 + phase * 2, hi); set(buf, 9, 1, hi); set(buf, 6, 2, hi);
  PX.oy = bodyOy;
  set(buf, 3, 27 + phase * 2, c); set(buf, 14, 26 + phase, c); set(buf, 14, 25 + phase, hi);
}

/** Turn a finished frame into an x-ray: silhouette plus white bones (mode 1) or the inverse (mode 2). */
function xray(buf: Buf, c: Ctx, mode: number, headOx: number, headOy: number, bodyOy: number, legsOy: number, view: number): void {
  const body: RGB = mode === 1 ? [26, 30, 46] : [222, 236, 255];
  const bone: RGB = mode === 1 ? [236, 242, 252] : [34, 34, 56];
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue;
    buf[i] = body[0]; buf[i + 1] = body[1]; buf[i + 2] = body[2]; buf[i + 3] = 255;
  }
  // skull
  PX.ox = headOx; PX.oy = headOy;
  for (let y = 4; y <= 14; y++) for (let x = 5; x <= 12; x++) {
    if ((y === 4 || y === 14) && (x === 5 || x === 12)) continue;
    set(buf, x, y, bone);
  }
  rect(buf, 7, 15, 10, 15, bone);
  if (view !== VIEW.back) {
    for (const [x, y] of [[6, 8], [7, 8], [6, 9], [7, 9], [10, 8], [11, 8], [10, 9], [11, 9], [8, 11], [9, 11], [7, 13], [9, 13], [11, 13]] as const) set(buf, x - 1 + 1, y, body);
  }
  // spine, ribs, pelvis
  PX.ox = PAD_X; PX.oy = bodyOy;
  for (let y = 17; y <= 25; y++) set(buf, 8, y, bone), set(buf, 9, y, bone);
  for (const y of [19, 21, 23]) for (let x = 5; x <= 12; x++) set(buf, x, y, bone);
  rect(buf, 6, 25, 11, 25, bone);
  // arm bones
  for (let i = 0; i < c.armPix.length; i += 2) set(buf, c.armPix[i], c.armPix[i + 1], bone);
  // leg bones
  PX.oy = legsOy;
  for (let y = 26; y <= 30; y++) { set(buf, 6, y, bone); set(buf, 11, y, bone); }
}

/**
 * Draw a full actor frame. Returns a new ACTOR_W x ACTOR_H RGBA buffer.
 * `sprite` is a cast name, a visitor id or anything (the default person).
 */
export function composeActor(sprite: string, s: FrameSpec): Buf {
  const r = recipeFor(sprite);
  PX.w = ACTOR_W; PX.h = ACTOR_H;
  const buf = new Uint8ClampedArray(ACTOR_W * ACTOR_H * 4);
  const heavy = !!r.heavy;
  const naked = !!(s.status & STATUS.naked);
  const c: Ctx = { r, heavy, sl: heavy ? 2 : 3, sr: heavy ? 15 : 14, naked, hand: [3, 25, 14, 25], armPix: [] };
  const back = s.view === VIEW.back;
  const side = s.view === VIEW.right || s.view === VIEW.left;
  const legsOy = PAD_Y;
  const bodyOy = PAD_Y + s.bodyDy;
  const headOx = PAD_X + s.headDx;
  const headOy = bodyOy + s.headDy;
  const face: Face = unpackFace(s.face, { brow: 0, eyes: 0, mouth: 0, fx: 0 });

  // legs: start high enough to meet a raised torso
  PX.ox = PAD_X; PX.oy = legsOy;
  drawLegs(buf, r, s.legs, s.view, 25 + Math.min(0, s.bodyDy), naked);

  // torso (with the classic arm columns only when both arms hang down)
  PX.oy = bodyOy;
  const propName = s.prop ? PROPS[s.prop - 1] : (r.signatureProp ?? null);
  // A small prop with both arms hanging: hold it up in front so it reads.
  if (propName && s.armL === ARM.down && s.armR === ARM.down && !SIDE_HELD.has(propName)) {
    if (s.view === VIEW.left) s = { ...s, armL: ARM.forwardUp }; else s = { ...s, armR: ARM.forwardUp };
  }
  const classic = s.armL === ARM.down && s.armR === ARM.down;
  const arms = (phase: number) => {
    if (classic) return;
    const ox = PX.ox, oy = PX.oy;
    PX.ox = PAD_X; PX.oy = bodyOy;
    drawArm(buf, c, s.armL, false, phase, back); drawArm(buf, c, s.armR, true, phase, back);
    PX.ox = ox; PX.oy = oy;
  };
  arms(0);
  drawSceneTorso(buf, r, back, classic, naked);
  arms(1);
  if (classic) {
    // classic arms: just add the hands under the sleeves
    const skin = SKIN[r.skin];
    set(buf, c.sl, 25, skin.base); set(buf, c.sr, 25, skin.base);
    c.armPix.push(c.sl, 20, c.sl, 22, c.sl, 24, c.sr, 20, c.sr, 22, c.sr, 24);
  }

  // head
  PX.ox = headOx; PX.oy = headOy;
  if (back) drawHeadBack(buf, r);
  else drawHeadGroup(buf, r, faceHooks(face, s.view === VIEW.right ? 1 : s.view === VIEW.left ? -1 : 0));
  if (s.status & STATUS.frizzy) drawFrizz(buf, r);
  if (s.status & STATUS.stung && !back) drawStung(buf);
  if (s.headgear) drawHeadgear(buf, s.headgear);

  // arms in front of the body (across the chest, hands to the face)
  arms(2);
  PX.ox = PAD_X; PX.oy = bodyOy;

  // prop
  if (propName) {
    const carried = s.armL === ARM.carry && s.armR === ARM.carry;
    const useL = !HOLDING.has(s.armR) && HOLDING.has(s.armL);
    const hx = useL ? c.hand[0] : c.hand[2];
    const hy = useL ? c.hand[1] : c.hand[3];
    const dir = useL ? -1 : 1;
    const hidden = back && (s.armR === ARM.forward || s.armR === ARM.forwardUp || carried);
    if (!hidden) drawProp(buf, propName, hx, hy, carried, s.view, dir);
    clearBlack(buf);
  }

  PX.ox = 0; PX.oy = 0;
  outlinePass(buf, OUTLINE);
  // post-outline: water drips sit over the outline
  if (s.status & STATUS.sooty) { soot(buf); PX.ox = PAD_X; sootSpots(buf, headOy, bodyOy); }
  if (s.status & STATUS.wet) { PX.ox = PAD_X; drips(buf, s.status & STATUS.dripPhase ? 1 : 0, headOy, bodyOy); }
  if (s.xray) xray(buf, c, s.xray, headOx, headOy, bodyOy, legsOy, s.view);
  PX.ox = 0; PX.oy = 0;
  void side;
  return buf;
}

/** The 18 x 28 portrait bust with a face (portraitArt's composer with expression hooks). */
export function composePortrait(sprite: string, faceK: number, naked = false): Buf {
  const face: Face = unpackFace(faceK, { brow: 0, eyes: 0, mouth: 0, fx: 0 });
  return compose(recipeFor(sprite), faceHooks(face, 0), naked);
}
