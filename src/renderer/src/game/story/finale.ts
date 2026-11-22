// The week's last scene, played on the floor before the ending card: the vice
// president rings with the verdict, and the office takes it in. About fifteen
// seconds, built only from things the office already has (walking, lines,
// balloons, confetti, the lights going out). Driven by game.ts while
// UiState.finale is true; skippable at any time.

import type { CastId, CharId, RoomId } from '@/game/core/types';
import { CAST } from '@/game/core/cast';
import { roomCentrePx } from '@/game/core/world';
import type { Sim } from '@/game/sim';
import type { EndingId } from './rules';
import { FINALE } from './text';
import type { WeekNotes } from './types';

interface Step {
  at: number;
  run: () => void;
}

/** Seconds of office time to run (silently) so everyone is in before the scene starts. */
export const FINALE_PREROLL = 30;

export class FinaleScene {
  private t = 0;
  private steps: Step[] = [];
  private next = 0;
  readonly length: number;
  /** The room the camera should frame. */
  readonly room: RoomId;
  private finished = false;

  constructor(private sim: Sim, readonly ending: EndingId, private notes: WeekNotes) {
    this.room = ending === 'closed' ? 'bullpen' : 'meeting';
    if (ending === 'saved') this.length = this.saved();
    else if (ending === 'scraped') this.length = this.scraped();
    else this.length = this.closed();
    this.steps.sort((a, b) => a.at - b.at);
  }

  get done(): boolean {
    return this.finished;
  }

  update(dt: number): void {
    if (this.finished) return;
    this.t += Math.max(0, dt);
    while (this.next < this.steps.length && this.steps[this.next].at <= this.t) {
      const step = this.steps[this.next++];
      try {
        step.run();
      } catch (err) {
        console.error('[finale] step failed', err);
      }
    }
    if (this.t >= this.length) this.finished = true;
  }

  /** Stop now (the card comes up). What has already happened stays on the floor. */
  skip(): void {
    this.finished = true;
  }

  // ── helpers ──

  private at(t: number, run: () => void): void {
    this.steps.push({ at: t, run });
  }

  private here(id: CharId): boolean {
    return !!this.sim.person(id)?.present;
  }

  private staff(): CastId[] {
    return this.sim.people().filter((p) => p.isCast && p.present).map((p) => p.id as CastId);
  }

  private say(t: number, who: CharId, text: string, kind: 'say' | 'shout' | 'think' = 'say', emotion: 'happy' | 'sad' | 'neutral' | 'surprised' | 'nervous' = 'neutral'): void {
    this.at(t, () => {
      if (this.here(who)) this.sim.say(who, text, { kind, emotion });
    });
  }

  /** The vice president rings with the verdict, a moment after the ending's sting. */
  private call(text: string): void {
    this.at(1.2, () => {
      this.sim.sfx('phoneRing');
      this.sim.narrate(FINALE.vp(text), { icon: 'phone', room: 'boss', beat: true });
    });
  }

  private gather(t: number, room: RoomId, doing: string, who: () => CastId[]): void {
    this.at(t, () => {
      for (const id of who()) {
        if (!this.sim.person(id)?.available) continue;
        this.sim.goTo(id, { room }, { style: 'run', doing, stay: 120, stayDoing: doing });
      }
    });
  }

  // ── the three endings ──

  private saved(): number {
    const room: RoomId = 'meeting';
    this.call(FINALE.saved.vp);
    this.say(4.4, 'michael', FINALE.saved.michael, 'shout', 'happy');
    this.gather(5.2, room, FINALE.saved.doing, () => this.staff());
    this.at(8.7, () => {
      const c = roomCentrePx(room);
      this.sim.addEffect({ id: 'finale-balloons', kind: 'balloons', room, count: 8 });
      this.sim.addEffect({ id: 'finale-confetti', kind: 'rain', room, what: 'confetti', rate: 0.7 });
      this.sim.fx({ kind: 'burst', what: 'confetti', x: c.x, y: c.y, count: 24 });
    });
    this.at(9.7, () => {
      for (const id of this.staff()) if (this.sim.person(id)?.room === room && this.sim.rng() < 0.7) this.sim.react(id, 'cheer', 2);
    });
    const lines = [...FINALE.saved.lines];
    if (this.notes.leakFound && this.notes.leak) lines.splice(1, 0, { who: this.notes.leak, text: FINALE.saved.leak });
    lines.forEach((l, i) => this.say(10.5 + i * 2, l.who as CharId, l.text, 'say', 'happy'));
    return 10.5 + lines.length * 2 + 2;
  }

  private scraped(): number {
    const room: RoomId = 'meeting';
    this.call(FINALE.scraped.vp);
    this.say(4.4, 'michael', FINALE.scraped.michael, 'shout', 'happy');
    this.gather(5.2, room, FINALE.scraped.doing, () => this.staff().filter((id) => id === 'michael' || this.sim.rng() < 0.45));
    this.at(7.7, () => {
      // Half the lights go off: the budget is cut.
      this.sim.addEffect({ id: 'finale-cuts', kind: 'dark', rooms: ['annex', 'accounts', 'kitchen'], level: 0.55, emergency: false });
      this.sim.addEffect({ id: 'finale-balloon', kind: 'balloons', room, count: 1 });
    });
    FINALE.scraped.lines.forEach((l, i) => this.say(9.7 + i * 2.4, l.who as CharId, l.text, 'say', i === 0 ? 'neutral' : 'happy'));
    return 9.7 + FINALE.scraped.lines.length * 2.4 + 2;
  }

  private closed(): number {
    this.call(FINALE.closed.vp);
    this.say(4.4, 'michael', FINALE.closed.michael, 'say', 'sad');
    // Everyone else packs a box and walks out of the front door, one after another.
    const leaving = (Object.keys(CAST) as CastId[]).filter((id) => id !== 'michael');
    leaving.forEach((id, i) => this.at(6.2 + i * 0.45, () => {
      const p = this.sim.person(id);
      if (!p?.present || !p.available) return;
      this.sim.setProp(id, 'box');
      this.sim.goTo(id, { anchor: 'exit.street' }, { doing: FINALE.closed.doing, stay: 0, stayDoing: FINALE.closed.doing });
    }));
    // The lights go out room by room.
    const rooms: RoomId[] = ['annex', 'accounts', 'kitchen', 'meeting', 'bullpen'];
    rooms.forEach((room, i) => this.at(8.2 + i * 1.6, () => {
      this.sim.addEffect({ id: `finale-dark-${room}`, kind: 'dark', rooms: [room], level: 0.8, emergency: false });
    }));
    this.say(14.7, 'michael', FINALE.closed.last, 'think', 'sad');
    this.at(15.7, () => {
      if (this.sim.person('michael')?.available) this.sim.goTo('michael', { anchor: 'exit.street' }, { doing: FINALE.closed.doing, stay: 0, stayDoing: FINALE.closed.doing });
    });
    this.at(17.7, () => this.sim.addEffect({ id: 'finale-dark-boss', kind: 'dark', rooms: ['boss'], level: 0.85, emergency: false }));
    return 19;
  }
}
