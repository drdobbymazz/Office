import { describe, expect, it } from 'vitest';
import { LOOP_IDS, SFX_IDS } from '@/game/audio/api';
import { SFX } from '@/game/audio/sfx';
import { LOOPS } from '@/game/audio/loops';
import { INSTRUMENTS } from '@/game/audio/instruments';
import { analyze, estimateBpm, fft, onsetRate, soundDistance } from '@/game/audio/analysis';

describe('parameter tables', () => {
  it('every SfxId has a sane definition', () => {
    for (const id of SFX_IDS) {
      const d = SFX[id];
      expect(d, id).toBeDefined();
      expect(d.gain).toBeGreaterThan(0);
      expect(d.gain).toBeLessThanOrEqual(1);
      expect(d.wet).toBeGreaterThanOrEqual(0);
      expect(d.wet).toBeLessThanOrEqual(0.6);
      expect(d.dur).toBeGreaterThan(0);
      expect(d.dur).toBeLessThanOrEqual(6);
      expect(d.max).toBeGreaterThanOrEqual(1);
      expect(d.vary).toBeLessThan(0.2);
    }
    expect(Object.keys(SFX).sort()).toEqual([...SFX_IDS].sort());
  });
  it('every LoopId has a definition', () => {
    for (const id of LOOP_IDS) {
      expect(LOOPS[id], id).toBeDefined();
      expect(LOOPS[id].gain).toBeGreaterThan(0);
      expect(LOOPS[id].gain).toBeLessThanOrEqual(1);
    }
    expect(Object.keys(LOOPS).sort()).toEqual([...LOOP_IDS].sort());
  });
  it('every instrument the composer uses exists', () => {
    for (const i of ['keys', 'bass', 'brush', 'tick', 'hat', 'ohat', 'kick', 'rim', 'clap', 'lead', 'pluck', 'stab', 'pad', 'drone', 'bell'] as const) {
      expect(typeof INSTRUMENTS[i]).toBe('function');
    }
  });
});

describe('analysis maths', () => {
  const sr = 8000;
  it('fft finds a sine', () => {
    const n = 256, re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 16 * i) / n);
    fft(re, im);
    let best = 0;
    for (let k = 1; k < n / 2; k++) if (Math.hypot(re[k], im[k]) > Math.hypot(re[best], im[best])) best = k;
    expect(best).toBe(16);
  });
  it('measures peak, tail, clicks', () => {
    const x = new Float32Array(sr);
    for (let i = 0; i < sr / 2; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr) * Math.exp(-i / 800);
    const m = analyze([x], sr);
    expect(m.peakDb).toBeGreaterThan(-7);
    expect(m.peakDb).toBeLessThan(-5);
    expect(m.tail).toBeGreaterThan(0.3);
    expect(m.tail).toBeLessThanOrEqual(0.5);
    expect(m.first).toBe(0);
    expect(m.centroid).toBeGreaterThan(300);
    expect(m.centroid).toBeLessThan(700);
  });
  it('estimates tempo and onset rate of a click track', () => {
    const x = new Float32Array(sr * 8);
    for (let b = 0; b < 16; b++) { const s = Math.floor(b * 0.5 * sr); for (let i = 0; i < 200; i++) x[s + i] = Math.sin(i * 0.5) * Math.exp(-i / 40); }
    expect(estimateBpm(x, sr)).toBeCloseTo(120, 0);
    expect(onsetRate(x, sr)).toBeCloseTo(2, 0);
  });
  it('distance is zero for identical sounds', () => {
    const x = new Float32Array(sr);
    for (let i = 0; i < 2000; i++) x[i] = Math.sin(i * 0.3) * (1 - i / 2000);
    const m = analyze([x], sr);
    expect(soundDistance(m, m)).toBe(0);
  });
});
