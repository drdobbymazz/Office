// A tiny typed event bus. The sim and director emit; the stage, audio and UI
// listen. One instance per game.

import type { ChaosId, ChaosTarget, CharId, FeedItem, PlanKind, RoomId, Speech } from './types';
import type { SceneTrigger } from '@/game/brain/api';
import type { FxCue } from '@/game/view/api';
import type { LoopId, SfxId, SfxOptions } from '@/game/audio/api';

export interface GameEvents {
  /** A new line for the log. */
  feed: FeedItem;
  /** Someone started speaking / thinking (a bubble appears, voice blips play). */
  speech: Speech;
  /** A bubble should go away now (cut short). */
  speechEnd: { id: string; who: CharId };
  /** One-shot visual effect. */
  fx: FxCue;
  /** One-shot sound. x is a world x for stereo panning (optional). */
  sfx: { id: SfxId; x?: number; opts?: SfxOptions };
  /** Start / stop a looping sound. */
  loop: { id: LoopId; on: boolean };
  /** Shake the camera. power 0..1. */
  shake: { power: number; ms: number };
  /** Something worth looking at: the camera may glide there if auto-camera is on. weight 0..1. */
  focus: { x: number; y: number; w: number; h: number; weight: number; holdMs: number };
  chaosStart: { id: ChaosId; target: ChaosTarget; label: string; room?: RoomId };
  chaosEnd: { id: ChaosId };
  /** Small notice for the player. */
  toast: { text: string; icon?: string; tone?: 'info' | 'good' | 'bad' };
  dayStart: { day: number };
  dayEnd: { day: number };
  /** A goal was completed. */
  objective: { id: string; title: string };
  /** The player picked someone up / let go. */
  pickedUp: { who: CharId };
  dropped: { who: CharId; room: RoomId; hard: boolean };
  /** Haptic buzz request (ms pattern). */
  buzz: { pattern: number | number[] };
  /** (added) A conversation played out to its end (not cut short). */
  sceneDone: { people: CharId[]; trigger: SceneTrigger; planKind?: PlanKind; room?: RoomId };
}

type Handler<T> = (payload: T) => void;

export class Bus<E extends object = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => {
      set.delete(fn as Handler<never>);
    };
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as Handler<E[K]>)(payload);
      } catch (err) {
        console.error(`[bus] handler for "${String(type)}" threw`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export type GameBus = Bus<GameEvents>;
