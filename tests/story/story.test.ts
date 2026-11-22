// The week as a whole: saving and loading, "Try the day again", moving on,
// Branch Standing across the days, the screens' data, and the endings.
import { describe, expect, it } from 'vitest';
import { Story, StoryDay, memoryStore, STATE_KEY, WORLD_KEY } from '@/game/story';
import { MEMO, ROW, VERDICT } from '@/game/story/text';
import { play, storyAt, type Played } from './harness';

describe('saving the story', () => {
  it('saves under its own keys and loads back; the title screen can offer to continue', () => {
    const store = memoryStore();
    expect(Story.peek(store)).toBeNull();
    const s = Story.create(store, 9);
    expect(store.data.has(STATE_KEY)).toBe(true);
    expect(store.data.has(WORLD_KEY)).toBe(true);
    expect(store.data.has('world.v2')).toBe(false);
    expect(Story.peek(store)).toEqual({ chapter: 1, chapters: 5, title: 'The Memo', weekday: 'Monday', standing: 40 });
    const back = Story.load(store)!;
    expect(back.state).toEqual(s.state);
    store.data.set(STATE_KEY, '{"version":7}');
    expect(Story.load(store)).toBeNull();
    expect(Story.peek(store)).toBeNull();
  });

  it('the screens get the whole chapter: text, goals, budget, costs, locks and the week', () => {
    const g = play(storyAt(1, 81));
    const ui = g.story.ui(g.day);
    expect(ui.chapter).toBe(1);
    expect(ui.chapters).toBe(5);
    expect(ui.weekday).toBe('Monday');
    expect(ui.title).toBe('The Memo');
    expect(ui.intro).toEqual(MEMO.intro);
    expect(ui.hints).toEqual(MEMO.hints);
    expect(ui.goal).toMatchObject({ id: 'call', title: 'All hands for the call', state: 'open', status: MEMO.before });
    expect(ui.side.map((x) => x.title)).toEqual(['Quiet hands', 'Calm Monday']);
    expect(ui.influence).toEqual({ left: 8, max: 8 });
    expect(ui.costs.whisper).toBe(1);
    expect(ui.costs.fire).toBe(4);
    expect(ui.locked).toEqual({ meeting: MEMO.locked.meeting });
    expect(ui.accuse).toBeNull();
    expect(ui.result).toBeNull();
    expect(ui.ending).toBeNull();
    expect(ui.week.map((w) => w.weekday)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    expect(ui.week.every((w) => w.result === null)).toBe(true);
    for (const line of [...ui.intro, ...ui.hints, ui.goal.detail, ...ui.side.map((x) => x.detail)]) expect(line).not.toMatch(/—|–/);
  });
});

describe('Try the day again', () => {
  it('puts the office, the standing and the notes back exactly as they were that morning', async () => {
    const store = memoryStore();
    const story = Story.create(store, 82);
    const g = play(story, store);
    const start = JSON.stringify(story.startSnapshot);
    const where = (x: Played): string[] => x.sim.people().filter((p) => p.isCast).map((p) => `${p.id}@${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    await g.toClock(10);
    const at10 = where(g);
    await g.toEnd();
    const r = story.finishDay(g.day, g.sim.serialize());
    expect(r.won).toBe(false);
    expect(story.standing).toBe(r.standingAfter);
    expect(story.state.notes.closureKnown).toBe(true);
    expect(story.ui(null).result?.won).toBe(false);
    expect(story.ui(null).week[0].result).toBe('lost');
    g.day.dispose();

    const save = story.retry();
    expect(JSON.stringify(save)).toBe(start);
    expect(story.standing).toBe(40);
    expect(story.result).toBeNull();
    expect(story.state.notes.closureKnown).toBeUndefined();
    expect(story.ui(null).week[0].result).toBeNull();
    // Reload from storage too, as after closing the game.
    const again = play(Story.load(store)!, store);
    expect(JSON.stringify(again.story.startSnapshot)).toBe(start);
    expect(again.sim.day).toBe(1);
    expect(again.sim.person('michael')!.conviction?.text).toBe(MEMO.conviction);
    await again.toClock(10);
    // Same morning, same seed, same nothing done: the same office at ten.
    expect(where(again)).toEqual(at10);
  });

  it('a day played after another starts from the end of the one before', async () => {
    const store = memoryStore();
    const story = Story.create(store, 85);
    const g = play(story, store);
    await g.toEnd();
    story.finishDay(g.day, g.sim.serialize());
    g.day.dispose();
    expect(story.advance()).toBe('next');
    const t = play(story, store);
    expect(t.sim.day).toBe(2);
    // Monday's memories came along.
    expect(t.sim.memoriesFor('pam', []).length + t.sim.personDetail('pam')!.memories.length).toBeGreaterThan(0);
    expect(t.sim.bond('angela', 'oscar')).toBe(-40);
    expect(t.sim.facts()).toContain(MEMO.closure);
  });
});

/** A finished day with a fixed result, for testing the week's arithmetic without playing it. */
function fakeDay(t: { won: boolean; extras?: string[]; incidents?: number; morale?: number }): StoryDay {
  return {
    tally: () => ({ won: t.won, goalText: t.won ? 'Won' : 'Lost', extras: t.extras ?? [], incidents: t.incidents ?? 0, morale: t.morale ?? 50, lines: [] })
  } as unknown as StoryDay;
}

/** Play out a whole week from fixed day results; returns the story at the end. */
function weekOf(days: Parameters<typeof fakeDay>[0][], seed = 90): Story {
  const story = Story.create(memoryStore(), seed);
  days.forEach((d, i) => {
    const r = story.finishDay(fakeDay(d), null);
    // The report always adds up: no hidden cap.
    expect(r.standingAfter).toBe(r.standingBefore + r.changes.reduce((sum, c) => sum + c.delta, 0));
    if (i < 4) expect(story.advance()).toBe('next');
  });
  expect(story.advance()).toBe('ending');
  return story;
}

const PERFECT = { won: true, extras: ['A', 'B'], morale: 65 };
const IDLE = { won: false };

describe('the week', () => {
  it('five perfect days: standing climbs past 100 with honest arithmetic, and the branch stays open', () => {
    const story = weekOf([PERFECT, PERFECT, PERFECT, PERFECT, PERFECT]);
    expect(story.standing).toBe(40 + 5 * 13);
    expect(story.endingId()).toBe('saved');
    expect(story.ui(null).ending!.title).toBe('THE BRANCH STAYS OPEN');
  });

  it('a perfect Monday to Wednesday does not settle the week: Friday decides', () => {
    // Thursday and Friday lost by doing nothing: survives with cuts.
    expect(weekOf([PERFECT, PERFECT, PERFECT, IDLE, IDLE]).endingId()).toBe('scraped');
    // Lots of standing, but the inspection failed: the best ending is out of reach.
    const failedFriday = weekOf([PERFECT, PERFECT, PERFECT, PERFECT, IDLE]);
    expect(failedFriday.standing).toBeGreaterThanOrEqual(75);
    expect(failedFriday.endingId()).toBe('scraped');
    // Only two days won: not enough to stay open even with Friday passed.
    expect(weekOf([IDLE, IDLE, IDLE, PERFECT, PERFECT]).endingId()).toBe('closed');
    expect(weekOf([PERFECT, IDLE, IDLE, PERFECT, PERFECT]).endingId()).toBe('scraped');
    expect(weekOf([PERFECT, PERFECT, IDLE, PERFECT, PERFECT]).endingId()).toBe('saved');
  });

  it('five days of doing nothing: the branch closes, and later days remember what happened', async () => {
    const store = memoryStore();
    const story = Story.create(store, 84);
    for (let ch = 1; ch <= 5; ch++) {
      const g = play(story, store);
      if (ch >= 2) expect(g.sim.facts()).toContain(MEMO.closure);
      if (ch >= 3) expect(g.sim.facts()).toContain(ROW.lateFact);
      if (ch === 5) expect(g.sim.facts()).toContain(VERDICT.fact);
      await g.toEnd();
      const r = story.finishDay(g.day, g.sim.serialize());
      g.day.dispose();
      expect(r.won).toBe(false);
      expect(r.standingAfter).toBeLessThan(r.standingBefore);
      story.advance();
    }
    expect(story.stage).toBe('ended');
    expect(story.standing).toBeLessThan(45);
    const end = story.ending();
    expect(end.id).toBe('closed');
    expect(end.title).toBe('CLOSING TIME');
  });
});
