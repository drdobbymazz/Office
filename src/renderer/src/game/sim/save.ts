// What survives between sessions. Positions and scenes are never saved: a
// restored game always starts a day at 08:50 with people arriving.

import type { CastId } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import type { BondEntry } from './bonds';
import type { Memory } from './memory';

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  /** The day being played when saved. */
  day: number;
  /** True if that day had finished (restoring starts the next one). */
  dayDone: boolean;
  /** "michael>jim" -> bond. */
  bonds: Record<string, BondEntry>;
  memories: Record<string, Memory[]>;
  takeaways: Record<string, string[]>;
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
  return {
    version: SAVE_VERSION,
    day: Math.max(1, Math.floor(num(r.day, 1))),
    dayDone: !!r.dayDone,
    bonds: r.bonds && typeof r.bonds === 'object' ? r.bonds : {},
    memories: r.memories && typeof r.memories === 'object' ? r.memories : {},
    takeaways: r.takeaways && typeof r.takeaways === 'object' ? r.takeaways : {},
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
