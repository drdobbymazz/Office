import { displayName } from '@/game/core/cast';
import type { CastId } from '@/game/core/types';
import type { WorldLocation } from '@/game/core/world';
import { CHAPTER_DEFS, weekFacts } from './chapters';
import { HEIST_CHAPTER_DEFS, heistWeekFacts } from './heistChapters';
import { HEIST_ENDING_RULE, HEIST_META, heistEndingText, heistEpilogueLines } from './heistText';
import { PARK_CHAPTER_DEFS, parkWeekFacts } from './parkChapters';
import { PARK_ENDING_RULE, PARK_EPISODE_META, parkEndingText, parkEpilogueLines } from './parkText';
import { ENDING, STANDING_START, endingFor, type EndingId } from './rules';
import { ENDING_RULE, STORY_TITLE, endingText, epilogueLines } from './text';
import type { ChapterDef, EpisodeId, WeekNotes } from './types';

export interface EpisodeEnding {
  id: EndingId;
  title: string;
  text: string[];
  epilogue: string[];
}

export interface EpisodeDef {
  readonly id: EpisodeId;
  readonly number: number;
  readonly title: string;
  readonly subtitle: string;
  readonly tagline: string;
  readonly location: WorldLocation;
  readonly hasIntro: boolean;
  readonly unitLabel: string;
  readonly standingLabel: string;
  readonly standingNote: string;
  readonly endingRule: string;
  readonly standingStart: number;
  readonly stateKey: string;
  readonly worldKey: string;
  /** The title banner on the episode's first card. Defaults to the title. */
  readonly banner?: string;
  /** One line under the title banner on the episode's first card. */
  readonly blurb: string;
  /**
   * What this episode's standing number means, in a few plain words ("How well the outing is going").
   * When absent the cards use Episode 1's own wording for Branch standing.
   */
  readonly standingMeaning?: string;
  /** What the whole episode is called on the report and ending cards ("The week"). */
  readonly spanLabel: string;
  /** The episode's colour for its cards (a CSS colour). */
  readonly band: string;
  /** The ending card's heading and the line under it. */
  readonly endHead: string;
  readonly endSub: string;
  /** The last report's button to the ending. */
  readonly endNextLabel: string;
  readonly chapters: readonly ChapterDef[];
  /** The simulation's day number for chapter 1 (the clock shows its weekday). Default 1, a Monday. */
  readonly firstDay?: number;
  readonly weekFacts: (notes: WeekNotes, chapter: number) => [string, string][];
  /** Which ending the episode earns. `notes` lets an episode decide by what happened, not only by the number. */
  readonly endingFor: (standing: number, lastWon: boolean, notes?: WeekNotes) => EndingId;
  readonly buildEnding: (standing: number, lastWon: boolean, notes: WeekNotes) => EpisodeEnding;
}

export const OFFICE_EPISODE: EpisodeDef = {
  id: 'office',
  number: 1,
  title: 'Office',
  subtitle: STORY_TITLE,
  tagline: 'Five days inside Scranton Branch under a Corporate axe. Keep tempers steady, close Mr Figgis, find the leak, and survive Friday.',
  location: 'office',
  hasIntro: false,
  unitLabel: 'Day',
  standingLabel: 'Corporate Standing',
  standingNote: 'Your standing after five days decides the branch.',
  endingRule: ENDING_RULE,
  standingStart: STANDING_START,
  stateKey: 'story.state.v1',
  worldKey: 'story.world.v1',
  banner: STORY_TITLE,
  blurb: 'A story in five days, Monday to Friday',
  spanLabel: 'The week',
  band: 'var(--cth-lemon)',
  endHead: 'FRIDAY, 17:00',
  endSub: 'The week is over',
  endNextLabel: 'See how the week ended',
  chapters: CHAPTER_DEFS,
  weekFacts,
  endingFor,
  buildEnding: (standing, lastWon, n) => {
    const id = endingFor(standing, lastWon);
    const t = endingText(id, {
      call: n.call,
      accounts: n.accounts,
      figgis: n.figgis,
      leakName: displayName(n.leak),
      leakFound: n.leakFound,
      inspection: n.inspection,
      fridayWon: lastWon,
      lostOnFriday: !lastWon && standing >= ENDING.saved,
    });
    const st = n.stats;
    const most = st ? (Object.entries(st.carried) as [CastId, number][]).sort((a, b) => b[1] - a[1])[0] : undefined;
    const epilogue = epilogueLines({
      leakName: n.leakFound !== undefined ? displayName(n.leak) : undefined,
      leakFound: n.leakFound,
      accounts: n.accounts,
      figgis: n.figgis,
      speech: n.speech,
      wrongedName: n.wronged?.length ? displayName(n.wronged[0]) : undefined,
      carried: most ? { name: displayName(most[0]), times: most[1] } : undefined,
      whispers: st?.whispers ?? 0,
      announcements: st?.announcements ?? 0,
      powers: st?.powers ?? 0,
    });
    return { id, title: t.title, text: t.text, epilogue };
  },
};

export const PARK_EPISODE: EpisodeDef = {
  id: 'park',
  number: 2,
  title: PARK_EPISODE_META.title,
  subtitle: PARK_EPISODE_META.subtitle,
  tagline: PARK_EPISODE_META.tagline,
  location: 'park',
  hasIntro: true,
  unitLabel: PARK_EPISODE_META.unitLabel,
  standingLabel: PARK_EPISODE_META.standingLabel,
  standingNote: PARK_EPISODE_META.standingNote,
  endingRule: PARK_ENDING_RULE,
  standingStart: STANDING_START,
  stateKey: 'story.park.state.v1',
  worldKey: 'story.park.world.v1',
  blurb: 'An outdoor outing in three acts',
  standingMeaning: 'How well the outing is going',
  spanLabel: 'The outing',
  band: 'var(--cth-mint)',
  endHead: 'LATE AFTERNOON',
  endSub: 'Outing complete',
  endNextLabel: 'See how the outing ended',
  chapters: PARK_CHAPTER_DEFS,
  weekFacts: parkWeekFacts,
  endingFor: (standing, lastWon) => (standing < 40 ? 'closed' : standing >= 60 && lastWon ? 'saved' : 'scraped'),
  buildEnding: (standing, lastWon, notes) => {
    const id: EndingId = standing < 40 ? 'closed' : standing >= 60 && lastWon ? 'saved' : 'scraped';
    const t = parkEndingText(id, notes);
    const epilogue = parkEpilogueLines(id, notes);
    return { id, title: t.title, text: t.text, epilogue };
  },
};

/**
 * Episode 3's ending: what happened decides first, then Cover. The wrong tape at the screening is
 * always caught; the right tape with two or more talkers is decided by Cover (under 40 closed);
 * Friday won is a clean getaway with 60 or more and a near thing below.
 */
export function heistEndingFor(standing: number, lastWon: boolean, notes?: WeekNotes): EndingId {
  if (!lastWon) {
    if (!notes?.heistSwitched) return 'closed';
    return standing < 40 ? 'closed' : 'scraped';
  }
  return standing >= 60 ? 'saved' : 'scraped';
}

export const HEIST_EPISODE: EpisodeDef = {
  id: 'heist',
  number: 3,
  title: HEIST_META.title,
  subtitle: HEIST_META.subtitle,
  tagline: HEIST_META.tagline,
  location: 'office',
  hasIntro: true,
  unitLabel: HEIST_META.unitLabel,
  standingLabel: HEIST_META.standingLabel,
  standingNote: HEIST_META.standingNote,
  endingRule: HEIST_ENDING_RULE,
  standingStart: STANDING_START,
  stateKey: 'story.heist.state.v1',
  worldKey: 'story.heist.world.v1',
  blurb: HEIST_META.blurb,
  standingMeaning: 'How well the office is hiding the switch from Corporate',
  spanLabel: HEIST_META.spanLabel,
  band: 'var(--cth-coral)',
  endHead: HEIST_META.endHead,
  endSub: HEIST_META.endSub,
  endNextLabel: HEIST_META.endNextLabel,
  chapters: HEIST_CHAPTER_DEFS,
  firstDay: 3,
  weekFacts: heistWeekFacts,
  endingFor: heistEndingFor,
  buildEnding: (standing, lastWon, notes) => {
    const id = heistEndingFor(standing, lastWon, notes);
    const t = heistEndingText(id, notes);
    return { id, title: t.title, text: t.text, epilogue: heistEpilogueLines(id, notes) };
  },
};

/** Every episode, in play order. Adding one here is all the title screen and the saves need. */
export const EPISODES: readonly EpisodeDef[] = [OFFICE_EPISODE, PARK_EPISODE, HEIST_EPISODE];

export function episodeById(id: EpisodeId): EpisodeDef {
  return EPISODES.find((e) => e.id === id) ?? OFFICE_EPISODE;
}

/** The episode after this one in play order, or null after the last. */
export function nextEpisode(id: EpisodeId): EpisodeDef | null {
  const i = EPISODES.findIndex((e) => e.id === id);
  return i >= 0 && i + 1 < EPISODES.length ? EPISODES[i + 1] : null;
}
