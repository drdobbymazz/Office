// HAUNTING (room). The room dims, a ghost drifts in through one wall, wanders,
// says boo to one person, and leaves through the other wall. The brave stare it
// down; the rest cower or flee.

import type { CharId, TargetRoomId, Vec } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { feetOf, room as roomDef, roomRectPx } from '@/game/core/world';
import { Run, availableIds, isBrave, isNervous, nearestTo, randomTileIn, reactAll, staff, tween } from './util';

const BOO_AT = 8;
const BOO_FOR = 1.6;

class GhostRun extends Run {
  private path: Vec[] = [];
  private seg = 0;
  private speed = 16;
  private x: number;
  private y: number;
  private booed = false;
  private booUntil = -1;
  private leaving = -1;
  private witnesses = new Set<CharId>();

  constructor(sim: SimApi, private target: TargetRoomId) {
    super(sim, 'ghost', `Ghost in ${roomDef(target).name}`, target, { room: target });
    const r = roomRectPx(target);
    const midY = r.y + r.h * 0.6;
    const fromLeft = sim.rng() < 0.5;
    const edgeA = { x: fromLeft ? r.x - 6 : r.x + r.w + 6, y: midY };
    const edgeB = { x: fromLeft ? r.x + r.w + 6 : r.x - 6, y: midY - 8 };
    const mids = [0, 1, 2].map(() => feetOf(randomTileIn(sim, target))).sort((a, b) => (fromLeft ? a.x - b.x : b.x - a.x));
    this.path = [edgeA, ...mids.map((m) => ({ x: m.x, y: m.y - 4 })), edgeB];
    this.x = edgeA.x;
    this.y = edgeA.y;
    let len = 0;
    for (let i = 1; i < this.path.length; i++) len += Math.hypot(this.path[i].x - this.path[i - 1].x, this.path[i].y - this.path[i - 1].y);
    // Cross any room in about 16 s of drifting.
    this.speed = Math.max(12, len / 16);
    this.effect('ghost', { kind: 'ghost', x: this.x, y: this.y, facing: fromLeft ? 'right' : 'left', alpha: 0, mood: 'drift' });
    this.effect('dim', { kind: 'dark', rooms: [target], level: 0.35, emergency: false });
    this.loop('ghostAir', true);
    sim.sfx('ghostWail', this.x);
    this.narrate('start');
    this.fact(true);
    this.focusRoom(target, 4000);
    this.at(1.2, () => this.scare());
  }

  private scare(): void {
    const sim = this.sim;
    const here = staff(sim, this.target).map((p) => p.id);
    here.forEach((id) => this.witnesses.add(id));
    reactAll(this.sim, here, 'ghost', {
      bold: (id) => {
        sim.face(id, { x: this.x, y: this.y });
        sim.react(id, 'point', 2);
        sim.feel(id, 'suspicious', 0.8, 10);
      },
      scared: (id) => {
        sim.addStatus(id, 'spooked', 60);
        sim.feel(id, 'scared', 1, 10);
        sim.fleeFrom(id, this.target, { doing: 'running from a ghost', stay: 12, style: 'panic' });
      },
      middling: (id) => {
        sim.addStatus(id, 'spooked', 60);
        sim.feel(id, 'scared', 0.7, 8);
        sim.react(id, 'cower', 3);
      }
    });
  }

  protected tick(dt: number): void {
    const sim = this.sim;
    const ghostAlpha = this.leaving >= 0 ? tween(this.t, this.leaving, this.leaving + 1.5, 0.85, 0) : Math.min(0.85, this.t / 1.2);
    if (this.leaving >= 0 && this.t - this.leaving >= 1.5) {
      this.finish();
      return;
    }
    if (this.booUntil > this.t) {
      this.patch('ghost', { alpha: ghostAlpha });
      return;
    }
    if (this.booUntil > 0) {
      this.booUntil = 0;
      this.patch('ghost', { mood: 'drift' });
    }
    if (!this.booed && this.t >= BOO_AT) {
      this.boo();
      return;
    }
    const goal = this.path[this.seg + 1];
    if (goal) {
      const dx = goal.x - this.x;
      const dy = goal.y - this.y;
      const d = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (d <= step) {
        this.x = goal.x;
        this.y = goal.y;
        this.seg++;
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step + Math.sin(this.t * 2) * 0.15;
      }
      if (Math.abs(dx) > 1) this.patch('ghost', { facing: dx > 0 ? 'right' : 'left' });
    } else if (this.leaving < 0) {
      this.leaving = this.t;
    }
    this.patch('ghost', { x: this.x, y: this.y, alpha: ghostAlpha });
    // Late arrivals in the room see it too.
    if (Math.floor(this.t) !== Math.floor(this.t - dt)) {
      for (const p of staff(sim, this.target)) {
        if (this.witnesses.has(p.id) || !p.available) continue;
        this.witnesses.add(p.id);
        sim.emote(p.id, 'alert');
        sim.addStatus(p.id, 'spooked', 40);
        if (isNervous(p.id)) sim.fleeFrom(p.id, this.target, { doing: 'running from a ghost', stay: 10 });
      }
    }
    // A hard stop, whatever happened on the way.
    if (this.t >= 21 && this.leaving < 0) this.leaving = this.t;
  }

  private boo(): void {
    const sim = this.sim;
    this.booed = true;
    const victim = nearestTo(sim, this.x, this.y + 10);
    if (!victim || victim.room !== this.target) return;
    this.booUntil = this.t + BOO_FOR;
    this.patch('ghost', { mood: 'boo', facing: victim.x > this.x ? 'right' : 'left' });
    sim.sfx('ghostWail', this.x);
    sim.react(victim.id, 'startle', 1);
    sim.addStatus(victim.id, 'spooked', 60);
    sim.feel(victim.id, 'scared', 1, 10);
    sim.bark(victim.id, 'scared');
    this.witnesses.add(victim.id);
    if (!isBrave(victim.id)) this.after(1, () => sim.fleeFrom(victim.id, this.target, { doing: 'running from a ghost', stay: 12, style: 'panic' }));
    this.focus(this.x, this.y, 110, 90, 2500);
  }

  private finish(): void {
    const sim = this.sim;
    this.unEffect('ghost');
    this.unEffect('dim');
    this.loop('ghostAir', false);
    this.fact(false);
    this.narrate('end');
    const witnesses = [...this.witnesses];
    this.remember(witnesses, 2);
    const people = availableIds(sim, witnesses, 3);
    sim.requestScene({
      people: people.length ? people : undefined,
      room: this.target,
      trigger: 'aftermath',
      why: this.line('aftermath'),
      priority: 5,
      staleAfter: 40
    });
    this.close();
  }
}

export const ghostScript: ChaosScript = {
  id: 'ghost',
  start(sim, target) {
    return new GhostRun(sim, target.room as TargetRoomId);
  }
};
