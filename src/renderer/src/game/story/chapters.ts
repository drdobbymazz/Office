// The five days of "Closing Time". Each chapter is its text (text.ts) plus a
// small piece of logic that sets the day up, watches the floor, nudges people
// (the obstacle), and decides when the main goal is won or lost. Everything
// here works with no language model: the levers are deterministic, and whatever
// the model's conversations add comes on top.

import type { CastId, ChaosId, CharId, RoomId } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import { CAST, registerVisitor, displayName } from '@/game/core/cast';
import { CHAOS } from '@/game/core/chaos';
import { anchor, deskOf, feetOf } from '@/game/core/world';
import type { SimPerson } from '@/game/core/simApi';
import { summonChance } from '@/game/director/summon';
import type { ChapterCtx, ChapterDef, ChapterRun, ChaosStartInfo, PlayerAction, SceneDoneInfo, WeekNotes } from './types';
import { CLIENT, LEAK, MEMO, ROW, VERDICT } from './text';

const DAY = (h: number, m = 0): number => h * 60 + m;

function near(a: { x: number; y: number }, b: { x: number; y: number }, r: number): boolean {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r * r;
}

/** In the building, on the floor, and not dangling from the player's hand. */
function onFloor(c: ChapterCtx, p: SimPerson | undefined): p is SimPerson {
  return !!p && p.present && c.sim.holding !== p.id && !c.sim.isAirborne(p.id);
}

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

// ── Monday: The Memo ─────────────────────────────────────────────────────────

const RETURN_EVERY = 20;

class MemoRun implements ChapterRun {
  private returnAt = 0;
  private lockedIn = false;

  constructor(private c: ChapterCtx) {}

  setup(): void {
    const s = this.c.sim;
    s.convince('michael', MEMO.conviction);
    s.setHiddenNote('michael', MEMO.hidden);
    s.setFact('story.memo', MEMO.fact);
    this.returnAt = s.time + RETURN_EVERY;
  }

  private holds(): boolean {
    return this.c.sim.person('michael')?.conviction?.text === MEMO.conviction;
  }

  private room(): { michael: boolean; others: number } {
    let michael = false;
    let others = 0;
    for (const p of this.c.sim.people()) {
      if (!p.isCast || p.room !== 'meeting' || !onFloorOrAsleep(this.c, p)) continue;
      if (p.id === 'michael') michael = true;
      else others++;
    }
    return { michael, others };
  }

  update(): void {
    const s = this.c.sim;
    if (s.clock >= DAY(15) && !this.c.notes.closureKnown) {
      this.c.notes.closureKnown = true;
      s.setFact('story.closure', MEMO.closure);
    }
    if (this.c.main() !== 'open') return;
    if (s.incidentsToday > 0) this.c.setExtra('calm', 'lost');
    // Once he is sure of something else, he stops hiding there and then.
    const m0 = s.person('michael');
    if (m0 && !this.holds() && m0.doing === MEMO.hiding && m0.available && !m0.sceneId) s.resume('michael');
    // The obstacle: while he is sure hiding keeps it unreal, he keeps going back to his office.
    if (s.time >= this.returnAt) {
      this.returnAt = s.time + RETURN_EVERY;
      const m = s.person('michael');
      if (m && this.holds() && m.present && m.room !== 'boss' && !this.lockedIn) {
        // Busy (talking, asleep, in the air): he tries again in a moment.
        if (m.available && !m.sceneId) s.goTo('michael', { anchor: 'desk.michael' }, { doing: MEMO.hiding, stay: 45, stayDoing: MEMO.hiding });
        else this.returnAt = s.time + 3;
      }
    }
    if (s.clock >= DAY(14)) {
      const r = this.room();
      if (r.michael && r.others >= 9) {
        this.callHappens();
        return;
      }
    }
    if (s.clock >= DAY(15)) {
      this.c.notes.call = false;
      s.narrate(MEMO.missed, { icon: 'phone', room: 'meeting' });
      this.c.lose([MEMO.missed]);
    }
  }

  private callHappens(): void {
    const s = this.c.sim;
    s.sfx('ding');
    s.narrate(MEMO.ring, { icon: 'phone', room: 'meeting' });
    const others = s.peopleIn('meeting').filter((p) => p.isCast && p.id !== 'michael' && p.available).slice(0, 3).map((p) => p.id);
    s.requestScene({
      people: ['michael', ...others], room: 'meeting', trigger: 'event', why: MEMO.sceneWhy,
      priority: 9, minLines: 3, maxLines: 4, gather: false, staleAfter: 40
    });
    this.c.notes.closureKnown = true;
    this.c.notes.call = true;
    s.setFact('story.closure', MEMO.closure);
    s.remember('all', 'The regional vice president phoned the conference room: Corporate may close this branch on Friday.', 3);
    s.convince('michael', null);
    s.setHiddenNote('michael', null);
    const u = this.c.used;
    this.c.setExtra('quiet', u.powers.length === 0 && u.anything === 0 && u.cue === 0 ? 'won' : 'lost');
    this.c.win([MEMO.won]);
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: 'The call went ahead' };
    if (st === 'lost') return { progress: 0, status: 'The call was missed' };
    const r = this.room();
    const n = Math.min(9, r.others) + (r.michael ? 1 : 0);
    const status = this.c.sim.clock < DAY(14) ? MEMO.before : `${n} of 10 in the room${r.michael ? '' : ', Michael not yet'}`;
    return { progress: n / 10, status };
  }

  onAction(a: PlayerAction): void {
    if (this.c.main() !== 'open') return;
    if (a.kind === 'power' || a.kind === 'anything' || a.kind === 'cue') this.c.setExtra('quiet', 'lost');
  }

  onChaosStart(e: ChaosStartInfo): void {
    if (e.id === 'lockIn' && (e.target.who === 'michael' || e.target.other === 'michael')) this.lockedIn = true;
  }

  onChaosEnd(id: ChaosId): void {
    if (id !== 'lockIn' || !this.lockedIn) return;
    this.lockedIn = false;
    if (this.c.main() !== 'open' || !this.holds()) return;
    const s = this.c.sim;
    s.convince('michael', null);
    s.narrate(MEMO.lockedOut, { room: 'meeting' });
    s.goTo('michael', { room: 'meeting' }, { doing: 'staying in the conference room', stay: 120, stayDoing: 'staying in the conference room' });
  }

  pinned(who: CharId): boolean {
    return who === 'michael' && this.holds();
  }
}

/** On the floor, asleep counts too (a Nap Attack holds a room full of people). */
function onFloorOrAsleep(c: ChapterCtx, p: SimPerson): boolean {
  return p.present && c.sim.holding !== p.id;
}

// ── Tuesday: Not Speaking ────────────────────────────────────────────────────

const GOSSIP_EVERY = 80;
const MADE_UP = 15;
const ROW_START = -40;
const KIND_TALK = new Set(['talk', 'comfort', 'flirt']);

class RowRun implements ChapterRun {
  private gossipAt = 0;
  private locks: CharId[][] = [];

  constructor(private c: ChapterCtx) {}

  setup(): void {
    const s = this.c.sim;
    for (const [a, b] of [['angela', 'oscar'], ['oscar', 'angela']] as const) s.shiftBond(a, b, ROW_START - s.bond(a, b), ROW.bondNote);
    s.setFact('story.row', ROW.fact);
    s.convince('dwight', ROW.dwight);
    this.gossipAt = s.time + 45;
  }

  private dwightHolds(): boolean {
    return this.c.sim.person('dwight')?.conviction?.text === ROW.dwight;
  }

  private both(delta: number, why?: string): void {
    this.c.sim.shiftBond('angela', 'oscar', delta, why);
    this.c.sim.shiftBond('oscar', 'angela', delta, why);
  }

  update(): void {
    const s = this.c.sim;
    if (this.c.extra('stirring') === 'open' && !this.dwightHolds()) this.c.setExtra('stirring', 'won');
    if (this.c.main() === 'won' && this.c.extra('team') === 'open') {
      const ok = (['angela', 'oscar', 'kevin'] as const).every((id) => {
        const p = s.person(id);
        return onFloor(this.c, p) && p.room === 'accounts';
      });
      if (ok) this.c.setExtra('team', 'won');
    }
    if (this.c.main() !== 'open') return;
    if (s.bond('angela', 'oscar') >= MADE_UP && s.bond('oscar', 'angela') >= MADE_UP) {
      this.madeUp();
      return;
    }
    // The obstacle: Dwight keeps going to warn Angela about Oscar's "plot".
    if (this.dwightHolds() && s.time >= this.gossipAt) {
      const d = s.person('dwight');
      const a = s.person('angela');
      if (d && a && d.present && a.present && d.available && !d.plan && !d.sceneId) {
        s.setPlan('dwight', { kind: 'gossip', target: 'angela', about: ROW.gossip });
        this.gossipAt = s.time + GOSSIP_EVERY;
      } else {
        this.gossipAt = s.time + 5;
      }
    }
  }

  private madeUp(): void {
    const s = this.c.sim;
    s.narrate(ROW.won, { room: 'accounts' });
    const go = { doing: 'going to finish the accounts', stay: 40, stayDoing: 'finishing the accounts' };
    s.goTo('angela', { anchor: 'desk.angela' }, go);
    s.goTo('oscar', { anchor: 'desk.oscar' }, go);
    s.goTo('kevin', { room: 'accounts' }, go);
    s.setFact('story.row', ROW.madeUp);
    s.remember(['angela', 'oscar', 'kevin'], 'Angela and Oscar made up and finished the accounts together.', 2);
    this.c.notes.accounts = true;
    this.c.win([ROW.won]);
  }

  atFive(): void {
    if (this.c.main() !== 'open') return;
    this.c.notes.accounts = false;
    this.c.sim.narrate(ROW.lost, { room: 'accounts' });
    this.c.lose([ROW.lost]);
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: 'Speaking again' };
    if (st === 'lost') return { progress: 0, status: 'Still not speaking' };
    const s = this.c.sim;
    const a = s.bond('angela', 'oscar');
    const o = s.bond('oscar', 'angela');
    const avg = (Math.min(a, MADE_UP) + Math.min(o, MADE_UP)) / 2;
    return {
      progress: Math.max(0, Math.min(1, (avg - ROW_START) / (MADE_UP - ROW_START))),
      status: `Angela ${signed(a)}/15, Oscar ${signed(o)}/15`
    };
  }

  onSceneDone(e: SceneDoneInfo): void {
    if (this.c.main() !== 'open') return;
    const has = (id: CharId): boolean => e.people.includes(id);
    if (has('angela') && has('oscar')) {
      const pushed = e.trigger === 'whisper' || e.trigger === 'cue' || (e.trigger === 'plan' && !!e.planKind && KIND_TALK.has(e.planKind));
      this.both(pushed ? 10 : 5);
    } else if (has('dwight') && has('angela') && this.dwightHolds()) {
      this.c.sim.shiftBond('angela', 'oscar', -6, "Dwight's warnings about Oscar");
    }
  }

  onChaosStart(e: ChaosStartInfo): void {
    if (this.c.main() !== 'open') return;
    const { who, other } = e.target;
    if (e.id === 'love' && ((who === 'angela' && other === 'oscar') || (who === 'oscar' && other === 'angela'))) {
      this.c.sim.shiftBond(who, other, 20);
    }
    if (e.id === 'lockIn' && who && other) this.locks.push([who, other]);
  }

  onChaosEnd(id: ChaosId): void {
    if (id !== 'lockIn') return;
    const pair = this.locks.shift();
    if (!pair || this.c.main() !== 'open') return;
    if (pair.includes('angela') && pair.includes('oscar')) {
      this.both(18, 'were locked in together and had to talk');
      this.c.sim.narrate(ROW.lockedTalk, { room: 'meeting' });
    }
  }
}

// ── Wednesday: The Client ────────────────────────────────────────────────────

export const FIGGIS = 'visitor:figgis';
export const SALES: readonly CastId[] = ['jim', 'dwight', 'phyllis', 'stanley', 'andy'];
const PATIENCE_START = 70;
const DRAIN = 0.25;
const PITCH_FOR = 15;
const PITCH_MIN = 50;
const NEAR = 64;
const MEDDLE_FIRST = 30;
const MEDDLE_EVERY = 80;

export function registerFiggis(): void {
  registerVisitor({
    id: FIGGIS, name: CLIENT.name, role: CLIENT.role, color: 0x5c4836,
    voice: { pitch: 118, wave: 'square', spread: 0.7, speed: 0.85 },
    summary: CLIENT.summary,
    wants: CLIENT.wants, fears: CLIENT.fears, quirk: CLIENT.quirk,
    look: { skin: 'light', hair: [128, 118, 108], outfit: [92, 72, 54], trim: [196, 160, 72], style: 'suit', hairStyle: 'styleRecede' }
  });
}

class ClientRun implements ChapterRun {
  private patience = PATIENCE_START;
  private spawned = false;
  private pitchT = 0;
  private pitchWith: CharId | null = null;
  private grabbed = false;
  private leavingAt = -1;
  private michaelAt = 0;

  constructor(private c: ChapterCtx) {}

  setup(): void {
    registerFiggis();
    this.c.sim.setFact('story.client', CLIENT.fact);
  }

  private figgis(): SimPerson | undefined {
    const p = this.c.sim.person(FIGGIS);
    return p && p.present ? p : undefined;
  }

  private bump(delta: number): void {
    this.patience = Math.max(0, Math.min(100, this.patience + delta));
  }

  update(dt: number): void {
    const s = this.c.sim;
    if (!this.spawned && s.clock >= DAY(10, 30) && s.clock < DAY(16, 50)) this.spawn();
    if (this.leavingAt >= 0 && s.time - this.leavingAt > 45 && s.person(FIGGIS)) {
      // However he was held up, he is gone.
      s.removeVisitor(FIGGIS);
    }
    if (!this.spawned || this.c.main() !== 'open') return;
    const f = this.figgis();
    // His patience only starts to wear once he is through the door.
    if (f && f.room !== 'outside') {
      const around = s.peopleNear(f.x, f.y, NEAR);
      const sales = around.some((p) => SALES.includes(p.id as CastId) && p.present);
      const michael = around.some((p) => p.id === 'michael');
      this.bump(-((sales ? 0 : DRAIN) + (michael ? DRAIN : 0)) * dt);
      this.meddle(f, michael);
      this.pitch(f, dt);
      if (this.c.main() !== 'open') return;
      if (this.patience <= 0) {
        this.walkOut(CLIENT.fedUp);
        return;
      }
    }
    if (s.clock >= DAY(15, 30)) this.walkOut(CLIENT.late);
  }

  private spawn(): void {
    const s = this.c.sim;
    this.spawned = true;
    s.spawnVisitor(FIGGIS, { anchor: 'exit.street' });
    s.goTo(FIGGIS, { anchor: 'door.entrance' }, { doing: 'walking in from the street', stay: 100000, stayDoing: CLIENT.waiting });
    s.feel(FIGGIS, 'bored', 0.5, 20);
    s.sfx('doorOpen', feetOf(anchor('door.entrance').tile).x);
    s.narrate(CLIENT.arrives, { icon: 'coin', room: 'bullpen' });
    s.setFact('story.client', CLIENT.waitingFact);
    s.remember('all', 'Mr Figgis of Figgis Hardware came in to decide whether to sign for another year.', 1.5);
    this.michaelAt = s.time + MEDDLE_FIRST;
  }

  /** The obstacle: Michael is sure he can close the deal himself, and keeps going over to try. */
  private meddle(f: SimPerson, already: boolean): void {
    const s = this.c.sim;
    if (s.time < this.michaelAt) return;
    const m = s.person('michael');
    if (!m || !m.present || already || this.pitchWith) {
      this.michaelAt = s.time + 5;
      return;
    }
    // Someone who has a whispered idea of his own has better things to do.
    if (!m.available || m.plan || m.sceneId || m.conviction) {
      this.michaelAt = s.time + 5;
      return;
    }
    this.michaelAt = s.time + MEDDLE_EVERY;
    s.setPlan('michael', { kind: 'talk', target: f.id, about: CLIENT.meddle });
  }

  private pitch(f: SimPerson, dt: number): void {
    const s = this.c.sim;
    const room = f.room;
    const ok = (room === 'meeting' || room === 'boss') && this.patience >= PITCH_MIN && onFloor(this.c, f);
    const partner = ok
      ? s.peopleIn(room).filter((p) => SALES.includes(p.id as CastId) && onFloor(this.c, p)).sort((a, b) => (a.id === this.pitchWith ? -1 : b.id === this.pitchWith ? 1 : 0))[0]
      : undefined;
    if (!partner) {
      this.pitchT = 0;
      this.pitchWith = null;
      return;
    }
    if (this.pitchWith !== partner.id) {
      this.pitchWith = partner.id;
      this.pitchT = 0;
      s.narrate(`${partner.name} sits down with Mr Figgis in ${room === 'boss' ? "Michael's office" : 'the conference room'}.`, { icon: 'coin', room });
      s.requestScene({
        people: [FIGGIS, partner.id], room, trigger: 'event', why: CLIENT.pitchWhy(partner.name),
        priority: 9, minLines: 3, maxLines: 4, staleAfter: 30
      });
    }
    this.pitchT += dt;
    if (this.pitchT >= PITCH_FOR) this.sign();
  }

  private sign(): void {
    const s = this.c.sim;
    s.sfx('coin');
    s.narrate(CLIENT.signed, { icon: 'coin' });
    s.feel(FIGGIS, 'happy', 0.8, 30);
    s.setFact('story.client', CLIENT.signedFact);
    s.remember('all', CLIENT.signedFact, 2);
    this.c.notes.figgis = true;
    if (!this.grabbed) this.c.setExtra('handsOff', 'won');
    this.c.win([CLIENT.signed]);
    this.c.after(6, () => this.leave());
  }

  private walkOut(text: string): void {
    const s = this.c.sim;
    s.narrate(text, { icon: 'coin' });
    s.feel(FIGGIS, 'angry', 0.8, 30);
    s.setFact('story.client', CLIENT.goneFact);
    s.remember('all', CLIENT.goneFact, 2);
    this.c.notes.figgis = false;
    if (!this.grabbed) this.c.setExtra('handsOff', 'won');
    this.c.lose([text]);
    this.leave();
  }

  private leave(): void {
    const s = this.c.sim;
    if (!s.person(FIGGIS)) return;
    this.leavingAt = s.time;
    s.goTo(FIGGIS, { anchor: 'exit.street' }, { style: 'walk', doing: 'leaving', stay: 0, then: () => s.removeVisitor(FIGGIS) });
  }

  atFive(): void {
    if (this.c.main() === 'open') {
      this.c.notes.figgis = false;
      this.c.lose([CLIENT.late]);
    }
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: 'Signed for another year' };
    if (st === 'lost') return { progress: 0, status: 'Walked out' };
    if (!this.spawned) return { progress: PATIENCE_START / 100, status: CLIENT.before };
    if (this.pitchWith) return { progress: this.patience / 100, status: `Pitching: ${Math.floor(this.pitchT)}s` };
    return { progress: this.patience / 100, status: `Patience ${Math.round(this.patience)}` };
  }

  /** Read by tests. */
  get currentPatience(): number {
    return this.patience;
  }

  onPickedUp(who: CharId): void {
    if (who !== FIGGIS || !this.spawned || this.c.main() !== 'open') return;
    this.grabbed = true;
    this.bump(-15);
    this.c.setExtra('handsOff', 'lost');
  }

  onChaosStart(e: ChaosStartInfo): void {
    if (!this.spawned || this.c.main() !== 'open') return;
    const f = this.figgis();
    if (!f) return;
    const def = CHAOS[e.id];
    const whoRoom = e.target.who ? this.c.sim.person(e.target.who)?.room : undefined;
    const everywhere = def.target === 'none' && !def.fixedRoom;
    const here = everywhere || e.room === f.room || whoRoom === f.room || e.target.who === FIGGIS || e.target.other === FIGGIS;
    if (e.id === 'puppy' && here) {
      this.bump(30);
      this.c.setExtra('dog', 'won');
    }
    if (e.id === 'pizza') this.bump(8);
    if (e.id === 'disco') this.bump(-15);
    if (def.incident) this.bump(here ? -25 : -8);
  }

  onSceneDone(e: SceneDoneInfo): void {
    if (!this.spawned || this.c.main() !== 'open' || !e.people.includes(FIGGIS)) return;
    if (e.people.some((id) => SALES.includes(id as CastId))) this.bump(8);
    if (e.people.includes('michael')) this.bump(-10);
  }
}

// ── Thursday: The Leak ───────────────────────────────────────────────────────

const THOUGHT_EVERY = 60;
const FAX_EVERY = 80;

class LeakRun implements ChapterRun {
  private thoughtAt = 0;
  private faxAt = 0;
  private triesLeft = 2;
  private accused: CharId[] = [];
  private trips: { who: CastId; at: number; done: boolean; text: { doing: string; stay: string } }[] = [];

  constructor(private c: ChapterCtx) {}

  private get leak(): CastId {
    return this.c.notes.leak;
  }

  setup(): void {
    const s = this.c.sim;
    const name = displayName(this.leak);
    s.setHiddenNote(this.leak, LEAK.hidden(name));
    s.setFact('story.leak', LEAK.fact);
    // Two innocent people also pop into the annex once or twice, for their own reasons.
    const others = this.c.rng.shuffle(LEAK.candidates.filter((id) => id !== this.leak)).slice(0, 2);
    others.forEach((who, i) => {
      const n = i === 0 ? 2 : 1 + (this.c.rng() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        this.trips.push({ who, at: DAY(10) + this.c.rng() * 6 * 60, done: false, text: LEAK.herrings[(i + k) % LEAK.herrings.length] });
      }
    });
    this.thoughtAt = s.time + 25;
    this.faxAt = s.time + 50;
  }

  update(): void {
    const s = this.c.sim;
    if (this.c.main() !== 'open') return;
    const leak = s.person(this.leak);
    if (s.time >= this.thoughtAt) {
      this.thoughtAt = s.time + THOUGHT_EVERY;
      const text = this.c.rng.pick(LEAK.thoughts);
      s.setThought(this.leak, text);
      if (leak && leak.present && leak.available && !leak.speaking && this.c.rng() < 0.6) s.say(this.leak, text, { kind: 'think', emotion: 'nervous' });
    }
    if (s.time >= this.faxAt) {
      if (leak && leak.present && leak.available && !leak.plan && !leak.sceneId) {
        s.goTo(this.leak, { room: 'annex' }, { doing: LEAK.fax.doing, stay: 12, stayDoing: LEAK.fax.stay });
        this.faxAt = s.time + FAX_EVERY + this.c.rng() * 15;
      } else {
        this.faxAt = s.time + 5;
      }
    }
    for (const t of this.trips) {
      if (t.done || s.clock < t.at) continue;
      const p = s.person(t.who);
      if (!p || !p.present) continue;
      if (!p.available || p.sceneId) continue;
      t.done = true;
      s.goTo(t.who, { room: 'annex' }, { doing: t.text.doing, stay: 10, stayDoing: t.text.stay });
    }
  }

  atFive(): void {
    if (this.c.main() !== 'open') return;
    this.c.notes.leakFound = false;
    this.c.lose([LEAK.nobody, LEAK.itWas(displayName(this.leak))]);
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: `Caught: ${displayName(this.leak)}` };
    if (st === 'lost') return { progress: 0, status: 'The leak got away' };
    return { progress: 0, status: `Find the leak, ${LEAK.tries(this.triesLeft)}` };
  }

  onChaosStart(e: ChaosStartInfo): void {
    const who = e.target.who;
    if (!who) return;
    const s = this.c.sim;
    if (e.id === 'truth') {
      if (this.c.main() === 'open') this.c.setExtra('noSerum', 'lost');
      this.c.after(3, () => {
        if (this.c.main() !== 'open') return;
        const p = s.person(who);
        if (!p || !p.present) return;
        if (who === this.leak) {
          s.say(who, LEAK.confession, { kind: 'shout', emotion: 'embarrassed' });
          s.narrate(LEAK.confessed(p.name), { icon: 'truth', room: p.room });
          s.remember('all', LEAK.caughtFact(p.name), 2);
        } else if (isCastId(who)) {
          s.say(who, LEAK.denial, { kind: 'say', emotion: 'confused' });
          s.narrate(LEAK.ruledOut(p.name, CAST[who].pronoun), { icon: 'truth', room: p.room });
        }
      });
    }
    if (e.id === 'paranoia' && who === this.leak) {
      this.c.after(3.5, () => {
        if (this.c.main() !== 'open') return;
        s.goTo(who, { room: 'annex' }, { style: 'run', doing: LEAK.shred.doing, stay: 15, stayDoing: LEAK.shred.stay });
      });
    }
  }

  accuse(who: CharId): void {
    if (this.c.main() !== 'open' || this.accused.includes(who)) return;
    const s = this.c.sim;
    const name = displayName(who);
    if (who === this.leak) {
      s.narrate(LEAK.right(name), { icon: 'accuse' });
      s.say(who, 'All right. It was me. I am sorry.', { kind: 'say', emotion: 'embarrassed' });
      const p = s.person(who);
      const others = p ? s.peopleNear(p.x, p.y, 120).filter((o) => o.isCast && o.id !== who && o.available).slice(0, 2).map((o) => o.id) : [];
      s.requestScene({ people: [who, ...others], trigger: 'event', why: LEAK.caughtWhy(name), priority: 9, minLines: 3, staleAfter: 40 });
      s.setHiddenNote(who, null);
      s.setFact('story.leak', LEAK.caughtFact(name));
      s.remember('all', LEAK.caughtFact(name), 2.5);
      this.c.notes.leakFound = true;
      this.c.setExtra('firstTry', this.accused.length === 0 ? 'won' : 'lost');
      if (this.c.extra('noSerum') === 'open') this.c.setExtra('noSerum', 'won');
      this.c.win([LEAK.right(name)]);
      return;
    }
    this.accused.push(who);
    this.triesLeft -= 1;
    s.narrate(LEAK.wrong(name), { icon: 'accuse' });
    if (s.person(who)?.present) s.say(who, 'Me? I have never emailed Corporate in my life!', { kind: 'shout', emotion: 'angry' });
    // The office turns on them, and they take it badly.
    for (const p of s.people()) {
      if (!p.isCast || p.id === who) continue;
      s.shiftBond(p.id, who, -12, LEAK.wrongNote);
      s.shiftBond(who, p.id, -6);
    }
    s.remember('all', `${name} was accused of leaking to Corporate, and it was not true.`, 1.5);
    this.c.setExtra('firstTry', 'lost');
    if (this.triesLeft <= 0) {
      this.c.notes.leakFound = false;
      this.c.lose([LEAK.outOfTries, LEAK.itWas(displayName(this.leak))]);
    }
  }

  accuseUi(): { triesLeft: number; accused: CharId[]; label: string } | null {
    if (this.c.main() !== 'open') return null;
    return { triesLeft: this.triesLeft, accused: [...this.accused], label: LEAK.label };
  }
}

// ── Friday: The Verdict ──────────────────────────────────────────────────────

const INSPECTOR = 'visitor:inspector';
const KITCHEN_EVERY = 25;
const STOPS = [
  { doing: 'inspecting the bullpen', anchor: 'spot.bullpen9' },
  { doing: 'inspecting the accounting corner', anchor: 'spot.accounts1' },
  { doing: "inspecting Michael's office", anchor: 'spot.boss1' }
];
export const BULLPEN_STAFF: readonly CastId[] = (Object.keys(CAST) as CastId[]).filter((id) => deskOf(id).room === 'bullpen');
const ACCOUNTS_STAFF: readonly CastId[] = ['angela', 'oscar', 'kevin'];
const OFFICE_RE = /\b(office|inspector|inspection|desk)\b/i;

class VerdictRun implements ChapterRun {
  private kitchenAt = 0;
  private officeAt = 0;
  private started = false;
  private startedAt = 0;
  private incidentsAt = 0;
  private seen = false;
  private speech = false;
  private hurried = false;
  private scores: (number | null)[] = [null, null, null];
  private total: number | null = null;

  constructor(private c: ChapterCtx) {}

  setup(): void {
    const s = this.c.sim;
    s.convince('michael', VERDICT.conviction);
    s.setFact('story.verdict', VERDICT.fact);
    this.kitchenAt = s.time + KITCHEN_EVERY;
    this.officeAt = s.time + 5;
  }

  private holds(): boolean {
    return this.c.sim.person('michael')?.conviction?.text === VERDICT.conviction;
  }

  update(): void {
    const s = this.c.sim;
    if (s.incidentsToday > 0) this.c.setExtra('spotless', 'lost');
    if (this.c.extra('fullHouse') === 'open' && s.clock >= DAY(16)) {
      const all = s.people().filter((p) => p.isCast && p.present && p.room !== 'outside').length;
      this.c.setExtra('fullHouse', all >= 15 ? 'won' : 'lost');
    }
    if (this.c.main() !== 'open') return;
    this.steerMichael();
    if (!this.started && s.clock >= DAY(13)) {
      if (s.startChaos('inspector', {}, { force: true }) === null) {
        this.started = true;
        this.startedAt = s.time;
        this.incidentsAt = s.incidentsToday;
      }
    }
    if (!this.started) return;
    const insp = s.person(INSPECTOR);
    const touring = !!insp && insp.present;
    if (touring) this.seen = true;
    // The inspector's arrival is Michael's cue: unless he is in his own office, he hurries
    // to the break room and gives the speech the moment he gets there.
    if (touring && !this.speech && this.holds() && s.time >= this.startedAt + 3) {
      const m = s.person('michael');
      if (m && m.present && m.available && !m.sceneId) {
        if (m.room === 'kitchen') this.giveSpeech();
        else if (m.room !== 'boss' && !this.hurried) {
          this.hurried = true;
          s.goTo('michael', { room: 'kitchen' }, { style: 'run', doing: VERDICT.hurrying, stay: 60, stayDoing: VERDICT.practising });
        }
      }
    }
    if (touring && insp) {
      const at = STOPS.findIndex((st) => st.doing === insp.doing);
      for (let i = 0; i < STOPS.length; i++) {
        if (this.scores[i] !== null) continue;
        const arrived = at === i && near(insp, feetOf(anchor(STOPS[i].anchor).tile), 24);
        const passed = at > i || insp.doing === 'leaving';
        if (arrived || passed) this.scores[i] = this.measure(i);
      }
    }
    if ((this.seen && !touring) || s.time - this.startedAt > 120) this.finish();
  }

  /** Keep Michael where his idea sends him: the break room, or (a whisper about his office) his office. */
  private steerMichael(): void {
    const s = this.c.sim;
    const m = s.person('michael');
    if (!m || !m.present) return;
    // Talked out of the speech: he stops rehearsing it there and then.
    if (!this.holds() && (m.doing === VERDICT.practising || m.doing === VERDICT.hurrying) && m.available && !m.sceneId) s.resume('michael');
    if (this.holds()) {
      if (s.time < this.kitchenAt) return;
      this.kitchenAt = s.time + KITCHEN_EVERY;
      if (m.room === 'kitchen') return;
      if (m.available && !m.sceneId) s.goTo('michael', { room: 'kitchen' }, { doing: VERDICT.practising, stay: 60, stayDoing: VERDICT.practising });
      else this.kitchenAt = s.time + 3;
      return;
    }
    if (m.conviction && OFFICE_RE.test(m.conviction.text) && s.time >= this.officeAt) {
      this.officeAt = s.time + KITCHEN_EVERY;
      if (m.available && m.room !== 'boss' && !m.sceneId) {
        s.goTo('michael', { anchor: 'desk.michael' }, { doing: 'going to wait in his office', stay: 60, stayDoing: VERDICT.waitingOffice });
      }
    }
  }

  private giveSpeech(): void {
    const s = this.c.sim;
    this.speech = true;
    s.sfx('paChime');
    s.narrate(VERDICT.speech, { icon: 'announce', room: 'kitchen' });
    s.goTo('michael', { room: 'kitchen' }, { doing: VERDICT.giving, stay: 60, stayDoing: VERDICT.giving });
    const went: CharId[] = [];
    for (const p of s.people()) {
      if (!p.isCast || p.id === 'michael' || !p.present || s.isSeized(p.id) || s.isAirborne(p.id)) continue;
      if (!p.available && !p.sceneId) continue;
      if (s.rng() >= Math.min(0.97, summonChance(p.id, { food: false, named: false }) + 0.2)) continue;
      s.goTo(p.id, { room: 'kitchen' }, { doing: VERDICT.goingToListen, stay: 60, stayDoing: VERDICT.listening });
      went.push(p.id);
    }
    s.requestScene({ people: ['michael', ...went.slice(0, 2)], room: 'kitchen', trigger: 'event', why: VERDICT.speechWhy, priority: 8, gather: false, staleAfter: 30 });
  }

  private atDesk(id: CastId): boolean {
    const p = this.c.sim.person(id);
    if (!onFloor(this.c, p)) return false;
    return /\bdesk\b/i.test(p.doing) || near(p, feetOf(deskOf(id).tile), 24);
  }

  /** How a stop looks right now: share of desks filled (0..1), or Michael in his office (0 or 1). */
  measure(i: number): number {
    const s = this.c.sim;
    if (i === 0) return BULLPEN_STAFF.filter((id) => this.atDesk(id)).length / BULLPEN_STAFF.length;
    if (i === 1) return ACCOUNTS_STAFF.filter((id) => this.atDesk(id)).length / ACCOUNTS_STAFF.length;
    const m = s.person('michael');
    return onFloor(this.c, m) && m.room === 'boss' ? 1 : 0;
  }

  private finish(): void {
    if (this.total !== null) return;
    const s = this.c.sim;
    const sc = this.scores.map((v, i) => v ?? this.measure(i));
    const calm = s.incidentsToday === this.incidentsAt ? 1 : 0;
    const total = Math.round(30 * sc[0] + 25 * sc[1] + 30 * sc[2] + 15 * calm);
    this.total = total;
    this.c.notes.inspection = total;
    if (total >= 60) {
      s.narrate(VERDICT.passed(total), { icon: 'inspector' });
      this.c.win([VERDICT.passed(total)]);
    } else {
      s.narrate(VERDICT.failed(total), { icon: 'inspector' });
      this.c.lose([VERDICT.failed(total)]);
    }
  }

  atFive(): void {
    if (this.c.main() !== 'open') return;
    if (this.started) this.finish();
    else this.c.lose([VERDICT.never]);
  }

  status(): { progress: number; status: string } {
    if (this.total !== null) return { progress: this.total / 100, status: VERDICT.score(this.total) };
    if (!this.started) return { progress: 0, status: VERDICT.before };
    const done = this.scores.filter((v) => v !== null).length;
    return { progress: done / 3, status: VERDICT.stop(Math.min(3, done + 1)) };
  }

  /** Read by tests. */
  get score(): number | null {
    return this.total;
  }

  pinned(who: CharId): boolean {
    return who === 'michael' && this.holds();
  }
}

// ── The week ─────────────────────────────────────────────────────────────────

export const CHAPTER_DEFS: readonly ChapterDef[] = [
  {
    chapter: 1, weekday: 'Monday', title: MEMO.title, intro: MEMO.intro, hints: MEMO.hints, goal: MEMO.goal,
    extras: [{ ...MEMO.extras[0], atFive: 'lost' }, { ...MEMO.extras[1], atFive: 'won' }],
    locked: MEMO.locked, change: [MEMO.changeWon, MEMO.changeLost], create: (c) => new MemoRun(c)
  },
  {
    chapter: 2, weekday: 'Tuesday', title: ROW.title, intro: ROW.intro, hints: ROW.hints, goal: ROW.goal,
    extras: [{ ...ROW.extras[0], atFive: 'lost' }, { ...ROW.extras[1], atFive: 'lost' }],
    locked: {}, change: [ROW.changeWon, ROW.changeLost], create: (c) => new RowRun(c)
  },
  {
    chapter: 3, weekday: 'Wednesday', title: CLIENT.title, intro: CLIENT.intro, hints: CLIENT.hints, goal: CLIENT.goal,
    extras: [{ ...CLIENT.extras[0], atFive: 'lost' }, { ...CLIENT.extras[1], atFive: 'won' }],
    locked: {}, change: [CLIENT.changeWon, CLIENT.changeLost], create: (c) => new ClientRun(c)
  },
  {
    chapter: 4, weekday: 'Thursday', title: LEAK.title, intro: LEAK.intro, hints: LEAK.hints, goal: LEAK.goal,
    extras: [{ ...LEAK.extras[0], atFive: 'lost' }, { ...LEAK.extras[1], atFive: 'lost' }],
    locked: {}, change: [LEAK.changeWon, LEAK.changeLost], create: (c) => new LeakRun(c)
  },
  {
    chapter: 5, weekday: 'Friday', title: VERDICT.title, intro: VERDICT.intro, hints: VERDICT.hints, goal: VERDICT.goal,
    extras: [{ ...VERDICT.extras[0], atFive: 'won' }, { ...VERDICT.extras[1], atFive: 'lost' }],
    locked: {}, change: [VERDICT.changeWon, VERDICT.changeLost], create: (c) => new VerdictRun(c)
  }
];

/** True things from earlier in the week, set again each morning (the sim forgets facts overnight). */
export function weekFacts(notes: WeekNotes, chapter: number): [string, string][] {
  const out: [string, string][] = [];
  if (chapter >= 2 && notes.closureKnown) out.push(['story.closure', MEMO.closure]);
  if (chapter >= 3 && notes.accounts !== undefined) out.push(['story.accounts', notes.accounts ? ROW.madeUp : ROW.lateFact]);
  if (chapter >= 4 && notes.figgis !== undefined) out.push(['story.figgis', notes.figgis ? CLIENT.signedFact : CLIENT.goneFact]);
  if (chapter >= 5 && notes.leakFound) out.push(['story.leakCaught', LEAK.caughtFact(displayName(notes.leak))]);
  return out;
}

export type { RoomId };
