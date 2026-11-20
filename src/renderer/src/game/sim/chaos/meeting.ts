// ALL-HANDS (none, conference room). Everyone is called in; Michael stands at
// the head. Once most are there, a scene with Michael and three others; they
// sit through it for half a minute, then are let go.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { Run, shuffle, staff } from './util';

const GATHER_BY = 20;
const HOLD = 28;
const MOST = 0.7;
const HEAD_DOING = 'running an all-hands meeting';
const SIT_DOING = 'sitting through an all-hands meeting';

class MeetingRun extends Run {
  private head: CharId | null = null;
  private called: CharId[] = [];
  private startedAt = -1;

  constructor(sim: SimApi) {
    super(sim, 'meeting', 'All-hands meeting', 'meeting', { room: 'meeting' });
    sim.sfx('paChime');
    this.narrate('start');
    this.fact(true);
    this.focusRoom('meeting', 4000, 0.7);
    const people = staff(sim).filter((p) => p.available);
    const lead = people.find((p) => p.id === 'michael') ?? people.find((p) => p.id === 'dwight') ?? people[0];
    if (!lead) return;
    this.head = lead.id;
    sim.chaosBark(lead.id, 'meeting');
    sim.feel(lead.id, 'excited', 0.9, 20);
    sim.goTo(lead.id, { anchor: 'spot.meetHead' }, { doing: 'hurrying to the conference room', stay: GATHER_BY + HOLD + 4, stayDoing: HEAD_DOING });
    const rest = shuffle(sim, people.filter((p) => p.id !== lead.id).map((p) => p.id));
    rest.forEach((id, i) => this.at(0.3 + i * 0.25, () => {
      if (!sim.person(id)?.available) return;
      this.called.push(id);
      sim.emote(id, id === 'stanley' ? 'dots' : i % 3 ? 'question' : 'sweat');
      if (id === 'stanley') sim.feel(id, 'bored', 0.9, 30);
      sim.goTo(id, { anchor: `spot.meet${(i % 15) + 1}` }, { doing: 'heading to the all-hands meeting', stay: GATHER_BY + HOLD + 4, stayDoing: SIT_DOING });
    }));
  }

  protected tick(): void {
    const sim = this.sim;
    if (this.startedAt < 0) {
      if (this.t < 1) return;
      const here = this.called.filter((id) => sim.person(id)?.room === 'meeting');
      if (this.t >= GATHER_BY || (this.called.length && here.length / this.called.length >= MOST)) this.begin(here);
      return;
    }
    if (this.t - this.startedAt >= HOLD) this.wrap();
  }

  private begin(here: CharId[]): void {
    const sim = this.sim;
    this.startedAt = this.t;
    const head = this.head;
    const others = shuffle(sim, here).filter((id) => sim.person(id)?.available).slice(0, 3);
    if (head) {
      sim.requestScene({
        people: [head, ...others],
        room: 'meeting',
        trigger: 'event',
        why: `${this.name(head)} has called everyone into the conference room for an all-hands meeting, right now, about nothing in particular.`,
        priority: 7,
        minLines: 4,
        staleAfter: 25
      });
    }
    this.focusRoom('meeting', 4000);
  }

  private wrap(): void {
    this.fact(false);
    this.narrate('end');
    this.remember([...(this.head ? [this.head] : []), ...this.called], 1);
    this.close();
  }

  protected onEnd(): void {
    // Let everyone go who is still sitting there (not mid-conversation).
    for (const id of [...this.called, ...(this.head ? [this.head] : [])]) {
      const p = this.sim.person(id);
      if (p && p.available && (p.doing === SIT_DOING || p.doing === HEAD_DOING || p.doing === 'heading to the all-hands meeting' || p.doing === 'hurrying to the conference room')) this.sim.resume(id);
    }
  }
}

export const meetingScript: ChaosScript = {
  id: 'meeting',
  start(sim) {
    return new MeetingRun(sim);
  }
};
