// The score's instruments. Each plays one note into `dest` and cleans up
// after itself (the note's output node is disconnected when its last source ends).

import type { Inst } from './music';
import { type Out, burst, env, filt, gain, mtof, osc, softWave, tone } from './synth';

/** A one-note voice whose output disconnects itself when its last source ends. */
export function noteVoice(ctx: BaseAudioContext, dest: AudioNode): { o: Out; done(): void } {
  const out = gain(ctx, 1);
  out.connect(dest);
  let last: AudioScheduledSourceNode | null = null;
  let end = -1;
  const o: Out = {
    ctx,
    dest: out,
    track(src, at) { if (at >= end) { end = at; last = src; } }
  };
  return {
    o,
    done() {
      if (last) (last as AudioScheduledSourceNode).onended = () => { try { out.disconnect(); } catch { /* gone */ } };
    }
  };
}

type Player = (o: Out, t: number, midi: number, dur: number, vel: number) => void;

/** Rhodes-like electric piano: 1:1 FM with a decaying index (bright attack, mellow body). Two oscillators per note. */
const keys: Player = (o, t, midi, dur, vel) => {
  const f = mtof(midi);
  const rel = dur < 0.3 ? 0.18 : 0.35;
  const decay = Math.max(0.6, 2.2 - (midi - 55) * 0.05);
  const end = t + dur + rel;
  const car = osc(o, 'sine', f, t, end + 0.02);
  const mod = osc(o, 'sine', f, t, end + 0.02);
  const mi = gain(o.ctx, 0);
  mi.gain.setValueAtTime(f * 2.0 * (0.6 + vel), t);
  mi.gain.exponentialRampToValueAtTime(f * 0.25, t + 0.5);
  mod.connect(mi).connect(car.frequency);
  const g = gain(o.ctx, 0);
  const pk = 0.13 * vel;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk, t + 0.006);
  g.gain.setTargetAtTime(pk * 0.25, t + 0.006, decay / 3);
  g.gain.setTargetAtTime(0, t + dur, rel / 5);
  g.gain.linearRampToValueAtTime(0, end);
  car.connect(g).connect(o.dest);
};

/** Plucked upright-ish bass: triangle + a little saw through a closing low-pass. */
const bass: Player = (o, t, midi, dur, vel) => {
  const f = mtof(midi);
  const end = t + dur + 0.12;
  const a = osc(o, softWave(o.ctx, 'triangle'), f, t, end + 0.02);
  const b = osc(o, softWave(o.ctx, 'sawtooth'), f, t, end + 0.02);
  const bg = gain(o.ctx, 0.35);
  const lp = filt(o.ctx, 'lowpass', 1300, 2);
  lp.frequency.setValueAtTime(2200, t);
  lp.frequency.exponentialRampToValueAtTime(320, t + 0.25);
  const g = gain(o.ctx, 0);
  const pk = 0.17 * vel;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk, t + 0.005);
  g.gain.setTargetAtTime(pk * 0.35, t + 0.005, 0.18);
  g.gain.setTargetAtTime(0, t + dur, 0.03);
  g.gain.linearRampToValueAtTime(0, end);
  a.connect(lp);
  b.connect(bg).connect(lp);
  lp.connect(g).connect(o.dest);
};

const brush: Player = (o, t, _m, _d, vel) => {
  burst(o, { kind: 'pink', t, a: 0.025, d: 0.14, peak: 0.16 * vel, type: 'bandpass', f: 4200, q: 0.7 });
};
const tick: Player = (o, t, _m, _d, vel) => {
  burst(o, { kind: 'white', t, a: 0.001, d: 0.025, peak: 0.12 * vel, type: 'highpass', f: 7000 });
};
const hat: Player = (o, t, _m, _d, vel) => {
  burst(o, { kind: 'white', t, a: 0.001, d: 0.035, peak: 0.16 * vel, type: 'highpass', f: 8000 });
};
const ohat: Player = (o, t, _m, _d, vel) => {
  burst(o, { kind: 'white', t, a: 0.002, d: 0.16, peak: 0.13 * vel, type: 'highpass', f: 7500 });
};
const kick: Player = (o, t, _m, _d, vel) => {
  const n = osc(o, 'sine', 120, t, t + 0.4);
  n.frequency.setValueAtTime(130, t);
  n.frequency.exponentialRampToValueAtTime(48, t + 0.12);
  const g = gain(o.ctx, 0);
  env(g.gain, t, 0.003, 0.42 * vel, 0.28);
  n.connect(g).connect(o.dest);
  burst(o, { kind: 'white', t, a: 0.001, d: 0.006, peak: 0.06 * vel, type: 'bandpass', f: 3000 });
};
const rim: Player = (o, t, _m, _d, vel) => {
  tone(o, { type: 'triangle', f: 1650, t, a: 0.001, d: 0.03, peak: 0.1 * vel });
  burst(o, { kind: 'white', t, a: 0.001, d: 0.05, peak: 0.1 * vel, type: 'bandpass', f: 2200, q: 1.2 });
};
const clap: Player = (o, t, _m, _d, vel) => {
  for (let i = 0; i < 3; i++) burst(o, { kind: 'white', t: t + i * 0.011, a: 0.001, d: i === 2 ? 0.12 : 0.01, peak: 0.2 * vel, type: 'bandpass', f: 1300, q: 1.1 });
};
/** Melody: soft mallet (vibes / marimba feel). */
const lead: Player = (o, t, midi, dur, vel) => {
  const f = mtof(midi);
  const d = Math.min(1.2, 0.35 + dur * 0.5);
  tone(o, { f, t, a: 0.004, d, peak: 0.12 * vel });
  tone(o, { f: f * 4.0, t, a: 0.001, d: 0.09, peak: 0.025 * vel });
  tone(o, { type: 'triangle', f: f * 2, t, a: 0.003, d: d * 0.3, peak: 0.025 * vel });
};
const pluck: Player = (o, t, midi, _dur, vel) => {
  // no filter: the soft triangle is already mellow, and an automated biquad is costly per sample
  tone(o, { type: softWave(o.ctx, 'triangle'), f: mtof(midi), t, a: 0.002, d: 0.16, peak: 0.11 * vel });
};
const stab: Player = (o, t, midi, dur, vel) => {
  const f = mtof(midi);
  tone(o, { type: softWave(o.ctx, 'sawtooth'), f, t, a: 0.006, d: 0.12, hold: Math.max(0, dur * 0.25), peak: 0.07 * vel, ft: 'lowpass', ff: 2400, fq: 1.2 });
  tone(o, { type: softWave(o.ctx, 'sawtooth'), f, detune: 9, t, a: 0.006, d: 0.12, hold: Math.max(0, dur * 0.25), peak: 0.05 * vel, ft: 'lowpass', ff: 2400, fq: 1.2 });
};

/**
 * Long overlapping notes (pad / drone): linear attack over `x`, hold, linear
 * release over `x` after the note ends, so back-to-back bars sum to a steady level.
 */
function sustained(o: Out, t: number, dur: number, pk: number, make: (end: number) => AudioNode[]): void {
  const x = Math.min(1.6, dur * 0.4);
  const end = t + dur + x;
  const g = gain(o.ctx, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk, t + x);
  g.gain.setValueAtTime(pk, t + dur);
  g.gain.linearRampToValueAtTime(0, end);
  for (const n of make(end)) n.connect(g);
  g.connect(o.dest);
}

const pad: Player = (o, t, midi, dur, vel) => {
  const f = mtof(midi);
  sustained(o, t, dur, 0.06 * vel, (end) => [
    osc(o, softWave(o.ctx, 'triangle'), f, t, end + 0.02),
    (() => { const n = osc(o, 'sine', f, t, end + 0.02); n.detune.value = 7; const gg = gain(o.ctx, 0.45); n.connect(gg); return gg; })()
  ]);
};
const drone: Player = (o, t, midi, dur, vel) => {
  const f = mtof(midi);
  sustained(o, t, dur, 0.14 * vel, (end) => [
    osc(o, 'sine', f, t, end + 0.02),
    (() => { const n = osc(o, softWave(o.ctx, 'organ'), f * 2, t, end + 0.02); const gg = gain(o.ctx, 0.25); n.connect(gg); return gg; })()
  ]);
};
const bellP: Player = (o, t, midi, _dur, vel) => {
  const f = mtof(midi);
  tone(o, { f, t, a: 0.003, d: 2.2, peak: 0.1 * vel });
  tone(o, { f: f * 2.76, t, a: 0.002, d: 0.6, peak: 0.025 * vel });
};

const SYNTH: Record<Inst, Player> = {
  keys, bass, brush, tick, hat, ohat, kick, rim, clap, lead, pluck, stab, pad, drone, bell: bellP
};

// ── pre-rendered percussion ─────────────────────────────────────────────
// Drum hits are identical every time apart from level, so render each once
// (per sample rate) and play it as a buffer: 2 nodes per hit instead of 3-6,
// and no filters to run. Until the buffers are ready, the synth versions play.
const PERC = ['brush', 'tick', 'hat', 'ohat', 'kick', 'rim', 'clap'] as const;
type Perc = (typeof PERC)[number];
const percCache = new Map<number, Partial<Record<Perc, AudioBuffer>>>();
const percPending = new Map<number, Promise<void>>();

/** Render the drum kit for this sample rate (idempotent). */
export function prepareDrums(sampleRate: number): Promise<void> {
  const have = percPending.get(sampleRate);
  if (have) return have;
  const job = (async () => {
    if (typeof OfflineAudioContext === 'undefined') return;
    const kit: Partial<Record<Perc, AudioBuffer>> = {};
    for (const id of PERC) {
      const len = id === 'kick' ? 0.42 : id === 'ohat' || id === 'brush' || id === 'clap' ? 0.25 : 0.1;
      const c = new OfflineAudioContext(1, Math.ceil(len * sampleRate), sampleRate);
      SYNTH[id]({ ctx: c, dest: c.destination, track() {} }, 0, 0, 0.3, 1);
      kit[id] = await c.startRendering();
    }
    percCache.set(sampleRate, kit);
  })().catch(() => { /* keep using the synth versions */ });
  percPending.set(sampleRate, job);
  return job;
}

function percPlayer(id: Perc): Player {
  return (o, t, midi, dur, vel) => {
    const buf = percCache.get(o.ctx.sampleRate)?.[id];
    if (!buf) { SYNTH[id](o, t, midi, dur, vel); return; }
    const src = o.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.04;
    const g = gain(o.ctx, vel);
    src.connect(g).connect(o.dest);
    src.start(t);
    const end = t + buf.duration / src.playbackRate.value + 0.01;
    src.stop(end);
    o.track(src, end);
  };
}

export const INSTRUMENTS: Record<Inst, Player> = {
  ...SYNTH,
  brush: percPlayer('brush'), tick: percPlayer('tick'), hat: percPlayer('hat'), ohat: percPlayer('ohat'),
  kick: percPlayer('kick'), rim: percPlayer('rim'), clap: percPlayer('clap')
};
