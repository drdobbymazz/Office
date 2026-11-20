// Turns any emoji into a chunky pixel sprite: drawn small with the system
// emoji font, alpha thresholded, colours stepped to a few levels, then given
// the ink outline. Shown at an integer scale with nearest-neighbour sampling.

import type { Texture } from 'pixi.js';
import { INK, Pix, cachedTex } from './pix';

const SRC = 14; // font size in px: small enough to turn into honest pixels

export function emojiTex(emoji: string): { texture: Texture } {
  const texture = cachedTex('emoji:' + emoji, () => {
    const S = 20;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${SRC}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(emoji || '?', S / 2, S / 2 + 1);
    const src = ctx.getImageData(0, 0, S, S).data;
    // Find the drawn bounds so the sprite stands on its own bottom row.
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (src[(y * S + x) * 4 + 3] > 110) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (x1 < 0) {
      // Nothing drew (no emoji font): fall back to a question mark block.
      const p = new Pix(10, 12);
      p.rect(0, 0, 10, 12, 0xffd93d);
      return p.outline(INK);
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const p = new Pix(w + 2, h + 2);
    const q = (v: number): number => Math.min(255, Math.round(v / 48) * 48 + 16);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((y + y0) * S + (x + x0)) * 4;
      if (src[i + 3] <= 110) continue;
      // Un-premultiply soft edge pixels, then step the colour.
      const a = src[i + 3] / 255;
      const r = q(src[i] / a), g = q(src[i + 1] / a), b = q(src[i + 2] / a);
      p.set(x + 1, y + 1, (r << 16) | (g << 8) | b);
    }
    return p.outline(INK);
  });
  return { texture };
}
