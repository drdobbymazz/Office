// NAP ATTACK (room). Everyone in the room drops off where they are, snoring,
// and wakes with a start about twenty-five seconds later.

import type { CharId, TargetRoomId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { room as roomDef } from '@/game/core/world';
import { Run, availableIds, roomCentre } from './util';

const ASLEEP_FOR = 23;

class SleepRun extends Run {
  private sleepers: CharId[] = [];

  constructor(sim: SimApi, private target: TargetRoomId) {
    super(sim, 'sleep', `Nap attack in ${roomDef(target).name}`, target, { room: target });
    const c = roomCentre(target);
    this.effect('haze', { kind: 'cloud', what: 'magic', x: c.x, y: c.y, radius: 40 });
    this.at(2, () => this.unEffect('haze'));
    sim.sfx('sparkle');
    for (const p of sim.peopleIn(target)) {
      if (!p.present || sim.isAirborne(p.id)) continue;
      this.sleepers.push(p.id);
      sim.hush(p.id);
      this.status(p.id, 'asleep', ASLEEP_FOR + 6);
      this.pin(p.id, { anim: 'sleep', doing: 'fast asleep' });
      sim.fx({ kind: 'burst', what: 'zzz', x: p.x, y: p.y - 28, count: 3 });
    }
    this.narrate('start');
    this.fact(true);
    this.focusRoom(target, 3000);
    this.at(ASLEEP_FOR, () => this.wake());
    this.at(ASLEEP_FOR + 1.5, () => this.close());
  }

  protected tick(dt: number): void {
    if (this.t >= ASLEEP_FOR || !this.sleepers.length || this.sim.rng() > dt * 1.2) return;
    const id = this.sleepers[Math.floor(this.sim.rng() * this.sleepers.length)];
    this.sim.emote(id, 'zzz');
  }

  private wake(): void {
    const sim = this.sim;
    for (const id of this.sleepers) this.unStatus(id, 'asleep');
    this.releaseAll();
    sim.sfx('ding');
    this.sleepers.forEach((id, i) => {
      sim.emote(id, 'alert');
      sim.react(id, 'startle', 0.8);
      sim.feel(id, 'confused', 0.8, 6);
      if (i < 2) sim.bark(id, 'startled');
    });
    this.fact(false);
    this.narrate('end');
    this.remember(this.sleepers, 1);
    const people = availableIds(sim, this.sleepers.filter((id) => sim.person(id)?.isCast), 3);
    this.after(1, () => sim.requestScene({
      people: people.length ? people : undefined,
      room: this.target,
      trigger: 'aftermath',
      why: this.line('aftermath'),
      priority: 4,
      staleAfter: 30
    }));
  }
}

export const sleepScript: ChaosScript = {
  id: 'sleep',
  blocked(sim, target) {
    return target.room && !sim.peopleIn(target.room).some((p) => p.present) ? 'Nobody is in that room to fall asleep.' : null;
  },
  start(sim, target) {
    return new SleepRun(sim, target.room as TargetRoomId);
  }
};
