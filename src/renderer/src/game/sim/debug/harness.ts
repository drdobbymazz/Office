// A plain canvas-2D debug view of the simulation (no Pixi): the walkable grid,
// people as labelled dots with what they are doing, effects as text.
//
// URL parameters
//   seed=7          RNG seed
//   speed=4         game speed multiplier
//   day=10          real minutes per office day
//   skip=0          sim seconds to run before the first draw
//   chaos=fire:kitchen@30,smite:jim@50,pizza@70   events at sim times (s since load)
//   director=1      a pretend director that plays canned scenes (0 to turn off)
//   paused=1        start paused (step with __h.step(seconds))
//
// window.__h = { sim, step(seconds), chaos(id, target), draw() }; window.__ready once drawn.

import { Bus, type GameEvents } from '@/game/core/bus';
import { GRID_H, GRID_W, ROOMS, TILE, WORLD_H, WORLD_W, isWalkable } from '@/game/core/world';
import { CAST, colorOf } from '@/game/core/cast';
import { formatClock, type ChaosId, type ChaosTarget, type TargetRoomId } from '@/game/core/types';
import type { SceneHandle } from '@/game/core/simApi';
import type { Reflexes } from '@/game/brain/api';
import { createSim, type Sim } from '@/game/sim';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => {
  const v = Number(q.get(k));
  return q.has(k) && Number.isFinite(v) ? v : d;
};
const seed = num('seed', 7);
let speed = num('speed', 4);
const dayMinutes = num('day', 10);
const useDirector = q.get('director') !== '0';
let paused = q.get('paused') === '1';

const reflexes: Reflexes = {
  bark: (who, kind) => {
    const lines: Record<string, string> = {
      scared: 'Aaah!', startled: 'Whoa!', angry: 'Hey!', delighted: 'Yes!', pickedUp: 'Put me down!', dropped: 'Oof.',
      poked: 'Ow!', zapped: 'My hair!', greeting: 'Morning.', goodbye: 'Night, all.', hurt: 'Ouch.', dizzy: 'Room is spinning.', wet: 'I am soaked.'
    };
    return lines[kind] ?? `(${kind})`;
  },
  chaosBark: (who, chaos) => (chaos === 'fire' ? 'FIRE! Everybody out!' : chaos === 'pizza' ? 'Pizza!' : 'What was that?')
};

const bus = new Bus<GameEvents>();
const sim: Sim = createSim({ bus, reflexes, seed, dayMinutes, sandbox: true });
const feed: string[] = [];
bus.on('feed', (f) => {
  feed.push(`${formatClock(f.clock)} ${f.who ? `${CAST[f.who as keyof typeof CAST]?.name ?? f.who}: ` : ''}${f.text}`);
  if (feed.length > 9) feed.shift();
});
bus.on('dayEnd', () => {
  setTimeout(() => sim.beginDay(), 0);
});

// ── scheduled events ──
const schedule: { at: number; id: ChaosId; target: ChaosTarget; done: boolean }[] = [];
for (const part of (q.get('chaos') ?? '').split(',').filter(Boolean)) {
  const m = part.match(/^(\w+)(?::([\w:]+))?@(\d+(?:\.\d+)?)$/);
  if (!m) continue;
  const [, id, arg, at] = m;
  const target: ChaosTarget = {};
  if (arg) {
    if (ROOMS.some((r) => r.id === arg)) target.room = arg as TargetRoomId;
    else target.who = arg;
  }
  schedule.push({ at: Number(at), id: id as ChaosId, target, done: false });
}

// ── a pretend director so scenes can be seen ──
const CANNED = [
  'Did you hear about the stapler?', 'Not now, I am busy.', 'This office is ridiculous.', 'I am going to need a coffee.',
  'Who keeps moving my chair?', 'That is exactly what I said.', 'Okay, I will see you at the meeting.'
];
const running: { h: SceneHandle; lines: number; next: number }[] = [];
let directorT = 0;
let sceneN = 0;
function director(): void {
  if (!useDirector) return;
  if (sim.time >= directorT) {
    directorT = sim.time + 3;
    for (const a of sim.takeSceneAsks()) {
      if (running.length >= 2) break;
      const people = a.people ?? sim.peopleIn(a.room ?? 'bullpen').filter((p) => p.available).slice(0, 2).map((p) => p.id);
      if (!people.length) continue;
      const h = sim.openScene({ id: `h${++sceneN}`, people, gather: true });
      if (h) running.push({ h, lines: 2 + (sceneN % 3), next: sim.time + 0.5 });
    }
  }
  for (let i = running.length - 1; i >= 0; i--) {
    const s = running[i];
    if (!s.h.alive) {
      running.splice(i, 1);
      continue;
    }
    if (!s.h.ready || sim.time < s.next) continue;
    if (s.lines-- <= 0) {
      s.h.close();
      running.splice(i, 1);
      continue;
    }
    const who = s.h.people[(s.lines + sceneN) % s.h.people.length];
    const sp = s.h.line({ who, say: CANNED[(sceneN + s.lines) % CANNED.length], feel: 'amused', to: null, act: s.lines % 2 ? 'point' : 'none' });
    s.next = sim.time + sp.durationMs / 1000 + 0.3;
  }
}

let simT = 0;
function step(seconds: number): void {
  let left = seconds;
  while (left > 1e-9) {
    const dt = Math.min(0.05, left);
    sim.update(dt);
    simT += dt;
    left -= dt;
    for (const s of schedule) {
      if (!s.done && simT >= s.at) {
        s.done = true;
        const r = sim.startChaos(s.id, s.target);
        if (r) feed.push(`(${s.id} refused: ${r})`);
      }
    }
    director();
  }
}

// ── drawing ──
const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
let scale = 1;
let ox = 0;
let oy = 0;
const PANEL = 260;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = Math.min((innerWidth - PANEL) / WORLD_W, innerHeight / WORLD_H);
  ox = 0;
  oy = Math.max(0, (innerHeight - WORLD_H * scale) / 2);
}
addEventListener('resize', resize);
resize();

const ROOM_TINT: Record<string, string> = {
  boss: '#3b3550', meeting: '#43354a', annex: '#36423f', accounts: '#3a4436', bullpen: '#33394a', kitchen: '#4a3e33', outside: '#2b2b30'
};
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

function draw(): void {
  ctx.fillStyle = '#15121b';
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  // Grid.
  const blocked = new Set<string>();
  for (const p of sim.debugPeople()) void p;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (isWalkable(x, y)) {
        const r = ROOMS.find((rm) => x >= rm.rect.x && x < rm.rect.x + rm.rect.w && y >= rm.rect.y && y < rm.rect.y + rm.rect.h);
        ctx.fillStyle = r ? ROOM_TINT[r.id] : '#30303a';
        ctx.fillRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
      } else {
        ctx.fillStyle = '#0d0b10';
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
  void blocked;
  // Room names.
  ctx.font = '7px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (const r of ROOMS) ctx.fillText(r.name, r.rect.x * TILE + 2, r.rect.y * TILE + 8);
  // Effects on the floor.
  for (const e of sim.frame().effects) {
    if (e.kind === 'fire') {
      ctx.fillStyle = `rgba(255,${120 + Math.floor(Math.random() * 60)},40,0.85)`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 4 + e.size * 18, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'item') {
      ctx.fillStyle = e.item === 'scorch' ? 'rgba(0,0,0,0.6)' : '#e0b050';
      ctx.fillRect(e.x - 5, e.y - 5, 10, 10);
    } else if (e.kind === 'smoke' || e.kind === 'sprinklers') {
      const r = ROOMS.find((rm) => rm.id === e.room);
      if (r) {
        ctx.fillStyle = e.kind === 'smoke' ? `rgba(120,120,120,${0.4 * e.density})` : 'rgba(80,140,255,0.15)';
        ctx.fillRect(r.rect.x * TILE, r.rect.y * TILE, r.rect.w * TILE, r.rect.h * TILE);
      }
    }
  }
  // Reserved tiles and walk paths.
  const dbg = sim.debugPeople();
  for (const d of dbg) {
    if (!d.present || !d.res) continue;
    ctx.strokeStyle = hex(colorOf(d.id));
    ctx.lineWidth = 0.75;
    ctx.strokeRect(d.res.x * TILE + 2, d.res.y * TILE + 2, TILE - 4, TILE - 4);
    if (d.walking) {
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - 3);
      ctx.lineTo(d.res.x * TILE + 8, d.res.y * TILE + 13);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // People.
  const frame = sim.frame();
  ctx.textAlign = 'center';
  for (const ps of frame.people) {
    const d = dbg.find((x) => x.id === ps.id);
    const y = ps.y - 4 - ps.lift;
    if (ps.lift > 0.5) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(ps.x, ps.y - 1, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = hex(colorOf(ps.id));
    ctx.strokeStyle = ps.seated ? '#ffffff' : '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ps.x, y, 4.5 * ps.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Facing tick.
    const fx = ps.facing === 'left' ? -1 : ps.facing === 'right' ? 1 : 0;
    const fy = ps.facing === 'up' ? -1 : ps.facing === 'down' ? 1 : 0;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(ps.x, y);
    ctx.lineTo(ps.x + fx * 6, y + fy * 6);
    ctx.stroke();
    ctx.font = 'bold 5px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(ps.sprite.startsWith('visitor:') ? ps.sprite.slice(8) : (CAST[ps.id as keyof typeof CAST]?.name ?? ps.id), ps.x, y - 7);
    ctx.font = '3.6px monospace';
    ctx.fillStyle = d && d.stuckFor > 5 ? '#ff7070' : '#d8d0a8';
    ctx.fillText(`${d?.doing ?? ''} [${ps.anim}${ps.emotion !== 'neutral' ? ` ${ps.emotion}` : ''}]`, ps.x, ps.y + 5);
  }
  // Speech.
  ctx.font = '4.5px monospace';
  for (const sp of frame.speeches) {
    const p = sim.person(sp.who);
    if (!p) continue;
    const text = sp.text.length > 40 ? `${sp.text.slice(0, 39)}...` : sp.text;
    const w = ctx.measureText(text).width + 4;
    ctx.fillStyle = 'rgba(255,250,230,0.95)';
    ctx.fillRect(p.x - w / 2, p.y - 30, w, 7);
    ctx.fillStyle = '#222';
    ctx.fillText(text, p.x, p.y - 25);
  }
  ctx.restore();

  // Side panel.
  const px = WORLD_W * scale + 10;
  ctx.textAlign = 'left';
  ctx.font = '12px monospace';
  ctx.fillStyle = '#f0e8c8';
  let ty = 18;
  const line = (s: string, color = '#f0e8c8'): void => {
    ctx.fillStyle = color;
    ctx.fillText(s, px, ty);
    ty += 15;
  };
  const m = sim.meters();
  line(`${sim.weekday} day ${sim.day}  ${formatClock(sim.clock)}  ${sim.phase}`);
  line(`speed ${speed}x ${paused ? '(paused)' : ''}`);
  line(`chaos ${m.chaos.toFixed(0)}  morale ${m.morale}  prod ${m.productivity}`);
  line(`stock ${m.stock.toFixed(2)} (${m.stockDelta >= 0 ? '+' : ''}${m.stockDelta})`);
  line(`incidents ${sim.incidentsToday}  free days ${sim.incidentFreeDays}`);
  const st = sim.debugStats;
  line(`rescues ${st.rescues} teleports ${st.teleports} forced ${st.forcedHome}`, '#a0a0b0');
  ty += 6;
  line('Active:', '#ffb070');
  for (const a of sim.activeChaos()) line(` ${a.label}`, '#ffb070');
  line('Effects:', '#80c0ff');
  for (const e of frame.effects) {
    const extra = e.kind === 'fire' ? ` size ${e.size.toFixed(2)}` : e.kind === 'smoke' ? ` ${e.room} ${e.density.toFixed(2)}` : e.kind === 'daylight' ? ` ${e.hour.toFixed(1)}h` : e.kind === 'item' ? ` ${e.item}` : '';
    line(` ${e.kind}${extra}`, '#80c0ff');
  }
  ty += 6;
  ctx.font = '10px monospace';
  for (const f of feed) {
    const s = f.length > 38 ? `${f.slice(0, 37)}...` : f;
    line(s, '#c8c0a0');
  }
}

// ── the hand: drag people about with the mouse ──
let lastMove = { x: 0, y: 0, t: 0, vx: 0, vy: 0 };
const toWorld = (e: PointerEvent): { x: number; y: number } => ({ x: (e.clientX - ox) / scale, y: (e.clientY - oy) / scale });
canvas.addEventListener('pointerdown', (e) => {
  const w = toWorld(e);
  const hit = sim.frame().people.find((p) => Math.hypot(p.x - w.x, p.y - 4 - p.lift - w.y) < 8);
  if (!hit) return;
  if (e.shiftKey) {
    sim.poke(hit.id);
    return;
  }
  sim.pickUp(hit.id);
  lastMove = { x: w.x, y: w.y, t: performance.now(), vx: 0, vy: 0 };
});
canvas.addEventListener('pointermove', (e) => {
  if (!sim.holding) return;
  const w = toWorld(e);
  const now = performance.now();
  const dt = Math.max(1, now - lastMove.t) / 1000;
  lastMove = { x: w.x, y: w.y, t: now, vx: (w.x - lastMove.x) / dt, vy: (w.y - lastMove.y) / dt };
  sim.dragTo(w.x, w.y);
});
canvas.addEventListener('pointerup', () => {
  if (sim.holding) sim.drop(lastMove.vx, lastMove.vy);
});
addEventListener('keydown', (e) => {
  if (e.key === ' ') paused = !paused;
  if (e.key === '+') speed = Math.min(16, speed * 2);
  if (e.key === '-') speed = Math.max(0.25, speed / 2);
});

step(num('skip', 0));
let last = performance.now();
function loop(now: number): void {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) step(real * speed);
  draw();
  requestAnimationFrame(loop);
}
draw();
requestAnimationFrame(loop);

declare global {
  interface Window {
    __ready?: boolean;
    __h?: Record<string, unknown>;
  }
}
window.__h = {
  sim,
  step: (s: number) => {
    step(s);
    draw();
  },
  chaos: (id: ChaosId, target: ChaosTarget) => sim.startChaos(id, target),
  pause: (p: boolean) => {
    paused = p;
  },
  draw
};
window.__ready = true;
void WORLD_H;
