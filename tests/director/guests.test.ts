// The Anything power's guests, run through a whole visit on a real simulation
// (no director, no model): they appear, go up to people, set off powers, and leave.
import { describe, expect, it } from 'vitest';
import { Guests } from '@/game/director/guests';
import type { InterpretResult } from '@/game/brain/api';
import type { SceneAsk } from '@/game/core/simApi';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { makeSim, runUntil } from '../sim/helpers';

function result(over: Partial<InterpretResult>): InterpretResult {
  return {
    title: 'Superman Visits', emoji: '🦸', room: 'bullpen', fact: 'Superman is in the bullpen, offering to help.', vibe: 'wonderful',
    intensity: 1, reaction: 'gather', look: 'none', moves: true, kind: 'character', name: 'Superman', power: 'none',
    guest: { skin: 'light', hair: 'black', outfit: 'blue', trim: 'red', style: 'suit' }, source: 'model', ...over
  };
}

function setup() {
  const { sim, bus } = makeSim({ dayMinutes: 30 });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  const feed: string[] = [];
  const chaos: string[] = [];
  bus.on('feed', (f) => feed.push(f.text));
  bus.on('chaosStart', (e) => chaos.push(e.id));
  const asks: SceneAsk[] = [];
  const guests = new Guests({ sim, scene: (a) => asks.push(a), slow: () => true });
  sim.beginDay(1);
  runUntil(sim, () => sim.clock >= 9 * 60 + 6, 400);
  const step = (seconds: number): void => {
    for (let t = 0; t < seconds; t += 0.1) {
      sim.update(0.1);
      guests.update(0.1);
      sim.takeSceneAsks();
    }
  };
  return { sim, guests, feed, chaos, asks, step };
}

describe('Anything-power guests', () => {
  it('a character appears, talks first, visits people, and says goodbye', () => {
    const { sim, guests, feed, asks, step } = setup();
    guests.stage('superman enters the office', result({}));
    const id = sim.people().find((p) => !p.isCast)?.id;
    expect(id).toBeTruthy();
    expect(sim.person(id!)?.name).toBe('Superman');
    // The first scene has the guest and the people who saw it.
    expect(asks[0].people?.[0]).toBe(id);
    expect(asks[0].people!.length).toBeGreaterThan(1);
    step(120);
    const visits = asks.filter((a) => a.trigger === 'custom' && a !== asks[0]);
    expect(visits.length).toBeGreaterThan(0);
    expect(sim.facts().some((f) => f.includes('Superman'))).toBe(true);
    step(200);
    expect(sim.person(id!)).toBeFalsy();
    expect(guests.count).toBe(0);
    expect(feed).toContain('Superman has left the office.');
    expect(asks.some((a) => a.trigger === 'aftermath')).toBe(true);
    expect(sim.facts().some((f) => f.includes('Superman'))).toBe(false);
  });

  it('a creature wanders, can set off a power, and goes', () => {
    const { sim, guests, feed, chaos, step } = setup();
    guests.stage('a dragon bursts into the kitchen', result({
      kind: 'creature', name: 'The Dragon', room: 'kitchen', emoji: '🐉', vibe: 'dangerous', reaction: 'flee', power: 'fire',
      fact: 'A dragon is in the break room.'
    }));
    expect(sim.people().some((p) => !p.isCast)).toBe(false);
    step(3);
    expect(chaos).toContain('fire');
    step(200);
    expect(guests.count).toBe(0);
    expect(feed).toContain('The Dragon has gone.');
  });

  it('a new day clears everything quietly', () => {
    const { sim, guests, step } = setup();
    guests.stage('superman enters the office', result({}));
    step(5);
    guests.clear();
    expect(sim.people().some((p) => !p.isCast)).toBe(false);
    expect(guests.count).toBe(0);
  });
});
