import { describe, expect, it } from 'vitest';
import { invariantErrors, makeSim, runUntil } from './helpers';

function ready(sim: ReturnType<typeof makeSim>['sim']): void {
  runUntil(sim, () => sim.debugPeople().every((p) => p.present && p.job !== 'arrive'), 200);
}

describe('scenes and the director surface', () => {
  it('a social plan walks over and files a scene ask', () => {
    const { sim } = makeSim({ seed: 51, dayMinutes: 60 });
    ready(sim);
    sim.setPlan('dwight', { kind: 'confront', target: 'jim', about: 'the missing stapler' });
    expect(sim.person('dwight')!.doing).toBe('going to confront Jim about the missing stapler');
    let asks: ReturnType<typeof sim.takeSceneAsks> = [];
    runUntil(sim, () => {
      asks = sim.takeSceneAsks().filter((a) => a.trigger === 'plan');
      return asks.length > 0;
    }, 40);
    expect(asks[0].why).toBe('Dwight walked over to confront Jim about the missing stapler.');
    expect(asks[0].priority).toBe(5);
    expect(asks[0].people).toEqual(['dwight', 'jim']);
    const d = sim.person('dwight')!;
    const j = sim.person('jim')!;
    expect(Math.max(Math.abs(d.tile.x - j.tile.x), Math.abs(d.tile.y - j.tile.y))).toBeLessThanOrEqual(1);
    // The director opens it; once closed the plan is done.
    const h = sim.openScene({ id: 'c1', people: ['dwight', 'jim'], gather: true })!;
    expect(h).not.toBeNull();
    runUntil(sim, () => h.ready, 15);
    const sp = h.line({ who: 'dwight', say: 'Jim! Where is my stapler?', feel: 'angry', to: 'jim', act: 'point' });
    expect(sp.durationMs).toBeGreaterThan(1400);
    expect(sim.person('dwight')!.speaking).toBe(true);
    expect(sim.person('dwight')!.emotion).toBe('angry');
    expect(sim.frame().speeches.length).toBe(1);
    sim.update(0.1);
    expect(sim.person('jim')!.facing).toBe(sim.person('dwight')!.x < sim.person('jim')!.x ? 'left' : sim.person('dwight')!.x > sim.person('jim')!.x ? 'right' : sim.person('jim')!.facing);
    h.line({ who: 'jim', say: 'In the jello. Obviously.', feel: 'amused', to: 'dwight', act: 'shrug' });
    h.close();
    h.close();
    expect(h.alive).toBe(false);
    expect(sim.person('dwight')!.plan).toBeNull();
    expect(sim.recentLines(sim.person('jim')!.room, 5).map((l) => l.say)).toContain('In the jello. Obviously.');
    expect(sim.dayLog().some((l) => l.includes('jello'))).toBe(true);
  });

  it('gathers people from across the office, storm_off works, scenes end if nobody talks', () => {
    const { sim } = makeSim({ seed: 52, dayMinutes: 60 });
    ready(sim);
    const h = sim.openScene({ id: 'g1', people: ['angela', 'kevin', 'meredith'], gather: true })!;
    expect(h).not.toBeNull();
    expect(sim.openScene({ id: 'g2', people: ['angela', 'pam'], gather: true })).toBeNull();
    runUntil(sim, () => h.ready, 30, 1 / 20, () => {
      const e = invariantErrors(sim);
      if (e.length) throw new Error(e.join('\n'));
    });
    expect(h.ready).toBe(true);
    const ps = ['angela', 'kevin', 'meredith'].map((id) => sim.person(id)!);
    for (const a of ps) for (const b of ps) expect(Math.abs(a.tile.x - b.tile.x) + Math.abs(a.tile.y - b.tile.y)).toBeLessThanOrEqual(4);
    h.line({ who: 'meredith', say: 'I am out of here.', feel: 'angry', to: 'all', act: 'storm_off' });
    expect(sim.person('meredith')!.sceneId).toBeNull();
    expect(h.alive).toBe(true);
    runUntil(sim, () => !h.alive, 60);
    expect(h.alive).toBe(false);
    expect(sim.person('angela')!.sceneId).toBeNull();
  });

  it('briefs, facts and memories read in plain words', () => {
    const { sim } = makeSim({ seed: 53, dayMinutes: 60 });
    ready(sim);
    sim.addStatus('kevin', 'tiny', 60);
    sim.addStatus('kevin', 'love', 60, 'pam');
    sim.addStatus('kevin', 'swapped', 60, 'dwight');
    sim.remember(['kevin'], 'Pam gave me her muffin.', 2);
    sim.setFact('x', 'The break room is on fire.');
    const b = sim.briefFor('kevin', ['pam', 'oscar']);
    expect(b.state).toContain('shrunk to the size of a stapler');
    expect(b.state).toContain('hopelessly in love with Pam');
    expect(b.state).toContain('has swapped minds with Dwight');
    expect(b.mindOf).toBe('dwight');
    expect(b.feelings.find((f) => f.about === 'pam')!.text).toBe('is hopelessly in love with Pam');
    expect(b.feelings.find((f) => f.about === 'oscar')!.text).toMatch(/^likes Oscar/);
    expect(b.memories[0]).toBe('Pam gave me her muffin.');
    expect(b.secret).toBeUndefined();
    sim.addStatus('kevin', 'truth', 30);
    expect(sim.briefFor('kevin', []).secret).toBeTruthy();
    const facts = sim.facts();
    expect(facts).toContain('The break room is on fire.');
    expect(facts.some((f) => f.startsWith('It is Monday'))).toBe(true);
    expect(sim.bondLabel('michael', 'toby')).toBe("can't stand");
    sim.shiftBond('michael', 'toby', 100, 'Toby saved him from the fire');
    expect(sim.bondLabel('michael', 'toby')).toBe('likes');
  });

  it('files ambient asks when two idle people are near each other, and not too often', () => {
    const { sim } = makeSim({ seed: 54, dayMinutes: 60 });
    ready(sim);
    let ambient = 0;
    runUntil(sim, () => false, 240, 1 / 20, () => {
      ambient += sim.takeSceneAsks().filter((a) => a.trigger === 'ambient').length;
    });
    expect(ambient).toBeGreaterThan(0);
    expect(ambient).toBeLessThan(240 / 12 + 1);
  });

  it('builds UI data', () => {
    const { sim } = makeSim({ seed: 55, dayMinutes: 60 });
    ready(sim);
    const ui = sim.peopleUi();
    expect(ui.length).toBe(15);
    expect(ui.every((p) => p.avatar === '' && p.color.startsWith('#') && p.doing.length > 0)).toBe(true);
    const d = sim.personDetail('creed')!;
    expect(d.age).toBe(72);
    expect(d.bonds.length).toBe(14);
    expect(sim.weekday).toBe('Monday');
    const m = sim.meters();
    expect(m.stockHistory.length).toBeGreaterThan(0);
    const f = sim.frame();
    expect(f.effects.some((e) => e.kind === 'daylight')).toBe(true);
    expect(f.people.length).toBe(15);
    expect(sim.frame().people[0]).toBe(f.people[0]); // objects reused
  });
});
