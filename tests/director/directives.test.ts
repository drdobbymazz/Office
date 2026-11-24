import { describe, expect, it } from 'vitest';
import type { SceneRequest } from '@/game/brain/api';
import { Director } from '@/game/director/director';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import { BANK, WORLD as GAME_WORLD } from '@/game/core/content';
import { TARGET_ROOMS } from '@/game/core/types';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { room as roomDef } from '@/game/core/world';
import { createRng } from '@/game/sim/rng';
import { makeSim, runUntil } from '../sim/helpers';

function makeOffice(seed = 11) {
  const { sim, bus } = makeSim({ dayMinutes: 10, seed, sandbox: false });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  const brain = new InstinctBrain(BANK as LooseBank, GAME_WORLD, createRng(seed));
  const director = new Director({ sim, brain, instinct: brain });
  const feed: string[] = [];
  const chaos: string[] = [];
  bus.on('feed', (f) => feed.push(f.text));
  bus.on('chaosStart', (c) => chaos.push(c.id));
  runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);
  director.reset();
  const advance = (seconds: number, stopWhen?: () => boolean): void => {
    const steps = Math.ceil(seconds / 0.1);
    for (let i = 0; i < steps; i++) {
      sim.update(0.1);
      director.update(0.1);
      if (stopWhen?.()) break;
    }
  };
  return { sim, director, brain, feed, chaos, advance };
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
      { id: 'toby' as const, name: 'Toby Flenderson', room: 'annex' as const }
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
    expect(brain.interpretDirectiveNow(directiveReq('take off your clothes in front of michael'))).toMatchObject({ verb: 'romance', targetPerson: 'michael' });
    expect(brain.interpretDirectiveNow(directiveReq('fuck angela'))).toMatchObject({ verb: 'romance', targetPerson: 'angela' });
    expect(brain.interpretDirectiveNow(directiveReq('screw up the copier'))).toMatchObject({ verb: 'sabotage' });
    expect(brain.interpretDirectiveNow(directiveReq('tell toby to fuck off'))).toMatchObject({ verb: 'social', targetPerson: 'toby' });
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
    const { director, brain, feed, advance } = makeOffice(37);
    const scenes: SceneRequest[] = [];
    const originalScene = brain.scene.bind(brain);
    brain.scene = async (req, cb) => {
      scenes.push(req);
      return originalScene(req, cb);
    };
    director.cue('dwight', 'seduce pam');
    advance(35, () => feed.some((line) => line.includes('seduce pam')) && scenes.some((s) => s.trigger === 'aftermath'));
    expect(feed.some((line) => line.includes('seduce pam'))).toBe(true);
    expect(feed.some((line) => line.includes('bold romantic move'))).toBe(false);
    const aftermath = scenes.find((s) => s.trigger === 'aftermath');
    expect(aftermath).toBeDefined();
    expect(aftermath?.why).toContain('seduce pam');
    expect(aftermath?.why).not.toContain('bold romantic move');
  });
});
