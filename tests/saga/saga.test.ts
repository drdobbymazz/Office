import { describe, expect, it } from 'vitest';
import { splitHook } from '@/components/game/screenLogic';
import { costOf } from '@/components/game/Story';
import type { ChatResponse, ChatTransport } from '@/game/brain/api';
import { DEFAULT_BRAIN_SETTINGS } from '@/game/brain/api';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import { LlmBrain } from '@/game/brain/llmBrain';
import { PromptBook } from '@/game/brain/prompts';
import { WorldIndex } from '@/game/brain/world';
import { Bus, type GameEvents } from '@/game/core/bus';
import { BANK } from '@/game/core/content';
import { isCastId } from '@/game/core/types';
import { ROOMS } from '@/game/core/world';
import { SAGA_ARCS, SAGA_EXTRAS, Saga, SagaDay } from '@/game/saga';
import { createSim } from '@/game/sim';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { createRng } from '@/game/sim/rng';
import { memoryStore } from '@/game/story';
import { WORLD } from '../story/harness';

const VALID_ROOMS = new Set<string>(ROOMS.map((r) => r.id));

function bootSagaDay(saga: Saga, sandbox = true) {
  const bus = new Bus<GameEvents>();
  const brain = new InstinctBrain(BANK as LooseBank, WORLD, createRng(saga.simSeed() + 7));
  const sim = createSim({
    bus,
    reflexes: brain,
    seed: saga.simSeed(),
    dayMinutes: 10,
    sandbox,
    save: saga.daySave(),
    now: () => 0
  });
  for (const sc of CHAOS_SCRIPTS) sim.registerChaos(sc);
  const absDay = (saga.season - 1) * 5 + saga.chapter;
  if (sim.day !== absDay) sim.beginDay(absDay);
  saga.recordStart(sim.serialize());
  const goals: { title: string; state: string; main: boolean }[] = [];
  const day = saga.beginDay(sim, {
    onGoal: (g) => goals.push({ title: g.title, state: g.state, main: g.main })
  });
  return { sim, day, goals, brain };
}

describe('Endless Saga arcs & content integrity', () => {
  it('defines 6 complete 5-day arcs with valid cast IDs, rooms, extras, hints, and crisp hooks', () => {
    expect(SAGA_ARCS).toHaveLength(6);
    const arcIds = new Set(SAGA_ARCS.map((a) => a.id));
    expect(arcIds.size).toBe(6);

    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const goalIds = new Set<string>();
    for (const arc of SAGA_ARCS) {
      expect(arc.chapters).toHaveLength(5);
      arc.chapters.forEach((ch, idx) => {
        expect(ch.chapter).toBe(idx + 1);
        expect(ch.weekday).toBe(weekdays[idx]);
        expect(goalIds.has(ch.goalInfo.id)).toBe(false);
        goalIds.add(ch.goalInfo.id);

        const { hook } = splitHook(ch.intro);
        expect(hook.length).toBeGreaterThan(10);
        expect(hook.length).toBeLessThan(155);

        for (const f of ch.featured) expect(isCastId(f.id)).toBe(true);
        if (ch.convictions) for (const c of ch.convictions) expect(isCastId(c.who)).toBe(true);
        if (ch.sparkBond) {
          for (const b of ch.sparkBond) {
            expect(isCastId(b.who)).toBe(true);
            expect(isCastId(b.about)).toBe(true);
          }
        }
        if (ch.goal.kind === 'gather') expect(VALID_ROOMS.has(ch.goal.room)).toBe(true);
        if (ch.goal.kind === 'bond_shift') {
          expect(isCastId(ch.goal.who)).toBe(true);
          expect(isCastId(ch.goal.about)).toBe(true);
        }
        if (ch.goalInfo.room) expect(VALID_ROOMS.has(ch.goalInfo.room)).toBe(true);
        if (ch.midday?.room) expect(VALID_ROOMS.has(ch.midday.room)).toBe(true);

        for (const ex of ch.extras) expect(SAGA_EXTRAS[ex]).toBeDefined();
        expect(ch.hints.length).toBeGreaterThan(0);
        expect(ch.suggest.whisper.length).toBeGreaterThan(0);
        expect(ch.suggest.announce.length).toBeGreaterThan(0);
        expect(ch.topics.length).toBeGreaterThan(0);
      });
    }
  });
});

describe('Endless Saga season lifecycle, freedom, and reactive twists', () => {
  it('runs a full 5-day season with zero locks/costs, reactiveStanding modifiers, accuse, retry, and Season 2 rollover', () => {
    const store = memoryStore();
    const saga = Saga.create(store, 12345);
    // Lock onto corporate_audit for deterministic Thursday accuse + Friday tour assertions.
    saga.state.arcId = 'corporate_audit';
    saga.state.arcQueue = ['documentary_crew', 'murder_mystery', 'hostile_takeover', 'office_civil_war', 'cursed_building'];
    saga.save();

    // ── Monday: free powers, wildcard + plot_twist bonus, reactive elimination twist ──
    const d1 = bootSagaDay(saga, true);
    const ui1 = saga.ui(d1.day);
    expect(ui1.saga?.season).toBe(1);
    expect(ui1.costs).toEqual({});
    expect(ui1.locked).toEqual({});
    expect(costOf(ui1, 'fire')).toBeNull();
    expect(costOf(ui1, 'anything')).toBeNull();

    // Step forward until staff enter the floor (~18 sim seconds).
    for (let t = 0; t < 200; t++) {
      d1.sim.update(0.1);
      d1.day.update(0.1);
    }

    // All powers and Anything stunts fire freely with no influence refusal.
    expect(d1.sim.startChaos('fire', { room: 'bullpen' })).toBeNull();
    expect(d1.sim.startChaos('pizza', {})).toBeNull();
    d1.day.note({ kind: 'anything', text: 'a flaming espresso cart barrels down the hall' });
    for (const who of ['dwight', 'jim', 'pam'] as const) {
      d1.sim.pickUp(who);
      d1.sim.drop(0, 0);
    }
    d1.sim.addStatus('jim', 'eliminated', 9999);
    d1.day.update(0.1);

    expect(d1.day.reactiveTwist).toBeTruthy();
    expect(d1.sim.facts().some((f) => f.includes('espresso cart') || f.includes('elimination'))).toBe(true);
    expect(d1.day.extraState('wildcard')).toBe('won');
    expect(d1.day.extraState('hands_on')).toBe('won');

    const res1 = saga.finishDay(d1.day, d1.sim.serialize());
    expect(res1.extras).toContain("Overseer's signature");
    expect(res1.extras).toContain('Invisible hand');
    expect(res1.changes.some((c) => c.delta === 3)).toBe(true);
    expect(res1.changes.some((c) => c.delta === 2 && c.text.includes('wildcard'))).toBe(true);
    expect(res1.changes.some((c) => c.delta === -4 && c.text.includes('HR probe'))).toBe(true);

    // Retry resets standing cleanly back to Monday morning.
    const beforeRetryStanding = saga.standing;
    expect(beforeRetryStanding).not.toBe(40);
    saga.retry();
    expect(saga.standing).toBe(40);
    expect(saga.stage).toBe('day');
    d1.day.dispose();

    // Re-finish Monday quickly to advance through Tuesday -> Thursday.
    const d1b = bootSagaDay(saga, true);
    saga.finishDay(d1b.day, d1b.sim.serialize());
    d1b.day.dispose();
    expect(saga.advance()).toBe('next');
    expect(saga.chapter).toBe(2);

    // Finish Tue + Wed
    for (const ch of [2, 3]) {
      expect(saga.chapter).toBe(ch);
      const dx = bootSagaDay(saga, true);
      saga.finishDay(dx.day, dx.sim.serialize());
      dx.day.dispose();
      expect(saga.advance()).toBe('next');
    }

    // ── Thursday: Mole accusation works in Saga ──
    expect(saga.chapter).toBe(4);
    const d4 = bootSagaDay(saga, true);
    const wrong = saga.state.notes.mole === 'ryan' ? 'oscar' : 'ryan';
    d4.day.accuse(wrong);
    expect(d4.day.main).toBe('open');
    expect(d4.day.accuseUi()?.triesLeft).toBe(2);
    expect(d4.day.accuseUi()?.accused).toContain(wrong);

    d4.day.accuse(saga.state.notes.mole);
    expect(d4.day.main).toBe('won');
    expect(d4.day.accuseUi()).toBeNull();
    const res4 = saga.finishDay(d4.day, d4.sim.serialize());
    expect(res4.won).toBe(true);
    d4.day.dispose();
    expect(saga.advance()).toBe('next');

    // ── Friday -> Finale -> Start Season 2 ──
    expect(saga.chapter).toBe(5);
    const d5 = bootSagaDay(saga, true);
    saga.finishDay(d5.day, d5.sim.serialize());
    d5.day.dispose();
    expect(saga.advance()).toBe('ending');
    expect(saga.stage).toBe('ended');
    const ending = saga.ending();
    expect(ending.title).toContain('SEASON 1');

    // Roll into Season 2 and verify persisted snapshot via Saga.peek / Saga.load.
    saga.startNextSeason();
    expect(saga.season).toBe(2);
    expect(saga.chapter).toBe(1);
    expect(saga.arc.id).toBe('documentary_crew');
    expect(saga.standing).toBeGreaterThanOrEqual(30);
    expect(saga.standing).toBeLessThanOrEqual(68);
    expect(saga.endSnapshot).toBeTruthy();

    const uiS2 = saga.ui(null);
    expect(uiS2.saga?.history).toHaveLength(1);
    expect(uiS2.saga?.history[0].season).toBe(1);
    expect(uiS2.saga?.history[0].arcTitle).toBe('The Surprise Audit');

    const peeked = Saga.peek(store);
    expect(peeked?.season).toBe(2);
    expect(peeked?.arcTitle).toBe('Going Viral');
    const reloaded = Saga.load(store);
    expect(reloaded?.season).toBe(2);
    expect(reloaded?.arc.id).toBe('documentary_crew');
  });

  it('gives +3 ratings standing for peak chaos >= 75% in chaos-friendly arcs without incident penalties', () => {
    const store = memoryStore();
    const saga = Saga.create(store, 99);
    saga.state.arcId = 'documentary_crew';
    saga.save();

    const { sim, day } = bootSagaDay(saga, true);
    for (let t = 0; t < 200; t++) {
      sim.update(0.1);
      day.update(0.1);
    }
    // Pump chaos past 75% and verify plot_twist bonus goal in Going Viral Monday.
    sim.bumpChaos(82);
    day.note({ kind: 'anything', text: 'confetti cannons erupt from every ceiling tile' });
    day.update(0.1);
    expect(day.extraState('peak_mayhem')).toBe('won');
    expect(day.extraState('plot_twist')).toBe('won');
    const res = saga.finishDay(day, sim.serialize());
    day.dispose();

    expect(res.changes.some((c) => c.delta === 3 && c.text.includes('peak chaos'))).toBe(true);
    expect(res.changes.some((c) => c.delta < 0 && c.text.includes('workplace incident'))).toBe(false);
  });
});

describe('Endless Saga AI Showrunner integration', () => {
  const sampleReq = {
    id: 'saga-1-2',
    season: 1,
    day: 2,
    weekday: 'Tuesday',
    arcTitle: 'The Surprise Audit',
    arcPremise: 'Corporate is poking through expense reports.',
    standing: 48,
    yesterday: {
      title: 'The Missing Receipts',
      won: true,
      chaosPeak: 84,
      incidents: 2,
      morale: 61,
      events: ['Fire (bullpen)', 'Jim was eliminated mid-shift'],
      log: ['Dwight: "False! The toaster did not explode!"']
    },
    tomorrow: {
      title: 'Accounting in Pieces',
      goalTitle: 'Patch up Accounting',
      goalDetail: 'Raise how well Angela feels about Oscar by +8 today.',
      featured: ['Angela', 'Oscar', 'Kevin']
    }
  };

  it('keeps PromptBook system("saga") cache-aligned and grounded with HOUSE_RULES', () => {
    const b1 = new PromptBook(new WorldIndex(WORLD));
    const b2 = new PromptBook(new WorldIndex(JSON.parse(JSON.stringify(WORLD))));
    const sys = b1.system('saga');
    expect(sys).toBe(b2.system('saga'));
    expect(sys.startsWith(b1.sharedPrefix)).toBe(true);
    expect(sys.trimEnd().endsWith('Never mention being an AI, a model, a game or a prompt.')).toBe(true);

    const user = b1.sagaUser(sampleReq);
    expect(user).toContain('SEASON 1, TUESDAY');
    expect(user).toContain('84%');
    expect(user).toContain('Jim was eliminated mid-shift');
  });

  it('parses LlmBrain.sagaEpisode JSON and applies it cleanly onto next SagaDay', async () => {
    const transport: ChatTransport = {
      kind: 'ollama',
      autonomous: true,
      status: async () => ({ ok: true, models: ['artemis-custom'] }),
      chat: async (): Promise<ChatResponse> => ({
        text: JSON.stringify({
          title: 'Ashes in the Ledger',
          recap: 'After yesterday\'s bullpen fire and Jim\'s abrupt elimination, nobody in Accounting slept.',
          hook: 'Angela locked the ledger drawer while Oscar demands answers from Michael.',
          twistFact: 'Soot from yesterday\'s fire still covers Accounting\'s balance sheets.',
          topics: ['Who sparked yesterday\'s bullpen fire?', 'Accounting refuses to agree on a single column.']
        }),
        stats: { ms: 20 }
      })
    };

    const brain = new LlmBrain({ ...DEFAULT_BRAIN_SETTINGS, baseUrl: 'http://127.0.0.1:11434' }, transport, {
      bank: BANK,
      world: WORLD
    });
    const ep = await brain.sagaEpisode(sampleReq);
    expect(ep.source).toBe('model');
    expect(ep.title).toBe('Ashes in the Ledger');
    expect(ep.topics).toHaveLength(2);

    const store = memoryStore();
    const saga = Saga.create(store, 7);
    saga.state.arcId = 'corporate_audit';
    saga.state.chapter = 2;
    saga.applyAiEpisode(1, 2, ep);

    const { sim, day } = bootSagaDay(saga);
    const ui = saga.ui(day);
    expect(ui.title).toBe('Ashes in the Ledger');
    expect(ui.saga?.aiCrafted).toBe(true);
    expect(ui.recap).toContain('bullpen fire');
    expect(sim.facts().some((f) => f.includes('Soot from yesterday'))).toBe(true);
    expect(day.topics()[0]).toContain('fire');
    day.dispose();
  });

  it('falls back to InstinctBrain.sagaEpisodeNow when offline', async () => {
    const offlineTransport: ChatTransport = {
      kind: 'ollama',
      autonomous: true,
      status: async () => ({ ok: false, models: [], error: 'offline' }),
      chat: async () => {
        throw new Error('ECONNREFUSED');
      }
    };
    const brain = new LlmBrain({ ...DEFAULT_BRAIN_SETTINGS, baseUrl: 'http://127.0.0.1:1' }, offlineTransport, {
      bank: BANK,
      world: WORLD
    });
    const ep = await brain.sagaEpisode(sampleReq);
    expect(ep.source).toBe('instinct');
    expect(ep.recap).toContain('84%');
    expect(ep.topics).toHaveLength(2);
  });
});
