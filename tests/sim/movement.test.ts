import { describe, expect, it } from 'vitest';
import { ANCHORS, isWalkable, tileAt, feetOf } from '@/game/core/world';
import { Nav } from '@/game/sim/nav';
import { Person } from '@/game/sim/people';
import { planWalk, stepWalk } from '@/game/sim/movement';
import { makeSim, runUntil, invariantErrors } from './helpers';

describe('walking', () => {
  it('walks between every pair of anchors, never stepping off the floor', () => {
    const nav = new Nav();
    const p = new Person('jim');
    let walks = 0;
    for (const a of ANCHORS) {
      for (const b of ANCHORS) {
        if (a === b) continue;
        const f = feetOf(a.tile);
        p.x = f.x;
        p.y = f.y;
        p.walk = null;
        const w = planWalk(nav, p, b.tile, 'walk');
        expect(w, `${a.id} -> ${b.id}`).not.toBeNull();
        let arrived = false;
        for (let i = 0; i < 4000 && !arrived; i++) {
          arrived = stepWalk(p, w!, 1 / 20, 1);
          const t = tileAt(p.x, p.y);
          if (!isWalkable(t.x, t.y)) throw new Error(`${a.id} -> ${b.id}: stepped onto ${t.x},${t.y}`);
        }
        expect(arrived, `${a.id} -> ${b.id}`).toBe(true);
        const g = feetOf(b.tile);
        expect(p.x).toBe(g.x);
        expect(p.y).toBe(g.y);
        walks++;
      }
    }
    expect(walks).toBeGreaterThan(5000);
  });

  it('moves at about 48 px/s on a straight run', () => {
    const nav = new Nav();
    const p = new Person('jim');
    const f = feetOf({ x: 1, y: 14 });
    p.x = f.x;
    p.y = f.y;
    const w = planWalk(nav, p, { x: 21, y: 14 }, 'walk')!;
    let t = 0;
    while (!stepWalk(p, w, 1 / 60, 1)) t += 1 / 60;
    // 320 px: ~6.7 s at 48 px/s plus easing in and out.
    expect(t).toBeGreaterThan(6.5);
    expect(t).toBeLessThan(7.6);
  });

  it('goTo reaches a sample of anchors through the full sim', () => {
    const { sim } = makeSim({ seed: 3, dayMinutes: 30 });
    runUntil(sim, () => sim.phase === 'working' && sim.debugPeople().every((d) => d.present && d.job !== 'arrive'), 200);
    const ids = ANCHORS.filter((a) => a.kind !== 'exit').map((a) => a.id);
    const who = 'dwight';
    for (let i = 0; i < ids.length; i += 3) {
      let arrived = false;
      sim.goTo(who, { anchor: ids[i] }, { then: () => { arrived = true; }, stay: 1 });
      runUntil(sim, () => arrived, 60, 1 / 20, () => {
        const e = invariantErrors(sim);
        if (e.length) throw new Error(e.join('\n'));
      });
      expect(arrived, ids[i]).toBe(true);
    }
  });

  it('re-plans around blocked tiles and waits when walled in', () => {
    const { sim } = makeSim({ seed: 4, dayMinutes: 30 });
    runUntil(sim, () => sim.phase === 'working' && sim.debugPeople().every((d) => d.present && d.job !== 'arrive'), 200);
    // Wall off the corridor into the annex while Kevin walks there.
    let arrived = false;
    sim.goTo('jim', { anchor: 'spot.annex1' }, { then: () => { arrived = true; }, stay: 5 });
    sim.update(1);
    sim.setBlocked('test', [{ x: 19, y: 11 }, { x: 20, y: 11 }, { x: 21, y: 11 }, { x: 22, y: 11 }, { x: 18, y: 11 }, { x: 23, y: 11 }]);
    runUntil(sim, () => arrived, 20);
    const jim = sim.debugPeople().find((p) => p.id === 'jim')!;
    expect(jim.stuckFor).toBeLessThanOrEqual(15.1);
    sim.setBlocked('test', null);
    runUntil(sim, () => false, 30, 1 / 20, () => {
      const e = invariantErrors(sim);
      if (e.length) throw new Error(e.join('\n'));
    });
    expect(sim.debugPeople().every((p) => p.stuckFor < 16)).toBe(true);
  });
});
