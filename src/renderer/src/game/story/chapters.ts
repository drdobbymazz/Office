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
// Monday to Wednesday.
import { CHAOS_IDS } from '@/game/core/types';
import { roomNamedIn } from '@/game/director/summon';

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

/** How often Michael's hiding is checked (sim seconds). */
const HIDE_EVERY = 1;
/** Put down somewhere, Michael stays this long before he slips back to his office. */
const GRACE = 12;
/** The call needs Michael and 9 others in the room on two checks this far apart: walking through does not count. */
const CALL_EVERY = 2;
const OTHERS_NEEDED = 9;
/** "Full room": this many others with Michael when the phone rings. */
const FULL_ROOM = 12;
/** The bin Creed goes through: the corridor just outside Michael's door. */
const BIN = { x: 5, y: 9 };
const BIN_AT = DAY(10, 20);
/** Sim seconds Creed spends going through the bin before he finds the memo. */
const SEARCH_FOR = 25;
const BIN_FX = 'story.memo.bin';
const DIM_FX = 'story.memo.dim';
const LAMP_FX = 'story.memo.lamp';

type BinState = 'waiting' | 'going' | 'searching' | 'stopped' | 'found';

class MemoRun implements ChapterRun {
  private hideAt = 0;
  private lockedIn = false;
  private carried = false;
  private landedAt = -1e9;
  private slipped = 0;
  private freed = false;
  private unhide = false;
  private checkAt = 0;
  private okChecks = 0;
  private said14 = false;
  private said1445 = false;
  private bin: BinState = 'waiting';
  private binSince = 0;
  private binTries = 0;
  private creedLeaves = false;
  private kellyAt = 0;
  private callAt = 0;
  /** Sim time and clock at set-up, to turn clock minutes into sim seconds. */
  private t0 = 0;
  private c0 = 0;

  constructor(private c: ChapterCtx) {}

  setup(): void {
    const s = this.c.sim;
    this.t0 = s.time;
    this.c0 = s.clock;
    s.convince('michael', MEMO.conviction);
    s.setHiddenNote('michael', MEMO.hidden);
    s.setFact('story.memo', MEMO.fact);
    // The memo itself, in his hand all day, and his office dim while he hides in it.
    s.setProp('michael', 'papers');
    s.addEffect({ id: DIM_FX, kind: 'dark', rooms: ['boss'], level: 0.35, emergency: false });
    const mf = feetOf(anchor('desk.michael').tile);
    s.addEffect({ id: LAMP_FX, kind: 'light', x: mf.x, y: mf.y - 8, radius: 52, color: 0xffd27d });
  }

  private holds(): boolean {
    return this.c.sim.person('michael')?.conviction?.text === MEMO.conviction;
  }

  /** Sim seconds from now until a clock time today (the day's pace is measured, not assumed). */
  private secondsUntil(clock: number): number {
    const s = this.c.sim;
    const dt = s.time - this.t0;
    const rate = dt > 5 ? (s.clock - this.c0) / dt : 0.8;
    return Math.max(0, (clock - s.clock) / Math.max(0.05, rate));
  }

  /**
   * People called to the conference room from 12:30 on wait there until the call window closes
   * (an announcement in the morning still wears off long before two).
   */
  summonStay(room: RoomId): number | undefined {
    const s = this.c.sim;
    if (room !== 'meeting' || this.c.main() !== 'open' || s.clock < DAY(12, 30) || s.clock >= DAY(15)) return undefined;
    return this.secondsUntil(DAY(15, 5));
  }

  private room(): { michael: boolean; others: number } {
    let michael = false;
    let others = 0;
    for (const p of this.c.sim.people()) {
      if (!p.isCast || p.room !== 'meeting' || !onFloorOrAsleep(this.c, p)) continue;
      // Once he is slipping back to his office he no longer counts, even while still crossing the room.
      if (p.id === 'michael') michael = p.doing !== MEMO.toOffice;
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
    this.hide();
    this.watchBin();
    this.followRyan();
    if (s.clock >= DAY(14) && !this.said14) {
      this.said14 = true;
      s.narrate(MEMO.two, { beat: true, icon: 'phone', room: 'meeting' });
    }
    if (s.clock >= DAY(14, 45) && !this.said1445) {
      this.said1445 = true;
      const r = this.room();
      s.narrate(MEMO.late(r.others, r.michael), { beat: true, icon: 'clock', room: 'meeting' });
    }
    if (s.clock >= DAY(14) && s.time >= this.checkAt) {
      this.checkAt = s.time + CALL_EVERY;
      const r = this.room();
      this.okChecks = r.michael && r.others >= OTHERS_NEEDED ? this.okChecks + 1 : 0;
      if (this.okChecks >= 2) {
        this.callHappens(r.others);
        return;
      }
    }
    if (s.clock >= DAY(15)) this.missed();
  }

  /**
   * The obstacle: while he is sure hiding keeps today normal, Michael stays at his desk (no errands,
   * no wandering off to chat). Carried out, he gets his bearings for a moment, then slips back.
   */
  private hide(): void {
    const s = this.c.sim;
    const m = s.person('michael');
    if (!m || !m.present) return;
    if (!this.holds()) {
      // An idea of his own that names the conference room: he means to be there for the call.
      const forCall = !!m.conviction && roomNamedIn(m.conviction.text) === 'meeting';
      if (!this.freed) {
        // A whisper replaced what he was sure of: he stops hiding there and then.
        this.freed = true;
        this.unhide = true;
        s.setFact('story.memo', null);
        s.removeEffect(DIM_FX);
        s.narrate(forCall ? MEMO.freedForCall : MEMO.freed, { beat: true, icon: 'whisper', room: m.room });
      }
      // He leaves his desk as soon as he is free to (the whisper's own conversation comes first).
      if (this.unhide && m.available && !m.sceneId && (m.doing === MEMO.hiding || m.doing === MEMO.toOffice)) {
        this.unhide = false;
        s.resume('michael');
      }
      // Just before two he goes to the room by himself and waits there; if something carries him
      // off (a chat, an errand, the player's hand), he heads back.
      if (forCall && s.clock >= DAY(13, 50) && s.time >= this.callAt) {
        this.callAt = s.time + 3;
        const busy = !m.available || !!m.sceneId || s.holding === 'michael' || s.isAirborne('michael') || s.isSeized('michael');
        if (!busy && m.doing !== MEMO.toCall && m.doing !== MEMO.atCall && !s.isHazard('meeting')) {
          s.goTo('michael', { room: 'meeting' }, { doing: MEMO.toCall, stay: this.secondsUntil(DAY(15, 5)) + 5, stayDoing: MEMO.atCall });
        }
      }
      return;
    }
    if (s.holding === 'michael' || s.isAirborne('michael') || s.isSeized('michael')) {
      this.carried = true;
      return;
    }
    if (this.carried) {
      this.carried = false;
      this.landedAt = s.time;
    }
    if (s.time < this.hideAt) return;
    this.hideAt = s.time + HIDE_EVERY;
    // He is hiding bad news, and it shows on his face and on his card.
    if (!m.sceneId && !m.speaking && m.doing === MEMO.hiding) s.feel('michael', 'nervous', 0.55, 3);
    if (this.lockedIn || m.room === 'boss') return;
    if (s.time - this.landedAt < GRACE) return;
    // Talking, asleep, frozen: he tries again in a moment.
    if (!m.available || m.sceneId || m.doing === MEMO.toOffice) return;
    const putDown = s.time - this.landedAt < GRACE + 30;
    s.goTo('michael', { anchor: 'desk.michael' }, { doing: MEMO.toOffice, stay: 100000, stayDoing: MEMO.hiding });
    if (putDown) {
      this.slipped += 1;
      this.landedAt = -1e9;
      s.narrate(MEMO.slipBack, { beat: this.slipped === 1, icon: 'door', room: 'boss' });
    }
  }

  /** The second beat: at 10:20 Creed goes through Michael's bin. Left alone, he finds the memo. */
  private watchBin(): void {
    const s = this.c.sim;
    const p = s.person('creed');
    // Stopped while he was busy (a whisper starts a chat): he walks off once the chat is over.
    if (this.creedLeaves && p && p.present && p.available && !p.sceneId) {
      this.creedLeaves = false;
      if (p.doing === MEMO.bin.going || p.doing === MEMO.bin.searching) s.resume('creed');
    }
    if (this.bin === 'stopped' || this.bin === 'found') return;
    if (this.bin === 'waiting') {
      if (s.clock < BIN_AT || !p || !p.present) return;
      // Already busy with an idea of his own (a whisper this morning): he never goes near the bin.
      if (p.conviction) {
        this.bin = 'stopped';
        return;
      }
      if (!p.available || p.sceneId || s.holding === 'creed') return;
      this.bin = 'going';
      this.binSince = s.time;
      s.goTo('creed', { tile: BIN }, { doing: MEMO.bin.going, stay: SEARCH_FOR + 40, stayDoing: MEMO.bin.searching });
      s.narrate(MEMO.bin.goes, { beat: true, icon: 'rumour', room: 'bullpen' });
      const b = feetOf(BIN);
      s.bus.emit('focus', { x: b.x - 70, y: b.y - 70, w: 140, h: 100, weight: 0.8, holdMs: 5000 });
      return;
    }
    if (!p || !p.present) {
      this.stopBin();
      return;
    }
    // A whisper (an idea of his own) or the player's hand stops him at once; a chat only pauses him;
    // anything else that sends him elsewhere (an evacuation, a summons) stops him too.
    if (s.holding === 'creed' || s.isAirborne('creed') || p.conviction) {
      this.stopBin();
      return;
    }
    if (p.sceneId) return;
    if (p.doing !== MEMO.bin.going && p.doing !== MEMO.bin.searching) {
      // A chat or an errand carried him off: he goes back to the bin (a few times at most).
      if (this.binTries < 3 && p.available) {
        this.binTries += 1;
        this.bin = 'going';
        this.binSince = s.time;
        s.goTo('creed', { tile: BIN }, { doing: MEMO.bin.going, stay: SEARCH_FOR + 40, stayDoing: MEMO.bin.searching });
      } else if (this.binTries >= 3) {
        this.stopBin();
      }
      return;
    }
    if (this.bin === 'going' && (p.doing === MEMO.bin.searching || s.time - this.binSince > 60)) {
      this.bin = 'searching';
      this.binSince = s.time;
    }
    if (this.bin === 'searching' && s.time - this.binSince >= SEARCH_FOR) this.memoGetsOut();
  }

  private stopBin(): void {
    this.bin = 'stopped';
    this.creedLeaves = true;
    this.c.sim.narrate(MEMO.bin.stopped, { beat: true, icon: 'rumour', room: 'bullpen' });
  }

  private memoGetsOut(): void {
    const s = this.c.sim;
    this.bin = 'found';
    s.resume('creed');
    s.sfx('gasp');
    s.narrate(MEMO.bin.found, { beat: true, icon: 'rumour' });
    s.setFact('story.rumour', MEMO.bin.fact);
    s.remember('all', MEMO.bin.fact, 1.5);
    const b = feetOf(BIN);
    s.addEffect({ id: BIN_FX, kind: 'item', item: 'paperPile', x: b.x + 8, y: b.y });
    for (const p of s.people()) {
      if (!p.isCast || !p.present || p.id === 'michael') continue;
      s.bumpMood(p.id, -0.08);
      s.feel(p.id, 'nervous', 0.7, 12);
    }
    // The ones who take it hardest hide away, each in their own way (their cards say what would move them).
    MEMO.stragglers.forEach((st, i) => this.c.after(2 + i * 3, () => this.straggle(st)));
  }

  private straggle(st: (typeof MEMO.stragglers)[number]): void {
    const s = this.c.sim;
    if (this.c.main() !== 'open') return;
    const p = s.person(st.id);
    if (!p || !p.present || p.conviction) return;
    s.convince(st.id, st.conviction);
    s.goTo(st.id, st.at, { doing: st.going, stay: 100000, stayDoing: st.doing });
    s.narrate(st.beat, { icon: 'rumour', room: p.room });
  }

  /** Kelly goes wherever Ryan goes, however he got there (called by name, carried, or a whispered idea). */
  private followRyan(): void {
    const s = this.c.sim;
    if (s.time < this.kellyAt) return;
    this.kellyAt = s.time + 2;
    const kelly = s.person('kelly');
    const ryan = s.person('ryan');
    if (!kelly || !ryan || !kelly.present || !ryan.present) return;
    if (kelly.conviction?.text !== MEMO.stragglers[2].conviction) return;
    if (ryan.room !== 'meeting' || kelly.room === 'meeting' || !kelly.available || kelly.sceneId) return;
    if (/conference room/.test(kelly.doing)) return;
    s.goTo('kelly', { room: 'meeting' }, { doing: 'heading to the conference room', stay: 100, stayDoing: 'waiting in the conference room' });
    s.narrate(MEMO.kellyFollows, { icon: 'announce', room: 'meeting' });
  }

  private missed(): void {
    const s = this.c.sim;
    this.c.notes.call = false;
    this.c.notes.closureKnown = true;
    s.setFact('story.closure', MEMO.closure);
    s.setFact('story.memo', null);
    s.setFact('story.rumour', null);
    // The news is out anyway: nobody is hiding it, or from it, any more.
    s.convince('michael', null);
    s.setHiddenNote('michael', null);
    s.setProp('michael', null);
    s.removeEffect(DIM_FX);
    s.removeEffect(LAMP_FX);
    for (const st of MEMO.stragglers) if (s.person(st.id)?.conviction?.text === st.conviction) s.convince(st.id, null);
    // Say what the vice president actually found: the player has just watched that room.
    const r = this.room();
    const line = MEMO.missed(r.others, r.michael);
    s.narrate(line, { icon: 'phone', room: 'meeting', beat: true });
    for (const p of s.people()) if (p.isCast && p.present) s.feel(p.id, 'nervous', 0.6, 20);
    this.c.lose([line]);
  }

  atFive(): void {
    if (this.c.main() === 'open') this.missed();
    this.c.sim.removeEffect(BIN_FX);
    this.c.sim.removeEffect(DIM_FX);
  }

  private callHappens(others: number): void {
    const s = this.c.sim;
    s.sfx('phoneRing');
    s.narrate(MEMO.ring, { icon: 'phone', room: 'meeting' });
    this.c.notes.closureKnown = true;
    this.c.notes.call = true;
    s.setFact('story.closure', MEMO.closure);
    s.setFact('story.memo', null);
    s.setFact('story.rumour', null);
    s.remember('all', 'The regional vice president phoned the conference room: Corporate may close this branch on Friday.', 3);
    s.convince('michael', null);
    s.setHiddenNote('michael', null);
    s.setProp('michael', null);
    s.removeEffect(DIM_FX);
    s.removeEffect(LAMP_FX);
    // Whoever was hiding from the news has heard it now.
    for (const st of MEMO.stragglers) if (s.person(st.id)?.conviction?.text === st.conviction) s.convince(st.id, null);
    const u = this.c.used;
    this.c.setExtra('quiet', u.powers.length === 0 && u.anything === 0 && u.cue === 0 ? 'won' : 'lost');
    this.c.setExtra('full', others >= FULL_ROOM ? 'won' : 'lost');
    this.c.win([MEMO.won]);
    // The call itself: the vice president on the speakerphone, then the room.
    const vp = { name: MEMO.vp, icon: 'phone', room: 'meeting' as RoomId };
    const staff = (['stanley', 'pam', 'jim', 'oscar', 'phyllis', 'kevin', 'angela'] as CastId[]).find((id) => {
      const p = s.person(id);
      return !!p && p.present && p.room === 'meeting';
    });
    const lines: ScriptLine[] = [
      { voice: vp, text: MEMO.call.hello },
      { voice: vp, text: MEMO.call.news },
      { who: 'michael', text: MEMO.call.michael, emotion: 'nervous' },
      { voice: vp, text: MEMO.call.inspector },
      ...(staff ? [{ who: staff, text: MEMO.call.staff, emotion: 'nervous' as const, to: 'michael' }] : []),
      { who: 'michael', text: MEMO.call.rally, emotion: 'determined' }
    ];
    this.c.script(lines, { room: 'meeting', then: 'model', why: MEMO.sceneWhy, done: () => this.afterCall() });
  }

  /** The news sinks in. */
  private afterCall(): void {
    const s = this.c.sim;
    for (const p of s.people()) {
      if (!p.isCast || !p.present) continue;
      s.feel(p.id, p.id === 'michael' ? 'determined' : 'nervous', 0.7, 25);
      s.bumpMood(p.id, -0.05);
    }
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: 'Call made' };
    if (st === 'lost') return { progress: 0, status: 'Call missed' };
    const r = this.room();
    const here = r.others + (r.michael ? 1 : 0);
    if (this.c.sim.clock < DAY(14)) {
      return { progress: 0, status: here >= 3 ? `Corporate rings from 14:00. ${here} in the room so far` : MEMO.before };
    }
    const n = Math.min(OTHERS_NEEDED, r.others) + (r.michael ? 1 : 0);
    return { progress: n / 10, status: MEMO.count(r.others, r.michael) };
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
    this.freed = true;
    s.convince('michael', null);
    s.setFact('story.memo', null);
    s.removeEffect(DIM_FX);
    s.narrate(MEMO.lockedOut, { room: 'meeting', beat: true });
    s.goTo('michael', { room: 'meeting' }, { doing: 'staying in the conference room', stay: 120, stayDoing: 'staying in the conference room' });
  }

  pinned(who: CharId): boolean {
    return who === 'michael' && this.holds();
  }

  topics(): string[] {
    if (this.c.main() !== 'open') return [MEMO.closure];
    const out: string[] = [];
    if (this.holds()) out.push(MEMO.topicHiding, MEMO.topicCancelled);
    if (this.bin === 'found') out.push(MEMO.bin.topic);
    return out;
  }

  warns(): Partial<Record<ActionId, string>> {
    if (this.c.main() !== 'open' || this.c.extra('quiet') !== 'open') return {};
    const out: Partial<Record<ActionId, string>> = { anything: MEMO.warnQuiet, cue: MEMO.warnQuiet };
    for (const id of CHAOS_IDS) out[id] = MEMO.warnQuiet;
    return out;
  }

  stakes(): number {
    if (this.c.main() !== 'open') return 0;
    const clock = this.c.sim.clock;
    if (clock >= DAY(14, 45)) return 1;
    if (clock >= DAY(14)) return 0.8;
    if (clock >= DAY(13, 30)) return 0.5;
    return this.bin === 'going' || this.bin === 'searching' ? 0.45 : 0.2;
  }
}

/** On the floor, asleep counts too (a Nap Attack holds a room full of people). */
function onFloorOrAsleep(c: ChapterCtx, p: SimPerson): boolean {
  return p.present && c.sim.holding !== p.id;
}

// ── Tuesday: Not Speaking ────────────────────────────────────────────────────

const GOSSIP_EVERY = 80;
/** Talks that went well, needed to make up (a pushed talk counts 1, a chat on their own 0.5). */
const TALKS_NEEDED = 3;
/** Or both feelings at this or better. */
const MADE_UP = 15;
const ROW_START = -40;
const KIND_TALK = new Set(['talk', 'comfort', 'flirt']);
const SOCIAL_PLANS = new Set(['talk', 'comfort', 'flirt', 'confront', 'gossip']);
/** After lunch, Kevin starts worrying Oscar about the deadline (if they have not made up by then). */
const KEVIN_AT = DAY(13);
/** One conversation, one talk: two counted talks between the pair are at least this far apart. */
const TALK_GAP = 20;
/** A shared enemy in their room brings them together. */
const ENEMIES: Partial<Record<ChaosId, string>> = { raccoon: 'raccoon', bees: 'bees', snackStorm: 'vending machine', ghost: 'ghost' };
const PAPERS = ['angela', 'oscar'] as const;

class RowRun implements ChapterRun {
  private gossipAt = 0;
  private kevinAt = 0;
  private kevinStarted = false;
  private talks = 0;
  private lastTalk = -1e9;
  private locks: CharId[][] = [];
  private tricks = new Set<string>();
  private askAt = 0;
  private warned = new Set<string>();

  constructor(private c: ChapterCtx) {}

  setup(): void {
    const s = this.c.sim;
    for (const [a, b] of [['angela', 'oscar'], ['oscar', 'angela']] as const) s.shiftBond(a, b, ROW_START - s.bond(a, b), ROW.bondNote);
    s.setFact('story.row', ROW.fact);
    s.convince('dwight', ROW.dwight);
    this.gossipAt = s.time + 45;
    // Two sets of figures that do not match, one on each desk.
    for (const id of PAPERS) {
      const f = feetOf(anchor(`desk.${id}`).tile);
      s.addEffect({ id: `story.row.papers.${id}`, kind: 'item', item: 'paperPile', x: f.x + 10, y: f.y + 2 });
    }
  }

  private dwightHolds(): boolean {
    return this.c.sim.person('dwight')?.conviction?.text === ROW.dwight;
  }

  private kevinHolds(): boolean {
    return this.c.sim.person('kevin')?.conviction?.text === ROW.kevin;
  }

  private both(delta: number, why?: string): void {
    this.c.sim.shiftBond('angela', 'oscar', delta, why);
    this.c.sim.shiftBond('oscar', 'angela', delta, why);
  }

  update(): void {
    const s = this.c.sim;
    if (this.c.extra('stirring') === 'open' && !this.dwightHolds()) this.c.setExtra('stirring', 'won');
    if (this.c.main() !== 'open') return;
    if (this.talks >= TALKS_NEEDED || (s.bond('angela', 'oscar') >= MADE_UP && s.bond('oscar', 'angela') >= MADE_UP)) {
      this.madeUp();
      return;
    }
    this.stir();
    if (!this.kevinStarted && s.clock >= KEVIN_AT) this.startKevin();
    this.boostPair();
  }

  /** The obstacle: Dwight keeps warning Angela about Oscar's "plot" (and after lunch Kevin worries Oscar). */
  private stir(): void {
    const s = this.c.sim;
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
    if (this.kevinHolds() && s.time >= this.kevinAt) {
      const k = s.person('kevin');
      const o = s.person('oscar');
      if (k && o && k.present && o.present && k.available && !k.plan && !k.sceneId) {
        s.setPlan('kevin', { kind: 'gossip', target: 'oscar', about: ROW.kevinGossip });
        this.kevinAt = s.time + GOSSIP_EVERY;
      } else {
        this.kevinAt = s.time + 5;
      }
    }
  }

  private startKevin(): void {
    const s = this.c.sim;
    this.kevinStarted = true;
    const k = s.person('kevin');
    if (!k || !k.present || k.conviction) return;
    s.convince('kevin', ROW.kevin);
    s.narrate(ROW.kevinStarts, { beat: true, icon: 'rumour', room: k.room });
    this.kevinAt = s.time + 10;
  }

  /**
   * When one of them walks over to the other on purpose, make sure the conversation happens even
   * when the model is slow: a high-priority scene that waits for up to 90 seconds.
   */
  private boostPair(): void {
    const s = this.c.sim;
    if (s.time < this.askAt) return;
    this.askAt = s.time + 0.5;
    const a = s.person('angela');
    const o = s.person('oscar');
    if (!a || !o || !a.present || !o.present || a.sceneId || o.sceneId) return;
    const lead = a.plan && a.plan.target === 'oscar' && SOCIAL_PLANS.has(a.plan.kind) ? a
      : o.plan && o.plan.target === 'angela' && SOCIAL_PLANS.has(o.plan.kind) ? o : null;
    if (!lead || !lead.plan) return;
    const other = lead === a ? o : a;
    if (Math.hypot(a.x - o.x, a.y - o.y) > 30) return;
    s.requestScene({
      people: [lead.id, other.id], trigger: 'plan', planKind: lead.plan.kind, priority: 8, staleAfter: 90,
      why: `${lead.name} walked over to ${lead.plan.kind === 'flirt' ? 'flirt with' : 'talk to'} ${other.name} about their row over the figures.`
    });
    this.askAt = s.time + 30;
  }

  private madeUp(): void {
    const s = this.c.sim;
    s.narrate(ROW.won, { room: 'accounts', beat: true, icon: 'love' });
    for (const [x, y] of [['angela', 'oscar'], ['oscar', 'angela']] as const) {
      if (s.bond(x, y) < 20) s.shiftBond(x, y, 20 - s.bond(x, y), 'making up after the row');
    }
    const go = { doing: 'going to finish the accounts', stay: 40, stayDoing: 'finishing the accounts' };
    s.goTo('angela', { anchor: 'desk.angela' }, go);
    s.goTo('oscar', { anchor: 'desk.oscar' }, go);
    s.goTo('kevin', { room: 'accounts' }, go);
    s.setFact('story.row', ROW.madeUp);
    s.remember(['angela', 'oscar', 'kevin'], 'Angela and Oscar made up and finished the accounts together.', 2);
    if (this.kevinHolds()) s.convince('kevin', null);
    for (const id of ['angela', 'oscar', 'kevin'] as const) s.feel(id, 'happy', 0.8, 20);
    for (const id of PAPERS) s.removeEffect(`story.row.papers.${id}`);
    this.c.notes.accounts = true;
    if (this.c.extra('kind') === 'open') this.c.setExtra('kind', 'won');
    this.c.win([ROW.won]);
    // Once they are back at their desks, they say it out loud.
    this.c.after(14, () => {
      this.c.script([
        { who: 'angela', text: ROW.scene.angela, emotion: 'embarrassed', to: 'oscar' },
        { who: 'oscar', text: ROW.scene.oscar, emotion: 'happy', to: 'angela' },
        { who: 'kevin', text: ROW.scene.kevin, emotion: 'happy' }
      ], { room: 'accounts', then: 'none' });
    });
  }

  atFive(): void {
    for (const id of PAPERS) this.c.sim.removeEffect(`story.row.papers.${id}`);
    if (this.c.main() !== 'open') return;
    this.c.notes.accounts = false;
    this.c.sim.narrate(ROW.lost, { room: 'accounts', beat: true });
    this.c.lose([ROW.lost]);
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: 'Speaking again' };
    if (st === 'lost') return { progress: 0, status: 'Still not speaking' };
    const s = this.c.sim;
    const avg = (Math.min(s.bond('angela', 'oscar'), MADE_UP) + Math.min(s.bond('oscar', 'angela'), MADE_UP)) / 2;
    const byBond = Math.max(0, Math.min(0.99, (avg - ROW_START) / (MADE_UP - ROW_START)));
    return { progress: Math.max(this.talks / TALKS_NEEDED, byBond), status: ROW.status(Math.floor(this.talks)) };
  }

  /** Read by tests: talks that went well so far. */
  get goodTalks(): number {
    return this.talks;
  }

  /** A talk between the two of them. One they were pushed into counts double. */
  private talk(n: number, bond: number, text: string): void {
    const s = this.c.sim;
    if (s.time - this.lastTalk < TALK_GAP) return;
    this.lastTalk = s.time;
    this.talks += n;
    this.both(bond, 'talking again after the row');
    s.narrate(text, { icon: 'love', room: s.person('angela')?.room });
  }

  /** Something that brings them together once (a party, a confession, a shared enemy). */
  private trick(kind: string, text: string): void {
    if (this.tricks.has(kind) || this.c.main() !== 'open') return;
    this.tricks.add(kind);
    this.talks += 1;
    this.both(12, 'getting on again');
    this.c.sim.narrate(text, { beat: true, icon: 'love', room: this.c.sim.person('angela')?.room });
  }

  /** A stirrer has been at one of them: a whole talk's worth of progress undone. */
  private setBack(who: 'angela' | 'oscar', key: string, text: string, why: string): void {
    const s = this.c.sim;
    this.talks = Math.max(0, this.talks - 1);
    s.shiftBond(who, who === 'angela' ? 'oscar' : 'angela', -6, why);
    const first = !this.warned.has(key);
    this.warned.add(key);
    s.narrate(text, { beat: first, icon: 'rumour', room: s.person(who)?.room });
  }

  onSceneDone(e: SceneDoneInfo): void {
    if (this.c.main() !== 'open') return;
    const has = (id: CharId): boolean => e.people.includes(id);
    if (has('angela') && has('oscar')) {
      const pushed = e.trigger === 'whisper' || e.trigger === 'cue' || (e.trigger === 'plan' && !!e.planKind && KIND_TALK.has(e.planKind));
      this.talk(pushed ? 1 : 0.5, pushed ? 10 : 5, pushed ? ROW.talkPushed : ROW.talkChat);
    } else if (has('dwight') && has('angela') && this.dwightHolds()) {
      this.setBack('angela', 'dwight', ROW.dwightWarns, "Dwight's warnings about Oscar");
    } else if (has('kevin') && has('oscar') && this.kevinHolds()) {
      this.setBack('oscar', 'kevin', ROW.kevinWarns, "Kevin's worrying about the deadline");
    }
  }

  onChaosStart(e: ChaosStartInfo): void {
    if (this.c.main() !== 'open') return;
    const s = this.c.sim;
    const { who, other } = e.target;
    const pair = (x?: CharId, y?: CharId): boolean => (x === 'angela' && y === 'oscar') || (x === 'oscar' && y === 'angela');
    // Cupid's Arrow between them: a big push (a feeling, and half a talk's worth of thawing).
    if (e.id === 'love' && who && other && pair(who, other)) {
      s.shiftBond(who, other, 20);
      this.talks += 0.5;
    }
    if (e.id === 'lockIn' && who && other) this.locks.push([who, other]);
    const a = s.person('angela');
    const o = s.person('oscar');
    const together = !!a && !!o && a.present && o.present && a.room === o.room;
    const inTheirRoom = together && (e.room === a!.room || (!!who && s.person(who)?.room === a!.room));
    if (e.id === 'birthday' && together && (who === 'angela' || who === 'oscar')) {
      this.trick('party', who === 'angela' ? ROW.party('Angela', 'Oscar') : ROW.party('Oscar', 'Angela'));
    }
    if (e.id === 'truth' && who === 'oscar') this.trick('truth', ROW.truthOscar);
    if (e.id === 'truth' && who === 'angela') this.trick('truth', ROW.truthAngela);
    const enemy = ENEMIES[e.id];
    if (enemy && inTheirRoom) this.trick('enemy', ROW.enemy(enemy));
    if (e.id === 'puppy' && inTheirRoom) this.trick('puppy', ROW.puppy);
  }

  onChaosEnd(id: ChaosId): void {
    if (id !== 'lockIn') return;
    const pair = this.locks.shift();
    if (!pair || this.c.main() !== 'open') return;
    if (pair.includes('angela') && pair.includes('oscar')) {
      this.talks += 1;
      this.both(18, 'were locked in together and had to talk');
      this.c.sim.narrate(ROW.lockedTalk, { room: 'meeting', beat: true, icon: 'lockIn' });
    }
  }

  onAction(a: PlayerAction): void {
    if (a.kind === 'power' && (a.id === 'lockIn' || a.id === 'love') && this.c.main() === 'open') this.c.setExtra('kind', 'lost');
  }

  /** While they are making up, a scene never makes them like each other less: the chapter counts the talks itself. */
  vetoShift(who: CharId, about: CharId, delta: number): number | undefined {
    if (this.c.main() !== 'open') return undefined;
    const pair = (who === 'angela' && about === 'oscar') || (who === 'oscar' && about === 'angela');
    return pair ? Math.max(0, delta) : undefined;
  }

  topics(): string[] {
    // Settled (made up, or the accounts went in late): the office goes back to its usual chatter.
    if (this.c.main() !== 'open') return [];
    const out = [ROW.topicRow, ROW.topicDue];
    if (this.dwightHolds()) out.push(ROW.topicDwight);
    return out;
  }

  warns(): Partial<Record<ActionId, string>> {
    if (this.c.main() !== 'open' || this.c.extra('kind') !== 'open') return {};
    return { lockIn: ROW.warnKind, love: ROW.warnKind };
  }

  stakes(): number {
    if (this.c.main() !== 'open') return 0;
    const clock = this.c.sim.clock;
    const day = Math.max(0, Math.min(1, (clock - DAY(9)) / (DAY(17) - DAY(9))));
    return Math.min(1, 0.25 + day * 0.6 + (clock >= DAY(16) ? 0.15 : 0));
  }
}

// ── Wednesday: The Client ────────────────────────────────────────────────────

export const FIGGIS = 'visitor:figgis';
export const SALES: readonly CastId[] = ['jim', 'dwight', 'phyllis', 'stanley', 'andy'];
/** How each salesperson suits Mr Figgis: seconds to close, and patience he loses each second they talk. */
const PITCHERS: Record<string, { secs: number; drain: number }> = {
  stanley: { secs: 12, drain: 0 },
  jim: { secs: 15, drain: 0 },
  phyllis: { secs: 15, drain: 0 },
  andy: { secs: 18, drain: 1.5 },
  dwight: { secs: 18, drain: 1.5 }
};
/** A joker or a shouter only pitches if the player sent them in (named, told, whispered or carried) this recently. */
const INVITED_FOR = 150;
const SALES_TEAM_RE = /\b(sales ?(team|people|staff|force)|salespeople|salesmen)\b/i;
const BEST_FIRST = ['stanley', 'jim', 'phyllis', 'andy', 'dwight'];
const PATIENCE_START = 70;
/** The accounts went in late yesterday, and he has heard about it. */
const PATIENCE_LATE = 60;
/** Patience lost each second with no salesperson near him (twice that with Michael near). */
const DRAIN = 0.15;
const PITCH_MIN = 50;
const NEAR = 64;
const MEDDLE_FIRST = 40;
const MEDDLE_EVERY = 80;
const DOG_RE = /\b(dogs?|pupp(y|ies)|pup|hound|retriever|labrador|spaniel|terrier|poodle|beagle|collie|dachshund|pug|corgi|bulldog|sheepdog|greyhound|dalmatian)\b/i;
const CLIENT_RE = /\b(figgis|client|customer)\b/i;
const BALLOONS_FX = 'story.client.balloons';

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
  private gone = false;
  private pitchT = 0;
  private pitchWith: CharId | null = null;
  private pitchId = 0;
  private scriptDone = false;
  private rough = false;
  private leavingAt = -1;
  private michaelAt = 0;
  private below50 = false;
  private annoyedAt = -1e9;
  private grabbedOnce = false;
  private meddledOnce = false;
  /** When the player last sent each salesperson to him (named, told, whispered or carried). */
  private invited = new Map<CharId, number>();
  /** A salesperson told to bring him to a meeting room. */
  private escorting: { who: CharId; room: 'meeting' | 'boss'; since: number } | null = null;

  constructor(private c: ChapterCtx) {}

  setup(): void {
    registerFiggis();
    this.c.sim.setFact('story.client', CLIENT.fact);
    if (this.c.notes.accounts === false) this.patience = PATIENCE_LATE;
    // Michael's idea of a welcome: balloons by the front door (and a line saying whose idea they were).
    this.c.sim.addEffect({ id: BALLOONS_FX, kind: 'balloons', room: 'bullpen', count: 5 });
    this.c.after(16, () => this.c.sim.narrate(CLIENT.balloons, { beat: true, icon: 'party', room: 'bullpen' }));
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
    if (this.spawned && !this.gone && !s.person(FIGGIS)) this.figgisGone();
    if (!this.spawned || this.c.main() !== 'open') return;
    const f = this.figgis();
    // His patience only starts to wear once he is through the door.
    if (f && f.room !== 'outside') {
      const around = s.peopleNear(f.x, f.y, NEAR);
      const sales = around.some((p) => SALES.includes(p.id as CastId) && p.present);
      const michael = around.some((p) => p.id === 'michael');
      this.bump(-((sales ? 0 : DRAIN) + (michael ? DRAIN : 0)) * dt);
      this.meddle(f, michael);
      this.walkHimIn();
      this.pitch(f, dt);
      if (this.c.main() !== 'open') return;
      this.watchPatience(f);
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
    // The contract, ready to sign.
    s.setProp(FIGGIS, 'papers');
    s.feel(FIGGIS, 'bored', 0.5, 20);
    const door = feetOf(anchor('door.entrance').tile);
    s.sfx('doorOpen', door.x);
    s.narrate(this.patience < PATIENCE_START ? CLIENT.arrivesLate : CLIENT.arrives, { icon: 'coin', room: 'bullpen', beat: true, slow: true });
    s.bus.emit('focus', { x: door.x - 80, y: door.y - 80, w: 160, h: 110, weight: 1, holdMs: 6000 });
    s.setFact('story.client', CLIENT.waitingFact);
    s.remember('all', 'Mr Figgis of Figgis Hardware came in to decide whether to sign for another year.', 1.5);
    this.michaelAt = s.time + MEDDLE_FIRST;
  }

  /** The obstacle: Michael is sure he can close the deal himself, and keeps going over to try. */
  private meddle(f: SimPerson, already: boolean): void {
    const s = this.c.sim;
    if (s.time < this.michaelAt) return;
    const m = s.person('michael');
    // Someone with an idea of his own (a whisper) has better things to do.
    if (!m || !m.present || already || this.pitchWith || !m.available || m.plan || m.sceneId || m.conviction) {
      this.michaelAt = s.time + 5;
      return;
    }
    this.michaelAt = s.time + MEDDLE_EVERY;
    s.setPlan('michael', { kind: 'talk', target: f.id, about: CLIENT.meddle });
  }

  /** In a meeting room with a salesperson, while he is still willing to talk business. Who pitches matters. */
  private pitch(f: SimPerson, dt: number): void {
    const s = this.c.sim;
    const room = f.room;
    const inRoom = (room === 'meeting' || room === 'boss') && onFloor(this.c, f);
    const sellers = inRoom ? s.peopleIn(room).filter((p) => SALES.includes(p.id as CastId) && onFloor(this.c, p)) : [];
    if (!sellers.length) {
      this.endPitch();
      return;
    }
    if (this.patience < PITCH_MIN) {
      if (this.pitchWith) {
        const who = displayName(this.pitchWith);
        this.endPitch();
        this.annoyedAt = s.time;
        s.narrate(CLIENT.lostHim(who), { beat: true, icon: 'coin', room });
      } else if (s.time - this.annoyedAt > 30) {
        this.annoyedAt = s.time;
        s.narrate(CLIENT.tooAnnoyed, { beat: true, icon: 'coin', room });
      }
      return;
    }
    // Jim, Phyllis and Stanley sit down with him whenever they are there. Andy and Dwight only if the
    // player sent them in; and a better salesperson arriving takes over from them.
    const ok = sellers.filter((p) => !PITCHERS[p.id]?.drain || s.time - (this.invited.get(p.id) ?? -1e9) < INVITED_FOR);
    if (!ok.length) {
      this.endPitch();
      return;
    }
    const best = ok.slice().sort((a, b) => BEST_FIRST.indexOf(a.id) - BEST_FIRST.indexOf(b.id))[0];
    const current = ok.find((p) => p.id === this.pitchWith);
    const partner = current && !(this.rough && !PITCHERS[best.id]?.drain) ? current : best;
    if (this.pitchWith !== partner.id) {
      if (current) s.narrate(CLIENT.takesOver(partner.name, current.name), { icon: 'coin', room });
      this.startPitch(partner, room);
    }
    const how = PITCHERS[partner.id] ?? PITCHERS.jim;
    this.pitchT += dt;
    if (how.drain) this.bump(-how.drain * dt);
    if (this.patience < PITCH_MIN) return;
    if (this.pitchT >= how.secs && this.scriptDone) this.sign();
  }

  private startPitch(partner: SimPerson, room: RoomId): void {
    const s = this.c.sim;
    this.pitchWith = partner.id;
    this.pitchT = 0;
    this.scriptDone = false;
    const id = ++this.pitchId;
    this.rough = !!PITCHERS[partner.id]?.drain;
    const roomName = room === 'boss' ? "Michael's office" : 'the conference room';
    s.narrate(CLIENT.sitsDown(partner.name, roomName), { beat: true, icon: 'coin', room });
    s.setFact('story.client', CLIENT.meetingFact(partner.name, roomName));
    if (this.rough && CLIENT.rough[partner.id]) s.narrate(CLIENT.rough[partner.id], { icon: 'coin', room });
    const script = CLIENT.pitch[partner.id] ?? CLIENT.pitch.jim;
    const lines: ScriptLine[] = script.map(([who, text]) => who === 'figgis'
      ? { who: FIGGIS, text, to: partner.id, emotion: this.rough ? 'angry' : 'neutral' }
      : { who: partner.id, text, to: FIGGIS, kind: partner.id === 'dwight' ? 'shout' : 'say', emotion: this.rough ? 'excited' : 'happy' });
    this.c.script(lines, { room, then: 'none', done: () => { if (this.pitchId === id) this.scriptDone = true; } });
  }

  private endPitch(): void {
    if (this.pitchWith && this.c.main() === 'open') this.c.sim.setFact('story.client', CLIENT.waitingFact);
    this.pitchT = 0;
    this.pitchWith = null;
    this.scriptDone = false;
    this.pitchId += 1;
  }

  /** Say it plainly once he drops below 50, so the player knows why the meeting will not happen. */
  private watchPatience(f: SimPerson): void {
    if (this.patience < PITCH_MIN && !this.below50) {
      this.below50 = true;
      if (!this.pitchWith) this.c.sim.narrate(CLIENT.fedUp50, { beat: true, icon: 'coin', room: f.room });
    } else if (this.patience >= PITCH_MIN + 5) {
      this.below50 = false;
    }
  }

  private sign(): void {
    const s = this.c.sim;
    const rough = this.rough;
    this.endPitch();
    s.sfx('coin');
    const f = s.person(FIGGIS);
    if (f) s.fx({ kind: 'burst', what: 'cash', x: f.x, y: f.y - 18, count: 14 });
    const text = rough ? CLIENT.signedRough : CLIENT.signed;
    s.narrate(text, { icon: 'coin', beat: true });
    s.feel(FIGGIS, rough ? 'bored' : 'happy', 0.8, 30);
    s.setProp(FIGGIS, null);
    s.setFact('story.client', CLIENT.signedFact);
    s.remember('all', CLIENT.signedFact, 2);
    for (const p of s.people()) if (p.isCast && p.present) s.feel(p.id, 'happy', 0.6, 15);
    this.c.notes.figgis = true;
    this.c.setExtra('michael', 'won');
    this.c.win([text]);
    this.c.after(6, () => this.leave());
  }

  private walkOut(text: string): void {
    const s = this.c.sim;
    this.endPitch();
    s.narrate(text, { icon: 'coin', beat: true });
    s.feel(FIGGIS, 'angry', 0.8, 30);
    s.setFact('story.client', CLIENT.goneFact);
    s.remember('all', CLIENT.goneFact, 2);
    for (const p of s.people()) if (p.isCast && p.present) s.feel(p.id, 'nervous', 0.6, 15);
    this.c.notes.figgis = false;
    // Kept away from him all along, even if the deal fell through.
    this.c.setExtra('michael', 'won');
    this.c.lose([text]);
    this.leave();
  }

  private leave(): void {
    const s = this.c.sim;
    if (!s.person(FIGGIS)) return;
    this.leavingAt = s.time;
    s.goTo(FIGGIS, { anchor: 'exit.street' }, { style: 'walk', doing: 'leaving', stay: 0, then: () => s.removeVisitor(FIGGIS) });
  }

  /** He has left the building: a dog can no longer find him, and the balloons come down. */
  private figgisGone(): void {
    this.gone = true;
    this.c.setExtra('dog', 'lost');
    this.c.sim.removeEffect(BALLOONS_FX);
  }

  atFive(): void {
    this.c.sim.removeEffect(BALLOONS_FX);
    if (this.c.main() === 'open') {
      this.c.notes.figgis = false;
      this.c.lose([CLIENT.late]);
    }
  }

  /** Take Mr Figgis to a meeting room: "Tell Jim: take Mr Figgis to the conference room." */
  private escort(who: CharId, room: 'meeting' | 'boss'): void {
    if (!this.figgis()) return;
    this.escorting = { who, room, since: this.c.sim.time };
  }

  /** The salesperson walks over to him (after any chat the order set off), then takes him along. */
  private walkHimIn(): void {
    const e = this.escorting;
    if (!e) return;
    const s = this.c.sim;
    const p = s.person(e.who);
    const f = this.figgis();
    if (!p || !p.present || !f || s.time - e.since > 90) {
      this.escorting = null;
      return;
    }
    if (p.sceneId || f.sceneId || !p.available || !onFloor(this.c, f)) return;
    const roomName = e.room === 'boss' ? "Michael's office" : 'the conference room';
    if (Math.hypot(p.x - f.x, p.y - f.y) <= 40) {
      this.escorting = null;
      s.narrate(CLIENT.escort(p.name, roomName), { beat: true, icon: 'coin', room: e.room });
      s.goTo(e.who, { room: e.room }, { doing: `taking Mr Figgis to ${roomName}`, stay: 100, stayDoing: `waiting in ${roomName}` });
      s.goTo(FIGGIS, { room: e.room }, { doing: `following ${p.name} to ${roomName}`, stay: 100000, stayDoing: `waiting in ${roomName}` });
      return;
    }
    if (p.doing !== CLIENT.fetching) s.goTo(e.who, { near: FIGGIS }, { doing: CLIENT.fetching, stay: 8, stayDoing: CLIENT.fetching });
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: 'Signed' };
    if (st === 'lost') return { progress: 0, status: 'Walked out' };
    if (!this.spawned) return { progress: this.patience / 100, status: CLIENT.before };
    const p = Math.round(this.patience);
    if (this.pitchWith) {
      const secs = (PITCHERS[this.pitchWith] ?? PITCHERS.jim).secs;
      return { progress: this.patience / 100, status: CLIENT.statusPitch(displayName(this.pitchWith), Math.min(secs, Math.floor(this.pitchT)), secs) };
    }
    if (this.patience < PITCH_MIN) return { progress: this.patience / 100, status: CLIENT.statusAnnoyed(p) };
    return { progress: this.patience / 100, status: CLIENT.statusPatience(p) };
  }

  /** Read by tests. */
  get currentPatience(): number {
    return this.patience;
  }

  onPickedUp(who: CharId): void {
    if (SALES.includes(who as CastId)) this.invited.set(who, this.c.sim.time);
    if (who !== FIGGIS || !this.spawned || this.c.main() !== 'open') return;
    // He hates being grabbed.
    this.bump(-15);
    if (!this.grabbedOnce) {
      this.grabbedOnce = true;
      this.c.sim.narrate('Mr Figgis hates being picked up. His patience drops.', { icon: 'coin', beat: true });
    }
  }

  onAction(a: PlayerAction): void {
    const s = this.c.sim;
    // Who the player sends: named in an announcement (or the whole sales team), told, or whispered to.
    if (a.kind === 'announce' && a.text) {
      const all = SALES_TEAM_RE.test(a.text) || /\b(everyone|everybody|all staff|all hands)\b/i.test(a.text);
      for (const id of SALES) if (all || new RegExp(`\\b${displayName(id)}\\b`, 'i').test(a.text)) this.invited.set(id, s.time);
    }
    if ((a.kind === 'cue' || a.kind === 'whisper') && a.who && SALES.includes(a.who as CastId)) this.invited.set(a.who, s.time);
    if (this.c.main() !== 'open' || !this.spawned) return;
    const f = this.figgis();
    if (!f) return;
    // A dog brought in with Anything finds him wherever he is.
    if (a.kind === 'anything' && a.text && DOG_RE.test(a.text)) {
      if (this.c.extra('dog') === 'open') {
        this.bump(30);
        this.c.setExtra('dog', 'won');
        this.c.sim.narrate(CLIENT.dogAnything, { beat: true, icon: 'puppy', room: f.room });
      } else {
        this.bump(10);
      }
    }
    // "Tell Jim to take Mr Figgis to the conference room", or the same idea whispered to a salesperson.
    if ((a.kind === 'cue' || a.kind === 'whisper') && a.who && SALES.includes(a.who as CastId) && a.text && CLIENT_RE.test(a.text)) {
      this.escort(a.who, roomNamedIn(a.text) === 'boss' ? 'boss' : 'meeting');
    }
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
    if (e.people.includes('michael')) {
      this.bump(-10);
      this.c.setExtra('michael', 'lost');
      if (!this.meddledOnce) {
        this.meddledOnce = true;
        this.c.sim.narrate(CLIENT.meddled, { beat: true, icon: 'coin' });
      }
    }
  }

  topics(): string[] {
    // Settled (signed, or he walked out): the office goes back to its usual chatter.
    if (this.c.main() !== 'open') return [];
    return [this.spawned ? CLIENT.topicWaiting : CLIENT.topicComing];
  }

  warns(): Partial<Record<ActionId, string>> {
    if (!this.spawned || this.c.main() !== 'open') return {};
    const out: Partial<Record<ActionId, string>> = { disco: CLIENT.warnDisco };
    for (const id of CHAOS_IDS) if (CHAOS[id].incident) out[id] = CLIENT.warnDisaster;
    return out;
  }

  stakes(): number {
    if (this.c.main() !== 'open') return 0;
    if (!this.spawned) return 0.2;
    if (this.pitchWith) return 0.75;
    return Math.max(0.3, Math.min(1, 1.1 - this.patience / 100));
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
const HERRING_STAY = 45;
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
  /** Everyone sent to keep the leak company on this trip. */
  tried: CastId[];
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
    const leakFree = !!leak && leak.present && leak.available && !leak.sceneId;
    if (!t) {
      if (s.time < this.nextSend || s.time < this.quietUntil) return;
      if (!leakFree || leak!.plan) {
        this.nextSend = s.time + 5;
        return;
      }
      const n = this.beeps.length + 1;
      // The first two pages always have company at the fax machine (someone new for the second);
      // later pages now and then.
      const wanted = n <= 2 || this.c.rng() < 0.35;
      const avoid = n === 2 ? (this.beeps[0]?.there ?? []) : [];
      const herring = wanted ? this.companion(avoid, n <= 2 ? this.herrings[n - 1] : undefined) : null;
      if (wanted && !herring && n <= 2 && this.postponed < 8) {
        this.postponed += 1;
        this.nextSend = s.time + 5;
        return;
      }
      this.postponed = 0;
      this.trip = { stage: herring ? 'herring' : 'leak', started: s.time, herring, herringThere: false, arrivedAt: -1, tried: herring ? [herring] : [] };
      if (herring) this.sendCompany(herring);
      else this.leakGoes();
      return;
    }
    if (t.stage === 'herring') {
      const h = t.herring ? s.person(t.herring) : undefined;
      const there = !!h && h.present && h.doing === LEAK.fax.stay;
      if (there && leakFree) {
        this.leakGoes();
        return;
      }
      // Company that left again, or never got there: send someone else (twice at most), then go alone.
      const gone = t.herringThere && !there;
      if (gone || (!t.herringThere && s.time - t.started > HERRING_WAIT)) {
        const n = this.beeps.length + 1;
        const avoid = [...t.tried, ...(n === 2 ? (this.beeps[0]?.there ?? []) : [])];
        const next = t.tried.length < 3 ? this.companion(avoid) : null;
        if (next) {
          t.herring = next;
          t.herringThere = false;
          t.started = s.time;
          t.tried.push(next);
          this.sendCompany(next);
        } else if (leakFree) this.leakGoes();
        else if (s.time - t.started > HERRING_WAIT + 25) this.abandon();
      }
      return;
    }
    if (t.stage === 'leak') {
      // Picked up or pulled into a conversation on the way: try again soon.
      if (s.time - t.started > 60) this.abandon();
      return;
    }
    if (s.time >= t.arrivedAt + BEEP_AFTER) {
      if (s.facts().some((f) => f.includes('fax machine in the annex has been smashed'))) {
        if (leak && leak.present) {
          s.feel(leak.id, 'scared', 0.9, 10);
          s.emote(leak.id, 'alert');
          s.narrate(`${displayName(leak.id)} reached the fax machine and froze — it has been smashed to pieces!`, { icon: 'warn', room: 'annex', beat: true });
        }
        this.trip = null;
        this.nextSend = s.time + 90;
        return;
      }
      if (leak && leak.present && leak.doing === LEAK.fax.stay) this.beep();
      else this.abandon();
    }
  }

  /** Someone innocent and free to run an errand to the fax machine now: `prefer` first, then the day's errand runners, then anyone. */
  private companion(avoid: CharId[], prefer?: CastId): CastId | null {
    const s = this.c.sim;
    const free = (id: CastId): boolean => {
      const p = s.person(id);
      return !!p && p.present && p.available && !p.sceneId && !p.plan && !avoid.includes(id) && id !== this.leak;
    };
    if (prefer && free(prefer)) return prefer;
    const runner = this.herrings.find(free);
    if (runner) return runner;
    const others = LEAK.candidates.filter((id) => !LEAK.witnesses.includes(id) && free(id));
    return others.length ? this.c.rng.pick(others) : null;
  }

  private sendCompany(who: CastId): void {
    this.sendHerring(who, HERRING_STAY, () => {
      if (this.trip?.herring === who) this.trip.herringThere = true;
    });
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
    // Once the leak is caught (or has got away), the office stops guessing.
    if (this.c.main() !== 'open') return [];
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
    this.c.after(16, () => s.narrate(VERDICT.cake, { beat: true, icon: 'party', room: 'kitchen' }));
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
    const eliminated = s.people().filter((p) => p.isCast && s.hasStatus(p.id, 'eliminated'));
    const bodyPenalty = eliminated.length ? 35 : 0;
    const bodyNote = eliminated.length ? 'The inspector saw the chalk outline on the floor and stopped taking notes.' : '';
    if (bodyNote) s.narrate(bodyNote, { icon: 'inspector', beat: true });
    // A row nobody stopped is seen even if the tour was cut short.
    const row = this.problem('row');
    if (row?.state === 'live') this.fail(row);
    const failed = this.problems.filter((p) => p.state === 'failed');
    const penalty = failed.reduce((sum, p) => sum + (p.id === 'leak' ? INSPECTION_POINTS.lastPage : INSPECTION_POINTS.problem), 0) + (this.dangling ? INSPECTION_POINTS.problem : 0) + bodyPenalty;
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
      [...this.stopLines.filter(Boolean), calmLine, bodyNote].filter(Boolean).join(' '),
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
    chapter: 1, weekday: 'Monday', title: MEMO.title, intro: MEMO.intro, hints: MEMO.hints, help: MEMO.help, goal: MEMO.goal,
    extras: [{ ...MEMO.extras[0], atFive: 'lost' }, { ...MEMO.extras[1], atFive: 'lost' }],
    locked: MEMO.locked, change: [MEMO.changeWon, MEMO.changeLost], suggest: MEMO.suggest,
    create: (c) => new MemoRun(c)
  },
  {
    chapter: 2, weekday: 'Tuesday', title: ROW.title, intro: ROW.intro, hints: ROW.hints, help: ROW.help, goal: ROW.goal,
    extras: [{ ...ROW.extras[0], atFive: 'lost' }, { ...ROW.extras[1], atFive: 'lost' }],
    locked: {}, change: [ROW.changeWon, ROW.changeLost], suggest: ROW.suggest,
    recap: (n) => (n.call === undefined ? null : n.call ? ROW.recapCall : ROW.recapNoCall),
    create: (c) => new RowRun(c)
  },
  {
    chapter: 3, weekday: 'Wednesday', title: CLIENT.title, intro: CLIENT.intro, hints: CLIENT.hints, help: CLIENT.help, goal: CLIENT.goal,
    extras: [{ ...CLIENT.extras[0], atFive: 'lost' }, { ...CLIENT.extras[1], atFive: 'lost' }],
    locked: {}, change: [CLIENT.changeWon, CLIENT.changeLost], suggest: CLIENT.suggest,
    recap: (n) => (n.accounts === undefined ? null : n.accounts ? CLIENT.recapAccounts : CLIENT.recapLate),
    create: (c) => new ClientRun(c)
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
