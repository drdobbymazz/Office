import { describe, expect, it } from 'vitest';
import { ROOMS, isWalkable, roomRectPx, tileAt, walkableTilesIn } from '@/game/core/world';
import { createRng } from '@/game/sim/rng';
import { invariantErrors, makeSim, runUntil } from './helpers';

function settled(sim: ReturnType<typeof makeSim>['sim'], id: string): boolean {
  const d = sim.debugPeople().find((p) => p.id === id)!;
  return !d.airborne && d.resting;
}

describe('the player hand', () => {
  it('picks up and throws from every room, always landing on a free walkable tile', () => {
    const { sim, rec } = makeSim({ seed: 11, dayMinutes: 60, keep: false });
    runUntil(sim, () => sim.debugPeople().filter((p) => p.isCast !== false).every((p) => p.present), 200);
    const r = createRng(5);
    const who = 'kevin';
    let throws = 0;
    for (const room of ROOMS) {
      const tiles = walkableTilesIn(room.id);
      const rect = roomRectPx(room.id);
      for (let i = 0; i < 12; i++) {
        const start = r.pick(tiles);
        sim.teleport(who, start);
        runUntil(sim, () => settled(sim, who), 10);
        expect(sim.pickUp(who)).toBe(true);
        expect(sim.holding).toBe(who);
        // Drag over anything at all in the room: walls and furniture included.
        const tx = rect.x + r.range(-8, rect.w + 8);
        const ty = rect.y + r.range(-8, rect.h + 8);
        for (let k = 0; k < 12; k++) {
          sim.dragTo(tx, ty);
          sim.update(1 / 30);
        }
        const fast = i % 3 !== 0;
        const ang = r.range(0, Math.PI * 2);
        const speed = fast ? r.range(200, 900) : r.range(0, 60);
        sim.drop(Math.cos(ang) * speed, Math.sin(ang) * speed);
        expect(sim.holding).toBe(null);
        runUntil(sim, () => settled(sim, who), 20, 1 / 30, () => {
          const e = invariantErrors(sim);
          if (e.length) throw new Error(e.join('\n'));
          const d = sim.debugPeople().find((p) => p.id === who)!;
          if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) throw new Error('NaN');
        });
        const d = sim.debugPeople().find((p) => p.id === who)!;
        expect(settled(sim, who), `${room.id} throw ${i}`).toBe(true);
        const t = tileAt(d.x, d.y);
        expect(isWalkable(t.x, t.y)).toBe(true);
        expect(d.res).toEqual(t);
        throws++;
      }
    }
    expect(throws).toBe(ROOMS.length * 12);
    expect(rec.counts.get('pickedUp')).toBe(throws);
    expect(rec.counts.get('dropped')).toBe(throws);
  });

  it('a hard throw leaves them dizzy and in a worse mood', () => {
    const { sim } = makeSim({ seed: 12, dayMinutes: 60 });
    runUntil(sim, () => sim.debugPeople().every((p) => p.present), 200);
    sim.teleport('dwight', { x: 4, y: 15 });
    runUntil(sim, () => settled(sim, 'dwight'), 10);
    const before = sim.person('dwight')!.mood;
    sim.pickUp('dwight');
    sim.dragTo(60, 230);
    sim.update(0.2);
    sim.drop(700, 0);
    let hard = false;
    sim.bus.on('dropped', (e) => { hard = e.hard; });
    runUntil(sim, () => settled(sim, 'dwight'), 20);
    expect(hard).toBe(true);
    expect(sim.hasStatus('dwight', 'dizzy')).toBe(true);
    expect(sim.person('dwight')!.mood).toBeLessThan(before);
  });

  it('being picked up breaks a scene', () => {
    const { sim } = makeSim({ seed: 13, dayMinutes: 60 });
    runUntil(sim, () => sim.debugPeople().every((p) => p.present && p.job !== 'arrive'), 200);
    const h = sim.openScene({ id: 's1', people: ['jim', 'pam'], gather: true });
    expect(h).not.toBeNull();
    runUntil(sim, () => h!.ready, 30);
    expect(h!.ready).toBe(true);
    h!.line({ who: 'jim', say: 'Hey.', feel: 'happy', to: 'pam', act: 'none' });
    sim.pickUp('pam');
    sim.update(0.05);
    expect(h!.alive).toBe(false);
    expect(sim.person('jim')!.sceneId).toBe(null);
    h!.close();
    h!.close();
    sim.drop(0, 0);
    runUntil(sim, () => settled(sim, 'pam'), 10);
  });

  it('someone held past five still goes home once dropped, and the day ends', () => {
    const { sim } = makeSim({ seed: 14, dayMinutes: 0.5 });
    let ended = false;
    sim.bus.on('dayEnd', () => { ended = true; });
    runUntil(sim, () => sim.phase === 'leaving', 200);
    sim.pickUp('oscar');
    runUntil(sim, () => false, 3, 1 / 20, () => sim.dragTo(200, 200));
    sim.drop(0, 0);
    runUntil(sim, () => ended, 40);
    expect(ended).toBe(true);
    expect(sim.debugPeople().every((p) => !p.present)).toBe(true);
  });

  it('poking someone startles them', () => {
    const { sim, rec } = makeSim({ seed: 15, dayMinutes: 60, keep: true });
    runUntil(sim, () => sim.debugPeople().every((p) => p.present), 200);
    const n = rec.counts.get('speech') ?? 0;
    sim.poke('angela');
    expect((rec.counts.get('speech') ?? 0)).toBe(n + 1);
    sim.update(0.1);
    expect(sim.frame().people.find((p) => p.id === 'angela')!.anim).toBe('startle');
  });
});
