// Everyday behaviour between plans: what each person does next, chosen by
// temperament and job. Each step is a Job with a plain-words `doing`.

import type { CastId, RoomId } from '@/game/core/types';
import { TARGET_ROOMS } from '@/game/core/types';
import { anchor, deskOf, findAnchor, getWorldLocation, ROOMS } from '@/game/core/world';
import { idleAct, makeJob, resolveWant, type Job } from './jobs';
import type { Person } from './people';
import type { SimCore } from './core';

/** Plain words for where an anchor is: "by the coffee machine". */
export function placePhrase(core: SimCore, anchorId: string): string {
  const park = getWorldLocation() === 'park';
  if (anchorId === 'stand.coffee') return park ? 'by the BBQ grill' : 'by the coffee machine';
  if (anchorId === 'stand.vending') return park ? 'by the snack stand' : 'by the vending machine';
  if (anchorId === 'stand.fridge') return park ? 'by the picnic cooler' : 'by the fridge';
  if (anchorId === 'stand.counter') return park ? 'at the picnic counter' : 'at the kitchen counter';
  if (anchorId === 'stand.cooler') return park ? 'at the park drinking fountain' : 'at the water cooler';
  if (anchorId.startsWith('seat.cafe')) return park ? 'at the picnic tables' : 'at the cafe table';
  if (anchorId.startsWith('seat.spare')) return park ? 'by a shaded park bench' : 'at a spare desk';
  if (anchorId === 'door.entrance') return park ? 'by the park gate' : 'by the front door';
  if (anchorId === 'spot.meetHead') return park ? 'at the front of the pavilion' : 'at the head of the conference table';
  if (anchorId.startsWith('desk.')) {
    if (park) return 'on the grass';
    const owner = anchorId.slice(5);
    return `at ${core.nameOf(owner)}'s desk`;
  }
  const a = findAnchor(anchorId);
  return a ? `in ${core.roomName(a.room)}` : park ? 'around the park' : 'about the office';
}

function work(core: SimCore, p: Person, scale = 1): Job {
  const park = getWorldLocation() === 'park';
  const d = deskOf(p.def!.id);
  const phone = core.rng() < (p.def!.job === 'reception' ? 0.4 : 0.22);
  const keepCoffee = p.prop === 'coffee' && core.time < p.propUntil;
  const dil = p.def!.temperament.diligence;
  if (park) {
    return makeJob('routine', { kind: 'anchor', id: d.id }, {
      doing: 'wandering over to a picnic spot',
      act: {
        anim: phone ? 'phone' : keepCoffee && core.rng() < 0.3 ? 'drink' : 'idle',
        seated: false, face: d.face,
        prop: phone ? 'phone' : keepCoffee ? undefined : null,
        doing: phone ? 'on the phone in the park' : p.def!.id === 'michael' ? 'planning team building in the gazebo' : 'enjoying the park air',
        seconds: core.rng.range(16, 40) * (0.6 + dil) * scale
      },
      then: () => {
        if (p.prop === 'phone') p.prop = null;
        p.energy = Math.max(0, p.energy - 0.02);
      }
    });
  }
  const where = p.def!.id === 'michael' ? 'in his office' : `at ${p.his} desk`;
  return makeJob('routine', { kind: 'anchor', id: d.id }, {
    doing: `going back to ${p.his} desk`,
    act: {
      anim: phone ? 'phone' : keepCoffee && core.rng() < 0.3 ? 'drink' : 'type',
      seated: true, face: d.face,
      prop: phone ? 'phone' : keepCoffee ? undefined : null,
      doing: phone ? `on the phone ${where}` : p.def!.id === 'michael' ? 'doing paperwork in his office' : `typing at ${p.his} desk`,
      seconds: core.rng.range(16, 40) * (0.6 + dil) * scale
    },
    then: () => {
      if (p.prop === 'phone') p.prop = null;
      p.energy = Math.max(0, p.energy - 0.03);
    }
  });
}

function coffee(core: SimCore, p: Person, after?: () => void): Job {
  const park = getWorldLocation() === 'park';
  return makeJob('routine', { kind: 'anchor', id: 'stand.coffee' }, {
    doing: park ? 'getting a drink by the BBQ' : 'going to get a coffee',
    act: { anim: 'operate', seated: false, face: anchor('stand.coffee').face, prop: null, doing: park ? 'chatting by the BBQ grill' : 'making a coffee', seconds: core.rng.range(3, 6) },
    then: () => {
      p.prop = 'coffee';
      p.propUntil = core.time + 70;
      p.energy = Math.min(1, p.energy + 0.25);
      after?.();
    }
  });
}

function snack(core: SimCore, p: Person): Job {
  const park = getWorldLocation() === 'park';
  const fridge = core.rng() < 0.4;
  const id = fridge ? 'stand.fridge' : 'stand.vending';
  const what = park ? (fridge ? 'picnic cooler' : 'snack stand') : (fridge ? 'fridge' : 'vending machine');
  return makeJob('routine', { kind: 'anchor', id }, {
    doing: park ? `grabbing a snack from the ${what}` : `going to get a snack from the ${what}`,
    act: { anim: 'operate', seated: false, face: anchor(id).face, prop: null, doing: `getting a snack from the ${what}`, seconds: core.rng.range(3, 6) },
    then: () => {
      p.prop = 'donut';
      p.propUntil = core.time + 25;
      core.bumpMood(p.id, 0.04);
    }
  });
}

function cafe(core: SimCore, p: Person, seconds?: number, doing?: string): Job {
  const park = getWorldLocation() === 'park';
  const seats = ['seat.cafe1', 'seat.cafe2', 'seat.cafe3', 'seat.cafe4'].filter((id) => {
    const a = findAnchor(id);
    return a && core.nav.free(a.tile.x, a.tile.y, p.num);
  });
  const id = seats.length ? core.rng.pick(seats) : 'spot.kitchen2';
  const seat = id.startsWith('seat.');
  const a = anchor(id);
  const eating = p.prop === 'donut' || p.prop === 'pizza';
  return makeJob('routine', { kind: 'anchor', id }, {
    doing: park ? 'heading to the picnic tables' : 'heading to the break room',
    act: {
      anim: eating ? 'eat' : p.prop === 'coffee' ? 'drink' : 'idle', seated: seat, face: a.face,
      doing: doing ?? (park ? 'sitting at the picnic tables' : 'sitting at the cafe table'),
      seconds: seconds ?? core.rng.range(10, 20)
    }
  });
}

function cooler(core: SimCore, p: Person): Job {
  const park = getWorldLocation() === 'park';
  return makeJob('routine', { kind: 'anchor', id: 'stand.cooler' }, {
    doing: park ? 'walking to the drinking fountain' : 'going to the water cooler',
    act: { anim: 'drink', seated: false, face: 'up', doing: park ? 'at the drinking fountain' : 'standing at the water cooler', seconds: core.rng.range(6, 11) }
  });
}

function hangAt(core: SimCore, p: Person, id: string, seconds: number, doing?: string): Job {
  const a = anchor(id);
  const seat = a.kind === 'seat';
  const verb = seat ? 'sitting' : 'hanging around';
  return makeJob('routine', { kind: 'anchor', id }, {
    doing: `going ${placePhrase(core, id).replace(/^(in|at|by) /, 'to ')}`,
    act: { anim: p.prop === 'coffee' && core.rng() < 0.5 ? 'drink' : 'idle', seated: seat, face: a.face, doing: doing ?? `${verb} ${placePhrase(core, id)}`, seconds }
  });
}

function wander(core: SimCore, p: Person, room?: RoomId): Job {
  const rooms = TARGET_ROOMS.filter((r) => !core.isHazard(r));
  const r = room ?? (rooms.length ? core.rng.pick([...rooms, 'bullpen', 'kitchen'] as RoomId[]) : 'bullpen');
  return makeJob('routine', { kind: 'room', room: r }, {
    doing: `wandering over to ${core.roomName(r)}`,
    act: idleAct(`wandering around ${core.roomName(r)}`, core.rng.range(3, 7))
  });
}

function nearFriend(core: SimCore, p: Person): Job | null {
  let best: Person | null = null;
  let bestS = 20;
  for (const o of core.list) {
    if (o === p || !o.isCast || !o.available || o.walk) continue;
    if (core.isHazard(o.room)) continue;
    const s = core.bond(p.id, o.id) + core.rng() * 25;
    if (s > bestS) {
      bestS = s;
      best = o;
    }
  }
  if (!best) return null;
  const who = best;
  return makeJob('routine', { kind: 'near', who: who.id }, {
    doing: `going over to see ${who.name}`,
    act: { ...idleAct(`hanging around with ${who.name}`, core.rng.range(8, 14)), faceWho: who.id }
  });
}

function bossRoam(core: SimCore, p: Person): Job {
  // Find the spot in the bullpen or kitchen with the most people near it.
  const spots = ['spot.bullpen1', 'spot.bullpen2', 'spot.bullpen3', 'spot.bullpen4', 'spot.bullpen5', 'spot.bullpen8', 'spot.bullpen9', 'spot.kitchen1', 'spot.meetHead'];
  let bestId = spots[0];
  let bestN = -1;
  for (const id of spots) {
    const a = findAnchor(id);
    if (!a || core.isHazard(a.room)) continue;
    const f = core.feet(a.tile);
    const n = core.peopleNear(f.x, f.y, 64).length + core.rng() * 1.5;
    if (n > bestN) {
      bestN = n;
      bestId = id;
    }
  }
  return makeJob('routine', { kind: 'anchor', id: bestId }, {
    doing: 'strolling out to find an audience',
    act: { anim: core.rng() < 0.4 ? 'wave' : 'idle', seated: false, face: 'down', doing: `looking for an audience ${placePhrase(core, bestId)}`, seconds: core.rng.range(6, 11) }
  });
}

function patrol(core: SimCore, p: Person): Job {
  const park = getWorldLocation() === 'park';
  const route = ['door.entrance', 'spot.bullpen2', 'spot.bullpen9', 'spot.boss2', 'spot.kitchen1', 'spot.bullpen11', 'spot.annex1'].filter((id) => {
    const a = findAnchor(id);
    return a && !core.isHazard(a.room);
  });
  const id = core.rng.pick(route.length ? route : ['spot.bullpen2']);
  return makeJob('routine', { kind: 'anchor', id }, {
    doing: park ? 'patrolling the park' : 'patrolling the office',
    act: { anim: core.rng() < 0.3 ? 'point' : 'idle', seated: false, face: null, doing: `keeping watch ${placePhrase(core, id)}`, seconds: core.rng.range(3, 6) }
  });
}

function nearPerson(core: SimCore, p: Person, who: CastId, doing: string, walkDoing: string, seconds: number): Job | null {
  const t = core.byId(who);
  if (!t || !t.onFloor || t.air || core.isHazard(t.room)) return null;
  return makeJob('routine', { kind: 'near', who }, {
    doing: walkDoing,
    act: { ...idleAct(doing, seconds), faceWho: who }
  });
}

/** The next routine step for someone with nothing to do. */
export function nextRoutine(core: SimCore, p: Person): Job {
  if (!p.def) return makeJob('routine', { kind: 'here' }, { act: idleAct('standing about', core.rng.range(6, 12)) });
  const def = p.def;
  const T = def.temperament;
  p.routineSteps++;

  // Lunch.
  if (!p.hadLunch && core.clockState.phase === 'working' && core.clock >= p.lunchAt) {
    const park = getWorldLocation() === 'park';
    p.hadLunch = true;
    if (def.id === 'dwight' || def.id === 'angela') {
      return work(core, p, 1.4);
    }
    const mins = core.rng.range(25, 40);
    const seconds = Math.max(12, Math.min(60, core.clockState.secondsFor(mins)));
    const lunchPlace = park ? 'having picnic lunch at the BBQ' : 'having lunch in the break room';
    if (core.rng() < 0.5) {
      const j = cafe(core, p, seconds, lunchPlace);
      j.kind = 'lunch';
      if (j.act) j.act.anim = 'eat';
      return j;
    }
    const spots = ['spot.kitchen1', 'spot.kitchen2', 'spot.kitchen3', 'spot.kitchen4', 'stand.counter', 'stand.fridge'];
    const j = hangAt(core, p, core.rng.pick(spots), seconds, lunchPlace);
    j.kind = 'lunch';
    if (j.act) {
      j.act.anim = 'eat';
      j.act.prop = 'donut';
    }
    return j;
  }

  // The first thing after arriving (or after lunch) is usually the desk.
  if (p.routineSteps <= 1) return work(core, p);

  const park = getWorldLocation() === 'park';
  const opts: [number, () => Job | null][] = [
    [1.2 + 3 * T.diligence, () => work(core, p)],
    [0.5 + (1 - p.energy) * 1.5, () => (core.isHazard('kitchen') ? null : coffee(core, p))],
    [0.25 + (def.id === 'kevin' ? 1.2 : 0), () => (core.isHazard('kitchen') ? null : snack(core, p))],
    [0.25 + 0.5 * T.sociability, () => (core.isHazard('kitchen') ? null : cafe(core, p))],
    [0.25, () => (core.isHazard('accounts') ? null : cooler(core, p))],
    [0.4 + 1.1 * T.sociability, () => {
      const ok = def.haunts.filter((id) => {
        const a = findAnchor(id);
        return a && !core.isHazard(a.room);
      });
      return ok.length ? hangAt(core, p, core.rng.pick(ok), core.rng.range(8, 15)) : null;
    }],
    [0.6 * T.sociability, () => nearFriend(core, p)],
    [0.2 + 0.5 * T.mischief, () => wander(core, p)]
  ];
  switch (def.job) {
    case 'boss':
      opts.push([3, () => bossRoam(core, p)]);
      break;
    case 'reception':
      opts[0][0] += 3;
      opts[7][0] = 0;
      opts.push([0.8, () => hangAt(core, p, 'door.entrance', core.rng.range(5, 9), park ? 'greeting people by the park gate' : 'greeting people by the front door')]);
      break;
    case 'security':
      opts.push([2, () => patrol(core, p)]);
      opts.push([0.9, () => nearPerson(core, p, 'michael', 'checking on Michael', 'going to check on Michael', core.rng.range(5, 9))]);
      break;
    case 'hr':
      for (const o of opts) o[0] *= 0.5;
      opts[0][0] += 2;
      opts.push([2, () => hangAt(core, p, core.rng.pick(['spot.annex1', 'spot.annex2', 'spot.annex3', 'spot.annex4']), core.rng.range(8, 14), park ? 'watching the ducks at the pond' : 'keeping to the annex')]);
      break;
    case 'temp':
      opts.push([1.6, () => {
        const m = core.byId('michael');
        if (!m || !m.onFloor || core.isHazard('kitchen')) return null;
        return coffee(core, p, () => {
          const j = nearPerson(core, p, 'michael', 'handing Michael his coffee', 'taking Michael a coffee', 4);
          if (j) {
            j.then = () => {
              if (p.prop === 'coffee') p.prop = null;
              const mm = core.byId('michael');
              if (mm && mm.onFloor) {
                mm.prop = 'coffee';
                mm.propUntil = core.time + 60;
              }
            };
            core.startJob(p, j);
          }
        });
      }]);
      break;
    case 'drifter':
      opts.push([2.5, () => {
        const candidates = ['stand.fridge', 'spot.bullpen10', 'spot.annex3', 'stand.vending', 'spot.boss4', 'spot.meet15', 'spot.accounts4', 'seat.spare2', 'door.entrance', 'spot.kitchen3'];
        const id = core.rng.pick(candidates);
        const a = findAnchor(id);
        if (!a || core.isHazard(a.room)) return null;
        return hangAt(core, p, id, core.rng.range(6, 14), `doing something unclear ${placePhrase(core, id)}`);
      }]);
      break;
    default:
      break;
  }
  // Love makes people drift toward the one they love.
  const love = p.status('love');
  if (love && love.target) opts.push([3, () => nearPerson(core, p, love.target as CastId, `gazing at ${core.nameOf(love.target as string)}`, `drifting over to ${core.nameOf(love.target as string)}`, core.rng.range(6, 10))]);

  for (let tries = 0; tries < 5; tries++) {
    const i = core.rng.weighted(opts.map((o) => o[0]));
    const job = opts[i][1]();
    if (!job) {
      opts[i][0] = 0;
      continue;
    }
    // Make sure it leads somewhere reachable now.
    const t = resolveWant(core, p, job);
    if (t) {
      job.tile = t;
      return job;
    }
    opts[i][0] = 0;
  }
  return makeJob('routine', { kind: 'here' }, { act: idleAct('standing about', core.rng.range(3, 6)) });
}

export function roomExists(id: string): id is RoomId {
  return ROOMS.some((r) => r.id === id);
}
