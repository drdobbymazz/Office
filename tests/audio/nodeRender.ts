// Renders the game's sounds in Node with the fake context (offline.ts) and models
// what the engine adds around a voice: the sfx bus level at default volumes and the
// shared reverb (convolved here, with the convolver's equal-power normalisation).
// The result is the signal at the master input, before the compressor and limiter:
// if that stays under 0 dBFS, the dynamics never have to rescue it.

import type { SfxId } from '@/game/audio/api';
import { SFX } from '@/game/audio/sfx';
import { BUS_TRIM, DEFAULT_VOLUMES, REVERB_RETURN } from '@/game/audio/engine';
import { makeImpulse, type Out } from '@/game/audio/synth';
import { analyze, fft, type Metrics } from '@/game/audio/analysis';
import { FakeContext, seeded, type NodeCounts } from './offline';

export const SR = 44100;
/** Level of a sound on the sfx bus at default volumes, up to the master input. */
export const SFX_BUS = DEFAULT_VOLUMES.sfx * BUS_TRIM.sfx * DEFAULT_VOLUMES.master;

export interface Rendered {
  L: Float32Array;
  R: Float32Array;
  sr: number;
  counts: NodeCounts;
  /** Latest stop time any source was scheduled for (seconds after the start). */
  lastStop: number;
}

/** One sfx voice as the engine builds it (def.gain, optional pan), without bus or reverb. */
export function renderVoice(id: SfxId, o: { seed?: number; pitch?: number; pan?: number; at?: number; seconds?: number } = {}): Rendered {
  const def = SFX[id];
  const at = o.at ?? 0.02;
  const seconds = o.seconds ?? def.dur + 0.8;
  return seeded(o.seed ?? 1, () => {
    const ctx = new FakeContext(2, Math.ceil(seconds * SR), SR);
    const c = ctx as unknown as BaseAudioContext;
    const out = c.createGain();
    out.gain.value = def.gain;
    let tail: AudioNode = out;
    if (o.pan) { const p = c.createStereoPanner(); p.pan.value = o.pan; out.connect(p); tail = p; }
    tail.connect(c.destination);
    let lastStop = at;
    const v: Out = { ctx: c, dest: out, track(_s, stopAt) { lastStop = Math.max(lastStop, stopAt); } };
    def.build(v, o.pitch ?? 1, at);
    const { channels } = ctx.render();
    return { L: channels[0], R: channels[1], sr: SR, counts: { ...ctx.counts }, lastStop: lastStop - at };
  });
}

// ── reverb ───────────────────────────────────────────────────────────────
let irCache: Float32Array[] | null = null;

/** The engine's impulse response, scaled the way a ConvolverNode (normalize = true) scales it. */
function impulse(): Float32Array[] {
  if (irCache) return irCache;
  const ir = seeded(99, () => {
    const ctx = new FakeContext(2, 1, SR);
    return makeImpulse(ctx as unknown as BaseAudioContext);
  });
  const chs = [ir.getChannelData(0), ir.getChannelData(1)];
  let power = 0;
  for (const c of chs) for (const v of c) power += v * v;
  power = Math.sqrt(power / (chs.length * chs[0].length));
  if (!Number.isFinite(power) || power < 0.000125) power = 0.000125;
  const scale = (1 / power) * 0.00125 * (44100 / SR);
  irCache = chs.map((c) => c.map((v) => v * scale));
  return irCache;
}

function ifft(re: Float64Array, im: Float64Array): void {
  for (let i = 0; i < im.length; i++) im[i] = -im[i];
  fft(re, im);
  const n = re.length;
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
}

/** Linear convolution, cut to x's length. */
export function convolve(x: Float32Array, h: Float32Array): Float32Array {
  let N = 1;
  while (N < x.length + h.length - 1) N <<= 1;
  const xr = new Float64Array(N), xi = new Float64Array(N), hr = new Float64Array(N), hi = new Float64Array(N);
  for (let i = 0; i < x.length; i++) xr[i] = x[i];
  for (let i = 0; i < h.length; i++) hr[i] = h[i];
  fft(xr, xi);
  fft(hr, hi);
  for (let k = 0; k < N; k++) {
    const a = xr[k], b = xi[k], c = hr[k], d = hi[k];
    xr[k] = a * c - b * d;
    xi[k] = a * d + b * c;
  }
  ifft(xr, xi);
  const out = new Float32Array(x.length);
  for (let i = 0; i < out.length; i++) out[i] = xr[i];
  return out;
}

export interface Mixed { L: Float32Array; R: Float32Array; sr: number }

/** A voice at the master input: dry on the sfx bus, plus its reverb send through the shared room. */
export function atMaster(v: Rendered, wet: number, bus = SFX_BUS): Mixed {
  const L = v.L.map((x) => x * bus), R = v.R.map((x) => x * bus);
  if (wet > 0) {
    const [h0, h1] = impulse();
    const k = wet * bus * REVERB_RETURN;
    const mono = v.L.every((x, i) => x === v.R[i]);
    const wl = convolve(v.L, h0);
    const wr = convolve(mono ? v.L : v.R, h1);
    for (let i = 0; i < L.length; i++) { L[i] += wl[i] * k; R[i] += wr[i] * k; }
  }
  return { L, R, sr: v.sr };
}

/** An sfx at the master input, as the game plays it at default volumes. */
export function sfxAtMaster(id: SfxId, o: Parameters<typeof renderVoice>[1] = {}): Mixed & { voice: Rendered } {
  const voice = renderVoice(id, o);
  return { ...atMaster(voice, SFX[id].wet), voice };
}

/** Sum signals (each starting at its own offset in seconds) into one buffer. */
export function sum(parts: { m: Mixed; at: number }[], seconds: number): Mixed {
  const n = Math.ceil(seconds * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const { m, at } of parts) {
    const o = Math.round(at * SR);
    for (let i = 0; i < m.L.length && i + o < n; i++) { L[i + o] += m.L[i]; R[i + o] += m.R[i]; }
  }
  return { L, R, sr: SR };
}

export function measure(m: Mixed): Metrics { return analyze([m.L, m.R], m.sr); }

/** Peak of a buffer pair in dBFS. */
export function peakDb(m: Mixed): number {
  let p = 0;
  for (const c of [m.L, m.R]) for (const v of c) { const a = Math.abs(v); if (a > p) p = a; }
  return p > 1e-10 ? 20 * Math.log10(p) : -200;
}
