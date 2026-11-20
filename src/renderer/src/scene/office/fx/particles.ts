// One pooled particle system for every effect. A particle lives on the floor
// plane at (x, y) and at height z above it, so arcs, falls and bounces read
// correctly in the top-down view: it is drawn at (x, y - z), its "floor y" is
// y. Sprites are created once and reused; nothing is allocated per frame.

import { Container, Sprite, Texture } from 'pixi.js';
import type { ViewRect } from '@/game/view/api';

export const MAX_PARTICLES = 500;

/** What happens when a falling particle reaches the floor (z <= 0). */
export enum Land {
  /** Vanish. */
  Die = 0,
  /** Bounce with `bounce` restitution, then settle. */
  Bounce = 1,
  /** Lie on the floor for `settle` seconds, then fade. */
  Settle = 2,
  /** Vanish and throw up a tiny splash. */
  Splash = 3,
  /** No floor: it keeps going (sparks, steam, things rising). */
  None = 4
}

export enum Layer { Floor = 0, Sorted = 1, Air = 2, High = 3 }

export class Particle {
  alive = false;
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0; vz = 0;
  /** Downward acceleration on z, px/s². */
  g = 0;
  /** Velocity damping per second (0 = none, 3 = strong). */
  drag = 0;
  /** Terminal falling speed (px/s), 0 = none: paper and confetti drift down. */
  term = 0;
  age = 0;
  life = 1;
  frames: readonly Texture[] | null = null;
  fps = 8;
  frame = 0;
  /** Sideways flutter: display offset amp * sin(age * freq + phase). */
  sway = 0;
  swayF = 0;
  swayPh = 0;
  land: Land = Land.None;
  bounce = 0.4;
  settle = 2;
  settled = false;
  /** Passed to onSplash when it lands with Land.Splash (0 water, 1 dust). */
  fx = 0;
  layer: Layer = Layer.Air;
  alpha = 1;
  /** Fraction of life spent fading out at the end (stepped). */
  fadeOut = 0.3;
  /** Pop in by scaling from 0 over this many seconds. */
  popIn = 0;
  scale = 1;
  /** Swap through frames once instead of looping (puffs, splashes). */
  once = false;
  /** Hold a frame chosen at spawn: frames just give variety. */
  still = false;
  sprite: Sprite;
  constructor() {
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.roundPixels = true;
  }
}

export interface ParticleLayers {
  floor: Container;
  sorted: Container;
  air: Container;
  high: Container;
}

export type SplashHook = (x: number, y: number, fx: number) => void;

export class Particles {
  private pool: Particle[] = [];
  private live: Particle[] = [];
  count = 0;
  onSplash: SplashHook | null = null;

  constructor(private layers: ParticleLayers) {}

  private parent(l: Layer): Container {
    return l === Layer.Floor ? this.layers.floor : l === Layer.Sorted ? this.layers.sorted : l === Layer.Air ? this.layers.air : this.layers.high;
  }

  /**
   * A fresh particle with defaults, or null when the cap is reached. The caller
   * fills in the fields, then calls `commit(p)`.
   */
  spawn(): Particle | null {
    if (this.count >= MAX_PARTICLES) return null;
    let p = this.pool.pop();
    if (!p) p = new Particle();
    p.alive = true;
    p.x = p.y = p.z = p.vx = p.vy = p.vz = p.g = p.drag = p.term = p.age = 0;
    p.life = 1; p.frames = null; p.fps = 8; p.frame = 0; p.sway = 0; p.swayF = 0; p.swayPh = 0;
    p.land = Land.None; p.bounce = 0.4; p.settle = 2; p.settled = false; p.fx = 0; p.layer = Layer.Air;
    p.alpha = 1; p.fadeOut = 0.3; p.popIn = 0; p.scale = 1; p.once = false; p.still = false;
    p.sprite.tint = 0xffffff;
    p.sprite.blendMode = 'normal';
    p.sprite.scale.set(1);
    p.sprite.anchor.set(0.5, 1);
    return p;
  }

  /** Put a filled-in particle into the world. `tex` is used when it has no frames. */
  commit(p: Particle, tex: Texture | null = null, tint = 0xffffff): void {
    const s = p.sprite;
    if (p.frames && p.frames.length) {
      if (p.still) p.frame = Math.floor(Math.random() * p.frames.length);
      s.texture = p.frames[p.frame % p.frames.length];
    } else if (tex) s.texture = tex;
    s.tint = tint;
    this.parent(p.layer).addChild(s);
    this.live.push(p);
    this.count++;
    this.place(p);
  }

  private place(p: Particle): void {
    const s = p.sprite;
    const sx = p.sway ? p.sway * Math.sin(p.age * p.swayF + p.swayPh) : 0;
    s.x = Math.round(p.x + sx);
    s.y = Math.round(p.y - p.z);
    if (p.layer === Layer.Sorted) s.zIndex = p.y;
  }

  update(dt: number, view: ViewRect | null): void {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) { this.kill(i); continue; }
      if (!p.settled) {
        if (p.drag) {
          const k = Math.max(0, 1 - p.drag * dt);
          p.vx *= k; p.vy *= k;
          if (p.land === Land.None) p.vz *= k;
        }
        p.vz -= p.g * dt;
        if (p.term && p.vz < -p.term) p.vz = -p.term;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.z <= 0 && p.land !== Land.None && p.vz <= 0) {
          p.z = 0;
          if (p.land === Land.Die) { this.kill(i); continue; }
          if (p.land === Land.Splash) {
            if (this.onSplash) this.onSplash(p.x, p.y, p.fx);
            this.kill(i);
            continue;
          }
          if (p.land === Land.Bounce && p.vz < -25) {
            p.vz = -p.vz * p.bounce;
            p.vx *= 0.6; p.vy *= 0.6;
          } else {
            this.settleOn(p);
          }
        }
      }
      const s = p.sprite;
      if (p.frames && !p.still && !p.settled) {
        const n = p.frames.length;
        let f = Math.floor(p.age * p.fps);
        f = p.once ? Math.min(n - 1, f) : f % n;
        if (f !== p.frame) { p.frame = f; s.texture = p.frames[f]; }
      }
      // Stepped fade at the end of life.
      const left = p.life - p.age;
      const fo = p.fadeOut * p.life;
      let a = p.alpha;
      if (fo > 0 && left < fo) a *= Math.ceil((left / fo) * 3) / 3;
      s.alpha = a;
      if (p.popIn > 0 && p.age < p.popIn) s.scale.set(p.scale * (0.3 + 0.7 * (p.age / p.popIn)));
      else if (s.scale.x !== p.scale) s.scale.set(p.scale);
      this.place(p);
      if (view) {
        s.visible = s.x > view.x0 - 16 && s.x < view.x1 + 16 && s.y > view.y0 - 16 && s.y < view.y1 + 48;
      }
    }
  }

  private settleOn(p: Particle): void {
    p.settled = true;
    p.vx = p.vy = p.vz = 0;
    p.z = 0;
    // Lie on the floor for `settle` seconds from now, then the stepped fade runs.
    p.life = p.age + p.settle;
    p.fadeOut = Math.min(0.5, 0.6 / Math.max(0.6, p.settle));
    if (p.layer !== Layer.Floor) {
      p.layer = Layer.Floor;
      this.layers.floor.addChild(p.sprite);
    }
    if (p.frames && p.frames.length > 1 && !p.still) {
      // Rest on a flat frame: the first is drawn lying down.
      p.sprite.texture = p.frames[0];
    }
  }

  private kill(i: number): void {
    const p = this.live[i];
    const last = this.live.length - 1;
    if (i !== last) this.live[i] = this.live[last];
    this.live.pop();
    p.alive = false;
    p.sprite.removeFromParent();
    this.pool.push(p);
    this.count--;
  }

  clear(): void {
    for (let i = this.live.length - 1; i >= 0; i--) this.kill(i);
  }

  destroy(): void {
    this.clear();
    for (const p of this.pool) p.sprite.destroy();
    this.pool.length = 0;
  }
}
