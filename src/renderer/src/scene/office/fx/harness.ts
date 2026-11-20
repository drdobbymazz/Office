// Dev harness for the effects layer: the real office map with a few people on
// it, and the effects on top. See harness/fx.html for the URL parameters.

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import type { BurstKind, EffectInstance, EmoteIcon, FxCue, FxPerson } from '@/game/view/api';
import type { RoomId, StatusKind } from '@/game/core/types';
import { MAP_PX_H, TILE, WORLD_H, WORLD_W, deskOf, monitorPx, roomCentrePx, roomRectPx, walkableTilesIn } from '@/game/core/world';
import { loadOfficeMap } from '../mapLoader';
import { sceneFrameBufs, SCENE_W, SCENE_H } from '../portraitArt';
import type { OfficeCharacterName } from '../cast';
import { createFxView } from './index';
import { EMOTE_ICONS, emoteTex, textPix, BURSTS } from './art';
import { Pix } from './pix';

const q = new URLSearchParams(location.search);
const VIEW = q.get('view') ?? 'effect';
const KIND = q.get('kind') ?? 'fire';
const ROOM = (q.get('room') ?? 'kitchen') as RoomId;
const ZOOM = q.get('zoom') ? Number(q.get('zoom')) : 0;
const PRESTEP = Number(q.get('t') ?? '0');

const NAMES: OfficeCharacterName[] = ['michael', 'jim', 'pam', 'dwight', 'kevin', 'angela', 'oscar', 'stanley', 'phyllis', 'andy', 'kelly', 'ryan', 'toby', 'creed', 'meredith'];

interface Person { id: string; s: Sprite; x: number; y: number; statuses: StatusKind[]; walk?: { x0: number; x1: number; sp: number } }

function personTex(name: OfficeCharacterName): Texture {
  const buf = sceneFrameBufs(name).front[0];
  const p = new Pix(SCENE_W, SCENE_H);
  p.data.set(buf);
  return p.toTexture();
}

function defaults(kind: string, room: RoomId): EffectInstance {
  const c = roomCentrePx(room);
  const r = roomRectPx(room);
  const id = 'e1';
  switch (kind) {
    case 'fire': return { id, kind: 'fire', x: c.x, y: c.y + 8, size: Number(q.get('size') ?? 0.8) };
    case 'smoke': return { id, kind: 'smoke', room, density: 0.8 };
    case 'sprinklers': return { id, kind: 'sprinklers', room };
    case 'flood': return { id, kind: 'flood', room, level: Number(q.get('level') ?? 0.8), spoutX: r.x + 24, spoutY: r.y + 40, spraying: true };
    case 'dark': return { id, kind: 'dark', rooms: q.get('rooms') === 'room' ? [room] : 'all', level: 1, emergency: q.get('emergency') === '1' };
    case 'light': return { id, kind: 'light', x: c.x, y: c.y, radius: 40, color: 0xffd890 };
    case 'alarm': return { id, kind: 'alarm' };
    case 'quake': return { id, kind: 'quake', power: 0.8 };
    case 'spray': return { id, kind: 'spray', what: (q.get('what') ?? 'paper') as 'paper', x: c.x, y: c.y, power: 0.8 };
    case 'ufo': return { id, kind: 'ufo', x: c.x, y: c.y + 10, height: 56, beam: 1 };
    case 'ghost': return { id, kind: 'ghost', x: c.x, y: c.y + 10, facing: (q.get('facing') ?? 'down') as 'down', alpha: 1, mood: (q.get('mood') ?? 'drift') as 'drift' };
    case 'creature': return { id, kind: 'creature', species: (q.get('species') ?? 'raccoon') as 'raccoon', x: c.x, y: c.y + 10, facing: 'right', anim: (q.get('anim') ?? 'idle') as 'idle', carrying: q.get('carrying') === '1' };
    case 'bees': return { id, kind: 'bees', x: c.x, y: c.y + 10, spread: 22, count: 12 };
    case 'disco': return { id, kind: 'disco', level: 1 };
    case 'rain': return { id, kind: 'rain', room, what: (q.get('what') ?? 'cash') as 'cash', rate: 0.7 };
    case 'balloons': return { id, kind: 'balloons', room, count: 8 };
    case 'item': return { id, kind: 'item', item: (q.get('item') ?? 'cake') as 'cake', x: c.x, y: c.y + 10 };
    case 'emoji': return { id, kind: 'emoji', emoji: q.get('emoji') ?? '🦖', x: c.x, y: c.y + 10, size: Number(q.get('size') ?? 32), bob: true };
    case 'timeFreeze': return { id, kind: 'timeFreeze', level: 1 };
    case 'zeroG': return { id, kind: 'zeroG', level: 1 };
    case 'beam': return { id, kind: 'beam', from: { x: c.x - 40, y: c.y - 10 }, to: { x: c.x + 30, y: c.y + 12 }, color: 0xb48cf0, width: 3 };
    case 'cloud': return { id, kind: 'cloud', what: (q.get('what') ?? 'stink') as 'stink', x: c.x, y: c.y + 6, radius: 18 };
    case 'barrier': return { id, kind: 'barrier', x: 13 * TILE, y: 8 * TILE - 8, w: 16, h: 24 };
    case 'screens': return { id, kind: 'screens', state: (q.get('state') ?? 'nosignal') as 'off', at: (['jim', 'dwight', 'stanley', 'phyllis', 'andy', 'creed', 'meredith', 'kelly', 'ryan', 'pam', 'kevin', 'toby', 'angela', 'oscar', 'michael'] as const).map((n) => monitorPx(n)) };
    case 'daylight': return { id, kind: 'daylight', hour: Number(q.get('hour') ?? 17.5) };
  }
  return { id, kind: 'fire', x: c.x, y: c.y, size: 0.6 };
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ background: 0x1a1320, antialias: false, roundPixels: true, resolution: window.devicePixelRatio || 1, autoDensity: true, resizeTo: window });
  document.body.appendChild(app.canvas);

  const map = await loadOfficeMap();
  const world = new Container();
  app.stage.addChild(world);
  const pave = new Graphics().rect(0, MAP_PX_H, WORLD_W, WORLD_H - MAP_PX_H).fill(0x8a8794);
  for (let x = 0; x < WORLD_W; x += 32) pave.rect(x, MAP_PX_H, 1, WORLD_H - MAP_PX_H).fill(0x77747f);
  world.addChild(pave);
  const root = map.getContainer();
  world.addChild(root);
  const sorted = map.getCharacterContainer();

  const fx = createFxView(app.renderer, sorted);
  root.addChildAt(fx.floor, root.getChildIndex(sorted));
  root.addChild(fx.air);
  app.stage.addChild(fx.screen);

  // People.
  const people: Person[] = [];
  const addPerson = (name: OfficeCharacterName, x: number, y: number, statuses: StatusKind[] = [], walk?: Person['walk']): Person => {
    const s = new Sprite(personTex(name));
    s.anchor.set(0.5, 1);
    sorted.addChild(s);
    const p: Person = { id: name, s, x, y, statuses, walk };
    people.push(p);
    return p;
  };
  const effects: EffectInstance[] = [];
  let focus = roomCentrePx(ROOM);
  let zoomWant = ZOOM;

  const roomPeople = (room: RoomId, n: number): void => {
    const tiles = walkableTilesIn(room);
    for (let i = 0; i < n && tiles.length; i++) {
      const t = tiles[Math.floor(((i * 7 + 3) % tiles.length))];
      addPerson(NAMES[(i * 3 + 1) % NAMES.length], t.x * TILE + 8, t.y * TILE + 16, [], i === 0 ? { x0: t.x * TILE - 8, x1: t.x * TILE + 40, sp: 14 } : undefined);
    }
  };

  let cueTimer = 0;
  let cueFn: (() => void) | null = null;

  if (VIEW === 'effect') {
    roomPeople(ROOM === 'outside' ? 'bullpen' : ROOM, 4);
    effects.push(defaults(KIND, ROOM));
    if (KIND === 'dark') effects.push({ id: 'l1', kind: 'light', x: focus.x + 20, y: focus.y + 10, radius: 34, color: 0xffe0a0 }, { id: 'l2', kind: 'light', x: focus.x - 60, y: focus.y + 30, radius: 22, color: 0xa8d8ff });
    if (KIND === 'beam') focus = effects[0].kind === 'beam' ? { x: (effects[0].from.x + effects[0].to.x) / 2, y: (effects[0].from.y + effects[0].to.y) / 2 } : focus;
    if (KIND === 'barrier') focus = { x: 13 * TILE + 8, y: 8 * TILE };
  } else if (VIEW === 'cue') {
    roomPeople(ROOM, 4);
    const c = roomCentrePx(ROOM);
    const target = people[1] ?? people[0];
    cueFn = () => {
      const k = KIND;
      const x = c.x + 10, y = c.y + 10;
      let cue: FxCue;
      switch (k) {
        case 'lightning': cue = { kind: 'lightning', x, y }; break;
        case 'flash': cue = { kind: 'flash', color: 0xffffff, alpha: 0.6, ms: 300 }; break;
        case 'explosion': cue = { kind: 'explosion', x, y, size: Number(q.get('size') ?? 1) }; break;
        case 'poof': cue = { kind: 'poof', x, y }; break;
        case 'splash': cue = { kind: 'splash', x, y }; break;
        case 'sparks': cue = { kind: 'sparks', x, y }; break;
        case 'impact': cue = { kind: 'impact', x, y, power: 1 }; break;
        case 'burst': cue = { kind: 'burst', what: (q.get('what') ?? 'confetti') as BurstKind, x, y: y - 20 }; break;
        case 'emote': cue = { kind: 'emote', who: target.id, icon: (q.get('icon') ?? 'alert') as EmoteIcon }; break;
        case 'floatText': cue = { kind: 'floatText', x, y: y - 30, text: q.get('text') ?? '+$100', color: 0x8fd17c }; break;
        case 'ring': cue = { kind: 'ring', x, y, color: 0xffd93d }; break;
        case 'swirl': cue = { kind: 'swirl', x, y: y - 16, color: 0xb48cf0 }; break;
        default: cue = { kind: 'zap', from: { x: x - 50, y: y - 20 }, to: { x, y: y - 12 }, color: 0x8fd8ff };
      }
      fx.cue(cue);
    };
  } else if (VIEW === 'statuses') {
    const kinds: StatusKind[] = ['love', 'rage', 'truth', 'paranoid', 'caffeinated', 'sleepy', 'asleep', 'swapped', 'crowned', 'party', 'rich', 'spooked', 'abducted', 'stung', 'dizzy', 'sooty', 'frizzy', 'frozen', 'tiny', 'giant', 'wet'];
    kinds.forEach((k, i) => {
      const row = i < 11 ? 0 : 1;
      const col = row ? i - 11 : i;
      addPerson(NAMES[i % NAMES.length], 2 * TILE + 8 + col * 28 + row * 14, (row ? 20 : 15) * TILE, [k]);
    });
    focus = { x: 2 * TILE + 150, y: 17 * TILE };
    zoomWant = ZOOM || 2.2;
    // tiny/giant only sparkle when they start: re-trigger them now and then.
    cueFn = () => {
      for (const p of people) if (p.statuses[0] === 'tiny' || p.statuses[0] === 'giant') {
        const k = p.statuses[0];
        p.statuses = [];
        setTimeout(() => { p.statuses = [k]; }, 100);
      }
    };
  } else if (VIEW === 'emotes') {
    EMOTE_ICONS.forEach((icon, i) => {
      const col = i % 11, row = Math.floor(i / 11);
      addPerson(NAMES[i % NAMES.length], 2 * TILE + 8 + col * 26 + row * 13, (row ? 20 : 15) * TILE);
      // Big copies across the top of the screen, labelled.
      const big = new Sprite(emoteTex(icon));
      big.scale.set(4);
      big.anchor.set(0.5, 1);
      big.position.set(30 + col * 78, 70 + row * 92);
      const lab = new Sprite(textPix(icon, 0xffffff).toTexture());
      lab.scale.set(2);
      lab.anchor.set(0.5, 0);
      lab.position.set(30 + col * 78, 74 + row * 92);
      app.stage.addChild(big, lab);
    });
    focus = { x: 2 * TILE + 150, y: 18 * TILE };
    zoomWant = ZOOM || 2.6;
    let k = 0;
    cueFn = () => {
      people.forEach((p, i) => fx.cue({ kind: 'emote', who: p.id, icon: EMOTE_ICONS[(i + k) % EMOTE_ICONS.length] }));
      k += 0;
    };
  } else if (VIEW === 'bursts') {
    const kinds = Object.keys(BURSTS) as BurstKind[];
    const pts = kinds.map((k, i) => ({ k, x: 2 * TILE + (i % 9) * 40 + 20, y: (i < 9 ? 15 : 20) * TILE - 10 }));
    for (const pt of pts) {
      const lab = new Sprite(textPix(pt.k, 0xffffff).toTexture());
      lab.anchor.set(0.5, 0);
      lab.position.set(pt.x, pt.y + 4);
      root.addChild(lab);
    }
    focus = { x: 2 * TILE + 180, y: 17 * TILE };
    zoomWant = ZOOM || 2.4;
    cueFn = () => { for (const pt of pts) fx.cue({ kind: 'burst', what: pt.k, x: pt.x, y: pt.y }); };
  } else if (VIEW === 'all') {
    for (let i = 0; i < 15; i++) {
      const d = deskOf(NAMES[i] as never);
      addPerson(NAMES[i], d.tile.x * TILE + 8, d.tile.y * TILE + 16, i % 4 === 0 ? ['love'] : i % 5 === 1 ? ['asleep'] : i % 7 === 2 ? ['dizzy'] : []);
    }
    const k = roomRectPx('kitchen');
    effects.push(
      { id: 'f1', kind: 'fire', x: 12 * TILE, y: 17 * TILE, size: 0.9 },
      { id: 's1', kind: 'smoke', room: 'meeting', density: 0.6 },
      { id: 'fl', kind: 'flood', room: 'kitchen', level: 0.7, spoutX: k.x + 40, spoutY: k.y + 40, spraying: true },
      { id: 'u1', kind: 'ufo', x: 22 * TILE, y: 8 * TILE, height: 50, beam: 1 },
      { id: 'g1', kind: 'ghost', x: 4 * TILE, y: 6 * TILE, facing: 'right', alpha: 1, mood: 'drift' },
      { id: 'r1', kind: 'creature', species: 'raccoon', x: 29 * TILE, y: 15 * TILE, facing: 'left', anim: 'run', carrying: true },
      { id: 'b1', kind: 'bees', x: 29 * TILE, y: 6 * TILE, spread: 18, count: 10 },
      { id: 'p1', kind: 'item', item: 'pizzaBoxes', x: 27 * TILE, y: 19 * TILE },
      { id: 'c1', kind: 'rain', room: 'boss', what: 'cash', rate: 0.6 },
      { id: 'e1', kind: 'emoji', emoji: '🦖', x: 18 * TILE, y: 20 * TILE, size: 28, bob: true },
      { id: 'd1', kind: 'daylight', hour: 16.8 }
    );
    zoomWant = 0;
    cueFn = () => {
      fx.cue({ kind: 'emote', who: NAMES[Math.floor(Math.random() * 15)], icon: EMOTE_ICONS[Math.floor(Math.random() * EMOTE_ICONS.length)] });
    };
  }

  // Camera: fit the map, or zoom on the focus.
  const fit = (): void => {
    const w = app.screen.width, h = app.screen.height;
    const z = zoomWant > 0 ? zoomWant : Math.min(w / WORLD_W, h / MAP_PX_H);
    world.scale.set(z);
    if (zoomWant > 0) {
      world.x = Math.round(w / 2 - focus.x * z);
      world.y = Math.round(h / 2 - focus.y * z);
    } else {
      world.x = Math.round((w - WORLD_W * z) / 2);
      world.y = Math.round((h - MAP_PX_H * z) / 2);
    }
  };
  fit();
  window.addEventListener('resize', fit);

  const fxPeople: FxPerson[] = [];
  let paused = false;
  let ready = 0;
  const frameOf = () => {
    const z = world.scale.x;
    fxPeople.length = 0;
    for (const p of people) fxPeople.push({ id: p.id, x: p.x, y: p.y, headY: p.y - 32, scale: 1, visible: true, statuses: p.statuses });
    return {
      time: 0,
      people: fxPeople,
      view: { x0: -world.x / z, y0: -world.y / z, x1: (app.screen.width - world.x) / z, y1: (app.screen.height - world.y) / z, zoom: z },
      screenW: app.screen.width,
      screenH: app.screen.height
    };
  };
  const advance = (dt: number): void => {
    for (const p of people) {
      if (p.walk) {
        p.x += p.walk.sp * dt;
        if (p.x > p.walk.x1 || p.x < p.walk.x0) p.walk.sp = -p.walk.sp;
      }
      p.s.position.set(Math.round(p.x), Math.round(p.y));
      p.s.zIndex = p.y;
    }
    if (cueFn) {
      cueTimer -= dt;
      if (cueTimer <= 0) { cueTimer = VIEW === 'emotes' ? 2.2 : VIEW === 'statuses' ? 3 : 1.6; cueFn(); }
    }
    fx.sync(effects);
    fx.update(dt, frameOf());
  };
  if (PRESTEP > 0) for (let t = 0; t < PRESTEP; t += 1 / 30) advance(1 / 30);
  app.ticker.add((tk) => {
    if (!paused) advance(Math.min(0.1, tk.deltaMS / 1000));
    if (++ready === 3) (window as unknown as { __ready: boolean }).__ready = true;
  });

  const h = {
    fx,
    effects,
    add(inst: EffectInstance) { effects.push(inst); },
    patch(id: string, part: Partial<EffectInstance>) {
      const i = effects.findIndex((e) => e.id === id);
      if (i >= 0) effects[i] = { ...effects[i], ...part } as EffectInstance;
    },
    remove(id: string) {
      const i = effects.findIndex((e) => e.id === id);
      if (i >= 0) effects.splice(i, 1);
    },
    clear() { effects.length = 0; },
    cue(c: FxCue) { fx.cue(c); },
    step(seconds: number) { for (let t = 0; t < seconds; t += 1 / 30) advance(1 / 30); },
    pause(p = true) { paused = p; },
    people,
    setStatus(id: string, s: StatusKind[]) { const p = people.find((x) => x.id === id); if (p) p.statuses = s; },
    zoom(z: number, x?: number, y?: number) { zoomWant = z; if (x !== undefined && y !== undefined) focus = { x, y }; fit(); }
  };
  (window as unknown as { __h: typeof h }).__h = h;
}

main().catch((e) => {
  console.error(e);
  document.body.textContent = String(e);
});
