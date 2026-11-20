// LAYOFF RUMOUR (none). Everyone hears that someone is getting sacked today.
// Moods dip, the nervous sweat, Stanley shrugs, and a few pairs go off to
// gossip about it (their plans bring on scenes by themselves).

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run, isNervous, shuffle, staff } from './util';

const LASTS = 50;
const PAIRS = 3;

class RumourRun extends Run {
  private everyone: CharId[];

  constructor(sim: SimApi) {
    super(sim, 'rumour', 'Layoff rumour', null, {});
    sim.sfx('gasp');
    this.narrate('start');
    this.fact(true);
    sim.remember('all', this.line('fact'), 1.5);
    this.everyone = shuffle(sim, staff(sim).map((p) => p.id));
    this.everyone.forEach((id, i) => {
      if (id === 'stanley') {
        sim.emote(id, 'dots');
        return;
      }
      sim.bumpMood(id, isNervous(id) ? -0.15 : -0.07);
      if (isNervous(id)) {
        sim.feel(id, 'nervous', 0.9, 15);
        this.at(0.3 + i * 0.2, () => sim.emote(id, 'sweat'));
      } else {
        sim.feel(id, 'suspicious', 0.6, 10);
      }
    });
    const first = this.everyone.find((id) => id !== 'stanley');
    if (first) sim.chaosBark(first, 'rumour');
    // A few pairs go and whisper about it.
    const free = this.everyone.filter((id) => id !== 'stanley' && sim.person(id)?.available);
    for (let k = 0; k < PAIRS && free.length >= 2; k++) {
      const a = free.shift()!;
      const b = free.shift()!;
      this.at(1 + k * 5, () => {
        if (sim.person(a)?.available && sim.person(b)?.present) sim.setPlan(a, { kind: 'gossip', target: b, about: 'who is getting sacked today' });
      });
    }
    this.at(LASTS, () => {
      this.fact(false);
      this.narrate('end');
      this.close();
    });
  }

  protected tick(dt: number): void {
    if (this.sim.rng() > dt * 0.5 || !this.everyone.length) return;
    const id = this.everyone[Math.floor(this.sim.rng() * this.everyone.length)];
    if (this.sim.person(id)?.available) this.sim.emote(id, isNervous(id) ? 'sweat' : 'eye');
  }
}

export const rumourScript: ChaosScript = {
  id: 'rumour',
  start(sim) {
    return new RumourRun(sim);
  }
};
