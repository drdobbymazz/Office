// Thursday, "The Leak": find who has been emailing Corporate and accuse them.
// Doing nothing loses; watching the fax machine wins, and so does reading
// thoughts and checking with Truth Serum.
import { describe, expect, it } from 'vitest';
import { displayName } from '@/game/core/cast';
import type { CastId, CharId } from '@/game/core/types';
import { pickLeak } from '@/game/story';
import { LEAK } from '@/game/story/text';
import { play, storyAt, type Played } from './harness';

/** Run until someone other than `not` is seen using the fax machine; their id. */
async function watchFax(g: Played, max: number): Promise<CharId | null> {
  let seen: CharId | null = null;
  await g.until(() => {
    seen = g.sim.people().find((p) => p.isCast && p.doing === LEAK.fax.stay)?.id ?? null;
    return !!seen;
  }, max);
  return seen;
}

describe('Thursday: The Leak', () => {
  it('the leak is picked once per week, from the six suspects, and carries a hidden note', () => {
    expect(pickLeak(5)).toBe(pickLeak(5));
    const picks = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(pickLeak));
    expect(picks.size).toBeGreaterThan(2);
    for (const id of picks) expect(LEAK.candidates).toContain(id);
    const g = play(storyAt(4, 51));
    const leak = g.story.state.notes.leak;
    expect(g.sim.briefFor(leak, []).hidden).toBe(LEAK.hidden(displayName(leak)));
    for (const id of LEAK.candidates) if (id !== leak) expect(g.sim.briefFor(id, []).hidden).toBeUndefined();
    expect(g.day.accuseUi()).toEqual({ triesLeft: 2, accused: [], label: LEAK.label });
  });

  it('doing nothing loses, and the report says who it was', async () => {
    const g = play(storyAt(4, 51));
    await g.toEnd();
    expect(g.day.main).toBe('lost');
    expect(g.day.lines).toEqual([LEAK.nobody, LEAK.itWas(displayName(g.story.state.notes.leak))]);
    expect(g.day.accuseUi()).toBeNull();
  });

  for (const seed of [51, 52]) {
    it(`wins by watching who slips off to the fax machine (seed ${seed})`, async () => {
      const g = play(storyAt(4, seed));
      const seen = await watchFax(g, 400);
      expect(seen).toBe(g.story.state.notes.leak);
      g.day.accuse(seen!);
      expect(g.day.main).toBe('won');
      expect(g.feed).toContain(LEAK.right(displayName(seen!)));
      expect(g.day.extraState('noSerum')).toBe('won');
      expect(g.day.extraState('firstTry')).toBe('won');
      expect(g.sim.briefFor(seen!, []).hidden).toBeUndefined();
      expect(g.day.accuseUi()).toBeNull();
    });
  }

  it('wins by reading private thoughts, then checking with Truth Serum', async () => {
    const g = play(storyAt(4, 53));
    const leak = g.story.state.notes.leak;
    let suspect: CastId | undefined;
    await g.until(() => {
      suspect = LEAK.candidates.find((id) => LEAK.thoughts.includes(g.sim.person(id)!.thought));
      return !!suspect;
    }, 200);
    expect(suspect).toBe(leak);
    await g.until(() => !!g.sim.person(leak)?.present && !g.sim.isAirborne(leak), 30);
    expect(g.power('truth', { who: suspect! })).toBeNull();
    expect(g.day.extraState('noSerum')).toBe('lost');
    await g.step(4);
    expect(g.feed).toContain(LEAK.confessed(displayName(leak)));
    g.day.accuse(suspect!);
    expect(g.day.main).toBe('won');
  });

  it('Truth Serum on an innocent person rules them out', async () => {
    const g = play(storyAt(4, 54));
    const leak = g.story.state.notes.leak;
    const innocent = LEAK.candidates.find((id) => id !== leak)!;
    await g.toClock(9, 30);
    expect(g.power('truth', { who: innocent })).toBeNull();
    await g.step(4);
    expect(g.feed.some((l) => l.startsWith(`${displayName(innocent)} cannot lie right now`))).toBe(true);
    expect(g.feed).not.toContain(LEAK.confessed(displayName(innocent)));
  });

  it('two wrong accusations lose, and the office turns on the innocent', async () => {
    const g = play(storyAt(4, 55));
    const leak = g.story.state.notes.leak;
    const [a, b] = LEAK.candidates.filter((id) => id !== leak);
    await g.toClock(10);
    const before = g.sim.bond('jim', a);
    g.day.accuse(a);
    expect(g.day.main).toBe('open');
    expect(g.feed).toContain(LEAK.wrong(displayName(a)));
    expect(g.sim.bond('jim', a)).toBe(before - 12);
    expect(g.day.accuseUi()).toEqual({ triesLeft: 1, accused: [a], label: LEAK.label });
    expect(g.day.extraState('firstTry')).toBe('lost');
    g.day.accuse(a); // the same person again does nothing
    expect(g.day.accuseUi()?.triesLeft).toBe(1);
    g.day.accuse(b);
    expect(g.day.main).toBe('lost');
    expect(g.day.lines).toEqual([LEAK.outOfTries, LEAK.itWas(displayName(leak))]);
  });
});
