// SURPRISE PARTY (person). Balloons in their room, a burst of confetti, a cake
// beside them and a party hat on their head. The nearest few gather and cheer.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run, availableIds, staff } from './util';

const LASTS = 32;
const GUESTS = 5;

class BirthdayRun extends Run {
  private guests: CharId[] = [];

  constructor(sim: SimApi, private who: CharId) {
    const p = sim.person(who)!;
    super(sim, 'birthday', `Surprise party for ${p.name}`, p.room, { who });
    this.effect('balloons', { kind: 'balloons', room: p.room, count: 6 });
    this.effect('cake', { kind: 'item', item: 'cake', x: p.x + 14, y: p.y });
    sim.fx({ kind: 'burst', what: 'confetti', x: p.x, y: p.y - 30, count: 24 });
    sim.sfx('party', p.x);
    this.hat(who, 'partyHat');
    this.status(who, 'party', LASTS + 4);
    sim.react(who, 'startle', 1);
    sim.feel(who, 'surprised', 1, 4);
    this.narrate('start');
    this.fact(true);
    this.focus(p.x, p.y - 16, 130, 100, 4000);
    if (p.available) sim.goTo(who, { tile: p.tile }, { doing: 'being thrown a surprise party', stay: LASTS, stayDoing: 'at their own surprise party' });
    const near = staff(sim).filter((o) => o.id !== who && o.available)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
      .slice(0, GUESTS);
    near.forEach((o, i) => this.at(0.4 + i * 0.4, () => {
      if (!sim.person(o.id)?.available) return;
      this.guests.push(o.id);
      sim.goTo(o.id, { near: who }, { doing: 'joining the surprise party', stay: 20, stayDoing: 'at the surprise party' });
      if (i < 2) sim.chaosBark(o.id, 'birthday');
      else sim.emote(o.id, 'music');
      sim.feel(o.id, o.id === 'stanley' ? 'bored' : 'happy', 0.8, 15);
    }));
    this.at(1.4, () => {
      sim.feel(who, sim.rng() < 0.6 ? 'happy' : 'embarrassed', 0.9, 12);
      sim.bark(who, 'delighted');
    });
    this.at(6, () => {
      for (const id of this.guests) sim.react(id, 'cheer', 1.5);
      sim.fx({ kind: 'burst', what: 'confetti', x: p.x, y: p.y - 30, count: 16 });
      sim.requestScene({
        people: [who, ...availableIds(sim, this.guests, 2)],
        trigger: 'event',
        why: `Balloons, confetti and a cake have appeared out of nowhere for a surprise party for ${p.name}.`,
        priority: 7,
        staleAfter: 25
      });
    });
    this.at(LASTS, () => this.wind());
    this.at(LASTS + 1, () => this.close());
  }

  private wind(): void {
    const sim = this.sim;
    const p = sim.person(this.who);
    if (p) sim.fx({ kind: 'poof', x: p.x + 14, y: p.y - 6 });
    this.unEffect('balloons');
    this.unEffect('cake');
    this.hat(this.who, null);
    this.unStatus(this.who, 'party');
    this.fact(false);
    this.narrate('end');
    this.remember([this.who, ...this.guests], 1.5);
    sim.bumpMood(this.who, 0.1);
  }

  protected onEnd(): void {
    const p = this.sim.person(this.who);
    if (p && p.available && p.doing === 'at their own surprise party') this.sim.resume(this.who);
  }
}

export const birthdayScript: ChaosScript = {
  id: 'birthday',
  start(sim, target) {
    return new BirthdayRun(sim, target.who as CharId);
  }
};
