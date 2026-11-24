import { displayName } from '@/game/core/cast';
import type { CastId } from '@/game/core/types';
import type { WorldLocation } from '@/game/core/world';
import { CHAPTER_DEFS, weekFacts } from './chapters';
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
  readonly chapters: readonly ChapterDef[];
  readonly weekFacts: (notes: WeekNotes, chapter: number) => [string, string][];
  readonly endingFor: (standing: number, lastWon: boolean) => EndingId;
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

export const EPISODES: readonly EpisodeDef[] = [OFFICE_EPISODE, PARK_EPISODE];

export function episodeById(id: EpisodeId): EpisodeDef {
  return id === 'park' ? PARK_EPISODE : OFFICE_EPISODE;
}
