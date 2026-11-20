// The mixing graph, shared by the live game and the offline analysis:
//
//   music ─┐            ┌─ dry ──────────────┐
//   sfx   ─┼─ bus gain ─┤                    ├─ master ─ comp ─ limiter ─ soft clip ─ mute ─ out
//   voice ─┘            └─ wet ─ reverb ─────┘
//
// Every voice (one sfx, one loop, one line of speech) has its own gain and
// panner, and disconnects itself when it ends.

import type { AudioVolumes, LoopId, SfxId, SfxOptions, SpeakOptions } from './api';
import type { VoiceDef } from '@/game/core/look';
import { SFX, safePitch } from './sfx';
import { LOOPS, type LoopOut, type LoopVoice } from './loops';
import { planSpeech } from './speech';
import { renderSpeech, type SpeechHandle } from './voiceSynth';
import { MusicPlayer } from './musicPlayer';
import { prepareDrums } from './instruments';
import { type Out, clamp, gain, makeImpulse, softClipCurve } from './synth';

export type BusId = 'music' | 'sfx' | 'voice';

/** Internal trims under the user's volumes, so music sits well under everything. */
const BUS_TRIM: Record<BusId, number> = { music: 0.42, sfx: 0.9, voice: 0.85 };
export const DEFAULT_VOLUMES: AudioVolumes = { master: 0.9, music: 0.6, sfx: 0.9, voice: 0.85 };

export const MAX_SFX = 24;
export const MAX_SPEAKERS = 3;

interface SfxVoice { id: SfxId; out: GainNode; start: number; end: number; dead: boolean }
interface LoopState { id: LoopId; out: GainNode; srcs: AudioScheduledSourceNode[]; voice: LoopVoice; level: number; stopping: number | null }

export class Engine {
  readonly master: GainNode;
  readonly mute: GainNode;
  private buses: Record<BusId, { dry: GainNode; wet: GainNode }>;
  private sfxVoices: SfxVoice[] = [];
  private speakers: SpeechHandle[] = [];
  private loops = new Map<LoopId, LoopState>();
  private lastPlay = new Map<SfxId, number>();
  music: MusicPlayer | null = null;
  private vols: AudioVolumes = { ...DEFAULT_VOLUMES };

  constructor(readonly ctx: BaseAudioContext, readonly live: boolean) {
    const c = ctx;
    this.master = gain(c, this.vols.master);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -4;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.12;
    const clip = c.createWaveShaper();
    clip.curve = softClipCurve();
    this.mute = gain(c, 1);
    // DC blocker / rumble filter: phone speakers cannot play below ~80 Hz anyway,
    // and sub-bass energy would only push the limiter
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 35;
    hp.Q.value = 0.6;
    this.master.connect(hp);
    hp.connect(comp).connect(lim).connect(clip).connect(this.mute).connect(c.destination);

    const reverb = c.createConvolver();
    reverb.buffer = makeImpulse(c);
    const ret = gain(c, 0.55);
    reverb.connect(ret).connect(this.master);

    const mk = (id: BusId) => {
      const v = this.vols[id] * BUS_TRIM[id];
      const dry = gain(c, v), wet = gain(c, v);
      dry.connect(this.master);
      wet.connect(reverb);
      return { dry, wet };
    };
    this.buses = { music: mk('music'), sfx: mk('sfx'), voice: mk('voice') };
  }

  get now(): number { return this.ctx.currentTime; }

  private ramp(p: AudioParam, v: number, tc = 0.05): void {
    const t = this.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.setTargetAtTime(v, t, tc);
  }

  setVolumes(v: Partial<AudioVolumes>): void {
    for (const k of ['master', 'music', 'sfx', 'voice'] as const) {
      const x = v[k];
      if (typeof x === 'number' && Number.isFinite(x)) this.vols[k] = clamp(x, 0, 1);
    }
    this.ramp(this.master.gain, this.vols.master);
    for (const b of ['music', 'sfx', 'voice'] as const) {
      const lvl = this.vols[b] * BUS_TRIM[b];
      this.ramp(this.buses[b].dry.gain, lvl);
      this.ramp(this.buses[b].wet.gain, lvl);
    }
  }

  setMuted(m: boolean): void { this.ramp(this.mute.gain, m ? 0 : 1, 0.04); }

  /** A voice: private gain -> panner -> bus dry, plus a reverb send. */
  private voiceOut(bus: BusId, level: number, wet: number, pan: number): GainNode {
    const c = this.ctx;
    const out = gain(c, level);
    let tail: AudioNode = out;
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      out.connect(p);
      tail = p;
    }
    tail.connect(this.buses[bus].dry);
    if (wet > 0) {
      const s = gain(c, wet);
      tail.connect(s).connect(this.buses[bus].wet);
    }
    return out;
  }

  private kill(v: SfxVoice, at: number): void {
    if (v.dead) return;
    v.dead = true;
    try {
      const p = v.out.gain;
      p.cancelScheduledValues(at);
      p.setValueAtTime(p.value, at);
      p.linearRampToValueAtTime(0, at + 0.04);
    } catch { /* */ }
    if (this.live) setTimeout(() => { try { v.out.disconnect(); } catch { /* */ } }, 120);
  }

  sfx(id: SfxId, opts: SfxOptions = {}, when?: number): void {
    const def = SFX[id];
    if (!def) return;
    const c = this.ctx;
    const t = Math.max(c.currentTime, when ?? c.currentTime) + (this.live ? 0.005 + Math.random() * 0.006 : 0.002);
    // the same sound fired twice within 25 ms is one sound
    const last = this.lastPlay.get(id) ?? -1;
    if (this.live && t - last < 0.025) return;
    this.lastPlay.set(id, t);

    this.sfxVoices = this.sfxVoices.filter((v) => !v.dead && v.end > c.currentTime);
    const same = this.sfxVoices.filter((v) => v.id === id);
    if (same.length >= def.max) this.kill(same[0], c.currentTime);
    const alive = this.sfxVoices.filter((v) => !v.dead);
    if (alive.length >= MAX_SFX) this.kill(alive[0], c.currentTime);

    const vol = clamp(opts.volume ?? 1, 0, 1);
    const out = this.voiceOut('sfx', def.gain * vol, def.wet, opts.pan ?? 0);
    const P = safePitch(opts.pitch) * (1 + (Math.random() * 2 - 1) * def.vary);
    let lastSrc: AudioScheduledSourceNode | null = null;
    let end = t;
    const o: Out = { ctx: c, dest: out, track(src, at) { if (at >= end) { end = at; lastSrc = src; } } };
    try {
      def.build(o, P, t);
    } catch (e) {
      console.warn('[audio] sfx failed', id, e);
    }
    const v: SfxVoice = { id, out, start: t, end, dead: false };
    this.sfxVoices.push(v);
    if (lastSrc) (lastSrc as AudioScheduledSourceNode).onended = () => { v.dead = true; try { out.disconnect(); } catch { /* */ } };
  }

  loop(id: LoopId, on: boolean, opts: SfxOptions = {}): void {
    const def = LOOPS[id];
    if (!def) return;
    const c = this.ctx;
    const now = c.currentTime;
    const cur = this.loops.get(id);
    const level = def.gain * clamp(opts.volume ?? 1, 0, 1);
    if (on) {
      if (cur) {
        // already running (or fading out): bring it back to level, never double it
        const p = cur.out.gain;
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        p.linearRampToValueAtTime(level, now + 0.4);
        cur.level = level;
        cur.stopping = null;
        return;
      }
      const out = this.voiceOut('sfx', 0, def.wet, opts.pan ?? 0);
      const srcs: AudioScheduledSourceNode[] = [];
      const lo: LoopOut = { ctx: c, dest: out, srcs, track() { /* transient events stop themselves */ } };
      const t = now + 0.01;
      let voice: LoopVoice;
      try { voice = def.start(lo, t); } catch (e) { console.warn('[audio] loop failed', id, e); return; }
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(level, t + 0.6);
      this.loops.set(id, { id, out, srcs, voice, level, stopping: null });
    } else if (cur && cur.stopping === null) {
      const fade = 0.8;
      const p = cur.out.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + fade);
      cur.stopping = now + fade;
    }
  }

  /** Advance loop events and finish faded loops. Called by the look-ahead timer. */
  tick(until: number): void {
    const now = this.ctx.currentTime;
    for (const [id, l] of this.loops) {
      if (l.stopping !== null && now >= l.stopping) {
        this.endLoop(l, now);
        this.loops.delete(id);
        continue;
      }
      try { l.voice.tick(l.stopping !== null ? Math.min(until, l.stopping) : until); } catch { /* */ }
    }
    this.music?.scheduleUntil(until);
  }

  private endLoop(l: LoopState, at: number): void {
    for (const s of l.srcs) { try { s.stop(at + 0.02); } catch { /* */ } }
    l.srcs[0]?.addEventListener?.('ended', () => { try { l.out.disconnect(); } catch { /* */ } });
    if (!l.srcs.length) { try { l.out.disconnect(); } catch { /* */ } }
  }

  /** For offline renders: stop a loop at a given time with a fade. */
  stopLoopAt(id: LoopId, at: number, fade = 0.6): void {
    const l = this.loops.get(id);
    if (!l) return;
    l.out.gain.setValueAtTime(l.level, at);
    l.out.gain.linearRampToValueAtTime(0, at + fade);
    for (const s of l.srcs) s.stop(at + fade + 0.02);
    l.voice.tick(at + fade);
    this.loops.delete(id);
  }

  get activeLoops(): number { return this.loops.size; }
  get activeSfx(): number { return this.sfxVoices.filter((v) => !v.dead && v.end > this.ctx.currentTime).length; }
  get activeSpeakers(): number { return this.speakers.filter((s) => s.end > this.ctx.currentTime).length; }

  speak(voice: VoiceDef, text: string, opts: SpeakOptions, when?: number): { stop(): void } {
    const c = this.ctx;
    const t = Math.max(c.currentTime, when ?? c.currentTime) + 0.01;
    const plan = planSpeech(voice, text, opts);
    if (!plan.blips.length) return { stop() {} };
    this.speakers = this.speakers.filter((s) => s.end > c.currentTime);
    while (this.speakers.length >= MAX_SPEAKERS) this.speakers.shift()!.stop();
    const out = this.voiceOut('voice', 1, opts.style === 'think' ? 0.35 : 0.08, 0);
    const h = renderSpeech(c, out, voice, plan, t, opts.pan ?? 0);
    const end = h.end;
    const handle: SpeechHandle = {
      end,
      stop: () => {
        h.stop();
        handle.end = Math.min(handle.end, c.currentTime + 0.06);
      }
    };
    // renderSpeech disconnects its tail from `out` when the line ends, which lets `out` be collected
    this.speakers.push(handle);
    return { stop: () => handle.stop() };
  }

  ensureMusic(): MusicPlayer {
    if (!this.music) {
      this.music = new MusicPlayer(this.ctx, this.buses.music.dry, this.buses.music.wet);
      void prepareDrums(this.ctx.sampleRate);
    }
    return this.music;
  }

  /** Quick fade of everything (dispose). */
  silenceAll(): void {
    const now = this.ctx.currentTime;
    for (const v of this.sfxVoices) this.kill(v, now);
    for (const s of this.speakers) s.stop();
    for (const l of this.loops.values()) this.endLoop(l, now);
    this.loops.clear();
    this.music?.dispose();
    this.music = null;
  }
}
