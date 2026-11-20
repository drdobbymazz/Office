// BOSS FOR A DAY (person). A crown lands on their head and the whole office is
// told they are in charge. They march into Michael's office; a scene with them
// and Michael (who takes it badly).

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run, nearestTo, staff } from './util';

const LASTS = 116;
const THRONE_DOING = "running the office from Michael's office";

class CrownRun extends Run {
  private scene = false;

  constructor(sim: SimApi, private who: CharId) {
    const p = sim.person(who)!;
    super(sim, 'crown', `${p.name} is the boss now`, 'boss', { who });
    sim.fx({ kind: 'burst', what: 'stars', x: p.x, y: p.y - 30, count: 12 });
    sim.sfx('gong');
    this.hat(who, 'crown');
    this.status(who, 'crowned', LASTS + 4);
    sim.feel(who, 'smug', 1, 15);
    sim.react(who, 'cheer', 1.4);
    this.narrate('start');
    this.fact(true);
    sim.remember('all', this.line('fact'), 1.5);
    this.focusOn([who], 3000);
    const michael = who !== 'michael' && sim.person('michael')?.present ? 'michael' : null;
    this.at(1, () => {
      sim.chaosBark(who, 'crown');
      for (const o of staff(sim)) {
        if (o.id === who) continue;
        if (o.id === michael) {
          sim.chaosBark(o.id, 'crown');
          sim.feel(o.id, 'sad', 0.9, 20);
          continue;
        }
        sim.emote(o.id, o.id === 'stanley' ? 'dots' : sim.rng() < 0.5 ? 'question' : 'eye');
      }
    });
    this.at(2.5, () => {
      sim.goTo(who, { anchor: 'spot.boss3' }, { doing: "marching into Michael's office", stay: 30, stayDoing: THRONE_DOING, then: () => this.meet(michael) });
      if (michael && sim.person(michael)?.available) sim.goTo(michael, { anchor: 'spot.boss1' }, { doing: 'following to see what is going on', stay: 20, stayDoing: 'standing in his own office like a visitor' });
    });
    this.at(18, () => this.meet(michael));
    this.at(LASTS, () => {
      this.hat(who, null);
      this.unStatus(who, 'crowned');
      sim.feel(who, 'sad', 0.5, 5);
      this.fact(false);
      this.narrate('end');
      this.remember('all', 1);
    });
    this.at(LASTS + 1, () => this.close());
  }

  private meet(michael: CharId | null): void {
    if (this.scene) return;
    this.scene = true;
    const sim = this.sim;
    const p = sim.person(this.who);
    const other = michael ?? (p ? nearestTo(sim, p.x, p.y, [this.who])?.id : undefined);
    sim.requestScene({
      people: other ? [this.who, other] : [this.who],
      trigger: 'event',
      why: michael
        ? `${this.name(this.who)} has just been made boss of the office for the day and has moved into Michael's office.`
        : `${this.name(this.who)} has just been made boss of the office for the day.`,
      priority: 7,
      minLines: 4,
      staleAfter: 30
    });
  }

  protected onEnd(): void {
    const p = this.sim.person(this.who);
    if (p && p.available && p.doing === THRONE_DOING) this.sim.resume(this.who);
  }
}

export const crownScript: ChaosScript = {
  id: 'crown',
  start(sim, target) {
    return new CrownRun(sim, target.who as CharId);
  }
};
