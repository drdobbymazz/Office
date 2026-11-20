// Pixel art that is easier to grow from a rule than to place by hand: flames,
// puffs, rings, stepped light pools, the explosion. All generated once at 1x,
// cached, and shown with nearest-neighbour scaling.

import type { Texture } from 'pixi.js';
import { Pix, bayer, cachedTex, hash2, vnoise } from './pix';

// ── flames ───────────────────────────────────────────────────────────────────

const FLAME_PAL = { core: 0xfff4b8, yellow: 0xffd23d, orange: 0xff8a2a, red: 0xdc3a2a, rim: 0x6a1e22 };

/** A looping flame tongue, `n` frames of w x h, seeded so neighbouring tongues differ. */
export function flameFrames(w: number, h: number, seed: number, n = 6): Texture[] {
  const out: Texture[] = [];
  for (let f = 0; f < n; f++) {
    out.push(cachedTex(`flame:${w}x${h}:${seed}:${f}`, () => {
      const p = new Pix(w, h);
      const ph = (f / n) * Math.PI * 2;
      for (let y = 0; y < h; y++) {
        const v = y / (h - 1);
        for (let x = 0; x < w; x++) {
          const sway = 0.22 * Math.sin(v * 4.5 + ph + seed) * (1 - v) * (1 - v);
          const u = (x + 0.5 - w / 2) / (w / 2) + sway;
          let wv = 0.12 + 0.88 * Math.sqrt(v);
          if (v > 0.82) wv *= Math.sqrt(Math.max(0, 1 - ((v - 0.82) / 0.18) * 0.75));
          const e = 1 - Math.abs(u) / wv;
          if (e <= -0.2) continue;
          // Noise sampled round a circle in time so the frames loop seamlessly.
          const nz = vnoise(x * 0.55 + Math.cos(ph) * 1.6 + seed * 7, y * 0.32 + Math.sin(ph) * 1.6 + f * 0.0, seed);
          const nz2 = vnoise(x * 1.1 + Math.sin(ph) * 1.2, y * 0.7 - Math.cos(ph) * 1.2, seed + 9);
          let heat = e * (0.3 + 0.7 * v) + (nz - 0.5) * 0.55 + (nz2 - 0.5) * 0.2 - (1 - v) * (1 - v) * 0.25;
          if (v > 0.9) heat += 0.1;
          let c = -1;
          if (heat > 0.62) c = FLAME_PAL.core;
          else if (heat > 0.44) c = FLAME_PAL.yellow;
          else if (heat > 0.26) c = FLAME_PAL.orange;
          else if (heat > 0.1) c = FLAME_PAL.red;
          if (c >= 0) p.set(x, y, c);
        }
      }
      return p.outline(FLAME_PAL.rim);
    }));
  }
  return out;
}

// ── puffs (smoke, steam, poof) ───────────────────────────────────────────────

/** A lumpy round puff in greys, light from the top left. Tint it to colour it. */
export function puffTex(r: number, variant = 0, holes = 0): Texture {
  return cachedTex(`puff:${r}:${variant}:${holes}`, () => {
    const s = Math.ceil(r * 2 + 3);
    const p = new Pix(s, s);
    const cx = s / 2, cy = s / 2;
    // Three overlapping lobes make it read as a cloud, not a disc.
    const lobes = [
      [cx, cy + r * 0.12, r * 0.92],
      [cx - r * 0.42, cy - r * 0.18 + (variant & 1 ? r * 0.1 : 0), r * 0.62],
      [cx + r * 0.38, cy - r * 0.28 + (variant & 2 ? r * 0.12 : 0), r * 0.58]
    ];
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        let inside = false;
        let best = 9;
        for (const [lx, ly, lr] of lobes) {
          const d = Math.hypot(x + 0.5 - lx, y + 0.5 - ly) / lr;
          if (d <= 1) inside = true;
          best = Math.min(best, d);
        }
        if (!inside) continue;
        if (holes > 0 && hash2(x, y, variant + 31) < holes * (0.4 + best * 0.6)) continue;
        // Light from the top left: compare to an offset centre.
        const lit = Math.hypot(x + 0.5 - (cx - r * 0.3), y + 0.5 - (cy - r * 0.35)) / (r * 1.25);
        const c = lit < 0.55 ? 0xffffff : lit < 0.9 ? 0xd2d2d6 : 0xa2a2aa;
        p.set(x, y, c);
      }
    }
    return p;
  });
}

/** A poof that swells then breaks up: frames for one-shot puffs. */
export function poofFrames(maxR: number): Texture[] {
  const r = Math.max(2, maxR);
  return [
    puffTex(Math.max(1.5, r * 0.4), 0),
    puffTex(r * 0.7, 1),
    puffTex(r * 0.9, 2),
    puffTex(r, 3, 0.15),
    puffTex(r, 0, 0.4),
    puffTex(r * 0.95, 1, 0.7)
  ];
}

// ── rings ────────────────────────────────────────────────────────────────────

/** An ellipse outline, white. ratio = ry / rx (0.55 reads as lying on the floor). */
export function ringTex(r: number, ratio = 1, thick = 1): Texture {
  return cachedTex(`ring:${r}:${ratio}:${thick}`, () => {
    const rx = r, ry = Math.max(1, r * ratio);
    const w = Math.ceil(rx * 2 + 2), h = Math.ceil(ry * 2 + 2);
    const p = new Pix(w, h);
    const cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        const inner = 1 - thick / Math.max(1, Math.min(rx, ry * 1.6));
        if (d <= 1 && d >= inner) p.set(x, y, 0xffffff);
      }
    }
    return p;
  });
}

export function ringFrames(maxR: number, ratio: number, n: number, thick = 1): Texture[] {
  const out: Texture[] = [];
  for (let i = 0; i < n; i++) out.push(ringTex(Math.round(2 + (maxR - 2) * ((i + 1) / n)), ratio, i < n - 2 ? thick + 1 : thick));
  return out;
}

// ── stepped light pools and glows ────────────────────────────────────────────

/**
 * A pool of light in `bands` stepped rings, dithered where the bands meet.
 * White: tint it and draw it with blendMode 'add' (or as a shadow in black).
 */
export function poolTex(r: number, ratio = 0.6, bands = 3, dither = true): Texture {
  const rr = Math.max(2, Math.round(r));
  return cachedTex(`pool:${rr}:${ratio}:${bands}:${dither}`, () => {
    const rx = rr, ry = Math.max(1, rr * ratio);
    const w = Math.ceil(rx * 2), h = Math.ceil(ry * 2);
    const p = new Pix(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - rx) / rx, dy = (y + 0.5 - ry) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1) continue;
        const t = (1 - d) * bands + (dither ? bayer(x, y) - 0.5 : 0);
        const band = Math.max(0, Math.min(bands, Math.ceil(t)));
        if (band <= 0) continue;
        const a = Math.round((band / bands) * 255);
        p.set(x, y, 0xffffff, a);
      }
    }
    return p;
  });
}

/** A hard-edged dark ellipse for shadows under floating things. */
export function shadowTex(rx: number, ry: number): Texture {
  const a = Math.max(1, Math.round(rx)), b = Math.max(1, Math.round(ry));
  return cachedTex(`shadow:${a}:${b}`, () => {
    const p = new Pix(a * 2, b * 2);
    p.ellipse(a, b, a, b, 0x000000, 255);
    return p;
  });
}

// ── explosion ────────────────────────────────────────────────────────────────

const BOOM = [0xffffff, 0xfff4b8, 0xffd23d, 0xff8a2a, 0xdc3a2a, 0x8a3a34, 0x5a4a52];

/** A cartoon fireball: white flash, yellow ball, orange billow, red and smoke, breaking up. */
export function explosionFrames(): Texture[] {
  const n = 7;
  const out: Texture[] = [];
  for (let f = 0; f < n; f++) {
    out.push(cachedTex('boom:' + f, () => {
      const S = 32;
      const p = new Pix(S, S);
      const t = f / (n - 1);
      const R = 4 + 11 * Math.sqrt(t + 0.05);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = x + 0.5 - S / 2, dy = y + 0.5 - S / 2;
          const nz = vnoise(x * 0.35, y * 0.35, 3 + f) - 0.5;
          const d = Math.hypot(dx, dy) / (R * (1 + nz * 0.5));
          if (d > 1) continue;
          // Heat falls from the centre and with time; holes open up late.
          let heat = (1 - d) * 1.2 + 0.6 - t * 1.25 + nz * 0.6;
          if (t > 0.5 && hash2(x, y, f) < (t - 0.5) * 1.2 * d) continue;
          heat = Math.max(0, Math.min(0.999, heat));
          const idx = Math.min(BOOM.length - 1, Math.floor((1 - heat) * BOOM.length));
          p.set(x, y, BOOM[f === 0 ? Math.min(idx, 1) : idx]);
        }
      }
      return f < 4 ? p.outline(0x4a2228) : p;
    }));
  }
  return out;
}

/** The splash crown: drops kicked up in a ring, 4 frames. */
export function splashFrames(): Texture[] {
  const out: Texture[] = [];
  for (let f = 0; f < 4; f++) {
    out.push(cachedTex('splash:' + f, () => {
      const p = new Pix(13, 9);
      const lt = 0xb6e0ff, md = 0x5aa8f0, wh = 0xffffff;
      const spread = 2 + f * 1.5;
      const hgt = [2, 4, 3, 1][f];
      // Two arcs of drops either side and a little ring at the base.
      for (let s = -1; s <= 1; s += 2) {
        const bx = Math.round(6 + s * spread);
        for (let k = 0; k < hgt; k++) p.set(bx + (k > 1 ? s : 0), 7 - k, k === hgt - 1 ? wh : lt);
      }
      if (f < 3) { p.set(6, 6 - f, wh); p.set(6, 7 - f, lt); }
      for (let x = -Math.round(spread); x <= Math.round(spread); x++) p.set(6 + x, 8, f === 3 ? lt : md);
      return p;
    }));
  }
  return out;
}
