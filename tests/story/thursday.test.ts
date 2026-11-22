// Thursday, "The Leak": someone faxes Corporate from the annex, and the fax
// machine beeps for each page. Other people use the fax machine too, so one
// sighting is never enough. Doing nothing loses; watching who is at the fax
// machine when it beeps wins, and so do the witnesses' thoughts, a Paranoia
// test and an informant. Blind guessing and serum brute force mostly lose.
import { describe, expect, it } from 'vitest';
import { CAST, displayName } from '@/game/core/cast';
import type { CastId, CharId, FeedItem } from '@/game/core/types';
import { Story, memoryStore, pickLeak } from '@/game/story';
import { LEAK } from '@/game/story/text';
import { play, storyAt, type Played } from './harness';

interface LeakFacts { beeps: { at: number; there: CharId[] }[]; herrings: CastId[]; nervous: CastId[]; ruled: CharId[] }
const facts = (g: Played): LeakFacts => (g.day.logic as unknown as { facts: LeakFacts }).facts;
const isBeep = (f: FeedItem): boolean => !!f.beat && f.text.includes('The fax machine in the annex beeped');
const atFax = (g: Played): CharId[] => g.sim.people().filter((p) => p.isCast && p.present && p.doing === LEAK.fax.stay).map((p) => p.id);

/** Play on, calling `onBeep` with who is at the fax machine each time it beeps (as a player looking at People would see). */
async function watchBeeps(g: Played, onBeep: (there: CharId[], n: number) => void, until: () => boolean, max = 17 * 60): Promise<void> {
  let n = 0;
  let pending = false;
  const off = g.sim.bus.on('feed', (f) => {
    if (isBeep(f)) pending = true;
  });
  while (!until() && g.sim.clock < max && g.day.main === 'open') {
    await g.step(0.5);
    if (pending) {
      pending = false;
      n += 1;
      onBeep(atFax(g), n);
    }
  }
  off();
}

const SEEDS = [51, 52, 53, 54, 55, 56];

describe('Thursday: The Leak', () => {
  it('sets the day up: a leak from fourteen, a hidden note, errand runners, nervous innocents, dear tests', () => {
    expect(pickLeak(5)).toBe(pickLeak(5));
    const picks = new Set(Array.from({ length: 40 }, (_, i) => pickLeak(i + 1)));
    expect(picks.size).toBeGreaterThan(8);
    expect(LEAK.candidates).toHaveLength(14);
    expect(LEAK.candidates).not.toContain('michael');
    for (const id of picks) expect(LEAK.candidates).toContain(id);
    // Every one of them has a motive, a confession, thoughts, a denial, a secret and an errand.
    for (const id of Object.keys(CAST) as CastId[]) {
      const p = LEAK.person(id);
      expect(p.motive.length && p.confession.length && p.denial.length && p.errand.length).toBeTruthy();
      expect(p.thoughts.length).toBeGreaterThanOrEqual(2);
      expect(p.secret.length).toBeGreaterThanOrEqual(2);
      for (const line of [p.motive, p.confession, p.denial, p.errand, ...p.thoughts, ...p.secret]) expect(line).not.toMatch(/—|–/);
      // The model's notes fit the sim's limit.
      expect(LEAK.hidden(CAST[id].name, p.motive).length).toBeLessThanOrEqual(300);
      expect(LEAK.nervousNote(CAST[id].name, CAST[id].persona.secret).length).toBeLessThanOrEqual(300);
    }
    const g = play(storyAt(4, 51));
    const leak = g.story.state.notes.leak;
    expect(g.sim.briefFor(leak, []).hidden).toBe(LEAK.hidden(displayName(leak), LEAK.person(leak).motive));
    const f = facts(g);
    expect(f.herrings).toHaveLength(2);
    expect(f.nervous).toHaveLength(2);
    expect([...f.herrings, ...f.nervous]).not.toContain(leak);
    for (const id of f.nervous) expect(g.sim.briefFor(id, []).hidden).toContain('has never sent anything to Corporate');
    expect(g.day.accuseUi()).toEqual({ triesLeft: 2, accused: [], label: LEAK.label });
    expect(g.day.costOf('truth')).toBe(4);
    expect(g.day.costOf('secretLeak')).toBe(4);
    expect(g.day.goalUi().status).toBe(LEAK.status(0, 0));
  });

  it('doing nothing loses, and the report says who it was and when the fax machine beeped', async () => {
    const g = play(storyAt(4, 51));
    await g.toEnd();
    const leak = g.story.state.notes.leak;
    expect(g.day.main).toBe('lost');
    expect(g.day.lines[0]).toBe(LEAK.nobody);
    expect(g.day.lines[1]).toMatch(new RegExp(`^It was ${displayName(leak)} all along: (he|she) was at the fax machine when it beeped at \\d\\d:\\d\\d`));
    expect(g.day.lines[2]).toBe(LEAK.motiveLine(LEAK.person(leak).motive));
    expect(g.story.state.notes.leakTimes?.length).toBeGreaterThanOrEqual(4);
    expect(g.day.extraState('firstTry')).toBe('lost');
    expect(g.day.extraState('quick')).toBe('lost');
    expect(g.day.accuseUi()).toBeNull();
  });

  it('the first two pages always have company at the fax machine, so one sighting is never enough', async () => {
    for (const seed of SEEDS) {
      const g = play(storyAt(4, seed));
      await g.toClock(11, 40);
      const b = facts(g).beeps;
      expect(b.length).toBeGreaterThanOrEqual(2);
      expect(b[0].there.length).toBeGreaterThanOrEqual(2);
      expect(b[0].there).toContain(g.story.state.notes.leak);
      expect(b[1].there).toContain(g.story.state.notes.leak);
    }
  });

  for (const seed of SEEDS) {
    it(`wins by watching who is at the fax machine when it beeps (seed ${seed})`, async () => {
      const g = play(storyAt(4, seed));
      let suspects: CharId[] | null = null;
      await watchBeeps(g, (there) => {
        suspects = suspects ? suspects.filter((id) => there.includes(id)) : there;
        if (suspects.length === 1) g.day.accuse(suspects[0]);
      }, () => g.day.main !== 'open');
      expect(g.day.main).toBe('won');
      expect(g.day.extraState('firstTry')).toBe('won');
      expect(g.story.state.notes.leakFound).toBe(true);
      expect(g.feed).toContain(LEAK.right(displayName(g.story.state.notes.leak)));
    });
  }

  it('wins from what Kevin and Toby saw, without watching the floor', async () => {
    for (const seed of [57, 58, 59]) {
      const g = play(storyAt(4, seed));
      let suspects: string[] | null = null;
      const names = (Object.keys(CAST) as CastId[]).map((id) => ({ id, name: CAST[id].name }));
      let beeps = 0;
      const off = g.sim.bus.on('feed', (f) => {
        if (isBeep(f)) beeps += 1;
      });
      let seen = 0;
      while (g.day.main === 'open' && g.sim.clock < 16 * 60 + 50) {
        await g.step(2);
        if (beeps > seen) {
          // A little after the beep, read the witnesses' cards.
          await g.step(4);
          seen = beeps;
          const said = LEAK.witnesses.map((w) => g.sim.person(w)?.thought ?? '').find((t) => t.includes('at the fax machine when it beeped'));
          if (!said) continue;
          const there = names.filter((n) => new RegExp(`\\b${n.name}\\b`).test(said.split(' at the fax machine')[0])).map((n) => n.id);
          suspects = suspects ? suspects.filter((id) => there.includes(id as CastId)) : there;
          if (suspects.length === 1) g.day.accuse(suspects[0] as CastId);
        }
      }
      off();
      expect(g.day.main).toBe('won');
    }
  });

  it('wins before the second page with a Paranoia test: the leak runs to tear up the fax log', async () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const g = play(storyAt(4, seed));
      let first: CharId[] = [];
      await watchBeeps(g, (there, n) => {
        if (n === 1) first = there;
      }, () => first.length > 0);
      const [a, b] = first;
      expect(g.power('paranoia', { who: a })).toBeNull();
      const ran = await g.until(() => g.sim.person(a)?.doing === LEAK.shred.doing || g.sim.person(a)?.doing === LEAK.shred.stay, 14);
      g.day.accuse(ran ? a : b);
      expect(g.day.main).toBe('won');
      expect(g.day.extraState('quick')).toBe('won');
      expect(g.day.extraState('firstTry')).toBe('won');
    }
  });

  it('wins with an informant told to keep an eye on the fax machine', async () => {
    const g = play(storyAt(4, 60));
    const leak = g.story.state.notes.leak;
    // Someone reliable, who is not the leak.
    const informant = (['oscar', 'pam', 'angela', 'stanley', 'jim'] as CastId[]).find((id) => id !== leak && !facts(g).herrings.includes(id))!;
    await g.toClock(9, 12);
    expect(g.cue(informant, 'go and keep an eye on the fax machine')).toBeNull();
    expect(g.feed).toContain(LEAK.informant(displayName(informant)));
    let report = '';
    const off = g.sim.bus.on('feed', (f) => {
      if (f.kind === 'say' && f.who === informant && f.text.startsWith('I was watching.')) report = f.text;
    });
    await g.until(() => !!report, 400);
    off();
    expect(report).toContain(displayName(leak));
    expect(g.sim.person(informant)!.room).toBe('annex');
  });

  it('Truth Serum costs 4: the leak confesses, an innocent is ruled out', async () => {
    const g = play(storyAt(4, 53));
    const leak = g.story.state.notes.leak;
    const innocent = LEAK.candidates.find((id) => id !== leak && g.sim.person(id))!;
    await g.toClock(9, 30);
    expect(g.power('truth', { who: innocent })).toBeNull();
    expect(g.day.influence.left).toBe(3);
    await g.step(4);
    expect(g.feed).toContain(LEAK.ruledOut(displayName(innocent), CAST[innocent].pronoun));
    expect(g.day.goalUi().status).toBe(LEAK.status(facts(g).beeps.length, 1));
    // Not enough left for a second dose.
    expect(g.day.refusal('truth')).toMatch(/Not enough influence/);
    const g2 = play(storyAt(4, 53));
    await g2.toClock(9, 30);
    await g2.until(() => !!g2.sim.person(leak)?.present && !g2.sim.isAirborne(leak), 30);
    expect(g2.power('truth', { who: leak })).toBeNull();
    await g2.step(5);
    expect(g2.feed).toContain(LEAK.confessed(displayName(leak)));
    g2.day.accuse(leak);
    expect(g2.day.main).toBe('won');
  });

  it('Leak a Secret exposes the leak; on an innocent it only spills their own secret', async () => {
    const g = play(storyAt(4, 54));
    const leak = g.story.state.notes.leak;
    await g.toClock(9, 40);
    expect(g.power('secretLeak', { who: leak })).toBeNull();
    await g.step(2);
    expect(g.day.main).toBe('won');
    expect(g.feed).toContain(LEAK.exposed(displayName(leak)));
    expect(g.day.extraState('firstTry')).toBe('lost');
    const g2 = play(storyAt(4, 54));
    const innocent = LEAK.candidates.find((id) => id !== leak)!;
    await g2.toClock(9, 40);
    expect(g2.power('secretLeak', { who: innocent })).toBeNull();
    await g2.step(3);
    expect(g2.day.main).toBe('open');
    expect(g2.feed).toContain(LEAK.notInIt(displayName(innocent)));
  });

  it('a pointed announcement makes the leak lie low, and makes the nervous flinch', async () => {
    const quiet = play(storyAt(4, 55));
    const loud = play(storyAt(4, 55));
    await quiet.toClock(10, 0);
    await loud.toClock(10, 0);
    expect(loud.announce('Corporate is tracing every fax sent from this office.')).toBeNull();
    expect(loud.feed).toContain(LEAK.pointed);
    await quiet.toClock(11, 30);
    await loud.toClock(11, 30);
    const at = (g: Played): number => facts(g).beeps[1]?.at ?? 99999;
    expect(at(loud)).toBeGreaterThan(at(quiet));
  });

  it('two wrong accusations lose; the office turns on the innocent, who remembers it on Friday', async () => {
    const g = play(storyAt(4, 55));
    const leak = g.story.state.notes.leak;
    const [a, b] = LEAK.candidates.filter((id) => id !== leak && g.sim.person(id));
    await g.toClock(10);
    const before = Math.min(...(Object.keys(CAST) as CastId[]).filter((id) => id !== a).map((id) => g.sim.bond(id, a)));
    g.day.accuse(a);
    expect(g.day.main).toBe('open');
    expect(g.feed).toContain(LEAK.wrong(displayName(a)));
    expect(Math.min(...(Object.keys(CAST) as CastId[]).filter((id) => id !== a).map((id) => g.sim.bond(id, a)))).toBeLessThan(before);
    expect(g.day.accuseUi()).toEqual({ triesLeft: 1, accused: [a], label: LEAK.label });
    expect(g.day.extraState('firstTry')).toBe('lost');
    g.day.accuse(a); // the same person again does nothing
    expect(g.day.accuseUi()?.triesLeft).toBe(1);
    g.day.accuse(b);
    expect(g.day.main).toBe('lost');
    expect(g.day.lines[0]).toBe(LEAK.outOfTries);
    expect(g.day.lines[1]).toContain(`It was ${displayName(leak)} all along`);
    expect(g.story.state.notes.wronged).toEqual([a, b]);
  });

  it('blind guessing and serum brute force in a second week mostly lose', async () => {
    let serumWins = 0;
    let guessWins = 0;
    const N = 30;
    for (let i = 0; i < N; i++) {
      const seed = 700 + i;
      // Knowing the list of fourteen, but nothing else: one dose of serum, then two guesses.
      const g = play(storyAt(4, seed));
      const leak = g.story.state.notes.leak;
      const r = (k: number): number => ((seed * 9301 + k * 49297) % 233280) / 233280;
      const order = [...LEAK.candidates].sort((x, y) => r(x.length + x.charCodeAt(0)) - r(y.length + y.charCodeAt(1)));
      await g.toClock(9, 20);
      const dosed = order.find((id) => g.sim.person(id)?.present && g.sim.person(id)!.available)!;
      g.power('truth', { who: dosed });
      await g.step(5);
      if (dosed === leak) g.day.accuse(leak);
      else for (const id of order.filter((x) => x !== dosed).slice(0, 2)) if (g.day.main === 'open') g.day.accuse(id);
      if (g.day.main === 'won') serumWins++;
      // Two blind guesses.
      const h = play(storyAt(4, seed));
      await h.toClock(9, 5);
      for (const id of order.slice(3, 5)) if (h.day.main === 'open') h.day.accuse(id);
      if (h.day.main === 'won') guessWins++;
    }
    expect(serumWins / N).toBeLessThan(0.4);
    expect(guessWins / N).toBeLessThan(0.3);
  }, 120_000);

  it('Wednesday changes Thursday: after a walk-out the fax machine is busier, after a signing quieter', async () => {
    const busy = Story.create(memoryStore(), 61);
    busy.state.chapter = 4;
    busy.state.notes.figgis = false;
    const quiet = Story.create(memoryStore(), 61);
    quiet.state.chapter = 4;
    quiet.state.notes.figgis = true;
    const gb = play(busy);
    const gq = play(quiet);
    await gb.toClock(16, 50);
    await gq.toClock(16, 50);
    expect(facts(gb).beeps.length).toBeGreaterThan(facts(gq).beeps.length);
    expect(busy.ui(null).recap).toBe(LEAK.recapBusy);
    expect(quiet.ui(null).recap).toBe(LEAK.recapQuiet);
  });
});
