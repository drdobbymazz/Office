// Darkness over the office, with pools of light cut out of it.
//
// One low-resolution canvas covers the whole world (1 cell = 2 x 2 world px,
// 272 x 208 cells). Every frame the 'dark' and 'light' effects report what
// they want; the canvas is only redrawn when that changes (quantised, at most
// 20 times a second) and is uploaded as a nearest-neighbour texture scaled up
// 2x, so the dither reads as crisp pixel art. Darkness is ordered-dithered
// into a few steps; it never goes fully opaque (people stay faintly visible),
// and cells outside the rooms asked for stay clear, so it cannot black out the
// screen by accident.

import { Sprite, Texture } from 'pixi.js';
import type { RoomId } from '@/game/core/types';
import { GRID_H, GRID_W, MAP_H, TILE, WORLD_H, WORLD_W, roomAt } from '@/game/core/world';
import { BAYER4, canvasTexture } from './pix';

const CELL = 2;
const CW = WORLD_W / CELL;
const CH = WORLD_H / CELL;
const ROOM_IDS: RoomId[] = ['boss', 'meeting', 'annex', 'accounts', 'bullpen', 'kitchen', 'outside'];
/** Darkest the darkness gets: people must stay faintly readable. */
const MAX_DARK = 0.84;
const MAX_LIGHTS = 32;
const MAX_DARKS = 8;

export class DarkLayer {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private px: Uint32Array;
  private texture: Texture;
  /** Room index for each cell. */
  private cellRoom: Uint8Array;
  private dark: Float32Array;
  private cut: Float32Array;
  private roomDark = new Float32Array(ROOM_IDS.length);
  // Per-frame requests (fixed arrays, no allocation).
  private dRooms = new Uint8Array(MAX_DARKS * ROOM_IDS.length);
  private dLevel = new Float32Array(MAX_DARKS);
  private dEmergency = new Uint8Array(MAX_DARKS);
  private nd = 0;
  private lx = new Float32Array(MAX_LIGHTS);
  private ly = new Float32Array(MAX_LIGHTS);
  private lr = new Float32Array(MAX_LIGHTS);
  private lk = new Float32Array(MAX_LIGHTS);
  private nl = 0;
  private lastSig = -1;
  private sinceDraw = 1;
  /** Red emergency pulse 0..1 (set by the frame). */
  private emergencyMix = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.img = this.ctx.createImageData(CW, CH);
    this.px = new Uint32Array(this.img.data.buffer);
    this.texture = canvasTexture(this.canvas);
    this.sprite = new Sprite(this.texture);
    this.sprite.scale.set(CELL);
    this.sprite.visible = false;
    this.cellRoom = new Uint8Array(CW * CH);
    this.dark = new Float32Array(CW * CH);
    this.cut = new Float32Array(CW * CH);
    const perTile = TILE / CELL;
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        const r = ty >= MAP_H ? 6 : ROOM_IDS.indexOf(roomAt({ x: tx, y: ty }));
        for (let cy = 0; cy < perTile; cy++) for (let cx = 0; cx < perTile; cx++) {
          this.cellRoom[(ty * perTile + cy) * CW + tx * perTile + cx] = r < 0 ? 4 : r;
        }
      }
    }
  }

  /** Start a frame's requests. */
  begin(): void {
    this.nd = 0;
    this.nl = 0;
  }

  addDark(rooms: RoomId[] | 'all', level: number, emergency: boolean): void {
    if (this.nd >= MAX_DARKS || level <= 0.01) return;
    const base = this.nd * ROOM_IDS.length;
    for (let i = 0; i < ROOM_IDS.length; i++) {
      // 'all' is the building; the pavement outside stays in daylight.
      this.dRooms[base + i] = rooms === 'all' ? (i < 6 ? 1 : 0) : rooms.includes(ROOM_IDS[i]) ? 1 : 0;
    }
    this.dLevel[this.nd] = Math.min(1, level);
    this.dEmergency[this.nd] = emergency ? 1 : 0;
    this.nd++;
  }

  addLight(x: number, y: number, radius: number, k: number): void {
    if (this.nl >= MAX_LIGHTS || k <= 0.01 || radius < 2) return;
    this.lx[this.nl] = x;
    this.ly[this.nl] = y;
    this.lr[this.nl] = radius;
    this.lk[this.nl] = Math.min(1, k);
    this.nl++;
  }

  /** Redraw if anything changed. dt in seconds. */
  end(dt: number): void {
    this.sinceDraw += dt;
    if (this.nd === 0) {
      this.sprite.visible = false;
      this.lastSig = -1;
      return;
    }
    let emergency = 0;
    this.roomDark.fill(0);
    for (let d = 0; d < this.nd; d++) {
      if (this.dEmergency[d]) emergency = 1;
      for (let i = 0; i < ROOM_IDS.length; i++) {
        if (this.dRooms[d * ROOM_IDS.length + i]) this.roomDark[i] = Math.max(this.roomDark[i], this.dLevel[d]);
      }
    }
    // A cheap signature of everything that affects the picture, quantised so
    // tiny drifts do not force a redraw.
    let sig = emergency * 7919;
    for (let i = 0; i < ROOM_IDS.length; i++) sig = (sig * 31 + Math.round(this.roomDark[i] * 24)) | 0;
    for (let l = 0; l < this.nl; l++) {
      sig = (sig * 31 + Math.round(this.lx[l] / CELL)) | 0;
      sig = (sig * 31 + Math.round(this.ly[l] / CELL)) | 0;
      sig = (sig * 31 + Math.round(this.lr[l] / 2)) | 0;
      sig = (sig * 31 + Math.round(this.lk[l] * 8)) | 0;
    }
    this.emergencyMix = emergency;
    this.sprite.visible = true;
    if (sig === this.lastSig || this.sinceDraw < 0.05) return;
    this.lastSig = sig;
    this.sinceDraw = 0;
    this.redraw();
  }

  private redraw(): void {
    const { dark, cut, cellRoom, roomDark, px } = this;
    const n = CW * CH;
    for (let i = 0; i < n; i++) dark[i] = roomDark[cellRoom[i]];
    cut.fill(0);
    for (let l = 0; l < this.nl; l++) {
      const cx = this.lx[l] / CELL, cy = this.ly[l] / CELL, r = this.lr[l] / CELL, k = this.lk[l];
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(CW - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(CH - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 1.15;
          const d = Math.sqrt(dx * dx + dy * dy) / r;
          if (d >= 1) continue;
          // Three stepped bands of light, dithered where they meet.
          const t = (1 - d) * 3 + (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
          const band = t >= 2 ? 1 : t >= 1 ? 0.66 : t >= 0 ? 0.33 : 0;
          const v = band * k;
          const i = y * CW + x;
          if (v > cut[i]) cut[i] = v;
        }
      }
    }
    // Colour: deep blue-black, or a dim red when the emergency lights are on.
    const em = this.emergencyMix;
    const r8 = em ? 46 : 10, g8 = em ? 6 : 8, b8 = em ? 16 : 26;
    const rgb = (b8 << 16) | (g8 << 8) | r8; // little-endian ABGR
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const i = y * CW + x;
        let d = dark[i];
        if (d <= 0) { px[i] = 0; continue; }
        d *= 1 - cut[i] * 0.92;
        // Ordered dither between six alpha steps.
        const steps = 6;
        const q = Math.floor(d * steps + (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16) / steps;
        const a = Math.round(Math.min(1, q) * MAX_DARK * 255);
        px[i] = a ? ((a << 24) | rgb) >>> 0 : 0;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.texture.source.update();
  }

  clear(): void {
    this.nd = 0;
    this.nl = 0;
    this.sprite.visible = false;
    this.lastSig = -1;
  }

  destroy(): void {
    this.sprite.destroy();
    this.texture.destroy(true);
  }
}
