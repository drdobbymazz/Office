// Tiny pixel-art toolkit for the effects layer. Everything is drawn at 1x into
// plain RGBA buffers (the same approach as portraitArt.ts) and turned into
// nearest-neighbour textures, so one art pixel is one world pixel.

import { Texture } from 'pixi.js';

/** The ink outline the people use (portraitArt.ts OUTLINE). */
export const INK = 0x26222e;

export class Pix {
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  set(x: number, y: number, c: number, a = 255): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = (c >> 16) & 255;
    this.data[i + 1] = (c >> 8) & 255;
    this.data[i + 2] = c & 255;
    this.data[i + 3] = a;
  }

  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  color(x: number, y: number): number {
    const i = (y * this.w + x) * 4;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  rect(x0: number, y0: number, w: number, h: number, c: number, a = 255): this {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a);
    return this;
  }

  /** Filled ellipse centred at (cx, cy) with radii rx, ry (pixel-centre test, no anti-aliasing). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, a = 255): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
    return this;
  }

  /** 1 px line (Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 255): this {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /** Paint every transparent pixel that touches an opaque one (4-neighbour, or 8 with diag). */
  outline(c = INK, diag = false, minA = 200): this {
    const pts: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) !== 0) continue;
        if (this.alpha(x + 1, y) >= minA || this.alpha(x - 1, y) >= minA || this.alpha(x, y + 1) >= minA || this.alpha(x, y - 1) >= minA ||
          (diag && (this.alpha(x + 1, y + 1) >= minA || this.alpha(x - 1, y - 1) >= minA || this.alpha(x - 1, y + 1) >= minA || this.alpha(x + 1, y - 1) >= minA))) {
          pts.push(x, y);
        }
      }
    }
    for (let i = 0; i < pts.length; i += 2) this.set(pts[i], pts[i + 1], c);
    return this;
  }

  /** Copy another buffer in at (ox, oy), skipping its transparent pixels. */
  blit(src: Pix, ox: number, oy: number, flipX = false): this {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const sx = flipX ? src.w - 1 - x : x;
        const a = src.alpha(sx, y);
        if (a) this.set(ox + x, oy + y, src.color(sx, y), a);
      }
    }
    return this;
  }

  /** Multiply alpha of every pixel. */
  fade(k: number): this {
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = this.data[i] * k;
    return this;
  }

  flipped(): Pix {
    const p = new Pix(this.w, this.h);
    p.blit(this, 0, 0, true);
    return p;
  }

  /** Rotate by a multiple of 90 degrees (exact, so pixels stay pixels). */
  rot90(times: number): Pix {
    const t = ((times % 4) + 4) % 4;
    if (t === 0) { const p = new Pix(this.w, this.h); p.blit(this, 0, 0); return p; }
    const p = t === 2 ? new Pix(this.w, this.h) : new Pix(this.h, this.w);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const a = this.alpha(x, y);
        if (!a) continue;
        const c = this.color(x, y);
        if (t === 1) p.set(this.h - 1 - y, x, c, a);
        else if (t === 2) p.set(this.w - 1 - x, this.h - 1 - y, c, a);
        else p.set(y, this.w - 1 - x, c, a);
      }
    }
    return p;
  }

  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  toTexture(): Texture {
    return canvasTexture(this.toCanvas());
  }
}

export function canvasTexture(cv: HTMLCanvasElement): Texture {
  const t = Texture.from(cv);
  t.source.scaleMode = 'nearest';
  return t;
}

/**
 * Build a sprite from rows of characters. '.' and ' ' are transparent; every
 * other character looks up `pal`. `outline` adds the ink rim automatically.
 */
export function ascii(rows: readonly string[], pal: Record<string, number>, outline: number | null = INK, pad = outline === null ? 0 : 1): Pix {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0) + pad * 2;
  const h = rows.length + pad * 2;
  const p = new Pix(w, h);
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c === undefined) continue;
      p.set(x + pad, y + pad, c);
    }
  }
  if (outline !== null) p.outline(outline);
  return p;
}

// ── texture cache ────────────────────────────────────────────────────────────

const CACHE = new Map<string, Texture>();
export function cachedTex(key: string, make: () => Pix | Texture): Texture {
  let t = CACHE.get(key);
  if (!t) {
    const m = make();
    t = m instanceof Pix ? m.toTexture() : m;
    CACHE.set(key, t);
  }
  return t;
}

// ── colour and maths helpers ─────────────────────────────────────────────────

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
export function shade(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/** 4x4 Bayer matrix, values 0..15: the threshold pattern for ordered dithering. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number): number => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** Deterministic hash noise in 0..1. */
export function hash2(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Smooth value noise in 0..1. */
export function vnoise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Small seeded RNG (mulberry32). Kept out of hot loops' allocation paths. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const easeOutBack = (t: number): number => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Quantise an alpha so fades step like pixel art instead of sliding. */
export const stepA = (a: number, steps = 4): number => Math.ceil(clamp01(a) * steps) / steps;

/** Seedable stable id hash for strings (effect ids → per-effect variation). */
export function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
