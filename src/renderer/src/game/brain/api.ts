// The "brain": the layer that turns the state of the office into what people
// say, feel and decide. It is fed plain data (no sim objects) and returns plain
// data, so it can be tested without the game and swapped between back ends.
//
// Back ends:
//   ollama   - the player's own model server (default: artemis-custom on the
//              RTX 4090 laptop). Slow-ish (about 7 tokens/second), so every
//              request is small, replies are capped, and scenes STREAM: the
//              first line plays while the rest is still being written.
//   openai   - any OpenAI-compatible /v1/chat/completions server (LM Studio,
//              llama.cpp, vLLM, OpenRouter ...).
//   claude   - only inside a claude.ai Artifact, via window.claude sampling.
//              May be called ONLY as a direct result of a player action,
//              never on a timer (autonomous = false).
//   instinct - no model at all: canned lines and rules. Always available; used
//              as the fallback and for instant reflex lines.

import type {
  CharId, ChaosId, EmotionId, LineAct, Plan, PlanKind, RelationShift, RoomId, TargetRoomId
} from '@/game/core/types';

export type ProviderKind = 'ollama' | 'openai' | 'claude' | 'instinct';

export interface BrainSettings {
  provider: ProviderKind;
  /** Server address for ollama / openai. May be relative ("/ollama") when the game is served by serve.mjs. */
  baseUrl: string;
  model: string;
  /** Bearer key for openai-compatible servers that need one. */
  apiKey: string;
  /** 0.3 (tame) .. 1.3 (unhinged). */
  temperature: number;
  /** How long Ollama keeps the model loaded, e.g. "30m". */
  keepAlive: string;
  /** Model tier when running on Claude inside an Artifact. */
  claudeTier: 'quick' | 'default';
}

export const DEFAULT_BRAIN_SETTINGS: BrainSettings = {
  provider: 'ollama',
  baseUrl: 'https://msi.tail780d1f.ts.net',
  model: 'artemis-custom',
  apiKey: '',
  temperature: 0.9,
  keepAlive: '30m',
  claudeTier: 'quick'
};

// ── Transport: one chat call, back-end specific ──────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** JSON Schema the reply must follow (sent as Ollama `format` / OpenAI json_schema). */
  schema: Record<string, unknown>;
  temperature: number;
  /** Hard cap on reply tokens. */
  maxTokens: number;
  signal?: AbortSignal;
  /** Called as the reply streams in, with the whole text so far. */
  onText?: (soFar: string) => void;
}

export interface ChatStats {
  /** Wall time for the whole call. */
  ms: number;
  /** Time until the first reply token arrived. */
  firstTokenMs?: number;
  promptTokens?: number;
  outputTokens?: number;
  /** Output tokens per second, measured. */
  tokPerSec?: number;
}

export interface ChatResponse {
  text: string;
  stats: ChatStats;
}

export interface TransportStatus {
  ok: boolean;
  /** Models the server offers (empty when not applicable). */
  models: string[];
  /** Plain-language reason when not ok, with what to try. */
  error?: string;
}

export interface ChatTransport {
  readonly kind: Exclude<ProviderKind, 'instinct'>;
  /** May calls be made on a timer, without a player action? */
  readonly autonomous: boolean;
  status(signal?: AbortSignal): Promise<TransportStatus>;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

// ── What the brain is asked ──────────────────────────────────────────────────

/** One person as the model should see them right now. All text is plain English. */
export interface PersonBrief {
  id: CharId;
  name: string;
  mood: EmotionId;
  /** Physical or magical conditions: "soaking wet", "shrunk to the size of a stapler". */
  state: string[];
  /** What they are doing or want right now: "wants to confront Rosa about the stapler". */
  goal: string;
  /** How they feel about the OTHER people in this request. */
  feelings: { about: CharId; text: string }[];
  /** Up to three things they remember that matter here. */
  memories: string[];
  /** Their secret. Present only when it should come into play (truth serum, a leak). */
  secret?: string;
  /** Set when a mind swap is active: speak with THIS person's personality instead. */
  mindOf?: CharId;
}

export type SceneTrigger =
  | 'ambient'    // nothing special: two people near each other
  | 'plan'       // someone walked over on purpose (text says why)
  | 'event'      // something is happening (fire, ghost ...)
  | 'aftermath'  // something just ended
  | 'whisper'    // the Overseer put a thought in someone's head
  | 'announce'   // a voice came over the loudspeaker
  | 'cue'        // the Overseer told someone what to do
  | 'custom';    // a free-text event from the player

/** "Write the next few lines of what these people say to each other." */
export interface SceneRequest {
  id: string;
  day: number;
  /** "10:42" */
  clock: string;
  /** Room name as in world.ts ("the Break Room"). */
  place: string;
  trigger: SceneTrigger;
  /** One plain sentence: what set this scene off. */
  why: string;
  /** Who speaks. 1 to 4 people. */
  people: PersonBrief[];
  /** Names of others in the room who see it but do not speak. */
  onlookers: string[];
  /** True things about the world right now: "The kitchen is on fire." */
  facts: string[];
  /** The last few lines said in this place, oldest first. */
  recent: { who: string; say: string }[];
  /** How many lines to write. */
  minLines: number;
  maxLines: number;
  /** 0..1 how frantic the office is. */
  chaos: number;
}

export interface SceneLine {
  who: CharId;
  say: string;
  feel: EmotionId;
  /** Who it is said to: a person in the scene, 'all', or null. */
  to: CharId | 'all' | null;
  act: LineAct;
}

export interface SceneResult {
  lines: SceneLine[];
  /** One plain sentence saying what happened. Becomes everyone's memory of it. */
  summary: string;
  shifts: RelationShift[];
  /** What some of them decide to do next. */
  plans: { who: CharId; plan: Plan }[];
  /** 'model' when the language model wrote it, 'instinct' when it fell back to canned lines. */
  source: 'model' | 'instinct';
}

/** "Each of these people is on their own. What is each thinking, and what will they do next?" */
export interface MindsRequest {
  id: string;
  day: number;
  clock: string;
  people: (PersonBrief & { place: string; doing: string })[];
  facts: string[];
  /** Plans they may choose from. */
  allowed: PlanKind[];
  /** Everyone they could pick as a target, with where that person is. */
  others: { id: CharId; name: string; place: string }[];
  chaos: number;
}

export interface MindResult {
  who: CharId;
  /** A short private thought, in their voice. Shown as a thought bubble. */
  thought: string;
  feel: EmotionId;
  plan: Plan;
}

/** "The player typed this. Turn it into something the game can stage." */
export interface InterpretRequest {
  id: string;
  /** What the player typed, e.g. "a horse walks into the office". */
  text: string;
  rooms: { id: string; name: string; people: string[] }[];
}

export const CUSTOM_VIBES = ['scary', 'funny', 'gross', 'wonderful', 'weird', 'annoying', 'dangerous', 'romantic', 'sad'] as const;
export type CustomVibe = (typeof CUSTOM_VIBES)[number];
export const CUSTOM_REACTIONS = ['flee', 'gather', 'freeze', 'cower', 'cheer', 'ignore', 'investigate', 'dance', 'argue', 'laugh'] as const;
export type CustomReaction = (typeof CUSTOM_REACTIONS)[number];
export const CUSTOM_LOOKS = ['none', 'shake', 'flash', 'sparkles', 'smoke', 'confetti', 'darken', 'drip', 'hearts', 'stink', 'gloom', 'cash', 'paper'] as const;
export type CustomLook = (typeof CUSTOM_LOOKS)[number];

export interface InterpretResult {
  /** Short title for the feed: "Horse in the Lobby". */
  title: string;
  /** One emoji that best pictures the thing that appeared (drawn in the room). Empty if nothing appears. */
  emoji: string;
  /** A room id from the request, or 'everywhere'. */
  room: string;
  /** One plain sentence in the present tense: what is now true. Goes into `facts` for later scenes. */
  fact: string;
  vibe: CustomVibe;
  /** 1 mild .. 3 extreme. */
  intensity: 1 | 2 | 3;
  /** How people nearby react with their bodies. */
  reaction: CustomReaction;
  look: CustomLook;
  /** Does the thing move about? */
  moves: boolean;
  source: 'model' | 'instinct';
}

/** "Write up the day." */
export interface ReportRequest {
  id: string;
  day: number;
  /** Plain log lines of what happened, oldest first. */
  log: string[];
  stats: { incidents: number; stockStart: number; stockEnd: number; morale: number; chaosPeak: number };
  people: { id: CharId; name: string; mood: EmotionId }[];
}

export interface ReportResult {
  /** A short newspaper-style headline. */
  headline: string;
  /** Two or three short plain paragraphs: who did what, what changed. */
  paragraphs: string[];
  awards: { title: string; who: CharId; why: string }[];
  /** What each person takes away from the day (one short sentence each). Kept as long-term memory. */
  takeaways: { who: CharId; text: string }[];
  source: 'model' | 'instinct';
}

// ── The brain itself ─────────────────────────────────────────────────────────

export interface BrainStatus {
  provider: ProviderKind;
  ok: boolean;
  model: string;
  models: string[];
  error?: string;
  /** Rolling average of measured output speed. */
  tokPerSec?: number;
  /** Rolling average time to first line of a scene, ms. */
  firstLineMs?: number;
  /** The server is reachable but the model is still loading into memory. */
  waking?: boolean;
}

export interface SceneCallbacks {
  /** Called for each line as soon as it is complete in the stream. */
  onLine?: (line: SceneLine, index: number) => void;
  /**
   * Called at most once, when the last line has arrived but the rest of the
   * reply (summary, shifts, plans) is still being written. On a slow model that
   * tail takes several seconds, and nobody needs to stand and wait for it.
   */
  onLinesEnd?: () => void;
  signal?: AbortSignal;
}

/**
 * High-level brain. LlmBrain (prompt + transport + parse) and InstinctBrain
 * (canned) both implement it. Every method must resolve with something usable:
 * on any model failure, LlmBrain falls back to InstinctBrain and marks
 * `source: 'instinct'`.
 */
export interface Brain {
  readonly kind: ProviderKind;
  /** May it be called on a timer, without a player action? */
  readonly autonomous: boolean;
  status(): Promise<BrainStatus>;
  scene(req: SceneRequest, cb?: SceneCallbacks): Promise<SceneResult>;
  minds(req: MindsRequest, signal?: AbortSignal): Promise<MindResult[]>;
  interpret(req: InterpretRequest, signal?: AbortSignal): Promise<InterpretResult>;
  report(req: ReportRequest, signal?: AbortSignal): Promise<ReportResult>;
}

/** Instant, no-model lines for reflexes ("FIRE!"). Implemented by InstinctBrain. */
export const BARK_KINDS = [
  'scared', 'startled', 'angry', 'delighted', 'disgusted', 'hurt', 'confused', 'smug', 'sad',
  'greeting', 'goodbye', 'bored', 'working', 'sleepy',
  'pickedUp', 'dropped', 'poked', 'zapped', 'wet', 'dark', 'floating', 'cold', 'dizzy', 'tiny', 'giant'
] as const;
export type BarkKind = (typeof BARK_KINDS)[number];

export interface Reflexes {
  /** A short exclamation in this person's voice. Never empty. */
  bark(who: CharId, kind: BarkKind): string;
  /** A first reaction to a chaos event starting, in this person's voice. */
  chaosBark(who: CharId, chaos: ChaosId): string;
}

export type { RoomId };
