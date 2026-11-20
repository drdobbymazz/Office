// Shared by SHRINK and EMBIGGEN (person): a zap from above, the person shrinks
// (or grows: the sim eases their scale from the 'tiny' / 'giant' status), barks,
// witnesses react, and a minute later they pop back to normal size.

import type { CharId } from '@/game/core/types';
import type { ChaosRun, SimApi } from '@/game/core/simApi';
import { Run, availableIds } from './util';

const LASTS = 58;

export class SizeRun extends Run {
  private witnesses: CharId[] = [];

  constructor(sim: SimApi, private who: CharId, private big: boolean) {
    const p = sim.person(who)!;
    super(sim, big ? 'giant' : 'shrink', `${p.name} ${big ? 'grew to giant size' : 'was shrunk'}`, p.room, { who });
    const color = big ? 0xff9b54 : 0x7fd1ff;
    sim.fx({ kind: 'zap', from: { x: p.x, y: Math.max(0, p.y - 220) }, to: { x: p.x, y: p.y - 14 }, color });
    sim.fx({ kind: 'ring', x: p.x, y: p.y - 14, color });
    sim.sfx(big ? 'grow' : 'shrink', p.x);
    this.status(who, big ? 'giant' : 'tiny', LASTS + 4);
    sim.react(who, 'zapped', 1);
    sim.feel(who, 'surprised', 1, 4);
    this.narrate('start');
    this.fact(true);
    this.focus(p.x, p.y - 16, 90, 80);
    this.witnesses = sim.peopleNear(p.x, p.y, 110).filter((o) => o.id !== who && o.present && o.isCast).map((o) => o.id);
    this.at(1.2, () => {
      sim.bark(who, big ? 'giant' : 'tiny');
      this.witnesses.forEach((id, i) => {
        sim.face(id, who);
        if (i === 0) sim.chaosBark(id, this.id);
        else sim.emote(id, i % 2 ? 'alert' : 'laugh');
        sim.react(id, sim.rng() < 0.5 ? 'startle' : 'laugh', 1.2);
      });
    });
    this.at(4, () => {
      const other = availableIds(sim, this.witnesses, 1);
      sim.requestScene({
        people: [who, ...other],
        trigger: 'event',
        why: big ? `${p.name} has suddenly grown to giant size, right in the office.` : `${p.name} has suddenly shrunk to the size of a stapler, right in the office.`,
        priority: 7,
        staleAfter: 25
      });
    });
    this.at(LASTS, () => this.back());
    this.at(LASTS + 1, () => this.close());
  }

  private back(): void {
    const sim = this.sim;
    const p = sim.person(this.who);
    this.unStatus(this.who, this.big ? 'giant' : 'tiny');
    if (p && p.present) {
      sim.fx({ kind: 'poof', x: p.x, y: p.y - 12, color: 0xffffff });
      sim.sfx(this.big ? 'shrink' : 'grow', p.x);
      sim.emote(this.who, 'question');
    }
    this.fact(false);
    this.narrate('end');
    this.remember([this.who, ...this.witnesses], 1.5);
  }
}

export function sizeRun(sim: SimApi, who: CharId, big: boolean): ChaosRun {
  return new SizeRun(sim, who, big);
}
