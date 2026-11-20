// TRIPLE ESPRESSO (person). They down it, judder, and race off to talk at
// someone at double speed (the sim speeds up anyone 'caffeinated'). Then the
// crash.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run, pick, staff } from './util';

const LASTS = 48;

class EspressoRun extends Run {
  private nextJitter = 4;

  constructor(sim: SimApi, private who: CharId) {
    const p = sim.person(who)!;
    super(sim, 'espresso', `${p.name} had a triple espresso`, p.room, { who });
    this.prop(who, 'coffee');
    sim.react(who, 'drink', 1.5);
    sim.sfx('slurp', p.x);
    this.focus(p.x, p.y - 16, 90, 80, 2500);
    this.at(1.6, () => {
      const q = sim.person(who);
      this.prop(who, null);
      this.status(who, 'caffeinated', LASTS + 4);
      if (q) sim.fx({ kind: 'sparks', x: q.x, y: q.y - 20 });
      sim.sfx('zap', q?.x);
      sim.react(who, 'shiver', 1);
      sim.feel(who, 'excited', 1, 20);
      sim.chaosBark(who, 'espresso');
      this.narrate('start');
      this.fact(true);
      for (const o of sim.peopleNear(q?.x ?? 0, q?.y ?? 0, 100)) if (o.id !== who && o.isCast) sim.emote(o.id, 'question');
    });
    this.at(3.2, () => {
      const other = pick(sim, staff(sim).filter((o) => o.id !== who && o.present).map((o) => o.id));
      if (other) sim.setPlan(who, { kind: 'talk', target: other, about: 'every idea they have ever had, very fast' });
    });
    this.at(LASTS, () => {
      this.unStatus(who, 'caffeinated');
      sim.addStatus(who, 'sleepy', 40);
      sim.feel(who, 'tired', 0.8, 10);
      sim.react(who, 'dizzy', 1.2);
      this.fact(false);
      this.narrate('end');
      this.remember([who], 1.2);
    });
    this.at(LASTS + 1, () => this.close());
  }

  protected tick(): void {
    if (this.t < this.nextJitter || this.t > LASTS - 1) return;
    this.nextJitter = this.t + 5 + this.sim.rng() * 4;
    this.sim.emote(this.who, this.sim.rng() < 0.5 ? 'coffee' : 'sweat');
  }
}

export const espressoScript: ChaosScript = {
  id: 'espresso',
  start(sim, target) {
    return new EspressoRun(sim, target.who as CharId);
  }
};
