import { describe, expect, it } from 'vitest';
import { makeSim, runUntil, invariantErrors } from './helpers';

describe('a quiet day', () => {
  it('runs a whole day and everyone gets home', () => {
    const { sim, rec } = makeSim({ dayMinutes: 1.5 });
    const errs: string[] = [];
    let ended = false;
    sim.bus.on('dayEnd', () => { ended = true; });
    const seen = new Set<string>();
    runUntil(sim, () => ended, 200, 1 / 20, () => {
      for (const e of invariantErrors(sim)) if (errs.length < 20) errs.push(`${sim.clock.toFixed(0)} ${e}`);
      for (const p of sim.debugPeople()) if (p.present) seen.add(`${p.id}:${p.doing}`);
    });
    console.log([...seen].slice(0, 80).join('\n'));
    console.log(sim.debugStats, Object.fromEntries(rec.counts));
    expect(errs).toEqual([]);
    expect(ended).toBe(true);
    expect(sim.debugStats.forcedHome).toBe(0);
  });
});
