// One-shot effects: lightning, flashes, explosions, poofs, splashes, sparks,
// impacts, bursts, emotes, floating text, rings, swirls and zaps.

import { Container, Sprite, Texture } from 'pixi.js';
import type { EmoteIcon, FxCue, FxPerson } from '@/game/view/api';
import { MAP_PX_H } from '@/game/core/world';
import { pick, rr, type Env } from './core';
import { emoteTex, shapeTex, squareTex, textPix } from './art';
import { emitBurst, emitDrift, emitPoof, emitSpark, emitSplash, sparkles } from './emit';
import { Land, Layer } from './particles';
import { explosionFrames, poolTex, ringFrames } from './procedural';
import { LineCanvas, jagged } from './bolt';
import { easeOutBack, mix, rng } from './pix';

/** A running one-shot. Returns false from tick when finished. */
export interface Active {
  tick(dt: number, env: Env): boolean;
  dispose(): void;
}

function findPerson(people: readonly FxPerson[], id: string): FxPerson | null {
  for (let i = 0; i < people.length; i++) if (people[i].id === id) return people[i];
  return null;
}

// ── a sprite that plays frames once at a spot ───────────────────────────────

class FramePlay implements Active {
  private t = 0;
  constructor(private s: Sprite, private frames: Texture[], private fps: number, private fadeTail = 0.3) {
    s.texture = frames[0];
  }
  tick(dt: number): boolean {
    this.t += dt;
    const n = this.frames.length;
    const f = Math.floor(this.t * this.fps);
    if (f >= n) return false;
    this.s.texture = this.frames[f];
    if (f >= n * (1 - this.fadeTail)) this.s.alpha = Math.max(0.33, this.s.alpha - 0.34);
    return true;
  }
  dispose(): void {
    this.s.destroy();
  }
}

function playAt(env: Env, layer: Container, frames: Texture[], x: number, y: number, fps: number, tint = 0xffffff, alpha = 1, anchorY = 0.5, scale = 1, blend: 'normal' | 'add' = 'normal'): FramePlay {
  const s = new Sprite(frames[0]);
  s.anchor.set(0.5, anchorY);
  s.position.set(Math.round(x), Math.round(y));
  s.tint = tint;
  s.alpha = alpha;
  s.scale.set(scale);
  s.blendMode = blend;
  layer.addChild(s);
  void env;
  return new FramePlay(s, frames, fps);
}

// ── screen flash ────────────────────────────────────────────────────────────

class Flash implements Active {
  private s = new Sprite(Texture.WHITE);
  private t = 0;
  constructor(env: Env, color: number, private peak: number, private dur: number) {
    this.s.tint = color;
    this.s.width = Math.max(1, env.frame?.screenW ?? 2000);
    this.s.height = Math.max(1, env.frame?.screenH ?? 2000);
    // Created mid-frame: start at the peak, not at the sprite's default alpha of 1.
    this.s.alpha = peak;
    env.screen.addChild(this.s);
  }
  tick(dt: number): boolean {
    this.t += dt;
    const k = 1 - this.t / this.dur;
    if (k <= 0) return false;
    // Three hard steps down, like an old screen.
    this.s.alpha = this.peak * (k > 0.66 ? 1 : k > 0.33 ? 0.55 : 0.2);
    return true;
  }
  dispose(): void {
    this.s.destroy();
  }
}

// ── lightning ───────────────────────────────────────────────────────────────

const BOLT_BANDS: readonly (readonly [number, number, number])[] = [[3.4, 0x6a98ff, 140], [1.9, 0xb8d4ff, 240], [0.9, 0xffffff, 255]];

class Lightning implements Active {
  private line = new LineCanvas();
  private t = 0;
  private flick = -1;
  private pts: number[] = [];
  private br: number[] = [];
  private rnd = rng((Math.random() * 1e9) | 0);
  private glow = new Sprite(poolTex(30, 0.6, 3));
  private struck = false;
  constructor(private env: Env, private x: number, private y: number) {
    env.high.addChild(this.line.sprite);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = 0xb8d0ff;
    this.glow.position.set(Math.round(x), Math.round(y));
    env.floor.addChild(this.glow);
  }
  private draw(): void {
    const top = Math.min(this.env.view.y0, this.y - 40) - 8;
    const sx = this.x + (this.rnd() - 0.5) * 50;
    const segs = Math.max(6, Math.round((this.y - top) / 14));
    jagged(this.pts, sx, top, this.x, this.y, segs, 12, this.rnd);
    let x0 = Math.min(sx, this.x) - 30, x1 = Math.max(sx, this.x) + 30;
    this.line.begin(x0, top - 4, x1, this.y + 4);
    // A fork or two off the main path.
    for (let b = 0; b < 2; b++) {
      const i = 2 + Math.floor(this.rnd() * (this.pts.length / 2 - 4));
      const bx = this.pts[i * 2], by = this.pts[i * 2 + 1];
      jagged(this.br, bx, by, bx + (this.rnd() - 0.5) * 50, by + 18 + this.rnd() * 22, 4, 5, this.rnd);
      for (let k = 0; k + 3 < this.br.length; k += 2) this.line.thick(this.br[k], this.br[k + 1], this.br[k + 2], this.br[k + 3], [[1.2, 0x9ac0ff, 170], [0.4, 0xe8f0ff, 255]]);
    }
    for (let k = 0; k + 3 < this.pts.length; k += 2) this.line.thick(this.pts[k], this.pts[k + 1], this.pts[k + 2], this.pts[k + 3], BOLT_BANDS);
    this.line.end();
    void x0; void x1;
  }
  tick(dt: number, env: Env): boolean {
    this.t += dt;
    // Three flickers: on, off, on (new path), off, on (new path), fade.
    const t = this.t;
    const phase = t < 0.07 ? 0 : t < 0.11 ? -1 : t < 0.2 ? 1 : t < 0.25 ? -1 : t < 0.42 ? 2 : -2;
    if (phase === -2 && t > 0.6) return false;
    if (phase >= 0 && phase !== this.flick) {
      this.flick = phase;
      this.draw();
      if (phase === 0 || phase === 2) env.cue({ kind: 'flash', color: 0xe8f0ff, alpha: phase === 0 ? 0.55 : 0.35, ms: 140 });
    }
    if (!this.struck) {
      this.struck = true;
      emitSparksAt(env, this.x, this.y, 22, [0xffffff, 0xc8e0ff, 0xffe27a]);
      env.cue({ kind: 'impact', x: this.x, y: this.y, power: 1 });
      for (let i = 0; i < 5; i++) emitDrift(env.parts, this.x + rr(-6, 6), this.y, rr(2, 8), rr(3, 5), 0x4a4452, rr(-10, 10), 0, rr(10, 20), rr(1, 1.6), 0.7);
    }
    this.line.sprite.visible = phase >= 0;
    this.line.sprite.alpha = phase === 2 && t > 0.34 ? 0.6 : 1;
    this.glow.alpha = phase >= 0 ? 0.6 : 0;
    if (phase >= 0) env.dark.addLight(this.x, this.y, 70, 1);
    return true;
  }
  dispose(): void {
    this.line.destroy();
    this.glow.destroy();
  }
}

// ── zap ─────────────────────────────────────────────────────────────────────

class Zap implements Active {
  private line = new LineCanvas();
  private t = 0;
  private n = -1;
  private pts: number[] = [];
  private rnd = rng((Math.random() * 1e9) | 0);
  constructor(env: Env, private fx: number, private fy: number, private tx: number, private ty: number, private color: number) {
    env.high.addChild(this.line.sprite);
    emitSparksAt(env, tx, ty, 10, [0xffffff, mix(color, 0xffffff, 0.5), color]);
  }
  tick(dt: number, env: Env): boolean {
    this.t += dt;
    if (this.t > 0.4) return false;
    const n = Math.floor(this.t / 0.07);
    if (n !== this.n) {
      this.n = n;
      const len = Math.hypot(this.tx - this.fx, this.ty - this.fy);
      jagged(this.pts, this.fx, this.fy, this.tx, this.ty, Math.max(3, Math.round(len / 9)), 5, this.rnd);
      this.line.begin(Math.min(this.fx, this.tx) - 12, Math.min(this.fy, this.ty) - 12, Math.max(this.fx, this.tx) + 12, Math.max(this.fy, this.ty) + 12);
      for (let k = 0; k + 3 < this.pts.length; k += 2) this.line.thick(this.pts[k], this.pts[k + 1], this.pts[k + 2], this.pts[k + 3], [[1.6, this.color, 150], [0.4, mix(this.color, 0xffffff, 0.8), 255]]);
      this.line.end();
    }
    this.line.sprite.visible = n % 2 === 0 || this.t < 0.2;
    env.dark.addLight(this.tx, this.ty, 22, 0.8);
    return true;
  }
  dispose(): void {
    this.line.destroy();
  }
}

// ── emote ───────────────────────────────────────────────────────────────────

const EMOTE_LIFE = 1.9;

class Emote implements Active {
  readonly s: Sprite;
  t = 0;
  private x = 0;
  private y = 0;
  constructor(env: Env, readonly who: string, icon: EmoteIcon) {
    this.s = new Sprite(emoteTex(icon));
    this.s.anchor.set(0.5, 1);
    this.s.scale.set(0);
    env.high.addChild(this.s);
    const p = findPerson(env.people, who);
    if (p) { this.x = p.x; this.y = p.headY; }
  }
  /** Hurry this one off when a new emote arrives for the same person. */
  hurry(): void {
    this.t = Math.max(this.t, EMOTE_LIFE - 0.18);
  }
  tick(dt: number, env: Env): boolean {
    this.t += dt;
    const t = this.t;
    if (t >= EMOTE_LIFE) return false;
    const p = findPerson(env.people, this.who);
    if (p) {
      if (!p.visible) return false;
      this.x = p.x;
      this.y = p.headY;
    }
    // Pop with overshoot, wobble side to side, then rise and fade in steps.
    let sc = 1;
    if (t < 0.22) sc = Math.max(0, easeOutBack(t / 0.22)) * 1.0;
    const sq = t < 0.32 && t >= 0.22 ? Math.sin(((t - 0.22) / 0.1) * Math.PI) * 0.12 : 0;
    const wob = t < 0.9 ? Math.sin(t * 22) * (0.9 - t) * 1.8 : 0;
    const rise = t > 1.3 ? (t - 1.3) * 16 : 0;
    this.s.scale.set(sc * (1 + sq), sc * (1 - sq));
    this.s.x = Math.round(this.x + wob);
    this.s.y = Math.round(this.y - 3 - rise + (t < 0.22 ? (1 - t / 0.22) * 4 : 0));
    this.s.alpha = t > 1.45 ? (t > 1.75 ? 0.33 : t > 1.6 ? 0.66 : 1) : 1;
    return true;
  }
  dispose(): void {
    this.s.destroy();
  }
}

// ── floating text ───────────────────────────────────────────────────────────

class FloatText implements Active {
  private s: Sprite;
  private tex: Texture;
  private t = 0;
  constructor(env: Env, private x: number, private y: number, text: string, color: number) {
    this.tex = textPix(text, color).toTexture();
    this.s = new Sprite(this.tex);
    this.s.anchor.set(0.5, 1);
    env.high.addChild(this.s);
  }
  tick(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    if (t > 1.6) return false;
    const pop = t < 0.15 ? easeOutBack(t / 0.15) : 1;
    this.s.scale.set(pop);
    this.s.x = Math.round(this.x);
    this.s.y = Math.round(this.y - (1 - Math.pow(1 - Math.min(1, t / 1.2), 2)) * 14);
    this.s.alpha = t > 1.1 ? (t > 1.4 ? 0.33 : 0.66) : 1;
    return true;
  }
  dispose(): void {
    this.s.destroy();
    this.tex.destroy(true);
  }
}

// ── swirl ───────────────────────────────────────────────────────────────────

class Swirl implements Active {
  private dots: Sprite[] = [];
  private t = 0;
  constructor(env: Env, private x: number, private y: number, private color: number) {
    for (let i = 0; i < 12; i++) {
      const s = new Sprite(squareTex(i % 3 === 0 ? 2 : 1));
      s.anchor.set(0.5);
      s.tint = i % 2 ? color : mix(color, 0xffffff, 0.6);
      env.high.addChild(s);
      this.dots.push(s);
    }
  }
  tick(dt: number, env: Env): boolean {
    this.t += dt;
    const t = this.t;
    if (t > 0.9) return false;
    const r = 14 * (1 - t / 0.9) + 2;
    for (let i = 0; i < this.dots.length; i++) {
      const a = t * 9 + (i / this.dots.length) * Math.PI * 2;
      const rr0 = r * (0.6 + (i % 3) * 0.2);
      this.dots[i].x = Math.round(this.x + Math.cos(a) * rr0);
      this.dots[i].y = Math.round(this.y + Math.sin(a) * rr0 * 0.6 - t * 6);
      this.dots[i].alpha = t > 0.7 ? 0.5 : 1;
    }
    if (t > 0.85 && this.dots[0].visible) {
      emitBurst(env.parts, 'sparkles', this.x, this.y, 0, 6);
      for (const d of this.dots) d.visible = false;
    }
    return true;
  }
  dispose(): void {
    for (const d of this.dots) d.destroy();
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function emitSparksAt(env: Env, x: number, y: number, n: number, cols: number[]): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rr(30, 110);
    emitSpark(env.parts, x, y, rr(1, 6), Math.cos(a) * sp, Math.sin(a) * sp * 0.5, rr(30, 110), pick(cols), rr(0.25, 0.6), Math.random() < 0.25 ? 2 : 1, 260);
  }
}

let BOOM: Texture[] | null = null;
const RINGS = new Map<string, Texture[]>();
function rings(r: number, ratio: number): Texture[] {
  const key = r + ':' + ratio;
  let f = RINGS.get(key);
  if (!f) { f = ringFrames(r, ratio, 5); RINGS.set(key, f); }
  return f;
}

// ── the cue dispatcher ──────────────────────────────────────────────────────

export class Cues {
  private active: Active[] = [];
  private emotes: Emote[] = [];

  constructor(private env: Env) {}

  fire(c: FxCue): void {
    const env = this.env;
    const parts = env.parts;
    switch (c.kind) {
      case 'lightning':
        this.active.push(new Lightning(env, c.x, c.y));
        break;
      case 'flash':
        this.active.push(new Flash(env, c.color, Math.max(0, Math.min(1, c.alpha)), Math.max(0.05, c.ms / 1000)));
        break;
      case 'explosion': {
        const sz = Math.max(0.3, Math.min(2, c.size));
        env.cue({ kind: 'flash', color: 0xfff4d8, alpha: 0.35 * Math.min(1, sz), ms: 160 });
        this.active.push(playAt(env, env.floor, rings(Math.round(18 + 18 * sz), 0.55), c.x, c.y, 16, 0xffd8a0, 0.8));
        this.active.push(playAt(env, env.air, (BOOM ??= explosionFrames()), c.x, c.y - 12 * sz, 12, 0xffffff, 1, 0.6, sz > 1.6 ? 2 : 1));
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          emitDrift(parts, c.x + Math.cos(a) * 6, c.y + Math.sin(a) * 3, rr(4, 14), rr(3, 5) * sz, pick([0x6a6474, 0x847e92, 0x5a5262]), Math.cos(a) * 26 * sz, Math.sin(a) * 10 * sz, rr(6, 16), rr(0.9, 1.5), 0.85);
        }
        for (let i = 0; i < Math.round(12 * sz); i++) {
          const p = parts.spawn();
          if (!p) break;
          const a = Math.random() * Math.PI * 2, sp = rr(40, 110) * sz;
          p.x = c.x; p.y = c.y; p.z = rr(4, 10); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.5; p.vz = rr(80, 160); p.g = 380;
          p.land = Land.Bounce; p.bounce = 0.4; p.settle = rr(1.5, 3); p.life = 6; p.layer = Layer.Air;
          parts.commit(p, shapeTex(pick(['debris', 'debrisB', 'paper2', 'crumbB']), true), 0xffffff);
        }
        emitSparksAt(env, c.x, c.y - 6, Math.round(18 * sz), [0xfff4b8, 0xffd23d, 0xff8a2a]);
        this.active.push(new LightPulse(c.x, c.y, 90 * sz, 0.35));
        break;
      }
      case 'poof': {
        const col = c.color ?? 0xf0ecf8;
        emitPoof(parts, c.x, c.y - 8, 0, 7, col, 0, 0, 4, 0.55);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + rr(-0.3, 0.3);
          emitPoof(parts, c.x + Math.cos(a) * 4, c.y - 8 + Math.sin(a) * 3, 0, rr(3.5, 5), col, Math.cos(a) * 34, Math.sin(a) * 18, rr(0, 10), rr(0.4, 0.6));
        }
        emitBurst(parts, 'sparkles', c.x, c.y, 10, 5);
        break;
      }
      case 'splash':
        this.active.push(playAt(env, env.floor, rings(12, 0.5), c.x, c.y, 14, 0xb6e0ff, 0.8));
        emitSplash(parts, c.x, c.y, true);
        emitBurst(parts, 'water', c.x, c.y, 2, 16);
        break;
      case 'sparks':
        emitSparksAt(env, c.x, c.y, 16, [0xffffff, 0xfff4b8, 0xffd23d, 0xff8a2a]);
        for (let i = 0; i < 4; i++) {
          const p = parts.spawn();
          if (!p) break;
          const a = Math.random() * Math.PI * 2;
          p.x = c.x; p.y = c.y; p.z = 4; p.vx = Math.cos(a) * 60; p.vy = Math.sin(a) * 30; p.vz = rr(40, 90); p.g = 200; p.life = 0.4; p.layer = Layer.High;
          parts.commit(p, shapeTex('streak'), 0xffffff);
        }
        this.active.push(new LightPulse(c.x, c.y, 26, 0.2));
        break;
      case 'impact': {
        const pw = Math.max(0.2, Math.min(1.5, c.power));
        this.active.push(playAt(env, env.floor, rings(Math.round(8 + 10 * pw), 0.45), c.x, c.y, 18, 0xe8dcc4, 0.75));
        emitBurst(parts, 'dust', c.x, c.y, 1, Math.round(8 + 10 * pw));
        for (let i = 0; i < Math.round(3 + 5 * pw); i++) {
          const a = Math.random() * Math.PI * 2;
          emitSpark(parts, c.x, c.y, 1, Math.cos(a) * rr(20, 50), Math.sin(a) * 12, rr(30, 70), pick([0x9a8a70, 0xbfb29a]), 0.5, 1, 300, Layer.Air);
        }
        break;
      }
      case 'burst':
        emitBurst(parts, c.what, c.x, c.y, 0, c.count);
        break;
      case 'emote': {
        for (const e of this.emotes) if (e.who === c.who) e.hurry();
        const e = new Emote(env, c.who, c.icon);
        this.emotes.push(e);
        // A tiny ring of white pixels as it pops.
        const p = findPerson(env.people, c.who);
        if (p) for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          emitSpark(parts, p.x, p.y, p.y - p.headY + 8, Math.cos(a) * 40, 0, Math.sin(a) * 40, 0xffffff, 0.18, 1, 0);
        }
        break;
      }
      case 'floatText':
        this.active.push(new FloatText(env, c.x, c.y, c.text, c.color));
        break;
      case 'ring':
        this.active.push(playAt(env, env.high, rings(16, 1), c.x, c.y, 14, c.color, 1));
        break;
      case 'swirl':
        this.active.push(new Swirl(env, c.x, c.y, c.color));
        break;
      case 'zap':
        this.active.push(new Zap(env, c.from.x, c.from.y, c.to.x, c.to.y, c.color));
        break;
    }
  }

  update(dt: number): void {
    const env = this.env;
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (!this.active[i].tick(dt, env)) {
        this.active[i].dispose();
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
      }
    }
    for (let i = this.emotes.length - 1; i >= 0; i--) {
      if (!this.emotes[i].tick(dt, env)) {
        this.emotes[i].dispose();
        this.emotes.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const a of this.active) a.dispose();
    for (const e of this.emotes) e.dispose();
    this.active.length = 0;
    this.emotes.length = 0;
  }
}

/** A short burst of light that cuts the darkness (explosions, sparks). */
class LightPulse implements Active {
  private t = 0;
  constructor(private x: number, private y: number, private r: number, private dur: number) {}
  tick(dt: number, env: Env): boolean {
    this.t += dt;
    if (this.t > this.dur) return false;
    env.dark.addLight(this.x, this.y, this.r, 1 - this.t / this.dur);
    return true;
  }
  dispose(): void {}
}

void MAP_PX_H; void sparkles;
