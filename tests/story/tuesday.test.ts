// Tuesday, "Not Speaking": Angela and Oscar must make up before five.
// Doing nothing loses (Dwight keeps it going); talking them round wins, and so
// does a run of powers.
import { describe, expect, it } from 'vitest';
import { ROW } from '@/game/story/text';
import { play, storyAt, type Played } from './harness';

const bonds = (g: Played): [number, number] => [g.sim.bond('angela', 'oscar'), g.sim.bond('oscar', 'angela')];

describe('Tuesday: Not Speaking', () => {
  it('sets the day up: the row, the deadline, and Dwight sure of a plot', () => {
    const g = play(storyAt(2, 31));
    expect(bonds(g)).toEqual([-40, -40]);
    expect(g.sim.facts()).toContain(ROW.fact);
    expect(g.sim.person('dwight')!.conviction?.text).toBe(ROW.dwight);
    expect(g.day.goalUi().status).toBe('Angela −40/15, Oscar −40/15');
    expect(g.day.goalUi().progress).toBe(0);
  });

  it('doing nothing loses: the accounts go in late', async () => {
    const g = play(storyAt(2, 31));
    await g.toEnd();
    expect(g.day.main).toBe('lost');
    const [a, o] = bonds(g);
    expect(a < 15 || o < 15).toBe(true);
    // Dwight's warnings made Angela think even less of Oscar.
    expect(a).toBeLessThan(-40);
    expect(g.day.lines).toEqual([ROW.lost]);
    expect(g.story.state.notes.accounts).toBe(false);
  });

  for (const seed of [31, 32]) {
    it(`wins by talking them round: whispers, then telling Angela to make peace (seed ${seed})`, async () => {
      const g = play(storyAt(2, seed));
      await g.toClock(9, 10);
      expect(g.whisper('dwight', 'Oscar is a decent man. I was wrong about him.')).toBeNull();
      expect(g.day.extraState('stirring')).toBe('open');
      await g.step(0.2);
      expect(g.day.extraState('stirring')).toBe('won');
      expect(g.whisper('angela', 'I should make peace with Oscar.')).toBeNull();
      expect(g.whisper('oscar', 'I should make peace with Angela.')).toBeNull();
      while (g.day.main === 'open' && g.sim.clock < 17 * 60) {
        if (g.day.influence.left >= 1) g.cue('angela', 'go and make peace with Oscar');
        await g.step(45);
      }
      expect(g.day.main).toBe('won');
      expect(g.feed).toContain(ROW.won);
      expect(g.sim.facts()).toContain(ROW.madeUp);
      // All three sit down together for the accounts.
      await g.until(() => g.day.extraState('team') !== 'open', 60);
      expect(g.day.extraState('team')).toBe('won');
    });
  }

  it('wins with powers: Locked In, then Cupid\'s Arrow both ways', async () => {
    const g = play(storyAt(2, 33));
    await g.toClock(9, 10);
    expect(g.whisper('dwight', 'Oscar is a decent man. I was wrong about him.')).toBeNull();
    expect(g.power('lockIn', { who: 'angela', other: 'oscar' })).toBeNull();
    await g.until(() => !g.sim.activeChaos().some((c) => c.id === 'lockIn'), 120);
    expect(g.feed).toContain(ROW.lockedTalk);
    const [a1, o1] = bonds(g);
    expect(a1).toBeGreaterThanOrEqual(-22);
    expect(o1).toBeGreaterThanOrEqual(-22);
    expect(g.power('love', { who: 'angela', other: 'oscar' })).toBeNull();
    await g.step(61);
    expect(g.power('love', { who: 'oscar', other: 'angela' })).toBeNull();
    await g.until(() => g.day.main !== 'open' || g.sim.clock >= 17 * 60, 600);
    expect(g.day.main).toBe('won');
  });

  it('a conversation between the two helps; one they were pushed into helps more', async () => {
    const g = play(storyAt(2, 34));
    await g.toClock(9, 5);
    g.sim.bus.emit('sceneDone', { people: ['angela', 'oscar'], trigger: 'ambient' });
    expect(bonds(g)).toEqual([-35, -35]);
    g.sim.bus.emit('sceneDone', { people: ['oscar', 'angela'], trigger: 'plan', planKind: 'comfort' });
    expect(bonds(g)).toEqual([-25, -25]);
    g.sim.bus.emit('sceneDone', { people: ['dwight', 'angela'], trigger: 'plan', planKind: 'gossip' });
    expect(bonds(g)).toEqual([-31, -25]);
  });
});
