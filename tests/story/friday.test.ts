// Friday, "The Verdict": the inspector tours at 13:00. Doing nothing loses
// (Michael's farewell speech empties the desks); a well-aimed whisper wins, and
// so does keeping Michael in his office by hand.
import { describe, expect, it } from 'vitest';
import { VERDICT } from '@/game/story/text';
import { BULLPEN_STAFF } from '@/game/story';
import { play, storyAt, type Played } from './harness';

const score = (g: Played): number | null => (g.day.logic as unknown as { score: number | null }).score;

describe('Friday: The Verdict', () => {
  it('the bullpen staff are the ten with desks on the sales floor', () => {
    expect([...BULLPEN_STAFF].sort()).toEqual(['andy', 'creed', 'dwight', 'jim', 'kelly', 'meredith', 'pam', 'phyllis', 'ryan', 'stanley']);
  });

  it('doing nothing loses: Michael gives his farewell speech during the tour', async () => {
    const g = play(storyAt(5, 61));
    expect(g.sim.person('michael')!.conviction?.text).toBe(VERDICT.conviction);
    await g.toClock(12, 50);
    expect(g.day.goalUi().status).toBe(VERDICT.before);
    await g.toClock(13, 3);
    expect(g.sim.person('visitor:inspector')?.present).toBe(true);
    expect(g.day.goalUi().status).toMatch(/^Stop [123] of 3$/);
    await g.toClock(14);
    expect(g.feed).toContain(VERDICT.speech);
    expect(g.day.main).toBe('lost');
    expect(score(g)).toBeLessThan(60);
    expect(g.day.goalUi().status).toBe(VERDICT.score(score(g)!));
    expect(g.story.state.notes.inspection).toBe(score(g));
  });

  for (const seed of [61, 62]) {
    it(`wins with a whisper: Michael waits in his office for the inspector (seed ${seed})`, async () => {
      const g = play(storyAt(5, seed));
      await g.toClock(12, 30);
      expect(g.whisper('michael', 'I should wait in my office for the inspector.')).toBeNull();
      await g.toClock(14);
      expect(g.feed).not.toContain(VERDICT.speech);
      expect(g.day.main).toBe('won');
      expect(score(g)).toBeGreaterThanOrEqual(60);
    });
  }

  it('wins by hand: keep carrying Michael back to his office during the tour', async () => {
    const g = play(storyAt(5, 63));
    await g.toClock(12, 56);
    while (g.day.main === 'open' && g.sim.clock < 14 * 60) {
      if (g.sim.person('michael')!.room !== 'boss' && g.sim.holding === null) await g.drop('michael', 'spot.boss3');
      await g.step(0.5);
    }
    expect(g.feed).not.toContain(VERDICT.speech);
    expect(g.day.main).toBe('won');
    expect(g.day.influence.left).toBe(g.day.influence.max);
  });

  it('Full house and Spotless are settled by the end of the day', async () => {
    const g = play(storyAt(5, 64));
    await g.toClock(16, 1);
    expect(g.day.extraState('fullHouse')).toBe('won');
    await g.toEnd();
    expect(g.day.extraState('spotless')).toBe('won');
  });
});
