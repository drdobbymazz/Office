// SNACK STORM (none, break room). The vending machine fires snacks across the
// room. People duck or run; Kevin runs straight at it. A machine fixer kicks it
// quiet, or it runs out. Everyone who stayed gets a snack.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { LANDMARKS, feetOf, walkableTilesIn } from '@/game/core/world';
import { Fixer, Run, availableIds, pick, reactAll, staff } from './util';

const RUNS_OUT = 18;
const PILES_STAY = 4;

class SnackRun extends Run {
  private x: number;
  private y: number;
  private stoppedAt = -1;
  private piles = 0;
  private fixer: Fixer;

  constructor(sim: SimApi) {
    super(sim, 'snackStorm', 'Snack storm in the break room', 'kitchen', { room: 'kitchen' });
    const m = feetOf(LANDMARKS.vendingMachine);
    this.x = m.x;
    this.y = m.y - 14;
    this.effect('spray', { kind: 'spray', what: 'snacks', x: this.x, y: this.y, power: 0.9 });
    this.loop('printerRage', true);
    sim.sfx('pop', this.x);
    sim.shake(0.12, 200);
    this.narrate('start');
    this.fact(true);
    this.focusRoom('kitchen');
    const here = staff(sim, 'kitchen').map((p) => p.id).filter((id) => id !== 'kevin');
    reactAll(sim, here, 'snackStorm', {
      bold: (id) => {
        sim.react(id, 'cower', 2);
        sim.feel(id, 'surprised', 0.6, 5);
      },
      scared: (id) => {
        sim.feel(id, 'scared', 0.8, 6);
        sim.fleeFrom(id, 'kitchen', { doing: 'running from flying snacks', stay: 8 });
      },
      middling: (id) => {
        if (sim.rng() < 0.5) sim.react(id, 'cower', 2.5);
        else sim.fleeFrom(id, 'kitchen', { doing: 'ducking out of the break room', stay: 8 });
      }
    });
    // Kevin, wherever he is, runs toward it.
    const kevin = sim.person('kevin');
    if (kevin && kevin.available) {
      sim.chaosBark('kevin', 'snackStorm');
      sim.feel('kevin', 'excited', 1, 15);
      sim.assign('kevin', { at: { anchor: 'spot.kitchen2' }, seconds: 8, anim: 'eat', prop: 'donut', style: 'run', doing: 'eating snacks off the floor, delighted', walkDoing: 'running toward the snack storm' },
        () => sim.bumpMood('kevin', 0.2), () => sim.setProp('kevin', null));
    }
    this.fixer = new Fixer(sim, {
      skill: 'machine',
      near: () => ({ x: this.x, y: this.y }),
      firstAt: 9,
      task: { at: { anchor: 'stand.vending' }, seconds: 2.5, anim: 'operate', style: 'run', doing: 'kicking the vending machine', walkDoing: 'going to stop the vending machine' },
      onDone: (who) => this.stop(who)
    });
  }

  protected tick(dt: number): void {
    const sim = this.sim;
    if (this.stoppedAt >= 0) {
      if (this.t - this.stoppedAt >= PILES_STAY) this.close();
      return;
    }
    if (sim.rng() < dt * 3) {
      sim.fx({ kind: 'burst', what: 'snacks', x: this.x, y: this.y, count: 4 });
      if (sim.rng() < 0.5) sim.sfx('pop', this.x);
    }
    if (this.piles < 3 && this.t > 2 + this.piles * 4) {
      const t = pick(sim, walkableTilesIn('kitchen'));
      if (t) this.effect(`pile${this.piles}`, { kind: 'item', item: 'snackPile', x: feetOf(t).x, y: feetOf(t).y - 2 });
      this.piles++;
    }
    this.fixer.update(this.t);
    if (this.t >= RUNS_OUT) this.stop(null);
  }

  private stop(by: CharId | null): void {
    if (this.stoppedAt >= 0) return;
    const sim = this.sim;
    this.stoppedAt = this.t;
    this.unEffect('spray');
    this.loop('printerRage', false);
    sim.sfx('thud', this.x);
    this.fact(false);
    this.narrate('end');
    const eaters = staff(sim, 'kitchen').filter((p) => p.available);
    for (const p of eaters) {
      sim.react(p.id, 'eat', 3);
      sim.bumpMood(p.id, 0.08);
      sim.feel(p.id, 'happy', 0.6, 6);
    }
    if (by) sim.emote(by, 'star');
    this.remember('kitchen', 1);
    const people = availableIds(sim, [...(by ? [by] : []), ...eaters.map((p) => p.id)], 3);
    sim.requestScene({
      people: people.length ? people : undefined,
      room: 'kitchen',
      trigger: 'aftermath',
      why: by ? `${this.name(by)} just stopped the vending machine firing snacks across the break room.` : this.line('aftermath'),
      priority: 4,
      staleAfter: 30
    });
  }

  protected onEnd(): void {
    this.fixer.cancel();
  }
}

export const snackStormScript: ChaosScript = {
  id: 'snackStorm',
  blocked(sim) {
    return sim.isHazard('kitchen') ? 'The break room is not safe right now.' : null;
  },
  start(sim) {
    return new SnackRun(sim);
  }
};
