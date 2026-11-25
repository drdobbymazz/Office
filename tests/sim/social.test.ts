import { describe, expect, it } from 'vitest';
import { KnowledgeBook } from '@/game/sim/knowledge';
import { newNeeds, relieve, relieveForJob, tickNeeds, topNeed } from '@/game/sim/needs';
import { Person } from '@/game/sim/people';
import { makeJob } from '@/game/sim/jobs';
import { makeSim, runUntil } from './helpers';

describe('needs', () => {
  it('drifts upward, names the most urgent one, and comes down when a job is done', () => {
    const p = new Person('pam');
    const before = p.needs.hunger;
    tickNeeds(p, 20);
    expect(p.needs.hunger).toBeGreaterThan(before);
    p.needs.hunger = 0.95;
    expect(topNeed(p, 0.8)).toBe('hunger');
    const snack = makeJob('routine', { kind: 'anchor', id: 'stand.vending' }, {
      act: { anim: 'operate', seated: false, face: null, doing: 'getting a snack', seconds: 3 }
    });
    relieveForJob(p, snack);
    expect(p.needs.hunger).toBeLessThan(0.7);
    relieve(p, 'hunger', 0.5);
    expect(p.needs.hunger).toBeLessThan(0.2);
  });

  it('starts each day with a clean, moderate baseline', () => {
    const n = newNeeds();
    for (const v of Object.values(n)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0.35);
    }
  });
});

describe('knowledge and gossip', () => {
  it('records who saw a rumor and passes it on with lower confidence', () => {
    const book = new KnowledgeBook();
    const rumor = book.add('Jim and Pam were caught in the annex.', 3, 1, 600);
    book.tell('jim', rumor, 1);
    expect(book.knows('jim', rumor.id)).toBe(true);
    expect(book.knows('pam', rumor.id)).toBe(false);
    expect(book.share('jim', 'pam', rumor.id)).toBe(true);
    expect(book.knows('pam', rumor.id)).toBe(true);
    expect(book.top('pam', 1)[0].confidence).toBeLessThan(1);
    expect(book.share('jim', 'pam', rumor.id)).toBe(false);
  });

  it('keeps a perception memory only for the people listed', () => {
    const { sim } = makeSim({ seed: 3, sandbox: true });
    sim.rememberRumor(['jim', 'pam'], 'Michael was seen crying in the stairwell.', 3);
    expect(sim.briefFor('jim', []).rumors?.some((r) => r.includes('stairwell'))).toBe(true);
    expect(sim.briefFor('pam', []).rumors?.some((r) => r.includes('stairwell'))).toBe(true);
    expect(sim.briefFor('dwight', []).rumors?.some((r) => r.includes('stairwell'))).not.toBe(true);
  });

  it('survives a save/load round trip', () => {
    const { sim } = makeSim({ seed: 4, sandbox: true });
    sim.rememberRumor(['jim'], 'The branch might close on Friday.', 3);
    sim.addNotoriety('jim', 0.5);
    const save = sim.serialize();
    const { sim: reloaded } = makeSim({ seed: 5, sandbox: true, save });
    expect(reloaded.briefFor('jim', []).rumors?.some((r) => r.includes('Friday'))).toBe(true);
    expect(reloaded.debugPeople().find((p) => p.id === 'jim')!.notoriety).toBeGreaterThan(0.3);
  });
});

describe('free-play social simulation', () => {
  it('grows needs during a sandbox day', () => {
    const { sim } = makeSim({ seed: 6, sandbox: true });
    runUntil(sim, () => sim.people().every((p) => p.present), 120);
    const before = sim.people().find((p) => p.id === 'jim')!.needs.social;
    runUntil(sim, () => sim.people().find((p) => p.id === 'jim')!.needs.social > before + 0.01, 40);
    expect(sim.people().find((p) => p.id === 'jim')!.needs.social).toBeGreaterThan(before);
  });

  it('drives a small idle errand when a need is urgent', () => {
    const { sim } = makeSim({ seed: 8, sandbox: true });
    runUntil(sim, () => sim.people().every((p) => p.present), 120);
    const jim = sim.people().find((p) => p.id === 'jim')!;
    // Give hunger a strong nudge and let the free-play planner react.
    jim.needs.hunger = 0.95;
    runUntil(sim, () => sim.people().find((p) => p.id === 'jim')!.job === 'plan' || jim.needs.hunger < 0.9, 40);
    const after = sim.people().find((p) => p.id === 'jim')!;
    expect(after.job === 'plan' || after.needs.hunger < 0.95).toBe(true);
  });
});
