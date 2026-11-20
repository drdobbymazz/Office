import { describe, expect, it } from 'vitest';
import { Composer, barDur, beatDur, chordScale, parseChord, PROGS, stepToBeat, styleForMood, voiceChord, DEFAULT_MOOD, type BarPlan } from '@/game/audio/music';

const seeded = (s = 7) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const bars = (c: Composer, n: number): BarPlan[] => Array.from({ length: n }, () => c.nextBar());

describe('bar and beat maths', () => {
  it('converts tempo to durations', () => {
    expect(beatDur(120)).toBeCloseTo(0.5);
    expect(barDur(120)).toBeCloseTo(2);
    expect(barDur(96)).toBeCloseTo(2.5);
  });
  it('swings only the off-8th 16ths', () => {
    expect(stepToBeat(0, 0.2)).toBe(0);
    expect(stepToBeat(4, 0.2)).toBe(1);
    expect(stepToBeat(2, 0.2)).toBeCloseTo(0.55);
    expect(stepToBeat(1, 0.2)).toBeCloseTo(0.25);
  });
});

describe('styleForMood', () => {
  it('maps moods to tempo and layers', () => {
    expect(styleForMood(DEFAULT_MOOD).bpm).toBe(96);
    expect(styleForMood({ ...DEFAULT_MOOD, disco: true }).bpm).toBe(120);
    expect(styleForMood({ ...DEFAULT_MOOD, chaos: 1 }).bpm).toBeGreaterThan(110);
    expect(styleForMood({ ...DEFAULT_MOOD, menu: true }).bpm).toBeLessThan(96);
    expect(styleForMood({ ...DEFAULT_MOOD, blackout: true }).mix.drone).toBe(1);
    expect(styleForMood({ ...DEFAULT_MOOD, frozen: true, disco: true }).mix.frozen).toBe(1);
    expect(styleForMood({ ...DEFAULT_MOOD, hour: 18 }).evening).toBeGreaterThan(0.6);
  });
});

describe('harmony', () => {
  it('parses every chord in every progression', () => {
    for (const pool of Object.values(PROGS)) for (const p of pool) {
      expect(p.bars.length).toBe(4);
      for (const b of p.bars) for (const n of b.split('|')) expect(() => parseChord(n)).not.toThrow();
    }
  });
  it('voices chords in range with smooth voice leading', () => {
    let prev: number[] | null = null;
    for (const n of ['Fmaj7', 'Dm7', 'Bbmaj7', 'C7sus', 'Gm9', 'A7b9']) {
      const v = voiceChord(parseChord(n), prev);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(55);
      expect(Math.max(...v)).toBeLessThanOrEqual(76);
      if (prev) expect(Math.abs(v.reduce((a, b) => a + b) / v.length - prev.reduce((a, b) => a + b) / prev.length)).toBeLessThan(5);
      prev = v;
    }
  });
  it('uses a lydian B natural over G', () => {
    expect(chordScale(parseChord('Gadd9'))).toContain(11);
    expect(chordScale(parseChord('Fmaj7'))).toEqual([5, 7, 9, 10, 0, 2, 4]);
    expect(chordScale(parseChord('Ebmaj7'))).toContain(3);
  });
});

describe('Composer', () => {
  it('disco is four on the floor at exactly 120 BPM, switching on a bar line', () => {
    const c = new Composer(seeded());
    bars(c, 3);
    c.setMood({ disco: true });
    const [first, second] = bars(c, 2);
    expect(first.bpm).toBe(120);
    expect(first.barDur).toBeCloseTo(2);
    expect(first.mixFrom.disco).toBe(0);
    expect(first.mixTo.disco).toBe(1);
    expect(first.mixTo.office).toBe(0);
    expect(first.events.some((e) => e.group === 'office')).toBe(true); // still fading out
    expect(second.events.some((e) => e.group === 'office')).toBe(false);
    const kicks = second.events.filter((e) => e.inst === 'kick').map((e) => e.beat);
    expect(kicks).toEqual([0, 1, 2, 3]);
    const offBass = second.events.filter((e) => e.inst === 'bass' && e.beat % 1 === 0.5);
    expect(offBass.length).toBe(4);
  });
  it('tempo eases with chaos instead of jumping', () => {
    const c = new Composer(seeded());
    bars(c, 2);
    c.setMood({ chaos: 1 });
    const ps = bars(c, 8).map((p) => p.bpm);
    for (let i = 1; i < ps.length; i++) expect(Math.abs(ps[i] - ps[i - 1])).toBeLessThanOrEqual(4);
    expect(ps[ps.length - 1]).toBeGreaterThan(110);
  });
  it('more chaos means more notes', () => {
    const count = (chaos: number) => { const c = new Composer(seeded(11)); c.setMood({ chaos }); return bars(c, 16).reduce((s, p) => s + p.events.length, 0); };
    expect(count(0.5)).toBeGreaterThan(count(0) * 1.3);
    expect(count(1)).toBeGreaterThan(count(0.5) * 1.2);
  });
  it('frozen holds one chord', () => {
    const c = new Composer(seeded());
    bars(c, 2);
    c.setMood({ frozen: true });
    const names = bars(c, 6).map((p) => p.chords.map((x) => x.name).join('|'));
    expect(new Set(names).size).toBe(1);
  });
  it('evening and menu are thinner than the working day', () => {
    const count = (m: object) => { const c = new Composer(seeded(5)); c.setMood(m); return bars(c, 16).reduce((s, p) => s + p.events.length, 0); };
    expect(count({ hour: 19 })).toBeLessThan(count({ hour: 11 }));
    expect(count({ menu: true })).toBeLessThan(count({ hour: 11 }));
  });
  it('does not obviously loop: chords and melody vary over 32 bars', () => {
    const c = new Composer(seeded(9));
    const ps = bars(c, 32);
    expect(new Set(ps.map((p) => p.chords[0].name)).size).toBeGreaterThan(6);
    const leads = ps.map((p) => p.events.filter((e) => e.inst === 'lead').map((e) => e.midi).join(','));
    expect(new Set(leads).size).toBeGreaterThan(8);
  });
  it('every event is in the bar and sane', () => {
    const c = new Composer(seeded(3));
    for (const m of [{ chaos: 0 }, { chaos: 1 }, { disco: true }, { blackout: true }, { frozen: true }, { menu: true }]) {
      c.setMood({ ...DEFAULT_MOOD, ...m });
      for (const p of bars(c, 4)) for (const e of p.events) {
        expect(e.beat).toBeGreaterThanOrEqual(0);
        expect(e.beat).toBeLessThan(4);
        expect(e.dur).toBeGreaterThan(0);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        expect(e.midi).toBeLessThan(100);
      }
    }
  });
  it('the first bar after start fades in', () => {
    const c = new Composer(seeded());
    const p = c.nextBar();
    expect(p.mixFrom.office).toBe(0);
    expect(p.mixTo.office).toBe(1);
  });
});
