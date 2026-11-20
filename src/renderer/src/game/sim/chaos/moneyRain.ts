// BONUS RAIN (room). Banknotes fall from the ceiling. Everyone in or near the
// room rushes in to grab some, cheering; each comes away 'rich'. A scene about
// who took how much.

import type { CharId, TargetRoomId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { feetOf, room as roomDef, roomRectPx } from '@/game/core/world';
import { Run, availableIds, randomTileIn, roomCentre, staff } from './util';

const RAINS_FOR = 14;
const MAX_GRABBERS = 7;

class MoneyRun extends Run {
  private grabbed = new Map<CharId, number>();
  private grabbers: CharId[] = [];

  constructor(sim: SimApi, private target: TargetRoomId) {
    super(sim, 'moneyRain', `Money raining in ${roomDef(target).name}`, target, { room: target });
    this.effect('rain', { kind: 'rain', room: target, what: 'cash', rate: 1 });
    sim.sfx('cash');
    this.narrate('start');
    this.fact(true);
    this.focusRoom(target, 4000);
    for (let i = 0; i < 3; i++) {
      const f = feetOf(randomTileIn(sim, target));
      this.effect(`pile${i}`, { kind: 'item', item: 'cashPile', x: f.x, y: f.y - 2 });
    }
    const c = roomCentre(target);
    const r = roomRectPx(target);
    const near = sim.peopleNear(c.x, c.y, Math.max(r.w, r.h) / 2 + 120).filter((p) => p.isCast && p.present);
    const crowd = [...new Map([...staff(sim, target), ...near].map((p) => [p.id, p])).values()].filter((p) => p.available);
    crowd.slice(0, MAX_GRABBERS).forEach((p, i) => this.at(0.3 + i * 0.4, () => this.rush(p.id, i)));
  }

  private rush(id: CharId, i: number): void {
    const sim = this.sim;
    if (!sim.person(id)?.available) return;
    this.grabbers.push(id);
    if (i < 2) sim.chaosBark(id, 'moneyRain');
    else sim.emote(id, 'money');
    sim.feel(id, 'excited', 1, 10);
    sim.assign(id, {
      at: { tile: randomTileIn(sim, this.target) },
      seconds: 3 + sim.rng() * 3,
      anim: 'operate',
      prop: 'cash',
      style: 'run',
      doing: 'grabbing banknotes',
      walkDoing: 'rushing for the falling money'
    }, () => {
      const amount = 20 * (1 + Math.floor(sim.rng() * 20));
      this.grabbed.set(id, amount);
      sim.addStatus(id, 'rich', 60);
      sim.bumpMood(id, 0.15);
      sim.react(id, 'cheer', 1.2);
      sim.fx({ kind: 'floatText', x: sim.person(id)?.x ?? 0, y: (sim.person(id)?.y ?? 0) - 30, text: `+$${amount}`, color: 0x7ad17a });
      sim.sfx('coin', sim.person(id)?.x);
      if (sim.rng() < 0.4) sim.bark(id, 'delighted');
    });
  }

  protected tick(dt: number): void {
    const sim = this.sim;
    if (this.hasEffect('rain')) {
      if (sim.rng() < dt * 1.2) sim.sfx('coin');
      if (this.t >= RAINS_FOR) this.stopRain();
    } else if (this.t >= RAINS_FOR + 4) {
      this.close();
    }
  }

  private stopRain(): void {
    const sim = this.sim;
    this.unEffect('rain');
    this.fact(false);
    this.narrate('end');
    this.remember(this.grabbers, 1.5);
    const tally = [...this.grabbed.entries()].sort((a, b) => b[1] - a[1]);
    const parts = tally.slice(0, 4).map(([id, n]) => `${this.name(id)} grabbed $${n}`);
    const people = availableIds(sim, [...tally.map(([id]) => id), ...this.grabbers], 3);
    sim.requestScene({
      people: people.length ? people : undefined,
      room: this.target,
      trigger: 'aftermath',
      why: `Banknotes just rained from the ceiling of ${roomDef(this.target).name}${parts.length ? `: ${parts.join(', ')}.` : ' and nobody grabbed any.'}`,
      priority: 7,
      staleAfter: 30
    });
  }
}

export const moneyRainScript: ChaosScript = {
  id: 'moneyRain',
  start(sim, target) {
    return new MoneyRun(sim, target.room as TargetRoomId);
  }
};
