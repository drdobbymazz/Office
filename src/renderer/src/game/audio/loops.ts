// Sounds that run until switched off. Each loop is a small graph of
// continuous sources (noise, oscillators, LFOs) plus, for some, discrete
// events (crackles, clunks, bells) scheduled ahead by tick().

import type { LoopId } from './api';
import { type NoiseKind, type Out, burst, filt, gain, noiseBuffers, rr, softWave, tone } from './synth';

/** Out for a loop: continuous sources go into `srcs` and are stopped when the loop ends. */
export interface LoopOut extends Out {
  srcs: AudioScheduledSourceNode[];
}

export interface LoopVoice {
  /** Schedule discrete events up to this audio time. */
  tick(until: number): void;
}

export interface LoopDef {
  gain: number;
  wet: number;
  start(o: LoopOut, t: number): LoopVoice;
}

const NOTICK: LoopVoice = { tick() {} };

function lo(o: LoopOut, type: OscillatorType | PeriodicWave, f: number, t: number): OscillatorNode {
  const n = o.ctx.createOscillator();
  if (typeof type === 'string') n.type = type as OscillatorType;
  else n.setPeriodicWave(type);
  n.frequency.value = f;
  n.start(t);
  o.srcs.push(n);
  return n;
}

function ln(o: LoopOut, kind: NoiseKind, t: number, rate = 1): AudioBufferSourceNode {
  const n = o.ctx.createBufferSource();
  n.buffer = noiseBuffers(o.ctx)[kind];
  n.loop = true;
  n.playbackRate.value = rate;
  n.start(t, Math.random() * 1.8);
  o.srcs.push(n);
  return n;
}

/** Sine LFO added onto a parameter. */
function lfo(o: LoopOut, rate: number, depth: number, target: AudioParam, t: number, type: OscillatorType = 'sine'): void {
  const l = lo(o, type, rate, t);
  const g = gain(o.ctx, depth);
  l.connect(g).connect(target);
}

/** Poisson-ish event clock for tick(). */
function clock(t: number, meanGap: number, fire: (at: number) => void, jitter = 1): (until: number) => void {
  let next = t + meanGap * Math.random();
  return (until) => {
    while (next < until) {
      fire(next);
      next += meanGap * (1 - jitter / 2 + Math.random() * jitter);
    }
  };
}

export const LOOPS: Record<LoopId, LoopDef> = {
  fire: {
    gain: 0.7, wet: 0.08,
    start(o, t) {
      const roar = ln(o, 'brown', t);
      const lp = filt(o.ctx, 'lowpass', 520, 0.6);
      const rg = gain(o.ctx, 0.4);
      lfo(o, 0.31, 0.12, rg.gain, t);
      roar.connect(lp).connect(rg).connect(o.dest);
      const flut = ln(o, 'pink', t);
      const bp = filt(o.ctx, 'bandpass', 1100, 0.8);
      const fg = gain(o.ctx, 0.07);
      lfo(o, 3.1, 0.035, fg.gain, t);
      lfo(o, 4.7, 0.03, fg.gain, t);
      flut.connect(bp).connect(fg).connect(o.dest);
      const crackle = clock(t, 0.065, (at) => {
        burst(o, { t: at, a: 0.001, d: rr(0.004, 0.02), peak: rr(0.04, 0.22), type: 'bandpass', f: rr(1500, 5000), q: 1.4, pan: rr(-0.4, 0.4) });
        if (Math.random() < 0.06) tone(o, { f: rr(260, 380), f2: 90, t: at, a: 0.002, d: 0.05, peak: 0.12 });
      });
      return { tick: crackle };
    }
  },
  alarm: {
    gain: 0.9, wet: 0.1,
    start(o, t) {
      // a fire bell: inharmonic partials amplitude-modulated by a rounded "striker" pulse
      const f = 940;
      const mix = gain(o.ctx, 0);
      for (const [r, a] of [[1, 0.5], [2.76, 0.22], [5.4, 0.08]] as const) {
        const n = lo(o, 'sine', f * r, t);
        const g = gain(o.ctx, a);
        n.connect(g).connect(mix);
      }
      const striker = lo(o, softWave(o.ctx, 'organ'), 17, t);
      const sg = gain(o.ctx, 0.3);
      striker.connect(sg).connect(mix.gain);
      const pattern = gain(o.ctx, 0);
      const lp = filt(o.ctx, 'lowpass', 3200, 0.7);
      mix.connect(lp).connect(pattern).connect(o.dest);
      // ring 1.6 s, rest 0.5 s
      let next = t;
      return {
        tick(until) {
          while (next < until) {
            const p = pattern.gain;
            p.setValueAtTime(0, next);
            p.linearRampToValueAtTime(0.8, next + 0.03);
            p.setValueAtTime(0.8, next + 1.6);
            p.linearRampToValueAtTime(0, next + 1.65);
            next += 2.1;
          }
        }
      };
    }
  },
  sprinkler: {
    gain: 0.55, wet: 0.12,
    start(o, t) {
      const n = ln(o, 'white', t);
      const hp = filt(o.ctx, 'highpass', 2500, 0.7);
      const bp = filt(o.ctx, 'bandpass', 6000, 0.5);
      const g = gain(o.ctx, 0.12);
      lfo(o, 0.4, 0.03, g.gain, t);
      n.connect(hp).connect(bp).connect(g).connect(o.dest);
      // impact sprinkler: steady "tch tch", then a fast ratchet back
      let next = t + 0.05, k = 0;
      return {
        tick(until) {
          while (next < until) {
            const fast = k % 28 >= 20;
            burst(o, { t: next, a: 0.002, d: fast ? 0.02 : 0.045, peak: fast ? 0.1 : 0.16, type: 'highpass', f: 3200, pan: fast ? 0.2 : -0.2 + (k % 20) * 0.02 });
            if (Math.random() < 0.08) tone(o, { f: rr(1200, 2400), f2: rr(2500, 3500), glide: 0.03, t: next + 0.03, a: 0.002, d: 0.04, peak: 0.04 });
            next += fast ? 0.06 : 0.14;
            k++;
          }
        }
      };
    }
  },
  waterRush: {
    gain: 0.6, wet: 0.12,
    start(o, t) {
      const n = ln(o, 'pink', t);
      const bp = filt(o.ctx, 'bandpass', 700, 0.8);
      lfo(o, 0.23, 260, bp.frequency, t);
      lfo(o, 0.61, 120, bp.frequency, t);
      const g = gain(o.ctx, 0.42);
      n.connect(bp).connect(g).connect(o.dest);
      const b = ln(o, 'brown', t);
      const lp = filt(o.ctx, 'lowpass', 320, 0.7);
      const bg = gain(o.ctx, 0.3);
      lfo(o, 0.37, 0.08, bg.gain, t);
      b.connect(lp).connect(bg).connect(o.dest);
      const bubbles = clock(t, 0.22, (at) => {
        const f = rr(280, 800);
        tone(o, { f, f2: f * rr(1.6, 2.4), glide: 0.06, t: at, a: 0.003, d: 0.06, peak: rr(0.03, 0.08), pan: rr(-0.5, 0.5) });
      });
      return { tick: bubbles };
    }
  },
  bees: {
    gain: 0.45, wet: 0.08,
    start(o, t) {
      const bp1 = filt(o.ctx, 'bandpass', 520, 1.4);
      const bp2 = filt(o.ctx, 'bandpass', 1500, 3);
      const g = gain(o.ctx, 0.14);
      lfo(o, 0.4, 0.04, g.gain, t);
      bp1.connect(g);
      bp2.connect(g);
      g.connect(o.dest);
      const drift = gain(o.ctx, 1); // shared slow pitch drift (the swarm moving)
      for (const f of [212, 224, 238]) {
        const n = lo(o, softWave(o.ctx, 'sawtooth'), f * rr(0.98, 1.02), t);
        lfo(o, rr(7, 11), rr(30, 60), n.detune, t);
        lfo(o, rr(0.12, 0.2), 80, n.detune, t);
        n.connect(drift);
      }
      drift.connect(bp1);
      drift.connect(bp2);
      return NOTICK;
    }
  },
  ufoHum: {
    gain: 0.45, wet: 0.2,
    start(o, t) {
      const body = gain(o.ctx, 0.1);
      body.connect(o.dest);
      const a = lo(o, 'sine', 110, t), b = lo(o, 'sine', 165.6, t);
      a.connect(body);
      b.connect(body);
      // theremin warble on top
      const th = lo(o, 'sine', 660, t);
      lfo(o, 6, 40, th.detune, t);
      lfo(o, 0.2, 300, th.detune, t);
      const thg = gain(o.ctx, 0.08);
      th.connect(thg).connect(o.dest);
      // slow resonant sweep: the "whooom"
      const s = lo(o, softWave(o.ctx, 'sawtooth'), 55, t);
      const lp = filt(o.ctx, 'lowpass', 700, 7);
      lfo(o, 0.25, 500, lp.frequency, t);
      const sg = gain(o.ctx, 0.12);
      s.connect(lp).connect(sg).connect(o.dest);
      return NOTICK;
    }
  },
  ghostAir: {
    gain: 0.6, wet: 0.45,
    start(o, t) {
      const n = ln(o, 'pink', t);
      const b1 = filt(o.ctx, 'bandpass', 500, 4);
      lfo(o, 0.13, 250, b1.frequency, t);
      const b2 = filt(o.ctx, 'bandpass', 1100, 6);
      lfo(o, 0.07, 400, b2.frequency, t);
      const g = gain(o.ctx, 0.4);
      lfo(o, 0.17, 0.15, g.gain, t);
      n.connect(b1).connect(g);
      n.connect(b2).connect(g);
      g.connect(o.dest);
      const w = lo(o, 'sine', 880, t);
      lfo(o, 4.5, 25, w.detune, t);
      lfo(o, 0.09, 500, w.detune, t);
      const wg = gain(o.ctx, 0.012);
      lfo(o, 0.11, 0.012, wg.gain, t);
      w.connect(wg).connect(o.dest);
      return NOTICK;
    }
  },
  rumble: {
    gain: 0.75, wet: 0.08,
    start(o, t) {
      const n = ln(o, 'brown', t);
      const lp = filt(o.ctx, 'lowpass', 150, 0.8);
      const g = gain(o.ctx, 0.3);
      lfo(o, 1.3, 0.15, g.gain, t);
      lfo(o, 2.1, 0.12, g.gain, t);
      n.connect(lp).connect(g).connect(o.dest);
      // upper body so phone speakers can hear it
      const n2 = ln(o, 'brown', t, 1.3);
      const bp = filt(o.ctx, 'bandpass', 130, 1);
      const g2 = gain(o.ctx, 0.6);
      lfo(o, 3.3, 0.2, g2.gain, t);
      n2.connect(bp).connect(g2).connect(o.dest);
      const s = lo(o, 'sine', 46, t);
      const sg = gain(o.ctx, 0.06);
      s.connect(sg).connect(o.dest);
      const rattle = clock(t, 0.16, (at) => {
        burst(o, { kind: 'white', t: at, a: 0.002, d: rr(0.01, 0.04), peak: rr(0.03, 0.09), type: 'bandpass', f: rr(900, 3000), q: 2.5, pan: rr(-0.6, 0.6) });
      });
      return { tick: rattle };
    }
  },
  printerRage: {
    gain: 0.5, wet: 0.08,
    start(o, t) {
      const m = lo(o, softWave(o.ctx, 'sawtooth'), 95, t);
      lfo(o, 3, 80, m.detune, t);
      const lp = filt(o.ctx, 'lowpass', 900, 1.2);
      const mg = gain(o.ctx, 0.09);
      m.connect(lp).connect(mg).connect(o.dest);
      let next = t + 0.05, k = 0, beepAt = t + 1.2;
      return {
        tick(until) {
          while (next < until) {
            // ka-chunk
            burst(o, { kind: 'brown', t: next, a: 0.002, d: 0.06, peak: 0.4, type: 'lowpass', f: 450 });
            burst(o, { t: next + 0.07, a: 0.001, d: 0.02, peak: 0.16, type: 'bandpass', f: 2100, q: 2 });
            if (k % 2 === 0) burst(o, { kind: 'white', t: next + 0.09, a: 0.02, d: 0.09, peak: 0.08, type: 'bandpass', f: 3500, q: 1.2 }); // paper whip
            if (k % 7 === 3) { // motor surge
              m.frequency.setValueAtTime(95, next);
              m.frequency.linearRampToValueAtTime(150, next + 0.2);
              m.frequency.linearRampToValueAtTime(95, next + 0.5);
            }
            next += rr(0.2, 0.3);
            k++;
          }
          while (beepAt < until) {
            for (let i = 0; i < 3; i++) tone(o, { type: softWave(o.ctx, 'square'), f: 1760, t: beepAt + i * 0.11, a: 0.003, d: 0.05, hold: 0.03, peak: 0.06, ft: 'lowpass', ff: 3500 });
            beepAt += rr(1.6, 2.6);
          }
        }
      };
    }
  },
  staticHum: {
    gain: 0.45, wet: 0.04,
    start(o, t) {
      const h = lo(o, softWave(o.ctx, 'sawtooth'), 100, t);
      const lp = filt(o.ctx, 'lowpass', 450, 0.9);
      const hg = gain(o.ctx, 0.14);
      lfo(o, 0.5, 0.02, hg.gain, t);
      h.connect(lp).connect(hg).connect(o.dest);
      const hiss = ln(o, 'white', t);
      const hp = filt(o.ctx, 'highpass', 4000, 0.7);
      const sg = gain(o.ctx, 0.018);
      hiss.connect(hp).connect(sg).connect(o.dest);
      const crackle = clock(t, 0.05, (at) => {
        burst(o, { t: at, a: 0.001, d: rr(0.002, 0.012), peak: rr(0.02, 0.1), type: 'highpass', f: rr(2500, 6000) });
      });
      return { tick: crackle };
    }
  }
};
