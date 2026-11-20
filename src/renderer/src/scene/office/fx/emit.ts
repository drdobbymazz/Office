// Particle recipes used by many effects and cues: puffs, sparks, drops,
// splashes and the 18 small bursts.

import type { Texture } from 'pixi.js';
import type { BurstKind } from '@/game/view/api';
import { BURSTS, C, CONFETTI_TINTS, confettiFrames, framesOf, shapeTex, sparkleFrames, squareTex } from './art';
import { Land, Layer, type Particles } from './particles';
import { poofFrames, puffTex, splashFrames } from './procedural';
import { pick, rr } from './core';

let SPARKLE: Texture[] | null = null;
let CONF: Texture[] | null = null;
let SPLASH: Texture[] | null = null;
const POOFS = new Map<number, Texture[]>();
const PUFFS = new Map<number, Texture[]>();
const BURST_FRAMES = new Map<string, Texture[]>();

export const sparkles = (): Texture[] => (SPARKLE ??= sparkleFrames());
export const confetti = (): Texture[] => (CONF ??= confettiFrames());
export function poofs(r: number): Texture[] {
  let f = POOFS.get(r);
  if (!f) { f = poofFrames(r); POOFS.set(r, f); }
  return f;
}
/** Still puffs of radius r in 4 lumpy variants. */
export function puffs(r: number): Texture[] {
  let f = PUFFS.get(r);
  if (!f) { f = [0, 1, 2, 3].map((v) => puffTex(r, v)); PUFFS.set(r, f); }
  return f;
}
export const splashes = (): Texture[] => (SPLASH ??= splashFrames());

/** A puff that swells and breaks up (one-shot frames). */
export function emitPoof(parts: Particles, x: number, y: number, z: number, r: number, tint: number, vx = 0, vy = 0, vz = 0, life = 0.6, layer = Layer.Air, alpha = 1): void {
  const p = parts.spawn();
  if (!p) return;
  p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.drag = 2.5;
  p.frames = poofs(Math.max(2, Math.round(r)));
  p.fps = p.frames.length / life; p.once = true; p.life = life; p.fadeOut = 0.25;
  p.layer = layer; p.alpha = alpha;
  p.sprite.anchor.set(0.5, 0.5);
  parts.commit(p, null, tint);
}

/** A still puff that drifts (smoke, steam). */
export function emitDrift(parts: Particles, x: number, y: number, z: number, r: number, tint: number, vx: number, vy: number, vz: number, life: number, alpha: number, layer = Layer.Air): void {
  const p = parts.spawn();
  if (!p) return;
  p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
  p.frames = puffs(Math.max(2, Math.round(r))); p.still = true;
  p.life = life; p.fadeOut = 0.45; p.popIn = 0.25; p.layer = layer; p.alpha = alpha;
  p.sprite.anchor.set(0.5, 0.5);
  parts.commit(p, null, tint);
}

/** A 1-2 px spark that flies and fades. */
export function emitSpark(parts: Particles, x: number, y: number, z: number, vx: number, vy: number, vz: number, tint: number, life = 0.5, size = 1, g = 120, layer = Layer.High): void {
  const p = parts.spawn();
  if (!p) return;
  p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.g = g; p.drag = 1.2;
  p.life = life; p.fadeOut = 0.4; p.land = g > 0 ? Land.Die : Land.None; p.layer = layer;
  parts.commit(p, squareTex(size), tint);
}

/** A falling drop that splashes when it lands. */
export function emitDrop(parts: Particles, x: number, y: number, z: number, vz: number, layer = Layer.Air): void {
  const p = parts.spawn();
  if (!p) return;
  p.x = x; p.y = y; p.z = z; p.vz = vz; p.g = 0; p.life = 3;
  p.land = Land.Splash; p.layer = layer; p.fadeOut = 0;
  parts.commit(p, shapeTex('drop'), 0xffffff);
}

/** The little crown and two droplets where a drop hits the floor. */
export function emitSplash(parts: Particles, x: number, y: number, big = false): void {
  const p = parts.spawn();
  if (p) {
    p.x = x; p.y = y + 1; p.frames = splashes(); p.once = true; p.fps = 14; p.life = 0.3; p.fadeOut = 0.2;
    p.layer = Layer.Floor; p.alpha = 0.9;
    parts.commit(p, null, 0xffffff);
  }
  const n = big ? 4 : 1;
  for (let i = 0; i < n; i++) {
    const d = parts.spawn();
    if (!d) return;
    d.x = x; d.y = y; d.z = 1; d.vx = rr(-20, 20); d.vy = rr(-6, 6); d.vz = rr(30, 55); d.g = 260;
    d.life = 0.6; d.land = Land.Die; d.layer = Layer.Air;
    parts.commit(d, squareTex(1), pick([C.blueL, 0xffffff]));
  }
}

function burstFrames(kind: BurstKind): Texture[] {
  let f = BURST_FRAMES.get(kind);
  if (!f) {
    const st = BURSTS[kind];
    f = st.frames === 'confetti' ? confetti() : st.frames === 'sparkle' ? sparkles() : st.frames === 'square' ? [squareTex(2), squareTex(1), squareTex(3)] : framesOf(st.frames, !!st.outline);
    BURST_FRAMES.set(kind, f);
  }
  return f;
}

/** One of the 18 small bursts at a point (z = height above the floor). */
export function emitBurst(parts: Particles, kind: BurstKind, x: number, y: number, z: number, count?: number): void {
  const st = BURSTS[kind];
  const frames = burstFrames(kind);
  const n = Math.min(60, count ?? st.count);
  for (let i = 0; i < n; i++) {
    const p = parts.spawn();
    if (!p) return;
    const a = (i / n) * Math.PI * 2 + rr(-0.3, 0.3);
    const sp = st.speed * rr(0.6, 1.15);
    p.x = x + rr(-2, 2); p.y = y + rr(-1, 1); p.z = z;
    p.frames = frames; p.fps = st.fps ?? 8; p.still = st.still ?? (frames.length > 1 && st.motion !== 'flutter' && st.frames !== 'sparkle');
    p.life = st.life * rr(0.8, 1.2); p.layer = Layer.High;
    const tint = st.tints ? pick(st.tints) : 0xffffff;
    switch (st.motion) {
      case 'pop':
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.4; p.vz = rr(0.6, 1.2) * sp; p.g = 240; p.drag = 0.6;
        p.land = kind === 'snacks' || kind === 'crumbs' ? Land.Bounce : Land.Die;
        if (p.land === Land.Bounce) { p.settle = rr(2, 4); p.bounce = 0.35; }
        p.layer = Layer.Air;
        break;
      case 'rise':
        p.vx = Math.cos(a) * sp * 0.5; p.vy = 0; p.vz = sp * rr(0.8, 1.3); p.drag = 1.5;
        p.sway = rr(1, 3); p.swayF = rr(3, 6); p.swayPh = rr(0, 6); p.fadeOut = 0.4;
        break;
      case 'fall':
        p.vx = Math.cos(a) * sp * 0.4; p.vz = -sp * 0.2; p.g = 60; p.land = Land.Settle; p.settle = 1.5;
        break;
      case 'ring':
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.5; p.vz = rr(2, 12); p.g = 30; p.drag = 3.5; p.land = Land.None;
        p.layer = Layer.Air; p.alpha = 0.85;
        break;
      case 'flutter':
        p.vx = Math.cos(a) * sp * 0.6; p.vy = Math.sin(a) * sp * 0.25; p.vz = rr(0.9, 1.6) * sp; p.g = 160; p.drag = 2.2;
        p.sway = rr(2, 4); p.swayF = rr(4, 8); p.swayPh = rr(0, 6);
        p.land = Land.Settle; p.settle = rr(1.5, 3); p.layer = Layer.Air;
        break;
    }
    if (st.motion === 'flutter') {
      // Flutter: after the pop, gravity is weak and drag strong, so it drifts down.
      p.g = 200;
      p.term = rr(14, 24);
    }
    parts.commit(p, null, tint);
  }
}

export { CONFETTI_TINTS };
