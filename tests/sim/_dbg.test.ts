import { it } from 'vitest';
import { makeSim, runUntil } from './helpers';
it('dbg', () => {
  const { sim } = makeSim({ seed: 3, dayMinutes: 30 });
  console.log('start', sim.phase, sim.clock, sim.day);
  const t = runUntil(sim, () => sim.phase === 'working', 120);
  console.log('after', t, sim.phase, sim.clock, sim.day, sim.debugPeople().filter(p=>p.present).length);
});
