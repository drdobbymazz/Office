// The numbers: what things cost, how influence is spent, refused and given
// back, how Branch Standing moves, and which ending a week earns.
import { describe, expect, it } from 'vitest';
import { CHAOS_IDS } from '@/game/core/types';
import { CHAOS } from '@/game/core/chaos';
import { BUDGETS, ENDING, STANDING_START, allCosts, applyChanges, costOf, endingFor, powerCost, standingChanges } from '@/game/story';
import { CHANGES, MEMO, NOT_ENOUGH } from '@/game/story/text';
import { play, storyAt } from './harness';

describe('costs and budgets', () => {
  it('tools cost 1 (Anything 3); powers cost 2, 3 or 4 by how much chaos they cause', () => {
    expect([costOf('whisper'), costOf('cue'), costOf('announce'), costOf('anything')]).toEqual([1, 1, 1, 3]);
    for (const id of CHAOS_IDS) {
      const c = CHAOS[id].chaos;
      expect(powerCost(id)).toBe(c <= 10 ? 2 : c <= 18 ? 3 : 4);
    }
    expect(powerCost('pizza')).toBe(2);
    expect(powerCost('lockIn')).toBe(3);
    expect(powerCost('fire')).toBe(4);
    expect(allCosts().truth).toBe(2);
    expect(BUDGETS).toEqual([8, 8, 6, 7, 10]);
  });
});

describe('influence on a real day', () => {
  it('spending, refusing with the plain message, and giving back what did not happen', async () => {
    const g = play(storyAt(1, 71));
    expect(g.day.influence).toEqual({ left: 8, max: 8 });
    await g.toClock(10);
    expect(g.power('fire', { room: 'kitchen' })).toBeNull();
    expect(g.day.influence.left).toBe(4);
    // The same power again is still cooling down: refused by the office, and refunded.
    expect(g.power('fire', { room: 'kitchen' })).toMatch(/cooling down|already/);
    expect(g.day.influence.left).toBe(4);
    expect(g.power('lockIn', { who: 'jim', other: 'pam' })).toBeNull();
    expect(g.day.influence.left).toBe(1);
    expect(g.day.refusal('lockIn')).toBe('Not enough influence: this costs 3, you have 1.');
    expect(g.power('lockIn', { who: 'jim', other: 'dwight' })).toBe(NOT_ENOUGH(3, 1));
    expect(g.day.influence.left).toBe(1);
    expect(g.whisper('pam', 'Jim is lovely.')).toBeNull();
    expect(g.day.influence.left).toBe(0);
    expect(g.announce('Hello')).toBe(NOT_ENOUGH(1, 0));
    // Locked powers give their reason, whatever is left.
    expect(g.day.refusal('meeting')).toBe(MEMO.locked.meeting);
  });

  it('an extra goal done gives 2 influence at once', async () => {
    const g = play(storyAt(2, 72));
    await g.toClock(9, 10);
    expect(g.whisper('dwight', 'Oscar is fine, really.')).toBeNull();
    expect(g.day.influence.left).toBe(7);
    await g.step(0.2);
    expect(g.day.extraState('stirring')).toBe('won');
    expect(g.day.influence.left).toBe(9);
    expect(g.goals).toContainEqual({ title: 'Who keeps stirring?', state: 'won', main: false });
  });

  it('a failed action is refunded', () => {
    const g = play(storyAt(1, 73));
    expect(g.day.attempt('anything', () => 'Nobody is in the office yet.')).toBe('Nobody is in the office yet.');
    expect(g.day.influence.left).toBe(8);
    expect(g.day.attempt('anything', () => null)).toBeNull();
    expect(g.day.influence.left).toBe(5);
  });
});

describe('Branch Standing', () => {
  it('adds up a day: main goal 8, extras 2, incidents 1 each (at most 3) and morale 1', () => {
    expect(standingChanges({ won: true, goalText: 'Won', extras: ['A', 'B'], incidents: 0, morale: 50 })).toEqual([
      { text: 'Won', delta: 8 }, { text: CHANGES.extra('A'), delta: 2 }, { text: CHANGES.extra('B'), delta: 2 }
    ]);
    expect(standingChanges({ won: false, goalText: 'Lost', extras: [], incidents: 2, morale: 60 })).toEqual([
      { text: 'Lost', delta: -8 }, { text: '2 incidents were reported to Corporate', delta: -2 }, { text: CHANGES.moraleHigh, delta: 1 }
    ]);
    const many = standingChanges({ won: false, goalText: 'Lost', extras: [], incidents: 9, morale: 29 });
    expect(many).toContainEqual({ text: '9 incidents were reported to Corporate', delta: -3 });
    expect(many).toContainEqual({ text: CHANGES.moraleLow, delta: -1 });
    // Exactly 30 is not low.
    expect(standingChanges({ won: true, goalText: 'W', extras: [], incidents: 0, morale: 30 })).toHaveLength(1);
    expect(standingChanges({ won: true, goalText: 'W', extras: [], incidents: 1, morale: 45 })[1]).toEqual({ text: '1 incident was reported to Corporate', delta: -1 });
  });

  it('is never capped, so the report always adds up', () => {
    expect(applyChanges(STANDING_START, [{ text: 'x', delta: 8 }, { text: 'y', delta: -1 }])).toBe(47);
    expect(applyChanges(98, [{ text: 'x', delta: 8 }, { text: 'y', delta: 2 }])).toBe(108);
    expect(applyChanges(3, [{ text: 'x', delta: -8 }])).toBe(-5);
  });

  it('a perfect Monday to Wednesday leaves the ending open; doing nothing costs standing', () => {
    const perfect = { won: true, goalText: 'W', extras: ['A', 'B'], incidents: 0, morale: 65 };
    const idle = { won: false, goalText: 'L', extras: [], incidents: 0, morale: 50 };
    let s = STANDING_START;
    for (let i = 0; i < 3; i++) s = applyChanges(s, standingChanges(perfect));
    expect(s).toBe(79);
    // Lose Thursday and Friday by doing nothing: the branch only survives with cuts.
    const after = applyChanges(applyChanges(s, standingChanges(idle)), standingChanges(idle));
    expect(after).toBe(63);
    expect(endingFor(after, false)).toBe('scraped');
    // A whole week of doing nothing closes it.
    let none = STANDING_START;
    for (let i = 0; i < 5; i++) none = applyChanges(none, standingChanges(idle));
    expect(none).toBe(0);
    expect(endingFor(none, false)).toBe('closed');
  });

  it('picks the ending from the final standing and Friday: 75+ and Friday won stays open, under 45 closes', () => {
    expect(endingFor(100, true)).toBe('saved');
    expect(endingFor(75, true)).toBe('saved');
    expect(endingFor(75, false)).toBe('scraped');
    expect(endingFor(120, false)).toBe('scraped');
    expect(endingFor(74, true)).toBe('scraped');
    expect(endingFor(45, true)).toBe('scraped');
    expect(endingFor(44, true)).toBe('closed');
    expect(endingFor(-5, false)).toBe('closed');
    expect(ENDING).toEqual({ saved: 75, closedBelow: 45 });
  });
});
