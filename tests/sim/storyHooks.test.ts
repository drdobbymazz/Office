// The simulation and director features the story needs, which are general
// improvements for the sandbox too: people put down stay a while, hidden
// notes, visitors' cards, locked powers, and the "a conversation finished" event.
import { describe, expect, it } from 'vitest';
import { registerVisitor } from '@/game/core/cast';
import { anchor, feetOf } from '@/game/core/world';
import { PromptBook } from '@/game/brain/prompts';
import { NameMap } from '@/game/brain/names';
import { WorldIndex } from '@/game/brain/world';
import { InstinctBrain } from '@/game/brain/instinct';
import { Director } from '@/game/director/director';
import { BANK } from '@/game/core/content';
import type { LooseBank } from '@/game/brain/instinct';
import type { GameEvents } from '@/game/core/bus';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { createRng } from '@/game/sim/rng';
import { makeSim, runUntil } from './helpers';
import { WORLD as FIXTURE_WORLD, person, sceneReq } from '../brain/fixtures';
import { WORLD } from '../story/harness';

function dropAt(sim: ReturnType<typeof makeSim>['sim'], who: string, anchorId: string): void {
  const f = feetOf(anchor(anchorId).tile);
  expect(sim.pickUp(who)).toBe(true);
  sim.dragTo(f.x, f.y - 8);
  for (let i = 0; i < 12; i++) sim.update(0.05);
  sim.drop(0, 0);
  runUntil(sim, () => !sim.isAirborne(who), 5);
}

describe('people put down stay a while', () => {
  it('they get their bearings for about 40 seconds where they were dropped, then go back to work', () => {
    const { sim } = makeSim({ dayMinutes: 10 });
    runUntil(sim, () => sim.clock >= 9 * 60 + 10, 200);
    dropAt(sim, 'stanley', 'spot.kitchen2');
    const p = sim.person('stanley')!;
    expect(p.room).toBe('kitchen');
    sim.update(0.2);
    expect(p.doing).toBe('getting his bearings');
    runUntil(sim, () => false, 30);
    expect(p.room).toBe('kitchen');
    expect(p.doing).toBe('getting his bearings');
    runUntil(sim, () => p.doing !== 'getting his bearings', 20);
    expect(p.doing).not.toBe('getting his bearings');
  });

  it('a plan still comes first', () => {
    const { sim } = makeSim({ dayMinutes: 10 });
    runUntil(sim, () => sim.clock >= 9 * 60 + 10, 200);
    dropAt(sim, 'kevin', 'spot.meet8');
    sim.setPlan('kevin', { kind: 'snack', target: null, about: 'hunger' });
    sim.update(0.1);
    expect(sim.person('kevin')!.doing).toMatch(/something to eat/);
  });
});

describe('hidden notes', () => {
  it('reach the brief and the prompt, and are forgotten by the morning', () => {
    const { sim } = makeSim();
    sim.setHiddenNote('toby', 'Toby has been emailing Corporate.');
    expect(sim.briefFor('toby', []).hidden).toBe('Toby has been emailing Corporate.');
    expect(sim.briefFor('jim', []).hidden).toBeUndefined();
    sim.setHiddenNote('toby', null);
    expect(sim.briefFor('toby', []).hidden).toBeUndefined();
    sim.setHiddenNote('toby', 'again');
    sim.beginDay(2);
    expect(sim.briefFor('toby', []).hidden).toBeUndefined();

    const book = new PromptBook(new WorldIndex(FIXTURE_WORLD));
    const req = sceneReq({ people: [person('fern', { hidden: 'Fern has been stealing the biscuits.' }), person('basil')] });
    const u = book.sceneUser(req, new NameMap(req.people.map((p) => ({ id: p.id, name: p.name }))));
    expect(u).toContain('Hidden from everyone, shows only as nerves unless they cannot lie: Fern has been stealing the biscuits.');
  });

  it('the no-model brain sometimes has them think a nervous hint instead', async () => {
    const brain = new InstinctBrain(BANK as LooseBank, WORLD, createRng(3));
    let nervous = 0;
    for (let i = 0; i < 40; i++) {
      const [m] = await brain.minds({
        id: `m${i}`, day: 1, clock: '10:00', facts: [], allowed: ['work'], others: [], chaos: 0,
        people: [{ id: 'toby', name: 'Toby', mood: 'neutral', state: [], goal: '', feelings: [], memories: [], hidden: 'He leaks.', place: 'the annex', doing: 'typing' }]
      });
      if (m.feel === 'nervous') nervous++;
      expect(m.thought).not.toMatch(/leak/i);
    }
    expect(nervous).toBeGreaterThan(5);
  });
});

describe('visitors and locks', () => {
  it("a visitor's card can say what they want, fear and like", () => {
    const { sim } = makeSim();
    registerVisitor({
      id: 'visitor:test-card', name: 'Ms Test', role: 'Buyer', color: 0x334455, voice: { pitch: 200, wave: 'sine', spread: 1, speed: 1 },
      summary: 'Ms Test, a buyer.', wants: 'a bargain', fears: 'paperwork', quirk: 'hums'
    });
    runUntil(sim, () => sim.clock >= 9 * 60 + 5, 200);
    sim.spawnVisitor('visitor:test-card', { anchor: 'door.entrance' });
    const d = sim.personDetail('visitor:test-card')!;
    expect([d.wants, d.fears, d.quirk]).toEqual(['a bargain', 'paperwork', 'hums']);
    expect(sim.briefFor('visitor:test-card', []).about).toBe('Ms Test, a buyer. Wants a bargain. Cannot stand paperwork. Hums.');
  });

  it('a locked power is refused with its reason, even when something else sets it off', () => {
    const { sim } = makeSim({ sandbox: false });
    for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
    runUntil(sim, () => sim.clock >= 9 * 60 + 5, 200);
    sim.setLocks({ meeting: 'Cancelled today.' });
    expect(sim.startChaos('meeting')).toBe('Cancelled today.');
    expect(sim.startChaos('meeting', {}, { force: true })).toBe('Cancelled today.');
    sim.setLocks({});
    expect(sim.startChaos('meeting')).toBeNull();
  });
});

describe('a conversation finished', () => {
  it('the director says who talked, why, and (for a plan) what kind', async () => {
    const { sim, bus } = makeSim({ dayMinutes: 10 });
    const brain = new InstinctBrain(BANK as LooseBank, WORLD, createRng(5));
    const director = new Director({ sim, brain, instinct: brain });
    const done: GameEvents['sceneDone'][] = [];
    bus.on('sceneDone', (e) => done.push(e));
    runUntil(sim, () => sim.clock >= 9 * 60 + 10, 200);
    director.reset();
    sim.setPlan('jim', { kind: 'comfort', target: 'pam', about: 'a long morning' });
    for (let t = 0; t < 60 && !done.some((e) => e.trigger === 'plan'); t += 0.1) {
      sim.update(0.1);
      director.update(0.1);
      await new Promise((r) => setImmediate(r));
    }
    const e = done.find((x) => x.trigger === 'plan');
    expect(e).toBeTruthy();
    expect(e!.people).toEqual(['jim', 'pam']);
    expect(e!.planKind).toBe('comfort');
  });
});
