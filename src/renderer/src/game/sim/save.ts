// What survives between sessions. Positions and scenes are never saved: a
// restored game always starts a day at 08:50 with people arriving.

import type { CastId } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import type { BondEntry } from './bonds';
import type { Memory } from './memory';
import type { Rumor } from './knowledge';

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  /** The day being played when saved. */
  day: number;
  /** True if that day had finished (restoring starts the next one). */
  dayDone: boolean;
  /** "michael>jim" -> bond. */
  bonds: Record<string, BondEntry>;
  /** "jim>pam" -> 0..100 romantic chemistry. */
  chemistry?: Record<string, number>;
  /** Cast pairs currently in a secret fling. */
  flings?: [CastId, CastId][];
  memories: Record<string, Memory[]>;
  takeaways: Record<string, string[]>;
  /** Rumor board and who knows which rumor id. */
  rumors?: Rumor[];
  knowledge?: Record<string, string[]>;
  /** Cast notoriety (0..1) from repeated scandals. */
  notoriety?: Record<string, number>;
  /** Needs are session-local; only saved to let a reload keep flavour. */
  needs?: Record<string, Record<string, number>>;
  meters: {
    stock: number;
    stockHistory: number[];
    morale: number;
  };
  incidentFreeDays: number;
  incidentsTotal: number;
  revealedSecrets: CastId[];
}

/** Defensive parse: anything malformed falls back to defaults. */
export function cleanSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SaveData>;
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const cleanChem: Record<string, number> = {};
  let hasChem = false;
  if (r.chemistry && typeof r.chemistry === 'object') {
    for (const [k, v] of Object.entries(r.chemistry)) {
      if (k.includes('>') && typeof v === 'number' && Number.isFinite(v)) {
        cleanChem[k] = v;
        hasChem = true;
      }
    }
  }
  const cleanFlings = Array.isArray(r.flings)
    ? r.flings.filter((p): p is [CastId, CastId] => Array.isArray(p) && p.length === 2 && isCastId(p[0]) && isCastId(p[1]) && p[0] !== p[1])
    : undefined;
  const cleanRumors = Array.isArray(r.rumors)
    ? r.rumors.filter((x): x is Rumor => !!x && typeof x === 'object' && typeof (x as Rumor).id === 'string' && typeof (x as Rumor).text === 'string')
    : undefined;
  const cleanKnowledge: Record<string, string[]> = {};
  if (r.knowledge && typeof r.knowledge === 'object') {
    for (const [who, ids] of Object.entries(r.knowledge)) {
      if (Array.isArray(ids)) cleanKnowledge[who] = ids.filter((id): id is string => typeof id === 'string');
    }
  }
  const cleanNotoriety: Record<string, number> = {};
  if (r.notoriety && typeof r.notoriety === 'object') {
    for (const [who, v] of Object.entries(r.notoriety)) {
      if (typeof v === 'number' && Number.isFinite(v)) cleanNotoriety[who] = Math.max(0, Math.min(1, v));
    }
  }
  const cleanNeeds: Record<string, Record<string, number>> = {};
  if (r.needs && typeof r.needs === 'object') {
    for (const [who, values] of Object.entries(r.needs)) {
      if (!values || typeof values !== 'object') continue;
      const row: Record<string, number> = {};
      for (const [k, v] of Object.entries(values)) if (typeof v === 'number' && Number.isFinite(v)) row[k] = Math.max(0, Math.min(1, v));
      if (Object.keys(row).length) cleanNeeds[who] = row;
    }
  }
  return {
    version: SAVE_VERSION,
    day: Math.max(1, Math.floor(num(r.day, 1))),
    dayDone: !!r.dayDone,
    bonds: r.bonds && typeof r.bonds === 'object' ? r.bonds : {},
    ...(hasChem ? { chemistry: cleanChem } : {}),
    ...(cleanFlings ? { flings: cleanFlings } : {}),
    memories: r.memories && typeof r.memories === 'object' ? r.memories : {},
    takeaways: r.takeaways && typeof r.takeaways === 'object' ? r.takeaways : {},
    ...(cleanRumors && cleanRumors.length ? { rumors: cleanRumors } : {}),
    ...(Object.keys(cleanKnowledge).length ? { knowledge: cleanKnowledge } : {}),
    ...(Object.keys(cleanNotoriety).length ? { notoriety: cleanNotoriety } : {}),
    ...(Object.keys(cleanNeeds).length ? { needs: cleanNeeds } : {}),
    meters: {
      stock: Math.max(1, num(r.meters?.stock, 100)),
      stockHistory: Array.isArray(r.meters?.stockHistory) ? r.meters!.stockHistory.filter((v) => typeof v === 'number' && Number.isFinite(v)).slice(-60) : [],
      morale: num(r.meters?.morale, 50)
    },
    incidentFreeDays: Math.max(0, Math.floor(num(r.incidentFreeDays, 0))),
    incidentsTotal: Math.max(0, Math.floor(num(r.incidentsTotal, 0))),
    revealedSecrets: Array.isArray(r.revealedSecrets) ? r.revealedSecrets.filter((id): id is CastId => typeof id === 'string' && isCastId(id)) : []
  };
}
