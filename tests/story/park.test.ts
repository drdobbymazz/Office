import { afterEach, describe, expect, it } from 'vitest';
import { splitHook } from '@/components/game/screenLogic';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import type { BrainWorld } from '@/game/brain/world';
import { Bus, type GameEvents } from '@/game/core/bus';
import { CAST_LIST, SETTING } from '@/game/core/cast';
import { BANK } from '@/game/core/content';
import type { CastId, CharId } from '@/game/core/types';
import { anchor, feetOf, getWorldLocation, roomsFor, setWorldLocation, walkableTilesIn } from '@/game/core/world';
import { roomCentrePx } from '@/game/core/world';
import { Director } from '@/game/director/director';
import { createSim, type Sim } from '@/game/sim';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { createRng } from '@/game/sim/rng';
import {
  EPISODES,
  PARK_CHAPTER_DEFS,
  ParkFinaleScene,
  ParkIntroScene,
  Story,
  episodeById,
  memoryStore,
} from '@/game/story';
import {
  PARK_CHANGES,
  PARK_ENDING_RULE,
  PARK_EPISODE_META,
  PARK_FINALE,
  PARK_INTRO,
  PARK_RALLY,
  PARK_RANGER,
  PARK_TRUCE,
  parkEndingText,
  parkEpilogueLines,
} from '@/game/story/parkText';
import type { EpisodeId, StoryDay } from '@/game/story';

const DT = 0.1;
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function parkBrainWorld(): BrainWorld {
  return {
    setting: 'Scranton Community Park team-building outing.',
    people: CAST_LIST.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      summary: c.persona.summary,
      speech: c.persona.speech,
      wants: c.persona.wants,
      fears: c.persona.fears,
      quirk: c.persona.quirk,
      secret: c.persona.secret,
      examples: [...c.persona.examples],
      nerve: c.temperament.nerve,
      fixes: [...c.fixes],
    })),
    rooms: roomsFor('park').filter((r) => r.id !== 'outside').map((r) => ({ id: r.id, name: r.name })),
  };
}

function makeSimFor(loc: 'office' | 'park', seed = 17): { sim: Sim; brain: InstinctBrain; bus: Bus<GameEvents> } {
  setWorldLocation(loc);
  const bus = new Bus<GameEvents>();
  const world: BrainWorld = {
    setting: loc === 'office' ? SETTING : parkBrainWorld().setting,
    people: parkBrainWorld().people,
    rooms: roomsFor(loc).filter((r) => r.id !== 'outside').map((r) => ({ id: r.id, name: r.name })),
  };
  const brain = new InstinctBrain(BANK as LooseBank, world, createRng(seed + 5));
  const sim = createSim({ bus, reflexes: brain, seed, dayMinutes: 10, sandbox: false, now: () => 0 });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  return { sim, brain, bus };
}

function playPark(chapter: number, seed = 21): {
  story: Story;
  sim: Sim;
  day: StoryDay;
  director: Director;
  step(seconds: number): Promise<void>;
  until(pred: () => boolean, max: number): Promise<boolean>;
  toClock(h: number, m?: number): Promise<void>;
  place(who: CharId, at: { x: number; y: number } | 'bullpen' | 'kitchen'): Promise<boolean>;
} {
  const store = memoryStore();
  const story = Story.create(store, seed, 'park');
  story.state.chapter = chapter;
  story.state.introSeen = true;
  story.save();
  const { sim, brain } = makeSimFor('park', story.simSeed());
  sim.beginDay(chapter);
  story.recordStart(sim.serialize());
  let dirRef: Director | null = null;
  const day = story.beginDay(sim, {
    script: (lines, o) => (dirRef ? dirRef.playScript(lines, o) : o.done?.()),
  });
  const director = new Director({
    sim,
    brain,
    instinct: brain,
    pinned: (w) => day.pinned(w),
    storyTopics: () => day.topics(),
    vetoShift: (w, a, d) => day.vetoShift(w, a, d),
  });
  dirRef = director;
  director.reset();

  let ticks = 0;
  const step = async (seconds: number): Promise<void> => {
    const n = Math.ceil(seconds / DT);
    for (let i = 0; i < n; i++) {
      sim.update(DT);
      director.update(DT);
      day.update(DT);
      if (++ticks % 5 === 0) await flush();
    }
    await flush();
  };
  const until = async (pred: () => boolean, max: number): Promise<boolean> => {
    const deadline = sim.time + max;
    while (!pred() && sim.time < deadline) await step(DT * 5);
    return pred();
  };
  const toClock = async (h: number, m = 0): Promise<void> => {
    const target = h * 60 + m;
    await until(() => sim.clock >= target, 2400);
  };
  const place = async (who: CharId, at: { x: number; y: number } | 'bullpen' | 'kitchen'): Promise<boolean> => {
    if (!sim.pickUp(who)) return false;
    const pt = typeof at === 'string' ? roomCentrePx(at) : at;
    sim.dragTo(pt.x, pt.y - 8);
    await step(0.6);
    sim.drop(0, 0);
    await step(1.2);
    return true;
  };
  return { story, sim, day, director, step, until, toClock, place };
}

function sideState(day: StoryDay, id: string): string | undefined {
  return day.sideUi().find((x) => x.id === id)?.state;
}

function collectStrings(val: unknown, out: string[] = []): string[] {
  if (typeof val === 'string') {
    out.push(val);
    return out;
  }
  if (Array.isArray(val)) {
    for (const v of val) collectStrings(v, out);
    return out;
  }
  if (val && typeof val === 'object') {
    for (const v of Object.values(val)) collectStrings(v, out);
  }
  return out;
}

afterEach(() => {
  setWorldLocation('office');
});

describe('Episodes & Park saves', () => {
  it('registers Episode 1 (Office) and Episode 2 (Day in the Park) with isolated saves', () => {
    expect(EPISODES.map((e) => e.id)).toEqual(['office', 'park']);
    const ep1 = episodeById('office');
    const ep2 = episodeById('park');
    expect(ep1.chapters.length).toBe(5);
    expect(ep1.unitLabel).toBe('Day');
    expect(ep1.hasIntro).toBe(false);
    expect(ep2.chapters.length).toBe(3);
    expect(ep2.unitLabel).toBe('Act');
    expect(ep2.location).toBe('park');
    expect(ep2.hasIntro).toBe(true);

    const store = memoryStore();
    const park = Story.create(store, 42, 'park');
    expect(park.needsIntro()).toBe(true);
    // Episode 1 peek must stay null when only Park was created.
    expect(Story.peek(store)).toBeNull();
    expect(Story.peekEpisode(store, 'park')).toEqual({
      chapter: 1,
      chapters: 3,
      title: 'Mandatory Fun',
      weekday: 'Morning',
      standing: 40,
    });

    park.markIntroSeen();
    const reloaded = Story.load(store, 'park');
    expect(reloaded?.needsIntro()).toBe(false);

    const office = Story.create(store, 7, 'office');
    expect(office.needsIntro()).toBe(false);
    expect(Story.peek(store)).toEqual({
      chapter: 1,
      chapters: 5,
      title: 'The Memo',
      weekday: 'Monday',
      standing: 40,
    });
    const both = Story.peekAll(store);
    expect(both.office?.chapters).toBe(5);
    expect(both.park?.chapters).toBe(3);

    Story.clear(store, 'park');
    expect(Story.load(store, 'park')).toBeNull();
    expect(Story.load(store, 'office')).not.toBeNull();
  });

  it('preserves Park notes across reload even when notes originated without leak', () => {
    const store = memoryStore();
    const park = Story.create(store, 99, 'park');
    park.state.notes.parkRally = true;
    park.state.notes.parkGrill = true;
    park.save();
    const reloaded = Story.load(store, 'park');
    expect(reloaded?.state.notes.parkRally).toBe(true);
    expect(reloaded?.state.notes.parkGrill).toBe(true);
  });
});

describe('ParkIntroScene', () => {
  it('bridges from Office to Park and supports skip()', () => {
    const { sim } = makeSimFor('office', 12);
    sim.beginDay(1);
    for (let t = 0; t < 30; t += 0.25) sim.update(0.25);

    let switched = 0;
    const captions: string[] = [];
    const scene = new ParkIntroScene(
      sim,
      () => {
        switched += 1;
        setWorldLocation('park');
      },
      (c) => captions.push(c),
    );
    expect(switched).toBe(0);
    expect(scene.done).toBe(false);
    expect(captions.length).toBeGreaterThanOrEqual(1);

    for (let t = 0; t < 36 && !scene.done; t += 0.25) scene.update(0.25);
    expect(switched).toBe(1);
    expect(getWorldLocation()).toBe('park');
    expect(scene.done).toBe(true);

    // Verify immediate skip() path also triggers switch once.
    const { sim: sim2 } = makeSimFor('office', 15);
    sim2.beginDay(1);
    let skippedSwitch = 0;
    const scene2 = new ParkIntroScene(sim2, () => {
      skippedSwitch += 1;
      setWorldLocation('park');
    });
    scene2.skip();
    expect(skippedSwitch).toBe(1);
    expect(getWorldLocation()).toBe('park');
    expect(scene2.done).toBe(true);
  });
});

describe('Park Episode chapters & finale', () => {
  it('Act 1: wins when Michael + 7 colleagues gather on the Great Lawn for 6s and loses if the noon deadline passes', async () => {
    const g = playPark(1, 31);
    await g.toClock(9, 10);
    expect(g.day.main).toBe('open');

    const lawnSpots = walkableTilesIn('bullpen');
    await g.place('michael', feetOf(lawnSpots[4]));
    const guests: CastId[] = ['jim', 'pam', 'dwight', 'stanley', 'kevin', 'oscar', 'angela'];
    for (let i = 0; i < guests.length; i++) {
      await g.place(guests[i], feetOf(lawnSpots[(i * 7 + 9) % lawnSpots.length]));
    }
    const won = await g.until(() => g.day.main === 'won', 16);
    expect(won).toBe(true);
    expect(g.story.state.notes.parkRally).toBe(true);
    expect(sideState(g.day, 'calmGrill')).toBe('won');

    // Timeout loss check
    const g2 = playPark(1, 32);
    await g2.toClock(12, 5);
    expect(g2.day.main).toBe('lost');
    expect(g2.story.state.notes.parkRally).toBe(false);
  });

  it('Act 2: settles Truce when Jim and Dwight reconcile, awards Kevin BBQ bonus, or loses at 16:00', async () => {
    const g = playPark(2, 41);
    await g.toClock(9, 10);
    await g.place('kevin', 'kitchen');
    const kevinFed = await g.until(() => sideState(g.day, 'grill') === 'won', 10);
    expect(kevinFed).toBe(true);
    for (let i = 0; i < 6 && g.day.main === 'open'; i++) {
      g.day.note({ kind: 'whisper', who: 'jim', text: 'Run with Dwight for ten minutes.' });
      g.day.note({ kind: 'whisper', who: 'dwight', text: 'Lead Jim cleanly in the relay.' });
      await g.step(2);
    }
    const won = await g.until(() => g.day.main === 'won', 20);
    expect(won).toBe(true);
    expect(g.story.state.notes.parkTruce).toBe(true);
    expect(g.story.state.notes.parkGrill).toBe(true);
    expect(sideState(g.day, 'grill')).toBe('won');

    const g2 = playPark(2, 42);
    await g2.toClock(16, 5);
    expect(g2.day.main).toBe('lost');
    expect(g2.story.state.notes.parkTruce).toBe(false);
  });

  it('Act 3: Ranger Miller inspects stops and settles cleanly', async () => {
    const g = playPark(3, 51);
    const settled = await g.until(() => g.day.main !== 'open', 120);
    expect(settled).toBe(true);
    expect(typeof g.story.state.notes.parkInspection).toBe('number');
  });

  it('ParkFinaleScene plays through all three endings and supports skip()', () => {
    for (const ending of ['saved', 'scraped', 'closed'] as const) {
      const { sim } = makeSimFor('park', 60);
      sim.beginDay(3);
      for (let t = 0; t < 20; t += 0.25) sim.update(0.25);
      const scene = new ParkFinaleScene(sim, ending, {
        leak: 'creed',
        parkRally: true,
        parkTruce: true,
        parkGrill: true,
        parkInspection: ending === 'closed' ? 1 : 3,
      });
      for (let t = 0; t < 16 && !scene.done; t += 0.25) scene.update(0.25);
      expect(scene.done).toBe(true);
    }
  });
});

describe('Park episode prose hygiene', () => {
  it('contains zero em/en dashes, curly quotes, or emoji and valid intro hooks', () => {
    const notesSample = { leak: 'creed' as CastId, parkRally: true, parkTruce: true, parkGrill: true, parkInspection: 3 };
    const bag = collectStrings([
      PARK_EPISODE_META,
      PARK_ENDING_RULE,
      PARK_INTRO,
      PARK_RALLY,
      PARK_TRUCE,
      PARK_RANGER,
      PARK_CHANGES,
      PARK_FINALE,
      parkEndingText('saved', notesSample),
      parkEndingText('scraped', notesSample),
      parkEndingText('closed', notesSample),
      parkEpilogueLines('saved', notesSample),
      parkEpilogueLines('closed', notesSample),
    ]);
    for (const text of bag) {
      expect(text).not.toMatch(/[‒–—―]/);
      expect(text).not.toMatch(/[‘’“”]/);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    for (const def of PARK_CHAPTER_DEFS) {
      const { hook, rest } = splitHook(def.intro);
      expect(hook.length).toBeGreaterThan(10);
      expect(hook.length).toBeLessThan(160);
      expect(rest.length).toBeGreaterThan(0);
    }
    const ids: EpisodeId[] = ['office', 'park'];
    expect(ids).toEqual(['office', 'park']);
  });
});
