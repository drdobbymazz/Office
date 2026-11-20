// Dev-only: the game floor, camera and touch input with stand-in sprites and no effects.
import { Container, Graphics } from 'pixi.js';
import { GameFloor } from './GameFloor';
import { FloorInput } from './input';
import { CharacterSprite } from '../CharacterSprite';
import { getCastFrames, type OfficeCharacterName } from '../cast';
import type { ActorView, FxView, PersonState, RenderFrame } from '@/game/view/api';
import { CAST_IDS, type CharId, type Vec } from '@/game/core/types';
import { deskOf, feetOf, nearestWalkable, tileAt } from '@/game/core/world';

const frames = new Map<string, Awaited<ReturnType<typeof getCastFrames>>>();
for (const id of CAST_IDS) frames.set(id, await getCastFrames(id as OfficeCharacterName));

function stubActor(id: CharId, sprite: string): ActorView {
  const cs = new CharacterSprite(frames.get(sprite) ?? frames.get('jim')!);
  const shadow = new Container();
  const sg = new Graphics().rect(-5, -2, 10, 3).fill({ color: 0x1a1320, alpha: 0.3 });
  shadow.addChild(sg);
  let s: PersonState | null = null;
  return {
    id, container: cs.container, shadow,
    update(_dt, st) {
      s = st;
      cs.setAnimation(st.speed > 1 ? 'walk' : 'idle', st.facing);
      cs.setPosition(st.x, st.y - st.lift);
      cs.setSeatedCrop(st.seated ? (st.facing === 'down' ? 8 : 2) : 0);
      cs.container.zIndex = st.y + (st.lift > 0 ? 1000 : 0);
      cs.container.visible = st.visible;
      shadow.position.set(st.x, st.y);
      shadow.visible = st.visible;
    },
    headTop: () => ({ x: s?.x ?? 0, y: (s?.y ?? 0) - (s?.lift ?? 0) - 34 }),
    chest: () => ({ x: s?.x ?? 0, y: (s?.y ?? 0) - (s?.lift ?? 0) - 14 }),
    hitBox: () => ({ x: (s?.x ?? 0) - 9, y: (s?.y ?? 0) - (s?.lift ?? 0) - 34, w: 18, h: 34 }),
    destroy() { cs.destroy(); shadow.destroy({ children: true }); }
  };
}
const stubFx = (): FxView => ({ floor: new Container(), air: new Container(), screen: new Container(), sync() {}, cue() {}, update() {}, clear() {}, destroy() {} });

const host = document.getElementById('host')!;
const floor = await GameFloor.create(host, { createActorView: stubActor, createFxView: stubFx });
const params = new URLSearchParams(location.search);
const inset = Number(params.get('panel') ?? 0);
if (inset) floor.setInsets({ left: 0, right: inset, top: 0, bottom: 0 });

const people: PersonState[] = CAST_IDS.map((id) => {
  const d = deskOf(id);
  const f = feetOf(d.tile);
  return {
    id, sprite: id, x: f.x, y: f.y, lift: 0, facing: d.face, anim: 'type', variant: 0, seated: true, speed: 0, vx: 0, vy: 0,
    emotion: 'neutral', intensity: 0.3, talking: false, scale: 1, alpha: 1, visible: true, prop: null, headgear: null, statuses: [], selected: false
  };
});
// Two walkers.
const walkers = [people[1], people[9]];
for (const w of walkers) { w.seated = false; w.anim = 'walk'; w.y = feetOf({ x: 4, y: 15 }).y; }

const frame: RenderFrame = { time: 0, people, effects: [], speeches: [], frozen: false };
let held: PersonState | null = null;
const log: string[] = [];
const input = new FloorInput(floor, {
  tapPerson: (who) => { log.push(`tap ${who}`); floor.camera.followPoint(() => floor.personWorld(who)); },
  tapEmpty: () => { log.push('tapEmpty'); floor.camera.stopFollowing(); },
  pickUp: (who) => { held = people.find((p) => p.id === who) ?? null; if (held) { held.seated = false; held.lift = 22; } log.push(`pickUp ${who}`); return !!held; },
  dragTo: (w: Vec) => { if (held) { held.x = w.x; held.y = w.y + 22; } },
  drop: (vx, vy) => {
    log.push(`drop ${Math.round(vx)},${Math.round(vy)}`);
    if (held) { const t = nearestWalkable(tileAt(held.x, held.y)) ?? { x: 16, y: 20 }; const f = feetOf(t); held.x = f.x; held.y = f.y; held.lift = 0; held = null; }
  },
  targeting: () => (params.get('target') as 'room' | null) ?? 'none',
  pickRoom: (room) => log.push(`room ${room}`),
  pickPerson: (who) => log.push(`person ${who}`),
  touched: () => {}
});
if (params.get('target') === 'room') floor.setTargetMode('room', 'kitchen');

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frame.time += dt;
  walkers.forEach((w, i) => {
    if (w === held) return;
    const x = (12 + Math.sin(frame.time * 0.4 + i * 2) * 10) * 16;
    w.speed = 48; w.facing = Math.cos(frame.time * 0.4 + i * 2) > 0 ? 'right' : 'left'; w.x = x; w.y = feetOf({ x: 0, y: i === 0 ? 15 : 14 }).y;
  });
  input.update(dt);
  floor.render(frame, dt, dt);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
Object.assign(window, { __ready: true, __h: { floor, input, log, people } });
