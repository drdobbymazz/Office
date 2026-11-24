import { describe, expect, it } from 'vitest';
import type { Brain, SceneRequest } from '@/game/brain/api';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import { NameMap } from '@/game/brain/names';
import { PromptBook } from '@/game/brain/prompts';
import { WorldIndex } from '@/game/brain/world';
import { BANK, WORLD as GAME_WORLD } from '@/game/core/content';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { ChemistryBook, chemistryLabel } from '@/game/sim/chemistry';
import { cleanSave } from '@/game/sim/save';
import { Director } from '@/game/director/director';
import { classifyRomanceTier } from '@/game/director/directives';
import { createRng } from '@/game/sim/rng';
import { TARGET_ROOMS } from '@/game/core/types';
import { room as roomDef, setWorldLocation, walkableTilesIn } from '@/game/core/world';
import { makeSim, runUntil } from '../sim/helpers';

function makeOffice(seed = 21) {
  const { sim, bus } = makeSim({ dayMinutes: 10, seed, sandbox: false });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  const brain = new InstinctBrain(BANK as LooseBank, GAME_WORLD, createRng(seed));
  const director = new Director({ sim, brain, instinct: brain });
  const feed: string[] = [];
  const beats: string[] = [];
  bus.on('feed', (f) => {
    feed.push(f.text);
    if (f.beat) beats.push(f.text);
  });
  runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);
  director.reset();
  feed.length = 0;
  beats.length = 0;
  const advance = (seconds: number, stopWhen?: () => boolean): void => {
    const steps = Math.ceil(seconds / 0.1);
    for (let i = 0; i < steps; i++) {
      sim.update(0.1);
      director.update(0.1);
      if (stopWhen?.()) break;
    }
  };
  return { sim, director, brain, feed, beats, advance };
}

describe('chemistry & secret flings', () => {
  it('seeds canonical chemistry and secret flings while keeping Dwight/Pam chemistry at 0', () => {
    const book = new ChemistryBook();
    expect(book.score('jim', 'pam')).toBe(82);
    expect(book.score('dwight', 'angela')).toBe(74);
    expect(book.score('toby', 'pam')).toBe(62);
    expect(book.score('dwight', 'pam')).toBe(0);
    expect(book.isFling('dwight', 'angela')).toBe(true);
    expect(book.isFling('jim', 'pam')).toBe(false);
    expect(chemistryLabel(book.score('kelly', 'ryan'))).toBe('head over heels for');

    expect(book.shift('ryan', 'kelly', 30)).toBe(68);
    expect(book.markFling('jim', 'pam')).toBe(true);
    expect(book.isFling('jim', 'pam')).toBe(true);
  });

  it('persists chemistry and flings across serialize/cleanSave/load backwards-compatibly', () => {
    const { sim } = makeOffice(22);
    sim.shiftChemistry('pam', 'jim', 12);
    sim.markFling('kelly', 'ryan');
    const saved = sim.serialize();
    expect(saved.chemistry?.['pam>jim']).toBe(94);
    expect(saved.flings?.some(([a, b]) => (a === 'kelly' && b === 'ryan') || (a === 'ryan' && b === 'kelly'))).toBe(true);

    // Legacy save without chemistry/flings still loads seeded defaults cleanly
    const legacy = cleanSave({ day: 2, dayDone: false, bonds: {}, memories: {}, takeaways: {}, meters: { stock: 100, stockHistory: [], morale: 50 }, incidentFreeDays: 1, incidentsTotal: 0, revealedSecrets: [] });
    expect(legacy).not.toBeNull();
    const { sim: loaded } = makeSim({ dayMinutes: 10, seed: 22, save: cleanSave(saved) });
    expect(loaded.chemistry('pam', 'jim')).toBe(94);
    expect(loaded.isFling('kelly', 'ryan')).toBe(true);
    const { sim: fromLegacy } = makeSim({ dayMinutes: 10, seed: 22, save: legacy });
    expect(fromLegacy.chemistry('jim', 'pam')).toBe(82);
    expect(fromLegacy.isFling('dwight', 'angela')).toBe(true);
  });

  it('boosts lasting chemistry when firing Cupid Arrow chaos', () => {
    const { sim, advance } = makeOffice(24);
    const before = sim.chemistry('kevin', 'oscar');
    sim.startChaos('love', { who: 'kevin', other: 'oscar' }, { force: true });
    advance(1);
    expect(sim.hasStatus('kevin', 'love')).toBe(true);
    expect(sim.chemistry('kevin', 'oscar')).toBeGreaterThanOrEqual(before + 40);
  });
});

describe('tiered romance, rendezvous, walk-ins, jealousy & HR fallout', () => {
  it('classifies romance directives into flirt, bold, rendezvous, matchmaker, and jealousy tiers', () => {
    expect(classifyRomanceTier('wink at pam')).toBe('flirt');
    expect(classifyRomanceTier('flirt with ryan')).toBe('flirt');
    expect(classifyRomanceTier('kiss pam')).toBe('bold');
    expect(classifyRomanceTier('seduce pam')).toBe('bold');
    expect(classifyRomanceTier('sneak away with pam')).toBe('rendezvous');
    expect(classifyRomanceTier('hook up with ryan')).toBe('rendezvous');
    expect(classifyRomanceTier('play matchmaker for jim and pam')).toBe('matchmaker');
    expect(classifyRomanceTier('make toby jealous')).toBe('jealousy');
  });

  it('stages subtle flirt with flustered status and gentle chemistry boost', () => {
    const { sim, director, advance } = makeOffice(31);
    const before = sim.chemistry('ryan', 'kelly');
    director.cue('ryan', 'wink at kelly');
    advance(35, () => sim.hasStatus('kelly', 'flustered'));
    expect(sim.hasStatus('kelly', 'flustered')).toBe(true);
    expect(sim.chemistry('ryan', 'kelly')).toBe(before + 10);
  });

  it('triggers jealousy when Toby or Jim witnesses bold romantic moves on Pam', () => {
    const { sim, director, feed, advance } = makeOffice(33);
    const bullpenTiles = walkableTilesIn('bullpen');
    sim.teleport('michael', bullpenTiles[2]);
    sim.teleport('pam', bullpenTiles[3]);
    sim.teleport('jim', bullpenTiles[4]);
    const jimBondBefore = sim.bond('jim', 'michael');
    director.cue('michael', 'kiss pam');
    advance(25, () => sim.bond('jim', 'michael') < jimBondBefore);
    expect(sim.bond('jim', 'michael')).toBeLessThan(jimBondBefore);
    expect(feed.some((line) => line.includes('Jim') && line.includes('glares jealously'))).toBe(true);
  });

  it('completes private rendezvous cleanly with fling & flustered statuses when undisturbed', () => {
    const { sim, director, beats, advance } = makeOffice(37);
    expect(sim.isFling('jim', 'pam')).toBe(false);
    // Keep others away from private rooms so nobody walks in during the test
    const bullpenTile = walkableTilesIn('bullpen')[0];
    for (const p of sim.people()) {
      if (p.id !== 'jim' && p.id !== 'pam' && p.present) {
        sim.teleport(p.id, bullpenTile);
        sim.addStatus(p.id, 'frozen', 60);
      }
    }
    director.cue('jim', 'sneak away with pam');
    advance(40, () => sim.isFling('jim', 'pam'));
    expect(sim.isFling('jim', 'pam')).toBe(true);
    expect(sim.hasStatus('jim', 'flustered')).toBe(true);
    expect(sim.hasStatus('pam', 'flustered')).toBe(true);
    expect(sim.hasStatus('jim', 'afterglow')).toBe(true);
    expect(sim.hasStatus('pam', 'afterglow')).toBe(true);
    expect(beats.some((b) => b.includes('Jim') && b.includes('Pam') && b.includes('completely normal'))).toBe(true);
    expect(sim.hasStatus('jim', 'scandal')).toBe(false);
  });

  it('triggers Caught in the Act scandal, past-tense memory, and HR Love Contract when walked in on', () => {
    const { sim, director, beats, advance } = makeOffice(41);
    const meetingTiles = walkableTilesIn('meeting');
    // Freeze unrelated staff in bullpen except Angela and Toby
    const bullpenTile = walkableTilesIn('bullpen')[0];
    for (const p of sim.people()) {
      if (!['jim', 'pam', 'angela', 'toby'].includes(p.id) && p.present) {
        sim.teleport(p.id, bullpenTile);
        sim.addStatus(p.id, 'frozen', 80);
      }
    }
    // Force destination room by clearing all private rooms except leaving Angela ready to walk into meeting
    for (const p of [sim.person('angela'), sim.person('toby')]) {
      if (p) sim.teleport(p.id, bullpenTile);
    }
    director.cue('jim', 'hook up with pam in the conference room');
    advance(25, () => sim.person('jim')?.room === 'meeting' && sim.person('pam')?.room === 'meeting' && sim.hasStatus('jim', 'flustered'));
    // Walk Angela straight into the conference room mid-rendezvous
    sim.teleport('angela', meetingTiles[0]);
    advance(2, () => sim.hasStatus('jim', 'scandal'));
    expect(sim.hasStatus('jim', 'scandal')).toBe(true);
    expect(sim.hasStatus('pam', 'scandal')).toBe(true);
    expect(beats.some((b) => b.includes('Angela') && b.includes('caught') && b.includes('in the act'))).toBe(true);
    expect(sim.facts().some((f) => f.includes('caught Jim and Pam sneaking around'))).toBe(true);

    // Push scandal heat across HR Love Contract threshold (meredith strips in meeting -> +2 heat -> >= 3)
    const meredith = sim.person('meredith');
    if (meredith) {
      sim.removeStatus('meredith', 'frozen');
      sim.teleport('meredith', meetingTiles[1]);
      director.cue('meredith', 'strip naked');
      advance(10, () => beats.some((b) => b.includes('Relationship Disclosure Form')));
      expect(beats.some((b) => b.includes('Relationship Disclosure Form'))).toBe(true);
      // Verify dressed-again clearing still leaves NO naked facts once Meredith gets dressed
      director.cue('meredith', 'put your clothes back on');
      expect(sim.hasStatus('meredith', 'naked')).toBe(false);
      expect(sim.facts().some((f) => f.includes('Meredith') && f.toLowerCase().includes('naked'))).toBe(false);
    }
  });
});

describe('context-sensitive compliance', () => {
  it('respects chemistry, secret flings, privacy, and park context while preserving unwanted-advance refusals', () => {
    const { sim, brain } = makeOffice(55);
    const makeDelegationReq = (asker: 'jim' | 'dwight' | 'angela', target: 'pam' | 'angela', command: string, extraFacts: string[] = []): SceneRequest => ({
      id: 'comp-test',
      day: 1,
      clock: '14:00',
      place: 'Conference Room',
      trigger: 'cue',
      why: `${asker} asks ${target} to ${command}.`,
      people: [sim.briefFor(asker, [target]), sim.briefFor(target, [asker])],
      onlookers: [],
      facts: ['It is Monday, 14:00.', ...extraFacts],
      recent: [],
      minLines: 2,
      maxLines: 3,
      chaos: 0.2,
      delegation: { asker, target, tone: 'ask', action: command, command, depth: 0 }
    });

    // Dwight <-> Angela secret fling lowers inhibition for romance & private exposure
    expect(brain.decideComplianceFor(makeDelegationReq('dwight', 'angela', 'sneak away with me'), 'angela')).toBe(true);
    expect(brain.decideComplianceFor(makeDelegationReq('dwight', 'angela', 'strip naked', ['They are alone together in the annex with nobody else watching.']), 'angela')).toBe(true);

    // High-chemistry Jim -> Pam complies with romantic request
    expect(brain.decideComplianceFor(makeDelegationReq('jim', 'pam', 'kiss me'), 'pam')).toBe(true);

    // Unwanted advance (Dwight -> Pam, 0 chemistry) MUST still refuse even in party/park context
    setWorldLocation('park');
    try {
      expect(brain.decideComplianceFor(makeDelegationReq('dwight', 'pam', 'massage him', ['Everyone is outdoors at Scranton Community Park, away from the usual office rules.']), 'pam')).toBe(false);
      expect(TARGET_ROOMS.length).toBeGreaterThan(0);
    } finally {
      setWorldLocation('office');
    }

    // Aroused status lowers inhibitions for neutral/warm partner, still refuses cold unwanted advances
    sim.addStatus('ryan', 'aroused', 60);
    expect(brain.decideComplianceFor({
      ...makeDelegationReq('jim', 'pam', 'kiss me'),
      people: [sim.briefFor('jim', ['ryan']), sim.briefFor('ryan', ['jim'])],
      delegation: { asker: 'jim', target: 'ryan', tone: 'ask', action: 'kiss me', command: 'kiss me', depth: 0 }
    }, 'ryan')).toBe(true);

    // InstinctBrain generates explicit adult workplace-comedy dialogue for caught walk-ins, streaking, rendezvous, and spicy delegations
    const caughtScene = brain.sceneNow({
      id: 'caught-dialogue',
      day: 1,
      clock: '14:10',
      place: 'Conference Room',
      trigger: 'aftermath',
      why: 'Angela just threw open the door to Conference Room and caught Jim and Pam half-undressed and hooking up in the act.',
      people: [sim.briefFor('angela', ['jim', 'pam']), sim.briefFor('jim', ['angela', 'pam']), sim.briefFor('pam', ['angela', 'jim'])],
      onlookers: [],
      facts: ['It is Monday, 14:10.'],
      recent: [],
      minLines: 2,
      maxLines: 3,
      chaos: 0.4
    });
    expect(caughtScene.lines.length).toBeGreaterThanOrEqual(2);
    expect(caughtScene.lines[0].say).toMatch(/clothes|pants|motel|corporate/i);
    expect(caughtScene.summary).toMatch(/half-undressed|caught/i);

    const exposeScene = brain.sceneNow({
      id: 'expose-dialogue',
      day: 1,
      clock: '14:15',
      place: 'Bullpen',
      trigger: 'aftermath',
      why: 'Meredith just physically strips naked right in the middle of Bullpen in front of everyone and is standing there completely naked right now. (Meredith stripped themselves - Meredith did NOT ask anyone else to strip.) Everyone reacts to seeing Meredith naked.',
      people: [sim.briefFor('meredith', ['angela']), sim.briefFor('angela', ['meredith'])],
      onlookers: [],
      facts: ['It is Monday, 14:15.'],
      recent: [],
      minLines: 2,
      maxLines: 2,
      chaos: 0.5
    });
    expect(exposeScene.lines[0].say).toMatch(/Casual Friday|bra|free/i);
    expect(exposeScene.lines[1].say).toMatch(/clothes|strip club|burning/i);

    const refusedSpicy = brain.sceneNow(makeDelegationReq('dwight', 'pam', 'strip naked'));
    expect(refusedSpicy.complies).toBe(false);
    expect(refusedSpicy.lines.some((l) => /creepiness|calling HR|hard pass|pervert/i.test(l.say))).toBe(true);
  });
});

describe('full model-driven pipeline', () => {
  it('injects situation-specific R-rated comedy guidance into PromptBook system & sceneUser prompts', () => {
    const { sim } = makeOffice(61);
    const index = new WorldIndex({ setting: 'Dunder Mifflin Scranton', people: [], rooms: [] });
    const book = new PromptBook(index);
    expect(book.system('scene')).toContain('hot and bothered');
    expect(book.system('minds')).toContain('hot and bothered');
    expect(book.system('report')).toContain('HR Love Contracts');
    expect(book.system('saga')).toContain('HR Love Contracts');

    const names = new NameMap([
      { id: 'angela', name: 'Angela Martin' },
      { id: 'jim', name: 'Jim Halpert' },
      { id: 'pam', name: 'Pam Beesly' }
    ]);
    const caughtUser = book.sceneUser({
      id: 'p1',
      day: 1,
      clock: '13:05',
      place: 'Conference Room',
      trigger: 'aftermath',
      why: 'Angela just threw open the door and caught Jim and Pam half-undressed and hooking up in the act.',
      people: [sim.briefFor('angela', ['jim', 'pam']), sim.briefFor('jim', ['angela', 'pam'])],
      onlookers: [],
      facts: ['It is Monday, 13:05.'],
      recent: [],
      minLines: 2,
      maxLines: 3,
      chaos: 0.4
    }, names);
    expect(caughtUser).toContain('frantic zipping up');

    const afterglowUser = book.sceneUser({
      id: 'p2',
      day: 1,
      clock: '13:15',
      place: 'Annex',
      trigger: 'aftermath',
      why: 'Jim and Pam just finished a steamy secret hookup alone in the annex.',
      people: [sim.briefFor('jim', ['pam']), sim.briefFor('pam', ['jim'])],
      onlookers: [],
      facts: ['It is Monday, 13:15.'],
      recent: [],
      minLines: 2,
      maxLines: 3,
      chaos: 0.3
    }, names);
    expect(afterglowUser).toContain('post-hookup afterglow');
  });

  it('surfaces crushes/flings to LlmBrain scenes & triggers autonomous private rendezvous and arousal from model outputs', async () => {
    const { sim, bus } = makeSim({ dayMinutes: 10, seed: 63, sandbox: false });
    for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
    const instinct = new InstinctBrain(BANK as LooseBank, GAME_WORLD, createRng(63));
    const beats: string[] = [];
    bus.on('feed', (f) => { if (f.beat) beats.push(f.text); });

    const bullpenTiles = walkableTilesIn('bullpen');
    runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);
    // Put everyone unrelated away except Jim, Pam, and Toby observing in bullpen
    sim.teleport('jim', bullpenTiles[2]);
    sim.teleport('pam', bullpenTiles[3]);
    sim.teleport('toby', bullpenTiles[4]);
    const sceneReqs: SceneRequest[] = [];
    const mockBrain: Brain = {
      kind: 'ollama',
      autonomous: true,
      async status() { return { provider: 'ollama', ok: true, model: 'mock', models: ['mock'] }; },
      async scene(req) {
        sceneReqs.push(req);
        return {
          lines: [
            { who: req.people[0].id, say: 'Come sneak into the annex with me right now.', feel: 'love', to: req.people[1]?.id ?? null, act: 'step_closer' },
            ...(req.people[1] ? [{ who: req.people[1].id, say: 'Lead the way.', feel: 'mischievous' as const, to: req.people[0].id, act: 'nod' as const }] : [])
          ],
          summary: 'Jim and Pam slipped off toward the annex.',
          shifts: req.people[1] ? [{ who: req.people[0].id, about: req.people[1].id, change: 'fancies' }] : [],
          plans: [{ who: 'jim', plan: { kind: 'flirt', target: 'pam', about: 'sneak away to the annex for a quickie' } }],
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

    // Ask Jim to flirt with Pam while Toby (crush on Pam) is in the same room -> buildRequest surfaces Toby in briefFor
    sim.requestScene({ people: ['jim', 'pam'], room: 'bullpen', trigger: 'plan', planKind: 'flirt', why: 'Jim goes to flirt with Pam.', priority: 8 });
    for (let i = 0; i < 160; i++) {
      sim.update(0.1);
      director.update(0.1);
      await Promise.resolve();
      await Promise.resolve();
      if (sim.hasStatus('jim', 'aroused') && beats.some((b) => b.includes('quickie'))) break;
    }
    expect(sceneReqs.length).toBeGreaterThanOrEqual(1);
    const jimFeelings = sceneReqs[0].people.find((p) => p.id === 'jim')?.feelings ?? [];
    expect(jimFeelings.some((f) => f.about === 'toby' || f.about === 'pam')).toBe(true);
    // Model returned shift 'fancies' + flirt plan mentioning sneaking away -> boosts chemistry, sets aroused, and starts private rendezvous!
    expect(sim.chemistry('jim', 'pam')).toBeGreaterThan(82);
    expect(sim.hasStatus('jim', 'aroused')).toBe(true);
    expect(beats.some((b) => b.includes('Jim') && b.includes('Pam') && b.includes('quickie'))).toBe(true);
  });
});
