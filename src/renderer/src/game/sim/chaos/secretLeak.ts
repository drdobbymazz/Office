// LEAK A SECRET (person). Every computer pings: an email has gone to the whole
// office with their secret in it. They go red and go off to hide; three others
// huddle and talk about it.

import type { CastId } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run, availableIds, screensAt, shuffle, staff } from './util';

const LASTS = 27;

class LeakRun extends Run {
  constructor(sim: SimApi, private who: CastId) {
    const p = sim.person(who)!;
    super(sim, 'secretLeak', `${p.name}'s secret got out`, p.room, { who });
    sim.sfx('ding');
    this.at(0.25, () => sim.sfx('ding'));
    this.at(0.5, () => sim.sfx('ding'));
    for (const m of shuffle(sim, screensAt()).slice(0, 8)) sim.fx({ kind: 'floatText', x: m.x, y: m.y - 8, text: '1 new email', color: 0xffe08a });
    sim.revealSecret(who);
    this.narrate('start');
    this.fact(true);
    this.focusOn([who], 3000);
    const others = shuffle(sim, staff(sim).filter((o) => o.id !== who).map((o) => o.id));
    others.forEach((id, i) => this.at(0.6 + i * 0.15, () => {
      if (id === 'stanley') return void sim.emote(id, 'dots');
      sim.emote(id, i % 3 === 0 ? 'laugh' : 'eye');
      if (i < 2) sim.chaosBark(id, 'secretLeak');
      else if (i < 5) sim.react(id, sim.rng() < 0.5 ? 'laugh' : 'point', 1.2);
    }));
    this.at(1.2, () => {
      sim.feel(who, 'embarrassed', 1, 20);
      sim.react(who, 'facepalm', 1.5);
      sim.bark(who, 'hurt');
      sim.bumpMood(who, -0.2);
    });
    this.at(3, () => sim.setPlan(who, { kind: 'hide', target: null, about: 'the email everyone just read' }));
    this.at(4, () => {
      const trio = availableIds(sim, others, 3);
      if (trio.length >= 2) {
        sim.requestScene({
          people: trio,
          trigger: 'event',
          why: `An email revealing ${p.name}'s secret has just gone to the whole office, and ${p.name} has gone off to hide.`,
          priority: 7,
          staleAfter: 30
        });
      }
    });
    this.at(LASTS, () => {
      this.fact(false);
      this.narrate('end');
      this.close();
    });
  }
}

export const secretLeakScript: ChaosScript = {
  id: 'secretLeak',
  blocked(_sim, target) {
    return target.who && !isCastId(target.who) ? 'Only the staff have secrets on file.' : null;
  },
  start(sim, target) {
    return new LeakRun(sim, target.who as CastId);
  }
};
