// BEES (room). A swarm pours out of the vent and drifts after the nearest
// person. People panic and run; one or two get stung. A pest fixer lures the
// swarm out of the front door (it follows them). Otherwise it drifts back out
// of the vent.

import type { CharId, TargetRoomId, Vec } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { anchor, feetOf, room as roomDef, roomRectPx } from '@/game/core/world';
import { Fixer, Run, availableIds, nearestTo, reactAll, staff } from './util';

const CHASE = 32;
const LEAD = 70;
const MAX_STINGS = 2;
const GIVE_UP = 16;

class BeesRun extends Run {
  private x: number;
  private y: number;
  private vent: Vec;
  private door: Vec;
  private stings: CharId[] = [];
  private nextSting = 2;
  private fixer: Fixer;
  private leader: CharId | null = null;
  private leaving: 'door' | 'vent' | null = null;
  private goneAt = -1;
  private seen = new Set<CharId>();

  constructor(sim: SimApi, private target: TargetRoomId) {
    super(sim, 'bees', `Bees in ${roomDef(target).name}`, target, { room: target });
    const r = roomRectPx(target);
    this.vent = { x: r.x + r.w / 2, y: r.y + 10 };
    this.door = feetOf(anchor('exit.door').tile);
    this.x = this.vent.x;
    this.y = this.vent.y;
    this.effect('swarm', { kind: 'bees', x: this.x, y: this.y, spread: 6, count: 18 });
    this.loop('bees', true);
    this.hazard(target);
    this.narrate('start');
    this.fact(true);
    this.focus(this.x, this.y + 30, 140, 100);
    const here = staff(sim, target).map((p) => p.id);
    here.forEach((id) => this.seen.add(id));
    reactAll(sim, here, 'bees', {
      bold: (id) => {
        sim.react(id, 'shake', 2);
        sim.feel(id, 'determined', 0.7, 6);
      },
      scared: (id) => {
        sim.feel(id, 'scared', 1, 8);
        sim.fleeFrom(id, target, { doing: 'running from the bees', stay: 12, style: 'panic' });
      },
      middling: (id) => {
        sim.feel(id, 'scared', 0.8, 6);
        sim.fleeFrom(id, target, { doing: 'running from the bees', stay: 10 });
      }
    });
    this.fixer = new Fixer(sim, {
      skill: 'pest',
      near: () => ({ x: this.x, y: this.y }),
      firstAt: 4,
      chaos: 'bees',
      task: { at: { room: target }, seconds: 1.5, anim: 'wave', style: 'run', doing: 'luring the bees away', walkDoing: 'running in to deal with the bees' },
      onDone: (who) => this.lead(who)
    });
  }

  protected tick(dt: number): void {
    const sim = this.sim;
    if (this.goneAt >= 0) {
      if (this.t - this.goneAt > 1.5) this.close();
      return;
    }
    let goal: Vec | null = null;
    let speed = CHASE;
    if (this.leaving === 'vent') {
      goal = this.vent;
      speed = LEAD;
    } else if (this.leader) {
      const p = sim.person(this.leader);
      if (p && p.present) goal = { x: p.x, y: p.y - 22 };
      speed = LEAD;
      if (Math.hypot(this.x - this.door.x, this.y - this.door.y) < 24 || (p && p.room === 'outside')) {
        this.gone('door');
        return;
      }
      if (!p || !p.present) this.leaving = 'vent';
    } else {
      const victim = nearestTo(sim, this.x, this.y);
      if (victim && victim.room === this.target) goal = { x: victim.x, y: victim.y - 20 };
      else goal = this.vent;
      if (victim && this.t >= this.nextSting && this.stings.length < MAX_STINGS && Math.hypot(victim.x - this.x, victim.y - 20 - this.y) < 14 && !this.stings.includes(victim.id)) this.sting(victim.id);
    }
    if (goal) {
      const dx = goal.x - this.x;
      const dy = goal.y - this.y;
      const d = Math.hypot(dx, dy);
      const step = speed * dt;
      if (d > step) {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
      } else {
        this.x = goal.x;
        this.y = goal.y;
        if (this.leaving === 'vent') {
          this.gone('vent');
          return;
        }
      }
    }
    this.patch('swarm', { x: this.x, y: this.y + Math.sin(this.t * 5) * 2, spread: 6 + Math.sin(this.t * 1.3) * 2 });
    if (!this.leader) this.fixer.update(this.t);
    // Newcomers to the room run straight back out.
    for (const p of staff(sim, this.target)) {
      if (this.seen.has(p.id) || !p.available) continue;
      this.seen.add(p.id);
      sim.emote(p.id, 'alert');
      sim.fleeFrom(p.id, this.target, { doing: 'running from the bees', stay: 8 });
    }
    if (this.t >= GIVE_UP && !this.leader && !this.leaving) this.leaving = 'vent';
    if (this.t >= GIVE_UP + 4 && this.leaving !== 'vent') this.leaving = 'vent';
  }

  private sting(id: CharId): void {
    const sim = this.sim;
    this.stings.push(id);
    this.nextSting = this.t + 3;
    sim.addStatus(id, 'stung', 90);
    sim.react(id, 'startle', 0.8);
    sim.bark(id, 'hurt');
    sim.feel(id, 'angry', 0.8, 8);
    sim.bumpMood(id, -0.1);
    this.after(0.9, () => sim.fleeFrom(id, this.target, { doing: 'running from the bees, stung', stay: 12, style: 'panic' }));
  }

  private lead(who: CharId): void {
    const sim = this.sim;
    this.leader = who;
    sim.say(who, 'Follow me, bees. Nice and slow.', { quiet: true });
    sim.goTo(who, { anchor: 'exit.door' }, { style: 'walk', doing: 'leading the bees out of the building', stay: 4, braveHazard: true });
    this.focusOn([who], 4000, 0.8);
  }

  private gone(how: 'door' | 'vent'): void {
    const sim = this.sim;
    this.goneAt = this.t;
    this.unEffect('swarm');
    this.loop('bees', false);
    this.hazard(null);
    this.fact(false);
    this.narrate('end');
    const witnesses = [...this.seen];
    this.remember(witnesses, 1.5);
    if (how === 'door' && this.leader) {
      sim.emote(this.leader, 'star');
      sim.feel(this.leader, 'proud', 0.8, 8);
      sim.remember([this.leader], 'I led a swarm of bees out of the office without a single sting.', 2);
      if (sim.person(this.leader)?.present) sim.resume(this.leader);
    }
    const people = availableIds(sim, [...this.stings, ...witnesses], 3);
    sim.requestScene({
      people: people.length ? people : undefined,
      room: this.target,
      trigger: 'aftermath',
      why: this.leader && how === 'door' ? `${this.name(this.leader)} just led a swarm of bees out of ${roomDef(this.target).name}.` : this.line('aftermath'),
      priority: 5,
      staleAfter: 40
    });
  }

  protected onEnd(): void {
    this.fixer.cancel();
  }
}

export const beesScript: ChaosScript = {
  id: 'bees',
  start(sim, target) {
    return new BeesRun(sim, target.room as TargetRoomId);
  }
};
