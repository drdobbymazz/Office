// The office clock: 09:00 to 17:00 over `dayMinutes` real minutes, with a few
// minutes before nine for people to arrive.

export const DAY_START = 9 * 60;
export const DAY_END = 17 * 60;
/** The clock starts here so the staff can walk in before nine. */
export const ARRIVE_FROM = 8 * 60 + 50;
export const LUNCH_FROM = 12 * 60 + 20;
export const LUNCH_TO = 12 * 60 + 45;

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

export type DayPhase = 'arriving' | 'working' | 'leaving' | 'over';

export class Clock {
  day = 1;
  /** Minutes since midnight. */
  clock = ARRIVE_FROM;
  phase: DayPhase = 'arriving';
  /** Real seconds since home time began. */
  leavingFor = 0;
  /** Game minutes per real second. */
  readonly rate: number;

  constructor(dayMinutes: number) {
    this.rate = (DAY_END - DAY_START) / (Math.max(0.25, dayMinutes) * 60);
  }

  reset(day: number): void {
    this.day = day;
    this.clock = ARRIVE_FROM;
    this.phase = 'arriving';
    this.leavingFor = 0;
  }

  advance(dt: number): void {
    if (this.phase === 'over') return;
    this.clock += dt * this.rate;
    if (this.phase === 'leaving') this.leavingFor += dt;
  }

  /** Real seconds for a span of game minutes. */
  secondsFor(minutes: number): number {
    return minutes / this.rate;
  }

  get weekday(): string {
    return WEEKDAYS[(((this.day - 1) % 5) + 5) % 5];
  }

  get progress(): number {
    return Math.max(0, Math.min(1, (this.clock - DAY_START) / (DAY_END - DAY_START)));
  }

  get hour(): number {
    return this.clock / 60;
  }
}
