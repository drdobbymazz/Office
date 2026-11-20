// Every Overseer power: it starts, it ends inside its slot, and it leaves
// nothing behind (effects, seizes, blocked tiles, hazards, loops, facts,
// headgear, visitors). Also with a person being thrown mid-event, twice in a
// row, and all 34 back to back in one day.
import { describe, expect, it } from 'vitest';
import { CHAOS } from '@/game/core/chaos';
import { CHAOS_IDS, TARGET_ROOMS, type ChaosId, type ChaosTarget, type TargetRoomId } from '@/game/core/types';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import type { Sim } from '@/game/sim';
import { invariantErrors, makeSim, runUntil } from './helpers';

const MARGIN = 20;

interface Trace {
  effects: Set<string>;
  facts: Map<string, string | null>;
  loops: Map<string, boolean>;
}

function setup(seed: number, dayMinutes = 60): { sim: Sim; trace: Trace } {
  const { sim, bus } = makeSim({ seed, dayMinutes });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  const trace: Trace = { effects: new Set(), facts: new Map(), loops: new Map() };
  const addEffect = sim.addEffect.bind(sim);
  sim.addEffect = (e) => {
    trace.effects.add(e.id);
    addEffect(e);
  };
  const setFact = sim.setFact.bind(sim);
  sim.setFact = (k, t) => {
    trace.facts.set(k, t);
    setFact(k, t);
  };
  bus.on('loop', ({ id, on }) => trace.loops.set(id, on));
  runUntil(sim, () => sim.debugPeople().every((p) => p.present && p.job !== 'arrive'), 200);
  return { sim, trace };
}

function castOnFloor(sim: Sim): string[] {
  return sim.people().filter((p) => p.isCast && p.present && p.available && p.room !== 'outside').map((p) => p.id);
}

/** A sensible target: a room with people in it, or people who are free. */
function targetFor(sim: Sim, id: ChaosId): ChaosTarget {
  const def = CHAOS[id];
  const free = castOnFloor(sim);
  const r = () => Math.floor(sim.rng() * free.length);
  switch (def.target) {
    case 'room': {
      if (def.fixedRoom) return { room: def.fixedRoom };
      const busy = [...TARGET_ROOMS].sort((a, b) => sim.peopleIn(b).length - sim.peopleIn(a).length);
      return { room: busy[0] as TargetRoomId };
    }
    case 'person':
      return { who: free[r()] };
    case 'pair': {
      const a = free[r()];
      const b = free.filter((x) => x !== a)[r() % (free.length - 1)];
      return { who: a, other: b };
    }
    default:
      return {};
  }
}

function clean(sim: Sim, trace: Trace, id: ChaosId): void {
  const left = sim.frame().effects.map((e) => e.id);
  // The fire's scorch mark is meant to stay for the day.
  const stray = [...trace.effects].filter((e) => left.includes(e) && !e.endsWith(':scorch') && e !== 'daylight');
  expect(stray, `${id}: effects left`).toEqual([]);
  expect(sim.debugPeople().filter((p) => p.seized).map((p) => p.id), `${id}: still seized`).toEqual([]);
  expect(sim.blockedKeys(), `${id}: tiles still blocked`).toEqual([]);
  expect(TARGET_ROOMS.filter((r) => sim.isHazard(r)), `${id}: hazards left`).toEqual([]);
  expect([...trace.loops].filter(([, on]) => on).map(([l]) => l), `${id}: loops left on`).toEqual([]);
  expect([...trace.facts].filter(([, t]) => t).map(([k]) => k), `${id}: facts left`).toEqual([]);
  expect(sim.frame().people.filter((p) => p.headgear).map((p) => p.id), `${id}: headgear left`).toEqual([]);
  expect(sim.people().filter((p) => !p.isCast && p.present).map((p) => p.id), `${id}: visitors left`).toEqual([]);
}

/** Start one event and run it to its end. Returns how long it took. */
function play(sim: Sim, trace: Trace, id: ChaosId, opts: { dt?: number } = {}): number {
  trace.effects.clear();
  const target = targetFor(sim, id);
  const err = sim.startChaos(id, target);
  expect(err, `${id} did not start: ${err}`).toBeNull();
  let ended = false;
  const off = sim.bus.on('chaosEnd', (e) => {
    if (e.id === id) ended = true;
  });
  const limit = CHAOS[id].duration + MARGIN;
  const t = runUntil(sim, () => ended, limit + 30, opts.dt ?? 1 / 20, () => {
    const e = invariantErrors(sim);
    if (e.length) throw new Error(`${id}: ${e.join('\n')}`);
  });
  off();
  expect(ended, `${id} never ended`).toBe(true);
  expect(t, `${id} took too long`).toBeLessThan(limit);
  clean(sim, trace, id);
  return t;
}

describe('every chaos script', () => {
  it('has all 34 registered', () => {
    expect(new Set(CHAOS_SCRIPTS.map((s) => s.id))).toEqual(new Set(CHAOS_IDS));
  });

  for (const id of CHAOS_IDS) {
    it(`${id}: starts, ends in time, leaves nothing behind`, () => {
      const { sim, trace } = setup(100 + CHAOS_IDS.indexOf(id));
      play(sim, trace, id);
    });

    it(`${id}: copes with someone being picked up and thrown`, () => {
      const { sim, trace } = setup(200 + CHAOS_IDS.indexOf(id));
      trace.effects.clear();
      expect(sim.startChaos(id, targetFor(sim, id))).toBeNull();
      let ended = false;
      const off = sim.bus.on('chaosEnd', (e) => {
        if (e.id === id) ended = true;
      });
      const check = (): void => {
        const e = invariantErrors(sim);
        if (e.length) throw new Error(`${id}: ${e.join('\n')}`);
      };
      // A few seconds in, grab someone at random (often the target) and fling them.
      runUntil(sim, () => ended, 2.5, 1 / 20, check);
      const victims = sim.people().filter((p) => p.isCast && p.present);
      const v = victims[Math.floor(sim.rng() * victims.length)];
      if (v && sim.pickUp(v.id)) {
        sim.dragTo(v.x + 40, v.y - 30);
        runUntil(sim, () => false, 0.6, 1 / 20, check);
        sim.drop(420 * (sim.rng() < 0.5 ? -1 : 1), -160);
      }
      const t = runUntil(sim, () => ended, CHAOS[id].duration + MARGIN + 30, 1 / 20, check);
      off();
      expect(ended, `${id} never ended`).toBe(true);
      expect(t + 3.1).toBeLessThan(CHAOS[id].duration + MARGIN);
      runUntil(sim, () => sim.holding === null && !sim.debugPeople().some((p) => p.airborne), 10);
      clean(sim, trace, id);
    });

    it(`${id}: runs twice in a row`, () => {
      const { sim, trace } = setup(300 + CHAOS_IDS.indexOf(id));
      play(sim, trace, id);
      play(sim, trace, id);
    });
  }

  it('runs all 34 back to back in one day', () => {
    const { sim, trace } = setup(400, 240);
    for (const id of CHAOS_IDS) {
      play(sim, trace, id, { dt: 1 / 10 });
      // A breather so people settle (and walk back in after a drill).
      runUntil(sim, () => false, 3, 1 / 10);
    }
    expect(sim.phase).not.toBe('over');
  });
});
