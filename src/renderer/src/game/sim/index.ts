// The simulation: a headless, deterministic model of the office floor and the
// people on it. No drawing and no language model. See core/simApi.ts for the
// surface scripts and the director use; Sim adds the per-frame tick, the
// player's hand, the day, UI data and saving.

import type { ChaosId, ChaosTarget, CharId, RoomId, Tile } from '@/game/core/types';
import type { GameBus } from '@/game/core/bus';
import type { ChaosScript, DirectorSimApi } from '@/game/core/simApi';
import type { RenderFrame } from '@/game/view/api';
import type { Reflexes } from '@/game/brain/api';
import type { ActiveChaosUi, CooldownUi, Meters, PersonDetail, PersonUi } from '@/game/app/gameApi';
import { SimCore } from './core';
import { AGES } from './ages';
import { peopleUi as buildPeopleUi, personDetail as buildDetail } from './frame';
import type { DayPhase } from './clock';
import type { SaveData } from './save';
import { fireScript } from './chaos/fire';
import { smiteScript } from './chaos/smite';
import { pizzaScript } from './chaos/pizza';

export type { SaveData } from './save';
export type { DayPhase } from './clock';
export { WEEKDAYS, DAY_START, DAY_END } from './clock';
export { fireScript, smiteScript, pizzaScript };

export interface SimOptions {
  bus: GameBus;
  reflexes: Reflexes;
  seed?: number;
  /** Real minutes from 09:00 to 17:00. */
  dayMinutes: number;
  /** No cooldowns on powers. */
  sandbox?: boolean;
  save?: SaveData | null;
  /** Wall clock in ms (default performance.now). Used only for Speech.startedAt and UI timestamps. */
  now?: () => number;
}

/** One person's internals, for tests and the debug view. */
export interface SimDebugPerson {
  id: CharId;
  x: number;
  y: number;
  tile: Tile;
  /** Reserved resting tile. */
  res: Tile | null;
  present: boolean;
  /** Standing or sitting still (not walking, not airborne, not waiting for a route). */
  resting: boolean;
  walking: boolean;
  /** No route right now: retrying. */
  waiting: boolean;
  airborne: boolean;
  seized: boolean;
  /** Positioned directly by a chaos script. */
  placed: boolean;
  /** Seconds they have wanted to move without managing to. */
  stuckFor: number;
  job: string | null;
  doing: string;
  anim: string;
  /** Current need deficits (0 satisfied .. 1 urgent). */
  needs: Record<string, number>;
  notoriety: number;
}

export interface Sim extends DirectorSimApi {
  // ── time ──
  /** Advance the world. dt in seconds, 0..0.25 (larger is clamped; sub-stepped internally). */
  update(dt: number): void;
  /** The floor's view of this moment. Objects are reused between calls. */
  frame(): RenderFrame;
  readonly weekday: string;
  /** 0..1 through 09:00-17:00. */
  readonly dayProgress: number;
  readonly phase: DayPhase;
  /** Start the next day (or day n): 08:50, everyone arriving from the street. */
  beginDay(n?: number): void;

  // ── the player's hand ──
  /** false if they cannot be picked up (not on the floor). */
  pickUp(who: CharId): boolean;
  /** Move the held person's target to a world position (px). */
  dragTo(worldX: number, worldY: number): void;
  /** Let go, with the finger's velocity in world px/s (slow = set down, fast = thrown). */
  drop(vx?: number, vy?: number): void;
  readonly holding: CharId | null;
  poke(who: CharId): void;
  select(who: CharId | null): void;

  // ── chaos ──
  registerChaos(script: ChaosScript): void;
  /** null on success, else a plain reason. */
  startChaos(id: ChaosId, target?: ChaosTarget, opts?: { force?: boolean }): string | null;
  /** (added) Forbid powers outright, with the plain reason for each ({} lifts every lock). */
  setLocks(locks: Partial<Record<ChaosId, string>>): void;
  /** Seconds until a power can be used again (0 = ready). */
  cooldownLeft(id: ChaosId): number;
  cooldowns(): Partial<Record<ChaosId, CooldownUi>>;
  activeChaos(): ActiveChaosUi[];

  // ── UI ──
  peopleUi(): PersonUi[];
  personDetail(who: CharId): PersonDetail | null;
  meters(): Meters;
  readonly incidentsToday: number;
  readonly incidentFreeDays: number;
  /** Highest chaos meter value today (for the report). */
  readonly chaosPeak: number;
  /** Share price when the day started. */
  readonly stockDayStart: number;

  // ── save ──
  serialize(): SaveData;

  // ── debug ──
  debugPeople(): SimDebugPerson[];
  readonly debugStats: {
    rescues: number; teleports: number; forcedHome: number; daysEnded: number; forcedLog: string[];
    interruptions?: number; gossip?: number; plans?: number; needActions?: number;
  };
  blockedKeys(): string[];
}

class SimImpl extends SimCore implements Sim {
  get dayProgress(): number {
    return this.clockState.progress;
  }

  get holding(): CharId | null {
    return this.holdingId;
  }

  get incidentsToday(): number {
    return this.meterState.incidentsToday;
  }

  get incidentFreeDays(): number {
    return this.meterState.incidentFreeDays;
  }

  get chaosPeak(): number {
    return this.meterState.chaosPeak;
  }

  get stockDayStart(): number {
    return this.meterState.stockDayStart;
  }

  get debugStats(): {
    rescues: number; teleports: number; forcedHome: number; daysEnded: number; forcedLog: string[];
    interruptions?: number; gossip?: number; plans?: number; needActions?: number;
  } {
    return this.stats;
  }

  select(who: CharId | null): void {
    this.selectedId = who;
  }

  setLocks(locks: Partial<Record<ChaosId, string>>): void {
    this.chaosReg.setLocks(locks);
  }

  cooldownLeft(id: ChaosId): number {
    return this.chaosReg.cooldownLeft(id);
  }

  cooldowns(): Partial<Record<ChaosId, CooldownUi>> {
    return this.chaosReg.cooldowns(this.now());
  }

  activeChaos(): ActiveChaosUi[] {
    return this.chaosReg.active(this.now());
  }

  peopleUi(): PersonUi[] {
    return buildPeopleUi(this);
  }

  personDetail(who: CharId): PersonDetail | null {
    return buildDetail(this, who, AGES);
  }


  blockedKeys(): string[] {
    return this.nav.blockedKeyList();
  }

  debugPeople(): SimDebugPerson[] {
    return this.list.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      tile: { ...p.tile },
      res: p.res ? { ...p.res } : null,
      present: p.present,
      resting: p.resting && !p.placed && !p.hidden,
      walking: !!p.walk,
      waiting: p.waiting,
      airborne: !!p.air,
      seized: p.seized,
      placed: p.placed,
      stuckFor: p.stuckFor,
      job: p.job ? p.job.kind : null,
      doing: p.seized ? p.seizes[p.seizes.length - 1].doing : p.doing,
      anim: p.state.anim,
      needs: { ...p.needs },
      notoriety: p.notoriety
    }));
  }
}


export function createSim(opts: SimOptions): Sim {
  const sim = new SimImpl(opts);
  sim.registerChaos(fireScript);
  sim.registerChaos(smiteScript);
  sim.registerChaos(pizzaScript);
  return sim;
}

export type { RoomId };
