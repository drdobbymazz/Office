// Sound. Everything is synthesized with the Web Audio API at runtime: there
// are no audio files. Implemented in audio/index.ts.

import type { EmotionId } from '@/game/core/types';
import type { VoiceDef } from '@/game/core/look';

/** One-shot sound effects. */
export const SFX_IDS = [
  // UI
  'tap', 'open', 'close', 'select', 'card', 'confirm', 'deny', 'toast', 'objective', 'whoosh',
  // overseer actions
  'pickup', 'drop', 'whisperSend', 'paChime', 'cooldownReady',
  // world
  'pop', 'poof', 'ding', 'doorOpen', 'doorClose', 'step', 'thud', 'boing', 'fall', 'splash', 'gong',
  'thunder', 'zap', 'explosion', 'sizzle', 'glass', 'paper', 'powerDown', 'powerUp',
  'freeze', 'unfreeze', 'shrink', 'grow', 'swap', 'heart', 'coin', 'cash', 'party', 'sparkle',
  'ghostWail', 'ufoBeam', 'puppyBark', 'raccoonChitter', 'pigeons', 'squeak', 'slurp', 'gasp',
  // day flow
  'dayStart', 'dayEnd',
  // story mode: goals, the day's result, the week's ending, and story props
  'goalWin', 'goalFail', 'dayWon', 'dayLost', 'stamp', 'tick', 'wipe',
  'endingSaved', 'endingScraped', 'endingClosed',
  'phoneRing', 'fax', 'gavel', 'clink'
] as const;
export type SfxId = (typeof SFX_IDS)[number];

/** Sounds that run until switched off. */
export const LOOP_IDS = [
  'fire', 'alarm', 'sprinkler', 'waterRush', 'bees', 'ufoHum', 'ghostAir', 'rumble', 'printerRage', 'staticHum'
] as const;
export type LoopId = (typeof LOOP_IDS)[number];

export interface SfxOptions {
  /** -1 left .. 1 right. */
  pan?: number;
  /** 0..1 multiplier. */
  volume?: number;
  /** Playback pitch multiplier (1 = normal). */
  pitch?: number;
}

export interface SpeakOptions {
  /** Characters per second the text is being revealed at. */
  cps: number;
  emotion?: EmotionId;
  /** 'shout' is louder and harsher, 'whisper' is breathy and quiet, 'think' is soft and muffled. */
  style?: 'say' | 'shout' | 'whisper' | 'think';
  pan?: number;
}

/** What the adaptive background music follows. */
export interface MusicMood {
  /** 0 calm .. 1 mayhem. */
  chaos: number;
  /** Hour of day 0..24 (music thins out in the evening). */
  hour: number;
  disco: boolean;
  blackout: boolean;
  /** Time frozen: music holds / filters down. */
  frozen: boolean;
  /** Title screen or report screen. */
  menu: boolean;
  /** Story mode, 0..1: how much is at stake right now (a deadline close, the inspector's tour). Raises tension. */
  stakes?: number;
  /** Story mode: the week's ending is on screen. */
  ending?: 'saved' | 'scraped' | 'closed' | null;
}

export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  voice: number;
}

export interface AudioApi {
  /** Create/resume the AudioContext. Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  setVolumes(v: Partial<AudioVolumes>): void;
  setMuted(muted: boolean): void;
  sfx(id: SfxId, opts?: SfxOptions): void;
  loop(id: LoopId, on: boolean, opts?: SfxOptions): void;
  /**
   * Play a person's talking blips for a line of text (one blip per syllable-ish
   * chunk, in step with the typewriter). Returns a handle to cut it short.
   */
  speak(voice: VoiceDef, text: string, opts: SpeakOptions): { stop(): void };
  setMusicMood(mood: Partial<MusicMood>): void;
  startMusic(): void;
  stopMusic(): void;
  /** Pause everything (app in background). */
  suspend(): void;
  resume(): void;
  dispose(): void;
}

export type CreateAudio = () => AudioApi;
