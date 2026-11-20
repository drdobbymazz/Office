// Dev harness for the actors (harness/actors.html).
//
//   ?view=lineup&zoom=4                 all staff + visitors standing, labelled
//   ?view=emotions&id=michael           one person in all 20 emotions at 0.5 and 1.0
//   ?view=anims&id=dwight&set=0         one person in every anim (set = facing: 0 down, 1 right, 2 up, 3 left)
//   ?view=one&id=pam&anim=held&emotion=scared&zoom=6   one big figure (also: facing, seated, intensity,
//                                        prop, headgear, status=wet,sooty, talking=1, selected=1, scale, variant, lift)
//   ?view=desks[&zoom=3&cx=..&cy=..]    everyone seated at their desk on the real map
//   ?view=portraits                     portraitUrl for everyone in several emotions
//   ?view=props&id=jim                  every held prop and headgear
//   ?view=status&id=jim                 every status mark
// Common: paused=1 (no ticker), t=<seconds> (pre-advance), bg=<hex>.
// win.__h.step(seconds), window.__h.set(patch), window.__ready.

import { Application, Container, Graphics, Text } from 'pixi.js';
import { ANIMS, CAST_IDS, EMOTIONS, type AnimId, type Dir, type EmotionId, type HeldProp, type Headgear, type StatusKind } from '@/game/core/types';
import { deskOf, feetOf } from '@/game/core/world';
import type { PersonState } from '@/game/view/api';
import { loadOfficeMap } from '../mapLoader';
import { createActorView, portraitUrl } from './index';
import { PROPS, HEADGEAR } from './art';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'lineup';
const DIRS: Dir[] = ['down', 'right', 'up', 'left'];
const PEOPLE = [...CAST_IDS, 'visitor:inspector', 'visitor:courier'] as string[];

interface Harness { step(s: number): void; set(p: Partial<PersonState>): void; actors: unknown[] }
const win = window as unknown as { __ready?: boolean; __h?: Harness };

function person(id: string, over: Partial<PersonState> = {}): PersonState {
  return {
    id, sprite: id, x: 0, y: 0, lift: 0, facing: 'down', anim: 'idle', variant: 0, seated: false, speed: 0, vx: 0, vy: 0,
    emotion: 'neutral', intensity: 0, talking: false, scale: 1, alpha: 1, visible: true, prop: null, headgear: null,
    statuses: [], selected: false, ...over
  };
}

interface Slot { st: PersonState; actor: ReturnType<typeof createActorView>; label?: string; drive?: (st: PersonState, t: number) => void }

/** Per-anim harness motion, so walking walks and held swings. */
function driverFor(anim: AnimId): ((st: PersonState, t: number) => void) | undefined {
  switch (anim) {
    case 'walk': return (st) => { st.speed = 45; };
    case 'run': case 'panic': return (st) => { st.speed = 100; };
    case 'carry': return (st) => { st.speed = 40; };
    case 'held': return (st, t) => { st.lift = 14; st.vx = Math.sin(t * 2.2) * 260; };
    case 'float': return (st, t) => { st.lift = 10 + Math.sin(t) * 3; };
    case 'beamUp': return (st, t) => { st.lift = (t * 8) % 30; };
    case 'fall': return (st, t) => { st.lift = 24 - ((t * 30) % 24); };
    default: return undefined;
  }
}

async function main(): Promise<void> {
  if (view === 'portraits') return portraits();
  const app = new Application();
  const bg = parseInt(q.get('bg') ?? (view === 'desks' ? '1a1420' : 'efe4cc'), 16);
  await app.init({ resizeTo: window, background: bg, antialias: false, resolution: window.devicePixelRatio || 1, autoDensity: true });
  document.getElementById('stage')!.appendChild(app.canvas);
  const world = new Container();
  const floor = new Container();
  const sorted = new Container();
  sorted.sortableChildren = true;
  const labels = new Container();
  app.stage.addChild(world, labels);
  world.addChild(floor, sorted);

  const slots: Slot[] = [];
  const add = (st: PersonState, label?: string, drive?: Slot['drive']) => {
    const actor = createActorView(st.id, st.sprite);
    floor.addChild(actor.shadow);
    sorted.addChild(actor.container);
    slots.push({ st, actor, label, drive });
    return actor;
  };
  const W = app.screen.width, H = app.screen.height;
  let zoom = Number(q.get('zoom') ?? 0);
  const id = q.get('id') ?? 'michael';
  const emotion = (q.get('emotion') ?? 'neutral') as EmotionId;
  const intensity = Number(q.get('intensity') ?? (emotion === 'neutral' ? 0 : 0.9));
  const common = (): Partial<PersonState> => ({
    emotion, intensity,
    facing: (q.get('facing') ?? 'down') as Dir,
    seated: q.get('seated') === '1',
    prop: (q.get('prop') as HeldProp) || null,
    headgear: (q.get('headgear') as Headgear) || null,
    statuses: (q.get('status') ? q.get('status')!.split(',') : []) as StatusKind[],
    talking: q.get('talking') === '1',
    selected: q.get('selected') === '1',
    variant: Number(q.get('variant') ?? 0),
    scale: Number(q.get('scale') ?? 1),
    lift: Number(q.get('lift') ?? 0)
  });

  const grid = (n: number, cols: number, cellW: number, cellH: number, z: number) => {
    const rows = Math.ceil(n / cols);
    const ox = (W / z - cols * cellW) / 2, oy = (H / z - rows * cellH) / 2;
    return (i: number) => ({ x: ox + (i % cols) * cellW + cellW / 2, y: oy + Math.floor(i / cols) * cellH + cellH - 8 });
  };

  if (view === 'lineup') {
    zoom = zoom || 4;
    const cols = zoom >= 3 ? 9 : 17;
    const pos = grid(PEOPLE.length, cols, 24, 48, zoom);
    PEOPLE.forEach((p, i) => { const { x, y } = pos(i); add(person(p, { ...common(), x, y, variant: i }), p.replace('visitor:', '')); });
  } else if (view === 'emotions') {
    zoom = zoom || 3;
    const list: [EmotionId, number][] = [];
    for (const e of EMOTIONS) { list.push([e, 0.5]); list.push([e, 1]); }
    const lv = q.get('levels');
    const items = lv === '3' ? EMOTIONS.flatMap((e) => [[e, 0.25], [e, 0.6], [e, 1]] as [EmotionId, number][]) : list;
    const cols = lv === '3' ? 12 : 10;
    const pos = grid(items.length, cols, 24, 44, zoom);
    items.forEach(([e, k], i) => {
      const { x, y } = pos(i);
      add(person(id, { ...common(), id: `${id}${i}`, sprite: id, x, y, emotion: e, intensity: k }), `${e.slice(0, 7)} ${k}`);
    });
  } else if (view === 'anims') {
    zoom = zoom || 2.4;
    const facing = DIRS[Number(q.get('set') ?? 0) % 4];
    const list = (q.get('list') ? q.get('list')!.split(',') : ANIMS) as AnimId[];
    const cols = Number(q.get('cols') ?? 10);
    const pos = grid(list.length, cols, 36, 52, zoom);
    list.forEach((a, i) => {
      const { x, y } = pos(i);
      add(person(id, { ...common(), id: `${id}${i}`, sprite: id, x, y, anim: a, facing, variant: Number(q.get('variant') ?? i) }), a, driverFor(a));
    });
  } else if (view === 'one') {
    zoom = zoom || 6;
    const anim = (q.get('anim') ?? 'idle') as AnimId;
    add(person(id, { ...common(), x: W / zoom / 2, y: H / zoom / 2 + 18, anim }), undefined, driverFor(anim));
  } else if (view === 'props' || view === 'status') {
    zoom = zoom || 3.5;
    const list: Partial<PersonState>[] = view === 'props'
      ? [...PROPS.map((p) => ({ prop: p as HeldProp, anim: 'idle' as AnimId })), ...HEADGEAR.map((h) => ({ headgear: h as Headgear })),
        { prop: 'box', anim: 'carry' }, { prop: 'cake', anim: 'carry' }, { prop: 'pizza', anim: 'carry' }, { prop: 'mop', anim: 'mop' }, { prop: 'extinguisher', anim: 'extinguish' }, { prop: 'coffee', anim: 'drink' }]
      : (['wet', 'sooty', 'frizzy', 'asleep', 'dizzy', 'stung', 'love', 'frozen'] as StatusKind[]).map((s) => ({ statuses: [s] }));
    const pos = grid(list.length, 9, 30, 52, zoom);
    list.forEach((o, i) => {
      const { x, y } = pos(i);
      const tag = o.prop ? `${o.prop}${o.anim && o.anim !== 'idle' ? '/' + o.anim : ''}` : o.headgear ?? (o.statuses ? o.statuses[0] : '');
      add(person(id, { ...common(), id: `${id}${i}`, sprite: id, x, y, ...o }), tag, o.anim ? driverFor(o.anim) : undefined);
    });
  } else if (view === 'desks') {
    const map = await loadOfficeMap();
    world.removeChildren();
    world.addChild(map.getContainer());
    const fl = new Container();
    map.getContainer().addChildAt(fl, map.getContainer().children.length - 1);
    const chars = map.getCharacterContainer();
    const anims: AnimId[] = ['type', 'type', 'phone', 'drink', 'talk', 'think', 'sleep', 'type', 'eat', 'laugh', 'type', 'facepalm', 'type', 'nod', 'type'];
    CAST_IDS.forEach((c, i) => {
      const a = deskOf(c);
      const f = feetOf(a.tile);
      const st = person(c, { ...common(), x: f.x, y: f.y, facing: a.face, seated: true, anim: (q.get('anim') as AnimId) || anims[i], variant: i, emotion: q.get('emotion') ? emotion : 'neutral' });
      const actor = createActorView(st.id, st.sprite);
      fl.addChild(actor.shadow); chars.addChild(actor.container);
      slots.push({ st, actor });
    });
    // visitors standing in the bullpen aisle
    for (const [v, tx] of [['visitor:inspector', 12], ['visitor:courier', 16]] as const) {
      const f = feetOf({ x: tx, y: 15 });
      const st = person(v, { x: f.x, y: f.y, anim: 'idle' });
      const actor = createActorView(st.id, st.sprite);
      fl.addChild(actor.shadow); chars.addChild(actor.container);
      slots.push({ st, actor });
    }
    const mapW = map.width * map.tileSize, mapH = map.height * map.tileSize;
    const fit = Math.min(W / mapW, H / mapH);
    zoom = zoom || fit;
    const cx = Number(q.get('cx') ?? mapW / 2), cy = Number(q.get('cy') ?? mapH / 2);
    world.scale.set(zoom);
    world.position.set(Math.round(W / 2 - cx * zoom), Math.round(H / 2 - cy * zoom));
  }
  if (view !== 'desks') world.scale.set(zoom);

  // labels in screen space
  for (const s of slots) {
    if (!s.label) continue;
    const t = new Text({ text: s.label, style: { fontFamily: 'monospace', fontSize: 10, fill: 0x3a2e3e } });
    t.resolution = 2;
    t.anchor.set(0.5, 0);
    t.position.set(s.st.x * zoom, s.st.y * zoom + 4);
    labels.addChild(t);
  }
  if (q.get('grid') === '1') {
    const g = new Graphics();
    for (const s of slots) g.rect(s.st.x - 9, s.st.y - 32, 18, 32).stroke({ width: 1 / zoom, color: 0xff0000, alpha: 0.4 });
    world.addChild(g);
  }

  let time = 0;
  const step = (dt: number) => {
    time += dt;
    for (const s of slots) { s.drive?.(s.st, time); s.actor.update(dt, s.st); }
  };
  win.__h = {
    step(seconds: number) { let left = seconds; while (left > 1e-6) { const d = Math.min(1 / 60, left); step(d); left -= d; } },
    set(p: Partial<PersonState>) { for (const s of slots) Object.assign(s.st, p); },
    actors: slots.map((s) => s.actor)
  };
  win.__h.step(Number(q.get('t') ?? 0.02));
  if (q.get('paused') !== '1') app.ticker.add((tk) => step(tk.deltaMS / 1000));
  requestAnimationFrame(() => requestAnimationFrame(() => { win.__ready = true; }));
}

function portraits(): void {
  const root = document.getElementById('portraits')!;
  root.style.display = 'flex';
  document.getElementById('stage')!.style.display = 'none';
  const emos = (q.get('emotions') ? q.get('emotions')!.split(',') : ['neutral', 'happy', 'angry', 'sad', 'scared', 'surprised', 'smug', 'love', 'mischievous', 'embarrassed']) as EmotionId[];
  const scale = Number(q.get('scale') ?? 2);
  for (const p of PEOPLE) {
    for (const e of emos) {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = portraitUrl(p, e, scale);
      fig.appendChild(img);
      const cap = document.createElement('figcaption');
      cap.textContent = `${p.replace('visitor:', '').slice(0, 7)} ${e.slice(0, 5)}`;
      fig.appendChild(cap);
      root.appendChild(fig);
    }
  }
  win.__h = { step() {}, set() {}, actors: [] };
  win.__ready = true;
}

void main();
