// The numbers on the dashboard: chaos, morale, productivity, the share price,
// and the incident board.

import { clamp } from '@/game/core/types';
import type { Rng } from './rng';

export const STOCK_HISTORY = 60;
/** Sim seconds between share-price samples. */
const SAMPLE_EVERY = 4;
const CHAOS_DRAIN = 1.2;

export class MeterState {
  chaos = 0;
  chaosPeak = 0;
  morale = 50;
  productivity = 50;
  stock = 100;
  stockDayStart = 100;
  stockHistory: number[] = [100];
  incidentsToday = 0;
  incidentFreeDays = 0;
  incidentsTotal = 0;
  private sampleT = 0;

  bumpChaos(amount: number): void {
    this.chaos = clamp(this.chaos + amount, 0, 100);
    if (this.chaos > this.chaosPeak) this.chaosPeak = this.chaos;
  }

  incident(): void {
    this.incidentsToday++;
    this.incidentsTotal++;
    this.incidentFreeDays = 0;
  }

  startDay(): void {
    this.incidentsToday = 0;
    this.chaos = 0;
    this.chaosPeak = 0;
    this.stockDayStart = this.stock;
  }

  /** Called when a day ends. */
  endDay(): void {
    if (this.incidentsToday === 0) this.incidentFreeDays++;
  }

  /**
   * `moodAvg` -1..1 over present staff, `working` 0..1 share actually working
   * (null when nobody is in).
   */
  update(dt: number, rng: Rng, moodAvg: number | null, working: number | null): void {
    this.chaos = Math.max(0, this.chaos - CHAOS_DRAIN * dt);
    const k = 1 - Math.exp(-dt * 0.8);
    if (moodAvg !== null) this.morale += (clamp(50 + moodAvg * 50, 0, 100) - this.morale) * k;
    if (working !== null) this.productivity += (clamp(working * 100, 0, 100) - this.productivity) * k;
    this.sampleT += dt;
    while (this.sampleT >= SAMPLE_EVERY) {
      this.sampleT -= SAMPLE_EVERY;
      // A gentle random walk, pulled up by work and good spirits, knocked by chaos.
      const pull = (this.productivity - 45) * 0.006 + (this.morale - 50) * 0.004 - this.chaos * 0.012;
      const noise = (rng() - 0.5) * 0.9;
      // Mean-revert slightly toward 100 so a long game does not drift away for ever.
      const revert = (100 - this.stock) * 0.004;
      this.stock = Math.max(1, Math.round((this.stock + pull + noise + revert) * 100) / 100);
      this.stockHistory.push(this.stock);
      if (this.stockHistory.length > STOCK_HISTORY) this.stockHistory.shift();
    }
  }
}
