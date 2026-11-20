// Fill the placeholders in a line of narration and tidy the result.

import type { ChaosId, CharId, RoomId } from '@/game/core/types';
import { displayName } from '@/game/core/cast';
import { room as roomDef } from '@/game/core/world';
import { CHAOS_TEXT } from './chaosText';
import type { ChaosText } from './types';

export interface TextVars {
  room?: RoomId | null;
  who?: CharId | null;
  other?: CharId | null;
}

/** "{room} is on fire." + { room: 'kitchen' } -> "The break room is on fire." */
export function fillText(template: string, vars: TextVars): string {
  const out = template
    .replace(/\{room\}/g, vars.room ? roomDef(vars.room).name : 'the office')
    .replace(/\{who\}/g, vars.who ? displayName(vars.who) : 'someone')
    .replace(/\{other\}/g, vars.other ? displayName(vars.other) : 'someone')
    .replace(/\s+/g, ' ')
    .trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** One of an event's five lines (start, end, fact, aftermath, memory), filled in. */
export function chaosLine(id: ChaosId, which: keyof ChaosText, vars: TextVars): string {
  return fillText(CHAOS_TEXT[id][which], vars);
}
