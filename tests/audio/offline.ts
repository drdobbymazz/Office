// A small offline renderer for Node that implements the part of the Web Audio API
// the game's synth code uses, so tests can render sounds and measure them without a
// browser. It follows the spec's formulas (AudioParam automation, biquad
// coefficients, equal-power stereo panner, normalised periodic waves) closely enough
// for level, length and spectrum checks. Not covered: convolver and compressor (pass
// through or silence; the tests add the reverb themselves), delay, analyser.
//
//   const ctx = new FakeContext(2, seconds * sr, sr);
//   ...build a graph with ctx as a BaseAudioContext...
//   const { channels } = ctx.render();

const BLOCK = 128;
const TAU = Math.PI * 2;

type EvType = 'set' | 'lin' | 'exp' | 'target' | 'curve';
interface Ev { type: EvType; t: number; v: number; tc?: number; curve?: Float32Array; dur?: number }
interface Seg { t0: number; t1: number; kind: 'const' | 'lin' | 'exp' | 'target' | 'curve'; v0: number; v1: number; tc?: number; curve?: Float32Array; dur?: number }

function evalSeg(s: Seg, t: number): number {
  switch (s.kind) {
    case 'const': return s.v0;
    case 'lin': return s.t1 > s.t0 ? s.v0 + ((s.v1 - s.v0) * (t - s.t0)) / (s.t1 - s.t0) : s.v1;
    case 'exp': return s.v0 * s.v1 > 0 && s.t1 > s.t0 ? s.v0 * Math.pow(s.v1 / s.v0, (t - s.t0) / (s.t1 - s.t0)) : s.v0;
    case 'target': return s.v1 + (s.v0 - s.v1) * Math.exp(-(t - s.t0) / Math.max(1e-9, s.tc ?? 1));
    case 'curve': {
      const c = s.curve!;
      const x = ((t - s.t0) / (s.dur ?? 1)) * (c.length - 1);
      const k = Math.floor(x);
      if (k >= c.length - 1) return c[c.length - 1];
      if (k < 0) return c[0];
      const f = x - k;
      return c[k] * (1 - f) + c[k + 1] * f;
    }
  }
}

export class FakeParam {
  private v: number;
  private events: Ev[] = [];
  private segs: Seg[] | null = null;
  private cursor = 0;
  readonly inputs: FakeNode[] = [];
  readonly buf = new Float32Array(BLOCK);
  /** True when this block's values are all the same (no inputs, one constant segment). */
  flat = true;

  constructor(readonly defaultValue: number, readonly minValue = -3.4028234663852886e38, readonly maxValue = 3.4028234663852886e38) {
    this.v = defaultValue;
  }

  get value(): number { return this.v; }
  set value(x: number) { this.v = x; this.segs = null; }

  private add(e: Ev): this {
    if (!Number.isFinite(e.t) || !Number.isFinite(e.v)) throw new TypeError(`non-finite automation ${e.type} ${e.v} at ${e.t}`);
    if (e.type === 'exp' && e.v === 0) throw new RangeError('exponentialRampToValueAtTime to 0');
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].t > e.t) i--;
    this.events.splice(i, 0, e);
    this.segs = null;
    return this;
  }
  setValueAtTime(v: number, t: number): this { return this.add({ type: 'set', t, v }); }
  linearRampToValueAtTime(v: number, t: number): this { return this.add({ type: 'lin', t, v }); }
  exponentialRampToValueAtTime(v: number, t: number): this { return this.add({ type: 'exp', t, v }); }
  setTargetAtTime(v: number, t: number, tc: number): this { return this.add({ type: 'target', t, v, tc }); }
  setValueCurveAtTime(curve: ArrayLike<number>, t: number, dur: number): this {
    return this.add({ type: 'curve', t, v: curve[0] ?? 0, curve: Float32Array.from(curve), dur });
  }
  cancelScheduledValues(t: number): this {
    this.events = this.events.filter((e) => e.t < t);
    this.segs = null;
    return this;
  }
  cancelAndHoldAtTime(t: number): this { return this.cancelScheduledValues(t); }

  private build(): Seg[] {
    const segs: Seg[] = [];
    let open: Seg = { t0: -Infinity, t1: Infinity, kind: 'const', v0: this.v, v1: this.v };
    let aT = 0, aV = this.v;
    const close = (t: number) => { if (t > open.t0) segs.push({ ...open, t1: t }); };
    for (const e of this.events) {
      if (e.type === 'lin' || e.type === 'exp') {
        // a ramp runs from the previous event's point (a ramp after setTarget replaces it, per spec)
        close(aT);
        segs.push({ t0: aT, t1: e.t, kind: e.type, v0: aV, v1: e.v });
        open = { t0: e.t, t1: Infinity, kind: 'const', v0: e.v, v1: e.v };
        aT = e.t; aV = e.v;
      } else if (e.type === 'set') {
        close(e.t);
        open = { t0: e.t, t1: Infinity, kind: 'const', v0: e.v, v1: e.v };
        aT = e.t; aV = e.v;
      } else if (e.type === 'target') {
        const v0 = evalSeg(open, e.t);
        close(e.t);
        open = { t0: e.t, t1: Infinity, kind: 'target', v0, v1: e.v, tc: e.tc };
        aT = e.t; aV = v0;
      } else {
        close(e.t);
        const end = e.t + (e.dur ?? 0);
        segs.push({ t0: e.t, t1: end, kind: 'curve', v0: 0, v1: 0, curve: e.curve, dur: e.dur });
        const last = e.curve![e.curve!.length - 1];
        open = { t0: end, t1: Infinity, kind: 'const', v0: last, v1: last };
        aT = end; aV = last;
      }
    }
    segs.push(open);
    return segs;
  }

  /** Fill `buf` with this block's values (automation plus audio-rate inputs). */
  compute(start: number, frames: number, sr: number): Float32Array {
    if (!this.segs) { this.segs = this.build(); this.cursor = 0; }
    const segs = this.segs;
    const b = this.buf;
    let k = this.cursor;
    const t0 = start / sr, t1 = (start + frames - 1) / sr;
    while (k < segs.length - 1 && t0 >= segs[k].t1) k++;
    const s = segs[k];
    if ((s.kind === 'const' && t1 < s.t1) || (k === segs.length - 1 && s.kind === 'const')) {
      b.fill(s.v0, 0, frames);
      this.flat = true;
    } else {
      this.flat = false;
      for (let i = 0; i < frames; i++) {
        const t = (start + i) / sr;
        while (k < segs.length - 1 && t >= segs[k].t1) k++;
        b[i] = evalSeg(segs[k], t);
      }
    }
    this.cursor = k;
    for (const n of this.inputs) {
      if (n.silent) continue;
      this.flat = false;
      const o = n.out;
      if (o.length === 1) { const a = o[0]; for (let i = 0; i < frames; i++) b[i] += a[i]; }
      else { const a = o[0], c = o[1]; for (let i = 0; i < frames; i++) b[i] += 0.5 * (a[i] + c[i]); }
    }
    return b;
  }
}

export interface NodeCounts { oscillators: number; bufferSources: number; filters: number; gains: number; panners: number; other: number }

export abstract class FakeNode {
  readonly inputs: FakeNode[] = [];
  readonly params: FakeParam[] = [];
  private consumers: (FakeNode | FakeParam)[] = [];
  /** This block's output: 1 or 2 channels. */
  out: Float32Array[] = [];
  silent = true;
  channelCount = 2;
  channelCountMode = 'max';
  channelInterpretation = 'speakers';
  numberOfInputs = 1;
  numberOfOutputs = 1;
  private scratch: Float32Array[] = [new Float32Array(BLOCK), new Float32Array(BLOCK)];

  constructor(readonly context: FakeContext) {}

  connect<T extends FakeNode | FakeParam>(dest: T): T {
    dest.inputs.push(this);
    this.consumers.push(dest);
    return dest;
  }
  disconnect(dest?: FakeNode | FakeParam): void {
    for (const c of dest ? [dest] : this.consumers) {
      const i = c.inputs.indexOf(this);
      if (i >= 0) c.inputs.splice(i, 1);
    }
    this.consumers = dest ? this.consumers.filter((c) => c !== dest) : [];
  }
  addEventListener(): void { /* no events offline */ }
  removeEventListener(): void { /* */ }

  /** Sum of this block's inputs (mono stays mono; any stereo input makes it stereo). */
  protected mix(frames: number): Float32Array[] | null {
    let ch = 0;
    for (const n of this.inputs) if (!n.silent) ch = Math.max(ch, n.out.length);
    if (!ch) return null;
    const out = this.scratch.slice(0, ch);
    for (const o of out) o.fill(0, 0, frames);
    for (const n of this.inputs) {
      if (n.silent) continue;
      if (n.out.length === ch) {
        for (let c = 0; c < ch; c++) { const a = n.out[c], d = out[c]; for (let i = 0; i < frames; i++) d[i] += a[i]; }
      } else {
        // mono into stereo: copy to both
        const a = n.out[0];
        for (let c = 0; c < ch; c++) { const d = out[c]; for (let i = 0; i < frames; i++) d[i] += a[i]; }
      }
    }
    return out;
  }

  abstract process(start: number, frames: number, sr: number): void;
}

function bufs(n: number): Float32Array[] { return Array.from({ length: n }, () => new Float32Array(BLOCK)); }

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
  private o = bufs(2);
  constructor(ctx: FakeContext) { super(ctx); this.params.push(this.gain); }
  process(start: number, frames: number, sr: number): void {
    const g = this.gain.compute(start, frames, sr);
    const x = this.mix(frames);
    if (!x || (this.gain.flat && g[0] === 0)) { this.silent = true; return; }
    this.silent = false;
    this.out = this.o.slice(0, x.length);
    for (let c = 0; c < x.length; c++) { const a = x[c], d = this.out[c]; for (let i = 0; i < frames; i++) d[i] = a[i] * g[i]; }
  }
}

// ── periodic waves ───────────────────────────────────────────────────────
const TABLE = 4096;

export class FakePeriodicWave {
  private tables = new Map<number, Float32Array>();
  private scale: number;
  constructor(readonly real: Float32Array, readonly imag: Float32Array, normalize = true) {
    const full = this.make(real.length - 1, 1);
    let mx = 0;
    for (const v of full) mx = Math.max(mx, Math.abs(v));
    this.scale = normalize && mx > 0 ? 1 / mx : 1;
  }
  private make(kmax: number, scale: number): Float32Array {
    const t = new Float32Array(TABLE + 1);
    for (let k = 1; k <= Math.min(kmax, this.real.length - 1); k++) {
      const a = this.real[k] ?? 0, b = this.imag[k] ?? 0;
      if (!a && !b) continue;
      for (let i = 0; i < TABLE; i++) {
        const ph = (TAU * k * i) / TABLE;
        t[i] += a * Math.cos(ph) + b * Math.sin(ph);
      }
    }
    for (let i = 0; i < TABLE; i++) t[i] *= scale;
    t[TABLE] = t[0];
    return t;
  }
  /** Band-limited table for a fundamental `f` (harmonics below Nyquist only). */
  table(f: number, sr: number): Float32Array {
    const lim = Math.max(1, Math.floor(sr / 2 / Math.max(1, Math.abs(f))));
    const kmax = Math.min(this.real.length - 1, Math.pow(2, Math.floor(Math.log2(lim))));
    let t = this.tables.get(kmax);
    if (!t) { t = this.make(kmax, this.scale); this.tables.set(kmax, t); }
    return t;
  }
}

const builtin = new Map<string, FakePeriodicWave>();
function builtinWave(type: string): FakePeriodicWave {
  let w = builtin.get(type);
  if (w) return w;
  const N = 1024;
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let k = 1; k < N; k++) {
    if (type === 'square') im[k] = (2 / (k * Math.PI)) * (1 - Math.pow(-1, k));
    else if (type === 'sawtooth') im[k] = (Math.pow(-1, k + 1) * 2) / (k * Math.PI);
    else if (type === 'triangle') im[k] = (8 * Math.sin((k * Math.PI) / 2)) / Math.pow(Math.PI * k, 2);
    else if (k === 1) im[k] = 1;
  }
  w = new FakePeriodicWave(re, im, true);
  builtin.set(type, w);
  return w;
}

abstract class FakeSource extends FakeNode {
  protected startAt = Infinity;
  protected stopAt = Infinity;
  onended: (() => void) | null = null;
  numberOfInputs = 0;
  start(when = 0): void { this.startAt = Math.max(0, when); this.context.counts[this.kind]++; }
  stop(when = 0): void { this.stopAt = Math.max(0, when); }
  protected abstract kind: 'oscillators' | 'bufferSources';
  /** First and last frame (exclusive) of this block in which the source plays. */
  protected span(start: number, frames: number, sr: number): [number, number] {
    const a = Math.max(0, Math.ceil(this.startAt * sr - start));
    const b = Math.min(frames, Math.ceil(this.stopAt * sr - start));
    return [a, b];
  }
}

class FakeOscillator extends FakeSource {
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  type: string = 'sine';
  private wave: FakePeriodicWave | null = null;
  private phase = 0;
  private o = bufs(1);
  protected kind = 'oscillators' as const;
  constructor(ctx: FakeContext) { super(ctx); this.params.push(this.frequency, this.detune); }
  setPeriodicWave(w: FakePeriodicWave): void { this.wave = w; this.type = 'custom'; }
  process(start: number, frames: number, sr: number): void {
    const f = this.frequency.compute(start, frames, sr);
    const dt = this.detune.compute(start, frames, sr);
    const [a, b] = this.span(start, frames, sr);
    if (a >= b) { this.silent = true; return; }
    this.silent = false;
    this.out = this.o;
    const d = this.o[0];
    d.fill(0, 0, frames);
    const flatDet = this.detune.flat && dt[0] === 0;
    const w = this.type === 'sine' && !this.wave ? null : this.wave ?? builtinWave(this.type);
    const table = w ? w.table(f[a] * (flatDet ? 1 : Math.pow(2, dt[a] / 1200)), sr) : null;
    let ph = this.phase;
    for (let i = a; i < b; i++) {
      const fi = flatDet ? f[i] : f[i] * Math.pow(2, dt[i] / 1200);
      if (table) {
        const x = ph * TABLE;
        const k = Math.floor(x);
        const fr = x - k;
        d[i] = table[k] * (1 - fr) + table[k + 1] * fr;
      } else d[i] = Math.sin(TAU * ph);
      ph += fi / sr;
      ph -= Math.floor(ph);
    }
    this.phase = ph;
  }
}

export class FakeBuffer {
  readonly duration: number;
  readonly numberOfChannels: number;
  private data: Float32Array[];
  constructor(channels: number, readonly length: number, readonly sampleRate: number) {
    this.numberOfChannels = channels;
    this.duration = length / sampleRate;
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(c: number): Float32Array { return this.data[c]; }
  copyToChannel(src: Float32Array, c: number): void { this.data[c].set(src); }
}

class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = new FakeParam(1);
  readonly detune = new FakeParam(0);
  private pos = -1;
  private offset = 0;
  private o = bufs(2);
  protected kind = 'bufferSources' as const;
  constructor(ctx: FakeContext) { super(ctx); this.params.push(this.playbackRate, this.detune); }
  start(when = 0, offset = 0): void { super.start(when); this.offset = offset; }
  process(start: number, frames: number, sr: number): void {
    const r = this.playbackRate.compute(start, frames, sr);
    const dt = this.detune.compute(start, frames, sr);
    const buf = this.buffer;
    const [a, b] = this.span(start, frames, sr);
    if (!buf || a >= b) { this.silent = true; return; }
    if (this.pos < 0) this.pos = this.offset * buf.sampleRate;
    const n = buf.length;
    const lS = this.loop && this.loopEnd > this.loopStart ? this.loopStart * buf.sampleRate : 0;
    const lE = this.loop && this.loopEnd > this.loopStart ? Math.min(n, this.loopEnd * buf.sampleRate) : n;
    const ch = buf.numberOfChannels;
    this.out = this.o.slice(0, Math.min(2, ch));
    for (const o of this.out) o.fill(0, 0, frames);
    let pos = this.pos;
    let any = false;
    for (let i = a; i < b; i++) {
      if (this.loop) { while (pos >= lE) pos -= lE - lS; }
      else if (pos >= n) break;
      const k = Math.floor(pos);
      const fr = pos - k;
      const k1 = k + 1 < n ? k + 1 : this.loop ? Math.floor(lS) : k;
      for (let c = 0; c < this.out.length; c++) {
        const src = buf.getChannelData(c);
        this.out[c][i] = src[k] * (1 - fr) + src[k1] * fr;
      }
      any = true;
      pos += r[i] * (dt[i] ? Math.pow(2, dt[i] / 1200) : 1) * (buf.sampleRate / sr);
    }
    this.pos = pos;
    this.silent = !any;
  }
}

class FakeBiquad extends FakeNode {
  type: string = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly detune = new FakeParam(0);
  readonly Q = new FakeParam(1);
  readonly gain = new FakeParam(0);
  private z = [new Float64Array(2), new Float64Array(2)];
  private o = bufs(2);
  constructor(ctx: FakeContext) { super(ctx); this.params.push(this.frequency, this.detune, this.Q, this.gain); this.context.counts.filters++; }

  /** Normalised coefficients [b0, b1, b2, a1, a2] (Web Audio spec formulas). */
  static coefs(type: string, f: number, Q: number, G: number, sr: number): number[] {
    const nyq = sr / 2;
    const f0 = Math.min(nyq * 0.9999, Math.max(1, f));
    const w0 = (TAU * f0) / sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const A = Math.pow(10, G / 40);
    const aQ = sw / (2 * Math.max(1e-4, Q));
    const aQdB = sw / (2 * Math.pow(10, Q / 20));
    const aS = (sw / 2) * Math.sqrt((A + 1 / A) * (1 / 1 - 1) + 2);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (type) {
      case 'highpass': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + aQdB; a1 = -2 * cw; a2 = 1 - aQdB; break;
      case 'bandpass': b0 = aQ; b1 = 0; b2 = -aQ; a0 = 1 + aQ; a1 = -2 * cw; a2 = 1 - aQ; break;
      case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + aQ; a1 = -2 * cw; a2 = 1 - aQ; break;
      case 'allpass': b0 = 1 - aQ; b1 = -2 * cw; b2 = 1 + aQ; a0 = 1 + aQ; a1 = -2 * cw; a2 = 1 - aQ; break;
      case 'peaking': b0 = 1 + aQ * A; b1 = -2 * cw; b2 = 1 - aQ * A; a0 = 1 + aQ / A; a1 = -2 * cw; a2 = 1 - aQ / A; break;
      case 'lowshelf': {
        const s = 2 * aS * Math.sqrt(A);
        b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
        a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s; break;
      }
      case 'highshelf': {
        const s = 2 * aS * Math.sqrt(A);
        b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
        a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s; break;
      }
      default: b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + aQdB; a1 = -2 * cw; a2 = 1 - aQdB;
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }

  process(start: number, frames: number, sr: number): void {
    const f = this.frequency.compute(start, frames, sr);
    const det = this.detune.compute(start, frames, sr);
    const q = this.Q.compute(start, frames, sr);
    const g = this.gain.compute(start, frames, sr);
    const x = this.mix(frames);
    const ringing = this.z.some((z) => Math.abs(z[0]) > 1e-9 || Math.abs(z[1]) > 1e-9);
    if (!x && !ringing) { this.silent = true; return; }
    const ch = x ? x.length : this.out.length || 1;
    this.silent = false;
    this.out = this.o.slice(0, ch);
    let c0 = FakeBiquad.coefs(this.type, f[0] * Math.pow(2, det[0] / 1200), q[0], g[0], sr);
    const varying = !(this.frequency.flat && this.Q.flat && this.gain.flat && this.detune.flat);
    for (let c = 0; c < ch; c++) {
      const z = this.z[c];
      const src = x ? x[c] : null;
      const d = this.out[c];
      let [b0, b1, b2, a1, a2] = c0;
      let z1 = z[0], z2 = z[1];
      for (let i = 0; i < frames; i++) {
        if (varying && i % 16 === 0 && i > 0) {
          [b0, b1, b2, a1, a2] = FakeBiquad.coefs(this.type, f[i] * Math.pow(2, det[i] / 1200), q[i], g[i], sr);
        }
        const xi = src ? src[i] : 0;
        // transposed direct form II
        const y = b0 * xi + z1;
        z1 = b1 * xi - a1 * y + z2;
        z2 = b2 * xi - a2 * y;
        d[i] = y;
      }
      z[0] = z1; z[1] = z2;
      if (varying) c0 = FakeBiquad.coefs(this.type, f[0] * Math.pow(2, det[0] / 1200), q[0], g[0], sr);
    }
  }
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam(0, -1, 1);
  private o = bufs(2);
  constructor(ctx: FakeContext) { super(ctx); this.params.push(this.pan); this.context.counts.panners++; }
  process(start: number, frames: number, sr: number): void {
    const p = this.pan.compute(start, frames, sr);
    const x = this.mix(frames);
    if (!x) { this.silent = true; return; }
    this.silent = false;
    this.out = this.o;
    const [L, R] = this.o;
    for (let i = 0; i < frames; i++) {
      const pan = Math.max(-1, Math.min(1, p[i]));
      if (x.length === 1) {
        const a = ((pan + 1) / 2) * (Math.PI / 2);
        L[i] = x[0][i] * Math.cos(a);
        R[i] = x[0][i] * Math.sin(a);
      } else if (pan <= 0) {
        const a = (pan + 1) * (Math.PI / 2);
        L[i] = x[0][i] + x[1][i] * Math.cos(a);
        R[i] = x[1][i] * Math.sin(a);
      } else {
        const a = pan * (Math.PI / 2);
        L[i] = x[0][i] * Math.cos(a);
        R[i] = x[1][i] + x[0][i] * Math.sin(a);
      }
    }
  }
}

class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = 'none';
  private o = bufs(2);
  constructor(ctx: FakeContext) { super(ctx); this.context.counts.other++; }
  process(_s: number, frames: number): void {
    const x = this.mix(frames);
    if (!x) { this.silent = true; return; }
    this.silent = false;
    this.out = this.o.slice(0, x.length);
    const c = this.curve;
    for (let ch = 0; ch < x.length; ch++) {
      const a = x[ch], d = this.out[ch];
      for (let i = 0; i < frames; i++) {
        if (!c) { d[i] = a[i]; continue; }
        const N = c.length;
        const v = ((N - 1) / 2) * (a[i] + 1);
        if (v <= 0) d[i] = c[0];
        else if (v >= N - 1) d[i] = c[N - 1];
        else { const k = Math.floor(v), f = v - k; d[i] = c[k] * (1 - f) + c[k + 1] * f; }
      }
    }
  }
}

/** Pass-through (compressor) or silence (convolver): the tests model those themselves. */
class FakeStub extends FakeNode {
  readonly threshold = new FakeParam(-24);
  readonly knee = new FakeParam(30);
  readonly ratio = new FakeParam(12);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
  readonly reduction = 0;
  buffer: FakeBuffer | null = null;
  normalize = true;
  constructor(ctx: FakeContext, private pass: boolean) { super(ctx); this.context.counts.other++; }
  process(_s: number, frames: number): void {
    const x = this.pass ? this.mix(frames) : null;
    if (!x) { this.silent = true; return; }
    this.silent = false;
    this.out = x.map((a) => a.slice(0, BLOCK));
  }
}

class FakeDestination extends FakeNode {
  maxChannelCount = 2;
  process(_s: number, frames: number): void {
    const x = this.mix(frames);
    this.silent = !x;
    this.out = x ?? [];
  }
}

export class FakeContext {
  readonly destination: FakeDestination;
  readonly counts: NodeCounts = { oscillators: 0, bufferSources: 0, filters: 0, gains: 0, panners: 0, other: 0 };
  currentTime = 0;
  state = 'suspended';
  readonly listener = {};

  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.destination = new FakeDestination(this);
  }

  createGain(): FakeGain { this.counts.gains++; return new FakeGain(this); }
  createOscillator(): FakeOscillator { return new FakeOscillator(this); }
  createBufferSource(): FakeBufferSource { return new FakeBufferSource(this); }
  createBiquadFilter(): FakeBiquad { return new FakeBiquad(this); }
  createStereoPanner(): FakePanner { return new FakePanner(this); }
  createWaveShaper(): FakeShaper { return new FakeShaper(this); }
  createDynamicsCompressor(): FakeStub { return new FakeStub(this, true); }
  createConvolver(): FakeStub { return new FakeStub(this, false); }
  createBuffer(ch: number, len: number, sr: number): FakeBuffer { return new FakeBuffer(ch, len, sr); }
  createPeriodicWave(real: ArrayLike<number>, imag: ArrayLike<number>, opts?: { disableNormalization?: boolean }): FakePeriodicWave {
    return new FakePeriodicWave(Float32Array.from(real), Float32Array.from(imag), !opts?.disableNormalization);
  }

  /** Every node that feeds the destination, inputs before consumers. */
  private order(): FakeNode[] {
    const seen = new Set<FakeNode>();
    const out: FakeNode[] = [];
    const visit = (n: FakeNode) => {
      if (seen.has(n)) return;
      seen.add(n);
      for (const i of n.inputs) visit(i);
      for (const p of n.params) for (const i of p.inputs) visit(i);
      out.push(n);
    };
    visit(this.destination);
    return out;
  }

  /** Render synchronously. Returns the channels and the number of nodes processed. */
  render(): { channels: Float32Array[]; nodes: number } {
    const nodes = this.order();
    const chs = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length));
    for (let start = 0; start < this.length; start += BLOCK) {
      const frames = Math.min(BLOCK, this.length - start);
      this.currentTime = start / this.sampleRate;
      for (const n of nodes) n.process(start, frames, this.sampleRate);
      const d = this.destination;
      if (d.silent) continue;
      for (let c = 0; c < chs.length; c++) {
        const src = d.out.length === 1 ? d.out[0] : d.out[Math.min(c, d.out.length - 1)];
        chs[c].set(src.subarray(0, frames), start);
      }
    }
    this.currentTime = this.length / this.sampleRate;
    return { channels: chs, nodes: nodes.length };
  }

  startRendering(): Promise<FakeBuffer> {
    const { channels } = this.render();
    const b = new FakeBuffer(channels.length, this.length, this.sampleRate);
    channels.forEach((c, i) => b.copyToChannel(c, i));
    return Promise.resolve(b);
  }
}

/** Run `fn` with Math.random replaced by a seeded generator (so renders repeat exactly). */
export function seeded<T>(seed: number, fn: () => T): T {
  const orig = Math.random;
  let s = seed >>> 0 || 1;
  Math.random = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = orig; }
}
