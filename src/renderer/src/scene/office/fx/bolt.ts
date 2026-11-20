// A small world-resolution canvas for drawing lines as pixel art: beams,
// lightning bolts and zaps. Drawn into a 1x buffer the size of the bounding
// box and uploaded as a nearest-neighbour texture, so a diagonal ray is a
// stair of real art pixels instead of an anti-aliased stroke.

import { Sprite, Texture } from 'pixi.js';
import { BAYER4, canvasTexture } from './pix';

export class LineCanvas {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  private px: Uint32Array | null = null;
  private texture: Texture | null = null;
  private w = 0;
  private h = 0;
  /** World position of the buffer's top-left. */
  ox = 0;
  oy = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.sprite = new Sprite(Texture.EMPTY);
  }

  /** Size the buffer to cover this world box (grows only) and clear it. */
  begin(x0: number, y0: number, x1: number, y1: number): void {
    const w = Math.max(1, Math.ceil(x1 - x0) + 1);
    const h = Math.max(1, Math.ceil(y1 - y0) + 1);
    this.ox = Math.floor(x0);
    this.oy = Math.floor(y0);
    if (w > this.w || h > this.h || !this.px) {
      this.w = Math.max(w, this.w);
      this.h = Math.max(h, this.h);
      this.canvas.width = this.w;
      this.canvas.height = this.h;
      this.img = this.ctx.createImageData(this.w, this.h);
      this.px = new Uint32Array(this.img.data.buffer);
      if (this.texture) this.texture.destroy(true);
      this.texture = canvasTexture(this.canvas);
      this.sprite.texture = this.texture;
    } else {
      this.px.fill(0);
    }
    this.sprite.x = this.ox;
    this.sprite.y = this.oy;
  }

  /** Set one world pixel (colour 0xRRGGBB, alpha 0..255). Later calls win, so draw outer bands first. */
  plot(wx: number, wy: number, c: number, a = 255): void {
    const x = Math.round(wx) - this.ox, y = Math.round(wy) - this.oy;
    if (!this.px || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.px[i] = ((a << 24) | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;
  }

  /**
   * A thick line in stepped bands: `bands` is [radius, colour, alpha] from the
   * outside in. Outer bands are dithered so the glow steps rather than fades.
   */
  thick(x0: number, y0: number, x1: number, y1: number, bands: readonly (readonly [number, number, number])[]): void {
    const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    const steps = Math.ceil(len);
    for (let b = 0; b < bands.length; b++) {
      const [r, c, a] = bands[b];
      const dither = b === 0 && bands.length > 1;
      const ri = Math.ceil(r);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
        for (let dy = -ri; dy <= ri; dy++) {
          for (let dx = -ri; dx <= ri; dx++) {
            if (dx * dx + dy * dy > r * r + 0.5) continue;
            const px = Math.round(cx) + dx, py = Math.round(cy) + dy;
            if (dither && BAYER4[(py & 3) * 4 + (px & 3)] < 8) continue;
            this.plot(px, py, c, a);
          }
        }
      }
    }
  }

  end(): void {
    if (!this.img) return;
    this.ctx.putImageData(this.img, 0, 0);
    this.texture?.source.update();
  }

  destroy(): void {
    this.sprite.destroy();
    this.texture?.destroy(true);
  }
}

/** Jagged lightning path from (x0, y0) to (x1, y1), written into `out` as x,y pairs. */
export function jagged(out: number[], x0: number, y0: number, x1: number, y1: number, segs: number, amp: number, rnd: () => number): void {
  out.length = 0;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  out.push(x0, y0);
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const off = (rnd() - 0.5) * 2 * amp * Math.sin(t * Math.PI) ** 0.5;
    out.push(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
  }
  out.push(x1, y1);
}
