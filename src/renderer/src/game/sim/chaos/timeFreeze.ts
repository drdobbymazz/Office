// TIME FREEZE (none). Everyone stops dead. The player may drag them about. When
// time restarts, anyone who ended up somewhere else blinks, is baffled, and
// remembers it.

import type { CharId } from '@/game/core/types';
import type { ChaosScript, SimApi } from '@/game/core/simApi';
import { room as roomDef } from '@/game/core/world';
import { Run, tween } from './util';

const FROZEN_FOR = 12;
const MOVED_PX = 40;

class FreezeRun extends Run {
  private was = new Map<CharId, { x: number; y: number }>();
  private thawed = false;

  constructor(sim: SimApi) {
    super(sim, 'timeFreeze', 'Time freeze', null, {});
    this.effect('freeze', { kind: 'timeFreeze', level: 0 });
    sim.sfx('freeze');
    sim.fx({ kind: 'flash', color: 0xbfe6ff, alpha: 0.45, ms: 220 });
    for (const p of sim.people()) {
      if (!p.present || sim.isAirborne(p.id)) continue;
      sim.hush(p.id);
      this.pin(p.id, { anim: 'frozen', doing: 'frozen in time' });
      this.was.set(p.id, { x: p.x, y: p.y });
    }
    this.narrate('start');
    this.fact(true);
    this.at(FROZEN_FOR, () => this.thaw());
    this.at(FROZEN_FOR + 1.5, () => this.close());
  }

  protected tick(): void {
    if (!this.thawed) this.patch('freeze', { level: tween(this.t, 0, 0.6, 0, 1) });
  }

  private thaw(): void {
    const sim = this.sim;
    this.thawed = true;
    this.unEffect('freeze');
    sim.sfx('unfreeze');
    this.releaseAll();
    this.fact(false);
    this.narrate('end');
    const moved: CharId[] = [];
    for (const [id, w] of this.was) {
      const p = sim.person(id);
      if (!p || !p.present) continue;
      if (Math.hypot(p.x - w.x, p.y - w.y) < MOVED_PX) continue;
      moved.push(id);
      sim.emote(id, 'question');
      sim.feel(id, 'confused', 1, 8);
      sim.bark(id, 'confused');
      if (p.isCast) sim.remember([id], `I blinked and suddenly I was somewhere else, in ${roomDef(p.room).name}, with no idea how I got there.`, 2);
    }
    this.remember('all', moved.length ? 1.2 : 0.6);
    const cast = moved.filter((id) => sim.person(id)?.isCast);
    if (cast.length) {
      sim.requestScene({
        people: cast.slice(0, 3),
        trigger: 'aftermath',
        why: cast.length > 1
          ? 'Time just stopped for a moment, and when it started again these people found themselves somewhere else with no idea how.'
          : `Time just stopped for a moment, and when it started again ${this.name(cast[0])} was somewhere else with no idea how.`,
        priority: 7,
        staleAfter: 30
      });
    }
  }
}

export const timeFreezeScript: ChaosScript = {
  id: 'timeFreeze',
  start(sim) {
    return new FreezeRun(sim);
  }
};
