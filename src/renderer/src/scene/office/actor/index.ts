// The people on the office floor: animated, emotive pixel characters.
//
//   createActorView(id, sprite)          one ActorView per person (see game/view/api.ts)
//   portraitUrl(sprite, emotion, scale)  an 18 x 28 portrait with that emotion, as a PNG data URL
//
// The pixel art is drawn in code from the recipes in ../portraitArt.ts, so the
// people look exactly as they do on their cards; this folder adds poses, faces,
// props and motion.

import type { CreateActorView, PortraitUrl } from '@/game/view/api';
import type { EmotionId } from '@/game/core/types';
import { PORTRAIT_W, PORTRAIT_H } from '../portraitArt';
import { Actor } from './view';
import { composePortrait } from './art';
import { emotionFace, faceKey } from './faces';

export const createActorView: CreateActorView = (id, sprite) => new Actor(id, sprite);

const portraitCache = new Map<string, string>();
const PORTRAIT_INTENSITY = 0.8;

export const portraitUrl: PortraitUrl = (sprite: string, emotion: EmotionId, scale: number): string => {
  const s = Math.max(1, Math.round(scale || 1));
  const key = `${sprite}|${emotion}|${s}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const face = emotionFace(emotion, PORTRAIT_INTENSITY, { brow: 0, eyes: 0, mouth: 0, fx: 0 });
  const buf = composePortrait(sprite, faceKey(face));
  const stage = document.createElement('canvas');
  stage.width = PORTRAIT_W; stage.height = PORTRAIT_H;
  const sctx = stage.getContext('2d')!;
  const img = sctx.createImageData(PORTRAIT_W, PORTRAIT_H);
  img.data.set(buf);
  sctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = PORTRAIT_W * s; out.height = PORTRAIT_H * s;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(stage, 0, 0, PORTRAIT_W * s, PORTRAIT_H * s);
  const url = out.toDataURL('image/png');
  portraitCache.set(key, url);
  return url;
};

export { Actor };
