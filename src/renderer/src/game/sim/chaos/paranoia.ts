// PARANOIA (person). A tinfoil hat appears; they are sure they are being
// watched. They dart glances about and either go to warn someone or hide.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run, nearestTo } from './util';

const LASTS = 68;

class ParanoiaRun extends Run {
  private nextDart = 5;

  constructor(sim: SimApi, private who: CharId) {
    const p = sim.person(who)!;
    super(sim, 'paranoia', `${p.name} feels watched`, p.room, { who });
    sim.fx({ kind: 'poof', x: p.x, y: p.y - 30, color: 0xd8d8e0 });
    sim.sfx('pop', p.x);
    this.hat(who, 'tinfoil');
    this.status(who, 'paranoid', LASTS + 4);
    sim.emote(who, 'eye');
    sim.react(who, 'startle', 0.8);
    sim.feel(who, 'suspicious', 1, 10);
    this.narrate('start');
    this.fact(true);
    this.focusOn([who], 2500);
    this.at(1.2, () => sim.chaosBark(who, 'paranoia'));
    this.at(3, () => {
      const q = sim.person(who);
      const other = q ? nearestTo(sim, q.x, q.y, [who]) : undefined;
      if (other && sim.rng() < 0.55) sim.setPlan(who, { kind: 'talk', target: other.id, about: 'the people who are watching them' });
      else sim.setPlan(who, { kind: 'hide', target: null, about: 'whoever is watching' });
    });
    this.at(LASTS, () => {
      this.hat(who, null);
      this.unStatus(who, 'paranoid');
      sim.feel(who, 'embarrassed', 0.6, 5);
      this.fact(false);
      this.narrate('end');
      this.remember([who], 1.5);
    });
    this.at(LASTS + 1, () => this.close());
  }

  protected tick(): void {
    if (this.t < this.nextDart || this.t > LASTS - 2) return;
    this.nextDart = this.t + 4 + this.sim.rng() * 4;
    const sim = this.sim;
    const dirs = ['left', 'right', 'up', 'down'] as const;
    const p = sim.person(this.who);
    if (!p || !p.present) return;
    const d = dirs[Math.floor(sim.rng() * 4)];
    sim.react(this.who, 'startle', 0.5, { face: d });
    sim.emote(this.who, sim.rng() < 0.6 ? 'eye' : 'question');
  }
}

export const paranoiaScript: ChaosScript = {
  id: 'paranoia',
  start(sim, target) {
    return new ParanoiaRun(sim, target.who as CharId);
  }
};
