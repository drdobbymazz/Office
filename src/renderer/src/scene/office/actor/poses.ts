// What each anim looks like: which pixel frame (arms, legs, head offsets) to
// show at time t, and how the sprite container moves (bob, hop, lean, squash,
// sway). Frames step at pixel-art rates; the container motion is smooth.
//
// Pure functions of their inputs (no state, no allocation) so the view can
// also evaluate the previous anim while it cross-fades out.

import type { AnimId, EmotionId } from '@/game/core/types';
import type { PersonState } from '@/game/view/api';
import { ARM, LEGS, VIEW, PROPS, type FrameSpec } from './art';
import { EYES, FX, MOUTH, BROW } from './faces';

export interface Motion { x: number; y: number; rot: number; sx: number; sy: number; /** rotation pivot, px above the feet (negative) */ py: number }

export interface PoseIn {
  t: number;
  /** Shared dance clock in beats (120 bpm), the same for everyone on the floor. */
  beat: number;
  st: PersonState;
  view: number;
  seated: boolean;
  /** Emotion strength step: 0 rest, 1 hint, 2 clear, 3 extreme. */
  lv: number;
  /** Pendulum angle while held (radians). */
  swing: number;
}

/** Face changes an anim asks for (-1 = leave it to the emotion). */
export interface FaceOv {
  brow: number;
  eyes: number;
  mouth: number;
  fxAdd: number;
  /** Show this emotion instead when the person's own emotion is weaker than emoMin. */
  emo: EmotionId | null;
  emoMin: number;
  noBlink: boolean;
  /** Sprite tint, 0xffffff = none. */
  tint: number;
}

export function resetMotion(m: Motion): void { m.x = 0; m.y = 0; m.rot = 0; m.sx = 1; m.sy = 1; m.py = -14; }
export function resetFaceOv(o: FaceOv): void {
  o.brow = -1; o.eyes = -1; o.mouth = -1; o.fxAdd = 0; o.emo = null; o.emoMin = 0; o.noBlink = false; o.tint = 0xffffff;
}

/** Anims that make a seated person stand up. */
export const STANDING_ONLY: ReadonlySet<AnimId> = new Set<AnimId>([
  'walk', 'run', 'panic', 'held', 'lie', 'float', 'fall', 'land', 'beamUp', 'dance', 'stomp', 'mop', 'extinguish', 'carry',
  'strip', 'kiss', 'makeOut', 'lapDance', 'grinding', 'spank', 'selfTouch', 'seduce', 'twerk', 'backflip', 'kneel', 'flex',
  'whip', 'tieUp', 'worship', 'dominate', 'lick', 'peep', 'tableDance',
  'cowgirl', 'reverseCowgirl', 'missionary', 'doggy', 'blowjob', 'handjob', 'fingering', 'sixtyNine', 'facesit', 'orgasm', 'flash'
]);

const TAU = Math.PI * 2;
const frame = (t: number, fps: number, n: number) => Math.floor(t * fps) % n;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** Deterministic hash noise in 0..1 for integer n. */
const noise = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);

const side = (v: number) => v === VIEW.right || v === VIEW.left;
/** +1 when facing right, -1 facing left, 0 front/back. */
const fdir = (v: number) => (v === VIEW.right ? 1 : v === VIEW.left ? -1 : 0);

/**
 * A body lying on its back points its head the way it is facing. When the view
 * is front/back, fall back to a stable per-person choice so a couple in 69
 * still ends up head-to-toe instead of both pointing the same way.
 */
function lyingFlip(st: PersonState, view: number): boolean {
  const dir = fdir(view);
  if (dir !== 0) return dir > 0;
  const id = st.id;
  let h = st.variant;
  for (let i = 0; i < id.length; i++) h += id.charCodeAt(i);
  return h % 2 === 1;
}

/**
 * Set the arms: `active` is the arm that does the gesture (the near arm when
 * seen from the side; the viewer's right arm from the front), `other` the rest.
 */
function arms(spec: FrameSpec, view: number, active: number, other: number): void {
  if (view === VIEW.left) { spec.armL = active; spec.armR = other; }
  else { spec.armR = active; spec.armL = other; }
}
function both(spec: FrameSpec, a: number): void { spec.armL = a; spec.armR = a; }

function standLegs(spec: FrameSpec, view: number, seated: boolean): void {
  spec.legs = seated && side(view) ? LEGS.sitSide : side(view) ? LEGS.sideStand : LEGS.stand;
}

function propIndex(name: string): number { return (PROPS as readonly string[]).indexOf(name) + 1; }
const P_PHONE = propIndex('phone'), P_COFFEE = propIndex('coffee'), P_DONUT = propIndex('donut'), P_BOX = propIndex('box');
const P_MOP = propIndex('mop'), P_EXT = propIndex('extinguisher');

/** Breathing: a smooth chest scale plus a 1 px head dip on the out-breath. */
function breathe(spec: FrameSpec, m: Motion, t: number, period: number, amount = 0.014): void {
  const ph = (t / period) % 1;
  m.sy = 1 + Math.sin(ph * TAU) * amount;
  if (ph > 0.55 && ph < 0.95) spec.headDy += 1;
}

const RUN_SIDE = [LEGS.sideRunA, LEGS.sidePassA, LEGS.sideRunB, LEGS.sidePassB];
const RUN_FRONT = [LEGS.runA, LEGS.runFloat, LEGS.runB, LEGS.runFloat];
const WALK_SIDE = [LEGS.sideA, LEGS.sidePassA, LEGS.sideB, LEGS.sidePassB];
const WALK_FRONT = [LEGS.walkA, LEGS.stand, LEGS.walkB, LEGS.stand];
const SHAKE_DX = [0, -1, 0, 1];
const ZAP = [0, 1, 0, 2, 1, 0];
const TURN = [VIEW.front, VIEW.right, VIEW.back, VIEW.left];

/** Walk / run cycle frames. */
function walkCycle(spec: FrameSpec, m: Motion, inp: PoseIn, run: boolean): void {
  const { st, view } = inp;
  const sp = Math.max(8, st.speed || (run ? 90 : 45));
  const fps = run ? clamp(sp / 7, 8, 16) : clamp(sp / 5.5, 5, 12);
  const f = frame(inp.t, fps, 4);
  const sv = side(view);
  if (run) {
    spec.legs = sv ? RUN_SIDE[f] : RUN_FRONT[f];
    spec.bodyDy = f % 2 === 1 ? -1 : 0;
    if (sv) arms(spec, view, f < 2 ? ARM.sideB : ARM.sideF, f < 2 ? ARM.swingF : ARM.swingB);
    else { spec.armL = f < 2 ? ARM.swingF : ARM.swingB; spec.armR = f < 2 ? ARM.swingB : ARM.swingF; }
    const ph = (inp.t * fps / 2) % 1;
    m.y = -Math.abs(Math.sin(ph * TAU)) * 1.6;
    m.rot = 0.09 * fdir(view);
    m.py = 0;
  } else {
    spec.legs = sv ? WALK_SIDE[f] : WALK_FRONT[f];
    spec.bodyDy = f % 2 === 1 ? -1 : 0;
    if (sv) arms(spec, view, f === 0 ? ARM.sideB : f === 2 ? ARM.sideF : ARM.down, ARM.down);
    else { spec.armL = f === 0 ? ARM.swingB : f === 2 ? ARM.swingF : ARM.down; spec.armR = f === 0 ? ARM.swingF : f === 2 ? ARM.swingB : ARM.down; }
    const ph = (inp.t * fps / 2) % 1;
    m.y = -Math.abs(Math.sin(ph * TAU)) * 0.7;
    m.x = sv ? 0 : Math.sin(ph * TAU) * 0.35;
    m.py = 0;
  }
}

/**
 * Fill `spec` (arms, legs, offsets, prop override, view override, x-ray),
 * `m` (container motion) and `o` (face overrides) for anim at time t.
 */
export function pose(anim: AnimId, inp: PoseIn, spec: FrameSpec, m: Motion, o: FaceOv): void {
  const { t, st, view, seated, lv } = inp;
  const emo = st.emotion;
  spec.armL = ARM.down; spec.armR = ARM.down; spec.bodyDy = 0; spec.headDy = 0; spec.headDx = 0; spec.xray = 0;
  standLegs(spec, view, seated);
  resetMotion(m);
  const sv = side(view);
  const fd = fdir(view);

  switch (anim) {
    case 'idle': {
      breathe(spec, m, t, 3.2);
      idleMood(spec, m, o, inp);
      break;
    }
    case 'walk': walkCycle(spec, m, inp, false); walkMood(spec, m, inp); break;
    case 'run': walkCycle(spec, m, inp, true); break;
    case 'panic': {
      walkCycle(spec, m, inp, true);
      const f = frame(t, 10, 2);
      spec.armL = f ? ARM.flailA : ARM.v; spec.armR = f ? ARM.v : ARM.flailA;
      m.rot = Math.sin(t * 17) * 0.12; m.py = -12;
      m.x = Math.sin(t * 23) * 0.6;
      o.emo = 'scared'; o.emoMin = 0.8;
      if (st.speed < 5) { standLegs(spec, view, false); spec.legs = frame(t, 8, 2) ? LEGS.danceL : LEGS.danceR; m.y = -Math.abs(Math.sin(t * 14)) * 2; }
      break;
    }
    case 'type': {
      const f = frame(t, 7, 4);
      const n = noise(Math.floor(t * 7));
      if (view === VIEW.back) {
        spec.armL = n > 0.5 ? ARM.swingF : ARM.down; spec.armR = n > 0.5 ? ARM.down : ARM.swingF;
      } else if (sv) {
        arms(spec, view, f % 2 ? ARM.sideFwd : ARM.sideFwdUp, ARM.down);
      } else {
        spec.armL = n > 0.5 ? ARM.forwardUp : ARM.forward; spec.armR = n > 0.5 ? ARM.forward : ARM.forwardUp;
        o.eyes = EYES.half;
      }
      m.y = (n > 0.85 ? -0.3 : 0);
      breathe(spec, m, t, 3.6, 0.01);
      break;
    }
    case 'phone': {
      arms(spec, view, ARM.phone, frame(t, 0.5, 2) ? ARM.hips : ARM.down);
      if (!st.prop) spec.prop = P_PHONE;
      m.x = Math.sin(t * 1.3) * 0.4;
      breathe(spec, m, t, 3.4);
      break;
    }
    case 'drink': {
      const ph = t % 3.2;
      const sip = ph > 1.3 && ph < 2.5;
      arms(spec, view, sip ? ARM.mouth : sv ? ARM.sideFwd : ARM.forward, ARM.down);
      if (!st.prop) spec.prop = P_COFFEE;
      if (sip) { o.eyes = EYES.content; spec.headDy = -1; }
      breathe(spec, m, t, 3.2);
      break;
    }
    case 'eat': {
      const ph = t % 1.4;
      const bite = ph < 0.5;
      arms(spec, view, bite ? ARM.mouth : sv ? ARM.sideFwd : ARM.forward, ARM.down);
      if (!st.prop) spec.prop = P_DONUT;
      o.mouth = bite ? MOUTH.o : frame(t, 5, 2) ? MOUTH.wavy : MOUTH.neutral;
      if (!bite) o.eyes = EYES.content;
      break;
    }
    case 'operate': {
      const f = frame(t, 3, 4);
      if (view === VIEW.back) { spec.armL = f === 1 ? ARM.up : ARM.swingF; spec.armR = f === 3 ? ARM.waveA : ARM.swingF; }
      else if (sv) arms(spec, view, f % 2 ? ARM.sideFwdUp : ARM.sideFwd, ARM.down);
      else { spec.armL = f === 1 ? ARM.forwardUp : ARM.forward; spec.armR = f === 3 ? ARM.forwardUp : ARM.forward; }
      m.x = (f === 1 || f === 3 ? 0.4 : 0) * (fd || 0);
      break;
    }
    case 'carry': {
      if (st.speed > 4) walkCycle(spec, m, inp, false);
      both(spec, ARM.carry);
      if (!st.prop) spec.prop = P_BOX;
      m.sy *= 0.99;
      break;
    }
    case 'mop': {
      const f = frame(t, 2.5, 2);
      if (view === VIEW.left) { spec.armL = f ? ARM.mopHi : ARM.mopLo; spec.armR = ARM.down; }
      else { spec.armR = f ? ARM.mopHi : ARM.mopLo; spec.armL = ARM.down; }
      if (!st.prop) spec.prop = P_MOP;
      spec.legs = sv ? LEGS.sideStand : f ? LEGS.danceL : LEGS.stand;
      m.x = Math.sin(t * Math.PI * 2.5) * 1.2;
      m.py = 0;
      break;
    }
    case 'extinguish': {
      arms(spec, view, ARM.hose, sv ? ARM.down : ARM.out);
      if (!st.prop) spec.prop = P_EXT;
      spec.legs = sv ? LEGS.sideA : LEGS.spread;
      m.x = Math.sin(t * 40) * 0.35 - 0.6 * fd;
      o.emo = 'determined'; o.emoMin = 0.6;
      break;
    }
    case 'talk': {
      const beat = Math.floor(t / 0.9);
      const n = noise(beat * 3 + st.variant * 17);
      const angry = emo === 'angry' && lv >= 2;
      const sad = (emo === 'sad' || emo === 'tired' || emo === 'bored') && lv >= 2;
      let a: number = ARM.down;
      if (angry) a = n < 0.5 ? (sv ? ARM.sidePoint : ARM.point) : ARM.fist;
      else if (sad) a = n < 0.3 ? ARM.belly : ARM.down;
      else a = n < 0.3 ? ARM.shrug : n < 0.55 ? (sv ? ARM.sideFwdUp : ARM.waveA) : n < 0.7 ? ARM.hips : ARM.down;
      const other = !sad && n > 0.8 ? ARM.shrug : angry ? ARM.fist : ARM.down;
      arms(spec, view, a, other);
      if (frame(t, 2.2, 3) === 1) spec.headDy = 1;
      m.x = Math.sin(t * 2.1) * 0.3;
      breathe(spec, m, t, 2.8);
      break;
    }
    case 'laugh': {
      both(spec, ARM.belly);
      if (sv) arms(spec, view, ARM.belly, ARM.down);
      spec.headDy = frame(t, 7, 2);
      spec.bodyDy = frame(t, 7, 4) === 0 ? 1 : 0;
      m.y = -Math.abs(Math.sin(t * 11)) * 1.1;
      m.x = Math.sin(t * 3) * 0.5;
      o.emo = 'amused'; o.emoMin = 0.85;
      break;
    }
    case 'cry': {
      const ph = t % 2.6;
      if (ph < 1.8) both(spec, ARM.eyes); else arms(spec, view, ARM.eyes, ARM.limp);
      spec.headDy = 1 + frame(t, 3.5, 2);
      m.y = frame(t, 3.5, 2) * 0.5;
      o.emo = 'sad'; o.emoMin = 0.9;
      break;
    }
    case 'cheer': {
      const period = seated ? 0.5 : 0.6;
      const ph = (t % period) / period;
      const air = Math.sin(ph * Math.PI);
      const f = frame(t, 1 / period * 2, 2);
      both(spec, f ? ARM.v : ARM.up);
      m.y = -air * (seated ? 2 : 7);
      m.sy = ph < 0.12 || ph > 0.9 ? 0.9 : 1 + air * 0.06;
      m.sx = 2 - m.sy;
      if (!seated) spec.legs = air > 0.4 ? (sv ? LEGS.sidePassA : LEGS.together) : spec.legs;
      m.py = 0;
      o.emo = 'excited'; o.emoMin = 0.8;
      break;
    }
    case 'wave': {
      const f = frame(t, 4, 2);
      arms(spec, view, f ? ARM.waveA : ARM.waveB, ARM.down);
      m.x = Math.sin(t * Math.PI * 4) * 0.4;
      breathe(spec, m, t, 3);
      o.emo = 'happy'; o.emoMin = 0.3;
      break;
    }
    case 'point': {
      arms(spec, view, sv ? ARM.sidePoint : ARM.point, ARM.hips);
      const k = easeOut(clamp(t / 0.18, 0, 1));
      m.x = (fd || (view === VIEW.front ? 1 : -1)) * (1 - k) * -1.5;
      breathe(spec, m, t, 3);
      break;
    }
    case 'shrug': {
      const ph = t % 1.6;
      const up = ph > 0.15 && ph < 1.1;
      both(spec, up ? ARM.shrug : ARM.down);
      if (up) { spec.headDy = 1; m.y = -0.6; }
      o.brow = BROW.quirkL; if (emo === 'neutral' || lv < 2) o.mouth = MOUTH.wavy;
      break;
    }
    case 'facepalm': {
      arms(spec, view, ARM.eyes, ARM.down);
      spec.headDy = 1;
      if (t > 0.5) spec.headDx = frame(t, 2.5, 2) ? -1 : 0;
      o.eyes = EYES.shut; o.mouth = MOUTH.flat;
      break;
    }
    case 'think': {
      arms(spec, view, ARM.chin, sv ? ARM.down : ARM.belly);
      o.eyes = frame(t, 0.4, 2) ? EYES.glanceR : EYES.glanceL;
      if (lv < 2) o.mouth = frame(t, 0.7, 3) === 2 ? MOUTH.wavy : MOUTH.pout;
      breathe(spec, m, t, 3.6);
      break;
    }
    case 'nod': {
      spec.headDy = frame(t, 4, 2);
      m.y = spec.headDy * 0.3;
      o.emo = 'happy'; o.emoMin = 0.25;
      break;
    }
    case 'shake': {
      spec.headDx = SHAKE_DX[frame(t, 9, 4)];
      if (lv < 2) o.mouth = MOUTH.flat;
      o.brow = lv < 2 ? BROW.flat : -1;
      break;
    }
    case 'cower': {
      both(spec, ARM.head);
      if (!seated) { spec.legs = sv ? LEGS.sitSide : LEGS.crouch; spec.bodyDy = 3; }
      spec.headDy = 2;
      m.x = Math.sin(t * 47) * 0.55;
      o.emo = 'scared'; o.emoMin = 0.85; o.eyes = EYES.squeeze;
      break;
    }
    case 'startle': {
      // squash, a sharp hop with stretch, land with squash, then hold
      both(spec, ARM.v);
      spec.legs = sv ? LEGS.sideA : LEGS.spread;
      const H = seated ? 3 : 9;
      if (t < 0.08) { const k = t / 0.08; m.sy = 1 - 0.18 * k; m.sx = 1 + 0.14 * k; spec.legs = LEGS.crouch; both(spec, ARM.down); }
      else if (t < 0.46) { const k = (t - 0.08) / 0.38; m.y = -Math.sin(k * Math.PI) * H; m.sy = 1.16 - 0.16 * k; m.sx = 2 - m.sy; }
      else if (t < 0.62) { const k = (t - 0.46) / 0.16; m.sy = 1 - 0.14 * Math.sin(k * Math.PI); m.sx = 2 - m.sy; }
      else { m.x = Math.sin(t * 40) * 0.3 * clamp(1.6 - t, 0, 1); both(spec, ARM.cheek); }
      m.py = 0;
      o.emo = 'surprised'; o.emoMin = 0.9;
      break;
    }
    case 'shiver': {
      spec.armL = ARM.hugHi; spec.armR = ARM.hugLo;
      if (!seated) spec.legs = sv ? LEGS.sideStand : LEGS.together;
      m.x = Math.sin(t * 58) * 0.5;
      o.mouth = MOUTH.gritted; o.tint = 0xd6e6ff;
      spec.headDy = frame(t, 12, 2) ? 0 : 1;
      break;
    }
    case 'stomp': {
      const f = frame(t, 4, 4);
      both(spec, ARM.fist);
      spec.legs = sv ? (f % 2 ? LEGS.sidePassA : LEGS.sideStand) : f === 0 ? LEGS.stompUp : f === 2 ? LEGS.danceR : LEGS.stand;
      const ph = (t * 4) % 1;
      if (f % 2 === 1 && ph < 0.35) { m.sy = 0.92; m.sx = 1.06; m.x = Math.sin(t * 60) * 0.6; }
      else m.y = f % 2 === 0 ? -1.2 : 0;
      m.py = 0;
      o.emo = 'angry'; o.emoMin = 0.8;
      break;
    }
    case 'dizzy': {
      arms(spec, view, ARM.outDown, ARM.limp);
      if (!seated) spec.legs = sv ? LEGS.sideA : LEGS.spread;
      m.rot = Math.sin(t * 2.6) * 0.14; m.x = Math.sin(t * 2.6) * 1.4; m.py = 0;
      o.eyes = frame(t, 6, 2) ? EYES.spiralA : EYES.spiralB; o.mouth = MOUTH.wobbly; o.noBlink = true;
      break;
    }
    case 'sleep': {
      o.eyes = EYES.shut; o.noBlink = true;
      o.mouth = (t % 4.5) > 3.2 ? MOUTH.o : MOUTH.neutral;
      if (seated) {
        if (view === VIEW.back) { both(spec, ARM.swingF); spec.headDy = 2; }
        else if (sv) { arms(spec, view, ARM.sideFwd, ARM.down); spec.headDy = 2; }
        else { both(spec, ARM.forward); spec.headDy = 3; }
        breathe(spec, m, t, 4.2, 0.03);
        spec.headDy = Math.min(3, spec.headDy);
      } else {
        spec.legs = sv ? LEGS.sideStand : LEGS.together;
        both(spec, ARM.limp);
        spec.headDy = 1;
        m.x = Math.sin(t * 0.9) * 0.7;
        breathe(spec, m, t, 4.2, 0.03);
      }
      break;
    }
    case 'lie': {
      spec.legs = LEGS.together; both(spec, ARM.down);
      spec.view = VIEW.front;
      m.rot = -Math.PI / 2; m.py = 0; m.x = 15; m.y = -6;
      m.sy = 1 + Math.sin(t * TAU / 3.6) * 0.012;
      break;
    }
    case 'float': {
      const f = frame(t, 1.6, 2);
      both(spec, f ? ARM.out : ARM.outDown);
      spec.legs = f ? LEGS.kickA : LEGS.kickB;
      m.py = -16;
      m.rot = Math.sin(t * 0.45) * 0.7 + t * 0.15;
      m.x = Math.sin(t * 0.7) * 2.2; m.y = Math.sin(t * 1.3) * 2;
      o.emo = 'surprised'; o.emoMin = 0.3;
      break;
    }
    case 'held': {
      const kick = clamp(1 + Math.abs(st.vx) / 120, 1, 2.5);
      const f = frame(t, 6 * kick, 2);
      spec.armL = f ? ARM.flailA : ARM.flailB; spec.armR = f ? ARM.flailB : ARM.flailA;
      spec.legs = f ? LEGS.kickA : LEGS.kickB;
      m.py = -31;
      m.rot = inp.swing + Math.sin(t * 9 * kick) * 0.035;
      m.sy = 1.04; m.sx = 0.98;
      o.emo = 'scared'; o.emoMin = 0.5;
      break;
    }
    case 'fall': {
      const f = frame(t, 10, 2);
      spec.armL = f ? ARM.flailA : ARM.v; spec.armR = f ? ARM.v : ARM.flailA;
      spec.legs = f ? LEGS.kickA : LEGS.spread;
      m.sy = 1.08; m.sx = 0.93;
      m.rot = Math.sin(t * 13) * 0.08;
      o.emo = 'scared'; o.emoMin = 0.85;
      break;
    }
    case 'land': {
      const k = Math.exp(-t * 7);
      m.sy = 1 - 0.32 * k * Math.cos(t * 16);
      m.sx = 1 + 0.26 * k * Math.cos(t * 16);
      m.py = 0;
      if (t < 0.32) { spec.legs = sv ? LEGS.sitSide : LEGS.crouch; spec.bodyDy = 2; both(spec, ARM.out); o.eyes = EYES.squeeze; }
      else if (t < 0.5) { both(spec, ARM.outDown); }
      break;
    }
    case 'zapped': {
      both(spec, ARM.out);
      spec.legs = sv ? LEGS.sideA : LEGS.spread;
      spec.xray = ZAP[frame(t, 18, 6)];
      m.x = Math.sin(t * 73) * 0.8; m.y = Math.sin(t * 51) * 0.4;
      o.emo = 'scared'; o.emoMin = 1; o.noBlink = true;
      break;
    }
    case 'dance': danceMove(spec, m, o, inp); break;
    case 'beamUp': {
      both(spec, ARM.limp);
      spec.legs = LEGS.dangle;
      spec.view = TURN[frame(t, 1.6, 4)];
      m.rot = Math.sin(t * 1.4) * 0.09; m.py = -14;
      m.sy = 1.03;
      o.eyes = EYES.half; o.mouth = MOUTH.o; o.noBlink = true;
      break;
    }
    case 'frozen': break; // the view holds the previous frame
    case 'strip': {
      // Three beats: tug shirt overhead -> hip shimmy -> shameless ta-da reveal.
      if (t < 0.75) {
        const f = frame(t, 8, 2);
        both(spec, f ? ARM.up : ARM.v);
        spec.headDy = f ? 1 : 0;
        m.x = Math.sin(t * 28) * 0.9;
        o.mouth = MOUTH.o; o.fxAdd = FX.blush2;
      } else if (t < 1.55) {
        const f = frame(t, 6, 2);
        both(spec, f ? ARM.hips : ARM.out);
        spec.legs = sv ? (f ? LEGS.sideA : LEGS.sideB) : (f ? LEGS.danceL : LEGS.danceR);
        m.x = Math.sin(t * 14) * 1.4;
        m.y = -Math.abs(Math.sin(t * 7)) * 1.8;
        o.eyes = EYES.wink; o.mouth = MOUTH.cheshire; o.fxAdd = FX.blush2;
      } else {
        both(spec, ARM.v);
        spec.legs = sv ? LEGS.sideA : LEGS.spread;
        m.y = -Math.abs(Math.sin(t * 6)) * 2.2;
        m.rot = Math.sin(t * 5) * 0.08;
        o.eyes = EYES.wink; o.mouth = MOUTH.cheshire; o.fxAdd = FX.blush2;
      }
      m.py = 0;
      o.emo = 'excited'; o.emoMin = 0.7;
      break;
    }
    case 'kiss': {
      const lean = fd || (view === VIEW.front ? 1 : -1);
      arms(spec, view, ARM.hugHi, ARM.hugLo);
      spec.legs = sv ? LEGS.sideStand : LEGS.together;
      m.x = lean * 2.2;
      m.rot = lean * 0.13;
      m.py = -4;
      m.sy = 1 + Math.sin(t * 4) * 0.02;
      o.eyes = EYES.shut; o.noBlink = true;
      o.mouth = MOUTH.pout;
      o.fxAdd = FX.blush2;
      o.emo = 'love'; o.emoMin = 0.85;
      break;
    }
    case 'makeOut': {
      const lean = fd || (view === VIEW.front ? 1 : -1);
      const sw = Math.sin(t * 7);
      arms(spec, view, Math.floor(t * 3) % 2 ? ARM.hugHi : ARM.cheek, ARM.hugLo);
      spec.legs = sv ? LEGS.sideA : LEGS.spread;
      m.x = lean * 2.8 + sw * 0.6;
      m.rot = lean * 0.17 + sw * 0.05;
      m.y = -Math.abs(sw) * 0.9;
      m.sy = 0.98 + Math.abs(sw) * 0.04;
      m.py = -6;
      o.eyes = Math.floor(t * 2) % 2 ? EYES.shut : EYES.heart;
      o.noBlink = true;
      o.mouth = Math.floor(t * 4) % 2 ? MOUTH.o : MOUTH.open;
      o.fxAdd = FX.blush2;
      o.emo = 'love'; o.emoMin = 0.95;
      break;
    }
    case 'lapDance': {
      const ph = Math.sin(t * 5.2);
      const f = frame(t, 4, 4);
      arms(spec, view, f === 0 ? ARM.head : f === 2 ? ARM.waveA : ARM.hips, ARM.hips);
      spec.legs = sv ? (f % 2 ? LEGS.sideA : LEGS.sideB) : (f === 0 ? LEGS.crouch : f === 2 ? LEGS.spread : LEGS.danceL);
      spec.bodyDy = f % 2 ? 1 : 0;
      m.x = ph * 2.0;
      m.y = -Math.abs(ph) * 2.2 + 0.8;
      m.rot = ph * 0.16;
      m.py = 0;
      o.eyes = f % 2 ? EYES.wink : EYES.half;
      o.mouth = f % 2 ? MOUTH.cheshire : MOUTH.tongue;
      o.fxAdd = FX.blush2;
      o.emo = 'mischievous'; o.emoMin = 0.85;
      break;
    }
    case 'grinding': {
      const drive = Math.sin(t * 11);
      const dir = fd || (view === VIEW.front ? 1 : -1);
      const f = frame(t, 6, 2);
      arms(spec, view, f ? ARM.hugHi : ARM.forwardUp, f ? ARM.hugLo : ARM.head);
      spec.legs = sv ? (f ? LEGS.sideA : LEGS.sideB) : (f ? LEGS.spread : LEGS.crouch);
      spec.bodyDy = f ? 1 : 0;
      spec.headDy = f ? 1 : 0;
      m.x = dir * (1.6 + drive * 1.4);
      m.y = -Math.abs(drive) * 2.0;
      m.rot = dir * (0.08 + drive * 0.08);
      m.sy = 1 - Math.abs(drive) * 0.07;
      m.sx = 2 - m.sy;
      m.py = -6;
      o.eyes = f ? EYES.squeeze : EYES.heart;
      o.noBlink = true;
      o.mouth = f ? MOUTH.o : MOUTH.open;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'love'; o.emoMin = 0.95;
      break;
    }
    case 'spank': {
      const cyc = (t * 1.7) % 1;
      const wind = cyc < 0.4;
      const dir = fd || (view === VIEW.front ? 1 : -1);
      arms(spec, view, wind ? (sv ? ARM.sideB : ARM.waveB) : (sv ? ARM.sidePoint : ARM.across), ARM.hips);
      spec.legs = sv ? LEGS.sideA : LEGS.spread;
      m.x = wind ? -dir * 1.0 : dir * 2.4;
      m.rot = wind ? -dir * 0.1 : dir * 0.15;
      m.py = 0;
      o.eyes = EYES.wink; o.mouth = MOUTH.cheshire; o.fxAdd = FX.blush;
      o.emo = 'mischievous'; o.emoMin = 0.8;
      break;
    }
    case 'selfTouch': {
      const rock = Math.sin(t * 12);
      const f = frame(t, 8, 2);
      arms(spec, view, ARM.belly, ARM.across);
      spec.legs = sv ? LEGS.sitSide : (f ? LEGS.crouch : LEGS.spread);
      spec.bodyDy = 2;
      spec.headDy = f ? 1 : 0;
      m.x = rock * 0.9;
      m.y = -Math.abs(rock) * 1.2;
      m.sy = 0.95 + Math.abs(rock) * 0.05;
      m.py = 0;
      o.eyes = f ? EYES.squeeze : EYES.shut;
      o.noBlink = true;
      o.mouth = f ? MOUTH.o : MOUTH.wavy;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'embarrassed'; o.emoMin = 0.9;
      break;
    }
    case 'seduce': {
      const sway = Math.sin(t * 3.2);
      arms(spec, view, Math.floor(t * 1.2) % 2 ? ARM.cheek : ARM.waveA, ARM.hips);
      spec.legs = sv ? LEGS.sideStand : LEGS.danceL;
      spec.headDx = sway > 0.5 ? 1 : sway < -0.5 ? -1 : 0;
      m.x = sway * 1.3;
      m.rot = sway * 0.09;
      m.py = 0;
      o.eyes = Math.floor(t * 2) % 2 ? EYES.wink : EYES.half;
      o.mouth = MOUTH.smirkBig;
      o.fxAdd = FX.blush;
      o.emo = 'mischievous'; o.emoMin = 0.7;
      break;
    }
    case 'twerk': {
      const bounce = Math.sin(t * 14);
      const f = frame(t, 7, 2);
      both(spec, ARM.hips);
      spec.legs = sv ? LEGS.sideA : (f ? LEGS.crouch : LEGS.spread);
      spec.bodyDy = 2;
      m.y = -Math.abs(bounce) * 2.6;
      m.sy = 0.88 + Math.abs(bounce) * 0.14;
      m.sx = 2 - m.sy;
      m.rot = (fd || 1) * bounce * 0.14;
      m.py = 0;
      o.eyes = EYES.wink; o.mouth = MOUTH.laugh; o.fxAdd = FX.blush2;
      o.emo = 'excited'; o.emoMin = 0.8;
      break;
    }
    case 'backflip': {
      const cyc = (t % 1.4) / 1.4;
      if (cyc < 0.18) {
        both(spec, ARM.down);
        spec.legs = LEGS.crouch;
        spec.bodyDy = 2;
        m.sy = 0.84; m.sx = 1.14;
      } else if (cyc < 0.72) {
        const k = (cyc - 0.18) / 0.54;
        both(spec, ARM.out);
        spec.legs = LEGS.together;
        m.y = -Math.sin(k * Math.PI) * 16;
        m.rot = -k * TAU;
        m.py = -14;
      } else {
        both(spec, ARM.v);
        spec.legs = LEGS.spread;
        const k = (cyc - 0.72) / 0.28;
        m.sy = 1 - 0.16 * Math.sin(k * Math.PI);
        m.sx = 2 - m.sy;
      }
      o.emo = 'excited'; o.emoMin = 0.85;
      break;
    }
    case 'kneel': {
      both(spec, frame(t, 2, 2) ? ARM.forwardUp : ARM.forward);
      spec.legs = sv ? LEGS.sitSide : LEGS.kneel;
      spec.bodyDy = 2;
      spec.headDy = 1;
      m.y = Math.sin(t * 3) * 0.4;
      o.emo = 'love'; o.emoMin = 0.4;
      break;
    }
    case 'flex': {
      const f = frame(t, 1.5, 2);
      if (f === 0) {
        both(spec, ARM.up);
      } else {
        arms(spec, view, ARM.robotUp, ARM.hips);
      }
      spec.legs = sv ? LEGS.sideStand : LEGS.spread;
      m.sx = 1.09; m.sy = 0.96;
      m.y = -Math.abs(Math.sin(t * 4)) * 0.8;
      o.eyes = EYES.sparkle; o.mouth = MOUTH.grin;
      o.emo = 'proud'; o.emoMin = 0.85;
      break;
    }
    case 'whip': {
      const cyc = (t * 1.9) % 1;
      const wind = cyc < 0.35;
      const dir = fd || (view === VIEW.front ? 1 : -1);
      arms(spec, view, wind ? (sv ? ARM.sideB : ARM.waveB) : (sv ? ARM.sidePoint : ARM.across), ARM.hips);
      spec.legs = sv ? LEGS.sideA : LEGS.spread;
      m.x = wind ? -dir * 1.2 : dir * 2.6;
      m.rot = wind ? -dir * 0.14 : dir * 0.18;
      m.y = wind ? 0 : -Math.sin(((cyc - 0.35) / 0.65) * Math.PI) * 1.2;
      m.py = 0;
      o.eyes = EYES.wink; o.mouth = MOUTH.cheshire; o.fxAdd = FX.blush;
      o.emo = 'mischievous'; o.emoMin = 0.85;
      break;
    }
    case 'tieUp': {
      const f = frame(t, 6, 2);
      const wiggle = Math.sin(t * 9);
      arms(spec, view, ARM.belly, ARM.hugLo);
      spec.legs = sv ? (f ? LEGS.sideA : LEGS.sideStand) : (f ? LEGS.danceL : LEGS.spread);
      spec.headDy = f ? 1 : 0;
      m.x = wiggle * 1.3;
      m.rot = wiggle * 0.08;
      m.sy = 0.96 + Math.abs(wiggle) * 0.04;
      m.py = 0;
      o.eyes = f ? EYES.shut : EYES.squeeze;
      o.noBlink = true;
      o.mouth = f ? MOUTH.pout : MOUTH.wavy;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'embarrassed'; o.emoMin = 0.9;
      break;
    }
    case 'worship': {
      const sway = Math.sin(t * 4.5);
      const dir = fd || (view === VIEW.front ? 1 : -1);
      both(spec, frame(t, 3, 2) ? ARM.forwardUp : ARM.v);
      spec.legs = sv ? LEGS.sitSide : LEGS.kneel;
      spec.bodyDy = 2;
      spec.headDy = 1;
      m.x = dir * 1.2 + sway * 0.5;
      m.y = Math.sin(t * 5) * 0.6;
      m.rot = dir * 0.09 + sway * 0.04;
      m.py = 0;
      o.eyes = EYES.heart;
      o.noBlink = true;
      o.mouth = MOUTH.o;
      o.fxAdd = FX.blush2;
      o.emo = 'love'; o.emoMin = 0.85;
      break;
    }
    case 'dominate': {
      const dir = fd || (view === VIEW.front ? 1 : -1);
      const beat = Math.sin(t * 3.5);
      arms(spec, view, sv ? ARM.sidePoint : ARM.point, ARM.hips);
      spec.legs = sv ? LEGS.sideA : LEGS.spread;
      m.x = dir * (1.2 + beat * 0.4);
      m.rot = dir * 0.1;
      m.sy = 1.03;
      m.py = 0;
      o.eyes = EYES.half;
      o.mouth = MOUTH.smirkBig;
      o.emo = 'smug'; o.emoMin = 0.85;
      break;
    }
    case 'lick': {
      const dip = Math.abs(Math.sin(t * 7));
      const dir = fd || (view === VIEW.front ? 1 : -1);
      arms(spec, view, Math.floor(t * 3) % 2 ? ARM.cheek : ARM.chin, ARM.hips);
      spec.legs = sv ? LEGS.sideStand : LEGS.spread;
      spec.headDy = dip > 0.5 ? 1 : 0;
      m.x = dir * (2.0 + dip * 0.8);
      m.rot = dir * (0.12 + dip * 0.05);
      m.y = -dip * 0.8;
      m.py = -4;
      o.eyes = EYES.wink;
      o.noBlink = true;
      o.mouth = MOUTH.tongue;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'mischievous'; o.emoMin = 0.9;
      break;
    }
    case 'peep': {
      const glance = frame(t, 1.8, 2);
      arms(spec, view, glance ? ARM.chin : ARM.eyes, ARM.down);
      spec.legs = sv ? LEGS.sitSide : LEGS.crouch;
      spec.bodyDy = 2;
      spec.headDx = glance ? 1 : -1;
      m.x = Math.sin(t * 3.2) * 0.9;
      m.y = 1;
      m.py = 0;
      o.eyes = glance ? EYES.glanceR : EYES.glanceL;
      o.mouth = MOUTH.smirkBig;
      o.fxAdd = FX.sweat;
      o.emo = 'mischievous'; o.emoMin = 0.75;
      break;
    }
    case 'tableDance': {
      const f = frame(t, 4, 4);
      const bounce = Math.abs(Math.sin(t * 9));
      const tilt = Math.sin(t * 4.5);
      arms(spec, view, f === 0 ? ARM.v : f === 2 ? ARM.head : ARM.hips, ARM.hips);
      spec.legs = sv ? (f % 2 ? LEGS.sideA : LEGS.sideB) : (f % 2 ? LEGS.danceL : LEGS.spread);
      m.x = tilt * 2.2;
      m.y = -5 - bounce * 3.5;
      m.rot = tilt * 0.14;
      m.sy = 0.94 + bounce * 0.08;
      m.sx = 2 - m.sy;
      m.py = 0;
      o.eyes = EYES.wink;
      o.mouth = f % 2 ? MOUTH.tongue : MOUTH.laugh;
      o.fxAdd = FX.blush2;
      o.emo = 'excited'; o.emoMin = 0.9;
      break;
    }
    case 'cowgirl': {
      const bounce = Math.sin(t * 6.2);
      const f = frame(t, 6, 2);
      both(spec, f ? ARM.forward : ARM.forwardUp);
      spec.legs = sv ? (f ? LEGS.sideA : LEGS.sideB) : LEGS.spread;
      spec.bodyDy = 1;
      m.y = -Math.abs(bounce) * 2.6 + 0.8;
      m.sy = 1 - Math.abs(bounce) * 0.05;
      m.sx = 2 - m.sy;
      m.rot = bounce * 0.06;
      m.py = -2;
      o.eyes = f ? EYES.heart : EYES.half;
      o.noBlink = true;
      o.mouth = f ? MOUTH.open : MOUTH.o;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'love'; o.emoMin = 0.95;
      break;
    }
    case 'reverseCowgirl': {
      const bounce = Math.sin(t * 6.2);
      const f = frame(t, 5, 2);
      both(spec, f ? ARM.hips : ARM.out);
      spec.legs = sv ? (f ? LEGS.sideA : LEGS.sideB) : LEGS.spread;
      spec.bodyDy = 1;
      m.y = -Math.abs(bounce) * 2.4 + 0.8;
      m.sy = 1 - Math.abs(bounce) * 0.05;
      m.sx = 2 - m.sy;
      m.rot = -bounce * 0.07;
      m.py = -2;
      o.eyes = f ? EYES.wink : EYES.heart;
      o.noBlink = true;
      o.mouth = MOUTH.cheshire;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'mischievous'; o.emoMin = 0.9;
      break;
    }
    case 'missionary': {
      const pump = Math.sin(t * 6.5);
      const f = frame(t, 7, 2);
      const flip = lyingFlip(st, view);
      both(spec, f ? ARM.belly : ARM.forwardUp);
      spec.legs = LEGS.spread;
      spec.view = VIEW.front;
      spec.headDy = f ? 1 : 0;
      m.rot = flip ? Math.PI / 2 : -Math.PI / 2; m.py = 0;
      m.x = (flip ? -15 : 15) + pump * (flip ? -1.1 : 1.1);
      m.y = -6 + pump * 0.4;
      m.sy = 1 + Math.abs(pump) * 0.02;
      o.eyes = f ? EYES.heart : EYES.shut;
      o.noBlink = true;
      o.mouth = f ? MOUTH.open : MOUTH.o;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'love'; o.emoMin = 0.95;
      break;
    }
    case 'doggy': {
      const push = Math.sin(t * 7);
      const f = frame(t, 7, 2);
      both(spec, f ? ARM.forward : ARM.belly);
      spec.legs = sv ? LEGS.sideA : LEGS.spread;
      spec.bodyDy = 3;
      spec.headDy = 1;
      m.x = push * 0.9;
      m.y = -Math.abs(push) * 0.7 - 0.5;
      m.rot = 0.14 * (fd || 1) + push * 0.03;
      m.py = -8;
      o.eyes = f ? EYES.squeeze : EYES.half;
      o.noBlink = true;
      o.mouth = f ? MOUTH.o : MOUTH.open;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'love'; o.emoMin = 0.92;
      break;
    }
    case 'blowjob': {
      const bob = Math.sin(t * 8.5);
      const f = frame(t, 9, 2);
      both(spec, ARM.forwardUp);
      spec.legs = sv ? LEGS.sitSide : LEGS.kneel;
      spec.bodyDy = 2;
      spec.headDy = 2 + (bob > 0.35 ? 1 : 0);
      m.y = bob * 0.6 - 0.8;
      m.rot = 0.1 * (fd || 1);
      m.py = -8;
      o.eyes = f ? EYES.shut : EYES.half;
      o.noBlink = true;
      o.mouth = f ? MOUTH.o : MOUTH.open;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'love'; o.emoMin = 0.9;
      break;
    }
    case 'handjob': {
      const f = frame(t, 12, 2);
      arms(spec, view, f ? ARM.forward : ARM.forwardUp, ARM.hips);
      spec.legs = sv ? LEGS.sideStand : LEGS.together;
      spec.bodyDy = 1;
      m.x = Math.sin(t * 12) * 0.4;
      m.rot = 0.05 * (fd || 1);
      m.py = -4;
      o.eyes = EYES.half;
      o.mouth = MOUTH.smirk;
      o.fxAdd = FX.blush;
      o.emo = 'mischievous'; o.emoMin = 0.85;
      break;
    }
    case 'fingering': {
      const f = frame(t, 11, 2);
      arms(spec, view, f ? ARM.belly : ARM.across, ARM.hips);
      spec.legs = sv ? LEGS.sideA : LEGS.spread;
      spec.bodyDy = 1;
      m.x = Math.sin(t * 11) * 0.45;
      m.rot = 0.04 * (fd || 1);
      m.py = -4;
      o.eyes = f ? EYES.half : EYES.squeeze;
      o.mouth = f ? MOUTH.o : MOUTH.open;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'love'; o.emoMin = 0.9;
      break;
    }
    case 'sixtyNine': {
      const pump = Math.sin(t * 8);
      const f = frame(t, 8, 2);
      const flip = lyingFlip(st, view);
      both(spec, f ? ARM.forward : ARM.mouth);
      spec.legs = LEGS.together;
      spec.view = VIEW.front;
      m.rot = flip ? Math.PI / 2 : -Math.PI / 2; m.py = 0;
      m.x = (flip ? -15 : 15) + pump * (flip ? -1.2 : 1.2);
      m.y = -6 + pump * 0.5;
      m.sy = 1 + Math.abs(pump) * 0.03;
      o.eyes = f ? EYES.shut : EYES.squeeze;
      o.noBlink = true;
      o.mouth = f ? MOUTH.o : MOUTH.open;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'love'; o.emoMin = 0.95;
      break;
    }
    case 'facesit': {
      const rock = Math.sin(t * 4.6);
      const f = frame(t, 4, 2);
      both(spec, f ? ARM.hips : ARM.outDown);
      spec.legs = sv ? LEGS.sitSide : LEGS.crouch;
      spec.bodyDy = 2;
      spec.headDy = 1;
      m.y = -Math.abs(Math.sin(t * 5)) * 1.2 + 1;
      m.rot = rock * 0.08;
      m.py = -4;
      o.eyes = f ? EYES.wink : EYES.half;
      o.mouth = MOUTH.cheshire;
      o.fxAdd = FX.blush2;
      o.emo = 'mischievous'; o.emoMin = 0.85;
      break;
    }
    case 'orgasm': {
      const shudder = Math.sin(t * 17);
      const f = frame(t, 9, 2);
      both(spec, f ? ARM.v : ARM.out);
      spec.legs = sv ? LEGS.sideA : LEGS.spread;
      spec.bodyDy = f ? 1 : 0;
      spec.headDy = f ? 1 : 0;
      m.x = shudder * 0.9;
      m.y = -Math.abs(shudder) * 0.6;
      m.rot = shudder * 0.06;
      m.sy = 1 - Math.abs(shudder) * 0.06;
      m.sx = 2 - m.sy;
      m.py = -4;
      o.eyes = f ? EYES.squeeze : EYES.shut;
      o.noBlink = true;
      o.mouth = f ? MOUTH.shout : MOUTH.open;
      o.fxAdd = FX.blush2 | FX.sweat;
      o.emo = 'love'; o.emoMin = 0.95;
      break;
    }
    case 'flash': {
      const open = (t % 2.2) > 0.45;
      const f = frame(t, 6, 2);
      both(spec, open ? ARM.out : ARM.belly);
      spec.legs = sv ? LEGS.sideStand : (open ? LEGS.spread : LEGS.stand);
      m.x = Math.sin(t * 8) * 0.3;
      m.y = open ? -1.2 : 0;
      m.sy = open ? 0.97 : 1;
      m.sx = 2 - m.sy;
      m.rot = (fd || 1) * (open ? 0.06 : -0.04);
      m.py = -4;
      o.eyes = f ? EYES.wink : EYES.half;
      o.mouth = MOUTH.cheshire;
      o.fxAdd = FX.blush2;
      o.emo = 'mischievous'; o.emoMin = 0.85;
      break;
    }
  }
}

/** Idle body language from the emotion, and small fidgets chosen by variant. */
function idleMood(spec: FrameSpec, m: Motion, o: FaceOv, inp: PoseIn): void {
  const { t, st, view, lv, seated } = inp;
  const e = st.emotion;
  if (lv >= 2) {
    switch (e) {
      case 'happy': case 'excited': {
        const hop = e === 'excited' ? 2.2 : 0.9;
        m.y = -Math.abs(Math.sin(t * (e === 'excited' ? 8 : 4))) * hop * (seated ? 0.4 : 1);
        if (e === 'excited' && lv === 3) both(spec, frame(t, 4, 2) ? ARM.v : ARM.up);
        return;
      }
      case 'angry': case 'determined':
        both(spec, ARM.fist);
        if (lv === 3) m.x = Math.sin(t * 45) * 0.45;
        return;
      case 'sad': case 'tired': case 'bored':
        spec.headDy = Math.max(spec.headDy, 1);
        both(spec, e === 'bored' ? ARM.hips : ARM.limp);
        if (e === 'bored') both(spec, ARM.down);
        m.sy = 1 + (m.sy - 1) * 0.6;
        if (e === 'tired' && lv === 3) m.x = Math.sin(t * 0.8) * 0.8;
        if (e === 'sad' && lv === 3) arms(spec, view, ARM.eyes, ARM.limp);
        return;
      case 'scared': case 'nervous':
        m.x = Math.sin(t * 50) * (lv === 3 ? 0.55 : 0.3);
        if (lv === 3) { spec.armL = ARM.hugHi; spec.armR = ARM.hugLo; }
        else if (e === 'nervous') arms(spec, view, frame(t, 0.6, 2) ? ARM.belly : ARM.down, ARM.down);
        return;
      case 'confused': arms(spec, view, ARM.phone, ARM.down); return; // scratching the head
      case 'embarrassed': both(spec, ARM.belly); m.x = Math.sin(t * 1.5) * 0.6; return;
      case 'love': both(spec, ARM.belly); m.x = Math.sin(t * 1.6) * 0.8; spec.headDy = frame(t, 0.8, 2) ? -1 : 0; return;
      case 'smug': case 'proud': both(spec, ARM.hips); if (e === 'proud') spec.headDy = -1; return;
      case 'mischievous': both(spec, frame(t, 5, 2) ? ARM.forward : ARM.forwardUp); return;
      case 'surprised': both(spec, lv === 3 ? ARM.cheek : ARM.outDown); m.y = -0.5; return;
      case 'amused': both(spec, ARM.belly); spec.headDy = frame(t, 4, 2); return;
      case 'disgusted': both(spec, ARM.belly); m.x = -0.8 * (view === VIEW.left ? -1 : 1); return;
      case 'suspicious': both(spec, ARM.hips); o.eyes = frame(t, 0.5, 2) ? EYES.halfL : EYES.halfR; return;
      default: break;
    }
  }
  // fidgets
  const v = ((st.variant % 4) + 4) % 4;
  const cyc = (t + st.variant * 1.7) % 7;
  if (v === 1 && cyc > 4.5 && cyc < 5.6) o.eyes = cyc < 5.05 ? EYES.glanceL : EYES.glanceR;
  else if (v === 2) m.x = Math.sin(t * 0.9) * 0.5;
  else if (v === 3 && cyc > 5 && cyc < 6.2) arms(spec, view, ARM.phone, ARM.down);
}

function walkMood(spec: FrameSpec, m: Motion, inp: PoseIn): void {
  const { st, lv, t } = inp;
  if (lv < 2) return;
  if (st.emotion === 'sad' || st.emotion === 'tired') { spec.headDy = Math.max(spec.headDy, 1); m.y *= 0.5; }
  else if (st.emotion === 'happy' || st.emotion === 'excited') m.y *= 2.2;
  else if (st.emotion === 'angry') { both(spec, ARM.fist); m.x = Math.sin(t * 40) * 0.25; }
  else if (st.emotion === 'scared' || st.emotion === 'nervous') m.x = Math.sin(t * 50) * 0.3;
}

/** Five dance moves on the shared 120 bpm beat. */
function danceMove(spec: FrameSpec, m: Motion, o: FaceOv, inp: PoseIn): void {
  const { beat, st, view } = inp;
  const b = Math.floor(beat);
  const ph = beat - b;
  const bounce = Math.abs(Math.sin(ph * Math.PI));
  const sv = side(view);
  const move = ((st.variant % 5) + 5) % 5;
  m.py = 0;
  o.emo = 'happy'; o.emoMin = 0.6;
  switch (move) {
    case 0: // disco point
      if (b % 2 === 0) { arms(spec, view, ARM.v, ARM.hips); spec.legs = sv ? LEGS.sideA : LEGS.danceR; }
      else { arms(spec, view, ARM.across, ARM.hips); spec.legs = sv ? LEGS.sideStand : LEGS.stand; }
      m.x = (b % 2 ? -1 : 1) * 1.2 * easeOut(Math.min(1, ph * 3));
      m.y = -bounce * 1.5;
      break;
    case 1: // raise the roof
      both(spec, ph < 0.5 ? ARM.up : ARM.waveA);
      spec.legs = sv ? LEGS.sideStand : b % 2 ? LEGS.danceL : LEGS.danceR;
      m.y = -bounce * 2.5; m.sy = ph < 0.1 ? 0.94 : 1;
      break;
    case 2: // robot: stiff, stepped
      spec.armL = b % 2 ? ARM.robotUp : ARM.robotDown; spec.armR = b % 2 ? ARM.robotDown : ARM.robotUp;
      spec.headDx = b % 4 === 1 ? 1 : b % 4 === 3 ? -1 : 0;
      m.x = (b % 4 < 2 ? 1 : -1) * 0.8;
      o.eyes = EYES.rest; o.mouth = MOUTH.flat; o.emo = null;
      break;
    case 3: // the twist
      spec.legs = sv ? (b % 2 ? LEGS.sideA : LEGS.sideB) : b % 2 ? LEGS.danceL : LEGS.danceR;
      spec.armL = b % 2 ? ARM.swingF : ARM.out; spec.armR = b % 2 ? ARM.out : ARM.swingF;
      m.rot = Math.sin(beat * Math.PI) * 0.12;
      m.y = -bounce * 1 + 1.5; m.sy = 0.96;
      break;
    case 4: // the chicken
      both(spec, ph < 0.5 ? ARM.hips : ARM.shrug);
      spec.headDx = b % 2 ? 1 : -1;
      spec.legs = sv ? LEGS.sideStand : ph < 0.5 ? LEGS.stand : LEGS.together;
      m.y = -bounce * 1.8;
      o.emo = 'amused'; o.emoMin = 0.8;
      break;
  }
}
