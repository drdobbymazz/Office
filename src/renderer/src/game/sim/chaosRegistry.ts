// The registry of chaos scripts: validation, cooldowns, the active runs and
// their lifecycle (start, update, end), with a safety net so a run that
// misbehaves is ended rather than left hanging.

import type { ChaosId, ChaosTarget, CharId, RoomId } from '@/game/core/types';
import { chaosLine } from '@/game/core/content/fill';
import { TARGET_ROOMS } from '@/game/core/types';
import { CHAOS } from '@/game/core/chaos';
import type { ChaosRun, ChaosScript } from '@/game/core/simApi';
import type { ActiveChaosUi, CooldownUi } from '@/game/app/gameApi';
import type { SimCore } from './core';

interface ActiveRun {
  key: string;
  id: ChaosId;
  run: ChaosRun;
  startedAt: number;
  maxLife: number;
  ended: boolean;
}

export class ChaosRegistry {
  private scripts = new Map<ChaosId, ChaosScript>();
  private runs: ActiveRun[] = [];
  private readyAt = new Map<ChaosId, number>();
  private counter = 0;
  /** Powers not allowed at all right now, with the plain reason (a story chapter's rules). */
  private locks: Partial<Record<ChaosId, string>> = {};

  constructor(private core: SimCore, private sandbox: boolean) {}

  register(script: ChaosScript): void {
    this.scripts.set(script.id, script);
  }

  /** Forbid powers outright (even when something else sets them off), with a reason each. */
  setLocks(locks: Partial<Record<ChaosId, string>>): void {
    this.locks = { ...locks };
  }

  has(id: ChaosId): boolean {
    return this.scripts.has(id);
  }

  registered(): ChaosId[] {
    return [...this.scripts.keys()];
  }

  /** null on success, else a plain reason. */
  /** force: set off by something else (a typed event), so cooldowns neither block it nor start. */
  start(id: ChaosId, target: ChaosTarget = {}, force = false): string | null {
    const core = this.core;
    const def = CHAOS[id];
    if (!def) return 'There is no such power.';
    const locked = this.locks[id];
    if (locked) return locked;
    const script = this.scripts.get(id);
    if (!script) return `${def.name} is not ready yet.`;
    const phase = core.clockState.phase;
    if (phase === 'leaving' || phase === 'over') return 'Everyone is going home.';
    if (!core.list.some((p) => p.isCast && p.onFloor)) return 'Nobody is in the office yet.';
    if (!this.sandbox && !force) {
      const ready = this.readyAt.get(id) ?? 0;
      if (core.time < ready) return `Still cooling down (${Math.ceil(ready - core.time)} s).`;
    }
    const t: ChaosTarget = { ...target };
    const checkPerson = (who: CharId | undefined, label: string): string | null => {
      if (!who) return `Pick ${label} first.`;
      const p = core.byId(who);
      if (!p || !p.onFloor) return `${p ? p.name : 'That person'} is not in the office.`;
      if (p.held) return `Put ${p.name} down first.`;
      return null;
    };
    switch (def.target) {
      case 'room':
        if (!t.room) t.room = def.fixedRoom;
        if (!t.room || !(TARGET_ROOMS as readonly string[]).includes(t.room)) return 'Pick a room first.';
        break;
      case 'person': {
        const r = checkPerson(t.who, 'someone');
        if (r) return r;
        break;
      }
      case 'pair': {
        const r = checkPerson(t.who, 'someone') ?? checkPerson(t.other, 'a second person');
        if (r) return r;
        if (t.who === t.other) return 'Pick two different people.';
        if (def.fixedRoom) t.room = def.fixedRoom;
        break;
      }
      case 'none':
        if (def.fixedRoom) t.room = def.fixedRoom;
        break;
    }
    // One of each kind at a time in the same place.
    for (const r of this.runs) {
      if (r.ended || r.id !== id) continue;
      if (def.target === 'room' && r.run.room === t.room) return `There is already a ${def.name.toLowerCase()} there.`;
      if (def.target === 'none') return `${def.name} is already happening.`;
    }
    let reason: string | null = null;
    try {
      reason = script.blocked ? script.blocked(core, t) : null;
    } catch (err) {
      console.error(`[sim] chaos ${id} blocked() threw`, err);
      reason = 'That did not work. Try again.';
    }
    if (reason) return reason;
    let run: ChaosRun;
    try {
      run = script.start(core, t);
    } catch (err) {
      console.error(`[sim] chaos ${id} start() threw`, err);
      return 'That did not work. Try again.';
    }
    const key = `${id}#${++this.counter}`;
    this.runs.push({ key, id, run, startedAt: core.time, maxLife: Math.max(90, def.duration * 3), ended: false });
    if (!this.sandbox && !force) this.readyAt.set(id, core.time + def.cooldown);
    const room = run.room ?? t.room ?? undefined;
    core.bus.emit('chaosStart', { id, target: t, label: run.label, room: room as RoomId | undefined });
    core.bumpChaos(def.chaos);
    if (def.incident) core.incident();
    // A script that does not write its own opening line gets the catalogue's sentence for it.
    if (!run.ownStartLine) {
      const line = chaosLine(id, 'start', { room: (room as RoomId | undefined) ?? null, who: t.who ?? null, other: t.other ?? null });
      core.narrate(line || run.label, { icon: id, kind: 'overseer', room: room as RoomId | undefined });
    }
    return null;
  }

  update(dt: number): void {
    for (const r of this.runs) {
      if (r.ended) continue;
      try {
        r.run.update(dt);
      } catch (err) {
        console.error(`[sim] chaos ${r.id} update() threw`, err);
        this.finish(r);
        continue;
      }
      if (r.run.done || this.core.time - r.startedAt > r.maxLife) this.finish(r);
    }
    if (this.runs.some((r) => r.ended)) this.runs = this.runs.filter((r) => !r.ended);
  }

  private finish(r: ActiveRun): void {
    if (r.ended) return;
    r.ended = true;
    try {
      r.run.end();
    } catch (err) {
      console.error(`[sim] chaos ${r.id} end() threw`, err);
    }
    this.core.bus.emit('chaosEnd', { id: r.id });
  }

  endAll(): void {
    for (const r of this.runs) this.finish(r);
    this.runs = [];
  }

  activeCount(): number {
    return this.runs.filter((r) => !r.ended).length;
  }

  isActive(id: ChaosId): boolean {
    return this.runs.some((r) => !r.ended && r.id === id);
  }

  cooldowns(nowMs: number): Partial<Record<ChaosId, CooldownUi>> {
    const out: Partial<Record<ChaosId, CooldownUi>> = {};
    if (this.sandbox) return out;
    for (const [id, at] of this.readyAt) {
      const left = at - this.core.time;
      if (left <= 0) continue;
      out[id] = { readyAt: nowMs + left * 1000, total: CHAOS[id].cooldown * 1000 };
    }
    return out;
  }

  /** Seconds until a power is ready (0 = ready). */
  cooldownLeft(id: ChaosId): number {
    if (this.sandbox) return 0;
    return Math.max(0, (this.readyAt.get(id) ?? 0) - this.core.time);
  }

  active(nowMs: number): ActiveChaosUi[] {
    return this.runs
      .filter((r) => !r.ended)
      .map((r) => {
        const dur = CHAOS[r.id].duration;
        const left = dur > 0 ? dur - (this.core.time - r.startedAt) : 0;
        return { key: r.key, id: r.id, label: r.run.label, room: r.run.room, endsAt: dur > 0 ? nowMs + Math.max(0, left) * 1000 : 0 };
      });
  }

  resetCooldowns(): void {
    this.readyAt.clear();
  }
}
