// Every one-shot sound effect, designed from oscillators, noise, filters and
// envelopes. Each `build` writes into o.dest starting at time t; P is the
// pitch multiplier (caller's pitch times a small random variation).
//
// Levels: UI sounds peak about 0.2-0.35, world sounds 0.4-0.8 before the sfx
// bus. The master chain limits anything that stacks up.

import type { SfxId } from './api';
import {
  type Out, KEY, PENTA_F, bell, burst, clamp, env, filt, gain, mallet, mtof, noise, osc, rr, shape, softWave, tone
} from './synth';

export interface SfxDef {
  /** Overall level of this effect (0..1). */
  gain: number;
  /** Reverb send (0..1). */
  wet: number;
  /** Rough length in seconds (render window for analysis; also used by the voice limiter). */
  dur: number;
  /** How much random pitch variation per play (fraction, e.g. 0.04 = +-4%). */
  vary: number;
  /** At most this many of the same effect at once (older ones are stolen). */
  max: number;
  build(o: Out, P: number, t: number): void;
}

const N = mtof;

/** Inharmonic gong partials: ratio, amp, decay. */
const GONG: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 4.6], [1.47, 0.7, 3.9], [1.97, 0.55, 3.2], [2.53, 0.42, 2.6], [2.99, 0.35, 2.2],
  [3.62, 0.26, 1.7], [4.2, 0.2, 1.4], [5.11, 0.14, 1.0], [6.3, 0.09, 0.7]
];
/** Small struck bell (lift, till). */
const BELL: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1.5], [2.0, 0.28, 0.9], [2.76, 0.22, 0.6], [5.4, 0.08, 0.25], [8.93, 0.03, 0.12]
];
/** Vibraphone-ish chime for the PA and hearts. */
const CHIME: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1.1], [3.98, 0.12, 0.35], [10.0, 0.025, 0.08]
];

function yap(o: Out, t: number, f: number, peak: number) {
  // a dog yap: a fast up-down pitch blip through a mouth-like band, plus breath
  const n = osc(o, softWave(o.ctx, 'sawtooth'), f, t, t + 0.16);
  n.frequency.setValueAtTime(f * 0.8, t);
  n.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.025);
  n.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.12);
  const bp = filt(o.ctx, 'bandpass', 1300, 2.2);
  const lp = filt(o.ctx, 'lowpass', 3200, 0.7);
  const g = gain(o.ctx);
  env(g.gain, t, 0.008, peak, 0.11);
  n.connect(bp).connect(lp).connect(g).connect(o.dest);
  burst(o, { kind: 'pink', t, a: 0.005, d: 0.07, peak: peak * 0.35, type: 'bandpass', f: 1800, q: 1.2 });
}

function coo(o: Out, t: number, f: number, peak: number) {
  // pigeon coo: throaty rising-then-falling sine with a fast flutter
  const n = osc(o, 'sine', f, t, t + 0.5);
  n.frequency.setValueAtTime(f * 0.92, t);
  n.frequency.linearRampToValueAtTime(f * 1.12, t + 0.14);
  n.frequency.linearRampToValueAtTime(f * 0.86, t + 0.42);
  const am = osc(o, 'sine', rr(22, 28), t, t + 0.5);
  const amg = gain(o.ctx, 0.35);
  const g = gain(o.ctx);
  const body = gain(o.ctx, 0.65);
  am.connect(amg).connect(body.gain);
  const lp = filt(o.ctx, 'lowpass', 900, 1);
  env(g.gain, t, 0.05, peak, 0.36, 0.02);
  n.connect(body).connect(lp).connect(g).connect(o.dest);
}

function flap(o: Out, t: number, peak: number) {
  burst(o, { kind: 'pink', t, a: 0.012, d: 0.05, peak, type: 'lowpass', f: rr(900, 1500), q: 0.8 });
}

function droplet(o: Out, t: number, f: number, peak: number) {
  tone(o, { f, f2: f * 1.9, glide: 0.05, t, a: 0.002, d: 0.06, peak });
}

export const SFX: Record<SfxId, SfxDef> = {
  // ── UI: tiny, rounded, in F major ────────────────────────────────────
  tap: {
    gain: 0.5, wet: 0.04, dur: 0.12, vary: 0.03, max: 4,
    build(o, P, t) {
      tone(o, { f: N(KEY.F6) * P, f2: N(KEY.F6) * P * 0.94, t, a: 0.002, d: 0.06, peak: 0.24 });
      tone(o, { type: 'triangle', f: N(KEY.F5) * P, t, a: 0.002, d: 0.035, peak: 0.14 });
    }
  },
  open: {
    gain: 0.5, wet: 0.1, dur: 0.3, vary: 0.02, max: 2,
    build(o, P, t) {
      mallet(o, N(KEY.C6) * P, t, 0.2, 0.16);
      mallet(o, N(KEY.F6) * P, t + 0.06, 0.24, 0.22);
      burst(o, { t, a: 0.03, d: 0.08, peak: 0.05, type: 'bandpass', f: 1500, f2: 4000, q: 1 });
    }
  },
  close: {
    gain: 0.45, wet: 0.1, dur: 0.3, vary: 0.02, max: 2,
    build(o, P, t) {
      mallet(o, N(KEY.F6) * P, t, 0.18, 0.12);
      mallet(o, N(KEY.C6) * P, t + 0.06, 0.2, 0.2);
      burst(o, { t, a: 0.03, d: 0.08, peak: 0.04, type: 'bandpass', f: 3500, f2: 1200, q: 1 });
    }
  },
  select: {
    gain: 0.5, wet: 0.08, dur: 0.25, vary: 0.02, max: 3,
    build(o, P, t) {
      mallet(o, N(KEY.A5) * P, t, 0.26, 0.2);
      tone(o, { type: 'triangle', f: N(KEY.A5 - 12) * P, t, a: 0.003, d: 0.08, peak: 0.08 });
    }
  },
  card: {
    gain: 0.5, wet: 0.06, dur: 0.22, vary: 0.04, max: 3,
    build(o, P, t) {
      // a card flick: papery swish up, then a tiny tick
      burst(o, { kind: 'white', t, a: 0.03, d: 0.07, peak: 0.16, type: 'bandpass', f: 1800 * P, f2: 5200 * P, q: 1.4 });
      tone(o, { f: N(KEY.D6) * P, t: t + 0.05, a: 0.002, d: 0.07, peak: 0.12 });
    }
  },
  confirm: {
    gain: 0.5, wet: 0.14, dur: 0.55, vary: 0.01, max: 2,
    build(o, P, t) {
      const notes = [KEY.F5, KEY.A5, KEY.C6, KEY.F6];
      notes.forEach((m, i) => mallet(o, N(m) * P, t + i * 0.055, 0.17 + i * 0.02, i === 3 ? 0.4 : 0.16));
    }
  },
  deny: {
    gain: 0.5, wet: 0.08, dur: 0.4, vary: 0.01, max: 2,
    build(o, P, t) {
      // two soft falling "bwomp"s, muted square
      tone(o, { type: softWave(o.ctx, 'square'), f: N(KEY.Bb4) * P, f2: N(KEY.Bb4) * P * 0.97, t, a: 0.006, d: 0.1, peak: 0.2, ft: 'lowpass', ff: 1400, ff2: 700 });
      tone(o, { type: softWave(o.ctx, 'square'), f: N(KEY.F4 + 1) * P, f2: N(KEY.F4) * P * 0.9, t: t + 0.12, a: 0.006, d: 0.2, peak: 0.22, ft: 'lowpass', ff: 1200, ff2: 400 });
    }
  },
  toast: {
    gain: 0.45, wet: 0.16, dur: 0.6, vary: 0.01, max: 2,
    build(o, P, t) {
      tone(o, { f: 420 * P, f2: 900 * P, glide: 0.04, t, a: 0.002, d: 0.05, peak: 0.12 }); // bubble pop
      bell(o, N(KEY.D6) * P, t + 0.03, 0.15, CHIME.map(([r, a, d]) => [r, a, d * 0.4] as const));
      bell(o, N(KEY.A6) * P, t + 0.12, 0.12, CHIME.map(([r, a, d]) => [r, a, d * 0.4] as const));
    }
  },
  objective: {
    gain: 0.5, wet: 0.25, dur: 1.1, vary: 0, max: 1,
    build(o, P, t) {
      [KEY.C6, KEY.F6, KEY.A6].forEach((m, i) => {
        bell(o, N(m) * P, t + i * 0.09, 0.15, CHIME.map(([r, a, d]) => [r, a, d * 0.7] as const));
        tone(o, { f: N(m) * P, detune: 9, t: t + i * 0.09, a: 0.01, d: 0.6, peak: 0.05 });
      });
      burst(o, { kind: 'white', t: t + 0.18, a: 0.05, d: 0.5, peak: 0.03, type: 'highpass', f: 7000 });
    }
  },
  whoosh: {
    gain: 0.55, wet: 0.1, dur: 0.4, vary: 0.06, max: 2,
    build(o, P, t) {
      const end = t + 0.34;
      const n = noise(o, 'pink', t, end);
      const bp = filt(o.ctx, 'bandpass', 400 * P, 1.6);
      bp.frequency.setValueAtTime(400 * P, t);
      bp.frequency.exponentialRampToValueAtTime(2600 * P, t + 0.14);
      bp.frequency.exponentialRampToValueAtTime(700 * P, end);
      const g = gain(o.ctx);
      shape(g.gain, t, [[0.13, 0.5], [0.33, 0]]);
      n.connect(bp).connect(g).connect(o.dest);
    }
  },

  // ── overseer actions ────────────────────────────────────────────────
  pickup: {
    gain: 0.55, wet: 0.06, dur: 0.2, vary: 0.04, max: 2,
    build(o, P, t) {
      tone(o, { type: 'triangle', f: 380 * P, f2: 1500 * P, glide: 0.11, t, a: 0.006, d: 0.1, peak: 0.3 });
      burst(o, { t, a: 0.002, d: 0.03, peak: 0.06, type: 'highpass', f: 4000 });
    }
  },
  drop: {
    gain: 0.5, wet: 0.08, dur: 0.5, vary: 0.04, max: 2,
    build(o, P, t) {
      tone(o, { f: 1900 * P, f2: 520 * P, t, a: 0.02, d: 0.4, peak: 0.24, vib: [7, 18] });
    }
  },
  whisperSend: {
    gain: 0.5, wet: 0.4, dur: 0.9, vary: 0.02, max: 2,
    build(o, P, t) {
      burst(o, { kind: 'pink', t, a: 0.18, d: 0.45, peak: 0.22, type: 'bandpass', f: 1600 * P, f2: 5200 * P, q: 2 });
      [KEY.F6, KEY.A6, KEY.C7].forEach((m, i) =>
        tone(o, { f: N(m) * P, t: t + 0.08 + i * 0.07, a: 0.04, d: 0.4, peak: 0.05, vib: [9, 25] }));
    }
  },
  paChime: {
    gain: 0.5, wet: 0.3, dur: 2.2, vary: 0, max: 1,
    build(o, P, t) {
      // the loudspeaker "ding-dong-ding", softened like an old tannoy (a little band-limited)
      const bus = filt(o.ctx, 'bandpass', 1400, 0.35);
      bus.connect(o.dest);
      [KEY.F5, KEY.A5, KEY.C6].forEach((m, i) => {
        bell(o, N(m) * P, t + i * 0.36, 0.34, CHIME.map(([r, a, d]) => [r, a, d * (i === 2 ? 1.4 : 1)] as const), bus);
      });
    }
  },
  cooldownReady: {
    gain: 0.45, wet: 0.2, dur: 0.5, vary: 0.01, max: 2,
    build(o, P, t) {
      // "charged": a quick rising shimmer that lands on a bright two-partial ping
      tone(o, { type: 'triangle', f: N(KEY.C6) * P, f2: N(KEY.A6) * P, glide: 0.09, t, a: 0.02, d: 0.08, peak: 0.07 });
      burst(o, { kind: 'white', t, a: 0.06, d: 0.05, peak: 0.04, type: 'bandpass', f: 4000, f2: 9000, q: 2 });
      tone(o, { f: N(KEY.A6) * P, t: t + 0.1, a: 0.002, d: 0.3, peak: 0.13, vib: [11, 12] });
      tone(o, { f: N(KEY.E6 + 12) * P, t: t + 0.1, a: 0.002, d: 0.14, peak: 0.05 });
    }
  },

  // ── world ───────────────────────────────────────────────────────────
  pop: {
    gain: 0.55, wet: 0.06, dur: 0.12, vary: 0.08, max: 4,
    build(o, P, t) {
      tone(o, { f: 950 * P, f2: 260 * P, glide: 0.05, t, a: 0.002, d: 0.06, peak: 0.4 });
      burst(o, { t, a: 0.001, d: 0.012, peak: 0.12, type: 'bandpass', f: 2500, q: 0.7 });
    }
  },
  poof: {
    gain: 0.6, wet: 0.15, dur: 0.6, vary: 0.06, max: 3,
    build(o, P, t) {
      burst(o, { kind: 'pink', t, a: 0.015, d: 0.45, peak: 0.45, type: 'lowpass', f: 3500 * P, f2: 350 * P, q: 0.6 });
      tone(o, { f: 140 * P, f2: 70 * P, t, a: 0.006, d: 0.16, peak: 0.25 });
    }
  },
  ding: {
    gain: 0.5, wet: 0.2, dur: 1.7, vary: 0.005, max: 2,
    build(o, P, t) {
      bell(o, N(KEY.A5) * P, t, 0.3, BELL);
    }
  },
  doorOpen: {
    gain: 0.5, wet: 0.1, dur: 0.5, vary: 0.05, max: 2,
    build(o, P, t) {
      burst(o, { t, a: 0.001, d: 0.02, peak: 0.25, type: 'bandpass', f: 2200 * P, q: 2 }); // latch
      tone(o, { type: 'triangle', f: 620 * P, f2: 760 * P, t: t + 0.05, a: 0.04, d: 0.18, peak: 0.05, vib: [16, 35], ft: 'bandpass', ff: 900, fq: 2 }); // hinge
      burst(o, { kind: 'pink', t: t + 0.04, a: 0.1, d: 0.25, peak: 0.16, type: 'lowpass', f: 600, f2: 300 }); // air
    }
  },
  doorClose: {
    gain: 0.55, wet: 0.12, dur: 0.35, vary: 0.05, max: 2,
    build(o, P, t) {
      // a wooden "clunk": hollow mid knock (door panel) rather than a body thud, then the latch clack
      tone(o, { type: 'triangle', f: 210 * P, f2: 160 * P, glide: 0.05, t, a: 0.002, d: 0.09, peak: 0.35 });
      burst(o, { kind: 'pink', t, a: 0.002, d: 0.07, peak: 0.35, type: 'bandpass', f: 420 * P, q: 2.5 });
      tone(o, { f: 80 * P, t, a: 0.003, d: 0.07, peak: 0.18 });
      burst(o, { t: t + 0.045, a: 0.001, d: 0.025, peak: 0.22, type: 'bandpass', f: 3000 * P, q: 3 });
      burst(o, { t: t + 0.075, a: 0.001, d: 0.015, peak: 0.1, type: 'bandpass', f: 2200 * P, q: 3 });
    }
  },
  step: {
    gain: 0.35, wet: 0.02, dur: 0.1, vary: 0.12, max: 4,
    build(o, P, t) {
      // a soft scuff in the mid band (phone speakers drop the low end)
      burst(o, { kind: 'pink', t, a: 0.004, d: 0.05, peak: 0.2, type: 'bandpass', f: rr(500, 900) * P, q: 0.9 });
      burst(o, { kind: 'white', t: t + 0.004, a: 0.002, d: 0.02, peak: 0.03, type: 'highpass', f: 3000 });
      tone(o, { f: 85 * P, t, a: 0.003, d: 0.04, peak: 0.06 });
    }
  },
  thud: {
    gain: 0.7, wet: 0.06, dur: 0.35, vary: 0.06, max: 3,
    build(o, P, t) {
      tone(o, { f: 120 * P, f2: 48 * P, glide: 0.14, t, a: 0.003, d: 0.2, peak: 0.6 });
      burst(o, { kind: 'brown', t, a: 0.002, d: 0.16, peak: 0.55, type: 'lowpass', f: 450, q: 0.7 });
      burst(o, { kind: 'pink', t, a: 0.002, d: 0.05, peak: 0.12, type: 'bandpass', f: 1200 });
      burst(o, { kind: 'pink', t, a: 0.003, d: 0.12, peak: 0.3, type: 'bandpass', f: 380 * P, q: 1.2 }); // audible body on small speakers
    }
  },
  boing: {
    gain: 0.55, wet: 0.08, dur: 0.75, vary: 0.05, max: 2,
    build(o, P, t) {
      const end = t + 0.65;
      const n = osc(o, softWave(o.ctx, 'triangle'), 170 * P, t, end + 0.02);
      n.frequency.setValueAtTime(150 * P, t);
      n.frequency.exponentialRampToValueAtTime(260 * P, t + 0.08);
      n.frequency.exponentialRampToValueAtTime(210 * P, end);
      // the spring wobble: a fast vibrato whose depth dies away
      const l = osc(o, 'sine', 13, t, end + 0.02);
      const lg = gain(o.ctx, 0);
      lg.gain.setValueAtTime(900, t);
      lg.gain.exponentialRampToValueAtTime(20, end);
      l.connect(lg).connect(n.detune);
      const g = gain(o.ctx);
      env(g.gain, t, 0.005, 0.42, 0.6);
      const lp = filt(o.ctx, 'lowpass', 1800, 1.5);
      n.connect(lp).connect(g).connect(o.dest);
    }
  },
  fall: {
    gain: 0.55, wet: 0.08, dur: 1.1, vary: 0.04, max: 2,
    build(o, P, t) {
      // slide whistle down, then a soft landing
      tone(o, { f: 1400 * P, f2: 280 * P, glide: 0.7, t, a: 0.03, d: 0.66, peak: 0.18, vib: [6, 20] });
      tone(o, { f: 110, f2: 45, t: t + 0.72, a: 0.003, d: 0.2, peak: 0.55 });
      burst(o, { kind: 'brown', t: t + 0.72, a: 0.002, d: 0.16, peak: 0.5, type: 'lowpass', f: 500 });
    }
  },
  splash: {
    gain: 0.6, wet: 0.15, dur: 0.8, vary: 0.06, max: 2,
    build(o, P, t) {
      burst(o, { kind: 'white', t, a: 0.006, d: 0.5, peak: 0.42, type: 'bandpass', f: 2200 * P, f2: 700 * P, q: 0.6 });
      burst(o, { kind: 'brown', t, a: 0.004, d: 0.18, peak: 0.35, type: 'lowpass', f: 400 });
      for (let i = 0; i < 6; i++) droplet(o, t + rr(0.05, 0.5), rr(900, 2200) * P, rr(0.05, 0.1));
    }
  },
  gong: {
    gain: 0.5, wet: 0.35, dur: 5.2, vary: 0.01, max: 1,
    build(o, P, t) {
      const f = 98 * P;
      // mallet thump, then the inharmonic body; upper partials "bloom" in a moment later
      burst(o, { kind: 'brown', t, a: 0.003, d: 0.15, peak: 0.4, type: 'lowpass', f: 300 });
      for (const [r, amp, d] of GONG) {
        const late = r > 2.5 ? 0.12 : 0.004;
        tone(o, { f: f * r * rr(0.997, 1.003), t, a: late, d, peak: 0.2 * amp, vib: r > 1.5 ? [rr(0.8, 2), 6] : undefined });
      }
    }
  },
  thunder: {
    gain: 0.75, wet: 0.25, dur: 3.6, vary: 0.05, max: 1,
    build(o, P, t) {
      // crack
      burst(o, { kind: 'white', t, a: 0.002, d: 0.18, peak: 0.45, type: 'bandpass', f: 2400 * P, f2: 900, q: 0.5 });
      for (let i = 0; i < 4; i++) burst(o, { t: t + rr(0.01, 0.12), a: 0.001, d: 0.03, peak: 0.2, type: 'highpass', f: 2500 });
      // rolling rumble with uneven swells
      const end = t + 3.4;
      const n = noise(o, 'brown', t, end);
      const lp = filt(o.ctx, 'lowpass', 260 * P, 0.8);
      const g = gain(o.ctx);
      const pts: [number, number][] = [[0.08, 0.7]];
      let x = 0.08;
      while (x < 2.9) { x += rr(0.18, 0.4); pts.push([x, rr(0.25, 0.75) * (1 - x / 3.6)]); }
      pts.push([3.35, 0]);
      shape(g.gain, t, pts);
      n.connect(lp).connect(g).connect(o.dest);
      tone(o, { f: 55, f2: 38, t, a: 0.02, d: 1.6, peak: 0.25 });
    }
  },
  zap: {
    gain: 0.5, wet: 0.08, dur: 0.5, vary: 0.05, max: 2,
    build(o, P, t) {
      const end = t + 0.36;
      const n = osc(o, softWave(o.ctx, 'sawtooth'), 120 * P, t, end + 0.02);
      for (let x = 0; x < 0.36; x += 0.018) n.frequency.setValueAtTime(rr(70, 260) * P, t + x);
      const sq = osc(o, 'square', 61 * P, t, end + 0.02);
      const bp = filt(o.ctx, 'bandpass', 1800, 0.9);
      const g = gain(o.ctx);
      shape(g.gain, t, [[0.01, 0.18], [0.12, 0.12], [0.3, 0.2], [0.36, 0]]);
      const sqg = gain(o.ctx, 0.35);
      sq.connect(sqg).connect(bp);
      n.connect(bp).connect(g).connect(o.dest);
      burst(o, { t: t + 0.33, a: 0.001, d: 0.06, peak: 0.4, type: 'highpass', f: 1800 }); // snap
      burst(o, { t, a: 0.01, d: 0.3, peak: 0.07, type: 'highpass', f: 6000 });
    }
  },
  explosion: {
    gain: 0.8, wet: 0.25, dur: 2.2, vary: 0.05, max: 1,
    build(o, P, t) {
      tone(o, { f: 110 * P, f2: 32 * P, glide: 0.5, t, a: 0.004, d: 0.6, peak: 0.75 });
      burst(o, { kind: 'pink', t, a: 0.006, d: 0.95, peak: 0.6, type: 'lowpass', f: 3200 * P, f2: 180, q: 0.5 });
      burst(o, { kind: 'brown', t, a: 0.01, d: 1.3, peak: 0.6, type: 'lowpass', f: 260, q: 0.7 });
      // debris: little ticks and clunks pattering down
      for (let i = 0; i < 14; i++) {
        const tt = t + rr(0.25, 1.8);
        burst(o, { kind: 'white', t: tt, a: 0.001, d: rr(0.015, 0.05), peak: rr(0.04, 0.12) * (1 - (tt - t) / 2.2), type: 'bandpass', f: rr(800, 3500), q: 2 });
      }
    }
  },
  sizzle: {
    gain: 0.45, wet: 0.08, dur: 1.4, vary: 0.05, max: 2,
    build(o, P, t) {
      const end = t + 1.25;
      const n = noise(o, 'white', t, end);
      const hp = filt(o.ctx, 'highpass', 3200 * P, 0.7);
      const g = gain(o.ctx);
      g.gain.setValueAtTime(0, t);
      // crackly: random flickers, overall decaying
      for (let x = 0.01; x < 1.18; x += 0.012) g.gain.linearRampToValueAtTime(rr(0.05, 0.3) * (1 - x / 1.25), t + x);
      g.gain.linearRampToValueAtTime(0, end);
      n.connect(hp).connect(g).connect(o.dest);
    }
  },
  glass: {
    gain: 0.5, wet: 0.2, dur: 0.9, vary: 0.04, max: 2,
    build(o, P, t) {
      burst(o, { kind: 'white', t, a: 0.002, d: 0.22, peak: 0.3, type: 'highpass', f: 3500 });
      for (let i = 0; i < 9; i++) {
        const tt = t + (i < 3 ? rr(0, 0.03) : rr(0.03, 0.35));
        tone(o, { f: rr(2400, 6200) * P, t: tt, a: 0.001, d: rr(0.08, 0.35), peak: rr(0.05, 0.12) });
      }
    }
  },
  paper: {
    gain: 0.5, wet: 0.05, dur: 0.5, vary: 0.08, max: 3,
    build(o, P, t) {
      for (let i = 0; i < 7; i++) {
        burst(o, { kind: 'white', t: t + i * rr(0.04, 0.065), a: 0.006, d: rr(0.03, 0.07), peak: rr(0.1, 0.22), type: 'bandpass', f: rr(2500, 5000) * P, q: 1.3 });
      }
    }
  },
  powerDown: {
    gain: 0.55, wet: 0.12, dur: 1.4, vary: 0.02, max: 1,
    build(o, P, t) {
      burst(o, { t, a: 0.001, d: 0.02, peak: 0.25, type: 'bandpass', f: 1500 }); // switch click
      tone(o, { type: softWave(o.ctx, 'sawtooth'), f: 440 * P, f2: 45 * P, glide: 1.1, t, a: 0.01, d: 1.15, peak: 0.32, ft: 'lowpass', ff: 3500, ff2: 160, fq: 2 });
      tone(o, { f: 220 * P, f2: 30 * P, glide: 1.0, t, a: 0.01, d: 1.0, peak: 0.12 });
    }
  },
  powerUp: {
    gain: 0.55, wet: 0.12, dur: 1.2, vary: 0.02, max: 1,
    build(o, P, t) {
      tone(o, { type: softWave(o.ctx, 'sawtooth'), f: 55 * P, f2: 440 * P, glide: 0.8, t, a: 0.15, d: 0.7, peak: 0.26, ft: 'lowpass', ff: 200, ff2: 4000, fq: 2 });
      mallet(o, N(KEY.F6) * P, t + 0.82, 0.14, 0.3); // "ready" ping
    }
  },
  freeze: {
    gain: 0.5, wet: 0.35, dur: 1.9, vary: 0.01, max: 1,
    build(o, P, t) {
      // glassy shimmer that slows and locks: pings with growing gaps, then a crystal chord fading
      const pent = [KEY.F6, KEY.A6, KEY.C7, KEY.D7, KEY.F7];
      let x = 0, gap = 0.03;
      for (let i = 0; i < 10; i++) {
        tone(o, { f: N(pent[i % 5]) * P, t: t + x, a: 0.002, d: 0.18, peak: 0.08 });
        x += gap;
        gap *= 1.28;
      }
      [KEY.F6, KEY.C7, KEY.E6].forEach((m) => tone(o, { f: N(m) * P, t: t + x, a: 0.01, d: 0.8, peak: 0.07, ft: 'lowpass', ff: 9000, ff2: 1200 }));
      burst(o, { kind: 'white', t, a: 0.05, d: x + 0.2, peak: 0.05, type: 'highpass', f: 6500 });
    }
  },
  unfreeze: {
    gain: 0.5, wet: 0.3, dur: 1.1, vary: 0.01, max: 1,
    build(o, P, t) {
      const pent = [KEY.F6, KEY.A6, KEY.C7, KEY.D7, KEY.F7];
      let x = 0, gap = 0.16;
      for (let i = 0; i < 10; i++) {
        tone(o, { f: N(pent[i % 5]) * P * (1 + i * 0.01), t: t + x, a: 0.002, d: 0.14, peak: 0.07 });
        x += gap;
        gap = Math.max(0.025, gap / 1.32);
      }
      burst(o, { kind: 'pink', t: t + x - 0.15, a: 0.1, d: 0.3, peak: 0.14, type: 'bandpass', f: 1200, f2: 5000, q: 1.2 });
    }
  },
  shrink: {
    gain: 0.5, wet: 0.12, dur: 0.75, vary: 0.03, max: 2,
    build(o, P, t) {
      tone(o, { type: softWave(o.ctx, 'square'), f: 900 * P, f2: 180 * P, glide: 0.6, t, a: 0.01, d: 0.6, peak: 0.16, vib: [14, 60], ft: 'lowpass', ff: 3000, ff2: 900 });
      tone(o, { f: N(KEY.C7) * P, t: t + 0.55, a: 0.002, d: 0.12, peak: 0.06 });
    }
  },
  grow: {
    gain: 0.55, wet: 0.12, dur: 0.9, vary: 0.03, max: 2,
    build(o, P, t) {
      tone(o, { type: softWave(o.ctx, 'sawtooth'), f: 110 * P, f2: 520 * P, glide: 0.7, t, a: 0.03, d: 0.72, peak: 0.2, ft: 'lowpass', ff: 600, ff2: 3000, fq: 3 });
      tone(o, { type: softWave(o.ctx, 'sawtooth'), f: 111.5 * P, f2: 527 * P, glide: 0.7, t, a: 0.03, d: 0.72, peak: 0.14, ft: 'lowpass', ff: 600, ff2: 3000, fq: 3 });
      tone(o, { f: 55 * P, f2: 130 * P, glide: 0.7, t, a: 0.05, d: 0.7, peak: 0.2 });
    }
  },
  swap: {
    gain: 0.5, wet: 0.15, dur: 0.75, vary: 0.02, max: 1,
    build(o, P, t) {
      tone(o, { type: 'triangle', f: 350 * P, f2: 1050 * P, glide: 0.55, t, a: 0.02, d: 0.6, peak: 0.2, pan: -0.6 });
      tone(o, { type: 'triangle', f: 1050 * P, f2: 350 * P, glide: 0.55, t, a: 0.02, d: 0.6, peak: 0.2, pan: 0.6 });
      tone(o, { f: N(KEY.F6) * P, t: t + 0.27, a: 0.003, d: 0.2, peak: 0.07 });
    }
  },
  heart: {
    gain: 0.5, wet: 0.3, dur: 1.2, vary: 0.01, max: 2,
    build(o, P, t) {
      // warm two-note chime: A5 then F6, sine plus a soft octave
      for (const [m, dt] of [[KEY.A5, 0], [KEY.F6, 0.16]] as const) {
        tone(o, { f: N(m) * P, t: t + dt, a: 0.01, d: 0.85, peak: 0.22 });
        tone(o, { f: N(m - 12) * P, t: t + dt, a: 0.02, d: 0.5, peak: 0.1 });
        tone(o, { f: N(m) * 2 * P, t: t + dt, a: 0.004, d: 0.2, peak: 0.04 });
      }
    }
  },
  coin: {
    gain: 0.45, wet: 0.08, dur: 0.5, vary: 0.01, max: 3,
    build(o, P, t) {
      tone(o, { type: softWave(o.ctx, 'square'), f: N(KEY.C6) * P, t, a: 0.002, d: 0.05, peak: 0.16, ft: 'lowpass', ff: 5000 });
      tone(o, { type: softWave(o.ctx, 'square'), f: N(KEY.F6) * P, t: t + 0.07, a: 0.002, d: 0.32, hold: 0.04, peak: 0.16, ft: 'lowpass', ff: 5000 });
    }
  },
  cash: {
    gain: 0.5, wet: 0.15, dur: 1.4, vary: 0.02, max: 1,
    build(o, P, t) {
      // note flutter, drawer clunk, till bell
      for (let i = 0; i < 8; i++) {
        burst(o, { kind: 'white', t: t + i * 0.035, a: 0.004, d: 0.025, peak: 0.12, type: 'bandpass', f: rr(3000, 4500), q: 1.5 });
      }
      burst(o, { kind: 'brown', t: t + 0.3, a: 0.003, d: 0.08, peak: 0.35, type: 'lowpass', f: 600 });
      burst(o, { t: t + 0.3, a: 0.001, d: 0.02, peak: 0.2, type: 'bandpass', f: 2200, q: 2 });
      bell(o, 2093 * P, t + 0.34, 0.2, BELL.map(([r, a, d]) => [r, a, d * 0.7] as const));
      bell(o, 2093 * P * 1.005, t + 0.43, 0.1, BELL.map(([r, a, d]) => [r, a, d * 0.5] as const));
    }
  },
  party: {
    gain: 0.5, wet: 0.12, dur: 0.9, vary: 0.03, max: 2,
    build(o, P, t) {
      // party horn: buzzy reed, quick bend up
      const n = osc(o, softWave(o.ctx, 'sawtooth'), 480 * P, t, t + 0.48);
      n.frequency.setValueAtTime(440 * P, t);
      n.frequency.exponentialRampToValueAtTime(560 * P, t + 0.07);
      n.frequency.setValueAtTime(560 * P, t + 0.3);
      n.frequency.exponentialRampToValueAtTime(500 * P, t + 0.45);
      const buzz = osc(o, 'sine', 31, t, t + 0.48);
      const bg = gain(o.ctx, 40);
      buzz.connect(bg).connect(n.detune);
      const lp = filt(o.ctx, 'lowpass', 2400, 2);
      const g = gain(o.ctx);
      env(g.gain, t, 0.02, 0.2, 0.08, 0.32);
      n.connect(lp).connect(g).connect(o.dest);
      // popper crack and confetti crackle
      burst(o, { t: t + 0.08, a: 0.001, d: 0.05, peak: 0.3, type: 'bandpass', f: 1800, q: 0.6 });
      for (let i = 0; i < 10; i++) burst(o, { t: t + 0.12 + rr(0, 0.6), a: 0.001, d: 0.012, peak: rr(0.04, 0.1), type: 'highpass', f: rr(3000, 6000) });
    }
  },
  sparkle: {
    gain: 0.45, wet: 0.3, dur: 0.8, vary: 0.02, max: 2,
    build(o, P, t) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const deg = PENTA_F[(i + Math.floor(Math.random() * 2)) % 5];
        const m = KEY.F6 + deg + (i > 3 ? 12 : 0);
        tone(o, { f: N(m) * P, t: t + i * rr(0.035, 0.05), a: 0.002, d: 0.22, peak: 0.08 });
      }
    }
  },
  ghostWail: {
    gain: 0.5, wet: 0.5, dur: 2.4, vary: 0.05, max: 1,
    build(o, P, t) {
      const end = t + 1.9;
      const n = osc(o, softWave(o.ctx, 'triangle'), 300 * P, t, end + 0.02);
      n.frequency.setValueAtTime(280 * P, t);
      n.frequency.linearRampToValueAtTime(520 * P, t + 0.7);
      n.frequency.linearRampToValueAtTime(470 * P, t + 1.1);
      n.frequency.linearRampToValueAtTime(240 * P, end);
      const l = osc(o, 'sine', 5.2, t, end + 0.02);
      const lg = gain(o.ctx, 35);
      l.connect(lg).connect(n.detune);
      // "oo" mouth
      const f1 = filt(o.ctx, 'bandpass', 380, 3), f2 = filt(o.ctx, 'bandpass', 820, 4);
      const g = gain(o.ctx);
      shape(g.gain, t, [[0.4, 0.35], [1.2, 0.4], [1.9, 0]]);
      n.connect(f1).connect(g);
      n.connect(f2).connect(g);
      g.connect(o.dest);
      burst(o, { kind: 'pink', t, a: 0.5, d: 1.2, peak: 0.08, type: 'bandpass', f: 900, f2: 500, q: 2 });
    }
  },
  ufoBeam: {
    gain: 0.5, wet: 0.25, dur: 1.8, vary: 0.03, max: 1,
    build(o, P, t) {
      const end = t + 1.45;
      const n = osc(o, 'sine', 1200 * P, t, end + 0.02);
      n.frequency.setValueAtTime(1300 * P, t);
      n.frequency.exponentialRampToValueAtTime(500 * P, end);
      const am = osc(o, 'sine', 28, t, end + 0.02);
      const amg = gain(o.ctx, 0.5);
      const body = gain(o.ctx, 0.5);
      am.connect(amg).connect(body.gain);
      const g = gain(o.ctx);
      shape(g.gain, t, [[0.08, 0.2], [1.2, 0.18], [1.45, 0]]);
      n.connect(body).connect(g).connect(o.dest);
      tone(o, { type: softWave(o.ctx, 'sawtooth'), f: 110 * P, t, a: 0.1, d: 1.2, peak: 0.12, ft: 'lowpass', ff: 300, ff2: 2400, fq: 6 });
    }
  },
  puppyBark: {
    gain: 0.55, wet: 0.08, dur: 0.45, vary: 0.05, max: 1,
    build(o, P, t) {
      yap(o, t, 620 * P, 0.4);
      yap(o, t + 0.17, 680 * P, 0.38);
    }
  },
  raccoonChitter: {
    gain: 0.5, wet: 0.06, dur: 0.6, vary: 0.05, max: 1,
    build(o, P, t) {
      let x = 0;
      const n = 9 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const f = rr(1500, 2500) * P;
        tone(o, { type: softWave(o.ctx, 'square'), f, f2: f * 0.7, t: t + x, a: 0.003, d: 0.022, peak: 0.13, ft: 'bandpass', ff: 2600, fq: 1.5 });
        x += rr(0.03, 0.055);
      }
    }
  },
  pigeons: {
    gain: 0.55, wet: 0.12, dur: 1.5, vary: 0.04, max: 1,
    build(o, P, t) {
      coo(o, t, 360 * P, 0.4);
      coo(o, t + 0.5, 330 * P, 0.3);
      for (let i = 0; i < 6; i++) flap(o, t + 0.95 + i * 0.075, 0.25 * (1 - i / 8));
    }
  },
  squeak: {
    gain: 0.45, wet: 0.05, dur: 0.22, vary: 0.08, max: 3,
    build(o, P, t) {
      const n = osc(o, softWave(o.ctx, 'triangle'), 1500 * P, t, t + 0.2);
      n.frequency.setValueAtTime(1450 * P, t);
      n.frequency.linearRampToValueAtTime(2200 * P, t + 0.07);
      n.frequency.linearRampToValueAtTime(1750 * P, t + 0.16);
      const g = gain(o.ctx);
      env(g.gain, t, 0.01, 0.2, 0.15);
      n.connect(g).connect(o.dest);
    }
  },
  slurp: {
    gain: 0.5, wet: 0.06, dur: 0.6, vary: 0.05, max: 1,
    build(o, P, t) {
      const end = t + 0.5;
      const n = noise(o, 'pink', t, end);
      const bp = filt(o.ctx, 'bandpass', 500 * P, 4);
      bp.frequency.setValueAtTime(500 * P, t);
      bp.frequency.exponentialRampToValueAtTime(2400 * P, end);
      const g = gain(o.ctx);
      g.gain.setValueAtTime(0, t);
      for (let x = 0.02; x < 0.46; x += 0.03) g.gain.linearRampToValueAtTime(rr(0.15, 0.5), t + x);
      g.gain.linearRampToValueAtTime(0, end);
      n.connect(bp).connect(g).connect(o.dest);
      for (let i = 0; i < 4; i++) droplet(o, t + 0.08 + i * 0.09, (300 + i * 140) * P, 0.08);
    }
  },
  gasp: {
    gain: 0.5, wet: 0.06, dur: 0.4, vary: 0.05, max: 2,
    build(o, P, t) {
      // breathy intake: noise through an "ah" formant pair, swelling then cut short
      const end = t + 0.3;
      const n = noise(o, 'pink', t, end);
      const f1 = filt(o.ctx, 'bandpass', 900 * P, 3);
      const f2 = filt(o.ctx, 'bandpass', 1600 * P, 4);
      f2.frequency.setValueAtTime(1500 * P, t);
      f2.frequency.linearRampToValueAtTime(2100 * P, end);
      const g = gain(o.ctx);
      shape(g.gain, t, [[0.18, 0.55], [0.22, 0.5], [0.3, 0]]);
      n.connect(f1).connect(g);
      n.connect(f2).connect(g);
      g.connect(o.dest);
    }
  },

  // ── day flow ─────────────────────────────────────────────────────────
  dayStart: {
    gain: 0.5, wet: 0.25, dur: 2.0, vary: 0, max: 1,
    build(o, P, t) {
      const arp = [KEY.C5, KEY.F5, KEY.A5, KEY.C6];
      arp.forEach((m, i) => mallet(o, N(m) * P, t + i * 0.09, 0.2, 0.3));
      const tc = t + 0.4;
      // the chord: soft brass (filtered saws) under a mallet F6
      for (const m of [KEY.F4, KEY.A4, KEY.C5, KEY.F5]) {
        tone(o, { type: softWave(o.ctx, 'sawtooth'), f: N(m) * P, detune: rr(-6, 6), t: tc, a: 0.03, d: 1.1, hold: 0.15, peak: 0.07, ft: 'lowpass', ff: 2600, ff2: 900 });
      }
      mallet(o, N(KEY.F6) * P, tc, 0.22, 0.9);
      for (let i = 0; i < 4; i++) tone(o, { f: N(KEY.A6 + PENTA_F[i]) * P, t: tc + 0.1 + i * 0.05, a: 0.002, d: 0.2, peak: 0.04 });
    }
  },
  dayEnd: {
    gain: 0.5, wet: 0.3, dur: 2.8, vary: 0, max: 1,
    build(o, P, t) {
      // winding down: C6 A5 G5 F5, each a little slower, ending on a long F over a low F
      const notes = [KEY.C6, KEY.A5, KEY.G5, KEY.F5];
      let x = 0, gap = 0.2;
      notes.forEach((m, i) => {
        mallet(o, N(m) * P, t + x, 0.2, i === 3 ? 1.5 : 0.5);
        x += gap;
        gap *= 1.35;
      });
      const tl = t + x - gap / 1.35;
      tone(o, { type: softWave(o.ctx, 'triangle'), f: N(KEY.F4 - 12) * P, t: tl, a: 0.05, d: 1.6, peak: 0.16 });
      tone(o, { f: N(KEY.C5) * P, t: tl, a: 0.08, d: 1.4, peak: 0.06 });
    }
  }
};

/** Clamp a caller's pitch option to something sane. */
export const safePitch = (p: number | undefined): number => clamp(p ?? 1, 0.25, 4);
