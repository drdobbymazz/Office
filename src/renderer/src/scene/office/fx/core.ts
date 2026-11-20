// Shared plumbing for the effects: the environment every effect draws into,
// and the base class that gives every lasting effect an intro and an outro.

import type { Container } from 'pixi.js';
import type { EffectInstance, FxCue, FxFrame, FxPerson, ViewRect } from '@/game/view/api';
import type { Particles } from './particles';
import type { DarkLayer } from './dark';

export interface Env {
  /** Under people: water, scorch, light pools, shadows. */
  floor: Container;
  /** The y-sorted layer the people live in (zIndex = floor y). */
  sorted: Container;
  /** Above people, below the tints: smoke, falling things, the saucer. */
  air: Container;
  /** Full-map washes: darkness, alarm, disco, freeze, daylight. */
  tint: Container;
  /** Above the tints: lightning, emotes, floating text, person marks. */
  high: Container;
  /** Screen space. */
  screen: Container;
  parts: Particles;
  dark: DarkLayer;
  /** Seconds since the view started (sum of dt). */
  time: number;
  view: ViewRect;
  people: readonly FxPerson[];
  frame: FxFrame | null;
  cue(c: FxCue): void;
}

/**
 * A lasting effect. `vis` runs 0 → 1 during the intro and back to 0 during the
 * outro after the sim drops it; the subclass decides what that looks like.
 */
export abstract class Lasting<T extends EffectInstance = EffectInstance> {
  vis = 0;
  dying = false;
  age = 0;
  /** Seconds to fade in / out. */
  introT = 0.6;
  outroT = 0.8;
  constructor(public inst: T, protected env: Env) {}
  /** The sim changed this effect's numbers. */
  apply(inst: T): void {
    this.inst = inst;
  }
  /** Advance by dt seconds. */
  abstract tick(dt: number): void;
  /** Remove everything this effect added. */
  abstract dispose(): void;
}

/** Smoothly approach a target (frame-rate independent). */
export function approach(cur: number, target: number, rate: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

export const rand = Math.random;
export const rr = (a: number, b: number): number => a + Math.random() * (b - a);
export function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}
