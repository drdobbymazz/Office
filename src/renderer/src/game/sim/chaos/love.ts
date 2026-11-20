// CUPID'S ARROW (pair). Hearts burst over the first person; they fall for the
// second (status 'love') and go to flirt, which brings on a scene by itself.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run } from './util';

const LASTS = 86;

class LoveRun extends Run {
  private nextHearts = 7;

  constructor(sim: SimApi, private a: CharId, private b: CharId) {
    const p = sim.person(a)!;
    super(sim, 'love', `${p.name} fell for ${sim.person(b)?.name ?? 'someone'}`, p.room, { who: a, other: b });
    sim.fx({ kind: 'burst', what: 'hearts', x: p.x, y: p.y - 28, count: 14 });
    sim.sfx('heart', p.x);
    this.status(a, 'love', LASTS + 4, b);
    sim.emote(a, 'heart');
    sim.feel(a, 'love', 1, 12);
    sim.react(a, 'startle', 0.6);
    sim.face(a, b);
    this.narrate('start');
    this.fact(true);
    this.focusOn([a, b], 3000);
    this.at(1.2, () => sim.chaosBark(a, 'love'));
    this.at(3, () => sim.setPlan(a, { kind: 'flirt', target: b, about: 'how wonderful they suddenly seem' }));
    this.at(LASTS, () => {
      this.unStatus(a, 'love');
      sim.emote(a, 'question');
      sim.feel(a, 'confused', 0.7, 6);
      this.fact(false);
      this.narrate('end');
      this.remember([a, b], 2);
    });
    this.at(LASTS + 1, () => this.close());
  }

  protected tick(): void {
    if (this.t < this.nextHearts || this.t > LASTS - 2) return;
    this.nextHearts = this.t + 6 + this.sim.rng() * 4;
    const p = this.sim.person(this.a);
    if (p && p.present) this.sim.fx({ kind: 'burst', what: 'hearts', x: p.x, y: p.y - 28, count: 4 });
  }
}

export const loveScript: ChaosScript = {
  id: 'love',
  start(sim, target) {
    return new LoveRun(sim, target.who as CharId, target.other as CharId);
  }
};
