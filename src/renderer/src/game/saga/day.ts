// One day of Endless Saga on a live simulation: zero locks, unlimited free
// powers & tools, live goal + bonus goal evaluation, mid-day reactive plot
// twists, and chaos/drama-aware Standing calculation at five o'clock.

import type { StandingChangeUi, StoryGoalUi } from '@/game/app/gameApi';
import { CHAOS } from '@/game/core/chaos';
import { displayName } from '@/game/core/cast';
import type { SimPerson } from '@/game/core/simApi';
import type { CastId, CharId } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import type { Sim } from '@/game/sim';
import { expectInspector } from '@/game/sim/chaos/inspector';
import type { GoalState, PlayerAction } from '@/game/story/types';
import { SAGA_EXTRAS } from './arcs';
import type {
  SagaAiEpisode, SagaArcDef, SagaChapterDef, SagaDayTally, SagaExtraKind, SagaNotes
} from './types';

export const SAGA_EXTRA_STANDING = 3;
const FIVE = 17 * 60;
const DAY_MIN = (h: number): number => h * 60;
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export interface SagaDayHooks {
  onGoal?(g: { id: string; title: string; state: 'won' | 'lost'; main: boolean }): void;
}

export class SagaDay {
  readonly arc: SagaArcDef;
  readonly def: SagaChapterDef;
  readonly sim: Sim;
  readonly used = { powers: [] as string[], whisper: 0, announce: 0, cue: 0, anything: 0 };
  readonly carriedToday: Partial<Record<CastId, number>> = {};

  private mainState: GoalState = 'open';
  private extras = new Map<SagaExtraKind, GoalState>();
  private lines: string[] = [];
  private offs: (() => void)[] = [];
  private disposed = false;
  private resolvedAt5 = false;

  // Live metrics & reactive tracking
  private peakChaos = 0;
  private peakMorale = 0;
  private peakRooms = new Map<string, number>();
  private gatherStreak = 0;
  private startBonds = new Map<string, number>();
  private dramaCount = 0;
  private specificChaosHits = 0;
  private pickedSet = new Set<string>();
  private customTexts: string[] = [];
  private eventsToday: string[] = [];
  private seenEliminated = new Set<string>();
  private seenKnockouts = new Set<string>();
  private seenQuit = new Set<string>();
  private seenSecrets = new Set<string>();
  private accused: CharId[] = [];
  private accuseTriesLeft = 0;
  private moleCaught = false;
  private middayDone = false;
  private tourStarted = false;
  private tourFinished = false;
  private tourStartIncidents = 0;
  private reactiveTwistText: string | null = null;
  private finaleMoraleAt5 = 0;
  private finaleIncidentsAt5 = 0;

  constructor(
    sim: Sim,
    arc: SagaArcDef,
    def: SagaChapterDef,
    private notes: SagaNotes,
    private ai: SagaAiEpisode | null = null,
    private hooks?: SagaDayHooks
  ) {
    this.sim = sim;
    this.arc = arc;
    this.def = def;
    for (const ex of def.extras) this.extras.set(ex, 'open');
    if (def.goal.kind === 'accuse_mole') this.accuseTriesLeft = def.goal.tries;

    const bus = sim.bus;
    this.offs.push(
      bus.on('chaosStart', (e) => this.onChaosStart(e.id, e.target, e.room)),
      bus.on('chaosEnd', (e) => {
        if (e.id === 'inspector' && this.tourStarted && !this.tourFinished) {
          this.tourFinished = true;
          this.evaluateFinaleOnTour();
        }
      }),
      bus.on('pickedUp', (e) => {
        this.pickedSet.add(e.who);
        if (isCastId(e.who)) this.carriedToday[e.who] = (this.carriedToday[e.who] ?? 0) + 1;
      })
    );
  }

  setup(): void {
    // Full sandbox freedom: clear any locks so all 34 powers are available.
    this.sim.setLocks({});
    this.sim.setFact('saga.arc', `${this.arc.title}: ${this.def.fact}`);
    if (this.ai && this.ai.chapter === this.def.chapter && this.ai.twistFact) {
      this.sim.setFact('saga.ai', this.ai.twistFact);
    }
    if (this.def.convictions) {
      for (const c of this.def.convictions) {
        this.sim.convince(c.who, c.text);
        if (c.hidden) this.sim.setHiddenNote(c.who, c.hidden);
      }
    }
    if (this.def.sparkBond) {
      for (const b of this.def.sparkBond) {
        this.sim.shiftBond(b.who, b.about, b.delta, 'long-simmering saga tension');
      }
    }
    // Snapshot starting bonds after setup sparks for fair delta measurement.
    this.snapshotBond('dwight', 'jim');
    this.snapshotBond('angela', 'oscar');
    this.snapshotBond('angela', 'dwight');
    this.snapshotBond('dwight', 'toby');
    if (this.def.goal.kind === 'bond_shift') {
      this.snapshotBond(this.def.goal.who, this.def.goal.about);
    }
    // Set hidden note on Thursday mole so dialogue subtly shows their nerves unless Truth Serum hits.
    if (this.def.goal.kind === 'accuse_mole') {
      this.sim.setHiddenNote(this.notes.mole, 'I am hiding what I sent Corporate, and nobody can know.');
    }
  }

  private snapshotBond(who: CastId, about: CastId): void {
    this.startBonds.set(`${who}>${about}`, this.sim.bond(who, about));
  }

  private startBondOf(who: CastId, about: CastId): number {
    return this.startBonds.get(`${who}>${about}`) ?? this.sim.bond(who, about);
  }

  get chapter(): number {
    return this.def.chapter;
  }

  get main(): GoalState {
    return this.mainState;
  }

  get over(): boolean {
    return this.resolvedAt5;
  }

  get settled(): boolean {
    return this.resolvedAt5 || this.mainState !== 'open';
  }

  get reactiveTwist(): string | null {
    return this.reactiveTwistText;
  }

  get summaryLines(): string[] {
    return this.lines;
  }

  get dayEvents(): string[] {
    return this.eventsToday;
  }

  get customEventTexts(): string[] {
    return this.customTexts;
  }

  get peakChaosPct(): number {
    return this.peakChaos;
  }

  extraState(id: SagaExtraKind): GoalState {
    return this.extras.get(id) ?? 'lost';
  }

  topics(): string[] {
    const base = [...this.def.topics];
    if (this.ai && this.ai.chapter === this.def.chapter && this.ai.topics.length) {
      base.unshift(...this.ai.topics);
    }
    if (this.reactiveTwistText) base.unshift(this.reactiveTwistText);
    return base.filter((t) => typeof t === 'string' && t.trim().length > 0);
  }

  stakes(): number {
    if (this.resolvedAt5) return 0;
    if (this.mainState !== 'open') return 0.15;
    if (this.def.chapter === 5) return 0.65;
    return this.sim.clock >= DAY_MIN(13) ? 0.45 : 0.25;
  }

  accuseUi(): { triesLeft: number; accused: CharId[]; label: string } | null {
    if (this.resolvedAt5 || this.def.goal.kind !== 'accuse_mole' || this.mainState !== 'open') return null;
    return { triesLeft: this.accuseTriesLeft, accused: [...this.accused], label: this.def.goal.label };
  }

  accuse(who: CharId): void {
    if (this.disposed || this.resolvedAt5 || this.def.goal.kind !== 'accuse_mole' || this.mainState !== 'open') return;
    if (this.accuseTriesLeft <= 0 || this.accused.includes(who)) return;
    const targetName = displayName(who);
    this.accused.push(who);
    this.accuseTriesLeft -= 1;
    if (who === this.notes.mole) {
      this.moleCaught = true;
      this.sim.revealSecret(this.notes.mole);
      this.sim.narrate(`${targetName} folds on the spot and admits everything!`, { beat: true, icon: 'secretLeak' });
      this.recordEvent(`${targetName} was exposed as the mole`);
      this.settleMain('won', [`${targetName} was exposed as the mole before five o'clock.`]);
      return;
    }
    this.sim.feel(who, 'angry', 0.85, 25);
    this.sim.shiftBond(who, 'michael', -12, 'wrongly accused');
    this.sim.narrate(`${targetName} turns out to be innocent—and furious about the accusation.`, { beat: true, icon: 'accuse' });
    this.recordEvent(`${targetName} was wrongly accused`);
    if (this.accuseTriesLeft <= 0) {
      const realName = displayName(this.notes.mole);
      this.settleMain('lost', [`Out of accusations; ${realName} slipped clean away.`]);
    }
  }

  /** Record free-play player tools (always allowed and zero cost in Saga). */
  note(a: PlayerAction): void {
    if (a.kind === 'whisper') this.used.whisper += 1;
    else if (a.kind === 'announce') this.used.announce += 1;
    else if (a.kind === 'cue') this.used.cue += 1;
    else if (a.kind === 'anything') {
      this.used.anything += 1;
      const what = (a.text ?? 'custom stunt').trim();
      if (what) {
        this.customTexts.push(what);
        this.recordEvent(`custom stunt: "${what}"`);
        this.bumpDrama(['custom', 'chaos_any']);
        this.maybeReactiveTwist(
          `The "${what.slice(0, 60)}" twist just hijacked today's office chatter.`,
          'anything'
        );
      }
    }
  }

  private onChaosStart(id: string, target: { who?: CharId; room?: string }, room?: string): void {
    this.used.powers.push(id);
    const label = CHAOS[id as keyof typeof CHAOS]?.name ?? id;
    const where = room ? ` (${room})` : '';
    this.recordEvent(`${label}${where}`);
    if (id === 'inspector') {
      this.tourStarted = true;
      this.tourStartIncidents = this.sim.incidentsToday;
    }
    if (this.def.goal.kind === 'spectacle' && this.def.goal.chaosIds?.includes(id as never)) {
      this.specificChaosHits += 1;
    }
    if (id === 'crown') this.bumpDrama(['boss_crown', 'chaos_any']);
    else if (id === 'truth' || id === 'secretLeak') {
      this.bumpDrama(['secret', 'chaos_any']);
      if (target.who === this.notes.mole && !this.seenSecrets.has(target.who)) {
        this.seenSecrets.add(target.who);
        const name = displayName(target.who);
        this.sim.narrate(`${name} blurts out a panicked confession about deleting Corporate logs!`, { beat: true, icon: 'secretLeak' });
        this.recordEvent(`${name} let a secret slip under pressure`);
      }
    } else {
      this.bumpDrama(['chaos_any']);
    }
    if (id === 'secretLeak' || id === 'truth') {
      if (target.who && !this.seenSecrets.has(target.who)) {
        this.seenSecrets.add(target.who);
      }
    }
    if (this.def.goal.kind === 'finale_showdown' && this.def.goal.mode === 'verdict_trial') {
      if (target.who === this.notes.mole && (id === 'truth' || id === 'secretLeak')) {
        const moleName = displayName(this.notes.mole);
        this.settleMain('won', [`${moleName} broke down and confessed in front of the office!`]);
      }
    }
  }

  private bumpDrama(tags: readonly ('eliminated' | 'knockedOut' | 'quit' | 'guilty' | 'custom' | 'secret' | 'chaos_any' | 'boss_crown')[]): void {
    if (this.def.goal.kind !== 'drama_action') return;
    if (this.def.goal.actions.some((a) => tags.includes(a))) {
      this.dramaCount += 1;
    }
  }

  private recordEvent(desc: string): void {
    if (!desc) return;
    if (!this.eventsToday.includes(desc)) this.eventsToday.push(desc);
  }

  private maybeReactiveTwist(fact: string, icon = 'tip'): void {
    if (this.reactiveTwistText || this.resolvedAt5) return;
    this.reactiveTwistText = fact;
    this.sim.setFact('saga.reactive', fact);
    this.sim.narrate(fact, { beat: true, icon });
  }

  update(_dt: number): void {
    if (this.disposed) return;
    const m = this.sim.meters();
    this.peakChaos = Math.max(this.peakChaos, m.chaos);
    this.peakMorale = Math.max(this.peakMorale, m.morale);

    for (const r of ['meeting', 'kitchen', 'outside', 'annex', 'bullpen'] as const) {
      const count = this.presentIn(r).length;
      this.peakRooms.set(r, Math.max(this.peakRooms.get(r) ?? 0, count));
    }

    // Track reactive physical outcomes on the floor (eliminations, knockouts, walkouts).
    for (const p of this.sim.people()) {
      if (!p.isCast) continue;
      if (p.statuses.some((s) => s.kind === 'eliminated') && !this.seenEliminated.has(p.id)) {
        this.seenEliminated.add(p.id);
        this.recordEvent(`${p.name} was eliminated mid-shift`);
        this.bumpDrama(['eliminated']);
        this.maybeReactiveTwist(
          `Word of ${p.name}'s shocking elimination sends the branch spiraling toward an HR showdown.`,
          'warn'
        );
      }
      if (p.statuses.some((s) => s.kind === 'knockedOut') && !this.seenKnockouts.has(p.id)) {
        this.seenKnockouts.add(p.id);
        this.recordEvent(`${p.name} was knocked out`);
        this.bumpDrama(['knockedOut']);
      }
      if (p.statuses.some((s) => s.kind === 'quit') && !this.seenQuit.has(p.id)) {
        this.seenQuit.add(p.id);
        this.recordEvent(`${p.name} walked out and quit`);
        this.bumpDrama(['quit']);
        this.maybeReactiveTwist(
          `${p.name} walked out the front doors—leaving everyone wondering who snaps next.`,
          'warn'
        );
      }
    }

    if (this.peakChaos >= 80 && !this.reactiveTwistText) {
      this.maybeReactiveTwist(
        'Chaos just breached 80%; Corporate watchers are bracing for tomorrow\'s fallout.',
        'quake'
      );
    }

    // Scheduled mid-day beat (e.g., Corporate Inspector tour on Audit Friday).
    if (this.def.midday && !this.middayDone && this.sim.clock >= this.def.midday.clock) {
      this.middayDone = true;
      const md = this.def.midday;
      this.sim.narrate(md.text, { beat: true, icon: md.icon, room: md.room });
      if (md.spawnInspector && !this.sim.activeChaos().some((c) => c.id === 'inspector')) {
        expectInspector(true);
        this.sim.startChaos('inspector', {}, { force: true });
      }
    }

    if (this.mainState === 'open') this.evaluateMain();
    this.evaluateExtras();

    if (!this.resolvedAt5 && this.sim.clock >= FIVE) {
      this.resolve();
    }
  }

  private presentIn(room: string): SimPerson[] {
    return this.sim.peopleIn(room as never).filter(
      (p) =>
        p.isCast &&
        p.present &&
        !this.sim.isAirborne(p.id) &&
        !p.statuses.some((s) => s.kind === 'eliminated' || s.kind === 'quit')
    );
  }

  private evaluateFinaleOnTour(): void {
    if (this.def.goal.kind !== 'finale_showdown' || this.def.goal.mode !== 'calm_tour') return;
    const tourInc = Math.max(0, this.sim.incidentsToday - this.tourStartIncidents);
    if (tourInc <= 1) {
      this.recordEvent('The Corporate Inspector left impressed');
      this.settleMain('won', ['The Inspector wrapped up the tour with hardly an incident to cite.']);
    } else {
      this.recordEvent(`The Inspector saw ${tourInc} incidents`);
    }
  }

  private evaluateMain(): void {
    const g = this.def.goal;
    const m = this.sim.meters();
    switch (g.kind) {
      case 'gather': {
        const list = this.presentIn(g.room);
        const needPeople = g.people ? g.people.every((id) => list.some((p) => p.id === id)) : true;
        if (list.length >= g.need && needPeople) {
          this.gatherStreak += 1;
          if (this.gatherStreak >= 2) {
            this.settleMain('won', [`${list.length} staff came together cleanly when it counted.`]);
            return;
          }
        } else {
          this.gatherStreak = 0;
        }
        if (g.deadlineHour && this.sim.clock >= DAY_MIN(g.deadlineHour)) {
          this.settleMain('lost', [`The ${g.deadlineHour}:00 deadline passed with too few people gathered.`]);
        }
        break;
      }
      case 'bond_shift': {
        const delta = this.sim.bond(g.who, g.about) - this.startBondOf(g.who, g.about);
        const moved = g.direction === 'up' ? delta : -delta;
        if (moved >= g.by) {
          const whoN = displayName(g.who);
          const aboutN = displayName(g.about);
          const msg = g.direction === 'up'
            ? `${whoN} and ${aboutN} found common ground by +${Math.round(moved)} points.`
            : `${whoN}'s patience with ${aboutN} snapped cleanly (${Math.round(delta)} shift).`;
          this.settleMain('won', [msg]);
        }
        break;
      }
      case 'spectacle': {
        const events = this.used.powers.length + this.used.anything;
        const okChaos = !g.chaosPeak || this.peakChaos >= g.chaosPeak;
        const okEvents = !g.eventsNeeded || events >= g.eventsNeeded;
        const okIds = !g.chaosIds || this.specificChaosHits > 0;
        if (okChaos && okEvents && okIds) {
          this.settleMain('won', [`Peak chaos hit ${Math.round(this.peakChaos)}% across ${events} headline events.`]);
        }
        break;
      }
      case 'morale_rally': {
        if (this.peakMorale >= g.targetMorale) {
          this.settleMain('won', [`Office morale rallied to ${Math.round(this.peakMorale)}% before five o'clock.`]);
        }
        break;
      }
      case 'drama_action': {
        if (this.dramaCount >= g.count) {
          this.settleMain('won', ['Enough bold turns unfolded to propel the week\'s arc forward.']);
        }
        break;
      }
      case 'finale_showdown': {
        if (g.mode === 'boardroom_vote') {
          const list = this.presentIn('meeting');
          if (list.length >= 8 && list.some((p) => p.id === 'michael')) {
            this.gatherStreak += 1;
            if (this.gatherStreak >= 2) {
              this.settleMain('won', [`Michael and ${list.length - 1} staff packed the Conference Room and voted down the buyout!`]);
              return;
            }
          } else {
            this.gatherStreak = 0;
          }
          if (this.sim.clock >= DAY_MIN(16)) {
            this.settleMain('lost', ['Four o\'clock struck without enough seats filled for the boardroom vote.']);
          }
        } else if (g.mode === 'peak_spectacle') {
          const events = this.used.powers.length + this.used.anything;
          if (this.peakChaos >= 75 && events >= 2) {
            this.settleMain('won', [`Peak chaos hit ${Math.round(this.peakChaos)}% in an unforgettable season finale.`]);
          }
        } else if (g.mode === 'ceasefire') {
          const peakGather = Math.max(this.peakRooms.get('meeting') ?? 0, this.peakRooms.get('kitchen') ?? 0);
          const djShift = this.sim.bond('dwight', 'jim') - this.startBondOf('dwight', 'jim');
          const aoShift = this.sim.bond('angela', 'oscar') - this.startBondOf('angela', 'oscar');
          if (peakGather >= 8 || djShift >= 6 || aoShift >= 6) {
            this.settleMain('won', ['Factions laid down arms and ended the Civil War before home time.']);
          }
        } else if (g.mode === 'verdict_trial') {
          const list = this.presentIn('meeting');
          const moleDown = this.seenEliminated.has(this.notes.mole) || this.seenKnockouts.has(this.notes.mole) || this.seenQuit.has(this.notes.mole);
          if (list.length >= 7 || moleDown || m.chaos >= 90) {
            this.settleMain('won', [
              moleDown
                ? `The Saboteur (${displayName(this.notes.mole)}) was dealt with directly before five.`
                : 'The staff gathered for a classic parlor confrontation and closed the case!'
            ]);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private evaluateExtras(): void {
    const win = (id: SagaExtraKind): void => this.settleExtra(id, 'won');
    if (this.extras.get('wildcard') === 'open' && this.used.powers.length + this.used.anything >= 2) win('wildcard');
    if (this.extras.get('whisper_net') === 'open' && this.used.whisper + this.used.cue + this.used.announce >= 2) win('whisper_net');
    if (this.extras.get('peak_mayhem') === 'open' && this.peakChaos >= 70) win('peak_mayhem');
    if (this.extras.get('full_house') === 'open' && Math.max(this.peakRooms.get('meeting') ?? 0, this.peakRooms.get('kitchen') ?? 0) >= 8) win('full_house');
    if (this.extras.get('good_vibes') === 'open' && this.peakMorale >= 68) win('good_vibes');
    if (this.extras.get('hands_on') === 'open' && this.pickedSet.size >= 3) win('hands_on');
    if (this.extras.get('plot_twist') === 'open' && this.used.anything >= 1) win('plot_twist');
  }

  resolve(): void {
    if (this.resolvedAt5) return;
    const m = this.sim.meters();
    this.finaleMoraleAt5 = m.morale;
    this.finaleIncidentsAt5 = this.sim.incidentsToday;
    if (this.mainState === 'open') {
      if (this.def.goal.kind === 'finale_showdown' && this.def.goal.mode === 'calm_tour' && m.morale >= 55 && m.chaos <= 60) {
        this.settleMain('won', [`Strong afternoon morale (${Math.round(m.morale)}%) won Corporate over by five o'clock.`]);
      } else {
        this.settleMain('lost', [`Five o'clock arrived with "${this.def.goalInfo.title}" left unfinished.`]);
      }
    }
    for (const ex of this.def.extras) {
      if (this.extras.get(ex) === 'open') this.settleExtra(ex, 'lost');
    }
    this.resolvedAt5 = true;
  }

  private settleMain(state: 'won' | 'lost', lines: string[]): void {
    if (this.mainState !== 'open') return;
    this.mainState = state;
    this.lines = lines.filter(Boolean);
    this.hooks?.onGoal?.({ id: this.def.goalInfo.id, title: this.def.goalInfo.title, state, main: true });
  }

  private settleExtra(id: SagaExtraKind, state: 'won' | 'lost'): void {
    if (this.extras.get(id) !== 'open') return;
    this.extras.set(id, state);
    const def = SAGA_EXTRAS[id];
    this.hooks?.onGoal?.({ id, title: def.title, state, main: false });
  }

  // ── Live UI projection ────────────────────────────────────────────────────

  goalUi(): StoryGoalUi {
    const info = this.def.goalInfo;
    const g = this.def.goal;
    let progress = this.mainState === 'won' ? 1 : 0;
    let status = '';
    if (this.mainState === 'open') {
      switch (g.kind) {
        case 'gather': {
          const n = this.presentIn(g.room).length;
          const miss = (g.people ?? []).filter((id) => !this.presentIn(g.room).some((p) => p.id === id)).map((id) => displayName(id));
          progress = clamp01(n / g.need);
          status = `${n} of ${g.need} in room${miss.length ? `, waiting for ${miss.join(', ')}` : ''}`;
          break;
        }
        case 'bond_shift': {
          const delta = this.sim.bond(g.who, g.about) - this.startBondOf(g.who, g.about);
          const moved = g.direction === 'up' ? delta : -delta;
          progress = clamp01(moved / g.by);
          status = `${displayName(g.who)} → ${displayName(g.about)}: ${moved >= 0 ? '+' : ''}${Math.round(moved)} / ${g.direction === 'up' ? '+' : '-'}${g.by}`;
          break;
        }
        case 'spectacle': {
          const ev = this.used.powers.length + this.used.anything;
          const p1 = g.chaosPeak ? clamp01(this.peakChaos / g.chaosPeak) : 1;
          const p2 = g.eventsNeeded ? clamp01(ev / g.eventsNeeded) : 1;
          progress = (p1 + p2) / 2;
          status = `Peak chaos ${Math.round(this.peakChaos)}%/${g.chaosPeak ?? 0}% · Events ${ev}/${g.eventsNeeded ?? 1}`;
          break;
        }
        case 'morale_rally': {
          const cur = this.sim.meters().morale;
          progress = clamp01(Math.max(cur, this.peakMorale) / g.targetMorale);
          status = `Morale ${Math.round(cur)}% (need ${g.targetMorale}%)`;
          break;
        }
        case 'drama_action': {
          progress = clamp01(this.dramaCount / g.count);
          status = `${this.dramaCount} of ${g.count} dramatic turns`;
          break;
        }
        case 'accuse_mole': {
          progress = this.moleCaught ? 1 : 0;
          status = `${this.accuseTriesLeft} ${this.accuseTriesLeft === 1 ? 'try' : 'tries'} remaining`;
          break;
        }
        case 'finale_showdown': {
          if (g.mode === 'boardroom_vote') {
            const n = this.presentIn('meeting').length;
            progress = clamp01(n / 8);
            status = `${n} of 8 in Conference Room`;
          } else if (g.mode === 'peak_spectacle') {
            const ev = this.used.powers.length + this.used.anything;
            progress = (clamp01(this.peakChaos / 75) + clamp01(ev / 2)) / 2;
            status = `Chaos ${Math.round(this.peakChaos)}%/75% · Events ${ev}/2`;
          } else if (g.mode === 'ceasefire') {
            const n = Math.max(this.presentIn('meeting').length, this.presentIn('kitchen').length);
            progress = clamp01(n / 8);
            status = `${n} of 8 gathered (or raise rivalry bond +6)`;
          } else if (g.mode === 'verdict_trial') {
            const n = this.presentIn('meeting').length;
            progress = clamp01(n / 7);
            status = `${n} of 7 in Conference Room (or confront ${displayName(this.notes.mole)})`;
          } else {
            const tourInc = this.tourStarted ? Math.max(0, this.sim.incidentsToday - this.tourStartIncidents) : this.sim.incidentsToday;
            progress = this.tourStarted ? 0.5 : 0.2;
            status = this.tourStarted ? `Inspector touring · ${tourInc} incidents` : `Inspector expected at 11:00 · ${Math.round(this.sim.meters().morale)}% morale`;
          }
          break;
        }
      }
    }
    return {
      id: info.id,
      title: info.title,
      detail: info.detail,
      icon: info.icon,
      progress,
      status,
      state: this.mainState
    };
  }

  sideUi(): StoryGoalUi[] {
    return this.def.extras.map((id) => {
      const def = SAGA_EXTRAS[id];
      const st = this.extras.get(id) ?? 'open';
      return {
        id: def.id,
        title: def.title,
        detail: def.detail,
        icon: def.icon,
        progress: st === 'won' ? 1 : 0,
        status: '',
        state: st
      };
    });
  }

  /** Build end-of-day Standing changes reacting directly to today's goals, chaos & drama. */
  tally(): SagaDayTally {
    this.resolve();
    const won = this.mainState === 'won';
    const extras = this.def.extras.filter((id) => this.extras.get(id) === 'won').map((id) => SAGA_EXTRAS[id].title);
    const morale = this.finaleMoraleAt5;
    const incidents = this.finaleIncidentsAt5;
    const changes: StandingChangeUi[] = [
      {
        text: won ? `${this.def.goalInfo.title} succeeded` : `${this.def.goalInfo.title} fell short`,
        delta: won ? 8 : -6
      }
    ];
    for (const exTitle of extras) {
      changes.push({ text: `Bonus goal: ${exTitle}`, delta: SAGA_EXTRA_STANDING });
    }
    if (this.arc.chaosFriendly) {
      if (this.peakChaos >= 75) {
        changes.push({ text: `${Math.round(this.peakChaos)}% peak chaos electrified the season`, delta: 3 });
      }
    } else if (incidents > 0) {
      changes.push({
        text: `${incidents} workplace incident${incidents === 1 ? '' : 's'} rattled head office`,
        delta: Math.max(-4, -incidents)
      });
    }
    if (morale >= 62) changes.push({ text: 'Staff ended the day in high spirits', delta: 2 });
    else if (morale < 32) changes.push({ text: 'Exhausted morale weighed on the branch', delta: -2 });

    if (this.seenEliminated.size > 0) {
      changes.push({ text: 'An employee elimination triggered an urgent HR probe', delta: -4 });
    }
    if (this.seenQuit.size > 0) {
      changes.push({ text: 'A staff walkout left desks abandoned mid-shift', delta: -3 });
    }
    if (this.used.anything > 0) {
      changes.push({ text: 'A custom wildcard event kept the whole office buzzing', delta: 2 });
    }

    return {
      won,
      goalText: this.def.goalInfo.title,
      extras,
      incidents,
      morale,
      chaosPeak: this.peakChaos,
      events: [...this.eventsToday],
      lines: this.lines,
      changes
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs = [];
    try {
      this.sim.setLocks({});
    } catch {
      /* sim may already be gone */
    }
  }
}
