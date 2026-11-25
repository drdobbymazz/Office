// Lasting effects that happen at a place: fire, smoke, sprinklers, flood,
// sprays, quake debris, rain of things, balloons, props, emoji, bees, clouds,
// shutters and dead screens.

import { Container, Sprite, Texture } from 'pixi.js';
import type { EffectInstance } from '@/game/view/api';
import type { RoomId, Tile, Vec } from '@/game/core/types';
import { TILE, roomRectPx, walkableTilesIn, isWalkable, roomAt } from '@/game/core/world';
import { Lasting, approach, pick, rr, type Env } from './core';
import { C, CONFETTI_TINTS, framesOf, goldSparkleFrames, shapeTex, squareTex, textPix } from './art';
import { emitBurst, emitDrift, emitDrop, emitPoof, emitSpark, confetti, sparkles } from './emit';
import { Land, Layer } from './particles';
import { flameFrames, poolTex, puffTex, shadowTex } from './procedural';
import { FLAT_ITEMS, balloonTex, BALLOON_COLORS, beeFrames, housingTex, itemFrames, noSignalTex, offScreenTex, shutterFootTex, slatTex, stringFrames } from './sprites';
import { emojiTex } from './emoji';
import { INK, Pix, canvasTexture, easeOutBack, hash2, stepA, strHash } from './pix';

type Of<K extends EffectInstance['kind']> = Extract<EffectInstance, { kind: K }>;

/** A random point on a walkable tile of the room (world px, feet-style y inside the tile). */
export function randomFloorPoint(room: RoomId, out: Vec): Vec {
  const tiles = walkableTilesIn(room);
  if (!tiles.length) {
    const r = roomRectPx(room);
    out.x = r.x + Math.random() * r.w;
    out.y = r.y + Math.random() * r.h;
    return out;
  }
  const t = tiles[Math.floor(Math.random() * tiles.length)];
  out.x = t.x * TILE + 1 + Math.random() * (TILE - 2);
  out.y = t.y * TILE + 2 + Math.random() * (TILE - 3);
  return out;
}

const TMP: Vec = { x: 0, y: 0 };

function wash(color: number): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.tint = color;
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fire
// ─────────────────────────────────────────────────────────────────────────────

// Tongues of flame laid out round the base point; more appear as it grows.
const TONGUES: readonly [dx: number, dy: number, from: number, big: number][] = [
  [0, 0, 0, 0.0],
  [-7, -2, 0.18, 0.55],
  [7, -1, 0.28, 0.65],
  [-13, 1, 0.5, 0.85],
  [13, 2, 0.58, 0.95],
  [-4, 4, 0.72, 1.1],
  [6, 5, 0.82, 1.1]
];
const FLAME_SIZES: readonly [number, number][] = [[7, 10], [10, 15], [13, 20], [16, 25]];

export class Fire extends Lasting<Of<'fire'>> {
  private box = new Container();
  private tongues: Sprite[] = [];
  private frames: Texture[][][] = [];
  private glowOuter: Sprite;
  private glowInner: Sprite;
  private size = 0;
  private acc = 0;
  private smokeAcc = 0;
  private flick = 0;
  private flickT = 0;
  private phase: number[] = [];
  constructor(inst: Of<'fire'>, env: Env) {
    super(inst, env);
    this.introT = 0.8;
    this.outroT = 1.2;
    const seed = strHash(inst.id) % 97;
    TONGUES.forEach((_, i) => {
      this.frames.push(FLAME_SIZES.map(([w, h], s) => flameFrames(w, h, (seed + i * 13 + s * 5) % 31)));
      const sp = new Sprite(this.frames[i][0][0]);
      sp.anchor.set(0.5, 1);
      sp.roundPixels = true;
      this.tongues.push(sp);
      this.phase.push(Math.random() * 10);
    });
    // Front tongues (larger dy) are added last so they draw in front.
    const order = TONGUES.map((t, i) => i).sort((a, b) => TONGUES[a][1] - TONGUES[b][1]);
    for (const i of order) this.box.addChild(this.tongues[i]);
    this.glowOuter = new Sprite(Texture.EMPTY);
    this.glowInner = new Sprite(Texture.EMPTY);
    for (const g of [this.glowOuter, this.glowInner]) {
      g.anchor.set(0.5);
      g.blendMode = 'add';
      env.floor.addChild(g);
    }
    this.glowOuter.tint = 0xff7a2a;
    this.glowInner.tint = 0xffc24a;
    env.sorted.addChild(this.box);
  }

  tick(dt: number): void {
    const { inst, env } = this;
    this.size = approach(this.size, Math.max(0, Math.min(1, inst.size)) * this.vis, 3, dt);
    const s = this.size;
    this.box.x = Math.round(inst.x);
    this.box.y = Math.round(inst.y);
    this.box.zIndex = inst.y + 2;
    for (let i = 0; i < this.tongues.length; i++) {
      const [dx, dy, from, big] = TONGUES[i];
      const sp = this.tongues[i];
      const on = s > from + 0.02 || (i === 0 && s > 0.03);
      sp.visible = on;
      if (!on) continue;
      const grow = (s - from) / Math.max(0.15, 1 - from);
      const cls = Math.max(0, Math.min(3, Math.floor(grow * 3.2 * (1 - big * 0.3) + (i === 0 ? s * 1.2 : 0))));
      const fr = this.frames[i][cls];
      this.phase[i] += dt * (9 + i);
      sp.texture = fr[Math.floor(this.phase[i]) % fr.length];
      sp.x = Math.round(dx * (0.6 + s * 0.4));
      sp.y = dy;
    }
    // Flicker the warm glow between three stepped strengths.
    this.flickT -= dt;
    if (this.flickT <= 0) { this.flickT = rr(0.06, 0.14); this.flick = Math.floor(Math.random() * 3); }
    const r = 14 + s * 34;
    this.glowOuter.texture = poolTex(Math.round(r / 2) * 2, 0.55, 3);
    this.glowInner.texture = poolTex(Math.round(r * 0.28) * 2, 0.55, 2);
    this.glowOuter.position.set(Math.round(inst.x), Math.round(inst.y - 2));
    this.glowInner.position.set(Math.round(inst.x), Math.round(inst.y - 1));
    const a = (0.2 + this.flick * 0.05) * Math.min(1, s * 3);
    this.glowOuter.alpha = a;
    this.glowInner.alpha = a * 1.3;
    env.dark.addLight(inst.x, inst.y - 6, r * 1.6, Math.min(1, s * 2.5) * (0.85 + this.flick * 0.05));
    // Sparks rising off the flames.
    this.acc += dt * (3 + s * 22);
    while (this.acc >= 1) {
      this.acc -= 1;
      const p = env.parts.spawn();
      if (!p) break;
      p.x = inst.x + rr(-10, 10) * (0.4 + s); p.y = inst.y + rr(-2, 3); p.z = rr(6, 14 + s * 14);
      p.vx = rr(-8, 8); p.vz = rr(22, 48); p.g = -15; p.drag = 0.8; p.life = rr(0.5, 1.2); p.fadeOut = 0.5;
      p.sway = rr(1, 2.5); p.swayF = rr(6, 10); p.swayPh = rr(0, 6); p.layer = Layer.High;
      env.parts.commit(p, squareTex(1), pick([0xffd23d, 0xff8a2a, 0xfff4b8]));
    }
    // Wisps of dark smoke off the tips.
    this.smokeAcc += dt * s * 3;
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      emitDrift(env.parts, inst.x + rr(-6, 6) * (0.5 + s), inst.y, 16 + s * 18, rr(2, 3.5), 0x5a5262, rr(-4, 4), 0, rr(10, 16), rr(1.2, 2), 0.7);
    }
  }

  dispose(): void {
    this.box.destroy({ children: true });
    this.glowOuter.destroy();
    this.glowInner.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Smoke hanging over a room
// ─────────────────────────────────────────────────────────────────────────────

let SMOKE_GROW: Texture[][] | null = null;
function smokeGrow(): Texture[][] {
  return (SMOKE_GROW ??= [0, 1, 2, 3].map((v) => [puffTex(4, v), puffTex(6, v), puffTex(8, v), puffTex(10, v), puffTex(11, v, 0.25), puffTex(11, v, 0.5)]));
}

export class Smoke extends Lasting<Of<'smoke'>> {
  private haze = wash(0x5a5664);
  private acc = 0;
  constructor(inst: Of<'smoke'>, env: Env) {
    super(inst, env);
    this.introT = 1.5;
    this.outroT = 2;
    env.air.addChild(this.haze);
  }
  tick(dt: number): void {
    const { inst, env } = this;
    const r = roomRectPx(inst.room);
    const d = Math.max(0, Math.min(1, inst.density)) * this.vis;
    this.haze.position.set(r.x, r.y);
    this.haze.width = r.w;
    this.haze.height = r.h;
    this.haze.alpha = stepA(d, 4) * 0.16;
    const tiles = (r.w * r.h) / (TILE * TILE);
    this.acc += dt * d * Math.min(12, tiles / 6);
    while (this.acc >= 1) {
      this.acc -= 1;
      const p = env.parts.spawn();
      if (!p) break;
      randomFloorPoint(inst.room, TMP);
      p.x = TMP.x; p.y = TMP.y; p.z = rr(14, 30);
      p.vx = rr(-5, 5); p.vy = rr(-1.5, 1.5); p.vz = rr(-1, 2);
      p.frames = pick(smokeGrow()); p.once = true; p.life = rr(4, 6.5); p.fps = 6 / p.life;
      p.fadeOut = 0.35; p.popIn = 0.6; p.alpha = 0.45 + d * 0.35; p.layer = Layer.Air;
      p.sprite.anchor.set(0.5, 0.5);
      env.parts.commit(p, null, pick([0x7a7486, 0x8c8698, 0x686274]));
    }
  }
  dispose(): void {
    this.haze.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprinklers
// ─────────────────────────────────────────────────────────────────────────────

export class Sprinklers extends Lasting<Of<'sprinklers'>> {
  private acc = 0;
  private mistAcc = 0;
  private heads: Vec[] = [];
  private tintWash = wash(0x8fc8ff);
  constructor(inst: Of<'sprinklers'>, env: Env) {
    super(inst, env);
    this.introT = 0.4;
    this.outroT = 0.6;
    const r = roomRectPx(inst.room);
    const nx = Math.max(1, Math.round(r.w / 80)), ny = Math.max(1, Math.round(r.h / 64));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) this.heads.push({ x: r.x + ((i + 0.5) / nx) * r.w, y: r.y + ((j + 0.5) / ny) * r.h });
    env.air.addChild(this.tintWash);
  }
  tick(dt: number): void {
    const { inst, env } = this;
    const r = roomRectPx(inst.room);
    this.tintWash.position.set(r.x, r.y);
    this.tintWash.width = r.w;
    this.tintWash.height = r.h;
    this.tintWash.alpha = stepA(this.vis, 3) * 0.07;
    const tiles = (r.w * r.h) / (TILE * TILE);
    this.acc += dt * this.vis * Math.min(70, tiles * 0.9);
    while (this.acc >= 1) {
      this.acc -= 1;
      randomFloorPoint(inst.room, TMP);
      emitDrop(env.parts, TMP.x, TMP.y, rr(30, 60), rr(-190, -150));
    }
    // A fine mist round each sprinkler head.
    this.mistAcc += dt * this.vis * this.heads.length * 10;
    while (this.mistAcc >= 1) {
      this.mistAcc -= 1;
      const h = pick(this.heads);
      const a = Math.random() * Math.PI * 2;
      emitSpark(env.parts, h.x, h.y, 44, Math.cos(a) * rr(20, 40), Math.sin(a) * rr(10, 20), rr(-10, 5), pick([0xd8f0ff, 0xb6e0ff]), rr(0.3, 0.6), 1, 60, Layer.Air);
    }
  }
  dispose(): void {
    this.tintWash.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Flood: water spreading over a room's walkable floor from the burst pipe
// ─────────────────────────────────────────────────────────────────────────────

// A 64 x 64 caustic pattern, sampled with a slow scroll for the moving light.
let CAUSTIC: Uint8Array | null = null;
function caustic(): Uint8Array {
  if (CAUSTIC) return CAUSTIC;
  const c = new Uint8Array(64 * 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const v = Math.sin((x / 64) * Math.PI * 4 + Math.sin((y / 64) * Math.PI * 2) * 2) + Math.sin((y / 64) * Math.PI * 6 + Math.cos((x / 64) * Math.PI * 2) * 1.5);
    c[y * 64 + x] = v > 1.5 ? 2 : v > 0.9 ? 1 : 0;
  }
  return (CAUSTIC = c);
}

export class Flood extends Lasting<Of<'flood'>> {
  private sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private px: Uint32Array;
  private tex: Texture;
  private rx: number;
  private ry: number;
  private w: number;
  private h: number;
  private tw: number;
  private th: number;
  /** BFS distance (in tiles) from the spout for each tile of the room rect; -1 = not water. */
  private dist: Int16Array;
  private maxDist = 1;
  private cover: Uint8Array;
  private level = 0;
  private redrawT = 0;
  private sprayAcc = 0;
  private t = 0;
  constructor(inst: Of<'flood'>, env: Env) {
    super(inst, env);
    this.introT = 0.5;
    this.outroT = 2.5;
    const r = roomRectPx(inst.room);
    // Pad one tile so water can lap into door gaps on the room's edge.
    this.rx = r.x - TILE;
    this.ry = r.y - TILE;
    this.w = r.w + TILE * 2;
    this.h = r.h + TILE * 2;
    this.tw = this.w / TILE;
    this.th = this.h / TILE;
    this.dist = new Int16Array(this.tw * this.th).fill(-1);
    this.cover = new Uint8Array(this.w * this.h);
    this.computeDistances();
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.img = this.ctx.createImageData(this.w, this.h);
    this.px = new Uint32Array(this.img.data.buffer);
    this.tex = canvasTexture(this.canvas);
    this.sprite = new Sprite(this.tex);
    this.sprite.position.set(this.rx, this.ry);
    env.floor.addChild(this.sprite);
  }

  private computeDistances(): void {
    const { inst } = this;
    const tx0 = this.rx / TILE, ty0 = this.ry / TILE;
    const inRoom = (tx: number, ty: number): boolean => {
      if (!isWalkable(tx, ty)) return false;
      const lx = tx - tx0, ly = ty - ty0;
      if (lx < 0 || ly < 0 || lx >= this.tw || ly >= this.th) return false;
      // Edge ring: only tiles that are this room's (door gaps count via roomAt).
      return roomAt({ x: tx, y: ty }) === inst.room || lx === 0 || ly === 0 || lx === this.tw - 1 || ly === this.th - 1;
    };
    let start: Tile | null = null;
    let best = Infinity;
    for (const t of walkableTilesIn(inst.room)) {
      const d = Math.hypot(t.x * TILE + 8 - inst.spoutX, t.y * TILE + 8 - inst.spoutY);
      if (d < best) { best = d; start = t; }
    }
    if (!start) return;
    const q: number[] = [start.x, start.y];
    this.dist[(start.y - ty0) * this.tw + (start.x - tx0)] = 0;
    for (let qi = 0; qi < q.length; qi += 2) {
      const x = q[qi], y = q[qi + 1];
      const d = this.dist[(y - ty0) * this.tw + (x - tx0)];
      this.maxDist = Math.max(this.maxDist, d);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (!inRoom(nx, ny)) continue;
        const i = (ny - ty0) * this.tw + (nx - tx0);
        if (this.dist[i] >= 0) continue;
        this.dist[i] = d + 1;
        q.push(nx, ny);
      }
    }
  }

  tick(dt: number): void {
    const { inst, env } = this;
    this.t += dt;
    this.level = approach(this.level, Math.max(0, Math.min(1, inst.level)), 1.5, dt);
    this.sprite.alpha = stepA(this.vis, 4);
    this.redrawT -= dt;
    if (this.redrawT <= 0 && this.sprite.visible) {
      this.redrawT = 1 / 8;
      this.redraw();
    }
    if (inst.spraying && this.vis > 0.5) {
      this.sprayAcc += dt * 45;
      while (this.sprayAcc >= 1) {
        this.sprayAcc -= 1;
        const p = env.parts.spawn();
        if (!p) break;
        const a = Math.random() * Math.PI * 2;
        const sp = rr(10, 45);
        p.x = inst.spoutX; p.y = inst.spoutY; p.z = rr(2, 8);
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.5; p.vz = rr(70, 120); p.g = 340;
        p.life = 2; p.land = Land.Splash; p.layer = Layer.Air; p.fadeOut = 0;
        env.parts.commit(p, squareTex(Math.random() < 0.3 ? 2 : 1), pick([C.blueL, 0xffffff, C.blue]));
      }
    }
  }

  private redraw(): void {
    const { w, h, tw, px, cover } = this;
    const lv = this.level;
    // Water spreads out from the spout: tiles nearer than the front are wet.
    const front = lv * 1.35 * (this.maxDist + 1);
    const t = this.t;
    cover.fill(0);
    for (let ty = 0; ty < this.th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        const d = this.dist[ty * tw + tx];
        if (d < 0 || d > front) continue;
        const y0 = ty * TILE, x0 = tx * TILE;
        for (let y = y0; y < y0 + TILE; y++) cover.fill(1, y * w + x0, y * w + x0 + TILE);
      }
    }
    const caus = caustic();
    const deep = Math.min(1, lv * 1.2);
    // Colours (ABGR). Base alpha rises with the level in steps.
    const baseA = Math.round((0.32 + 0.22 * Math.round(deep * 3) / 3) * 255);
    const col = (r: number, g: number, b: number, a: number): number => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    const cBase = col(58, 122, 200, baseA);
    const cLight = col(90, 160, 228, baseA + 10);
    const cLight2 = col(150, 200, 240, baseA + 30);
    const cEdge = col(214, 238, 255, 210);
    const cEdge2 = col(160, 210, 245, 170);
    const sx = Math.floor(t * 5), sy = Math.floor(t * 2);
    const lap = Math.floor(t * 6);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!cover[i]) { px[i] = 0; continue; }
        const edge = (x === 0 || !cover[i - 1]) || (x === w - 1 || !cover[i + 1]) || (y === 0 || !cover[i - w]) || (y === h - 1 || !cover[i + w]);
        if (edge) { px[i] = ((x + y + lap) & 3) === 0 ? cEdge2 : cEdge; continue; }
        const c = caus[((y + sy) & 63) * 64 + ((x + sx) & 63)];
        px[i] = c === 2 ? cLight2 : c === 1 ? cLight : cBase;
      }
    }
    // Highlight strokes that drift across the water and blink.
    const n = Math.floor((w * h) / 700);
    for (let k = 0; k < n; k++) {
      const hx = Math.floor((hash2(k, 1) * w + t * (4 + hash2(k, 2) * 4)) % w);
      const hy = Math.floor(hash2(k, 3) * h);
      if (((Math.floor(t * 2 + hash2(k, 4) * 8)) & 3) === 0) continue;
      const len = 2 + Math.floor(hash2(k, 5) * 4);
      for (let j = 0; j < len; j++) {
        const i = hy * w + hx + j;
        if (hx + j < w && cover[i]) px[i] = j === 0 || j === len - 1 ? cLight2 : cEdge;
      }
    }
    // Ripples round anyone standing in the water.
    for (const p of this.env.people) {
      if (!p.visible) continue;
      const lx = Math.round(p.x - this.rx), ly = Math.round(p.y - this.ry - 1);
      if (lx < 0 || ly < 0 || lx >= w || ly >= h || !cover[ly * w + lx]) continue;
      const rr0 = 4 + ((t * 7 + (p.id.charCodeAt(0) % 7)) % 6);
      for (let a = 0; a < 40; a++) {
        const ang = (a / 40) * Math.PI * 2;
        const xx = Math.round(lx + Math.cos(ang) * rr0), yy = Math.round(ly + Math.sin(ang) * rr0 * 0.45);
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && cover[yy * w + xx]) px[yy * w + xx] = rr0 > 8 ? cLight2 : cEdge;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.tex.source.update();
  }

  dispose(): void {
    this.sprite.destroy();
    this.tex.destroy(true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Spray: things firing out of a point
// ─────────────────────────────────────────────────────────────────────────────

let SPRAY_FRAMES: Record<string, Texture[]> | null = null;
function sprayFrames(): Record<string, Texture[]> {
  return (SPRAY_FRAMES ??= {
    paper: framesOf(['paper0', 'paper1', 'paper2', 'paper1'], true),
    cash: framesOf(['cash0', 'cash1', 'cash2', 'cash1'], true),
    snacks: framesOf(['chips', 'chipsB', 'candy', 'donut', 'soda'], true),
    confetti: confetti(),
    water: [squareTex(1), squareTex(2)]
  });
}

export class Spray extends Lasting<Of<'spray'>> {
  private acc = 0;
  constructor(inst: Of<'spray'>, env: Env) {
    super(inst, env);
    this.introT = 0.2;
    this.outroT = 0.3;
  }
  tick(dt: number): void {
    const { inst, env } = this;
    const pw = Math.max(0.1, Math.min(1, inst.power)) * this.vis;
    const rate = inst.what === 'water' ? 30 + 60 * pw : inst.what === 'confetti' ? 20 + 40 * pw : 5 + 22 * pw;
    this.acc += dt * rate;
    const fr = sprayFrames()[inst.what];
    while (this.acc >= 1) {
      this.acc -= 1;
      const p = env.parts.spawn();
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const sp = rr(25, 70 + 60 * pw);
      p.x = inst.x; p.y = inst.y; p.z = rr(6, 12);
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.5; p.vz = rr(60, 110 + 60 * pw); p.g = 260;
      p.frames = fr; p.layer = Layer.Air; p.life = 6;
      let tint = 0xffffff;
      switch (inst.what) {
        case 'water':
          p.land = Land.Splash; p.fadeOut = 0; tint = pick([C.blueL, 0xffffff, C.blue]); p.still = true;
          break;
        case 'snacks':
          p.land = Land.Bounce; p.bounce = 0.35; p.settle = rr(3, 6); p.still = true;
          break;
        case 'confetti':
          p.land = Land.Settle; p.settle = rr(2, 4); tint = pick(CONFETTI_TINTS); p.term = rr(16, 26); p.sway = rr(2, 3); p.swayF = rr(5, 8); p.fps = 10;
          break;
        default:
          p.land = Land.Settle; p.settle = rr(3, 5); p.term = rr(18, 28); p.sway = rr(2, 4); p.swayF = rr(4, 7); p.swayPh = rr(0, 6); p.fps = 8;
      }
      env.parts.commit(p, null, tint);
    }
  }
  dispose(): void {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Quake: dust and grit falling, debris bouncing
// ─────────────────────────────────────────────────────────────────────────────

export class Quake extends Lasting<Of<'quake'>> {
  private acc = 0;
  private debAcc = 0;
  constructor(inst: Of<'quake'>, env: Env) {
    super(inst, env);
    this.introT = 0.2;
    this.outroT = 0.8;
  }
  tick(dt: number): void {
    const { inst, env } = this;
    const v = env.view;
    const pw = Math.max(0, Math.min(1, inst.power)) * this.vis;
    this.acc += dt * (12 + 70 * pw);
    while (this.acc >= 1) {
      this.acc -= 1;
      const p = env.parts.spawn();
      if (!p) break;
      p.x = rr(v.x0, v.x1); p.y = rr(v.y0 + 20, v.y1 + 10); p.z = rr(50, 110);
      p.vz = rr(-200, -130); p.life = 2; p.land = Land.Splash; p.fx = 1; p.fadeOut = 0; p.layer = Layer.Air;
      p.alpha = 0.85;
      env.parts.commit(p, shapeTex('streak'), pick([0xd8ccb4, 0xc8b89a, 0xe8e0cc]));
    }
    this.debAcc += dt * (2 + 14 * pw);
    while (this.debAcc >= 1) {
      this.debAcc -= 1;
      const p = env.parts.spawn();
      if (!p) break;
      p.x = rr(v.x0, v.x1); p.y = rr(v.y0 + 20, v.y1 + 10); p.z = rr(60, 120);
      p.vz = rr(-60, -20); p.g = 400; p.vx = rr(-10, 10); p.life = 6;
      p.land = Land.Bounce; p.bounce = 0.45; p.settle = rr(1.5, 3); p.layer = Layer.Air;
      env.parts.commit(p, shapeTex(Math.random() < 0.5 ? 'debris' : 'debrisB', true), 0xffffff);
    }
  }
  dispose(): void {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Rain of cash, confetti or paper into a room
// ─────────────────────────────────────────────────────────────────────────────

export class Rain extends Lasting<Of<'rain'>> {
  private acc = 0;
  constructor(inst: Of<'rain'>, env: Env) {
    super(inst, env);
    this.introT = 0.5;
    this.outroT = 1;
  }
  tick(dt: number): void {
    const { inst, env } = this;
    const r = Math.max(0, Math.min(1, inst.rate)) * this.vis;
    const fr = sprayFrames()[inst.what];
    this.acc += dt * (2 + r * (inst.what === 'confetti' ? 45 : 22));
    while (this.acc >= 1) {
      this.acc -= 1;
      const p = env.parts.spawn();
      if (!p) break;
      randomFloorPoint(inst.room, TMP);
      p.x = TMP.x; p.y = TMP.y; p.z = rr(70, 110);
      p.vz = -rr(10, 20); p.g = 60; p.term = rr(18, 30);
      p.sway = rr(2, 5); p.swayF = rr(3, 6); p.swayPh = rr(0, 6);
      p.frames = fr; p.fps = inst.what === 'confetti' ? 10 : 7; p.life = 12;
      p.land = Land.Settle; p.settle = inst.what === 'cash' ? rr(4, 7) : rr(2.5, 4.5); p.layer = Layer.Air;
      env.parts.commit(p, null, inst.what === 'confetti' ? pick(CONFETTI_TINTS) : 0xffffff);
    }
  }
  dispose(): void {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Balloons bobbing about a room
// ─────────────────────────────────────────────────────────────────────────────

interface Balloon { box: Container; ball: Sprite; str: Sprite; shadow: Sprite; x: number; y: number; tx: number; ty: number; ph: number; wait: number }

export class Balloons extends Lasting<Of<'balloons'>> {
  private list: Balloon[] = [];
  private strFrames = stringFrames(12);
  private t = 0;
  constructor(inst: Of<'balloons'>, env: Env) {
    super(inst, env);
    this.introT = 1.2;
    this.outroT = 1.6;
  }
  private add(): void {
    const box = new Container();
    const col = BALLOON_COLORS[this.list.length % BALLOON_COLORS.length];
    const str = new Sprite(this.strFrames[0]);
    str.anchor.set(0.5, 0);
    const ball = new Sprite(balloonTex(col));
    ball.anchor.set(0.5, 1);
    box.addChild(str, ball);
    const shadow = new Sprite(shadowTex(3, 1.5));
    shadow.anchor.set(0.5);
    shadow.alpha = 0.18;
    randomFloorPoint(this.inst.room, TMP);
    const b: Balloon = { box, ball, str, shadow, x: TMP.x, y: TMP.y, tx: TMP.x, ty: TMP.y, ph: Math.random() * 6, wait: 0 };
    this.env.sorted.addChild(box);
    this.env.floor.addChild(shadow);
    this.list.push(b);
  }
  tick(dt: number): void {
    const { inst } = this;
    this.t += dt;
    const want = Math.max(0, Math.min(24, Math.round(inst.count)));
    while (this.list.length < want) this.add();
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i];
      const on = i < want;
      b.wait -= dt;
      if (b.wait <= 0) {
        randomFloorPoint(inst.room, TMP);
        b.tx = TMP.x; b.ty = TMP.y; b.wait = rr(3, 7);
      }
      b.x = approach(b.x, b.tx, 0.35, dt);
      b.y = approach(b.y, b.ty, 0.35, dt);
      const v = on ? this.vis : 0;
      // Rise from the floor on the way in; float off upwards on the way out.
      const lift = this.dying ? 22 + (1 - v) * 90 : 22 * Math.min(1, v * 1.3);
      const z = lift + Math.sin(this.t * 1.6 + b.ph) * 2.5;
      b.box.x = Math.round(b.x + Math.sin(this.t * 0.9 + b.ph) * 1.5);
      b.box.y = Math.round(b.y - z);
      b.box.zIndex = b.y;
      b.ball.y = 0;
      b.str.y = -1;
      b.str.texture = this.strFrames[Math.floor(this.t * 2 + b.ph) % 2];
      b.box.alpha = stepA(v, 3);
      b.box.visible = v > 0.01;
      b.shadow.position.set(Math.round(b.x), Math.round(b.y));
      b.shadow.visible = b.box.visible;
      b.shadow.alpha = 0.18 * stepA(v, 3);
    }
  }
  dispose(): void {
    for (const b of this.list) { b.box.destroy({ children: true }); b.shadow.destroy(); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A prop on the floor
// ─────────────────────────────────────────────────────────────────────────────

export class Item extends Lasting<Of<'item'>> {
  private sprite: Sprite;
  private frames: Texture[];
  private flat: boolean;
  private landed = false;
  private t = 0;
  constructor(inst: Of<'item'>, env: Env) {
    super(inst, env);
    this.flat = FLAT_ITEMS.has(inst.item);
    this.introT = this.flat ? 0.8 : 0.45;
    this.outroT = 0.6;
    this.frames = itemFrames(inst.item);
    this.sprite = new Sprite(this.frames[0]);
    this.sprite.anchor.set(0.5, this.flat ? 0.5 : 1);
    (this.flat ? env.floor : env.sorted).addChild(this.sprite);
  }
  tick(dt: number): void {
    const { inst, env } = this;
    this.t += dt;
    const s = this.sprite;
    if (this.frames.length > 1) s.texture = this.frames[Math.floor(this.t * (inst.item === 'foam' ? 2 : inst.item === 'scuffle' ? 9 : 5)) % this.frames.length];
    s.x = Math.round(inst.x);
    if (this.flat) {
      s.y = Math.round(inst.y - 2);
      s.alpha = stepA(this.vis, 4);
      return;
    }
    // Drop in with a bounce, then sit; on the way out, sink in steps.
    let z = 0;
    if (!this.dying && this.vis < 1) {
      const k = this.vis;
      z = k < 0.6 ? (1 - k / 0.6) * 16 : Math.sin(((k - 0.6) / 0.4) * Math.PI) * 3;
    }
    if (!this.landed && this.vis >= 0.6) {
      this.landed = true;
      emitBurst(env.parts, 'dust', inst.x, inst.y, 0, 7);
    }
    s.y = Math.round(inst.y - z);
    s.zIndex = inst.y;
    s.alpha = this.dying ? stepA(this.vis, 3) : 1;
    const sq = !this.dying && this.vis > 0.6 && this.vis < 0.75 ? 0.15 : 0;
    s.scale.set(1 + sq, 1 - sq);
  }
  dispose(): void {
    if (!this.flat) emitPoof(this.env.parts, this.inst.x, this.inst.y - 4, 0, 5, 0xffffff, 0, 0, 0, 0.4);
    this.sprite.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Emoji: a free-text event's body, as chunky pixel art standing on the floor
// ─────────────────────────────────────────────────────────────────────────────

export class Emoji extends Lasting<Of<'emoji'>> {
  private box = new Container();
  private sprite: Sprite;
  private shadow: Sprite;
  private t = Math.random() * 6;
  private scaleN: number;
  constructor(inst: Of<'emoji'>, env: Env) {
    super(inst, env);
    this.introT = 0.5;
    this.outroT = 0.5;
    const { texture } = emojiTex(inst.emoji);
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 1);
    // size: >= 8 means pixels tall; smaller numbers are a multiple of 16 px.
    const want = inst.size >= 8 ? inst.size : Math.max(0.5, inst.size) * 16;
    this.scaleN = Math.max(1, Math.round(want / texture.height));
    this.box.addChild(this.sprite);
    this.shadow = new Sprite(shadowTex(Math.max(3, (texture.width * this.scaleN) / 3), Math.max(1.5, this.scaleN)));
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.22;
    env.floor.addChild(this.shadow);
    env.sorted.addChild(this.box);
    emitBurst(env.parts, 'sparkles', inst.x, inst.y, (texture.height * this.scaleN) / 2, 14);
  }
  tick(dt: number): void {
    const { inst } = this;
    this.t += dt;
    const k = this.vis;
    const pop = this.dying ? k : easeOutBack(Math.min(1, k));
    const bob = inst.bob ? Math.round(2 + Math.sin(this.t * 2.6) * 2) : 0;
    const lift = inst.lift ?? 0;
    this.box.x = Math.round(inst.x);
    this.box.y = Math.round(inst.y - lift - bob);
    // A badge floats over whoever it belongs to, so it is drawn after them.
    this.box.zIndex = inst.y + (lift ? 2 : 0);
    this.shadow.visible = !lift;
    // A hop of squash on the bob's low point, then integer scale at rest.
    const sq = inst.bob ? Math.max(0, -Math.sin(this.t * 2.6)) * 0.08 : 0;
    this.sprite.scale.set(this.scaleN * pop * (1 + sq), this.scaleN * pop * (1 - sq));
    this.box.alpha = this.dying ? stepA(k, 3) : 1;
    this.shadow.position.set(Math.round(inst.x), Math.round(inst.y));
    this.shadow.scale.set(pop * (1 - bob * 0.04));
  }
  dispose(): void {
    emitBurst(this.env.parts, 'sparkles', this.inst.x, this.inst.y, 8, 8);
    this.box.destroy({ children: true });
    this.shadow.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bees
// ─────────────────────────────────────────────────────────────────────────────

interface Bee { s: Sprite; ph: number; w1: number; w2: number; a: number; b: number; lastX: number }

export class Bees extends Lasting<Of<'bees'>> {
  private bees: Bee[] = [];
  private frames = beeFrames();
  private t = 0;
  private spread = 0;
  constructor(inst: Of<'bees'>, env: Env) {
    super(inst, env);
    this.introT = 1;
    this.outroT = 1.2;
  }
  tick(dt: number): void {
    const { inst, env } = this;
    this.t += dt;
    const want = Math.max(0, Math.min(40, Math.round(inst.count)));
    while (this.bees.length < want) {
      const s = new Sprite(this.frames[0]);
      s.anchor.set(0.5, 1);
      env.sorted.addChild(s);
      this.bees.push({ s, ph: Math.random() * 20, w1: rr(1.6, 3.2), w2: rr(2.2, 4.4), a: rr(0.5, 1), b: rr(0.5, 1), lastX: 0 });
    }
    const spreadT = Math.max(6, inst.spread) * (this.dying ? 1 + (1 - this.vis) * 3 : 0.3 + 0.7 * this.vis);
    this.spread = approach(this.spread, spreadT, 3, dt);
    for (let i = 0; i < this.bees.length; i++) {
      const b = this.bees[i];
      const on = i < want;
      b.s.visible = on && this.vis > 0.02;
      if (!b.s.visible) continue;
      const tt = this.t + b.ph;
      const x = inst.x + Math.cos(tt * b.w1) * this.spread * b.a + Math.sin(tt * 5.3) * 1.5;
      const y = inst.y + Math.sin(tt * b.w2) * this.spread * 0.55 * b.b;
      const z = 12 + Math.sin(tt * 3.1) * 6 + Math.sin(tt * 11) * 1;
      b.s.x = Math.round(x);
      b.s.y = Math.round(y - z);
      b.s.zIndex = y;
      if (Math.abs(x - b.lastX) > 0.05) b.s.scale.x = x < b.lastX ? -1 : 1;
      b.lastX = x;
      b.s.texture = this.frames[Math.floor(tt * 14) % 2];
      b.s.alpha = this.dying ? stepA(this.vis, 3) : 1;
    }
  }
  dispose(): void {
    for (const b of this.bees) b.s.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A cloud hanging at a spot
// ─────────────────────────────────────────────────────────────────────────────

const STINK_LINE = ['.g', 'g.', '.g', 'g.', '.g'];

export class Cloud extends Lasting<Of<'cloud'>> {
  private acc = 0;
  private acc2 = 0;
  private gold = goldSparkleFrames();
  constructor(inst: Of<'cloud'>, env: Env) {
    super(inst, env);
    this.introT = 0.8;
    this.outroT = 1.2;
  }
  tick(dt: number): void {
    const { inst, env } = this;
    const R = Math.max(6, inst.radius);
    const k = this.vis;
    const rate = (R / 10) * (inst.what === 'steam' ? 5 : 3.2) * k;
    this.acc += dt * rate;
    while (this.acc >= 1) {
      this.acc -= 1;
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R;
      const x = inst.x + Math.cos(a) * d, y = inst.y + Math.sin(a) * d * 0.5;
      switch (inst.what) {
        case 'stink':
          emitDrift(env.parts, x, y, rr(2, 10), rr(3, 5), pick([0x9ad06a, 0x7ab454, 0xb8de88]), rr(-3, 3), 0, rr(3, 8), rr(1.8, 2.8), 0.55);
          break;
        case 'magic':
          emitDrift(env.parts, x, y, rr(4, 16), rr(2.5, 4), pick([0xc8a0ff, 0xff9ad8, 0xa8c8ff]), rr(-3, 3), 0, rr(4, 10), rr(1.2, 2), 0.6);
          break;
        case 'gloom':
          emitDrift(env.parts, x, y, rr(10, 22), rr(4, 6), pick([0x4a4858, 0x5a5868, 0x3e3c4a]), rr(-2, 2), 0, rr(-1, 1), rr(2, 3.5), 0.7);
          break;
        case 'steam':
          emitDrift(env.parts, x, y, rr(2, 8), rr(2.5, 4.5), pick([0xffffff, 0xe8eef8]), rr(-3, 3), 0, rr(16, 26), rr(0.9, 1.5), 0.7);
          break;
      }
    }
    this.acc2 += dt * k * (inst.what === 'magic' ? 8 : inst.what === 'stink' ? 2 : inst.what === 'gloom' ? 4 : 0);
    while (this.acc2 >= 1) {
      this.acc2 -= 1;
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R;
      const x = inst.x + Math.cos(a) * d, y = inst.y + Math.sin(a) * d * 0.5;
      const p = env.parts.spawn();
      if (!p) break;
      p.x = x; p.y = y;
      if (inst.what === 'magic') {
        p.z = rr(4, 24); p.vz = rr(2, 8); p.frames = Math.random() < 0.5 ? this.gold : sparkles(); p.fps = rr(6, 10); p.life = rr(0.6, 1.1); p.layer = Layer.High;
        env.parts.commit(p, null, pick([0xffffff, 0xffc8ff, 0xc8e8ff]));
      } else if (inst.what === 'stink') {
        p.z = rr(4, 10); p.vz = rr(8, 14); p.life = rr(1, 1.6); p.sway = 1; p.swayF = 6; p.layer = Layer.Air; p.alpha = 0.8;
        env.parts.commit(p, stinkLine(), 0xffffff);
      } else {
        // Gloom drips a little.
        p.z = rr(10, 18); p.vz = -60; p.life = 1; p.land = Land.Splash; p.layer = Layer.Air; p.fadeOut = 0;
        env.parts.commit(p, shapeTex('drop'), 0xa8b8d0);
      }
    }
  }
  dispose(): void {}
}

let STINK: Texture | null = null;
function stinkLine(): Texture {
  if (!STINK) {
    STINK = canvasTexture((() => {
      const cv = document.createElement('canvas');
      cv.width = 2; cv.height = 5;
      const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
      ctx.fillStyle = '#8fc860';
      STINK_LINE.forEach((r, y) => { for (let x = 0; x < 2; x++) if (r[x] === 'g') ctx.fillRect(x, y, 1, 1); });
      return cv;
    })());
  }
  return STINK;
}

// ─────────────────────────────────────────────────────────────────────────────
// Barrier: a roller shutter that comes down across a gap
// ─────────────────────────────────────────────────────────────────────────────

export class Barrier extends Lasting<Of<'barrier'>> {
  private box = new Container();
  private slats: Sprite[] = [];
  private foot: Sprite;
  private housing: Sprite;
  private shakeT = 0;
  private builtW = 0;
  private builtH = 0;
  constructor(inst: Of<'barrier'>, env: Env) {
    super(inst, env);
    this.introT = 0.6;
    this.outroT = 0.6;
    this.foot = new Sprite(Texture.EMPTY);
    this.housing = new Sprite(Texture.EMPTY);
    env.sorted.addChild(this.box);
    this.build();
  }
  private build(): void {
    const { inst } = this;
    const w = Math.max(4, Math.round(inst.w)), h = Math.max(4, Math.round(inst.h));
    if (w === this.builtW && h === this.builtH) return;
    this.builtW = w; this.builtH = h;
    this.box.removeChildren();
    for (const s of this.slats) s.destroy();
    this.slats.length = 0;
    const n = Math.ceil(h / 3);
    for (let i = 0; i < n; i++) {
      const s = new Sprite(slatTex(w));
      this.slats.push(s);
      this.box.addChild(s);
    }
    this.foot.texture = shutterFootTex(w);
    this.housing.texture = housingTex(w);
    this.box.addChild(this.foot, this.housing);
  }
  apply(inst: Of<'barrier'>): void {
    super.apply(inst);
    this.build();
  }
  tick(dt: number): void {
    const { inst } = this;
    this.shakeT += dt;
    const w = this.builtW, h = this.builtH;
    // How far down the shutter has rolled (eased, with a little bounce at the end).
    const k = this.vis;
    const down = this.dying ? k : k < 0.85 ? (k / 0.85) * 1.04 : 1.04 - ((k - 0.85) / 0.15) * 0.04;
    const len = Math.round(h * Math.min(1.04, down));
    // Jammed: a small rattle every couple of seconds.
    const rattle = !this.dying && k >= 1 && (this.shakeT % 2.2) < 0.25 ? (Math.floor(this.shakeT * 30) % 2 ? 1 : -1) : 0;
    this.box.x = Math.round(inst.x) + rattle;
    this.box.y = Math.round(inst.y);
    this.box.zIndex = inst.y + h;
    const n = this.slats.length;
    for (let i = 0; i < n; i++) {
      // Slats ride down with the bottom edge; ones still inside the housing are hidden.
      const y = len - (n - i) * 3;
      this.slats[i].y = y;
      this.slats[i].visible = y >= 0;
    }
    this.foot.y = Math.max(0, len - 3);
    this.foot.visible = len > 0;
    this.housing.x = -1;
    this.housing.y = -2;
    this.box.alpha = this.dying && k < 0.2 ? stepA(k * 5, 3) : 1;
    void w;
  }
  dispose(): void {
    this.box.destroy({ children: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Screens: dead monitors, or a little "no signal" sign over each
// ─────────────────────────────────────────────────────────────────────────────

export class Screens extends Lasting<Of<'screens'>> {
  private patches: Sprite[] = [];
  private signs: Sprite[] = [];
  private t = 0;
  constructor(inst: Of<'screens'>, env: Env) {
    super(inst, env);
    this.introT = 0.3;
    this.outroT = 0.4;
  }
  tick(dt: number): void {
    const { inst, env } = this;
    this.t += dt;
    while (this.patches.length < inst.at.length) {
      const p = new Sprite(offScreenTex());
      p.anchor.set(0.5);
      env.floor.addChild(p);
      this.patches.push(p);
      const s = new Sprite(noSignalTex());
      s.anchor.set(0.5, 1);
      env.high.addChild(s);
      this.signs.push(s);
    }
    for (let i = 0; i < this.patches.length; i++) {
      const on = i < inst.at.length;
      const p = this.patches[i], s = this.signs[i];
      p.visible = on;
      s.visible = on && inst.state === 'nosignal';
      if (!on) continue;
      const a = inst.at[i];
      // Screens die one after another down the row, not all at once.
      const stagger = Math.min(1, Math.max(0, this.vis * 1.6 - (i / Math.max(1, inst.at.length)) * 0.6));
      p.position.set(Math.round(a.x), Math.round(a.y));
      p.alpha = stepA(stagger, 2) * (inst.state === 'off' ? 0.95 : 0.85);
      if (s.visible) {
        const blink = Math.floor(this.t * 2 + i * 0.37) % 4 !== 3;
        s.position.set(Math.round(a.x), Math.round(a.y - 6 + Math.sin(this.t * 3 + i) * 1));
        s.alpha = blink ? stepA(stagger, 2) : 0;
      }
    }
  }
  dispose(): void {
    for (const p of this.patches) p.destroy();
    for (const s of this.signs) s.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CensorCloud: lively animated NSFW censor mosaic over entangled couples
// ─────────────────────────────────────────────────────────────────────────────

type CensorStyle = 'hot' | 'kink' | 'taboo';

const CENSOR_PALETTES: Record<CensorStyle, readonly number[]> = {
  hot: [0xf5d6ba, 0xff86a8, 0xf2b59c, 0xd0507a, 0x241822, 0xfff0e4],
  kink: [0xd03060, 0x5a2458, 0x241822, 0xff86a8, 0x3b183e, 0xffd2e4],
  taboo: [0xb82438, 0xffd93d, 0x241822, 0xff5a8a, 0x501822, 0xfff0e4]
};

const CENSOR_LABEL: Record<CensorStyle, { text: string; color: number }> = {
  hot: { text: 'CENSORED', color: C.pink },
  kink: { text: 'KINKY!', color: 0xff5a8a },
  taboo: { text: 'HR ALERT', color: C.yellow }
};

function buildCensorCloudFrames(style: CensorStyle): Texture[] {
  const pal = CENSOR_PALETTES[style];
  return [0, 1, 2].map((shift) => {
    const px = new Pix(36, 22);
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 12; gx++) {
        const idx = (gx * 3 + gy * 5 + shift * 2) % pal.length;
        px.rect(gx * 3, Math.min(18, gy * 3), 3, 4, pal[idx]);
      }
    }
    px.rect(0, 0, 36, 1, INK);
    px.rect(0, 21, 36, 1, INK);
    px.rect(0, 0, 1, 22, INK);
    px.rect(35, 0, 1, 22, INK);
    px.rect(1, 7, 34, 8, INK);
    return px.toTexture();
  });
}

export class CensorCloud extends Lasting<Of<'censorCloud'>> {
  private box = new Container();
  private frames: Texture[];
  private bg: Sprite;
  private label: Sprite;
  private labelTex: Texture;
  private style: CensorStyle;
  private t = 0;
  private heartAcc = 0;
  private puffAcc = 0;
  private clothesAcc = 0;
  private sparkAcc = 0;

  constructor(inst: Of<'censorCloud'>, env: Env) {
    super(inst, env);
    this.introT = 0.25;
    this.outroT = 0.35;
    this.style = inst.style ?? 'hot';
    this.frames = buildCensorCloudFrames(this.style);
    this.bg = new Sprite(this.frames[0]);
    this.bg.anchor.set(0.5, 0.5);
    const lbl = CENSOR_LABEL[this.style];
    this.labelTex = textPix(lbl.text, lbl.color).toTexture();
    this.label = new Sprite(this.labelTex);
    this.label.anchor.set(0.5, 0.5);
    this.box.addChild(this.bg, this.label);
    env.high.addChild(this.box);
  }

  tick(dt: number): void {
    const { inst, env } = this;
    this.t += dt;
    const drive = Math.max(0.5, inst.intensity ?? 1);
    const bounce = Math.abs(Math.sin(this.t * 10 * drive));
    this.bg.texture = this.frames[Math.floor(this.t * 7) % this.frames.length];
    this.box.position.set(Math.round(inst.x + Math.sin(this.t * 13) * 1.6), Math.round(inst.y - 16 - bounce * 2));
    this.box.scale.set(1 + bounce * 0.08, 1 - bounce * 0.06);
    this.box.alpha = stepA(this.vis, 3);

    this.heartAcc += dt * 2.8 * drive * this.vis;
    while (this.heartAcc >= 1) {
      this.heartAcc -= 1;
      emitBurst(env.parts, 'hearts', inst.x + rr(-8, 8), inst.y, rr(18, 28), 2);
    }
    this.puffAcc += dt * 4.5 * drive * this.vis;
    while (this.puffAcc >= 1) {
      this.puffAcc -= 1;
      const puffPal = this.style === 'kink'
        ? [0xd05090, 0x8030a0, 0xffa6c4]
        : this.style === 'taboo'
          ? [0xffb0b8, 0xffe080, 0xff7090]
          : [0xffd2e4, 0xffffff, 0xffa6c4];
      emitDrift(env.parts, inst.x + rr(-10, 10), inst.y, rr(10, 22), rr(2.5, 4), pick(puffPal), rr(-10, 10), 0, rr(10, 18), 0.7, 0.75, Layer.High);
    }
    if (this.style !== 'kink') {
      this.clothesAcc += dt * 0.45 * drive * this.vis;
      while (this.clothesAcc >= 1) {
        this.clothesAcc -= 1;
        emitBurst(env.parts, 'clothes', inst.x, inst.y, 14, 3);
      }
    }
    if (this.style === 'kink' || this.style === 'taboo') {
      this.sparkAcc += dt * 5.0 * drive * this.vis;
      while (this.sparkAcc >= 1) {
        this.sparkAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const col = this.style === 'kink' ? pick([0xff5a8a, 0xd03060, 0xc8a0ff]) : pick([0xffd93d, 0xff5a8a, 0xffffff]);
        emitSpark(env.parts, inst.x + rr(-6, 6), inst.y, rr(10, 22), Math.cos(a) * rr(18, 42), Math.sin(a) * rr(6, 14), rr(18, 40), col, 0.45, 1, 90, Layer.High);
      }
    }
  }

  dispose(): void {
    this.box.destroy({ children: true });
    for (const f of this.frames) f.destroy(true);
    this.labelTex.destroy(true);
  }
}
