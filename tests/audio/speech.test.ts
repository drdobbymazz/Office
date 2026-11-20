import { describe, expect, it } from 'vitest';
import { chunkText, planSpeech, EMOTION_COLOUR, STYLE_COLOUR } from '@/game/audio/speech';
import { CAST } from '@/game/core/cast';
import { EMOTIONS } from '@/game/core/types';
import type { VoiceDef } from '@/game/core/look';

const V: VoiceDef = { pitch: 200, wave: 'triangle', spread: 0, speed: 1 };
const seeded = (s = 1) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

describe('chunkText', () => {
  it('splits words into syllable-ish chunks', () => {
    expect(chunkText('hello').length).toBe(2);
    expect(chunkText('make').length).toBe(1); // silent final e
    expect(chunkText('a big banana').length).toBe(1 + 1 + 3);
    expect(chunkText('hmm').length).toBe(1); // no vowels still talks
    expect(chunkText('2024').length).toBe(4);
  });
  it('ignores spaces and punctuation', () => {
    expect(chunkText('  ...!?  ').length).toBe(0);
    const c = chunkText('hi, yo');
    expect(c.map((x) => x.at)).toEqual([0, 4]);
  });
});

describe('planSpeech timing', () => {
  it('starts each blip when its first letter appears (charIndex / cps)', () => {
    const text = 'Right, who moved my stapler?';
    for (const cps of [20, 30, 60]) {
      const p = planSpeech(V, text, { cps }, seeded());
      for (const b of p.blips) expect(b.t).toBeCloseTo(b.at / cps, 9);
      // blips never overlap and stay in order
      for (let i = 1; i < p.blips.length; i++) expect(p.blips[i].t).toBeGreaterThanOrEqual(p.blips[i - 1].t + p.blips[i - 1].dur - 1e-9);
      // the line ends close to when the typewriter does
      expect(p.duration).toBeLessThan(text.length / cps + 0.2);
    }
  });
  it('pauses at spaces and punctuation (no blip there)', () => {
    const text = 'Yes. No. Maybe.';
    const p = planSpeech(V, text, { cps: 30 }, seeded());
    for (const b of p.blips) expect(/[A-Za-z]/.test(text[b.at])).toBe(true);
  });
  it('slow talkers make fewer, longer blips than fast ones', () => {
    const text = 'I really think we should probably talk about the photocopier situation today';
    const slow = planSpeech({ ...V, speed: 0.75 }, text, { cps: 30 }, seeded());
    const fast = planSpeech({ ...V, speed: 1.3 }, text, { cps: 30 }, seeded());
    expect(slow.blips.length).toBeLessThan(fast.blips.length);
    const mean = (p: typeof slow) => p.blips.reduce((s, b) => s + b.dur, 0) / p.blips.length;
    expect(mean(slow)).toBeGreaterThan(mean(fast));
  });
  it('handles empty and odd input', () => {
    expect(planSpeech(V, '', { cps: 30 }).blips).toEqual([]);
    expect(planSpeech(V, '!!!', { cps: 30 }).duration).toBe(0);
    const p = planSpeech(V, 'hello', { cps: 0 });
    expect(p.blips.every((b) => Number.isFinite(b.t) && Number.isFinite(b.f0))).toBe(true);
  });
});

describe('planSpeech contour', () => {
  const last = (t: string) => { const p = planSpeech(V, t, { cps: 30 }, seeded()); return { p, b: p.blips[p.blips.length - 1] }; };
  it('rises on a question', () => {
    const { p, b } = last('Are you going to the kitchen?');
    expect(b.f0).toBeGreaterThan(p.blips[0].f0);
    expect(b.f1).toBeGreaterThan(b.f0);
  });
  it('falls at a full stop', () => {
    const { p, b } = last('I am going to the kitchen.');
    expect(b.f0).toBeLessThan(p.blips[0].f0);
    expect(b.f1).toBeLessThan(b.f0);
  });
  it('is emphatic on an exclamation', () => {
    const calm = planSpeech(V, 'Get out of my office.', { cps: 30 }, seeded());
    const loud = planSpeech(V, 'Get out of my office!', { cps: 30 }, seeded());
    const avg = (p: typeof calm, k: 'f0' | 'gain') => p.blips.reduce((s, b) => s + b[k], 0) / p.blips.length;
    expect(avg(loud, 'f0')).toBeGreaterThan(avg(calm, 'f0'));
    expect(avg(loud, 'gain')).toBeGreaterThan(avg(calm, 'gain'));
  });
  it('jitters by voice.spread', () => {
    const text = 'the the the the the the the the the the';
    const flat = planSpeech({ ...V, spread: 0 }, text, { cps: 30 }, seeded(3));
    const wide = planSpeech({ ...V, spread: 4 }, text, { cps: 30 }, seeded(3));
    const sd = (p: typeof flat) => { const f = p.blips.slice(1, -2).map((b) => Math.log2(b.f0)); const m = f.reduce((a, b) => a + b, 0) / f.length; return Math.sqrt(f.reduce((a, b) => a + (b - m) ** 2, 0) / f.length); };
    expect(sd(wide)).toBeGreaterThan(sd(flat) + 0.05);
  });
  it('emotion colours pitch and speed', () => {
    const text = 'Somebody has eaten my sandwich from the fridge.';
    const mean = (e: Parameters<typeof planSpeech>[2]['emotion']) => { const p = planSpeech(V, text, { cps: 30, emotion: e }, seeded()); return p.blips.reduce((s, b) => s + Math.log2(b.f0), 0) / p.blips.length; };
    expect(mean('scared')).toBeGreaterThan(mean('neutral'));
    expect(mean('angry')).toBeLessThan(mean('neutral'));
    expect(mean('sad')).toBeLessThan(mean('neutral'));
    expect(EMOTION_COLOUR.excited.speed).toBeGreaterThan(1);
    expect(EMOTION_COLOUR.sad.speed).toBeLessThan(1);
  });
  it('has a colour for every emotion and style', () => {
    for (const e of EMOTIONS) expect(EMOTION_COLOUR[e]).toBeDefined();
    for (const s of ['say', 'shout', 'whisper', 'think'] as const) expect(STYLE_COLOUR[s]).toBeDefined();
    expect(STYLE_COLOUR.shout.gain).toBeGreaterThan(STYLE_COLOUR.say.gain);
    expect(STYLE_COLOUR.whisper.tone).toBeLessThan(0.3);
  });
});

describe('the cast sound different', () => {
  it('the fifteen voices differ in mean pitch or rate', () => {
    const text = 'Right, who moved my stapler? I need it now!';
    const stats = Object.values(CAST).map((c) => {
      const p = planSpeech(c.voice, text, { cps: 30 }, seeded());
      return { id: c.id, f: p.blips.reduce((s, b) => s + Math.log2(b.f0), 0) / p.blips.length, n: p.blips.length, d: p.blips.reduce((s, b) => s + b.dur, 0) / p.blips.length };
    });
    for (let i = 0; i < stats.length; i++) for (let j = i + 1; j < stats.length; j++) {
      const a = stats[i], b = stats[j];
      const pitchApart = Math.abs(a.f - b.f) * 12 > 1; // more than a semitone
      const rateApart = Math.abs(a.d - b.d) > 0.008 || a.n !== b.n;
      expect(pitchApart || rateApart, `${a.id} vs ${b.id}`).toBe(true);
    }
    // The deepest, slowest talker against the highest, fastest one.
    const stanley = stats.find((s) => s.id === 'stanley')!, kelly = stats.find((s) => s.id === 'kelly')!;
    expect(stanley.f).toBeLessThan(kelly.f - 1);
    expect(stanley.d).toBeGreaterThan(kelly.d);
  });
});
