// Physical execution of player whispers and direct orders ("kill jim", "drag michael to
// the conference room", "smash the fax machine", "quit"). Turns structured DirectiveResults
// into real sim movement, physics, grabs, scuffles, chaos, statuses, and aftermath scenes.

import type { CustomPower, DirectiveResult, DirectiveVerb } from '@/game/brain/api';
import { CUSTOM_POWERS } from '@/game/brain/api';
import type { ChaosId, CharId, HeldProp, TargetRoomId, Tile } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import type { DirectorSimApi, SceneAsk, SimPerson } from '@/game/core/simApi';
import { feetOf, room as roomDef, roomCentrePx, walkableTilesIn } from '@/game/core/world';

export interface DirectivesContext {
  sim: DirectorSimApi;
  scene: (ask: SceneAsk, fromPlayer: boolean) => void;
}

interface ActiveDirective {
  id: string;
  actor: CharId;
  target: CharId | null;
  room: TargetRoomId | null;
  verb: DirectiveVerb;
  rawText: string;
  item: string;
  power: CustomPower;
  phase: 'approach' | 'scuffle' | 'haul' | 'chase' | 'follow';
  timer: number;
  repathAt: number;
  burstAt: number;
  alertedTarget: boolean;
  scuffleId?: string;
  destTile?: Tile;
  destRoom?: TargetRoomId;
  lockAfter?: boolean;
}

interface ScheduledTimer {
  at: number;
  fn: () => void;
}

function propFromItem(item: string): HeldProp {
  const s = item.toLowerCase();
  if (/coffee|mug/.test(s)) return 'coffee';
  if (/phone/.test(s)) return 'phone';
  if (/cash|money|wallet/.test(s)) return 'cash';
  if (/donut/.test(s)) return 'donut';
  if (/cake/.test(s)) return 'cake';
  if (/pizza/.test(s)) return 'pizza';
  if (/trophy/.test(s)) return 'trophy';
  if (/wrench/.test(s)) return 'wrench';
  if (/mop|broom/.test(s)) return 'mop';
  if (/extinguisher/.test(s)) return 'extinguisher';
  if (/box/.test(s)) return 'box';
  return 'papers';
}

function powerToChaos(power: CustomPower, rawText: string): ChaosId {
  if (power !== 'none' && (CUSTOM_POWERS as readonly string[]).includes(power)) {
    return power as ChaosId;
  }
  const low = rawText.toLowerCase();
  if (/alarm|drill/.test(low)) return 'fireDrill';
  if (/lock|barricade|trap/.test(low)) return 'lockIn';
  if (/flood|sprinkler|water/.test(low)) return 'flood';
  if (/wifi|internet/.test(low)) return 'wifiDown';
  if (/blackout|power|dark/.test(low)) return 'blackout';
  if (/bee|wasp/.test(low)) return 'bees';
  if (/pizza/.test(low)) return 'pizza';
  if (/disco|dance|party/.test(low)) return 'disco';
  if (/sleep|nap/.test(low)) return 'sleep';
  if (/ghost/.test(low)) return 'ghost';
  if (/ufo|alien/.test(low)) return 'ufo';
  return 'fire';
}

function pickDropTile(roomId: TargetRoomId): Tile {
  const tiles = walkableTilesIn(roomId);
  if (!tiles.length) return { x: 12, y: 15 };
  const center = roomCentrePx(roomId);
  let best = tiles[0];
  let bestDist = Infinity;
  for (const t of tiles) {
    const f = feetOf(t);
    const d = Math.hypot(f.x - center.x, f.y - center.y);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function safeRoom(roomId: string | null | undefined): TargetRoomId {
  if (roomId === 'boss' || roomId === 'meeting' || roomId === 'annex' || roomId === 'accounts' || roomId === 'bullpen' || roomId === 'kitchen') {
    return roomId;
  }
  return 'bullpen';
}

export class Directives {
  private active = new Map<CharId, ActiveDirective>();
  private timers: ScheduledTimer[] = [];
  private fxIds: string[] = [];
  private seq = 0;
  private gen = 0;

  constructor(private ctx: DirectivesContext) {}

  clear(): void {
    this.gen += 1;
    const sim = this.ctx.sim;
    for (const d of this.active.values()) {
      sim.release(d.actor, d.id);
      if (d.target) sim.release(d.target, d.id);
      if (d.scuffleId) sim.removeEffect(d.scuffleId);
    }
    this.active.clear();
    this.timers.length = 0;
    for (const id of this.fxIds) sim.removeEffect(id);
    this.fxIds.length = 0;
  }

  private cancelActor(who: CharId): void {
    const prev = this.active.get(who);
    if (!prev) return;
    const sim = this.ctx.sim;
    sim.release(prev.actor, prev.id);
    if (prev.target) sim.release(prev.target, prev.id);
    if (prev.scuffleId) sim.removeEffect(prev.scuffleId);
    this.active.delete(who);
  }

  private trackFx(id: string): void {
    if (!this.fxIds.includes(id)) this.fxIds.push(id);
  }

  private schedule(delaySec: number, fn: () => void): void {
    this.timers.push({ at: this.ctx.sim.time + delaySec, fn });
  }

  private isAliveAndPresent(p: SimPerson | undefined): p is SimPerson {
    return !!p && p.present && !this.ctx.sim.hasStatus(p.id, 'eliminated') && !this.ctx.sim.hasStatus(p.id, 'quit');
  }

  start(actor: CharId, res: DirectiveResult, rawText: string, _kind: 'whisper' | 'cue'): boolean {
    if (res.verb === 'social') return false;
    const sim = this.ctx.sim;
    const a = sim.person(actor);
    if (!this.isAliveAndPresent(a)) return false;

    this.cancelActor(actor);
    const id = `dir-${++this.seq}`;
    const gen = this.gen;

    // Resolve default target if an inherently interpersonal verb omitted a target name.
    let targetId = res.targetPerson;
    const needsPerson = res.verb === 'eliminate' || res.verb === 'knockout' || res.verb === 'shove' || res.verb === 'drag' || res.verb === 'steal' || res.verb === 'romance' || res.verb === 'chase' || res.verb === 'follow';
    if (!targetId && needsPerson) {
      const nearest = sim
        .peopleNear(a.x, a.y, 1200)
        .filter((p) => p.id !== actor && p.isCast && this.isAliveAndPresent(p))
        .sort((x, y) => Math.hypot(x.x - a.x, x.y - a.y) - Math.hypot(y.x - a.x, y.y - a.y))[0];
      targetId = nearest?.id ?? null;
    }

    const t = targetId ? sim.person(targetId) : undefined;
    if (needsPerson && !this.isAliveAndPresent(t)) return false;

    switch (res.verb) {
      case 'eliminate':
      case 'knockout':
      case 'shove':
      case 'drag':
      case 'steal':
      case 'romance':
      case 'chase':
      case 'follow': {
        if (!t) return false;
        const destRoom = res.verb === 'drag'
          ? (res.targetRoom ?? (t.room === 'meeting' ? 'bullpen' : 'meeting'))
          : res.targetRoom;
        const phase = res.verb === 'chase' ? 'chase' : res.verb === 'follow' ? 'follow' : 'approach';
        const d: ActiveDirective = {
          id,
          actor,
          target: t.id,
          room: destRoom,
          verb: res.verb,
          rawText,
          item: res.item,
          power: res.power,
          phase,
          timer: 0,
          repathAt: -1,
          burstAt: 0,
          alertedTarget: false,
          destRoom: destRoom ?? undefined,
          destTile: destRoom ? pickDropTile(destRoom) : undefined
        };
        this.active.set(actor, d);
        if (res.verb === 'chase') {
          sim.narrate(`${a.name} is chasing ${t.name} through the office!`, { kind: 'event', icon: 'rage', room: a.room });
        } else if (res.verb === 'follow') {
          sim.narrate(`${a.name} started shadowing ${t.name}.`, { kind: 'event', icon: 'tell', room: a.room });
        }
        return true;
      }

      case 'lock_in': {
        const lockRoom = res.targetRoom ?? safeRoom(t ? t.room : a.room);
        if (t && t.id !== actor && t.room !== lockRoom) {
          const d: ActiveDirective = {
            id,
            actor,
            target: t.id,
            room: lockRoom,
            verb: 'drag',
            rawText,
            item: res.item,
            power: res.power,
            phase: 'approach',
            timer: 0,
            repathAt: -1,
            burstAt: 0,
            alertedTarget: false,
            destRoom: lockRoom,
            destTile: pickDropTile(lockRoom),
            lockAfter: true
          };
          this.active.set(actor, d);
          return true;
        }
        const roomName = roomDef(lockRoom).name;
        sim.goTo(actor, { room: lockRoom }, {
          style: 'run',
          doing: `locking down ${roomName}`,
          braveHazard: true,
          then: () => {
            if (gen !== this.gen) return;
            sim.startChaos('lockIn', { room: lockRoom }, { force: true });
            sim.narrate(`${a.name} barricaded ${roomName}!`, { kind: 'event', icon: 'door', room: lockRoom });
            sim.remember(lockRoom, `${a.name} barricaded the doors of ${roomName}.`, 2.5);
          }
        });
        return true;
      }

      case 'sabotage': {
        let dest: { anchor: string } | { room: TargetRoomId };
        let factKey: string;
        let factText: string;
        let label = res.item || 'the equipment';
        if (t && /desk/i.test(rawText) && isCastId(t.id)) {
          dest = { anchor: `desk.${t.id}` };
          factKey = `sabotage:desk:${t.id}`;
          factText = `${t.name}'s desk has been trashed by ${a.name}.`;
          label = `${t.name}'s desk`;
        } else if (/fax|copier|printer/i.test(rawText)) {
          dest = { anchor: 'spot.annex4' };
          factKey = 'sabotage:fax';
          factText = `The fax machine in the annex has been smashed to pieces by ${a.name}.`;
          label = 'the fax machine';
        } else if (/coffee/i.test(rawText)) {
          dest = { anchor: 'stand.coffee' };
          factKey = 'sabotage:coffee';
          factText = `The coffee machine has been wrecked by ${a.name}.`;
          label = 'the coffee machine';
        } else if (/vending/i.test(rawText)) {
          dest = { anchor: 'stand.vending' };
          factKey = 'sabotage:vending';
          factText = `The vending machine has been smashed by ${a.name}.`;
          label = 'the vending machine';
        } else if (/fridge/i.test(rawText)) {
          dest = { anchor: 'stand.fridge' };
          factKey = 'sabotage:fridge';
          factText = `The break room fridge was sabotaged by ${a.name}.`;
          label = 'the fridge';
        } else if (/cooler/i.test(rawText)) {
          dest = { anchor: 'stand.cooler' };
          factKey = 'sabotage:cooler';
          factText = `The water cooler was knocked over by ${a.name}.`;
          label = 'the water cooler';
        } else {
          const fallbackRoom = res.targetRoom ?? safeRoom(a.room);
          dest = { room: fallbackRoom };
          factKey = `sabotage:${fallbackRoom}`;
          factText = `${a.name} wrecked ${label} in ${roomDef(fallbackRoom).name}.`;
        }
        sim.goTo(actor, dest, {
          style: 'run',
          doing: `going to wreck ${label}`,
          braveHazard: true,
          then: () => {
            if (gen !== this.gen) return;
            const cur = sim.person(actor);
            if (!this.isAliveAndPresent(cur)) return;
            const fxId = `broken-${++this.seq}`;
            this.trackFx(fxId);
            sim.setProp(actor, 'wrench');
            sim.feel(actor, 'angry', 0.85, 8);
            sim.fx({ kind: 'explosion', x: cur.x, y: cur.y - 6, size: 1 });
            sim.fx({ kind: 'burst', what: 'dust', x: cur.x, y: cur.y - 4, count: 14 });
            sim.addEffect({ id: fxId, kind: 'item', item: 'brokenParts', x: cur.x, y: cur.y + 2 });
            sim.sfx('explosion', cur.x);
            sim.shake(0.28, 400);
            sim.bumpChaos(14);
            sim.setFact(factKey, factText);
            sim.narrate(`${a.name} smashed ${label} to pieces!`, { kind: 'event', icon: 'chaos', room: cur.room, beat: true });
            sim.remember('all', factText, 2.5);
            this.schedule(2.5, () => sim.setProp(actor, null));
            const witnesses = sim.peopleIn(cur.room).filter((p) => p.isCast && p.id !== actor && this.isAliveAndPresent(p)).slice(0, 2).map((p) => p.id);
            this.ctx.scene({
              people: [actor, ...witnesses],
              room: cur.room,
              trigger: 'aftermath',
              why: `${a.name} just violently smashed ${label} into broken parts in ${roomDef(cur.room).name}.`,
              priority: 9,
              minLines: 1,
              maxLines: witnesses.length ? 3 : 2,
              staleAfter: 40
            }, true);
          }
        });
        return true;
      }

      case 'trigger_power': {
        const chaosId = powerToChaos(res.power, rawText);
        const r = res.targetRoom ?? safeRoom(a.room);
        const rName = roomDef(r).name;
        sim.goTo(actor, { room: r }, {
          style: 'run',
          doing: `setting off chaos in ${rName}`,
          braveHazard: true,
          then: () => {
            if (gen !== this.gen) return;
            const cur = sim.person(actor);
            if (!this.isAliveAndPresent(cur)) return;
            sim.startChaos(chaosId, { room: r }, { force: true });
            sim.narrate(`${a.name} triggered ${chaosId} in ${rName}!`, { kind: 'event', icon: 'chaos', room: r, beat: true });
            sim.remember('all', `${a.name} set off ${chaosId} in ${rName}.`, 3);
          }
        });
        return true;
      }

      case 'walk_out': {
        sim.setProp(actor, 'box');
        sim.feel(actor, 'angry', 0.85, 12);
        sim.say(actor, "That's it. I quit.", { kind: 'shout', emotion: 'angry' });
        sim.addStatus(actor, 'quit', 99999);
        sim.setFact(`quit:${actor}`, `${a.name} quit and walked out.`);
        sim.narrate(`${a.name} packed up a box and walked out!`, { kind: 'event', icon: 'door', room: a.room, beat: true });
        sim.remember('all', `${a.name} quit on the spot and walked out the front door.`, 3.5);
        sim.leaveEarly(actor, 'walking out for good');
        return true;
      }

      case 'guard': {
        const r = res.targetRoom ?? safeRoom(a.room);
        const rName = roomDef(r).name;
        sim.feel(actor, 'determined', 0.8, 15);
        sim.goTo(actor, { room: r }, { style: 'walk', doing: `heading to guard ${rName}`, stay: 60, stayDoing: `guarding ${rName}`, braveHazard: true });
        sim.narrate(`${a.name} posted up to guard ${rName}.`, { kind: 'event', icon: 'tell', room: r });
        return true;
      }

      case 'go_to': {
        if (!res.targetRoom) return false;
        const rName = roomDef(res.targetRoom).name;
        sim.goTo(actor, { room: res.targetRoom }, { style: 'run', doing: `heading to ${rName}`, stay: 45, stayDoing: `waiting in ${rName}`, braveHazard: true });
        return true;
      }

      default:
        return false;
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const sim = this.ctx.sim;
    const now = sim.time;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (now >= this.timers[i].at) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }

    for (const d of [...this.active.values()]) {
      const a = sim.person(d.actor);
      const t = d.target ? sim.person(d.target) : undefined;
      if (!this.isAliveAndPresent(a) || (d.target && !this.isAliveAndPresent(t))) {
        this.cancelActor(d.actor);
        continue;
      }
      d.timer += dt;

      if (d.phase === 'approach' && t) {
        const dist = Math.hypot(t.x - a.x, t.y - a.y);
        if ((d.verb === 'eliminate' || d.verb === 'knockout') && dist < 56 && !d.alertedTarget && t.id !== a.id) {
          d.alertedTarget = true;
          sim.feel(t.id, 'scared', 0.95, 5);
          sim.emote(t.id, 'alert');
          sim.bark(t.id, 'scared');
        }
        if (dist <= 26 || t.id === a.id) {
          this.onContact(d, a, t);
          continue;
        }
        if (d.timer >= 28) {
          this.cancelActor(d.actor);
          continue;
        }
        if (now >= d.repathAt) {
          d.repathAt = now + 0.85;
          const fast = d.verb === 'eliminate' || d.verb === 'knockout' || d.verb === 'shove' || d.verb === 'drag' || d.verb === 'steal';
          const doing = d.verb === 'eliminate' ? `hunting ${t.name}`
            : d.verb === 'knockout' ? `going after ${t.name}`
              : d.verb === 'drag' ? `grabbing ${t.name}`
                : d.verb === 'shove' ? `charging ${t.name}`
                  : d.verb === 'romance' ? `approaching ${t.name}`
                    : `heading for ${t.name}`;
          sim.goTo(a.id, { near: t.id }, { style: fast ? 'run' : 'walk', doing, braveHazard: true });
        }
        continue;
      }

      if (d.phase === 'scuffle' && t) {
        if (now >= d.burstAt) {
          d.burstAt = now + 0.45;
          sim.fx({ kind: 'burst', what: d.verb === 'eliminate' ? 'anger' : 'stars', x: t.x, y: t.y - 10, count: 6 });
          sim.sfx('thud', t.x);
        }
        const dur = d.verb === 'eliminate' ? 1.5 : 1.1;
        if (d.timer >= dur) this.finishScuffle(d, a, t);
        continue;
      }

      if (d.phase === 'haul' && t && d.destTile && d.destRoom) {
        const ox = a.facing === 'left' ? 10 : a.facing === 'right' ? -10 : 0;
        const oy = a.facing === 'up' ? 8 : -6;
        sim.place(t.id, a.x + ox, a.y + oy, 3);
        const destPx = feetOf(d.destTile);
        const arrived = Math.hypot(a.x - destPx.x, a.y - destPx.y) <= 24 || (a.room === d.destRoom && d.timer >= 1.8);
        if (arrived || d.timer >= 14) {
          this.finishHaul(d, a, t);
        } else if (now >= d.repathAt) {
          d.repathAt = now + 1.8;
          sim.goTo(a.id, { tile: d.destTile }, { style: 'walk', doing: `dragging ${t.name}`, stay: 10, stayDoing: `holding ${t.name}`, braveHazard: true });
        }
        continue;
      }

      if (d.phase === 'chase' && t) {
        if (d.timer >= 18) {
          this.cancelActor(d.actor);
          continue;
        }
        const dist = Math.hypot(t.x - a.x, t.y - a.y);
        if (dist < 42 && t.id !== a.id && t.available) {
          sim.feel(t.id, 'scared', 0.85, 4);
          sim.fleeFrom(t.id, a.room, { style: 'run', doing: `running from ${a.name}` });
        }
        if (now >= d.repathAt) {
          d.repathAt = now + 0.9;
          sim.goTo(a.id, { near: t.id }, { style: 'run', doing: `chasing ${t.name}`, braveHazard: true });
        }
        continue;
      }

      if (d.phase === 'follow' && t) {
        if (d.timer >= 45) {
          this.cancelActor(d.actor);
          continue;
        }
        const dist = Math.hypot(t.x - a.x, t.y - a.y);
        if (dist > 38 && now >= d.repathAt) {
          d.repathAt = now + 1.4;
          sim.goTo(a.id, { near: t.id }, { style: 'walk', doing: `following ${t.name}`, braveHazard: true });
        }
      }
    }
  }

  private onContact(d: ActiveDirective, a: SimPerson, t: SimPerson): void {
    const sim = this.ctx.sim;
    const roomName = roomDef(t.room).name;

    if (d.verb === 'eliminate' || d.verb === 'knockout') {
      const scuffleId = `scuffle-${d.id}`;
      d.phase = 'scuffle';
      d.timer = 0;
      d.burstAt = sim.time + 0.45;
      d.scuffleId = scuffleId;
      this.trackFx(scuffleId);
      sim.seize(a.id, d.id, { anim: 'panic', doing: d.verb === 'eliminate' ? `eliminating ${t.name}` : `fighting ${t.name}` });
      if (t.id !== a.id) sim.seize(t.id, d.id, { anim: 'cower', doing: `fighting for their life` });
      sim.addEffect({ id: scuffleId, kind: 'item', item: 'scuffle', x: (a.x + t.x) / 2, y: (a.y + t.y) / 2 + 2 });
      sim.sfx('thud', t.x);
      sim.fx({ kind: 'burst', what: 'dust', x: t.x, y: t.y - 6, count: 14 });
      sim.shake(0.35, 500);
      return;
    }

    if (d.verb === 'shove') {
      const dx = t.x - a.x;
      const dy = t.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      sim.launch(t.id, (dx / len) * 180, (dy / len) * 140, 120);
      sim.sfx('boing', t.x);
      sim.feel(t.id, 'angry', 0.85, 8);
      if (t.id !== a.id) sim.shiftBond(t.id, a.id, -25);
      sim.bumpChaos(8);
      sim.narrate(`${a.name} shoved ${t.name} across ${roomName}!`, { kind: 'event', icon: 'rage', room: t.room });
      sim.remember([a.id, t.id], `${a.name} shoved ${t.name} hard across ${roomName}.`, 2.5);
      this.active.delete(a.id);
      if (t.id !== a.id) {
        this.ctx.scene({
          people: [a.id, t.id],
          room: t.room,
          trigger: 'aftermath',
          why: `${a.name} just shoved ${t.name} across ${roomName}.`,
          priority: 9,
          minLines: 2,
          maxLines: 3,
          staleAfter: 35
        }, true);
      }
      return;
    }

    if (d.verb === 'drag' && d.destTile && d.destRoom) {
      if (t.id === a.id) {
        this.active.delete(a.id);
        return;
      }
      d.phase = 'haul';
      d.timer = 0;
      d.repathAt = sim.time + 1.8;
      const destName = roomDef(d.destRoom).name;
      sim.seize(t.id, d.id, { anim: 'cower', doing: `being dragged by ${a.name}` });
      sim.feel(t.id, 'scared', 0.85, 10);
      sim.emote(t.id, 'alert');
      sim.bark(t.id, 'pickedUp');
      sim.bus.emit('pickedUp', { who: t.id });
      sim.narrate(`${a.name} grabbed ${t.name} and started dragging them to ${destName}!`, { kind: 'event', icon: 'tell', room: a.room });
      sim.goTo(a.id, { tile: d.destTile }, { style: 'walk', doing: `dragging ${t.name}`, stay: 10, stayDoing: `holding ${t.name}`, braveHazard: true });
      return;
    }

    if (d.verb === 'steal') {
      sim.setProp(a.id, propFromItem(d.item));
      sim.emote(a.id, 'idea');
      sim.feel(t.id, 'angry', 0.85, 8);
      if (t.id !== a.id) sim.shiftBond(t.id, a.id, -25);
      const what = d.item || 'things';
      sim.narrate(`${a.name} snatched ${t.name}'s ${what}!`, { kind: 'event', icon: 'rage', room: t.room });
      sim.remember([a.id, t.id], `${a.name} stole ${what} right from ${t.name}.`, 2.5);
      this.active.delete(a.id);
      if (t.id !== a.id) {
        this.ctx.scene({
          people: [a.id, t.id],
          room: t.room,
          trigger: 'aftermath',
          why: `${a.name} just stole ${what} straight from ${t.name}.`,
          priority: 9,
          minLines: 2,
          maxLines: 3,
          staleAfter: 35
        }, true);
      }
      return;
    }

    if (d.verb === 'romance') {
      const raw = d.rawText.trim().replace(/\s+/g, ' ').slice(0, 120);
      const witnesses = sim
        .peopleNear(t.x, t.y, 180)
        .filter((p) => p.isCast && p.present && p.available && p.id !== a.id && p.id !== t.id);
      sim.face(a.id, t.id);
      if (t.id !== a.id) sim.face(t.id, a.id);
      sim.feel(a.id, 'love', 0.9, 12);
      sim.feel(t.id, 'surprised', 0.75, 8);
      sim.fx({ kind: 'burst', what: 'hearts', x: (a.x + t.x) / 2, y: a.y - 16, count: 12 });
      sim.sfx('heart', t.x);
      sim.bumpChaos(6);
      this.active.delete(a.id);
      if (t.id !== a.id) {
        sim.shiftBond(a.id, t.id, 25);
        sim.shiftBond(t.id, a.id, 15);
        const feedText = raw
          ? `${a.name} went straight up to ${t.name} in ${roomName}: "${raw}"!`
          : `${a.name} made a dramatic romantic move on ${t.name}!`;
        const memText = raw
          ? `${a.name} acted on "${raw}" with ${t.name} in ${roomName}.`
          : `${a.name} openly made a romantic move on ${t.name} in ${roomName}.`;
        sim.narrate(feedText, { kind: 'event', icon: 'love', room: t.room });
        sim.remember([a.id, t.id, ...witnesses.map((w) => w.id)], memText, 2.5);
        const people = [a.id, t.id, ...witnesses.slice(0, 1).map((w) => w.id)];
        this.ctx.scene({
          people,
          room: t.room,
          trigger: 'aftermath',
          why: raw
            ? `${a.name} just went up to ${t.name} in ${roomName} and acted on this impulse right in front of everyone: "${raw}". React directly to what ${a.name} actually did.`
            : `${a.name} just made a bold romantic move on ${t.name} in front of everyone.`,
          priority: 9,
          minLines: 2,
          maxLines: Math.min(4, people.length + 1),
          staleAfter: 35
        }, true);
      } else {
        const feedText = raw
          ? `${a.name} caused a scene in ${roomName}: "${raw}"!`
          : `${a.name} made a bold scene in ${roomName}!`;
        const memText = raw
          ? `${a.name} openly acted on "${raw}" in ${roomName}.`
          : `${a.name} caused a shameless scene in ${roomName}.`;
        sim.narrate(feedText, { kind: 'event', icon: 'love', room: a.room });
        sim.remember([a.id, ...witnesses.map((w) => w.id)], memText, 2.5);
        const sceneWitnesses = witnesses.length > 0
          ? witnesses
          : sim
              .peopleNear(a.x, a.y, 350)
              .filter((p) => p.isCast && p.present && p.available && p.id !== a.id);
        if (sceneWitnesses.length > 0) {
          const people = [a.id, ...sceneWitnesses.slice(0, 2).map((w) => w.id)];
          this.ctx.scene({
            people,
            room: a.room,
            trigger: 'aftermath',
            why: raw
              ? `${a.name} just acted on "${raw}" right in the middle of ${roomName} in front of everyone. React directly to what ${a.name} actually did.`
              : `${a.name} just caused a shameless scene in front of everyone in ${roomName}.`,
            priority: 9,
            minLines: 2,
            maxLines: Math.min(4, people.length + 1),
            staleAfter: 35
          }, true);
        }
      }
    }
  }

  private finishScuffle(d: ActiveDirective, a: SimPerson, t: SimPerson): void {
    const sim = this.ctx.sim;
    if (d.scuffleId) sim.removeEffect(d.scuffleId);
    sim.release(a.id, d.id);
    if (t.id !== a.id) sim.release(t.id, d.id);
    this.active.delete(a.id);

    const roomName = roomDef(t.room).name;
    const witnesses = sim
      .peopleNear(t.x, t.y, 150)
      .filter((p) => p.isCast && p.present && p.available && p.id !== a.id && p.id !== t.id);

    if (d.verb === 'eliminate') {
      const chalkId = `chalk-${t.id}`;
      const ghostId = `ghost-${t.id}-${++this.seq}`;
      this.trackFx(chalkId);
      this.trackFx(ghostId);
      sim.addEffect({ id: chalkId, kind: 'item', item: 'chalkOutline', x: t.x, y: t.y + 2 });
      sim.addEffect({ id: ghostId, kind: 'ghost', x: t.x, y: t.y - 4, facing: 'down', alpha: 0.75, mood: 'sad' });
      this.schedule(18, () => sim.removeEffect(ghostId));
      sim.fx({ kind: 'burst', what: 'skulls', x: t.x, y: t.y - 10, count: 12 });
      sim.fx({ kind: 'flash', color: 0xff3030, alpha: 0.25, ms: 260 });
      sim.sfx('ghostWail', t.x);
      sim.addStatus(t.id, 'eliminated', 99999, a.id);
      if (t.id !== a.id) {
        sim.addStatus(a.id, 'guilty', 90, t.id);
        sim.shiftBond(t.id, a.id, -80);
      }
      sim.feel(a.id, 'determined', 0.9, 10);
      sim.bumpChaos(28);
      sim.incident();
      sim.setFact(`eliminated:${t.id}`, `${t.name} was eliminated by ${a.name} in ${roomName}.`);
      sim.narrate(`${a.name} eliminated ${t.name} in ${roomName}!`, { kind: 'event', icon: 'skull', room: t.room, beat: true });
      sim.remember('all', `${a.name} eliminated ${t.name} in ${roomName}. There is a chalk outline on the floor.`, 4);

      for (let i = 0; i < witnesses.length; i++) {
        const w = witnesses[i];
        sim.feel(w.id, 'scared', 0.95, 10);
        sim.emote(w.id, 'alert');
        if (i < 2) {
          sim.bark(w.id, 'scared');
          sim.fleeFrom(w.id, t.room, { style: 'panic', doing: `fleeing ${a.name}!` });
        }
      }
      const speakers = (t.id === a.id ? [] : [a.id]).concat(witnesses.slice(0, 2).map((w) => w.id));
      if (speakers.length) {
        this.ctx.scene({
          people: speakers,
          room: t.room,
          trigger: 'aftermath',
          why: `${a.name} has just eliminated ${t.name} in ${roomName}. There is a chalk outline on the floor. Everyone reacts in horror.`,
          priority: 10,
          minLines: witnesses.length ? 2 : 1,
          maxLines: witnesses.length ? 4 : 2,
          staleAfter: 45
        }, true);
      }
      return;
    }

    // knockout
    sim.addStatus(t.id, 'knockedOut', 45, a.id);
    sim.fx({ kind: 'burst', what: 'stars', x: t.x, y: t.y - 12, count: 12 });
    sim.sfx('thud', t.x);
    sim.shake(0.25, 350);
    if (t.id !== a.id) sim.shiftBond(t.id, a.id, -40);
    sim.bumpChaos(14);
    sim.narrate(`${a.name} knocked ${t.name} out cold in ${roomName}!`, { kind: 'event', icon: 'chaos', room: t.room, beat: true });
    sim.remember('all', `${a.name} knocked ${t.name} out cold in ${roomName}.`, 3);
    for (const w of witnesses.slice(0, 2)) {
      sim.feel(w.id, 'surprised', 0.85, 8);
      sim.emote(w.id, 'alert');
    }
    const speakers = (t.id === a.id ? [] : [a.id]).concat(witnesses.slice(0, 2).map((w) => w.id));
    if (speakers.length) {
      this.ctx.scene({
        people: speakers,
        room: t.room,
        trigger: 'aftermath',
        why: `${a.name} just knocked ${t.name} out cold in ${roomName}.`,
        priority: 10,
        minLines: 1,
        maxLines: witnesses.length ? 3 : 2,
        staleAfter: 40
      }, true);
    }
  }

  private finishHaul(d: ActiveDirective, a: SimPerson, t: SimPerson): void {
    const sim = this.ctx.sim;
    const destRoom = d.destRoom!;
    const destTile = d.destTile!;
    const destPx = feetOf(destTile);
    const destName = roomDef(destRoom).name;
    this.active.delete(a.id);
    sim.release(t.id, d.id);
    sim.teleport(t.id, destTile);
    sim.bus.emit('dropped', { who: t.id, room: destRoom, hard: false });
    sim.sfx('drop', destPx.x);
    sim.goTo(t.id, { room: destRoom }, { stay: 45, stayDoing: `kept in ${destName}`, braveHazard: true });
    sim.shiftBond(t.id, a.id, -30);
    sim.narrate(`${a.name} dragged ${t.name} into ${destName}!`, { kind: 'event', icon: 'door', room: destRoom, beat: true });
    sim.remember([a.id, t.id], `${a.name} dragged ${t.name} all the way to ${destName}.`, 3);
    if (d.lockAfter) {
      sim.startChaos('lockIn', { room: destRoom }, { force: true });
      sim.narrate(`${a.name} locked ${t.name} inside ${destName}!`, { kind: 'event', icon: 'door', room: destRoom, beat: true });
    }
    this.ctx.scene({
      people: [a.id, t.id],
      room: destRoom,
      trigger: 'aftermath',
      why: d.lockAfter
        ? `${a.name} just dragged ${t.name} into ${destName} and barricaded the door.`
        : `${a.name} just dragged ${t.name} into ${destName}.`,
      priority: 10,
      minLines: 2,
      maxLines: 3,
      staleAfter: 40
    }, true);
  }
}
