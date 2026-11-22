// Reading an announcement for a summons: "Everyone to the conference room",
// "Free cake in the break room", "Jim, Michael's office, now". Which room it
// names, whether it asks people to go there, and how likely each person is to
// do as they are told (dutiful and kind people go; troublemakers ignore it;
// nobody stops Kevin getting to free food).

import type { CharId, RoomId, TargetRoomId } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import { CAST } from '@/game/core/cast';

const ROOM_WORDS: [TargetRoomId, RegExp][] = [
  ['boss', /\b(michael'?s office|the boss'?s office|boss'?s office|manager'?s office|the boss|boss)\b/i],
  ['meeting', /\b(conference( room)?|meeting room|board ?room)\b/i],
  ['kitchen', /\b(kitchen|break ?room|staff ?room)\b/i],
  ['accounts', /\b(accounting|accounts|accountants'? corner)\b/i],
  ['annex', /\bannex\b/i],
  ['bullpen', /\b(bullpen|sales floor)\b/i]
];

/** Asks people to go somewhere (or offers something worth going for). */
const INVITE_RE = /\b(come|comes|coming|go|head|heads|meet|meeting|everyone|everybody|all staff|all hands|now|free|cake|pizza|party|report to|gather|join|assemble|please)\b/i;
/** Food and treats: everyone is keener, Kevin most of all. */
const FOOD_RE = /\b(free|cake|cakes|pizza|pizzas|party|food|donuts?|doughnuts?|snacks?|lunch|cookies?|biscuits?|treats?|sweets|chocolate|bagels?)\b/i;
/** Everyone, rather than only the people named. */
const EVERYONE_RE = /\b(everyone|everybody|all staff|all hands|all of you|the whole office|whole office|team|staff)\b/i;

/** Words that put a room after them as the place to go: "to the", "in", "into". */
const TO_RE = /\b(to|in|into|at|inside|towards?)\s+(the\s+)?$/i;

/**
 * The room an announcement names, or null. A room after "to" or "in" wins over one
 * mentioned in passing ("The boss wants everyone in the conference room"); otherwise the first.
 */
export function roomNamedIn(text: string): TargetRoomId | null {
  let best: { room: TargetRoomId; at: number; to: boolean } | null = null;
  for (const [room, re] of ROOM_WORDS) {
    const all = new RegExp(re.source, 'gi');
    for (let m = all.exec(text); m; m = all.exec(text)) {
      const to = TO_RE.test(text.slice(Math.max(0, m.index - 14), m.index));
      if (!best || (to && !best.to) || (to === best.to && m.index < best.at)) best = { room, at: m.index, to };
    }
  }
  return best ? best.room : null;
}

/** The text with every room name blanked out ("Michael's office" names a room, not Michael). */
export function withoutRooms(text: string): string {
  let out = text;
  for (const [, re] of ROOM_WORDS) out = out.replace(new RegExp(re.source, 'gi'), ' ');
  return out;
}

export function invitesPeople(text: string): boolean {
  return INVITE_RE.test(text);
}

export function mentionsFood(text: string): boolean {
  return FOOD_RE.test(text);
}

export function speaksToEveryone(text: string): boolean {
  return EVERYONE_RE.test(text);
}

/**
 * How likely someone is to answer a summons, 0..1. Named people mostly come; a
 * general call is answered by most, by temperament.
 */
export function summonChance(id: CharId, opts: { food: boolean; named: boolean }): number {
  if (!isCastId(id)) return opts.named ? 0.95 : 0;
  const t = CAST[id].temperament;
  let p = opts.named
    ? 0.95 - t.mischief * 0.2
    : 0.55 + t.diligence * 0.3 + t.warmth * 0.25 - t.mischief * 0.35;
  if (opts.food) p += id === 'kevin' ? 0.45 : 0.1;
  return Math.max(0.1, Math.min(0.97, p));
}

const NUMBER_WORDS = ['No one', 'One person', 'Two people', 'Three people', 'Four people', 'Five people', 'Six people', 'Seven people',
  'Eight people', 'Nine people', 'Ten people', 'Eleven people', 'Twelve people', 'Thirteen people', 'Fourteen people', 'Fifteen people'];

/** "Seven people head for the conference room." / "Jim and Pam head for ..." / "Nobody moves." */
export function summonLine(names: string[], roomName: string, named: boolean): string {
  if (!names.length) return 'Nobody moves.';
  if (names.length === 1) return `${names[0]} heads for ${roomName}.`;
  if (named && names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} head for ${roomName}.`;
  const n = names.length < NUMBER_WORDS.length ? NUMBER_WORDS[names.length] : `${names.length} people`;
  return `${n} head for ${roomName}.`;
}

export type { RoomId };
