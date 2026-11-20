// GRUDGE (pair). An anger burst; the first person is furious with the second
// (status 'rage') and storms over to have it out, which brings on a scene.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run } from './util';

const LASTS = 57;

class RageRun extends Run {
  private nextFume = 6;

  constructor(sim: SimApi, private a: CharId, private b: CharId) {
    const p = sim.person(a)!;
    super(sim, 'rage', `${p.name} is furious with ${sim.person(b)?.name ?? 'someone'}`, p.room, { who: a, other: b });
    sim.fx({ kind: 'burst', what: 'anger', x: p.x, y: p.y - 28, count: 10 });
    sim.sfx('thud', p.x);
    this.status(a, 'rage', LASTS + 4, b);
    sim.emote(a, 'anger');
    sim.feel(a, 'angry', 1, 15);
    sim.react(a, 'stomp', 1.4);
    this.narrate('start');
    this.fact(true);
    this.focusOn([a], 2500);
    this.at(1, () => sim.bark(a, 'angry'));
    this.at(2.5, () => sim.setPlan(a, { kind: 'confront', target: b, about: 'everything they have ever done' }));
    this.at(LASTS, () => {
      this.unStatus(a, 'rage');
      sim.feel(a, 'embarrassed', 0.6, 6);
      this.fact(false);
      this.narrate('end');
      this.remember([a, b], 1.5);
    });
    this.at(LASTS + 1, () => this.close());
  }

  protected tick(): void {
    if (this.t < this.nextFume || this.t > LASTS - 2) return;
    this.nextFume = this.t + 6 + this.sim.rng() * 4;
    const p = this.sim.person(this.a);
    if (p && p.present) this.sim.fx({ kind: 'burst', what: 'anger', x: p.x, y: p.y - 28, count: 3 });
  }
}

export const rageScript: ChaosScript = {
  id: 'rage',
  start(sim, target) {
    return new RageRun(sim, target.who as CharId, target.other as CharId);
  }
};
