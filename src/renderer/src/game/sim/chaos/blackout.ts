// BLACKOUT (none). The power dies: dark office, emergency lighting, dead
// screens, a few phone torches. A power fixer feels their way to the fuse box
// in the break room and resets the breaker. It comes back by itself if not.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { anchor, feetOf } from '@/game/core/world';
import { Fixer, Run, availableIds, isNervous, screensAt, shuffle, staff } from './util';

const COMES_BACK_AT = 34;
const TORCHES = 3;

class BlackoutRun extends Run {
  private torches: CharId[] = [];
  private fixer: Fixer;
  private onAt = -1;

  constructor(sim: SimApi) {
    super(sim, 'blackout', 'Blackout', null, {});
    sim.sfx('powerDown');
    sim.fx({ kind: 'flash', color: 0x000000, alpha: 0.5, ms: 200 });
    this.effect('dark', { kind: 'dark', rooms: 'all', level: 0.85, emergency: true });
    this.effect('screens', { kind: 'screens', state: 'off', at: screensAt() });
    this.narrate('start');
    this.fact(true);

    const everyone = shuffle(sim, staff(sim).map((p) => p.id));
    everyone.forEach((id, i) => {
      if (i < 3) sim.bark(id, 'dark');
      else sim.emote(id, i % 2 ? 'question' : 'alert');
      if (isNervous(id)) {
        sim.feel(id, 'scared', 0.8, 8);
        sim.react(id, 'cower', 2);
      } else {
        sim.feel(id, 'confused', 0.6, 6);
        sim.react(id, sim.rng() < 0.5 ? 'shrug' : 'startle', 1.2);
      }
    });
    // A few phone torches come on.
    this.after(1.2, () => {
      for (const id of everyone.filter((id) => sim.person(id)?.available).slice(0, TORCHES)) {
        this.torches.push(id);
        this.prop(id, 'phone');
        const p = sim.person(id);
        if (p) this.effect(`torch:${id}`, { kind: 'light', x: p.x, y: p.y - 12, radius: 26, color: 0xfff2c0 });
      }
    });
    const box = anchor('stand.fridge').tile;
    const boxPx = feetOf(box);
    this.fixer = new Fixer(sim, {
      skill: 'power',
      near: () => boxPx,
      firstAt: 3,
      chaos: 'blackout',
      task: { at: { anchor: 'stand.fridge' }, seconds: 4, anim: 'operate', prop: 'flashlight', doing: 'resetting the breaker', walkDoing: 'feeling the way to the fuse box' },
      onCalled: (who) => {
        const p = sim.person(who);
        if (p) this.effect(`torch:${who}`, { kind: 'light', x: p.x, y: p.y - 12, radius: 30, color: 0xffffff });
        this.torches.push(who);
      },
      onDone: (who) => this.powerOn(who)
    });
  }

  protected tick(): void {
    const sim = this.sim;
    if (this.onAt >= 0) {
      if (this.t - this.onAt > 2) this.close();
      return;
    }
    for (const id of this.torches) {
      const p = sim.person(id);
      if (p && p.present) this.patch(`torch:${id}`, { x: p.x, y: p.y - 12 });
    }
    this.fixer.update(this.t);
    if (this.t >= COMES_BACK_AT) this.powerOn(null);
  }

  private powerOn(by: CharId | null): void {
    if (this.onAt >= 0) return;
    const sim = this.sim;
    this.onAt = this.t;
    sim.sfx('powerUp');
    sim.fx({ kind: 'flash', color: 0xffffff, alpha: 0.35, ms: 160 });
    this.unEffect('dark');
    this.unEffect('screens');
    for (const id of this.torches) {
      this.unEffect(`torch:${id}`);
      if (id !== by) this.prop(id, null);
    }
    this.fact(false);
    this.narrate('end');
    const cheer = shuffle(sim, staff(sim).filter((p) => p.available).map((p) => p.id)).slice(0, 4);
    for (const id of cheer) {
      sim.react(id, 'cheer', 1.2);
      sim.feel(id, 'happy', 0.6, 5);
    }
    this.remember('all', 1);
    if (by) {
      sim.emote(by, 'star');
      sim.feel(by, 'proud', 0.8, 8);
      sim.remember([by], 'I got the power back on by resetting the breaker.', 2);
      this.focusOn([by]);
    }
    const people = availableIds(sim, by ? [by, ...cheer] : cheer, 2);
    sim.requestScene({
      people: people.length ? people : undefined,
      trigger: 'aftermath',
      why: by ? `${this.name(by)} just got the power back on after a blackout.` : this.line('aftermath'),
      priority: 5,
      staleAfter: 40
    });
  }

  protected onEnd(): void {
    this.fixer.cancel();
  }
}

export const blackoutScript: ChaosScript = {
  id: 'blackout',
  start(sim) {
    return new BlackoutRun(sim);
  }
};
