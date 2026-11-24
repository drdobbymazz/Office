// The bigger pixel sprites: the saucer, the ghost, the animals, the props, the
// bees, balloons and the mirror ball. Built from simple shapes plus hand-placed
// pixels at 1x, outlined in ink like the people (who are 18 x 32).

import type { Texture } from 'pixi.js';
import { C } from './art';
import { INK, Pix, ascii, cachedTex, shade } from './pix';

const tex = (key: string, make: () => Pix): Texture => cachedTex(key, make);

// ── flying saucer ────────────────────────────────────────────────────────────

/** 4 frames: the rim lights chase round. 34 x 17, bottom-centre is the emitter. */
export function saucerFrames(): Texture[] {
  const out: Texture[] = [];
  for (let f = 0; f < 4; f++) {
    out.push(tex('saucer:' + f, () => {
      const W = 34, H = 17;
      const p = new Pix(W, H);
      const cx = 17;
      // Glass dome with a highlight.
      p.ellipse(cx, 6.5, 7, 6, 0x4aa0d8);
      p.ellipse(cx, 6.5, 6, 5.2, 0x8fd8ff);
      p.ellipse(cx - 2, 4.5, 2.2, 2, 0xd8f4ff);
      p.set(cx - 3, 3, 0xffffff); p.set(cx - 2, 3, 0xffffff); p.set(cx - 3, 4, 0xffffff);
      // A little green pilot peeking.
      p.ellipse(cx + 1, 8.5, 2.2, 2, 0x7ad26a);
      p.set(cx, 8, INK); p.set(cx + 2, 8, INK);
      // Hull: a wide disc, light on top, banded underneath.
      p.ellipse(cx, 11, 16, 4.2, 0x8a90a4);
      p.ellipse(cx, 10.4, 15.5, 3.4, 0xc8ccd8);
      p.ellipse(cx, 9.8, 13, 2, 0xe6e8f0);
      for (let x = 3; x < W - 3; x++) if (p.alpha(x, 12)) p.set(x, 12, 0x6a7088);
      // Emitter underneath.
      p.rect(cx - 3, 14, 6, 1, 0x5a6070);
      p.rect(cx - 2, 15, 4, 1, 0x9cf07a);
      // Rim lights round the front edge: one in three lit, moving each frame.
      const lights = [4, 8, 12, 17, 22, 26, 30];
      lights.forEach((lx, i) => {
        const on = (i + f) % 3 === 0;
        const ly = lx < 8 || lx > 26 ? 11 : 12;
        p.set(lx, ly, on ? 0xfff4b8 : 0x5a6070);
        if (on) p.set(lx, ly - 1, 0xffd23d);
      });
      return p.outline(INK);
    }));
  }
  return out;
}

// ── ghost ────────────────────────────────────────────────────────────────────

const GH = { body: 0xf6f2ff, shade: 0xc9c0ec, deep: 0x9d92cc, rim: 0x3e3460, eye: 0x2a2440, blush: 0xffa8c8, mouth: 0x5a3a6a };

/**
 * mood: drift | boo | sad; frame 0..2 moves the wavy hem; back = seen from behind.
 * 16 x 19 (boo is 20 x 21 with arms up). Feet-less: the hem floats.
 */
export function ghostTex(mood: 'drift' | 'boo' | 'sad', frame: number, back: boolean): Texture {
  return tex(`ghost:${mood}:${frame}:${back}`, () => {
    const boo = mood === 'boo';
    const W = boo ? 22 : 16, H = boo ? 21 : 19;
    const p = new Pix(W, H);
    const cx = W / 2;
    const top = boo ? 2 : 1;
    const bodyW = boo ? 7.5 : 6.5;
    const hemY = H - 4;
    // Dome and body.
    p.ellipse(cx, top + bodyW, bodyW, bodyW, GH.body);
    p.rect(Math.round(cx - bodyW), Math.round(top + bodyW), Math.round(bodyW * 2), hemY - Math.round(top + bodyW), GH.body);
    // Wavy hem: three scallops that travel with the frame.
    for (let x = Math.round(cx - bodyW); x < Math.round(cx + bodyW); x++) {
      const k = (x - Math.round(cx - bodyW) + frame * 2) % 6;
      const drop = k < 3 ? 2 : k === 3 || k === 5 ? 1 : 0;
      for (let y = hemY; y < hemY + 1 + drop; y++) p.set(x, y, GH.body);
    }
    // Shading on the right side and under the dome.
    for (let y = 0; y < H; y++) {
      for (let x = Math.floor(cx + bodyW * 0.45); x < W; x++) if (p.alpha(x, y)) p.set(x, y, GH.shade);
    }
    for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) {
      if (p.alpha(x, y)) { p.set(x, y, GH.shade); if (p.alpha(x, y - 1)) p.set(x, y - 1, p.color(x, y - 1) === GH.shade ? GH.deep : GH.shade); break; }
    }
    // Highlight.
    p.set(Math.round(cx - bodyW + 2), top + 3, 0xffffff); p.set(Math.round(cx - bodyW + 2), top + 4, 0xffffff); p.set(Math.round(cx - bodyW + 3), top + 2, 0xffffff);
    if (boo) {
      // Arms flung up.
      p.rect(1, 6, 3, 2, GH.body); p.rect(0, 4, 2, 3, GH.body);
      p.rect(W - 4, 6, 3, 2, GH.shade); p.rect(W - 2, 4, 2, 3, GH.shade);
    } else if (mood === 'drift') {
      // Little arms out to the side.
      p.rect(Math.round(cx - bodyW) - 2, 10, 2, 2, GH.body);
      p.rect(Math.round(cx + bodyW), 10, 2, 2, GH.shade);
    }
    if (!back) {
      const ey = top + (boo ? 6 : 6);
      const ex0 = Math.round(cx - 3), ex1 = Math.round(cx + 2);
      if (mood === 'sad') {
        p.set(ex0 - 1, ey - 1, GH.eye); p.set(ex1 + 1, ey - 1, GH.eye);
        p.set(ex0, ey, GH.eye); p.set(ex1, ey, GH.eye);
        p.set(ex0, ey + 1, GH.eye); p.set(ex1, ey + 1, GH.eye);
        p.set(ex0, ey + 2, 0x8fd8ff); p.set(ex0, ey + 3, 0x8fd8ff); // a tear
        p.set(cx - 1, ey + 5, GH.mouth); p.set(cx, ey + 4, GH.mouth); p.set(cx + 1, ey + 5, GH.mouth);
      } else if (boo) {
        // Angry slanted eyes and a huge open mouth.
        p.rect(ex0 - 1, ey, 2, 2, GH.eye); p.rect(ex1, ey, 2, 2, GH.eye);
        p.set(ex0 - 2, ey - 1, GH.eye); p.set(ex1 + 2, ey - 1, GH.eye);
        p.ellipse(cx, ey + 6, 3.2, 3.2, GH.eye);
        p.rect(Math.round(cx - 1), ey + 7, 3, 2, 0xe85a7a);
      } else {
        p.rect(ex0, ey, 2, 2, GH.eye); p.rect(ex1, ey, 2, 2, GH.eye);
        p.set(ex0, ey, 0xffffff); p.set(ex1, ey, 0xffffff);
        p.set(ex0 - 1, ey + 3, GH.blush); p.set(ex1 + 2, ey + 3, GH.blush);
        p.rect(Math.round(cx - 1), ey + 3, 2, 2, GH.mouth);
      }
    }
    return p.outline(GH.rim);
  });
}

// ── animals (side view, facing right; flipped for left) ─────────────────────

export type Species =
  | 'raccoon' | 'puppy' | 'pigeon'
  | 'bear' | 'horse' | 'dragon' | 'cat' | 'dino' | 'robot' | 'alien' | 'shark';
export type CreatureAnim = 'idle' | 'run' | 'sit' | 'eat' | 'jump' | 'fly' | 'happy';

interface Legs { ox: number[]; lift: number[] }

const RAC = { fur: 0x8f8a99, light: 0xbdb8c6, dark: 0x5c5668, mask: 0x2c2834, white: 0xf4f1ea, nose: 0x1e1a24 };
const PUP = { fur: 0xe2b77c, light: 0xf6dcb0, dark: 0xa8763e, ear: 0x8a5a32, nose: 0x2a2026, tongue: 0xf07a8e, white: 0xfff8ec };
const PIG = { body: 0x9aa2b6, light: 0xc4cad8, dark: 0x6c7288, neck: 0x5fb08e, neck2: 0x9a6ac8, beak: 0xe8b860, eye: 0xf08a3a, feet: 0xe88a8a };

function legsFor(anim: CreatureAnim, frame: number): Legs {
  if (anim === 'run') {
    const k = frame % 4;
    return [
      { ox: [-1, 1, 1, -1], lift: [1, 0, 0, 1] },
      { ox: [0, 0, 0, 0], lift: [0, 1, 1, 0] },
      { ox: [1, -1, -1, 1], lift: [0, 1, 1, 0] },
      { ox: [0, 0, 0, 0], lift: [1, 0, 0, 1] }
    ][k];
  }
  if (anim === 'jump') return { ox: [-1, -1, 1, 1], lift: [1, 1, 1, 1] };
  return { ox: [0, 0, 0, 0], lift: [0, 0, 0, 0] };
}

function raccoon(anim: CreatureAnim, frame: number, carrying: boolean): Pix {
  const W = 26, H = 16, G = 15;
  const p = new Pix(W, H);
  const sit = anim === 'sit';
  const eat = anim === 'eat';
  const happy = anim === 'happy';
  const bob = (anim === 'idle' && frame % 2 === 1) || (anim === 'run' && frame % 2 === 1) ? 1 : 0;
  // Tail: a thick striped curve behind the body.
  const tailUp = anim === 'run' ? 0.2 : happy ? (frame % 2 ? 1.1 : 0.7) : sit ? -0.4 : 0.55 + (frame % 2) * 0.12;
  const tx0 = sit ? 7 : 8, ty0 = sit ? G - 3 : G - 6 + bob;
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const x = tx0 - i * (sit ? 0.8 : 0.75);
    const y = ty0 - Math.sin(t * 1.6) * tailUp * 6 - (sit ? 0 : t * 1.5);
    // Clear rings: two light steps, two dark steps, ending in a dark tip.
    const col = i >= 9 ? RAC.mask : (Math.floor(i / 2) & 1) === 0 ? 0xcfcbd8 : 0x4a4454;
    p.ellipse(x, y, 2.1, 2.1, col);
  }
  // Legs (back pair then front pair) under the body.
  const L = legsFor(anim, frame);
  const legX = sit ? [10, 11, 15, 16] : [9, 11, 16, 18];
  if (!sit) {
    for (let i = 0; i < 4; i++) {
      const lx = legX[i] + L.ox[i];
      const col = i % 2 ? RAC.dark : RAC.mask;
      p.rect(lx, G - 3 - L.lift[i] + 1, 2, 3, col);
    }
  } else {
    p.ellipse(10, G - 1.5, 3, 1.6, RAC.dark); // haunch
    p.rect(15, G - 4, 2, 4, RAC.mask); p.rect(17, G - 4, 1, 4, RAC.dark);
  }
  // Body.
  if (sit) {
    p.ellipse(12, G - 5, 5, 4.5, RAC.fur);
    p.ellipse(14, G - 4, 2, 2.6, RAC.light);
  } else {
    p.ellipse(13.5, G - 6 + bob, 7, 3.6, RAC.fur);
    for (let x = 8; x <= 19; x++) if (p.alpha(x, G - 4 + bob)) p.set(x, G - 4 + bob, RAC.light);
    for (let x = 10; x <= 17; x++) if (p.alpha(x, G - 9 + bob)) p.set(x, G - 9 + bob, RAC.dark);
  }
  // Head.
  const hx = sit ? 16 : eat ? 21 : 20;
  const hy = sit ? G - 10 : eat ? G - 4 : G - 9 + bob;
  p.ellipse(hx, hy, 3.6, 3.2, RAC.fur);
  // Ears.
  p.rect(hx - 3, hy - 4, 2, 2, RAC.fur); p.set(hx - 2, hy - 3, RAC.mask);
  p.rect(hx, hy - 4, 2, 2, RAC.fur); p.set(hx + 1, hy - 3, RAC.mask);
  // White brow, black mask band with a bright eye, white muzzle, black nose.
  for (let x = hx - 3; x <= hx + 2; x++) p.set(x, hy - 2, RAC.white);
  for (let x = hx - 3; x <= hx + 3; x++) { p.set(x, hy - 1, RAC.mask); p.set(x, hy, RAC.mask); }
  if (happy) { p.set(hx, hy - 1, RAC.white); p.set(hx + 1, hy - 1, RAC.mask); }
  else { p.set(hx + 1, hy - 1, RAC.white); }
  p.rect(hx + 2, hy, 3, 2, RAC.white);
  p.set(hx + 1, hy + 1, RAC.white);
  p.set(hx + 5, hy, RAC.nose); p.set(hx + 5, hy + 1, RAC.nose);
  if (carrying) {
    // A slice of pizza in its mouth.
    p.rect(hx + 3, hy + 2, 4, 1, 0xf0c04a); p.rect(hx + 4, hy + 3, 3, 1, 0xf0c04a); p.set(hx + 6, hy + 2, 0xd84a3a); p.set(hx + 5, hy + 3, 0xd84a3a); p.rect(hx + 7, hy + 2, 1, 2, 0xb8803a);
  }
  return p.outline(INK);
}

function puppy(anim: CreatureAnim, frame: number, carrying: boolean): Pix {
  const W = 24, H = 17, G = 16;
  const p = new Pix(W, H);
  const sit = anim === 'sit';
  const eat = anim === 'eat';
  const happy = anim === 'happy';
  const bob = (anim === 'run' || anim === 'idle' || happy) && frame % 2 === 1 ? 1 : 0;
  // Wagging tail: up and to one side, swapping every frame (fast when happy).
  const wag = happy || anim === 'idle' ? frame % 2 : 0;
  const tbx = sit ? 6 : 5, tby = sit ? G - 3 : G - 8 + bob;
  if (wag) { p.rect(tbx - 1, tby - 3, 2, 3, PUP.fur); p.set(tbx - 1, tby - 4, PUP.light); }
  else { p.rect(tbx - 3, tby - 2, 3, 2, PUP.fur); p.set(tbx - 4, tby - 3, PUP.light); p.set(tbx - 3, tby - 3, PUP.fur); }
  const L = legsFor(anim, frame);
  if (!sit) {
    const legX = [7, 9, 14, 16];
    for (let i = 0; i < 4; i++) {
      const col = i % 2 ? PUP.dark : PUP.fur;
      p.rect(legX[i] + L.ox[i], G - 4 - L.lift[i] + 1, 2, 4, col);
      p.set(legX[i] + L.ox[i], G - L.lift[i], PUP.white);
    }
    p.ellipse(11.5, G - 7 + bob, 6.2, 3.4, PUP.fur);
    for (let x = 7; x <= 16; x++) if (p.alpha(x, G - 5 + bob)) p.set(x, G - 5 + bob, PUP.light);
    p.set(9, G - 9 + bob, PUP.dark); p.set(10, G - 9 + bob, PUP.dark); // a spot
  } else {
    p.ellipse(9, G - 1.6, 3.2, 1.6, PUP.dark);
    p.rect(13, G - 5, 2, 5, PUP.fur); p.rect(15, G - 5, 1, 5, PUP.dark);
    p.ellipse(10.5, G - 6, 4.5, 4.4, PUP.fur);
    p.ellipse(12, G - 5, 2.5, 3, PUP.light);
  }
  // Big round head, floppy ear, snout.
  const hx = sit ? 15 : eat ? 19 : 18;
  const hy = sit ? G - 11 : eat ? G - 5 : G - 11 + bob;
  p.ellipse(hx, hy, 4.2, 3.9, PUP.fur);
  p.ellipse(hx + 3.5, hy + 1.5, 2.4, 1.8, PUP.light);
  p.set(hx + 5, hy + 0, PUP.nose); p.set(hx + 6, hy + 0, PUP.nose); p.set(hx + 5, hy + 1, PUP.nose);
  // Eye (closed happy arc when happy).
  if (happy) { p.set(hx, hy - 1, PUP.nose); p.set(hx + 1, hy - 2, PUP.nose); p.set(hx + 2, hy - 1, PUP.nose); }
  else { p.set(hx + 1, hy - 1, PUP.nose); p.set(hx + 1, hy - 2, PUP.nose); p.set(hx + 2, hy - 2, 0xffffff); }
  // Ear flops down behind the eye; it bounces with the run.
  const earDrop = anim === 'run' && frame % 2 ? -1 : 0;
  p.rect(hx - 3, hy - 3 + earDrop, 3, 6, PUP.ear);
  p.rect(hx - 2, hy + 3 + earDrop, 2, 1, PUP.ear);
  p.set(hx - 4, hy - 2 + earDrop, PUP.ear);
  if ((happy || anim === 'run') && !carrying) { p.set(hx + 4, hy + 3, PUP.tongue); p.set(hx + 4, hy + 4, PUP.tongue); }
  if (carrying) {
    // A bone-shaped biscuit... no: a slice of pizza, same as the raccoon steals.
    p.rect(hx + 3, hy + 3, 4, 1, 0xf0c04a); p.rect(hx + 4, hy + 4, 3, 1, 0xf0c04a); p.set(hx + 5, hy + 3, 0xd84a3a); p.rect(hx + 7, hy + 3, 1, 2, 0xb8803a);
  }
  return p.outline(INK);
}

function pigeon(anim: CreatureAnim, frame: number, carrying: boolean): Pix {
  const W = 18, H = 14, G = 13;
  const p = new Pix(W, H);
  const fly = anim === 'fly' || anim === 'jump';
  const eat = anim === 'eat';
  // Head bob when walking: forward / back.
  const nod = anim === 'run' ? (frame % 2 ? 1 : -1) : anim === 'idle' ? (frame % 4 === 3 ? 1 : 0) : 0;
  if (!fly) {
    const step = anim === 'run' ? frame % 2 : 0;
    p.rect(7 + step, G - 2, 1, 2, PIG.feet); p.rect(9 - step, G - 2, 1, 2, PIG.feet);
    p.set(8 + step, G - 1, PIG.feet); p.set(10 - step, G - 1, PIG.feet);
  }
  // Tail and body.
  p.rect(2, G - 6, 4, 2, PIG.dark);
  p.ellipse(8, G - 5, 4.6, 3.2, PIG.body);
  for (let x = 5; x <= 11; x++) if (p.alpha(x, G - 3)) p.set(x, G - 3, PIG.light);
  // Wing: folded, or spread up / down in flight.
  if (fly) {
    const up = frame % 2 === 0;
    if (up) { p.rect(5, G - 11, 4, 5, PIG.dark); p.rect(4, G - 12, 3, 2, PIG.light); p.set(4, G - 13, PIG.dark); }
    else { p.rect(5, G - 4, 5, 3, PIG.dark); p.rect(5, G - 2, 3, 1, PIG.light); }
  } else {
    p.rect(5, G - 7, 5, 2, PIG.dark);
    p.set(6, G - 6, PIG.light); p.set(8, G - 6, PIG.light);
  }
  // Neck with its green and purple sheen, small head, beak.
  const hx = eat ? 13 : 12 + nod, hy = eat ? G - 3 : G - 9;
  p.rect(hx - 2, hy + 1, 3, eat ? 2 : 4, PIG.neck);
  p.set(hx - 1, hy + 2, PIG.neck2);
  p.ellipse(hx, hy, 2.2, 2, PIG.light);
  p.set(hx, hy - 1, PIG.eye);
  p.set(hx + 2, hy, PIG.beak); p.set(hx + 3, hy, PIG.beak);
  if (carrying) { p.rect(hx + 3, hy + 1, 3, 1, 0xf0c04a); p.set(hx + 4, hy + 2, 0xd8a03a); }
  return p.outline(INK);
}

const FRAMES: Record<CreatureAnim, number> = { idle: 4, run: 4, sit: 2, eat: 2, jump: 1, fly: 2, happy: 2 };

const EXTRA_PALS: Record<'bear' | 'horse' | 'dragon' | 'cat' | 'dino' | 'robot' | 'alien' | 'shark', Record<string, number>> = {
  bear: { k: INK, b: 0x7d4c2c, B: 0x563218, l: 0xa67048, s: 0xd4a878, w: 0xfffdf5 },
  horse: { k: INK, b: 0xa85d34, B: 0x783e20, l: 0xc87d50, m: 0x3b261c, w: 0xfffdf5, h: 0x36303d },
  dragon: { k: INK, g: 0x4ea854, G: 0x2e6e36, l: 0x8be07e, r: 0xe05a47, y: 0xffc857, o: 0xe88a38, w: 0xfffdf5 },
  cat: { k: INK, o: 0xe89040, O: 0xb86220, l: 0xf8c488, w: 0xfff8ec, p: 0xf08a9a },
  dino: { k: INK, g: 0x52a848, G: 0x307430, l: 0x92da6e, y: 0xf2df88, w: 0xfffdf5 },
  robot: { k: INK, s: 0xc0cad8, S: 0x7e8a9e, d: 0x4e5868, c: 0x4de6ff, r: 0xf05048, y: 0xffd93d },
  alien: { k: INK, g: 0x84e86a, G: 0x48b044, l: 0xc6ffa0, s: 0xb8c0d0, S: 0x6a7284 },
  shark: { k: INK, b: 0x5a84aa, B: 0x385878, l: 0x90b6d6, w: 0xfffdf5, r: 0xe05252 }
};

function extraCreature(species: keyof typeof EXTRA_PALS, anim: CreatureAnim, frame: number): Pix {
  const pal = EXTRA_PALS[species];
  const step = anim === 'run' || anim === 'happy' || anim === 'fly' ? frame % 2 : frame === 2 ? 1 : 0;
  const rows: Record<keyof typeof EXTRA_PALS, [string[], string[]]> = {
    bear: [
      [
        '....kk....kk......',
        '...kbk....kbk.....',
        '..kbbkkkkkkbbk....',
        '.kbbbbbbbbbbbbk...',
        '.kbbwkbkbsssbk....',
        '.kbbbbbbsssssk....',
        '..kkbbllbbbbk.....',
        '.kbbbbbbbbbbbk....',
        'kBbbbbbbbbbbbbk...',
        'kBbbbbbbbbbbbbk...',
        'k.kbbbbbbbbbbk....',
        '..kbBk....kbBk....',
        '..kBBk....kBBk....',
        '..kssk....kssk....'
      ],
      [
        '....kk....kk......',
        '...kbk....kbk.....',
        '..kbbkkkkkkbbk....',
        '.kbbbbbbbbbbbbk...',
        '.kbbwkbkbsssbk....',
        '.kbbbbbbsssssk....',
        '..kkbbllbbbbk.....',
        '.kbbbbbbbbbbbk....',
        'kBbbbbbbbbbbbbk...',
        'kBbbbbbbbbbbbbk...',
        '.k.kbbbbbbbbbk....',
        '...kbBk..kbBk.....',
        '..kBBk....kBBk....',
        '..kssk....kssk....'
      ]
    ],
    horse: [
      [
        '..........kk.kk...',
        '.........kmmkbbk..',
        '........kmbbbbbbk.',
        '.......kmbbbwkbbbk',
        '......kmbbbbbllbbk',
        '..kkkkkmbllllkkbbk',
        '.kbbbbbbbbbbk..kk.',
        'kmbBbbbbbbbbk.....',
        'kmbBbbbbbbbbk.....',
        'km.kbbbbbbbk......',
        'k..kbbk.kbbk......',
        '...kbbk.kbbk......',
        '...kBBk.kBBk......',
        '...khhk.khhk......'
      ],
      [
        '..........kk.kk...',
        '.........kmmkbbk..',
        '........kmbbbbbbk.',
        '.......kmbbbwkbbbk',
        '......kmbbbbbllbbk',
        '..kkkkkmbllllkkbbk',
        '.kbbbbbbbbbbk..kk.',
        'kmbBbbbbbbbbk.....',
        'kmbBbbbbbbbbk.....',
        '.k.kbbbbbbbk......',
        '..kbbk...kbbk.....',
        '..kbbk...kbbk.....',
        '..kBBk...kBBk.....',
        '..khhk...khhk.....'
      ]
    ],
    dragon: [
      [
        '......kk..kkk.....',
        '.....koykkoyk..kk.',
        '....kooykggggkkwkk',
        '...kooogggggwggggk',
        '....kkoggggggkkkk.',
        '..kkk.kggggggk....',
        '.kgggggggggrrk....',
        'kGggggggggrrrk....',
        'k.kggggggrrrk.....',
        '...kggk..kggk.....',
        '...kGGk..kGGk.....',
        '...kyyk..kyyk.....'
      ],
      [
        '....kk....kkk.....',
        '...koyk..koyk..kk.',
        '..kooooykggggkkwkk',
        '..koooooggggwggggk',
        '...kkkoggggggkkkk.',
        '..kkk.kggggggk....',
        '.kgggggggggrrk....',
        'kGggggggggrrrk....',
        '.k.kgggggrrrk.....',
        '..kggk....kggk....',
        '..kGGk....kGGk....',
        '..kyyk....kyyk....'
      ]
    ],
    cat: [
      [
        '..kk..kk....',
        '.kpokkopk...',
        '.kwoowook...',
        '.kooopookkk.',
        '..kkoolkoook',
        '...kooooookk',
        '.kkoooook...',
        'kOkooooook..',
        'k.kookkook..',
        '..kwwkkwwk..'
      ],
      [
        '..kk..kk....',
        '.kpokkopk...',
        '.kwoowook...',
        '.kooopookkk.',
        '..kkoolkoook',
        '..koooooookk',
        '.kkoooook...',
        '.kkooooook..',
        '..kook.kook.',
        '.kwwk..kwwk.'
      ]
    ],
    dino: [
      [
        '.........kkkkkkkk.',
        '........kggwgggggk',
        '.......kgggggggggk',
        '.......kggggkkkkkk',
        '.......kggggwwwwwk',
        '......kgggggyyykk.',
        '.kk..kgggggyyyk...',
        'kggkkggggggyykk...',
        '.kgggggggggyykk...',
        '..kkggggggyyyk....',
        '....kggggggyk.....',
        '....kggk.kggk.....',
        '....kGGk.kGGk.....',
        '....kwwk.kwwk.....'
      ],
      [
        '.........kkkkkkkk.',
        '........kggwgggggk',
        '.......kgggggggggk',
        '.......kggggkkkkkk',
        '.......kggggwwwwwk',
        '......kgggggyyykk.',
        'kggk.kgggggyyyk...',
        '.kggkggggggyykk...',
        '..kggggggggyykk...',
        '...kggggggyyyk....',
        '....kggggggyk.....',
        '...kggk...kggk....',
        '...kGGk...kGGk....',
        '...kwwk...kwwk....'
      ]
    ],
    robot: [
      [
        '......kk......',
        '.....krrk.....',
        '......kk......',
        '..kkkkkkkkkk..',
        '.kssssssssssk.',
        '.kskccccccksk.',
        '.kskccccccksk.',
        '.kssssssssssk.',
        '..kkkddddkkk..',
        '.kssddddddssk.',
        'kSksssssssskSk',
        'kSkssyssysskSk',
        '.kksssssssskk.',
        '...kSSkkSSk...',
        '...kddkkddk...',
        '...kkkkkkkk...'
      ],
      [
        '......kk......',
        '.....kyyk.....',
        '......kk......',
        '..kkkkkkkkkk..',
        '.kssssssssssk.',
        '.kskccccccksk.',
        '.kskccccccksk.',
        '.kssssssssssk.',
        '..kkkddddkkk..',
        '.kssddddddssk.',
        'kSksssssssskSk',
        'kSkssyssysskSk',
        '.kksssssssskk.',
        '..kSSk..kSSk..',
        '..kddk..kddk..',
        '..kkkk..kkkk..'
      ]
    ],
    alien: [
      [
        '...kkkkkkkk...',
        '..kllllllllk..',
        '.klgggggggglk.',
        '.kgkkkggkkkgk.',
        '.kgkkkggkkkgk.',
        '.kggggggggggk.',
        '..kkggggggkk..',
        '....kkggkk....',
        '..kksssssskk..',
        '.kssSSSSSSssk.',
        '.k.kssssssk.k.',
        '...ksSkksSk...',
        '...kssksssk...',
        '...kkkkkkkk...'
      ],
      [
        '...kkkkkkkk...',
        '..kllllllllk..',
        '.klgggggggglk.',
        '.kgkkkggkkkgk.',
        '.kgkkkggkkkgk.',
        '.kggggggggggk.',
        '..kkggggggkk..',
        '....kkggkk....',
        '..kksssssskk..',
        '.kssSSSSSSssk.',
        'k..kssssssk..k',
        '..ksSk..ksSk..',
        '..kssk..kssk..',
        '..kkkk..kkkk..'
      ]
    ],
    shark: [
      [
        '.......kkk........',
        '......kbbbk.......',
        '..kk..kbbbbk......',
        '.kbbk.kbbbbbbbkk..',
        'kbbbbkbbbbbbbwbbk.',
        '.kbbbbbbbbbbbbbbbk',
        '..kbbbbbbbwwwwwkk.',
        '..kbbwwwwwwwwwwk..',
        '...kkkbbbbbkkkk...',
        '.....kbbk.kbbk....',
        '....kBBk..kBBk....'
      ],
      [
        '.......kkk........',
        '......kbbbk.......',
        '.kk...kbbbbk......',
        'kbbk..kbbbbbbbkk..',
        '.kbbbkbbbbbbbwbbk.',
        '..kbbbbbbbbbbbbbbk',
        '..kbbbbbbbwwwwwkk.',
        '..kbbwwwwwwwwwwk..',
        '...kkkbbbbbkkkk...',
        '....kbbk...kbbk...',
        '...kBBk....kBBk...'
      ]
    ]
  };
  return ascii(rows[species][step], pal);
}

/** The frames for one animal and one anim, facing right. */
export function creatureFrames(species: Species, anim: CreatureAnim, carrying: boolean): Texture[] {
  const n = FRAMES[anim];
  const out: Texture[] = [];
  for (let f = 0; f < n; f++) {
    out.push(tex(`cr:${species}:${anim}:${f}:${carrying}`, () => {
      if (species === 'raccoon') return raccoon(anim, f, carrying);
      if (species === 'puppy') return puppy(anim, f, carrying);
      if (species === 'pigeon') return pigeon(anim === 'happy' ? 'idle' : anim, f, carrying);
      return extraCreature(species, anim, f);
    }));
  }
  return out;
}

// ── props that appear on the floor ──────────────────────────────────────────

const IP: Record<string, number> = {
  k: INK, w: 0xfffdf5, a: 0xdedbe4, s: 0xb8b4c0, S: 0x847e92,
  c: 0xe8c890, C: 0xc49a5c, d: 0x9a7040, // cardboard
  r: 0xe0473f, R: 0xa82e3a, y: 0xffd93d, Y: 0xd99a26, o: 0xff9a3c,
  p: 0xffa8c4, P: 0xe07aa0, n: 0x8a5a3a, N: 0x5a3a26, h: 0xc89060,
  g: 0x8fd17c, G: 0x4f9a52, b: 0x5aa8f0, B: 0x2f6cc0, l: 0xb6e0ff, u: 0xb48cf0
};

const ITEM_ROWS: Record<string, string[]> = {
  pizzaBoxes: [
    '..cccccccccccc..',
    '..cccccrrcccccC.',
    '..ccccrwwrccccC.',
    '..cccccrrcccccC.',
    '..CCCCCCCCCCCCd.',
    'cccccccccccccc..',
    'cccccccrrcccccC.',
    'ccccccrwwrccccC.',
    'cccccccrrcccccC.',
    'CCCCCCCCCCCCCCd.',
    'dddddddddddddd..'
  ],
  gift: [
    '...yY.Yy...',
    '....yYy....',
    'rrrrryrrrrR',
    'rrrrryrrrrR',
    'yyyyyyyyyyY',
    'rrrrryrrrrR',
    'rrrrryrrrrR',
    'rrrrryrrrrR',
    'RRRRRYRRRRR'
  ],
  cashPile: [
    '..gggggg......',
    '..gGGwGg......',
    '..GGGyGG......',
    '..GGGyGGgggggg',
    'ggggggGGgGGwGg',
    'gGGwGgGGGGGyGG',
    'GGGyGGGGGGGyGG',
    'GGGyGGG.GGGyGG',
    'GGGyGG..GGGyGG'
  ],
  paperPile: [
    '....wwwwwa.......',
    '..wwwwwwwwwa.....',
    '.wsswwwwssww.wwa.',
    'wwwwwsswwwwwwssw.',
    'wsswwwwwwsswwwwwa',
    '.awwwssswwwwwssa.',
    '..aaawwwwwssaaa..',
    '.....aaaaaaa.....'
  ],
  wetFloorSign: [
    '...yyy...',
    '..yyyyy..',
    '..ykyyY..',
    '.yykkyyY.',
    '.yyykyyY.',
    '.yykykyY.',
    'yyyyyyyYY',
    'yykkkkkYY',
    'yyyyyyyYY',
    'yY.....YY',
    'yY.....YY'
  ],
  snackPile: [
    '.....rr.......',
    '....ryyr..bb..',
    '..nnryyrnbwwb.',
    '.nhhrrrrhbwwb.',
    'ssrrRRnnnbbbbo',
    'srrrrrrhhhBBoo',
    'pPpppnnnnnhhoo',
    '.PPPPNNNNNNNO.'
  ],
  chalkOutline: [
    '......w.w.w.........',
    '....w.......w.......',
    '...w.........w......',
    '....w.......w.......',
    '..w..w.w.w.w..w.....',
    '.w.............w....',
    '..w..w.....w..w.....',
    '.....w.....w........',
    '....w.......w.......',
    '...w..w...w..w......',
    '..w.w.......w.w.....'
  ],
  brokenParts: [
    '....SS........k...',
    '..kssssk..yy.kSk..',
    '.ksk..ksk..y.ksk..',
    '..kssssk.oo..kSSk.',
    '....SS...yy.kdddk.',
    '..kssssk....kddk..',
    '.kSSaaSSk.oo......'
  ]
};

const SCUFFLE_FRAMES: string[][] = [
  [
    '.....wwwww..yy......',
    '...wwwwwwwwwry......',
    '..wwwwaaawwwwww.....',
    '.wwwaawwwaawwwww.yy.',
    'wwwwwkwwwkwwwwwwwr..',
    'wwwwwakwkawwwwwwww..',
    '.wwwwaaaawwwwaawww..',
    '..wwwwwwrrwwwwwww...',
    '...wwwwwwwwwyyww....',
    '....sswwwwwwss......'
  ],
  [
    '...yy..wwwww........',
    '...rywwwwwwwww......',
    '....wwwwaaawwwww.yy.',
    '...wwwaawwwaawwwwr..',
    '..wwwwwkwwwkwwwwww..',
    '.wwwwwwakwkawwwwww..',
    '..wwwwwaaaawwwwww...',
    '...wwwwwyywwwwww....',
    '....wwwwwwrrwww.....',
    '.....sswwwwss.......'
  ],
  [
    '......wwwww....yy...',
    '....wwwwwwwww..ry...',
    '.yy.wwwaaawwwwww....',
    '.rrwwwaawwwaawwww...',
    '..wwwwwkwwwkwwwwww..',
    '..wwwwwakwkawwwwww..',
    '..wwwwaaaawwwaawww..',
    '...wwwwwwwwrrwwww...',
    '....wwwwwyywwwww....',
    '.....sswwwwwwss.....'
  ]
];

/** Candles flicker, so the cake has two frames. */
function cakePix(frame: number): Pix {
  const rows = [
    frame ? '..y...o...y..' : '..o...y...o..',
    '..r...b...u..',
    '..r...b...u..',
    '.wwwwwwwwwwww.',
    'wwpwwwpwwwpwwa',
    'ppppppppppppP',
    'nnnnnnnnnnnnN',
    'pppppppppppPP',
    'hhhhhhhhhhhhN',
    '.aaaaaaaaaaaa.',
    'sssssssssssssS'
  ];
  return ascii(rows, IP);
}

export function itemFrames(item: string): Texture[] {
  if (item === 'cake') return [tex('item:cake:0', () => cakePix(0)), tex('item:cake:1', () => cakePix(1))];
  if (item === 'puddle') return [tex('item:puddle', puddlePix)];
  if (item === 'scorch') return [tex('item:scorch', scorchPix)];
  if (item === 'foam') return [tex('item:foam:0', () => foamPix(0)), tex('item:foam:1', () => foamPix(1))];
  if (item === 'scuffle') return SCUFFLE_FRAMES.map((rows, f) => tex(`item:scuffle:${f}`, () => ascii(rows, IP)));
  const rows = ITEM_ROWS[item] ?? ITEM_ROWS.gift;
  return [tex('item:' + item, () => ascii(rows, IP))];
}

function puddlePix(): Pix {
  const p = new Pix(22, 10);
  p.ellipse(11, 5, 10, 4.2, 0x3f86c8, 200);
  p.ellipse(7, 4, 6, 3, 0x3f86c8, 200);
  p.ellipse(15, 6, 6, 3, 0x3f86c8, 200);
  p.ellipse(11, 5, 8.4, 3, 0x5aa8f0, 190);
  // Highlights: short pale strokes.
  p.rect(6, 3, 3, 1, 0xd8f0ff, 230); p.rect(13, 6, 2, 1, 0xd8f0ff, 230); p.set(9, 4, 0xffffff);
  return p;
}

function scorchPix(): Pix {
  const p = new Pix(28, 14);
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 28; x++) {
      const dx = (x + 0.5 - 14) / 13, dy = (y + 0.5 - 7) / 6.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      const n = Math.sin(x * 1.7) * 0.08 + Math.cos(y * 2.3 + x) * 0.08;
      const dd = d + n;
      if (dd > 1) continue;
      // Stepped char: black centre, brown-black, then a dithered sooty rim.
      if (dd < 0.45) p.set(x, y, 0x1a1418, 235);
      else if (dd < 0.72) p.set(x, y, 0x2e2224, 210);
      else if ((x + y) % 2 === 0) p.set(x, y, 0x3e2e2a, 170);
    }
  }
  // A few embers in the middle.
  p.set(12, 6, 0xff8a2a); p.set(16, 8, 0xdc3a2a);
  return p;
}

function foamPix(frame: number): Pix {
  const p = new Pix(22, 11);
  const blobs = frame ? [[5, 6, 3.4], [10, 5, 4], [16, 6, 3.6], [8, 8, 3], [14, 8, 3.2], [19, 8, 2.4]] : [[5, 7, 3.2], [10, 5, 4.2], [16, 6, 3.4], [8, 8, 3.2], [13, 8, 3.4], [19, 7, 2.6]];
  for (const [x, y, r] of blobs) p.ellipse(x, y, r, r * 0.8, 0xdde8f4);
  for (const [x, y, r] of blobs) p.ellipse(x - 0.6, y - 0.8, r * 0.7, r * 0.55, 0xffffff);
  p.outline(0x9aaac0);
  return p;
}

/** Items that lie flat on the floor (drawn in fx.floor, under people). */
export const FLAT_ITEMS = new Set(['puddle', 'scorch', 'foam', 'chalkOutline', 'brokenParts']);

// ── small things that move ──────────────────────────────────────────────────

/** A bee, 2 frames of wing beat. 6 x 5 with outline. */
export function beeFrames(): Texture[] {
  return [
    tex('bee:0', () => ascii(['.ll..', '.ll..', 'yykyk', 'ykykY'], { y: C.yellow, Y: C.yellowD, k: 0x3a3030, l: 0xe8f4ff })),
    tex('bee:1', () => ascii(['.....', '.ll..', 'yykyk', 'ykykY'], { y: C.yellow, Y: C.yellowD, k: 0x3a3030, l: 0xe8f4ff }))
  ];
}

/** Pad by one pixel and add a soft dark rim (for sprites too tiny for the full ink outline). */
function outlineSoft(src: Pix): Pix {
  const q = new Pix(src.w + 2, src.h + 2);
  q.blit(src, 1, 1);
  return q.outline(0x3a3030);
}

export const BALLOON_COLORS = [0xe84a4a, 0xffd93d, 0x5aa8f0, 0x5cc36e, 0xff86a8, 0xb48cf0, 0xff9a3c];

/** A balloon, white-ish so it can be tinted; highlight stays white. 8 x 11 incl. knot. */
export function balloonTex(color: number): Texture {
  return tex('balloon:' + color.toString(16), () => {
    const p = new Pix(9, 12);
    p.ellipse(4.5, 4.6, 3.6, 4.4, color);
    for (let y = 0; y < 12; y++) for (let x = 5; x < 9; x++) if (p.alpha(x, y) && (x - 4.5) * 0.7 + (y - 4.5) * 0.4 > 1.6) p.set(x, y, shade(color, 0.75));
    p.set(3, 2, 0xffffff); p.set(2, 3, 0xffffff); p.set(2, 4, 0xffffff);
    p.set(4, 9, shade(color, 0.7)); p.rect(3, 10, 3, 1, shade(color, 0.7));
    return p.outline(INK);
  });
}

/** A 1 px string that wiggles, two frames. */
export function stringFrames(len: number): Texture[] {
  return [0, 1].map((f) => tex(`string:${len}:${f}`, () => {
    const p = new Pix(3, len);
    for (let y = 0; y < len; y++) p.set(1 + (Math.floor((y + f * 3) / 3) % 2 === 0 ? 0 : (y % 6 < 3 ? -1 : 1)) * (y > 2 ? 1 : 0), y, 0xe8e4f0);
    return p;
  }));
}

/** The mirror ball: faceted disc, 3 frames as the facets turn. */
export function mirrorBallFrames(): Texture[] {
  return [0, 1, 2].map((f) => tex('mball:' + f, () => {
    const p = new Pix(11, 11);
    p.ellipse(5.5, 5.5, 5, 5, 0x9aa0b4);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      if (!p.alpha(x, y)) continue;
      const k = (Math.floor((x + f) / 2) + Math.floor(y / 2)) % 2;
      p.set(x, y, k ? 0xd8dce8 : 0x8088a0);
    }
    p.set(3 + f, 3, 0xffffff); p.set(7 - f, 6, 0xffffff); p.set(4, 7 + (f % 2), 0xffffff);
    return p.outline(INK);
  }));
}

/** A tiny crossed-out wifi sign (9 x 8 with outline). */
export function noSignalTex(): Texture {
  return tex('nosignal', () => slash(ascii([
    '..wwwww..',
    '.w.....w.',
    'w..www..w',
    '..w...w..',
    '....w....',
    '...www...'
  ], { w: 0xe8f0ff }, INK)));
}

/** A red slash corner to corner, drawn over the sign. */
function slash(p: Pix): Pix {
  for (let i = 0; i < Math.min(p.w, p.h) + 1; i++) {
    const x = 1 + i, y = p.h - 2 - i;
    p.set(x, y, 0xe84a4a);
    if (i > 0) p.set(x, y + 1, 0xa82e3a);
  }
  return p;
}

/** A dark monitor face (9 x 6), the patch put over a screen when it goes off. */
export function offScreenTex(): Texture {
  return tex('offscreen', () => {
    const p = new Pix(10, 7);
    p.rect(0, 0, 10, 7, INK);
    p.rect(1, 1, 8, 5, 0x2e3446);
    p.set(2, 2, 0x4a5470); p.set(3, 2, 0x4a5470); p.set(2, 3, 0x4a5470);
    return p;
  });
}

/** An alarm beacon on the wall: 2 frames, lit and dim. */
export function beaconFrames(): Texture[] {
  return [0, 1].map((f) => tex('beacon:' + f, () => ascii([
    '.rrr.',
    'rwrrr',
    'rrrrr',
    'sssss'
  ], { r: f ? 0x8a2a30 : 0xff5a4a, w: f ? 0xa84a4a : 0xffd8c8, s: 0x847e92 }, INK)));
}

/** Small office things that float in zero gravity (each with 4 exact 90° turns). */
export const FLOATERS = ['pencil', 'stapler', 'mug', 'paper0', 'clip'];

/** Shutter slat (w x 3) and the housing it rolls out of. */
export function slatTex(w: number): Texture {
  return tex('slat:' + w, () => {
    const p = new Pix(w, 3);
    p.rect(0, 0, w, 1, 0xc8ccd8);
    p.rect(0, 1, w, 1, 0x9aa0b4);
    p.rect(0, 2, w, 1, 0x5e6478);
    p.set(0, 0, INK); p.set(0, 1, INK); p.set(0, 2, INK);
    p.set(w - 1, 0, INK); p.set(w - 1, 1, INK); p.set(w - 1, 2, INK);
    return p;
  });
}

export function shutterFootTex(w: number): Texture {
  return tex('shfoot:' + w, () => {
    const p = new Pix(w, 3);
    for (let x = 0; x < w; x++) p.set(x, 0, Math.floor(x / 3) % 2 ? INK : 0xffd93d);
    for (let x = 0; x < w; x++) p.set(x, 1, Math.floor((x + 1) / 3) % 2 ? INK : 0xffd93d);
    p.rect(0, 2, w, 1, INK);
    return p;
  });
}

export function housingTex(w: number): Texture {
  return tex('housing:' + w, () => {
    const p = new Pix(w + 2, 4);
    p.rect(0, 0, w + 2, 4, INK);
    p.rect(1, 1, w, 2, 0x5e6478);
    p.rect(1, 1, w, 1, 0x847e92);
    return p;
  });
}
