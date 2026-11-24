import type { ActionId } from '@/game/app/gameApi';
import { registerVisitor } from '@/game/core/cast';
import { CHAOS } from '@/game/core/chaos';
import type { SimPerson } from '@/game/core/simApi';
import type { CastId, ChaosId, RoomId } from '@/game/core/types';
import { anchor, feetOf } from '@/game/core/world';
import type { Sim } from '@/game/sim';
import { PARK_RALLY, PARK_RANGER, PARK_TRUCE } from './parkText';
import type { ChapterCtx, ChapterDef, ChapterRun, ChaosStartInfo, PlayerAction, SceneDoneInfo, ScriptLine, WeekNotes } from './types';

export const RANGER = 'visitor:ranger';

const DAY = (h: number, m = 0): number => h * 60 + m;

export function registerRanger(): void {
  registerVisitor({
    id: RANGER,
    name: 'Ranger Miller',
    role: 'Park Ranger',
    color: 0x3b6e4c,
    voice: { pitch: 112, wave: 'triangle', spread: 1.4, speed: 0.9 },
    summary: 'Ranger Miller of Scranton Parks and Recreation. Crisp, observant, and allergic to unpermitted corporate fun.',
    wants: 'clean turf, extinguished coals, and groups that leave by dusk',
    fears: 'unsupervised charcoal grills and bullhorns',
    quirk: 'taps a steel clipboard before citing an ordinance',
    look: {
      skin: 'tan',
      hair: [62, 48, 36],
      outfit: [58, 102, 68],
      trim: [212, 184, 96],
      style: 'dressshirt',
      hairStyle: 'styleShort',
    },
  });
}

function onFloor(s: Sim, p: SimPerson | undefined): p is SimPerson {
  return !!p && p.present && !s.isSeized(p.id) && !s.isAirborne(p.id);
}

function near(a: { x: number; y: number }, b: { x: number; y: number }, d: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= d;
}

function anyGrillTrouble(s: Sim): boolean {
  if (s.isHazard('kitchen')) return true;
  return s.activeChaos().some((c) => c.id === 'fire' || c.id === 'raccoon');
}

function isDistressed(p: SimPerson): boolean {
  return p.mood < -20 || p.emotion === 'angry' || p.emotion === 'sad' || p.emotion === 'scared';
}

// ── Act 1 (Morning): Mandatory Fun ───────────────────────────────────────────

const RALLY_NEEDED = 7;
const RALLY_HOLD_SECS = 6;
const RALLY_DEADLINE = DAY(12, 0);

class MandatoryFunRun implements ChapterRun {
  private scattered = false;
  private grumbled = false;
  private holdT = 0;
  private peak = 0;
  private steerAt = 0;

  constructor(private c: ChapterCtx) {}

  setup(): void {
    const s = this.c.sim;
    s.convince('michael', 'Everyone needs to gather on the Great Lawn for the morning pep talk!');
    s.setFact('story.parkRally', 'Michael is trying to assemble seven colleagues on the Great Lawn before noon.');
    this.steerAt = s.time + 3;
  }

  update(dt: number): void {
    const s = this.c.sim;
    if (this.c.main() !== 'open') return;
    if (!this.scattered && s.clock >= DAY(9, 1)) {
      this.scattered = true;
      this.scatterStaff();
    }
    if (!this.grumbled && s.clock >= DAY(9, 25)) {
      this.grumbled = true;
      const stan = s.person('stanley');
      const dwight = s.person('dwight');
      const lines: ScriptLine[] = [];
      if (stan?.present) lines.push(PARK_RALLY.lines.stanleyDrag);
      if (dwight?.present) lines.push(PARK_RALLY.lines.dwightScout);
      if (lines.length) this.c.script(lines, { room: 'bullpen', then: 'none' });
    }
    if (s.time >= this.steerAt) {
      this.steerAt = s.time + 14;
      this.keepMichaelOnLawn();
    }
    if (anyGrillTrouble(s) && this.c.extra('calmGrill') === 'open') {
      this.c.setExtra('calmGrill', 'lost');
      s.narrate(PARK_RALLY.beats.warning, { icon: 'warn', room: 'kitchen', beat: true });
    }
    // Wait until everyone has dispersed to their morning park spots before counting a huddle.
    if (s.clock < DAY(9, 6)) return;
    const { onLawn, ready } = this.countHuddle();
    if (onLawn > this.peak) this.peak = onLawn;
    if (ready && !anyGrillTrouble(s)) {
      this.holdT += dt;
      if (this.holdT >= RALLY_HOLD_SECS) {
        this.succeed();
        return;
      }
    } else {
      this.holdT = Math.max(0, this.holdT - dt * 0.6);
    }
    if (s.clock >= RALLY_DEADLINE) this.fail();
  }

  private scatterStaff(): void {
    const s = this.c.sim;
    const targets: Partial<Record<CastId, { room: RoomId; doing: string }>> = {
      dwight: { room: 'annex', doing: 'scouting ducks at the pond' },
      creed: { room: 'annex', doing: 'skipping flat pebbles across the pond' },
      toby: { room: 'annex', doing: 'watching the ducks alone' },
      stanley: { room: 'accounts', doing: 'claiming a shady oak bench' },
      phyllis: { room: 'accounts', doing: 'admiring the flowerbeds' },
      oscar: { room: 'accounts', doing: 'reading under an oak tree' },
      kevin: { room: 'kitchen', doing: 'eying the burger grill' },
      meredith: { room: 'kitchen', doing: 'investigating the drinks cooler' },
      kelly: { room: 'kitchen', doing: 'sampling snacks by the cart' },
      angela: { room: 'meeting', doing: 'inspecting picnic tablecloth hygiene' },
      andy: { room: 'meeting', doing: 'tuning his guitar in the pavilion' },
      ryan: { room: 'meeting', doing: 'checking reception from the pavilion' },
    };
    for (const [id, dest] of Object.entries(targets) as [CastId, { room: RoomId; doing: string }][]) {
      const p = s.person(id);
      if (!p || !onFloor(s, p) || !p.available || p.sceneId) continue;
      s.goTo(id, { room: dest.room }, { style: 'walk', doing: dest.doing, stay: 280, stayDoing: dest.doing });
    }
    s.narrate(PARK_RALLY.beats.start, { icon: 'announce', room: 'bullpen', beat: true });
  }

  private keepMichaelOnLawn(): void {
    const s = this.c.sim;
    const m = s.person('michael');
    if (!m || !onFloor(s, m) || !m.available || m.sceneId || m.room === 'bullpen') return;
    s.goTo('michael', { room: 'bullpen' }, { doing: 'waving people onto the Great Lawn', stay: 60, stayDoing: 'leading the Great Lawn huddle' });
  }

  private countHuddle(): { onLawn: number; ready: boolean } {
    const s = this.c.sim;
    const m = s.person('michael');
    const michaelHere = !!m && onFloor(s, m) && m.room === 'bullpen';
    let onLawn = 0;
    for (const p of s.people()) {
      if (!p.isCast || p.id === 'michael') continue;
      if (onFloor(s, p) && p.room === 'bullpen') onLawn += 1;
    }
    return { onLawn, ready: michaelHere && onLawn >= RALLY_NEEDED };
  }

  private succeed(): void {
    const s = this.c.sim;
    this.c.notes.parkRally = true;
    if (this.c.extra('calmGrill') === 'open') this.c.setExtra('calmGrill', 'won');
    s.convince('michael', null);
    s.sfx('objective');
    for (const p of s.peopleIn('bullpen')) {
      if (p.isCast) s.feel(p.id, 'happy', 0.65, 25);
    }
    this.c.script([PARK_RALLY.lines.win], { room: 'bullpen', then: 'none' });
    s.narrate(PARK_RALLY.beats.rallyDone, { icon: 'announce', room: 'bullpen', beat: true });
    this.c.win([PARK_RALLY.outcome.won]);
  }

  private fail(): void {
    const s = this.c.sim;
    this.c.notes.parkRally = false;
    if (this.c.extra('calmGrill') === 'open') this.c.setExtra('calmGrill', anyGrillTrouble(s) ? 'lost' : 'won');
    s.convince('michael', null);
    this.c.script([PARK_RALLY.lines.loss], { room: 'bullpen', then: 'none' });
    s.narrate(PARK_RALLY.beats.timeout, { icon: 'warn', room: 'bullpen', beat: true });
    this.c.lose([PARK_RALLY.outcome.lost]);
  }

  onChaosStart(e: ChaosStartInfo): void {
    if (this.c.main() !== 'open') return;
    if (e.id === 'fire' || e.id === 'raccoon') {
      this.c.setExtra('calmGrill', 'lost');
      this.holdT = 0;
    }
  }

  atFive(): void {
    if (this.c.main() === 'open') this.fail();
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: 'Morning rally complete on the Great Lawn' };
    if (st === 'lost') return { progress: this.peak / RALLY_NEEDED, status: 'Staff stayed scattered across the park' };
    const { onLawn, ready } = this.countHuddle();
    if (ready) {
      const held = Math.min(RALLY_HOLD_SECS, Math.ceil(this.holdT));
      return { progress: 0.75 + 0.25 * (this.holdT / RALLY_HOLD_SECS), status: `Holding Great Lawn huddle (${held}/${RALLY_HOLD_SECS}s)` };
    }
    return { progress: Math.min(0.75, (onLawn / RALLY_NEEDED) * 0.75), status: `${onLawn}/${RALLY_NEEDED} staff with Michael on Great Lawn` };
  }
}

// ── Act 2 (Midday): The Three-Legged Truce ───────────────────────────────────

const TRUCE_BOND_TARGET = 15; // mutual sum starts at -85

class TruceRun implements ChapterRun {
  private feudLineAt = -1;
  private clashCount = 0;
  private kevFedAt = 0;

  constructor(private c: ChapterCtx) {}

  setup(): void {
    const s = this.c.sim;
    const dj = s.bond('dwight', 'jim');
    const jd = s.bond('jim', 'dwight');
    if (dj > -60) s.shiftBond('dwight', 'jim', -60 - dj, 'feuding over the cooler');
    if (jd > -25) s.shiftBond('jim', 'dwight', -25 - jd, 'swapped Dwight\'s whistle');
    s.convince('michael', 'Jim and Dwight have to run the three-legged race together today.');
    s.setFact('story.parkTruce', 'Jim and Dwight are deadlocked before the three-legged relay.');
    s.narrate(PARK_TRUCE.beats.start, { icon: 'warn', room: 'bullpen', beat: true });
    s.goTo('jim', { room: 'bullpen' }, { doing: 'pacing near the race cones', stay: 40 });
    s.goTo('dwight', { room: 'kitchen' }, { doing: 'guarding the beet cooler', stay: 40 });
  }

  private mutualScore(): number {
    const s = this.c.sim;
    return s.bond('dwight', 'jim') + s.bond('jim', 'dwight') + 85;
  }

  private targetGap(): number {
    return 70; // moves mutual bond from -85 to >= -15
  }

  update(dt: number): void {
    const s = this.c.sim;
    if (this.c.main() !== 'open') return;
    const j = s.person('jim');
    const d = s.person('dwight');
    // Check clean BBQ bonus for Kevin.
    const k = s.person('kevin');
    if (this.c.extra('grill') === 'open' && k && onFloor(s, k) && k.room === 'kitchen' && !anyGrillTrouble(s)) {
      this.kevFedAt += dt;
      if (this.kevFedAt >= 4) {
        this.c.setExtra('grill', 'won');
        this.c.notes.parkGrill = true;
        this.c.script([PARK_TRUCE.lines.kevGrill], { room: 'kitchen', then: 'none' });
      }
    }
    if (j && d && onFloor(s, j) && onFloor(s, d)) {
      const sameZone = j.room === d.room || near(j, d, 52);
      const bickering = j.emotion === 'angry' && d.emotion === 'angry';
      if (sameZone && !bickering) {
        const hostile = this.mutualScore() < TRUCE_BOND_TARGET + 25 && (j.mood < -5 || d.mood < -5);
        if (hostile && s.time >= this.feudLineAt) {
          this.feudLineAt = s.time + 36;
          this.clashCount += 1;
          s.shiftBond('dwight', 'jim', -4, 'bickered at the picnic');
          s.shiftBond('jim', 'dwight', -3, 'bickered at the picnic');
          s.narrate(PARK_TRUCE.beats.clash, { icon: 'rage', room: j.room, beat: true });
          this.c.script([PARK_TRUCE.lines.spark, PARK_TRUCE.lines.retort], { room: j.room, then: 'none' });
        }
      }
      if (this.mutualScore() >= this.targetGap() && !bickering) {
        this.succeed();
        return;
      }
    }
    if (s.clock >= DAY(16, 0)) this.fail();
  }

  onAction(a: PlayerAction): void {
    if (this.c.main() !== 'open') return;
    const s = this.c.sim;
    if ((a.kind === 'whisper' || a.kind === 'cue') && (a.who === 'jim' || a.who === 'dwight' || a.who === 'pam' || a.who === 'michael')) {
      const bonus = a.kind === 'whisper' ? 12 : 9;
      s.shiftBond('dwight', 'jim', bonus, 'nudged toward a park truce');
      s.shiftBond('jim', 'dwight', bonus, 'nudged toward a park truce');
    }
    if (a.kind === 'announce') {
      s.shiftBond('dwight', 'jim', 8, 'goodwill announcement');
      s.shiftBond('jim', 'dwight', 8, 'goodwill announcement');
    }
    if (a.kind === 'power' && (a.id === 'pizza' || a.id === 'puppy' || a.id === 'love' || a.id === 'birthday')) {
      s.shiftBond('dwight', 'jim', 10, 'picnic cheer');
      s.shiftBond('jim', 'dwight', 10, 'picnic cheer');
    }
  }

  onChaosStart(e: ChaosStartInfo): void {
    if (this.c.main() !== 'open') return;
    const s = this.c.sim;
    if (e.id === 'fire' || e.id === 'raccoon') {
      if (this.c.extra('grill') === 'open') this.c.setExtra('grill', 'lost');
    }
    if (e.id === 'love' && ((e.target.who === 'jim' && e.target.other === 'dwight') || (e.target.who === 'dwight' && e.target.other === 'jim'))) {
      s.shiftBond('dwight', 'jim', 26, 'Cupid hit the race rivals');
      s.shiftBond('jim', 'dwight', 26, 'Cupid hit the race rivals');
    }
    if (e.id === 'pizza' || e.id === 'birthday' || e.id === 'puppy') {
      s.shiftBond('dwight', 'jim', 12, 'shared picnic morale');
      s.shiftBond('jim', 'dwight', 12, 'shared picnic morale');
    }
  }

  onSceneDone(e: SceneDoneInfo): void {
    if (this.c.main() !== 'open') return;
    const involvesPair = e.people.includes('jim') || e.people.includes('dwight');
    if (!involvesPair) return;
    const s = this.c.sim;
    const both = e.people.includes('jim') && e.people.includes('dwight');
    const boost = both ? 18 : e.people.includes('pam') || e.people.includes('michael') ? 10 : 6;
    s.shiftBond('dwight', 'jim', boost, 'talked it over in the park');
    s.shiftBond('jim', 'dwight', boost, 'talked it over in the park');
  }

  private succeed(): void {
    const s = this.c.sim;
    this.c.notes.parkTruce = true;
    if (this.c.extra('grill') === 'open') this.c.setExtra('grill', 'lost');
    s.convince('michael', null);
    s.sfx('objective');
    s.feel('jim', 'amused', 0.7, 25);
    s.feel('dwight', 'determined', 0.7, 25);
    this.c.script([PARK_TRUCE.lines.truceJim, PARK_TRUCE.lines.truceDwight], { room: 'bullpen', then: 'none' });
    s.narrate(PARK_TRUCE.beats.truce, { icon: 'love', room: 'bullpen', beat: true });
    this.c.win([PARK_TRUCE.outcome.won]);
  }

  private fail(): void {
    const s = this.c.sim;
    this.c.notes.parkTruce = false;
    if (this.c.extra('grill') === 'open') this.c.setExtra('grill', 'lost');
    s.convince('michael', null);
    this.c.script([PARK_TRUCE.lines.loss], { room: 'bullpen', then: 'none' });
    s.narrate(PARK_TRUCE.beats.timeout, { icon: 'warn', room: 'bullpen', beat: true });
    this.c.lose([PARK_TRUCE.outcome.lost]);
  }

  atFive(): void {
    if (this.c.main() === 'open') this.fail();
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: 'Jim and Dwight agreed to run together' };
    if (st === 'lost') return { progress: 0, status: 'Truce never happened before lunch' };
    const ratio = Math.max(0, Math.min(0.95, this.mutualScore() / this.targetGap()));
    return {
      progress: ratio,
      status: this.clashCount > 0 ? `Truce ${Math.round(ratio * 100)}% (watch tempers)` : `Truce progress ${Math.round(ratio * 100)}%`,
    };
  }
}

// ── Act 3 (Afternoon): The Park Ranger ───────────────────────────────────────

const RANGER_STOPS: { room: RoomId; label: string; doing: string; pauseSecs: number }[] = [
  { room: 'bullpen', label: PARK_RANGER.stops.bullpen, doing: 'inspecting the Great Lawn', pauseSecs: 14 },
  { room: 'kitchen', label: PARK_RANGER.stops.kitchen, doing: 'inspecting the BBQ & Snack Stand', pauseSecs: 14 },
  { room: 'annex', label: PARK_RANGER.stops.annex, doing: 'checking the Duck Pond shoreline', pauseSecs: 14 },
  { room: 'boss', label: PARK_RANGER.stops.boss, doing: 'reviewing the Gazebo permit', pauseSecs: 12 },
];

class RangerTourRun implements ChapterRun {
  private spawned = false;
  private stopIndex = 0;
  private arrivedAt = -1;
  private scored = false;
  private goodStops = 0;
  private badStops = 0;
  private hazardSeen = false;
  private michaelBluffed = false;

  constructor(private c: ChapterCtx) {}

  setup(): void {
    registerRanger();
    const s = this.c.sim;
    s.setFact('story.parkRanger', 'Ranger Miller from Parks and Rec is inspecting every zone this afternoon.');
  }

  update(_dt: number): void {
    const s = this.c.sim;
    if (this.c.main() !== 'open') return;
    if (!this.spawned && s.clock >= DAY(9, 12)) {
      this.spawn();
      return;
    }
    if (!this.spawned) return;
    if (!this.michaelBluffed && s.clock >= DAY(9, 20)) {
      this.michaelBluffed = true;
      const m = s.person('michael');
      if (m?.present) this.c.script([PARK_RANGER.lines.michaelBluff], { room: m.room, then: 'none' });
    }
    const r = s.person(RANGER);
    if (!r || !r.present) return;
    const stop = RANGER_STOPS[this.stopIndex];
    if (!stop) return;
    if (r.room === stop.room && this.arrivedAt < 0) {
      this.arrivedAt = s.time;
      this.scored = false;
    }
    if (this.arrivedAt >= 0 && !this.scored && s.time - this.arrivedAt >= stop.pauseSecs * 0.6) {
      this.scored = true;
      this.evaluateStop(stop.room);
    }
    if (this.arrivedAt >= 0 && s.time - this.arrivedAt >= stop.pauseSecs) {
      this.stopIndex += 1;
      this.arrivedAt = -1;
      this.scored = false;
      const next = RANGER_STOPS[this.stopIndex];
      if (next) {
        s.goTo(RANGER, { room: next.room }, { style: 'walk', doing: next.doing, stay: 40, stayDoing: next.doing });
      } else {
        this.conclude();
      }
    }
  }

  private spawn(): void {
    const s = this.c.sim;
    this.spawned = true;
    const gate = feetOf(anchor('exit.street').tile);
    s.spawnVisitor(RANGER, { anchor: 'exit.street' });
    s.setProp(RANGER, 'papers');
    s.sfx('doorOpen', gate.x);
    s.narrate(PARK_RANGER.beats.arrive, { icon: 'inspector', room: 'bullpen', beat: true, slow: true });
    this.c.script([PARK_RANGER.lines.arrive], { room: 'bullpen', then: 'none' });
    const first = RANGER_STOPS[0];
    s.goTo(RANGER, { room: first.room }, { style: 'walk', doing: first.doing, stay: 40, stayDoing: first.doing });
  }

  private evaluateStop(room: RoomId): void {
    const s = this.c.sim;
    const hazard = s.isHazard(room) || s.activeChaos().some((c) => CHAOS[c.id]?.incident);
    const folks = s.peopleIn(room).filter((p) => p.isCast && onFloor(s, p));
    const trouble = hazard || folks.some(isDistressed);
    if (trouble) {
      this.badStops += 1;
      if (hazard) this.hazardSeen = true;
      s.feel(RANGER, 'angry', 0.7, 14);
      s.narrate(PARK_RANGER.beats.stopRough, { icon: 'warn', room, beat: true });
      this.c.script([PARK_RANGER.lines.roughStop], { room, then: 'none' });
      return;
    }
    this.goodStops += 1;
    s.feel(RANGER, 'happy', 0.55, 14);
    s.narrate(PARK_RANGER.beats.stopClean, { icon: 'check', room, beat: true });
    const goodLine =
      room === 'bullpen' ? PARK_RANGER.lines.cleanLawn
        : room === 'kitchen' ? PARK_RANGER.lines.cleanGrill
          : room === 'annex' ? PARK_RANGER.lines.cleanPond
            : null;
    if (goodLine) this.c.script([goodLine], { room, then: 'none' });
  }

  private conclude(): void {
    const s = this.c.sim;
    const passed = this.goodStops >= 2 && this.badStops <= 1;
    this.c.notes.parkInspection = this.goodStops;
    if (this.c.extra('noTrace') === 'open') {
      this.c.setExtra('noTrace', this.hazardSeen ? 'lost' : 'won');
    }
    if (passed) {
      s.sfx('objective');
      s.narrate(PARK_RANGER.beats.pass, { icon: 'inspector', room: 'boss', beat: true });
      this.c.script([PARK_RANGER.lines.pass], { room: 'boss', then: 'none' });
      this.c.win([PARK_RANGER.outcome.won]);
    } else {
      s.narrate(PARK_RANGER.beats.fail, { icon: 'warn', room: 'boss', beat: true });
      this.c.script([PARK_RANGER.lines.fail], { room: 'boss', then: 'none' });
      this.c.lose([PARK_RANGER.outcome.lost]);
    }
    if (s.person(RANGER)) {
      s.goTo(RANGER, { anchor: 'exit.street' }, { style: 'walk', doing: 'leaving the park', stay: 0, then: () => s.removeVisitor(RANGER) });
    }
  }

  onChaosStart(e: ChaosStartInfo): void {
    if (this.c.main() !== 'open') return;
    if (CHAOS[e.id]?.incident) {
      this.hazardSeen = true;
      if (this.c.extra('noTrace') === 'open') this.c.setExtra('noTrace', 'lost');
    }
  }

  warns(): Partial<Record<ActionId, string>> {
    if (this.c.main() !== 'open') return {};
    const out: Partial<Record<ActionId, string>> = {};
    for (const id of Object.keys(CHAOS) as ChaosId[]) {
      if (CHAOS[id].incident) out[id] = 'Ranger Miller is patrolling nearby -- an incident will ruin this stop.';
    }
    return out;
  }

  atFive(): void {
    if (this.c.main() === 'open') this.conclude();
  }

  status(): { progress: number; status: string } {
    const st = this.c.main();
    if (st === 'won') return { progress: 1, status: 'Permit approved by Ranger Miller' };
    if (st === 'lost') return { progress: 0, status: 'Outing cited by Parks and Rec' };
    if (!this.spawned) return { progress: 0.05, status: 'Ranger Miller approaching the Park Gate' };
    const stop = RANGER_STOPS[Math.min(this.stopIndex, RANGER_STOPS.length - 1)];
    return {
      progress: Math.min(0.95, (this.stopIndex + 0.5) / RANGER_STOPS.length),
      status: `Inspecting ${stop.label} (${this.goodStops} clean / ${this.badStops} cited)`,
    };
  }
}

// ── Chapter definitions & episode facts ──────────────────────────────────────

export const PARK_CHAPTER_DEFS: readonly ChapterDef[] = [
  {
    chapter: 1,
    title: PARK_RALLY.title,
    weekday: PARK_RALLY.weekday,
    budget: 8,
    intro: PARK_RALLY.intro,
    goal: PARK_RALLY.goal,
    extras: [PARK_RALLY.extra],
    change: PARK_RALLY.change,
    hints: PARK_RALLY.hints,
    help: PARK_RALLY.help,
    suggest: PARK_RALLY.suggest,
    locked: { inspector: 'Ranger Miller arrives later this afternoon.' },
    create: (c) => new MandatoryFunRun(c),
  },
  {
    chapter: 2,
    title: PARK_TRUCE.title,
    weekday: PARK_TRUCE.weekday,
    budget: 8,
    intro: PARK_TRUCE.intro,
    goal: PARK_TRUCE.goal,
    extras: [PARK_TRUCE.extra],
    change: PARK_TRUCE.change,
    recap: (n) => (
      n.parkRally === true
        ? 'Michael is still dining out on his morning lawn speech.'
        : n.parkRally === false
          ? 'Half the morning crowd drifted into the trees before the pep talk landed.'
          : null
    ),
    hints: PARK_TRUCE.hints,
    help: PARK_TRUCE.help,
    suggest: PARK_TRUCE.suggest,
    locked: { inspector: 'Ranger Miller arrives later this afternoon.' },
    create: (c) => new TruceRun(c),
  },
  {
    chapter: 3,
    title: PARK_RANGER.title,
    weekday: PARK_RANGER.weekday,
    budget: 9,
    intro: PARK_RANGER.intro,
    goal: PARK_RANGER.goal,
    extras: [PARK_RANGER.extra],
    change: PARK_RANGER.change,
    recap: (n) => (
      n.parkTruce === true
        ? 'Jim and Dwight finished the three-legged race in tense silence, and the lawn is tidy for lunch.'
        : n.parkTruce === false
          ? 'Jim and Dwight never called a truce, leaving cones scattered beside the lawn.'
          : null
    ),
    hints: PARK_RANGER.hints,
    help: PARK_RANGER.help,
    suggest: PARK_RANGER.suggest,
    locked: { inspector: 'Ranger Miller is already walking the path.' },
    create: (c) => new RangerTourRun(c),
  },
];

export function parkWeekFacts(notes: WeekNotes, _chapter: number): [string, string][] {
  const facts: [string, string][] = [
    ['park.setting', 'The Scranton branch is spending the day outdoors at Scranton Community Park.'],
  ];
  if (notes.parkRally === true) facts.push(['park.rally', 'Michael pulled off his morning huddle on the Great Lawn.']);
  else if (notes.parkRally === false) facts.push(['park.rally', 'The morning rally on the Great Lawn fell apart before eleven.']);
  if (notes.parkTruce === true) facts.push(['park.truce', 'Jim and Dwight grudgingly finished the three-legged race together.']);
  else if (notes.parkTruce === false) facts.push(['park.truce', 'Jim and Dwight fought so badly the three-legged race was called off.']);
  if (notes.parkGrill === true) facts.push(['park.grill', 'Kevin was happily fed clean burgers at the BBQ stand.']);
  return facts;
}
