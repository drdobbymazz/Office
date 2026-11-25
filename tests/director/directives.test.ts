import { describe, expect, it } from 'vitest';
import type { SceneRequest } from '@/game/brain/api';
import { Director } from '@/game/director/director';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import { BANK, WORLD as GAME_WORLD } from '@/game/core/content';
import { TARGET_ROOMS } from '@/game/core/types';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { room as roomDef, walkableTilesIn } from '@/game/core/world';
import { createRng } from '@/game/sim/rng';
import { makeSim, runUntil } from '../sim/helpers';

function makeOffice(seed = 11) {
  const { sim, bus } = makeSim({ dayMinutes: 10, seed, sandbox: false });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  const brain = new InstinctBrain(BANK as LooseBank, GAME_WORLD, createRng(seed));
  const director = new Director({ sim, brain, instinct: brain });
  const feed: string[] = [];
  const beats: string[] = [];
  const focuses: unknown[] = [];
  const chaos: string[] = [];
  bus.on('feed', (f) => {
    feed.push(f.text);
    if (f.beat) beats.push(f.text);
  });
  bus.on('focus', (f) => focuses.push(f));
  bus.on('chaosStart', (c) => chaos.push(c.id));
  runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);
  director.reset();
  feed.length = 0;
  beats.length = 0;
  focuses.length = 0;
  chaos.length = 0;
  const advance = (seconds: number, stopWhen?: () => boolean): void => {
    const steps = Math.ceil(seconds / 0.1);
    for (let i = 0; i < steps; i++) {
      sim.update(0.1);
      director.update(0.1);
      if (stopWhen?.()) break;
    }
  };
  const advanceAsync = async (seconds: number, stopWhen?: () => boolean): Promise<void> => {
    const steps = Math.ceil(seconds / 0.1);
    for (let i = 0; i < steps; i++) {
      sim.update(0.1);
      director.update(0.1);
      await Promise.resolve();
      await Promise.resolve();
      if (stopWhen?.()) break;
    }
  };
  return { sim, director, brain, feed, beats, focuses, chaos, advance, advanceAsync };
}

function directiveReq(text: string) {
  return {
    id: 'test-dir',
    actor: { id: 'dwight' as const, name: 'Dwight Schrute', room: 'bullpen' as const },
    kind: 'cue' as const,
    text,
    people: [
      { id: 'dwight' as const, name: 'Dwight Schrute', room: 'bullpen' as const },
      { id: 'jim' as const, name: 'Jim Halpert', room: 'bullpen' as const },
      { id: 'michael' as const, name: 'Michael Scott', room: 'boss' as const },
      { id: 'pam' as const, name: 'Pam Beesly', room: 'bullpen' as const },
      { id: 'angela' as const, name: 'Angela Martin', room: 'accounts' as const },
      { id: 'toby' as const, name: 'Toby Flenderson', room: 'annex' as const },
      { id: 'meredith' as const, name: 'Meredith Palmer', room: 'annex' as const }
    ],
    rooms: TARGET_ROOMS.map((id) => ({ id: id as string, name: roomDef(id).name }))
  };
}

describe('directive intent parsing', () => {
  it('classifies violent, physical, chaos, and social commands accurately', () => {
    const brain = new InstinctBrain(BANK as LooseBank, GAME_WORLD, createRng(1));
    expect(brain.interpretDirectiveNow(directiveReq('kill jim'))).toMatchObject({ verb: 'eliminate', targetPerson: 'jim' });
    expect(brain.interpretDirectiveNow(directiveReq('drag michael to the conference room'))).toMatchObject({ verb: 'drag', targetPerson: 'michael', targetRoom: 'meeting' });
    expect(brain.interpretDirectiveNow(directiveReq('knock out jim'))).toMatchObject({ verb: 'knockout', targetPerson: 'jim' });
    expect(brain.interpretDirectiveNow(directiveReq('shove toby'))).toMatchObject({ verb: 'shove', targetPerson: 'toby' });
    expect(brain.interpretDirectiveNow(directiveReq('smash the fax machine'))).toMatchObject({ verb: 'sabotage', targetRoom: 'annex' });
    expect(brain.interpretDirectiveNow(directiveReq('set the break room on fire'))).toMatchObject({ verb: 'trigger_power', targetRoom: 'kitchen', power: 'fire' });
    expect(brain.interpretDirectiveNow(directiveReq('quit'))).toMatchObject({ verb: 'walk_out' });
    expect(brain.interpretDirectiveNow(directiveReq('lock angela in the conference room'))).toMatchObject({ verb: 'lock_in', targetPerson: 'angela', targetRoom: 'meeting' });
    expect(brain.interpretDirectiveNow(directiveReq("steal jim's stapler"))).toMatchObject({ verb: 'steal', targetPerson: 'jim', item: 'stapler' });
    expect(brain.interpretDirectiveNow(directiveReq('kiss pam'))).toMatchObject({ verb: 'romance', targetPerson: 'pam' });
    expect(brain.interpretDirectiveNow(directiveReq('chat with pam about paper'))).toMatchObject({ verb: 'social', targetPerson: 'pam' });
  });

  it('routes adult and raunchy workplace comedy prompts to romance without false positives', () => {
    const brain = new InstinctBrain(BANK as LooseBank, GAME_WORLD, createRng(2));
    expect(brain.interpretDirectiveNow(directiveReq('seduce pam'))).toMatchObject({ verb: 'romance', targetPerson: 'pam' });
    expect(brain.interpretDirectiveNow(directiveReq('hook up with jim'))).toMatchObject({ verb: 'romance', targetPerson: 'jim' });
    expect(brain.interpretDirectiveNow(directiveReq('have sex with angela'))).toMatchObject({ verb: 'romance', targetPerson: 'angela' });
    expect(brain.interpretDirectiveNow(directiveReq('hit on pam'))).toMatchObject({ verb: 'romance', targetPerson: 'pam' });
    expect(brain.interpretDirectiveNow(directiveReq('sleep with pam'))).toMatchObject({ verb: 'romance', targetPerson: 'pam' });
    expect(brain.interpretDirectiveNow(directiveReq('take off your clothes in front of michael'))).toMatchObject({ verb: 'expose', targetPerson: 'michael' });
    expect(brain.interpretDirectiveNow(directiveReq('strip naked'))).toMatchObject({ verb: 'expose', targetPerson: null, summary: 'strips naked' });
    expect(brain.interpretDirectiveNow(directiveReq('flash everyone'))).toMatchObject({ verb: 'expose', targetPerson: null });
    expect(brain.interpretDirectiveNow(directiveReq('bark like a dog'))).toMatchObject({ verb: 'perform', targetPerson: null, summary: 'barks like a dog' });
    expect(brain.interpretDirectiveNow(directiveReq('dance on the desk'))).toMatchObject({ verb: 'perform', targetPerson: null });
    expect(brain.interpretDirectiveNow(directiveReq('fuck angela'))).toMatchObject({ verb: 'romance', targetPerson: 'angela' });
    expect(brain.interpretDirectiveNow(directiveReq('screw up the copier'))).toMatchObject({ verb: 'sabotage' });
    expect(brain.interpretDirectiveNow(directiveReq('tell toby to fuck off'))).toMatchObject({ verb: 'social', targetPerson: 'toby' });
  });

  it('detects delegated directives without hijacking the speaker verb', () => {
    const brain = new InstinctBrain(BANK as LooseBank, GAME_WORLD, createRng(3));
    expect(brain.interpretDirectiveNow(directiveReq('tell meredith to take her clothes off'))).toMatchObject({
      verb: 'delegate',
      targetPerson: 'meredith',
      delegatedText: 'take her clothes off'
    });
    expect(brain.interpretDirectiveNow(directiveReq('tell meredith to strip naked'))).toMatchObject({
      verb: 'delegate',
      targetPerson: 'meredith',
      delegatedText: 'strip naked'
    });
    expect(brain.interpretDirectiveNow({
      ...directiveReq('dare dwight to punch jim'),
      actor: { id: 'michael' as const, name: 'Michael Scott', room: 'boss' as const }
    })).toMatchObject({
      verb: 'delegate',
      targetPerson: 'dwight',
      delegatedText: 'punch jim'
    });
    expect(brain.interpretDirectiveNow(directiveReq('tell someone to take their clothes off'))).toMatchObject({
      verb: 'delegate',
      targetPerson: null,
      delegatedText: 'take their clothes off'
    });
    expect(brain.interpretDirectiveNow(directiveReq('tell toby to fuck off'))).toMatchObject({
      verb: 'social',
      targetPerson: 'toby'
    });
  });
});

describe('physical directive execution', () => {
  it('tells Dwight to kill Jim: hunts, scuffles, eliminates Jim, marks Dwight guilty, leaves chalk outline', () => {
    const { sim, director, advance } = makeOffice(11);
    director.cue('dwight', 'kill jim');
    advance(35, () => sim.hasStatus('jim', 'eliminated'));
    expect(sim.hasStatus('jim', 'eliminated')).toBe(true);
    expect(sim.hasStatus('dwight', 'guilty')).toBe(true);
    expect(sim.person('jim')?.available).toBe(false);
    expect(sim.facts().some((f) => f.includes('eliminated by Dwight'))).toBe(true);
    expect(sim.frame().effects.some((e) => e.id === 'chalk-jim' && e.kind === 'item' && e.item === 'chalkOutline')).toBe(true);
  });

  it('whispers "kill jim" to Dwight and still executes physically', () => {
    const { sim, director, advance } = makeOffice(13);
    director.whisper('dwight', 'kill jim');
    advance(35, () => sim.hasStatus('jim', 'eliminated'));
    expect(sim.hasStatus('jim', 'eliminated')).toBe(true);
    expect(sim.hasStatus('dwight', 'guilty')).toBe(true);
  });

  it('tells Dwight to drag Michael to the conference room and physically relocates him there', () => {
    const { sim, director, advance } = makeOffice(17);
    expect(sim.person('michael')?.room).not.toBe('meeting');
    director.cue('dwight', 'drag michael to the conference room');
    advance(40, () => sim.person('michael')?.room === 'meeting' && !sim.isSeized('michael'));
    expect(sim.person('michael')?.room).toBe('meeting');
    expect(sim.isSeized('michael')).toBe(false);
  });

  it('knocks Jim out temporarily and wakes him back up after expiry', () => {
    const { sim, director, advance } = makeOffice(19);
    director.cue('dwight', 'knock out jim');
    advance(35, () => sim.hasStatus('jim', 'knockedOut'));
    expect(sim.hasStatus('jim', 'knockedOut')).toBe(true);
    expect(sim.person('jim')?.available).toBe(false);
    advance(55, () => !sim.hasStatus('jim', 'knockedOut'));
    expect(sim.hasStatus('jim', 'knockedOut')).toBe(false);
    expect(sim.person('jim')?.available).toBe(true);
  });

  it('makes Dwight quit and walk out when told "quit"', () => {
    const { sim, director, advance } = makeOffice(23);
    director.cue('dwight', 'quit');
    expect(sim.hasStatus('dwight', 'quit')).toBe(true);
    expect(sim.frame().people.find((p) => p.id === 'dwight')?.prop).toBe('box');
    advance(45, () => !sim.person('dwight')?.present);
    expect(sim.person('dwight')?.present).toBe(false);
  });

  it('starts fire chaos when told to set the break room on fire', () => {
    const { sim, director, chaos, advance } = makeOffice(29);
    director.cue('dwight', 'set the break room on fire');
    advance(40, () => chaos.includes('fire'));
    expect(chaos).toContain('fire');
  });

  it('clears eliminated/chalk states cleanly when a new day starts', () => {
    const { sim, director, advance } = makeOffice(31);
    director.cue('dwight', 'kill jim');
    advance(35, () => sim.hasStatus('jim', 'eliminated'));
    expect(sim.hasStatus('jim', 'eliminated')).toBe(true);
    sim.beginDay(2);
    director.reset();
    expect(sim.hasStatus('jim', 'eliminated')).toBe(false);
    expect(sim.frame().effects.some((e) => e.id === 'chalk-jim')).toBe(false);
  });

  it('executes romance directives faithfully with rawText in feed and aftermath scene', () => {
    const { director, brain, feed, focuses, advance } = makeOffice(37);
    const scenes: SceneRequest[] = [];
    const originalScene = brain.scene.bind(brain);
    brain.scene = async (req, cb) => {
      scenes.push(req);
      return originalScene(req, cb);
    };
    director.cue('dwight', 'seduce pam');
    advance(35, () => feed.some((line) => line.includes('seduces pam')) && scenes.some((s) => s.trigger === 'aftermath'));
    expect(focuses.length).toBeGreaterThan(0);
    expect(feed.some((line) => line.includes('seduces pam'))).toBe(true);
    expect(feed.some((line) => line.includes('bold romantic move'))).toBe(false);
    const aftermath = scenes.find((s) => s.trigger === 'aftermath');
    expect(aftermath).toBeDefined();
    expect(aftermath?.why).toContain('seduces pam');
    expect(aftermath?.why).toContain('seduce pam');
    expect(aftermath?.why).not.toContain('bold romantic move');
  });

  it('stages self-exposure ("strip naked") on screen with the naked status, beat, focus, and factual aftermath', () => {
    const { sim, director, brain, beats, focuses, advance } = makeOffice(41);
    const scenes: SceneRequest[] = [];
    const originalScene = brain.scene.bind(brain);
    brain.scene = async (req, cb) => {
      scenes.push(req);
      return originalScene(req, cb);
    };
    director.cue('meredith', 'strip naked');
    expect(sim.hasStatus('meredith', 'naked')).toBe(true);
    expect(sim.facts().some((f) => f.includes('Meredith') && f.includes('completely naked'))).toBe(true);
    expect(focuses.length).toBeGreaterThan(0);
    expect(beats.some((b) => b.includes('Meredith') && b.includes('strips naked'))).toBe(true);
    advance(5, () => scenes.some((s) => s.trigger === 'aftermath'));
    const aftermath = scenes.find((s) => s.trigger === 'aftermath');
    expect(aftermath).toBeDefined();
    expect(aftermath?.why).toContain('strips naked');
    expect(aftermath?.why).toContain('did NOT ask anyone else to strip');
    expect(sim.isSeized('meredith')).toBe(false);
  });

  it('stages the expanded sex-act catalogue with matching poses and naked partners', () => {
    const acts = [
      ['ride creed cowgirl right here', 'cowgirl'],
      ['fuck creed doggy style right here', 'doggy'],
      ['give creed a blowjob right here', 'blowjob'],
      ['sit on creed\'s face right here', 'facesit']
    ] as const;

    acts.forEach(([text, anim], i) => {
      const { sim, director, advance } = makeOffice(67 + i);
      const bullpen = walkableTilesIn('bullpen');
      const animOf = (id: string) => sim.frame().people.find((p) => p.id === id)?.anim;
      sim.teleport('meredith', bullpen[2]);
      sim.teleport('creed', bullpen[3]);
      director.cue('meredith', text);
      advance(6, () => animOf('meredith') === anim);
      expect(animOf('meredith')).toBe(anim);
      expect(sim.hasStatus('meredith', 'naked')).toBe(true);
      expect(sim.hasStatus('creed', 'naked')).toBe(true);
    });
  });

  it('stages solo physical perform directives ("bark like a dog") visibly on screen', () => {
    const { sim, director, brain, beats, focuses, advance } = makeOffice(43);
    const scenes: SceneRequest[] = [];
    const originalScene = brain.scene.bind(brain);
    brain.scene = async (req, cb) => {
      scenes.push(req);
      return originalScene(req, cb);
    };
    director.cue('dwight', 'bark like a dog');
    expect(focuses.length).toBeGreaterThan(0);
    expect(beats.some((b) => b.includes('Dwight') && b.includes('barks like a dog'))).toBe(true);
    advance(5, () => scenes.some((s) => s.trigger === 'aftermath'));
    const aftermath = scenes.find((s) => s.trigger === 'aftermath');
    expect(aftermath).toBeDefined();
    expect(aftermath?.why).toContain('barks like a dog');
    expect(aftermath?.why).toContain('actually performed this themselves');
    expect(sim.isSeized('dwight')).toBe(false);
  });

  it('handles delegated directives contextually: Meredith complies and strips, Angela refuses without stripping, and love overrides refusal', async () => {
    // 1. Meredith agrees in character and executes "take your clothes off"
    {
      const { sim, director, brain, advanceAsync } = makeOffice(51);
      const delegationScenes: SceneRequest[] = [];
      const originalScene = brain.scene.bind(brain);
      brain.scene = async (req, cb) => {
        if (req.delegation) delegationScenes.push(req);
        return originalScene(req, cb);
      };
      director.cue('michael', 'tell meredith to take her clothes off');
      await advanceAsync(40, () => sim.hasStatus('meredith', 'naked'));
      expect(delegationScenes.length).toBeGreaterThanOrEqual(1);
      expect(delegationScenes[0].delegation).toMatchObject({
        asker: 'michael',
        target: 'meredith',
        action: 'take her clothes off',
        command: 'take your clothes off'
      });
      expect(sim.hasStatus('michael', 'naked')).toBe(false);
      expect(sim.hasStatus('meredith', 'naked')).toBe(true);
    }

    // 2. Angela refuses in character and nobody strips
    {
      const { sim, director, brain, advanceAsync } = makeOffice(53);
      const delegationScenes: SceneRequest[] = [];
      const results: boolean[] = [];
      const originalScene = brain.scene.bind(brain);
      brain.scene = async (req, cb) => {
        const res = await originalScene(req, cb);
        if (req.delegation) {
          delegationScenes.push(req);
          results.push(Boolean(res.complies));
        }
        return res;
      };
      director.cue('michael', 'tell angela to take her clothes off');
      await advanceAsync(40, () => results.length > 0 && !sim.person('angela')?.sceneId);
      expect(delegationScenes.length).toBe(1);
      expect(results).toEqual([false]);
      expect(sim.hasStatus('michael', 'naked')).toBe(false);
      expect(sim.hasStatus('angela', 'naked')).toBe(false);

      // 3. Context override: if Angela is smitten with Michael, she complies
      sim.addStatus('angela', 'love', 120, 'michael');
      const overridden = await brain.scene({
        ...delegationScenes[0],
        people: [sim.briefFor('michael', ['angela']), sim.briefFor('angela', ['michael'])]
      });
      expect(overridden.complies).toBe(true);
    }
  });

  it('prevents room-name target collisions, handles leading names/gerunds, negations, creative items & bystander prepositions', () => {
    const brain = new InstinctBrain(BANK as LooseBank, GAME_WORLD, createRng(7));
    // Room name ("michael's office") must not steal targetPerson from jim/pam or inject a target on solo strip
    expect(brain.interpretDirectiveNow(directiveReq("kiss jim in michael's office"))).toMatchObject({
      verb: 'romance',
      targetPerson: 'jim',
      targetRoom: 'boss'
    });
    expect(brain.interpretDirectiveNow(directiveReq("drag pam to michael's office"))).toMatchObject({
      verb: 'drag',
      targetPerson: 'pam',
      targetRoom: 'boss'
    });
    expect(brain.interpretDirectiveNow(directiveReq("strip naked in michael's office"))).toMatchObject({
      verb: 'expose',
      targetPerson: null,
      targetRoom: 'boss'
    });
    // Syntactic priority: direct object beats earlier/CAST-first bystander after "in front of"
    expect(brain.interpretDirectiveNow(directiveReq('throw hot coffee at toby in front of pam'))).toMatchObject({
      verb: 'shove',
      targetPerson: 'toby'
    });
    // Negated imperatives must never execute physical actions
    expect(brain.interpretDirectiveNow(directiveReq("don't strip naked")).verb).toBe('social');
    expect(brain.interpretDirectiveNow(directiveReq('never kill jim')).verb).toBe('social');
    expect(brain.interpretDirectiveNow(directiveReq('stop punching toby')).verb).toBe('social');
    expect(brain.interpretDirectiveNow(directiveReq('tell meredith not to strip naked')).verb).toBe('social');
    // Leading actor name & gerunds conjugate cleanly
    expect(brain.interpretDirectiveNow({
      ...directiveReq('meredith, strip naked'),
      actor: { id: 'meredith' as const, name: 'Meredith Palmer', room: 'annex' as const }
    })).toMatchObject({ verb: 'expose', targetPerson: null, summary: 'strips naked' });
    expect(brain.interpretDirectiveNow(directiveReq('dancing on the desk'))).toMatchObject({
      verb: 'perform',
      summary: 'starts dancing on the desk'
    });
    // Creative stolen items & expanded adult/stunt verbs
    expect(brain.interpretDirectiveNow(directiveReq("steal pam's famous chili"))).toMatchObject({
      verb: 'steal',
      targetPerson: 'pam',
      item: 'famous chili'
    });
    expect(brain.interpretDirectiveNow(directiveReq("slap pam's ass"))).toMatchObject({
      verb: 'romance',
      targetPerson: 'pam'
    });
    expect(brain.interpretDirectiveNow(directiveReq('do a handstand'))).toMatchObject({ verb: 'perform' });
    // Delegation wrappers: movement prefixes, modals, creative stunts, group/two-person & "me" resolution
    expect(brain.interpretDirectiveNow({
      ...directiveReq('walk over to meredith and tell her to strip naked'),
      actor: { id: 'michael' as const, name: 'Michael Scott', room: 'boss' as const }
    })).toMatchObject({ verb: 'delegate', targetPerson: 'meredith', delegatedText: 'strip naked' });
    expect(brain.interpretDirectiveNow({
      ...directiveReq('tell meredith she should strip naked'),
      actor: { id: 'michael' as const, name: 'Michael Scott', room: 'boss' as const }
    })).toMatchObject({ verb: 'delegate', targetPerson: 'meredith', delegatedText: 'strip naked' });
    expect(brain.interpretDirectiveNow({
      ...directiveReq('dare pam to lick the copier'),
      actor: { id: 'michael' as const, name: 'Michael Scott', room: 'boss' as const }
    })).toMatchObject({ verb: 'delegate', targetPerson: 'pam', delegatedText: 'lick the copier' });
    expect(brain.interpretDirectiveNow({
      ...directiveReq('tell meredith and angela to strip naked'),
      actor: { id: 'michael' as const, name: 'Michael Scott', room: 'boss' as const }
    })).toMatchObject({ verb: 'delegate', targetPeople: ['meredith', 'angela'], delegatedText: 'strip naked' });
    expect(brain.interpretDirectiveNow({
      ...directiveReq('tell everyone to strip naked'),
      actor: { id: 'michael' as const, name: 'Michael Scott', room: 'boss' as const }
    })).toMatchObject({ verb: 'delegate', targetAll: true, delegatedText: 'strip naked' });
    // Stop and status-reversal classification
    expect(brain.interpretDirectiveNow(directiveReq('stop'))).toMatchObject({ verb: 'recover', item: 'stop' });
    expect(brain.interpretDirectiveNow(directiveReq('put your clothes back on'))).toMatchObject({ verb: 'recover', item: 'dress' });
    expect(brain.interpretDirectiveNow(directiveReq('revive jim'))).toMatchObject({ verb: 'recover', item: 'revive', targetPerson: 'jim' });
    expect(brain.interpretDirectiveNow(directiveReq('wake up toby'))).toMatchObject({ verb: 'recover', item: 'wake', targetPerson: 'toby' });
    expect(brain.interpretDirectiveNow(directiveReq('take a nap'))).toMatchObject({ verb: 'recover', item: 'sleep' });

    // Permission-request parsing (asker acts if target agrees)
    const withPronouns = (text: string) => ({
      ...directiveReq(text),
      actor: { id: 'dwight' as const, name: 'Dwight Schrute', room: 'bullpen' as const, pronoun: 'he' as const },
      people: directiveReq(text).people.map((p) => ({ ...p, pronoun: p.id === 'pam' || p.id === 'angela' || p.id === 'meredith' ? 'she' as const : 'he' as const }))
    });
    for (const phrase of [
      'ask pam if you can massage her',
      'ask pam if he can massage her',
      'ask pam for permission to massage her',
      "ask pam if she'll let you massage her",
      'ask pam to let you massage her',
      'walk over to pam and ask her if you can massage her'
    ]) {
      expect(brain.interpretDirectiveNow(withPronouns(phrase))).toMatchObject({
        verb: 'delegate',
        delegateExecutor: 'asker',
        targetPerson: 'pam',
        delegatedText: 'massage her'
      });
    }
    expect(brain.interpretDirectiveNow(withPronouns('ask pam if i can massage you'))).toMatchObject({
      verb: 'delegate',
      delegateExecutor: 'asker',
      targetPerson: 'pam',
      delegatedText: 'massage you'
    });
  });

  it('reverses physical states cleanly (get dressed, revive eliminated, wake knockedOut, nap, stop)', () => {
    const { sim, director, advance } = makeOffice(57);
    // 1. Strip naked then get dressed clears naked status and fact
    director.cue('meredith', 'strip naked');
    expect(sim.hasStatus('meredith', 'naked')).toBe(true);
    director.cue('meredith', 'put your clothes back on');
    expect(sim.hasStatus('meredith', 'naked')).toBe(false);
    expect(sim.facts().some((f) => f.includes('Meredith') && f.includes('naked'))).toBe(false);

    // 2. Kill Jim then revive Jim removes eliminated status and chalk outline
    director.cue('dwight', 'kill jim');
    advance(35, () => sim.hasStatus('jim', 'eliminated'));
    expect(sim.hasStatus('jim', 'eliminated')).toBe(true);
    director.cue('michael', 'revive jim');
    advance(40, () => !sim.hasStatus('jim', 'eliminated'));
    expect(sim.hasStatus('jim', 'eliminated')).toBe(false);
    expect(sim.frame().effects.some((e) => e.id === 'chalk-jim')).toBe(false);

    // 3. Take a nap sets asleep; wake wakes them; stop cancels active chase
    director.cue('dwight', 'take a nap');
    expect(sim.hasStatus('dwight', 'asleep')).toBe(true);
    director.cue('michael', 'wake up dwight');
    advance(35, () => !sim.hasStatus('dwight', 'asleep'));
    expect(sim.hasStatus('dwight', 'asleep')).toBe(false);

    director.cue('dwight', 'chase jim');
    expect(sim.person('dwight')?.doing.toLowerCase()).toBeDefined();
    director.cue('dwight', 'stop');
    director.whisper('dwight', 'chase jim');
    expect(sim.person('dwight')?.conviction).not.toBeNull();
    director.whisper('dwight', 'stop');
    expect(sim.person('dwight')?.conviction).toBeNull();
  });

  it('executes splashes with wet status, preserves creative kill/steal details, and runs compound chains', async () => {
    const { sim, director, brain, feed, advance, advanceAsync } = makeOffice(59);
    const scenes: SceneRequest[] = [];
    const origScene = brain.scene.bind(brain);
    brain.scene = async (req, cb) => {
      scenes.push(req);
      return origScene(req, cb);
    };

    // Splash coffee applies wet status & preserves phrasing
    director.cue('dwight', 'splash hot coffee on toby');
    advance(40, () => sim.hasStatus('toby', 'wet'));
    expect(sim.hasStatus('toby', 'wet')).toBe(true);
    expect(feed.some((t) => t.toLowerCase().includes('coffee'))).toBe(true);

    // Creative steal item preserved
    director.cue('jim', "steal kevin's famous chili");
    advance(40, () => feed.some((t) => t.toLowerCase().includes('famous chili')));
    expect(feed.some((t) => t.toLowerCase().includes('famous chili'))).toBe(true);

    // Creative elimination preserves method in feed & aftermath
    director.cue('dwight', "poison angela's tea");
    advance(40, () => sim.hasStatus('angela', 'eliminated'));
    expect(feed.some((t) => t.toLowerCase().includes('poison'))).toBe(true);

    // Compound multi-step cue: move to kitchen then strip naked
    expect(sim.hasStatus('meredith', 'naked')).toBe(false);
    director.cue('meredith', 'go to the break room and then strip naked');
    await advanceAsync(45, () => sim.hasStatus('meredith', 'naked'));
    expect(sim.hasStatus('meredith', 'naked')).toBe(true);
    expect(sim.person('meredith')?.room).toBe('kitchen');
  });

  it('handles two-person delegation, group delegation, nested delegation, "me" resolution, mutual kiss & loudspeaker demands', async () => {
    // 1. Two-person delegation: Meredith complies, Angela refuses
    {
      const { sim, director, advanceAsync } = makeOffice(61);
      director.cue('michael', 'tell meredith and angela to strip naked');
      await advanceAsync(40, () => sim.hasStatus('meredith', 'naked'));
      expect(sim.hasStatus('meredith', 'naked')).toBe(true);
      expect(sim.hasStatus('angela', 'naked')).toBe(false);
    }

    // 2. Group delegation ("tell everyone in the bullpen to strip naked"): only people who answered in the
    //    scene can go along with it, so the rest of the room (Meredith, unless she spoke) does not strip.
    {
      const { sim, director, brain, advanceAsync } = makeOffice(62);
      const spoke = new Set<string>();
      const origScene = brain.scene.bind(brain);
      brain.scene = async (req, cb) => {
        const res = await origScene(req, cb);
        if (req.delegation) for (const l of res.lines) spoke.add(l.who);
        return res;
      };
      sim.teleport('meredith', { x: 10, y: 14 });
      sim.teleport('angela', { x: 11, y: 14 });
      director.cue('michael', 'tell everyone in the bullpen to strip naked');
      await advanceAsync(45);
      expect(spoke.size).toBeGreaterThan(0);
      for (const p of sim.people()) if (sim.hasStatus(p.id, 'naked')) expect(spoke.has(p.id)).toBe(true);
      expect(sim.hasStatus('angela', 'naked')).toBe(false);
    }

    // 3. Nested 1-hop delegation: "tell dwight to tell meredith to strip naked"
    {
      const { sim, director, advanceAsync } = makeOffice(63);
      director.cue('michael', 'tell dwight to tell meredith to strip naked');
      await advanceAsync(60, () => sim.hasStatus('meredith', 'naked'));
      expect(sim.hasStatus('michael', 'naked')).toBe(false);
      expect(sim.hasStatus('dwight', 'naked')).toBe(false);
      expect(sim.hasStatus('meredith', 'naked')).toBe(true);
    }

    // 4. First-person "me" resolves to asker ("tell meredith to kiss me" -> "kiss Michael")
    {
      const { sim, director, brain, feed, advanceAsync } = makeOffice(65);
      const delegationScenes: SceneRequest[] = [];
      const origScene = brain.scene.bind(brain);
      brain.scene = async (req, cb) => {
        if (req.delegation) delegationScenes.push(req);
        return origScene(req, cb);
      };
      director.cue('michael', 'tell meredith to kiss me');
      await advanceAsync(55, () => delegationScenes.length > 0 && feed.some((t) => /kisses?\s+michael/i.test(t)));
      expect(delegationScenes[0]?.delegation?.command).toBe('kiss Michael');
      expect(feed.some((t) => /kisses?\s+michael/i.test(t))).toBe(true);
    }

    // 5. Loudspeaker physical demand ("Meredith and Angela, strip naked!"): Meredith complies, Angela refuses
    {
      const { sim, director, advanceAsync } = makeOffice(67);
      sim.teleport('meredith', { x: 10, y: 14 });
      sim.teleport('angela', { x: 11, y: 14 });
      director.announce('Meredith and Angela, strip naked!');
      await advanceAsync(35, () => sim.hasStatus('meredith', 'naked'));
      expect(sim.hasStatus('meredith', 'naked')).toBe(true);
      expect(sim.hasStatus('angela', 'naked')).toBe(false);
    }

    // 6. Loudpeaker general demand ("Everyone strip naked!"): it is put to the people seen talking about it,
    //    and nobody else (Meredith and Creed included, unless they are among them) strips.
    {
      const { sim, director, brain, advanceAsync } = makeOffice(69);
      const asked: string[][] = [];
      const spoke = new Set<string>();
      const origScene = brain.scene.bind(brain);
      brain.scene = async (req, cb) => {
        const res = await origScene(req, cb);
        if (req.delegation) {
          asked.push(req.delegation.targets ?? [req.delegation.target]);
          for (const l of res.lines) spoke.add(l.who);
        }
        return res;
      };
      sim.teleport('meredith', { x: 10, y: 14 });
      sim.teleport('creed', { x: 12, y: 14 });
      sim.teleport('angela', { x: 13, y: 14 });
      sim.teleport('pam', { x: 14, y: 14 });
      director.announce('Everyone strip naked!');
      await advanceAsync(35);
      expect(asked).toHaveLength(1);
      expect(asked[0].length).toBeLessThanOrEqual(4);
      for (const p of sim.people()) if (sim.hasStatus(p.id, 'naked')) expect(spoke.has(p.id)).toBe(true);
      expect(sim.hasStatus('angela', 'naked')).toBe(false);
      expect(sim.hasStatus('pam', 'naked')).toBe(false);
    }

    // 7. Partner-aware romance compliance: Jim & Pam agree naturally from baseline feelings, Angela refuses Michael
    {
      const { director, feed, advanceAsync } = makeOffice(71);
      director.cue('michael', 'tell jim and pam to kiss');
      await advanceAsync(45, () => feed.some((t) => /kisses?\s+pam/i.test(t)));
      expect(feed.some((t) => /kisses?\s+pam/i.test(t))).toBe(true);
    }

    {
      const { sim, director, feed, advanceAsync } = makeOffice(73);
      // Single-target cross-room romance: Michael tells Jim to kiss Pam even when Pam is in the Break Room
      const kitchenTile = walkableTilesIn('kitchen')[0];
      sim.teleport('pam', kitchenTile);
      director.cue('michael', 'tell jim to kiss pam');
      await advanceAsync(50, () => feed.some((t) => /kisses?\s+pam/i.test(t)));
      expect(feed.some((t) => /kisses?\s+pam/i.test(t))).toBe(true);

      // Single-target romance mentioning another person ("tell angela to kiss michael"): Angela still refuses
      const feedBefore = feed.length;
      director.cue('dwight', 'tell angela to kiss michael');
      await advanceAsync(35, () => feed.slice(feedBefore).some((t) => t.includes('refused') || t.includes('No chance')));
      expect(feed.slice(feedBefore).some((t) => /angela\s+kisses?\s+michael/i.test(t))).toBe(false);
    }
  });

  it('executes direct commands unconditionally while running compliance checks on permission requests ("ask pam if you can massage her")', async () => {
    // 1. Direct command ("massage pam"): Dwight executes immediately with NO compliance check
    {
      const { director, brain, feed, advanceAsync } = makeOffice(75);
      const delegationScenes: SceneRequest[] = [];
      const origScene = brain.scene.bind(brain);
      brain.scene = async (req, cb) => {
        if (req.delegation) delegationScenes.push(req);
        return origScene(req, cb);
      };
      director.cue('dwight', 'massage pam');
      await advanceAsync(45, () => feed.some((t) => /\bDwight\s+massages?\s+pam\b/i.test(t)));
      expect(delegationScenes).toHaveLength(0);
      expect(feed.some((t) => /\bDwight\s+massages?\s+pam\b/i.test(t))).toBe(true);
    }

    // 2. Permission request refused ("ask pam if you can massage her"): Pam refuses Dwight, so Dwight does NOT massage Pam
    {
      const { director, brain, feed, advanceAsync } = makeOffice(77);
      const delegationScenes: SceneRequest[] = [];
      const results: boolean[] = [];
      const origScene = brain.scene.bind(brain);
      brain.scene = async (req, cb) => {
        const res = await origScene(req, cb);
        if (req.delegation) {
          delegationScenes.push(req);
          results.push(Boolean(res.complies));
        }
        return res;
      };
      director.cue('dwight', 'ask pam if you can massage her');
      await advanceAsync(40, () => results.length > 0 && feed.some((t) => /no chance/i.test(t)));
      expect(delegationScenes).toHaveLength(1);
      expect(delegationScenes[0].delegation).toMatchObject({
        asker: 'dwight',
        target: 'pam',
        executor: 'asker',
        command: 'massage Pam'
      });
      expect(results).toEqual([false]);
      expect(feed.some((t) => /\bDwight\s+massages?\s+Pam\b/i.test(t))).toBe(false);
    }

    // 3. Permission request granted ("jim: ask pam if you can massage her"): Pam agrees and JIM massages Pam (not Pam)
    {
      const { director, brain, feed, advanceAsync } = makeOffice(79);
      const results: boolean[] = [];
      const origScene = brain.scene.bind(brain);
      brain.scene = async (req, cb) => {
        const res = await origScene(req, cb);
        if (req.delegation) results.push(Boolean(res.complies));
        return res;
      };
      director.cue('jim', 'ask pam if you can massage her');
      await advanceAsync(45, () => feed.some((t) => /\bJim\s+massages?\s+Pam\b/i.test(t)));
      expect(results).toEqual([true]);
      expect(feed.some((t) => /\bJim\s+massages?\s+Pam\b/i.test(t))).toBe(true);
      expect(feed.some((t) => /\bPam\s+massages?/i.test(t))).toBe(false);
    }

    // 4. Permission request granted by wildcard character ("dwight: ask meredith if you can massage her"): Meredith agrees and DWIGHT massages Meredith
    {
      const { director, brain, feed, advanceAsync } = makeOffice(81);
      const results: boolean[] = [];
      const origScene = brain.scene.bind(brain);
      brain.scene = async (req, cb) => {
        const res = await origScene(req, cb);
        if (req.delegation) results.push(Boolean(res.complies));
        return res;
      };
      director.cue('dwight', 'ask meredith if you can massage her');
      await advanceAsync(45, () => feed.some((t) => /\bDwight\s+massages?\s+Meredith\b/i.test(t)));
      expect(results).toEqual([true]);
      expect(feed.some((t) => /\bDwight\s+massages?\s+Meredith\b/i.test(t))).toBe(true);
    }
  });

  it('distinguishes delegation tones across parsing, staging, dialogue, and compliance', async () => {
    const brain = new InstinctBrain(BANK as LooseBank, GAME_WORLD, createRng(13));
    expect(brain.interpretDirectiveNow(directiveReq('tell pam to take her clothes off'))).toMatchObject({
      verb: 'delegate',
      delegateTone: 'order',
      targetPerson: 'pam',
      delegatedText: 'take her clothes off'
    });
    expect(brain.interpretDirectiveNow(directiveReq('ask pam to take her clothes off'))).toMatchObject({
      verb: 'delegate',
      delegateTone: 'ask',
      targetPerson: 'pam',
      delegatedText: 'take her clothes off'
    });
    expect(brain.interpretDirectiveNow(directiveReq('order pam to dance'))).toMatchObject({
      verb: 'delegate',
      delegateTone: 'order',
      targetPerson: 'pam',
      delegatedText: 'dance'
    });
    expect(brain.interpretDirectiveNow(directiveReq('make pam dance'))).toMatchObject({
      verb: 'delegate',
      delegateTone: 'order',
      targetPerson: 'pam',
      delegatedText: 'dance'
    });
    expect(brain.interpretDirectiveNow({
      ...directiveReq('dare dwight to bark like a dog'),
      actor: { id: 'michael' as const, name: 'Michael Scott', room: 'boss' as const }
    })).toMatchObject({
      verb: 'delegate',
      delegateTone: 'dare',
      targetPerson: 'dwight',
      delegatedText: 'bark like a dog'
    });
    expect(brain.interpretDirectiveNow(directiveReq('beg pam to dance'))).toMatchObject({
      verb: 'delegate',
      delegateTone: 'beg',
      targetPerson: 'pam',
      delegatedText: 'dance'
    });
    expect(brain.interpretDirectiveNow(directiveReq('convince pam to dance'))).toMatchObject({
      verb: 'delegate',
      delegateTone: 'persuade',
      targetPerson: 'pam',
      delegatedText: 'dance'
    });
    expect(brain.interpretDirectiveNow(directiveReq('persuade pam to dance'))).toMatchObject({
      verb: 'delegate',
      delegateTone: 'persuade',
      targetPerson: 'pam',
      delegatedText: 'dance'
    });
    expect(brain.interpretDirectiveNow(directiveReq('ask pam if you can massage her'))).toMatchObject({
      verb: 'delegate',
      delegateExecutor: 'asker',
      delegateTone: 'ask',
      targetPerson: 'pam'
    });
    expect(brain.interpretDirectiveNow(directiveReq('beg pam to let you massage her'))).toMatchObject({
      verb: 'delegate',
      delegateExecutor: 'asker',
      delegateTone: 'beg',
      targetPerson: 'pam'
    });
    expect(brain.interpretDirectiveNow(directiveReq('ask everyone to dance'))).toMatchObject({
      verb: 'delegate',
      targetAll: true,
      delegateTone: 'ask',
      delegatedText: 'dance'
    });
    expect(brain.interpretDirectiveNow(directiveReq('dare meredith and angela to dance'))).toMatchObject({
      verb: 'delegate',
      targetPeople: ['meredith', 'angela'],
      delegateTone: 'dare',
      delegatedText: 'dance'
    });

    // End-to-end: "tell pam to take her clothes off" vs "ask pam to take her clothes off"
    {
      const { sim, director, brain: b, feed, advanceAsync } = makeOffice(83);
      const delegationScenes: SceneRequest[] = [];
      const spoken: string[] = [];
      const origScene = b.scene.bind(b);
      b.scene = async (req, cb) => {
        const res = await origScene(req, cb);
        if (req.delegation) {
          delegationScenes.push(req);
          spoken.push(...res.lines.map((l) => l.say));
        }
        return res;
      };
      director.cue('dwight', 'tell pam to take her clothes off');
      await advanceAsync(40, () => delegationScenes.length > 0 && !sim.person('pam')?.sceneId);
      expect(delegationScenes[0]?.delegation?.tone).toBe('order');
      expect(delegationScenes[0]?.why).toContain('is ordering Pam');
      expect(feed.some((t) => /tells Pam to take her clothes off/i.test(t))).toBe(true);
      expect(spoken.some((s) => /Pam, take your clothes off\. Right now\./i.test(s))).toBe(true);
      expect(sim.hasStatus('pam', 'naked')).toBe(false);
    }

    {
      const { sim, director, brain: b, feed, advanceAsync } = makeOffice(85);
      const delegationScenes: SceneRequest[] = [];
      const spoken: string[] = [];
      const origScene = b.scene.bind(b);
      b.scene = async (req, cb) => {
        const res = await origScene(req, cb);
        if (req.delegation) {
          delegationScenes.push(req);
          spoken.push(...res.lines.map((l) => l.say));
        }
        return res;
      };
      director.cue('dwight', 'ask pam to take her clothes off');
      await advanceAsync(40, () => delegationScenes.length > 0 && !sim.person('pam')?.sceneId);
      expect(delegationScenes[0]?.delegation?.tone).toBe('ask');
      expect(delegationScenes[0]?.why).toContain('is asking Pam');
      expect(feed.some((t) => /asks Pam to take her clothes off/i.test(t))).toBe(true);
      expect(spoken.some((s) => /Hey Pam, would you take your clothes off\?/i.test(s))).toBe(true);
      expect(sim.hasStatus('pam', 'naked')).toBe(false);
    }

    // Harmless stunt compliance: Jim ordering Dwight -> refused; Jim daring Dwight -> Dwight takes the dare
    {
      const { director, brain: b, advanceAsync } = makeOffice(87);
      const results: boolean[] = [];
      const origScene = b.scene.bind(b);
      b.scene = async (req, cb) => {
        const res = await origScene(req, cb);
        if (req.delegation) results.push(Boolean(res.complies));
        return res;
      };
      director.cue('jim', 'tell dwight to bark like a dog');
      await advanceAsync(40, () => results.length > 0);
      expect(results).toEqual([false]);
    }

    {
      const { director, brain: b, feed, advanceAsync } = makeOffice(89);
      const results: boolean[] = [];
      const origScene = b.scene.bind(b);
      b.scene = async (req, cb) => {
        const res = await origScene(req, cb);
        if (req.delegation) results.push(Boolean(res.complies));
        return res;
      };
      director.cue('jim', 'dare dwight to bark like a dog');
      await advanceAsync(45, () => results.length > 0 && feed.some((t) => /\bDwight\s+barks\s+like\s+a\s+dog\b/i.test(t)));
      expect(results).toEqual([true]);
      expect(feed.some((t) => /\bDwight\s+barks\s+like\s+a\s+dog\b/i.test(t))).toBe(true);
    }
  });

  it('clears naked facts/perception after cooldown expiry or manual redressing', async () => {
    const { sim, director, advanceAsync } = makeOffice(91);
    director.cue('angela', 'take her clothes off');
    await advanceAsync(40, () => sim.hasStatus('angela', 'naked'));
    expect(sim.facts().some((f) => /Angela.*completely naked/i.test(f))).toBe(true);

    // Wait for the 90s naked status cooldown to expire naturally
    await advanceAsync(100, () => !sim.hasStatus('angela', 'naked'));
    expect(sim.hasStatus('angela', 'naked')).toBe(false);
    expect(sim.facts().some((f) => /Angela.*completely naked/i.test(f))).toBe(false);
    expect(sim.facts().some((f) => /Angela.*fully dressed again/i.test(f))).toBe(true);

    const witnessBrief = sim.briefFor('dwight', ['angela']);
    expect(witnessBrief.memories.some((m) => /is now completely naked/i.test(m))).toBe(false);
    expect(witnessBrief.memories.some((m) => /fully dressed again/i.test(m))).toBe(true);

    // Timed dressed fact also expires cleanly after its 90s TTL
    await advanceAsync(95, () => !sim.facts().some((f) => /Angela.*fully dressed again/i.test(f)));
    expect(sim.facts().some((f) => /Angela.*fully dressed again/i.test(f))).toBe(false);
  });

  it('tracks player whispers with fromPlayer and lets cancelWhisper clear them without bypassing story convictions', async () => {
    const { sim, director, feed, advanceAsync } = makeOffice(93);
    director.whisper('kevin', 'guard the snack table');
    await advanceAsync(10, () => !!sim.person('kevin')?.conviction);
    expect(sim.person('kevin')?.conviction?.fromPlayer).toBe(true);
    expect(sim.peopleUi().find((p) => p.id === 'kevin')?.whisper?.text).toBe('guard the snack table');

    director.cancelWhisper('kevin');
    expect(sim.person('kevin')?.conviction).toBeNull();
    expect(sim.peopleUi().find((p) => p.id === 'kevin')?.whisper).toBeNull();
    expect(feed.some((t) => /Kevin shakes off the thought/i.test(t))).toBe(true);

    // Non-player story convictions must not be cleared by cancelWhisper
    sim.convince('michael', 'Today is the day for a speech.');
    expect(sim.person('michael')?.conviction?.fromPlayer).toBeUndefined();
    director.cancelWhisper('michael');
    expect(sim.person('michael')?.conviction?.text).toBe('Today is the day for a speech.');
  });
});
