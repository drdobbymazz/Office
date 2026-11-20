// QUAKE (none). Six seconds of shaking: everyone cowers, the brave brace,
// one or two fall over, paper flies. Paper piles on the floor afterwards.

import type { CastId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { deskOf, feetOf } from '@/game/core/world';
import { Run, availableIds, isBrave, shuffle, staff } from './util';

const SHAKE = 6;

class QuakeRun extends Run {
  private everyone: string[];

  constructor(sim: SimApi) {
    super(sim, 'quake', 'Earthquake', null, {});
    this.effect('quake', { kind: 'quake', power: 0.8 });
    this.loop('rumble', true);
    sim.shake(0.6, SHAKE * 1000);
    sim.sfx('thud');
    sim.bus.emit('buzz', { pattern: [80, 40, 80, 40, 120] });
    this.narrate('start');
    this.fact(true);
    this.everyone = shuffle(sim, staff(sim).map((p) => p.id));
    this.everyone.forEach((id, i) => {
      if (i < 2) sim.chaosBark(id, 'quake');
      else sim.emote(id, 'alert');
      if (isBrave(id)) {
        sim.react(id, 'shiver', SHAKE);
        sim.feel(id, 'determined', 0.6, 8);
      } else {
        sim.react(id, 'cower', SHAKE);
        sim.feel(id, 'scared', 0.9, 8);
      }
    });
    // One or two lose their footing.
    const fallers = this.everyone.filter((id) => !isBrave(id) && sim.person(id)?.available).slice(0, 1 + (sim.rng() < 0.5 ? 1 : 0));
    fallers.forEach((id, i) => this.at(1.5 + i * 1.7, () => {
      if (!sim.person(id)?.present) return;
      sim.launch(id, (sim.rng() - 0.5) * 60, (sim.rng() - 0.5) * 40, 70);
      sim.bark(id, 'scared');
    }));
    for (const at of [1, 2.5, 4]) this.at(at, () => this.paperBurst());
    this.at(SHAKE, () => this.settle());
    this.at(SHAKE + 3.5, () => this.close());
  }

  private paperBurst(): void {
    const sim = this.sim;
    const id = this.everyone[Math.floor(sim.rng() * this.everyone.length)] as CastId | undefined;
    if (!id) return;
    const d = feetOf(deskOf(id).tile);
    sim.fx({ kind: 'burst', what: 'paper', x: d.x, y: d.y - 14, count: 8 });
    sim.sfx('paper', d.x);
  }

  private settle(): void {
    const sim = this.sim;
    this.unEffect('quake');
    this.loop('rumble', false);
    this.fact(false);
    this.narrate('end');
    shuffle(sim, this.everyone).slice(0, 3).forEach((id, i) => {
      const d = feetOf(deskOf(id as CastId).tile);
      this.effect(`paper${i}`, { kind: 'item', item: 'paperPile', x: d.x + (i % 2 ? 10 : -10), y: d.y + 4 });
    });
    this.remember('all', 1.5);
    const people = availableIds(sim, shuffle(sim, this.everyone), 3);
    sim.requestScene({
      people: people.length ? people : undefined,
      trigger: 'aftermath',
      why: this.line('aftermath'),
      priority: 6,
      staleAfter: 30
    });
  }
}

export const quakeScript: ChaosScript = {
  id: 'quake',
  start(sim) {
    return new QuakeRun(sim);
  }
};
