// The numbers of story mode: what each action costs, the daily budgets, how
// Branch Standing moves at the end of a day, and which ending a final standing
// earns. Pure functions, so they are easy to test.

import type { ActionId, StandingChangeUi } from '@/game/app/gameApi';
import type { ChaosId } from '@/game/core/types';
import { CHAOS_IDS } from '@/game/core/types';
import { CHAOS } from '@/game/core/chaos';
import { CHANGES } from './text';

/** Influence for each day of the week, Monday first. */
export const BUDGETS = [8, 8, 6, 7, 10] as const;
export const CHAPTERS = 5;

/** Branch Standing at the start of the week. */
export const STANDING_START = 40;
/** Influence given at once for each extra goal done. */
export const EXTRA_INFLUENCE = 2;

export const STANDING = {
  won: 15,
  lost: -10,
  extra: 5,
  incident: -2,
  incidentCap: -10,
  moraleHigh: 3,
  moraleLow: -3
} as const;

const TOOL_COSTS = { whisper: 1, cue: 1, announce: 1, anything: 3 } as const;

/** What a power costs: from how much chaos it causes. */
export function powerCost(id: ChaosId): number {
  const c = CHAOS[id]?.chaos ?? 0;
  return c <= 10 ? 2 : c <= 18 ? 3 : 4;
}

export function costOf(action: ActionId): number {
  if (action in TOOL_COSTS) return TOOL_COSTS[action as keyof typeof TOOL_COSTS];
  return powerCost(action as ChaosId);
}

/** Every action's cost, for the UI. Picking up, dropping, throwing and poking are free (absent). */
export function allCosts(): Partial<Record<ActionId, number>> {
  const out: Partial<Record<ActionId, number>> = { ...TOOL_COSTS };
  for (const id of CHAOS_IDS) out[id] = powerCost(id);
  return out;
}

export function budgetFor(chapter: number): number {
  return BUDGETS[Math.max(0, Math.min(BUDGETS.length - 1, chapter - 1))];
}

export interface DayTally {
  won: boolean;
  /** Plain cause for the main goal line ("The call with Corporate went ahead"). */
  goalText: string;
  /** Titles of the extra goals done. */
  extras: string[];
  incidents: number;
  /** Morale (0..100) at five o'clock. */
  morale: number;
}

/** The standing changes a day earns, each with its plain cause. */
export function standingChanges(t: DayTally): StandingChangeUi[] {
  const out: StandingChangeUi[] = [{ text: t.goalText, delta: t.won ? STANDING.won : STANDING.lost }];
  for (const title of t.extras) out.push({ text: CHANGES.extra(title), delta: STANDING.extra });
  if (t.incidents > 0) out.push({ text: CHANGES.incidents(t.incidents), delta: Math.max(STANDING.incidentCap, t.incidents * STANDING.incident) });
  if (t.morale >= 60) out.push({ text: CHANGES.moraleHigh, delta: STANDING.moraleHigh });
  else if (t.morale <= 30) out.push({ text: CHANGES.moraleLow, delta: STANDING.moraleLow });
  return out;
}

export function applyChanges(standing: number, changes: readonly StandingChangeUi[]): number {
  const total = changes.reduce((s, c) => s + c.delta, 0);
  return Math.max(0, Math.min(100, Math.round(standing + total)));
}

export type EndingId = 'saved' | 'scraped' | 'closed';

export function endingFor(standing: number): EndingId {
  return standing >= 65 ? 'saved' : standing >= 40 ? 'scraped' : 'closed';
}
