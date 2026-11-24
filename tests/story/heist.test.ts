// Episode 3, "Inside Job": real sim days with the written (instinct) brain. People are placed
// by hand (picked up and dropped) so each test is about a designed rule, not a lucky seed.
import { describe, expect, it } from 'vitest';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import { Bus, type GameEvents } from '@/game/core/bus';
import { BANK } from '@/game/core/content';
import type { CastId, ChaosId, ChaosTarget, CharId, Tile } from '@/game/core/types';
import { TILE, anchor, feetOf, setWorldLocation } from '@/game/core/world';
import { Director } from '@/game/director/director';
import { createSim, type Sim } from '@/game/sim';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { createRng } from '@/game/sim/rng';
import {
  EPISODES, HEIST_EPISODE, HeistFinaleScene, HeistIntroScene, Story, VANE, episodeById, heistEndingFor, memoryStore,
  type StoryDay, type StoryStore, type WeekNotes,
} from '@/game/story';
import { ABSENCES, CASE_SIDE, CASE_TILE, COMBO_OPENINGS, QUESTIONINGS, WAIT_TILE, wouldTalk } from '@/game/story/heistChapters';
import { COMBO, HEIST_ENDING_RULE, HEIST_INTRO, SCREENING, SWITCH, heistEndingText, heistEpilogueLines } from '@/game/story/heistText';
import { WORLD } from './harness';

const DT = 0.1;
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

interface Heist {
  story: Story;
  store: StoryStore;
  sim: Sim;
  day: StoryDay;
  feed: string[];
  goals: { title: string; state: string; main: boolean }[];
  step(seconds: number): Promise<void>;
  until(pred: () => boolean, max: number): Promise<boolean>;
  toClock(h: number, m?: number): Promise<void>;
  /** Pick someone up and set them down on a tile (or a world point). */
  drop(who: CharId, at: Tile | { x: number; y: number; px: true }): Promise<boolean>;
  whisper(who: CharId, text: string): string | null;
  power(id: ChaosId, target?: ChaosTarget): string | null;
  /** The chapter's own state, for tests. */
  logic<T>(): T;
}

/** An Episode 3 day the way the game builds it, with the notes the days before left. */
function playHeist(chapter: number, notes: Partial<WeekNotes> = {}, seed = Number(process.env.HEIST_SEED ?? 31)): Heist {
  setWorldLocation('office');
  const store = memoryStore();
  const story = Story.create(store, seed, 'heist');
  story.state.chapter = chapter;
  story.state.introSeen = true;
  Object.assign(story.state.notes, notes);
  story.state.notesAtStart = JSON.parse(JSON.stringify(story.state.notes)) as WeekNotes;
  story.save();
  const bus = new Bus<GameEvents>();
  const brain = new InstinctBrain(BANK as LooseBank, WORLD, createRng(story.simSeed() + 5));
  const sim = createSim({ bus, reflexes: brain, seed: story.simSeed(), dayMinutes: 10, sandbox: false, now: () => 0 });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  sim.beginDay(story.simDay());
  story.recordStart(sim.serialize());
  const feed: string[] = [];
  const goals: Heist['goals'] = [];
  bus.on('feed', (f) => feed.push(f.text));
  let director: Director | null = null;
  const day = story.beginDay(sim, {
    onGoal: (g) => goals.push({ title: g.title, state: g.state, main: g.main }),
    script: (lines, o) => (director ? director.playScript(lines, o) : o.done?.()),
  });
  director = new Director({
    sim, brain, instinct: brain, pinned: (w) => day.pinned(w), summonStay: (r) => day.summonStay(r),
    storyTopics: () => day.topics(), vetoShift: (w, a, d) => day.vetoShift(w, a, d),
  });
  const dir: Director = director;
  dir.reset();
  let ticks = 0;
  const tick = async (): Promise<void> => {
    sim.update(DT);
    dir.update(DT);
    day.update(DT);
    if (++ticks % 5 === 0) await flush();
  };
  const h: Heist = {
    story, store, sim, day, feed, goals,
    async step(seconds) {
      for (let t = 0; t < seconds - 1e-9; t += DT) await tick();
    },
    async until(pred, max) {
      for (let t = 0; t < max; t += DT) {
        if (pred()) return true;
        await tick();
      }
      return pred();
    },
    async toClock(hh, m = 0) {
      await h.until(() => sim.clock >= hh * 60 + m, 3000);
    },
    async drop(who, at) {
      if (!sim.pickUp(who)) return false;
      const pt = 'px' in at ? at : feetOf(at);
      sim.dragTo(pt.x, pt.y - 8);
      await h.step(0.4);
      sim.drop(0, 0);
      await h.step(0.6);
      return true;
    },
    whisper(who, text) {
      return day.attempt('whisper', () => {
        dir.whisper(who, text);
        return null;
      }) ?? (day.note({ kind: 'whisper', who, text }), null);
    },
    power(id, target = {}) {
      return day.attempt(id, () => sim.startChaos(id, target)) ?? (day.note({ kind: 'power', id, target }), null);
    },
    logic<T>() {
      return day.logic as unknown as T;
    },
  };
  return h;
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const tileNear = (id: string, dx: number, dy: number): Tile => {
  const t = anchor(id).tile;
  return { x: t.x + dx, y: t.y + dy };
};
/** Far corners of the bullpen to carry people off to. */
const AWAY: Tile[] = [{ x: 3, y: 19 }, { x: 8, y: 20 }, { x: 12, y: 19 }, { x: 19, y: 20 }, { x: 22, y: 19 }, { x: 4, y: 14 }];

/** Carry everyone (but `keep`) within `r` tiles of a point off to the far bullpen. */
async function clearAround(h: Heist, at: { x: number; y: number }, r: number, keep: CharId[] = []): Promise<void> {
  let i = 0;
  for (const p of h.sim.people()) {
    if (!p.isCast || !p.present || keep.includes(p.id)) continue;
    if (near(p, at) <= r * TILE) await h.drop(p.id, AWAY[i++ % AWAY.length]);
  }
}

type Combo = { numbers: { known: number; digits: number[]; seen: CharId[]; strikes: number; next: number; phase: string; arrived: boolean } };
type Switch = { state: { holder: CharId | null; progress: number; nearMisses: number; away: boolean; trip: string | null; caseWithHer: boolean; need: number; switched: boolean } };
type Screening = { state: { questioned: CharId[]; cracks: number; wanted: CharId | null; phase: string; next: number; holder: CharId | null; switched: boolean; progress: number } };

/** Wait until Ms Vane sets off for opening `i` (0-based), then put `watchers` beside where she will stop and clear the rest. */
async function setUpOpening(h: Heist, i: number, watchers: CharId[]): Promise<void> {
  const c = (): Combo['numbers'] => h.logic<Combo>().numbers;
  // She has got there and waits a few clock minutes before opening it: time to place people beside her.
  await h.until(() => c().next === i && c().phase === 'going' && c().arrived, 2000);
  const v = h.sim.person(VANE)!;
  const offs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let k = 0; k < watchers.length; k++) {
    const [dx, dy] = offs[k];
    await h.drop(watchers[k], { x: v.x + dx * TILE, y: v.y + dy * TILE, px: true });
  }
  // Passers-by drift in and out: until she opens it, anyone else who comes close is moved off at once.
  let i2 = 0;
  await h.until(() => {
    for (const p of h.sim.people()) {
      if (!p.isCast || !p.present || watchers.includes(p.id) || h.sim.holding === p.id) continue;
      if (near(p, h.sim.person(VANE)!) <= 4 * TILE) h.sim.teleport(p.id, AWAY[i2++ % AWAY.length]);
    }
    return c().phase !== 'going';
  }, 120);
}

async function finishOpening(h: Heist, i: number): Promise<void> {
  await h.until(() => h.logic<Combo>().numbers.next > i, 600);
}

describe('Episode 3: the episode', () => {
  it('is listed third, with its own saves, intro and labels', () => {
    expect(EPISODES.map((e) => e.id)).toEqual(['office', 'park', 'heist']);
    const ep = episodeById('heist');
    expect(ep).toBe(HEIST_EPISODE);
    expect(ep.number).toBe(3);
    expect(ep.title).toBe('Inside Job');
    expect(ep.subtitle).toBe('The Wrong Tape');
    expect(ep.unitLabel).toBe('Day');
    expect(ep.standingLabel).toBe('Cover');
    expect(ep.standingStart).toBe(40);
    expect(ep.location).toBe('office');
    expect(ep.hasIntro).toBe(true);
    expect(ep.stateKey).toBe('story.heist.state.v1');
    expect(ep.worldKey).toBe('story.heist.world.v1');
    expect(ep.band).toBe('var(--cth-coral)');
    expect(ep.blurb).toBe('A caper in three days, Wednesday to Friday');
    expect(ep.spanLabel).toBe('The job');
    expect(ep.endHead).toBe('FRIDAY, 14:00');
    expect(ep.endSub).toBe('The screening is over');
    expect(ep.endNextLabel).toBe('See how the job ended');
    expect(ep.chapters.map((c) => c.weekday)).toEqual(['Wednesday', 'Thursday', 'Friday']);
    expect(ep.endingRule).toBe(HEIST_ENDING_RULE);
  });

  it('saves and loads apart from the other episodes, and peekAll lists three', () => {
    const store = memoryStore();
    const s = Story.create(store, 5, 'heist');
    expect(s.needsIntro()).toBe(true);
    expect(s.simDay()).toBe(3);
    s.state.notes.heistDigits = 2;
    s.state.notes.heistCode = false;
    s.state.notes.heistSwitched = 'thursday';
    s.state.notes.heistCloseCalls = 1;
    s.state.notes.heistShredded = true;
    s.state.notes.heistCracks = 1;
    s.state.chapter = 2;
    s.markIntroSeen();
    s.save();
    const back = Story.load(store, 'heist')!;
    expect(back.needsIntro()).toBe(false);
    expect(back.chapter).toBe(2);
    expect(back.simDay()).toBe(4);
    expect(back.state.notes).toMatchObject({ heistDigits: 2, heistCode: false, heistSwitched: 'thursday', heistCloseCalls: 1, heistShredded: true, heistCracks: 1 });
    const all = Story.peekAll(store);
    expect(Object.keys(all).sort()).toEqual(['heist', 'office', 'park']);
    expect(all.heist).toMatchObject({ chapter: 2, chapters: 3, title: 'The Switch', weekday: 'Thursday', standing: 40 });
    expect(all.office).toBeNull();
    expect(Story.load(store, 'office')).toBeNull();
    Story.clear(store, 'heist');
    expect(Story.load(store, 'heist')).toBeNull();
  });

  it('decides the ending by what happened first, then by Cover', () => {
    // Friday lost and never switched: caught, whatever the Cover.
    expect(heistEndingFor(90, false, { leak: 'jim' })).toBe('closed');
    expect(heistEndingFor(90, false)).toBe('closed');
    // Friday lost but switched (too many talked): Cover decides.
    expect(heistEndingFor(39, false, { leak: 'jim', heistSwitched: 'thursday' })).toBe('closed');
    expect(heistEndingFor(40, false, { leak: 'jim', heistSwitched: 'friday' })).toBe('scraped');
    expect(heistEndingFor(80, false, { leak: 'jim', heistSwitched: 'thursday' })).toBe('scraped');
    // Friday won: 60 or more is a clean getaway.
    expect(heistEndingFor(60, true, { leak: 'jim', heistSwitched: 'thursday' })).toBe('saved');
    expect(heistEndingFor(59, true, { leak: 'jim', heistSwitched: 'thursday' })).toBe('scraped');
    expect(heistEndingFor(20, true, { leak: 'jim', heistSwitched: 'friday' })).toBe('scraped');
  });

  it('builds ending text and epilogue that never contradict the notes', () => {
    const cases: [boolean, number, WeekNotes][] = [
      [true, 64, { leak: 'jim', heistCode: true, heistDigits: 3, heistSwitched: 'thursday', heistCloseCalls: 0, heistShredded: true, heistCracks: 0 }],
      [true, 50, { leak: 'jim', heistCode: false, heistDigits: 2, heistSwitched: 'friday', heistCloseCalls: 1, heistShredded: false, heistCracks: 1 }],
      [false, 30, { leak: 'jim', heistCode: false, heistDigits: 1, heistCloseCalls: 2, heistCracks: 0 }],
      [false, 32, { leak: 'jim', heistCode: true, heistDigits: 3, heistSwitched: 'thursday', heistCracks: 3 }],
      [false, 48, { leak: 'jim', heistCode: true, heistDigits: 3, heistSwitched: 'thursday', heistCracks: 2 }],
    ];
    for (const [won, standing, n] of cases) {
      const e = HEIST_EPISODE.buildEnding(standing, won, n);
      const all = [e.title, ...e.text, ...e.epilogue].join(' ');
      if (n.heistSwitched === 'thursday') expect(all).toContain('switched the tapes on Thursday');
      if (n.heistSwitched === 'friday') expect(all).toContain('switched the tapes on Friday');
      if (!n.heistSwitched) {
        expect(all).toContain('never managed to switch');
        expect(all).not.toContain('right tape played');
        expect(e.title).toBe('CAUGHT ON TAPE');
      } else {
        expect(all).not.toContain('never managed');
      }
      if (n.heistCode) expect(all).toContain('cracked the lock');
      else expect(all).toContain(`learned ${n.heistDigits} of the lock's 3 numbers`);
      if (n.heistShredded) expect(all).toContain('shredder');
      if (n.heistSwitched && !n.heistShredded) expect(all).toContain('desk drawer');
      if ((n.heistCracks ?? 0) === 0) expect(all).not.toMatch(/people talked|One person talked/);
      if ((n.heistCracks ?? 0) >= 2) expect(all).toContain(`${['', '', 'Two', 'Three'][n.heistCracks!]} people talked`);
      if (n.heistCloseCalls === 1) expect(all).toContain('nearly caught the switch once');
      if (!n.heistCloseCalls) expect(all).not.toContain('nearly caught');
      expect(e.id).toBe(heistEndingFor(standing, won, n));
      if (e.id === 'saved') expect(e.title).toBe('CLEAN GETAWAY');
      if (e.id === 'scraped') expect(e.title).toBe('A NEAR THING');
      if (e.id === 'closed' && n.heistSwitched) expect(e.title).toBe('THE WHOLE STORY');
      expect(heistEndingText(e.id, n).title).toBe(e.title);
      expect(heistEpilogueLines(e.id, n).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('has facts that follow the notes', () => {
    const f = (n: Partial<WeekNotes>, ch: number) => Object.fromEntries(HEIST_EPISODE.weekFacts({ leak: 'jim', ...n }, ch));
    expect(f({}, 1)['heist.tape']).toContain('wrong tape');
    expect(f({}, 1)['heist.digits']).toBeUndefined();
    expect(f({ heistCode: true, heistDigits: 3 }, 2)['heist.digits']).toContain('all three');
    expect(f({ heistCode: false, heistDigits: 1 }, 2)['heist.digits']).toContain('only 1');
    expect(f({ heistSwitched: 'thursday' }, 3)['heist.switched']).toContain('switched');
    expect(f({}, 3)['heist.switched']).toContain('not been switched');
    expect(f({ heistSwitched: 'thursday', heistShredded: true }, 3)['heist.shredded']).toContain('shredder');
  });
});

describe('Episode 3, Wednesday: the combination', () => {
  it('a lone watcher sees a number; a crowd sees nothing; Michael neither sees nor blocks', async () => {
    const h = playHeist(1);
    const c = (): Combo['numbers'] => h.logic<Combo>().numbers;
    // 10:15, the break room: two people beside her. She turns her back.
    await setUpOpening(h, 0, ['jim', 'pam']);
    await finishOpening(h, 0);
    expect(c().known).toBe(0);
    expect(h.feed.some((t) => t.startsWith('Too many people around Ms Vane'))).toBe(true);
    expect(h.day.extraState('unseen')).toBe('open');
    // 11:45, the conference room: Jim alone (and Michael, who does not count).
    await setUpOpening(h, 1, ['jim', 'michael']);
    await finishOpening(h, 1);
    expect(c().known).toBe(1);
    expect(c().seen).toEqual(['jim']);
    expect(c().seen).not.toContain('michael');
    expect(h.feed.some((t) => t.startsWith(`Jim saw a number over Ms Vane's shoulder: ${c().digits[0]}.`))).toBe(true);
    expect(h.day.goalUi().status).toContain('Numbers known: 1 of 3');
    expect(h.day.goalUi().status).toContain('13:30');
  }, 120000);

  it('the same watcher twice is caught hovering (a strike), and two numbers are not enough', async () => {
    const h = playHeist(1);
    const c = (): Combo['numbers'] => h.logic<Combo>().numbers;
    await setUpOpening(h, 0, ['dwight']);
    await finishOpening(h, 0);
    expect(c().known).toBe(1);
    await setUpOpening(h, 1, ['dwight']);
    await finishOpening(h, 1);
    expect(c().known).toBe(1);
    expect(c().strikes).toBe(1);
    expect(h.day.extraState('unseen')).toBe('lost');
    expect(h.feed.some((t) => t.includes('noticed Dwight hovering again'))).toBe(true);
    await setUpOpening(h, 2, ['oscar']);
    await finishOpening(h, 2);
    expect(c().known).toBe(2);
    // The last opening: a crowd. Two numbers lose, and the loss says how many.
    await setUpOpening(h, 3, ['angela', 'stanley']);
    await finishOpening(h, 3);
    expect(h.day.main).toBe('lost');
    expect(h.day.lines.join(' ')).toContain('learned 2 of the 3 numbers');
    expect(h.story.state.notes.heistDigits).toBe(2);
    expect(h.story.state.notes.heistCode).toBe(false);
  }, 180000);

  it('three numbers from three different people win', async () => {
    const h = playHeist(1);
    for (const [i, who] of [[0, 'jim'], [1, 'pam'], [2, 'oscar']] as [number, CastId][]) {
      await setUpOpening(h, i, [who]);
      await finishOpening(h, i);
    }
    expect(h.day.main).toBe('won');
    expect(h.story.state.notes.heistCode).toBe(true);
    expect(h.story.state.notes.heistDigits).toBe(3);
    expect(h.day.extraState('unseen')).toBe('won');
    expect(h.day.settled).toBe(true);
  }, 180000);

  it('Truth Serum on Ms Vane: she reads the next number out loud, whatever the crowd', async () => {
    const h = playHeist(1);
    const c = (): Combo['numbers'] => h.logic<Combo>().numbers;
    await h.toClock(9, 40);
    expect(h.power('truth', { who: VANE })).toBeNull();
    await setUpOpening(h, 0, ['jim', 'pam']);
    await finishOpening(h, 0);
    expect(c().known).toBe(1);
    expect(h.feed.some((t) => t.startsWith('Ms Vane reads the lock out loud'))).toBe(true);
  }, 120000);

  it('skip ahead stops a few minutes before each opening', async () => {
    const h = playHeist(1);
    await h.toClock(9, 20);
    expect(h.day.nextBeat()).toBe(COMBO_OPENINGS[0].at - 14);
    expect(h.day.marksUi()).toEqual([{ id: VANE, label: 'has the case' }]);
    expect(COMBO.goal.detail).toContain('10:15');
  }, 60000);
});

describe('Episode 3, Thursday: the switch', () => {
  const sw = (h: Heist): Switch['state'] => h.logic<Switch>().state;
  const vane = (h: Heist) => h.sim.person(VANE)!;
  /** Hand the tape to `who` by dropping them beside Michael. */
  async function handTo(h: Heist, who: CastId): Promise<void> {
    await giveTape(h, who, () => sw(h).holder);
  }
  /** Run until the day's job is settled, carrying anyone but the holder back out of the conference room. */
  async function keepRoomClear(h: Heist, max: number): Promise<boolean> {
    let k = 0;
    return h.until(() => {
      if (h.sim.time % 0.5 < 0.1) {
        for (const p of h.sim.peopleIn('meeting')) {
          if (p.isCast && p.id !== sw(h).holder && p.present && h.sim.holding !== p.id) h.sim.teleport(p.id, AWAY[k++ % AWAY.length]);
        }
      }
      return h.day.main !== 'open';
    }, max);
  }
  /** Wait until she is out of the conference room on trip `i`, then drop the holder beside the case. */
  async function inWhenSheLeaves(h: Heist, i: number): Promise<void> {
    await h.toClock(Math.floor(ABSENCES[i].at / 60), ABSENCES[i].at % 60);
    await h.until(() => vane(h).room !== 'meeting', 30);
    await clearAround(h, feetOf(CASE_TILE), 6, [sw(h).holder as CharId]);
    await h.drop(sw(h).holder!, CASE_SIDE);
  }

  it('the tape passes by a drop beside the holder, and by a whisper that mentions it', async () => {
    const h = playHeist(2, { heistCode: true, heistDigits: 3 });
    await h.toClock(9, 20);
    expect(sw(h).holder).toBe('michael');
    expect(h.day.marksUi()).toEqual(expect.arrayContaining([{ id: VANE, label: 'guarding the case' }, { id: 'michael', label: 'has the right tape' }]));
    await handTo(h, 'dwight');
    expect(sw(h).holder).toBe('dwight');
    expect(h.feed).toContain('Michael hands the right tape to Dwight.');
    // A whisper that only mentions the tape sends nobody for it; one that asks them to take it does.
    expect(h.whisper('kevin', 'Stay calm. You know nothing about a tape.')).toBeNull();
    expect(h.whisper('jim', 'Take the tape from Dwight and keep it safe.')).toBeNull();
    expect(await h.until(() => sw(h).holder === 'jim', 90)).toBe(true);
    expect(h.feed).toContain('Dwight hands the right tape to Jim.');
    expect(h.feed.some((t) => t.startsWith('Kevin goes to get the tape'))).toBe(false);
    // Told to wait by the conference room, whoever has the tape goes and waits outside its door.
    expect(h.whisper('jim', 'Wait outside the conference room until Ms Vane leaves.')).toBeNull();
    const door = feetOf(WAIT_TILE);
    expect(await h.until(() => near(h.sim.person('jim')!, door) <= TILE, 60)).toBe(true);
    await h.step(20);
    expect(near(h.sim.person('jim')!, door)).toBeLessThanOrEqual(TILE);
  }, 120000);

  it('the plain plan wins with the code: a steady person waits by the door and walks in when she leaves', async () => {
    const h = playHeist(2, { heistCode: true, heistDigits: 3 });
    await h.toClock(9, 30);
    await handTo(h, 'jim');
    await h.drop('jim', WAIT_TILE);
    expect(sw(h).need).toBe(10);
    await inWhenSheLeaves(h, 0);
    const settled = await keepRoomClear(h, 40);
    expect(settled).toBe(true);
    expect(h.day.main).toBe('won');
    expect(h.story.state.notes.heistSwitched).toBe('thursday');
    expect(sw(h).nearMisses).toBe(0);
    expect(h.day.marksUi()).toEqual(expect.arrayContaining([{ id: 'jim', label: 'has the wrong tape' }]));
    // Extra: the wrong tape to the shredder in the annex.
    expect(h.day.extraState('shred')).toBe('open');
    await h.drop('jim', { x: 21, y: 9 });
    expect(await h.until(() => h.day.extraState('shred') === 'won', 10)).toBe(true);
    expect(h.story.state.notes.heistShredded).toBe(true);
  }, 120000);

  it('without the code one absence is not enough; she walks in on it (a near miss) and progress resets', async () => {
    const h = playHeist(2, { heistCode: false, heistDigits: 1 });
    await h.toClock(9, 30);
    await handTo(h, 'jim');
    expect(sw(h).need).toBe(26);
    await inWhenSheLeaves(h, 0);
    await h.until(() => sw(h).nearMisses > 0 || h.day.main !== 'open', 60);
    expect(h.day.main).toBe('open');
    expect(sw(h).switched).toBe(false);
    expect(sw(h).nearMisses).toBe(1);
    expect(sw(h).progress).toBe(0);
    expect(h.story.state.notes.heistCloseCalls).toBe(1);
    expect(h.feed.some((t) => t.includes('That was a near miss'))).toBe(true);
    // A second near miss loses the day: the case goes to her hotel.
    await inWhenSheLeaves(h, 1);
    await h.until(() => h.day.main !== 'open', 60);
    expect(h.day.main).toBe('lost');
    expect(h.day.lines.join(' ')).toContain('hotel');
    expect(h.story.state.notes.heistCloseCalls).toBe(2);
  }, 180000);

  it('someone the player puts by the coffee machine keeps her talking long enough to pick the lock', async () => {
    const h = playHeist(2, { heistCode: false, heistDigits: 2 });
    await h.toClock(9, 30);
    await handTo(h, 'jim');
    await h.drop('jim', WAIT_TILE);
    await h.toClock(10, 22);
    await h.drop('pam', { x: 26, y: 15 });
    await inWhenSheLeaves(h, 0);
    expect(await keepRoomClear(h, 60)).toBe(true);
    expect(h.feed).toContain('Pam keeps Ms Vane talking. She stays a little longer.');
    expect(h.day.main).toBe('won');
  }, 120000);

  it('Nap Attack on the conference room: she sleeps, and the tape holder brought in after it works unseen', async () => {
    const h = playHeist(2, { heistCode: true, heistDigits: 3 });
    await h.toClock(9, 30);
    await handTo(h, 'dwight');
    await h.drop('dwight', WAIT_TILE);
    await clearAround(h, feetOf(CASE_TILE), 6, ['dwight']);
    await h.until(() => vane(h).room === 'meeting' && h.sim.person('dwight')!.room !== 'meeting', 30);
    expect(h.power('sleep', { room: 'meeting' })).toBeNull();
    await h.step(1);
    expect(h.sim.hasStatus(VANE, 'asleep')).toBe(true);
    await h.drop('dwight', CASE_SIDE);
    expect(await h.until(() => h.day.main !== 'open', 20)).toBe(true);
    expect(h.day.main).toBe('won');
  }, 120000);

  it('a fire in the conference room is not a free win: she takes the case out with her', async () => {
    const h = playHeist(2, { heistCode: true, heistDigits: 3 });
    await h.toClock(9, 30);
    expect(h.day.warnsUi().fire).toContain('take the case out');
    await handTo(h, 'jim');
    await h.until(() => vane(h).room === 'meeting', 30);
    expect(h.power('fire', { room: 'meeting' })).toBeNull();
    await h.step(1);
    expect(sw(h).caseWithHer).toBe(true);
    expect(h.feed).toContain('Ms Vane grabs the case and takes it out with her.');
    await h.until(() => vane(h).room !== 'meeting', 20);
    await h.drop('jim', CASE_SIDE);
    expect(sw(h).caseWithHer).toBe(true);
    expect(h.day.goalUi().status).toBe(SWITCH.status.caseOut);
    await h.step(12);
    expect(sw(h).switched).toBe(false);
    // Once it is out, she brings the case back and cables it to the table again.
    await h.until(() => !sw(h).caseWithHer, 200);
    expect(sw(h).caseWithHer).toBe(false);
  }, 120000);

  it('skips ahead to a few minutes before each absence', async () => {
    const h = playHeist(2, { heistCode: true });
    await h.toClock(9, 20);
    expect(h.day.nextBeat()).toBe(ABSENCES[0].at - 8);
  }, 60000);
});

describe('Episode 3, Friday: the screening', () => {
  const st = (h: Heist): Screening['state'] => h.logic<Screening>().state;
  /** Wait for the Log to name whom she wants next. */
  async function nextWanted(h: Heist): Promise<CharId> {
    const n = st(h).next;
    await h.until(() => st(h).next === n && st(h).wanted !== null, 900);
    return st(h).wanted!;
  }
  async function questioned(h: Heist): Promise<void> {
    const n = st(h).next;
    await h.until(() => st(h).next > n, 300);
  }
  /** Make whoever she wants next talk (shaken) or hold (whispered to and in a good mood). */
  async function answer(h: Heist, how: 'talk' | 'hold'): Promise<CharId> {
    const who = await nextWanted(h);
    // A bad mood makes anyone talk; a whisper and a good mood keep anyone quiet.
    if (how === 'talk') h.sim.bumpMood(who, -2);
    else {
      h.whisper(who, 'Stay calm. You know nothing about a tape.');
      h.sim.bumpMood(who, 2);
      h.sim.feel(who, 'happy', 1, 200);
    }
    await questioned(h);
    return who;
  }

  it('whoever talks depends on nerves, mood and a whisper', async () => {
    const h = playHeist(3, { heistSwitched: 'thursday' });
    await h.toClock(9, 20);
    const s = h.sim;
    s.feel('kevin', 'neutral', 1, 30);
    expect(wouldTalk(s, 'kevin', false)).toBe(true);
    expect(wouldTalk(s, 'kevin', true)).toBe(false);
    s.feel('kevin', 'happy', 1, 30);
    expect(wouldTalk(s, 'kevin', false)).toBe(false);
    s.feel('dwight', 'neutral', 1, 30);
    expect(wouldTalk(s, 'dwight', false)).toBe(false);
    s.feel('dwight', 'scared', 1, 30);
    expect(wouldTalk(s, 'dwight', true)).toBe(true);
    s.feel('creed', 'neutral', 1, 30);
    expect(wouldTalk(s, 'creed', false)).toBe(false);
    // A whisper steadies nerves for the day: it covers plain nervousness, but not a fright or sadness.
    s.feel('pam', 'nervous', 1, 60);
    expect(wouldTalk(s, 'pam', false)).toBe(true);
    expect(wouldTalk(s, 'pam', true)).toBe(false);
    s.feel('pam', 'scared', 1, 60);
    expect(wouldTalk(s, 'pam', true)).toBe(true);
  }, 60000);

  it('a low-nerve person she wants talks unless steadied by a whisper', async () => {
    const h = playHeist(3, { heistSwitched: 'thursday' });
    const shaky: CharId[] = [];
    let steadied: CharId | null = null;
    let left: CharId | null = null;
    for (let i = 0; i < 4; i++) {
      const who = await nextWanted(h);
      const low = ['kevin', 'andy', 'kelly', 'ryan', 'toby'].includes(who);
      if (low) shaky.push(who);
      // Only nerves decide here: a calm face and an even mood until she reaches them.
      const plain = low && (!left || !steadied);
      if (low && !left) left = who;
      else if (low && !steadied) {
        steadied = who;
        h.whisper(who, 'Stay calm. You know nothing about a tape.');
      } else {
        h.whisper(who, 'Stay calm.');
        h.sim.bumpMood(who, 2);
        h.sim.feel(who, 'happy', 1, 200);
      }
      const n = st(h).next;
      await h.until(() => {
        if (plain && st(h).phase !== 'asking') {
          h.sim.feel(who, 'neutral', 1, 5);
          h.sim.bumpMood(who, 1);
        }
        return st(h).next > n;
      }, 300);
    }
    expect(shaky.length).toBeGreaterThanOrEqual(2);
    expect(left).not.toBeNull();
    expect(steadied).not.toBeNull();
    // The Log says why: weak nerves, and no whisper.
    expect(h.feed.some((t) => t.startsWith(`${CAST_NAME(left!)} talked: weak nerves`))).toBe(true);
    expect(h.feed).toContain(`${CAST_NAME(steadied!)} kept the story straight.`);
    expect(st(h).cracks).toBe(1);
    expect(h.day.extraState('silent')).toBe('lost');
  }, 240000);

  it('carrying off the one she wants makes her settle for the nearest, so a steady person can stand in', async () => {
    const h = playHeist(3, { heistSwitched: 'thursday' });
    const wanted = await nextWanted(h);
    const steady: CastId = wanted === 'dwight' ? 'stanley' : 'dwight';
    h.sim.bumpMood(wanted, -2);
    await h.drop(wanted, { x: 31, y: 16 });
    await h.until(() => st(h).phase === 'looking', 200);
    const v = h.sim.person(VANE)!;
    await h.drop(steady, { x: v.x + TILE, y: v.y, px: true });
    h.sim.feel(steady, 'determined', 1, 60);
    // Nobody else wanders up beside her meanwhile.
    let k = 0;
    for (const p of h.sim.people()) {
      if (p.isCast && p.present && p.id !== steady && p.id !== wanted && near(p, h.sim.person(VANE)!) < 6 * TILE) h.sim.teleport(p.id, AWAY[k++ % AWAY.length]);
    }
    await questioned(h);
    expect(st(h).questioned).toEqual([steady]);
    expect(st(h).cracks).toBe(0);
    expect(h.feed.some((t) => t.startsWith(`Ms Vane cannot find ${CAST_NAME(wanted)}, so she settles for ${CAST_NAME(steady)}`))).toBe(true);
    expect(h.feed).toContain(`${CAST_NAME(steady)} kept the story straight.`);
  }, 120000);

  it('one person talking still wins; nobody talking also wins the extra', async () => {
    const h = playHeist(3, { heistSwitched: 'thursday', heistCode: true });
    await answer(h, 'talk');
    for (let i = 0; i < 3; i++) await answer(h, 'hold');
    const last = await answer(h, 'hold');
    expect(last).toBe('michael');
    await screened(h);
    expect(h.day.main).toBe('won');
    expect(h.story.state.notes.heistCracks).toBe(1);
    expect(h.day.extraState('silent')).toBe('lost');
    expect(h.day.lines.join(' ')).toContain('One person talked');
    expect(h.day.settled).toBe(true);

    const z = playHeist(3, { heistSwitched: 'thursday', heistCode: true });
    for (let i = 0; i < 5; i++) await answer(z, 'hold');
    await screened(z);
    expect(z.day.main).toBe('won');
    expect(z.day.extraState('silent')).toBe('won');
    expect(z.story.state.notes.heistCracks).toBe(0);
  }, 300000);

  it('two people talking lose, though the right tape played', async () => {
    const h = playHeist(3, { heistSwitched: 'thursday' });
    await answer(h, 'talk');
    await answer(h, 'talk');
    for (let i = 0; i < 3; i++) await answer(h, 'hold');
    await screened(h);
    expect(h.day.main).toBe('lost');
    expect(h.day.lines.join(' ')).toContain('The right tape played, but 2 people talked');
    expect(h.day.goalUi().status).toBe(SCREENING.status.lostTalk);
    expect(h.story.state.notes.heistCracks).toBe(2);
  }, 300000);

  it('never switched: the wrong tape plays at two', async () => {
    const h = playHeist(3, { heistCode: true });
    expect(st(h).holder).toBe('michael');
    await screened(h);
    expect(h.day.main).toBe('lost');
    expect(h.day.lines.join(' ')).toContain('The wrong tape played at two');
    expect(h.story.state.notes.heistSwitched).toBeUndefined();
    expect(await h.until(() => h.feed.some((t) => t.startsWith('Michael, on the tape: "You are fired.')), 40)).toBe(true);
  }, 300000);

  it('last chance: the tapes can be switched while she is out questioning someone', async () => {
    const h = playHeist(3, { heistCode: true, heistDigits: 3 });
    await h.toClock(9, 20);
    await giveTape(h, 'jim', () => st(h).holder);
    expect(st(h).holder).toBe('jim');
    await h.drop('jim', WAIT_TILE);
    // She sets off to question someone; while she is out, Jim goes to the case.
    await h.until(() => st(h).phase === 'looking' && h.sim.person(VANE)!.room !== 'meeting', 600);
    await clearAround(h, feetOf(CASE_TILE), 6, ['jim']);
    await h.drop('jim', CASE_SIDE);
    expect(await h.until(() => st(h).switched, 30)).toBe(true);
    expect(h.story.state.notes.heistSwitched).toBe('friday');
    await screened(h);
    expect(h.day.main === 'won' || (st(h).cracks >= 2 && h.day.main === 'lost')).toBe(true);
    if (st(h).cracks < 2) expect(h.day.lines.join(' ')).toContain('The right tape played at two');
  }, 300000);

  it('warns that Truth Serum and Leak a Secret make someone tell her everything, and counts it', async () => {
    const h = playHeist(3, { heistSwitched: 'thursday' });
    await h.toClock(9, 20);
    expect(h.day.warnsUi().truth).toBe(SCREENING.warn);
    expect(h.day.warnsUi().secretLeak).toBe(SCREENING.warn);
    expect(h.power('secretLeak', { who: 'oscar' })).toBeNull();
    await h.step(1);
    expect(st(h).cracks).toBe(1);
    expect(h.day.extraState('silent')).toBe('lost');
  }, 60000);

  it('names the next questioning ahead, tags who she wants, and skips ahead to just before it', async () => {
    const h = playHeist(3, { heistSwitched: 'thursday' });
    await h.toClock(9, 10);
    expect(h.day.nextBeat()).toBe(QUESTIONINGS[0] - 13);
    const who = await nextWanted(h);
    expect(h.feed).toContain(`At about 09:45 Ms Vane wants a word with ${CAST_NAME(who)}.`);
    // The tag over the person she wants says whether they would talk if asked right now.
    expect(h.day.marksUi()).toEqual(expect.arrayContaining([{ id: who, label: expect.stringMatching(/^wanted: (would talk|steady) now$/) }, { id: VANE, label: `looking for ${CAST_NAME(who)}` }]));
  }, 60000);
});

describe('Episode 3: opening and ending scenes', () => {
  it('the opening plays on the office floor, with Ms Vane walking in, and can be skipped', () => {
    const { sim } = bareSim(3);
    const captions: string[] = [];
    const said: string[] = [];
    const scene = new HeistIntroScene(sim, (c) => captions.push(c), (_w, t) => said.push(t));
    for (let t = 0; t < 30 && !scene.done; t += 0.25) {
      sim.update(0.25);
      scene.update(0.25);
    }
    expect(scene.done).toBe(true);
    expect(captions).toEqual(HEIST_INTRO.beats);
    expect(said).toContain(HEIST_INTRO.lines[0].text);
    expect(said).toContain(HEIST_INTRO.vane.text);
    expect(sim.person(VANE)?.present).toBe(true);
    const again = new HeistIntroScene(bareSim(3).sim);
    again.skip();
    expect(again.done).toBe(true);
  });

  it('each ending scene plays through on the office floor', () => {
    const cases: [ReturnType<typeof heistEndingFor>, Partial<WeekNotes>][] = [
      ['saved', { heistSwitched: 'thursday' }],
      ['scraped', { heistSwitched: 'friday', heistCracks: 1 }],
      ['closed', {}],
      ['closed', { heistSwitched: 'thursday', heistCracks: 3 }],
    ];
    for (const [ending, n] of cases) {
      const { sim, feed } = bareSim(5);
      const scene = new HeistFinaleScene(sim, ending, { leak: 'jim', ...n });
      for (let t = 0; t < 40 && !scene.done; t += 0.25) {
        sim.update(0.25);
        scene.update(0.25);
      }
      expect(scene.done).toBe(true);
      expect(feed.length).toBeGreaterThan(0);
    }
  });
});

/** Run to the screening at two and on until its result is announced (when the tape has played). */
async function screened(h: Heist): Promise<void> {
  await h.toClock(14, 0);
  expect(h.day.main).toBe('open');
  await h.until(() => h.day.main !== 'open', 60);
}

const CAST_NAME = (id: CharId): string => id.charAt(0).toUpperCase() + id.slice(1);

/** Drop `who` right beside whoever has the tape (trying each side, in case one is a wall) until it changes hands. */
async function giveTape(h: Heist, who: CharId, holder: () => CharId | null): Promise<void> {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const from = h.sim.person(holder()!)!;
    await h.drop(who, { x: from.x + dx * TILE, y: from.y + dy * TILE, px: true });
    if (await h.until(() => holder() === who, 4)) return;
  }
}

function bareSim(day: number): { sim: Sim; feed: string[] } {
  setWorldLocation('office');
  const bus = new Bus<GameEvents>();
  const brain = new InstinctBrain(BANK as LooseBank, WORLD, createRng(9));
  const sim = createSim({ bus, reflexes: brain, seed: 9, dayMinutes: 10, sandbox: false, now: () => 0 });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  sim.beginDay(day);
  for (let t = 0; t < 28; t += 0.25) sim.update(0.25);
  const feed: string[] = [];
  bus.on('feed', (f) => feed.push(f.text));
  return { sim, feed };
}

/** Every string in a value, calling text functions with sample arguments. */
function strings(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'function') {
    const samples: unknown[][] = [['Kevin', 2, 3], [2, 'Kevin', 'Andy'], ['10:15', 'Kevin'], [1, 1], [0, 0], [['Kevin', 'Andy'], 1]];
    for (const args of samples) {
      try {
        strings((v as (...a: unknown[]) => unknown)(...args), out, depth + 1);
      } catch {
        /* not every sample fits every function */
      }
    }
  } else if (Array.isArray(v)) for (const x of v) strings(x, out, depth + 1);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out, depth + 1);
  return out;
}

describe('Episode 3: the words', () => {
  const BAD = /[^\x20-\x7E]/;
  it('all copy is plain ASCII: no em dashes, curly quotes, emoji or ellipsis characters', () => {
    const notes: WeekNotes[] = [
      { leak: 'jim' },
      { leak: 'jim', heistCode: true, heistDigits: 3, heistSwitched: 'thursday', heistCloseCalls: 1, heistShredded: true, heistCracks: 1 },
      { leak: 'jim', heistDigits: 1, heistSwitched: 'friday', heistCloseCalls: 2, heistCracks: 3 },
    ];
    const all = strings([COMBO, SWITCH, SCREENING, HEIST_INTRO, HEIST_ENDING_RULE, HEIST_EPISODE.tagline, HEIST_EPISODE.standingNote, HEIST_EPISODE.blurb]);
    for (const d of HEIST_EPISODE.chapters) {
      all.push(d.title, d.weekday, ...d.intro, ...d.hints, ...(d.help ?? []), d.goal.title, d.goal.detail, ...d.change);
      for (const x of d.extras) all.push(x.title, x.detail);
      for (const i of [...(d.suggest?.whisper ?? []), ...(d.suggest?.announce ?? [])]) all.push(typeof i === 'string' ? i : i.text);
      for (const n of notes) {
        const r = d.recap?.(n);
        if (r) all.push(r);
      }
    }
    for (const n of notes) {
      for (const ch of [1, 2, 3]) for (const [, t] of HEIST_EPISODE.weekFacts(n, ch)) all.push(t);
      for (const id of ['saved', 'scraped', 'closed'] as const) {
        const e = heistEndingText(id, n);
        all.push(e.title, ...e.text, ...heistEpilogueLines(id, n));
      }
    }
    expect(all.length).toBeGreaterThan(200);
    expect(all.filter((t) => BAD.test(t) || t.includes('...') || t !== t.trim() || !t.trim())).toEqual([]);
  });

  it('what a played day prints is plain ASCII too', async () => {
    const h = playHeist(2, { heistCode: true, heistDigits: 3 });
    await h.toClock(13, 0);
    const z = playHeist(3, {});
    await screened(z);
    const said = [...h.feed, ...z.feed, h.day.goalUi().status, z.day.goalUi().status];
    expect(said.filter((t) => BAD.test(t))).toEqual([]);
  }, 120000);
});
