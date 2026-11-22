// The story sounds, rendered in Node (offline.ts) and measured: each one plays, is
// heard, never clips, ends within its declared length, costs little, and reads as
// what it is. Winning and losing must sound clearly different.

import { describe, expect, it, vi } from 'vitest';
import type { SfxId } from '@/game/audio/api';
import { SFX } from '@/game/audio/sfx';
import { analyze, mixdown, powerSpectrum, rmsFrames, fft } from '@/game/audio/analysis';
import { Engine } from '@/game/audio/engine';
import { MusicPlayer } from '@/game/audio/musicPlayer';
import { FakeContext, seeded } from './offline';
import { atMaster, peakDb, renderVoice, sum, SR, type Rendered } from './nodeRender';

const STORY: SfxId[] = [
  'goalWin', 'goalFail', 'dayWon', 'dayLost', 'stamp', 'tick', 'wipe',
  'endingSaved', 'endingScraped', 'endingClosed', 'phoneRing', 'fax', 'gavel', 'clink'
];
const AT = 0.05;

const cache = new Map<SfxId, Rendered>();
const voice = (id: SfxId): Rendered => {
  let v = cache.get(id);
  if (!v) { v = renderVoice(id, { at: AT }); cache.set(id, v); }
  return v;
};
const mono = (v: Rendered) => mixdown([v.L, v.R]);
const dbOf = (x: number) => (x > 1e-12 ? 20 * Math.log10(x) : -240);

/** Share of power in [lo, hi) Hz. */
function bandShare(x: Float32Array, lo: number, hi: number): number {
  const ps = powerSpectrum(x, 4096);
  const bin = SR / 4096;
  let a = 0, t = 0;
  for (let k = 1; k < ps.length; k++) { t += ps[k]; if (k * bin >= lo && k * bin < hi) a += ps[k]; }
  return a / t;
}

function centroid(x: Float32Array): number {
  const ps = powerSpectrum(x, 2048);
  let n = 0, d = 0;
  for (let k = 1; k < ps.length; k++) { n += ((k * SR) / 2048) * ps[k]; d += ps[k]; }
  return n / d;
}

/** Pitch-class profile (0 = C) of the tonal part, 180 Hz to 2.2 kHz. */
function chroma(x: Float32Array): number[] {
  const ps = powerSpectrum(x, 8192);
  const bin = SR / 8192;
  const c = new Array<number>(12).fill(0);
  for (let k = 1; k < ps.length; k++) {
    const f = k * bin;
    if (f < 180 || f > 2200) continue;
    const m = 69 + 12 * Math.log2(f / 440);
    const r = Math.round(m);
    if (Math.abs(m - r) <= 0.3) c[((r % 12) + 12) % 12] += ps[k];
  }
  const tot = c.reduce((a, b) => a + b, 0);
  return c.map((v) => v / tot);
}
const PC = { C: 0, Db: 1, D: 2, F: 5, G: 7, Ab: 8, A: 9 } as const;

/** Onset times (s): sharp rises of the log energy, at least 50 ms apart. */
function onsets(x: Float32Array, rel = 0.3): number[] {
  const r = rmsFrames(x, SR, 0.005, 0.01);
  const lg = Array.from(r, (v) => Math.log1p(200 * v));
  const d = lg.map((v, i) => (i ? Math.max(0, v - lg[i - 1]) : 0));
  const mx = Math.max(...d);
  const out: number[] = [];
  let last = -99;
  for (let i = 1; i < d.length - 1; i++) {
    if (d[i] > mx * rel && d[i] >= d[i - 1] && d[i] >= d[i + 1] && i - last > 10) { out.push(i * 0.005); last = i; }
  }
  return out;
}

/** Strongest frequency between lo and hi Hz: one Hann-windowed frame, zero-padded, parabolic peak. */
function peakFreq(x: Float32Array, lo: number, hi: number): number {
  const N = 16384;
  const n = Math.min(x.length, N);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < n; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const bin = SR / N;
  const p = (k: number) => re[k] ** 2 + im[k] ** 2;
  let best = 0, bk = 0;
  for (let k = Math.ceil(lo / bin); k < Math.min(N / 2 - 1, hi / bin); k++) if (p(k) > best) { best = p(k); bk = k; }
  const a = Math.log(p(bk - 1) + 1e-30), b = Math.log(p(bk) + 1e-30), c = Math.log(p(bk + 1) + 1e-30);
  const d = a - 2 * b + c;
  return (bk + (d !== 0 ? (0.5 * (a - c)) / d : 0)) * bin;
}

describe('every story sound', () => {
  it('has a definition, and the stings dip the music while they play', () => {
    for (const id of STORY) expect(SFX[id], id).toBeDefined();
    for (const id of ['goalWin', 'goalFail', 'dayWon', 'dayLost', 'endingSaved', 'endingScraped', 'endingClosed'] as SfxId[]) {
      const d = SFX[id].duck;
      expect(d, id).toBeDefined();
      expect(d!.depth).toBeGreaterThan(0.2);
      expect(d!.depth).toBeLessThan(0.8);
      expect(d!.hold).toBeLessThanOrEqual(SFX[id].dur);
    }
  });

  it.each(STORY)('%s renders, is heard, and does not clip', (id) => {
    const v = voice(id);
    const m = analyze([v.L, v.R], SR);
    expect(m.nan).toBe(0);
    expect(m.peakDb, 'loud enough to hear').toBeGreaterThan(-28);
    expect(m.peakDb, 'its own peak leaves headroom').toBeLessThan(-6);
    // at the master input (sfx bus at default volumes, plus the room), before the compressor and limiter
    expect(peakDb(atMaster(v, SFX[id].wet)), 'no clipping even without the limiter').toBeLessThan(-6);
    expect(Math.abs(m.dc)).toBeLessThan(0.002);
  });

  it.each(STORY)('%s stays within its duration, starting and ending in silence', (id) => {
    const v = voice(id);
    const m = analyze([v.L, v.R], SR);
    const dur = SFX[id].dur;
    // falls below -60 dBFS for good before its declared length is up
    expect(m.tail - AT).toBeLessThanOrEqual(dur + 0.02);
    // and every oscillator or noise source has stopped by then
    expect(v.lastStop).toBeLessThanOrEqual(dur + 0.05);
    expect(m.first).toBeLessThan(1e-4);
    expect(m.last).toBeLessThan(1e-4);
  });

  it.each(STORY)('%s is cheap enough for a phone and audible on a phone speaker', (id) => {
    const v = voice(id);
    expect(v.counts.oscillators + v.counts.bufferSources).toBeLessThanOrEqual(id === 'tick' ? 2 : 80);
    expect(v.counts.filters).toBeLessThanOrEqual(8);
    // phone speakers play little below 300 Hz: enough of every sound must live above it
    expect(bandShare(mono(v), 300, 16000), 'share above 300 Hz').toBeGreaterThan(id === 'stamp' ? 0.3 : 0.6);
  });
});

describe('winning and losing', () => {
  it('wins are in F major, the goal lost turns to F minor', () => {
    for (const id of ['goalWin', 'dayWon', 'endingSaved'] as SfxId[]) {
      const c = chroma(mono(voice(id)));
      expect(c[PC.F] + c[PC.A] + c[PC.C], `${id}: F major triad`).toBeGreaterThan(0.8);
      expect(c[PC.A], id).toBeGreaterThan(10 * c[PC.Ab]);
    }
    const f = chroma(mono(voice('goalFail')));
    expect(f[PC.Ab]).toBeGreaterThan(10 * f[PC.A]);
    expect(f[PC.F] + f[PC.Ab] + f[PC.C]).toBeGreaterThan(0.8);
  });

  it('wins are brighter than losses (higher, more open)', () => {
    expect(centroid(mono(voice('goalWin')))).toBeGreaterThan(1.4 * centroid(mono(voice('goalFail'))));
    expect(centroid(mono(voice('dayWon')))).toBeGreaterThan(1.4 * centroid(mono(voice('dayLost'))));
  });

  it('the lost day steps down chromatically to a long G', () => {
    const c = chroma(mono(voice('dayLost')));
    expect(c[PC.G]).toBeGreaterThan(0.4);
    expect(c[PC.Ab]).toBeGreaterThan(0.04);
  });

  it('the endings go from bright to dark: saved, scraped, closed', () => {
    const [s, m, c] = (['endingSaved', 'endingScraped', 'endingClosed'] as SfxId[]).map((id) => centroid(mono(voice(id))));
    expect(s).toBeGreaterThan(m * 1.15);
    expect(m).toBeGreaterThan(c * 1.15);
    // scraped borrows D flat (the minor iv: bittersweet); closed is D minor
    expect(chroma(mono(voice('endingScraped')))[PC.Db]).toBeGreaterThan(0.05);
    const k = chroma(mono(voice('endingClosed')));
    expect(k[PC.D] + k[PC.F] + k[PC.A]).toBeGreaterThan(0.85);
    // closed is the slowest to die away
    expect(SFX.endingClosed.dur).toBeGreaterThan(SFX.endingSaved.dur);
  });
});

describe('story props read as what they are', () => {
  it('the phone rings twice, from two bells struck in turn 20 times a second', () => {
    const x = mono(voice('phoneRing'));
    expect(bandShare(x, 1000, 4500)).toBeGreaterThan(0.8);
    const r = rmsFrames(x, SR, 0.01, 0.02);
    const at = (s: number) => dbOf(r[Math.floor((s + AT) / 0.01)]);
    expect(at(0.35)).toBeGreaterThan(-32);
    expect(at(0.98), 'silence between the rings').toBeLessThan(at(0.35) - 40);
    expect(at(1.4)).toBeGreaterThan(-32);
    // the strike rhythm shows in the envelope: 40 strikes a second in all
    const seg = x.subarray(Math.floor((AT + 0.05) * SR), Math.floor((AT + 0.7) * SR));
    const N = 32768, re = new Float64Array(N), im = new Float64Array(N);
    let mean = 0;
    for (let i = 0; i < seg.length; i++) mean += Math.abs(seg[i]);
    mean /= seg.length;
    for (let i = 0; i < seg.length; i++) re[i] = Math.abs(seg[i]) - mean;
    fft(re, im);
    const bin = SR / N;
    let best = 0, bf = 0;
    for (let k = Math.ceil(10 / bin); k < 100 / bin; k++) { const p = re[k] ** 2 + im[k] ** 2; if (p > best) { best = p; bf = k * bin; } }
    expect(bf).toBeGreaterThan(36);
    expect(bf).toBeLessThan(44);
  });

  it('the fax plays its calling beep, answer tone and the 1650 / 1850 Hz handshake', () => {
    const x = mono(voice('fax'));
    const seg = (a: number, b: number) => x.subarray(Math.floor((AT + a) * SR), Math.floor((AT + b) * SR));
    expect(Math.abs(peakFreq(seg(0.01, 0.12), 300, 4000) - 1100)).toBeLessThan(15);
    expect(Math.abs(peakFreq(seg(0.19, 0.36), 300, 4000) - 2100)).toBeLessThan(15);
    const hs = seg(0.43, 0.7);
    expect(bandShare(hs, 1600, 1900)).toBeGreaterThan(0.6);
    expect(onsets(x).length).toBeGreaterThanOrEqual(3);
  });

  it('the gavel knocks twice and the glass is tapped three times', () => {
    const g = onsets(mono(voice('gavel')), 0.4);
    expect(g.length).toBe(2);
    expect(g[1] - g[0]).toBeGreaterThan(0.2);
    expect(g[1] - g[0]).toBeLessThan(0.3);
    const c = onsets(mono(voice('clink')), 0.12);
    expect(c.length).toBe(3);
    expect(Math.abs(peakFreq(mono(voice('clink')), 500, 4000) - 1760)).toBeLessThan(20);
  });

  it('the stamp is a short, hard hit with its body in the band a phone plays', () => {
    const v = voice('stamp');
    const x = mono(v);
    const m = analyze([v.L, v.R], SR);
    expect(m.tail - AT).toBeLessThan(0.3);
    let pk = 0, at = 0;
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk) { pk = Math.abs(x[i]); at = i / SR; }
    expect(at - AT, 'peak within 15 ms').toBeLessThan(0.015);
    expect(bandShare(x, 300, 3000)).toBeGreaterThan(0.3);
  });

  it('the tick is tiny, and a count-up climbs, then starts low again after a pause', () => {
    const v = voice('tick');
    const m = analyze([v.L, v.R], SR);
    expect(m.tail - AT).toBeLessThan(0.06);
    expect(m.peakDb).toBeLessThan(-18);
    // twelve ticks 50 ms apart, then one more after half a second, in one context
    const times = [...Array.from({ length: 12 }, (_, i) => 0.05 + i * 0.05), 1.2];
    const x = seeded(3, () => {
      const ctx = new FakeContext(2, Math.ceil(1.4 * SR), SR);
      const c = ctx as unknown as BaseAudioContext;
      for (const t of times) SFX.tick.build({ ctx: c, dest: c.destination, track() {} }, 1, t);
      const { channels } = ctx.render();
      return channels[0];
    });
    const f = (t: number) => peakFreq(x.subarray(Math.floor(t * SR), Math.floor((t + 0.03) * SR)), 1000, 4000);
    const first = f(times[0]), last = f(times[11]), again = f(times[12]);
    expect(last).toBeGreaterThan(first * 1.8);
    expect(Math.abs(again - first)).toBeLessThan(first * 0.06);
  });

  it('the wipe is soft and moves from left to right', () => {
    const v = voice('wipe');
    expect(analyze([v.L, v.R], SR).peakDb).toBeLessThan(-16);
    const a = Math.floor(AT * SR), h = Math.floor(0.17 * SR);
    let l1 = 0, r1 = 0, l2 = 0, r2 = 0;
    for (let i = a; i < a + h; i++) { l1 += v.L[i] ** 2; r1 += v.R[i] ** 2; }
    for (let i = a + h; i < a + 2 * h; i++) { l2 += v.L[i] ** 2; r2 += v.R[i] ** 2; }
    expect(l1).toBeGreaterThan(r1);
    expect(r2).toBeGreaterThan(l2);
  });
});

describe('levels when story sounds land together', () => {
  const at = (id: SfxId, t: number) => ({ m: atMaster(voice(id), SFX[id].wet), at: t });
  const stacks: Record<string, () => { m: ReturnType<typeof atMaster>; at: number }[]> = {
    'goal won: the jingle and the banner stamp': () => [at('goalWin', 0), at('stamp', 0.03)],
    'goal lost: the let-down and the stamp': () => [at('goalFail', 0), at('stamp', 0.03)],
    'the report: wipe, won, stamp, a count-up': () => [at('wipe', 0), at('dayWon', 0.25), at('stamp', 0.6), ...Array.from({ length: 19 }, (_, i) => at('tick', 1.1 + i * 0.05))],
    'Thursday: fax, gavel, the leak found': () => [at('fax', 0), at('gavel', 0.4), at('goalWin', 0.7), at('stamp', 0.72)],
    'Friday: the clink, the phone, the goal': () => [at('clink', 0), at('phoneRing', 0.1), at('goalWin', 0.5), at('stamp', 0.52)],
    'the ending: wipe and the sting': () => [at('wipe', 0), at('endingSaved', 0.1)]
  };
  it.each(Object.keys(stacks))('%s stays under clipping before the limiter', (name) => {
    const mix = sum(stacks[name](), 5);
    // pre-limiter peak at the master input; the master chain only has to smooth, never rescue
    expect(peakDb(mix)).toBeLessThan(-2);
  });

  it('a sting dips the music, less when played quietly', () => {
    const ctx = new FakeContext(2, SR, SR);
    const e = new Engine(ctx as unknown as BaseAudioContext, false);
    const p = e.ensureMusic();
    p.start(0);
    const spy = vi.spyOn(MusicPlayer.prototype, 'duck');
    e.sfx('goalWin', {}, 0.5);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toBeCloseTo(SFX.goalWin.duck!.depth);
    e.sfx('dayLost', { volume: 0.5 }, 1);
    expect(spy.mock.calls[1][1]).toBeCloseTo(1 - (1 - SFX.dayLost.duck!.depth) * 0.5);
    e.sfx('stamp', {}, 1.5);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
