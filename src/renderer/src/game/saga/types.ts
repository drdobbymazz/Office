// Shared types for Endless Saga: multi-season 5-day arcs, reactive twists,
// free-form goals, and persistent AI Showrunner continuity.

import type { StandingChangeUi } from '@/game/app/gameApi';
import type { CastId, ChaosId, EmotionId, RoomId } from '@/game/core/types';
import type { ChapterResult } from '@/game/story/types';

export type SagaArcId =
  | 'corporate_audit'
  | 'hostile_takeover'
  | 'office_civil_war'
  | 'documentary_crew'
  | 'cursed_building'
  | 'murder_mystery';

export type SagaGoalSpec =
  | { kind: 'gather'; room: RoomId; need: number; people?: readonly CastId[]; deadlineHour?: number }
  | { kind: 'bond_shift'; who: CastId; about: CastId; direction: 'up' | 'down'; by: number }
  | { kind: 'spectacle'; chaosPeak?: number; eventsNeeded?: number; chaosIds?: readonly ChaosId[] }
  | { kind: 'morale_rally'; targetMorale: number }
  | { kind: 'drama_action'; actions: readonly ('eliminated' | 'knockedOut' | 'quit' | 'guilty' | 'custom' | 'secret' | 'chaos_any' | 'boss_crown')[]; count: number; targetWho?: CastId }
  | { kind: 'accuse_mole'; tries: number; label: string }
  | { kind: 'finale_showdown'; mode: 'calm_tour' | 'boardroom_vote' | 'peak_spectacle' | 'ceasefire' | 'verdict_trial' };

export type SagaExtraKind =
  | 'wildcard'
  | 'whisper_net'
  | 'peak_mayhem'
  | 'full_house'
  | 'good_vibes'
  | 'hands_on'
  | 'plot_twist';

export interface SagaExtraDef {
  id: SagaExtraKind;
  title: string;
  detail: string;
  icon: string;
}

export interface SagaChapterDef {
  chapter: number; // 1..5
  weekday: string;
  title: string;
  /** Short 1-sentence hook first, optionally followed by 1–2 short plain paragraphs. */
  intro: readonly string[];
  /** Cast portraits shown on the opening card (or omit & set `icon` on mystery days). */
  featured: readonly { id: CastId; face: EmotionId }[];
  icon?: string;
  goalInfo: {
    id: string;
    title: string;
    detail: string;
    icon: string;
    stamp: readonly [string, string];
    room?: RoomId;
  };
  goal: SagaGoalSpec;
  extras: readonly [SagaExtraKind, SagaExtraKind];
  hints: readonly string[];
  suggest: { whisper: readonly string[]; announce: readonly string[] };
  /** Morning setup for the floor: starting convictions, true fact, gossip topics, midday beat. */
  fact: string;
  topics: readonly string[];
  convictions?: readonly { who: CastId; text: string; hidden?: string }[];
  /** Optional bond adjustment on setup (e.g. sparking a feud). */
  sparkBond?: readonly { who: CastId; about: CastId; delta: number }[];
  /** Optional scheduled mid-day narrative beat or event clock (minutes from midnight). */
  midday?: { clock: number; text: string; icon?: string; room?: RoomId; spawnInspector?: boolean };
}

export interface SagaArcDef {
  id: SagaArcId;
  title: string;
  tagline: string;
  premise: string;
  /** In chaos-friendly arcs (Viral / Anomaly), high chaos boosts ratings/standing instead of punishing incidents. */
  chaosFriendly?: boolean;
  chapters: readonly [SagaChapterDef, SagaChapterDef, SagaChapterDef, SagaChapterDef, SagaChapterDef];
}

export interface SagaAiEpisode {
  season: number;
  chapter: number;
  title: string;
  recap: string;
  hook: string;
  twistFact: string;
  topics: string[];
  source: 'model' | 'instinct';
}

export interface SagaSeasonRecord {
  season: number;
  arcId: SagaArcId;
  arcTitle: string;
  ending: 'saved' | 'scraped' | 'closed';
  standing: number;
  wonDays: number;
}

export interface SagaNotes {
  mole: CastId;
  lastEvents: string[];
  lastChaosPeak: number;
  lastMorale: number;
  lastIncidents: number;
  lastWon: boolean | null;
  lastDayTitle: string | null;
  eliminatedNames: string[];
  quitNames: string[];
  customEvents: string[];
  reactiveTwists: string[];
  stats: {
    whispers: number;
    announcements: number;
    powers: number;
    customs: number;
    carried: Partial<Record<CastId, number>>;
  };
}

export interface SagaState {
  version: 1;
  seed: number;
  season: number;
  arcId: SagaArcId;
  arcQueue: SagaArcId[];
  chapter: number;
  stage: 'day' | 'done' | 'ended';
  standing: number;
  standingAtStart: number;
  notesAtStart: SagaNotes;
  notes: SagaNotes;
  results: (ChapterResult | null)[];
  tries: number[];
  aiEpisode: SagaAiEpisode | null;
  history: SagaSeasonRecord[];
}

export interface SagaSaved {
  season: number;
  chapter: number;
  chapters: number;
  arcTitle: string;
  title: string;
  weekday: string;
  standing: number;
}

export interface SagaDayTally {
  won: boolean;
  goalText: string;
  extras: string[];
  incidents: number;
  morale: number;
  chaosPeak: number;
  events: string[];
  lines: string[];
  changes: StandingChangeUi[];
}
