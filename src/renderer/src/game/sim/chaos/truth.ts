// TRUTH SERUM (person). A shimmer, and they cannot lie or hold anything back
// (the 'truth' status puts their secret in their prompt). A scene with whoever
// is nearest. When it wears off, the office has heard their secret.

import type { CharId } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run, nearestTo } from './util';

const LASTS = 68;

class TruthRun extends Run {
  constructor(sim: SimApi, private who: CharId) {
    const p = sim.person(who)!;
    super(sim, 'truth', `${p.name} cannot lie`, p.room, { who });
    this.effect('shimmer', { kind: 'cloud', what: 'magic', x: p.x, y: p.y - 16, radius: 14 });
    sim.sfx('sparkle', p.x);
    this.status(who, 'truth', LASTS + 4);
    sim.emote(who, 'idea');
    sim.feel(who, 'surprised', 0.8, 5);
    sim.react(who, 'startle', 0.8);
    this.narrate('start');
    this.fact(true);
    this.focusOn([who], 2500);
    this.at(1.5, () => {
      this.unEffect('shimmer');
      sim.chaosBark(who, 'truth');
    });
    this.at(3, () => {
      const q = sim.person(who);
      const other = q ? nearestTo(sim, q.x, q.y, [who]) : undefined;
      sim.requestScene({
        people: other ? [who, other.id] : [who],
        trigger: 'event',
        why: `${p.name} has been given a truth serum and cannot lie or hold anything back.`,
        priority: 8,
        minLines: 4,
        staleAfter: 30
      });
    });
    this.at(LASTS, () => {
      this.unStatus(who, 'truth');
      if (isCastId(who)) sim.revealSecret(who);
      sim.emote(who, 'sweat');
      sim.feel(who, 'embarrassed', 0.8, 8);
      this.fact(false);
      this.narrate('end');
      this.remember([who], 2);
    });
    this.at(LASTS + 1, () => this.close());
  }
}

export const truthScript: ChaosScript = {
  id: 'truth',
  start(sim, target) {
    return new TruthRun(sim, target.who as CharId);
  }
};
