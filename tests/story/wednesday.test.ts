// Wednesday, "The Client": Mr Figgis must sit down with the right salesperson
// while he is still willing to talk business. His arrival is a beat that brings
// the game back to normal speed; under 50 patience the game says why nothing
// happens; Andy (jokes) and Dwight (shouting) only win him over when he is very
// happy. Doing nothing loses; calling him in with a good salesperson wins, and so
// do telling a salesperson to bring him, carrying him in, or a dog first.
import { describe, expect, it } from 'vitest';
import type { FeedItem } from '@/game/core/types';
import { FIGGIS } from '@/game/story';
import { CLIENT } from '@/game/story/text';
import { play, storyAt, type Played } from './harness';

const patience = (g: Played): number => (g.day.logic as unknown as { currentPatience: number }).currentPatience;
const GOOD = ['jim', 'phyllis', 'stanley'];

async function settle(g: Played): Promise<void> {
  await g.until(() => g.day.main !== 'open' || g.sim.clock >= 17 * 60, 3000);
}

/** Call him in with Jim; if no good salesperson shows up, call Phyllis too. */
async function callHimIn(g: Played): Promise<void> {
  expect(g.announce('Mr Figgis and Jim, please come to the conference room.')).toBeNull();
  await g.step(25);
  if (g.day.main === 'open' && !g.sim.peopleIn('meeting').some((p) => GOOD.includes(p.id))) g.announce('Phyllis, please come to the conference room.');
}

function anything(g: Played, text: string): void {
  expect(g.day.attempt('anything', () => {
    g.director.customEvent(text);
    return null;
  })).toBeNull();
  g.day.note({ kind: 'anything', text });
}

describe('Wednesday: The Client', () => {
  it('he arrives at 10:30 as a beat that slows the game down; his card says what he likes', async () => {
    const g = play(storyAt(3, 41));
    const items: FeedItem[] = [];
    g.sim.bus.on('feed', (f) => items.push(f));
    await g.toClock(10, 20);
    expect(g.sim.person(FIGGIS)).toBeFalsy();
    expect(g.day.goalUi().status).toBe(CLIENT.before);
    await g.toClock(10, 45);
    const f = g.sim.person(FIGGIS)!;
    expect(f.present).toBe(true);
    const arrival = items.find((i) => i.text === CLIENT.arrives);
    expect(arrival?.beat).toBe(true);
    expect(arrival?.slow).toBe(true);
    const card = g.sim.personDetail(FIGGIS)!;
    expect(card.wants).toBe(CLIENT.wants);
    expect(card.fears).toBe(CLIENT.fears);
    expect(card.quirk).toBe(CLIENT.quirk);
    expect(g.day.goalUi().status).toMatch(/^Patience \d+$/);
    expect(patience(g)).toBeLessThan(70);
  });

  it('if the accounts went in late yesterday he has heard, and starts with less patience', async () => {
    const story = storyAt(3, 42);
    story.state.notes.accounts = false;
    expect(story.def.recap?.(story.state.notes)).toBe(CLIENT.recapLate);
    const g = play(story);
    await g.toClock(10, 31);
    expect(patience(g)).toBeLessThanOrEqual(60);
    expect(g.feed).toContain(CLIENT.arrivesLate);
  });

  for (const seed of [41, 42]) {
    it(`doing nothing loses: Michael bothers him, he runs out of patience and walks out (seed ${seed})`, async () => {
      const g = play(storyAt(3, seed));
      await g.toEnd();
      expect(g.day.main).toBe('lost');
      expect(g.day.lines[0]).toMatch(/walks out|leaves without signing/);
      expect(g.story.state.notes.figgis).toBe(false);
      expect(g.sim.person(FIGGIS)).toBeFalsy();
      expect(g.feed).toContain(CLIENT.meddled);
      // On the way he says plainly why nothing could happen.
      expect(g.feed).toContain(CLIENT.fedUp50);
      // No extra goal wins itself.
      expect(g.day.extraState('michael')).toBe('lost');
      expect(g.day.extraState('dog')).toBe('lost');
    });
  }

  for (const seed of [41, 42, 43]) {
    it(`wins by calling him in with a good salesperson, who pitches in their own words (seed ${seed})`, async () => {
      const g = play(storyAt(3, seed));
      await g.toClock(10, 31);
      await callHimIn(g);
      await settle(g);
      expect(g.day.main).toBe('won');
      expect(g.feed).toContain(CLIENT.signed);
      expect(g.sim.facts()).toContain(CLIENT.signedFact);
      // He signs after the last line of the pitch, not before.
      const lastLine = Math.max(...Object.values(CLIENT.pitch).filter((_, i) => i < 3).map((lines) => g.feed.lastIndexOf(lines[lines.length - 1][1])));
      expect(lastLine).toBeGreaterThanOrEqual(0);
      expect(g.feed.indexOf(CLIENT.signed)).toBeGreaterThan(lastLine);
      // He leaves happy.
      expect(await g.until(() => !g.sim.person(FIGGIS), 80)).toBe(true);
    });
  }

  for (const seed of [41, 42]) {
    it(`who pitches matters: Andy's jokes lose him when he is not in a very good mood (seed ${seed})`, async () => {
      const g = play(storyAt(3, seed));
      await g.toClock(10, 31);
      g.announce('Mr Figgis and Andy, please come to the conference room.');
      await g.until(() => g.feed.includes(CLIENT.lostHim('Andy')), 200);
      expect(g.feed).toContain(CLIENT.rough.andy);
      expect(g.feed).toContain(CLIENT.lostHim('Andy'));
      expect(g.day.goalUi().status).toMatch(/too annoyed to talk business/);
      await settle(g);
      expect(g.day.main).toBe('lost');
    });
  }

  it('a joker can still close the deal when he is very happy (a puppy first)', async () => {
    let won = 0;
    for (const seed of [41, 43, 44]) {
      const g = play(storyAt(3, seed));
      await g.toClock(10, 36);
      expect(g.power('puppy', { room: g.sim.person(FIGGIS)!.room === 'outside' ? 'bullpen' : g.sim.person(FIGGIS)!.room as 'bullpen' })).toBeNull();
      expect(g.day.extraState('dog')).toBe('won');
      // Give the puppy a moment: everyone near it goes to make a fuss of it first.
      await g.step(12);
      g.announce('Mr Figgis and Andy, please come to the conference room.');
      await settle(g);
      if (g.day.main === 'won') {
        won++;
        expect(g.feed).toContain(CLIENT.signedRough);
      }
    }
    expect(won).toBeGreaterThanOrEqual(2);
  });

  for (const seed of [41, 42]) {
    it(`wins by telling Jim to take him to the conference room (seed ${seed})`, async () => {
      const g = play(storyAt(3, seed));
      await g.toClock(10, 33);
      expect(g.cue('jim', 'take Mr Figgis to the conference room and pitch')).toBeNull();
      await settle(g);
      expect(g.feed).toContain(CLIENT.escort('Jim', 'the conference room'));
      expect(g.day.main).toBe('won');
    });
  }

  it('wins by carrying Stanley and him into the conference room (he hates being grabbed)', async () => {
    const g = play(storyAt(3, 43));
    await g.toClock(10, 34);
    await g.drop('stanley', 'spot.meet10');
    const before = patience(g);
    await g.drop(FIGGIS, 'spot.meet8');
    expect(patience(g)).toBeLessThanOrEqual(before - 14);
    await settle(g);
    expect(g.day.main).toBe('won');
  });

  it('a dog brought in with Anything counts for a dog lover', async () => {
    const g = play(storyAt(3, 44));
    await g.toClock(10, 36);
    const before = patience(g);
    anything(g, 'A golden retriever trots into the bullpen.');
    expect(patience(g)).toBeGreaterThanOrEqual(before + 29);
    expect(g.day.extraState('dog')).toBe('won');
    expect(g.feed).toContain(CLIENT.dogAnything);
  });

  it('a whisper to Michael keeps him away (Keep Michael away), even when you call him in late', async () => {
    const g = play(storyAt(3, 45));
    await g.toClock(10, 20);
    g.whisper('michael', 'I have paperwork to finish in my office.');
    await g.toClock(11, 10);
    g.announce('Mr Figgis and Jim, please come to the conference room.');
    await g.step(25);
    if (g.day.main === 'open' && !g.sim.peopleIn('meeting').some((p) => GOOD.includes(p.id))) g.announce('Stanley, please come to the conference room.');
    await settle(g);
    expect(g.day.main).toBe('won');
    expect(g.day.extraState('michael')).toBe('won');
    expect(g.feed).not.toContain(CLIENT.meddled);
  });

  it('a disaster in his room costs a lot of patience; one elsewhere costs a little; the game warns first', async () => {
    const g = play(storyAt(3, 45));
    await g.toClock(10, 40);
    expect(g.day.warnsUi().fire).toBe(CLIENT.warnDisaster);
    expect(g.sim.person(FIGGIS)!.room).toBe('bullpen');
    let p = patience(g);
    expect(g.power('snackStorm')).toBeNull();
    expect(p - patience(g)).toBeCloseTo(8, 0);
    p = patience(g);
    expect(g.power('raccoon', { room: 'bullpen' })).toBeNull();
    expect(p - patience(g)).toBeCloseTo(25, 0);
  });
});
