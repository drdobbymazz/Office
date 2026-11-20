import { describe, expect, it } from 'vitest';
import { CAST, CAST_LIST } from '@/game/core/cast';
import { TARGET_ROOMS } from '@/game/core/types';
import { invariantErrors, makeSim, runUntil } from './helpers';

function ready(sim: ReturnType<typeof makeSim>['sim']): void {
  runUntil(sim, () => sim.debugPeople().every((p) => p.present && p.job !== 'arrive'), 200);
}

describe('fire', () => {
  for (const room of TARGET_ROOMS) {
    it(`always ends, with a fixer (${room})`, () => {
      const { sim, rec } = makeSim({ seed: 21, dayMinutes: 60, keep: true });
      ready(sim);
      expect(sim.startChaos('fire', { room })).toBeNull();
      expect(sim.activeChaos().length).toBe(1);
      expect(sim.isHazard(room)).toBe(true);
      let ended = false;
      sim.bus.on('chaosEnd', () => { ended = true; });
      const t = runUntil(sim, () => ended, 90, 1 / 20, () => {
        const e = invariantErrors(sim);
        if (e.length) throw new Error(e.join('\n'));
      });
      expect(ended).toBe(true);
      expect(t).toBeLessThan(60);
      expect(sim.isHazard(room)).toBe(false);
      expect(sim.blockedKeys()).toEqual([]);
      expect(sim.effect('daylight')).toBeTruthy();
      const left = sim.frame().effects.map((e) => e.kind);
      expect(left).not.toContain('fire');
      expect(left).not.toContain('alarm');
      expect(left).toContain('item'); // the scorch mark stays
      const feed = rec.events.filter((e) => e.type === 'feed').map((e) => (e.payload as { text: string }).text);
      expect(feed.some((f) => / put out the fire| sprinklers put out/.test(f))).toBe(true);
      expect(sim.takeSceneAsks().some((a) => a.trigger === 'aftermath')).toBe(true);
    });
  }

  it('ends via the sprinklers when no fixer is available', () => {
    const { sim, rec } = makeSim({ seed: 22, dayMinutes: 60, keep: true });
    ready(sim);
    // Hold every fire fixer out of action.
    const fixers = CAST_LIST.filter((c) => c.fixes.includes('fire')).map((c) => c.id);
    for (const id of fixers) sim.seize(id, 'test', { anim: 'sleep', doing: 'out cold' });
    expect(sim.startChaos('fire', { room: 'kitchen' })).toBeNull();
    let ended = false;
    sim.bus.on('chaosEnd', () => { ended = true; });
    runUntil(sim, () => ended, 90);
    expect(ended).toBe(true);
    const feed = rec.events.filter((e) => e.type === 'feed').map((e) => (e.payload as { text: string }).text);
    expect(feed.some((f) => f.includes('sprinklers put out'))).toBe(true);
    for (const id of fixers) sim.release(id, 'test');
    expect(CAST.dwight.fixes).toContain('fire');
  });

  it('copes with the fixer being picked up mid-way', () => {
    const { sim } = makeSim({ seed: 23, dayMinutes: 60 });
    ready(sim);
    expect(sim.startChaos('fire', { room: 'bullpen' })).toBeNull();
    let ended = false;
    sim.bus.on('chaosEnd', () => { ended = true; });
    runUntil(sim, () => sim.person('dwight')!.doing.includes('fire'), 10);
    sim.pickUp('dwight');
    sim.dragTo(300, 380);
    sim.update(0.5);
    sim.drop(0, 0);
    runUntil(sim, () => ended, 90, 1 / 20, () => {
      const e = invariantErrors(sim);
      if (e.length) throw new Error(e.join('\n'));
    });
    expect(ended).toBe(true);
  });

  it('respects cooldowns outside sandbox mode and validates targets', () => {
    const { sim } = makeSim({ seed: 24, dayMinutes: 60, sandbox: false });
    ready(sim);
    expect(sim.startChaos('fire', {})).toMatch(/room/i);
    expect(sim.startChaos('smite', {})).toMatch(/Pick/);
    expect(sim.startChaos('flood', { room: 'kitchen' })).toMatch(/not ready/);
    expect(sim.startChaos('smite', { who: 'jim' })).toBeNull();
    expect(sim.startChaos('smite', { who: 'pam' })).toMatch(/cooling down/);
    expect(sim.cooldowns().smite).toBeTruthy();
    expect(sim.cooldownLeft('smite')).toBeGreaterThan(10);
  });
});

describe('smite and pizza', () => {
  it('smite frazzles the target and startles witnesses', () => {
    const { sim } = makeSim({ seed: 31, dayMinutes: 60 });
    ready(sim);
    expect(sim.startChaos('smite', { who: 'andy' })).toBeNull();
    runUntil(sim, () => sim.activeChaos().length === 0, 10);
    expect(sim.hasStatus('andy', 'frizzy')).toBe(true);
    expect(sim.hasStatus('andy', 'sooty')).toBe(true);
    expect(sim.hasStatus('andy', 'dizzy')).toBe(true);
    expect(sim.facts().some((f) => f.includes('Andy') && f.includes('lightning'))).toBe(true);
  });

  it('pizza brings the courier in and out, and people eat', () => {
    const { sim } = makeSim({ seed: 32, dayMinutes: 60 });
    ready(sim);
    const moodBefore = sim.meters().morale;
    expect(sim.startChaos('pizza', {})).toBeNull();
    expect(sim.person('visitor:courier')?.present).toBe(true);
    let sawEating = 0;
    let ended = false;
    sim.bus.on('chaosEnd', () => { ended = true; });
    runUntil(sim, () => ended, 120, 1 / 20, () => {
      const e = invariantErrors(sim);
      if (e.length) throw new Error(e.join('\n'));
      sawEating = Math.max(sawEating, sim.people().filter((p) => p.doing === 'eating free pizza').length);
    });
    expect(ended).toBe(true);
    expect(sawEating).toBeGreaterThan(5);
    expect(sim.person('visitor:courier')).toBeUndefined();
    runUntil(sim, () => false, 10);
    expect(sim.meters().morale).toBeGreaterThan(moodBefore);
  });
});
