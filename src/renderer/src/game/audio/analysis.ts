// Offline measurements of rendered audio, so sound quality can be checked
// without ears. Pure functions on Float32Arrays (unit-testable in Node).

export interface Metrics {
  /** Peak level, dBFS. */
  peakDb: number;
  /** RMS over the whole render, dBFS. */
  rmsDb: number;
  /** RMS over the part above -60 dB, dBFS (loudness while sounding). */
  activeRmsDb: number;
  /** Seconds until the sound falls below -60 dBFS for good. */
  tail: number;
  /** Seconds before the first sample above -60 dBFS. */
  onset: number;
  dc: number;
  /** Power-weighted spectral centroid, Hz. */
  centroid: number;
  nan: number;
  clipped: number;
  first: number;
  last: number;
  /** Largest sample-to-sample jump (click detector), relative to the peak. */
  maxJump: number;
  /** 16-point RMS envelope over the sounding part, normalised to its max. */
  env: number[];
}

export const db = (x: number): number => (x > 1e-10 ? 20 * Math.log10(x) : -200);

export function mixdown(chs: Float32Array[]): Float32Array {
  if (chs.length === 1) return chs[0];
  const n = chs[0].length;
  const out = new Float32Array(n);
  for (const c of chs) for (let i = 0; i < n; i++) out[i] += c[i] / chs.length;
  return out;
}

/** In-place radix-2 FFT. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Average power spectrum (Hann windowed frames). Returns power per bin (size/2). */
export function powerSpectrum(x: Float32Array, size = 2048, from = 0, to = x.length): Float64Array {
  const out = new Float64Array(size / 2);
  const win = new Float64Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  let frames = 0;
  const re = new Float64Array(size), im = new Float64Array(size);
  const step = size / 2;
  for (let s = from; s + size <= Math.max(to, from + size) && s + size <= x.length; s += step) {
    for (let i = 0; i < size; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) out[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  if (frames) for (let k = 0; k < out.length; k++) out[k] /= frames;
  return out;
}

export function centroidOf(ps: Float64Array, sr: number): number {
  let num = 0, den = 0;
  const binHz = sr / (ps.length * 2);
  for (let k = 1; k < ps.length; k++) { num += k * binHz * ps[k]; den += ps[k]; }
  return den > 0 ? num / den : 0;
}

export function analyze(chs: Float32Array[], sr: number): Metrics {
  const x = mixdown(chs);
  let peak = 0, sum = 0, sq = 0, nan = 0, clipped = 0, lastLoud = -1, firstLoud = -1, maxJump = 0;
  const th = 0.001; // -60 dB
  for (const c of chs) {
    for (let i = 0; i < c.length; i++) {
      const v = c[i];
      if (!Number.isFinite(v)) { nan++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      if (i > 0) { const j = Math.abs(v - c[i - 1]); if (j > maxJump) maxJump = j; }
    }
  }
  for (let i = 0; i < x.length; i++) {
    const v = Number.isFinite(x[i]) ? x[i] : 0;
    sum += v;
    sq += v * v;
    if (Math.abs(v) > th) { lastLoud = i; if (firstLoud < 0) firstLoud = i; }
  }
  let actSq = 0;
  const a0 = Math.max(0, firstLoud), a1 = Math.max(a0 + 1, lastLoud + 1);
  for (let i = a0; i < a1; i++) actSq += x[i] * x[i];
  const ps = powerSpectrum(x, 2048, a0, a1);
  const env: number[] = [];
  const seg = Math.max(1, Math.floor((a1 - a0) / 16));
  for (let s = 0; s < 16; s++) {
    let e = 0;
    for (let i = a0 + s * seg; i < Math.min(a1, a0 + (s + 1) * seg); i++) e += x[i] * x[i];
    env.push(Math.sqrt(e / seg));
  }
  const em = Math.max(...env, 1e-9);
  const firstS = chs.reduce((m, c) => Math.max(m, Math.abs(c[0] ?? 0)), 0);
  const lastS = chs.reduce((m, c) => Math.max(m, Math.abs(c[c.length - 1] ?? 0)), 0);
  return {
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(sq / Math.max(1, x.length))),
    activeRmsDb: db(Math.sqrt(actSq / Math.max(1, a1 - a0))),
    tail: (lastLoud + 1) / sr,
    onset: Math.max(0, firstLoud) / sr,
    dc: sum / Math.max(1, x.length),
    centroid: centroidOf(ps, sr),
    nan,
    clipped,
    first: firstS,
    last: lastS,
    maxJump: peak > 0 ? maxJump / peak : 0,
    env: env.map((e) => +(e / em).toFixed(3))
  };
}

/** Frame RMS envelope (hop seconds). */
export function rmsFrames(x: Float32Array, sr: number, hop = 0.005, win = 0.02): Float64Array {
  const h = Math.max(1, Math.floor(sr * hop)), w = Math.max(1, Math.floor(sr * win));
  const n = Math.max(0, Math.floor((x.length - w) / h));
  const out = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    let e = 0;
    for (let i = f * h; i < f * h + w; i++) e += x[i] * x[i];
    out[f] = Math.sqrt(e / w);
  }
  return out;
}

/** Onset strength: positive change of the (log-compressed) frame energy. */
export function onsetEnvelope(x: Float32Array, sr: number, hop = 0.005): Float64Array {
  const r = rmsFrames(x, sr, hop);
  const o = new Float64Array(r.length);
  for (let i = 1; i < r.length; i++) {
    const d = Math.log1p(100 * r[i]) - Math.log1p(100 * r[i - 1]);
    o[i] = d > 0 ? d : 0;
  }
  return o;
}

/** Tempo by autocorrelation of the onset envelope. */
export function estimateBpm(x: Float32Array, sr: number, lo = 70, hi = 160): number {
  const hop = 0.005;
  const o = onsetEnvelope(x, sr, hop);
  const minLag = Math.floor(60 / hi / hop), maxLag = Math.ceil(60 / lo / hop);
  let best = 0, bestLag = minLag;
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < o.length; i++) s += o[i] * o[i + lag];
    ac[lag] = s;
  }
  for (let lag = minLag; lag <= maxLag; lag++) if (ac[lag] > best) { best = ac[lag]; bestLag = lag; }
  // parabolic refinement
  const a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1];
  const den = a - 2 * b + c;
  const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
  return 60 / ((bestLag + shift) * hop);
}

/** Onsets per second (peaks of the onset envelope above a threshold). */
export function onsetRate(x: Float32Array, sr: number): number {
  const hop = 0.005;
  const o = onsetEnvelope(x, sr, hop);
  let mx = 0;
  for (const v of o) if (v > mx) mx = v;
  const th = mx * 0.25;
  let n = 0, lastI = -999;
  for (let i = 1; i < o.length - 1; i++) {
    if (o[i] > th && o[i] >= o[i - 1] && o[i] >= o[i + 1] && i - lastI > 8) { n++; lastI = i; }
  }
  return n / (x.length / sr);
}

/** Median fundamental over voiced frames (autocorrelation). */
export function estimateF0(x: Float32Array, sr: number, fmin = 70, fmax = 700): number {
  const w = Math.floor(sr * 0.03);
  const hop = Math.floor(sr * 0.01);
  const minLag = Math.floor(sr / fmax), maxLag = Math.ceil(sr / fmin);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const out: number[] = [];
  for (let s = 0; s + w + maxLag < x.length; s += hop) {
    let e = 0;
    for (let i = 0; i < w; i++) e += x[s + i] * x[s + i];
    if (Math.sqrt(e / w) < peak * 0.15) continue;
    let best = 0, bl = 0;
    const r0 = e;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s2 = 0, e2 = 0;
      for (let i = 0; i < w; i++) { s2 += x[s + i] * x[s + i + lag]; e2 += x[s + i + lag] * x[s + i + lag]; }
      const r = s2 / Math.sqrt(r0 * e2 + 1e-12);
      if (r > best) { best = r; bl = lag; }
    }
    if (best > 0.6 && bl) out.push(sr / bl);
  }
  if (!out.length) return 0;
  out.sort((a, b) => a - b);
  return out[Math.floor(out.length / 2)];
}

/** Rough perceptual distance between two sounds (0 = identical). */
export function soundDistance(a: Metrics, b: Metrics): number {
  const c = Math.abs(Math.log2(Math.max(50, a.centroid) / Math.max(50, b.centroid)));
  let e = 0;
  for (let i = 0; i < 16; i++) e += Math.abs(a.env[i] - b.env[i]);
  const d = Math.abs(Math.log2(Math.max(0.03, a.tail - a.onset) / Math.max(0.03, b.tail - b.onset)));
  return c + e / 16 + d * 0.5;
}
