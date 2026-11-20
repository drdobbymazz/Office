// Things with a body that move about: the flying saucer, the ghost and the
// animals. Each sits in the y-sorted layer (or the air, for the saucer) with
// its shadow on the floor.

import { Container, Sprite, Texture } from 'pixi.js';
import type { EffectInstance } from '@/game/view/api';
import { Lasting, approach, pick, rr, type Env } from './core';
import { emitBurst, emitPoof } from './emit';
import { Layer } from './particles';
import { poolTex, shadowTex } from './procedural';
import { creatureFrames, ghostTex, saucerFrames, type CreatureAnim } from './sprites';
import { BAYER4, canvasTexture, easeOutCubic, stepA } from './pix';
import { squareTex } from './art';

type Of<K extends EffectInstance['kind']> = Extract<EffectInstance, { kind: K }>;

// ─────────────────────────────────────────────────────────────────────────────
// The flying saucer and its tractor beam
// ─────────────────────────────────────────────────────────────────────────────

const BEAM_FRAMES = new Map<number, Texture[]>();

/** A stepped cone of light, `h` px tall, 3 frames of bands scrolling upward. */
function beamFrames(h: number): Texture[] {
  const hq = Math.max(8, Math.round(h / 4) * 4);
  let f = BEAM_FRAMES.get(hq);
  if (f) return f;
  f = [];
  for (let k = 0; k < 3; k++) {
    const top = 5, bot = 17;
    const w = bot * 2 + 2;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = hq;
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.createImageData(w, hq);
    const d = img.data;
    for (let y = 0; y < hq; y++) {
      const t = y / (hq - 1);
      const half = top + (bot - top) * t;
      const scan = ((y + k * 2) % 6) < 2;
      for (let x = 0; x < w; x++) {
        const u = Math.abs(x + 0.5 - w / 2) / half;
        if (u > 1) continue;
        // Three bands: pale rim (dithered), body, bright core.
        let a = 0, r = 0, g = 0, b = 0;
        if (u > 0.78) {
          if (BAYER4[(y & 3) * 4 + (x & 3)] < 8) continue;
          r = 120; g = 220; b = 110; a = 70;
        } else if (u > 0.4) {
          r = 140; g = 230; b = 130; a = scan ? 105 : 80;
        } else {
          r = 200; g = 255; b = 180; a = scan ? 140 : 115;
        }
        const i = (y * w + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    f.push(canvasTexture(cv));
  }
  BEAM_FRAMES.set(hq, f);
  return f;
}

export class Ufo extends Lasting<Of<'ufo'>> {
  private box = new Container();
  private saucer: Sprite;
  private beam: Sprite;
  private shadow: Sprite;
  private floorGlow: Sprite;
  private frames = saucerFrames();
  private t = 0;
  private moteAcc = 0;
  private beamK = 0;
  private x: number;
  private y: number;
  constructor(inst: Of<'ufo'>, env: Env) {
    super(inst, env);
    this.introT = 1.4;
    this.outroT = 1.2;
    this.x = inst.x;
    this.y = inst.y;
    this.saucer = new Sprite(this.frames[0]);
    this.saucer.anchor.set(0.5, 1);
    this.beam = new Sprite(Texture.EMPTY);
    this.beam.anchor.set(0.5, 0);
    this.beam.blendMode = 'add';
    this.box.addChild(this.beam, this.saucer);
    this.shadow = new Sprite(Texture.EMPTY);
    this.shadow.anchor.set(0.5);
    this.floorGlow = new Sprite(poolTex(18, 0.5, 3));
    this.floorGlow.anchor.set(0.5);
    this.floorGlow.tint = 0x9cf07a;
    this.floorGlow.blendMode = 'add';
    env.floor.addChild(this.shadow, this.floorGlow);
    env.air.addChild(this.box);
  }
  tick(dt: number): void {
    const { inst, env } = this;
    this.t += dt;
    this.x = approach(this.x, inst.x, 8, dt);
    this.y = approach(this.y, inst.y, 8, dt);
    const k = this.vis;
    // Swoop in from high up; on the way out, zip up and off to the side.
    const e = easeOutCubic(k);
    const extra = this.dying ? (1 - k) * (1 - k) * 220 : (1 - e) * 160;
    const side = this.dying ? (1 - k) * (1 - k) * 160 : (1 - e) * -60;
    const bob = Math.sin(this.t * 2.2) * 2.5;
    const sway = Math.sin(this.t * 1.3) * 2;
    const hgt = Math.max(12, inst.height) + extra + bob;
    const sx = this.x + sway + side;
    this.box.x = Math.round(sx);
    this.box.y = Math.round(this.y - hgt);
    this.saucer.texture = this.frames[Math.floor(this.t * 9) % 4];
    // A tiny wobble: the hull shifts a pixel against the dome now and then.
    this.saucer.x = Math.sin(this.t * 7) > 0.85 ? 1 : 0;
    this.saucer.y = 0;
    this.box.alpha = this.dying ? stepA(Math.min(1, k * 2), 3) : stepA(Math.min(1, k * 3), 3);
    // Shadow shrinks and fades with height.
    const sh = Math.max(4, 16 - hgt * 0.06);
    this.shadow.texture = shadowTex(Math.round(sh), Math.round(sh * 0.4));
    this.shadow.position.set(Math.round(sx), Math.round(this.y));
    this.shadow.alpha = Math.max(0.08, 0.3 - hgt * 0.0015) * stepA(k, 3);
    // Beam.
    this.beamK = approach(this.beamK, Math.max(0, Math.min(1, inst.beam)) * (this.dying ? 0 : 1), 6, dt);
    const bk = this.beamK;
    const beamH = Math.round(hgt - 1);
    this.beam.visible = bk > 0.03;
    if (this.beam.visible) {
      const fr = beamFrames(beamH);
      this.beam.texture = fr[Math.floor(this.t * 10) % 3];
      this.beam.y = -1;
      this.beam.x = 0;
      this.beam.scale.y = beamH / this.beam.texture.height;
      this.beam.alpha = stepA(bk, 4) * (0.85 + (Math.floor(this.t * 12) % 2) * 0.15);
    }
    this.floorGlow.visible = this.beam.visible;
    this.floorGlow.position.set(Math.round(sx), Math.round(this.y - 1));
    this.floorGlow.alpha = stepA(bk, 3) * 0.45;
    if (bk > 0.1) env.dark.addLight(sx, this.y - 4, 26 * bk, bk);
    // Motes rising up the beam.
    this.moteAcc += dt * bk * 26;
    while (this.moteAcc >= 1) {
      this.moteAcc -= 1;
      const p = env.parts.spawn();
      if (!p) break;
      p.x = sx + rr(-11, 11); p.y = this.y + rr(-2, 2); p.z = rr(0, 6);
      p.vz = rr(30, 60); p.life = Math.min(2.5, (beamH - 8) / 45); p.fadeOut = 0.3; p.layer = Layer.High;
      p.sway = rr(0.5, 1.5); p.swayF = rr(4, 8);
      env.parts.commit(p, squareTex(1), pick([0xeaffd8, 0xb8ffb0, 0xffffff]));
    }
  }
  dispose(): void {
    this.box.destroy({ children: true });
    this.shadow.destroy();
    this.floorGlow.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The ghost
// ─────────────────────────────────────────────────────────────────────────────

export class Ghost extends Lasting<Of<'ghost'>> {
  private sprite: Sprite;
  private shadow: Sprite;
  private t = Math.random() * 5;
  private wispAcc = 0;
  private lunge = 0;
  private lastMood: string;
  private x: number;
  private y: number;
  constructor(inst: Of<'ghost'>, env: Env) {
    super(inst, env);
    this.introT = 1;
    this.outroT = 1.2;
    this.x = inst.x;
    this.y = inst.y;
    this.lastMood = inst.mood;
    this.sprite = new Sprite(ghostTex(inst.mood, 0, false));
    this.sprite.anchor.set(0.5, 1);
    this.shadow = new Sprite(shadowTex(5, 2));
    this.shadow.anchor.set(0.5);
    env.floor.addChild(this.shadow);
    env.sorted.addChild(this.sprite);
    emitPoof(env.parts, inst.x, inst.y - 14, 0, 8, 0xe8e0ff, 0, 0, 0, 0.6, Layer.Air, 0.7);
  }
  tick(dt: number): void {
    const { inst, env } = this;
    this.t += dt;
    this.x = approach(this.x, inst.x, 10, dt);
    this.y = approach(this.y, inst.y, 10, dt);
    if (inst.mood !== this.lastMood) {
      if (inst.mood === 'boo') this.lunge = 1;
      this.lastMood = inst.mood;
    }
    this.lunge = Math.max(0, this.lunge - dt * 2.2);
    const sad = inst.mood === 'sad';
    const boo = inst.mood === 'boo';
    const speed = sad ? 1.3 : 2.4;
    const z = (sad ? 5 : 9) + Math.sin(this.t * speed) * (sad ? 1.5 : 3);
    // Boo: a quick lunge forward and down, with a shiver.
    const dir = inst.facing === 'left' ? -1 : inst.facing === 'right' ? 1 : 0;
    const lungeK = Math.sin(this.lunge * Math.PI);
    const lx = dir * lungeK * 6 + (boo ? (Math.floor(this.t * 24) % 2 ? 0.6 : -0.6) : 0);
    const ly = inst.facing === 'down' ? lungeK * 4 : 0;
    const frame = Math.floor(this.t * (sad ? 4 : 7)) % 3;
    this.sprite.texture = ghostTex(inst.mood, frame, inst.facing === 'up');
    this.sprite.scale.x = inst.facing === 'left' ? -1 : 1;
    this.sprite.x = Math.round(this.x + lx);
    this.sprite.y = Math.round(this.y + ly - z);
    this.sprite.zIndex = this.y + ly;
    const a = Math.max(0, Math.min(1, inst.alpha)) * this.vis;
    // Translucent in steps, flickering slightly like a bad signal.
    const flick = Math.floor(this.t * 9) % 11 === 0 ? 0.75 : 1;
    this.sprite.alpha = stepA(a, 4) * 0.82 * flick;
    this.shadow.position.set(Math.round(this.x + lx), Math.round(this.y + ly));
    this.shadow.alpha = stepA(a, 3) * 0.12;
    this.shadow.scale.set(1 - z * 0.03);
    // A pale wisp trails off the hem now and then.
    this.wispAcc += dt * a * 4;
    while (this.wispAcc >= 1) {
      this.wispAcc -= 1;
      const p = env.parts.spawn();
      if (!p) break;
      p.x = this.x + rr(-5, 5); p.y = this.y + 1; p.z = z + rr(0, 3); p.vz = rr(2, 6); p.vx = -dir * rr(4, 10);
      p.life = rr(0.6, 1); p.layer = Layer.Air; p.alpha = 0.5; p.fadeOut = 0.6;
      env.parts.commit(p, squareTex(Math.random() < 0.4 ? 2 : 1), 0xe8e0ff);
    }
  }
  dispose(): void {
    emitPoof(this.env.parts, this.x, this.y - 12, 0, 7, 0xe8e0ff, 0, 0, 0, 0.5, Layer.Air, 0.6);
    this.sprite.destroy();
    this.shadow.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Animals
// ─────────────────────────────────────────────────────────────────────────────

const ANIM_FPS: Record<CreatureAnim, number> = { idle: 3, run: 12, sit: 1.5, eat: 5, jump: 1, fly: 10, happy: 8 };

export class Creature extends Lasting<Of<'creature'>> {
  private sprite: Sprite;
  private shadow: Sprite;
  private t = 0;
  private flip = 1;
  private hopT = 0;
  private heartT = 0;
  private x: number;
  private y: number;
  constructor(inst: Of<'creature'>, env: Env) {
    super(inst, env);
    this.introT = 0.4;
    this.outroT = 0.5;
    this.x = inst.x;
    this.y = inst.y;
    const tex = creatureFrames(inst.species, inst.anim, inst.carrying)[0];
    this.sprite = new Sprite(tex);
    this.sprite.anchor.set(0.5, 1);
    const big = inst.species === 'pigeon' ? 4 : 7;
    this.shadow = new Sprite(shadowTex(big, 2));
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.2;
    env.floor.addChild(this.shadow);
    env.sorted.addChild(this.sprite);
    emitBurst(env.parts, 'dust', inst.x, inst.y, 0, 6);
  }
  tick(dt: number): void {
    const { inst, env } = this;
    this.t += dt;
    this.x = approach(this.x, inst.x, 14, dt);
    this.y = approach(this.y, inst.y, 14, dt);
    if (inst.facing === 'left') this.flip = -1;
    else if (inst.facing === 'right') this.flip = 1;
    const fr = creatureFrames(inst.species, inst.anim, inst.carrying);
    this.sprite.texture = fr[Math.floor(this.t * ANIM_FPS[inst.anim]) % fr.length];
    this.sprite.scale.x = this.flip;
    // Height off the floor: jumps arc, happy animals hop, pigeons fly.
    let z = 0;
    if (inst.anim === 'jump') { this.hopT += dt; z = Math.abs(Math.sin(this.hopT * 4)) * 12; }
    else if (inst.anim === 'happy') { this.hopT += dt; z = Math.abs(Math.sin(this.hopT * 7)) * 3; }
    else if (inst.anim === 'fly') { this.hopT += dt; z = 18 + Math.sin(this.hopT * 3) * 3; }
    else this.hopT = 0;
    if (inst.anim === 'happy') {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = rr(0.6, 1.1); emitBurst(env.parts, 'hearts', this.x, this.y, 16, 1); }
    }
    this.sprite.x = Math.round(this.x);
    this.sprite.y = Math.round(this.y - z);
    this.sprite.zIndex = this.y;
    this.sprite.alpha = stepA(this.vis, 3);
    this.shadow.position.set(Math.round(this.x), Math.round(this.y));
    this.shadow.scale.set(Math.max(0.5, 1 - z * 0.025));
    this.shadow.alpha = 0.2 * stepA(this.vis, 3);
  }
  dispose(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
