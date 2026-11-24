// The one door between the React UI and the game.
//
// The UI never touches the sim, the brain or Pixi directly. It reads `UiState`
// from a zustand store (updated by the game a few times a second) and calls
// methods on `GameApi`. A mock implementation (app/mockGame.ts) lets the UI be
// built and screenshotted without the real game.

import type { StoreApi, UseBoundStore } from 'zustand';
import type {
  CastId, ChaosId, ChaosTarget, CharId, EmotionId, FeedItem, Plan, RoomId, StatusKind, TargetRoomId
} from '@/game/core/types';
import type { WorldLocation } from '@/game/core/world';
import type { BrainSettings, BrainStatus, ProviderKind } from '@/game/brain/api';
import type { AudioVolumes } from '@/game/audio/api';
import type { EpisodeId } from '@/game/story/types';

// ── State the UI renders ─────────────────────────────────────────────────────

export type GamePhase =
  | 'title'     // title screen, nothing running
  | 'briefing'  // story mode: the chapter card before the day starts
  | 'playing'
  | 'report'    // end-of-day report is showing
  | 'ending';   // story mode: the week is over, the ending card is showing

export type GameMode = 'sandbox' | 'saga' | 'story';

// ── Story mode ("Closing Time": five days, one main job a day) ──────────────

/** Everything an action can cost in story mode, keyed by power id or one of the four tools. */
export type ActionId = ChaosId | 'whisper' | 'announce' | 'cue' | 'anything';

export interface StoryGoalUi {
  id: string;
  /** "All hands for the call" */
  title: string;
  /** One plain sentence saying exactly what to make happen. */
  detail: string;
  /** A GIcon name. */
  icon: string;
  /** 0..1 */
  progress: number;
  /** A short live line, a few words: "7 of 10 in the room, Michael not yet". Empty when nothing to say. */
  status: string;
  state: 'open' | 'won' | 'lost';
}

export interface StandingChangeUi {
  /** Plain cause: "The call with Corporate went ahead", "2 incidents were reported". */
  text: string;
  /** Points of standing, + or -. */
  delta: number;
}

export interface EpisodeSavedUi {
  id: EpisodeId;
  number: number;
  title: string;
  subtitle: string;
  tagline: string;
  chapters: number;
  unitLabel: string;
  /** The episode's colour (a CSS colour, e.g. 'var(--cth-lemon)'), for its card's edge and bands. */
  band: string;
  saved: { chapter: number; chapters: number; title: string; weekday: string; standing: number } | null;
}

export interface StoryUi {
  /** 1..chapters */
  chapter: number;
  chapters: number;
  /** "The Memo" */
  title: string;
  /** "Monday" */
  weekday: string;
  /** Chapter card paragraphs, plain words. */
  intro: string[];
  /** Short tips on ways to approach today's job (shown on the card and in the Director tab). */
  hints: string[];
  goal: StoryGoalUi;
  /** Optional extra goals for the day (each worth some standing). */
  side: StoryGoalUi[];
  /** 0..100: how likely Corporate is to keep the branch open. */
  standing: number;
  /** Today's budget for powers and tools. Picking people up and poking are free. */
  influence: { left: number; max: number };
  /** What each action costs today. Missing = free. */
  costs: Partial<Record<ActionId, number>>;
  /** Powers not available today, with the plain reason. */
  locked: Partial<Record<ChaosId, string>>;
  /** When the player may accuse someone (Thursday): tries left and who was already accused. Otherwise null. */
  accuse: { triesLeft: number; accused: CharId[]; label: string } | null;
  /** Filled in when the day ends, for the report. */
  result: {
    won: boolean;
    /** What happened, plain sentences. */
    text: string[];
    changes: StandingChangeUi[];
    standingBefore: number;
    standingAfter: number;
  } | null;
  /** After the last chapter: how the week ended. */
  ending: {
    id: 'saved' | 'scraped' | 'closed';
    /** "THE BRANCH STAYS OPEN" */
    title: string;
    text: string[];
    /** Short personal lines drawn from the week ("Kevin, carried across the office 11 times..."). May be empty. */
    epilogue: string[];
  } | null;
  /** The whole week at a glance. */
  week: { chapter: number; title: string; weekday: string; result: 'won' | 'lost' | null }[];
  /** One plain sentence for the chapter card on what happened before ("Yesterday Angela and Oscar made up..."). Null on Monday. */
  recap: string | null;
  /**
   * The recipe-style tips, shown only once the player has failed or retried this day (the card's
   * `hints` are clues; these say exactly how). Empty until then.
   */
  help: string[];
  /** Side effects to warn about before an action is confirmed ("Using a power fails Quiet hands"). */
  warns: Partial<Record<ActionId, string>>;
  /** Story-aware suggestions for the whisper and loudspeaker boxes (shown first). May be empty. */
  suggest: { whisper: string[]; announce: string[] };
  /** Whisper suggestions that only fit one person (shown first when whispering them). */
  suggestFor?: Partial<Record<string, string[]>>;
  /** Today's main goal is settled and nothing left today changes the result: the player may finish the day now. */
  canFinish: boolean;
  /** Nothing needs the player until this time of day (clock minutes): they may skip ahead to it. Null otherwise. */
  skipTo?: number | null;
  episodeId?: EpisodeId;
  episodeName?: string;
  episodeSubtitle?: string;
  unitLabel?: string;
  standingLabel?: string;
  standingNote?: string;
  endingRule?: string;
  /** The title banner on the episode's first card ("CLOSING TIME"); absent: the episode's name. */
  episodeBanner?: string;
  /** One line under the episode's title banner on its first card ("A story in five days, Monday to Friday"). */
  episodeBlurb?: string;
  /** What this episode's standing number means, in plain words; absent: Episode 1's Branch standing wording. */
  standingMeaning?: string;
  /** What the whole episode is called on the report and ending cards ("The week", "The outing", "The job"). */
  spanLabel?: string;
  /** The episode's colour for card bands (a CSS colour). */
  band?: string;
  /** The ending card's heading and line under it ("FRIDAY, 17:00", "The week is over"). */
  endHead?: string;
  endSub?: string;
  /** The last report's button to the ending ("See how the week ended"). */
  endNextLabel?: string;
  /** The episode that follows this one, for the ending card's "Next" button; null on the last one. */
  nextEpisode?: { id: EpisodeId; number: number; title: string } | null;
  /** Floor name tags chosen by the chapter for right now (each may carry a few words); absent: the fixed ones. */
  marks?: { id: string; label?: string }[];
  /** Endless Saga metadata when running in `mode === 'saga'`; undefined in Classic Story mode. */
  saga?: {
    season: number;
    arcId: string;
    arcTitle: string;
    arcTagline: string;
    faces: { id: string; face: EmotionId }[];
    icon?: string;
    aiCrafted?: boolean;
    twist?: string | null;
    history: { season: number; arcTitle: string; ending: 'saved' | 'scraped' | 'closed'; standing: number }[];
  };
}

/** A line of story narration to show on the floor as a caption (newest wins). */
export interface BeatUi {
  /** Changes with every beat. */
  id: string;
  text: string;
  icon?: string;
  room?: RoomId;
  /** Real seconds it should stay up (the UI may cut it short when the next beat arrives). */
  holdFor: number;
}

/** A big moment, shown as a stamp banner (with its own sound, played by the game). */
export interface CeremonyUi {
  /** Changes with every ceremony. */
  id: string;
  kind: 'goalWon' | 'goalLost' | 'extraWon' | 'extraLost';
  /** Two or three shouty words: "CALL MADE", "LEAK FOUND", "SIGNED", "GOAL DONE". */
  title: string;
  /** One plain line under it ("+2 influence"). */
  detail?: string;
  icon?: string;
  /** Where on the floor it happened, when known. */
  room?: RoomId;
}

/** Live summary of one person, for chips, pickers and the roster. */
export interface PersonUi {
  id: CharId;
  name: string;
  role: string;
  /** '#rrggbb' signature colour. */
  color: string;
  /** Data URL of their portrait in the current emotion. */
  avatar: string;
  room: RoomId;
  roomName: string;
  emotion: EmotionId;
  /** 0..1 */
  intensity: number;
  statuses: StatusKind[];
  /** A few words on what they are doing: "arguing with Rosa", "hiding in the loo". */
  doing: string;
  speaking: boolean;
  /** In the building at all (false = gone home / not arrived / abducted). */
  present: boolean;
  /** Cannot be targeted right now (asleep, frozen, aboard the UFO ...). */
  busy: boolean;
}

/** Full detail of one person, for the character panel. */
export interface PersonDetail extends PersonUi {
  fullName: string;
  age: number;
  /** One-line personality summary. */
  summary: string;
  wants: string;
  fears: string;
  quirk: string;
  /** Their secret, or null while the player has not uncovered it. */
  secret: string | null;
  /** Latest private thought (from the model). */
  thought: string;
  /** A whispered idea they hold for the rest of the day, and since when (clock minutes). */
  conviction: { text: string; since: number } | null;
  plan: Plan | null;
  /** -1..1 */
  mood: number;
  /** 0..1 */
  energy: number;
  /** 0..1 */
  stress: number;
  /** How they feel about the others, strongest first. */
  bonds: { id: CastId; name: string; color: string; avatar: string; score: number; label: string; note: string }[];
  /** Newest first, plain sentences. */
  memories: { day: number; clock: number; text: string }[];
}

export interface Meters {
  /** 0..100 */
  chaos: number;
  /** 0..100 average staff mood */
  morale: number;
  /** 0..100 share of staff actually working */
  productivity: number;
  /** Share price of CLIP. */
  stock: number;
  /** Change since the day started. */
  stockDelta: number;
  /** Recent prices for the sparkline, oldest first (up to 60). */
  stockHistory: number[];
}

export interface BrainUi {
  provider: ProviderKind;
  /** 'online' model answering; 'offline' cannot reach it (playing on instinct); 'connecting'; 'instinct' chosen on purpose. */
  state: 'connecting' | 'online' | 'offline' | 'instinct';
  model: string;
  /** The model is writing right now. */
  thinking: boolean;
  /** Requests waiting. */
  queued: number;
  tokPerSec: number | null;
  /** Plain-language problem, when offline. */
  error: string | null;
}

export interface ObjectiveUi {
  id: string;
  title: string;
  /** One plain sentence saying exactly what to make happen. */
  detail: string;
  /** 0..1 */
  progress: number;
  done: boolean;
  icon: string;
}

export interface CooldownUi {
  /** ms timestamp (performance.now()) when it is ready again; 0 = ready. */
  readyAt: number;
  /** Total cooldown in ms (for the wipe animation). */
  total: number;
}

export interface ActiveChaosUi {
  key: string;
  id: ChaosId;
  /** "Fire in the Break Room" */
  label: string;
  room: RoomId | null;
  /** ms timestamp when it should end (0 = until fixed). */
  endsAt: number;
}

export interface ToastUi {
  id: string;
  text: string;
  icon?: string;
  tone: 'info' | 'good' | 'bad';
}

export interface DayReport {
  day: number;
  headline: string;
  paragraphs: string[];
  awards: { title: string; who: CharId; name: string; avatar: string; why: string }[];
  quotes: { who: CharId; name: string; avatar: string; text: string }[];
  stats: { incidents: number; stockStart: number; stockEnd: number; morale: number; chaosPeak: number; lines: number };
  /** True while the model is still writing the report (show the stats first, text streams in). */
  writing: boolean;
  /**
   * True while the text shown is the quick written summary and the model's own version is still
   * on its way (it replaces this one when it arrives).
   */
  draft?: boolean;
}

export interface GameSettings {
  brain: BrainSettings;
  volumes: AudioVolumes;
  muted: boolean;
  /** Real minutes one office day lasts. */
  dayMinutes: 6 | 10 | 16;
  /** Camera glides to wherever the action is. */
  autoCamera: boolean;
  /** Show the current spoken line as a subtitle bar. */
  captions: boolean;
  /** No cooldowns on powers. */
  sandbox: boolean;
  haptics: boolean;
  /** 'auto' picks by device. */
  quality: 'auto' | 'low' | 'high';
  /** The first-run hints have been seen. */
  tutorialDone: boolean;
  /** The story's first-day coach has been seen. */
  storyCoachDone: boolean;
}

export interface UiState {
  phase: GamePhase;
  paused: boolean;
  /** 1 or 2 (fast-forward). */
  speed: 1 | 2;
  day: number;
  /** "Monday" ... */
  weekday: string;
  /** Minutes since midnight, game time. */
  clock: number;
  /** 0..1 through the working day (09:00 -> 17:00). */
  dayProgress: number;
  meters: Meters;
  incidentsToday: number;
  incidentFreeDays: number;
  brain: BrainUi;
  /** Everyone, in a stable order. */
  people: PersonUi[];
  selectedId: CharId | null;
  /** Newest last. Capped by the game. */
  feed: FeedItem[];
  /** The line being spoken right now, for the subtitle bar. */
  caption: FeedItem | null;
  cooldowns: Partial<Record<ChaosId, CooldownUi>>;
  activeChaos: ActiveChaosUi[];
  objectives: ObjectiveUi[];
  toasts: ToastUi[];
  report: DayReport | null;
  settings: GameSettings;
  /** The player is holding someone. */
  holding: CharId | null;
  /** The game wants the player to pick a target in the world (set by UI via beginTargeting). */
  targeting: TargetingUi | null;
  /** Running inside a claude.ai Artifact (no network: only Claude or instinct can be the brain). */
  inArtifact: boolean;
  mode: GameMode;
  /** Active world map ('office' or 'park'). */
  location: WorldLocation;
  /** Story mode state; null in the sandbox (used for both Classic Story and Endless Saga). */
  story: StoryUi | null;
  /** A story in progress that can be continued from the title screen, or null. */
  storySaved: { chapter: number; chapters: number; title: string; weekday: string; standing: number } | null;
  /** Saved summaries & metadata for every Story Mode episode. */
  episodes: EpisodeSavedUi[];
  /** An Endless Saga in progress that can be continued from the title screen, or null. */
  sagaSaved: { season: number; chapter: number; chapters: number; arcTitle: string; title: string; weekday: string; standing: number } | null;
  /** The newest story narration worth showing on the floor (story mode), or null. */
  beat: BeatUi | null;
  /** The newest big moment to stamp on screen, or null. Replaced by the next one. */
  ceremony: CeremonyUi | null;
  /** Active bridge cinematic (Episode 2 Office -> Park), or null. */
  intro: { caption: string; progress: number; canSkip: boolean } | null;
  /** The rest of the day is being run quickly to five o'clock (after finishDay), or the day is skipping ahead. */
  finishing: boolean;
  /** While skipping ahead: the time of day (clock minutes) being skipped to. Null otherwise. */
  skippingTo?: number | null;
  /** Story mode, phase 'ending': the week's last scene is playing on the floor; the ending card waits until it is over. */
  finale: boolean;
}

export interface TargetingUi {
  chaos: ChaosId;
  need: 'room' | 'person' | 'pair';
  /** Already picked (for pairs). */
  who: CharId | null;
}

export type UiStore = UseBoundStore<StoreApi<UiState>>;

// ── What the UI can ask the game to do ───────────────────────────────────────

export interface ScreenPoint {
  x: number;
  y: number;
  /** Bubble scale hint: 1 at normal zoom, smaller when zoomed far out (never below ~0.75). */
  scale: number;
  /** False when off-screen or hidden (behind a door, in the lift). */
  visible: boolean;
}

export interface GameApi {
  /** Read state with `game.store(selector)` in components. */
  readonly store: UiStore;

  // ── lifecycle ──
  /** Leave the title screen and start (or resume) the office. Call from a tap: also unlocks audio. */
  begin(): void;
  setPaused(paused: boolean): void;
  setSpeed(speed: 1 | 2): void;
  /** From the report screen: start the next day (story mode: the next chapter's card, or the ending). */
  nextDay(): void;

  // ── story mode ──
  /** From the title screen: play a story episode. fresh = start from chapter 1 even if saved. */
  startStory(fresh?: boolean, episodeId?: EpisodeId): void;
  /** From the title screen: play Endless Saga (weekly arcs with full sandbox freedom). fresh = start Season 1 anew. */
  startSaga(fresh?: boolean): void;
  /** Endless Saga, from a Friday season ending card: carry bonds & standing momentum into Season N+1. */
  nextSeason(): void;
  /** From the title screen: free play with no goals or budget. */
  startSandbox(): void;
  /** From the chapter card: start the day. Call from a tap (unlocks audio). */
  beginChapter(): void;
  /** Story mode: play the same day again from its start (from the report, the chapter card, or during the day). */
  retryDay(): void;
  /** Story mode, when StoryUi.canFinish: run the rest of the day quickly to five o'clock and the report. */
  finishDay(): void;
  /** Story mode, when StoryUi.skipTo is set: run quickly to that time (it stops early if something happens). */
  skipAhead(): void;
  /** Story mode, during an episode bridge intro: skip straight to chapter 1 briefing. */
  skipIntro(): void;
  /** Story mode, during the finale: stop the last scene and show the ending card now. */
  skipFinale(): void;
  /** Story mode, when allowed (StoryUi.accuse): name someone. */
  accuse(who: CharId): void;
  /** Back to the title screen (from the ending, or to switch mode). */
  toTitle(): void;

  // ── overseer powers ──
  /** Start an event. Resolves to null on success or a plain reason why not ("Still cooling down"). */
  triggerChaos(id: ChaosId, target: ChaosTarget): string | null;
  /** Free text: "a horse walks into the office". */
  // The four send methods return false when nothing happened (refused, or the person is not in), so the
  // interface can keep the typed text and not claim it was sent.
  customEvent(text: string): boolean | void;
  /** Put a thought in someone's head. */
  whisper(who: CharId, text: string): boolean | void;
  /** Speak over the loudspeaker to everyone. */
  announce(text: string): boolean | void;
  /** Tell someone exactly what to do next: "confess to Lena". */
  cue(who: CharId, instruction: string): boolean | void;
  /** Prod someone with the giant invisible finger. */
  poke(who: CharId): void;

  // ── targeting in the world (optional nicety: tap a room / person on the map) ──
  beginTargeting(t: TargetingUi | null): void;

  // ── selection and camera ──
  select(who: CharId | null): void;
  focusPerson(who: CharId): void;
  focusRoom(room: TargetRoomId): void;
  /** Back to the whole-building view. */
  resetCamera(): void;
  /**
   * Tell the camera which part of the screen is covered by UI panels (CSS px
   * from each edge) so it keeps the action in the visible part.
   */
  setInsets(insets: { left: number; right: number; top: number; bottom: number }): void;

  // ── queries ──
  person(who: CharId): PersonDetail | null;
  /** Where a person's head is on screen right now (for speech bubbles). Cheap; call every frame. */
  headOnScreen(who: CharId): ScreenPoint;
  /** Lines currently being spoken (for the bubble layer). Cheap; call every frame. */
  activeSpeech(): readonly import('@/game/core/types').Speech[];
  /** Portrait data URL for a person in an emotion (cached). */
  avatar(who: CharId, emotion?: EmotionId): string;

  // ── settings and brain ──
  updateSettings(patch: Partial<GameSettings>): void;
  updateBrain(patch: Partial<BrainSettings>): void;
  /** Try the current brain settings now. */
  testBrain(): Promise<BrainStatus>;
  /** Wipe the saved world and start again from day 1. */
  resetWorld(): void;
  /** Ask the browser for fullscreen + landscape lock (no-op where unsupported). */
  goFullscreen(): void;
  /** Play a UI sound (button taps, panel open/close ...). */
  uiSound(id: import('@/game/audio/api').SfxId): void;
  dismissToast(id: string): void;
}
