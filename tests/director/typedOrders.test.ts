// Typed orders on the stage: whoever is finally acted on is the person the Log line, the memories
// and the aftermath scene name, in one plain tense. And "go home for the day" goes home, it does
// not quit. The model is online here, answering with canned replies.
import { describe, expect, it } from 'vitest';
import type { Brain, ChatRequest, ChatResponse, ChatTransport, DirectiveResult } from '@/game/brain/api';
import { createBrain } from '@/game/brain/index';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import { BANK } from '@/game/core/content';
import type { CharId } from '@/game/core/types';
import { Director } from '@/game/director/director';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { createRng } from '@/game/sim/rng';
import { settings } from '../brain/fixtures';
import { makeSim, runUntil } from '../sim/helpers';
import { WORLD } from '../story/harness';

/**
 * An office at 09:15 with the model online. `brainFor` builds the brain from the instinct brain
 * the director falls back on.
 */
function office(brainFor: (instinct: InstinctBrain) => Brain, opts: { careful?: boolean; seed?: number } = {}) {
  const seed = opts.seed ?? 11;
  const { sim, bus } = makeSim({ dayMinutes: 10, seed, sandbox: false });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  const instinct = new InstinctBrain(BANK as LooseBank, WORLD, createRng(seed));
  const director = new Director({ sim, brain: brainFor(instinct), instinct, ...(opts.careful ? { carefulOrders: () => true } : {}) });
  const feed: string[] = [];
  bus.on('feed', (f) => feed.push(f.text));
  runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);
  director.reset();
  feed.length = 0;
  const advance = async (seconds: number, stopWhen?: () => boolean): Promise<void> => {
    for (let i = 0; i < Math.ceil(seconds / 0.1); i++) {
      sim.update(0.1);
      director.update(0.1);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      if (stopWhen?.()) break;
    }
  };
  return { sim, director, feed, advance };
}

/** The real merge, with the model answering `directive` to the typed order and nothing usable to anything else. */
function onlineModel(directive: Record<string, unknown>, asked: string[]): (instinct: InstinctBrain) => Brain {
  const transport: ChatTransport = {
    kind: 'ollama',
    autonomous: true,
    status: async () => ({ ok: true, models: [] }),
    chat: async (r: ChatRequest): Promise<ChatResponse> => {
      asked.push(String(r.messages[1]?.content ?? ''));
      const isDirective = !!(r.schema as { properties?: Record<string, unknown> }).properties?.delegatedAction;
      return { text: isDirective ? JSON.stringify(directive) : '{}', stats: { ms: 1, tokPerSec: 100 } };
    }
  };
  return () => createBrain(settings(), { bank: BANK as LooseBank, world: WORLD, transport, rng: createRng(5) });
}

/** A brain that hands the stage exactly this reading (to test the stage on its own). */
function fixedReading(res: DirectiveResult): (instinct: InstinctBrain) => Brain {
  return (instinct) => Object.assign(Object.create(instinct) as InstinctBrain, { interpretDirective: async () => res }) as unknown as Brain;
}

const knockedOut = (sim: ReturnType<typeof office>['sim']): CharId[] =>
  sim.people().filter((p) => sim.hasStatus(p.id, 'knockedOut')).map((p) => p.id);

describe('the person acted on is the person named', () => {
  it('cue Kevin "punch Halpert": Jim is knocked out, and the Log, memories and aftermath say Jim', async () => {
    const asked: string[] = [];
    const { sim, director, feed, advance } = office(onlineModel(
      { verb: 'knockout', targetPerson: 'Jim', targetRoom: 'bullpen', power: 'none', item: '', summary: 'punches Jim square in the face', delegatedAction: '' },
      asked
    ));
    director.cue('kevin', 'punch Halpert');
    await advance(80, () => sim.hasStatus('jim', 'knockedOut'));
    expect(knockedOut(sim)).toEqual(['jim']);
    await advance(3);
    const line = feed.find((l) => /out cold/.test(l));
    // One tense, plainly: "Kevin punches Jim square in the face. Jim is out cold in the bullpen!"
    expect(line).toMatch(/^Kevin punches Jim square in the face\. Jim is out cold in /);
    expect(feed.join('\n')).not.toMatch(/Toby/);
    expect(sim.memoriesFor('pam').some((m) => /^Kevin knocked Jim out cold in /.test(m))).toBe(true);
    expect(sim.memoriesFor('pam').join('\n')).not.toMatch(/Toby/);
    expect(asked.some((m) => m.includes('Jim is out cold on the floor'))).toBe(true);
  });

  it('when the stage has to pick the nearest person, a phrase naming someone else is not printed', async () => {
    const { sim, director, feed, advance } = office(fixedReading({
      verb: 'knockout', targetPerson: null, targetRoom: null, power: 'none', item: '', summary: 'punches Michael in the face', source: 'model'
    }));
    director.cue('kevin', 'punch him');
    await advance(80, () => knockedOut(sim).length > 0);
    const [victim] = knockedOut(sim);
    expect(victim).toBeTruthy();
    const name = sim.person(victim)!.name;
    const line = feed.find((l) => /out cold/.test(l))!;
    expect(line).toContain(name);
    if (victim !== 'michael') {
      expect(line.startsWith(`Kevin knocks ${name} out cold in `)).toBe(true);
      expect(line).not.toContain('Michael');
      expect(sim.memoriesFor('pam').filter((m) => /out cold/.test(m)).join('\n')).not.toContain('Michael');
    }
  });
});

describe('going home is not quitting', () => {
  it('"go home for the day" in story mode: Stanley calls it a day and leaves, without quitting', async () => {
    const asked: string[] = [];
    const { sim, director, feed, advance } = office(onlineModel(
      { verb: 'walk_out', targetPerson: 'none', targetRoom: 'bullpen', power: 'none', item: '', summary: 'packs up his crossword and walks out the front door without a word', delegatedAction: '' },
      asked
    ), { careful: true });
    director.cue('stanley', 'go home for the day');
    await advance(5, () => feed.some((l) => /heads home early/.test(l)));
    expect(feed).toContain('Stanley calls it a day and heads home early.');
    expect(sim.hasStatus('stanley', 'quit')).toBe(false);
    expect(feed.join('\n')).not.toMatch(/I quit|packed up a box/);
    await advance(90, () => !sim.person('stanley')?.present);
    expect(sim.person('stanley')?.present).toBe(false);
  });

  it('"quit your job" still quits', async () => {
    const asked: string[] = [];
    const { sim, director, advance } = office(onlineModel(
      { verb: 'walk_out', targetPerson: 'none', targetRoom: 'bullpen', power: 'none', item: '', summary: 'walks out', delegatedAction: '' },
      asked
    ), { careful: true });
    director.cue('stanley', 'quit your job');
    await advance(5, () => sim.hasStatus('stanley', 'quit'));
    expect(sim.hasStatus('stanley', 'quit')).toBe(true);
  });
});
