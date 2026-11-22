// Friday, "The Verdict": the inspector tours at 13:00. Doing nothing loses
// (Michael's farewell speech empties the desks). Only an idea about the speech,
// the inspector or his office changes Michael's mind: a whisper about his
// office wins, so do an order to go there and carrying him back by hand, and
// "after the inspector has gone" earns a standing ovation. Holding him up in
// the air for the whole tour loses. The week's leftovers make trouble on the
// tour, and each problem can be dealt with by a word, a hand or a power.
import { describe, expect, it } from 'vitest';
import { VERDICT } from '@/game/story/text';
import { BULLPEN_STAFF, Story, memoryStore, type WeekNotes } from '@/game/story';
import { play, type Played } from './harness';

type FridayState = { speech: string; problems: { id: string; state: string }[]; stops: (number | null)[] };
const score = (g: Played): number | null => (g.day.logic as unknown as { score: number | null }).score;
const state = (g: Played): FridayState => (g.day.logic as unknown as { state: FridayState }).state;
const problem = (g: Played, id: string): string | undefined => state(g).problems.find((p) => p.id === id)?.state;

/** Friday, with whatever the week left behind. */
function friday(seed: number, notes: Partial<WeekNotes> = {}): Played {
  const story = Story.create(memoryStore(), seed);
  story.state.chapter = 5;
  Object.assign(story.state.notes, notes);
  return play(story);
}

const OFFICE = 'My farewell speech can wait. I should wait in my office for the inspector.';

describe('Friday: The Verdict', () => {
  it('the bullpen staff are the ten with desks on the sales floor', () => {
    expect([...BULLPEN_STAFF].sort()).toEqual(['andy', 'creed', 'dwight', 'jim', 'kelly', 'meredith', 'pam', 'phyllis', 'ryan', 'stanley']);
  });

  it('sets the day up: Michael set on his speech, the cake out, the Inspection power locked, Dwight up to something', async () => {
    const g = friday(60);
    expect(g.sim.person('michael')!.conviction?.text).toBe(VERDICT.conviction);
    expect(g.day.refusal('inspector')).toBe(VERDICT.locked);
    expect(g.sim.effect('story-farewell-cake')).toBeTruthy();
    expect(g.day.def.extras.every((x) => x.atFive === 'lost')).toBe(true);
    expect(state(g).problems.map((p) => p.id)).toEqual(['dwight']);
    await g.toClock(12, 35);
    expect(problem(g, 'dwight')).toBe('live');
    expect(g.sim.person('dwight')!.conviction?.text).toBe(VERDICT.problems.dwight.conviction);
    expect(g.feed).toContain(VERDICT.problems.dwight.start);
  });

  it('doing nothing loses: the speech empties the desks, and every stop says its score', async () => {
    const g = friday(61);
    await g.toClock(12, 50);
    expect(g.day.goalUi().status).toBe(VERDICT.before);
    await g.toClock(13, 3);
    expect(g.sim.person('visitor:inspector')?.present).toBe(true);
    expect(g.feed).toContain(VERDICT.arrives);
    expect(g.feed.some((l) => l.includes('walks in unannounced'))).toBe(false);
    await g.toClock(14);
    expect(g.feed).toContain(VERDICT.speech);
    expect(g.day.main).toBe('lost');
    expect(score(g)).toBeLessThan(60);
    expect(g.feed.some((l) => l.startsWith('Bullpen: '))).toBe(true);
    expect(g.feed.some((l) => l.startsWith('Accounting corner: '))).toBe(true);
    expect(g.feed).toContain(VERDICT.michael(false));
    expect(problem(g, 'dwight')).toBe('failed');
    expect(g.day.lines[0]).toBe(VERDICT.failed(score(g)!));
    expect(g.day.lines[1]).toMatch(/^Bullpen: \d+ of 10 at their desks/);
    expect(g.story.state.notes.inspection).toBe(score(g));
    expect(g.story.state.notes.speech).toBe('during');
  });

  it('a whisper that is not about the speech does not stop it, and the game says so', async () => {
    const g = friday(62);
    await g.toClock(9, 30);
    expect(g.whisper('michael', 'I really fancy a pretzel.')).toBeNull();
    expect(g.feed).toContain(VERDICT.stillSpeech);
    await g.step(2);
    expect(g.sim.person('michael')!.conviction?.text).toBe(VERDICT.conviction);
    await g.toClock(14);
    expect(g.feed).toContain(VERDICT.speech);
    expect(g.day.main).toBe('lost');
  });

  for (const seed of [61, 62, 63, 64]) {
    it(`wins with a whisper about the speech and his office (seed ${seed})`, async () => {
      const g = friday(seed);
      await g.toClock(9, 30);
      expect(g.whisper('michael', OFFICE)).toBeNull();
      expect(g.feed).toContain(VERDICT.talkedOut);
      await g.toClock(14);
      expect(g.feed).not.toContain(VERDICT.speech);
      expect(g.day.main).toBe('won');
      expect(state(g).stops[2]).toBe(1);
      expect(score(g)).toBeGreaterThanOrEqual(60);
    });
  }

  it('wins by telling Michael to go and wait in his office', async () => {
    const g = friday(65);
    await g.toClock(12, 50);
    expect(g.cue('michael', 'go and wait in your office for the inspector')).toBeNull();
    expect(g.sim.person('michael')!.conviction?.text).toBe(VERDICT.officeConviction);
    await g.toClock(14);
    expect(g.day.main).toBe('won');
  });

  it('wins by hand: keep carrying Michael back to his office during the tour', async () => {
    const g = friday(63);
    await g.toClock(12, 56);
    while (g.day.main === 'open' && g.sim.clock < 14 * 60) {
      if (g.sim.person('michael')!.room !== 'boss' && g.sim.holding === null) await g.drop('michael', 'spot.boss3');
      await g.step(0.5);
    }
    expect(g.feed).not.toContain(VERDICT.speech);
    expect(g.day.main).toBe('won');
    expect(g.day.influence.left).toBe(g.day.influence.max);
  });

  it('holding Michael up in the air for the whole tour loses', async () => {
    const g = friday(64);
    await g.toClock(12, 59);
    g.sim.pickUp('michael');
    while (g.sim.clock < 14 * 60 && g.day.main === 'open') {
      const m = g.sim.person('michael');
      if (g.sim.holding === null) g.sim.pickUp('michael');
      if (m) g.sim.dragTo(m.x, m.y);
      await g.step(0.5);
    }
    if (g.sim.holding) g.sim.drop(0, 0);
    expect(g.feed).toContain(VERDICT.dangling);
    expect(g.day.main).toBe('lost');
  });

  it('"after the inspector has gone": the speech comes after the tour, with a standing ovation', async () => {
    const g = friday(66);
    await g.toClock(9, 30);
    g.whisper('michael', 'My farewell speech can wait until the inspector has gone.');
    expect(g.feed).toContain(VERDICT.postponed);
    await g.until(() => g.day.main !== 'open', 400);
    expect(g.day.main).toBe('won');
    // The day is not done until the speech has happened.
    expect(g.day.settled).toBe(false);
    await g.until(() => g.day.extraState('ovation') !== 'open', 120);
    expect(g.feed).toContain(VERDICT.speechAfter);
    expect(g.day.extraState('ovation')).toBe('won');
    expect(g.story.state.notes.speech).toBe('after');
  });

  it("Dwight's security check: a whisper or a hand stops it; ignored, it costs 15", async () => {
    const talked = friday(67);
    await talked.toClock(9, 30);
    talked.whisper('michael', OFFICE);
    await talked.toClock(12, 35);
    talked.whisper('dwight', 'Security can wait. I should be at my desk.');
    expect(problem(talked, 'dwight')).toBe('fixed');
    expect(talked.feed).toContain(VERDICT.problems.dwight.fixed.talk);
    await talked.toClock(14);
    const carried = friday(67);
    await carried.toClock(9, 30);
    carried.whisper('michael', OFFICE);
    await carried.toClock(12, 40);
    await carried.drop('dwight', 'spot.kitchen2');
    expect(problem(carried, 'dwight')).toBe('fixed');
    const ignored = friday(67);
    await ignored.toClock(9, 30);
    ignored.whisper('michael', OFFICE);
    await ignored.toClock(14);
    expect(problem(ignored, 'dwight')).toBe('failed');
    expect(score(talked)! - score(ignored)!).toBeGreaterThanOrEqual(10);
    expect(ignored.day.lines.join(' ')).toContain(VERDICT.problems.dwight.failed);
  });

  it('a bad week makes trouble: the row, the leak\'s last page and a sulk; fixing everything is a spotless tour', async () => {
    const bad: Partial<WeekNotes> = { accounts: false, leakFound: false, leak: 'kelly', wronged: ['pam'] };
    const g = friday(68, bad);
    expect(state(g).problems.map((p) => p.id).sort()).toEqual(['dwight', 'leak', 'row', 'sulk']);
    expect(g.story.ui(null).recap).toBe(`${VERDICT.recap.escaped('Kelly')} ${VERDICT.recap.wronged('Pam')}`);
    await g.toClock(9, 20);
    expect(problem(g, 'sulk')).toBe('live');
    g.whisper('pam', 'Nobody really blames me. I should get back to my desk.');
    expect(problem(g, 'sulk')).toBe('fixed');
    g.whisper('michael', OFFICE);
    await g.toClock(12, 50);
    for (const id of ['row', 'leak', 'dwight']) expect(problem(g, id)).toBe('live');
    g.whisper('dwight', 'Security can wait.');
    g.whisper('angela', 'Oscar is right about the figures.');
    g.whisper('kelly', 'No more faxes. Ever.');
    await g.toClock(14);
    expect(g.day.main).toBe('won');
    expect(score(g)).toBeGreaterThanOrEqual(90);
    expect(g.day.extraState('spotless')).toBe('won');
    expect(g.story.state.notes.tour).toEqual({ of: 4, fixed: 4 });
    // The same bad week with only Michael dealt with fails.
    const lazy = friday(68, bad);
    await lazy.toClock(9, 30);
    lazy.whisper('michael', OFFICE);
    await lazy.toClock(14);
    expect(lazy.day.main).toBe('lost');
  });

  it('a good week helps: a caught leak\'s apology and Figgis\'s note add points, and the card says so', async () => {
    const good: Partial<WeekNotes> = { accounts: true, leakFound: true, leak: 'ryan', figgis: true };
    const g = friday(69, good);
    expect(state(g).problems.map((p) => p.id)).toEqual(['dwight']);
    expect(g.story.ui(null).recap).toBe(`${VERDICT.recap.caught('Ryan')} ${VERDICT.recap.calm}`);
    const plain = friday(69);
    for (const x of [g, plain]) {
      await x.toClock(9, 30);
      x.whisper('michael', OFFICE);
      await x.toClock(14);
    }
    expect(g.feed).toContain(VERDICT.apology('Ryan'));
    expect(g.feed).toContain(VERDICT.figgisNote);
    expect(score(g)! - score(plain)!).toBe(15);
  });

  it('an announcement to get back to work during the tour pulls the speech crowd back to their desks', async () => {
    const listening = (x: Played): number => x.sim.people().filter((p) => p.isCast && (p.doing === VERDICT.listening || p.doing === VERDICT.goingToListen)).length;
    const runs: number[] = [];
    for (const announce of [false, true]) {
      const g = friday(70);
      await g.toClock(13, 0);
      await g.until(() => g.feed.includes(VERDICT.speech), 60);
      if (announce) {
        expect(g.announce('Everyone back to your desks, the inspector is here!')).toBeNull();
        expect(g.feed).toContain(VERDICT.recall);
      }
      await g.step(10);
      runs.push(listening(g));
    }
    expect(runs[1]).toBeLessThan(runs[0]);
  });
});
