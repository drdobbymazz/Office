// PIZZA (no target, always the break room). A reference script for a visitor
// event: the courier walks in from the street with the boxes, the staff flock
// to the break room and eat, moods rise, the courier leaves.

import type { CharId, RoomId } from '@/game/core/types';
import { anchor, feetOf } from '@/game/core/world';
import type { ChaosRun, ChaosScript, SimApi } from '@/game/core/simApi';

const COURIER = 'visitor:courier';
const FALLBACK_ARRIVE = 30;
const EAT_SECONDS = 14;
const AFTER_ARRIVE = 32;

let pizzaCount = 0;

class PizzaRun implements ChaosRun {
  readonly label = 'Free pizza in the break room';
  /** Writes its own line in the log when it happens. */
  readonly ownStartLine = true;
  readonly room: RoomId = 'kitchen';
  done = false;
  private t = 0;
  private arrivedAt = -1;
  private readonly key: string;
  private courierLeaving = false;
  private eaters = new Set<CharId>();
  private calls: { at: number; who: CharId }[] = [];
  private ended = false;

  constructor(private sim: SimApi) {
    this.key = `pizza:${++pizzaCount}`;
    sim.spawnVisitor(COURIER, { anchor: 'exit.street' });
    sim.setProp(COURIER, 'pizza');
    sim.feel(COURIER, 'bored', 0.5, 30);
    sim.goTo(COURIER, { anchor: 'stand.counter' }, {
      doing: 'delivering a stack of pizzas',
      stay: 0,
      braveHazard: true,
      then: () => this.arrive()
    });
    const door = feetOf(anchor('door.entrance').tile);
    sim.bus.emit('focus', { x: door.x - 64, y: door.y - 48, w: 128, h: 80, weight: 0.7, holdMs: 2500 });
  }

  private arrive(): void {
    if (this.arrivedAt >= 0) return;
    const sim = this.sim;
    this.arrivedAt = this.t;
    const counter = feetOf(anchor('stand.counter').tile);
    sim.addEffect({ id: `${this.key}:boxes`, kind: 'item', item: 'pizzaBoxes', x: counter.x, y: counter.y - 18 });
    sim.setProp(COURIER, null);
    sim.say(COURIER, 'Pizza for, uh, "the whole office"? Somebody sign for this.', { emotion: 'bored', intensity: 0.5 });
    sim.sfx('ding', counter.x);
    sim.setFact(this.key, 'There is free pizza in the break room.');
    sim.narrate('Free pizza arrived in the break room. Everyone is heading over.', { icon: 'pizza', room: 'kitchen' });
    sim.bus.emit('focus', { x: counter.x - 80, y: counter.y - 80, w: 160, h: 112, weight: 0.8, holdMs: 3000 });
    // The staff come in a trickle, keenest first; one or two grumps stay put.
    const staff = sim.people().filter((p) => p.isCast && p.available);
    staff.forEach((p, i) => {
      const grump = (p.id === 'angela' || p.id === 'stanley') && sim.rng() < 0.4;
      if (grump) return;
      this.calls.push({ at: this.t + 0.4 + i * 0.35 + sim.rng() * 1.5, who: p.id });
    });
  }

  update(dt: number): void {
    if (this.done) return;
    const sim = this.sim;
    this.t += dt;
    if (this.arrivedAt < 0 && this.t >= FALLBACK_ARRIVE) {
      // The courier never made it (picked up, blocked): leave the boxes at the counter anyway.
      this.arrive();
    }
    for (const c of this.calls) {
      if (c.at > this.t || this.eaters.has(c.who)) continue;
      this.eaters.add(c.who);
      const p = sim.person(c.who);
      if (!p || !p.available) continue;
      if (sim.rng() < 0.3) sim.bark(c.who, 'delighted');
      else sim.emote(c.who, 'heart');
      sim.assign(c.who, {
        at: { room: 'kitchen' },
        seconds: EAT_SECONDS + sim.rng() * 6,
        anim: 'eat',
        prop: 'pizza',
        doing: 'eating free pizza',
        walkDoing: 'heading for the free pizza'
      }, () => {
        sim.bumpMood(c.who, 0.2);
        sim.feel(c.who, 'happy', 0.8, 8);
        sim.remember([c.who], 'Free pizza turned up in the break room. Good day.', 1);
      });
    }
    // The courier heads back out once the boxes are down.
    if (this.arrivedAt >= 0 && !this.courierLeaving && this.t - this.arrivedAt > 3) {
      this.courierLeaving = true;
      sim.goTo(COURIER, { anchor: 'exit.street' }, { doing: 'leaving', stay: 0, braveHazard: true, then: () => sim.removeVisitor(COURIER) });
    }
    if (this.arrivedAt >= 0 && this.t - this.arrivedAt > AFTER_ARRIVE) {
      sim.requestScene({
        room: 'kitchen',
        trigger: 'aftermath',
        why: 'Free pizza turned up out of nowhere and everyone crowded into the break room to eat it.',
        priority: 3,
        staleAfter: 30
      });
      this.done = true;
    }
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    const sim = this.sim;
    sim.removeEffect(`${this.key}:boxes`);
    sim.setFact(this.key, null);
    // Never leave the courier behind.
    if (sim.person(COURIER)) sim.removeVisitor(COURIER);
    this.done = true;
  }
}

export const pizzaScript: ChaosScript = {
  id: 'pizza',
  blocked(sim) {
    if (sim.isHazard('kitchen')) return 'The break room is not safe right now.';
    if (sim.person(COURIER)?.present) return 'The pizza is already on its way.';
    return null;
  },
  start(sim) {
    return new PizzaRun(sim);
  }
};
