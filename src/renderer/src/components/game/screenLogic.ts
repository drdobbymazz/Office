// The decisions behind the full-screen cards, kept apart from React so they can be tested: how a
// chapter's opening is split, who is pictured on each day's card, what goes on which page of the
// report, and which button leads after a day is won or lost.

import type { EmotionId } from '@/game/core/types';
import type { EpisodeId } from '@/game/story/types';

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
 * Episode 1 (Office): Monday is Michael's day; Tuesday Angela and Oscar (and Kevin between them);
 * Wednesday the client and the sales team; Friday Michael and the inspector; Thursday shows the
 * leak's envelope rather than faces. Episode 2 (Day in the Park): three outdoor acts. Episode 3
 * (Inside Job): Ms Vane and the people closest to the tape.
 */
export function dayPicture(chapter: number, episodeId: EpisodeId = 'office'): DayPicture {
  if (episodeId === 'heist') {
    switch (chapter) {
      case 1: return { faces: [{ id: 'visitor:vane', face: 'suspicious' }, { id: 'michael', face: 'nervous' }] };
      case 2: return { faces: [{ id: 'michael', face: 'nervous' }, { id: 'dwight', face: 'determined' }, { id: 'pam', face: 'nervous' }] };
      case 3: return { faces: [{ id: 'visitor:vane', face: 'suspicious' }, { id: 'kevin', face: 'nervous' }, { id: 'michael', face: 'nervous' }] };
      default: return { faces: [] };
    }
  }
  if (episodeId === 'park') {
    switch (chapter) {
      case 1: return { faces: [{ id: 'michael', face: 'excited' }, { id: 'stanley', face: 'tired' }, { id: 'dwight', face: 'suspicious' }] };
      case 2: return { faces: [{ id: 'jim', face: 'amused' }, { id: 'dwight', face: 'angry' }, { id: 'kevin', face: 'happy' }] };
      case 3: return { faces: [{ id: 'visitor:ranger', face: 'suspicious' }, { id: 'michael', face: 'nervous' }] };
      default: return { faces: [] };
    }
  }
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
 * Whose name is tagged on the floor while the camera is zoomed out: the people the day's job is
 * about. Not the card's portraits (Wednesday pictures two salespeople, and tagging them would
 * answer "who should pitch?"), and nobody on Thursday, when finding the right person is the job.
 * This is the fallback: a chapter that names its own tags (`StoryUi.marks`) wins over it.
 */
export function storyMarks(chapter: number, episodeId: EpisodeId = 'office'): string[] {
  if (episodeId === 'heist') return chapter >= 1 && chapter <= 3 ? ['visitor:vane'] : [];
  if (episodeId === 'park') {
    switch (chapter) {
      case 1: return ['michael'];
      case 2: return ['jim', 'dwight'];
      case 3: return ['visitor:ranger', 'michael'];
      default: return [];
    }
  }
  switch (chapter) {
    case 1: return ['michael'];
    case 2: return ['angela', 'oscar'];
    case 3: return ['visitor:figgis'];
    case 5: return ['michael', 'visitor:inspector'];
    default: return [];
  }
}

/**
 * The floor tags to show right now: the chapter's own (each may carry a few words) when it names
 * them, else the day's fixed list. A person is tagged once. Nothing outside a story chapter (0).
 */
export function markList(
  chapter: number, episodeId: EpisodeId | undefined, marks: readonly { id: string; label?: string }[] | undefined
): { id: string; label?: string }[] {
  if (!chapter) return [];
  if (marks) {
    const seen = new Set<string>();
    return marks.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }
  return storyMarks(chapter, episodeId).map((id) => ({ id }));
}

/**
 * Page one of the report holds the result. On a phone (under 420 px tall) only the first paragraph
 * of what happened stays there and the rest opens page two, so the standing changes, the bar and
 * the week fit on page one without scrolling.
 */
export function resultLines(text: readonly string[], height: number): { shown: string[]; moved: string[] } {
  return height < 420 && text.length > 1 ? { shown: text.slice(0, 1), moved: text.slice(1) } : { shown: [...text], moved: [] };
}

/** The report's two ways on, in the order they sit (the lead one last, on the right). */
export interface ReportActions {
  lead: 'next' | 'retry';
  /** Retrying a won day undoes its standing, so it asks first. */
  confirmRetry: boolean;
  nextLabel: string;
}

/**
 * `endNextLabel` is the episode's own button to its ending ("See how the job ended"); without it
 * (an older save, the saga) the label is guessed from the unit word as before.
 */
export function reportActions(won: boolean, lastDay: boolean, unitLabel = 'Day', endNextLabel?: string): ReportActions {
  const isDay = unitLabel.toLowerCase() === 'day';
  if (won) {
    const toEnd = endNextLabel || (isDay ? 'See how the week ended' : 'See how the outing ended');
    return {
      lead: 'next',
      confirmRetry: true,
      nextLabel: lastDay ? toEnd : (isDay ? 'Next day' : `Next ${unitLabel.toLowerCase()}`),
    };
  }
  return { lead: 'retry', confirmRetry: false, nextLabel: lastDay ? 'See the ending' : 'Move on anyway' };
}

/**
 * The small line under the title card's "Story Mode - Episodes" button, built from the list so any
 * number of episodes fits: "3 episodes: Office, Day in the Park, Inside Job". With a saved episode
 * it leads with that one. The button cuts what still does not fit with an ellipsis.
 */
export function episodeListLine(episodes: readonly { number: number; title: string; saved?: unknown }[]): string {
  const n = episodes.length;
  const saved = episodes.find((e) => e.saved);
  if (saved) return `Continue Ep ${saved.number} (${saved.title}) · ${n} episode${n === 1 ? '' : 's'}`;
  const names = episodes.map((e) => e.title).join(', ');
  return n === 1 ? `Episode 1: ${names}` : `${n} episodes: ${names}`;
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
