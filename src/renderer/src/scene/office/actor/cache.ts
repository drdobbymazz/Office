// Lazily built, bounded cache of actor frame textures, one cache per sprite.
//
// Frames are keyed by two integers (the face, and everything else) so lookups
// never allocate. Each entry remembers the tick it was last shown; when a cache
// grows past its cap, the stalest entries (not shown for a while) are destroyed.

import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { ACTOR_W, ACTOR_H, FEET_Y, composeActor, type FrameSpec } from './art';

interface Entry {
  tex: Texture;
  /** Views of the same source with the bottom rows cut off (seated leg crop), by crop px. */
  crops: Map<number, Texture> | null;
  used: number;
}

const CAP_PER_SPRITE = 140;
/** An entry shown within this many ticks is never evicted. */
const KEEP_TICKS = 240;

let tick = 0;
/** Advance the shared clock used for staleness (call once per actor update). */
export function cacheTick(): void { tick++; }

export class FrameCache {
  private readonly byFace = new Map<number, Map<number, Entry>>();
  private size = 0;
  constructor(private readonly sprite: string) {}

  /** The texture for this frame, built on first use. `crop` = px cut off the feet end. */
  get(faceK: number, bodyK: number, spec: FrameSpec, crop: number): Texture {
    let inner = this.byFace.get(faceK);
    if (!inner) { inner = new Map(); this.byFace.set(faceK, inner); }
    let e = inner.get(bodyK);
    if (!e) {
      e = { tex: buildTexture(this.sprite, spec), crops: null, used: tick };
      inner.set(bodyK, e);
      this.size++;
      if (this.size > CAP_PER_SPRITE) this.evict();
    }
    e.used = tick;
    if (crop <= 0) return e.tex;
    if (!e.crops) e.crops = new Map();
    let c = e.crops.get(crop);
    if (!c) {
      c = new Texture({ source: e.tex.source, frame: new Rectangle(0, 0, ACTOR_W, FEET_Y - crop) });
      e.crops.set(crop, c);
    }
    return c;
  }

  private evict(): void {
    // Drop the stalest quarter (never anything shown recently).
    const all: { e: Entry; inner: Map<number, Entry>; k: number }[] = [];
    for (const inner of this.byFace.values()) for (const [k, e] of inner) if (tick - e.used > KEEP_TICKS) all.push({ e, inner, k });
    all.sort((a, b) => a.e.used - b.e.used);
    const n = Math.min(all.length, Math.ceil(CAP_PER_SPRITE / 4));
    for (let i = 0; i < n; i++) {
      const { e, inner, k } = all[i];
      inner.delete(k);
      if (e.crops) for (const c of e.crops.values()) c.destroy(false);
      e.tex.destroy(true);
      this.size--;
    }
  }

  get count(): number { return this.size; }
}

const caches = new Map<string, FrameCache>();
export function cacheFor(sprite: string): FrameCache {
  let c = caches.get(sprite);
  if (!c) { c = new FrameCache(sprite); caches.set(sprite, c); }
  return c;
}

function buildTexture(sprite: string, spec: FrameSpec): Texture {
  const buf = composeActor(sprite, spec);
  const canvas = document.createElement('canvas');
  canvas.width = ACTOR_W; canvas.height = ACTOR_H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(ACTOR_W, ACTOR_H);
  img.data.set(buf);
  ctx.putImageData(img, 0, 0);
  const source = new CanvasSource({ resource: canvas, scaleMode: 'nearest' });
  return new Texture({ source });
}
