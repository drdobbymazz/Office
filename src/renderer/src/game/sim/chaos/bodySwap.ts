// BODY SWAP (pair). A beam links the two, swirls, and each wakes up in the
// other's head (the 'swapped' status makes each talk like the other). A scene
// between them at once; later they swap back with another swirl.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run } from './util';

const LASTS = 72;
const COLOR = 0xc58bff;

class SwapRun extends Run {
  private beamUntil = 0;

  constructor(sim: SimApi, private a: CharId, private b: CharId) {
    super(sim, 'bodySwap', `${sim.person(a)?.name ?? 'Someone'} and ${sim.person(b)?.name ?? 'someone'} swapped minds`, sim.person(a)?.room ?? null, { who: a, other: b });
    this.link(1.6);
    sim.sfx('swap');
    this.at(0.8, () => {
      this.status(a, 'swapped', LASTS + 4, b);
      this.status(b, 'swapped', LASTS + 4, a);
      for (const id of [a, b]) {
        sim.addStatus(id, 'dizzy', 4);
        sim.react(id, 'dizzy', 2);
        sim.feel(id, 'confused', 1, 8);
        sim.emote(id, 'question');
      }
      this.narrate('start');
      this.fact(true);
    });
    this.at(2.4, () => {
      sim.chaosBark(a, 'bodySwap');
      sim.requestScene({
        people: [a, b],
        trigger: 'event',
        why: `${this.name(a)} and ${this.name(b)} have just swapped minds: each is now inside the other's body.`,
        priority: 8,
        minLines: 4,
        staleAfter: 30
      });
    });
    this.at(LASTS, () => {
      this.link(1.2);
      sim.sfx('swap');
      this.unStatus(a, 'swapped');
      this.unStatus(b, 'swapped');
      for (const id of [a, b]) sim.react(id, 'dizzy', 1.5);
      this.fact(false);
      this.narrate('end');
      this.remember([a, b], 2.5);
      sim.requestScene({
        people: [a, b],
        trigger: 'aftermath',
        why: this.line('aftermath'),
        priority: 5,
        staleAfter: 30
      });
    });
    this.at(LASTS + 1.6, () => this.close());
  }

  private link(seconds: number): void {
    const sim = this.sim;
    const pa = sim.person(this.a);
    const pb = sim.person(this.b);
    if (!pa || !pb) return;
    this.effect('beam', { kind: 'beam', from: { x: pa.x, y: pa.y - 18 }, to: { x: pb.x, y: pb.y - 18 }, color: COLOR, width: 3 });
    sim.fx({ kind: 'swirl', x: pa.x, y: pa.y - 18, color: COLOR });
    sim.fx({ kind: 'swirl', x: pb.x, y: pb.y - 18, color: COLOR });
    this.beamUntil = this.t + seconds;
    this.focusOn([this.a, this.b], 3000);
  }

  protected tick(): void {
    if (!this.hasEffect('beam')) return;
    if (this.t >= this.beamUntil) {
      this.unEffect('beam');
      return;
    }
    const pa = this.sim.person(this.a);
    const pb = this.sim.person(this.b);
    if (pa && pb) this.patch('beam', { from: { x: pa.x, y: pa.y - 18 }, to: { x: pb.x, y: pb.y - 18 } });
  }
}

export const bodySwapScript: ChaosScript = {
  id: 'bodySwap',
  start(sim, target) {
    return new SwapRun(sim, target.who as CharId, target.other as CharId);
  }
};
