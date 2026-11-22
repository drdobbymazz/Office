// Wednesday, "The Client": Mr Figgis must sit down with a salesperson while
// he still has the patience. Doing nothing loses; calling him in wins, and so
// does carrying him in.
import { describe, expect, it } from 'vitest';
import { FIGGIS } from '@/game/story';
import { CLIENT } from '@/game/story/text';
import { play, storyAt, type Played } from './harness';

const patience = (g: Played): number => (g.day.logic as unknown as { currentPatience: number }).currentPatience;

describe('Wednesday: The Client', () => {
  it('he arrives at 10:30 and waits in reception; his card says what he likes', async () => {
    const g = play(storyAt(3, 41));
    await g.toClock(10, 20);
    expect(g.sim.person(FIGGIS)).toBeFalsy();
    expect(g.day.goalUi().status).toBe(CLIENT.before);
    await g.toClock(10, 45);
    const f = g.sim.person(FIGGIS)!;
    expect(f.present).toBe(true);
    expect(f.doing).toBe(CLIENT.waiting);
    expect(g.feed).toContain(CLIENT.arrives);
    const card = g.sim.personDetail(FIGGIS)!;
    expect(card.name).toBe('Mr Figgis');
    expect(card.wants).toBe(CLIENT.wants);
    expect(card.fears).toBe(CLIENT.fears);
    expect(card.quirk).toBe(CLIENT.quirk);
    expect(g.day.goalUi().status).toMatch(/^Patience \d+$/);
    expect(patience(g)).toBeLessThan(70);
  });

  it('doing nothing loses: he runs out of patience and walks out', async () => {
    const g = play(storyAt(3, 41));
    await g.toEnd();
    expect(g.day.main).toBe('lost');
    expect(g.day.lines[0]).toMatch(/walks out|leaves without signing/);
    expect(g.story.state.notes.figgis).toBe(false);
    expect(g.sim.person(FIGGIS)).toBeFalsy();
  });

  for (const seed of [41, 42]) {
    it(`wins by calling him and a salesperson to the conference room (seed ${seed})`, async () => {
      const g = play(storyAt(3, seed));
      await g.toClock(10, 31);
      expect(g.announce('Mr Figgis and Jim, please come to the conference room.')).toBeNull();
      await g.step(0.2);
      expect(g.feed).toContainEqual(expect.stringMatching(/Mr Figgis heads? for the conference room\.$/));
      // Not everyone listens: if no salesperson went, call another one by name.
      for (const who of ['Dwight', 'Phyllis']) {
        const line = [...g.feed].reverse().find((l) => / heads? for /.test(l)) ?? '';
        if (/Jim|Dwight|Phyllis/.test(line)) break;
        expect(g.announce(`${who}, please come to the conference room.`)).toBeNull();
        await g.step(0.2);
      }
      await g.until(() => g.day.main !== 'open', 150);
      expect(g.day.main).toBe('won');
      expect(g.feed).toContain(CLIENT.signed);
      expect(g.sim.facts()).toContain(CLIENT.signedFact);
      expect(g.day.extraState('handsOff')).toBe('won');
      // He leaves happy.
      expect(await g.until(() => !g.sim.person(FIGGIS), 80)).toBe(true);
    });
  }

  it('wins by carrying him and Dwight into the conference room (patience pays for it)', async () => {
    const g = play(storyAt(3, 43));
    await g.toClock(10, 33);
    const before = patience(g);
    await g.drop(FIGGIS, 'spot.meet8');
    expect(patience(g)).toBeLessThanOrEqual(before - 15);
    expect(g.day.extraState('handsOff')).toBe('lost');
    await g.drop('dwight', 'spot.meet10');
    await g.until(() => g.day.main !== 'open', 60);
    expect(g.day.main).toBe('won');
  });

  it('wins after cheering him up with the puppy (Dog person), then calling him in', async () => {
    const g = play(storyAt(3, 44));
    await g.toClock(10, 40);
    expect(g.sim.person(FIGGIS)!.room).toBe('bullpen');
    const before = patience(g);
    expect(g.power('puppy', { room: 'bullpen' })).toBeNull();
    expect(patience(g)).toBeGreaterThanOrEqual(before + 29);
    expect(g.day.extraState('dog')).toBe('won');
    await g.toClock(11, 0);
    expect(g.announce('Mr Figgis and Phyllis, please come to the conference room.')).toBeNull();
    await g.until(() => g.day.main !== 'open', 150);
    expect(g.day.main).toBe('won');
  });

  it('a disaster in his room costs a lot of patience; one elsewhere costs a little', async () => {
    const g = play(storyAt(3, 45));
    await g.toClock(10, 40);
    expect(g.sim.person(FIGGIS)!.room).toBe('bullpen');
    let p = patience(g);
    expect(g.power('fire', { room: 'kitchen' })).toBeNull();
    expect(p - patience(g)).toBeCloseTo(8, 0);
    p = patience(g);
    expect(g.power('flood', { room: 'bullpen' })).toBeNull();
    expect(p - patience(g)).toBeCloseTo(25, 0);
  });
});
