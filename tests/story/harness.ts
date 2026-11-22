// A story day on the real simulation, the real Director and the no-model
// (instinct) brain, the way the game assembles it, with small helpers to play
// it like a player: whisper, announce, use powers, pick people up and drop them.
import { Bus, type GameEvents } from '@/game/core/bus';
import { CAST_LIST, SETTING } from '@/game/core/cast';
import { BANK } from '@/game/core/content';
import { ROOMS, anchor, feetOf } from '@/game/core/world';
import type { ChaosId, ChaosTarget, CharId } from '@/game/core/types';
import type { BrainWorld } from '@/game/brain/world';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import { Director } from '@/game/director/director';
import { createSim, type Sim } from '@/game/sim';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { createRng } from '@/game/sim/rng';
import { Story, StoryDay, memoryStore, type StoryStore } from '@/game/story';

export const WORLD: BrainWorld = {
  setting: SETTING,
  people: CAST_LIST.map((c) => ({
    id: c.id, name: c.name, role: c.role, summary: c.persona.summary, speech: c.persona.speech, wants: c.persona.wants,
    fears: c.persona.fears, quirk: c.persona.quirk, secret: c.persona.secret, examples: [...c.persona.examples],
    nerve: c.temperament.nerve, fixes: [...c.fixes]
  })),
  rooms: ROOMS.filter((r) => r.id !== 'outside').map((r) => ({ id: r.id, name: r.name }))
};

export interface Played {
  story: Story;
  store: StoryStore;
  sim: Sim;
  day: StoryDay;
  director: Director;
  feed: string[];
  goals: { title: string; state: string; main: boolean }[];
  /** Run the office (sim, director, story) for this many sim seconds. */
  step(seconds: number): Promise<void>;
  /** Run until the predicate holds or `max` sim seconds pass. True if it held. */
  until(pred: () => boolean, max: number): Promise<boolean>;
  /** Run until the game clock reaches hh:mm. */
  toClock(h: number, m?: number): Promise<void>;
  /** Run until the day is over (everyone home). */
  toEnd(): Promise<void>;
  whisper(who: CharId, text: string): string | null;
  announce(text: string): string | null;
  cue(who: CharId, text: string): string | null;
  power(id: ChaosId, target?: ChaosTarget): string | null;
  /** Pick someone up and set them down at an anchor (e.g. 'spot.meet8') or a world point. */
  drop(who: CharId, at: string | { x: number; y: number }): Promise<boolean>;
}

const DT = 0.1;
/** The brain answers through promises: let them settle every so often, as the browser would. */
const FLUSH_EVERY = 5;
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** A story whose current chapter is `chapter`, as if the days before had been played. */
export function storyAt(chapter: number, seed = 11, store: StoryStore = memoryStore()): Story {
  const story = Story.create(store, seed);
  story.state.chapter = chapter;
  story.state.stage = 'day';
  story.save();
  return story;
}

/** Build the current chapter's day the way the game does, ready to play from 08:50. */
export function play(story: Story, store?: StoryStore): Played {
  const bus = new Bus<GameEvents>();
  const brain = new InstinctBrain(BANK as LooseBank, WORLD, createRng(story.simSeed() + 5));
  const sim = createSim({ bus, reflexes: brain, seed: story.simSeed(), dayMinutes: 10, sandbox: false, save: story.daySave(), now: () => 0 });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  if (sim.day !== story.chapter) sim.beginDay(story.chapter);
  story.recordStart(sim.serialize());
  const feed: string[] = [];
  const goals: Played['goals'] = [];
  bus.on('feed', (f) => feed.push(f.text));
  // Wired the way game.ts wires them: scripted scenes go through the director, and the chapter
  // may hold people, adjust a scene's change in feeling, and give small talk its topics.
  let director: Director | null = null;
  const day = story.beginDay(sim, {
    onGoal: (g) => goals.push({ title: g.title, state: g.state, main: g.main }),
    script: (lines, o) => (director ? director.playScript(lines, o) : o.done?.())
  });
  director = new Director({
    sim, brain, instinct: brain, pinned: (w) => day.pinned(w),
    storyTopics: () => day.topics(), vetoShift: (w, a, d) => day.vetoShift(w, a, d)
  });
  const dir: Director = director;
  dir.reset();
  let ticks = 0;
  const tick = async (): Promise<void> => {
    sim.update(DT);
    dir.update(DT);
    day.update(DT);
    if (++ticks % FLUSH_EVERY === 0) await flush();
  };
  const p: Played = {
    story, store: store ?? memoryStore(), sim, day, director: dir, feed, goals,
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
    async toClock(h, m = 0) {
      await p.until(() => sim.clock >= h * 60 + m, 2000);
    },
    async toEnd() {
      await p.until(() => sim.phase === 'over', 2000);
    },
    whisper(who, text) {
      return day.attempt('whisper', () => {
        dir.whisper(who, text);
        return null;
      }) ?? (day.note({ kind: 'whisper', who, text }), null);
    },
    announce(text) {
      return day.attempt('announce', () => {
        dir.announce(text);
        return null;
      }) ?? (day.note({ kind: 'announce', text }), null);
    },
    cue(who, text) {
      return day.attempt('cue', () => {
        dir.cue(who, text);
        return null;
      }) ?? (day.note({ kind: 'cue', who, text }), null);
    },
    power(id, target = {}) {
      return day.attempt(id, () => sim.startChaos(id, target)) ?? (day.note({ kind: 'power', id, target }), null);
    },
    async drop(who, at) {
      if (!sim.pickUp(who)) return false;
      const pt = typeof at === 'string' ? feetOf(anchor(at).tile) : at;
      sim.dragTo(pt.x, pt.y - 8);
      await p.step(0.6);
      sim.drop(0, 0);
      await p.step(1.2);
      return true;
    }
  };
  return p;
}
