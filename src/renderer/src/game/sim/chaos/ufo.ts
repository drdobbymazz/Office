// ABDUCTION (person). A saucer glides in and hovers; the beam lifts the person
// up and away while witnesses gasp. Eight seconds later it brings them back,
// dizzy and spooked. If the player snatches them out of the beam, the saucer
// gives up and leaves.

import type { CharId, Tile } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { WORLD_W } from '@/game/core/world';
import { Run, availableIds, isBrave, tween } from './util';

const HOVER = 92;
const RISE_TO = 72;
// Timeline (seconds).
const ARRIVE = 3;
const BEAM = 3.5;
const TAKEN = 6.5;
const GONE = 9;
const RETURN = GONE + 8;
const BACK_OVER = RETURN + 3;
const DOWN = BACK_OVER + 3;
const LEAVE = DOWN + 3;

type Phase = 'arrive' | 'beam' | 'away' | 'return' | 'lower' | 'leave';

class UfoRun extends Run {
  private phase: Phase = 'arrive';
  private x: number;
  private y: number;
  private tile: Tile;
  private witnesses: CharId[] = [];
  private aborted = false;
  private leaveFrom = 0;
  private leaveX = 0;

  constructor(sim: SimApi, private who: CharId) {
    const p = sim.person(who)!;
    super(sim, 'ufo', `${p.name} was abducted`, p.room, { who });
    this.x = p.x;
    this.y = p.y;
    this.tile = p.tile;
    this.effect('saucer', { kind: 'ufo', x: -60, y: this.y, height: HOVER + 30, beam: 0 });
    this.loop('ufoHum', true);
    sim.sfx('whoosh');
    this.pin(who, { anim: isBrave(who) ? 'point' : 'cower', doing: 'staring up at a flying saucer' });
    sim.chaosBark(who, 'ufo');
    sim.feel(who, 'scared', 0.9, 10);
    this.witnesses = sim.peopleNear(p.x, p.y, 130).filter((o) => o.id !== who && o.present && o.isCast).map((o) => o.id);
    this.witnesses.forEach((id, i) => {
      sim.face(id, who);
      sim.react(id, 'startle', 0.8);
      if (i === 0) sim.chaosBark(id, 'ufo');
      else sim.emote(id, 'alert');
      sim.feel(id, 'surprised', 0.9, 6);
    });
    this.focus(this.x, this.y - 40, 140, 130, 5000);
  }

  protected tick(): void {
    const sim = this.sim;
    const t = this.t;
    switch (this.phase) {
      case 'arrive': {
        // Follow them if the player moves them about before the beam comes on.
        const p = sim.person(this.who);
        if (p && p.present && !sim.isAirborne(this.who)) {
          this.x = p.x;
          this.y = p.y;
          this.tile = p.tile;
        }
        this.patch('saucer', { x: tween(t, 0, ARRIVE, -60, this.x), height: tween(t, 0, ARRIVE, HOVER + 30, HOVER) });
        if (t >= ARRIVE) {
          this.phase = 'beam';
          sim.sfx('ufoBeam', this.x);
          this.narrate('start');
          this.fact(true);
          this.seize(this.who, { anim: 'beamUp', doing: 'being beamed up into a flying saucer' });
          for (const id of this.witnesses) {
            if (isBrave(id)) sim.react(id, 'point', 2.5);
            else sim.react(id, 'cower', 2.5);
            sim.feel(id, 'scared', 0.8, 6);
          }
          const second = this.witnesses[1];
          if (second) sim.chaosBark(second, 'ufo');
        }
        break;
      }
      case 'beam': {
        this.patch('saucer', { beam: tween(t, ARRIVE, ARRIVE + 0.5, 0, 1) });
        if (sim.isAirborne(this.who)) {
          // The player snatched them out of the beam: the saucer gives up.
          this.aborted = true;
          this.release(this.who);
          sim.narrate(`The saucer lost its grip on ${this.name(this.who)} and flew off empty.`, { icon: 'ufo', room: this.room ?? undefined });
          this.fact(false);
          this.leave();
          break;
        }
        sim.place(this.who, this.x, this.y, tween(t, BEAM, TAKEN, 0, RISE_TO));
        if (t >= TAKEN) {
          this.phase = 'away';
          this.seize(this.who, { anim: 'beamUp', hidden: true, doing: 'aboard a flying saucer' });
          sim.addStatus(this.who, 'abducted', 60);
          sim.sfx('pop', this.x);
          this.patch('saucer', { beam: 0 });
          this.remember(this.witnesses, 1.5);
        }
        break;
      }
      case 'away':
        this.patch('saucer', { x: tween(t, TAKEN, GONE, this.x, WORLD_W + 70), height: tween(t, TAKEN, GONE, HOVER, HOVER + 40) });
        if (t >= RETURN) {
          this.phase = 'return';
          sim.sfx('whoosh');
        }
        break;
      case 'return':
        this.patch('saucer', { x: tween(t, RETURN, BACK_OVER, WORLD_W + 70, this.x), height: tween(t, RETURN, BACK_OVER, HOVER + 40, HOVER) });
        if (t >= BACK_OVER) {
          this.phase = 'lower';
          this.patch('saucer', { beam: 1 });
          sim.sfx('ufoBeam', this.x);
          // Back on the floor (visible), held in the beam.
          sim.teleport(this.who, this.tile);
          const p = sim.person(this.who);
          if (p) {
            this.x = p.x;
            this.y = p.y;
          }
          this.seize(this.who, { anim: 'beamUp', doing: 'being lowered out of a flying saucer' });
          sim.place(this.who, this.x, this.y, RISE_TO);
          this.focus(this.x, this.y - 40, 140, 130, 4000);
        }
        break;
      case 'lower':
        if (!sim.isAirborne(this.who)) sim.place(this.who, this.x, this.y, tween(t, BACK_OVER, DOWN, RISE_TO, 0));
        if (t >= DOWN) this.setDown();
        break;
      case 'leave':
        this.patch('saucer', { x: tween(t, this.leaveFrom, this.leaveFrom + 3, this.leaveX, WORLD_W + 70), height: tween(t, this.leaveFrom, this.leaveFrom + 3, HOVER, HOVER + 50) });
        if (t >= this.leaveFrom + 3) this.close();
        break;
    }
  }

  private setDown(): void {
    const sim = this.sim;
    this.release(this.who);
    this.patch('saucer', { beam: 0 });
    sim.sfx('pop', this.x);
    sim.fx({ kind: 'sparks', x: this.x, y: this.y - 12 });
    sim.addStatus(this.who, 'dizzy', 8);
    sim.addStatus(this.who, 'spooked', 60);
    sim.addStatus(this.who, 'abducted', 60);
    sim.feel(this.who, 'confused', 1, 10);
    sim.bark(this.who, 'dizzy');
    this.fact(false);
    this.narrate('end');
    this.remember([this.who], 3);
    const others = this.witnesses.filter((id) => id !== this.who);
    sim.requestScene({
      people: [this.who, ...availableIds(sim, others, 2)],
      trigger: 'aftermath',
      why: `${this.name(this.who)} was taken by a flying saucer and has just been brought back.`,
      priority: 6,
      staleAfter: 40
    });
    this.leave();
  }

  private leave(): void {
    this.phase = 'leave';
    this.leaveFrom = this.t;
    this.leaveX = this.x;
    this.patch('saucer', { beam: 0 });
  }

  protected onEnd(): void {
    // Cut short while they were aboard: put them back where they were taken from.
    const p = this.sim.person(this.who);
    if (!this.aborted && this.isHeld(this.who) && (this.phase === 'away' || this.phase === 'return')) {
      if (p) this.sim.teleport(this.who, this.tile);
    }
  }
}

export const ufoScript: ChaosScript = {
  id: 'ufo',
  start(sim, target) {
    return new UfoRun(sim, target.who as CharId);
  }
};
