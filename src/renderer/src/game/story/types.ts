// Shapes shared by the story engine: what a chapter is, what it may do to the
// day, and what survives between days.

import type { ActionId, StandingChangeUi } from '@/game/app/gameApi';
import type { ChaosId, ChaosTarget, CharId, CastId, EmotionId, PlanKind, RoomId } from '@/game/core/types';
import type { SceneTrigger } from '@/game/brain/api';
import type { Sim } from '@/game/sim';
import type { Rng } from '@/game/sim/rng';

export type GoalState = 'open' | 'won' | 'lost';

export type EpisodeId = 'office' | 'park';

export interface GoalDef {
  id: string;
  title: string;
  detail: string;
  icon: string;
  /** The stamp banner when it is settled, two or three shouty words: [won, lost] ("CALL MADE", "NO CALL"). */
  stamp?: [string, string];
  /** Where it happens, for the banner's sparkle on the floor. */
  room?: RoomId;
}

/** One line of a scripted scene (a story beat written by hand, so it never waits on the model). */
export interface ScriptLine {
  /** Who says it. Must be on the floor, unless `voice` is set. */
  who?: CharId;
  /** A voice with no body on the floor (the vice president on the speakerphone): shown as a caption. */
  voice?: { name: string; icon?: string; room?: RoomId };
  text: string;
  kind?: 'say' | 'shout' | 'whisper' | 'think';
  emotion?: EmotionId;
  /** Who it is said to. */
  to?: CharId;
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
  /** Thursday: when the fax machine beeped for the leak (clock minutes). */
  leakTimes?: number[];
  /** Thursday: people wrongly accused of leaking (they are still hurt on Friday). */
  wronged?: CastId[];
  /** Friday: what became of Michael's farewell speech. */
  /** Michael's farewell speech: during the tour, after it to an ovation, after it to a thin crowd, or never given. */
  speech?: 'during' | 'after' | 'quiet' | 'never';
  /** Friday: problems on the inspector's tour, and how many were dealt with. */
  tour?: { of: number; fixed: number };
  /** The whole week, for the ending's epilogue: what the player used and who they carried. */
  stats?: WeekStats;
  /** Episode 2 (Day in the Park) cross-act notes. */
  parkRally?: boolean;
  parkTruce?: boolean;
  parkInspection?: number;
  parkGrill?: boolean;
}

export interface WeekStats {
  whispers: number;
  announcements: number;
  powers: number;
  /** How many times each person was picked up. */
  carried: Partial<Record<CastId, number>>;
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
  /**
   * Play hand-written lines as a scene now, in order (each speaker must be on the floor; voice lines
   * show as captions). `then: 'model'` lets the model carry the scene on afterwards. `done` runs once
   * the last line has been spoken (or at once if nobody can speak). Lines with nobody to say them are skipped.
   */
  script(lines: ScriptLine[], opts?: { room?: RoomId; then?: 'model' | 'none'; why?: string; done?: () => void }): void;
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
  /** How long (sim seconds) people an announcement sends to this room wait there today; undefined for the usual. */
  summonStay?(room: RoomId): number | undefined;
  /**
   * The next time of day (clock minutes) worth being at normal speed for, when nothing that needs
   * the player happens before it: the player may skip ahead to it. Null when there is nothing to skip to.
   */
  nextBeat?(): number | null;
  /** What the office is talking about right now (plain sentences); small talk picks from these. */
  topics?(): string[];
  /** Side effects to warn about before the player confirms an action ("Using a power fails Quiet hands"). */
  warns?(): Partial<Record<ActionId, string>>;
  /** 0..1: how much is at stake right now (deadlines, the tour), for the music. */
  stakes?(): number;
  /**
   * A change in how `who` feels about `about` that a scene is about to make. Return a replacement delta
   * (e.g. 0 to ignore it while the chapter is counting progress), or undefined to leave it alone.
   */
  vetoShift?(who: CharId, about: CharId, delta: number): number | undefined;
  /** Nothing left today can change the main goal's result (the player may finish the day early). Defaults to main goal settled. */
  settled?(): boolean;
}

export type SuggestIdea = string | { text: string; for?: CharId[]; help?: boolean };

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
  /** Recipe tips shown only after a failed try or a retry (the card's `hints` are clues). */
  help?: string[];
  /** One sentence for the card on what happened before (from the week's notes), or null. */
  recap?(notes: WeekNotes): string | null;
  /**
   * Story-aware suggestions for the whisper and loudspeaker boxes. A plain string is offered for
   * anyone. An idea with `for` is offered only when whispering one of those people, and one marked
   * `help` only after a failed try or a retry (it gives the day's answer away).
   */
  suggest?: { whisper?: SuggestIdea[]; announce?: SuggestIdea[] };
  /** Daily influence budget override (falls back to BUDGETS[chapter - 1] when absent). */
  budget?: number;
  /** Today's prices where they differ from the usual (rules.ts COSTS). */
  costs?: Partial<Record<ActionId, number>>;
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
