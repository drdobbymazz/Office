// Announcements that name a room and invite people send them there: most of the
// office for a general call, only the people named otherwise; anyone busy with a
// whispered idea (or held by the story) ignores it.
import { describe, expect, it } from 'vitest';
import { invitesPeople, roomNamedIn, summonChance, summonLine } from '@/game/director/summon';
import { Director } from '@/game/director/director';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import { BANK } from '@/game/core/content';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { createRng } from '@/game/sim/rng';
import { makeSim, runUntil } from '../sim/helpers';
import { WORLD } from '../story/harness';

describe('reading an announcement', () => {
  it('finds the room, with the usual names for it', () => {
    expect(roomNamedIn('Everyone to the conference room, now!')).toBe('meeting');
    expect(roomNamedIn('Meeting room in five minutes')).toBe('meeting');
    expect(roomNamedIn('Free cake in the break room!')).toBe('kitchen');
    expect(roomNamedIn('Pizza in the kitchen')).toBe('kitchen');
    expect(roomNamedIn("Jim, Michael's office, now")).toBe('boss');
    expect(roomNamedIn('Report to the boss')).toBe('boss');
    expect(roomNamedIn('The boss wants everyone in the conference room')).toBe('meeting');
    expect(roomNamedIn('Accounts team to accounting please')).toBe('accounts');
    expect(roomNamedIn('Party in the annex!')).toBe('annex');
    expect(roomNamedIn('Everybody back to the bullpen')).toBe('bullpen');
    expect(roomNamedIn('Good morning, everyone')).toBeNull();
    expect(invitesPeople('The printer in the annex is broken')).toBe(false);
    expect(invitesPeople('Come to the annex')).toBe(true);
  });

  it('recognizes Scranton Community Park zones', () => {
    expect(roomNamedIn('meet at the gazebo')).toBe('boss');
    expect(roomNamedIn('gather at the picnic pavilion')).toBe('meeting');
    expect(roomNamedIn('walk down to the duck pond')).toBe('annex');
    expect(roomNamedIn('rest in the quiet grove')).toBe('accounts');
    expect(roomNamedIn('circle up on the great lawn')).toBe('bullpen');
    expect(roomNamedIn('grab a burger at the bbq stand')).toBe('kitchen');
  });

  it('who listens: dutiful and kind people more than troublemakers; food pulls Kevin hardest', () => {
    expect(summonChance('toby', { food: false, named: false })).toBeGreaterThan(summonChance('creed', { food: false, named: false }));
    expect(summonChance('kevin', { food: true, named: false })).toBeGreaterThan(0.95);
    expect(summonChance('kevin', { food: true, named: false }) - summonChance('kevin', { food: false, named: false })).toBeGreaterThan(0.2);
    expect(summonChance('stanley', { food: true, named: false }) - summonChance('stanley', { food: false, named: false })).toBeCloseTo(0.1, 5);
    expect(summonChance('jim', { food: false, named: true })).toBeGreaterThan(summonChance('jim', { food: false, named: false }));
    expect(summonChance('visitor:x', { food: false, named: false })).toBe(0);
    expect(summonLine([], 'the conference room', false)).toBe('Nobody moves.');
    expect(summonLine(['Jim'], 'the conference room', true)).toBe('Jim heads for the conference room.');
    expect(summonLine(['Jim', 'Pam'], 'the break room', true)).toBe('Jim and Pam head for the break room.');
    expect(summonLine(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'the conference room', false)).toBe('Seven people head for the conference room.');
  });
});

function office(seed = 7) {
  const { sim, bus } = makeSim({ dayMinutes: 10, seed, sandbox: false });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  const brain = new InstinctBrain(BANK as LooseBank, WORLD, createRng(seed));
  const pinned = new Set<string>();
  const director = new Director({ sim, brain, instinct: brain, pinned: (w) => pinned.has(w) });
  const feed: string[] = [];
  bus.on('feed', (f) => feed.push(f.text));
  runUntil(sim, () => sim.clock >= 9 * 60 + 20, 300);
  director.reset();
  const heading = (room: string): string[] => sim.people().filter((p) => p.isCast && p.doing === `heading to ${room}`).map((p) => p.id);
  return { sim, director, feed, pinned, heading };
}

describe('announcing a summons on the real office', () => {
  it('a general call sends most people, says how many, and skips the stubborn and the pinned', () => {
    const o = office(7);
    o.director.whisper('dwight', 'Jim is plotting against me.');
    o.pinned.add('angela');
    o.director.announce('Everyone to the conference room, now!');
    const went = o.heading('the conference room');
    expect(went.length).toBeGreaterThanOrEqual(6);
    expect(went).not.toContain('dwight');
    expect(went).not.toContain('angela');
    expect(o.feed).toContainEqual(expect.stringMatching(/^(\w+) people head for the conference room\.$/));
    runUntil(o.sim, () => false, 20);
    const there = o.sim.people().filter((p) => went.includes(p.id) && p.room === 'meeting');
    expect(there.length).toBeGreaterThanOrEqual(went.length - 2);
    // They wait there a good while.
    runUntil(o.sim, () => false, 40);
    expect(o.sim.people().filter((p) => went.includes(p.id) && p.room === 'meeting').length).toBeGreaterThanOrEqual(went.length - 3);
  });

  it('naming people sends only them (a room named after Michael is not a call for Michael)', () => {
    const o = office(8);
    o.director.announce("Pam and Oscar, please come to Michael's office.");
    const went = o.sim.people().filter((p) => p.isCast && p.doing === "heading to Michael's office").map((p) => p.id);
    expect(went.every((id) => id === 'pam' || id === 'oscar')).toBe(true);
    expect(went.length).toBeGreaterThan(0);
    expect(went).not.toContain('michael');
  });

  it('an announcement that names no room, or invites nobody, moves nobody', () => {
    const o = office(9);
    o.director.announce('Good morning, Scranton.');
    o.director.announce('The printer in the annex is broken.');
    expect(o.sim.people().some((p) => /^heading to /.test(p.doing))).toBe(false);
  });

  it('free food: Kevin goes', () => {
    let kevin = 0;
    for (const seed of [11, 12, 13, 14, 15]) {
      const o = office(seed);
      o.director.announce('Free cake in the break room!');
      if (o.heading('the break room').includes('kevin')) kevin++;
    }
    expect(kevin).toBeGreaterThanOrEqual(4);
  });
});
