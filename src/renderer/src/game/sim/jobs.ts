// Jobs: "go somewhere, then do something there for a while". Every kind of
// behaviour (routine, plans, tasks from chaos scripts, fleeing, going home,
// gathering for a scene) is a Job, so walking, reserving a resting tile,
// re-planning around blocked tiles and the stuck watchdog live in one place.

import type { AnimId, CharId, Dir, HeldProp, RoomId, Tile } from '@/game/core/types';
import { GRID_W, MAP_H, anchor, anchorsIn, deskOf, feetOf, findAnchor, roomAt, walkableTilesIn } from '@/game/core/world';
import { cellOf } from './nav';
import { glide, planWalk, stepWalk, walkBroken } from './movement';
import type { MoveStyle, Person } from './people';
import type { SimCore } from './core';

export type Want =
  | { kind: 'tile'; tile: Tile }
  | { kind: 'anchor'; id: string }
  | { kind: 'room'; room: RoomId }
  | { kind: 'near'; who: CharId }
  | { kind: 'here' }
  | { kind: 'away'; room: RoomId }
  | { kind: 'outside' };

export interface Act {
  anim: AnimId;
  seated: boolean;
  face: Dir | null;
  /** Keep turned toward this person while acting. */
  faceWho?: CharId;
  /** Prop to hold while acting (null = empty hands; undefined = leave as is). */
  prop?: HeldProp | null;
  doing: string;
  seconds: number;
  variant?: number;
}

export type JobKind =
  | 'routine' | 'plan' | 'planWait' | 'task' | 'go' | 'flee' | 'evacuate' | 'arrive' | 'home'
  | 'lunch' | 'settle' | 'gather' | 'trapped' | 'leaveScene';

export interface Job {
  kind: JobKind;
  want: Want;
  tile: Tile | null;
  style: MoveStyle;
  /** What they are doing while walking there. */
  doing: string;
  act: Act | null;
  left: number;
  phase: 'walk' | 'act';
  walkTime: number;
  /** On completion. */
  then?: () => void;
  /** On arrival, before the act starts. */
  onArrive?: () => void;
  /** If the job is cancelled or abandoned before completion. */
  onFail?: () => void;
  /** Called every frame while acting (after arrival). */
  whileActing?: (dt: number) => void;
  /** May go into rooms marked as hazards (fixers). */
  braveHazard?: boolean;
  /** For 'near': re-route when the target moves. */
  followTile?: Tile;
  reroutes: number;
  finished: boolean;
}

export function makeJob(kind: JobKind, want: Want, opts: Partial<Job> = {}): Job {
  return {
    kind, want, tile: null, style: 'walk', doing: '', act: null, left: 0, phase: 'walk', walkTime: 0, reroutes: 0, finished: false,
    ...opts
  };
}

export function idleAct(doing: string, seconds: number, face: Dir | null = null, anim: AnimId = 'idle'): Act {
  return { anim, seated: false, face, doing, seconds };
}

// ── Resolving where to go ────────────────────────────────────────────────────

const MAX_REROUTES = 8;

export function resolveWant(core: SimCore, p: Person, job: Job): Tile | null {
  const nav = core.nav;
  const w = job.want;
  const here = p.tile;
  const dist = nav.distances(p.tile);
  const reach = (x: number, y: number): boolean => dist[cellOf(x, y)] >= 0 || (x === p.tile.x && y === p.tile.y);
  const safe = (x: number, y: number): boolean => job.braveHazard || !core.isHazard(roomAt({ x, y }));
  switch (w.kind) {
    case 'tile':
      return nav.nearestFree(w.tile, p.num, (x, y) => reach(x, y), 40);
    case 'anchor': {
      const a = findAnchor(w.id);
      if (!a) return null;
      if (nav.free(a.tile.x, a.tile.y, p.num) && reach(a.tile.x, a.tile.y)) return a.tile;
      return nav.nearestFree(a.tile, p.num, (x, y) => reach(x, y) && roomAt({ x, y }) === a.room, 6)
        ?? nav.nearestFree(a.tile, p.num, (x, y) => reach(x, y), 12);
    }
    case 'room': {
      const tiles = walkableTilesIn(w.room);
      // Prefer the room's named spots, then any free tile.
      const spots = anchorsIn(w.room).filter((a) => (a.kind === 'spot' || a.kind === 'stand') && nav.free(a.tile.x, a.tile.y, p.num) && reach(a.tile.x, a.tile.y));
      if (spots.length && core.rng() < 0.6) return core.rng.pick(spots).tile;
      for (let tries = 0; tries < 24; tries++) {
        const t = core.rng.pick(tiles);
        if (nav.free(t.x, t.y, p.num) && reach(t.x, t.y)) return t;
      }
      const c = tiles[Math.floor(tiles.length / 2)];
      return c ? nav.nearestFree(c, p.num, (x, y) => reach(x, y) && roomAt({ x, y }) === w.room, 30) : null;
    }
    case 'near': {
      const t = core.byId(w.who);
      if (!t || !t.onFloor) return null;
      const base = t.res ?? t.tile;
      job.followTile = { x: base.x, y: base.y };
      let best: Tile | null = null;
      let bestD = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = base.x + dx;
          const y = base.y + dy;
          if (!nav.free(x, y, p.num) || !reach(x, y)) continue;
          // Side by side or face to face reads better than diagonal.
          const d = (x - p.tile.x) ** 2 + (y - p.tile.y) ** 2 + (dx && dy ? 6 : 0);
          if (d < bestD) {
            bestD = d;
            best = { x, y };
          }
        }
      }
      return best ?? nav.nearestFree(base, p.num, (x, y) => reach(x, y) && !(x === base.x && y === base.y), 5);
    }
    case 'here':
      return nav.nearestFree(here, p.num, undefined, 40);
    case 'away': {
      let best: Tile | null = null;
      let bestS = Infinity;
      for (let i = 0; i < dist.length; i++) {
        const d = dist[i];
        if (d < 3) continue;
        const x = i % GRID_W;
        const y = (i - x) / GRID_W;
        const r = roomAt({ x, y });
        if (r === w.room || r === 'outside' || core.isHazard(r) || !nav.free(x, y, p.num)) continue;
        const s = d + core.rng() * 5;
        if (s < bestS) {
          bestS = s;
          best = { x, y };
        }
      }
      return best ?? resolveWant(core, p, { ...job, want: { kind: 'outside' } });
    }
    case 'outside': {
      const order = core.rng.shuffle([...Array(16).keys()]);
      for (const i of order) {
        const a = findAnchor(`spot.outside${i + 1}`);
        if (a && nav.free(a.tile.x, a.tile.y, p.num) && reach(a.tile.x, a.tile.y)) return a.tile;
      }
      return nav.nearestFree({ x: 16, y: MAP_H + 2 }, p.num, (x, y) => y >= MAP_H && reach(x, y), 40);
    }
  }
}

// ── Running jobs ─────────────────────────────────────────────────────────────

export function reserve(core: SimCore, p: Person, t: Tile | null): void {
  const occ = core.nav.occ;
  if (p.res) {
    const c = cellOf(p.res.x, p.res.y);
    if (occ[c] === p.num) occ[c] = 0;
  }
  p.res = t ? { x: t.x, y: t.y } : null;
  if (t) occ[cellOf(t.x, t.y)] = p.num;
}

/** Stop whatever job they have. `fail` runs its onFail. */
export function cancelJob(p: Person, fail = true): void {
  const j = p.job;
  p.job = null;
  p.walk = null;
  p.waiting = false;
  if (j && !j.finished) {
    j.finished = true;
    if (fail) j.onFail?.();
  }
}

export function setJob(core: SimCore, p: Person, job: Job): void {
  cancelJob(p);
  p.job = job;
  p.trapped = false;
  job.phase = 'walk';
  p.doing = job.doing || p.doing;
}

/** Put a stashed / paused job back on track (re-resolving its tile). */
export function restartJob(p: Person, job: Job): void {
  p.walk = null;
  p.waiting = false;
  p.job = job;
  job.tile = null;
  if (job.phase === 'act' && job.act) {
    // They may have been moved; walk back to the spot first.
    job.phase = 'walk';
  }
}

function at(p: Person, t: Tile): boolean {
  const f = feetOf(t);
  return Math.abs(p.x - f.x) < 0.5 && Math.abs(p.y - f.y) < 0.5;
}

function arrive(core: SimCore, p: Person, job: Job): void {
  p.walk = null;
  p.waiting = false;
  p.stuckFor = 0;
  job.onArrive?.();
  if (p.job !== job) return;
  if (!job.act || job.act.seconds <= 0) {
    finish(core, p, job);
    return;
  }
  job.phase = 'act';
  if (job.left <= 0) job.left = job.act.seconds;
  if (job.act.prop !== undefined) {
    p.prop = job.act.prop;
    p.propUntil = Infinity;
  }
  p.doing = job.act.doing;
}

function finish(core: SimCore, p: Person, job: Job): void {
  if (job.finished) return;
  job.finished = true;
  if (p.job === job) p.job = null;
  job.then?.();
  void core;
}

/** Advance this person's job. Returns false when they have no job. */
export function updateJob(core: SimCore, p: Person, dt: number): boolean {
  const job = p.job;
  if (!job) return false;
  const nav = core.nav;

  if (job.phase === 'act') {
    // Someone took their tile from under them (should not happen): stand up and re-find.
    if (!p.res || !at(p, p.res)) {
      job.phase = 'walk';
      job.tile = null;
    } else {
      job.left -= dt;
      job.whileActing?.(dt);
      if (p.job !== job) return true;
      if (job.left <= 0) finish(core, p, job);
      return true;
    }
  }

  job.walkTime += dt;

  // Follow a moving target.
  if (job.want.kind === 'near' && job.followTile && job.tile) {
    const t = core.byId(job.want.who);
    if (!t || !t.onFloor) {
      cancelJob(p);
      return false;
    }
    const base = t.res ?? t.tile;
    if (Math.max(Math.abs(base.x - job.followTile.x), Math.abs(base.y - job.followTile.y)) > 1) {
      if (job.reroutes++ > MAX_REROUTES) {
        cancelJob(p);
        return false;
      }
      job.tile = null;
      p.walk = null;
    }
  }

  if (!job.tile || !nav.free(job.tile.x, job.tile.y, p.num)) {
    const t = resolveWant(core, p, job);
    if (!t) {
      p.walk = null;
      p.waiting = true;
      return true;
    }
    job.tile = t;
    reserve(core, p, t);
    p.walk = null;
  } else if (!p.res || p.res.x !== job.tile.x || p.res.y !== job.tile.y) {
    reserve(core, p, job.tile);
  }

  if (!p.walk) {
    if (p.waiting && core.time < p.retryAt) return true;
    if (at(p, job.tile)) {
      arrive(core, p, job);
      return true;
    }
    const w = planWalk(nav, p, job.tile, job.style);
    if (!w) {
      // No route (blocked in). Wait and retry; the watchdog decides what next.
      p.waiting = true;
      p.retryAt = core.time + 1;
      return true;
    }
    p.waiting = false;
    p.walk = w;
    p.doing = job.doing || p.doing;
  }

  const w = p.walk;
  if (w && walkBroken(nav, w)) {
    p.walk = planWalk(nav, p, job.tile, job.style);
    if (!p.walk) {
      p.waiting = true;
      p.retryAt = core.time + 1;
      return true;
    }
  }
  if (p.walk && stepWalk(p, p.walk, dt, core.speedMult(p))) arrive(core, p, job);
  return true;
}

// ── Watchdog ─────────────────────────────────────────────────────────────────

export const STUCK_LIMIT = 15;

/** Track progress; rescue anyone who has wanted to move and not managed it for 15 s. */
export function watchdog(core: SimCore, p: Person, dt: number): void {
  const trying = p.walk !== null || p.waiting;
  if (!trying) {
    p.stuckFor = 0;
    p.progX = p.x;
    p.progY = p.y;
    return;
  }
  if (Math.abs(p.x - p.progX) + Math.abs(p.y - p.progY) > 3) {
    p.progX = p.x;
    p.progY = p.y;
    p.stuckFor = 0;
  } else {
    p.stuckFor += dt;
  }
  const overdue = p.job !== null && p.job.walkTime > 90;
  if (p.stuckFor >= STUCK_LIMIT || overdue) rescue(core, p);
}

/** Can they get to the front door or their desk from here? */
function canGetOut(core: SimCore, p: Person): boolean {
  const door = anchor('door.entrance').tile;
  if (core.nav.reachable(p.tile, door)) return true;
  if (p.def && core.nav.reachable(p.tile, deskOf(p.def.id).tile)) return true;
  return false;
}

export function rescue(core: SimCore, p: Person): void {
  const job = p.job;
  p.stuckFor = 0;
  p.progX = p.x;
  p.progY = p.y;
  p.rescues++;
  core.stats.rescues++;
  if (!canGetOut(core, p)) {
    // Walled in: wait patiently where they are instead of pacing.
    trappedWait(core, p);
    p.lastRescue = core.time;
    return;
  }
  const repeat = core.time - p.lastRescue < 40;
  p.lastRescue = core.time;
  if (repeat || (job && job.kind === 'home')) {
    // Last resort: put them somewhere sensible.
    core.stats.teleports++;
    const home = job && job.kind === 'home' ? anchor('exit.street').tile : p.def ? deskOf(p.def.id).tile : anchor('door.entrance').tile;
    cancelJob(p);
    core.teleportPerson(p, home);
    if (job && job.kind === 'home') core.sendHome(p);
    return;
  }
  // Re-plan: drop the job (its owner hears onFail); the routine picks again.
  cancelJob(p);
  // Stand on a free tile of their own meanwhile (their reservation may be across a now-blocked door).
  if (!p.job) p.job = settleJob(p.doing);
}

export function trappedWait(core: SimCore, p: Person): void {
  p.trapped = true;
  const job = makeJob('trapped', { kind: 'here' }, { act: idleAct('waiting for a way out', 6 + core.rng() * 4, null, core.rng() < 0.5 ? 'idle' : 'shrug') });
  cancelJob(p);
  p.job = job;
}

/** Move to the nearest free tile and stand there (after landing, a seize, a scene). */
export function settleJob(doing = ''): Job {
  return makeJob('settle', { kind: 'here' }, { doing });
}

/** Seized people have no job: just make sure they end up on a free tile of their own. */
export function settleSeized(core: SimCore, p: Person, dt: number): void {
  if (!p.res || !core.nav.free(p.res.x, p.res.y, p.num)) {
    const t = core.nav.nearestFree(p.tile, p.num);
    reserve(core, p, t);
  }
  if (p.res && !p.placed) glide(p, p.res, 40, dt);
}
