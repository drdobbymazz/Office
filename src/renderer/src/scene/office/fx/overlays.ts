// Effects that colour the whole office or a stretch of it: darkness and light,
// the alarm, disco, frozen time, zero gravity, daylight, and the glowing beam.

import { Container, Sprite, Texture } from 'pixi.js';
import type { EffectInstance } from '@/game/view/api';
import { GRID_W, MAP_H, MAP_PX_H, TILE, WORLD_H, WORLD_W, isWalkable } from '@/game/core/world';
import { Lasting, pick, rr, type Env } from './core';
import { goldSparkleFrames, shapePix, squareTex } from './art';
import { sparkles } from './emit';
import { Layer } from './particles';
import { poolTex } from './procedural';
import { beaconFrames, mirrorBallFrames, stringFrames, FLOATERS } from './sprites';
import { LineCanvas } from './bolt';
import { canvasTexture, mix, stepA } from './pix';

type Of<K extends EffectInstance['kind']> = Extract<EffectInstance, { kind: K }>;

function wash(color: number, w: number, h: number): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.tint = color;
  s.width = w;
  s.height = h;
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Darkness and light (both feed the one DarkLayer canvas)
// ─────────────────────────────────────────────────────────────────────────────

export class Dark extends Lasting<Of<'dark'>> {
  constructor(inst: Of<'dark'>, env: Env) {
    super(inst, env);
    this.introT = 0.35;
    this.outroT = 0.9;
  }
  tick(): void {
    const { inst } = this;
    // The lights die in two flickers on the way in, rather than a slow fade.
    let k = this.vis;
    if (!this.dying && k < 1) k = k < 0.25 ? 0.7 : k < 0.45 ? 0.1 : k < 0.6 ? 0.85 : 1;
    this.env.dark.addDark(inst.rooms, Math.max(0, Math.min(1, inst.level)) * k, inst.emergency);
  }
  dispose(): void {}
}

export class Light extends Lasting<Of<'light'>> {
  private pool = new Sprite(Texture.EMPTY);
  private core = new Sprite(Texture.EMPTY);
  private t = Math.random() * 10;
  constructor(inst: Of<'light'>, env: Env) {
    super(inst, env);
    this.introT = 0.3;
    this.outroT = 0.4;
    for (const s of [this.pool, this.core]) {
      s.anchor.set(0.5);
      s.blendMode = 'add';
      env.floor.addChild(s);
    }
  }
  tick(dt: number): void {
    const { inst, env } = this;
    this.t += dt;
    const r = Math.max(6, inst.radius);
    const k = stepA(this.vis, 3);
    this.pool.texture = poolTex(Math.round(r / 2) * 2, 0.62, 3);
    this.core.texture = poolTex(Math.round(r * 0.22) * 2 + 2, 0.62, 2);
    this.pool.tint = inst.color;
    this.core.tint = mix(inst.color, 0xffffff, 0.25);
    this.pool.position.set(Math.round(inst.x), Math.round(inst.y));
    this.core.position.set(Math.round(inst.x), Math.round(inst.y));
    const shimmer = Math.floor(this.t * 6) % 7 === 0 ? 0.9 : 1;
    this.pool.alpha = 0.17 * k * shimmer;
    this.core.alpha = 0.12 * k;
    env.dark.addLight(inst.x, inst.y, r, this.vis);
  }
  dispose(): void {
    this.pool.destroy();
    this.core.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alarm
// ─────────────────────────────────────────────────────────────────────────────

const BEACON_AT: readonly [number, number][] = [
  [3 * TILE, 3 * TILE], [13 * TILE, 3 * TILE], [22 * TILE, 3 * TILE], [29 * TILE, 3 * TILE],
  [6 * TILE, 11 * TILE], [17 * TILE, 11 * TILE], [28 * TILE, 11 * TILE]
];

export class Alarm extends Lasting<Of<'alarm'>> {
  private red = wash(0xff2a2a, WORLD_W, MAP_PX_H);
  private beacons: Sprite[] = [];
  private glows: Sprite[] = [];
  private frames = beaconFrames();
  private t = 0;
  constructor(inst: Of<'alarm'>, env: Env) {
    super(inst, env);
    this.introT = 0.2;
    this.outroT = 0.5;
    env.tint.addChild(this.red);
    for (const [x, y] of BEACON_AT) {
      const g = new Sprite(poolTex(18, 0.8, 3));
      g.anchor.set(0.5);
      g.tint = 0xff3a2a;
      g.blendMode = 'add';
      g.position.set(x, y + 4);
      const b = new Sprite(this.frames[0]);
      b.anchor.set(0.5, 0);
      b.position.set(x, y - 2);
      env.high.addChild(g, b);
      this.beacons.push(b);
      this.glows.push(g);
    }
  }
  tick(dt: number): void {
    this.t += dt;
    const k = stepA(this.vis, 2);
    // A whoop every 0.9 s: three stepped strengths up, then off.
    const ph = (this.t % 0.9) / 0.9;
    const step = ph < 0.15 ? 1 : ph < 0.3 ? 2 : ph < 0.45 ? 3 : ph < 0.6 ? 2 : ph < 0.7 ? 1 : 0;
    this.red.alpha = (step / 3) * 0.2 * k;
    const lit = ph < 0.5;
    for (let i = 0; i < this.beacons.length; i++) {
      const on = (i % 2 === 0) === lit;
      this.beacons[i].texture = this.frames[on ? 0 : 1];
      this.beacons[i].alpha = k;
      this.glows[i].alpha = on ? 0.5 * k : 0;
    }
  }
  dispose(): void {
    this.red.destroy();
    for (const b of this.beacons) b.destroy();
    for (const g of this.glows) g.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Disco
// ─────────────────────────────────────────────────────────────────────────────

const DISCO_COLS = [0xff4a8a, 0x4ae0ff, 0xffe24a, 0x8a5aff, 0x5aff8a, 0xff8a3a];
const BEAT = 0.5; // 120 beats per minute

export class Disco extends Lasting<Of<'disco'>> {
  private wash = wash(0x1a0a30, WORLD_W, MAP_PX_H);
  private tiles: Sprite;
  private tileCanvas: HTMLCanvasElement;
  private tileCtx: CanvasRenderingContext2D;
  private tileImg: ImageData;
  private tileTex: Texture;
  private spots: Sprite[] = [];
  private ballBox = new Container();
  private ball: Sprite;
  private str: Sprite;
  private ballFrames = mirrorBallFrames();
  private t = 0;
  private lastBeat = -1;
  private sparkAcc = 0;
  constructor(inst: Of<'disco'>, env: Env) {
    super(inst, env);
    this.introT = 1;
    this.outroT = 1.2;
    env.tint.addChild(this.wash);
    this.tileCanvas = document.createElement('canvas');
    this.tileCanvas.width = GRID_W;
    this.tileCanvas.height = MAP_H;
    this.tileCtx = this.tileCanvas.getContext('2d') as CanvasRenderingContext2D;
    this.tileImg = this.tileCtx.createImageData(GRID_W, MAP_H);
    this.tileTex = canvasTexture(this.tileCanvas);
    this.tiles = new Sprite(this.tileTex);
    this.tiles.scale.set(TILE);
    this.tiles.blendMode = 'add';
    env.floor.addChild(this.tiles);
    for (let i = 0; i < 9; i++) {
      const s = new Sprite(poolTex(i % 3 === 0 ? 16 : 12, 0.7, 2));
      s.anchor.set(0.5);
      s.tint = DISCO_COLS[i % DISCO_COLS.length];
      s.blendMode = 'add';
      env.tint.addChild(s);
      this.spots.push(s);
    }
    this.str = new Sprite(stringFrames(26)[0]);
    this.str.anchor.set(0.5, 1);
    this.ball = new Sprite(this.ballFrames[0]);
    this.ball.anchor.set(0.5, 0.5);
    this.ballBox.addChild(this.str, this.ball);
    this.ballBox.position.set(12 * TILE, 8 * TILE);
    env.high.addChild(this.ballBox);
  }
  private drawTiles(beat: number): void {
    const d = this.tileImg.data;
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        const i = (ty * GRID_W + tx) * 4;
        // Lit tiles alternate like a dance floor; colours roll each beat.
        const on = isWalkable(tx, ty) && ((tx + ty + beat) & 1) === 0;
        if (!on) { d[i + 3] = 0; continue; }
        const c = DISCO_COLS[(tx * 3 + ty * 5 + beat) % DISCO_COLS.length];
        d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255;
      }
    }
    this.tileCtx.putImageData(this.tileImg, 0, 0);
    this.tileTex.source.update();
  }
  tick(dt: number): void {
    const { inst, env } = this;
    this.t += dt;
    const lv = Math.max(0, Math.min(1, inst.level)) * this.vis;
    const k = stepA(lv, 4);
    const beat = Math.floor(this.t / BEAT);
    if (beat !== this.lastBeat) { this.lastBeat = beat; this.drawTiles(beat); }
    const inBeat = (this.t % BEAT) / BEAT;
    const pulse = inBeat < 0.3 ? 1 : 0.6;
    this.wash.alpha = 0.42 * k;
    this.tiles.alpha = 0.22 * k * pulse;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      const a = this.t * (0.35 + i * 0.05) + i * 2.1;
      s.x = Math.round(WORLD_W / 2 + Math.cos(a) * (WORLD_W * 0.42) * Math.sin(a * 0.7 + i));
      s.y = Math.round(MAP_PX_H / 2 + 20 + Math.sin(a * 1.3) * (MAP_PX_H * 0.38));
      s.alpha = 0.32 * k * ((beat + i) % 3 === 0 ? 1 : 0.7);
    }
    // The ball drops in from the ceiling and turns.
    this.ballBox.alpha = k > 0 ? 1 : 0;
    this.ballBox.y = Math.round(8 * TILE - (1 - Math.min(1, this.vis * 1.5)) * 60);
    this.ball.texture = this.ballFrames[Math.floor(this.t * 6) % 3];
    this.sparkAcc += dt * 10 * lv;
    while (this.sparkAcc >= 1) {
      this.sparkAcc -= 1;
      const p = env.parts.spawn();
      if (!p) break;
      p.x = this.ballBox.x + rr(-5, 5); p.y = this.ballBox.y + rr(-5, 5); p.frames = sparkles(); p.fps = 12; p.once = true; p.life = 0.35;
      p.layer = Layer.High;
      env.parts.commit(p, null, pick(DISCO_COLS));
    }
  }
  dispose(): void {
    this.wash.destroy();
    this.tiles.destroy();
    this.tileTex.destroy(true);
    for (const s of this.spots) s.destroy();
    this.ballBox.destroy({ children: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Time freeze
// ─────────────────────────────────────────────────────────────────────────────

export class TimeFreeze extends Lasting<Of<'timeFreeze'>> {
  private cool = wash(0x7ad8ff, WORLD_W, WORLD_H);
  private sparks: Sprite[] = [];
  private ph: number[] = [];
  private t = 0;
  private frames = sparkles();
  constructor(inst: Of<'timeFreeze'>, env: Env) {
    super(inst, env);
    this.introT = 0.5;
    this.outroT = 0.7;
    env.tint.addChild(this.cool);
    for (let i = 0; i < 56; i++) {
      const s = new Sprite(this.frames[0]);
      s.anchor.set(0.5);
      s.position.set(Math.round(rr(8, WORLD_W - 8)), Math.round(rr(40, MAP_PX_H - 4)));
      s.tint = pick([0xffffff, 0xc8f0ff, 0x9adcff]);
      env.high.addChild(s);
      this.sparks.push(s);
      this.ph.push(Math.random() * 10);
    }
  }
  tick(dt: number): void {
    this.t += dt;
    const lv = Math.max(0, Math.min(1, this.inst.level)) * this.vis;
    const k = stepA(lv, 3);
    this.cool.alpha = 0.16 * k;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      // Slow twinkle: mostly hanging still as a dot, now and then a full star.
      const f = Math.floor(this.t * 1.5 + this.ph[i]) % 6;
      s.texture = this.frames[f < 4 ? f : 0];
      s.alpha = k;
    }
  }
  dispose(): void {
    this.cool.destroy();
    for (const s of this.sparks) s.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Zero gravity
// ─────────────────────────────────────────────────────────────────────────────

interface Floater { s: Sprite; x: number; y: number; z: number; vx: number; vy: number; ph: number; frames: Texture[]; spin: number }

export class ZeroG extends Lasting<Of<'zeroG'>> {
  private list: Floater[] = [];
  private t = 0;
  constructor(inst: Of<'zeroG'>, env: Env) {
    super(inst, env);
    this.introT = 1;
    this.outroT = 0.6;
    for (let i = 0; i < 46; i++) {
      // Dust motes and, every fifth, a small office thing tumbling slowly.
      const thing = i % 5 === 0;
      const name = FLOATERS[(i / 5) % FLOATERS.length | 0];
      const frames = thing ? rotFrames(name) : [squareTex(i % 3 === 0 ? 2 : 1)];
      const s = new Sprite(frames[0]);
      s.anchor.set(0.5, 1);
      if (!thing) { s.tint = pick([0xe8e0cc, 0xd8ccb4, 0xffffff]); }
      let x = 0, y = 0;
      for (let tries = 0; tries < 20; tries++) {
        x = rr(16, WORLD_W - 16); y = rr(56, MAP_PX_H - 8);
        if (isWalkable(Math.floor(x / TILE), Math.floor(y / TILE))) break;
      }
      env.air.addChild(s);
      this.list.push({ s, x, y, z: rr(6, 40), vx: rr(-4, 4), vy: rr(-2, 2), ph: Math.random() * 10, frames, spin: thing ? rr(0.8, 2) : 0 });
    }
  }
  tick(dt: number): void {
    this.t += dt;
    const lv = Math.max(0, Math.min(1, this.inst.level)) * this.vis;
    const k = stepA(lv, 3);
    for (const f of this.list) {
      f.x += f.vx * dt * lv;
      f.y += f.vy * dt * lv;
      if (f.x < 8) f.vx = Math.abs(f.vx); else if (f.x > WORLD_W - 8) f.vx = -Math.abs(f.vx);
      if (f.y < 50) f.vy = Math.abs(f.vy); else if (f.y > MAP_PX_H - 4) f.vy = -Math.abs(f.vy);
      // Things rise off the floor as gravity fades, and drop back at the end.
      const z = f.z * lv + Math.sin(this.t * 0.9 + f.ph) * 3 * lv;
      f.s.x = Math.round(f.x);
      f.s.y = Math.round(f.y - z);
      if (f.spin) f.s.texture = f.frames[Math.floor(this.t * f.spin + f.ph) % 4];
      f.s.alpha = k;
      f.s.visible = k > 0;
    }
  }
  dispose(): void {
    for (const f of this.list) f.s.destroy();
  }
}

const ROT = new Map<string, Texture[]>();
function rotFrames(name: string): Texture[] {
  let f = ROT.get(name);
  if (!f) {
    // The outlined shape in its four exact turns.
    const p = shapePix(name, true);
    f = [0, 1, 2, 3].map((r) => p.rot90(r).toTexture());
    ROT.set(name, f);
  }
  return f;
}

// ─────────────────────────────────────────────────────────────────────────────
// Daylight
// ─────────────────────────────────────────────────────────────────────────────

// Multiply colours by hour (keyframes). Working hours stay at or near white.
const DAY_KEYS: readonly [number, number][] = [
  [0, 0x7880b8], [5, 0x8088c0], [6.5, 0xe8c8c8], [8, 0xfff0dc], [10, 0xfffaf2], [11, 0xffffff],
  [15, 0xffffff], [16.5, 0xfff0dc], [17.5, 0xffd8a8], [18.5, 0xf0b8a0], [20, 0xa898c0], [21.5, 0x7880b8], [24, 0x7880b8]
];

export function dayColor(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < DAY_KEYS.length - 1; i++) {
    const [h0, c0] = DAY_KEYS[i], [h1, c1] = DAY_KEYS[i + 1];
    if (h >= h0 && h <= h1) return mix(c0, c1, (h - h0) / (h1 - h0));
  }
  return 0xffffff;
}

export class Daylight extends Lasting<Of<'daylight'>> {
  private sprite = wash(0xffffff, WORLD_W, WORLD_H);
  constructor(inst: Of<'daylight'>, env: Env) {
    super(inst, env);
    this.introT = 2;
    this.outroT = 2;
    this.sprite.blendMode = 'multiply';
    env.tint.addChildAt(this.sprite, 0);
  }
  tick(): void {
    this.sprite.tint = dayColor(this.inst.hour);
    this.sprite.alpha = this.vis;
  }
  dispose(): void {
    this.sprite.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Beam between two points
// ─────────────────────────────────────────────────────────────────────────────

export class Beam extends Lasting<Of<'beam'>> {
  private line = new LineCanvas();
  private endGlow = new Sprite(Texture.EMPTY);
  private startGlow = new Sprite(Texture.EMPTY);
  private t = 0;
  private redrawT = 0;
  private sparkAcc = 0;
  private gold = goldSparkleFrames();
  constructor(inst: Of<'beam'>, env: Env) {
    super(inst, env);
    this.introT = 0.25;
    this.outroT = 0.35;
    for (const g of [this.startGlow, this.endGlow]) {
      g.anchor.set(0.5);
      g.blendMode = 'add';
      env.high.addChild(g);
    }
    env.high.addChild(this.line.sprite);
  }
  tick(dt: number): void {
    const { inst, env } = this;
    this.t += dt;
    const k = this.vis;
    const { from, to } = inst;
    // The ray shoots out from `from` on the way in.
    const reach = this.dying ? 1 : Math.min(1, k * 1.4);
    const tx = from.x + (to.x - from.x) * reach, ty = from.y + (to.y - from.y) * reach;
    this.redrawT -= dt;
    if (this.redrawT <= 0) {
      this.redrawT = 1 / 12;
      const w = Math.max(1, inst.width);
      const pad = w + 4;
      this.line.begin(Math.min(from.x, tx) - pad, Math.min(from.y, ty) - pad, Math.max(from.x, tx) + pad, Math.max(from.y, ty) + pad);
      const wob = Math.floor(this.t * 12) % 2;
      this.line.thick(from.x, from.y, tx, ty, [
        [w / 2 + 2 + wob * 0.5, inst.color, 120],
        [w / 2 + 0.5, inst.color, 220],
        [Math.max(0.3, w / 4), mix(inst.color, 0xffffff, 0.75), 255]
      ]);
      // Bright pulses travelling down the ray.
      for (let i = 0; i < 3; i++) {
        const u = (this.t * 1.6 + i / 3) % 1;
        if (u > reach) continue;
        const px = from.x + (to.x - from.x) * u, py = from.y + (to.y - from.y) * u;
        this.line.thick(px, py, px, py, [[w / 2 + 1.5, 0xffffff, 255]]);
      }
      this.line.end();
    }
    this.line.sprite.alpha = stepA(k, 3);
    this.startGlow.texture = poolTex(8, 1, 2);
    this.endGlow.texture = poolTex(10 + (Math.floor(this.t * 10) % 2) * 2, 1, 2);
    this.startGlow.tint = this.endGlow.tint = inst.color;
    this.startGlow.position.set(Math.round(from.x), Math.round(from.y));
    this.endGlow.position.set(Math.round(tx), Math.round(ty));
    this.startGlow.alpha = this.endGlow.alpha = 0.5 * stepA(k, 3);
    this.sparkAcc += dt * 14 * k;
    while (this.sparkAcc >= 1) {
      this.sparkAcc -= 1;
      const p = env.parts.spawn();
      if (!p) break;
      p.x = tx + rr(-4, 4); p.y = ty + rr(-4, 4); p.vz = rr(5, 20); p.frames = Math.random() < 0.5 ? this.gold : sparkles(); p.once = true; p.fps = 10; p.life = 0.4;
      p.layer = Layer.High;
      env.parts.commit(p, null, mix(inst.color, 0xffffff, 0.5));
    }
  }
  dispose(): void {
    this.line.destroy();
    this.startGlow.destroy();
    this.endGlow.destroy();
  }
}

