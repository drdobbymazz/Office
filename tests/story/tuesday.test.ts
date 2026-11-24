// Tuesday, "Not Speaking": Angela and Oscar must get through three talks that go
// well (or come to like each other again) before five. Dwight keeps turning
// Angela against Oscar, and after lunch Kevin starts worrying Oscar. Doing nothing
// loses; talking them round wins, so does a run of powers, and so do the
// character tricks (a surprise party, Truth Serum, a shared enemy).
import { describe, expect, it } from 'vitest';
import { ROW } from '@/game/story/text';
import { play, storyAt, type Played } from './harness';

const bonds = (g: Played): [number, number] => [g.sim.bond('angela', 'oscar'), g.sim.bond('oscar', 'angela')];
const talks = (g: Played): number => (g.day.logic as unknown as { goodTalks: number }).goodTalks;

async function settle(g: Played): Promise<void> {
  await g.until(() => g.day.main !== 'open' || g.sim.clock >= 17 * 60, 3000);
}

describe('Tuesday: Not Speaking', () => {
  it('sets the day up: the row, the deadline, Dwight sure of a plot, and a status anyone can read', () => {
    const g = play(storyAt(2, 31));
    expect(bonds(g)).toEqual([-40, -40]);
    expect(g.sim.facts()).toContain(ROW.fact);
    expect(g.sim.person('dwight')!.conviction?.text).toBe(ROW.dwight);
    expect(g.day.goalUi().status).toBe('Talks that went well: 0 of 3');
    expect(g.day.goalUi().progress).toBe(0);
    // Two sets of figures on the desks.
    expect(g.sim.effect('story.row.papers.angela')).toBeTruthy();
    expect(g.day.def.help?.join(' ')).toMatch(/Dwight/);
    // The clues do not name the stirrer.
    expect(g.day.def.hints.join(' ')).not.toMatch(/Dwight/);
  });

  for (const seed of [31, 32]) {
    it(`doing nothing loses: the accounts go in late (seed ${seed})`, async () => {
      const g = play(storyAt(2, seed));
      await g.toEnd();
      expect(g.day.main).toBe('lost');
      // Dwight's warnings made Angela think even less of Oscar.
      expect(bonds(g)[0]).toBeLessThan(-40);
      // The loss says how close it was, and who was still stirring.
      expect(g.day.lines[0]).toBe(ROW.lost);
      expect(g.day.lines[1]).toMatch(/never had one good talk|of the 3 they needed/);
      expect(g.day.lines[1]).toMatch(/Dwight was still warning Angela about Oscar/);
      expect(g.story.state.notes.accounts).toBe(false);
      // No extra goal wins itself.
      expect(g.day.extraState('stirring')).toBe('lost');
      expect(g.day.extraState('kind')).toBe('lost');
    });
  }

  for (const seed of [31, 33]) {
    it(`pushing the two of them while ignoring Dwight is not enough (seed ${seed})`, async () => {
      const g = play(storyAt(2, seed));
      await g.toClock(9, 10);
      g.whisper('angela', 'I should make peace with Oscar.');
      g.whisper('oscar', 'I should make peace with Angela.');
      await settle(g);
      expect(g.day.main).toBe('lost');
      expect(g.feed).toContain(ROW.dwightWarns);
    });
  }

  for (const seed of [31, 32, 33]) {
    it(`wins by talking them round: change Dwight's mind, then tell Angela to make peace (seed ${seed})`, async () => {
      const g = play(storyAt(2, seed));
      await g.toClock(9, 10);
      expect(g.whisper('dwight', 'Oscar is a decent man. I was wrong about him.')).toBeNull();
      await g.step(0.2);
      expect(g.day.extraState('stirring')).toBe('won');
      while (g.day.main === 'open' && g.sim.clock < 17 * 60) {
        if (g.day.influence.left >= 1) g.cue('angela', 'go and make peace with Oscar');
        await g.step(45);
      }
      expect(g.day.main).toBe('won');
      expect(g.feed).toContain(ROW.won);
      expect(g.sim.facts()).toContain(ROW.madeUp);
      expect(g.day.extraState('kind')).toBe('won');
      // They mean it.
      expect(bonds(g)[0]).toBeGreaterThanOrEqual(15);
      expect(bonds(g)[1]).toBeGreaterThanOrEqual(15);
      await g.step(25);
      expect(g.feed).toContain(ROW.scene.angela);
    });
  }

  for (const seed of [31, 33]) {
    it(`wins with powers: Locked In, then Cupid's Arrow both ways (seed ${seed})`, async () => {
      const g = play(storyAt(2, seed));
      await g.toClock(9, 10);
      expect(g.whisper('dwight', 'Oscar is a decent man. I was wrong about him.')).toBeNull();
      expect(g.day.warnsUi().lockIn).toBe(ROW.warnKind);
      expect(g.power('lockIn', { who: 'angela', other: 'oscar' })).toBeNull();
      expect(g.day.extraState('kind')).toBe('lost');
      await g.until(() => !g.sim.activeChaos().some((c) => c.id === 'lockIn'), 120);
      expect(g.feed).toContain(ROW.lockedTalk);
      expect(talks(g)).toBeGreaterThanOrEqual(1);
      expect(g.power('love', { who: 'angela', other: 'oscar' })).toBeNull();
      await g.step(61);
      expect(g.power('love', { who: 'oscar', other: 'angela' })).toBeNull();
      await settle(g);
      expect(g.day.main).toBe('won');
    });
  }

  it('wins with character tricks: Truth Serum on Oscar, a party for Angela, a raccoon in their corner', async () => {
    const g = play(storyAt(2, 34));
    await g.toClock(9, 30);
    expect(g.sim.person('angela')!.room).toBe(g.sim.person('oscar')!.room);
    expect(g.power('truth', { who: 'oscar' })).toBeNull();
    expect(g.feed).toContain(ROW.truthOscar);
    await g.step(5);
    expect(g.power('birthday', { who: 'angela' })).toBeNull();
    await g.step(5);
    expect(g.power('raccoon', { room: 'accounts' })).toBeNull();
    await settle(g);
    expect(g.day.main).toBe('won');
    expect(g.day.extraState('kind')).toBe('won');
  });

  it('counts the talks: a pushed one counts 1, a chat on their own half, and a stirrer undoes one', async () => {
    const g = play(storyAt(2, 34));
    await g.toClock(9, 5);
    g.sim.bus.emit('sceneDone', { people: ['angela', 'oscar'], trigger: 'ambient' });
    expect(talks(g)).toBe(0.5);
    expect(bonds(g)).toEqual([-35, -35]);
    // The same conversation reported twice counts once.
    g.sim.bus.emit('sceneDone', { people: ['oscar', 'angela'], trigger: 'plan', planKind: 'comfort' });
    expect(talks(g)).toBe(0.5);
    await g.step(21);
    g.sim.bus.emit('sceneDone', { people: ['oscar', 'angela'], trigger: 'plan', planKind: 'comfort' });
    expect(talks(g)).toBe(1.5);
    expect(g.day.goalUi().status).toBe('Talks that went well: 1 of 3');
    g.sim.bus.emit('sceneDone', { people: ['dwight', 'angela'], trigger: 'plan', planKind: 'gossip' });
    expect(talks(g)).toBe(0.5);
    expect(g.feed).toContain(ROW.dwightWarns);
  });

  it('a whispered idea of making peace leads to a hand-written talk, which counts once it has been said', async () => {
    const g = play(storyAt(2, 31));
    await g.toClock(9, 10);
    expect(g.whisper('dwight', 'Maybe I was wrong about Oscar.')).toBeNull();
    expect(g.whisper('angela', 'Life is too short to stay angry with Oscar.')).toBeNull();
    expect(g.whisper('oscar', 'Life is too short to stay angry with Angela.')).toBeNull();
    // When one of them walks over on purpose, the talk is spoken in their own written words
    // (stiff at first, warmer later), and the caption keeps count.
    const written = ROW.talks.flatMap((t) => [...t.angela, ...t.oscar]);
    expect(await g.until(() => g.feed.some((l) => written.includes(l)), 700)).toBe(true);
    expect(await g.until(() => g.feed.some((l) => /That is \d of 3/.test(l)), 60)).toBe(true);
    expect(talks(g)).toBeGreaterThanOrEqual(1);
  });

  it('set down face to face, they manage a few words: half a talk', async () => {
    const g = play(storyAt(2, 32));
    await g.toClock(9, 30);
    const o = g.sim.person('oscar')!;
    await g.drop('angela', { x: o.x + 14, y: o.y + 4 });
    expect(await g.until(() => talks(g) >= 0.5, 40)).toBe(true);
    expect(g.feed.some((l) => l === ROW.talkFace || l === ROW.talkChat)).toBe(true);
  });

  it('a talk still going at five counts, and a lost day says how close it was', async () => {
    const g = play(storyAt(2, 33));
    await g.toClock(16, 57);
    const run = g.day.logic as unknown as { talks: number; talking: boolean };
    run.talks = 2;
    run.talking = true;
    await g.toEnd();
    expect(g.day.main).toBe('won');
    expect(ROW.lostWhy(2, true, false)).toBe('Angela and Oscar had 2 good talks of the 3 they needed. Dwight was still warning Angela about Oscar.');
    expect(ROW.lostWhy(0.5, false, false)).toBe('Angela and Oscar never had one good talk.');
  });

  it('while they are making up, a scene never makes them like each other less', () => {
    const g = play(storyAt(2, 31));
    expect(g.day.vetoShift('angela', 'oscar', -12)).toBe(0);
    expect(g.day.vetoShift('oscar', 'angela', 12)).toBe(12);
    expect(g.day.vetoShift('jim', 'pam', -12)).toBe(-12);
  });

  it('after lunch Kevin starts worrying Oscar, if they have not made up by then', async () => {
    const g = play(storyAt(2, 35));
    await g.toClock(13, 1);
    expect(g.sim.person('kevin')!.conviction?.text).toBe(ROW.kevin);
    expect(g.feed).toContain(ROW.kevinStarts);
    g.sim.bus.emit('sceneDone', { people: ['kevin', 'oscar'], trigger: 'plan', planKind: 'gossip' });
    expect(g.feed).toContain(ROW.kevinWarns);
  });
});
