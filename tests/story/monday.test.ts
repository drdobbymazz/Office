// Monday, "The Memo", played on the real simulation and director with the
// no-model brain: doing nothing loses, and three different plans win.
import { describe, expect, it } from 'vitest';
import { MEMO } from '@/game/story/text';
import { play, storyAt, type Played } from './harness';

const othersInMeeting = (g: Played): number =>
  g.sim.people().filter((p) => p.isCast && p.present && p.id !== 'michael' && p.room === 'meeting').length;

/** Announce until at least nine are in the conference room (at most three times). */
async function fillTheRoom(g: Played): Promise<void> {
  for (let i = 0; i < 3 && othersInMeeting(g) < 9; i++) {
    expect(g.announce('Everyone to the conference room, now!')).toBeNull();
    await g.until(() => othersInMeeting(g) >= 9, 16);
  }
}

describe('Monday: The Memo', () => {
  it('doing nothing loses: the vice president phones an empty room', async () => {
    const g = play(storyAt(1, 21));
    await g.toEnd();
    expect(g.day.main).toBe('lost');
    expect(g.feed).toContain(MEMO.missed);
    // Everyone hears about the closure either way.
    expect(g.story.state.notes.closureKnown).toBe(true);
    const r = g.story.finishDay(g.day, g.sim.serialize());
    expect(r.won).toBe(false);
    expect(r.changes[0]).toEqual({ text: MEMO.changeLost, delta: -10 });
    expect(r.text).toEqual([MEMO.missed]);
  });

  it('sets the day up: Michael hides, is sure of it, and All-Hands is locked', async () => {
    const g = play(storyAt(1, 22));
    const m = g.sim.person('michael')!;
    expect(m.conviction?.text).toBe(MEMO.conviction);
    expect(g.sim.briefFor('michael', []).hidden).toBe(MEMO.hidden);
    expect(g.day.refusal('meeting')).toBe(MEMO.locked.meeting);
    await g.toClock(10);
    // Locked even when something else (a typed event) tries to set it off.
    expect(g.sim.startChaos('meeting', {}, { force: true })).toBe(MEMO.locked.meeting);
    // Carried out of his office, he goes back within half a minute.
    await g.drop('michael', 'spot.kitchen2');
    expect(g.sim.person('michael')!.room).toBe('kitchen');
    expect(await g.until(() => g.sim.person('michael')!.doing === MEMO.hiding, 45)).toBe(true);
  });

  for (const seed of [21, 23]) {
    it(`wins with announcements and a hand (Quiet hands), seed ${seed}`, async () => {
      const g = play(storyAt(1, seed));
      await g.toClock(14);
      expect(g.day.goalUi().status).toMatch(/of 10 in the room, Michael not yet/);
      await fillTheRoom(g);
      expect(othersInMeeting(g)).toBeGreaterThanOrEqual(9);
      await g.drop('michael', 'spot.meet8');
      await g.until(() => g.day.main !== 'open', 5);
      expect(g.day.main).toBe('won');
      expect(g.feed).toContain(MEMO.ring);
      expect(g.sim.facts()).toContain(MEMO.closure);
      expect(g.sim.person('michael')!.conviction).toBeNull();
      expect(g.day.extraState('quiet')).toBe('won');
      expect(g.day.influence.left).toBeGreaterThanOrEqual(5 + 2);
    });
  }

  it('wins with a whisper that sends Michael to the call, and an announcement', async () => {
    const g = play(storyAt(1, 24));
    await g.toClock(13, 40);
    expect(g.whisper('michael', 'I need to be in the conference room for the call at three.')).toBeNull();
    expect(g.sim.person('michael')!.conviction?.text).not.toBe(MEMO.conviction);
    await g.toClock(14);
    await fillTheRoom(g);
    await g.until(() => g.day.main !== 'open' || g.sim.clock >= 15 * 60, 200);
    expect(g.day.main).toBe('won');
    expect(g.day.extraState('quiet')).toBe('won');
  });

  it('wins by locking Michael in the conference room, then calling everyone in', async () => {
    const g = play(storyAt(1, 25));
    await g.toClock(13, 20);
    expect(g.power('lockIn', { who: 'michael', other: 'pam' })).toBeNull();
    expect(g.day.extraState('quiet')).toBe('lost');
    await g.until(() => !g.sim.activeChaos().some((c) => c.id === 'lockIn'), 120);
    await g.step(1);
    expect(g.feed).toContain(MEMO.lockedOut);
    expect(g.sim.person('michael')!.conviction).toBeNull();
    await g.toClock(14);
    expect(g.sim.person('michael')!.room).toBe('meeting');
    await fillTheRoom(g);
    await g.until(() => g.day.main !== 'open' || g.sim.clock >= 15 * 60, 200);
    expect(g.day.main).toBe('won');
  });

  it('Calm Monday fails at the first incident', async () => {
    const g = play(storyAt(1, 26));
    await g.toClock(10);
    expect(g.power('smite', { who: 'dwight' })).toBeNull();
    await g.step(0.5);
    expect(g.day.extraState('calm')).toBe('lost');
  });
});
