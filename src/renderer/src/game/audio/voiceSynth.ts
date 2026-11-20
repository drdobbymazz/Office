// Renders a SpeechPlan: one oscillator for the whole line, gated per blip,
// through a two-formant "mouth" whose resonances move with each vowel.
// Cheap: about a dozen nodes per line, however long it is.

import type { VoiceDef } from '@/game/core/look';
import type { SpeechPlan, Vowel } from './speech';
import { clamp, filt, gain, noiseBuffers, softWave } from './synth';

/** F1, F2 for an adult speaker (Hz). Scaled up for higher voices. */
const FORMANTS: Record<Vowel, [number, number]> = {
  a: [760, 1250],
  e: [520, 1800],
  i: [340, 2150],
  o: [560, 920],
  u: [430, 1050]
};

export interface SpeechHandle {
  stop(): void;
  /** Audio time when the line ends naturally. */
  end: number;
}

export function renderSpeech(
  ctx: BaseAudioContext, dest: AudioNode, voice: VoiceDef, plan: SpeechPlan, t0: number, pan = 0
): SpeechHandle {
  const { emotion, style } = plan;
  const end = t0 + plan.duration + 0.08;
  const srcs: AudioScheduledSourceNode[] = [];

  // sources
  const o = ctx.createOscillator();
  o.setPeriodicWave(softWave(ctx, voice.wave));
  o.frequency.value = voice.pitch;
  srcs.push(o);
  const br = ctx.createBufferSource();
  br.buffer = noiseBuffers(ctx).pink;
  br.loop = true;
  srcs.push(br);

  const shakeCents = emotion.shake;
  if (shakeCents > 0) {
    const l = ctx.createOscillator();
    l.frequency.value = emotion.shake > 25 ? 9 : 5.5;
    const lg = gain(ctx, shakeCents);
    l.connect(lg).connect(o.detune);
    srcs.push(l);
  }

  // gate: tone and breath share it, so breath follows the syllables
  const toneG = gain(ctx, style.tone);
  const breathG = gain(ctx, style.breath * 0.6);
  const breathHp = filt(ctx, 'highpass', 900, 0.7);
  const gate = gain(ctx, 0);
  o.connect(toneG).connect(gate);
  br.connect(breathHp).connect(breathG).connect(gate);

  // the mouth: two band-passes plus a low body, then presence
  const scale = clamp(1 + (voice.pitch - 150) / 650, 0.85, 1.35);
  const f1 = filt(ctx, 'bandpass', 600 * scale, 3);
  const f2 = filt(ctx, 'bandpass', 1500 * scale, 7);
  const body = filt(ctx, 'lowpass', Math.max(350, voice.pitch * 2.2), 0.8);
  const g1 = gain(ctx, 1.0);
  const g2 = gain(ctx, 0.85 * clamp(emotion.bright * style.bright, 0.4, 2.2));
  const gb = gain(ctx, 0.1);
  gate.connect(f1).connect(g1);
  gate.connect(f2).connect(g2);
  gate.connect(body).connect(gb);
  const sum = gain(ctx, 1);
  g1.connect(sum); g2.connect(sum); gb.connect(sum);

  const bright = emotion.bright * style.bright;
  const presence = filt(ctx, 'highshelf', 2200, 0.7);
  presence.gain.value = clamp((bright - 1) * 9, -10, 9);
  const muffle = filt(ctx, 'lowpass', style.muffle > 0 ? 1000 : 9000, 0.7);
  // phone speakers: keep the energy in the mouth band, not the fundamental's rumble
  const hpf = filt(ctx, 'highpass', clamp(voice.pitch * 1.3, 150, 260), 0.7);
  sum.connect(hpf).connect(presence).connect(muffle);

  // line gain: level by wave type so square / saw voices are not louder than sine ones
  const waveTrim = voice.wave === 'sine' ? 0.95 : voice.wave === 'triangle' ? 0.95 : voice.wave === 'square' ? 0.8 : 0.85;
  const line = gain(ctx, 0);
  // higher voices sit closer to the formants and come out louder: even that out
  const pitchTrim = clamp(Math.sqrt(230 / voice.pitch), 0.8, 1.25);
  const level = 0.55 * waveTrim * pitchTrim * style.gain;
  line.gain.setValueAtTime(0, t0);
  line.gain.linearRampToValueAtTime(level, t0 + 0.01);
  muffle.connect(line);
  let tail: AudioNode = line;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    line.connect(p);
    tail = p;
  }
  tail.connect(dest);

  // schedule the blips
  const gp = gate.gain;
  gp.setValueAtTime(0, t0);
  for (const b of plan.blips) {
    const t = t0 + b.t;
    const d = b.dur;
    const pk = clamp(b.gain, 0, 1.5);
    o.frequency.setValueAtTime(b.f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, b.f1), t + d);
    const [F1, F2] = FORMANTS[b.vowel];
    f1.frequency.setTargetAtTime(F1 * scale, t, 0.012);
    f2.frequency.setTargetAtTime(F2 * scale, t, 0.012);
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(pk, t + 0.009);
    gp.linearRampToValueAtTime(pk * 0.72, t + Math.max(0.012, d - 0.022));
    gp.linearRampToValueAtTime(0, t + d);
  }

  for (const s of srcs) {
    if (s instanceof AudioBufferSourceNode) s.start(t0, Math.random() * 1.8);
    else s.start(t0);
    s.stop(end);
  }

  let stopped = false;
  const cleanup = () => { try { tail.disconnect(); } catch { /* already gone */ } };
  o.onended = cleanup;

  return {
    end,
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      if (now >= end) return;
      const at = Math.max(now, t0);
      try {
        gp.cancelScheduledValues(at);
        line.gain.cancelScheduledValues(at);
        line.gain.setValueAtTime(line.gain.value, at);
        line.gain.linearRampToValueAtTime(0, at + 0.035);
        for (const s of srcs) s.stop(at + 0.05);
      } catch { /* context closed */ }
    }
  };
}
