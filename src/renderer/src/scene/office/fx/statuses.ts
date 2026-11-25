// Small effects attached to people, from their statuses: hearts, steam, Zzz,
// circling stars and the rest. Subtle on purpose: they sit on a person who is
// only 18 x 32 px, and several people may have them at once.

import { Container, Sprite, Texture } from 'pixi.js';
import type { StatusKind } from '@/game/core/types';
import type { FxPerson } from '@/game/view/api';
import { pick, rr, type Env } from './core';
import { C, CONFETTI_TINTS, framesOf, goldSparkleFrames, shapeTex, squareTex } from './art';
import { confetti, emitBurst, emitDrift, emitDrop, emitPoof, sparkles } from './emit';
import { Land, Layer } from './particles';

const KINDS: readonly StatusKind[] = [
  'love', 'rage', 'truth', 'paranoid', 'caffeinated', 'sleepy', 'asleep', 'tiny', 'giant', 'swapped',
  'crowned', 'party', 'rich', 'spooked', 'abducted', 'stung', 'dizzy', 'wet', 'sooty', 'frizzy', 'frozen',
  'knockedOut', 'eliminated', 'guilty', 'quit', 'naked', 'censored', 'flustered', 'aroused', 'afterglow', 'scandal',
  'bound', 'dominated', 'blackmailed', 'voyeur', 'exhibitionist'
];
const BIT = new Map<StatusKind, bigint>(KINDS.map((k, i) => [k, 1n << BigInt(i)]));
const bitOf = (k: StatusKind): bigint => BIT.get(k) ?? 0n;

/** Seconds between emissions for each status (0 = handled another way). */
const EVERY: Record<StatusKind, number> = {
  love: 0.55, rage: 0.32, truth: 0.22, paranoid: 0, caffeinated: 0.1, sleepy: 1.3, asleep: 0.75,
  tiny: 0, giant: 0, swapped: 0, crowned: 0.32, party: 0.09, rich: 0.45, spooked: 0.45,
  abducted: 0.14, stung: 0.55, dizzy: 0, wet: 0.8, sooty: 0.4, frizzy: 0.22, frozen: 0.38,
  knockedOut: 0, eliminated: 0, guilty: 0.7, quit: 0, naked: 0.55, censored: 0.42, flustered: 1.1, aroused: 0.7, afterglow: 1.2, scandal: 0,
  bound: 0.7, dominated: 0.75, blackmailed: 0.85, voyeur: 0, exhibitionist: 0.45
};

interface PFx {
  id: string;
  seen: boolean;
  mask: bigint;
  timers: Float32Array;
  box: Container | null;
  stars: Sprite[];
  eyes: Sprite[];
  swirl: Sprite[];
  anger: Sprite | null;
  t: number;
}

export class Statuses {
  private map = new Map<string, PFx>();
  private heart: Texture;
  private star: Texture;
  private starSmall: Texture;
  private coin: Texture[];
  private gold: Texture[];
  private eyeFrames: Texture[];
  private zs: Texture[];

  constructor(private env: Env) {
    this.heart = shapeTex('heart');
    this.star = shapeTex('star', true);
    this.starSmall = shapeTex('star');
    this.coin = framesOf(['coin0', 'coin1', 'coin2', 'coin1'], true);
    this.gold = goldSparkleFrames();
    this.eyeFrames = framesOf(['eye0', 'eye1', 'eye2', 'eye1'], true);
    this.zs = [shapeTex('z', true), shapeTex('zBig', true)];
  }

  private get(p: FxPerson): PFx {
    let s = this.map.get(p.id);
    if (!s) {
      s = { id: p.id, seen: true, mask: 0n, timers: new Float32Array(KINDS.length), box: null, stars: [], eyes: [], swirl: [], anger: null, t: Math.random() * 10 };
      for (let i = 0; i < KINDS.length; i++) s.timers[i] = Math.random() * 0.5;
      this.map.set(p.id, s);
    }
    return s;
  }

  private ensureBox(s: PFx): Container {
    if (s.box) return s.box;
    const box = new Container();
    for (let i = 0; i < 3; i++) { const st = new Sprite(this.starSmall); st.anchor.set(0.5); st.visible = false; box.addChild(st); s.stars.push(st); }
    for (let i = 0; i < 2; i++) { const e = new Sprite(this.eyeFrames[0]); e.anchor.set(0.5); e.visible = false; box.addChild(e); s.eyes.push(e); }
    for (let i = 0; i < 6; i++) { const d = new Sprite(squareTex(i % 2 ? 1 : 2)); d.anchor.set(0.5); d.tint = i % 2 ? C.purple : 0xe8d0ff; d.visible = false; box.addChild(d); s.swirl.push(d); }
    s.anger = new Sprite(shapeTex('angerBig', true));
    s.anger.anchor.set(0.5);
    s.anger.visible = false;
    box.addChild(s.anger);
    this.env.high.addChild(box);
    s.box = box;
    return box;
  }

  update(dt: number): void {
    const env = this.env;
    for (const s of this.map.values()) s.seen = false;
    const people = env.people;
    const v = env.view;
    for (let pi = 0; pi < people.length; pi++) {
      const p = people[pi];
      const s = this.get(p);
      s.seen = true;
      s.t += dt;
      let mask = 0n;
      if (p.visible) for (let i = 0; i < p.statuses.length; i++) { mask |= bitOf(p.statuses[i]); }
      const started = mask & ~s.mask;
      s.mask = mask;
      const onScreen = p.x > v.x0 - 24 && p.x < v.x1 + 24 && p.y > v.y0 - 8 && p.y < v.y1 + 48;
      const head = Math.max(10, p.y - p.headY);
      if ((started & (bitOf('tiny') | bitOf('giant'))) !== 0n) {
        emitBurst(env.parts, 'sparkles', p.x, p.y, head * 0.5, 8);
        emitPoof(env.parts, p.x, p.y - 2, 0, 5, 0xffffff, 0, 0, 0, 0.4, Layer.Air, 0.6);
      }
      if ((started & bitOf('frozen')) !== 0n) emitBurst(env.parts, 'sparkles', p.x, p.y, head * 0.5, 10);
      const needBox = mask & (
        bitOf('dizzy') | bitOf('knockedOut') | bitOf('paranoid') | bitOf('voyeur') |
        bitOf('swapped') | bitOf('rage')
      );
      if (needBox !== 0n || s.box) this.attached(s, p, mask, head);
      if (mask === 0n || !onScreen) continue;
      for (let i = 0; i < KINDS.length; i++) {
        if ((mask & (1n << BigInt(i))) === 0n) continue;
        const every = EVERY[KINDS[i]];
        if (!every) continue;
        s.timers[i] -= dt;
        if (s.timers[i] > 0) continue;
        s.timers[i] = every * rr(0.7, 1.3);
        this.emit(KINDS[i], p, head);
      }
    }
    // People who left the floor: drop their attached sprites.
    for (const [id, s] of this.map) {
      if (!s.seen) {
        s.box?.destroy({ children: true });
        this.map.delete(id);
      }
    }
  }

  /** Sprites that stay on a person: circling stars, watching eyes, swap swirl, anger mark. */
  private attached(s: PFx, p: FxPerson, mask: bigint, head: number): void {
    const box = this.ensureBox(s);
    box.position.set(Math.round(p.x), Math.round(p.headY));
    const t = s.t;
    const dizzy = (mask & (bitOf('dizzy') | bitOf('knockedOut'))) !== 0n;
    for (let i = 0; i < 3; i++) {
      const st = s.stars[i];
      st.visible = dizzy;
      if (!dizzy) continue;
      const a = t * 5 + (i / 3) * Math.PI * 2;
      st.x = Math.round(Math.cos(a) * 8);
      st.y = Math.round(Math.sin(a) * 2.5 - 1);
      // Behind the head on the far side of the orbit.
      st.alpha = Math.sin(a) < -0.2 ? 0.5 : 1;
    }
    const para = (mask & bitOf('paranoid')) !== 0n;
    const voy = (mask & bitOf('voyeur')) !== 0n;
    const showEyes = para || voy;
    for (let i = 0; i < 2; i++) {
      const e = s.eyes[i];
      e.visible = showEyes;
      if (!showEyes) continue;
      const side = i === 0 ? -1 : 1;
      e.x = Math.round(side * (13 + Math.sin(t * 1.3 + i) * 2));
      e.y = Math.round(-4 + Math.sin(t * 1.9 + i * 2) * 2);
      // Eyes glance about, now and then blinking shut.
      const blink = Math.floor(t * 3 + i) % 9 === 0;
      e.texture = this.eyeFrames[Math.floor(t * 1.2 + i * 2) % 4];
      e.tint = voy && !para ? 0xe880c8 : 0xffffff;
      e.alpha = blink ? 0 : 0.95;
    }
    const sw = (mask & bitOf('swapped')) !== 0n;
    for (let i = 0; i < 6; i++) {
      const d = s.swirl[i];
      d.visible = sw;
      if (!sw) continue;
      const a = -t * 6 + (i / 6) * Math.PI * 2;
      const r = 6 + (i % 2) * 2;
      d.x = Math.round(Math.cos(a) * r);
      d.y = Math.round(-6 + Math.sin(a) * r * 0.35 - (i % 3));
    }
    const rage = (mask & bitOf('rage')) !== 0n;
    if (s.anger) {
      s.anger.visible = rage && Math.floor(t * 3) % 2 === 0;
      s.anger.position.set(7, 2);
    }
  }

  private emit(k: StatusKind, p: FxPerson, head: number): void {
    const parts = this.env.parts;
    const q = parts.spawn();
    if (!q) return;
    q.x = p.x; q.y = p.y; q.z = head; q.layer = Layer.High;
    let tex: Texture | null = null;
    let tint = 0xffffff;
    switch (k) {
      case 'love':
      case 'flustered':
        q.x += rr(-5, 5); q.z = head - 4 + rr(0, 3); q.vz = rr(12, 18); q.sway = rr(1, 2); q.swayF = rr(4, 6); q.swayPh = rr(0, 6);
        q.life = rr(1.1, 1.5); q.fadeOut = 0.4; q.popIn = 0.15; tex = this.heart;
        break;
      case 'aroused':
        q.x += rr(-6, 6); q.z = head - 3 + rr(0, 3); q.vz = rr(15, 22); q.sway = rr(1.5, 2.5); q.swayF = rr(5, 7); q.swayPh = rr(0, 6);
        q.life = rr(1.0, 1.4); q.fadeOut = 0.35; q.popIn = 0.12; tex = this.heart; tint = 0xff7098;
        break;
      case 'afterglow':
        q.x += rr(-6, 6); q.z = rr(head * 0.4, head); q.vz = rr(5, 10); q.frames = sparkles(); q.once = true; q.fps = rr(5, 8); q.life = 0.65; tint = pick([0xffb0d0, 0xffe0a8, 0xffd2f0]);
        q.alpha = 0.85;
        break;
      case 'rage': {
        // Steam out of the ears, alternating sides, with a red-hot pixel or two.
        const side = Math.random() < 0.5 ? -1 : 1;
        parts.commit(q, squareTex(1), 0xff5a4a);
        q.x += side * 6; q.z = head - 6; q.vx = side * rr(10, 18); q.vz = rr(10, 20); q.life = 0.35;
        emitPoof(parts, p.x + side * 7, p.y, head - 4, rr(2.2, 3), 0xf0ecf0, side * rr(14, 24), 0, rr(14, 22), 0.5, Layer.High, 0.9);
        return;
      }
      case 'truth':
        q.x += rr(-8, 8); q.z = rr(2, head); q.vz = rr(6, 12); q.frames = sparkles(); q.once = true; q.fps = rr(5, 8); q.life = 0.7; tint = pick([0x9ad8ff, 0xc8ecff, 0x6ab8f0]);
        q.alpha = 0.8;
        break;
      case 'caffeinated':
        if (Math.random() < 0.7) {
          // Speed lines streaking off to the sides.
          const side = Math.random() < 0.5 ? -1 : 1;
          q.x += side * rr(9, 12); q.z = rr(4, head - 4); q.vx = side * rr(50, 80); q.life = 0.16; q.fadeOut = 0.5; tex = shapeTex(Math.random() < 0.5 ? 'speed' : 'speedS');
          tint = 0xffffff; q.alpha = 0.9;
        } else {
          q.x += rr(-8, 8); q.z = head + rr(-2, 4); q.vx = rr(-30, 30); q.vz = rr(10, 40); q.g = 120; q.life = 0.3; tex = squareTex(1); tint = pick([0xffd23d, 0xfff4b8]);
        }
        break;
      case 'sleepy':
      case 'asleep':
        q.x += 5; q.z = head - 2; q.vx = rr(5, 9); q.vz = rr(8, 12); q.sway = 2; q.swayF = 3; q.life = k === 'asleep' ? 1.8 : 1.4; q.fadeOut = 0.35; q.popIn = 0.2;
        tex = this.zs[k === 'asleep' && Math.random() < 0.6 ? 1 : 0]; tint = 0xffffff;
        break;
      case 'crowned':
        q.x += rr(-7, 7); q.z = head + rr(-2, 6); q.vz = rr(3, 8); q.frames = this.gold; q.once = true; q.fps = rr(7, 10); q.life = 0.45;
        break;
      case 'party':
        q.x += rr(-10, 10); q.z = head + rr(8, 14); q.vz = -rr(8, 14); q.term = 16; q.frames = confetti(); q.fps = 10; q.life = 2; q.sway = 2; q.swayF = rr(5, 8);
        q.land = Land.Settle; q.settle = 0.6; q.layer = Layer.Air; tint = pick(CONFETTI_TINTS);
        break;
      case 'rich':
        q.x += rr(-8, 8); q.z = rr(head * 0.4, head); q.vz = rr(8, 14); q.frames = this.coin; q.fps = 10; q.life = 0.9; q.fadeOut = 0.4;
        break;
      case 'spooked':
        q.x += rr(-4, 4); q.z = head; q.vz = rr(10, 16); q.vx = rr(-4, 4); q.sway = 2; q.swayF = 5; q.life = 1; q.alpha = 0.55; q.fadeOut = 0.6; tex = squareTex(2); tint = 0xe8e0ff;
        break;
      case 'abducted':
        q.x += rr(-8, 8); q.z = rr(0, head + 2); q.vz = rr(8, 16); q.life = 0.5; q.fadeOut = 0.6; tex = squareTex(1); tint = pick([0x9cf07a, 0xd8ffc8, 0x5ad25a]);
        break;
      case 'stung': {
        const side = Math.random() < 0.5 ? -1 : 1;
        q.x += side * 6; q.z = head - 3; q.vx = side * rr(15, 25); q.vz = rr(30, 45); q.g = 120; q.life = 0.6; q.popIn = 0.1; tex = this.star;
        break;
      }
      case 'wet':
        q.x += rr(-6, 6); q.z = rr(head * 0.3, head * 0.6); q.vz = -10; q.g = 220; q.land = Land.Splash; q.life = 2; q.fadeOut = 0; q.layer = Layer.Air;
        tex = shapeTex('drop');
        break;
      case 'sooty':
        parts.commit(q, squareTex(1), 0x3a3440);
        q.life = 0.01;
        emitDrift(parts, p.x + rr(-5, 5), p.y, head - rr(0, 6), rr(2, 3), pick([0x4a4452, 0x5e5868]), rr(-3, 3), 0, rr(8, 14), rr(0.8, 1.2), 0.65, Layer.High);
        return;
      case 'frizzy':
        q.x += rr(-7, 7); q.z = head + rr(-1, 4); q.life = 0.12; q.fadeOut = 0; tex = Math.random() < 0.5 ? shapeTex('zig') : squareTex(1); tint = pick([0xfff4b8, 0xffffff, 0xffd23d]);
        break;
      case 'frozen':
        q.x += rr(-7, 7); q.z = rr(2, head); q.frames = sparkles(); q.once = true; q.fps = 8; q.life = 0.5; tint = pick([0xb6f0ff, 0xffffff, 0x8adcff]);
        break;
      case 'guilty':
        q.x += pick([-6, 6]); q.z = head - 2; q.vz = -18; q.g = 90; q.life = 0.45; q.fadeOut = 0.35; tex = shapeTex('drop');
        break;
      case 'naked':
        q.x += rr(-7, 7); q.z = rr(head * 0.35, head * 0.75); q.vz = rr(6, 12); q.frames = sparkles(); q.once = true; q.fps = 7; q.life = 0.5; tint = pick([0xff90b0, 0xffd23d, 0xffffff]);
        break;
      case 'censored':
        q.x += rr(-8, 8); q.z = head - 2 + rr(0, 4); q.vz = rr(16, 24); q.sway = rr(1.5, 3); q.swayF = rr(6, 8); q.swayPh = rr(0, 6);
        q.life = rr(0.9, 1.3); q.fadeOut = 0.35; q.popIn = 0.1; tex = this.heart; tint = pick([0xff5a8a, 0xff90b0, 0xffd23d]);
        if (Math.random() < 0.45) {
          emitPoof(parts, p.x + rr(-6, 6), p.y, head * 0.6, rr(2, 3.2), 0xffc8dc, rr(-12, 12), 0, rr(10, 18), 0.45, Layer.High, 0.75);
        }
        break;
      case 'bound':
        q.x += rr(-6, 6); q.z = rr(head * 0.3, head * 0.65); q.vz = rr(6, 12); q.frames = sparkles(); q.once = true; q.fps = 8; q.life = 0.55;
        tint = pick([0xff86a8, 0xd03060, 0xffb8d0]);
        if (Math.random() < 0.35) emitDrop(parts, p.x + rr(-4, 4), p.y, head - 2, -25, Layer.High);
        break;
      case 'dominated':
        q.x += rr(-5, 5); q.z = head - 3 + rr(0, 3); q.vz = rr(13, 20); q.sway = rr(1, 2.2); q.swayF = rr(4, 6); q.swayPh = rr(0, 6);
        q.life = rr(1.0, 1.4); q.fadeOut = 0.35; q.popIn = 0.12; tex = this.heart; tint = pick([0xd03060, 0xff5a8a]);
        break;
      case 'blackmailed':
        parts.commit(q, shapeTex('drop'), 0xb6e0ff);
        q.x += pick([-6, 6]); q.z = head - 2; q.vz = -16; q.g = 80; q.life = 0.45; q.fadeOut = 0.35;
        emitDrift(parts, p.x + rr(-5, 5), p.y, head + 1, rr(2, 3), 0x5a3a7a, rr(-4, 4), 0, rr(8, 13), 0.65, 0.65, Layer.High);
        return;
      case 'exhibitionist':
        q.x += rr(-8, 8); q.z = rr(head * 0.3, head + 2); q.vz = rr(8, 16); q.frames = sparkles(); q.once = true; q.fps = 9; q.life = 0.55;
        tint = pick([0xffd93d, 0xff86a8, 0xffffff]);
        break;
      default:
        q.life = 0.01;
    }
    parts.commit(q, tex, tint);
  }

  clear(): void {
    for (const s of this.map.values()) s.box?.destroy({ children: true });
    this.map.clear();
  }
}
