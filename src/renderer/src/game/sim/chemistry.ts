// Pairwise romantic tension / chemistry (0..100) and secret office flings.

import { CHEMISTRY_SEEDS, FLING_SEEDS } from '@/game/core/cast';
import type { CastId, CharId } from '@/game/core/types';
import { clamp, isCastId } from '@/game/core/types';

const key = (a: CharId, b: CharId): string => `${a}>${b}`;
const pairKey = (a: CharId, b: CharId): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function chemistryLabel(score: number): string {
  if (score >= 75) return 'head over heels for';
  if (score >= 55) return 'has strong chemistry with';
  if (score >= 35) return 'has a crush on';
  if (score >= 20) return 'flirty toward';
  return '';
}

export class ChemistryBook {
  private scores = new Map<string, number>();
  private flingPairs = new Set<string>();

  constructor() {
    this.reset();
  }

  reset(): void {
    this.scores.clear();
    this.flingPairs.clear();
    for (const [a, b, score] of CHEMISTRY_SEEDS) {
      this.scores.set(key(a, b), clamp(Math.round(score), 0, 100));
    }
    for (const [a, b] of FLING_SEEDS) {
      if (a !== b) this.flingPairs.add(pairKey(a, b));
    }
  }

  score(a: CharId, b: CharId): number {
    if (a === b) return 0;
    return this.scores.get(key(a, b)) ?? 0;
  }

  shift(a: CharId, b: CharId, delta: number): number {
    if (a === b || !Number.isFinite(delta)) return this.score(a, b);
    const next = Math.round(clamp(this.score(a, b) + delta, 0, 100));
    this.scores.set(key(a, b), next);
    return next;
  }

  label(a: CharId, b: CharId): string {
    return chemistryLabel(this.score(a, b));
  }

  mutual(a: CharId, b: CharId): number {
    return Math.min(this.score(a, b), this.score(b, a));
  }

  isFling(a: CharId, b: CharId): boolean {
    if (a === b) return false;
    return this.flingPairs.has(pairKey(a, b));
  }

  markFling(a: CharId, b: CharId): boolean {
    if (a === b) return false;
    const pk = pairKey(a, b);
    const added = !this.flingPairs.has(pk);
    this.flingPairs.add(pk);
    if (this.score(a, b) < 60) this.scores.set(key(a, b), 60);
    if (this.score(b, a) < 60) this.scores.set(key(b, a), 60);
    return added;
  }

  clearFling(a: CharId, b: CharId): void {
    if (a === b) return;
    this.flingPairs.delete(pairKey(a, b));
  }

  flings(): [CastId, CastId][] {
    const out: [CastId, CastId][] = [];
    for (const pk of this.flingPairs) {
      const [a, b] = pk.split('|');
      if (a && b && isCastId(a) && isCastId(b) && a !== b) out.push([a, b]);
    }
    return out;
  }

  entries(): [string, number][] {
    return [...this.scores.entries()];
  }

  load(rawScores?: Record<string, number>, rawFlings?: [CastId, CastId][]): void {
    this.reset();
    if (rawScores && typeof rawScores === 'object') {
      for (const [k, v] of Object.entries(rawScores)) {
        if (!k.includes('>') || typeof v !== 'number' || !Number.isFinite(v)) continue;
        this.scores.set(k, clamp(Math.round(v), 0, 100));
      }
    }
    if (Array.isArray(rawFlings)) {
      this.flingPairs.clear();
      for (const pair of rawFlings) {
        if (!Array.isArray(pair) || pair.length !== 2) continue;
        const [a, b] = pair;
        if (isCastId(a) && isCastId(b) && a !== b) this.flingPairs.add(pairKey(a, b));
      }
    }
  }
}
