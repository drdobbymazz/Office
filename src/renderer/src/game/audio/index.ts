// Overseer's sound: everything synthesized live with the Web Audio API.
// createAudio() returns an AudioApi whose every method is a harmless no-op
// until unlock() has created the AudioContext, and never throws.

import type { AudioApi, AudioVolumes, CreateAudio, LoopId, MusicMood, SfxId, SfxOptions, SpeakOptions } from './api';
import type { VoiceDef } from '@/game/core/look';
import { DEFAULT_VOLUMES, Engine } from './engine';
import { DEFAULT_MOOD } from './music';

/** Look-ahead timer: wake every 25 ms, schedule 120 ms ahead on the audio clock. */
const TICK_MS = 25;
const LOOKAHEAD = 0.12;

type Ctor = typeof AudioContext;

function contextCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const NOOP_HANDLE = { stop() {} };

export const createAudio: CreateAudio = () => {
  let ctx: AudioContext | null = null;
  let engine: Engine | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastTick = 0;
  let suspended = false;
  let disposed = false;
  let musicWanted = false;
  let muted = false;
  const vols: AudioVolumes = { ...DEFAULT_VOLUMES };
  const mood: MusicMood = { ...DEFAULT_MOOD };
  let unlocking: Promise<void> | null = null;

  const safe = <T>(fn: () => T, fallback: T): T => {
    try { return fn(); } catch (e) { console.warn('[audio]', e); return fallback; }
  };

  const tick = () => {
    if (!engine || !ctx) return;
    const nowMs = performance.now();
    // after a throttled gap (background tab clamps timers to ~1 s), look further ahead once
    const gap = lastTick ? (nowMs - lastTick) / 1000 : 0;
    lastTick = nowMs;
    const ahead = gap > 0.2 ? Math.min(1.2, LOOKAHEAD + gap) : LOOKAHEAD;
    safe(() => engine!.tick(ctx!.currentTime + ahead), undefined);
    if (!musicWanted && engine.activeLoops === 0 && !engine.music?.running) stopTimer();
  };

  const startTimer = () => {
    if (timer || suspended || disposed || !engine) return;
    lastTick = 0;
    timer = setInterval(tick, TICK_MS);
    tick();
  };
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const api: AudioApi = {
    get unlocked() { return !!engine && !!ctx && ctx.state !== 'closed'; },

    unlock() {
      if (disposed) return Promise.resolve();
      if (unlocking) {
        // still resume on every gesture: iOS can re-suspend after an interruption
        if (ctx && ctx.state !== 'running' && !suspended) ctx.resume().catch(() => {});
        return unlocking.then(() => {});
      }
      unlocking = (async () => {
        try {
          const C = contextCtor();
          if (!C) return;
          ctx = new C({ latencyHint: 'interactive' });
          engine = new Engine(ctx, true);
          engine.setVolumes(vols);
          if (muted) engine.setMuted(true);
          if (musicWanted) {
            const m = engine.ensureMusic();
            m.setMood(mood);
            m.start(ctx.currentTime + 0.05);
            startTimer();
          }
          // a tiny silent buffer unlocks output on older iOS
          const b = ctx.createBuffer(1, 1, ctx.sampleRate);
          const s = ctx.createBufferSource();
          s.buffer = b;
          s.connect(ctx.destination);
          s.start();
          // resume() stays pending until a real gesture: never let unlock() hang on it
          if (ctx.state !== 'running') {
            await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 250))]);
          }
        } catch (e) {
          console.warn('[audio] unlock failed', e);
          unlocking = null;
        }
      })();
      return unlocking;
    },

    setVolumes(v: Partial<AudioVolumes>) {
      for (const k of ['master', 'music', 'sfx', 'voice'] as const) {
        const x = v?.[k];
        if (typeof x === 'number' && Number.isFinite(x)) vols[k] = Math.max(0, Math.min(1, x));
      }
      if (engine) safe(() => engine!.setVolumes(vols), undefined);
    },

    setMuted(m: boolean) {
      muted = !!m;
      if (engine) safe(() => engine!.setMuted(muted), undefined);
    },

    sfx(id: SfxId, opts?: SfxOptions) {
      if (!engine || suspended || disposed) return;
      safe(() => engine!.sfx(id, opts), undefined);
    },

    loop(id: LoopId, on: boolean, opts?: SfxOptions) {
      if (!engine || disposed) return;
      safe(() => engine!.loop(id, on, opts), undefined);
      if (on) startTimer();
    },

    speak(voice: VoiceDef, text: string, opts: SpeakOptions) {
      if (!engine || suspended || disposed || !voice || !text) return NOOP_HANDLE;
      return safe(() => engine!.speak(voice, String(text), opts ?? { cps: 30 }), NOOP_HANDLE);
    },

    setMusicMood(m: Partial<MusicMood>) {
      if (!m) return;
      Object.assign(mood, m);
      if (engine?.music) safe(() => engine!.music!.setMood(mood), undefined);
    },

    startMusic() {
      musicWanted = true;
      if (!engine || !ctx || disposed) return;
      safe(() => {
        const m = engine!.ensureMusic();
        m.setMood(mood);
        m.start(ctx!.currentTime + 0.05);
      }, undefined);
      startTimer();
    },

    stopMusic() {
      musicWanted = false;
      if (!engine || !ctx) return;
      safe(() => engine!.music?.stop(ctx!.currentTime), undefined);
    },

    suspend() {
      if (!ctx || suspended) return;
      suspended = true;
      stopTimer();
      ctx.suspend().catch(() => {});
    },

    resume() {
      if (!ctx || disposed) return;
      suspended = false;
      ctx.resume().catch(() => {}).finally(() => startTimer());
      startTimer();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      stopTimer();
      if (engine) safe(() => engine!.silenceAll(), undefined);
      const c = ctx;
      engine = null;
      ctx = null;
      if (c) setTimeout(() => { c.close().catch(() => {}); }, 150);
    }
  };
  return api;
};

export type { AudioApi } from './api';
