// Shapes shared by the story engine: what a chapter is, what it may do to the
// day, and what survives between days.

import type { StandingChangeUi } from '@/game/app/gameApi';
import type { ChaosId, ChaosTarget, CharId, CastId, PlanKind, RoomId } from '@/game/core/types';
import type { SceneTrigger } from '@/game/brain/api';
import type { Sim } from '@/game/sim';
import type { Rng } from '@/game/sim/rng';

export type GoalState = 'open' | 'won' | 'lost';

export interface GoalDef {
  id: string;
  title: string;
  detail: string;
  icon: string;
}

/** What happened during the week that later days (and the ending) remember. Saved with the story. */
export interface WeekNotes {
  /** Thursday's leak, picked when the week starts. */
  leak: CastId;
  /** Monday: everyone has heard that the branch may close (set after 15:00 either way). */
  closureKnown?: boolean;
  call?: boolean;
  accounts?: boolean;
  figgis?: boolean;
  leakFound?: boolean;
  inspection?: number;
}

/** Something the player did with a tool or power (picking up and poking are seen on the bus). */
export interface PlayerAction {
  kind: 'power' | 'whisper' | 'announce' | 'cue' | 'anything';
  id?: ChaosId;
  target?: ChaosTarget;
  who?: CharId;
  text?: string;
}

/** What a chapter's logic can use and do. */
export interface ChapterCtx {
  readonly sim: Sim;
  readonly notes: WeekNotes;
  /** Seeded for this week and day (not the sim's own random numbers). */
  readonly rng: Rng;
  /** The main goal's state right now. */
  main(): GoalState;
  extra(id: string): GoalState;
  /** End the main goal: won or lost, with the plain sentences for the report. */
  win(lines: string[]): void;
  lose(lines: string[]): void;
  /** Settle an extra goal (once). */
  setExtra(id: string, state: 'won' | 'lost'): void;
  /** What the player has used today. */
  readonly used: { powers: ChaosId[]; whisper: number; announce: number; cue: number; anything: number };
  /** Run something after this many sim seconds (dropped if the day is over). */
  after(seconds: number, fn: () => void): void;
}

export interface ChaosStartInfo {
  id: ChaosId;
  target: ChaosTarget;
  room?: RoomId;
}

export interface SceneDoneInfo {
  people: CharId[];
  trigger: SceneTrigger;
  planKind?: PlanKind;
  room?: RoomId;
}

/** One chapter's logic for one day. Every hook is optional except the core three. */
export interface ChapterRun {
  /** Right after the day begins (08:50, before anyone arrives). */
  setup(): void;
  /** Every frame while the day is being played. dt in sim seconds. */
  update(dt: number): void;
  /** The main goal's live progress (0..1) and a few words. */
  status(): { progress: number; status: string };
  /** At five o'clock, before open goals are settled. */
  atFive?(): void;
  onChaosStart?(e: ChaosStartInfo): void;
  onChaosEnd?(id: ChaosId): void;
  onSceneDone?(e: SceneDoneInfo): void;
  onPickedUp?(who: CharId): void;
  onAction?(a: PlayerAction): void;
  accuse?(who: CharId): void;
  accuseUi?(): { triesLeft: number; accused: CharId[]; label: string } | null;
  /** Held where they are by the story: announcements do not move them. */
  pinned?(who: CharId): boolean;
}

export interface ExtraDef extends GoalDef {
  /** How it is settled at five o'clock if still open. */
  atFive: 'won' | 'lost';
}

export interface ChapterDef {
  chapter: number;
  weekday: string;
  title: string;
  intro: string[];
  hints: string[];
  goal: GoalDef;
  extras: ExtraDef[];
  locked: Partial<Record<ChaosId, string>>;
  /** The plain cause on the report for the main goal: [won, lost]. */
  change: [string, string];
  create(ctx: ChapterCtx): ChapterRun;
}

export interface ChapterResult {
  won: boolean;
  text: string[];
  changes: StandingChangeUi[];
  standingBefore: number;
  standingAfter: number;
  /** Titles of the extras done. */
  extras: string[];
}
