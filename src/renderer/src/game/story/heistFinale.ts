// Episode 3's last scene, on the office floor before the ending card. Three versions:
// saved (the conference room, the right tape on the screen, relief), scraped (Ms Vane
// writing in her notebook all the way to the front door), closed (the wrong tape on
// the screen and Michael's face, or Ms Vane's full notebook). Skippable.

import type { CastId, CharId, RoomId } from '@/game/core/types';
import { roomCentrePx, roomRectPx } from '@/game/core/world';
import type { Sim } from '@/game/sim';
import { registerVane } from './heistChapters';
import { HEIST_FINALE, VANE, type HeistLine } from './heistText';
import type { EndingId } from './rules';
import type { WeekNotes } from './types';

interface Step {
  at: number;
  run: () => void;
}

const SCREEN_FX = 'heist.finale.screen';

export class HeistFinaleScene {
  readonly room: RoomId;
  readonly frame: { x: number; y: number; w: number; h: number };
  readonly length: number;
  private t = 0;
  private steps: Step[] = [];
  private next = 0;
  private finished = false;

  constructor(private sim: Sim, readonly ending: EndingId, private notes: WeekNotes) {
    registerVane();
    this.room = ending === 'scraped' ? 'bullpen' : 'meeting';
    if (ending === 'scraped') {
      const meet = roomRectPx('meeting');
      const pen = roomRectPx('bullpen');
      this.frame = { x: pen.x, y: meet.y, w: pen.w, h: pen.y + pen.h - meet.y };
    } else {
      const meet = roomRectPx('meeting');
      this.frame = { x: meet.x - 64, y: meet.y - 8, w: meet.w + 128, h: meet.h + 96 };
    }
    this.length = ending === 'saved' ? this.saved() : ending === 'scraped' ? this.scraped() : this.closed();
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

  skip(): void {
    this.finished = true;
  }

  // ── helpers ──

  private at(t: number, run: () => void): void {
    this.steps.push({ at: t, run });
  }

  private staff(): CastId[] {
    return this.sim.people().filter((p) => p.isCast && p.present).map((p) => p.id as CastId);
  }

  private lines(start: number, gap: number, lines: readonly HeistLine[]): number {
    lines.forEach((l, i) => this.at(start + i * gap, () => {
      if (this.sim.person(l.who)?.present) this.sim.say(l.who, l.text, { kind: l.kind ?? 'say', emotion: l.emotion });
    }));
    return start + lines.length * gap;
  }

  private caption(t: number, text: string, icon = 'play'): void {
    this.at(t, () => this.sim.narrate(text, { icon, room: this.room, beat: true }));
  }

  private vane(at: string, prop: 'case' | 'clipboard' | null): void {
    const s = this.sim;
    s.spawnVisitor(VANE, { anchor: at });
    if (prop) s.setProp(VANE, prop);
  }

  /** Everyone round the conference table, Ms Vane at its head, the screen on. */
  private screening(color: number): void {
    const s = this.sim;
    this.at(0.3, () => {
      this.vane('spot.meetHead', 'case');
      s.goTo(VANE, { anchor: 'spot.meetHead' }, { stay: 60, stayDoing: 'watching the screen' });
      const ids = this.staff();
      ids.forEach((id, i) => {
        s.goTo(id, { anchor: `spot.meet${(i % 15) + 1}` }, { style: 'walk', doing: 'watching the screening', stay: 60, stayDoing: 'watching the screening' });
      });
      const c = roomCentrePx('meeting');
      s.addEffect({ id: SCREEN_FX, kind: 'light', x: c.x + 40, y: roomRectPx('meeting').y + 10, radius: 30, color });
    });
  }

  // ── the three endings ──

  private saved(): number {
    const s = this.sim;
    this.screening(0xbfe6ff);
    this.caption(2.5, HEIST_FINALE.captions.saved);
    this.at(4.5, () => s.sfx('ding'));
    const end = this.lines(5.5, 2.6, HEIST_FINALE.saved);
    this.at(6.0, () => {
      s.addEffect({ id: 'heist.finale.balloons', kind: 'balloons', room: 'meeting', count: 6 });
      const c = roomCentrePx('meeting');
      s.fx({ kind: 'burst', what: 'confetti', x: c.x, y: c.y, count: 20 });
      for (const id of this.staff()) if (s.rng() < 0.6) s.react(id, 'cheer', 2);
      for (const id of this.staff()) s.feel(id, 'happy', 0.8, 20);
    });
    return end + 2;
  }

  private scraped(): number {
    const s = this.sim;
    this.at(0.3, () => {
      const ids = this.staff();
      ids.forEach((id, i) => s.goTo(id, { anchor: `spot.bullpen${(i % 10) + 1}` }, { style: 'walk', doing: 'watching Ms Vane leave', stay: 60, stayDoing: 'watching Ms Vane leave' }));
      this.vane('spot.meetHead', 'clipboard');
      s.feel(VANE, 'suspicious', 0.8, 30);
      s.goTo(VANE, { anchor: 'spot.bullpen5' }, { style: 'walk', doing: 'writing in her notebook', stay: 6, stayDoing: 'writing in her notebook' });
    });
    this.caption(2.2, HEIST_FINALE.captions.scraped, 'inspector');
    const end = this.lines(4.0, 2.8, HEIST_FINALE.scraped);
    this.at(end - 0.5, () => {
      s.goTo(VANE, { anchor: 'exit.street' }, { style: 'walk', doing: 'leaving with her notebook', stay: 0 });
    });
    for (const id of ['jim', 'pam', 'michael'] as CharId[]) this.at(5, () => s.feel(id, 'nervous', 0.7, 20));
    return end + 2.5;
  }

  private closed(): number {
    const s = this.sim;
    const wrong = !this.notes.heistSwitched;
    this.screening(wrong ? 0xff9a8a : 0xbfe6ff);
    this.caption(2.5, wrong ? HEIST_FINALE.captions.closedWrong : HEIST_FINALE.captions.closedTalk, wrong ? 'play' : 'inspector');
    this.at(4.0, () => {
      s.feel('michael', wrong ? 'embarrassed' : 'sad', 1, 30);
      s.emote('michael', 'sweat');
      for (const id of this.staff()) if (id !== 'michael') s.feel(id, wrong ? 'surprised' : 'nervous', 0.8, 20);
      if (wrong) s.setProp(VANE, null);
    });
    const end = this.lines(5.0, 2.8, wrong ? HEIST_FINALE.closedWrong : HEIST_FINALE.closedTalk);
    this.at(end, () => {
      s.addEffect({ id: 'heist.finale.dark', kind: 'dark', rooms: ['meeting'], level: 0.5, emergency: false });
      if (s.person('michael')?.present) s.goTo('michael', { anchor: 'desk.michael' }, { style: 'walk', doing: 'going back to his office', stay: 60, stayDoing: 'staring at the wall' });
    });
    return end + 2.5;
  }
}
