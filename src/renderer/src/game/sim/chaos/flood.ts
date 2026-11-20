// FLOOD (room). A pipe bursts by a wall and the water rises; people get wet,
// the nervous run, the brave stand there complaining. A flood fixer runs over
// with a wrench; the water drains; a wet-floor sign and puddles sit there a while.

import type { CharId, TargetRoomId, Tile } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { feetOf, isWalkable, room as roomDef, walkableTilesIn } from '@/game/core/world';
import { Fixer, Run, availableIds, pick, reactAll, staff, tween } from './util';

const RISE = 12;
const GIVE_UP = 26;
const DRAIN = 8;
const PUDDLES = 4;

/** A floor tile with a wall behind it, where a pipe could plausibly burst. */
function pipeTile(sim: SimApi, room: TargetRoomId): Tile {
  const tiles = walkableTilesIn(room);
  const walled = tiles.filter((t) => !isWalkable(t.x, t.y - 1));
  return pick(sim, walled.length ? walled : tiles) ?? tiles[0];
}

class FloodRun extends Run {
  private spout: Tile;
  private sx: number;
  private sy: number;
  private level = 0.05;
  private stoppedAt = -1;
  private levelAtStop = 0;
  private fixer: Fixer;
  private wet = new Set<CharId>();
  private witnesses: CharId[] = [];

  constructor(sim: SimApi, private target: TargetRoomId) {
    super(sim, 'flood', `Burst pipe in ${roomDef(target).name}`, target, { room: target });
    this.spout = pipeTile(sim, target);
    const f = feetOf(this.spout);
    this.sx = f.x;
    this.sy = f.y - 22;
    this.effect('water', { kind: 'flood', room: target, level: this.level, spoutX: this.sx, spoutY: this.sy, spraying: true });
    this.loop('waterRush', true);
    this.hazard(target);
    sim.sfx('splash', this.sx);
    sim.sfx('glass', this.sx);
    sim.fx({ kind: 'splash', x: this.sx, y: this.sy + 10 });
    sim.shake(0.15, 200);
    this.narrate('start');
    this.fact(true);
    this.focus(this.sx, this.sy + 10, 120, 90);

    const here = staff(sim, target).map((p) => p.id);
    this.witnesses = here;
    reactAll(sim, here, 'flood', {
      bold: (id) => {
        sim.react(id, 'shake', 2);
        sim.feel(id, 'angry', 0.6, 8);
      },
      scared: (id) => {
        sim.feel(id, 'scared', 0.8, 8);
        sim.fleeFrom(id, target, { doing: 'running from the burst pipe', stay: 12 });
      },
      middling: (id) => {
        sim.feel(id, 'surprised', 0.7, 6);
        if (sim.rng() < 0.5) sim.fleeFrom(id, target, { doing: 'getting away from the water', stay: 10 });
        else sim.react(id, 'startle', 1);
      }
    });

    this.fixer = new Fixer(sim, {
      skill: 'flood',
      near: () => ({ x: this.sx, y: this.sy }),
      firstAt: 2,
      chaos: 'flood',
      task: { at: { tile: this.spout }, seconds: 4, anim: 'operate', prop: 'wrench', style: 'run', doing: 'fixing the burst pipe', walkDoing: 'running to fix the burst pipe' },
      onDone: (who) => this.stop(who)
    });
  }

  protected tick(dt: number): void {
    const sim = this.sim;
    if (this.stoppedAt < 0) {
      this.level = Math.min(1, this.level + dt / RISE);
      this.patch('water', { level: this.level });
      this.fixer.update(this.t);
      if (sim.rng() < dt * 2) sim.fx({ kind: 'burst', what: 'water', x: this.sx, y: this.sy + 8, count: 5 });
      // Anyone standing in it once it is up past the ankles gets soaked.
      if (this.level > 0.25 && Math.floor(this.t) !== Math.floor(this.t - dt)) {
        for (const p of sim.peopleIn(this.target)) {
          if (!p.present || this.wet.has(p.id)) continue;
          this.wet.add(p.id);
          sim.addStatus(p.id, 'wet', 90);
          if (this.wet.size <= 3 && p.available) sim.bark(p.id, 'wet');
        }
      }
      if (this.t >= GIVE_UP) this.stop(null);
    } else {
      const k = this.t - this.stoppedAt;
      this.patch('water', { level: tween(k, 0, DRAIN, this.levelAtStop, 0) });
      if (k >= DRAIN + PUDDLES) this.close();
    }
  }

  private stop(by: CharId | null): void {
    if (this.stoppedAt >= 0) return;
    const sim = this.sim;
    this.stoppedAt = this.t;
    this.levelAtStop = this.level;
    this.patch('water', { spraying: false });
    this.loop('waterRush', false);
    this.hazard(null);
    this.fact(false);
    sim.sfx('squeak', this.sx);
    this.narrate('end');
    const f = feetOf(this.spout);
    this.effect('sign', { kind: 'item', item: 'wetFloorSign', x: f.x + 12, y: f.y });
    const tiles = walkableTilesIn(this.target);
    for (let i = 0; i < 2; i++) {
      const t = pick(sim, tiles);
      if (t) this.effect(`puddle${i}`, { kind: 'item', item: 'puddle', x: feetOf(t).x, y: feetOf(t).y - 2 });
    }
    if (by) {
      sim.addStatus(by, 'wet', 60);
      sim.feel(by, 'proud', 0.8, 8);
      sim.emote(by, 'star');
      sim.bumpMood(by, 0.1);
      sim.remember([by], `I fixed the burst pipe in ${roomDef(this.target).name} with a wrench.`, 2);
      this.focusOn([by]);
    }
    this.remember([...this.witnesses, ...(by ? [by] : [])]);
    const people = availableIds(sim, by ? [by, ...this.witnesses.filter((w) => w !== by)] : this.witnesses, 3);
    sim.requestScene({
      people: people.length ? people : undefined,
      room: this.target,
      trigger: 'aftermath',
      why: by ? `${this.name(by)} just fixed a burst pipe that flooded ${roomDef(this.target).name}.` : this.line('aftermath'),
      priority: 5,
      staleAfter: 40
    });
  }

  protected onEnd(): void {
    this.fixer.cancel();
  }
}

export const floodScript: ChaosScript = {
  id: 'flood',
  blocked(_sim, target) {
    return target.room ? null : 'Pick a room first.';
  },
  start(sim, target) {
    return new FloodRun(sim, target.room as TargetRoomId);
  }
};
