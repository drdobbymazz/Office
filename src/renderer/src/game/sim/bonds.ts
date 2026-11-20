// How each person feels about each other person: -100..100 plus a short note.

import { BOND_SEEDS } from '@/game/core/cast';
import type { CharId } from '@/game/core/types';
import { clamp } from '@/game/core/types';

export interface BondEntry {
  score: number;
  note: string;
}

const key = (a: CharId, b: CharId): string => `${a}>${b}`;

export function labelFor(score: number): string {
  if (score <= -60) return "can't stand";
  if (score <= -25) return 'dislikes';
  if (score <= -8) return 'is wary of';
  if (score <= 12) return 'is fine with';
  if (score <= 40) return 'likes';
  if (score <= 70) return 'is close to';
  return 'adores';
}

export class Bonds {
  private table = new Map<string, BondEntry>();

  constructor() {
    this.reset();
  }

  reset(): void {
    this.table.clear();
    for (const [a, b, score, note] of BOND_SEEDS) this.table.set(key(a, b), { score, note });
  }

  get(a: CharId, b: CharId): BondEntry {
    return this.table.get(key(a, b)) ?? { score: 0, note: '' };
  }

  score(a: CharId, b: CharId): number {
    return this.table.get(key(a, b))?.score ?? 0;
  }

  label(a: CharId, b: CharId): string {
    return labelFor(this.score(a, b));
  }

  /** Returns the old and new labels so the caller can announce a change. */
  shift(a: CharId, b: CharId, delta: number, why?: string): { before: string; after: string; score: number } {
    if (a === b) return { before: '', after: '', score: 0 };
    const cur = this.get(a, b);
    const before = labelFor(cur.score);
    const score = Math.round(clamp(cur.score + delta, -100, 100));
    const entry: BondEntry = { score, note: why && why.trim() ? why.trim() : cur.note };
    this.table.set(key(a, b), entry);
    return { before, after: labelFor(score), score };
  }

  set(a: CharId, b: CharId, entry: BondEntry): void {
    this.table.set(key(a, b), { score: clamp(Math.round(entry.score), -100, 100), note: entry.note ?? '' });
  }

  entries(): [string, BondEntry][] {
    return [...this.table.entries()].map(([k, v]) => [k, { ...v }]);
  }

  load(entries: Record<string, BondEntry>): void {
    this.table.clear();
    for (const [k, v] of Object.entries(entries)) {
      if (!k.includes('>') || typeof v?.score !== 'number' || !Number.isFinite(v.score)) continue;
      this.table.set(k, { score: clamp(Math.round(v.score), -100, 100), note: typeof v.note === 'string' ? v.note : '' });
    }
  }
}
