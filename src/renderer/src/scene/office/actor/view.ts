// One drawn, animated person on the office floor (ActorView).
//
// Container chain (outer to inner), so each kind of motion has its own pivot:
//   container  at the feet (x, y); zIndex = y (+ a big bonus while lifted)
//   lifter     seat tuck-in offset, and `lift` px up
//   scaler     PersonState.scale, about the feet
//   squash     anim motion offset and squash/stretch, about the feet
//   rotor      anim rotation about a pivot (feet, chest, or the grab point)
//   sprite     the pixel frame, feet at the origin
// Frames come from a per-sprite texture cache; nothing is allocated per frame.

import { Container, Graphics, Sprite } from 'pixi.js';
import type { ActorView } from '@/game/view/api';
import type { PersonState } from '@/game/view/api';
import type { AnimId, CharId, Vec } from '@/game/core/types';
import { FEET_X, FEET_Y, PROPS, HEADGEAR, STATUS, VIEW, newSpec, specKey, type FrameSpec } from './art';
import { EYES, FX, emotionFace, eyesCanBlink, faceKey, levelOf, talkMouth, type Face } from './faces';
import { pose, resetFaceOv, resetMotion, STANDING_ONLY, type FaceOv, type Motion, type PoseIn } from './poses';
import { cacheFor, cacheTick, type FrameCache } from './cache';

// The original game's seat tuck-in (scene/office/Character.ts).
const SIT_OFFSET = 5;
const SIT_OFFSET_DOWN = 12;
const SIT_OFFSET_UP = 5;
const SIT_OFFSET_SIDE = 4;
const SEAT_LEG_CROP = 8;
const SEAT_BACK_CROP = 2;

/** Seconds to cross-fade the container motion between anims. */
const BLEND_TIME = 0.24;
/** zIndex bonus while lifted, so held people draw over everything. */
const LIFT_Z = 100000;

/** Shared clock so dancers everywhere keep the same beat. */
let floorClock = 0;

const PROP_INDEX = new Map<string, number>(PROPS.map((p, i) => [p, i + 1]));
const GEAR_INDEX = new Map<string, number>(HEADGEAR.map((g, i) => [g, i + 1]));
const TALK_PATTERN = [1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1];

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class Actor implements ActorView {
  readonly container = new Container();
  readonly shadow = new Container();
  private readonly lifter = new Container();
  private readonly scaler = new Container();
  private readonly squash = new Container();
  private readonly rotor = new Container();
  private readonly sprite = new Sprite();
  private readonly shadowG = new Graphics();
  private readonly ringG = new Graphics();
  private readonly cache: FrameCache;

  private readonly spec: FrameSpec = newSpec();
  private readonly scratch: FrameSpec = newSpec();
  private readonly face: Face = { brow: 0, eyes: 0, mouth: 0, fx: 0 };
  private readonly mCur: Motion = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, py: -14 };
  private readonly mPrev: Motion = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, py: -14 };
  private readonly mOut: Motion = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, py: -14 };
  private readonly oCur: FaceOv = { brow: -1, eyes: -1, mouth: -1, fxAdd: 0, emo: null, emoMin: 0, noBlink: false, tint: 0xffffff };
  private readonly oPrev: FaceOv = { brow: -1, eyes: -1, mouth: -1, fxAdd: 0, emo: null, emoMin: 0, noBlink: false, tint: 0xffffff };
  private readonly inp: PoseIn;
  private readonly inpPrev: PoseIn;

  private animCur: AnimId = 'idle';
  private animPrev: AnimId = 'idle';
  private t = 0;
  private tPrev = 0;
  private blend = 1;
  private clock = floorClock;
  private blinkIn = 1 + Math.random() * 3;
  private blinkLeft = 0;
  private talkT = 0;
  private swing = 0;
  private swingV = 0;
  private lastVx = 0;
  private sitX = 0;
  private sitY = 0;
  private started = false;
  private crop = 0;

  // last transform, for the accessors
  private wx = 0; private wy = 0; private wLift = 0; private wScale = 1;

  constructor(readonly id: CharId, sprite: string) {
    this.cache = cacheFor(sprite);
    this.container.label = `actor:${id}`;
    this.container.addChild(this.lifter);
    this.lifter.addChild(this.scaler);
    this.scaler.addChild(this.squash);
    this.squash.addChild(this.rotor);
    this.rotor.addChild(this.sprite);
    this.sprite.position.set(-FEET_X, -FEET_Y);
    this.sprite.roundPixels = false;

    // pixel shadow: a small stepped ellipse
    this.shadowG.rect(-6, -1, 12, 2).fill({ color: 0x1a1420, alpha: 0.3 });
    this.shadowG.rect(-4, -2, 8, 1).fill({ color: 0x1a1420, alpha: 0.3 });
    this.shadowG.rect(-4, 1, 8, 1).fill({ color: 0x1a1420, alpha: 0.3 });
    // selection ring: a pixel ellipse with a dark drop under it
    const ring = (g: Graphics, dy: number, color: number) => {
      g.rect(-4, -4 + dy, 8, 1).fill(color); g.rect(-4, 3 + dy, 8, 1).fill(color);
      g.rect(-6, -3 + dy, 2, 1).fill(color); g.rect(4, -3 + dy, 2, 1).fill(color);
      g.rect(-6, 2 + dy, 2, 1).fill(color); g.rect(4, 2 + dy, 2, 1).fill(color);
      g.rect(-7, -2 + dy, 1, 4).fill(color); g.rect(6, -2 + dy, 1, 4).fill(color);
    };
    ring(this.ringG, 1, 0x5a3c10);
    ring(this.ringG, 0, 0xffd84a);
    this.ringG.visible = false;
    this.shadow.addChild(this.shadowG, this.ringG);
    this.shadow.label = `shadow:${id}`;

    const st = null as unknown as PersonState;
    this.inp = { t: 0, beat: 0, st, view: 0, seated: false, lv: 0, swing: 0 };
    this.inpPrev = { t: 0, beat: 0, st, view: 0, seated: false, lv: 0, swing: 0 };
  }

  update(dt: number, st: PersonState): void {
    cacheTick();
    // Frozen holds the last frame; if there is none yet, pose once as idle first.
    const frozen = (st.anim === 'frozen' || st.statuses.includes('frozen')) && this.started;
    const d = frozen ? 0 : Math.min(dt, 0.1);
    this.clock += d;
    if (this.clock > floorClock) floorClock = this.clock;
    if (!this.started) { this.started = true; this.animCur = st.anim === 'frozen' ? 'idle' : st.anim; this.animPrev = this.animCur; }

    if (!frozen && st.anim !== this.animCur && st.anim !== 'frozen') {
      this.animPrev = this.animCur;
      this.tPrev = this.t;
      this.animCur = st.anim;
      this.t = 0;
      this.blend = 0;
    }
    this.t += d;
    this.tPrev += d;
    if (this.blend < 1) this.blend = Math.min(1, this.blend + d / BLEND_TIME);

    const anim = this.animCur;
    const seated = st.seated && !STANDING_ONLY.has(anim);
    const view = st.facing === 'up' ? VIEW.back : st.facing === 'left' ? VIEW.left : st.facing === 'right' ? VIEW.right : VIEW.front;
    const spec = this.spec;

    // held: a pendulum hanging from the grab point, pushed by the hand's motion
    if (anim === 'held') {
      const ax = d > 0 ? (st.vx - this.lastVx) / d : 0;
      const eq = clamp(st.vx * 0.0035, -0.75, 0.75);
      const acc = -38 * (this.swing - eq) - 2.2 * this.swingV + clamp(ax, -3000, 3000) * 0.0016;
      this.swingV += acc * d;
      this.swing = clamp(this.swing + this.swingV * d, -1.3, 1.3);
    } else {
      this.swing += (0 - this.swing) * (1 - Math.exp(-d * 10));
      this.swingV = 0;
    }
    this.lastVx = st.vx;

    if (!frozen) {
      spec.view = view;
      spec.prop = st.prop ? PROP_INDEX.get(st.prop) ?? 0 : 0;
      const inp = this.inp;
      inp.t = this.t; inp.beat = this.clock * 2; inp.st = st; inp.view = view; inp.seated = seated;
      inp.lv = levelOf(st.intensity); inp.swing = this.swing;
      resetFaceOv(this.oCur);
      pose(anim, inp, spec, this.mCur, this.oCur);

      if (this.blend < 1) {
        const ip = this.inpPrev;
        ip.t = this.tPrev; ip.beat = inp.beat; ip.st = st; ip.view = view;
        ip.seated = st.seated && !STANDING_ONLY.has(this.animPrev); ip.lv = inp.lv; ip.swing = this.swing;
        this.scratch.view = view; this.scratch.prop = spec.prop;
        resetFaceOv(this.oPrev);
        pose(this.animPrev, ip, this.scratch, this.mPrev, this.oPrev);
        const k = ease(this.blend), a = this.mPrev, b = this.mCur, o = this.mOut;
        o.x = a.x + (b.x - a.x) * k; o.y = a.y + (b.y - a.y) * k; o.rot = a.rot + (b.rot - a.rot) * k;
        o.sx = a.sx + (b.sx - a.sx) * k; o.sy = a.sy + (b.sy - a.sy) * k; o.py = a.py + (b.py - a.py) * k;
      } else {
        const b = this.mCur, o = this.mOut;
        o.x = b.x; o.y = b.y; o.rot = b.rot; o.sx = b.sx; o.sy = b.sy; o.py = b.py;
      }

      this.updateFace(d, st, spec.view);
      spec.headgear = st.headgear ? GEAR_INDEX.get(st.headgear) ?? 0 : 0;
      let status = 0;
      for (let i = 0; i < st.statuses.length; i++) {
        const s = st.statuses[i];
        if (s === 'wet') status |= STATUS.wet;
        else if (s === 'sooty') status |= STATUS.sooty;
        else if (s === 'frizzy') status |= STATUS.frizzy;
        else if (s === 'stung') status |= STATUS.stung;
        else if (s === 'crowned' && !spec.headgear) spec.headgear = 1;
        else if (s === 'party' && !spec.headgear) spec.headgear = 2;
      }
      if (status & STATUS.wet && Math.floor(this.clock * 2.5) % 2) status |= STATUS.dripPhase;
      spec.status = status;
      this.crop = seated && anim !== 'lie' ? (spec.view === VIEW.front ? SEAT_LEG_CROP : SEAT_BACK_CROP) : 0;
    }

    const faceK = spec.view === VIEW.back ? 0 : faceKey(this.face);
    spec.face = faceK;
    const tex = this.cache.get(faceK, specKey(spec, 0), spec, this.crop);
    if (this.sprite.texture !== tex) this.sprite.texture = tex;

    // seat tuck-in, eased
    let tx = 0, ty = 0;
    if (seated) {
      if (st.facing === 'down') ty = SIT_OFFSET_DOWN;
      else if (st.facing === 'up') ty = SIT_OFFSET_UP;
      else { tx = st.facing === 'left' ? -SIT_OFFSET : SIT_OFFSET; ty = SIT_OFFSET_SIDE; }
    }
    const ks = this.wasPlaced ? 1 - Math.exp(-d * 14) : 1;
    this.sitX += (tx - this.sitX) * ks;
    this.sitY += (ty - this.sitY) * ks;
    this.wasPlaced = true;

    const m = this.mOut;
    this.container.position.set(st.x, st.y);
    this.container.zIndex = st.y + (st.lift > 1 || anim === 'held' ? LIFT_Z : 0);
    this.container.visible = st.visible;
    this.container.alpha = st.alpha;
    this.lifter.position.set(this.sitX, this.sitY - st.lift);
    this.scaler.scale.set(st.scale);
    this.squash.position.set(m.x, m.y);
    this.squash.scale.set(m.sx, m.sy);
    this.rotor.pivot.set(0, m.py);
    this.rotor.position.set(0, m.py);
    this.rotor.rotation = m.rot;
    this.sprite.tint = frozen ? 0xc4d8ff : this.oCur.tint;

    // shadow on the floor, shrinking and fading as the body rises
    const k = clamp(1 - st.lift / 90, 0.3, 1);
    this.shadow.position.set(st.x + this.sitX * 0.5, st.y);
    this.shadow.visible = st.visible;
    this.shadow.alpha = st.alpha;
    this.shadowG.scale.set(k * st.scale * (anim === 'lie' ? 2 : 1), k * st.scale);
    this.shadowG.alpha = 0.35 + 0.65 * k;
    this.shadowG.visible = !seated;
    this.ringG.visible = st.selected;
    if (st.selected) {
      const p = 0.5 + 0.5 * Math.sin(this.clock * 5);
      this.ringG.alpha = 0.65 + 0.35 * p;
      this.ringG.scale.set(st.scale * (1 + 0.06 * p));
    }

    this.wx = st.x; this.wy = st.y; this.wLift = st.lift; this.wScale = st.scale;
  }
  private wasPlaced = false;

  private updateFace(d: number, st: PersonState, view: number): void {
    const o = this.oCur;
    const f = this.face;
    let emo = st.emotion, inten = st.intensity;
    if (o.emo && (emo === 'neutral' || inten < o.emoMin) && (emo === 'neutral' || o.emo === emo || inten < 0.4)) { emo = o.emo; inten = Math.max(inten, o.emoMin); }
    emotionFace(emo, inten, f);
    if (o.brow >= 0) f.brow = o.brow;
    if (o.eyes >= 0) f.eyes = o.eyes;
    if (o.mouth >= 0) f.mouth = o.mouth;
    f.fx |= o.fxAdd;
    const ss = st.statuses;
    if (ss.includes('asleep')) f.eyes = EYES.shut;
    else if (ss.includes('dizzy')) f.eyes = Math.floor(this.clock * 6) % 2 ? EYES.spiralA : EYES.spiralB;
    else if (ss.includes('love') && f.eyes !== EYES.shut) f.eyes = EYES.heart;
    if (view === VIEW.right && f.eyes === EYES.rest) f.eyes = EYES.glanceR;
    else if (view === VIEW.left && f.eyes === EYES.rest) f.eyes = EYES.glanceL;

    // blink
    this.blinkIn -= d;
    if (this.blinkIn <= 0) {
      this.blinkLeft = 0.11;
      this.blinkIn = Math.random() < 0.15 ? 0.25 : 2 + Math.random() * 3.5;
    }
    if (this.blinkLeft > 0) {
      this.blinkLeft -= d;
      if (!o.noBlink && eyesCanBlink(f.eyes)) f.eyes = EYES.shut;
    }
    // talking: the mouth opens and closes on an uneven pattern
    if (st.talking) {
      this.talkT += d;
      if (TALK_PATTERN[Math.floor(this.talkT * 9) % TALK_PATTERN.length]) f.mouth = talkMouth(f.mouth);
    } else this.talkT = 0;
    if (f.fx & (FX.tear1 | FX.tear2) && Math.floor(this.clock * 4) % 2) f.fx |= FX.tearPhase;
  }

  /** Transform a point in sprite space (feet at 0,0) to world pixels. */
  private toWorld(lx: number, ly: number, out: Vec): Vec {
    const m = this.mOut;
    const c = Math.cos(m.rot), s = Math.sin(m.rot);
    const yy = ly - m.py;
    let x = lx * c - yy * s;
    let y = lx * s + yy * c + m.py;
    x = x * m.sx + m.x; y = y * m.sy + m.y;
    x *= this.wScale; y *= this.wScale;
    out.x = this.wx + this.sitX + x;
    out.y = this.wy + this.sitY - this.wLift + y;
    return out;
  }

  headTop(): Vec {
    const top = -31 + this.spec.bodyDy + this.spec.headDy - (this.spec.headgear ? 3 : 0);
    return this.toWorld(0, top, { x: 0, y: 0 });
  }

  chest(): Vec { return this.toWorld(0, -14 + this.spec.bodyDy, { x: 0, y: 0 }); }

  hitBox(): { x: number; y: number; w: number; h: number } {
    const bottom = -this.crop;
    const p = { x: 0, y: 0 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      this.toWorld(i % 2 ? 8 : -8, i < 2 ? -31 : bottom, p);
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  destroy(): void {
    // Textures belong to the shared cache: do not destroy them with the sprite.
    this.sprite.texture = null as never;
    this.container.destroy({ children: true });
    this.shadow.destroy({ children: true });
  }
}

export { resetMotion };
