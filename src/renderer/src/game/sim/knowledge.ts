// Who knows what.
//
// A rumor is created only for the people who actually saw or heard it. It then
// travels through the office by conversation, losing confidence each hop. This
// is the sim's perception layer: people act on what they know, not on the
// omniscient fact table.

import type { CharId } from '@/game/core/types';
import { clamp } from '@/game/core/types';

export interface Rumor {
  id: string;
  text: string;
  /** How juicy / worth repeating. */
  weight: number;
  day: number;
  clock: number;
  subject?: CharId;
}

export interface KnownRumor {
  rumor: Rumor;
  /** 1 = saw it happen, lower = heard it second-hand. */
  confidence: number;
}

export class KnowledgeBook {
  private rumors = new Map<string, Rumor>();
  private known = new Map<CharId, Map<string, number>>();
  private seq = 0;

  clear(): void {
    this.rumors.clear();
    this.known.clear();
    this.seq = 0;
  }

  add(text: string, weight: number, day: number, clock: number, subject?: CharId): Rumor {
    const t = String(text ?? '').trim();
    const rumor: Rumor = {
      id: `r${++this.seq}`,
      text: t,
      weight: clamp(weight, 0.2, 5),
      day,
      clock,
      ...(subject ? { subject } : {})
    };
    this.rumors.set(rumor.id, rumor);
    return rumor;
  }

  tell(who: CharId, rumor: Rumor, confidence = 1): void {
    let map = this.known.get(who);
    if (!map) {
      map = new Map();
      this.known.set(who, map);
    }
    const prev = map.get(rumor.id) ?? 0;
    map.set(rumor.id, Math.max(prev, clamp(confidence, 0.1, 1)));
  }

  /** Make sure a rumor exists in the book (e.g. after loading). */
  adopt(rumor: Rumor): void {
    if (!this.rumors.has(rumor.id)) this.rumors.set(rumor.id, rumor);
  }

  knows(who: CharId, id: string): boolean {
    return this.known.get(who)?.has(id) ?? false;
  }

  knownBy(who: CharId): KnownRumor[] {
    const map = this.known.get(who);
    if (!map) return [];
    const out: KnownRumor[] = [];
    for (const [id, confidence] of map) {
      const rumor = this.rumors.get(id);
      if (rumor) out.push({ rumor, confidence });
    }
    return out;
  }

  /** The juiciest things they know, newest first among equals. */
  top(who: CharId, n = 3): KnownRumor[] {
    return this.knownBy(who)
      .sort((a, b) => b.rumor.weight * b.confidence - a.rumor.weight * a.confidence || b.rumor.day - a.rumor.day || b.rumor.clock - a.rumor.clock)
      .slice(0, Math.max(0, n));
  }

  /** Pass a rumor on. Returns false when the listener already knows it. */
  share(from: CharId, to: CharId, id: string): boolean {
    if (from === to || this.knows(to, id)) return false;
    const rumor = this.rumors.get(id);
    if (!rumor) return false;
    const confidence = (this.known.get(from)?.get(id) ?? 1) * 0.82;
    this.tell(to, rumor, confidence);
    return true;
  }

  all(): Rumor[] {
    return [...this.rumors.values()];
  }

  /** Restore knowledge saved with a game. */
  load(rawRumors: Rumor[] | undefined, rawKnown: Record<string, string[]> | undefined): void {
    this.clear();
    if (Array.isArray(rawRumors)) {
      for (const r of rawRumors) {
        if (r && typeof r.id === 'string' && typeof r.text === 'string') this.rumors.set(r.id, r);
      }
    }
    if (rawKnown && typeof rawKnown === 'object') {
      for (const [who, ids] of Object.entries(rawKnown)) {
        if (!Array.isArray(ids)) continue;
        const map = new Map<string, number>();
        for (const id of ids) if (typeof id === 'string') map.set(id, 1);
        if (map.size) this.known.set(who as CharId, map);
      }
    }
  }

  serialize(): { rumors: Rumor[]; known: Record<string, string[]> } {
    const known: Record<string, string[]> = {};
    for (const [who, map] of this.known) known[who] = [...map.keys()];
    return { rumors: [...this.rumors.values()], known };
  }
}
