// Text -> blip schedule for the wordless "talking" voices. Pure (no Web Audio)
// so it can be unit-tested. The renderer lives in voiceSynth.ts.
//
// Timing rule: a blip starts at the moment its first letter appears on screen
// (charIndex / cps), so the blips stay locked to the typewriter. Spaces and
// punctuation produce no blip, which gives natural pauses.

import type { EmotionId } from '@/game/core/types';
import type { VoiceDef } from '@/game/core/look';
import type { SpeakOptions } from './api';

export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';

export interface Blip {
  /** Start, seconds from the beginning of the line. */
  t: number;
  dur: number;
  /** Pitch at start and end of the blip (Hz). */
  f0: number;
  f1: number;
  /** 0..1.5 relative loudness. */
  gain: number;
  vowel: Vowel;
  /** Index into the text of the chunk that produced it. */
  at: number;
}

export interface EmotionColour {
  /** Semitone shift. */
  pitch: number;
  /** Multiplier on the voice's random spread. */
  spread: number;
  /** Multiplier on talking speed (shorter blips, finer chunking). */
  speed: number;
  /** Brightness: > 1 harsher / more presence, < 1 darker. */
  bright: number;
  gain: number;
  /** Vibrato depth in cents (shaky voice). */
  shake: number;
  /** Extra semitone slope across a sentence (negative = falling). */
  slope: number;
}

const E = (pitch: number, spread: number, speed: number, bright: number, gain: number, shake = 0, slope = 0): EmotionColour =>
  ({ pitch, spread, speed, bright, gain, shake, slope });

export const EMOTION_COLOUR: Record<EmotionId, EmotionColour> = {
  neutral: E(0, 1, 1, 1, 1),
  happy: E(1.5, 1.2, 1.05, 1.1, 1.05, 0, 0.5),
  excited: E(3, 1.45, 1.2, 1.3, 1.12, 0, 1),
  amused: E(1, 1.5, 1.05, 1.1, 1.05),
  smug: E(-0.5, 0.9, 0.9, 1.0, 1.0, 0, -0.5),
  love: E(1, 1.1, 0.88, 0.8, 0.95, 12, 0),
  sad: E(-2, 0.7, 0.78, 0.7, 0.85, 8, -3),
  angry: E(-2, 1.3, 1.1, 1.7, 1.2, 0, -1),
  scared: E(4, 1.5, 1.2, 1.1, 0.95, 38, 1),
  surprised: E(3, 1.3, 1.1, 1.15, 1.1, 0, 1.5),
  confused: E(0.5, 1.3, 0.95, 1.0, 0.95, 0, 2),
  embarrassed: E(1, 0.9, 1.05, 0.85, 0.8),
  disgusted: E(-1.5, 1.1, 0.9, 1.25, 1.0, 0, -1),
  bored: E(-1.5, 0.4, 0.85, 0.8, 0.85, 0, -1.5),
  tired: E(-2, 0.6, 0.75, 0.7, 0.8, 0, -2.5),
  suspicious: E(-1, 0.9, 0.9, 0.95, 0.9),
  nervous: E(2, 1.2, 1.15, 1.0, 0.92, 22, 0),
  proud: E(0.5, 1.0, 0.95, 1.15, 1.1, 0, 0.5),
  mischievous: E(1, 1.6, 1.05, 1.1, 1.0),
  determined: E(-0.5, 0.7, 1.0, 1.2, 1.1, 0, -0.5)
};

export interface StyleColour { pitch: number; gain: number; bright: number; tone: number; breath: number; muffle: number; speed: number }

export const STYLE_COLOUR: Record<NonNullable<SpeakOptions['style']>, StyleColour> = {
  say: { pitch: 0, gain: 1, bright: 1, tone: 1, breath: 0.08, muffle: 0, speed: 1 },
  shout: { pitch: 3, gain: 1.45, bright: 1.6, tone: 1, breath: 0.1, muffle: 0, speed: 1.05 },
  whisper: { pitch: 0, gain: 1.1, bright: 1.3, tone: 0.1, breath: 2.2, muffle: 0, speed: 1 },
  think: { pitch: -1, gain: 0.55, bright: 0.6, tone: 1, breath: 0.05, muffle: 1, speed: 0.95 }
};

export interface SpeechPlan {
  blips: Blip[];
  /** End of the last blip. */
  duration: number;
  emotion: EmotionColour;
  style: StyleColour;
  /** Talking-speed factor actually used (voice speed x emotion x style). */
  speed: number;
}

const VOWELS = 'aeiouy';
const isLetter = (c: string) => /[\p{L}\p{N}']/u.test(c);
const isVowel = (c: string) => VOWELS.includes(c.toLowerCase());

/** One syllable-ish chunk: where it starts in the text and its vowel. */
export interface Chunk { at: number; vowel: Vowel; wordStart: boolean; caps: boolean; wordLen: number }

/** Split text into syllable-ish chunks (pure, exported for tests). */
export function chunkText(text: string): Chunk[] {
  const out: Chunk[] = [];
  let i = 0;
  while (i < text.length) {
    if (!isLetter(text[i])) { i++; continue; }
    let j = i;
    while (j < text.length && isLetter(text[j])) j++;
    const word = text.slice(i, j);
    const caps = word.length > 1 && word === word.toUpperCase() && /\p{Lu}/u.test(word);
    // digits: one chunk each
    if (/^\d+$/.test(word)) {
      for (let k = 0; k < word.length; k++) out.push({ at: i + k, vowel: 'e', wordStart: k === 0, caps: false, wordLen: word.length });
      i = j;
      continue;
    }
    const lower = word.toLowerCase();
    // find vowel groups; a silent final "e" after a consonant does not count when another vowel exists
    const groups: { s: number; v: string }[] = [];
    for (let k = 0; k < lower.length; k++) {
      if (isVowel(lower[k]) && (k === 0 || !isVowel(lower[k - 1]))) groups.push({ s: k, v: lower[k] });
    }
    if (groups.length > 1) {
      const last = groups[groups.length - 1];
      if (last.s === lower.length - 1 && last.v === 'e' && !isVowel(lower[last.s - 1])) groups.pop();
    }
    if (groups.length === 0) {
      out.push({ at: i, vowel: 'u', wordStart: true, caps, wordLen: word.length });
    } else {
      groups.forEach((g, gi) => {
        // a chunk starts at the consonant before its vowel group (except the first, which starts the word)
        let s = gi === 0 ? 0 : g.s;
        if (gi > 0 && s > 0 && !isVowel(lower[s - 1])) s -= 1;
        if (gi > 0 && s <= groups[gi - 1].s) s = g.s;
        const v = (g.v === 'y' ? 'i' : g.v) as Vowel;
        out.push({ at: i + s, vowel: v, wordStart: gi === 0, caps, wordLen: word.length });
      });
    }
    i = j;
  }
  return out;
}

/** The terminal mark of the sentence that contains position `at`. */
function sentenceEnd(text: string, at: number): { mark: string; end: number } {
  for (let k = at; k < text.length; k++) {
    const c = text[k];
    if (c === '.' || c === '!' || c === '?') {
      // treat "?!" / "!?" as a question; "..." as a trailing ellipsis
      const tail = text.slice(k, k + 3);
      if (tail.startsWith('...')) return { mark: '…', end: k };
      if (tail.startsWith('?') || tail.startsWith('!?')) return { mark: '?', end: k };
      return { mark: c, end: k };
    }
    if (c === '…') return { mark: '…', end: k };
  }
  return { mark: '', end: text.length };
}

/**
 * Plan the blips for one line.
 * @param rng random source (pass a seeded one in tests)
 */
export function planSpeech(voice: VoiceDef, text: string, opts: SpeakOptions, rng: () => number = Math.random): SpeechPlan {
  const emotion = EMOTION_COLOUR[opts.emotion ?? 'neutral'] ?? EMOTION_COLOUR.neutral;
  const style = STYLE_COLOUR[opts.style ?? 'say'] ?? STYLE_COLOUR.say;
  const cps = Math.max(4, Math.min(200, opts.cps || 30));
  const speed = Math.max(0.4, Math.min(2.5, (voice.speed || 1) * emotion.speed * style.speed));
  // slower talkers merge close syllables into one longer blip
  const minGap = 0.08 / Math.pow(speed, 1.6);
  const baseDur = 0.12 / Math.pow(speed, 1.2);

  const chunks = chunkText(text);
  // keep only chunks far enough apart
  const kept: Chunk[] = [];
  let lastT = -1;
  for (const c of chunks) {
    const t = c.at / cps;
    if (lastT < 0 || t - lastT >= minGap || (c.wordStart && t - lastT >= minGap * 0.7)) {
      kept.push(c);
      lastT = t;
    }
  }

  // group kept chunks by sentence so we can shape the contour
  const blips: Blip[] = [];
  const sentences = new Map<number, number[]>(); // sentence end index -> blip indices
  const marks = new Map<number, string>();
  kept.forEach((c, idx) => {
    const s = sentenceEnd(text, c.at);
    if (!sentences.has(s.end)) sentences.set(s.end, []);
    sentences.get(s.end)!.push(idx);
    marks.set(s.end, s.mark);
  });

  const semis = new Array<number>(kept.length).fill(0);
  const gains = new Array<number>(kept.length).fill(1);
  const glides = new Array<number>(kept.length).fill(0);

  for (const [end, idxs] of sentences) {
    const mark = marks.get(end) ?? '';
    const n = idxs.length;
    idxs.forEach((bi, k) => {
      const p = n > 1 ? k / (n - 1) : 0;
      let s = 1 - 2 * p; // gentle declination +1 .. -1
      s += emotion.slope * (p - 0.5);
      if (mark === '!') { s += 2; gains[bi] *= 1.15; if (k === 0) s += 1; }
      semis[bi] = s;
      glides[bi] = -0.3;
    });
    const last = idxs[n - 1], prev = n > 1 ? idxs[n - 2] : -1;
    if (mark === '?') {
      if (prev >= 0) semis[prev] += 2.5;
      semis[last] += 5;
      glides[last] = 3;
    } else if (mark === '!') {
      glides[last] = -2.5;
      semis[last] += 1;
    } else if (mark === '.' || mark === '') {
      semis[last] -= mark === '.' ? 3 : 1.5;
      glides[last] = mark === '.' ? -2.5 : -1;
      if (prev >= 0) semis[prev] -= 1;
    } else if (mark === '…') {
      semis[last] -= 2;
      glides[last] = -3;
      gains[last] *= 0.75;
      if (prev >= 0) gains[prev] *= 0.88;
    }
  }

  const spread = (voice.spread ?? 1) * emotion.spread;
  const shift = emotion.pitch + style.pitch;
  kept.forEach((c, i) => {
    const t = c.at / cps;
    const nextT = i + 1 < kept.length ? kept[i + 1].at / cps : Infinity;
    const dur = Math.max(0.045, Math.min(baseDur, (nextT - t) * 0.86));
    let s = semis[i] + shift + (rng() * 2 - 1) * spread;
    let g = gains[i];
    if (c.wordStart && c.wordLen >= 4) { s += 1; g *= 1.08; }
    if (c.caps) { s += 2.5; g *= 1.25; }
    // a comma right after this chunk's word: small continuation rise
    const after = text.slice(c.at, (i + 1 < kept.length ? kept[i + 1].at : text.length));
    let glide = glides[i];
    if (after.includes(',')) { s += 1; glide = 1.5; }
    const f0 = voice.pitch * Math.pow(2, s / 12);
    const f1 = f0 * Math.pow(2, glide / 12);
    blips.push({ t, dur, f0, f1, gain: Math.min(1.5, g * emotion.gain), vowel: c.vowel, at: c.at });
  });

  const last = blips[blips.length - 1];
  return { blips, duration: last ? last.t + last.dur : 0, emotion, style, speed };
}
