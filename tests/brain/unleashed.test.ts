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
import { walkableTilesIn } from '@/game/core/world';
import { roomsFor } from '@/game/core/world';
import { newSpec, VIEW } from '@/scene/office/actor/art';
import { pose, resetFaceOv, resetMotion, STANDING_ONLY, type FaceOv, type Motion } from '@/scene/office/actor/poses';
import type { PersonState } from '@/game/view/api';
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
    for (let i = 0; i < 260; i++) {
      sim.update(0.1);
      director.update(0.1);
      await Promise.resolve();
      await Promise.resolve();
      if (sim.hasStatus('pam', 'flustered') && sim.facts().some((f) => f.includes('sneaking kisses'))) break;
    }

    expect(seenReqs[0].unleashed).toBe(true);
    expect(seenReqs[0].minLines).toBe(4);
    expect(seenReqs[0].maxLines).toBe(6);
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

  it('poses all 19 new expressive/sexual animations cleanly and exposes STANDING_ONLY + naked/clothes staging', () => {
    const newAnims = [
      'strip', 'kiss', 'makeOut', 'lapDance', 'grinding', 'spank', 'selfTouch', 'seduce',
      'twerk', 'backflip', 'kneel', 'flex',
      'whip', 'tieUp', 'worship', 'dominate', 'lick', 'peep', 'tableDance'
    ] as const;
    const spec = newSpec();
    const m: Motion = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, py: -14 };
    const o: FaceOv = { brow: -1, eyes: -1, mouth: -1, fxAdd: 0, emo: null, emoMin: 0, noBlink: false, tint: 0xffffff };
    const st: PersonState = {
      id: 'pam', sprite: 'pam', x: 100, y: 100, lift: 0, facing: 'down', anim: 'idle', variant: 0,
      seated: false, speed: 0, vx: 0, vy: 0, emotion: 'neutral', intensity: 0, talking: false,
      scale: 1, alpha: 1, visible: true, prop: null, headgear: null, statuses: [], selected: false
    };

    for (const anim of newAnims) {
      expect(STANDING_ONLY.has(anim)).toBe(true);
      for (const view of [VIEW.front, VIEW.right]) {
        for (const t of [0.1, 0.9, 1.7]) {
          resetMotion(m);
          resetFaceOv(o);
          pose(anim, { t, beat: t * 2, st: { ...st, anim }, view, seated: false, lv: 2, swing: 0 }, spec, m, o);
          expect(Number.isFinite(m.x)).toBe(true);
          expect(Number.isFinite(m.y)).toBe(true);
          expect(Number.isFinite(m.rot)).toBe(true);
        }
      }
    }

    const speakers = new NameMap([{ id: 'meredith', name: 'Meredith Palmer' }, { id: 'creed', name: 'Creed Bratton' }]);
    const people = new NameMap([{ id: 'meredith', name: 'Meredith Palmer' }, { id: 'creed', name: 'Creed Bratton' }]);
    expect(cleanStageAction({ kind: 'flash', actor: 'Meredith', target: 'none', detail: 'flashes the bullpen' }, speakers, people)).toEqual({
      kind: 'flash', actor: 'meredith', target: null, detail: 'flashes the bullpen'
    });
    expect(cleanStageAction({ kind: 'lap_dance', actor: 'Meredith', target: 'none', detail: 'tabletop dance' }, speakers, people)).toEqual({
      kind: 'lap_dance', actor: 'meredith', target: 'creed', detail: 'tabletop dance'
    });
    expect(cleanStageAction({ kind: 'twerk', actor: 'Meredith', target: 'none', detail: 'on the copier' }, speakers, people)?.kind).toBe('twerk');
    expect(cleanStageAction({ kind: 'stunt', actor: 'Creed', target: 'none', detail: 'backflip off desk' }, speakers, people)?.kind).toBe('stunt');
    for (const kind of ['whip', 'tie_up', 'worship', 'dominate', 'lick', 'table_dance', 'blackmail', 'peep', 'exhibit'] as const) {
      const cleaned = cleanStageAction({ kind, actor: 'Meredith', target: 'Creed', detail: `staged ${kind}` }, speakers, people);
      expect(cleaned?.kind).toBe(kind);
    }
  });

  it('stages uncensored strip animations cleanly and unlocks autonomous wild stripping only outside Story Mode', async () => {
    const { sim, bus } = makeSim({ dayMinutes: 10, seed: 88, sandbox: false });
    for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
    const instinct = new InstinctBrain(GAME_BANK as LooseBank, OFFICE_WORLD, createRng(88));
    const bursts: string[] = [];
    bus.on('fx', (c) => {
      if (c.kind === 'burst') bursts.push(c.what);
    });
    runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);

    const bullpen = walkableTilesIn('bullpen');
    sim.teleport('meredith', bullpen[2]);
    sim.teleport('creed', bullpen[3]);

    const director = new Director({ sim, brain: instinct, instinct });
    director.reset();

    const animOf = (id: string) => sim.frame().people.find((p) => p.id === id)?.anim;

    // 1. Strip uses 'strip' anim + 'clothes' burst + 'naked'
    director.cue('meredith', 'strip naked');
    expect(animOf('meredith')).toBe('strip');
    expect(sim.hasStatus('meredith', 'naked')).toBe(true);
    expect(sim.hasStatus('meredith', 'exhibitionist')).toBe(true);
    expect(bursts).toContain('clothes');
    for (let i = 0; i < 45; i++) {
      sim.update(0.1);
      director.update(0.1);
    }

    // 2. Lap dance plays 'lapDance' with no censor overlay, then finishes cleanly
    sim.teleport('meredith', bullpen[2]);
    sim.teleport('creed', bullpen[3]);
    director.cue('meredith', 'give creed a lap dance');
    for (let i = 0; i < 120; i++) {
      sim.update(0.1);
      director.update(0.1);
      if (animOf('meredith') === 'lapDance') break;
    }
    expect(animOf('meredith')).toBe('lapDance');
    expect(sim.hasStatus('meredith', 'censored')).toBe(false);
    for (let i = 0; i < 60; i++) {
      sim.update(0.1);
      director.update(0.1);
    }
    expect(sim.hasStatus('meredith', 'censored')).toBe(false);

    // 3. Self-pleasure triggers 'selfTouch' + arousal and marks scandal on finish, with no censor status
    director.cue('creed', 'masturbate right here');
    expect(animOf('creed')).toBe('selfTouch');
    expect(sim.hasStatus('creed', 'censored')).toBe(false);
    for (let i = 0; i < 55; i++) {
      sim.update(0.1);
      director.update(0.1);
    }
    expect(sim.hasStatus('creed', 'censored')).toBe(false);
    expect(sim.hasStatus('creed', 'scandal')).toBe(true);

    // 4. Story safety: tryModelWildAct is blocked under carefulOrders/pinned, enabled in sandbox
    sim.removeStatus('meredith', 'naked');
    const storyDir = new Director({ sim, brain: instinct, instinct, carefulOrders: () => true });
    expect((storyDir as unknown as { tryModelWildAct: (w: string, p: { kind: string; target: null; about: string }) => boolean })
      .tryModelWildAct('meredith', { kind: 'wander', target: null, about: 'strip naked on a whim' })).toBe(false);
    expect((director as unknown as { tryModelWildAct: (w: string, p: { kind: string; target: null; about: string }) => boolean })
      .tryModelWildAct('meredith', { kind: 'wander', target: null, about: 'strip naked on a whim' })).toBe(true);
    expect(sim.hasStatus('meredith', 'naked')).toBe(true);
  });

  it('scales Unleashed scene line counts for deeper arcs while keeping system prompt compact', async () => {
    const gameBook = new PromptBook(new WorldIndex(OFFICE_WORLD));
    expect(gameBook.system('scene').split(/\s+/).length).toBeLessThan(1900);

    const { sim } = makeSim({ dayMinutes: 10, seed: 91, sandbox: false });
    for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
    const instinct = new InstinctBrain(GAME_BANK as LooseBank, OFFICE_WORLD, createRng(91));
    runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);

    const seenReqs: SceneRequest[] = [];
    const mockBrain: Brain = {
      kind: 'ollama',
      autonomous: true,
      async status() { return { provider: 'ollama', ok: true, model: 'artemis-custom', models: ['artemis-custom'] }; },
      async scene(req) {
        seenReqs.push(req);
        return {
          lines: req.people.slice(0, 2).map((p, idx) => ({
            who: p.id,
            say: `Line ${idx + 1} keeping the tension high.`,
            feel: 'mischievous' as const,
            to: req.people[1 - idx]?.id ?? null,
            act: 'tease' as const
          })),
          summary: 'The scene escalated.',
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
    const bullpen = walkableTilesIn('bullpen');
    sim.teleport('jim', bullpen[1]);
    sim.teleport('pam', bullpen[2]);
    sim.teleport('dwight', bullpen[3]);

    const pump = async (targetCount: number) => {
      for (let i = 0; i < 220; i++) {
        sim.update(0.1);
        director.update(0.1);
        await Promise.resolve();
        await Promise.resolve();
        if (seenReqs.length >= targetCount) break;
      }
    };

    sim.requestScene({ people: ['jim', 'pam'], room: 'bullpen', trigger: 'ambient', why: 'Jim and Pam chat.', priority: 1 });
    await pump(1);
    sim.requestScene({ people: ['jim', 'pam', 'dwight'], room: 'bullpen', trigger: 'event', why: 'Three-way showdown.', priority: 9 });
    await pump(2);

    expect(seenReqs[0].minLines).toBeGreaterThanOrEqual(3);
    expect(seenReqs[0].maxLines).toBeGreaterThanOrEqual(5);
    expect(seenReqs[1].minLines).toBeGreaterThanOrEqual(5);
    expect(seenReqs[1].maxLines).toBeGreaterThanOrEqual(7);
  });

  it('stages kink, blackmail, voyeur, tabletop strip, public sex lingering nudity, and uncuff recovery cleanly', () => {
    const { sim } = makeSim({ dayMinutes: 10, seed: 95, sandbox: false });
    for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
    const instinct = new InstinctBrain(GAME_BANK as LooseBank, OFFICE_WORLD, createRng(95));
    runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);
    const director = new Director({ sim, brain: instinct, instinct });
    director.reset();

    const peopleList = sim.people().map((p) => ({ id: p.id, name: p.name, room: p.room }));
    const roomsList = [{ id: 'bullpen', name: 'Bullpen' }, { id: 'annex', name: 'Annex' }];
    const interpret = (actorId: string, text: string) => instinct.interpretDirectiveNow({
      id: 'd-test',
      actor: { id: actorId, name: sim.person(actorId)!.name, room: 'bullpen' },
      kind: 'cue',
      text,
      people: peopleList,
      rooms: roomsList
    });

    expect(interpret('meredith', 'handcuff creed').verb).toBe('romance');
    expect(interpret('meredith', 'whip creed').verb).toBe('romance');
    expect(interpret('creed', 'worship meredith').verb).toBe('romance');
    expect(interpret('ryan', 'blackmail kelly').verb).toBe('romance');
    expect(interpret('kevin', 'peep on pam').verb).toBe('romance');
    expect(interpret('kelly', 'table dance and strip').verb).toBe('expose');
    expect(interpret('meredith', 'lick creed').verb).toBe('romance');
    expect(interpret('meredith', 'uncuff creed')).toMatchObject({ verb: 'recover', item: 'unbind' });

    const bullpen = walkableTilesIn('bullpen');
    const step = (sec: number) => {
      for (let i = 0; i < Math.ceil(sec / 0.1); i++) {
        sim.update(0.1);
        director.update(0.1);
      }
    };
    const stepUntil = (cond: () => boolean, maxSec = 10) => {
      for (let i = 0; i < Math.ceil(maxSec / 0.1); i++) {
        sim.update(0.1);
        director.update(0.1);
        if (cond()) return;
      }
    };

    // 1. Handcuff -> bound + dominated statuses (no censor overlay) + speed penalty + uncuff recovery
    sim.teleport('meredith', bullpen[2]);
    sim.teleport('creed', bullpen[3]);
    const creedObj = sim.byId('creed')!;
    const normalSpeed = sim.speedMult(creedObj);
    director.cue('meredith', 'handcuff creed');
    stepUntil(() => sim.hasStatus('creed', 'bound') && sim.hasStatus('creed', 'dominated'));
    expect(sim.hasStatus('creed', 'bound')).toBe(true);
    expect(sim.hasStatus('creed', 'dominated')).toBe(true);
    expect(sim.speedMult(creedObj)).toBeLessThan(normalSpeed);

    director.cue('meredith', 'uncuff creed');
    stepUntil(() => !sim.hasStatus('creed', 'bound') && !sim.hasStatus('creed', 'dominated'));
    expect(sim.hasStatus('creed', 'bound')).toBe(false);
    expect(sim.hasStatus('creed', 'dominated')).toBe(false);

    // 2. Blackmail -> blackmailed status + fact
    sim.teleport('ryan', bullpen[2]);
    sim.teleport('kelly', bullpen[3]);
    director.cue('ryan', 'blackmail kelly');
    stepUntil(() => sim.hasStatus('kelly', 'blackmailed') && sim.facts().some((f) => f.includes('blackmailing Kelly')));
    expect(sim.hasStatus('kelly', 'blackmailed')).toBe(true);
    expect(sim.facts().some((f) => f.includes('blackmailing Kelly'))).toBe(true);

    // 3. Tabletop strip -> naked + exhibitionist (uncensored)
    sim.teleport('kelly', bullpen[4]);
    director.cue('kelly', 'table dance and strip naked');
    step(6.0);
    expect(sim.hasStatus('kelly', 'naked')).toBe(true);
    expect(sim.hasStatus('kelly', 'exhibitionist')).toBe(true);

    // 4. Voyeur peep on -> voyeur + aroused
    sim.teleport('kevin', bullpen[2]);
    sim.teleport('pam', bullpen[3]);
    director.cue('kevin', 'peep on pam');
    stepUntil(() => sim.hasStatus('kevin', 'voyeur') && sim.hasStatus('kevin', 'aroused'));
    expect(sim.hasStatus('kevin', 'voyeur')).toBe(true);
    expect(sim.hasStatus('kevin', 'aroused')).toBe(true);

    // 5. Public sex -> naked lingers afterward
    sim.teleport('meredith', bullpen[2]);
    sim.teleport('creed', bullpen[3]);
    director.cue('meredith', 'have sex with creed right here');
    stepUntil(() => sim.hasStatus('meredith', 'naked') && sim.hasStatus('creed', 'naked') && sim.hasStatus('meredith', 'afterglow'), 12);
    expect(sim.hasStatus('meredith', 'naked')).toBe(true);
    expect(sim.hasStatus('creed', 'naked')).toBe(true);
    expect(sim.hasStatus('meredith', 'afterglow')).toBe(true);
  });

  it('executes all 9 new model stageActions via Director and blocks blackmail under carefulOrders', () => {
    const { sim } = makeSim({ dayMinutes: 10, seed: 99, sandbox: false });
    for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
    const instinct = new InstinctBrain(GAME_BANK as LooseBank, OFFICE_WORLD, createRng(99));
    runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);

    const storyDir = new Director({ sim, brain: instinct, instinct, carefulOrders: () => true });
    expect((storyDir as unknown as { executeModelStageAction: (a: { kind: string; actor: string; target: string; detail: string }) => boolean })
      .executeModelStageAction({ kind: 'blackmail', actor: 'ryan', target: 'kelly', detail: 'dirt' })).toBe(false);

    const director = new Director({ sim, brain: instinct, instinct });
    director.reset();
    const exec = director as unknown as {
      lastModelActionAt: number;
      executeModelStageAction: (a: { kind: string; actor: string; target: string | null; detail: string }) => boolean;
    };
    const bullpen = walkableTilesIn('bullpen');
    for (const kind of ['whip', 'tie_up', 'worship', 'dominate', 'lick', 'table_dance', 'blackmail', 'peep', 'exhibit'] as const) {
      exec.lastModelActionAt = -999;
      sim.teleport('meredith', bullpen[2]);
      sim.teleport('creed', bullpen[3]);
      expect(exec.executeModelStageAction({ kind, actor: 'meredith', target: 'creed', detail: `do ${kind}` })).toBe(true);
      director.reset();
    }
  });
});
