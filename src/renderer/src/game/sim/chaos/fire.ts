// FIRE (room target). A reference script: flames start somewhere sensible,
// smoke builds, the alarm sounds, people in the room shout and run out, the
// nearest fire fixer runs over with an extinguisher and puts it out, and if
// nobody manages it the sprinklers do. A scorch mark stays for the day.

import type { CharId, RoomId, TargetRoomId, Tile } from '@/game/core/types';
import { CHAOS } from '@/game/core/chaos';
import { LANDMARKS, deskOf, feetOf, isWalkable, room as roomDef, walkableTilesIn } from '@/game/core/world';
import type { ChaosRun, ChaosScript, SimApi } from '@/game/core/simApi';

/** Seconds after the start before the sprinklers come on if the fire is still burning. */
const SPRINKLERS_AT = 24;
const FIXER_AT = 2.5;
const SMOKE_FADE = 6;
const MAX_FIXER_TRIES = 3;

/** Something flammable to set alight in each room. */
function hotSpots(room: TargetRoomId): Tile[] {
  switch (room) {
    case 'kitchen': return [LANDMARKS.coffeeMachine, { x: 27, y: 18 }, LANDMARKS.vendingMachine];
    case 'boss': return [deskOf('michael').tile, { x: 2, y: 3 }];
    case 'meeting': return [LANDMARKS.conferenceTable, { x: 11, y: 5 }];
    case 'annex': return [deskOf('kevin').tile, deskOf('toby').tile];
    case 'accounts': return [deskOf('angela').tile, deskOf('oscar').tile];
    case 'bullpen': return [deskOf('stanley').tile, deskOf('phyllis').tile, deskOf('ryan').tile, { x: 12, y: 16 }];
  }
}

/** A floor tile in the room next to something that can burn, that can be blocked without cutting anyone off. */
function pickSpot(sim: SimApi, room: TargetRoomId): Tile | null {
  const tiles = walkableTilesIn(room);
  const targets = hotSpots(room);
  const byDistance = [...tiles]
    .map((t) => {
      let d = Infinity;
      for (const h of targets) d = Math.min(d, Math.abs(t.x - h.x) + Math.abs(t.y - h.y));
      // Prefer floor that backs onto furniture or a wall.
      const backed = !isWalkable(t.x, t.y - 1) || !isWalkable(t.x - 1, t.y) || !isWalkable(t.x + 1, t.y);
      return { t, s: d + (backed ? 0 : 2) + sim.rng() * 1.5 };
    })
    .sort((a, b) => a.s - b.s);
  for (const { t } of byDistance.slice(0, 30)) {
    if (sim.canBlock([t])) return t;
  }
  return null;
}

let fireCount = 0;

class FireRun implements ChaosRun {
  readonly label: string;
  readonly room: RoomId;
  done = false;

  private t = 0;
  private readonly key: string;
  private readonly spot: Tile;
  private readonly x: number;
  private readonly y: number;
  private size = 0.25;
  private smoke = 0.1;
  private blocked: Tile[];
  private fixer: CharId | null = null;
  private fixerTries = 0;
  private nextFixerAt = FIXER_AT;
  private sprinklers = false;
  private outAt = -1;
  private outBy: 'fixer' | 'sprinklers' | null = null;
  private alarm = false;
  private ended = false;
  private fled = new Set<CharId>();

  constructor(private sim: SimApi, private target: TargetRoomId, spot: Tile) {
    const n = ++fireCount;
    this.key = `fire:${n}`;
    this.spot = spot;
    const f = feetOf(spot);
    this.x = f.x;
    this.y = f.y - 4;
    this.room = target;
    this.label = `Fire in ${roomDef(target).name}`;
    this.blocked = [spot];

    sim.addEffect({ id: `${this.key}:flames`, kind: 'fire', x: this.x, y: this.y, size: this.size });
    sim.addEffect({ id: `${this.key}:smoke`, kind: 'smoke', room: target, density: this.smoke });
    sim.setBlocked(this.key, this.blocked);
    sim.setHazard(this.key, target);
    sim.setFact(this.key, `${capital(roomDef(target).name)} is on fire.`);
    sim.loop('fire', true);
    sim.sfx('explosion', this.x);
    sim.fx({ kind: 'explosion', x: this.x, y: this.y, size: 0.4 });
    sim.shake(0.2, 200);
    sim.bus.emit('focus', { x: this.x - 48, y: this.y - 48, w: 96, h: 80, weight: 1, holdMs: 3000 });
    this.panic(true);
  }

  /** The alarm reaches the whole floor: everyone else looks up, and one or two say it out loud. */
  private alarmHeard(): void {
    const sim = this.sim;
    let barks = 2;
    for (const p of sim.people()) {
      if (!p.present || !p.isCast || p.room === this.target || this.fled.has(p.id) || p.id === this.fixer) continue;
      sim.react(p.id, 'startle', 0.8);
      if (barks > 0 && p.available && !p.speaking && sim.rng() < 0.3) {
        sim.chaosBark(p.id, 'fire');
        barks--;
      } else {
        sim.emote(p.id, 'alert');
      }
      sim.feel(p.id, 'surprised', 0.7, 6);
    }
  }

  /** Everyone in the room reacts and runs out. */
  private panic(first: boolean): void {
    const sim = this.sim;
    let barked = 0;
    for (const p of sim.peopleIn(this.target)) {
      if (this.fled.has(p.id) || p.id === this.fixer || !p.available) continue;
      this.fled.add(p.id);
      if (first && barked < 2 && sim.rng() < 0.8) {
        sim.chaosBark(p.id, 'fire');
        barked++;
      } else {
        sim.emote(p.id, 'alert');
      }
      sim.feel(p.id, 'scared', 0.9, 8);
      sim.fleeFrom(p.id, this.target, { doing: 'running from the fire', stay: 12 });
    }
  }

  update(dt: number): void {
    if (this.done) return;
    const sim = this.sim;
    this.t += dt;

    if (this.outAt < 0) {
      // Burning: grow, smoke builds.
      const growing = !this.sprinklers && !this.fixerSpraying();
      if (growing) this.size = Math.min(1, this.size + dt * 0.07);
      this.smoke = Math.min(0.75, this.smoke + dt * 0.04);
      if (!this.alarm && this.t > 1.5) {
        this.alarm = true;
        sim.addEffect({ id: `${this.key}:alarm`, kind: 'alarm' });
        sim.loop('alarm', true);
        this.alarmHeard();
      }
      if (this.size > 0.6 && this.blocked.length === 1) this.spread();
      // Anyone who wanders in (or was busy when it started) gets out.
      if (Math.floor(this.t) !== Math.floor(this.t - dt)) this.panic(false);

      this.updateFixer(dt);

      if (!this.sprinklers && this.t >= SPRINKLERS_AT) this.startSprinklers();
      if (this.sprinklers) this.size = Math.max(0, this.size - dt / 6);
      if (this.size <= 0.02) this.putOut(this.sprinklers && !this.fixerSpraying() ? 'sprinklers' : 'fixer');
      sim.patchEffect(`${this.key}:flames`, { size: Math.max(0.05, this.size) });
    } else {
      // Out: the smoke clears.
      const k = (this.t - this.outAt) / SMOKE_FADE;
      sim.patchEffect(`${this.key}:smoke`, { density: Math.max(0, this.smoke * (1 - k)) });
      if (this.alarm && this.t - this.outAt > 1.5) {
        this.alarm = false;
        sim.removeEffect(`${this.key}:alarm`);
        sim.loop('alarm', false);
      }
      if (this.sprinklers && this.t - this.outAt > 3) {
        this.sprinklers = false;
        sim.removeEffect(`${this.key}:sprinklers`);
        sim.loop('sprinkler', false);
      }
      if (k >= 1) this.done = true;
    }
    if (this.outAt < 0) sim.patchEffect(`${this.key}:smoke`, { density: this.smoke });
  }

  private spread(): void {
    const neighbours: Tile[] = [
      { x: this.spot.x + 1, y: this.spot.y }, { x: this.spot.x - 1, y: this.spot.y },
      { x: this.spot.x, y: this.spot.y - 1 }, { x: this.spot.x, y: this.spot.y + 1 }
    ].filter((t) => isWalkable(t.x, t.y));
    for (const n of neighbours) {
      if (this.blocked.length >= 2) break;
      const next = [...this.blocked, n];
      this.sim.setBlocked(this.key, null);
      const ok = this.sim.canBlock(next);
      this.sim.setBlocked(this.key, ok ? next : this.blocked);
      if (ok) this.blocked = next;
    }
  }

  private fixerSpraying(): boolean {
    if (!this.fixer) return false;
    const p = this.sim.person(this.fixer);
    if (!p || !p.present) return false;
    // The task's `doing` switches from walkDoing to doing when they start spraying.
    return p.doing === 'putting out the fire' && Math.hypot(p.x - this.x, p.y - this.y) < 40;
  }

  private updateFixer(dt: number): void {
    const sim = this.sim;
    if (this.fixer) {
      if (this.fixerSpraying()) {
        this.size = Math.max(0, this.size - dt * 0.22);
        if (sim.rng() < dt * 3) sim.fx({ kind: 'burst', what: 'bubbles', x: this.x, y: this.y, count: 4 });
      }
      return;
    }
    if (this.sprinklers || this.t < this.nextFixerAt || this.fixerTries >= MAX_FIXER_TRIES) return;
    this.fixerTries++;
    const who = sim.findFixer('fire', { x: this.x, y: this.y });
    if (!who) {
      this.nextFixerAt = this.t + 3;
      return;
    }
    this.fixer = who;
    sim.chaosBark(who, 'fire');
    sim.feel(who, 'determined', 0.9, 12);
    sim.assign(who, {
      at: { tile: this.spot },
      seconds: 30,
      anim: 'extinguish',
      prop: 'extinguisher',
      style: 'run',
      doing: 'putting out the fire',
      walkDoing: 'running to put out the fire'
    }, () => {
      // Finished spraying (normally the fire is out well before this).
      if (this.fixer === who && this.outAt < 0) this.size = 0;
    }, () => {
      // Picked up, sent off, gone: someone else will have to try.
      if (this.fixer === who) {
        this.fixer = null;
        this.nextFixerAt = this.t + 2;
      }
    });
  }

  private startSprinklers(): void {
    const sim = this.sim;
    this.sprinklers = true;
    sim.addEffect({ id: `${this.key}:sprinklers`, kind: 'sprinklers', room: this.target });
    sim.loop('sprinkler', true);
    sim.narrate(`The sprinklers came on in ${roomDef(this.target).name}.`, { icon: 'fire', room: this.target });
    for (const p of sim.peopleIn(this.target)) {
      sim.addStatus(p.id, 'wet', 90);
      sim.bark(p.id, 'wet');
    }
  }

  private putOut(by: 'fixer' | 'sprinklers'): void {
    const sim = this.sim;
    this.outAt = this.t;
    this.outBy = by;
    this.size = 0;
    sim.removeEffect(`${this.key}:flames`);
    sim.setBlocked(this.key, null);
    sim.setHazard(this.key, null);
    sim.setFact(this.key, null);
    sim.loop('fire', false);
    sim.sfx('sizzle', this.x);
    sim.fx({ kind: 'poof', x: this.x, y: this.y, color: 0x555555 });
    // The scorch mark stays until tomorrow (not removed in end()).
    sim.addEffect({ id: `${this.key}:scorch`, kind: 'item', item: 'scorch', x: this.x, y: this.y + 4 });
    const roomName = roomDef(this.target).name;
    const fixer = by === 'fixer' && this.fixer ? sim.person(this.fixer) : undefined;
    if (fixer) {
      sim.addStatus(fixer.id, 'sooty', 120);
      sim.feel(fixer.id, 'proud', 0.85, 10);
      sim.emote(fixer.id, 'star');
      sim.narrate(`${fixer.name} put out the fire in ${roomName}.`, { icon: 'fire', room: this.target });
      sim.remember([fixer.id], `I put out a fire in ${roomName} with an extinguisher.`, 2);
      sim.remember('all', `There was a fire in ${roomName}. ${fixer.name} put it out.`, 1.5);
      sim.bumpMood(fixer.id, 0.15);
    } else {
      sim.narrate(`The sprinklers put out the fire in ${roomName} and soaked the room.`, { icon: 'fire', room: this.target });
      sim.remember('all', `There was a fire in ${roomName}. Nobody put it out; the sprinklers did.`, 1.5);
    }
    // Anyone close enough gets a coating of soot.
    for (const p of sim.peopleNear(this.x, this.y, 40)) if (p.id !== this.fixer) sim.addStatus(p.id, 'sooty', 60);
    const witnesses = [...this.fled].filter((id) => sim.person(id)?.available);
    const people = fixer ? [fixer.id, ...witnesses.slice(0, 1)] : witnesses.slice(0, 2);
    sim.requestScene({
      people: people.length ? people : undefined,
      room: this.target,
      trigger: 'aftermath',
      why: fixer ? `${fixer.name} just put out a fire in ${roomName}.` : `A fire in ${roomName} was put out by the sprinklers, and everyone near it got soaked.`,
      priority: 6,
      staleAfter: 40
    });
    if (fixer) {
      sim.resume(fixer.id);
      sim.setProp(fixer.id, null);
    }
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    const sim = this.sim;
    sim.removeEffect(`${this.key}:flames`);
    sim.removeEffect(`${this.key}:smoke`);
    sim.removeEffect(`${this.key}:alarm`);
    sim.removeEffect(`${this.key}:sprinklers`);
    sim.setBlocked(this.key, null);
    sim.setHazard(this.key, null);
    sim.setFact(this.key, null);
    sim.loop('fire', false);
    sim.loop('alarm', false);
    sim.loop('sprinkler', false);
    if (this.fixer && this.outAt < 0) {
      sim.resume(this.fixer);
      sim.setProp(this.fixer, null);
    }
    this.done = true;
    void this.outBy;
  }
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const fireScript: ChaosScript = {
  id: 'fire',
  blocked(sim, target) {
    if (!target.room) return 'Pick a room first.';
    if (!pickSpot(sim, target.room)) return 'There is nowhere in that room that could catch fire.';
    return null;
  },
  start(sim, target) {
    const room = target.room as TargetRoomId;
    const spot = pickSpot(sim, room) ?? walkableTilesIn(room)[0];
    return new FireRun(sim, room, spot);
  }
};

export const FIRE_DURATION_HINT = CHAOS.fire.duration;
