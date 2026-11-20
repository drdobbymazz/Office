import { describe, expect, it } from 'vitest';
import { makeSim, runUntil } from './helpers';

describe('save', () => {
  it('round-trips bonds, memories, takeaways, meters and secrets', () => {
    const { sim } = makeSim({ seed: 41, dayMinutes: 1 });
    runUntil(sim, () => sim.debugPeople().every((p) => p.present), 200);
    sim.shiftBond('jim', 'dwight', 50, 'helped with the fire');
    sim.remember(['jim'], 'Dwight saved the break room.', 2);
    sim.remember('all', 'There was a fire.', 1);
    sim.setTakeaways([{ who: 'pam', text: 'Jim was kind today.' }]);
    sim.revealSecret('kevin');
    sim.incident();
    let ended = false;
    sim.bus.on('dayEnd', () => { ended = true; });
    runUntil(sim, () => ended, 200);
    const save = sim.serialize();
    expect(save.dayDone).toBe(true);
    const json = JSON.parse(JSON.stringify(save));
    const { sim: b } = makeSim({ seed: 99, dayMinutes: 1, save: json });
    expect(b.day).toBe(2);
    expect(b.phase).toBe('arriving');
    expect(b.bond('jim', 'dwight')).toBe(sim.bond('jim', 'dwight'));
    expect(b.bondLabel('jim', 'dwight')).toBe('likes');
    expect(b.personDetail('jim')!.memories.map((m) => m.text)).toEqual(sim.personDetail('jim')!.memories.map((m) => m.text));
    expect(b.memoriesFor('pam')).toContain('Jim was kind today.');
    expect(b.personDetail('kevin')!.secret).toBeTruthy();
    expect(b.personDetail('jim')!.secret).toBeNull();
    expect(b.meters().stock).toBe(sim.meters().stock);
    expect(b.incidentFreeDays).toBe(0);
    expect(b.serialize().bonds).toEqual(save.bonds);
  });

  it('a save taken mid-day restarts that day from the morning', () => {
    const { sim } = makeSim({ seed: 42, dayMinutes: 2 });
    runUntil(sim, () => sim.clock > 11 * 60, 300);
    const { sim: b } = makeSim({ save: sim.serialize() });
    expect(b.day).toBe(1);
    expect(b.clock).toBeLessThan(9 * 60);
    expect(b.debugPeople().every((p) => !p.present)).toBe(true);
  });

  it('survives a corrupt save', () => {
    const { sim } = makeSim({ save: { nonsense: true } as never });
    expect(sim.day).toBe(1);
    const { sim: s2 } = makeSim({ save: { day: 'x', bonds: { 'jim>pam': { score: 'lots' } } } as never });
    expect(s2.bond('jim', 'pam')).toBe(0);
  });
});
