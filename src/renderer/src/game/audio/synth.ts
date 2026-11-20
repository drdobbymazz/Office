// Low-level synthesis helpers shared by sfx, loops, speech and music.
// Everything takes a BaseAudioContext so the same code renders live and in an
// OfflineAudioContext (for the analysis harness).

export type NoiseKind = 'white' | 'pink' | 'brown';

/** Where one voice (one sfx, one loop, one note) writes its sound. */
export interface Out {
  ctx: BaseAudioContext;
  /** Input of this voice's private gain node. */
  dest: AudioNode;
  /** Register every scheduled source so the owner knows when the voice ends. */
  track(src: AudioScheduledSourceNode, stopAt: number): void;
}

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const st = (semis: number): number => Math.pow(2, semis / 12);
export const rr = (a: number, b: number): number => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** Music key: F major. Used by UI sounds so they sit with the score. */
export const KEY = {
  F4: 65, G4: 67, A4: 69, Bb4: 70, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81,
  Bb5: 82, C6: 84, D6: 86, E6: 88, F6: 89, G6: 91, A6: 93, C7: 96, D7: 98, F7: 101
} as const;
export const PENTA_F = [0, 2, 4, 7, 9]; // F G A C D

// ── noise buffers, made once per context ─────────────────────────────────
const noiseCache = new WeakMap<BaseAudioContext, Record<NoiseKind, AudioBuffer>>();

export function noiseBuffers(ctx: BaseAudioContext): Record<NoiseKind, AudioBuffer> {
  let n = noiseCache.get(ctx);
  if (n) return n;
  const len = Math.floor(ctx.sampleRate * 2);
  const mk = (fill: (d: Float32Array) => void) => {
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    fill(b.getChannelData(0));
    return b;
  };
  n = {
    white: mk((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }),
    // Paul Kellet's economy pink filter
    pink: mk((d) => {
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    }),
    brown: mk((d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    })
  };
  // remove DC so long noise loops do not drift
  for (const k of ['white', 'pink', 'brown'] as const) {
    const d = n[k].getChannelData(0);
    let m = 0;
    for (let i = 0; i < d.length; i++) m += d[i];
    m /= d.length;
    for (let i = 0; i < d.length; i++) d[i] -= m;
  }
  noiseCache.set(ctx, n);
  return n;
}

// ── soft periodic waves (gentler than the raw shapes on phone speakers) ──
const waveCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

export function softWave(ctx: BaseAudioContext, kind: 'sine' | 'triangle' | 'square' | 'sawtooth' | 'organ'): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) { m = new Map(); waveCache.set(ctx, m); }
  const hit = m.get(kind);
  if (hit) return hit;
  const N = 24;
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let h = 1; h < N; h++) {
    let a = 0;
    // a little extra harmonic content even for "sine", so formant filters have something to shape
    if (kind === 'sine') a = h === 1 ? 1 : h === 2 ? 0.28 : h === 3 ? 0.12 : h === 4 ? 0.05 : 0;
    else if (kind === 'triangle') a = h === 1 ? 1 : h % 2 ? 0.9 / (h * h) + 0.04 / h : 0.06 / h;
    else if (kind === 'square') a = h % 2 ? 1 / h : 0.08 / h;
    else if (kind === 'sawtooth') a = 1 / h;
    else a = h === 1 ? 1 : h === 2 ? 0.5 : h === 3 ? 0.3 : h === 4 ? 0.12 : 0; // organ
    a *= Math.exp(-h / 14); // gentle top roll-off
    im[h] = a;
  }
  const w = ctx.createPeriodicWave(re, im);
  m.set(kind, w);
  return w;
}

// ── node helpers ──────────────────────────────────────────────────────────
export function gain(ctx: BaseAudioContext, v = 0): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

export function filt(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.707): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

export function link(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[0];
}

export function osc(o: Out, type: OscillatorType | PeriodicWave, f: number, t0: number, t1: number): OscillatorNode {
  const n = o.ctx.createOscillator();
  if (typeof type === 'string') n.type = type as OscillatorType;
  else n.setPeriodicWave(type);
  n.frequency.value = f;
  n.start(t0);
  n.stop(t1);
  o.track(n, t1);
  return n;
}

export function noise(o: Out, kind: NoiseKind, t0: number, t1: number, rate = 1): AudioBufferSourceNode {
  const n = o.ctx.createBufferSource();
  n.buffer = noiseBuffers(o.ctx)[kind];
  n.loop = true;
  n.playbackRate.value = rate;
  n.start(t0, Math.random() * 1.8);
  n.stop(t1);
  o.track(n, t1);
  return n;
}

/**
 * Attack / hold / exponential decay to true silence. Returns the time the
 * envelope reaches zero. Every envelope starts and ends at exactly 0 so
 * nothing clicks.
 */
export function env(p: AudioParam, t: number, a: number, peak: number, d: number, hold = 0): number {
  const a2 = Math.max(0.002, a);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a2);
  if (hold > 0) p.setValueAtTime(peak, t + a2 + hold);
  const tEnd = t + a2 + hold + d;
  p.exponentialRampToValueAtTime(Math.max(1e-5, peak * 2e-4), tEnd);
  p.linearRampToValueAtTime(0, tEnd + 0.006);
  return tEnd + 0.006;
}

/** Piecewise-linear envelope from [time, value] points (times relative to t). Ends at the last point. */
export function shape(p: AudioParam, t: number, pts: ReadonlyArray<readonly [number, number]>): number {
  p.setValueAtTime(0, t);
  for (const [dt, v] of pts) p.linearRampToValueAtTime(v, t + dt);
  const last = pts[pts.length - 1];
  if (last[1] !== 0) { p.linearRampToValueAtTime(0, t + last[0] + 0.01); return t + last[0] + 0.01; }
  return t + last[0];
}

export interface ToneSpec {
  type?: OscillatorType | PeriodicWave;
  f: number;
  /** Glide target frequency. */
  f2?: number;
  /** Glide time (default: whole note). */
  glide?: number;
  /** Linear instead of exponential glide. */
  lin?: boolean;
  t: number;
  a?: number;
  d: number;
  hold?: number;
  peak: number;
  /** Optional filter after the oscillator. */
  ft?: BiquadFilterType;
  ff?: number;
  ff2?: number;
  fq?: number;
  /** Vibrato: rate Hz, depth cents. */
  vib?: [number, number];
  detune?: number;
  dest?: AudioNode;
  pan?: number;
}

/** One enveloped oscillator note. Returns its end time. */
export function tone(o: Out, s: ToneSpec): number {
  const { ctx } = o;
  const a = s.a ?? 0.004;
  const end = s.t + Math.max(0.002, a) + (s.hold ?? 0) + s.d + 0.006;
  const n = osc(o, s.type ?? 'sine', s.f, s.t, end + 0.01);
  if (s.detune) n.detune.value = s.detune;
  if (s.f2 !== undefined) {
    const g = s.glide ?? end - s.t;
    n.frequency.setValueAtTime(s.f, s.t);
    if (s.lin) n.frequency.linearRampToValueAtTime(s.f2, s.t + g);
    else n.frequency.exponentialRampToValueAtTime(Math.max(1, s.f2), s.t + g);
  }
  if (s.vib) {
    const l = osc(o, 'sine', s.vib[0], s.t, end + 0.01);
    const lg = gain(ctx, s.vib[1]);
    l.connect(lg).connect(n.detune);
  }
  const g = gain(ctx, 0);
  env(g.gain, s.t, a, s.peak, s.d, s.hold);
  let head: AudioNode = n;
  if (s.ft) {
    const f = filt(ctx, s.ft, s.ff ?? 2000, s.fq ?? 0.707);
    if (s.ff2 !== undefined) {
      f.frequency.setValueAtTime(s.ff ?? 2000, s.t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, s.ff2), end);
    }
    n.connect(f);
    head = f;
  }
  head.connect(g);
  let tail: AudioNode = g;
  if (s.pan !== undefined && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(s.pan, -1, 1);
    g.connect(p);
    tail = p;
  }
  tail.connect(s.dest ?? o.dest);
  return end;
}

export interface BurstSpec {
  kind?: NoiseKind;
  t: number;
  a?: number;
  d: number;
  hold?: number;
  peak: number;
  type?: BiquadFilterType;
  f?: number;
  f2?: number;
  q?: number;
  rate?: number;
  dest?: AudioNode;
  pan?: number;
}

/** One enveloped, filtered noise burst. Returns its end time. */
export function burst(o: Out, s: BurstSpec): number {
  const { ctx } = o;
  const a = s.a ?? 0.003;
  const end = s.t + Math.max(0.002, a) + (s.hold ?? 0) + s.d + 0.006;
  const n = noise(o, s.kind ?? 'white', s.t, end + 0.01, s.rate ?? 1);
  const f = filt(ctx, s.type ?? 'bandpass', s.f ?? 2000, s.q ?? 0.9);
  if (s.f2 !== undefined) {
    f.frequency.setValueAtTime(s.f ?? 2000, s.t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, s.f2), end);
  }
  const g = gain(ctx, 0);
  env(g.gain, s.t, a, s.peak, s.d, s.hold);
  n.connect(f).connect(g);
  let tail: AudioNode = g;
  if (s.pan !== undefined && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(s.pan, -1, 1);
    g.connect(p);
    tail = p;
  }
  tail.connect(s.dest ?? o.dest);
  return end;
}

/** A struck bell / chime made of sine partials (ratio, relative amp, decay seconds). */
export function bell(o: Out, f: number, t: number, peak: number, partials: ReadonlyArray<readonly [number, number, number]>, dest?: AudioNode): number {
  let end = t;
  for (const [r, amp, d] of partials) {
    if (f * r > o.ctx.sampleRate * 0.45) continue;
    end = Math.max(end, tone(o, { f: f * r, t, a: 0.002, d, peak: peak * amp, dest }));
  }
  return end;
}

/** Mallet note: fundamental plus a fast-dying 4x partial (marimba / vibes feel). */
export function mallet(o: Out, f: number, t: number, peak: number, d = 0.5, dest?: AudioNode): number {
  const e1 = tone(o, { f, t, a: 0.003, d, peak, dest });
  const e2 = tone(o, { f: f * 4.01, t, a: 0.001, d: d * 0.18, peak: peak * 0.22, dest });
  const e3 = tone(o, { type: 'triangle', f: f * 2, t, a: 0.002, d: d * 0.35, peak: peak * 0.18, dest });
  return Math.max(e1, e2, e3);
}

/** Generated stereo impulse response for the shared reverb: a small, warm room. */
export function makeImpulse(ctx: BaseAudioContext, seconds = 1.6, decay = 3.2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  const pre = Math.floor(ctx.sampleRate * 0.012);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      // the tail darkens as it decays: the one-pole coefficient falls over time
      const k = 0.55 - 0.45 * x;
      lp += k * ((Math.random() * 2 - 1) - lp);
      const fadeOut = i > len - 256 ? (len - i) / 256 : 1;
      d[i] = lp * Math.pow(1 - x, decay) * fadeOut * 0.6;
    }
    // a few early reflections
    for (let r = 0; r < 6; r++) {
      const at = pre + Math.floor(ctx.sampleRate * (0.007 + Math.random() * 0.05));
      if (at < len) d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.35 - r * 0.04);
    }
  }
  return b;
}

/** Soft clip curve: linear up to `knee`, then a smooth shoulder that never reaches 1. */
export function softClipCurve(n = 2048, knee = 0.75, ceiling = 0.97): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    let y = ax;
    if (ax > knee) {
      const over = (ax - knee) / (1 - knee);
      y = knee + (ceiling - knee) * Math.tanh(over * 1.2) / Math.tanh(1.2);
    }
    c[i] = Math.sign(x) * y;
  }
  return c;
}
