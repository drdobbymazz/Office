// INSPECTION (none). The inspector from Corporate walks in from the street and
// tours the bullpen, the accounting corner and Michael's office with a
// clipboard. Staff scurry to their desks and look busy. A scene with the
// inspector, Michael and one other; then the inspector leaves.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { anchor, feetOf } from '@/game/core/world';
import { Run, isNervous, shuffle, staff } from './util';

const INSPECTOR = 'visitor:inspector';
/** The tour, with how long to stand and take notes at each stop. */
const ROUTE: { anchor: string; pause: number; doing: string }[] = [
  { anchor: 'door.entrance', pause: 1, doing: 'walking in from the street' },
  { anchor: 'spot.bullpen9', pause: 4, doing: 'inspecting the bullpen' },
  { anchor: 'spot.accounts1', pause: 4, doing: 'inspecting the accounting corner' },
  { anchor: 'spot.boss1', pause: 6, doing: "inspecting Michael's office" },
  { anchor: 'exit.street', pause: 0, doing: 'leaving' }
];
const LEG_LIMIT = 22;
/** The story's Friday inspector is expected: he arrives on time instead of unannounced. */
const EXPECTED_START = 'The inspector from Corporate arrives at the front door, right on time, with a clipboard.';
let expectedNext = false;

/** Mark the next inspection as expected (story mode, Friday): an arrival line instead of "unannounced". */
export function expectInspector(on: boolean): void {
  expectedNext = on;
}
/** Leave by this time whatever happens, so the run ends inside its slot. */
const MUST_LEAVE = 50;

class InspectorRun extends Run {
  private leg = -1;
  private legAt = 0;
  private arrivedAt = -1;
  private scene = false;
  private nervous: CharId[] = [];
  private readonly expected: boolean;

  constructor(sim: SimApi) {
    super(sim, 'inspector', 'Inspection from Corporate', 'bullpen', {});
    this.visitor(INSPECTOR, { anchor: 'exit.street' });
    this.prop(INSPECTOR, 'clipboard');
    sim.feel(INSPECTOR, 'suspicious', 0.7, 60);
    sim.sfx('doorOpen', feetOf(anchor('door.entrance').tile).x);
    this.expected = expectedNext;
    expectedNext = false;
    if (this.expected) sim.narrate(EXPECTED_START, { icon: 'inspector', room: 'bullpen', beat: true });
    else this.narrate('start');
    this.fact(true);
    this.next();
    const door = feetOf(anchor('door.entrance').tile);
    this.focus(door.x, door.y, 160, 100, 3500, 0.8);
    this.at(2, () => this.scurry());
  }

  /** Everyone hurries to their desk and looks very busy. */
  private scurry(): void {
    const sim = this.sim;
    shuffle(sim, staff(sim).filter((p) => p.available).map((p) => p.id)).forEach((id, i) => {
      if (id === 'michael') {
        sim.chaosBark(id, 'inspector');
        sim.feel(id, 'nervous', 1, 30);
        return;
      }
      if (i < 1) sim.chaosBark(id, 'inspector');
      else sim.emote(id, isNervous(id) ? 'sweat' : 'alert');
      sim.feel(id, isNervous(id) ? 'nervous' : 'determined', 0.7, 20);
      if (isNervous(id)) this.nervous.push(id);
      sim.setPlan(id, { kind: 'work', target: null, about: 'looking busy for the inspector' });
    });
  }

  private next(): void {
    const sim = this.sim;
    this.leg++;
    this.legAt = this.t;
    this.arrivedAt = -1;
    const stop = ROUTE[this.leg];
    if (!stop) return;
    sim.goTo(INSPECTOR, { anchor: stop.anchor }, { doing: stop.doing, stay: stop.pause + 2, stayDoing: stop.doing, braveHazard: true, then: () => this.arrive() });
  }

  private arrive(): void {
    if (this.arrivedAt >= 0) return;
    const sim = this.sim;
    this.arrivedAt = this.t;
    const stop = ROUTE[this.leg];
    if (!stop) return;
    if (stop.anchor === 'exit.street') {
      this.leave();
      return;
    }
    sim.emote(INSPECTOR, this.leg % 2 ? 'eye' : 'paper');
    sim.sfx('paper');
    const me = sim.person(INSPECTOR);
    if (me) this.focus(me.x, me.y, 120, 90, 2500, 0.6);
    if (stop.anchor === 'spot.boss1') this.meetMichael();
  }

  private meetMichael(): void {
    if (this.scene) return;
    this.scene = true;
    const sim = this.sim;
    const m = sim.person('michael');
    const michael = m?.present ? 'michael' : null;
    const others = staff(sim).filter((p) => p.id !== 'michael' && p.available);
    const me = sim.person(INSPECTOR);
    const nearest = me ? others.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0] : undefined;
    // An expected inspector meets Michael in his own office: nobody is walked out of it for the chat.
    const inOffice = !!michael && m?.room === 'boss';
    const people = this.expected
      ? (inOffice ? [INSPECTOR, 'michael'] : [INSPECTOR, ...(nearest ? [nearest.id] : [])])
      : [INSPECTOR, ...(michael ? [michael] : []), ...(nearest ? [nearest.id] : [])];
    sim.requestScene({
      people,
      trigger: 'event',
      why: this.expected
        ? "The inspector from Corporate has come, as arranged, to decide whether this branch stays open. He is touring the office with a clipboard and has reached Michael's office."
        : "An inspector from Corporate has turned up unannounced and is inspecting the office with a clipboard, and has reached Michael's office.",
      priority: 7,
      minLines: 4,
      staleAfter: 25
    });
  }

  protected tick(): void {
    const stop = ROUTE[this.leg];
    if (!stop) return;
    if (this.t >= MUST_LEAVE && stop.anchor !== 'exit.street') {
      this.leg = ROUTE.length - 2;
      this.next();
      return;
    }
    const me = this.sim.person(INSPECTOR);
    if (!me) {
      this.leave();
      return;
    }
    // Not moving on? Picked up, held up or in a long conversation: move along.
    if (this.arrivedAt >= 0 && this.t - this.arrivedAt >= stop.pause && me.available) this.next();
    else if (this.arrivedAt < 0 && this.t - this.legAt >= LEG_LIMIT && me.available) {
      if (stop.anchor === 'exit.street') this.leave();
      else this.next();
    }
  }

  private leave(): void {
    const sim = this.sim;
    this.unVisitor(INSPECTOR);
    this.fact(false);
    this.narrate('end');
    this.remember('all', 1.5);
    for (const id of this.nervous) sim.feel(id, 'happy', 0.5, 4);
    this.close();
  }
}

export const inspectorScript: ChaosScript = {
  id: 'inspector',
  blocked(sim) {
    return sim.person(INSPECTOR)?.present ? 'The inspector is already here.' : null;
  },
  start(sim) {
    return new InspectorRun(sim);
  }
};
