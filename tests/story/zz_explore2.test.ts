import { it } from 'vitest';
import { play, storyAt } from './harness';
import { FIGGIS } from '@/game/story';

it('wed fails', async () => {
  for (const seed of [100, 109]) {
    const g = play(storyAt(3, seed));
    await g.toClock(10, 31);
    g.announce('Mr Figgis and Jim, please come to the conference room.');
    await g.step(0.2);
    console.log(seed, g.feed.slice(-3).join(' | '));
    for (const who of ['Dwight', 'Phyllis']) { if (/Jim|Dwight|Phyllis/.test(g.feed[g.feed.length - 2] + g.feed[g.feed.length - 1])) break; g.announce(`${who}, please come to the conference room.`); await g.step(0.2); console.log('  again', g.feed.slice(-2).join(' | ')); }
    for (let i = 0; i < 12 && g.day.main === 'open'; i++) {
      await g.step(5);
      const f = g.sim.person(FIGGIS); const m = g.sim.person('michael')!;
      const sales = ['jim','dwight','phyllis'].map((id) => `${id}:${g.sim.person(id)!.room}/${g.sim.person(id)!.doing}`).join(' ');
      console.log(' ', g.sim.clock.toFixed(0), g.day.goalUi().status, '| F', f?.room, f?.doing, '|', sales, '| M', m.room, m.doing);
    }
    console.log(seed, g.day.main, g.day.lines);
  }
});
