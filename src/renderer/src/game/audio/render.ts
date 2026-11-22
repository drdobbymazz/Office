// Offline renders of every kind of sound through the real mixing graph, for
// the analysis harness and for anyone who wants a WAV of a sound.

import type { LoopId, MusicMood, SfxId, SpeakOptions } from './api';
import type { VoiceDef } from '@/game/core/look';
import { Engine } from './engine';
import { SFX } from './sfx';
import { DEFAULT_MOOD, styleForMood } from './music';
import { prepareDrums } from './instruments';

export const RENDER_SR = 44100;

async function render(seconds: number, build: (e: Engine) => void, sr = RENDER_SR): Promise<AudioBuffer> {
  await prepareDrums(sr); // so offline music uses the same pre-rendered kit as the live game
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const e = new Engine(ctx, false);
  build(e);
  return ctx.startRendering();
}

export function renderSfx(id: SfxId): Promise<AudioBuffer> {
  return render(SFX[id].dur + 0.7, (e) => e.sfx(id, {}, 0.05));
}

/** A loop faded in at 0, held, and faded out so it ends at `seconds`. */
export function renderLoop(id: LoopId, seconds = 3): Promise<AudioBuffer> {
  // plus 1.6 s so the reverb tail can die away inside the render
  return render(seconds + 1.6, (e) => {
    e.loop(id, true);
    e.tick(seconds);
    e.stopLoopAt(id, seconds - 0.7, 0.6);
  });
}

export function renderSpeech(voice: VoiceDef, text: string, opts: SpeakOptions, seconds?: number): Promise<AudioBuffer> {
  const len = seconds ?? Math.min(12, text.length / Math.max(4, opts.cps) + 1.6);
  return render(len, (e) => { e.speak(voice, text, opts, 0.05); });
}

/** `bars` bars of music in one mood. Starts with the normal one-bar fade-in. */
export function renderMusic(mood: Partial<MusicMood>, bars = 8): Promise<AudioBuffer> {
  const m: MusicMood = { ...DEFAULT_MOOD, ...mood };
  const bpm = styleForMood(m).bpm;
  const seconds = (bars * 240) / bpm + 1.5;
  return render(seconds, (e) => {
    const p = e.ensureMusic();
    p.setMood(m);
    p.start(0);
    p.scheduleUntil(seconds - 1.6);
    p.stop(seconds - 1.5, 1.3);
  });
}

/** Music whose mood changes over time: [atSeconds, mood] steps. */
export function renderMusicScript(steps: [number, Partial<MusicMood>][], seconds: number): Promise<AudioBuffer> {
  return render(seconds, (e) => {
    const p = e.ensureMusic();
    p.setMood({ ...DEFAULT_MOOD, ...steps[0][1] });
    p.start(0);
    for (let i = 0; i < steps.length; i++) {
      const until = i + 1 < steps.length ? steps[i + 1][0] : seconds - 1.6;
      p.setMood(steps[i][1]);
      p.scheduleUntil(until);
    }
    p.stop(seconds - 1.5, 1.3);
  });
}

/** 16-bit stereo WAV bytes (handy for debugging). */
export function toWav(b: AudioBuffer): ArrayBuffer {
  const n = b.length, ch = b.numberOfChannels, sr = b.sampleRate;
  const buf = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, s * 32767, true); o += 2; }
  return buf;
}
