// Reading an announcement for a summons: "Everyone to the conference room",
// "Free cake in the break room", "Jim, Michael's office, now". Which room it
// names, whether it asks people to go there, and how likely each person is to
// do as they are told (dutiful and kind people go; troublemakers ignore it;
// nobody stops Kevin getting to free food). Someone sure of an idea of their own
// ignores a call, unless the idea itself says what would move them ("only food
// would get me out of here", "only if someone asks for me by name", "not unless
// Ryan goes too").

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
const INVITE_RE = /\b(come|comes|coming|go|head|heads|meet|meeting|everyone|everybody|all staff|all hands|now|free|cake|pizza|party|report to|gather|join|assemble|huddle|head over|swing by|get in|come into|show up|please)\b/i;
/**
 * Says something is happening in the room it names, which is an invitation too:
 * "The call from Corporate is in the conference room at three."
 */
const EVENT_RE = /\b(call|calls|phone call|talk|speech|presentation|celebration|lunch|briefing|news|starts?|starting|begins?|at (one|two|three|four|five|noon|half past|\d{1,2}))\b|\b\d{1,2}(:\d\d)?\s*(am|pm|o'?clock)?\b|\bo'?clock\b|\bin (a|one|two|five|ten|fifteen|\d+) minutes?\b/i;
/** Tells people to keep away: "Nobody go to the annex", "Stay out of the break room". Not a summons. */
const KEEP_AWAY_RE = /\b(don'?t|do not|never)\s+(go|come|head|enter|walk|run)\b|\b(nobody|no one)\s+(go|goes|come|comes|enter|enters|is to)\b|\b(stay|keep)\s+(out of|away from)\b/i;
/** Food and treats: everyone is keener, Kevin most of all. */
const FOOD_RE = /\b(free|cake|cakes|pizza|pizzas|party|food|donuts?|doughnuts?|snacks?|lunch|cookies?|biscuits?|treats?|sweets|chocolate|bagels?|tacos?|burritos?|burgers?|sushi|ice cream|brownies?|drinks?)\b/i;
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
  if (KEEP_AWAY_RE.test(text)) return false;
  return INVITE_RE.test(text) || EVENT_RE.test(withoutRooms(text));
}

/** Tells people to stay away from somewhere ("Nobody go to the annex"). */
export function keepsAway(text: string): boolean {
  return KEEP_AWAY_RE.test(text);
}

/** What would move someone who is sure of an idea, when the idea says so in plain words. */
export type ConvictionLever = { kind: 'food' } | { kind: 'named' } | { kind: 'follow'; who: string };

/**
 * Read an idea someone is sure of for the one thing that would still make them answer a call:
 * "Only food would get me out of here" (food), "I will only come out if someone asks for me by
 * name" (being named), "I am not going anywhere unless Ryan goes too" (Ryan going). Null when it
 * says no such thing: then they ignore every call.
 */
export function convictionLever(idea: string): ConvictionLever | null {
  const t = idea.toLowerCase();
  const follow = /\b(?:unless|until|only if)\s+([a-z]+)\s+(?:goes|comes|is there|does)\b/.exec(t) ?? /\bnot\b[^.]*\bwithout\s+([a-z]+)\b/.exec(t);
  if (follow && !['food', 'snacks', 'me', 'my', 'a', 'an', 'the', 'someone', 'anyone', 'everyone', 'it', 'them'].includes(follow[1])) {
    return { kind: 'follow', who: follow[1] };
  }
  if (/\b(only|unless|except)\b/.test(t) && FOOD_RE.test(t)) return { kind: 'food' };
  if (/\b(by name|my name|asks? for me|calls? for me|calls? me|names? me)\b/.test(t)) return { kind: 'named' };
  return null;
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
  if (named && names.length <= 3) return `${listNames(names)} head for ${roomName}.`;
  const n = names.length < NUMBER_WORDS.length ? NUMBER_WORDS[names.length] : `${names.length} people`;
  return `${n} head for ${roomName}.`;
}

/**
 * The people who heard a call and chose to stay (held by the story, or sure of an idea of their
 * own), so a call that moves fewer people than hoped says why: "Michael stays where he is."
 */
export function stayedLine(stayed: string[]): string {
  if (!stayed.length) return '';
  if (stayed.length === 1) {
    const p = pronounOf(stayed[0]);
    return `${stayed[0]} stays where ${p} ${p === 'they' ? 'are' : 'is'}.`;
  }
  if (stayed.length <= 5) return `${listNames(stayed)} stay where they are.`;
  const n = stayed.length < NUMBER_WORDS.length ? NUMBER_WORDS[stayed.length] : `${stayed.length} people`;
  return `${n} stay where they are.`;
}

function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function pronounOf(name: string): string {
  const id = (Object.keys(CAST) as (keyof typeof CAST)[]).find((k) => CAST[k].name === name);
  const p = id ? CAST[id].pronoun : 'they';
  return p === 'she' ? 'she' : p === 'he' ? 'he' : 'they';
}

export type { RoomId };
