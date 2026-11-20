// SMITE (person target). A reference script for a quick person event: a
// lightning cue, the zapped reaction, lasting marks (frizzy, sooty, dizzy), a
// bark, and witnesses startling.

import type { CharId, RoomId } from '@/game/core/types';
import type { ChaosRun, ChaosScript, SimApi } from '@/game/core/simApi';
import { room } from '@/game/core/world';

const WITNESS_RADIUS = 96;

class SmiteRun implements ChaosRun {
  readonly label: string;
  /** Writes its own line in the log when it happens. */
  readonly ownStartLine = true;
  readonly room: RoomId | null;
  done = false;
  private t = 0;
  private stage = 0;
  private witnesses: CharId[] = [];

  constructor(private sim: SimApi, private who: CharId) {
    const p = sim.person(who);
    this.label = `${p ? p.name : 'Someone'} was struck by lightning`;
    this.room = p ? p.room : null;
    if (!p) {
      this.done = true;
      return;
    }
    sim.fx({ kind: 'lightning', x: p.x, y: p.y });
    sim.fx({ kind: 'flash', color: 0xffffff, alpha: 0.7, ms: 140 });
    sim.sfx('thunder', p.x);
    sim.shake(0.5, 320);
    sim.bus.emit('buzz', { pattern: [30, 30, 60] });
    sim.bus.emit('focus', { x: p.x - 40, y: p.y - 56, w: 80, h: 72, weight: 1, holdMs: 2500 });
    this.witnesses = sim
      .peopleNear(p.x, p.y, WITNESS_RADIUS)
      .filter((o) => o.id !== who && o.present)
      .map((o) => o.id);
  }

  update(dt: number): void {
    if (this.done) return;
    const sim = this.sim;
    this.t += dt;
    const p = sim.person(this.who);
    if (!p || !p.present) {
      this.done = true;
      return;
    }
    if (this.stage === 0 && this.t >= 0.12) {
      this.stage = 1;
      sim.sfx('zap', p.x);
      sim.fx({ kind: 'sparks', x: p.x, y: p.y - 16 });
      sim.react(this.who, 'zapped', 1.4, { face: 'down' });
      sim.addStatus(this.who, 'frizzy', 90);
      sim.addStatus(this.who, 'sooty', 90);
      sim.addStatus(this.who, 'dizzy', 10);
      sim.feel(this.who, 'surprised', 1, 3);
      sim.bumpMood(this.who, -0.2);
      for (const id of this.witnesses) {
        sim.react(id, 'startle', 0.7);
        sim.emote(id, 'alert');
        sim.feel(id, sim.rng() < 0.5 ? 'scared' : 'surprised', 0.8, 4);
        sim.face(id, this.who);
      }
    }
    if (this.stage === 1 && this.t >= 1.6) {
      this.stage = 2;
      sim.bark(this.who, 'zapped');
      sim.feel(this.who, 'angry', 0.7, 6);
      sim.fx({ kind: 'burst', what: 'dust', x: p.x, y: p.y - 10, count: 6 });
      const first = this.witnesses.find((id) => sim.person(id)?.available);
      if (first) sim.chaosBark(first, 'smite');
    }
    if (this.stage === 2 && this.t >= 2.4) {
      this.stage = 3;
      sim.narrate(`A bolt of lightning hit ${p.name} in ${roomName(p.room)}. ${p.name} is frazzled but fine.`, { icon: 'smite', room: p.room });
      sim.remember([this.who], 'I was struck by lightning indoors. My hair is still standing up.', 2.5);
      if (this.witnesses.length) sim.remember(this.witnesses, `I saw ${p.name} get struck by lightning, indoors.`, 1.5);
      const other = this.witnesses.find((id) => sim.person(id)?.available);
      sim.requestScene({
        people: other ? [this.who, other] : [this.who],
        trigger: 'aftermath',
        why: `${p.name} was just struck by lightning in the middle of the office${other ? ` and ${sim.person(other)?.name} saw it` : ''}.`,
        priority: 6,
        staleAfter: 30
      });
    }
    if (this.t >= 4) this.done = true;
  }

  end(): void {
    this.done = true;
  }
}

function roomName(r: RoomId): string {
  return room(r).name;
}

export const smiteScript: ChaosScript = {
  id: 'smite',
  blocked(sim: SimApi, target) {
    const p = target.who ? sim.person(target.who) : undefined;
    if (!p || !p.present) return 'Pick someone in the office.';
    return null;
  },
  start(sim, target) {
    return new SmiteRun(sim, target.who as CharId);
  }
};
