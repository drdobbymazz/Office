// Story mode's two music inputs: stakes (a tension layer that rises and falls
// smoothly) and the week's ending (a composed theme per ending, distinct from the
// title music). Checked on the composer's bars, on the player, and on node counts.

import { describe, expect, it } from 'vitest';
import {
  Composer, DEFAULT_MOOD, ENDINGS, ENDING_IDS, PROGS, STAKES_DOWN, STAKES_UP, parseChord, styleForMood,
  type BarPlan, type EndingId
} from '@/game/audio/music';
import type { MusicMood } from '@/game/audio/api';
import { MusicPlayer } from '@/game/audio/musicPlayer';
import { FakeContext } from './offline';

const seeded = (s = 7) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const bars = (c: Composer, n: number): BarPlan[] => Array.from({ length: n }, () => c.nextBar());
const count = (ps: BarPlan[], inst: string) => ps.reduce((n, p) => n + p.events.filter((e) => e.inst === inst).length, 0);
const TENSE = new Set(PROGS.tense.flatMap((p) => p.bars.flatMap((b) => b.split('|'))));

describe('stakes', () => {
  it('rises over about three bars and falls back over about six, never jumping', () => {
    const c = new Composer(seeded());
    bars(c, 2);
    c.setMood({ stakes: 1 });
    const up = bars(c, 5);
    for (const p of up) expect(p.mixTo.tension - p.mixFrom.tension).toBeLessThanOrEqual(STAKES_UP + 1e-9);
    expect(up[0].mixTo.tension).toBeGreaterThan(0);
    expect(up[2].mixTo.tension).toBe(1);
    c.setMood({ stakes: 0 });
    const down = bars(c, 8);
    for (const p of down) expect(p.mixFrom.tension - p.mixTo.tension).toBeLessThanOrEqual(STAKES_DOWN + 1e-9);
    expect(down[4].mixTo.tension).toBeGreaterThan(0);
    expect(down[5].mixTo.tension).toBe(0);
    // each bar starts where the last ended (the player crossfades within the bar)
    const all = [...up, ...down];
    for (let i = 1; i < all.length; i++) expect(all[i].mixFrom.tension).toBeCloseTo(all[i - 1].mixTo.tension, 9);
  });

  it('follows a wobbly story value without stepping more than the ease allows', () => {
    const c = new Composer(seeded(4));
    const rng = seeded(99);
    let prev = 0;
    for (let i = 0; i < 60; i++) {
      c.setMood({ stakes: rng() < 0.2 ? 1 : rng() * 0.4 });
      const p = c.nextBar();
      const d = p.mixTo.tension - prev;
      expect(d).toBeLessThanOrEqual(STAKES_UP + 1e-9);
      expect(d).toBeGreaterThanOrEqual(-STAKES_DOWN - 1e-9);
      prev = p.mixTo.tension;
    }
  });

  it('raises tension: a pulse and a ticking clock, faster and straighter time, darker chords', () => {
    const run = (stakes: number) => { const c = new Composer(seeded(11)); c.setMood({ stakes }); return bars(c, 24); };
    const calm = run(0), half = run(0.5), full = run(1);
    expect(count(calm, 'pulse') + count(calm, 'wood')).toBe(0);
    expect(count(full, 'pulse')).toBeGreaterThan(count(half, 'pulse'));
    expect(count(full, 'wood')).toBeGreaterThan(count(half, 'wood'));
    expect(count(full, 'swell')).toBeGreaterThan(0);
    expect(full[23].bpm).toBeGreaterThanOrEqual(calm[23].bpm + 8);
    expect(full[23].style.swing).toBeLessThan(calm[23].style.swing * 0.5);
    const tense = full.slice(4).filter((p) => p.chords.every((ch) => TENSE.has(ch.name))).length;
    expect(tense / full.slice(4).length).toBeGreaterThan(0.75);
  });

  it('the clock goes tick, tock', () => {
    const c = new Composer(seeded());
    c.setMood({ stakes: 0.5 });
    const p = bars(c, 4)[3];
    const wood = p.events.filter((e) => e.inst === 'wood').map((e) => [e.beat, e.midi]);
    expect(wood).toEqual([[0, 1], [1, 0], [2, 1], [3, 0]]);
  });

  it('only colours the working day: not menus, disco, a blackout or frozen time', () => {
    for (const m of [{ menu: true }, { disco: true }, { blackout: true }, { frozen: true }] as Partial<MusicMood>[]) {
      const c = new Composer(seeded());
      c.setMood({ ...m, stakes: 1 });
      const ps = bars(c, 6);
      expect(ps.every((p) => p.mixTo.tension === 0), JSON.stringify(m)).toBe(true);
      expect(count(ps, 'pulse')).toBe(0);
    }
  });

  it('thins out when the office is already frantic', () => {
    const run = (chaos: number) => { const c = new Composer(seeded(2)); c.setMood({ stakes: 1, chaos }); return bars(c, 16); };
    const quiet = run(0), wild = run(1);
    expect(count(wild, 'wood')).toBeLessThan(count(quiet, 'wood'));
    expect(count(wild, 'swell')).toBe(0);
  });

  it('shrugs off bad input', () => {
    for (const stakes of [NaN, -3, 7, Infinity]) {
      const c = new Composer(seeded());
      c.setMood({ stakes });
      for (const p of bars(c, 4)) {
        expect(p.mixTo.tension).toBeGreaterThanOrEqual(0);
        expect(p.mixTo.tension).toBeLessThanOrEqual(1);
        expect(Number.isFinite(p.bpm)).toBe(true);
      }
    }
  });
});

describe('the endings', () => {
  const play = (ending: EndingId, n: number, extra: Partial<MusicMood> = {}) => {
    const c = new Composer(seeded(5));
    bars(c, 3);
    c.setMood({ menu: true, ending, ...extra });
    return { c, ps: bars(c, n) };
  };

  it.each(ENDING_IDS)('%s plays its theme: an intro on the first chord, then eight bars that loop', (id) => {
    const d = ENDINGS[id];
    const { ps } = play(id, 1 + 8 + 2);
    expect(ps[0].chords[0].name).toBe(d.chords[0]);
    expect(ps[0].events.some((e) => e.inst === 'lead')).toBe(false);
    for (let i = 0; i < 10; i++) {
      const p = ps[1 + i];
      expect(p.chords[0].name).toBe(d.chords[i % 8]);
      const lead = p.events.filter((e) => e.inst === 'lead').map((e) => e.midi);
      expect(lead).toEqual(d.melody[i % 8].map((n) => n[2]));
    }
    // at its own tempo at once, and nothing from the office group
    for (const p of ps) {
      expect(p.bpm).toBe(d.bpm);
      expect(p.mixTo.ending).toBe(1);
      expect(p.mixTo.office).toBe(0);
      expect(p.events.every((e) => e.group === 'ending')).toBe(true);
    }
  });

  it.each(ENDING_IDS)('%s melody uses chord tones on the downbeats', (id) => {
    const d = ENDINGS[id];
    d.melody.forEach((bar, i) => {
      const ch = parseChord(d.chords[i]);
      const pcs = ch.tones.map((t) => (ch.root + t) % 12);
      for (const [step, , midi] of bar) if (step % 8 === 0) expect(pcs, `${id} bar ${i + 1} step ${step}`).toContain(midi % 12);
    });
  });

  it('takes over from the finale scene (chaos, a blackout, disco) while the ending is on screen', () => {
    const { ps } = play('closed', 4, { chaos: 1, blackout: true, disco: true, stakes: 1 });
    for (const p of ps) {
      expect(p.mixTo.ending).toBe(1);
      expect(p.mixTo.drone + p.mixTo.disco + p.mixTo.tension).toBe(0);
    }
  });

  it('saved is bright, scraped bittersweet, closed slow and sparse, and none is the title music', () => {
    const rate = (ps: BarPlan[]) => ps.reduce((n, p) => n + p.events.length, 0) / ps.reduce((s, p) => s + p.barDur, 0);
    const insts = (ps: BarPlan[]) => new Set(ps.flatMap((p) => p.events.map((e) => e.inst)));
    const menuC = new Composer(seeded(5));
    menuC.setMood({ menu: true });
    const menu = bars(menuC, 24);
    const saved = play('saved', 17).ps.slice(1), scraped = play('scraped', 17).ps.slice(1), closed = play('closed', 17).ps.slice(1);
    // tempo: saved quickest, closed slowest; the title sits at 88
    expect(styleForMood({ ...DEFAULT_MOOD, menu: true }).bpm).toBe(88);
    expect(ENDINGS.saved.bpm).toBeGreaterThan(100);
    expect(ENDINGS.scraped.bpm).toBeLessThan(88);
    expect(ENDINGS.closed.bpm).toBeLessThan(ENDINGS.scraped.bpm);
    // density: saved busy, closed sparser than anything
    expect(rate(saved)).toBeGreaterThan(2.5 * rate(menu));
    expect(rate(closed)).toBeLessThan(0.6 * rate(menu));
    expect(rate(closed)).toBeLessThan(rate(scraped));
    // colour: saved has a kit and a glockenspiel (the title has neither), scraped a pad and brushes,
    // closed no keys and no drums at all
    for (const i of ['kick', 'hat', 'glock']) { expect(insts(saved).has(i as never)).toBe(true); expect(insts(menu).has(i as never)).toBe(false); }
    for (const i of ['pad', 'brush']) { expect(insts(scraped).has(i as never)).toBe(true); expect(insts(menu).has(i as never)).toBe(false); }
    for (const i of ['keys', 'kick', 'hat', 'brush']) expect(insts(closed).has(i as never)).toBe(false);
    // harmony: scraped turns to B flat minor; closed sits in D minor; saved has the lydian G
    expect(ENDINGS.scraped.chords).toContain('Bbm6');
    expect(ENDINGS.closed.chords[0]).toBe('Dm9');
    expect(ENDINGS.saved.chords).toContain('Gadd9');
    // and no ending's chord sequence is one of the office progressions
    const progs = Object.values(PROGS).flat().map((p) => p.bars.join(' '));
    for (const id of ENDING_IDS) for (let i = 0; i < 8; i += 4) expect(progs).not.toContain(ENDINGS[id].chords.slice(i, i + 4).join(' '));
  });

  it('going back to the title returns to the title music at once', () => {
    const { c } = play('saved', 5);
    c.setMood({ ending: null, menu: true });
    const p = c.nextBar();
    expect(p.bpm).toBe(88);
    expect(p.mixTo.office).toBe(1);
    expect(p.mixTo.ending).toBe(0);
    expect(p.events.some((e) => e.group === 'ending')).toBe(false);
  });

  it('every event is in the bar and sane, for stakes and every ending', () => {
    const c = new Composer(seeded(3));
    for (const m of [{ stakes: 0.3 }, { stakes: 1 }, { stakes: 1, chaos: 1 }, ...ENDING_IDS.map((ending) => ({ ending, menu: true }))] as Partial<MusicMood>[]) {
      c.setMood({ ...DEFAULT_MOOD, ...m });
      for (const p of bars(c, 10)) for (const e of p.events) {
        expect(e.beat).toBeGreaterThanOrEqual(0);
        expect(e.beat).toBeLessThan(4);
        expect(e.beat + e.dur).toBeLessThanOrEqual(4.6);
        expect(e.dur).toBeGreaterThan(0);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        expect(e.midi).toBeLessThan(100);
      }
    }
  });
});

describe('the music player', () => {
  const player = (mood: Partial<MusicMood>) => {
    const ctx = new FakeContext(2, 44100, 44100);
    const p = new MusicPlayer(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode, null, new Composer(seeded(5)));
    p.setMood({ ...DEFAULT_MOOD, ...mood });
    p.start(0);
    return { ctx, p };
  };
  const drive = (ctx: FakeContext, p: MusicPlayer, from: number, to: number) => {
    for (let t = from; t < to; t += 0.025) { ctx.currentTime = t; p.scheduleUntil(t + 0.12); }
  };

  it('starts an ending with its sting, not at the next bar line', () => {
    const { ctx, p } = player({ menu: true });
    drive(ctx, p, 0, 1.0); // the first title bar runs from 0.05 to about 2.8 s
    p.setMood({ ending: 'saved' });
    drive(ctx, p, 1.0, 1.2);
    const last = p.history[p.history.length - 1];
    expect(last.bpm).toBe(ENDINGS.saved.bpm);
    expect(last.t).toBeGreaterThan(1.0);
    expect(last.t).toBeLessThan(1.12);
  });

  it('costs no more than the existing busiest office music on a phone', () => {
    const perSecond = (mood: Partial<MusicMood>) => {
      const { ctx, p } = player(mood);
      drive(ctx, p, 0, 40);
      return (ctx.counts.oscillators + ctx.counts.bufferSources + ctx.counts.filters) / 40;
    };
    const busiest = perSecond({ chaos: 1 });
    expect(perSecond({ stakes: 1 })).toBeLessThan(busiest * 0.75);
    expect(perSecond({ stakes: 1, chaos: 1 })).toBeLessThan(busiest * 1.25);
    for (const ending of ENDING_IDS) expect(perSecond({ menu: true, ending }), ending).toBeLessThan(busiest * 0.75);
  });
});
