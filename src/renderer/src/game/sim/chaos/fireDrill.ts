// FIRE DRILL (none). The alarm goes and everyone files out onto the pavement.
// Dwight takes charge; Stanley takes his time. Once most are out (or after a
// while) they stand about for a scene, then the all-clear sends them back in.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { WORLD_W, anchor, feetOf } from '@/game/core/world';
import { Run, availableIds, shuffle, staff } from './util';

const MOST = 0.7;
const GIVE_UP = 35;
const HOLD = 12;

class FireDrillRun extends Run {
  private out: CharId[] = [];
  private holdAt = -1;
  private cleared = false;

  constructor(sim: SimApi) {
    super(sim, 'fireDrill', 'Fire drill', null, {});
    this.effect('alarm', { kind: 'alarm' });
    this.loop('alarm', true);
    this.narrate('start');
    this.fact(true);
    const people = shuffle(sim, staff(sim).filter((p) => p.available).map((p) => p.id));
    this.out = people;
    people.forEach((id, i) => {
      if (id === 'dwight') {
        sim.chaosBark(id, 'fireDrill');
        sim.feel(id, 'determined', 1, 20);
        sim.react(id, 'point', 1.5);
        this.at(2.5, () => sim.evacuate(id));
        return;
      }
      if (id === 'stanley') {
        sim.emote(id, 'dots');
        sim.feel(id, 'bored', 0.8, 15);
        this.at(6, () => sim.evacuate(id));
        return;
      }
      if (i < 2) sim.chaosBark(id, 'fireDrill');
      else sim.emote(id, 'alert');
      this.at(0.3 + i * 0.25, () => sim.evacuate(id));
    });
    const door = feetOf(anchor('door.entrance').tile);
    this.focus(door.x, door.y + 20, 200, 110, 4000, 0.8);
  }

  protected tick(): void {
    if (this.holdAt >= 0) {
      if (this.t - this.holdAt >= HOLD) this.allClear();
      return;
    }
    const present = staff(this.sim);
    const outside = present.filter((p) => p.room === 'outside');
    if (this.t >= GIVE_UP || (present.length && outside.length / present.length >= MOST)) this.hold(outside.map((p) => p.id));
  }

  private hold(outside: CharId[]): void {
    const sim = this.sim;
    this.holdAt = this.t;
    this.unEffect('alarm');
    this.loop('alarm', false);
    const lead = outside.includes('dwight') ? ['dwight'] : [];
    const others = shuffle(sim, outside.filter((id) => id !== 'dwight'));
    const people = availableIds(sim, [...lead, ...others], 3);
    sim.requestScene({
      people: people.length ? people : undefined,
      room: 'outside',
      trigger: 'event',
      why: 'Everyone is standing on the pavement outside during a fire drill' + (lead.length ? ', and Dwight is running it.' : '.'),
      priority: 7,
      staleAfter: 20
    });
    this.sim.bus.emit('focus', { x: WORLD_W / 2 - 140, y: 340, w: 280, h: 76, weight: 0.8, holdMs: 4000 });
  }

  private allClear(): void {
    const sim = this.sim;
    this.cleared = true;
    sim.sfx('ding');
    this.narrate('end');
    this.fact(false);
    for (const id of this.out) {
      const p = sim.person(id);
      // The all-clear ends any chat out there too: everyone goes back in.
      if (p && p.present) sim.resume(id);
    }
    this.remember('all', 1);
    this.close();
  }

  protected onEnd(): void {
    if (this.cleared) return;
    for (const id of this.out) if (this.sim.person(id)?.present) this.sim.resume(id);
  }
}

export const fireDrillScript: ChaosScript = {
  id: 'fireDrill',
  start(sim) {
    return new FireDrillRun(sim);
  }
};
