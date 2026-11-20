// RACCOON (room). A raccoon runs in through the front door and makes for the
// food in the room. The brave chase it, the rest back away. A pest fixer comes
// at it with a net and it bolts back out of the door with whatever it grabbed.

import type { CharId, TargetRoomId, Tile } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { LANDMARKS, anchor, anchorsIn, feetOf, room as roomDef } from '@/game/core/world';
import { Fixer, PathMover, Run, availableIds, isBrave, isNervous, pick, randomTileIn, staff } from './util';

const RUN = 80;
const BOLT = 105;
const BOLTS_BY = 24;

/** Somewhere with food: the fridge, or a desk (there is always a snack drawer). */
function foodTile(sim: SimApi, room: TargetRoomId): Tile {
  if (room === 'kitchen') return anchor('stand.fridge').tile;
  const desks = anchorsIn(room).filter((a) => a.kind === 'desk' || a.kind === 'stand');
  return pick(sim, desks)?.tile ?? randomTileIn(sim, room);
}

class RaccoonRun extends Run {
  private mover: PathMover;
  private food: Tile;
  private state: 'in' | 'eat' | 'bolt' | 'gone' = 'in';
  private fixer: Fixer;
  private goneAt = -1;
  private witnesses = new Set<CharId>();

  constructor(sim: SimApi, private target: TargetRoomId) {
    super(sim, 'raccoon', `Raccoon in ${roomDef(target).name}`, target, { room: target });
    const door = anchor('door.entrance').tile;
    this.food = foodTile(sim, target);
    this.mover = new PathMover(feetOf({ x: door.x, y: door.y + 1 }));
    this.mover.goTo({ x: door.x, y: door.y + 1 }, this.food);
    this.effect('coon', { kind: 'creature', species: 'raccoon', x: this.mover.x, y: this.mover.y, facing: 'up', anim: 'run', carrying: false });
    sim.sfx('raccoonChitter', this.mover.x);
    sim.sfx('doorOpen', this.mover.x);
    this.narrate('start');
    this.fact(true);
    this.focus(this.mover.x, this.mover.y, 120, 90, 3000);
    this.fixer = new Fixer(sim, {
      skill: 'pest',
      near: () => feetOf(this.food),
      firstAt: 6,
      chaos: 'raccoon',
      task: { at: { tile: this.food }, seconds: 1.5, anim: 'operate', prop: 'net', style: 'run', doing: 'swinging a net at the raccoon', walkDoing: 'running at the raccoon with a net' },
      onCalled: () => undefined,
      onDone: () => this.bolt()
    });
  }

  protected tick(dt: number): void {
    const sim = this.sim;
    if (this.state === 'gone') {
      if (this.t - this.goneAt > 1) this.close();
      return;
    }
    if (this.state === 'in') {
      this.mover.update(dt, RUN);
      if (this.mover.arrived) this.startEating();
    } else if (this.state === 'eat') {
      if (sim.rng() < dt * 1.5) sim.fx({ kind: 'burst', what: 'crumbs', x: this.mover.x, y: this.mover.y - 4, count: 3 });
      if (sim.rng() < dt * 0.4) sim.sfx('raccoonChitter', this.mover.x);
      // A fixer swinging a net close by sends it running even before they finish.
      if (this.fixer.working) this.bolt();
      this.fixer.update(this.t);
    } else if (this.state === 'bolt') {
      this.mover.update(dt, BOLT);
      if (this.mover.arrived) this.leave();
    }
    this.patch('coon', { x: this.mover.x, y: this.mover.y, facing: this.mover.facing });
    if (this.state !== 'bolt' && this.t >= BOLTS_BY) this.bolt();
  }

  private startEating(): void {
    const sim = this.sim;
    this.state = 'eat';
    this.patch('coon', { anim: 'eat', carrying: true });
    sim.sfx('raccoonChitter', this.mover.x);
    const here = staff(sim, this.target);
    let barked = 0;
    for (const p of here) {
      this.witnesses.add(p.id);
      if (barked++ < 2) sim.chaosBark(p.id, 'raccoon');
      else sim.emote(p.id, 'alert');
      if (isBrave(p.id) && p.available) {
        sim.goTo(p.id, { tile: this.food }, { style: 'run', doing: 'chasing the raccoon', stay: 3, stayDoing: 'glaring at the raccoon', braveHazard: true });
        sim.feel(p.id, 'determined', 0.9, 8);
      } else if (isNervous(p.id)) {
        sim.feel(p.id, 'scared', 0.9, 8);
        sim.fleeFrom(p.id, this.target, { doing: 'backing away from the raccoon', stay: 10 });
      } else {
        sim.feel(p.id, 'disgusted', 0.7, 6);
        sim.react(p.id, 'startle', 1);
      }
      if (isCastId(p.id) && p.id === 'angela') sim.bark(p.id, 'disgusted');
    }
    this.focus(this.mover.x, this.mover.y, 120, 90, 3000);
  }

  private bolt(): void {
    if (this.state === 'bolt' || this.state === 'gone') return;
    const sim = this.sim;
    this.state = 'bolt';
    this.patch('coon', { anim: 'run' });
    sim.sfx('raccoonChitter', this.mover.x);
    const from = { x: Math.floor(this.mover.x / 16), y: Math.floor((this.mover.y - 1) / 16) };
    this.mover.goTo(from, { x: LANDMARKS.frontDoor.x, y: LANDMARKS.frontDoor.y + 2 });
  }

  private leave(): void {
    const sim = this.sim;
    this.state = 'gone';
    this.goneAt = this.t;
    this.unEffect('coon');
    this.fact(false);
    this.narrate('end');
    const witnesses = [...this.witnesses];
    const fixer = this.fixer.fixed ? this.fixer.who : null;
    if (fixer) {
      sim.emote(fixer, 'star');
      sim.remember([fixer], 'I chased a raccoon out of the office with a net.', 1.5);
    }
    this.remember(witnesses, 1.5);
    const people = availableIds(sim, [...(fixer ? [fixer] : []), ...witnesses], 3);
    sim.requestScene({
      people: people.length ? people : undefined,
      room: this.target,
      trigger: 'aftermath',
      why: fixer ? `${this.name(fixer)} just chased a raccoon out of ${roomDef(this.target).name} with a net.` : this.line('aftermath'),
      priority: 5,
      staleAfter: 40
    });
  }

  protected onEnd(): void {
    this.fixer.cancel();
  }
}

export const raccoonScript: ChaosScript = {
  id: 'raccoon',
  start(sim, target) {
    return new RaccoonRun(sim, target.room as TargetRoomId);
  }
};
