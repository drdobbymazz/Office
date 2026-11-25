// Episode 3, "Inside Job": three days in the ordinary office. Wednesday the office
// learns the three numbers of Ms Vane's lock, Thursday it switches the tapes while she
// is out of the conference room, Friday it keeps its story straight under her questions
// until the screening at two. Words are in heistText.ts; every number worth tuning is a
// named constant at the top of its day.

import type { ActionId } from '@/game/app/gameApi';
import { CAST, registerVisitor } from '@/game/core/cast';
import type { SimPerson } from '@/game/core/simApi';
import type { CastId, ChaosId, CharId, RoomId, Tile } from '@/game/core/types';
import { formatClock, isCastId } from '@/game/core/types';
import { TILE, anchor, feetOf } from '@/game/core/world';
import type { Sim } from '@/game/sim';
import {
  COMBO, HEIST_FACTS, LOW_NERVE, SCREENING, SWITCH, VANE, heistName,
} from './heistText';
import type { ChapterCtx, ChapterDef, ChapterRun, ChaosStartInfo, PlayerAction, ScriptLine, WeekNotes } from './types';

export { VANE };

const DAY = (h: number, m = 0): number => h * 60 + m;
const nameOf = heistName;

/** Ms Vane from Corporate Communications. Registered by each day (and the opening and ending scenes). */
export function registerVane(): void {
  registerVisitor({
    id: VANE,
    name: 'Ms Vane',
    role: 'Corporate Communications',
    color: 0x7a3b52,
    voice: { pitch: 205, wave: 'triangle', spread: 0.8, speed: 1.15 },
    summary: 'Ms Vane from Corporate Communications, in Scranton until Friday with a locked briefcase. Brisk, polite, and misses nothing.',
    wants: 'a tidy screening on Friday at two and no surprises',
    fears: 'anyone touching her case',
    quirk: 'taps the lock on her briefcase when she is thinking',
    look: { skin: 'light', hair: [44, 30, 26], outfit: [62, 58, 74], trim: [176, 48, 72], style: 'blouse', hairStyle: 'styleBun' },
  });
}

// ── shared helpers ───────────────────────────────────────────────────────────

/** In the building, on the floor, and not in the player's hand or the air. */
function onFloor(s: Sim, p: SimPerson | undefined): p is SimPerson {
  return !!p && p.present && s.holding !== p.id && !s.isAirborne(p.id);
}

/** Awake and able to act: not asleep, frozen, abducted or otherwise held by a power. */
function awake(s: Sim, p: SimPerson): boolean {
  return !s.isSeized(p.id) && !s.hasStatus(p.id, 'asleep');
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function staffOnFloor(s: Sim): SimPerson[] {
  return s.people().filter((p) => p.isCast && onFloor(s, p));
}

/** Sim seconds until a clock time today, from the day's measured pace. */
class Pace {
  private t0 = 0;
  private c0 = 0;
  constructor(private s: Sim) {
    this.t0 = s.time;
    this.c0 = s.clock;
  }
  secondsUntil(clock: number): number {
    const s = this.s;
    const dt = s.time - this.t0;
    const rate = dt > 5 ? (s.clock - this.c0) / dt : 0.8;
    return Math.max(0, (clock - s.clock) / Math.max(0.05, rate));
  }
}

/** Ms Vane's place in the conference room: the head of the table. */
const VANE_BASE = 'spot.meetHead';
const VANE_ARRIVES = DAY(9, 10);
/** Close to her: "about two and a half tiles". */
const NEAR_VANE = 2.5 * TILE;
/** She has got where she was going within this distance of it. */
const ARRIVED = 1 * TILE;
/** How often her walks are checked and, if something knocked her off course, set again (sim seconds). */
const STEER_EVERY = 3;

/**
 * Ms Vane's errands: one place to be at a time. Something may knock her off course (a scene, a power,
 * the player's hand); every few seconds she is set walking again if she is free and not there yet.
 */
class VaneWalker {
  target: string | null = null;
  doing = '';
  private steerAt = 0;
  arrived = false;

  constructor(private s: Sim) {}

  get p(): SimPerson | undefined {
    const p = this.s.person(VANE);
    return p && p.present ? p : undefined;
  }

  go(anchorId: string, doing: string): void {
    this.target = anchorId;
    this.doing = doing;
    this.arrived = false;
    this.steerAt = 0;
    this.steer(true);
  }

  isNear(anchorId: string, r = ARRIVED): boolean {
    const p = this.p;
    return !!p && dist(p, feetOf(anchor(anchorId).tile)) <= r;
  }

  /** Call every frame. */
  steer(force = false): void {
    const s = this.s;
    const p = this.p;
    if (!p || !this.target) return;
    if (this.isNear(this.target)) {
      this.arrived = true;
      return;
    }
    if (!force && s.time < this.steerAt) return;
    this.steerAt = s.time + STEER_EVERY;
    if (!onFloor(s, p) || s.isSeized(VANE) || p.sceneId) return;
    // Already walking there: leave her be.
    if (!force && p.doing === `heading for ${this.doing}`) return;
    s.goTo(VANE, { anchor: this.target }, { style: 'walk', doing: `heading for ${this.doing}`, stay: 100000, stayDoing: this.doing, braveHazard: false });
  }
}

/** Put down near Ms Vane (or where she is about to be), people hang about there for this long (sim seconds). */
const LINGER = 30;
/** "Near" for that: within this many pixels. */
const LINGER_NEAR = 3.5 * TILE;

/**
 * The player's hand: who has just been set down, reported once they have landed. Someone dropped beside
 * Ms Vane, or where she is heading, stays there a while instead of walking straight back to their desk,
 * so placing people is a plan the player can make.
 */
class Landings {
  private wasHeld: CharId | null = null;
  private due: { who: CharId; at: number }[] = [];

  constructor(private s: Sim, private onLand: (who: CharId) => void) {}

  update(): void {
    const s = this.s;
    keepLingerers(s);
    if (this.wasHeld && this.wasHeld !== s.holding) this.due.push({ who: this.wasHeld, at: s.time + 1.2 });
    this.wasHeld = s.holding;
    if (!this.due.length) return;
    const now = this.due.filter((d) => d.at <= s.time);
    this.due = this.due.filter((d) => d.at > s.time);
    for (const d of now) this.onLand(d.who);
  }
}

/** People the player has put somewhere to wait: where, until when, and what they are doing. */
const lingering = new WeakMap<Sim, Map<CharId, { tile: Tile; until: number; doing: string }>>();

/** Keep someone just set down near Ms Vane or near `spot` where they are for a while. */
function lingerIfNear(s: Sim, who: CharId, spot: { x: number; y: number } | null, doing: string): boolean {
  const p = s.person(who);
  const v = s.person(VANE);
  if (!p || !p.isCast || !onFloor(s, p) || !awake(s, p)) return false;
  const close = (v && v.present && dist(p, v) <= LINGER_NEAR) || (spot && dist(p, spot) <= LINGER_NEAR);
  if (!close) return false;
  holdThere(s, who, p.tile, LINGER, doing);
  return true;
}

/** Send someone to a tile to wait there for a while, safe from passing chats (not from the player). */
function holdThere(s: Sim, who: CharId, tile: Tile, secs: number, doing: string, walking = doing): void {
  s.goTo(who, { tile }, { style: 'walk', doing: walking, stay: secs, stayDoing: doing });
  let m = lingering.get(s);
  if (!m) lingering.set(s, (m = new Map()));
  m.set(who, { tile, until: s.time + secs, doing });
}

/** Someone put somewhere to wait is not walked off by a passing chat (the player can still move them). */
function keepLingerers(s: Sim): void {
  const m = lingering.get(s);
  if (!m) return;
  for (const [who, l] of m) {
    const p = s.person(who);
    if (!p || !p.present || s.time > l.until || s.isAirborne(who) || s.holding === who) {
      if (!p || s.time > l.until || s.holding === who) m.delete(who);
      continue;
    }
    if (p.sceneId && !s.isSeized(who)) s.goTo(who, { tile: l.tile }, { style: 'walk', doing: l.doing, stay: Math.max(1, l.until - s.time), stayDoing: l.doing });
  }
}

function spawnVane(c: ChapterCtx, walker: VaneWalker, prop: 'case' | null): void {
  const s = c.sim;
  registerVane();
  s.spawnVisitor(VANE, { anchor: 'exit.street' });
  if (prop) s.setProp(VANE, prop);
  const door = feetOf(anchor('door.entrance').tile);
  s.sfx('doorOpen', door.x);
  walker.go(VANE_BASE, 'sitting at the head of the conference table');
}

// ── Wednesday: The Combination ───────────────────────────────────────────────

interface Opening { at: number; place: 'kitchen' | 'meeting' | 'annex' | 'boss'; anchor: string }

/** Where and when she opens the case (clock minutes). */
export const COMBO_OPENINGS: readonly Opening[] = [
  { at: DAY(10, 15), place: 'kitchen', anchor: 'stand.coffee' },
  { at: DAY(11, 45), place: 'meeting', anchor: VANE_BASE },
  { at: DAY(13, 30), place: 'annex', anchor: 'spot.annex2' },
  { at: DAY(15, 0), place: 'boss', anchor: 'spot.boss3' },
];
/** She sets off this many clock minutes before an opening (and waits there until it is time). */
const SET_OFF_BEFORE = 10;
/** If she has not got there by this many clock minutes after the time, she opens it where she is. */
const OPEN_LATEST = 4;
/** Moving less than this (px per frame) is standing, not walking past. */
const STANDING_PX = 1.5;
/** Sim seconds the case stays open (a watcher is held in place this long). */
export const OPEN_SECS = 5;
/** The skip-ahead stops this many clock minutes before an opening. */
const BEAT_BEFORE = 14;
const NUMBERS = 3;

class CombinationRun implements ChapterRun {
  private walker: VaneWalker;
  private spawned = false;
  private next = 0;
  private phase: 'base' | 'going' | 'open' = 'base';
  private openedAt = 0;
  private watcher: CharId | null = null;
  private watcherLost = false;
  private digits: number[] = [];
  private known = 0;
  private seen = new Set<CharId>();
  private strikes = 0;
  private truthNext = false;
  private propAt = 0;
  private hands: Landings;
  private lastPos = new Map<CharId, { x: number; y: number }>();

  constructor(private c: ChapterCtx) {
    this.walker = new VaneWalker(c.sim);
    this.hands = new Landings(c.sim, (who) => {
      if (who === VANE || who === this.watcher) return;
      const o = COMBO_OPENINGS[this.next];
      lingerIfNear(c.sim, who, o ? feetOf(anchor(o.anchor).tile) : null, 'hovering near Ms Vane');
    });
  }

  setup(): void {
    registerVane();
    const s = this.c.sim;
    this.digits = Array.from({ length: NUMBERS }, () => this.c.rng.int(0, 9));
    s.setFact('heist.today', 'Ms Vane opens her locked case a few times today. Whoever sees over her shoulder can learn one of its three numbers.');
    s.setProp('michael', 'tape');
  }

  private get vane(): SimPerson | undefined {
    return this.walker.p;
  }

  update(dt: number): void {
    const s = this.c.sim;
    if (!this.spawned && s.clock >= VANE_ARRIVES && s.clock < DAY(16, 30)) this.spawn();
    if (!this.spawned) return;
    this.hands.update();
    const v = this.vane;
    if (v && s.time >= this.propAt) {
      // Routines and powers can take things out of people's hands: the case stays in hers.
      this.propAt = s.time + 1;
      s.setProp(VANE, 'case');
    }
    if (this.c.main() !== 'open') {
      this.walker.steer();
      return;
    }
    const o = COMBO_OPENINGS[this.next];
    if (!o) return;
    if (this.phase === 'base' && s.clock >= o.at - SET_OFF_BEFORE) {
      this.phase = 'going';
      this.walker.go(o.anchor, o.place === 'kitchen' ? 'drinking a coffee by the machine' : o.place === 'annex' ? 'copying a label at the copier' : o.place === 'boss' ? "reporting to Michael in his office" : 'sitting at the head of the conference table');
      s.narrate(COMBO.heading(COMBO.places[o.place], formatClock(o.at)), { icon: 'lock', room: o.place, beat: true });
    }
    if (this.phase === 'going') {
      this.walker.steer();
      const free = !!v && onFloor(s, v) && awake(s, v);
      if (free && ((this.walker.arrived && s.clock >= o.at) || s.clock >= o.at + OPEN_LATEST)) this.open(o);
      this.notePositions();
      return;
    }
    if (this.phase === 'open') {
      if (s.time - this.openedAt >= OPEN_SECS) this.shut(o);
      return;
    }
    this.walker.steer();
    void dt;
  }

  private spawn(): void {
    const s = this.c.sim;
    this.spawned = true;
    spawnVane(this.c, this.walker, 'case');
    s.narrate(COMBO.arrive, { icon: 'inspector', room: 'bullpen', beat: true, slow: true });
    s.remember('all', 'Ms Vane from Corporate came in with a locked briefcase. The wrong tape is inside it.', 1.5);
    this.c.after(4, () => this.c.script([COMBO.lines.arrive, COMBO.lines.michael], { room: 'bullpen', then: 'none' }));
  }

  /** Everyone who could see over her shoulder now: staff standing close (not walking past), on the floor, awake, not Michael. */
  private watchers(): SimPerson[] {
    const s = this.c.sim;
    const v = this.vane;
    if (!v) return [];
    return s.peopleNear(v.x, v.y, NEAR_VANE).filter((p) => p.isCast && p.id !== 'michael' && onFloor(s, p) && awake(s, p) && this.standing(p));
  }

  private standing(p: SimPerson): boolean {
    const was = this.lastPos.get(p.id);
    return !was || dist(p, was) < STANDING_PX;
  }

  private notePositions(): void {
    for (const p of this.c.sim.people()) if (p.isCast && p.present) this.lastPos.set(p.id, { x: p.x, y: p.y });
  }

  private open(o: Opening): void {
    const s = this.c.sim;
    const v = this.vane;
    if (!v) return;
    this.phase = 'open';
    this.openedAt = s.time;
    this.watcher = null;
    this.watcherLost = false;
    s.react(VANE, 'operate', OPEN_SECS);
    s.sfx('ding', v.x);
    const place = COMBO.places[o.place];
    if (this.truthNext) {
      this.truthNext = false;
      const heard = s.peopleIn(v.room).filter((p) => p.isCast && p.present && awake(s, p));
      if (heard.length) {
        const digit = this.learn();
        for (const p of heard) s.remember([p.id], `Ms Vane read one of the numbers of her lock out loud: ${digit}.`, 1.5);
        s.say(VANE, `${digit}. Oh. Did I say that out loud?`, { emotion: 'surprised' });
        s.narrate(COMBO.truthSaid(digit, heard.map((p) => p.name), this.known), { icon: 'truth', room: v.room, beat: true });
      } else {
        s.narrate(COMBO.truthNobody, { icon: 'truth', room: v.room, beat: true });
      }
      return;
    }
    const near = this.watchers();
    if (near.length >= 2) {
      s.say(VANE, COMBO.lines.turnsBack, { emotion: 'suspicious' });
      s.narrate(COMBO.crowd(near.map((p) => p.name)), { icon: 'people', room: v.room, beat: true });
      return;
    }
    if (near.length === 1) {
      const w = near[0];
      if (this.seen.has(w.id)) {
        this.strikes += 1;
        s.face(VANE, w.id);
        s.say(VANE, COMBO.lines.hovering, { emotion: 'suspicious', to: w.id });
        s.feel(w.id, 'embarrassed', 0.7, 6);
        s.narrate(COMBO.caught(w.name), { icon: 'inspector', room: v.room, beat: true });
        this.c.setExtra('unseen', 'lost');
        return;
      }
      this.watcher = w.id;
      // Held for the few seconds it takes, so they do not wander off mid-look.
      s.goTo(w.id, { tile: w.tile }, { style: 'walk', doing: 'reading something over Ms Vane\'s shoulder', stay: OPEN_SECS + 1.5, stayDoing: 'reading something over Ms Vane\'s shoulder' });
      s.face(w.id, VANE);
      s.narrate(COMBO.opens(place), { icon: 'lock', room: v.room });
      return;
    }
    s.say(VANE, COMBO.lines.open[o.place] ?? COMBO.lines.open.meeting, { emotion: 'neutral' });
    s.narrate(COMBO.nobody(place), { icon: 'lock', room: v.room, beat: true });
  }

  private learn(): number {
    const digit = this.digits[Math.min(this.known, NUMBERS - 1)];
    this.known = Math.min(NUMBERS, this.known + 1);
    this.c.notes.heistDigits = this.known;
    return digit;
  }

  private shut(o: Opening): void {
    const s = this.c.sim;
    this.phase = 'base';
    this.next += 1;
    const w = this.watcher ? s.person(this.watcher) : undefined;
    if (w && this.watcher) {
      // Only the player's hand can spoil a look once it has begun (a chat that drifts them a step away does not).
      const ok = !this.watcherLost && w.present && !s.isAirborne(w.id);
      if (ok) {
        const digit = this.learn();
        this.seen.add(w.id);
        s.say(w.id, COMBO.lines.seen(digit), { kind: 'think', emotion: 'mischievous' });
        s.remember([w.id], `I saw one of the numbers of Ms Vane's lock over her shoulder: ${digit}.`, 2);
        s.narrate(COMBO.saw(w.name, digit, this.known), { icon: 'lock', room: o.place, beat: true });
        s.sfx('objective', w.x);
      } else {
        s.narrate(COMBO.carried(w.name), { icon: 'lock', room: o.place, beat: true });
      }
      if (onFloor(s, w)) s.resume(w.id);
    }
    this.watcher = null;
    this.walker.go(VANE_BASE, 'sitting at the head of the conference table');
    this.checkEnd();
  }

  private checkEnd(): void {
    if (this.c.main() !== 'open') return;
    const left = COMBO_OPENINGS.length - this.next;
    if (this.known >= NUMBERS) {
      this.c.notes.heistCode = true;
      this.c.notes.heistDigits = NUMBERS;
      if (this.c.extra('unseen') === 'open' && this.strikes === 0) this.c.setExtra('unseen', 'won');
      this.c.sim.setFact('heist.today', 'The office knows all three numbers of the lock on Ms Vane\'s case. She has no idea.');
      this.c.sim.narrate(COMBO.won, { icon: 'lock', room: 'meeting', beat: true });
      this.c.win([COMBO.won]);
      return;
    }
    if (this.known + left < NUMBERS) {
      this.c.notes.heistCode = false;
      this.c.notes.heistDigits = this.known;
      const text = left === 0 ? COMBO.lost(this.known) : COMBO.lostEarly(this.known, left);
      this.c.sim.narrate(text, { icon: 'warn', room: 'meeting', beat: true });
      this.c.lose([text]);
    }
  }

  atFive(): void {
    if (this.c.main() !== 'open') return;
    this.c.notes.heistCode = false;
    this.c.notes.heistDigits = this.known;
    this.c.lose([COMBO.lost(this.known)]);
  }

  onPickedUp(who: CharId): void {
    const s = this.c.sim;
    if (who === this.watcher) this.watcherLost = true;
    if (who === VANE && this.phase === 'open' && this.c.main() === 'open') {
      // Lifted off her feet mid-look: the case snaps shut, and nobody sees anything.
      if (this.watcher) this.watcherLost = true;
      s.narrate(COMBO.grabbed, { icon: 'lock', beat: true });
    }
  }

  onChaosStart(e: ChaosStartInfo): void {
    if (e.id === 'truth' && e.target.who === VANE && this.c.main() === 'open') {
      this.truthNext = true;
      this.c.sim.narrate(COMBO.truthOn, { icon: 'truth', beat: true });
    }
  }

  pinned(who: CharId): boolean {
    return who === VANE || (this.phase === 'open' && who === this.watcher);
  }

  nextBeat(): number | null {
    const s = this.c.sim;
    if (this.phase !== 'base') return null;
    const o = COMBO_OPENINGS[this.next];
    if (!o) return null;
    const t = o.at - BEAT_BEFORE;
    return s.clock < t ? t : null;
  }

  private digitsText(): string {
    if (!this.known) return '';
    const shown = this.digits.map((d, i) => (i < this.known ? String(d) : '?'));
    return ` (${shown.join(', ')})`;
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    const progress = this.known / NUMBERS;
    if (st === 'won') return { progress: 1, status: `${COMBO.status.won}${this.digitsText()}` };
    if (st === 'lost') return { progress, status: COMBO.status.lost(this.known) };
    if (!this.spawned) return { progress, status: COMBO.status.waiting };
    const o = COMBO_OPENINGS[this.next];
    if (!o) return { progress, status: COMBO.status.lost(this.known) };
    if (this.phase === 'open') return { progress, status: COMBO.status.now(this.known, COMBO.places[o.place]) };
    return { progress, status: COMBO.status.next(this.known, this.digitsText(), COMBO.places[o.place], formatClock(o.at)) };
  }

  marks(): { id: CharId; label?: string }[] {
    return this.vane ? [{ id: VANE, label: 'has the case' }] : [];
  }

  topics(): string[] {
    return COMBO.topics;
  }

  stakes(): number {
    if (this.c.main() !== 'open') return 0;
    if (this.phase === 'open') return 1;
    return this.phase === 'going' ? 0.7 : 0.25;
  }

  /** For tests: the numbers and who has seen one. */
  get numbers(): { known: number; digits: number[]; seen: CharId[]; strikes: number; next: number; phase: string; arrived: boolean } {
    return { arrived: this.walker.arrived, known: this.known, digits: [...this.digits], seen: [...this.seen], strikes: this.strikes, next: this.next, phase: this.phase };
  }
}

// ── The switch (Thursday, and Friday when Thursday did not manage it) ───────

/** The case, cabled to the conference table. */
export const CASE_TILE: Tile = { x: 12, y: 5 };
/** Beside the case: within this many pixels of it. */
const BESIDE = 2.6 * TILE;
/** Sim seconds of uninterrupted work at the case: with the code, and picking the lock without it. */
export const SWITCH_SECS = { code: 10, pick: 26 } as const;
/** Some hands are quicker than others (a multiplier on the time). */
export const HANDS: Partial<Record<CastId, number>> = { dwight: 0.7, creed: 0.7, kevin: 1.5, michael: 1.5 };
/** Triple Espresso speeds anyone up. */
const ESPRESSO = 0.6;
/** Where whoever has the tape waits when told to wait by the conference room. */
export const WAIT_TILE: Tile = { x: 14, y: 9 };
/** Sim seconds the tape holder waits where they were put down, or where they were told to wait. */
const HOLDER_WAITS = 75;
/** A handover happens within this distance. */
const HAND_REACH = 2.5 * TILE;
/** Someone told to fetch the tape gives up after this long (sim seconds). */
const FETCH_FOR = 60;
/** Set down, someone counts as dropped beside another once they have landed (sim seconds). */
const LAND_AFTER = 2;
/** Picked up while awake, Ms Vane watches the case like a hawk for this long (sim seconds). */
const WATCHFUL = 15;
/** Near misses allowed: the next one loses the case. */
const NEAR_MISSES = 2;
// "Steal the tape" is the same hand-over: everyone is in on the caper, so the holder simply passes it on.
const TAPE_RE = /\b(take|get|grab|fetch|collect|pick up|bring|carry|hold|keep|swap|switch|steal|snatch|swipe)\b[^.?!]*\btapes?\b|\btapes?\b[^.?!]*\bfrom\b/i;
const TAPE_WORD_RE = /\btapes?\b/i;
const TAPE_FROM_RE = /\btapes?\b[^.?!]*\b(from|off)\b/i;
const WAIT_RE = /\b(wait|conference|meeting room|door|stand by|outside)\b/i;
const SWAP_RE = /\b(swap|switch|change)\b/i;
/** Standing at her case while she watches: after this long she sends them away (sim seconds). */
const SHOO_AFTER = 3;
/** Faster than this (px per second) is walking, not working. */
const STILL_SPEED = 12;
const WORKING = 'working at the case';
/** The tile beside the case where someone sent to it stands. */
export const CASE_SIDE: Tile = { x: 12, y: 7 };
const CASE_FX = 'heist.case';
const CASE_ITEM_FX = 'heist.case.item';

interface SwitchHooks {
  /** Ms Vane cannot see the case right now. */
  unwatched(): boolean;
  /** The case is on the table (not out with her in an emergency). */
  caseOnTable(): boolean;
  onSwitched(by: CharId): void;
  onNearMiss(by: CharId, count: number): void;
}

/**
 * Who has the tape, how it is passed on, and the work at the case. One general rule: the tape holder,
 * awake and beside the case, with Ms Vane not watching and no more than one other person in the room,
 * makes progress; leaving resets it; her eyes coming back while they are at it is a near miss.
 */
class TapeSwitch {
  holder: CharId | null = 'michael';
  wrong = false;
  done = false;
  progress = 0;
  nearMisses = 0;
  private wasHeld: CharId | null = null;
  private landings: { who: CharId; at: number }[] = [];
  private fetchers = new Map<CharId, { until: number; then: 'wait' | 'case' | null }>();
  private lastPos: { x: number; y: number } | null = null;
  private lingered = 0;
  private holdAt = 0;
  private propAt = 0;
  private startedAt = -1e9;
  private crowdAt = -1e9;
  private wasCrowded = false;

  constructor(private c: ChapterCtx, private need: number, private hooks: SwitchHooks) {}

  start(holder: CharId): void {
    this.holder = holder;
    this.c.sim.setProp(holder, 'tape');
  }

  /** Seconds this holder needs. */
  needFor(id: CharId): number {
    const s = this.c.sim;
    let k = HANDS[id as CastId] ?? 1;
    if (s.hasStatus(id, 'caffeinated')) k *= ESPRESSO;
    return this.need * k;
  }

  private holderP(): SimPerson | undefined {
    if (!this.holder) return undefined;
    const p = this.c.sim.person(this.holder);
    return p && p.present ? p : undefined;
  }

  /** At the case (wherever their mind is: asleep or frozen there still counts as there). */
  atCase(): boolean {
    const s = this.c.sim;
    const h = this.holderP();
    return !!h && h.present && s.holding !== h.id && h.room === 'meeting' && dist(h, feetOf(CASE_TILE)) <= BESIDE;
  }

  /** At the case and able to work on it. */
  beside(): boolean {
    const h = this.holderP();
    return !!h && this.atCase() && onFloor(this.c.sim, h) && awake(this.c.sim, h);
  }

  /** Others in the conference room who could see (awake, on the floor; not Ms Vane, not the holder). */
  others(): number {
    const s = this.c.sim;
    return s.peopleIn('meeting').filter((p) => p.present && p.id !== this.holder && p.id !== VANE && onFloor(s, p) && awake(s, p)).length;
  }

  crowded(): boolean {
    return this.others() > 1;
  }

  update(dt: number): void {
    const s = this.c.sim;
    this.watchHands();
    const h = this.holderP();
    if (h && s.time >= this.propAt) {
      this.propAt = s.time + 1;
      s.setProp(h.id, 'tape');
    }
    // Walking past is not working at it: only someone standing still at the case makes progress.
    const moved = h && this.lastPos && dt > 0 ? dist(h, this.lastPos) / dt : 0;
    this.lastPos = h ? { x: h.x, y: h.y } : null;
    this.fetch();
    if (this.done || !this.holder) return;
    const beside = this.beside() && this.hooks.caseOnTable();
    const unwatched = this.hooks.unwatched();
    if (!beside && this.atCase() && this.hooks.caseOnTable() && h && !awake(s, h)) {
      // Asleep or frozen at the case: the work waits for them (and she may still wake up first).
      if (!unwatched && this.progress > 0) this.nearMiss();
      return;
    }
    // At the case with the coast clear: a passing chat does not pull them away (the player's hand still can).
    if (beside && unwatched && h && h.sceneId) {
      s.goTo(h.id, { tile: h.tile }, { style: 'walk', doing: WORKING, stay: 40, stayDoing: WORKING });
    }
    if (!beside) {
      if (this.progress >= 2) s.narrate(SWITCH.reset(nameOf(this.holder)), { icon: 'play', room: 'meeting' });
      this.progress = 0;
      this.lingered = 0;
      this.wasCrowded = false;
      return;
    }
    if (!unwatched) {
      if (this.progress > 0) {
        this.nearMiss();
        return;
      }
      // Hanging about at her case while she sits there: she sends them off.
      const v = s.person(VANE);
      this.lingered += dt;
      if (this.lingered >= SHOO_AFTER && v && v.room === 'meeting' && awake(s, v) && h) {
        this.lingered = 0;
        s.say(VANE, SWITCH.lines.shoo, { emotion: 'suspicious', to: h.id });
        s.goTo(h.id, { tile: WAIT_TILE }, { style: 'walk', doing: 'stepping away from the case', stay: HOLDER_WAITS, stayDoing: this.wrong ? 'keeping the wrong tape out of sight' : 'waiting by the conference room door with the tape' });
      }
      return;
    }
    this.lingered = 0;
    if (moved > STILL_SPEED) return;
    if (this.crowded()) {
      if (!this.wasCrowded && s.time - this.crowdAt > 30) {
        this.crowdAt = s.time;
        s.narrate(SWITCH.crowded, { icon: 'people', room: 'meeting', beat: true });
      }
      this.wasCrowded = true;
      return;
    }
    this.wasCrowded = false;
    const before = this.progress;
    this.progress += dt;
    // At work on the lock: they stay put (a passing chat does not pull them away) until it is done.
    if (h && s.time >= this.holdAt && h.doing !== WORKING) {
      this.holdAt = s.time + 1;
      s.goTo(h.id, { tile: h.tile }, { style: 'walk', doing: WORKING, stay: 40, stayDoing: WORKING });
    }
    if (before < 1 && this.progress >= 1 && s.time - this.startedAt > 20) {
      this.startedAt = s.time;
      s.narrate(SWITCH.started(nameOf(this.holder), Math.round(this.needFor(this.holder))), { icon: 'play', room: 'meeting', beat: true });
      s.react(this.holder, 'operate', 2);
    }
    if (this.progress >= this.needFor(this.holder)) this.switched();
  }

  private switched(): void {
    const s = this.c.sim;
    const by = this.holder!;
    this.done = true;
    this.wrong = true;
    this.progress = 0;
    s.sfx('objective');
    s.say(by, SWITCH.lines.switched, { kind: 'whisper', emotion: 'mischievous' });
    s.narrate(SWITCH.switched(nameOf(by)), { icon: 'play', room: 'meeting', beat: true });
    s.remember('all', `${nameOf(by)} swapped the tapes in Ms Vane's case while she was out. The right tape is in the case now.`, 2);
    // Out of the room before she is back, with the wrong tape.
    s.goTo(by, { tile: WAIT_TILE }, { style: 'walk', doing: 'slipping out of the conference room', stay: 6 });
    this.hooks.onSwitched(by);
  }

  private nearMiss(): void {
    const s = this.c.sim;
    const by = this.holder!;
    this.progress = 0;
    this.nearMisses += 1;
    s.feel(by, 'nervous', 0.9, 10);
    s.feel(VANE, 'suspicious', 0.9, 20);
    this.c.script([
      { who: by, text: SWITCH.lines.bluff, emotion: 'nervous', to: VANE },
      { who: VANE, text: this.nearMisses >= NEAR_MISSES ? SWITCH.lines.caught : SWITCH.lines.vaneBluff, emotion: 'suspicious', to: by },
    ], { room: 'meeting', then: 'none' });
    if (onFloor(s, s.person(by))) s.goTo(by, { tile: WAIT_TILE }, { style: 'walk', doing: 'leaving the conference room quickly', stay: 8 });
    this.hooks.onNearMiss(by, this.nearMisses);
  }

  /** Someone set down beside the holder takes the tape; the holder set down waits where they are. */
  private watchHands(): void {
    const s = this.c.sim;
    const held = s.holding;
    if (this.wasHeld && this.wasHeld !== held) this.landings.push({ who: this.wasHeld, at: s.time + LAND_AFTER });
    this.wasHeld = held;
    if (!this.landings.length) return;
    const due = this.landings.filter((l) => l.at <= s.time);
    this.landings = this.landings.filter((l) => l.at > s.time);
    for (const l of due) this.landed(l.who);
  }

  private landed(who: CharId): void {
    const s = this.c.sim;
    const p = s.person(who);
    if (!p || !onFloor(s, p) || !this.holder) return;
    if (who === this.holder) {
      // Put down somewhere on purpose: they wait there (unless that is beside the case, where they get to work).
      if (awake(s, p)) holdThere(s, who, p.tile, HOLDER_WAITS, this.wrong ? 'keeping the wrong tape out of sight' : 'waiting with the tape');
      return;
    }
    const h = this.holderP();
    if (!p.isCast || !h || !onFloor(s, h) || dist(p, h) > HAND_REACH) return;
    this.handOver(who);
  }

  private fetch(): void {
    const s = this.c.sim;
    const h = this.holderP();
    for (const [who, f] of [...this.fetchers]) {
      const p = s.person(who);
      if (!p || !p.present || s.time > f.until || who === this.holder || !this.holder) {
        this.fetchers.delete(who);
        continue;
      }
      if (h && onFloor(s, p) && onFloor(s, h) && dist(p, h) <= HAND_REACH) {
        this.fetchers.delete(who);
        this.handOver(who);
        const then = f.then;
        if (then) this.c.after(1.5, () => this.sendTo(who, then));
        continue;
      }
      if (h && onFloor(s, p) && p.available && !p.sceneId && !(p.doing ?? '').startsWith('going to get the tape')) {
        s.goTo(who, { near: h.id }, { style: 'walk', doing: `going to get the tape from ${h.name}`, stay: 3 });
      }
    }
  }

  handOver(to: CharId): void {
    const s = this.c.sim;
    const from = this.holder;
    if (!from || from === to) return;
    s.setProp(from, null);
    s.setProp(to, 'tape');
    this.holder = to;
    this.progress = 0;
    this.propAt = s.time + 1;
    s.narrate(SWITCH.handover(nameOf(from), nameOf(to), this.wrong), { icon: 'play', room: s.person(to)?.room, beat: true });
    s.say(from, this.wrong ? 'Take this. Make it disappear.' : 'Here. Do not lose it.', { kind: 'whisper', emotion: 'nervous', to });
    s.remember([from, to], `${nameOf(from)} handed the ${this.wrong ? 'wrong' : 'right'} tape to ${nameOf(to)}.`, 1.5);
    const p = s.person(to);
    if (p && onFloor(s, p) && awake(s, p)) s.goTo(to, { tile: p.tile }, { style: 'walk', doing: 'tucking the tape away', stay: 6, stayDoing: 'tucking the tape away' });
  }

  onAction(a: PlayerAction): void {
    const s = this.c.sim;
    if ((a.kind !== 'whisper' && a.kind !== 'cue') || !a.who || !a.text || !this.holder) return;
    if (a.who === this.holder) {
      if (this.wrong) return;
      const who = a.who;
      if (SWAP_RE.test(a.text)) this.c.after(0.5, () => this.sendTo(who, 'case'));
      else if (WAIT_RE.test(a.text)) this.c.after(0.5, () => this.sendTo(who, 'wait'));
      return;
    }
    if (!isCastId(a.who) || !TAPE_RE.test(a.text)) return;
    // Once they have it, the rest of the sentence decides where they go, as it does for the holder.
    const then = SWAP_RE.test(a.text) ? 'case' : WAIT_RE.test(a.text) ? 'wait' : null;
    this.fetchers.set(a.who, { until: s.time + FETCH_FOR, then });
    s.narrate(SWITCH.fetch(nameOf(a.who), nameOf(this.holder)), { icon: 'whisper', room: s.person(a.who)?.room });
  }

  /**
   * True when this whisper or order is the chapter's to stage, so the director must not read anything
   * more into it. "Take the tape from Michael" means fetch it from whoever has it, never a theft. The
   * holder told to wait with the tape or swap the tapes goes where the chapter sends them, and told to
   * take it from someone they already have it. Only sentences about the tape count: "take the tape to
   * the annex" and anything else is staged as usual.
   */
  claims(a: PlayerAction): boolean {
    if ((a.kind !== 'whisper' && a.kind !== 'cue') || !a.who || !a.text || !this.holder) return false;
    if (a.who !== this.holder) return isCastId(a.who) && TAPE_RE.test(a.text);
    return (!this.wrong && TAPE_WORD_RE.test(a.text) && (SWAP_RE.test(a.text) || WAIT_RE.test(a.text))) || TAPE_FROM_RE.test(a.text);
  }

  /** Send whoever has the tape to wait outside the conference room door, or straight to the case. */
  sendTo(who: CharId, where: 'wait' | 'case'): void {
    const s = this.c.sim;
    if (this.holder !== who || this.wrong || !onFloor(s, s.person(who))) return;
    if (where === 'wait') holdThere(s, who, WAIT_TILE, HOLDER_WAITS, 'waiting by the conference room door with the tape', 'going to wait by the conference room');
    else holdThere(s, who, CASE_SIDE, HOLDER_WAITS, 'waiting at the case', 'heading for the case');
  }

  /** The wrong tape reaches the annex: shredded. */
  shredIfThere(): boolean {
    const h = this.holderP();
    if (!this.wrong || !h || h.room !== 'annex' || !onFloor(this.c.sim, h)) return false;
    const s = this.c.sim;
    s.setProp(h.id, null);
    s.sfx('glass', h.x);
    s.fx({ kind: 'burst', what: 'confetti', x: h.x, y: h.y - 16, count: 10 });
    s.narrate(SWITCH.shredded(h.name), { icon: 'secretLeak', room: 'annex', beat: true });
    this.holder = null;
    return true;
  }

  mark(): { id: CharId; label?: string } | null {
    return this.holder && this.holderP() ? { id: this.holder, label: SWITCH.tagHolder(this.wrong) } : null;
  }
}

/** Shows the case where it sits on the conference table: the briefcase itself, in a small warm light. */
function showCase(s: Sim, on: boolean): void {
  if (!on) {
    s.removeEffect(CASE_FX);
    s.removeEffect(CASE_ITEM_FX);
    return;
  }
  if (s.effect(CASE_FX)) return;
  const f = feetOf(CASE_TILE);
  s.addEffect({ id: CASE_FX, kind: 'light', x: f.x, y: f.y - 6, radius: 14, color: 0xffc46b });
  // Lifted off the floor line so it reads as lying on the tabletop, clear of the chairs.
  s.addEffect({ id: CASE_ITEM_FX, kind: 'item', item: 'briefcase', x: f.x, y: f.y - 13 });
}

/**
 * Ms Vane's eyes on the case: she is in the conference room, awake, not held by a power, and not
 * gazing at someone she has fallen for (who is in the room with her). Picked up while awake, she
 * watches it from wherever she is for a while.
 */
function vaneWatching(s: Sim, watchfulUntil: number): boolean {
  const v = s.person(VANE);
  if (!v || !v.present) return false;
  if (s.time < watchfulUntil && !s.isSeized(VANE)) return true;
  if (s.isAirborne(VANE)) return true;
  if (v.room !== 'meeting' || s.isSeized(VANE) || s.hasStatus(VANE, 'asleep')) return false;
  const love = v.statuses.find((st) => st.kind === 'love');
  if (love && love.target) {
    const t = s.person(love.target as CharId);
    if (t && t.present && t.room === 'meeting') return false;
  }
  return true;
}

// ── Thursday: The Switch ─────────────────────────────────────────────────────

interface Absence { id: 'coffee' | 'lunch' | 'call' | 'pizza'; at: number; anchor: string; stay: number }

/** Her three trips out of the conference room. `stay` is sim seconds at the far end. */
export const ABSENCES: readonly Absence[] = [
  { id: 'coffee', at: DAY(10, 30), anchor: 'stand.coffee', stay: 3 },
  { id: 'lunch', at: DAY(12, 30), anchor: 'stand.fridge', stay: 1 },
  { id: 'call', at: DAY(14, 30), anchor: 'spot.bullpen5', stay: 6 },
];
/** Anyone next to her when she turns to go back keeps her this much longer (sim seconds), once each. */
export const TALK_MORE = 13;
/** Someone the player sent (carried, whispered to, told) within this long can keep her talking (sim seconds). */
const SENT_FOR = 150;
/** A Pizza Party draws her out for a slice too. */
const PIZZA_TRIP: Absence = { id: 'pizza', at: 0, anchor: 'stand.counter', stay: 8 };
const ABSENCE_BEAT_BEFORE = 8;
/** An absence she could not start on time (asleep, frozen) is dropped this many clock minutes late. */
const ABSENCE_GRACE = 30;

/** Ms Vane's trips out of the conference room, keeping-her-talking, and her emergencies with the case. */
class VaneTrips {
  walker: VaneWalker;
  trip: { a: Absence; phase: 'out' | 'there' | 'back'; until: number } | null = null;
  private talked = new Set<CharId>();
  /** When the player last sent each person anywhere (carried and set down, whispered to, told). */
  private sent = new Map<CharId, number>();
  private hands: Landings;
  caseWithHer = false;
  /** She will not let go of the case again today. */
  private keeping = false;
  private propAt = 0;
  private emergency = false;
  watchfulUntil = -1e9;

  /** Caught twice on the last day: the case stays in her hand until the screening. */
  keepCase(): void {
    const s = this.c.sim;
    this.keeping = true;
    this.caseWithHer = true;
    showCase(s, false);
    s.setProp(VANE, 'case');
  }

  constructor(private c: ChapterCtx, private holder: () => CharId | null = () => null) {
    this.walker = new VaneWalker(c.sim);
    this.hands = new Landings(c.sim, (who) => {
      if (who === VANE) return;
      this.noteSent(who);
      if (who === this.holder()) return;
      const spot = this.trip && this.trip.phase !== 'back' ? feetOf(anchor(this.trip.a.anchor).tile) : this.nextSpot();
      lingerIfNear(c.sim, who, spot, 'hanging about near Ms Vane');
    });
  }

  /** Where she goes next (for someone put there ahead of her). */
  nextSpot: () => { x: number; y: number } | null = () => null;

  get p(): SimPerson | undefined {
    return this.walker.p;
  }

  goBase(): void {
    this.walker.go(VANE_BASE, 'guarding the case at the conference table');
  }

  leave(a: Absence, narrate = true): void {
    const s = this.c.sim;
    this.trip = { a, phase: 'out', until: 0 };
    const what = a.id === 'pizza' ? 'having a slice of pizza' : a.id === 'call' ? 'on the phone to Corporate' : a.id === 'lunch' ? 'getting her lunch from the fridge' : 'drinking a coffee';
    this.walker.go(a.anchor, what);
    if (narrate && a.id !== 'pizza') {
      s.say(VANE, SWITCH.lines.leaving.text, { emotion: 'suspicious' });
      s.narrate(SWITCH.absences[a.id].leaving, { icon: a.id === 'call' ? 'phone' : 'clock', room: 'meeting', beat: true });
    }
    if (a.id === 'call') s.sfx('phoneRing');
  }

  /** The player sent this person somewhere on purpose (a whisper, an order, a lift). */
  noteSent(who: CharId): void {
    this.sent.set(who, this.c.sim.time);
  }

  private wasSent(who: CharId): boolean {
    return this.c.sim.time - (this.sent.get(who) ?? -1e9) <= SENT_FOR;
  }

  /** Who the player has just carried somewhere. Every frame. */
  track(): void {
    this.hands.update();
  }

  /** Every frame. */
  update(holder: CharId | null): void {
    const s = this.c.sim;
    this.track();
    const v = this.p;
    if (!v) return;
    if (this.emergency) {
      if (!s.isHazard('meeting') && !s.activeChaos().some((c) => c.id === 'fireDrill')) {
        this.emergency = false;
        this.goBase();
      }
      return;
    }
    if (this.keeping && s.time >= this.propAt) {
      this.propAt = s.time + 1;
      s.setProp(VANE, 'case');
    }
    if (this.caseWithHer && !this.keeping && this.walker.target === VANE_BASE && this.walker.isNear(VANE_BASE) && !this.trip) {
      this.caseWithHer = false;
      s.setProp(VANE, null);
      showCase(s, true);
      s.narrate(SWITCH.caseBack, { icon: 'lock', room: 'meeting' });
    }
    const t = this.trip;
    if (!t) {
      this.walker.steer();
      return;
    }
    this.walker.steer();
    if (t.phase === 'out' && this.walker.arrived) {
      t.phase = 'there';
      t.until = s.time + t.a.stay;
    } else if (t.phase === 'there' && s.time >= t.until && onFloor(s, v) && awake(s, v)) {
      const talker = s.peopleNear(v.x, v.y, NEAR_VANE).find((p) => p.isCast && p.id !== holder && !this.talked.has(p.id) && this.wasSent(p.id) && onFloor(s, p) && awake(s, p));
      if (talker) {
        this.talked.add(talker.id);
        t.until = s.time + TALK_MORE;
        s.face(talker.id, VANE);
        s.face(VANE, talker.id);
        s.goTo(talker.id, { tile: talker.tile }, { style: 'walk', doing: 'keeping Ms Vane talking', stay: TALK_MORE, stayDoing: 'keeping Ms Vane talking' });
        s.say(talker.id, talkLine(talker.id), { emotion: 'happy', to: VANE });
        s.narrate(SWITCH.talking(talker.name), { icon: 'whisper', room: v.room, beat: true });
        return;
      }
      t.phase = 'back';
      this.goBase();
      s.narrate(SWITCH.returning, { icon: 'clock', room: v.room });
    } else if (t.phase === 'back' && this.walker.arrived) {
      this.trip = null;
    }
  }

  /** Fire or a burst pipe in the conference room, or a fire drill: she takes the case with her. */
  takeCase(drill: boolean): void {
    const s = this.c.sim;
    if (this.keeping || (this.caseWithHer && this.emergency)) return;
    this.caseWithHer = true;
    this.emergency = true;
    this.trip = null;
    showCase(s, false);
    s.setProp(VANE, 'case');
    s.narrate(SWITCH.emergency, { icon: 'warn', room: 'meeting', beat: true });
    this.walker.target = null;
    if (drill) s.evacuate(VANE);
  }

  grabbed(): void {
    const s = this.c.sim;
    if (s.isSeized(VANE) || s.hasStatus(VANE, 'asleep')) return;
    this.watchfulUntil = s.time + WATCHFUL;
    s.narrate(SWITCH.grabbed, { icon: 'inspector', beat: true });
  }

  away(): boolean {
    return !!this.trip;
  }
}

function talkLine(id: CharId): string {
  const lines: Partial<Record<CastId, string>> = {
    phyllis: 'Ms Vane, where did you get that blouse? I must know.',
    kevin: 'Do you want to hear about my chili? It takes a while.',
    andy: 'Did I mention I went to Cornell? Let me tell you about it.',
    dwight: 'Ms Vane, a moment. I have concerns about the coffee filters.',
    jim: 'So, how is New York this time of year?',
    pam: 'Can I show you the mural I am planning for the break room?',
    stanley: 'Is that the good coffee? Tell me about the good coffee.',
    michael: 'Ms Vane! Have you heard the one about the regional manager?',
    creed: 'You look like someone I used to know. In a different life.',
  };
  return lines[id as CastId] ?? 'Ms Vane, before you go, one quick question.';
}

class SwitchRun implements ChapterRun {
  private vane: VaneTrips;
  private job: TapeSwitch;
  private spawned = false;
  private next = 0;
  private need: number;

  constructor(private c: ChapterCtx) {
    this.vane = new VaneTrips(c, () => this.job?.holder ?? null);
    this.vane.nextSpot = () => {
      const a = ABSENCES[this.next];
      return a && c.sim.clock >= a.at - 20 ? feetOf(anchor(a.anchor).tile) : null;
    };
    this.need = c.notes.heistCode ? SWITCH_SECS.code : SWITCH_SECS.pick;
    this.job = new TapeSwitch(c, this.need, {
      unwatched: () => !vaneWatching(c.sim, this.vane.watchfulUntil),
      caseOnTable: () => !this.vane.caseWithHer,
      onSwitched: () => this.switched(),
      onNearMiss: (by, n) => this.nearMiss(by, n),
    });
  }

  setup(): void {
    registerVane();
    const s = this.c.sim;
    this.c.notes.heistCloseCalls = 0;
    this.job.start('michael');
    showCase(s, true);
    s.setFact('heist.today', 'Ms Vane has cabled her case to the conference table. The office wants to swap the tape inside it while she is out of the room.');
    s.convince('michael', null);
  }

  update(dt: number): void {
    const s = this.c.sim;
    if (!this.spawned && s.clock >= VANE_ARRIVES - 15) {
      this.spawned = true;
      registerVane();
      s.spawnVisitor(VANE, { anchor: VANE_BASE });
      this.vane.goBase();
      this.c.after(8, () => s.narrate(SWITCH.setup, { icon: 'lock', room: 'meeting', beat: true }));
    }
    if (!this.spawned) return;
    if (this.c.main() === 'open') {
      const a = ABSENCES[this.next];
      if (a && !this.vane.away() && !this.vane.caseWithHer && s.clock >= a.at) {
        const v = this.vane.p;
        if (v && onFloor(s, v) && awake(s, v)) {
          this.next += 1;
          this.vane.leave(a);
        } else if (s.clock >= a.at + ABSENCE_GRACE) {
          this.next += 1;
        }
      }
    }
    this.vane.update(this.job.holder);
    this.job.update(dt);
    if (this.job.done && this.c.extra('shred') === 'open' && this.job.shredIfThere()) {
      this.c.notes.heistShredded = true;
      this.c.setExtra('shred', 'won');
    }
  }

  private switched(): void {
    this.c.notes.heistSwitched = 'thursday';
    this.c.sim.setFact('heist.today', 'The tapes are switched: the right tape is in Ms Vane\'s case. She has no idea.');
    this.c.win([SWITCH.switched(nameOf(this.job.holder ?? 'michael'))]);
  }

  private nearMiss(by: CharId, n: number): void {
    this.c.notes.heistCloseCalls = n;
    const s = this.c.sim;
    if (n >= NEAR_MISSES) {
      const text = SWITCH.caughtTwice(nameOf(by));
      s.narrate(text, { icon: 'warn', room: 'meeting', beat: true });
      this.c.lose([text]);
      return;
    }
    s.narrate(SWITCH.nearMiss(nameOf(by)), { icon: 'warn', room: 'meeting', beat: true });
  }

  atFive(): void {
    if (this.c.main() === 'open') this.c.lose([SWITCH.late]);
  }

  onPickedUp(who: CharId): void {
    if (who === VANE && this.c.main() === 'open') this.vane.grabbed();
  }

  onAction(a: PlayerAction): void {
    if ((a.kind === 'whisper' || a.kind === 'cue') && a.who) this.vane.noteSent(a.who);
    this.job.onAction(a);
  }

  ownsOrder(a: PlayerAction): boolean {
    return this.job.claims(a);
  }

  onChaosStart(e: ChaosStartInfo): void {
    const s = this.c.sim;
    if (!this.spawned) return;
    if ((e.id === 'fire' || e.id === 'flood') && e.room === 'meeting') this.vane.takeCase(false);
    else if (e.id === 'fireDrill') this.vane.takeCase(true);
    else if (e.id === 'pizza' && !this.vane.away() && !this.vane.caseWithHer) this.c.after(6, () => {
      const v = this.vane.p;
      if (v && !this.vane.away() && onFloor(s, v) && awake(s, v)) this.vane.leave(PIZZA_TRIP, false);
    });
  }

  pinned(who: CharId): boolean {
    return who === VANE;
  }

  nextBeat(): number | null {
    const s = this.c.sim;
    const a = ABSENCES[this.next];
    if (!a || this.vane.away()) return null;
    const t = a.at - ABSENCE_BEAT_BEFORE;
    return s.clock < t ? t : null;
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: SWITCH.status.won };
    if (st === 'lost') return { progress: 0, status: SWITCH.status.lost };
    const who = nameOf(this.job.holder ?? 'michael');
    const need = this.job.holder ? this.job.needFor(this.job.holder) : this.need;
    if (this.job.progress > 0) return { progress: Math.min(0.99, this.job.progress / need), status: SWITCH.status.working(Math.floor(this.job.progress), Math.round(need)) };
    if (this.vane.caseWithHer) return { progress: 0, status: SWITCH.status.caseOut };
    if (this.job.beside() && this.job.crowded()) return { progress: 0, status: SWITCH.status.crowded };
    if (this.spawned && !vaneWatching(this.c.sim, this.vane.watchfulUntil)) {
      return { progress: 0, status: this.vane.away() ? SWITCH.status.out(who) : SWITCH.status.sleeping(who) };
    }
    const a = ABSENCES[this.next];
    return { progress: 0, status: a ? SWITCH.status.holder(who, SWITCH.absences[a.id as 'coffee' | 'lunch' | 'call'].label, formatClock(a.at)) : SWITCH.status.noMore(who) };
  }

  marks(): { id: CharId; label?: string }[] {
    const out: { id: CharId; label?: string }[] = [];
    if (this.vane.p) out.push({ id: VANE, label: SWITCH.tagVane(!!this.vane.p && this.vane.p.room === 'meeting' && !this.vane.away()) });
    const h = this.job.mark();
    if (h) out.push(h);
    return out;
  }

  topics(): string[] {
    return SWITCH.topics(nameOf(this.job.holder ?? 'michael'), this.job.done);
  }

  warns(): Partial<Record<ActionId, string>> {
    if (this.c.main() !== 'open') return {};
    return switchWarns();
  }

  stakes(): number {
    if (this.c.main() !== 'open') return 0;
    if (this.job.progress > 0) return 1;
    return this.vane.away() ? 0.75 : 0.3;
  }

  /** For tests. */
  get state(): { holder: CharId | null; progress: number; nearMisses: number; away: boolean; trip: string | null; caseWithHer: boolean; need: number; switched: boolean } {
    return {
      holder: this.job.holder, progress: this.job.progress, nearMisses: this.job.nearMisses, away: this.vane.away(),
      trip: this.vane.trip ? `${this.vane.trip.a.id}:${this.vane.trip.phase}` : null, caseWithHer: this.vane.caseWithHer,
      need: this.job.holder ? this.job.needFor(this.job.holder) : this.need, switched: this.job.done,
    };
  }
}

function switchWarns(): Partial<Record<ActionId, string>> {
  return {
    fireDrill: SWITCH.warn.fireDrill,
    pizza: SWITCH.warn.pizza,
    meeting: SWITCH.warn.meeting,
    fire: SWITCH.warn.fireMeeting,
    flood: SWITCH.warn.fireMeeting,
    sleep: SWITCH.warn.sleep,
  };
}

// ── Friday: The Screening ────────────────────────────────────────────────────

/** When she questions someone (clock minutes). The last is always Michael. */
export const QUESTIONINGS: readonly number[] = [DAY(9, 45), DAY(10, 45), DAY(11, 45), DAY(12, 45), DAY(13, 20)];
/** The Log names whom she wants this many clock minutes ahead. */
const NAME_AHEAD = 10;
/** Looking for someone she cannot reach (carried off, not in), she gives up after this long (sim seconds). */
export const LOOK_SECS = 6;
/** However far she has to walk, she settles for the nearest after this long (sim seconds). */
const WALK_GIVE_UP = 40;
/** The questions take this long (sim seconds). */
export const ASK_SECS = 8;
/** She reaches someone within this distance. */
const REACH = 2 * TILE;
/** How many of the four questioned before Michael are picked from those with weak nerves (when there are enough). */
const SHAKY_PICKS = 2;
export const CALL_IN = DAY(13, 45);
export const SCREENING_AT = DAY(14, 0);
/** The result is announced when the screening scene ends, or after this long at the latest (sim seconds). */
const SCREENING_LONGEST = 30;
/** More than this many talking loses the day. */
const TALK_LIMIT = 1;
const STEADY = new Set(['happy', 'amused', 'proud', 'determined']);

/** Why someone would talk: the truth serum, a fright or sadness, a bad mood, or weak nerves nobody steadied. */
export type TalkWhy = 'truth' | 'scared' | 'sad' | 'nervous' | 'mood' | 'nerve';

/**
 * Why this person would talk if questioned now, or null if they would keep the story straight.
 * A whisper steadies nerves for the day: it covers weak nerves and plain nervousness, but not a
 * fright, sadness or a bad mood (those need cheering up, or a swap).
 */
export function talkReason(s: Sim, id: CharId, steadied: boolean): TalkWhy | null {
  const p = s.person(id);
  if (!p) return null;
  if (s.hasStatus(id, 'truth')) return 'truth';
  if (p.emotion === 'scared') return 'scared';
  if (p.emotion === 'sad') return 'sad';
  if (p.emotion === 'nervous' && !steadied) return 'nervous';
  if (p.mood < -0.3) return 'mood';
  if (id === 'creed') return null;
  const nerve = isCastId(id) ? CAST[id].temperament.nerve : 0.5;
  if (nerve >= 0.5) return null;
  return steadied || STEADY.has(p.emotion) ? null : 'nerve';
}

/** Would this person talk if questioned now? */
export function wouldTalk(s: Sim, id: CharId, steadied: boolean): boolean {
  return talkReason(s, id, steadied) !== null;
}

type Ask =
  | { phase: 'idle' }
  | { phase: 'looking'; target: CharId; since: number; lostFor: number; settled: boolean }
  | { phase: 'asking'; who: CharId; until: number; talks: boolean; why: TalkWhy | null }
  | { phase: 'back' };

class ScreeningRun implements ChapterRun {
  private walker: VaneWalker;
  private trips: VaneTrips;
  private job: TapeSwitch | null = null;
  private spawned = false;
  private next = 0;
  private wanted: CharId | null = null;
  private wantedAt = -1;
  private pickedSince = new Set<CharId>();
  private ask: Ask = { phase: 'idle' };
  private questioned: CharId[] = [];
  private talkers = new Set<string>();
  private whispered = new Set<CharId>();
  private shakySlots = new Set<number>();
  private calledIn = false;
  private screened = false;
  private switchedToday = false;
  private hadSwitch: boolean;

  constructor(private c: ChapterCtx) {
    this.trips = new VaneTrips(c, () => this.job?.holder ?? null);
    this.walker = this.trips.walker;
    this.hadSwitch = !!c.notes.heistSwitched;
  }

  setup(): void {
    registerVane();
    const s = this.c.sim;
    this.c.notes.heistCracks = 0;
    if (!this.hadSwitch) {
      const need = this.c.notes.heistCode ? SWITCH_SECS.code : SWITCH_SECS.pick;
      this.job = new TapeSwitch(this.c, need, {
        unwatched: () => !vaneWatching(s, this.trips.watchfulUntil),
        caseOnTable: () => !this.trips.caseWithHer,
        onSwitched: () => {
          this.switchedToday = true;
          this.c.notes.heistSwitched = 'friday';
          s.setFact('heist.today', 'The tapes are finally switched: the right tape is in Ms Vane\'s case. Now everyone has to keep quiet.');
        },
        onNearMiss: (by, n) => {
          this.c.notes.heistCloseCalls = (this.c.notes.heistCloseCalls ?? 0) + 1;
          if (n >= NEAR_MISSES) {
            // On the last day there is no hotel to send it to: the case stays in her hand until two.
            this.trips.keepCase();
            s.narrate(SCREENING.caughtTwice(nameOf(by)), { icon: 'warn', room: 'meeting', beat: true });
          } else s.narrate(SWITCH.nearMiss(nameOf(by)), { icon: 'warn', room: 'meeting', beat: true });
        },
      });
      this.job.start('michael');
    }
    showCase(s, true);
    // Which of the four before Michael are drawn from the shaky ones.
    const slots = [0, 1, 2, 3];
    for (let i = 0; i < SHAKY_PICKS; i++) this.shakySlots.add(slots.splice(this.c.rng.int(0, slots.length - 1), 1)[0]);
    s.setFact('heist.today', this.hadSwitch
      ? 'The right tape is in Ms Vane\'s case. She is questioning people before the screening at two, and nobody must talk.'
      : 'The wrong tape is still in Ms Vane\'s case. The screening is at two.');
  }

  private get vane(): SimPerson | undefined {
    return this.walker.p;
  }

  private get cracks(): number {
    return this.talkers.size;
  }

  update(dt: number): void {
    const s = this.c.sim;
    if (!this.spawned && s.clock >= VANE_ARRIVES - 15) {
      this.spawned = true;
      registerVane();
      s.spawnVisitor(VANE, { anchor: VANE_BASE });
      this.trips.goBase();
    }
    if (!this.spawned) return;
    if (this.c.main() === 'open' && !this.calledIn) this.questions(dt);
    if (this.ask.phase === 'idle' || this.ask.phase === 'back' || this.calledIn) this.trips.update(this.job?.holder ?? null);
    else {
      this.trips.track();
      this.walker.steer();
    }
    if (this.ask.phase === 'back' && this.walker.arrived) this.ask = { phase: 'idle' };
    if (this.job && !this.job.done && this.c.main() === 'open' && !this.calledIn) this.job.update(dt);
    else if (this.job) this.job.update(0);
    if (this.c.main() === 'open' && !this.calledIn && s.clock >= CALL_IN) this.callIn();
    if (this.c.main() === 'open' && !this.screened && s.clock >= SCREENING_AT) this.screen();
  }

  // ── questioning ──

  private pick(index: number): CharId | null {
    const s = this.c.sim;
    if (index === QUESTIONINGS.length - 1) {
      const m = s.person('michael');
      if (m && m.present && !this.questioned.includes('michael')) return 'michael';
    }
    const pool = staffOnFloor(s).filter((p) => p.id !== 'michael' && !this.questioned.includes(p.id)).map((p) => p.id);
    if (!pool.length) return null;
    const shaky = pool.filter((id) => (LOW_NERVE as readonly string[]).includes(id));
    const from = this.shakySlots.has(index) && shaky.length ? shaky : pool;
    return from[this.c.rng.int(0, from.length - 1)];
  }

  private questions(dt: number): void {
    const s = this.c.sim;
    const at = QUESTIONINGS[this.next];
    if (at === undefined) return;
    if (!this.wanted && s.clock >= at - NAME_AHEAD) {
      this.wanted = this.pick(this.next);
      this.wantedAt = s.time;
      this.pickedSince.clear();
      if (this.wanted) s.narrate(SCREENING.ahead(formatClock(at), nameOf(this.wanted)), { icon: 'inspector', room: s.person(this.wanted)?.room, beat: true });
      else this.next += 1;
      return;
    }
    const v = this.vane;
    if (!v) return;
    if (this.ask.phase === 'idle' && this.wanted && s.clock >= at) {
      this.ask = { phase: 'looking', target: this.wanted, since: s.time, lostFor: 0, settled: false };
      this.trips.trip = null;
      this.walker.go(VANE_BASE, 'looking for someone');
      this.walker.target = null;
      s.narrate(SCREENING.looking(nameOf(this.wanted)), { icon: 'inspector', room: v.room });
    }
    if (this.ask.phase === 'looking') {
      const a = this.ask;
      const t = s.person(a.target);
      const reachable = !!t && t.present && onFloor(s, t) && !this.pickedSince.has(a.target) && t.room !== 'outside';
      if (!reachable) a.lostFor += dt;
      if (reachable && t && dist(v, t) <= REACH && onFloor(s, v) && awake(s, v)) {
        this.begin(a.target);
        return;
      }
      if (a.lostFor >= LOOK_SECS || s.time - a.since >= WALK_GIVE_UP) {
        const other = this.nearestUnasked(v, a.target);
        if (!other) {
          this.finishAsk(null, false);
          return;
        }
        if (!a.settled) s.narrate(SCREENING.settles(nameOf(a.target), nameOf(other)), { icon: 'inspector', room: v.room, beat: true });
        this.ask = { phase: 'looking', target: other, since: s.time, lostFor: 0, settled: true };
        this.pickedSince.delete(other);
        this.wanted = other;
        return;
      }
      if (reachable && t && onFloor(s, v) && awake(s, v) && v.available && !v.sceneId && !(v.doing ?? '').startsWith('going to question')) {
        s.goTo(VANE, { near: t.id }, { style: 'walk', doing: `going to question ${t.name}`, stay: 4, stayDoing: `waiting for ${t.name}` });
      }
      return;
    }
    if (this.ask.phase === 'asking' && s.time >= this.ask.until) this.finishAsk(this.ask.who, this.ask.talks, this.ask.why);
  }

  private nearestUnasked(v: SimPerson, not: CharId): CharId | null {
    const s = this.c.sim;
    let best: SimPerson | null = null;
    for (const p of staffOnFloor(s)) {
      if (p.id === not || this.questioned.includes(p.id) || !awake(s, p) || p.room === 'outside') continue;
      // Michael is always the last one she questions.
      if (p.id === 'michael' && this.next < QUESTIONINGS.length - 1) continue;
      if (!best || dist(p, v) < dist(best, v)) best = p;
    }
    return best ? best.id : null;
  }

  private begin(who: CharId): void {
    const s = this.c.sim;
    const why = talkReason(s, who, this.whispered.has(who));
    const talks = why !== null;
    this.ask = { phase: 'asking', who, until: s.time + ASK_SECS, talks, why };
    this.questioned.push(who);
    s.face(VANE, who);
    s.face(who, VANE);
    const p = s.person(who);
    if (p) s.goTo(who, { tile: p.tile }, { style: 'walk', doing: 'answering Ms Vane\'s questions', stay: ASK_SECS + 1, stayDoing: 'answering Ms Vane\'s questions' });
    s.goTo(VANE, { tile: this.vane!.tile }, { style: 'walk', doing: `questioning ${nameOf(who)}`, stay: ASK_SECS + 1, stayDoing: `questioning ${nameOf(who)}` });
    const q = who === 'michael' ? SCREENING.questions[4] : SCREENING.questions[(this.questioned.length - 1) % 4];
    const answer = who === 'michael'
      ? (talks ? SCREENING.michaelTalks : SCREENING.michaelHolds)
      : who === 'creed' && !talks ? SCREENING.creed
        : talks ? SCREENING.talks[this.c.rng.int(0, SCREENING.talks.length - 1)] : SCREENING.holds[this.c.rng.int(0, SCREENING.holds.length - 1)];
    const lines: ScriptLine[] = [
      { who: VANE, text: q, emotion: 'suspicious', to: who },
      { who, text: answer, emotion: talks ? 'nervous' : 'neutral', to: VANE },
      { who: VANE, text: talks ? SCREENING.vaneAfterTalk : SCREENING.vaneAfterHold, emotion: talks ? 'smug' : 'neutral', to: who },
    ];
    this.c.script(lines, { room: this.vane?.room, then: 'none' });
  }

  private finishAsk(who: CharId | null, talks: boolean, why: TalkWhy | null = null): void {
    const s = this.c.sim;
    if (who) {
      if (talks) this.crack(who, SCREENING.talked(nameOf(who), this.cracks + (this.talkers.has(who) ? 0 : 1), why));
      else s.narrate(who === 'creed' ? SCREENING.creedAside : SCREENING.held(nameOf(who)), { icon: 'check', room: s.person(who)?.room, beat: true });
      const p = s.person(who);
      if (p && onFloor(s, p)) s.resume(who);
    }
    this.next += 1;
    this.wanted = null;
    this.ask = { phase: 'back' };
    const v = this.vane;
    // On the last chance to switch, someone next to her as she turns back keeps her a little longer.
    if (v && this.job && !this.job.done) {
      this.trips.trip = { a: { id: 'call', at: 0, anchor: VANE_BASE, stay: 0 }, phase: 'there', until: s.time };
      this.ask = { phase: 'idle' };
    } else {
      this.trips.goBase();
    }
  }

  private crack(key: string, text: string): void {
    const s = this.c.sim;
    if (this.talkers.has(key)) return;
    this.talkers.add(key);
    this.c.notes.heistCracks = this.cracks;
    s.narrate(text, { icon: 'warn', room: this.vane?.room, beat: true });
    if (this.c.extra('silent') === 'open') this.c.setExtra('silent', 'lost');
  }

  // ── the screening ──

  private callIn(): void {
    const s = this.c.sim;
    this.calledIn = true;
    this.ask = { phase: 'idle' };
    this.trips.trip = null;
    this.trips.goBase();
    s.sfx('paChime');
    s.narrate(SCREENING.callIn, { icon: 'meeting', room: 'meeting', beat: true });
    let i = 0;
    for (const p of staffOnFloor(s)) {
      if (!p.available && !p.sceneId) continue;
      const spot = `spot.meet${(i++ % 15) + 1}`;
      s.goTo(p.id, { anchor: spot }, { style: 'walk', doing: 'going to the screening', stay: 900, stayDoing: 'waiting for the screening' });
    }
    s.setFact('heist.today', 'Everyone is in the conference room for the screening at two.');
  }

  private screen(): void {
    const s = this.c.sim;
    this.screened = true;
    const switched = this.hadSwitch || this.switchedToday;
    const k = this.cracks;
    const sc = SCREENING.screening;
    const lines: ScriptLine[] = [
      { who: VANE, text: sc.open, emotion: 'neutral' },
      { voice: SCREENING.vp, text: sc.vpReady },
    ];
    if (!switched) {
      lines.push({ voice: SCREENING.tapeVoice, text: sc.wrongTape }, { voice: SCREENING.vp, text: sc.vpWrong }, { who: 'michael', text: sc.michaelWrong, emotion: 'embarrassed' });
    } else {
      lines.push({ voice: SCREENING.tapeVoice, text: sc.rightTape }, { voice: SCREENING.vp, text: sc.vpRight });
      if (k > TALK_LIMIT) lines.push({ who: VANE, text: sc.vaneTalk, emotion: 'smug' });
      else lines.push({ who: 'michael', text: sc.michaelRight, emotion: 'proud', kind: 'whisper' });
    }
    // Decided now (nothing after two can change it); the result is announced once the tape has played.
    let told = false;
    const settle = (): void => {
      if (told) return;
      told = true;
      this.settleScreening(switched, k);
    };
    this.settleNow = settle;
    this.c.script(lines, { room: 'meeting', then: 'none', done: settle });
    this.c.after(SCREENING_LONGEST, settle);
  }

  /** The screening's result, announced after the scene. */
  private settleNow: (() => void) | null = null;

  private settleScreening(switched: boolean, k: number): void {
    const s = this.c.sim;
    if (this.c.main() !== 'open') return;
    if (this.c.extra('silent') === 'open') this.c.setExtra('silent', k === 0 ? 'won' : 'lost');
    if (!switched) {
      s.setFact('heist.today', 'The wrong tape played at the screening. The vice president saw Michael practise firing him.');
      for (const p of staffOnFloor(s)) s.feel(p.id, p.id === 'michael' ? 'embarrassed' : 'scared', 0.8, 30);
      this.c.lose([SCREENING.outcome.wrong]);
    } else if (k > TALK_LIMIT) {
      s.setFact('heist.today', 'The right tape played at the screening, but Ms Vane has the whole story.');
      for (const p of staffOnFloor(s)) s.feel(p.id, 'nervous', 0.7, 30);
      this.c.lose([SCREENING.outcome.talked(k)]);
    } else {
      s.setFact('heist.today', 'The right tape played at the screening. The vice president liked it.');
      for (const p of staffOnFloor(s)) s.feel(p.id, 'happy', 0.8, 30);
      this.c.after(10, () => s.addEffect({ id: 'heist.screening.balloons', kind: 'balloons', room: 'meeting', count: 4 }));
      this.c.win([SCREENING.outcome.won(k)]);
    }
  }

  atFive(): void {
    if (!this.screened) this.screen();
    this.settleNow?.();
  }

  onPickedUp(who: CharId): void {
    if (this.wanted && who === this.wanted) this.pickedSince.add(who);
    if (this.ask.phase === 'looking' && who === this.ask.target) this.pickedSince.add(who);
    if (who === VANE && this.job && !this.job.done) this.trips.grabbed();
  }

  onAction(a: PlayerAction): void {
    if ((a.kind === 'whisper' || a.kind === 'cue') && a.who && isCastId(a.who)) {
      this.whispered.add(a.who);
      this.trips.noteSent(a.who);
      this.c.sim.feel(a.who, 'determined', 0.6, 20);
    }
    this.job?.onAction(a);
  }

  ownsOrder(a: PlayerAction): boolean {
    return this.job?.claims(a) ?? false;
  }

  onChaosStart(e: ChaosStartInfo): void {
    const s = this.c.sim;
    if (this.c.main() !== 'open' || this.screened) return;
    if (e.id === 'truth' && e.target.who && isCastId(e.target.who)) {
      const who = e.target.who;
      this.c.after(4, () => {
        if (this.c.main() !== 'open' || this.screened) return;
        if (this.vane && s.person(who)?.present) s.goTo(who, { near: VANE }, { style: 'walk', doing: 'going to tell Ms Vane something', stay: 5 });
        this.crack(who, SCREENING.told(nameOf(who)));
      });
    }
    if (e.id === 'secretLeak' && e.target.who && isCastId(e.target.who)) this.crack(`leak:${e.target.who}`, SCREENING.leaked(nameOf(e.target.who)));
    if (this.job && !this.job.done) {
      if ((e.id === 'fire' || e.id === 'flood') && e.room === 'meeting') this.trips.takeCase(false);
      else if (e.id === 'fireDrill') this.trips.takeCase(true);
    }
  }

  pinned(who: CharId): boolean {
    return who === VANE || (this.ask.phase === 'asking' && this.ask.who === who);
  }

  nextBeat(): number | null {
    const s = this.c.sim;
    if (this.ask.phase !== 'idle' || this.calledIn) return null;
    const at = QUESTIONINGS[this.next];
    const t = at !== undefined ? at - NAME_AHEAD - 3 : CALL_IN - 2;
    return s.clock < t ? t : null;
  }

  settled(): boolean {
    return this.c.main() !== 'open';
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    const switched = this.hadSwitch || this.switchedToday;
    if (st === 'won') return { progress: 1, status: SCREENING.status.won };
    if (st === 'lost') return { progress: 0, status: switched ? SCREENING.status.lostTalk : SCREENING.status.lostWrong };
    const q = this.questioned.length;
    const base = Math.min(0.9, (q / QUESTIONINGS.length) * 0.8 + (switched ? 0.1 : 0));
    if (this.screened) return { progress: 0.98, status: SCREENING.status.playing };
    if (this.calledIn) return { progress: 0.95, status: SCREENING.status.call };
    if (this.job && !this.job.done && this.job.progress > 0 && this.job.holder) {
      return { progress: base, status: SCREENING.status.working(Math.floor(this.job.progress), Math.round(this.job.needFor(this.job.holder))) };
    }
    if (this.ask.phase === 'asking') return { progress: base, status: SCREENING.status.now(nameOf(this.ask.who), q, this.cracks) };
    if (this.ask.phase === 'looking') return { progress: base, status: SCREENING.status.looking(nameOf(this.ask.target)) };
    if (this.job && !this.job.done && this.job.holder) return { progress: base, status: SCREENING.status.holder(nameOf(this.job.holder)) };
    const at = QUESTIONINGS[this.next];
    if (at !== undefined) {
      if (!this.wanted && this.next < QUESTIONINGS.length - 1) return { progress: base, status: SCREENING.status.nextUnknown(q, this.cracks, formatClock(at)) };
      const id: CharId = this.wanted ?? 'michael';
      const shaky = this.wanted ? wouldTalk(this.c.sim, id, this.whispered.has(id)) : null;
      return { progress: base, status: SCREENING.status.next(q, this.cracks, nameOf(id), formatClock(at), shaky) };
    }
    return { progress: base, status: SCREENING.status.allAsked(q, this.cracks) };
  }

  marks(): { id: CharId; label?: string }[] {
    const out: { id: CharId; label?: string }[] = [];
    if (this.vane) {
      const label = this.ask.phase === 'asking' ? SCREENING.tagVane.asking(nameOf(this.ask.who))
        : this.ask.phase === 'looking' ? SCREENING.tagVane.looking(nameOf(this.ask.target))
          : this.wanted ? SCREENING.tagVane.looking(nameOf(this.wanted)) : undefined;
      out.push(label ? { id: VANE, label } : { id: VANE });
    }
    const wanted = this.ask.phase === 'looking' ? this.ask.target : this.wanted;
    if (wanted && this.ask.phase !== 'asking' && this.c.sim.person(wanted)?.present) {
      out.push({ id: wanted, label: SCREENING.tagWanted(wouldTalk(this.c.sim, wanted, this.whispered.has(wanted))) });
    }
    const h = this.job && !this.job.done ? this.job.mark() : null;
    if (h && h.id !== wanted) out.push(h);
    return out;
  }

  topics(): string[] {
    return SCREENING.topics(this.hadSwitch || this.switchedToday);
  }

  warns(): Partial<Record<ActionId, string>> {
    if (this.c.main() !== 'open' || this.screened) return {};
    const out: Partial<Record<ActionId, string>> = this.job && !this.job.done ? switchWarns() : {};
    out.truth = SCREENING.warn;
    out.secretLeak = SCREENING.warn;
    return out;
  }

  stakes(): number {
    if (this.c.main() !== 'open') return 0;
    if (this.calledIn) return 1;
    if (this.ask.phase === 'asking') return 0.85;
    return this.ask.phase === 'looking' ? 0.7 : 0.35;
  }

  /** For tests. */
  get state(): { questioned: CharId[]; cracks: number; wanted: CharId | null; phase: string; next: number; holder: CharId | null; switched: boolean; progress: number } {
    return {
      questioned: [...this.questioned], cracks: this.cracks, wanted: this.ask.phase === 'looking' ? this.ask.target : this.wanted, phase: this.ask.phase,
      next: this.next, holder: this.job?.holder ?? null, switched: this.hadSwitch || this.switchedToday, progress: this.job?.progress ?? 0,
    };
  }
}

// ── The chapters and what the model is told ──────────────────────────────────

const NOT_YET: Partial<Record<ChaosId, string>> = { inspector: 'Corporate already has someone here: Ms Vane.' };

export const HEIST_CHAPTER_DEFS: readonly ChapterDef[] = [
  {
    chapter: 1,
    weekday: COMBO.weekday,
    title: COMBO.title,
    budget: 8,
    intro: COMBO.intro,
    goal: COMBO.goal,
    extras: [COMBO.extra],
    change: COMBO.change,
    hints: COMBO.hints,
    help: COMBO.help,
    suggest: COMBO.suggest,
    locked: NOT_YET,
    recap: () => null,
    create: (c) => new CombinationRun(c),
  },
  {
    chapter: 2,
    weekday: SWITCH.weekday,
    title: SWITCH.title,
    budget: 8,
    intro: SWITCH.intro,
    goal: SWITCH.goal,
    extras: [SWITCH.extra],
    change: SWITCH.change,
    hints: SWITCH.hints,
    help: SWITCH.help,
    suggest: SWITCH.suggest,
    locked: NOT_YET,
    recap: (n) => SWITCH.recap(n, n.heistCode ? SWITCH_SECS.code : SWITCH_SECS.pick),
    create: (c) => new SwitchRun(c),
  },
  {
    chapter: 3,
    weekday: SCREENING.weekday,
    title: SCREENING.title,
    budget: 8,
    intro: SCREENING.intro,
    goal: SCREENING.goal,
    extras: [SCREENING.extra],
    change: SCREENING.change,
    hints: SCREENING.hints,
    help: SCREENING.help,
    suggest: SCREENING.suggest,
    locked: NOT_YET,
    recap: (n) => (n.heistSwitched ? SCREENING.recapSwitched(n) : SCREENING.recapNot),
    create: (c) => new ScreeningRun(c),
  },
];

/** True statements for the model and small talk: the story so far, from the notes. */
export function heistWeekFacts(notes: WeekNotes, chapter: number): [string, string][] {
  const facts: [string, string][] = [
    ['heist.tape', HEIST_FACTS.tape],
    ['heist.vane', HEIST_FACTS.vane],
    ['heist.screening', HEIST_FACTS.screening],
    ['heist.plan', HEIST_FACTS.plan],
  ];
  if (chapter >= 2) facts.push(['heist.digits', HEIST_FACTS.digits(notes)]);
  if (chapter >= 3) facts.push(['heist.switched', HEIST_FACTS.switched(notes)]);
  if (chapter >= 3 && notes.heistShredded) facts.push(['heist.shredded', HEIST_FACTS.shredded]);
  return facts;
}

export type { RoomId };
