// LOCKED IN (pair, conference room). Both are called to the conference room;
// once they are in, both ways in jam shut. A scene between the two. A door
// fixer forces it open, or it gives by itself.

import type { CharId, Tile } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { LANDMARKS, TILE, feetOf } from '@/game/core/world';
import { Fixer, Run, availableIds, isNervous, staff } from './util';

const LOCK_BY = 15;
const FIXER_AFTER = 14;
const OPENS_AFTER = 30;
const DOORS: Tile[] = [LANDMARKS.meetingDoor, LANDMARKS.meetingSideDoor];
/** Just outside the main door, where a fixer works on it. */
const OUTSIDE_DOOR: Tile = { x: LANDMARKS.meetingDoor.x, y: LANDMARKS.meetingDoor.y + 1 };

class LockInRun extends Run {
  private lockedAt = -1;
  private openAt = -1;
  private fixer: Fixer | null = null;

  constructor(sim: SimApi, private a: CharId, private b: CharId) {
    super(sim, 'lockIn', `${sim.person(a)?.name ?? 'Someone'} and ${sim.person(b)?.name ?? 'someone'} locked in`, 'meeting', { room: 'meeting', who: a, other: b });
    sim.sfx('paChime');
    const call = (id: CharId, spot: string): void => {
      sim.emote(id, 'question');
      sim.goTo(id, { anchor: spot }, { doing: 'heading to the conference room', stay: 60, stayDoing: 'waiting in the conference room' });
    };
    call(a, 'spot.meet3');
    call(b, 'spot.meet5');
    // Clear anyone else out so only the two get shut in.
    for (const p of staff(sim, 'meeting')) {
      if (p.id !== a && p.id !== b && p.available) sim.goTo(p.id, { room: 'bullpen' }, { doing: 'leaving the conference room', stay: 3 });
    }
    this.focusOn([a, b], 2500, 0.7);
  }

  protected tick(): void {
    const sim = this.sim;
    if (this.lockedAt < 0) {
      const inside = [this.a, this.b].every((id) => sim.person(id)?.room === 'meeting');
      if (inside || this.t >= LOCK_BY) this.lock();
      return;
    }
    if (this.openAt >= 0) {
      if (this.t - this.openAt > 1.5) this.close();
      return;
    }
    this.fixer?.update(this.t - this.lockedAt);
    if (this.t - this.lockedAt >= OPENS_AFTER) this.open(null);
  }

  private lock(): void {
    const sim = this.sim;
    this.lockedAt = this.t;
    DOORS.forEach((d, i) => this.effect(`door${i}`, { kind: 'barrier', x: d.x * TILE, y: d.y * TILE, w: TILE, h: TILE }));
    this.block('doors', DOORS);
    const door = feetOf(LANDMARKS.meetingDoor);
    sim.sfx('doorClose', door.x);
    sim.shake(0.15, 150);
    this.narrate('start');
    this.fact(true);
    for (const id of [this.a, this.b]) {
      sim.chaosBark(id, 'lockIn');
      sim.feel(id, isNervous(id) ? 'scared' : 'surprised', 0.8, 8);
      if (isNervous(id)) sim.react(id, 'panic', 1.5);
    }
    sim.requestScene({
      people: [this.a, this.b],
      room: 'meeting',
      trigger: 'event',
      why: `${this.name(this.a)} and ${this.name(this.b)} are locked in the conference room together and the doors will not open.`,
      priority: 8,
      minLines: 4,
      staleAfter: 25
    });
    this.focusOn([this.a, this.b], 4000);
    this.fixer = new Fixer(sim, {
      skill: 'door',
      near: () => feetOf(OUTSIDE_DOOR),
      firstAt: FIXER_AFTER,
      chaos: 'lockIn',
      task: { at: { tile: OUTSIDE_DOOR }, seconds: 4, anim: 'operate', prop: 'wrench', style: 'run', doing: 'forcing the jammed door', walkDoing: 'going to force the conference room door' },
      onDone: (who) => this.open(who)
    });
  }

  private open(by: CharId | null): void {
    if (this.openAt >= 0) return;
    const sim = this.sim;
    this.openAt = this.t;
    this.unEffect('door0');
    this.unEffect('door1');
    this.block('doors', null);
    sim.sfx('doorOpen', feetOf(LANDMARKS.meetingDoor).x);
    this.fact(false);
    this.narrate('end');
    this.remember([this.a, this.b], 2);
    const people = availableIds(sim, [this.a, this.b, ...(by ? [by] : [])], 3);
    if (by) {
      sim.emote(by, 'star');
      sim.remember([by], `I forced open the jammed conference room door and let ${this.name(this.a)} and ${this.name(this.b)} out.`, 1.5);
    }
    sim.requestScene({
      people: people.length ? people : undefined,
      room: 'meeting',
      trigger: 'aftermath',
      why: this.line('aftermath'),
      priority: 5,
      staleAfter: 30
    });
  }

  protected onEnd(): void {
    this.fixer?.cancel();
    // Nobody stays standing in the conference room waiting for a door that is open.
    for (const id of [this.a, this.b]) {
      const p = this.sim.person(id);
      if (p && p.available && p.doing === 'waiting in the conference room') this.sim.resume(id);
    }
  }
}

export const lockInScript: ChaosScript = {
  id: 'lockIn',
  start(sim, target) {
    return new LockInRun(sim, target.who as CharId, target.other as CharId);
  }
};
