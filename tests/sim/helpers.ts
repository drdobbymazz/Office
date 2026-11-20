// Shared test helpers: a bus that records events, canned reflexes, and the
// invariant checks the soak tests run every frame.
import { Bus, type GameEvents } from '@/game/core/bus';
import type { Reflexes } from '@/game/brain/api';
import { createSim, type Sim, type SaveData } from '@/game/sim';
import { isWalkable, GRID_W, GRID_H, TILE, WORLD_W, WORLD_H, tileAt } from '@/game/core/world';

export const reflexes: Reflexes = {
  bark: (who, kind) => `${who} ${kind}!`,
  chaosBark: (who, chaos) => `${who} reacts to ${chaos}!`
};

export interface Recorder {
  counts: Map<string, number>;
  events: { type: string; payload: unknown }[];
}

export function makeSim(opts: { seed?: number; dayMinutes?: number; sandbox?: boolean; save?: SaveData; keep?: boolean } = {}): { sim: Sim; bus: Bus<GameEvents>; rec: Recorder } {
  const bus = new Bus<GameEvents>();
  const rec: Recorder = { counts: new Map(), events: [] };
  const types: (keyof GameEvents)[] = ['feed', 'speech', 'speechEnd', 'fx', 'sfx', 'loop', 'shake', 'focus', 'chaosStart', 'chaosEnd', 'toast', 'dayStart', 'dayEnd', 'pickedUp', 'dropped', 'buzz'];
  for (const t of types) {
    bus.on(t, (payload) => {
      rec.counts.set(t, (rec.counts.get(t) ?? 0) + 1);
      if (opts.keep) rec.events.push({ type: t, payload });
    });
  }
  const sim = createSim({ bus, reflexes, seed: opts.seed ?? 7, dayMinutes: opts.dayMinutes ?? 2, sandbox: opts.sandbox ?? true, save: opts.save, now: () => 0 });
  return { sim, bus, rec };
}

/** Run until a predicate holds (or the time limit), checking invariants every step. */
export function runUntil(sim: Sim, pred: () => boolean, limit: number, dt = 1 / 20, check?: () => void): number {
  let t = 0;
  while (t < limit) {
    if (pred()) return t;
    sim.update(dt);
    t += dt;
    check?.();
  }
  return t;
}

export function invariantErrors(sim: Sim): string[] {
  const errs: string[] = [];
  const taken = new Map<string, string>();
  for (const p of sim.debugPeople()) {
    if (!p.present) continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) errs.push(`${p.id} at NaN`);
    if (p.x < 0 || p.x > WORLD_W || p.y < 0 || p.y > WORLD_H) errs.push(`${p.id} off the map at ${p.x},${p.y}`);
    if (p.resting) {
      const t = tileAt(p.x, p.y);
      if (!isWalkable(t.x, t.y)) errs.push(`${p.id} resting on a non-walkable tile ${t.x},${t.y} (job ${p.job}, ${p.doing})`);
      if (p.res && (p.res.x !== t.x || p.res.y !== t.y) && !p.seized) {
        // Allowed only while gliding onto it (seized settle): otherwise it is a bug.
        errs.push(`${p.id} resting at ${t.x},${t.y} but reserved ${p.res.x},${p.res.y} (job ${p.job}, ${p.doing})`);
      }
      const k = `${t.x},${t.y}`;
      const other = taken.get(k);
      if (other) errs.push(`${p.id} and ${other} both resting on ${k}`);
      taken.set(k, p.id);
    }
  }
  return errs;
}

export { GRID_W, GRID_H, TILE };
