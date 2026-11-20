// What the sim hands out: the RenderFrame for the floor every frame (built in
// place, no per-frame garbage), and the UI summaries a few times a second.

import type { AnimId, CastId, CharId, Dir } from '@/game/core/types';
import { CAST_IDS, isCastId } from '@/game/core/types';
import { CAST, VISITORS, colorOf } from '@/game/core/cast';
import { roomAt } from '@/game/core/world';
import type { RenderFrame } from '@/game/view/api';
import type { Meters, PersonDetail, PersonUi } from '@/game/app/gameApi';
import type { Person } from './people';
import type { SimCore } from './core';

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

function pickAnim(core: SimCore, p: Person): { anim: AnimId; seated: boolean; variant: number } {
  if (p.frozen) return { anim: 'frozen', seated: !!(p.job && p.job.phase === 'act' && p.job.act?.seated && !p.air), variant: 0 };
  const air = p.air;
  if (air) {
    switch (air.mode) {
      case 'held': return { anim: 'held', seated: false, variant: 0 };
      case 'fly':
      case 'drop': return { anim: 'fall', seated: false, variant: 0 };
      case 'land': return { anim: 'land', seated: false, variant: 0 };
      case 'lie': return { anim: 'lie', seated: false, variant: 0 };
      case 'slide': return { anim: p.lift > 1 ? 'fall' : 'lie', seated: false, variant: 0 };
    }
  }
  if (p.seized) {
    const s = p.seizes[p.seizes.length - 1];
    return { anim: s.anim, seated: s.seated, variant: s.variant };
  }
  if (p.asleep) return { anim: 'sleep', seated: !!(p.job && p.job.phase === 'act' && p.job.act?.seated), variant: 0 };
  const job = p.job;
  const seatedAct = !!(job && job.phase === 'act' && job.act && job.act.seated && !p.walk);
  if (p.reaction && core.time < p.reaction.until) return { anim: p.reaction.anim, seated: seatedAct, variant: 0 };
  if (p.walk) {
    const st = p.walk.style;
    return { anim: st === 'run' ? 'run' : st === 'panic' ? 'panic' : 'walk', seated: false, variant: 0 };
  }
  if (p.speech && core.time < p.talkEnds && !seatedAct) return { anim: 'talk', seated: false, variant: 0 };
  if (job && job.phase === 'act' && job.act) {
    let anim = job.act.anim;
    if (p.speech && core.time < p.talkEnds && (anim === 'idle' || anim === 'type')) anim = 'talk';
    if (anim === 'idle' && p.has('dizzy')) anim = 'dizzy';
    return { anim, seated: job.act.seated, variant: job.act.variant ?? (p.num % 4) };
  }
  if (p.has('dizzy')) return { anim: 'dizzy', seated: false, variant: 0 };
  return { anim: 'idle', seated: false, variant: p.num % 4 };
}

function pickFacing(core: SimCore, p: Person): Dir {
  if (p.air) {
    if (p.air.mode === 'held') return 'down';
    const vx = p.air.vx;
    const vy = p.air.vy;
    if (Math.abs(vx) + Math.abs(vy) > 20) return Math.abs(vx) >= Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
    return p.facing;
  }
  if (p.seized) return p.faceTo && core.time < p.faceUntil ? p.faceTo : p.facing;
  if (p.walk) return p.facing;
  if (p.reaction && core.time < p.reaction.until && p.reaction.face) return p.reaction.face;
  if (p.faceTo && core.time < p.faceUntil) return p.faceTo;
  const act = p.job && p.job.phase === 'act' ? p.job.act : null;
  if (act) {
    if (act.faceWho) {
      const o = core.byId(act.faceWho);
      if (o && o.onFloor) return core.dirTo(p, o);
    }
    if (act.face) return act.face;
  }
  return p.facing;
}

export function buildFrame(core: SimCore): RenderFrame {
  const f = core.frameState;
  const out = f.people as import('@/game/view/api').PersonState[];
  out.length = 0;
  let frozen = 0;
  let present = 0;
  for (const p of core.list) {
    const s = p.state;
    if (!p.present) {
      s.visible = false;
      continue;
    }
    present++;
    if (p.frozen) frozen++;
    const a = pickAnim(core, p);
    p.facing = pickFacing(core, p);
    s.x = p.x;
    s.y = p.y;
    s.lift = p.lift;
    s.facing = p.facing;
    s.anim = a.anim;
    s.variant = a.variant;
    s.seated = a.seated;
    s.speed = p.walk ? p.walk.v : 0;
    s.vx = p.rvx;
    s.vy = p.rvy;
    s.emotion = p.emotion;
    s.intensity = p.intensity;
    s.talking = !!p.speech && core.time < p.talkEnds;
    s.scale = p.scale;
    // Fade in on arrival.
    s.alpha = Math.min(1, s.alpha + 0.08);
    s.visible = !p.hidden;
    s.prop = p.prop;
    s.headgear = p.headgear;
    p.statusKinds.length = 0;
    for (const st of p.statuses) p.statusKinds.push(st.kind);
    s.selected = core.selectedId === p.id;
    if (!p.hidden) out.push(s);
  }
  f.time = core.time;
  f.frozen = present > 0 && frozen * 2 >= present;
  return f;
}

export function personUi(core: SimCore, p: Person): PersonUi {
  const room = p.present ? p.room : 'outside';
  return {
    id: p.id,
    name: p.name,
    role: p.def ? p.def.role : VISITORS[p.id]?.role ?? 'Visitor',
    color: hex(colorOf(p.id)),
    avatar: '',
    room,
    roomName: core.roomName(room),
    emotion: p.emotion,
    intensity: p.intensity,
    statuses: p.statuses.map((s) => s.kind),
    doing: p.present ? (p.seized ? p.seizes[p.seizes.length - 1].doing : p.doing) : p.wentHome ? 'gone home' : 'not in yet',
    speaking: p.speaking,
    present: p.present && !p.hidden,
    busy: !p.available
  };
}

export function peopleUi(core: SimCore): PersonUi[] {
  return core.list.map((p) => personUi(core, p));
}

export function personDetail(core: SimCore, who: CharId, ages: Record<CastId, number>): PersonDetail | null {
  const p = core.byId(who);
  if (!p) return null;
  const base = personUi(core, p);
  const def = isCastId(who) ? CAST[who] : null;
  const bonds = def
    ? CAST_IDS.filter((o) => o !== who)
      .map((o) => {
        const b = core.bondsTable.get(who, o);
        return { id: o, name: CAST[o].name, color: hex(CAST[o].color), avatar: '', score: b.score, label: core.bondsTable.label(who, o), note: b.note };
      })
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    : [];
  const memories = [...core.memory.all(who)].reverse().map((m) => ({ day: m.day, clock: m.clock, text: m.text }));
  return {
    ...base,
    fullName: def ? def.fullName : base.name,
    age: def ? ages[def.id] : 0,
    summary: def ? def.persona.summary : VISITORS[who]?.summary ?? '',
    wants: def ? def.persona.wants : '',
    fears: def ? def.persona.fears : '',
    quirk: def ? def.persona.quirk : '',
    secret: def && core.secretOut(def.id) ? def.persona.secret : null,
    thought: p.thought,
    plan: p.plan,
    mood: p.mood,
    energy: p.energy,
    stress: p.stress,
    bonds,
    memories
  };
}

export function metersUi(core: SimCore): Meters {
  const m = core.meterState;
  return {
    chaos: Math.round(m.chaos * 10) / 10,
    morale: Math.round(m.morale),
    productivity: Math.round(m.productivity),
    stock: m.stock,
    stockDelta: Math.round((m.stock - m.stockDayStart) * 100) / 100,
    stockHistory: [...m.stockHistory]
  };
}

export { roomAt };
