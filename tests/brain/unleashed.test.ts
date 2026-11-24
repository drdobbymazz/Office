import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Brain, SceneRequest } from '@/game/brain/api';
import { cleanStageAction } from '@/game/brain/clean';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import { NameMap } from '@/game/brain/names';
import { PERSONA_WORDS, PromptBook, personaEntry } from '@/game/brain/prompts';
import { sceneSchema } from '@/game/brain/schema';
import { WorldIndex } from '@/game/brain/world';
import { createBrain, LlmBrain } from '@/game/brain/index';
import type { BrainWorld } from '@/game/brain/world';
import { CAST_LIST, SETTING } from '@/game/core/cast';
import { BANK as GAME_BANK } from '@/game/core/content';
import { Director } from '@/game/director/director';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { MemoryBook } from '@/game/sim/memory';
import { createRng } from '@/game/sim/rng';
import { roomsFor, walkableTilesIn } from '@/game/core/world';
import { makeSim, runUntil } from '../sim/helpers';
import { BANK, WORLD, person, sceneReq, seeded, settings, startMock } from './fixtures';
import type { MockServer } from './fixtures';

let mock: MockServer;
beforeAll(async () => {
  mock = await startMock();
});
afterAll(async () => {
  await mock.close();
});

const OFFICE_WORLD: BrainWorld = {
  setting: SETTING,
  people: CAST_LIST.map((c) => ({
    id: c.id, name: c.name, role: c.role, summary: c.persona.summary, speech: c.persona.speech,
    wants: c.persona.wants, fears: c.persona.fears, quirk: c.persona.quirk, secret: c.persona.secret,
    examples: [...c.persona.examples], nerve: c.temperament.nerve, fixes: [...c.fixes]
  })),
  rooms: roomsFor('office').filter((r) => r.id !== 'outside').map((r) => ({ id: r.id, name: r.name }))
};

describe('Unleashed Model Mode', () => {
  it('enriches personaEntry with wants/quirk/fears within PERSONA_WORDS and keeps multi-day takeaways in memory', () => {
    const entry = personaEntry(WORLD.people[0]);
    expect(entry).toContain('Wants: a tidy shop.');
    expect(entry).toContain('Quirk: alphabetises seed packets.');
    expect(entry.split(/\s+/).length).toBeLessThanOrEqual(PERSONA_WORDS);

    // Full cast cached system prefix stays comfortably under ~2500 tokens (~1900 words max) for 4k context models
    const gameBook = new PromptBook(new WorldIndex(OFFICE_WORLD));
    const sysWords = gameBook.system('scene').split(/\s+/).length;
    expect(sysWords).toBeLessThan(1900);

    const mem = new MemoryBook();
    mem.addTakeaway('jim', 'Still refuses to trust Dwight with any stapler.');
    for (let i = 1; i <= 8; i++) {
      mem.add('jim', { day: 2, clock: 540 + i * 5, text: `Today event ${i} happened.`, weight: 2 });
    }
    const recalled = mem.relevant('jim', ['pam'], 2, 600, 5);
    expect(recalled).toHaveLength(5);
    expect(recalled).toContain('Still refuses to trust Dwight with any stapler.');
  });

  it('adds unleashed sceneSchema fields (stageAction, rumor, shift note) only when unleashed=true and cleans them cleanly', () => {
    const base = sceneSchema({ speakers: ['Jim', 'Pam'], people: ['Jim', 'Pam'], rooms: ['bullpen'], minLines: 2, maxLines: 4 }) as { properties: Record<string, unknown> };
    expect(Object.keys(base.properties)).toEqual(['lines', 'summary', 'shifts', 'plans']);

    const unleashed = sceneSchema({ speakers: ['Jim', 'Pam'], people: ['Jim', 'Pam', 'Dwight'], rooms: ['bullpen'], minLines: 2, maxLines: 5, unleashed: true }) as {
      properties: Record<string, { items?: { properties?: Record<string, unknown> }; properties?: Record<string, unknown> }>;
    };
    expect(Object.keys(unleashed.properties)).toEqual(['lines', 'summary', 'shifts', 'plans', 'stageAction', 'rumor']);
    expect(unleashed.properties.shifts.items?.properties?.note).toBeTruthy();
    expect(Object.keys(unleashed.properties.stageAction.properties ?? {})).toEqual(['kind', 'actor', 'target', 'detail']);

    const speakers = new NameMap([{ id: 'jim', name: 'Jim Halpert' }, { id: 'pam', name: 'Pam Beesly' }]);
    const people = new NameMap([{ id: 'jim', name: 'Jim Halpert' }, { id: 'pam', name: 'Pam Beesly' }, { id: 'dwight', name: 'Dwight Schrute' }]);
    expect(cleanStageAction({ kind: 'none', actor: 'Jim', target: 'Pam', detail: '' }, speakers, people)).toBeUndefined();
    expect(cleanStageAction({ kind: 'splash_drink', actor: 'Jim', target: 'Dwight', detail: 'hot coffee' }, speakers, people)).toEqual({
      kind: 'splash_drink', actor: 'jim', target: 'dwight', detail: 'hot coffee'
    });
    expect(cleanStageAction({ kind: 'strip', actor: 'Pam', target: 'none', detail: 'strips naked on desk' }, speakers, people)).toEqual({
      kind: 'strip', actor: 'pam', target: null, detail: 'strips naked on desk'
    });
  });

  it('parses custom shift notes, stageAction, and rumor from LlmBrain unleashed replies and scales maxTokens cleanly', async () => {
    const book = new PromptBook(new WorldIndex(WORLD));
    const prompt = book.sceneUser(sceneReq({
      unleashed: true,
      headlines: ['Meredith stripped in the break room.'],
      people: [person('fern', { memories: ['M1', 'M2', 'M3', 'M4', 'Long-term takeaway.'] }), person('basil')]
    }), new NameMap([{ id: 'fern', name: 'Fern Holloway' }, { id: 'basil', name: 'Basil Okafor' }]));
    expect(prompt).toContain("Today's big office headlines: Meredith stripped in the break room.");
    expect(prompt).toContain('UNLEASHED SCENE CONTROLS');
    expect(prompt).toContain('Long-term takeaway');

    const brain = createBrain(settings({ baseUrl: mock.url, model: 'artemis-custom' }), {
      bank: BANK,
      world: WORLD,
      rng: seeded(9)
    }) as LlmBrain;
    const res = await brain.scene(sceneReq({ maxLines: 4, unleashed: true }));
    expect(res.source).toBe('model');
    const reqBody = mock.requests.filter((r) => r.path === '/api/chat').pop()!.body as { options: { num_predict: number }; format: { properties: Record<string, unknown> } };
    expect(reqBody.options.num_predict).toBe(120 + 95 * 4 + 95);
    expect(Object.keys(reqBody.format.properties)).toContain('stageAction');
    expect(Object.keys(reqBody.format.properties)).toContain('rumor');
  });

  it('executes model-triggered stageAction, custom shift notes, rumor facts, cross-room continuity, and suppresses canned musings', async () => {
    const { sim, bus } = makeSim({ dayMinutes: 10, seed: 77, sandbox: false });
    for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
    const instinct = new InstinctBrain(GAME_BANK as LooseBank, OFFICE_WORLD, createRng(77));
    const feed: string[] = [];
    bus.on('feed', (f) => feed.push(f.text));

    runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);
    const bullpen = walkableTilesIn('bullpen');
    sim.teleport('jim', bullpen[2]);
    sim.teleport('pam', bullpen[3]);

    const seenReqs: SceneRequest[] = [];
    let callIdx = 0;
    const mockBrain: Brain = {
      kind: 'ollama',
      autonomous: true,
      async status() { return { provider: 'ollama', ok: true, model: 'artemis-custom', models: ['artemis-custom'] }; },
      async scene(req) {
        seenReqs.push(req);
        callIdx += 1;
        if (callIdx === 1) {
          return {
            lines: [
              { who: 'jim', say: 'Forget the spreadsheets, come here.', feel: 'love', to: 'pam', act: 'step_closer' },
              { who: 'pam', say: 'Right in front of the sales floor?', feel: 'mischievous', to: 'jim', act: 'laugh' },
              { who: 'jim', say: 'Every single person here.', feel: 'love', to: 'pam', act: 'step_closer' }
            ],
            summary: 'Jim pulled Pam into a shameless kiss right in front of the bullpen.',
            shifts: [{ who: 'pam', about: 'jim', change: 'fancies', note: 'weak in the knees after that bullpen kiss' }],
            plans: [],
            stageAction: { kind: 'kiss', actor: 'jim', target: 'pam', detail: 'kisses Pam passionately' },
            rumor: 'Someone saw Jim and Pam sneaking kisses behind reception.',
            source: 'model'
          };
        }
        return {
          lines: [
            { who: req.people[0].id, say: 'Did you hear what happened by reception?', feel: 'amused', to: req.people[1]?.id ?? null, act: 'whisper' },
            ...(req.people[1] ? [{ who: req.people[1].id, say: 'The whole branch knows.', feel: 'surprised' as const, to: req.people[0].id, act: 'gasp' as const }] : [])
          ],
          summary: 'They gossipped about Jim and Pam.',
          shifts: [],
          plans: [],
          source: 'model'
        };
      },
      async minds() { return []; },
      async interpret(r) { return instinct.interpret(r); },
      async interpretDirective(r) { return instinct.interpretDirective(r); },
      async report(r) { return instinct.report(r); },
      async sagaEpisode(r) { return instinct.sagaEpisode(r); }
    };

    const director = new Director({ sim, brain: mockBrain, instinct });
    director.reset();

    // Scene 1: priority >= 8 & unleashed model active -> allows up to 5-6 lines, fires stageAction & rumor & custom note
    sim.requestScene({ people: ['jim', 'pam'], room: 'bullpen', trigger: 'event', why: 'Jim and Pam lock eyes across the bullpen.', priority: 9 });
    for (let i = 0; i < 180; i++) {
      sim.update(0.1);
      director.update(0.1);
      await Promise.resolve();
      await Promise.resolve();
      if (sim.hasStatus('pam', 'flustered') && sim.facts().some((f) => f.includes('sneaking kisses'))) break;
    }

    expect(seenReqs[0].unleashed).toBe(true);
    expect(seenReqs[0].maxLines).toBe(5);
    expect(sim.bondsTable.get('pam', 'jim').note).toBe('weak in the knees after that bullpen kiss');
    expect(sim.facts().some((f) => f.includes('Office gossip: Someone saw Jim and Pam sneaking kisses behind reception.'))).toBe(true);
    expect(sim.hasStatus('pam', 'flustered')).toBe(true);
    expect(feed.some((line) => line.includes('Rumor spreads: Someone saw Jim and Pam sneaking kisses behind reception.'))).toBe(true);

    // Move Jim to another room and check Scene 2 receives headlines & cross-room recent line continuity!
    const annex = walkableTilesIn('annex');
    sim.teleport('jim', annex[0]);
    sim.teleport('angela', annex[1]);
    sim.requestScene({ people: ['jim', 'angela'], room: 'annex', trigger: 'event', why: 'Jim walks into the annex.', priority: 8 });
    for (let i = 0; i < 180; i++) {
      sim.update(0.1);
      director.update(0.1);
      await Promise.resolve();
      await Promise.resolve();
      if (seenReqs.some((r) => r.place === 'the annex' && r.people.some((p) => p.id === 'jim'))) break;
    }
    const annexReq = seenReqs.find((r) => r.place === 'the annex' && r.people.some((p) => p.id === 'jim'));
    expect(annexReq).toBeTruthy();
    expect(annexReq!.headlines?.some((h) => h.includes('bullpen kiss') || h.includes('sneaking kisses'))).toBe(true);
    expect(annexReq!.recent.some((r) => r.who === 'Jim')).toBe(true);

    // Canned InstinctBrain musing does not inject offline think bubbles right after model activity
    const thinksBefore = feed.filter((t) => t.startsWith('(')).length;
    await (director as unknown as { musing: () => Promise<void> }).musing();
    const thinksAfter = feed.filter((t) => t.startsWith('(')).length;
    expect(thinksAfter).toBe(thinksBefore);
  });
});
