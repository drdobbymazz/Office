// Plans from the brain (types.ts PLAN_KINDS) turned into jobs. Social plans
// walk over to the target and then ask the director for a scene; the rest are
// carried out directly.

import type { CharId, Plan, RoomId } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import { anchor, deskOf, findAnchor } from '@/game/core/world';
import { idleAct, makeJob, type Job } from './jobs';
import { roomExists } from './routine';
import type { Person } from './people';
import type { SimCore } from './core';

const SOCIAL = new Set(['talk', 'confront', 'flirt', 'gossip', 'prank', 'comfort']);
const VERB: Record<string, string> = {
  talk: 'talk to', confront: 'confront', flirt: 'flirt with', gossip: 'gossip with', prank: 'prank', comfort: 'comfort'
};

export function isSocialPlan(kind: string): boolean {
  return SOCIAL.has(kind);
}

const aboutText = (plan: Plan): string => (plan.about && plan.about.trim() ? ` about ${plan.about.trim()}` : '');

/** The job that carries out a plan, or null if it cannot be done right now. */
export function planJob(core: SimCore, p: Person, plan: Plan): Job | null {
  const done = (): void => {
    if (p.plan === plan) p.plan = null;
  };
  const targetRoom: RoomId | null = typeof plan.target === 'string' && roomExists(plan.target) ? plan.target : null;
  const targetPerson = typeof plan.target === 'string' && !targetRoom ? core.byId(plan.target as CharId) : undefined;

  if (SOCIAL.has(plan.kind)) {
    const t = targetPerson;
    if (!t || t === p || !t.onFloor) return null;
    const verb = VERB[plan.kind];
    const style = plan.kind === 'confront' ? 'brisk' : 'walk';
    const job: Job = makeJob('plan', { kind: 'near', who: t.id }, {
      style,
      doing: `going to ${verb} ${t.name}${aboutText(plan)}`,
      act: { ...idleAct(`waiting to ${verb} ${t.name}`, 25), faceWho: t.id },
      then: done
    });
    let asked = false;
    let follows = 0;
    const ask = (): void => {
      asked = true;
      core.faceToward(p, t, 3);
      core.faceToward(t, p, 3);
      core.requestScene({
        people: [p.id, t.id],
        trigger: 'plan',
        planKind: plan.kind,
        why: `${p.name} walked over to ${verb} ${t.name}${aboutText(plan)}.`,
        priority: 5,
        staleAfter: 25
      });
    };
    const adjacent = (): boolean => {
      const a = p.res ?? p.tile;
      const b = t.res && !t.walk ? t.res : t.tile;
      return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1 && !t.walk;
    };
    job.onArrive = () => {
      job.kind = 'planWait';
      if (adjacent()) ask();
    };
    // They may have gone to where the target was heading: wait for them there,
    // or follow if they wander off.
    job.whileActing = () => {
      if (asked || !t.onFloor) return;
      if (adjacent()) {
        ask();
        return;
      }
      if (!t.walk && follows < 3) {
        follows++;
        job.kind = 'plan';
        job.phase = 'walk';
        job.tile = null;
      }
    };
    return job;
  }

  switch (plan.kind) {
    case 'work': {
      if (!p.def) return null;
      const d = deskOf(p.def.id);
      return makeJob('plan', { kind: 'anchor', id: d.id }, {
        doing: `going back to ${p.his} desk to work`,
        act: { anim: 'type', seated: true, face: d.face, doing: `working hard at ${p.his} desk`, seconds: 40 },
        then: done
      });
    }
    case 'coffee':
      return makeJob('plan', { kind: 'anchor', id: 'stand.coffee' }, {
        doing: 'going to get a coffee',
        act: { anim: 'operate', seated: false, face: anchor('stand.coffee').face, prop: null, doing: 'making a coffee', seconds: 5 },
        then: () => {
          p.prop = 'coffee';
          p.propUntil = core.time + 70;
          p.energy = Math.min(1, p.energy + 0.25);
          done();
        }
      });
    case 'snack': {
      const id = core.rng() < 0.5 ? 'stand.vending' : 'stand.fridge';
      return makeJob('plan', { kind: 'anchor', id }, {
        doing: 'going to get something to eat',
        act: { anim: 'operate', seated: false, face: anchor(id).face, prop: null, doing: 'getting a snack', seconds: 5 },
        then: () => {
          p.prop = 'donut';
          p.propUntil = core.time + 30;
          core.bumpMood(p.id, 0.05);
          done();
        }
      });
    }
    case 'break': {
      const id = core.rng.pick(['seat.cafe1', 'seat.cafe2', 'seat.cafe3', 'seat.cafe4', 'stand.cooler', 'spot.kitchen2']);
      const a = anchor(id);
      return makeJob('plan', { kind: 'anchor', id }, {
        doing: 'going to take a break',
        act: { anim: 'idle', seated: a.kind === 'seat', face: a.face, doing: 'taking a break', seconds: 20 },
        then: () => {
          p.stress = Math.max(0, p.stress - 0.15);
          done();
        }
      });
    }
    case 'hide': {
      const spots = targetRoom
        ? null
        : ['spot.annex3', 'spot.boss4', 'spot.meet15', 'spot.meet14', 'spot.kitchen3', 'spot.accounts4', 'seat.spare2'].filter((id) => {
          const a = findAnchor(id);
          return a && !core.isHazard(a.room);
        });
      const want = targetRoom ? { kind: 'room' as const, room: targetRoom } : { kind: 'anchor' as const, id: core.rng.pick(spots && spots.length ? spots : ['spot.annex3']) };
      const where = targetRoom ?? findAnchor((want as { id: string }).id)?.room ?? 'annex';
      return makeJob('plan', want, {
        style: 'brisk',
        doing: 'looking for somewhere to hide',
        act: { anim: 'cower', seated: false, face: null, doing: `hiding in ${core.roomName(where)}`, seconds: 25 },
        then: done
      });
    }
    case 'nap': {
      const id = p.def ? deskOf(p.def.id).id : 'seat.spare1';
      const a = anchor(id);
      return makeJob('plan', { kind: 'anchor', id }, {
        doing: 'sneaking off for a nap',
        act: { anim: 'sleep', seated: true, face: a.face, doing: `napping at ${p.his} desk`, seconds: 25 },
        then: () => {
          p.energy = Math.min(1, p.energy + 0.4);
          done();
        }
      });
    }
    case 'wander': {
      const room = targetRoom ?? core.rng.pick(['bullpen', 'kitchen', 'annex', 'accounts', 'meeting'] as RoomId[]);
      return makeJob('plan', { kind: 'room', room }, {
        doing: `wandering over to ${core.roomName(room)}`,
        act: idleAct(`having a look around ${core.roomName(room)}`, 8),
        then: done
      });
    }
    case 'fix': {
      const room = targetRoom ?? p.room;
      return makeJob('plan', { kind: 'room', room }, {
        style: 'brisk',
        braveHazard: true,
        doing: `going to sort out ${core.roomName(room)}`,
        act: { anim: 'operate', seated: false, face: null, prop: 'wrench', doing: `fixing things in ${core.roomName(room)}`, seconds: 10 },
        then: () => {
          if (p.prop === 'wrench') p.prop = null;
          done();
        }
      });
    }
    case 'flee': {
      const room = targetRoom ?? p.room;
      return makeJob('plan', { kind: 'away', room }, {
        style: p.def && p.def.temperament.nerve < 0.5 ? 'panic' : 'run',
        doing: `getting away from ${core.roomName(room)}`,
        act: idleAct(`keeping clear of ${core.roomName(room)}`, 10, null, 'cower'),
        then: done
      });
    }
    case 'snoop': {
      const t = targetPerson;
      if (!t || !isCastId(t.id) || t === p) return null;
      const d = deskOf(t.id);
      const ownerHome = t.onFloor && t.res && t.res.x === d.tile.x && t.res.y === d.tile.y;
      if (ownerHome) {
        return makeJob('plan', { kind: 'near', who: t.id }, {
          doing: `hovering near ${t.name}'s desk`,
          act: { ...idleAct(`waiting for ${t.name} to leave ${t.his} desk`, 12), faceWho: t.id },
          then: done
        });
      }
      return makeJob('plan', { kind: 'anchor', id: d.id }, {
        style: 'brisk',
        doing: `sneaking over to ${t.name}'s desk`,
        act: { anim: 'operate', seated: false, face: d.face, doing: `going through ${t.name}'s desk`, seconds: 9 },
        then: () => {
          core.remember([p.id], `I went through ${t.name}'s desk while ${t.pronoun === 'she' ? 'she' : 'he'} was away.`, 1.5);
          done();
        }
      });
    }
    default:
      return null;
  }
}
