// Small daily goals for the Overseer: three a day, drawn from a pool, each
// stated as exactly what to make happen. They give the sandbox a direction
// without getting in its way: nothing is lost by ignoring them.

import type { ObjectiveUi } from '@/game/app/gameApi';
import type { GameBus } from '@/game/core/bus';
import type { SimApi } from '@/game/core/simApi';
import type { CharId } from '@/game/core/types';

/** Things the game tells the goals about that the bus does not carry. */
export type PlayerDeed = 'whisper' | 'announce' | 'custom' | 'cue' | 'poke';

interface Ctx {
  sim: SimApi;
  /** Counters and notes for the current day. */
  count: Record<string, number>;
  seen: Record<string, Set<string>>;
  start: Record<string, number>;
  meters: () => { chaos: number; stock: number };
  incidentsToday: () => number;
}

interface GoalDef {
  id: string;
  title: string;
  detail: string;
  icon: string;
  /** Called once when the day starts, to note starting values. */
  begin?(c: Ctx): void;
  /** 0..1 */
  progress(c: Ctx): number;
}

const frac = (n: number, of: number): number => Math.max(0, Math.min(1, n / of));

const POOL: GoalDef[] = [
  { id: 'events3', title: 'Stir things up', detail: 'Start three events today.', icon: 'fire', progress: (c) => frac(c.count.chaos ?? 0, 3) },
  { id: 'crowd', title: 'Standing room only', detail: 'Get six people into the break room at once.', icon: 'pizza', progress: (c) => frac(c.count.kitchenBest ?? 0, 6) },
  { id: 'delivery', title: 'Special delivery', detail: "Pick someone up and drop them in Michael's office.", icon: 'hand', progress: (c) => frac(c.count.dropBoss ?? 0, 1) },
  { id: 'whispers', title: 'Voices in their heads', detail: 'Whisper to three different people.', icon: 'whisper', progress: (c) => frac(c.seen.whisper?.size ?? 0, 3) },
  { id: 'chaos80', title: 'Out of control', detail: 'Push the chaos meter to 80.', icon: 'quake', progress: (c) => frac(c.count.chaosBest ?? 0, 80) },
  { id: 'evacuate', title: 'Everybody out', detail: 'Get ten people outside on the pavement at once.', icon: 'fireDrill', progress: (c) => frac(c.count.outsideBest ?? 0, 10) },
  {
    id: 'truce', title: 'Unlikely friends', detail: 'Make Dwight think better of Jim than he did this morning.', icon: 'love',
    begin: (c) => { c.start.truce = c.sim.bond('dwight', 'jim'); },
    progress: (c) => frac(c.sim.bond('dwight', 'jim') - (c.start.truce ?? 0), 10)
  },
  { id: 'allhands', title: 'This could have been an email', detail: 'Get eight people into the conference room at once.', icon: 'meeting', progress: (c) => frac(c.count.meetingBest ?? 0, 8) },
  { id: 'quiet', title: 'A quiet day', detail: "Reach three o'clock without a single incident.", icon: 'check', progress: (c) => (c.incidentsToday() > 0 ? 0 : frac(c.sim.clock - 9 * 60, 6 * 60)) },
  { id: 'stock', title: 'Line goes up', detail: 'Get the share price above 110.', icon: 'chartUp', progress: (c) => frac(c.meters().stock - 100, 10) },
  { id: 'announce2', title: 'Attention, please', detail: 'Make two loudspeaker announcements.', icon: 'announce', progress: (c) => frac(c.count.announce ?? 0, 2) },
  { id: 'imagine', title: 'Use your imagination', detail: 'Type an event of your own and watch them deal with it.', icon: 'custom', progress: (c) => frac(c.count.custom ?? 0, 1) },
  { id: 'toss', title: 'Human resources', detail: 'Pick up four different people today.', icon: 'hand', progress: (c) => frac(c.seen.picked?.size ?? 0, 4) }
];

export class Objectives {
  private ctx: Ctx;
  private bus: GameBus;
  private today: GoalDef[] = [];
  private done = new Set<string>();
  private offs: (() => void)[] = [];

  constructor(sim: SimApi, bus: GameBus, meters: () => { chaos: number; stock: number }, incidentsToday: () => number) {
    this.bus = bus;
    this.ctx = { sim, count: {}, seen: {}, start: {}, meters, incidentsToday };
    this.offs.push(
      bus.on('chaosStart', () => this.bump('chaos')),
      bus.on('dropped', (e) => {
        if (e.room === 'boss') this.bump('dropBoss');
      }),
      bus.on('pickedUp', (e) => this.see('picked', e.who))
    );
    this.startDay(sim.day);
  }

  /** Pick the day's three goals. The same day always gets the same three. */
  startDay(day: number): void {
    this.ctx.count = {};
    this.ctx.seen = {};
    this.ctx.start = {};
    this.done.clear();
    const order = POOL.map((g, i) => ({ g, k: hash(day * 131 + i * 17) })).sort((a, b) => a.k - b.k);
    this.today = order.slice(0, 3).map((o) => o.g);
    for (const g of this.today) g.begin?.(this.ctx);
  }

  /** The player did something the bus does not report. */
  note(deed: PlayerDeed, who?: CharId): void {
    this.bump(deed);
    if (who) this.see(deed, who);
  }

  /** Call a few times a second. */
  update(): void {
    const c = this.ctx;
    const sim = c.sim;
    c.count.kitchenBest = Math.max(c.count.kitchenBest ?? 0, sim.peopleIn('kitchen').length);
    c.count.meetingBest = Math.max(c.count.meetingBest ?? 0, sim.peopleIn('meeting').length);
    c.count.outsideBest = Math.max(c.count.outsideBest ?? 0, sim.peopleIn('outside').filter((p) => p.present).length);
    c.count.chaosBest = Math.max(c.count.chaosBest ?? 0, c.meters().chaos);
    for (const g of this.today) {
      if (this.done.has(g.id)) continue;
      if (g.progress(c) >= 1) {
        this.done.add(g.id);
        this.bus.emit('objective', { id: g.id, title: g.title });
      }
    }
  }

  ui(): ObjectiveUi[] {
    return this.today.map((g) => {
      const done = this.done.has(g.id);
      return { id: g.id, title: g.title, detail: g.detail, icon: g.icon, done, progress: done ? 1 : g.progress(this.ctx) };
    });
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  private bump(key: string): void {
    this.ctx.count[key] = (this.ctx.count[key] ?? 0) + 1;
  }

  private see(key: string, who: string): void {
    (this.ctx.seen[key] ??= new Set()).add(who);
  }
}

function hash(n: number): number {
  let x = (n | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}
