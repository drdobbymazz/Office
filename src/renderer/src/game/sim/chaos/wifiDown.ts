// WI-FI DOWN (none). Every screen shows "no signal". People stop typing, sigh,
// and about half get up to talk to someone instead. A Wi-Fi fixer turns the
// router off and on again; it comes back by itself if nobody does.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { anchor, feetOf } from '@/game/core/world';
import { Fixer, Run, availableIds, pick, screensAt, shuffle, staff } from './util';

const ROUTER = 'spot.annex4';
const BACK_BY = 38;

class WifiRun extends Run {
  private fixer: Fixer;
  private backAt = -1;
  private talkers: CharId[] = [];

  constructor(sim: SimApi) {
    super(sim, 'wifiDown', 'Wi-Fi down', null, {});
    this.effect('screens', { kind: 'screens', state: 'nosignal', at: screensAt() });
    sim.sfx('deny');
    this.narrate('start');
    this.fact(true);
    const people = shuffle(sim, staff(sim).filter((p) => p.available).map((p) => p.id));
    people.forEach((id, i) => {
      if (i < 2) sim.chaosBark(id, 'wifiDown');
      else sim.emote(id, i % 3 ? 'no' : 'question');
      sim.react(id, id === 'stanley' ? 'shrug' : sim.rng() < 0.5 ? 'facepalm' : 'shake', 1.5);
      sim.feel(id, id === 'stanley' ? 'bored' : 'confused', 0.6, 6);
    });
    // About half get up and go and talk to someone instead.
    people.filter((id) => id !== 'stanley' && sim.rng() < 0.5).forEach((id, i) => {
      this.at(2 + i * 0.8, () => {
        const other = pick(sim, people.filter((o) => o !== id));
        if (!other || !sim.person(id)?.available) return;
        this.talkers.push(id);
        sim.setPlan(id, { kind: 'talk', target: other, about: 'the Wi-Fi being down' });
      });
    });
    this.fixer = new Fixer(sim, {
      skill: 'wifi',
      near: () => feetOf(anchor(ROUTER).tile),
      firstAt: 12,
      chaos: 'wifiDown',
      task: { at: { anchor: ROUTER }, seconds: 5, anim: 'operate', doing: 'turning the router off and on again', walkDoing: 'going to turn the router off and on again' },
      onDone: (who) => this.back(who)
    });
  }

  protected tick(): void {
    if (this.backAt >= 0) {
      if (this.t - this.backAt > 1.5) this.close();
      return;
    }
    this.fixer.update(this.t);
    if (this.t >= BACK_BY) this.back(null);
  }

  private back(by: CharId | null): void {
    if (this.backAt >= 0) return;
    const sim = this.sim;
    this.backAt = this.t;
    this.unEffect('screens');
    sim.sfx('ding');
    this.fact(false);
    this.narrate('end');
    for (const p of staff(sim).filter((p) => p.available).slice(0, 4)) sim.react(p.id, 'cheer', 1);
    this.remember('all', 0.8);
    if (by) {
      sim.emote(by, 'star');
      sim.remember([by], 'I fixed the Wi-Fi by turning the router off and on again.', 1.2);
    }
    const people = availableIds(sim, by ? [by, ...this.talkers] : this.talkers, 2);
    sim.requestScene({
      people: people.length ? people : undefined,
      trigger: 'aftermath',
      why: by ? `${this.name(by)} just fixed the Wi-Fi by turning it off and on again.` : this.line('aftermath'),
      priority: 4,
      staleAfter: 30
    });
  }

  protected onEnd(): void {
    this.fixer.cancel();
  }
}

export const wifiDownScript: ChaosScript = {
  id: 'wifiDown',
  start(sim) {
    return new WifiRun(sim);
  }
};
