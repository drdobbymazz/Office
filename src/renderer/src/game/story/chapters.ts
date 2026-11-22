// The five days of "Closing Time". Each chapter is its text (text.ts) plus a
// small piece of logic that sets the day up, watches the floor, nudges people
// (the obstacle), and decides when the main goal is won or lost. Everything
// here works with no language model: the levers are deterministic, and whatever
// the model's conversations add comes on top.

import type { ActionId } from '@/game/app/gameApi';
import type { CastId, ChaosId, CharId, RoomId } from '@/game/core/types';
import { formatClock, isCastId } from '@/game/core/types';
import { CAST, registerVisitor, displayName } from '@/game/core/cast';
import { CHAOS } from '@/game/core/chaos';
import { anchor, deskOf, feetOf, roomCentrePx } from '@/game/core/world';
import { expectInspector } from '@/game/sim/chaos/inspector';
import type { SimPerson } from '@/game/core/simApi';
import { summonChance } from '@/game/director/summon';
import type { ChapterCtx, ChapterDef, ChapterRun, ChaosStartInfo, PlayerAction, SceneDoneInfo, ScriptLine, WeekNotes } from './types';
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
    if (s.clock >= DAY(15)) this.missed();
  }

  private missed(): void {
    const s = this.c.sim;
    this.c.notes.call = false;
    this.c.notes.closureKnown = true;
    s.setFact('story.closure', MEMO.closure);
    s.narrate(MEMO.missed, { icon: 'phone', room: 'meeting' });
    this.c.lose([MEMO.missed]);
  }

  atFive(): void {
    if (this.c.main() === 'open') this.missed();
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
//
// The leak sends a page to Corporate from the fax machine every hour or so, and
// the fax machine beeps. Other people use the fax machine too, for their own
// reasons, under the same label, so one sighting is never enough: the first two
// pages always have someone else at the machine. Kevin and Toby sit in the annex
// and think about who they saw. Private thoughts hint at motives (the leak's,
// after the first page) or at other secrets (two nervous innocents). Tests cost:
// Truth Serum (4 today), Paranoia (the leak runs to tear up the fax log once a
// page has gone), a pointed announcement (the leak lies low, the nervous flinch),
// Leak a Secret (exposes the leak; on anyone else an innocent secret gets out),
// and informants told to watch the fax machine.

const FAX_SPOT = 'spot.annex4';
const WATCH_SPOT = 'spot.annex1';
/** Seconds between the leak's pages, by how much there is to report (Wednesday's result). */
const FAX_GAPS = { busy: [66, 76], normal: [82, 94], quiet: [98, 112] } as const;
const FIRST_SEND = 48;
const LEAK_STAY = 14;
const BEEP_AFTER = 2;
const HERRING_STAY = 34;
/** On an overlap trip the leak waits for the other person to reach the fax machine, at most this long. */
const HERRING_WAIT = 30;
const LEAK_THOUGHT_EVERY = 60;
const NERVOUS_EVERY = 70;
const WATCH_FOR = 170;
const AT_FAX = 14;
const POINTED_RE = /\b(fax|faxes|faxing|faxed|corporate|e-?mails?|leak|leaks|leaking|leaker|trac(e|es|ed|ing)|head office)\b/i;
const WATCH_RE = /\b(watch|watching|keep an eye|eye on|stake ?out|spy|guard|look out|keep watch|monitor)\b/i;
const FAX_WORD_RE = /\b(fax|faxes|annex)\b/i;
/** Informants who do not report straight. */
const SHAKY: Partial<Record<CastId, 'vague' | 'random' | 'jim'>> = { kevin: 'vague', creed: 'random', dwight: 'jim' };

interface FaxTrip {
  stage: 'herring' | 'leak' | 'atFax';
  started: number;
  herring: CastId | null;
  herringThere: boolean;
  arrivedAt: number;
}

class LeakRun implements ChapterRun {
  private triesLeft = 2;
  private accused: CharId[] = [];
  private ruled = new Set<CharId>();
  private beeps: { at: number; there: CharId[] }[] = [];
  private nextSend = 0;
  private postponed = 0;
  private trip: FaxTrip | null = null;
  private quietUntil = 0;
  private herrings: CastId[] = [];
  private nervous: CastId[] = [];
  private solo: { who: CastId; at: number; done: boolean }[] = [];
  private thoughtAt = Infinity;
  private nervousAt = 0;
  private watchers = new Map<CastId, number>();
  private echoes: { who: CharId; text: string; at: number }[] = [];
  private gaps: readonly [number, number] = FAX_GAPS.normal;

  constructor(private c: ChapterCtx) {}

  private get leak(): CastId {
    return this.c.notes.leak;
  }

  private faxPoint(): { x: number; y: number } {
    return feetOf(anchor(FAX_SPOT).tile);
  }

  setup(): void {
    const s = this.c.sim;
    const rng = this.c.rng;
    const leak = this.leak;
    const lp = LEAK.person(leak);
    s.setHiddenNote(leak, LEAK.hidden(displayName(leak), lp.motive));
    s.setFact('story.leak', LEAK.fact);
    const f = this.c.notes.figgis;
    this.gaps = f === true ? FAX_GAPS.quiet : f === false ? FAX_GAPS.busy : FAX_GAPS.normal;
    // Two innocent people with errands at the fax machine (not Kevin or Toby, who watch it from their desks).
    this.herrings = rng.shuffle(LEAK.candidates.filter((id) => id !== leak && !LEAK.witnesses.includes(id))).slice(0, 2);
    // Two more with something else to hide.
    const rest = (Object.keys(CAST) as CastId[]).filter((id) => id !== leak && !this.herrings.includes(id));
    this.nervous = rng.shuffle(rest).slice(0, 2);
    for (const id of this.nervous) s.setHiddenNote(id, LEAK.nervousNote(displayName(id), CAST[id].persona.secret));
    // Each errand runner also makes one trip on their own, later in the day.
    for (const h of this.herrings) this.solo.push({ who: h, at: DAY(11, 20) + rng() * 4 * 60, done: false });
    this.nextSend = s.time + FIRST_SEND;
    this.nervousAt = s.time + 28;
  }

  update(): void {
    const s = this.c.sim;
    this.echo();
    if (this.c.main() !== 'open') return;
    this.sendLoop();
    for (const t of this.solo) {
      if (t.done || s.clock < t.at || this.trip?.herring === t.who) continue;
      const p = s.person(t.who);
      if (!p || !p.present) continue;
      if (!p.available || p.sceneId || p.plan) continue;
      t.done = true;
      this.sendHerring(t.who, 14);
    }
    if (s.time >= this.thoughtAt) {
      this.thoughtAt = s.time + LEAK_THOUGHT_EVERY;
      this.think(this.leak, this.c.rng.pick(LEAK.person(this.leak).thoughts), 0.4);
    }
    if (s.time >= this.nervousAt && this.nervous.length) {
      this.nervousAt = s.time + NERVOUS_EVERY;
      const who = this.c.rng.pick(this.nervous);
      this.think(who, this.c.rng.pick(LEAK.person(who).secret), 0.4);
    }
    // Informants stay at their post (a chat may pull them away for a moment).
    for (const [w, until] of this.watchers) {
      if (s.time > until) {
        this.watchers.delete(w);
        continue;
      }
      const p = s.person(w);
      if (p && p.present && p.available && !p.sceneId && p.room !== 'annex' && p.doing !== LEAK.fax.doing && p.doing !== LEAK.fax.stay) {
        s.goTo(w, { anchor: WATCH_SPOT }, { doing: LEAK.watch.doing, stay: Math.max(10, until - s.time), stayDoing: LEAK.watch.stay });
      }
    }
  }

  /** A thought on their card, and now and then as a bubble on the floor. */
  private think(who: CharId, text: string, bubble: number): void {
    const s = this.c.sim;
    const p = s.person(who);
    s.setThought(who, text);
    if (p && p.present && p.available && !p.speaking && this.c.rng() < bubble) s.say(who, text, { kind: 'think', emotion: 'nervous' });
  }

  /** Re-assert witness and informant thoughts for a while (the model's own thoughts may replace them). */
  private echo(): void {
    if (!this.echoes.length) return;
    const now = this.c.sim.time;
    const due = this.echoes.filter((e) => e.at <= now);
    if (!due.length) return;
    this.echoes = this.echoes.filter((e) => e.at > now);
    for (const e of due) this.c.sim.setThought(e.who, e.text);
  }

  private remind(who: CharId, text: string): void {
    const now = this.c.sim.time;
    for (const dt of [15, 30, 45]) this.echoes.push({ who, text, at: now + dt });
  }

  // ── the pages ──

  private sendLoop(): void {
    const s = this.c.sim;
    const leak = s.person(this.leak);
    const t = this.trip;
    if (!t) {
      if (s.time < this.nextSend || s.time < this.quietUntil) return;
      if (!leak || !leak.present || !leak.available || leak.plan || leak.sceneId) {
        this.nextSend = s.time + 5;
        return;
      }
      const n = this.beeps.length + 1;
      let herring: CastId | null = n <= 2 ? this.herrings[n - 1] ?? null : this.c.rng() < 0.35 ? this.c.rng.pick(this.herrings) : null;
      if (herring) {
        const h = s.person(herring);
        if (!h || !h.present || !h.available || h.sceneId) {
          // The first two pages wait a little for their company; after that the leak goes alone.
          if (n <= 2 && this.postponed < 8) {
            this.postponed += 1;
            this.nextSend = s.time + 5;
            return;
          }
          herring = null;
        }
      }
      this.postponed = 0;
      this.trip = { stage: herring ? 'herring' : 'leak', started: s.time, herring, herringThere: false, arrivedAt: -1 };
      if (herring) {
        const who = herring;
        this.sendHerring(who, HERRING_STAY, () => {
          if (this.trip?.herring === who) this.trip.herringThere = true;
        });
      } else this.leakGoes();
      return;
    }
    if (t.stage === 'herring') {
      const waited = s.time - t.started;
      if (t.herringThere || waited > HERRING_WAIT) {
        if (leak && leak.present && leak.available && !leak.sceneId) this.leakGoes();
        else if (waited > HERRING_WAIT + 25) this.abandon();
      }
      return;
    }
    if (t.stage === 'leak') {
      // Picked up or pulled into a conversation on the way: try again soon.
      if (s.time - t.started > 60) this.abandon();
      return;
    }
    if (s.time >= t.arrivedAt + BEEP_AFTER) {
      if (leak && leak.present && leak.doing === LEAK.fax.stay) this.beep();
      else this.abandon();
    }
  }

  private leakGoes(): void {
    const t = this.trip;
    if (!t) return;
    t.stage = 'leak';
    t.started = this.c.sim.time;
    this.c.sim.goTo(this.leak, { anchor: FAX_SPOT }, {
      doing: LEAK.fax.doing, stay: LEAK_STAY, stayDoing: LEAK.fax.stay,
      then: () => {
        if (this.trip === t && t.stage === 'leak') {
          t.stage = 'atFax';
          t.arrivedAt = this.c.sim.time;
        }
      }
    });
  }

  private abandon(): void {
    this.trip = null;
    this.nextSend = this.c.sim.time + 12;
  }

  private sendHerring(who: CastId, stay: number, then?: () => void): void {
    this.c.sim.goTo(who, { anchor: FAX_SPOT }, { doing: LEAK.fax.doing, stay, stayDoing: LEAK.fax.stay, then });
    this.c.sim.setThought(who, LEAK.person(who).errand);
  }

  /** Everyone standing at the fax machine right now. */
  private atFax(): CastId[] {
    const f = this.faxPoint();
    return this.c.sim.people()
      .filter((p) => p.isCast && p.present && (p.doing === LEAK.fax.stay || p.doing === LEAK.shred.stay || near(p, f, AT_FAX)))
      .map((p) => p.id as CastId);
  }

  private beep(): void {
    const s = this.c.sim;
    const n = this.beeps.length + 1;
    const there = this.atFax();
    if (!there.includes(this.leak)) there.unshift(this.leak);
    this.beeps.push({ at: s.clock, there });
    (this.c.notes.leakTimes ??= []).push(Math.floor(s.clock));
    const f = this.faxPoint();
    s.sfx('fax', f.x);
    s.narrate(LEAK.beep(n, formatClock(s.clock)), { icon: 'phone', room: 'annex', beat: true });
    s.setFact('story.leakBeeps', LEAK.beepsFact(n));
    // A pile of paper by the fax machine that grows with every page.
    if (n <= 4) s.addEffect({ id: `story-fax-paper-${n}`, kind: 'item', item: 'paperPile', x: f.x - 12 + (n % 2) * 7, y: f.y + 6 - Math.floor((n - 1) / 2) * 3 });
    this.witnessesSee(there);
    this.informantsReport(there);
    if (n >= 2) this.c.setExtra('quick', 'lost');
    if (n === 1) this.thoughtAt = s.time + 8;
    this.trip = null;
    this.nextSend = s.time + this.gaps[0] + this.c.rng() * (this.gaps[1] - this.gaps[0]);
  }

  private witnessesSee(there: CastId[]): void {
    const s = this.c.sim;
    for (const w of LEAK.witnesses) {
      const p = s.person(w);
      if (!p || !p.present || p.room !== 'annex' || there.includes(w)) continue;
      const text = LEAK.witness(w, there.map((id) => displayName(id)));
      s.setThought(w, text);
      this.remind(w, text);
      if (p.available && !p.speaking && this.c.rng() < 0.5) s.say(w, text, { kind: 'think', emotion: 'surprised' });
    }
  }

  private informantsReport(there: CastId[]): void {
    const s = this.c.sim;
    for (const [w] of this.watchers) {
      const p = s.person(w);
      if (!p || !p.present || p.room !== 'annex' || there.includes(w)) continue;
      const shaky = w === this.leak ? 'lie' : SHAKY[w];
      let text: string;
      if (shaky === 'vague') text = LEAK.vagueReport;
      else if (shaky === 'jim') text = LEAK.dwightReport;
      else if (shaky === 'random' || shaky === 'lie') {
        const others = (Object.keys(CAST) as CastId[]).filter((id) => id !== w && id !== this.leak && id !== 'michael');
        text = LEAK.report([displayName(this.c.rng.pick(others))]);
      } else text = LEAK.report(there.map((id) => displayName(id)));
      s.say(w, text, { kind: 'say', emotion: 'surprised' });
      s.setThought(w, text);
      this.remind(w, text);
    }
  }

  // ── the tests ──

  onChaosStart(e: ChaosStartInfo): void {
    const who = e.target.who;
    if (!who || this.c.main() !== 'open') return;
    const s = this.c.sim;
    if (e.id === 'truth') {
      this.c.after(3, () => {
        if (this.c.main() !== 'open') return;
        const p = s.person(who);
        if (!p || !p.present) return;
        if (who === this.leak) {
          this.c.script([{ who, text: LEAK.person(this.leak).confession, kind: 'shout', emotion: 'embarrassed' }], { room: p.room });
          s.narrate(LEAK.confessed(p.name), { icon: 'truth', room: p.room, beat: true });
          s.remember('all', LEAK.caughtFact(p.name), 2);
        } else if (isCastId(who)) {
          s.say(who, LEAK.person(who).denial, { kind: 'say', emotion: 'confused' });
          s.narrate(LEAK.ruledOut(p.name, CAST[who].pronoun), { icon: 'truth', room: p.room, beat: true });
          this.ruled.add(who);
        }
      });
    }
    if (e.id === 'paranoia' && this.beeps.length > 0) {
      if (who === this.leak) {
        this.c.after(3.5, () => {
          if (this.c.main() !== 'open') return;
          s.goTo(who, { anchor: FAX_SPOT }, {
            style: 'run', doing: LEAK.shred.doing, stay: 15, stayDoing: LEAK.shred.stay,
            then: () => {
              if (this.c.main() === 'open') s.narrate(LEAK.shredding(displayName(who)), { icon: 'paranoia', room: 'annex', beat: true });
            }
          });
        });
      } else if (isCastId(who)) {
        this.c.after(16, () => {
          if (this.c.main() !== 'open' || !s.person(who)?.present) return;
          s.narrate(LEAK.noShred(displayName(who)), { icon: 'paranoia', beat: true });
          this.ruled.add(who);
        });
      }
    }
    if (e.id === 'secretLeak') {
      if (who === this.leak) this.c.after(1, () => this.catch('exposed'));
      else if (isCastId(who)) {
        this.c.after(1.5, () => {
          if (this.c.main() !== 'open') return;
          s.narrate(LEAK.notInIt(displayName(who)), { icon: 'secretLeak', beat: true });
          this.ruled.add(who);
        });
      }
    }
  }

  onAction(a: PlayerAction): void {
    if (this.c.main() !== 'open') return;
    const s = this.c.sim;
    if (a.kind === 'announce' && a.text && POINTED_RE.test(a.text)) {
      // The leak lies low for a while; anyone with something to hide flinches as well.
      this.quietUntil = Math.max(this.quietUntil, s.time + 70);
      for (const id of [this.leak, ...this.nervous]) {
        if (!s.person(id)?.present) continue;
        s.emote(id, 'sweat');
        s.feel(id, 'nervous', 0.9, 25);
      }
      s.narrate(LEAK.pointed, { icon: 'announce', beat: true });
      return;
    }
    if ((a.kind === 'cue' || a.kind === 'whisper') && a.who && isCastId(a.who) && a.text && WATCH_RE.test(a.text) && FAX_WORD_RE.test(a.text)) {
      const who = a.who;
      this.watchers.set(who, s.time + WATCH_FOR + 20);
      s.goTo(who, { anchor: WATCH_SPOT }, { doing: LEAK.watch.doing, stay: WATCH_FOR, stayDoing: LEAK.watch.stay });
      s.narrate(LEAK.informant(displayName(who)), { icon: 'tell', room: 'annex' });
    }
  }

  // ── accusing ──

  accuse(who: CharId): void {
    if (this.c.main() !== 'open' || this.accused.includes(who)) return;
    const s = this.c.sim;
    s.sfx('gavel');
    if (who === this.leak) {
      this.catch('accused');
      return;
    }
    this.accused.push(who);
    this.triesLeft -= 1;
    const name = displayName(who);
    s.narrate(LEAK.wrong(name), { icon: 'accuse', beat: true });
    const p = s.person(who);
    if (p?.present) s.say(who, isCastId(who) ? LEAK.person(who).denial : 'Me? I have never sent Corporate anything!', { kind: 'shout', emotion: 'angry' });
    // Those close by take it to heart; the rest of the office just raises an eyebrow.
    const close = new Set(p ? s.peopleNear(p.x, p.y, 140).map((o) => o.id) : []);
    for (const o of s.people()) {
      if (!o.isCast || o.id === who) continue;
      s.shiftBond(o.id, who, close.has(o.id) ? -12 : -4, LEAK.wrongNote);
    }
    s.bumpMood(who, -0.3);
    s.feel(who, 'angry', 0.9, 20);
    s.remember('all', LEAK.wrongFact(name), 1.5);
    s.setFact('story.leakWrong', LEAK.wrongFact(name));
    if (isCastId(who)) {
      const w = (this.c.notes.wronged ??= []);
      if (!w.includes(who)) w.push(who);
    }
    this.ruled.add(who);
    this.c.setExtra('firstTry', 'lost');
    if (this.triesLeft <= 0) {
      this.c.notes.leakFound = false;
      this.c.sim.setFact('story.leak', LEAK.notCaughtFact);
      this.c.lose([LEAK.outOfTries, this.itWas(), LEAK.motiveLine(LEAK.person(this.leak).motive)]);
    }
  }

  private catch(how: 'accused' | 'exposed'): void {
    if (this.c.main() !== 'open') return;
    const s = this.c.sim;
    const leak = this.leak;
    const name = displayName(leak);
    const lp = LEAK.person(leak);
    const p = s.person(leak);
    s.narrate(how === 'accused' ? LEAK.right(name) : LEAK.exposed(name), { icon: how === 'accused' ? 'accuse' : 'secretLeak', room: p?.room, beat: true });
    const by = p ? s.peopleNear(p.x, p.y, 140).filter((o) => o.isCast && o.id !== leak && o.present && !s.isSeized(o.id)).map((o) => o.id) : [];
    const lines: ScriptLine[] = [{ who: leak, text: lp.confession, kind: 'say', emotion: 'embarrassed' }];
    if (by[0]) lines.push({ who: by[0], text: this.c.rng.pick(LEAK.reactions), kind: 'say', emotion: 'surprised', to: leak });
    this.c.script(lines, { room: p?.room, then: 'model', why: LEAK.caughtWhy(name, lp.motive) });
    s.setHiddenNote(leak, null);
    for (const id of this.nervous) s.setHiddenNote(id, null);
    s.setFact('story.leak', LEAK.caughtFact(name));
    s.setFact('story.leakBeeps', null);
    s.remember('all', LEAK.caughtFact(name), 2.5);
    s.feel(leak, 'embarrassed', 0.9, 40);
    for (const id of by.slice(0, 4)) s.feel(id, 'surprised', 0.7, 8);
    this.c.notes.leakFound = true;
    this.c.setExtra('firstTry', how === 'accused' && this.accused.length === 0 ? 'won' : 'lost');
    this.c.setExtra('quick', this.beeps.length < 2 ? 'won' : 'lost');
    this.c.win([how === 'accused' ? LEAK.right(name) : LEAK.exposed(name), LEAK.motiveLine(lp.motive)]);
  }

  private itWas(): string {
    const leak = this.leak;
    return LEAK.itWas(displayName(leak), CAST[leak].pronoun, this.beeps.map((b) => formatClock(b.at)));
  }

  atFive(): void {
    if (this.c.main() !== 'open') return;
    this.c.notes.leakFound = false;
    this.c.sim.setFact('story.leak', LEAK.notCaughtFact);
    this.c.lose([LEAK.nobody, this.itWas(), LEAK.motiveLine(LEAK.person(this.leak).motive)]);
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: `Caught: ${displayName(this.leak)}` };
    if (st === 'lost') return { progress: 0, status: 'The leak got away' };
    return { progress: Math.min(1, this.beeps.length * 0.3 + this.ruled.size * 0.07), status: LEAK.status(this.beeps.length, this.ruled.size) };
  }

  accuseUi(): { triesLeft: number; accused: CharId[]; label: string } | null {
    if (this.c.main() !== 'open') return null;
    return { triesLeft: this.triesLeft, accused: [...this.accused], label: LEAK.label };
  }

  topics(): string[] {
    if (this.c.main() === 'won') return [LEAK.topics.caught(displayName(this.leak))];
    const out = [this.beeps.length ? LEAK.topics.beeps : LEAK.topics.start];
    for (const w of this.c.notes.wronged ?? []) out.push(LEAK.topics.wronged(displayName(w)));
    return out;
  }

  warns(): Partial<Record<ActionId, string>> {
    if (this.c.main() !== 'open') return {};
    return { secretLeak: LEAK.warns.secretLeak, announce: LEAK.warns.announce };
  }

  stakes(): number {
    if (this.c.main() !== 'open') return 0.1;
    const late = this.c.sim.clock >= DAY(16) ? 0.85 : 0;
    return Math.max(late, Math.min(0.8, 0.3 + this.beeps.length * 0.12));
  }

  /** Read by tests. */
  get facts(): { beeps: { at: number; there: CharId[] }[]; herrings: CastId[]; nervous: CastId[]; ruled: CharId[] } {
    return { beeps: this.beeps.map((b) => ({ at: b.at, there: [...b.there] })), herrings: [...this.herrings], nervous: [...this.nervous], ruled: [...this.ruled] };
  }
}

// ── Friday: The Verdict ──────────────────────────────────────────────────────
//
// The inspector tours at 13:00: the bullpen, the accounting corner, Michael's
// office. Michael is set on a farewell speech in the break room; given during
// the tour, it empties the desks. Only an idea about the speech, the inspector
// or his office changes his mind (anything else, and he says so). The week's
// leftovers make trouble on the tour: Dwight's security check (always),
// Angela and Oscar's row (if Tuesday was lost), the uncaught leak's last page
// (if Thursday was lost), and anyone wrongly accused sulking in the break room.
// Each can be dealt with by a word, a hand or a power. Every stop says its
// score as it is counted.

const INSPECTOR = 'visitor:inspector';
const KITCHEN_EVERY = 25;
const STOPS: { doing: string; anchor: string; room?: RoomId }[] = [
  { doing: 'inspecting the bullpen', anchor: 'spot.bullpen9' },
  // The last two count as soon as he walks into the room (a chat may move him off the exact spot).
  { doing: 'inspecting the accounting corner', anchor: 'spot.accounts1', room: 'accounts' },
  { doing: "inspecting Michael's office", anchor: 'spot.boss1', room: 'boss' }
];
export const BULLPEN_STAFF: readonly CastId[] = (Object.keys(CAST) as CastId[]).filter((id) => deskOf(id).room === 'bullpen');
const ACCOUNTS_STAFF: readonly CastId[] = ['angela', 'oscar', 'kevin'];
/** A whisper or order that engages with the speech, the inspector or his office. */
const ABOUT_SPEECH_RE = /\b(speech|farewell|goodbye|inspector|inspection|tour|office|desk|corporate)\b/i;
const OFFICE_RE = /\b(office|desk|wait|waiting)\b/i;
const LATER_RE = /\b(after|later|tonight|once|until|when)\b/i;
const DESKS_RE = /\b(desk|desks|work|working|inspector)\b/i;
const ROOM_WORD_RE = /\b(conference|meeting|break ?room|kitchen|bullpen|annex|accounting|reception)\b/i;
export const INSPECTION_POINTS = { bullpen: 30, accounts: 20, michael: 30, calm: 20, problem: 15, lastPage: 10, apology: 10, figgis: 5, pass: 60 } as const;

type ProblemId = 'dwight' | 'row' | 'leak' | 'sulk';
interface Problem {
  id: ProblemId;
  state: 'waiting' | 'live' | 'fixed' | 'failed';
  who: CastId[];
  startAt: number;
  /** Seconds the leak has been at the fax machine during the tour. */
  atFax?: number;
  nextMove?: number;
}

class VerdictRun implements ChapterRun {
  private speech: 'planned' | 'cancelled' | 'after' | 'during' | 'afterGiven' = 'planned';
  private toOffice = false;
  private kitchenAt = 0;
  private officeAt = 0;
  private reconvinceAt = -1;
  private started = false;
  private startedAt = 0;
  private incidentsAt = 0;
  private seen = false;
  private hurried = false;
  private scores: (number | null)[] = [null, null, null];
  private stopLines: string[] = ['', '', ''];
  private total: number | null = null;
  private problems: Problem[] = [];
  private bonuses: { text: string; pts: number }[] = [];
  private leftAt = -1;
  private afterSpeechAt = -1;
  private ovationAt = -1;
  private boxesAt = -1;
  private dangling = false;

  constructor(private c: ChapterCtx) {}

  setup(): void {
    const s = this.c.sim;
    const n = this.c.notes;
    s.convince('michael', VERDICT.conviction);
    s.setFact('story.verdict', VERDICT.fact);
    this.kitchenAt = s.time + KITCHEN_EVERY;
    this.officeAt = s.time + 5;
    // Michael's farewell cake and a few balloons are already in the break room.
    const k = roomCentrePx('kitchen');
    s.addEffect({ id: 'story-farewell-cake', kind: 'item', item: 'cake', x: k.x + 8, y: k.y + 6 });
    s.addEffect({ id: 'story-farewell-balloons', kind: 'balloons', room: 'kitchen', count: 3 });
    // The week's leftovers.
    this.problems.push({ id: 'dwight', state: 'waiting', who: ['dwight'], startAt: DAY(12, 30) });
    if (n.accounts === false) this.problems.push({ id: 'row', state: 'waiting', who: ['angela', 'oscar'], startAt: DAY(12, 45) });
    const busy = new Set<CastId>(['dwight', 'angela', 'oscar', 'michael']);
    if (n.leakFound === false && n.leak && !busy.has(n.leak)) {
      this.problems.push({ id: 'leak', state: 'waiting', who: [n.leak], startAt: DAY(12, 40) });
      busy.add(n.leak);
    }
    const sulker = (n.wronged ?? []).find((id) => !busy.has(id));
    if (sulker) this.problems.push({ id: 'sulk', state: 'waiting', who: [sulker], startAt: DAY(9, 12) });
    if (n.leakFound && n.leak) this.bonuses.push({ text: VERDICT.apology(displayName(n.leak)), pts: INSPECTION_POINTS.apology });
    if (n.figgis) this.bonuses.push({ text: VERDICT.figgisNote, pts: INSPECTION_POINTS.figgis });
    // The worse the week has gone, the more people arrive with a box to pack.
    const fails = [n.call, n.accounts, n.figgis, n.leakFound].filter((v) => v === false).length;
    const packers = (['stanley', 'creed', 'meredith', 'phyllis'] as CastId[]).slice(0, fails);
    for (const id of packers) s.setProp(id, 'box');
    if (packers.includes('stanley')) this.boxesAt = DAY(9, 8);
  }

  private holds(): boolean {
    return this.speech === 'planned';
  }

  private problem(id: ProblemId): Problem | undefined {
    return this.problems.find((p) => p.id === id);
  }

  update(dt: number): void {
    const s = this.c.sim;
    if (this.reconvinceAt >= 0 && s.time >= this.reconvinceAt) {
      this.reconvinceAt = -1;
      if (this.holds()) s.convince('michael', VERDICT.conviction);
    }
    if (this.boxesAt >= 0 && s.clock >= this.boxesAt) {
      this.boxesAt = -1;
      this.c.script(VERDICT.boxes.map((l) => ({ who: l.who as CastId, text: l.text })), { room: 'bullpen' });
    }
    this.afterTheTour();
    if (this.c.main() !== 'open') return;
    this.updateProblems(dt);
    this.steerMichael();
    if (!this.started && s.clock >= DAY(13)) {
      // The Inspection power is locked today for the player; the story's own inspector is let in.
      s.setLocks({});
      expectInspector(true);
      const no = s.startChaos('inspector', {}, { force: true });
      expectInspector(false);
      s.setLocks({ inspector: VERDICT.locked });
      if (no === null) {
        this.started = true;
        this.startedAt = s.time;
        this.incidentsAt = s.incidentsToday;
        this.tourBegins();
      }
    }
    if (!this.started) return;
    const insp = s.person(INSPECTOR);
    const touring = !!insp && insp.present;
    if (touring) this.seen = true;
    // The inspector's arrival is Michael's cue: unless he is in his own office, he hurries
    // to the break room and gives the speech the moment he gets there.
    if (touring && this.holds() && s.time >= this.startedAt + 3) {
      const m = s.person('michael');
      if (m && m.present && m.available && !m.sceneId) {
        if (m.room === 'kitchen') this.giveSpeech(false);
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
        const arrived = at === i && (near(insp, feetOf(anchor(STOPS[i].anchor).tile), 24) || (!!STOPS[i].room && insp.room === STOPS[i].room));
        const passed = at > i || insp.doing === 'leaving';
        if (arrived || passed) this.scoreStop(i);
      }
    }
    if ((this.seen && !touring) || s.time - this.startedAt > 120) this.finish();
  }

  // ── Michael ──

  private steerMichael(): void {
    const s = this.c.sim;
    const m = s.person('michael');
    if (!m || !m.present) return;
    if (this.holds()) {
      if (s.time < this.kitchenAt) return;
      this.kitchenAt = s.time + KITCHEN_EVERY;
      if (m.room === 'kitchen') return;
      if (m.available && !m.sceneId) s.goTo('michael', { room: 'kitchen' }, { doing: VERDICT.practising, stay: 60, stayDoing: VERDICT.practising });
      else this.kitchenAt = s.time + 3;
      return;
    }
    // Talked out of it: he stops rehearsing there and then.
    if ((m.doing === VERDICT.practising || m.doing === VERDICT.hurrying) && m.available && !m.sceneId) s.resume('michael');
    if (!this.toOffice && this.speech !== 'after') return;
    if (!m.available || m.sceneId) return;
    // From just before the tour until the inspector has gone, he keeps busy at his own desk (an idea
    // of his own would otherwise send him off to tell someone about it, right as the inspector arrives).
    if (s.clock >= DAY(12, 45) && this.total === null) {
      if (m.plan?.kind !== 'work') s.setPlan('michael', { kind: 'work', target: null, about: VERDICT.waitingOffice });
      return;
    }
    if (s.time < this.officeAt) return;
    this.officeAt = s.time + KITCHEN_EVERY;
    // Already there and staying, or on the way: leave him be. A coffee run or a chat, and he goes back.
    const staying = m.doing === VERDICT.waitingOffice || m.doing === VERDICT.goingOffice;
    if (staying || (m.room === 'boss' && !/\b(going|heading|walking|wandering|strolling)\b/.test(m.doing))) return;
    if (m.plan) s.setPlan('michael', null);
    s.goTo('michael', { anchor: 'desk.michael' }, { doing: VERDICT.goingOffice, stay: 90, stayDoing: VERDICT.waitingOffice });
  }

  /** A whisper or an order to Michael: does it engage with the speech? */
  private aboutMichael(a: PlayerAction): void {
    const s = this.c.sim;
    const text = a.text ?? '';
    if (!this.holds()) {
      if (OFFICE_RE.test(text) && ABOUT_SPEECH_RE.test(text)) this.toOffice = true;
      return;
    }
    if (!ABOUT_SPEECH_RE.test(text)) {
      // Not about the speech: he keeps his plan, and the player is told so.
      s.narrate(VERDICT.stillSpeech, { icon: 'whisper', room: s.person('michael')?.room, beat: true });
      this.reconvinceAt = s.time + 1.5;
      return;
    }
    this.toOffice = OFFICE_RE.test(text) || /\binspector\b/i.test(text);
    if (LATER_RE.test(text) && /\bspeech|farewell|goodbye\b/i.test(text)) {
      this.speech = 'after';
      this.toOffice = true;
      s.narrate(VERDICT.postponed, { icon: 'whisper', beat: true });
    } else {
      this.speech = 'cancelled';
      s.narrate(VERDICT.talkedOut, { icon: 'whisper', beat: true });
    }
    // An order (rather than a whisper) still leaves his card saying what he now means to do.
    if (a.kind === 'cue') s.convince('michael', this.toOffice ? VERDICT.officeConviction : null);
  }

  private giveSpeech(afterTour: boolean): void {
    const s = this.c.sim;
    this.speech = afterTour ? 'afterGiven' : 'during';
    s.sfx('clink');
    s.narrate(afterTour ? VERDICT.speechAfter : VERDICT.speech, { icon: 'announce', room: 'kitchen', beat: true });
    s.goTo('michael', { room: 'kitchen' }, { doing: VERDICT.giving, stay: 60, stayDoing: VERDICT.giving });
    const went: CharId[] = [];
    for (const p of s.people()) {
      if (!p.isCast || p.id === 'michael' || !p.present || s.isSeized(p.id) || s.isAirborne(p.id)) continue;
      if (!p.available && !p.sceneId) continue;
      if (s.rng() >= Math.min(0.97, summonChance(p.id, { food: false, named: false }) + (afterTour ? 0.4 : 0.2))) continue;
      s.goTo(p.id, { room: 'kitchen' }, { doing: VERDICT.goingToListen, stay: 60, stayDoing: VERDICT.listening });
      went.push(p.id);
    }
    const reply = VERDICT.speechReply;
    const lines: ScriptLine[] = VERDICT.speechLines.map((text) => ({ who: 'michael', text, kind: 'say' as const, emotion: 'sad' as const }));
    if (went.includes(reply.who as CastId)) lines.push({ who: reply.who as CastId, text: reply.text, kind: 'say', emotion: 'sad' });
    this.c.script(lines, { room: 'kitchen', then: 'model', why: VERDICT.speechWhy });
    if (afterTour) this.ovationAt = s.time + 22;
  }

  // ── the week's leftovers ──

  private updateProblems(dt: number): void {
    const s = this.c.sim;
    const insp = s.person(INSPECTOR);
    const touring = this.started && !!insp?.present;
    for (const p of this.problems) {
      if (p.state === 'waiting' && s.clock >= p.startAt) this.startProblem(p);
      if (p.state !== 'live') continue;
      const who = s.person(p.who[0]);
      if (p.id === 'dwight' && touring && insp && who?.present) {
        if (near(who, insp, 28)) {
          this.fail(p);
          this.c.script(VERDICT.problems.dwight.lines.map((l) => ({ who: l.who as CharId, text: l.text })), { room: who.room });
          continue;
        }
        if (s.time >= (p.nextMove ?? 0) && who.available && !who.sceneId) {
          p.nextMove = s.time + 2;
          s.goTo('dwight', { near: INSPECTOR }, { doing: VERDICT.problems.dwight.going, stay: 4, stayDoing: VERDICT.problems.dwight.going });
        }
      }
      if (p.id === 'row' && s.time >= (p.nextMove ?? 0)) {
        p.nextMove = s.time + 18;
        for (const id of p.who) {
          const q = s.person(id);
          if (q?.present && q.available && !q.sceneId && q.room !== 'accounts') s.goTo(id, { room: 'accounts' }, { doing: VERDICT.problems.row.doing, stay: 40, stayDoing: VERDICT.problems.row.doing });
        }
      }
      if (p.id === 'leak' && touring && who?.present) {
        if (who.doing === VERDICT.problems.leak.sending) {
          p.atFax = (p.atFax ?? 0) + dt;
          if (p.atFax >= 6) this.fail(p);
        } else if (s.time >= (p.nextMove ?? 0) && who.available && !who.sceneId) {
          p.nextMove = s.time + 6;
          s.goTo(p.who[0], { anchor: 'spot.annex4' }, { doing: VERDICT.problems.leak.going, stay: 12, stayDoing: VERDICT.problems.leak.sending });
        }
      }
      if (p.id === 'sulk' && s.time >= (p.nextMove ?? 0)) {
        p.nextMove = s.time + 20;
        if (who?.present && who.available && !who.sceneId && who.room !== 'kitchen') {
          s.goTo(p.who[0], { room: 'kitchen' }, { doing: VERDICT.problems.sulk.doing, stay: 60, stayDoing: VERDICT.problems.sulk.doing });
        }
      }
    }
  }

  private startProblem(p: Problem): void {
    const s = this.c.sim;
    const who = p.who[0];
    if (!s.person(who)?.present) {
      p.startAt = s.clock + 5;
      return;
    }
    p.state = 'live';
    const name = displayName(who);
    if (p.id === 'dwight') {
      s.convince('dwight', VERDICT.problems.dwight.conviction);
      s.narrate(VERDICT.problems.dwight.start, { icon: 'warn', beat: true });
    } else if (p.id === 'row') {
      s.narrate(VERDICT.problems.row.start, { icon: 'rage', room: 'accounts', beat: true });
      for (const id of p.who) s.feel(id, 'angry', 0.8, 60);
      this.c.script(VERDICT.problems.row.lines.map((l) => ({ who: l.who as CastId, text: l.text, kind: 'say' as const, emotion: 'angry' as const })), { room: 'accounts' });
    } else if (p.id === 'leak') {
      s.narrate(VERDICT.problems.leak.start(name), { icon: 'phone', beat: true });
    } else {
      s.narrate(VERDICT.problems.sulk.start(name), { icon: 'morale', room: 'kitchen', beat: true });
      s.feel(who, 'sad', 0.8, 120);
    }
  }

  private fix(p: Problem, how: 'talk' | 'pickup' | 'power'): void {
    if (p.state !== 'live') return;
    const s = this.c.sim;
    p.state = 'fixed';
    const name = displayName(p.who[0]);
    const text = p.id === 'dwight' ? VERDICT.problems.dwight.fixed[how]
      : p.id === 'row' ? VERDICT.problems.row.fixed[how]
        : p.id === 'leak' ? VERDICT.problems.leak.fixed(name)
          : VERDICT.problems.sulk.fixed(name);
    s.narrate(text, { icon: 'check', beat: true });
    for (const id of p.who) {
      if (p.id === 'dwight' && s.person('dwight')?.conviction?.text === VERDICT.problems.dwight.conviction) s.convince('dwight', null);
      const q = s.person(id);
      if (how !== 'pickup' && q?.present && q.available && !q.sceneId) s.goTo(id, { anchor: `desk.${id}` }, { doing: VERDICT.recallDoing, stay: 60, stayDoing: 'working at the desk' });
      if (p.id === 'sulk') s.feel(id, 'happy', 0.6, 20);
    }
  }

  private fail(p: Problem): void {
    if (p.state !== 'live') return;
    p.state = 'failed';
    const name = displayName(p.who[0]);
    const text = p.id === 'dwight' ? VERDICT.problems.dwight.failed : p.id === 'row' ? VERDICT.problems.row.failed : VERDICT.problems.leak.failed(name);
    this.c.sim.narrate(text, { icon: 'inspector', beat: true });
  }

  private liveProblemOf(who: CharId | undefined): Problem | undefined {
    if (!who || !isCastId(who)) return undefined;
    return this.problems.find((p) => p.state === 'live' && p.who.includes(who));
  }

  onAction(a: PlayerAction): void {
    if (this.c.main() !== 'open') return;
    const s = this.c.sim;
    if ((a.kind === 'whisper' || a.kind === 'cue') && a.who) {
      if (a.who === 'michael') this.aboutMichael(a);
      const p = this.liveProblemOf(a.who);
      if (p) this.fix(p, 'talk');
    }
    if (a.kind === 'announce' && a.text) {
      const touring = this.started && !!s.person(INSPECTOR)?.present;
      if (touring && DESKS_RE.test(a.text)) this.recall(true);
      else if (this.holds() && ROOM_WORD_RE.test(a.text)) s.narrate(VERDICT.ignoresAnnounce, { icon: 'announce', beat: true });
    }
  }

  onPickedUp(who: CharId): void {
    if (this.c.main() !== 'open') return;
    const p = this.liveProblemOf(who);
    if (p && p.id !== 'sulk') this.fix(p, 'pickup');
  }

  onChaosStart(e: ChaosStartInfo): void {
    if (this.c.main() !== 'open') return;
    const s = this.c.sim;
    for (const p of this.problems) {
      if (p.state !== 'live') continue;
      const targeted = p.who.some((id) => id === e.target.who || id === e.target.other);
      const inRoom = !!e.room && p.who.some((id) => s.person(id)?.room === e.room) && (e.id === 'sleep' || e.id === 'timeFreeze');
      if (p.id === 'sulk' ? targeted && (e.id === 'birthday' || e.id === 'puppy' || e.id === 'espresso') : targeted || inRoom) this.fix(p, 'power');
      if (p.id === 'sulk' && (e.id === 'puppy' || e.id === 'pizza') && e.room === 'kitchen') this.fix(p, 'power');
    }
  }

  // ── the tour ──

  private tourBegins(): void {
    const s = this.c.sim;
    for (const b of this.bonuses) s.narrate(b.text, { icon: 'check', beat: true });
    this.recall(false);
  }

  /** Everyone not otherwise engaged goes back to their desk (on the inspector's arrival, or an announcement during the tour). */
  private recall(announced: boolean): void {
    const s = this.c.sim;
    const busy = new Set(this.problems.filter((p) => p.state === 'live' && (p.id !== 'row' || !announced)).flatMap((p) => p.who));
    for (const p of s.people()) {
      if (!p.isCast || p.id === 'michael' || !p.present || busy.has(p.id as CastId) || s.isSeized(p.id) || s.isAirborne(p.id)) continue;
      if (!announced && (p.doing === VERDICT.listening || p.doing === VERDICT.goingToListen)) continue;
      if (!p.available || p.sceneId) continue;
      if (this.atDesk(p.id as CastId)) continue;
      s.goTo(p.id, { anchor: `desk.${p.id}` }, { style: announced ? 'run' : 'walk', doing: VERDICT.recallDoing, stay: 80, stayDoing: 'working at the desk' });
    }
    if (announced) {
      const row = this.problem('row');
      if (row?.state === 'live') this.fix(row, 'talk');
      s.narrate(VERDICT.recall, { icon: 'announce', beat: true });
    }
  }

  private atDesk(id: CastId): boolean {
    const p = this.c.sim.person(id);
    if (!onFloor(this.c, p)) return false;
    return /\bdesk\b/i.test(p.doing) && !p.doing.includes('hurrying') ? true : near(p, feetOf(deskOf(id).tile), 24);
  }

  /** How a stop looks right now: share of desks filled (0..1), or Michael in his office (0 or 1). */
  measure(i: number): number {
    const s = this.c.sim;
    if (i === 0) return BULLPEN_STAFF.filter((id) => this.atDesk(id)).length / BULLPEN_STAFF.length;
    if (i === 1) return ACCOUNTS_STAFF.filter((id) => this.atDesk(id)).length / ACCOUNTS_STAFF.length;
    const m = s.person('michael');
    return onFloor(this.c, m) && m.room === 'boss' ? 1 : 0;
  }

  private scoreStop(i: number): void {
    const v = this.measure(i);
    this.scores[i] = v;
    let line: string;
    if (i === 0) line = VERDICT.bullpen(Math.round(v * BULLPEN_STAFF.length), BULLPEN_STAFF.length, Math.round(INSPECTION_POINTS.bullpen * v));
    else if (i === 1) {
      line = VERDICT.accounting(Math.round(v * ACCOUNTS_STAFF.length), ACCOUNTS_STAFF.length, Math.round(INSPECTION_POINTS.accounts * v));
      const row = this.problem('row');
      if (row?.state === 'live') this.fail(row);
    } else {
      // Held up in the air for the whole tour is not "waiting in his office".
      this.dangling = !!this.c.sim.person('michael')?.present && (this.c.sim.holding === 'michael' || this.c.sim.isAirborne('michael'));
      line = this.dangling ? VERDICT.dangling : VERDICT.michael(v === 1);
    }
    this.stopLines[i] = line;
    this.c.sim.narrate(line, { icon: 'inspector', beat: true });
  }

  private finish(): void {
    if (this.total !== null) return;
    const s = this.c.sim;
    for (let i = 0; i < 3; i++) if (this.scores[i] === null) this.scoreStop(i);
    const calm = s.incidentsToday === this.incidentsAt;
    // A row nobody stopped is seen even if the tour was cut short.
    const row = this.problem('row');
    if (row?.state === 'live') this.fail(row);
    const failed = this.problems.filter((p) => p.state === 'failed');
    const penalty = failed.reduce((sum, p) => sum + (p.id === 'leak' ? INSPECTION_POINTS.lastPage : INSPECTION_POINTS.problem), 0) + (this.dangling ? INSPECTION_POINTS.problem : 0);
    const bonus = this.bonuses.reduce((sum, b) => sum + b.pts, 0);
    const sc = this.scores.map((v) => v ?? 0);
    const raw = INSPECTION_POINTS.bullpen * sc[0] + INSPECTION_POINTS.accounts * sc[1] + INSPECTION_POINTS.michael * sc[2] + (calm ? INSPECTION_POINTS.calm : 0) - penalty + bonus;
    const total = Math.max(0, Math.min(100, Math.round(raw)));
    this.total = total;
    const n = this.c.notes;
    n.inspection = total;
    const went = this.problems.filter((p) => p.state !== 'waiting');
    n.tour = { of: went.length, fixed: went.filter((p) => p.state === 'fixed').length };
    n.speech = this.speech === 'during' ? 'during' : this.speech === 'after' || this.speech === 'afterGiven' ? 'after' : 'never';
    s.setFact('story.verdict', VERDICT.after(total));
    const calmLine = VERDICT.calm(calm);
    s.narrate(calmLine, { icon: 'inspector' });
    const pass = total >= INSPECTION_POINTS.pass;
    s.narrate(pass ? VERDICT.passed(total) : VERDICT.failed(total), { icon: 'inspector', beat: true });
    this.c.setExtra('spotless', total >= 90 ? 'won' : 'lost');
    if (this.speech === 'cancelled' || this.speech === 'planned' || this.speech === 'during') this.c.setExtra('ovation', 'lost');
    const lines = [
      pass ? VERDICT.passed(total) : VERDICT.failed(total),
      [...this.stopLines.filter(Boolean), calmLine].join(' '),
      [...failed.map((p) => (p.id === 'dwight' ? VERDICT.problems.dwight.failed : p.id === 'row' ? VERDICT.problems.row.failed : VERDICT.problems.leak.failed(displayName(p.who[0])))), ...this.bonuses.map((b) => b.text)].join(' ')
    ].filter(Boolean);
    this.leftAt = s.time;
    if (pass) this.c.win(lines);
    else this.c.lose(lines);
  }

  /** Once the inspector has gone: the speech, if Michael saved it for afterwards. */
  private afterTheTour(): void {
    const s = this.c.sim;
    if (this.total === null) return;
    if (this.speech === 'after' && this.afterSpeechAt < 0) {
      this.afterSpeechAt = s.time + 6;
      s.goTo('michael', { room: 'kitchen' }, { doing: VERDICT.hurrying, stay: 60, stayDoing: VERDICT.practising });
    }
    if (this.speech === 'after' && this.afterSpeechAt >= 0 && s.time >= this.afterSpeechAt) {
      const m = s.person('michael');
      if (m && m.present && (m.room === 'kitchen' || s.time > this.afterSpeechAt + 25) && !m.sceneId) this.giveSpeech(true);
    }
    if (this.ovationAt >= 0 && s.time >= this.ovationAt && this.c.extra('ovation') === 'open') {
      this.ovationAt = -1;
      const n = s.peopleIn('kitchen').filter((p) => p.isCast && p.id !== 'michael' && p.present).length;
      if (n >= 8) {
        s.narrate(VERDICT.ovation(n), { icon: 'announce', room: 'kitchen', beat: true });
        for (const p of s.peopleIn('kitchen')) if (p.isCast && p.id !== 'michael') s.react(p.id, 'cheer', 1.5);
        this.c.setExtra('ovation', 'won');
      } else this.c.setExtra('ovation', 'lost');
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

  /** Nothing left to change, unless Michael's speech after the tour is still to come. */
  settled(): boolean {
    return this.c.main() !== 'open' && !(this.speech === 'after' && this.c.extra('ovation') === 'open');
  }

  topics(): string[] {
    if (this.total !== null) return [VERDICT.after(this.total)];
    if (this.started) return [VERDICT.topics.tour];
    return this.holds() ? [VERDICT.topics.before, VERDICT.topics.speech] : [VERDICT.topics.before];
  }

  warns(): Partial<Record<ActionId, string>> {
    if (this.c.main() !== 'open') return {};
    const out: Partial<Record<ActionId, string>> = {};
    for (const id of Object.keys(CHAOS) as ChaosId[]) if (CHAOS[id].incident) out[id] = VERDICT.warns.disaster;
    return out;
  }

  stakes(): number {
    const s = this.c.sim;
    if (this.total !== null) return 0.15;
    if (this.started) return 0.95;
    return s.clock >= DAY(12, 30) ? 0.65 : 0.3;
  }

  /** Read by tests. */
  get score(): number | null {
    return this.total;
  }

  /** Read by tests. */
  get state(): { speech: string; problems: { id: string; state: string }[]; stops: (number | null)[] } {
    return { speech: this.speech, problems: this.problems.map((p) => ({ id: p.id, state: p.state })), stops: [...this.scores] };
  }

  pinned(who: CharId): boolean {
    return who === 'michael' && (this.holds() || this.toOffice || this.speech === 'after');
  }
}

// ── The week ─────────────────────────────────────────────────────────────────

/** Friday's card: what carried over from earlier in the week (at most two short sentences). */
function fridayRecap(n: WeekNotes): string | null {
  const out: string[] = [];
  if (n.leakFound === true && n.leak) out.push(VERDICT.recap.caught(displayName(n.leak)));
  else if (n.leakFound === false && n.leak) out.push(VERDICT.recap.escaped(displayName(n.leak)));
  if (n.wronged?.length) out.push(VERDICT.recap.wronged(displayName(n.wronged[0])));
  if (n.accounts === false) out.push(VERDICT.recap.row);
  else if (n.accounts === true) out.push(VERDICT.recap.calm);
  if (n.figgis === true) out.push(VERDICT.recap.figgis);
  return out.length ? out.slice(0, 2).join(' ') : null;
}

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
    chapter: 4, weekday: 'Thursday', title: LEAK.title, intro: LEAK.intro, hints: LEAK.hints, help: LEAK.help, goal: LEAK.goal,
    extras: [{ ...LEAK.extras[0], atFive: 'lost' }, { ...LEAK.extras[1], atFive: 'lost' }],
    locked: {}, change: [LEAK.changeWon, LEAK.changeLost], suggest: LEAK.suggest,
    // Today the tests that settle it outright are dear.
    costs: { truth: 4, secretLeak: 4 },
    recap: (n) => (n.figgis === true ? LEAK.recapQuiet : n.figgis === false ? LEAK.recapBusy : null),
    create: (c) => new LeakRun(c)
  },
  {
    chapter: 5, weekday: 'Friday', title: VERDICT.title, intro: VERDICT.intro, hints: VERDICT.hints, help: VERDICT.help, goal: VERDICT.goal,
    extras: [{ ...VERDICT.extras[0], atFive: 'lost' }, { ...VERDICT.extras[1], atFive: 'lost' }],
    locked: { inspector: VERDICT.locked }, change: [VERDICT.changeWon, VERDICT.changeLost], suggest: VERDICT.suggest,
    recap: fridayRecap,
    create: (c) => new VerdictRun(c)
  }
];

/** True things from earlier in the week, set again each morning (the sim forgets facts overnight). */
export function weekFacts(notes: WeekNotes, chapter: number): [string, string][] {
  const out: [string, string][] = [];
  if (chapter >= 2 && notes.closureKnown) out.push(['story.closure', MEMO.closure]);
  if (chapter >= 3 && notes.accounts !== undefined) out.push(['story.accounts', notes.accounts ? ROW.madeUp : ROW.lateFact]);
  if (chapter >= 4 && notes.figgis !== undefined) out.push(['story.figgis', notes.figgis ? CLIENT.signedFact : CLIENT.goneFact]);
  if (chapter >= 5 && notes.leakFound !== undefined) out.push(['story.leakCaught', notes.leakFound ? LEAK.caughtFact(displayName(notes.leak)) : LEAK.notCaughtFact]);
  if (chapter >= 5 && notes.wronged?.length) out.push(['story.leakWrong', LEAK.wrongFact(notes.wronged.map((id) => displayName(id)).join(' and '))]);
  return out;
}

export type { RoomId };
