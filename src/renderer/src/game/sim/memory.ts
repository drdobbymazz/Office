// What each person remembers: recent memories (capped), plus long-term
// takeaways from the end-of-day report.

import type { CharId } from '@/game/core/types';
import { displayName } from '@/game/core/cast';

export interface Memory {
  day: number;
  clock: number;
  text: string;
  weight: number;
}

export const MEMORY_CAP = 40;
export const TAKEAWAY_CAP = 12;

export class MemoryBook {
  private recent = new Map<CharId, Memory[]>();
  private longTerm = new Map<CharId, string[]>();

  add(who: CharId, m: Memory): void {
    let list = this.recent.get(who);
    if (!list) {
      list = [];
      this.recent.set(who, list);
    }
    // The same thing said twice in a row is one memory.
    const last = list[list.length - 1];
    if (last && last.text === m.text && last.day === m.day) {
      last.weight = Math.max(last.weight, m.weight);
      return;
    }
    list.push(m);
    if (list.length > MEMORY_CAP) {
      // Drop the least important of the oldest half.
      let worst = 0;
      let worstScore = Infinity;
      const half = Math.floor(list.length / 2);
      for (let i = 0; i < half; i++) {
        const s = list[i].weight + i * 0.05;
        if (s < worstScore) {
          worstScore = s;
          worst = i;
        }
      }
      list.splice(worst, 1);
    }
  }

  all(who: CharId): readonly Memory[] {
    return this.recent.get(who) ?? [];
  }

  takeaways(who: CharId): readonly string[] {
    return this.longTerm.get(who) ?? [];
  }

  addTakeaway(who: CharId, text: string): void {
    const t = text.trim();
    if (!t) return;
    let list = this.longTerm.get(who);
    if (!list) {
      list = [];
      this.longTerm.set(who, list);
    }
    list.push(t);
    while (list.length > TAKEAWAY_CAP) list.shift();
  }

  /**
   * The most relevant few: recent and weighty, and above all ones that mention
   * the people in `about`.
   */
  relevant(who: CharId, about: readonly CharId[], day: number, clock: number, n = 3): string[] {
    const list = this.recent.get(who) ?? [];
    const names = about.map((a) => displayName(a).toLowerCase());
    const scored = list.map((m, i) => {
      const ageMin = (day - m.day) * 600 + (clock - m.clock);
      let s = m.weight * 2 - Math.min(6, ageMin / 120) + i * 0.001;
      const lower = m.text.toLowerCase();
      for (const nm of names) if (nm && lower.includes(nm)) s += 4;
      return { s, text: m.text };
    });
    scored.sort((a, b) => b.s - a.s);
    const out = scored.slice(0, n).map((x) => x.text);
    const lt = this.longTerm.get(who);
    if (out.length < n && lt && lt.length) out.push(lt[lt.length - 1]);
    return out;
  }

  serialize(): { memories: Record<string, Memory[]>; takeaways: Record<string, string[]> } {
    const memories: Record<string, Memory[]> = {};
    for (const [k, v] of this.recent) memories[k] = v.map((m) => ({ ...m }));
    const takeaways: Record<string, string[]> = {};
    for (const [k, v] of this.longTerm) takeaways[k] = [...v];
    return { memories, takeaways };
  }

  load(data: { memories?: Record<string, Memory[]>; takeaways?: Record<string, string[]> }): void {
    this.recent.clear();
    this.longTerm.clear();
    for (const [k, v] of Object.entries(data.memories ?? {})) {
      if (!Array.isArray(v)) continue;
      const list = v
        .filter((m) => m && typeof m.text === 'string')
        .map((m) => ({ day: Number(m.day) || 1, clock: Number(m.clock) || 0, text: m.text, weight: Number(m.weight) || 1 }))
        .slice(-MEMORY_CAP);
      this.recent.set(k, list);
    }
    for (const [k, v] of Object.entries(data.takeaways ?? {})) {
      if (Array.isArray(v)) this.longTerm.set(k, v.filter((t) => typeof t === 'string').slice(-TAKEAWAY_CAP));
    }
  }
}
