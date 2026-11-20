// The walkable grid as the sim uses it: the static map from world.ts, plus
// tiles blocked at run time (a fire, a jammed door), plus who is resting on
// which tile. Paths ignore people (walkers pass through each other in the
// one-tile corridors); destinations must be free.
//
// Path search is our own BFS over typed arrays rather than world.findPath:
// it has to respect blocked tiles, and the soak tests run it many thousands
// of times. With nothing blocked it gives the same shortest routes.

import { GRID_H, GRID_W, isWalkable, nearestWalkable } from '@/game/core/world';
import type { Tile } from '@/game/core/types';

export const CELLS = GRID_W * GRID_H;
export const cellOf = (x: number, y: number): number => y * GRID_W + x;
export const inGrid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

export class Nav {
  private blockedCount = new Uint8Array(CELLS);
  private blockedKeys = new Map<string, number[]>();
  /** Person number (1-based) resting on / heading for each tile; 0 = free. */
  readonly occ = new Int32Array(CELLS);
  /** Bumped whenever blocked tiles change. */
  version = 0;

  private prev = new Int32Array(CELLS);
  private queue = new Int32Array(CELLS);
  private dist = new Int32Array(CELLS);
  private distFrom = -1;
  private distVersion = -1;

  setBlocked(key: string, tiles: readonly Tile[] | null): void {
    const old = this.blockedKeys.get(key);
    if (old) for (const c of old) this.blockedCount[c]--;
    this.blockedKeys.delete(key);
    if (tiles && tiles.length) {
      const cells: number[] = [];
      for (const t of tiles) {
        if (!inGrid(t.x, t.y)) continue;
        const c = cellOf(t.x, t.y);
        cells.push(c);
        this.blockedCount[c]++;
      }
      this.blockedKeys.set(key, cells);
    }
    this.version++;
  }

  clearBlocked(): void {
    this.blockedKeys.clear();
    this.blockedCount.fill(0);
    this.version++;
  }

  blockedKeyList(): string[] {
    return [...this.blockedKeys.keys()];
  }

  isBlocked(x: number, y: number): boolean {
    return inGrid(x, y) && this.blockedCount[cellOf(x, y)] > 0;
  }

  passable(x: number, y: number): boolean {
    return isWalkable(x, y) && this.blockedCount[cellOf(x, y)] === 0;
  }

  /** Walkable, not blocked, and not taken by someone else. */
  free(x: number, y: number, num: number): boolean {
    if (!this.passable(x, y)) return false;
    const o = this.occ[cellOf(x, y)];
    return o === 0 || o === num;
  }

  /** Shortest route from `from` to `to` over passable tiles (the start may be anything). */
  path(from: Tile, to: Tile): Tile[] | null {
    if (!inGrid(from.x, from.y) || !this.passable(to.x, to.y)) return null;
    if (from.x === to.x && from.y === to.y) return [];
    const start = cellOf(from.x, from.y);
    const goal = cellOf(to.x, to.y);
    const prev = this.prev;
    prev.fill(-1);
    prev[start] = start;
    const q = this.queue;
    let head = 0;
    let tail = 0;
    q[tail++] = start;
    while (head < tail) {
      const c = q[head++];
      const cx = c % GRID_W;
      const cy = (c - cx) / GRID_W;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (!inGrid(nx, ny)) continue;
        const n = cellOf(nx, ny);
        if (prev[n] !== -1 || !this.passable(nx, ny)) continue;
        prev[n] = c;
        if (n === goal) {
          const out: Tile[] = [];
          let k = goal;
          while (k !== start) {
            out.push({ x: k % GRID_W, y: Math.floor(k / GRID_W) });
            k = prev[k];
          }
          out.reverse();
          return out;
        }
        q[tail++] = n;
      }
    }
    return null;
  }

  /** Steps from `from` to every tile (-1 = unreachable). Cached until the start or the blocked tiles change. */
  distances(from: Tile): Int32Array {
    const start = inGrid(from.x, from.y) ? cellOf(from.x, from.y) : -1;
    if (start === this.distFrom && this.distVersion === this.version) return this.dist;
    const dist = this.dist;
    dist.fill(-1);
    this.distFrom = start;
    this.distVersion = this.version;
    if (start < 0) return dist;
    const q = this.queue;
    let head = 0;
    let tail = 0;
    q[tail++] = start;
    dist[start] = 0;
    while (head < tail) {
      const c = q[head++];
      const cx = c % GRID_W;
      const cy = (c - cx) / GRID_W;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (!inGrid(nx, ny)) continue;
        const n = cellOf(nx, ny);
        if (dist[n] !== -1 || !this.passable(nx, ny)) continue;
        dist[n] = dist[c] + 1;
        q[tail++] = n;
      }
    }
    return dist;
  }

  reachable(from: Tile, to: Tile): boolean {
    if (!inGrid(to.x, to.y)) return false;
    return this.distances(from)[cellOf(to.x, to.y)] >= 0;
  }

  /**
   * The free tile nearest to `from` by walking distance (itself if free).
   * `accept` can narrow the choice (a room, not next to a fire ...).
   */
  nearestFree(from: Tile, num: number, accept?: (x: number, y: number) => boolean, maxSteps = 60): Tile | null {
    let seed = from;
    if (!inGrid(seed.x, seed.y) || !isWalkable(seed.x, seed.y)) {
      const w = nearestWalkable({ x: Math.max(0, Math.min(GRID_W - 1, seed.x)), y: Math.max(0, Math.min(GRID_H - 1, seed.y)) }, 12);
      if (!w) return null;
      seed = w;
    }
    const start = cellOf(seed.x, seed.y);
    const dist = this.dist;
    // Reuse the distance buffer as a visited map; invalidate the cache.
    this.distFrom = -1;
    dist.fill(-1);
    const q = this.queue;
    let head = 0;
    let tail = 0;
    q[tail++] = start;
    dist[start] = 0;
    while (head < tail) {
      const c = q[head++];
      const cx = c % GRID_W;
      const cy = (c - cx) / GRID_W;
      if (this.free(cx, cy, num) && (!accept || accept(cx, cy))) return { x: cx, y: cy };
      if (dist[c] >= maxSteps) continue;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (!inGrid(nx, ny)) continue;
        const n = cellOf(nx, ny);
        if (dist[n] !== -1 || !this.passable(nx, ny)) continue;
        dist[n] = dist[c] + 1;
        q[tail++] = n;
      }
    }
    // Walled in by blocked tiles: accept any free walkable tile by straight distance.
    let best: Tile | null = null;
    let bestD = Infinity;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!this.free(x, y, num) || (accept && !accept(x, y))) continue;
        const d = (x - from.x) ** 2 + (y - from.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best;
  }
}
