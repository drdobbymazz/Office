// PUPPY (room). A puppy trots in through the front door and sits in the room.
// People gather round and melt (Angela disapproves). After a while it trots off.

import type { CharId, TargetRoomId, Tile } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { LANDMARKS, anchor, feetOf, room as roomDef } from '@/game/core/world';
import { PathMover, Run, availableIds, randomTileIn, staff } from './util';

const TROT = 55;
const LEAVES_AT = 28;
const MAX_FANS = 6;

class PuppyRun extends Run {
  private mover: PathMover;
  private spot: Tile;
  private state: 'in' | 'stay' | 'out' | 'gone' = 'in';
  private fans: CharId[] = [];
  private nextHop = 0;
  private goneAt = -1;

  constructor(sim: SimApi, private target: TargetRoomId) {
    super(sim, 'puppy', `A puppy in ${roomDef(target).name}`, target, { room: target });
    const door = anchor('door.entrance').tile;
    this.spot = randomTileIn(sim, target);
    const start = { x: door.x, y: door.y + 1 };
    this.mover = new PathMover(feetOf(start));
    this.mover.goTo(start, this.spot);
    this.effect('pup', { kind: 'creature', species: 'puppy', x: this.mover.x, y: this.mover.y, facing: 'up', anim: 'run', carrying: false });
    sim.sfx('puppyBark', this.mover.x);
    this.narrate('start');
    this.fact(true);
    this.focus(this.mover.x, this.mover.y, 120, 90, 3000, 0.8);
  }

  protected tick(dt: number): void {
    const sim = this.sim;
    if (this.state === 'gone') {
      if (this.t - this.goneAt > 1) this.close();
      return;
    }
    if (this.state === 'in') {
      this.mover.update(dt, TROT);
      if (this.mover.arrived) this.arrive();
    } else if (this.state === 'stay') {
      if (this.t >= this.nextHop) {
        this.nextHop = this.t + 3 + sim.rng() * 3;
        const anim = sim.rng() < 0.5 ? 'happy' : sim.rng() < 0.5 ? 'jump' : 'sit';
        this.patch('pup', { anim, facing: sim.rng() < 0.5 ? 'left' : 'right' });
        if (anim !== 'sit') sim.sfx('puppyBark', this.mover.x);
        if (anim === 'happy') sim.fx({ kind: 'burst', what: 'hearts', x: this.mover.x, y: this.mover.y - 10, count: 3 });
      }
      if (this.t >= LEAVES_AT) this.leave();
    } else if (this.state === 'out') {
      this.mover.update(dt, TROT);
      if (this.mover.arrived) this.gone();
    }
    // (Re-read: the calls above may have changed the state.)
    const state = this.state as PuppyRun['state'];
    if (state !== 'stay') this.patch('pup', { x: this.mover.x, y: this.mover.y, facing: this.mover.facing });
    if ((state === 'in' && this.t >= LEAVES_AT - 6) || this.t >= LEAVES_AT + 2) this.leave();
  }

  private arrive(): void {
    const sim = this.sim;
    this.state = 'stay';
    this.patch('pup', { anim: 'happy', x: this.mover.x, y: this.mover.y });
    sim.sfx('puppyBark', this.mover.x);
    const near = sim.peopleNear(this.mover.x, this.mover.y, 170).filter((p) => p.isCast && p.present);
    const inRoom = staff(sim, this.target);
    const crowd = [...new Map([...inRoom, ...near].map((p) => [p.id, p])).values()];
    let barked = 0;
    for (const p of crowd) {
      if (p.id === 'angela') {
        sim.emote(p.id, 'no');
        sim.feel(p.id, 'disgusted', 0.9, 15);
        sim.react(p.id, 'shake', 1.5);
        sim.bark(p.id, 'disgusted');
        continue;
      }
      if (p.id === 'stanley') {
        sim.emote(p.id, 'dots');
        continue;
      }
      if (!p.available || this.fans.length >= MAX_FANS) continue;
      this.fans.push(p.id);
      if (barked++ < 2) sim.chaosBark(p.id, 'puppy');
      else sim.emote(p.id, 'heart');
      sim.feel(p.id, 'happy', 0.9, 15);
      sim.bumpMood(p.id, 0.12);
      sim.goTo(p.id, { tile: this.spot }, { doing: 'hurrying over to see the puppy', stay: 14, stayDoing: 'cooing over the puppy' });
    }
    this.focus(this.mover.x, this.mover.y, 140, 100, 4000, 0.8);
    this.after(5, () => {
      const people = availableIds(sim, this.fans, 3);
      if (people.length) sim.requestScene({ people, room: this.target, trigger: 'event', why: 'A puppy has wandered into the office and everyone is cooing over it.', priority: 4, staleAfter: 25 });
    });
  }

  private leave(): void {
    if (this.state === 'out' || this.state === 'gone') return;
    this.state = 'out';
    this.patch('pup', { anim: 'run' });
    const from = { x: Math.floor(this.mover.x / 16), y: Math.floor((this.mover.y - 1) / 16) };
    this.mover.goTo(from, { x: LANDMARKS.frontDoor.x, y: LANDMARKS.frontDoor.y + 2 });
    for (const id of this.fans) this.sim.emote(id, 'tear');
  }

  private gone(): void {
    const sim = this.sim;
    this.state = 'gone';
    this.goneAt = this.t;
    this.unEffect('pup');
    this.fact(false);
    this.narrate('end');
    this.remember(this.fans, 1);
    const people = availableIds(sim, this.fans, 2);
    sim.requestScene({
      people: people.length ? people : undefined,
      room: this.target,
      trigger: 'aftermath',
      why: this.line('aftermath'),
      priority: 4,
      staleAfter: 30
    });
  }
}

export const puppyScript: ChaosScript = {
  id: 'puppy',
  start(sim, target) {
    return new PuppyRun(sim, target.room as TargetRoomId);
  }
};
