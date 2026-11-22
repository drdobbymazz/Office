// The numbers: what things cost, how influence is spent, refused and given
// back, how Branch Standing moves, and which ending a week earns.
import { describe, expect, it } from 'vitest';
import { CHAOS_IDS } from '@/game/core/types';
import { CHAOS } from '@/game/core/chaos';
import { BUDGETS, STANDING_START, allCosts, applyChanges, costOf, endingFor, powerCost, standingChanges } from '@/game/story';
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
  it('adds up a day: main goal, extras, incidents (capped) and morale', () => {
    expect(standingChanges({ won: true, goalText: 'Won', extras: ['A', 'B'], incidents: 0, morale: 50 })).toEqual([
      { text: 'Won', delta: 15 }, { text: CHANGES.extra('A'), delta: 5 }, { text: CHANGES.extra('B'), delta: 5 }
    ]);
    expect(standingChanges({ won: false, goalText: 'Lost', extras: [], incidents: 2, morale: 60 })).toEqual([
      { text: 'Lost', delta: -10 }, { text: '2 incidents were reported to Corporate', delta: -4 }, { text: CHANGES.moraleHigh, delta: 3 }
    ]);
    const many = standingChanges({ won: false, goalText: 'Lost', extras: [], incidents: 9, morale: 30 });
    expect(many).toContainEqual({ text: '9 incidents were reported to Corporate', delta: -10 });
    expect(many).toContainEqual({ text: CHANGES.moraleLow, delta: -3 });
    expect(standingChanges({ won: true, goalText: 'W', extras: [], incidents: 1, morale: 45 })[1]).toEqual({ text: '1 incident was reported to Corporate', delta: -2 });
    expect(applyChanges(STANDING_START, [{ text: 'x', delta: 15 }, { text: 'y', delta: -4 }])).toBe(51);
    expect(applyChanges(95, [{ text: 'x', delta: 15 }])).toBe(100);
    expect(applyChanges(5, [{ text: 'x', delta: -10 }])).toBe(0);
  });

  it('picks the ending from the final standing', () => {
    expect(endingFor(100)).toBe('saved');
    expect(endingFor(65)).toBe('saved');
    expect(endingFor(64)).toBe('scraped');
    expect(endingFor(40)).toBe('scraped');
    expect(endingFor(39)).toBe('closed');
    expect(endingFor(0)).toBe('closed');
  });
});
