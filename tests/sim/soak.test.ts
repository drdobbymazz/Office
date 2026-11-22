// The soak test: several days with the player and the events doing their
// worst, checking every frame that nobody is ever somewhere impossible.
import { describe, expect, it } from 'vitest';
import { CAST_IDS, PLAN_KINDS, TARGET_ROOMS, type ChaosId, type CharId } from '@/game/core/types';
import { GRID_H, GRID_W, WORLD_H, WORLD_W, isWalkable } from '@/game/core/world';
import type { SceneHandle } from '@/game/core/simApi';
import { createRng } from '@/game/sim/rng';
import { invariantErrors, makeSim } from './helpers';

interface Running {
  h: SceneHandle;
  lines: number;
  next: number;
}

function soak(seed: number, days: number, dtMode: 'fixed' | 'coarse' | 'jitter' = 'fixed'): { errors: string[]; stats: Record<string, number>; maxStuck: number; scenes: number; lines: number; chaosStarted: number; forced: number; daysEnded: number } {
  const { sim } = makeSim({ seed, dayMinutes: 2, sandbox: true });
  const r = createRng(seed * 31 + 1);
  let dt = 1 / 20;
  const errors: string[] = [];
  const err = (e: string): void => {
    if (errors.length < 30) errors.push(`day ${sim.day} ${sim.clock.toFixed(0)}: ${e}`);
  };
  let daysEnded = 0;
  sim.bus.on('dayEnd', () => {
    daysEnded++;
  });
  let t = 0;
  let nextPlan = 2;
  let nextPick = 5;
  let nextBlock = 10;
  let clearBlockAt = Infinity;
  let nextChaos = 12;
  let nextDirector = 1;
  let held: { who: CharId; until: number; tx: number; ty: number } | null = null;
  const stuck = new Map<string, { x: number; y: number; t: number }>();
  const still = new Map<string, { key: string; since: number }>();
  let maxStuck = 0;
  const running: Running[] = [];
  let scenes = 0;
  let lines = 0;
  let chaosStarted = 0;
  let sceneN = 0;
  const startDay = sim.day;

  while (daysEnded < days && t < days * 400) {
    if (dtMode === 'coarse') dt = 0.25;
    else if (dtMode === 'jitter') dt = r.chance(0.1) ? 0 : r.range(0, 0.25);
    t += dt;
    sim.update(dt);
    const present = sim.people().filter((p) => p.present && p.isCast);

    // ── the player ──
    if (t >= nextPlan && present.length) {
      nextPlan = t + r.range(2, 4);
      const p = r.pick(present);
      const kind = r.pick(PLAN_KINDS);
      const target = r.chance(0.6) ? r.pick(CAST_IDS) : r.pick(TARGET_ROOMS);
      sim.setPlan(p.id, { kind, target, about: 'the stapler' });
    }
    // Home time is left alone so the test can insist everyone gets home (a person held past five is covered elsewhere).
    if (!held && t >= nextPick && present.length && sim.phase !== 'leaving') {
      nextPick = t + r.range(4, 9);
      const p = r.pick(present);
      if (sim.pickUp(p.id)) held = { who: p.id, until: t + r.range(0.2, 1.2), tx: r.range(-20, WORLD_W + 20), ty: r.range(-20, WORLD_H + 20) };
    }
    if (held) {
      sim.dragTo(held.tx, held.ty);
      if (t >= held.until) {
        const fast = r.chance(0.6);
        sim.drop(fast ? r.range(-800, 800) : r.range(-50, 50), fast ? r.range(-800, 800) : r.range(-50, 50));
        held = null;
      }
    }
    // No new blockages after five either: in the game every blocked tile is cleared at home time
    // (the events end), and the test insists that everyone gets home.
    if (t >= nextBlock && sim.phase !== 'leaving') {
      nextBlock = t + r.range(15, 30);
      const tiles = [];
      const n = r.int(1, 5);
      // Sometimes jam a doorway or corridor (trapping people on one side).
      if (r.chance(0.35)) tiles.push(r.pick([{ x: 16, y: 21 }, { x: 13, y: 8 }, { x: 5, y: 9 }, { x: 26, y: 9 }, { x: 8, y: 5 }, { x: 25, y: 13 }]));
      while (tiles.length < n) {
        const x = r.int(0, GRID_W - 1);
        const y = r.int(0, GRID_H - 1);
        if (isWalkable(x, y)) tiles.push({ x, y });
      }
      sim.setBlocked('soak', tiles);
      clearBlockAt = t + r.range(5, 14);
    }
    if (t >= clearBlockAt) {
      sim.setBlocked('soak', null);
      clearBlockAt = Infinity;
    }
    if (t >= nextChaos) {
      nextChaos = t + r.range(10, 22);
      const id: ChaosId = r.pick(['fire', 'smite', 'pizza'] as const);
      const res = sim.startChaos(id, { room: r.pick(TARGET_ROOMS), who: present.length ? r.pick(present).id : undefined });
      if (res === null) chaosStarted++;
    }

    // ── a pretend director ──
    if (t >= nextDirector) {
      nextDirector = t + 2;
      const asks = sim.takeSceneAsks();
      for (const a of asks) {
        if (running.length >= 2) break;
        const people = a.people ?? sim.peopleIn(a.room ?? 'bullpen').filter((p) => p.available).slice(0, 2).map((p) => p.id);
        if (!people.length) continue;
        const h = sim.openScene({ id: `scene${++sceneN}`, people, gather: true });
        if (h) {
          running.push({ h, lines: r.int(2, 4), next: t + 1 });
          scenes++;
        }
      }
    }
    for (let i = running.length - 1; i >= 0; i--) {
      const s = running[i];
      if (!s.h.alive) {
        s.h.close();
        running.splice(i, 1);
        continue;
      }
      if (!s.h.ready || t < s.next) continue;
      if (s.lines-- <= 0) {
        s.h.close();
        s.h.close();
        running.splice(i, 1);
        continue;
      }
      const who = r.pick(s.h.people);
      const act = r.pick(['none', 'laugh', 'point', 'step_closer', 'back_away', 'walk_off', 'storm_off', 'none', 'shout'] as const);
      const sp = s.h.line({ who, say: 'This is a line of dialogue about the stapler.', feel: 'angry', to: null, act });
      lines++;
      s.next = t + sp.durationMs / 1000 + 0.2;
    }

    // ── checks ──
    for (const e of invariantErrors(sim)) err(e);
    const frame = sim.frame();
    for (const sp of frame.speeches) {
      const p = sim.person(sp.who);
      if (!p || !p.present) err(`speech by ${sp.who} who is not here`);
    }
    for (const ps of frame.people) {
      if (!Number.isFinite(ps.x) || !Number.isFinite(ps.y) || !Number.isFinite(ps.lift)) err(`${ps.id} frame NaN`);
    }
    for (const d of sim.debugPeople()) {
      if (!d.present) {
        stuck.delete(d.id);
        still.delete(d.id);
        continue;
      }
      const s = stuck.get(d.id);
      const trying = d.walking || d.waiting;
      if (!trying || !s || Math.abs(s.x - d.x) + Math.abs(s.y - d.y) > 3) {
        stuck.set(d.id, { x: d.x, y: d.y, t });
      } else {
        const for_ = t - s.t;
        if (for_ > maxStuck) maxStuck = for_;
        if (for_ > 30) err(`${d.id} stuck for ${for_.toFixed(1)} s at ${d.tile.x},${d.tile.y} (${d.job}, ${d.doing})`);
      }
      // Liveness: nobody frozen in the same place doing the same thing for ages.
      const key = `${Math.round(d.x)},${Math.round(d.y)},${d.doing},${d.job}`;
      const st = still.get(d.id);
      if (!st || st.key !== key) still.set(d.id, { key, since: t });
      else if (t - st.since > 150 && !d.seized) err(`${d.id} has not changed for ${(t - st.since).toFixed(0)} s (${key})`);
    }
    if (sim.phase === 'over' && daysEnded < days) sim.beginDay();
  }
  void startDay;
  return { errors, stats: { ...sim.debugStats } as unknown as Record<string, number>, maxStuck, scenes, lines, chaosStarted, forced: sim.debugStats.forcedHome, daysEnded };
}

describe('soak', () => {
  const runs: [number, 'fixed' | 'coarse' | 'jitter'][] = [[1, 'fixed'], [2, 'fixed'], [3, 'fixed'], [4, 'fixed'], [5, 'coarse'], [6, 'jitter']];
  for (const [seed, mode] of runs) {
    it(`survives several chaotic days (seed ${seed}, ${mode} dt)`, () => {
      const res = soak(seed, 4, mode);
      if (res.errors.length || res.forced) console.log(`seed ${seed}`, JSON.stringify(res, null, 1));
      expect(res.errors).toEqual([]);
      expect(res.daysEnded).toBe(4);
      expect(res.forced).toBe(0);
      expect(res.maxStuck).toBeLessThanOrEqual(30);
      expect(res.scenes).toBeGreaterThan(5);
      expect(res.chaosStarted).toBeGreaterThan(5);
    }, 120_000);
  }
});

describe('determinism', () => {
  it('the same seed and inputs give the same day', () => {
    const run = (): string => {
      const { sim } = makeSim({ seed: 77, dayMinutes: 2 });
      const out: string[] = [];
      for (let i = 0; i < 2400; i++) {
        sim.update(1 / 20);
        if (i === 600) sim.startChaos('fire', { room: 'kitchen' });
        if (i === 900) sim.setPlan('dwight', { kind: 'confront', target: 'jim', about: 'the stapler' });
        if (i % 200 === 0) out.push(sim.debugPeople().map((p) => `${p.id}:${p.x.toFixed(2)},${p.y.toFixed(2)}:${p.doing}`).join('|'));
      }
      return out.join('\n') + JSON.stringify(sim.meters());
    };
    expect(run()).toBe(run());
  });
});
