// DISCO (none). The lights drop, a mirror ball spins and everyone dances (each
// their own way; Stanley barely). Then it stops, and everyone is embarrassed.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run, availableIds, shuffle, tween } from './util';

const DANCE_FOR = 22;

class DiscoRun extends Run {
  private dancers: CharId[] = [];
  private stopped = false;

  constructor(sim: SimApi) {
    super(sim, 'disco', 'Disco fever', null, {});
    this.effect('disco', { kind: 'disco', level: 0 });
    sim.sfx('party');
    this.narrate('start');
    this.fact(true);
    const people = shuffle(sim, sim.people().filter((p) => p.present));
    people.forEach((p, i) => {
      this.at(0.3 + sim.rng() * 1.8, () => {
        if (!sim.person(p.id)?.present || sim.isAirborne(p.id)) return;
        this.dancers.push(p.id);
        sim.hush(p.id);
        this.pin(p.id, { anim: 'dance', variant: p.id === 'stanley' ? 0 : Math.floor(sim.rng() * 4), doing: 'dancing under a mirror ball' });
        if (p.id === 'stanley') {
          sim.emote(p.id, 'dots');
          sim.feel(p.id, 'bored', 0.8, DANCE_FOR);
          return;
        }
        if (i < 2) sim.chaosBark(p.id, 'disco');
        else sim.emote(p.id, 'music');
        sim.feel(p.id, sim.rng() < 0.6 ? 'excited' : 'confused', 0.7, DANCE_FOR);
      });
    });
    this.at(DANCE_FOR, () => this.stop());
    this.at(DANCE_FOR + 2.5, () => this.close());
  }

  protected tick(dt: number): void {
    if (this.stopped) return;
    this.patch('disco', { level: tween(this.t, 0, 1.5, 0, 1) });
    if (this.sim.rng() < dt * 0.8 && this.dancers.length) {
      const id = this.dancers[Math.floor(this.sim.rng() * this.dancers.length)];
      this.sim.emote(id, 'music');
    }
  }

  private stop(): void {
    const sim = this.sim;
    this.stopped = true;
    this.unEffect('disco');
    sim.sfx('pop');
    this.releaseAll();
    this.fact(false);
    this.narrate('end');
    const cast = this.dancers.filter((id) => sim.person(id)?.isCast);
    cast.forEach((id, i) => {
      sim.feel(id, id === 'stanley' ? 'bored' : 'embarrassed', 0.8, 8);
      if (i < 5) this.after(0.4 + i * 0.3, () => {
        sim.emote(id, 'sweat');
        sim.react(id, 'facepalm', 1.4);
      });
    });
    this.remember(cast, 1.5);
    this.after(1.5, () => {
      const people = availableIds(sim, shuffle(sim, cast), 3);
      sim.requestScene({
        people: people.length ? people : undefined,
        trigger: 'aftermath',
        why: 'Everyone was just made to dance under a mirror ball in the middle of the office, and it has suddenly stopped.',
        priority: 5,
        staleAfter: 30
      });
    });
  }
}

export const discoScript: ChaosScript = {
  id: 'disco',
  start(sim) {
    return new DiscoRun(sim);
  }
};
