// Dev-only: talks to a model server from a real browser and prints what streams back.
//   /harness/brain.html?base=http://localhost:11500&model=artemis-custom
import { createBrain } from './index';
import type { BrainWorld } from './world';
import type { InstinctBank } from '@/game/core/content/types';
import { CAST_LIST, SETTING } from '@/game/core/cast';
import { ROOMS } from '@/game/core/world';

const q = new URLSearchParams(location.search);
const out = document.getElementById('out')!;
const log = (s: string): void => { out.textContent += '\n' + s; };
const world: BrainWorld = {
  setting: SETTING,
  people: CAST_LIST.map((c) => ({ id: c.id, name: c.name, role: c.role, ...c.persona, examples: [...c.persona.examples] })),
  rooms: ROOMS.map((r) => ({ id: r.id, name: r.name }))
};
const brain = createBrain(
  { provider: 'ollama', baseUrl: q.get('base') ?? 'http://localhost:11500', model: q.get('model') ?? 'artemis-custom', apiKey: '', temperature: 0.9, keepAlive: '30m', claudeTier: 'quick' },
  { bank: {} as InstinctBank, world }
);
const t0 = performance.now();
const ms = (): string => `${Math.round(performance.now() - t0)}ms`;
const status = await brain.status();
log(`${ms()} status ${JSON.stringify(status)}`);
const brief = (id: string, name: string, mood: 'smug' | 'angry'): Parameters<typeof brain.scene>[0]['people'][number] => ({
  id, name, mood, state: [], goal: 'wants the last word', feelings: [], memories: []
});
const res = await brain.scene({
  id: 's1', day: 1, clock: '10:42', place: 'the bullpen', trigger: 'event', why: "Dwight's stapler has turned up inside the vending machine.",
  people: [brief('dwight', 'Dwight', 'angry'), brief('jim', 'Jim', 'smug')], onlookers: ['Pam'], facts: [], recent: [], minLines: 3, maxLines: 4, chaos: 0.3
}, { onLine: (l, i) => log(`${ms()} line ${i}: ${l.who} [${l.feel}/${l.act}] ${l.say}`) });
log(`${ms()} done source=${res.source} lines=${res.lines.length} summary=${res.summary}`);
log(`status after ${JSON.stringify(await brain.status())}`);
Object.assign(window, { __ready: true, __result: res });
