// Plays the Composer's bars on the audio clock. scheduleUntil(t) is called
// by a look-ahead timer (live) or once with the full length (offline).

import { Composer, GROUPS, type Group, type NoteEv } from './music';
import type { MusicMood } from './api';
import { INSTRUMENTS, noteVoice } from './instruments';
import { filt, gain } from './synth';

interface Queued { t: number; dur: number; ev: NoteEv }

/** Per-group trims so the layers sit together. */
const GROUP_LEVEL: Record<Group, number> = { office: 1, disco: 0.9, drone: 1, frozen: 1.1 };

export class MusicPlayer {
  readonly composer: Composer;
  private out: GainNode;
  private groups: Record<Group, GainNode>;
  private inputs: Record<Group, AudioNode>;
  private lfos: OscillatorNode[] = [];
  private queue: Queued[] = [];
  private nextBar = 0;
  running = false;
  /** Last bars planned (for the harness / analysis). */
  readonly history: { t: number; bpm: number; chords: string; mix: string }[] = [];

  /** Dips under stings (see duck()); separate from `out` so start/stop fades and ducks never fight. */
  private ducker: GainNode;

  constructor(private ctx: BaseAudioContext, dest: AudioNode, wet: AudioNode | null, composer?: Composer) {
    this.composer = composer ?? new Composer();
    this.out = gain(ctx, 0);
    this.ducker = gain(ctx, 1);
    this.out.connect(this.ducker);
    this.ducker.connect(dest);
    if (wet) {
      const send = gain(ctx, 0.35);
      this.ducker.connect(send).connect(wet);
    }
    const mk = (): GainNode => { const g = gain(ctx, 0); g.connect(this.out); return g; };
    this.groups = { office: mk(), disco: mk(), drone: mk(), frozen: mk() };
    // electric piano tremolo lives on the office group input
    const trem = gain(ctx, 0.9);
    const l = ctx.createOscillator();
    l.frequency.value = 4.2;
    const lg = gain(ctx, 0.08);
    l.connect(lg).connect(trem.gain);
    trem.connect(this.groups.office);
    // frozen: everything under a slowly breathing low-pass
    const flp = filt(ctx, 'lowpass', 700, 2);
    const fl = ctx.createOscillator();
    fl.frequency.value = 0.09;
    const flg = gain(ctx, 450);
    fl.connect(flg).connect(flp.frequency);
    flp.connect(this.groups.frozen);
    // blackout: darker, a little band-limited
    const dlp = filt(ctx, 'lowpass', 1800, 0.7);
    dlp.connect(this.groups.drone);
    this.lfos.push(l, fl);
    l.start();
    fl.start();
    this.inputs = { office: trem, disco: this.groups.disco, drone: dlp, frozen: flp };
  }

  setMood(m: Partial<MusicMood>): void { this.composer.setMood(m); }

  start(at: number): void {
    if (this.running) return;
    this.running = true;
    this.composer.reset();
    this.queue = [];
    this.nextBar = at + 0.05;
    const p = this.out.gain;
    p.cancelScheduledValues(at);
    p.setValueAtTime(p.value, at);
    p.linearRampToValueAtTime(1, at + 0.3);
  }

  /**
   * Dip the music to `depth` (0..1 gain) from `at` for `hold` seconds, then ease it back,
   * so a sting reads clearly. A new duck takes over from wherever the last one is.
   */
  duck(at: number, depth: number, hold: number): void {
    const d = Math.max(0, Math.min(1, depth));
    const p = this.ducker.gain;
    const t = Math.max(at, this.ctx.currentTime);
    if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(t);
    else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
    p.linearRampToValueAtTime(d, t + 0.08);
    p.setValueAtTime(d, t + 0.08 + hold);
    p.linearRampToValueAtTime(1, t + 0.08 + hold + 0.9);
  }

  stop(at: number, fade = 1.2): void {
    if (!this.running) return;
    this.running = false;
    this.queue = [];
    const p = this.out.gain;
    p.cancelScheduledValues(at);
    p.setValueAtTime(p.value, at);
    p.linearRampToValueAtTime(0, at + fade);
  }

  /** Schedule everything that starts before `until`. Never stacks notes after a stall. */
  scheduleUntil(until: number): void {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    // fell far behind (throttled tab, suspended context): skip ahead instead of catching up
    if (this.nextBar < now - 0.05) {
      this.nextBar = now + 0.05;
      this.queue = this.queue.filter((q) => q.t >= now);
    }
    while (this.nextBar < until) {
      const plan = this.composer.nextBar();
      const t0 = this.nextBar;
      const beat = 60 / plan.bpm;
      for (const g of GROUPS) {
        const p = this.groups[g].gain;
        const a = plan.mixFrom[g] * GROUP_LEVEL[g], b = plan.mixTo[g] * GROUP_LEVEL[g];
        p.setValueAtTime(a, t0);
        p.linearRampToValueAtTime(b, t0 + plan.barDur * 0.5);
      }
      for (const ev of plan.events) this.queue.push({ t: t0 + ev.beat * beat, dur: ev.dur * beat, ev });
      this.history.push({ t: t0, bpm: plan.bpm, chords: plan.chords.map((c) => c.name).join('|'), mix: GROUPS.filter((g) => plan.mixTo[g] > 0).join('+') });
      if (this.history.length > 64) this.history.shift();
      this.nextBar += plan.barDur;
    }
    // queue is in time order per bar, and bars are appended in order
    let i = 0;
    for (; i < this.queue.length; i++) {
      const q = this.queue[i];
      if (q.t >= until) break;
      if (q.t < now - 0.005) continue; // too late: drop rather than play out of time
      const v = noteVoice(this.ctx, this.inputs[q.ev.group]);
      INSTRUMENTS[q.ev.inst](v.o, q.t, q.ev.midi, q.dur, q.ev.vel);
      v.done();
    }
    if (i > 0) this.queue.splice(0, i);
  }

  dispose(): void {
    this.running = false;
    this.queue = [];
    for (const l of this.lfos) { try { l.stop(); } catch { /* */ } }
    try { this.out.disconnect(); } catch { /* */ }
  }
}
