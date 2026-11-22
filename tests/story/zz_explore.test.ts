import { it } from 'vitest';
import { play, storyAt, type Played } from './harness';
import { FIGGIS } from '@/game/story';
import { LEAK } from '@/game/story/text';

const others = (g: Played) => g.sim.people().filter((p) => p.isCast && p.present && p.id !== 'michael' && p.room === 'meeting').length;
async function fill(g: Played) { for (let i = 0; i < 3 && others(g) < 9; i++) { g.announce('Everyone to the conference room, now!'); await g.until(() => others(g) >= 9, 16); } }

const S: Record<string, (g: Played) => Promise<void>> = {
  'mon-none': async (g) => { await g.toEnd(); },
  'mon-hand': async (g) => { await g.toClock(14); await fill(g); await g.drop('michael', 'spot.meet8'); await g.until(() => g.day.main !== 'open', 5); },
  'mon-whisper': async (g) => { await g.toClock(13, 40); g.whisper('michael', 'I need to be in the conference room for the call at three.'); await g.toClock(14); await fill(g); await g.until(() => g.day.main !== 'open' || g.sim.clock >= 900, 200); },
  'mon-lock': async (g) => { await g.toClock(13, 20); g.power('lockIn', { who: 'michael', other: 'pam' }); await g.until(() => !g.sim.activeChaos().some((c) => c.id === 'lockIn'), 120); await g.toClock(14); await fill(g); await g.until(() => g.day.main !== 'open' || g.sim.clock >= 900, 200); },
  'tue-none': async (g) => { await g.toEnd(); },
  'tue-words': async (g) => { await g.toClock(9, 10); g.whisper('dwight', 'Oscar is a decent man. I was wrong about him.'); g.whisper('angela', 'I should make peace with Oscar.'); g.whisper('oscar', 'I should make peace with Angela.'); while (g.day.main === 'open' && g.sim.clock < 1020) { if (g.day.influence.left >= 1) g.cue('angela', 'go and make peace with Oscar'); await g.step(45); } },
  'tue-powers': async (g) => { await g.toClock(9, 10); g.whisper('dwight', 'Oscar is a decent man. I was wrong about him.'); g.power('lockIn', { who: 'angela', other: 'oscar' }); await g.until(() => !g.sim.activeChaos().some((c) => c.id === 'lockIn'), 120); g.power('love', { who: 'angela', other: 'oscar' }); await g.step(61); g.power('love', { who: 'oscar', other: 'angela' }); await g.until(() => g.day.main !== 'open' || g.sim.clock >= 1020, 600); },
  'wed-none': async (g) => { await g.toEnd(); },
  'wed-announce': async (g) => { await g.toClock(10, 31); g.announce('Mr Figgis and Jim, please come to the conference room.'); await g.step(0.2); for (const who of ['Dwight', 'Phyllis']) { const line = [...g.feed].reverse().find((l) => / heads? for /.test(l)) ?? ''; if (/Jim|Dwight|Phyllis/.test(line)) break; g.announce(`${who}, please come to the conference room.`); await g.step(0.2); } await g.until(() => g.day.main !== 'open', 150); },
  'wed-hand': async (g) => { await g.toClock(10, 33); await g.drop(FIGGIS, 'spot.meet8'); await g.drop('dwight', 'spot.meet10'); await g.until(() => g.day.main !== 'open', 60); },
  'thu-none': async (g) => { await g.toEnd(); },
  'thu-fax': async (g) => { let seen: string | null = null; await g.until(() => { seen = g.sim.people().find((p) => p.isCast && p.doing === LEAK.fax.stay)?.id ?? null; return !!seen; }, 400); if (seen) g.day.accuse(seen); },
  'fri-none': async (g) => { await g.toClock(14); },
  'fri-whisper': async (g) => { await g.toClock(12, 30); g.whisper('michael', 'I should wait in my office for the inspector.'); await g.toClock(14); },
  'fri-hand': async (g) => { await g.toClock(12, 56); while (g.day.main === 'open' && g.sim.clock < 840) { if (g.sim.person('michael')!.room !== 'boss' && g.sim.holding === null) await g.drop('michael', 'spot.boss3'); await g.step(0.5); } }
};

it('robustness', async () => {
  for (const [name, fn] of Object.entries(S).filter(([k]) => ['mon-whisper', 'wed-announce', 'fri-whisper', 'mon-hand', 'mon-lock'].includes(k))) {
    const ch = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 }[name.slice(0, 3)]!;
    let won = 0; const n = 16; const fails: number[] = [];
    for (let seed = 100; seed < 100 + n; seed++) {
      const g = play(storyAt(ch, seed));
      await fn(g);
      if (g.day.main === 'won') won++; else fails.push(seed);
    }
    console.log(name.padEnd(14), `${won}/${n}`, fails.length && fails.length < n ? 'fails ' + fails.join(',') : '');
  }
}, 600000);
