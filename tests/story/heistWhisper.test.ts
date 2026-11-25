// Episode 3, "Inside Job": a whisper or order to take the tape is the story's hand-over and nothing
// else. Live, the suggested whisper "Take the tape from Michael and keep it safe." was read as a theft
// by both the written parser and the model: the Log said "Dwight snatched Michael's tape recorder!",
// Michael's feeling for Dwight dropped and a "little shoplifter" scene followed. Here the Director is
// wired the way game.ts wires it in story mode, with a stand-in model that reads any tape sentence as a
// theft (as the real one did), so the tests prove the chapter's claim keeps the theft off the floor.
import { describe, expect, it } from 'vitest';
import type { DirectiveRequest, DirectiveResult } from '@/game/brain/api';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import { Bus, type GameEvents } from '@/game/core/bus';
import { BANK } from '@/game/core/content';
import type { CharId } from '@/game/core/types';
import { TILE, feetOf, setWorldLocation } from '@/game/core/world';
import { Director } from '@/game/director/director';
import { createSim, type Sim } from '@/game/sim';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { createRng } from '@/game/sim/rng';
import { Story, memoryStore, type StoryDay, type WeekNotes } from '@/game/story';
import { CASE_SIDE } from '@/game/story/heistChapters';
import { WORLD } from './harness';

const DT = 0.1;
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Stands in for the model: reads every sentence about the tape as stealing it, as the real one did live. */
class TheftReadingModel extends InstinctBrain {
  asked: string[] = [];

  async interpretDirective(req: DirectiveRequest): Promise<DirectiveResult> {
    this.asked.push(req.text);
    const base = this.interpretDirectiveNow(req);
    if (!/\btapes?\b/i.test(req.text)) return { ...base, source: 'model' };
    const named = req.people.find((p) => p.id !== req.actor.id && new RegExp(`\\b${p.name.split(' ')[0]}\\b`, 'i').test(req.text));
    return { ...base, verb: 'steal', targetPerson: named?.id ?? null, item: 'tape recorder', source: 'model' };
  }
}

interface Played {
  sim: Sim;
  day: StoryDay;
  dir: Director;
  model: TheftReadingModel;
  feed: string[];
  /** Everything the sim was asked to remember. */
  memories: string[];
  /** Every change in feeling: [who, about, delta]. */
  shifts: [CharId, CharId, number][];
  /** Every time the written parser was asked to read an order (the director's fallback when the model is not used). */
  parsed: string[];
  until(pred: () => boolean, max: number): Promise<boolean>;
  toClock(h: number, m?: number): Promise<void>;
  whisper(who: CharId, text: string): void;
  tell(who: CharId, text: string): void;
  holder(): CharId | null;
}

/** An Episode 3 day with the Director built as game.ts builds it in story mode. */
function play(chapter: number, notes: Partial<WeekNotes> = {}, seed = 31): Played {
  setWorldLocation('office');
  const story = Story.create(memoryStore(), seed, 'heist');
  story.state.chapter = chapter;
  story.state.introSeen = true;
  Object.assign(story.state.notes, notes);
  story.state.notesAtStart = JSON.parse(JSON.stringify(story.state.notes)) as WeekNotes;
  const bus = new Bus<GameEvents>();
  const instinct = new InstinctBrain(BANK as LooseBank, WORLD, createRng(story.simSeed() + 5));
  const model = new TheftReadingModel(BANK as LooseBank, WORLD, createRng(story.simSeed() + 6));
  const sim = createSim({ bus, reflexes: instinct, seed: story.simSeed(), dayMinutes: 10, sandbox: false, now: () => 0 });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  sim.beginDay(story.simDay());
  story.recordStart(sim.serialize());
  const feed: string[] = [];
  bus.on('feed', (f) => feed.push(f.text));
  const memories: string[] = [];
  const remember = sim.remember.bind(sim);
  sim.remember = (who, text, weight) => {
    memories.push(text);
    remember(who, text, weight);
  };
  const shifts: [CharId, CharId, number][] = [];
  const shiftBond = sim.shiftBond.bind(sim);
  sim.shiftBond = (who, about, delta, why) => {
    shifts.push([who, about, delta]);
    shiftBond(who, about, delta, why);
  };
  const parsed: string[] = [];
  const readNow = instinct.interpretDirectiveNow.bind(instinct);
  instinct.interpretDirectiveNow = (req) => {
    parsed.push(req.text);
    return readNow(req);
  };
  let director: Director | null = null;
  const day = story.beginDay(sim, { script: (lines, o) => (director ? director.playScript(lines, o) : o.done?.()) });
  director = new Director({
    sim, brain: model, instinct,
    pinned: (w) => day.pinned(w), summonStay: (r) => day.summonStay(r),
    storyTopics: () => day.topics(), vetoShift: (w, a, d) => day.vetoShift(w, a, d),
    // As game.ts does in story mode.
    carefulOrders: () => true,
    ownsOrder: (who, text, kind) => day.ownsOrder({ kind, who, text }),
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
  const p: Played = {
    sim, day, dir, model, feed, memories, shifts, parsed,
    async until(pred, max) {
      for (let t = 0; t < max; t += DT) {
        if (pred()) return true;
        await tick();
      }
      return pred();
    },
    async toClock(hh, m = 0) {
      await p.until(() => sim.clock >= hh * 60 + m, 3000);
    },
    // In the order game.ts uses: the director first, then the chapter is told.
    whisper(who, text) {
      dir.whisper(who, text);
      day.note({ kind: 'whisper', who, text });
    },
    tell(who, text) {
      dir.cue(who, text);
      day.note({ kind: 'cue', who, text });
    },
    holder: () => (day.logic as unknown as { state: { holder: CharId | null } }).state.holder,
  };
  return p;
}

const THEFT = /snatch|stole|steal|shoplift/i;
const near = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('Episode 3: an order to take the tape is the hand-over, never a theft', () => {
  it('Thursday claims an order to take the tape, and the holder\'s orders about the tape that the chapter acts on', () => {
    const h = play(2, { heistCode: true, heistDigits: 3 });
    expect(h.holder()).toBe('michael');
    const claimed: [CharId, string][] = [
      ['jim', 'Take the tape from Michael and keep it safe.'],
      ['dwight', 'Take the tape from Michael, then wait outside the conference room.'],
      ['jim', 'take the tape from Michael'],
      ['jim', 'get the tape off Dwight and hide it'],
      ['pam', 'grab the tape'],
      ['dwight', 'Pick the lock and swap the tapes.'],
      ['creed', 'Steal the tape from Michael.'],
      ['creed', "Steal Michael's tape."],
      // The holder told to wait with it, or to do the swap, goes where the chapter sends them.
      ['michael', 'Wait outside the conference room with the tape.'],
      ['michael', 'Pick the lock and swap the tapes.'],
      // The holder told to take it from someone already has it: nothing to steal.
      ['michael', 'Take the tape from Dwight and keep it safe.'],
    ];
    for (const [who, text] of claimed) {
      expect(h.day.ownsOrder({ kind: 'whisper', who, text }), `whisper ${who}: ${text}`).toBe(true);
      expect(h.day.ownsOrder({ kind: 'cue', who, text }), `tell ${who}: ${text}`).toBe(true);
    }
    const free: [CharId, string][] = [
      ['creed', "steal Pam's stapler"],
      ['kevin', 'Stay calm. You know nothing about a tape.'],
      ['michael', 'Keep the tape safe.'],
      // Walking the tape somewhere is an ordinary order, staged as usual.
      ['michael', 'Take the tape to the annex.'],
      ['jim', 'Go and talk to Pam.'],
    ];
    for (const [who, text] of free) expect(h.day.ownsOrder({ kind: 'whisper', who, text }), `whisper ${who}: ${text}`).toBe(false);
    // An announcement or a power is never claimed.
    expect(h.day.ownsOrder({ kind: 'announce', text: 'Take the tape from Michael.' })).toBe(false);
  }, 60000);

  it('the suggested whisper: the tape changes hands, the thought sticks, and nothing is stolen', async () => {
    const h = play(2, { heistCode: true, heistDigits: 3 });
    await h.toClock(9, 20);
    const line = 'Take the tape from Michael and keep it safe.';
    h.whisper('jim', line);
    // The whispered thought shows and sticks as before.
    expect(h.feed).toContain(`You whisper to Jim: "${line}"`);
    expect(h.sim.person('jim')!.conviction?.text).toBe(line);
    expect(await h.until(() => h.holder() === 'jim', 90)).toBe(true);
    expect(h.feed).toContain('Michael hands the right tape to Jim.');
    await h.until(() => false, 30);
    // No theft in the Log or in anyone's memory, and Michael thinks no less of Jim.
    expect(h.feed.filter((t) => THEFT.test(t))).toEqual([]);
    expect(h.memories.filter((t) => THEFT.test(t))).toEqual([]);
    expect(h.shifts.filter(([who, about, d]) => who === 'michael' && about === 'jim' && d <= -20)).toEqual([]);
    expect(h.sim.person('jim')!.conviction?.text).toBe(line);
    // Neither reader was asked, so nothing else was staged from the sentence (and no slow model call was spent).
    expect(h.model.asked).not.toContain(line);
    expect(h.parsed).not.toContain(line);
  }, 120000);

  it('told to pick the lock and swap the tapes: they fetch the tape and head for the case, and nobody is robbed', async () => {
    const h = play(2, { heistCode: true, heistDigits: 3 });
    await h.toClock(9, 20);
    const line = 'Pick the lock and swap the tapes.';
    h.tell('dwight', line);
    expect(h.feed).toContain('You nudge Dwight: Pick the lock and swap the tapes.');
    expect(await h.until(() => h.holder() === 'dwight', 90)).toBe(true);
    expect(await h.until(() => near(h.sim.person('dwight')!, feetOf(CASE_SIDE)) <= 2 * TILE, 60)).toBe(true);
    expect(h.feed.filter((t) => THEFT.test(t))).toEqual([]);
    expect(h.memories.filter((t) => THEFT.test(t))).toEqual([]);
    expect(h.model.asked).not.toContain(line);
    expect(h.parsed).not.toContain(line);
  }, 120000);

  it('a deliberate theft that is not the hand-over still happens in story mode', async () => {
    const h = play(2, { heistCode: true, heistDigits: 3 });
    await h.toClock(9, 20);
    h.tell('creed', "steal Pam's stapler");
    expect(await h.until(() => h.feed.includes("Creed snatched Pam's stapler!"), 90)).toBe(true);
    // The tape stayed where it was.
    expect(h.holder()).toBe('michael');
  }, 120000);

  it('Friday, with the switch still to do, claims the tape hand-over the same way', () => {
    const h = play(3, { heistCode: true, heistDigits: 3 });
    expect(h.holder()).toBe('michael');
    expect(h.day.ownsOrder({ kind: 'whisper', who: 'jim', text: 'Take the tape from Michael and keep it safe.' })).toBe(true);
    // Once the switch is done (Thursday won), Friday has no tape to pass on and claims nothing.
    const done = play(3, { heistCode: true, heistDigits: 3, heistSwitched: 'thursday' });
    expect(done.day.ownsOrder({ kind: 'whisper', who: 'jim', text: 'Take the tape from Michael and keep it safe.' })).toBe(false);
  }, 60000);
});
