// EMBIGGEN (person): see sizeRay.ts.
import type { CharId } from '@/game/core/types';
import type { ChaosScript } from '@/game/core/simApi';
import { sizeRun } from './sizeRay';

export const giantScript: ChaosScript = {
  id: 'giant',
  blocked(sim, target) {
    return target.who && sim.hasStatus(target.who, 'tiny') ? 'They are tiny right now.' : null;
  },
  start(sim, target) {
    return sizeRun(sim, target.who as CharId, true);
  }
};
