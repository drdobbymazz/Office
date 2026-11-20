// The player's giant finger: picking people up, dragging them about, dropping
// and throwing them, and the little physics of a thrown person sliding,
// bouncing off walls, landing and getting up again.

import { WORLD_H, WORLD_W, feetOf, isWalkable, roomAt, tileAt } from '@/game/core/world';
import type { Tile } from '@/game/core/types';
import { glide } from './movement';
import { cancelJob, reserve, settleJob } from './jobs';
import type { AirState, Person } from './people';
import type { SimCore } from './core';

export const HOLD_LIFT = 22;
const GRAVITY = 900;
const THROW_MIN = 140;
const THROW_MAX = 650;
const MIN_X = 6;
const MAX_X = WORLD_W - 6;
const MIN_Y = 14;
const MAX_Y = WORLD_H - 1;

function newAir(mode: AirState['mode'], p: Person): AirState {
  return { mode, vx: 0, vy: 0, vz: 0, tx: p.x, ty: p.y, t: 0, airtime: 0, topSpeed: 0, hard: false, goal: null, ghost: false };
}

/** Take someone off the floor: whatever they were doing stops. */
export function liftOff(core: SimCore, p: Person, mode: AirState['mode']): AirState {
  core.scenes.breakFor(p, 'picked up');
  cancelJob(p);
  p.reaction = null;
  p.placed = false;
  reserve(core, p, null);
  const air = p.air && mode !== 'held' ? p.air : newAir(mode, p);
  air.mode = mode;
  air.t = 0;
  p.air = air;
  return air;
}

export function pickUp(core: SimCore, p: Person): boolean {
  if (!p.onFloor || p.held) return false;
  if (core.holdingId && core.holdingId !== p.id) {
    const other = core.byId(core.holdingId);
    if (other && other.held) drop(core, other, 0, 0);
  }
  const air = liftOff(core, p, 'held');
  air.tx = p.x;
  air.ty = p.y;
  air.vx = 0;
  air.vy = 0;
  air.vz = 0;
  core.holdingId = p.id;
  core.bus.emit('pickedUp', { who: p.id });
  core.sfx('pickup', p.x);
  core.bus.emit('buzz', { pattern: 12 });
  if (!p.frozen && !p.asleep) {
    core.bark(p.id, 'pickedUp');
    core.feel(p.id, p.def && p.def.temperament.nerve > 0.7 ? 'confused' : 'scared', 0.7, 3);
  }
  return true;
}

export function dragTo(core: SimCore, x: number, y: number): void {
  const p = core.holdingId ? core.byId(core.holdingId) : undefined;
  if (!p || !p.air || p.air.mode !== 'held') return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  p.air.tx = Math.max(MIN_X, Math.min(MAX_X, x));
  p.air.ty = Math.max(MIN_Y, Math.min(MAX_Y, y));
}

/** Let go. Slow: set down on the nearest free tile. Fast: thrown. */
export function drop(core: SimCore, p: Person, vx: number, vy: number): void {
  if (!p.air || p.air.mode !== 'held') return;
  if (core.holdingId === p.id) core.holdingId = null;
  const air = p.air;
  if (!Number.isFinite(vx)) vx = 0;
  if (!Number.isFinite(vy)) vy = 0;
  const speed = Math.hypot(vx, vy);
  if (speed < THROW_MIN) {
    air.mode = 'drop';
    const under = tileAt(air.tx, air.ty);
    air.goal = core.nav.nearestFree(under, p.num) ?? core.fallbackTile(p);
    reserve(core, p, air.goal);
    air.t = 0;
    return;
  }
  const k = speed > THROW_MAX ? THROW_MAX / speed : 1;
  throwFrom(core, p, vx * k, vy * k, 80 + speed * k * 0.2);
}

function throwFrom(core: SimCore, p: Person, vx: number, vy: number, up: number): void {
  const air = p.air ?? newAir('fly', p);
  air.mode = 'fly';
  air.vx = vx;
  air.vy = vy;
  air.vz = up;
  air.t = 0;
  air.airtime = 0;
  air.topSpeed = Math.hypot(vx, vy);
  air.hard = false;
  air.goal = null;
  const t = p.tile;
  air.ghost = !isWalkable(t.x, t.y);
  p.air = air;
  core.sfx('whoosh', p.x);
}

export function launch(core: SimCore, p: Person, vx: number, vy: number, up: number): void {
  if (!p.onFloor) return;
  if (core.holdingId === p.id) core.holdingId = null;
  liftOff(core, p, 'fly');
  throwFrom(core, p, Number.isFinite(vx) ? vx : 0, Number.isFinite(vy) ? vy : 0, Number.isFinite(up) ? Math.max(0, up) : 120);
}

/** Drop someone out of the air where they are (a seize ending in mid-air). */
export function fallFrom(core: SimCore, p: Person): void {
  if (p.lift <= 0.5 && isWalkable(p.tile.x, p.tile.y)) return;
  const air = liftOff(core, p, 'fly');
  air.vx = 0;
  air.vy = 0;
  air.vz = 0;
  air.airtime = 0;
  air.topSpeed = 0;
  air.ghost = !isWalkable(p.tile.x, p.tile.y);
}

function solid(x: number, y: number): boolean {
  const t = tileAt(x, y);
  return !isWalkable(t.x, t.y);
}

function landed(core: SimCore, p: Person, air: AirState): void {
  const room = roomAt(p.tile);
  const hard = air.airtime > 0.55 || air.topSpeed > 380;
  air.hard = hard;
  air.mode = 'land';
  air.t = 0;
  core.fx({ kind: 'impact', x: p.x, y: p.y, power: hard ? 0.8 : 0.35 });
  core.bus.emit('dropped', { who: p.id, room, hard });
  if (hard) {
    core.sfx('thud', p.x);
    core.shake(0.25, 180);
    core.bus.emit('buzz', { pattern: [20, 40, 20] });
    if (!p.frozen) {
      core.bumpMood(p.id, -0.15);
      p.stress = Math.min(1, p.stress + 0.2);
      core.addStatus(p.id, 'dizzy', 8);
      core.feel(p.id, 'angry', 0.75, 6);
    }
  } else {
    core.sfx('drop', p.x);
    if (!p.frozen) core.feel(p.id, 'surprised', 0.5, 2);
  }
  core.logEvent(`${p.name} was ${hard ? 'thrown across' : 'set down in'} ${core.roomName(room)}.`);
}

/** After landing: pick a free tile and walk (or slide) onto it, then carry on. */
function getUp(core: SimCore, p: Person, air: AirState): void {
  const goal = air.goal && core.nav.free(air.goal.x, air.goal.y, p.num) ? air.goal : core.nav.nearestFree(p.tile, p.num) ?? core.fallbackTile(p);
  reserve(core, p, goal);
  const t = p.tile;
  const onFloor = isWalkable(t.x, t.y);
  const route = onFloor && !p.frozen && !p.seized ? core.nav.path(t, goal) : null;
  if (route && route.length <= 10) {
    p.air = null;
    p.lift = 0;
    afterLanding(core, p);
  } else {
    air.mode = 'slide';
    air.goal = goal;
    air.t = 0;
  }
}

function afterLanding(core: SimCore, p: Person): void {
  if (p.frozen || p.seized) return;
  if (p.has('dizzy') && core.rng() < 0.5) core.bark(p.id, 'dizzy');
  if (p.goingHome) {
    core.sendHome(p);
    return;
  }
  if (p.plan) {
    core.replan(p);
    return;
  }
  p.job = settleJob('getting back up');
}

export function updateAir(core: SimCore, p: Person, dt: number): void {
  const air = p.air;
  if (!air) return;
  air.t += dt;
  switch (air.mode) {
    case 'held': {
      const k = 1 - Math.exp(-dt * 16);
      const nx = p.x + (air.tx - p.x) * k;
      const ny = p.y + (air.ty - p.y) * k;
      if (dt > 0) {
        air.vx = (nx - p.x) / dt;
        air.vy = (ny - p.y) / dt;
      }
      p.x = nx;
      p.y = ny;
      p.lift += (HOLD_LIFT - p.lift) * (1 - Math.exp(-dt * 12));
      break;
    }
    case 'drop': {
      const goal = air.goal as Tile;
      const done = glide(p, goal, 240, dt);
      p.lift = Math.max(0, p.lift - 120 * dt);
      const f = feetOf(goal);
      air.vx = f.x - p.x;
      air.vy = f.y - p.y;
      if (done && p.lift <= 0) {
        air.airtime = 0;
        air.topSpeed = 0;
        landed(core, p, air);
        air.goal = goal;
      }
      break;
    }
    case 'fly': {
      air.airtime += p.lift > 0 ? dt : 0;
      // Horizontal: little drag in the air, strong friction on the floor.
      const speed = Math.hypot(air.vx, air.vy);
      if (speed > 0) {
        const fr = p.lift > 0 ? 0.25 * speed * dt : 520 * dt;
        const ns = Math.max(0, speed - fr);
        air.vx *= ns / speed;
        air.vy *= ns / speed;
      }
      let nx = p.x + air.vx * dt;
      let ny = p.y + air.vy * dt;
      if (air.ghost && !solid(p.x, p.y)) air.ghost = false;
      if (!air.ghost) {
        if (solid(nx, p.y)) {
          if (Math.abs(air.vx) > 120) core.fx({ kind: 'impact', x: p.x + Math.sign(air.vx) * 6, y: p.y - 8, power: 0.4 });
          if (Math.abs(air.vx) > 200) core.sfx('thud', p.x);
          air.vx = -air.vx * 0.45;
          nx = p.x;
        }
        if (solid(nx, ny)) {
          if (Math.abs(air.vy) > 200) core.sfx('thud', p.x);
          air.vy = -air.vy * 0.45;
          ny = p.y;
        }
      }
      if (nx < MIN_X || nx > MAX_X) {
        air.vx = -air.vx * 0.45;
        nx = Math.max(MIN_X, Math.min(MAX_X, nx));
      }
      if (ny < MIN_Y || ny > MAX_Y) {
        air.vy = -air.vy * 0.45;
        ny = Math.max(MIN_Y, Math.min(MAX_Y, ny));
      }
      p.x = nx;
      p.y = ny;
      // Vertical arc.
      air.vz -= GRAVITY * dt;
      p.lift += air.vz * dt;
      if (p.lift <= 0) {
        p.lift = 0;
        if (air.vz < -150) {
          air.vz = -air.vz * 0.32;
          air.vx *= 0.7;
          air.vy *= 0.7;
          core.fx({ kind: 'impact', x: p.x, y: p.y, power: 0.3 });
        } else {
          air.vz = 0;
        }
      }
      if (p.lift === 0 && air.vz === 0 && Math.hypot(air.vx, air.vy) < 14) landed(core, p, air);
      // Safety: nobody flies for ever.
      if (air.t > 6) {
        p.lift = 0;
        landed(core, p, air);
      }
      break;
    }
    case 'land': {
      air.vx = 0;
      air.vy = 0;
      if (air.t >= 0.35) {
        if (air.hard && !p.frozen) {
          air.mode = 'lie';
          air.t = 0;
        } else {
          getUp(core, p, air);
        }
      }
      break;
    }
    case 'lie': {
      if (air.t >= 1.6) {
        if (!p.frozen && core.rng() < 0.6) core.bark(p.id, 'hurt');
        getUp(core, p, air);
      }
      break;
    }
    case 'slide': {
      const goal = air.goal as Tile;
      p.lift = Math.max(0, p.lift - 100 * dt);
      if (glide(p, goal, 70, dt) || air.t > 8) {
        const f = feetOf(goal);
        p.x = f.x;
        p.y = f.y;
        p.lift = 0;
        p.air = null;
        afterLanding(core, p);
      }
      break;
    }
  }
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    // Should never happen; never let a NaN escape.
    const t = core.fallbackTile(p);
    const f = feetOf(t);
    p.x = f.x;
    p.y = f.y;
    p.lift = 0;
    p.air = null;
    reserve(core, p, t);
  }
}
