// The decisions behind the full-screen cards, kept apart from React so they can be tested: how a
// chapter's opening is split, who is pictured on each day's card, what goes on which page of the
// report, and which button leads after a day is won or lost.

import type { EmotionId } from '@/game/core/types';

/** The first sentence of the chapter's opening, to lead with, and the rest. */
export function splitHook(intro: readonly string[]): { hook: string; rest: string[] } {
  const first = intro[0] ?? '';
  const m = first.match(/^(.+?[.!?])(\s+|$)([\s\S]*)$/);
  if (!m) return { hook: first, rest: intro.slice(1) };
  const tail = m[3].trim();
  return { hook: m[1], rest: [...(tail ? [tail] : []), ...intro.slice(1)] };
}

/** Who (or what) is pictured on a day's card: portraits with a mood, or one icon. */
export type DayPicture = { faces: { id: string; face: EmotionId }[]; icon?: undefined } | { faces: []; icon: string };

/**
 * Monday is Michael's day; Tuesday Angela and Oscar (and Kevin between them); Wednesday the client
 * and the sales team; Friday Michael and the inspector. Thursday shows the leak's envelope rather
 * than faces: picturing some of the staff would point at suspects the game has not.
 */
export function dayPicture(chapter: number): DayPicture {
  switch (chapter) {
    case 1: return { faces: [{ id: 'michael', face: 'nervous' }] };
    case 2: return { faces: [{ id: 'angela', face: 'angry' }, { id: 'oscar', face: 'angry' }, { id: 'kevin', face: 'nervous' }] };
    case 3: return { faces: [{ id: 'visitor:figgis', face: 'neutral' }, { id: 'jim', face: 'nervous' }, { id: 'dwight', face: 'determined' }] };
    case 4: return { faces: [], icon: 'secretLeak' };
    case 5: return { faces: [{ id: 'michael', face: 'nervous' }, { id: 'visitor:inspector', face: 'neutral' }] };
    default: return { faces: [] };
  }
}

/**
 * Page one of the report holds the result. On the shortest phones (under 380 px tall) only the
 * first sentence of what happened stays there; the rest opens page two, so page one never scrolls
 * past its standing changes.
 */
export function resultLines(text: readonly string[], height: number): { shown: string[]; moved: string[] } {
  return height < 380 && text.length > 1 ? { shown: text.slice(0, 1), moved: text.slice(1) } : { shown: [...text], moved: [] };
}

/** The report's two ways on, in the order they sit (the lead one last, on the right). */
export interface ReportActions {
  lead: 'next' | 'retry';
  /** Retrying a won day undoes its standing, so it asks first. */
  confirmRetry: boolean;
  nextLabel: string;
}

export function reportActions(won: boolean, lastDay: boolean): ReportActions {
  if (won) return { lead: 'next', confirmRetry: true, nextLabel: lastDay ? 'See how the week ended' : 'Next day' };
  return { lead: 'retry', confirmRetry: false, nextLabel: lastDay ? 'See the ending' : 'Move on anyway' };
}

/** The staged reveal of the report's first page: when each stage starts (ms) and how long the count runs. */
export function revealTimes(changes: number, delta: number): { times: number[]; countMs: number } {
  const countMs = Math.min(900, Math.max(300, Math.abs(Math.round(delta)) * 45));
  const t = [250];
  for (let i = 0; i < changes; i++) t.push(600 + i * 220);
  const countAt = 600 + changes * 220 + 100;
  t.push(countAt, countAt + countMs + 150);
  return { times: t, countMs };
}
