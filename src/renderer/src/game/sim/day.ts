// The shape of a working day: arriving from the street before nine, lunch
// around half past twelve, home time at five, and the end of the day once the
// last person has walked off down the street (or 25 s after five).

import { anchor, deskOf, feetOf, getWorldLocation } from '@/game/core/world';
import { ARRIVE_FROM, DAY_END, DAY_START, LUNCH_FROM, LUNCH_TO } from './clock';
import { cancelJob, makeJob, reserve } from './jobs';
import { fallFrom } from './handling';
import type { Person } from './people';
import type { SimCore } from './core';

export const HOME_TIMEOUT = 25;
/** Seconds after five when anyone still walking home breaks into a run. */
const HURRY_AFTER = 9;

export function resetPersonForDay(core: SimCore, p: Person): void {
  cancelJob(p, false);
  p.stash = null;
  p.walk = null;
  p.waiting = false;
  p.air = null;
  p.lift = 0;
  p.seizes = [];
  p.placed = false;
  p.hidden = false;
  p.reaction = null;
  p.sceneId = null;
  p.statuses = [];
  p.plan = null;
  p.thought = '';
  p.conviction = null;
  p.hiddenNote = null;
  p.prop = null;
  p.headgear = null;
  p.scale = 1;
  p.present = false;
  p.goingHome = false;
  p.wentHome = false;
  p.hadLunch = false;
  p.routineSteps = 0;
  p.stuckFor = 0;
  p.rescues = 0;
  p.lastRescue = -999;
  p.trapped = false;
  p.energy = 1;
  p.stress = 0.15;
  p.mood = p.mood * 0.5 + 0.1;
  p.emotion = p.def ? p.def.baseline : 'neutral';
  p.intensity = 0.3;
  p.emotionUntil = 0;
  p.faceTo = null;
  p.doing = getWorldLocation() === 'park' ? 'on the way to the park' : 'on the way to work';
  reserve(core, p, null);
  if (p.speech) core.hush(p.id);
}

export function startDay(core: SimCore, day: number): void {
  const isPark = getWorldLocation() === 'park';
  core.chaosReg.endAll();
  core.scenes.closeAll();
  core.clockState.reset(day);
  core.meterState.startDay();
  core.nav.clearBlocked();
  core.hazards.clear();
  core.factMap.clear();
  core.clearEffects();
  core.holdingId = null;
  core.dayLogLines.length = 0;
  core.recent.clear();
  core.removeAllVisitors();
  // Arrival order: shuffled, spread from 08:51 to about 09:04.
  const cast = core.list.filter((p) => p.isCast);
  const order = core.rng.shuffle([...cast]);
  order.forEach((p, i) => {
    resetPersonForDay(core, p);
    p.arriveAt = ARRIVE_FROM + 1 + i * 0.85 + core.rng() * 0.8;
    p.lunchAt = core.rng() < 0.8 ? LUNCH_FROM + core.rng() * (LUNCH_TO - LUNCH_FROM) : Infinity;
    p.leaveAt = Infinity;
  });
  core.narrate(
    isPark ? `${core.weekday}, day ${day}. The staff are arriving at Scranton Community Park.` : `${core.weekday}, day ${day}. The staff are arriving for work.`,
    { kind: 'system' }
  );
  core.bus.emit('dayStart', { day });
  core.sfx('dayStart');
}

function arrive(core: SimCore, p: Person): void {
  const isPark = getWorldLocation() === 'park';
  const street = anchor('exit.street').tile;
  const at = core.nav.nearestFree(street, p.num, (x, y) => y >= street.y - 1, 6) ?? street;
  const f = feetOf(at);
  p.x = f.x;
  p.y = f.y;
  p.prevX = f.x;
  p.prevY = f.y;
  p.progX = f.x;
  p.progY = f.y;
  p.present = true;
  p.facing = 'right';
  p.state.alpha = 0;
  if (!p.def) return;
  const d = deskOf(p.def.id);
  core.startJob(p, makeJob('arrive', { kind: 'anchor', id: d.id }, {
    doing: isPark ? 'arriving at the park' : 'arriving for work',
    act: {
      anim: isPark ? 'idle' : 'type',
      seated: !isPark,
      face: d.face,
      prop: null,
      doing: isPark ? 'settling into the park' : `settling in at ${p.his} desk`,
      seconds: core.rng.range(4, 10)
    }
  }));
  if (core.rng() < 0.35) core.bark(p.id, 'greeting');
}

/** Off down the street. */
export function sendHome(core: SimCore, p: Person): void {
  if (!p.present) return;
  p.goingHome = true;
  core.scenes.breakFor(p, 'home time');
  if (p.air || p.seized) return;
  p.plan = null;
  core.startJob(p, makeJob('home', { kind: 'anchor', id: 'exit.street' }, {
    style: 'brisk',
    doing: 'heading home',
    then: () => goneHome(core, p)
  }));
}

export function goneHome(core: SimCore, p: Person): void {
  cancelJob(p, false);
  p.present = false;
  p.goingHome = false;
  p.wentHome = true;
  p.walk = null;
  reserve(core, p, null);
  if (p.speech) core.hush(p.id);
  if (core.holdingId === p.id) core.holdingId = null;
  if (!p.isCast) core.removeVisitor(p.id);
}

function beginLeaving(core: SimCore): void {
  core.clockState.phase = 'leaving';
  core.clockState.leavingFor = 0;
  core.chaosReg.endAll();
  core.scenes.closeAll();
  core.nav.clearBlocked();
  core.hazards.clear();
  core.narrate("It's five o'clock. Everyone heads home.", { kind: 'system' });
  let i = 0;
  for (const p of core.list) {
    if (!p.present) {
      if (p.isCast) p.wentHome = true; // never made it in
      continue;
    }
    // Nobody stays seized past five.
    if (p.seizes.length) {
      p.seizes = [];
      p.hidden = false;
      if (p.placed) {
        p.placed = false;
        fallFrom(core, p);
      }
    }
    for (const kind of ['asleep', 'frozen', 'knockedOut', 'eliminated'] as const) if (p.has(kind)) core.removeStatus(p.id, kind);
    p.leaveAt = core.time + Math.min(4, i * 0.25 + core.rng() * 1);
    i++;
  }
}

function endDay(core: SimCore): void {
  for (const p of core.list) {
    if (p.present) {
      if (p.isCast) {
        core.stats.forcedHome++;
        if (core.stats.forcedLog.length < 50) {
          core.stats.forcedLog.push(`day ${core.day} ${p.id} at ${p.tile.x},${p.tile.y} job=${p.job?.kind ?? 'none'} walk=${!!p.walk} waiting=${p.waiting} air=${p.air?.mode ?? 'no'} seized=${p.seized} scene=${p.sceneId} doing=${p.doing} homeJobAge=${p.job ? p.job.walkTime.toFixed(1) : '-'} leaveAt=${(p.leaveAt - core.time).toFixed(1)} rescues=${p.rescues}`);
        }
      }
      goneHome(core, p);
    }
  }
  core.removeAllVisitors();
  core.clockState.phase = 'over';
  core.meterState.endDay();
  core.holdingId = null;
  core.narrate(`Day ${core.day} is over.`, { kind: 'system' });
  core.stats.daysEnded++;
  core.bus.emit('dayEnd', { day: core.day });
  core.sfx('dayEnd');
}

export function updateDay(core: SimCore): void {
  const c = core.clockState;
  if (c.phase === 'over') return;
  if (c.phase === 'arriving' || c.phase === 'working') {
    for (const p of core.list) {
      if (p.isCast && !p.present && !p.wentHome && core.clock >= p.arriveAt) arrive(core, p);
    }
    if (c.phase === 'arriving' && core.clock >= DAY_START) c.phase = 'working';
    if (core.clock >= DAY_END) beginLeaving(core);
    return;
  }
  // leaving
  let anyone = false;
  for (const p of core.list) {
    if (!p.present) continue;
    anyone = true;
    if (!p.goingHome && core.time >= p.leaveAt && !p.air) {
      if (p.isCast && core.rng() < 0.3) core.bark(p.id, 'goodbye');
      sendHome(core, p);
    }
    // Stragglers hurry so they do not miss the bus.
    if (c.leavingFor > HURRY_AFTER && p.job && p.job.kind === 'home' && p.job.style !== 'run') {
      p.job.style = 'run';
      if (p.walk) p.walk.style = 'run';
      p.doing = 'hurrying home';
    }
  }
  if (!anyone || c.leavingFor >= HOME_TIMEOUT) endDay(core);
}
