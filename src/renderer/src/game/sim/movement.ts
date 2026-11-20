// Walking: tile routes turned into smooth motion. A person follows a polyline
// through tile feet positions; the drawn position is the average of two
// points a little behind and ahead along the line, which rounds every corner
// by a few pixels (never far enough to clip a wall), and speed eases in at the
// start and out at the end.

import { feetOf } from '@/game/core/world';
import type { Tile } from '@/game/core/types';
import type { Nav } from './nav';
import { SPEEDS, type MoveStyle, type Person, type Walk } from './people';

const ACCEL = 260;
const DECEL = 220;
/** Half-width of the smoothing window, px. */
const ROUND = 5;

function pointAt(w: Walk, s: number, out: { x: number; y: number }): void {
  if (s <= 0) {
    out.x = w.pts[0];
    out.y = w.pts[1];
    return;
  }
  if (s >= w.len) {
    out.x = w.pts[w.pts.length - 2];
    out.y = w.pts[w.pts.length - 1];
    return;
  }
  // Few segments: a linear scan is fine.
  let i = 1;
  while (i < w.cum.length - 1 && w.cum[i] < s) i++;
  const s0 = w.cum[i - 1];
  const seg = w.cum[i] - s0;
  const t = seg > 0 ? (s - s0) / seg : 1;
  const ax = w.pts[(i - 1) * 2];
  const ay = w.pts[(i - 1) * 2 + 1];
  out.x = ax + (w.pts[i * 2] - ax) * t;
  out.y = ay + (w.pts[i * 2 + 1] - ay) * t;
}

const A = { x: 0, y: 0 };
const B = { x: 0, y: 0 };

/** Build a walk from where the person stands to `goal`. null = no route. */
export function planWalk(nav: Nav, p: Person, goal: Tile, style: MoveStyle): Walk | null {
  const tiles = nav.path(p.tile, goal);
  if (!tiles) return null;
  const pts: number[] = [p.x, p.y];
  // Merge straight runs so the smoothing only touches real corners.
  for (let i = 0; i < tiles.length; i++) {
    const f = feetOf(tiles[i]);
    const n = pts.length;
    if (n >= 4) {
      const px = pts[n - 2];
      const py = pts[n - 1];
      const qx = pts[n - 4];
      const qy = pts[n - 3];
      const collinear = (px - qx) * (f.y - py) - (py - qy) * (f.x - px) === 0 && (px - qx) * (f.x - px) + (py - qy) * (f.y - py) >= 0;
      if (collinear) {
        pts[n - 2] = f.x;
        pts[n - 1] = f.y;
        continue;
      }
    }
    pts.push(f.x, f.y);
  }
  const g = feetOf(goal);
  if (tiles.length === 0) pts.push(g.x, g.y);
  const cum: number[] = [0];
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) {
    len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    cum.push(len);
  }
  const keepV = p.walk ? Math.min(p.walk.v, SPEEDS[style]) : 0;
  return { pts, cum, len, s: 0, v: keepV, style, goal: { x: goal.x, y: goal.y }, tiles };
}

/** Does the rest of this walk cross a tile that is no longer passable? */
export function walkBroken(nav: Nav, w: Walk): boolean {
  for (const t of w.tiles) if (!nav.passable(t.x, t.y)) return true;
  return false;
}

/**
 * Advance a walk. Returns true on arrival (position snapped to the goal feet).
 * `mult` scales speed (caffeine, size).
 */
export function stepWalk(p: Person, w: Walk, dt: number, mult: number): boolean {
  const vmax = SPEEDS[w.style] * mult;
  const remain = w.len - w.s;
  const vStop = Math.sqrt(2 * DECEL * Math.max(0, remain)) + 6;
  const target = Math.min(vmax, vStop);
  if (w.v < target) w.v = Math.min(target, w.v + ACCEL * dt);
  else w.v = Math.max(target, w.v - DECEL * 2 * dt);
  w.s += w.v * dt;
  if (w.s >= w.len) {
    const g = feetOf(w.goal);
    p.x = g.x;
    p.y = g.y;
    return true;
  }
  pointAt(w, w.s - ROUND, A);
  pointAt(w, w.s + ROUND, B);
  p.x = (A.x + B.x) / 2;
  p.y = (A.y + B.y) / 2;
  return false;
}

/** Glide straight to a tile's feet (sliding after a throw, or out of furniture). */
export function glide(p: Person, goal: Tile, speed: number, dt: number): boolean {
  const g = feetOf(goal);
  const dx = g.x - p.x;
  const dy = g.y - p.y;
  const d = Math.hypot(dx, dy);
  const step = Math.max(speed * dt, 0);
  if (d <= step || d < 0.5) {
    p.x = g.x;
    p.y = g.y;
    return true;
  }
  // Ease out over the last few pixels.
  const k = Math.min(1, step / d) * (d < 12 ? Math.max(0.35, d / 12) : 1);
  p.x += dx * k;
  p.y += dy * k;
  return false;
}
