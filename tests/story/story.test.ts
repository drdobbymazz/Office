// The week as a whole: saving and loading, "Try the day again", moving on,
// Branch Standing across the days, the screens' data, and the endings.
import { describe, expect, it } from 'vitest';
import { Story, memoryStore, STATE_KEY, WORLD_KEY, FIGGIS } from '@/game/story';
import { LEAK, MEMO, ROW, VERDICT } from '@/game/story/text';
import { play, storyAt, type Played } from './harness';

const othersInMeeting = (g: Played): number =>
  g.sim.people().filter((p) => p.isCast && p.present && p.id !== 'michael' && p.room === 'meeting').length;

/** One winning way through each day, as quick as possible. */
const WIN: Record<number, (g: Played) => Promise<void>> = {
  1: async (g) => {
    await g.toClock(14);
    for (let i = 0; i < 3 && othersInMeeting(g) < 9; i++) {
      g.announce('Everyone to the conference room, now!');
      await g.until(() => othersInMeeting(g) >= 9, 16);
    }
    await g.drop('michael', 'spot.meet8');
  },
  2: async (g) => {
    await g.toClock(9, 10);
    g.whisper('dwight', 'Oscar is a decent man. I was wrong about him.');
    g.whisper('angela', 'I should make peace with Oscar.');
    g.whisper('oscar', 'I should make peace with Angela.');
    while (g.day.main === 'open' && g.sim.clock < 17 * 60) {
      if (g.day.influence.left >= 1) g.cue('angela', 'go and make peace with Oscar');
      await g.step(45);
    }
  },
  3: async (g) => {
    await g.toClock(10, 33);
    await g.drop(FIGGIS, 'spot.meet8');
    await g.drop('dwight', 'spot.meet10');
  },
  4: async (g) => {
    let seen: string | null = null;
    await g.until(() => {
      seen = g.sim.people().find((p) => p.isCast && p.doing === LEAK.fax.stay)?.id ?? null;
      return !!seen;
    }, 400);
    if (seen) g.day.accuse(seen);
  },
  5: async (g) => {
    await g.toClock(12, 30);
    g.whisper('michael', 'I should wait in my office for the inspector.');
  }
};

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

describe('the week', () => {
  it('five won days: standing climbs, each day carries on from the last, and the branch is saved', async () => {
    const store = memoryStore();
    let story = Story.create(store, 83);
    const leak = story.state.notes.leak;
    for (let ch = 1; ch <= 5; ch++) {
      // Every other day, pretend the game was closed and opened again.
      if (ch % 2 === 0) story = Story.load(store)!;
      expect(story.chapter).toBe(ch);
      const g = play(story, store);
      expect(g.sim.day).toBe(ch);
      expect(g.sim.weekday).toBe(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][ch - 1]);
      await WIN[ch](g);
      await g.toEnd();
      const r = story.finishDay(g.day, g.sim.serialize());
      g.day.dispose();
      expect(r.won).toBe(true);
      expect(r.changes[0].delta).toBe(15);
      expect(r.standingAfter).toBeGreaterThanOrEqual(Math.min(100, r.standingBefore + 15 - 10));
      if (ch < 5) {
        expect(Story.peek(store)?.chapter).toBe(ch + 1);
        expect(story.advance()).toBe('next');
      }
    }
    expect(story.state.notes).toMatchObject({ call: true, accounts: true, figgis: true, leakFound: true, leak });
    expect(story.ui(null).week.map((w) => w.result)).toEqual(['won', 'won', 'won', 'won', 'won']);
    expect(story.advance()).toBe('ending');
    expect(Story.peek(store)).toBeNull();
    const end = story.ui(null).ending!;
    expect(end.id).toBe('saved');
    expect(end.title).toBe('THE BRANCH STAYS OPEN');
    expect(end.text.join(' ')).toContain('Figgis Hardware signed for another year');
    expect(end.text.join(' ')).toMatch(/caught sending emails to Corporate/);
    for (const line of end.text) expect(line).not.toMatch(/—|–/);
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
      story.advance();
    }
    expect(story.stage).toBe('ended');
    expect(story.standing).toBeLessThan(40);
    const end = story.ending();
    expect(end.id).toBe('closed');
    expect(end.title).toBe('CLOSING TIME');
  });
});
