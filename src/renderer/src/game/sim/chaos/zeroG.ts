// ZERO GRAVITY (none). Everyone lifts gently off the floor and drifts. Then
// gravity returns and they all drop with a thud; a few are left dizzy.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run, availableIds, shuffle, tween } from './util';

const FLOAT_FOR = 14;

interface Floater {
  id: CharId;
  x: number;
  y: number;
  phase: number;
  height: number;
}

class ZeroGRun extends Run {
  private floaters: Floater[] = [];
  private dropped = false;

  constructor(sim: SimApi) {
    super(sim, 'zeroG', 'Zero gravity', null, {});
    this.effect('zeroG', { kind: 'zeroG', level: 0 });
    sim.sfx('whoosh');
    sim.fx({ kind: 'flash', color: 0xc8d8ff, alpha: 0.3, ms: 200 });
    this.narrate('start');
    this.fact(true);
    const people = shuffle(sim, sim.people().filter((p) => p.present && !sim.isAirborne(p.id)));
    people.forEach((p, i) => {
      this.seize(p.id, { anim: 'float', doing: 'floating in mid-air' });
      this.floaters.push({ id: p.id, x: p.x, y: p.y, phase: sim.rng() * Math.PI * 2, height: 12 + sim.rng() * 10 });
      if (i < 3) this.after(0.6 + i * 0.5, () => sim.bark(p.id, 'floating'));
      else if (i < 8) sim.emote(p.id, 'question');
      sim.feel(p.id, p.id === 'stanley' ? 'bored' : sim.rng() < 0.5 ? 'excited' : 'scared', 0.7, FLOAT_FOR);
    });
    this.at(FLOAT_FOR, () => this.drop());
    this.at(FLOAT_FOR + 2.7, () => this.close());
  }

  protected tick(): void {
    if (this.dropped) return;
    const sim = this.sim;
    const t = this.t;
    this.patch('zeroG', { level: tween(t, 0, 1.5, 0, 1) });
    const rise = tween(t, 0, 2.5, 0, 1);
    for (const f of this.floaters) {
      if (!this.isHeld(f.id) || sim.isAirborne(f.id)) continue;
      const k = t * 0.7 + f.phase;
      sim.place(f.id, f.x + Math.sin(k) * 5, f.y + Math.cos(k * 0.8) * 3, rise * (f.height + Math.sin(k * 1.6) * 4));
    }
  }

  private drop(): void {
    const sim = this.sim;
    this.dropped = true;
    this.unEffect('zeroG');
    sim.sfx('fall');
    const ids = this.heldIds();
    this.releaseAll();
    this.after(0.45, () => {
      sim.sfx('thud');
      sim.shake(0.35, 300);
      for (const id of ids) {
        const p = sim.person(id);
        if (p && p.present) sim.fx({ kind: 'impact', x: p.x, y: p.y, power: 0.5 });
      }
      for (const id of shuffle(sim, ids).slice(0, 3)) {
        sim.addStatus(id, 'dizzy', 6);
        sim.bark(id, 'dizzy');
      }
    });
    this.fact(false);
    this.narrate('end');
    this.remember('all', 1.5);
    // Ask once they are back on their feet (nobody is available mid-fall).
    this.after(2.2, () => {
      const people = availableIds(sim, shuffle(sim, ids.filter((id) => sim.person(id)?.isCast)), 3);
      sim.requestScene({
        people: people.length ? people : undefined,
        trigger: 'aftermath',
        why: this.line('aftermath'),
        priority: 5,
        staleAfter: 30
      });
    });
  }
}

export const zeroGScript: ChaosScript = {
  id: 'zeroG',
  start(sim) {
    return new ZeroGRun(sim);
  }
};
