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
import type { BrainSettings, BrainStatus, ProviderKind } from '@/game/brain/api';
import type { AudioVolumes } from '@/game/audio/api';

// ── State the UI renders ─────────────────────────────────────────────────────

export type GamePhase =
  | 'title'     // title screen, nothing running
  | 'playing'
  | 'report';   // end-of-day report is showing

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
  /** From the report screen: start the next day. */
  nextDay(): void;

  // ── overseer powers ──
  /** Start an event. Resolves to null on success or a plain reason why not ("Still cooling down"). */
  triggerChaos(id: ChaosId, target: ChaosTarget): string | null;
  /** Free text: "a horse walks into the office". */
  customEvent(text: string): void;
  /** Put a thought in someone's head. */
  whisper(who: CharId, text: string): void;
  /** Speak over the loudspeaker to everyone. */
  announce(text: string): void;
  /** Tell someone exactly what to do next: "confess to Lena". */
  cue(who: CharId, instruction: string): void;
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
