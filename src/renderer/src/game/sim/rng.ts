// Seeded random numbers (mulberry32). The sim never uses Math.random(), so a
// seed plus the same inputs gives the same day.

export interface Rng {
  (): number;
  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number;
  /** Float in [lo, hi). */
  range(lo: number, hi: number): number;
  pick<T>(list: readonly T[]): T;
  chance(p: number): boolean;
  /** Pick by weight; returns the index. */
  weighted(weights: readonly number[]): number;
  shuffle<T>(list: T[]): T[];
}

export function createRng(seed: number): Rng {
  let s = (seed | 0) ^ 0x9e3779b9;
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = next as Rng;
  rng.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  rng.range = (lo, hi) => lo + next() * (hi - lo);
  rng.pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
  rng.chance = (p) => next() < p;
  rng.weighted = (weights) => {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    let r = next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  };
  rng.shuffle = <T>(list: T[]): T[] => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  };
  return rng;
}
