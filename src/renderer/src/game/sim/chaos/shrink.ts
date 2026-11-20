// SHRINK RAY (person): see sizeRay.ts.
import type { CharId } from '@/game/core/types';
import type { ChaosScript } from '@/game/core/simApi';
import { sizeRun } from './sizeRay';

export const shrinkScript: ChaosScript = {
  id: 'shrink',
  blocked(sim, target) {
    return target.who && sim.hasStatus(target.who, 'giant') ? 'They are a giant right now.' : null;
  },
  start(sim, target) {
    return sizeRun(sim, target.who as CharId, false);
  }
};
