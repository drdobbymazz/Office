// The adaptive score's brain: pure, no Web Audio, so it can be unit-tested.
// It turns a MusicMood into bars of note events. The player (musicPlayer.ts)
// turns those into sound on the audio clock.
//
// Musical idea: a soft office tune in F major (with a lydian B natural on the
// II chord), electric piano comping, plucked bass, brushed kit, and a mallet
// melody built from reusable 2-bar motifs (A B A' B'/rest) so it sounds
// composed rather than random. Chaos adds layers, tempo and darker chords.
//
// Story mode adds two inputs. Stakes (0..1) eases in a tension layer over the
// office tune (a muted pulse, a ticking wood block, brass swells), darker
// chords, straighter and a little faster time; it rises over about three bars
// and falls back over about six. Each of the week's endings has its own
// composed theme (saved bright, scraped bittersweet, closed slow and sparse),
// which takes over from everything else while the ending is on screen.

import type { MusicMood } from './api';

export type Group = 'office' | 'disco' | 'drone' | 'frozen' | 'tension' | 'ending';
export const GROUPS: readonly Group[] = ['office', 'disco', 'drone', 'frozen', 'tension', 'ending'];
export type Inst =
  | 'keys' | 'bass' | 'brush' | 'tick' | 'hat' | 'ohat' | 'kick' | 'rim' | 'clap'
  | 'lead' | 'pluck' | 'stab' | 'pad' | 'drone' | 'bell'
  | 'brass' | 'swell' | 'glock' | 'pulse' | 'wood';
export type EndingId = 'saved' | 'scraped' | 'closed';
export const ENDING_IDS: readonly EndingId[] = ['saved', 'scraped', 'closed'];

/** How fast the stakes layer follows the story: most it moves per bar, up and down. */
export const STAKES_UP = 0.34;
export const STAKES_DOWN = 0.17;

export interface NoteEv {
  /** Start, in beats from the bar start (swing already applied). */
  beat: number;
  /** Length in beats. */
  dur: number;
  inst: Inst;
  midi: number;
  /** 0..1 */
  vel: number;
  group: Group;
}

export type Mix = Record<Group, number>;

export interface Style {
  bpm: number;
  mix: Mix;
  /** 0..1 density of layers. */
  energy: number;
  /** 0..1 darker harmony. */
  tension: number;
  /** 0..1 evening thinning. */
  evening: number;
  menu: boolean;
  swing: number;
  /** 0..1 story stakes (already eased by the Composer) driving the tension layer. */
  stakes: number;
  /** The week's ending on screen: its theme replaces everything else. */
  ending: EndingId | null;
}

export interface Chord { root: number; tones: number[]; name: string }

export interface BarPlan {
  index: number;
  bpm: number;
  /** Seconds per bar at this bar's tempo. */
  barDur: number;
  mixFrom: Mix;
  mixTo: Mix;
  /** One chord, or two (second starts at beat 2). */
  chords: Chord[];
  events: NoteEv[];
  style: Style;
}

export const BEATS_PER_BAR = 4;
export const beatDur = (bpm: number): number => 60 / bpm;
export const barDur = (bpm: number): number => (BEATS_PER_BAR * 60) / bpm;
/** 16th step (0..15) to beats, with swing pushing the off-8th 16ths late. */
export const stepToBeat = (step: number, swing = 0): number => step / 4 + (step % 4 === 2 ? swing * 0.25 : 0);

export const DEFAULT_MOOD: MusicMood = { chaos: 0, hour: 10, disco: false, blackout: false, frozen: false, menu: false };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num01 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : 0);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ZERO: Mix = { office: 0, disco: 0, drone: 0, frozen: 0, tension: 0, ending: 0 };

const isEnding = (e: unknown): e is EndingId => e === 'saved' || e === 'scraped' || e === 'closed';

/**
 * The style for a mood. `stakes` is the eased stakes level (the Composer passes its own);
 * left out, the mood's raw stakes is used.
 */
export function styleForMood(m: MusicMood, stakes?: number): Style {
  if (isEnding(m.ending)) {
    // the ending's theme replaces everything (menu, chaos, blackout from the finale scene, ...)
    const d = ENDINGS[m.ending];
    return { bpm: d.bpm, mix: { ...ZERO, ending: 1 }, energy: d.energy, tension: 0, evening: 0, menu: false, swing: d.swing, stakes: 0, ending: m.ending };
  }
  const chaos = num01(m.chaos);
  const hour = Number.isFinite(m.hour) ? m.hour : 10;
  const mix: Mix = { ...ZERO };
  const office = !m.frozen && !m.blackout && !m.disco && !m.menu;
  // stakes only colours the working day's office music
  const st = office ? num01(stakes ?? m.stakes) : 0;
  // a tense afternoon does not wind down for the evening as much
  const evening = clamp01((hour - 15.5) / 3) * (1 - 0.6 * st);
  let bpm: number;
  if (m.frozen) { mix.frozen = 1; bpm = 80; }
  else if (m.blackout) { mix.drone = 1; bpm = 72; }
  else if (m.disco) { mix.disco = 1; bpm = 120; }
  else if (m.menu) { mix.office = 1; bpm = 88; }
  else { mix.office = 1; mix.tension = st; bpm = Math.round(96 + 20 * Math.pow(chaos, 1.3) - 4 * evening + 10 * st); }
  const energy = m.menu ? 0.05 : m.disco ? Math.max(0.5, chaos) : chaos * (1 - 0.6 * evening);
  const tension = m.menu ? 0 : Math.max(smooth(0.4, 0.85, chaos), 0.9 * st);
  const swing = m.disco ? 0 : 0.16 * (1 - chaos * 0.6) * (1 - 0.7 * st);
  return { bpm, mix, energy, tension, evening: m.menu ? 0 : evening, menu: !!m.menu, swing, stakes: st, ending: null };
}

// ── the endings' themes ───────────────────────────────────────────────────
/** One melody note: start and length in 16ths within its bar, midi. */
type MelNote = readonly [step: number, len: number, midi: number];

interface EndingDef {
  bpm: number;
  swing: number;
  /** Drives the office-style layer choices (0 sparse .. 1 busy). */
  energy: number;
  /** Eight bars, one chord each. Played after a one-bar intro on the first chord, then looped. */
  chords: readonly string[];
  /** The tune, bar by bar (same length as chords). */
  melody: readonly (readonly MelNote[])[];
}

export const ENDINGS: Record<EndingId, EndingDef> = {
  // The branch stays open: bright and bouncy, lydian lift on the II chord, mallets doubled by a glockenspiel,
  // a brushed kit and soft brass.
  saved: {
    bpm: 112, swing: 0.1, energy: 0.6,
    chords: ['Fmaj9', 'Gadd9', 'Am7', 'Bbmaj7', 'Gm7', 'C7sus', 'Fmaj7', 'C9'],
    melody: [
      [[0, 4, 81], [4, 4, 84], [8, 8, 89]],
      [[0, 6, 91], [6, 2, 93], [8, 8, 86]],
      [[0, 4, 88], [4, 2, 86], [6, 2, 84], [8, 8, 81]],
      [[0, 4, 82], [4, 4, 86], [8, 4, 89], [12, 4, 93]],
      [[0, 8, 91], [8, 4, 89], [12, 4, 86]],
      [[0, 6, 89], [6, 2, 91], [8, 8, 84]],
      [[0, 6, 93], [6, 2, 91], [8, 8, 89]],
      [[0, 4, 88], [4, 4, 86], [8, 4, 84], [12, 4, 82]]
    ]
  },
  // Survives with cuts: warm but wistful; the B flat to B flat minor turn is the sigh.
  scraped: {
    bpm: 80, swing: 0.12, energy: 0.2,
    chords: ['Fmaj7', 'Am7', 'Bbmaj7', 'Bbm6', 'Fmaj7', 'Dm7', 'Gm7', 'C7sus'],
    melody: [
      [[0, 6, 81], [6, 2, 79], [8, 8, 76]],
      [[0, 4, 72], [4, 4, 76], [8, 8, 79]],
      [[0, 6, 86], [6, 2, 84], [8, 8, 81]],
      [[0, 6, 85], [6, 2, 84], [8, 8, 82]],
      [[0, 6, 81], [6, 2, 79], [8, 8, 77]],
      [[0, 4, 81], [4, 4, 84], [8, 8, 86]],
      [[0, 6, 86], [6, 2, 84], [8, 8, 82]],
      [[0, 8, 79], [8, 8, 82]]
    ]
  },
  // The branch closes: slow and sparse, D minor, a lone mallet over a soft pad, a far bell now and then;
  // the last bar lifts to F major for a moment before it all starts again.
  closed: {
    bpm: 63, swing: 0, energy: 0,
    chords: ['Dm9', 'Bbmaj7', 'Gm9', 'A7sus', 'Dm9', 'Bbmaj7', 'Bbm6', 'Fmaj7'],
    melody: [
      [[0, 8, 81], [8, 8, 77]],
      [[4, 12, 86]],
      [[0, 8, 82], [8, 8, 81]],
      [[0, 8, 76], [8, 8, 74]],
      [[0, 8, 77], [8, 8, 74]],
      [[8, 8, 77]],
      [[0, 8, 73], [8, 8, 77]],
      [[0, 16, 81]]
    ]
  }
};

// ── harmony ─────────────────────────────────────────────────────────────
const PC: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const QUAL: Record<string, number[]> = {
  maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], '7sus': [0, 5, 7, 10], m9: [0, 3, 7, 10, 14],
  '9': [0, 4, 7, 10, 14], add9: [0, 4, 7, 14], m: [0, 3, 7], '': [0, 4, 7], dim: [0, 3, 6, 9], '7b9': [0, 4, 7, 10, 13],
  m6: [0, 3, 7, 9], maj9: [0, 4, 7, 11, 14], '6': [0, 4, 7, 9], 'maj7#11': [0, 4, 7, 11, 18]
};

export function parseChord(name: string): Chord {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(name);
  if (!m || PC[m[1]] === undefined || !QUAL[m[2]]) throw new Error(`bad chord ${name}`);
  const pc = PC[m[1]];
  return { root: 40 + ((pc - 4 + 12) % 12), tones: QUAL[m[2]], name };
}

/** A progression: 4 bars; each bar is one chord name or two ("Dm|Eb"). */
interface Prog { name: string; bars: string[] }
export const PROGS: Record<'calm' | 'tense' | 'frantic' | 'disco', Prog[]> = {
  calm: [
    { name: 'I-vi-IV-V', bars: ['Fmaj7', 'Dm7', 'Bbmaj7', 'C7sus'] },
    { name: 'IV-V-iii-vi', bars: ['Bbmaj7', 'C6', 'Am7', 'Dm7'] },
    { name: 'lydian', bars: ['Fmaj7', 'Gadd9', 'Am7', 'Bbmaj7'] },
    { name: 'ii-V-I', bars: ['Gm7', 'C7sus', 'Fmaj9', 'Dm7'] },
    { name: 'vi-IV-I-V', bars: ['Dm9', 'Bbmaj7', 'Fmaj7', 'Cadd9'] },
    { name: 'descend', bars: ['Bbmaj7', 'Am7', 'Gm7', 'C7'] }
  ],
  tense: [
    { name: 'minor-turn', bars: ['Dm', 'Bbmaj7', 'Gm7', 'A7b9'] },
    { name: 'flat-two', bars: ['Dm7', 'Ebmaj7', 'Dm7', 'C#dim'] },
    { name: 'iv-minor', bars: ['Bbm6', 'Fmaj7', 'Dbmaj7', 'C7'] },
    { name: 'dominant', bars: ['Gm7', 'A7b9', 'Dm7', 'Bb7'] }
  ],
  frantic: [
    { name: 'chase', bars: ['Dm|Eb', 'Dm|C#dim', 'Dm|Eb', 'Bb7|A7b9'] },
    { name: 'spiral', bars: ['Gm|A7b9', 'Dm|Bb7', 'Gm|A7b9', 'Dm|C#dim'] }
  ],
  disco: [
    { name: 'vamp', bars: ['Gm9', 'C9', 'Gm9', 'C9'] },
    { name: 'walk', bars: ['Bbmaj7', 'Am7', 'Gm7', 'C7sus'] },
    { name: 'four', bars: ['Fmaj9', 'Dm9', 'Gm9', 'C9'] }
  ]
};

/** F major scale pitch classes. */
const SCALE = [5, 7, 9, 10, 0, 2, 4];

/** Scale for melody over a chord: F major, with chord tones overriding clashes (lydian B on G, Eb on Eb, ...). */
export function chordScale(ch: Chord): number[] {
  const pcs = ch.tones.map((i) => (ch.root + i) % 12);
  // only chromatic chord tones (not in F major) push a neighbouring scale tone aside
  const chromatic = pcs.filter((p) => !SCALE.includes(p));
  return SCALE.map((s) => {
    for (const p of chromatic) {
      const d = (p - s + 12) % 12;
      if (d === 1 || d === 11) return p;
    }
    return s;
  });
}

/** Keys voicing: rootless when the chord is rich, smooth voice-leading from `prev`. */
export function voiceChord(ch: Chord, prev: number[] | null, lo = 55, hi = 76): number[] {
  let pcs = ch.tones.map((i) => (ch.root + i) % 12);
  if (pcs.length >= 5) pcs = pcs.slice(1); // drop the root, the bass has it
  pcs = pcs.slice(0, 4);
  const sorted = [...new Set(pcs)];
  let best: number[] = [];
  let bestCost = Infinity;
  for (let r = 0; r < sorted.length; r++) {
    const rot = [...sorted.slice(r), ...sorted.slice(0, r)];
    for (let base = lo; base < lo + 12; base++) {
      if (base % 12 !== rot[0]) continue;
      const v: number[] = [base];
      for (let k = 1; k < rot.length; k++) {
        let n = v[k - 1] + 1;
        while (n % 12 !== rot[k]) n++;
        v.push(n);
      }
      if (v[v.length - 1] > hi) continue;
      let cost: number;
      if (prev && prev.length) {
        cost = 0;
        for (let k = 0; k < v.length; k++) cost += Math.abs(v[k] - prev[Math.min(k, prev.length - 1)]);
      } else {
        cost = Math.abs(v.reduce((a, b) => a + b, 0) / v.length - 64);
      }
      if (cost < bestCost) { bestCost = cost; best = v; }
    }
  }
  return best.length ? best : sorted.map((p) => 60 + ((p - 60 + 120) % 12));
}

// ── patterns (16th steps, lengths in 16ths) ────────────────────────────────
type Pat = ReadonlyArray<readonly [number, number]>;
const KEYS_CALM: Pat[] = [
  [[0, 8], [10, 6]], [[0, 14]], [[2, 5], [8, 8]], [[0, 3], [6, 4], [12, 4]], [[0, 6], [6, 2], [10, 6]]
];
const KEYS_BUSY: Pat[] = [
  [[0, 2], [3, 2], [6, 3], [10, 2], [12, 3]], [[0, 3], [4, 2], [6, 2], [10, 2], [14, 2]], [[0, 2], [6, 2], [8, 2], [11, 2], [14, 2]]
];
const KEYS_FRANTIC: Pat = [[0, 1], [2, 1], [4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [14, 1]];

const RHYTHMS: Pat[] = [
  [[0, 4], [4, 2], [6, 2], [8, 8], [16, 4], [20, 4], [24, 8]],
  [[2, 2], [4, 2], [6, 4], [10, 6], [18, 2], [20, 2], [22, 2], [24, 8]],
  [[0, 6], [6, 2], [8, 6], [14, 2], [16, 12]],
  [[4, 2], [6, 2], [8, 2], [10, 2], [12, 4], [20, 2], [22, 2], [24, 6]],
  [[0, 3], [3, 3], [6, 2], [8, 8], [18, 3], [21, 3], [24, 8]]
];
const RHYTHM_BUSY: Pat = [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4], [16, 2], [18, 2], [20, 2], [22, 2], [24, 4], [28, 4]];

interface Motif { notes: { step: number; len: number; deg: number }[] }

export class Composer {
  mood: MusicMood = { ...DEFAULT_MOOD };
  bar = 0;
  bpm = 96;
  mix: Mix = { ...ZERO };
  private prog: Prog | null = null;
  private progPos = 0;
  private lastProg = '';
  private voicing: number[] | null = null;
  private held: Chord[] | null = null;
  private motifA: Motif | null = null;
  private motifB: Motif | null = null;
  private phrase: Motif | null = null;
  private phraseCount = 0;
  private wasDisco = false;
  private family = '';
  /** Stakes as the music plays it: eases toward the mood's stakes, one step per bar. */
  stakes = 0;
  /** Hysteresis for the harmony: tense chords from stakes 0.55, back to normal at 0.3. */
  private tenseHold = false;
  private endingId: EndingId | null = null;
  /** Bars into the current ending (0 is the intro bar). */
  private endingBar = 0;
  private wasEnding = false;

  constructor(private rng: () => number = Math.random) {}

  setMood(m: Partial<MusicMood>): void {
    this.mood = { ...this.mood, ...m };
  }

  /** Restart from silence (the first bar fades in). */
  reset(): void {
    this.mix = { ...ZERO };
    this.bar = 0;
    this.phrase = null;
    this.stakes = 0;
    this.endingId = null;
  }

  /** True when the next bar would start a different ending than the one playing (the player cuts in at once). */
  endingChanged(): boolean {
    const e = isEnding(this.mood.ending) ? this.mood.ending : null;
    return e !== null && e !== this.endingId;
  }

  private pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.rng() * arr.length) % arr.length]; }

  private familyOf(s: Style): 'disco' | 'frantic' | 'tense' | 'normal' {
    if (s.mix.disco > 0) return 'disco';
    if (s.energy > 0.82 && !s.menu) return 'frantic';
    if (this.tenseHold && s.mix.office > 0 && !s.menu) return 'tense';
    return 'normal';
  }

  private nextChords(s: Style): Chord[] {
    if (s.mix.frozen > 0 && this.held) return this.held;
    // re-pick the progression at its end, or at once when the mood family changes
    const fam = this.familyOf(s);
    if (!this.prog || this.progPos >= this.prog.bars.length || fam !== this.family) {
      const pool = fam === 'disco' ? PROGS.disco : fam === 'frantic' ? PROGS.frantic : fam === 'tense' || this.rng() < s.tension ? PROGS.tense : PROGS.calm;
      let p = this.pick(pool);
      if (pool.length > 1 && p.name === this.lastProg) p = pool[(pool.indexOf(p) + 1) % pool.length];
      this.prog = p;
      this.lastProg = p.name;
      this.progPos = 0;
      this.family = fam;
    }
    const chords = this.prog.bars[this.progPos].split('|').map(parseChord);
    this.progPos++;
    this.held = chords;
    return chords;
  }

  private peekRoot(): number | null {
    if (!this.prog || this.progPos >= this.prog.bars.length) return null;
    return parseChord(this.prog.bars[this.progPos].split('|')[0]).root;
  }

  nextBar(): BarPlan {
    // stakes eases toward the story's value: about three bars up, six bars down, never a jump
    const target = isEnding(this.mood.ending) ? 0 : num01(this.mood.stakes);
    this.stakes = target > this.stakes ? Math.min(target, this.stakes + STAKES_UP) : Math.max(target, this.stakes - STAKES_DOWN);
    if (this.stakes >= 0.55) this.tenseHold = true;
    else if (this.stakes <= 0.3) this.tenseHold = false;
    const s = styleForMood(this.mood, this.stakes);
    const mixFrom = this.mix;
    const mixTo = s.mix;
    this.mix = { ...mixTo };
    const disco = mixTo.disco > 0;
    const ending = s.ending;
    if (ending !== this.endingId) { this.endingId = ending; this.endingBar = 0; }
    if (mixTo.frozen > 0) { /* tempo held while frozen */ }
    // the dancers need exactly 120 at once, and an ending's theme starts at its own tempo
    else if (disco || this.wasDisco || ending || this.wasEnding || this.bar === 0) this.bpm = s.bpm;
    else this.bpm += Math.max(-4, Math.min(4, s.bpm - this.bpm));
    this.wasDisco = disco;
    this.wasEnding = !!ending;

    const ev: NoteEv[] = [];
    let chords: Chord[];
    if (ending) {
      // the theme alone: the other groups only fade out their tails
      chords = this.endingChords(ending);
      this.family = 'ending';
      this.held = chords;
      this.endingEvents(ev, s, ending, chords);
      this.endingBar++;
    } else {
      chords = this.nextChords(s);
      const next = this.peekRoot();
      const active = (g: Group) => mixFrom[g] > 0.001 || mixTo[g] > 0.001;
      if (active('office')) this.office(ev, s, chords, next);
      if (active('disco')) this.disco(ev, s, chords);
      if (active('drone')) this.drone(ev, chords);
      if (active('frozen')) this.frozen(ev, chords);
      if (active('tension')) this.tension(ev, s, chords, next);
    }
    ev.sort((a, b) => a.beat - b.beat);
    const plan: BarPlan = { index: this.bar, bpm: this.bpm, barDur: barDur(this.bpm), mixFrom, mixTo, chords, events: ev, style: s };
    this.bar++;
    return plan;
  }

  // ── story: the stakes layer ───────────────────────────────────────────────
  /**
   * A muted pulse on the chord root in eighths, a wood block ticking like a clock, and
   * (from stakes 0.35) a brass swell into every other bar line. The group's level is the
   * eased stakes itself, so it fades in and out smoothly; the parts also thicken with it.
   */
  private tension(ev: NoteEv[], s: Style, chords: Chord[], next: number | null): void {
    const g: Group = 'tension';
    const st = Math.max(s.stakes, 0.15); // still a little shape while it fades out
    const B = (step: number) => stepToBeat(step, s.swing);
    for (let step = 0; step < 16; step += 2) {
      const root = this.chordAt(chords, step).root;
      ev.push({ beat: B(step), dur: 0.35, inst: 'pulse', midi: root + 12, vel: (step % 8 === 0 ? 0.62 : step % 4 === 0 ? 0.5 : 0.4) * (0.7 + 0.3 * st), group: g });
    }
    // when the office is already frantic, the layer thins out (clearer, and cheaper on phones)
    const busy = s.energy > 0.6;
    if (st > 0.7 && !busy) {
      // urgency: sixteenth pickups into the next bar, walking to its root
      const to = next ?? chords[0].root;
      ev.push({ beat: B(13), dur: 0.2, inst: 'pulse', midi: to + 10, vel: 0.36, group: g });
      ev.push({ beat: B(15), dur: 0.2, inst: 'pulse', midi: to + 11, vel: 0.42, group: g });
    }
    // the clock: tick (1), tock (0), tick, tock on the beats; soft tocks between once it is tight
    const by = st > 0.6 && !busy ? 2 : 4;
    for (let step = 0; step < 16; step += by) {
      const beat = step / 4;
      const onBeat = step % 4 === 0;
      const tick = onBeat && beat % 2 === 0;
      ev.push({ beat, dur: 0.1, inst: 'wood', midi: tick ? 1 : 0, vel: onBeat ? (tick ? 0.5 : 0.42) : 0.26, group: g });
    }
    if (st >= 0.35 && this.bar % 2 === 1 && s.energy <= 0.8) {
      const c = chords[chords.length - 1];
      const fifth = c.tones.includes(7) ? 7 : c.tones.includes(6) ? 6 : 7;
      for (const m of [c.root + 12, c.root + 12 + fifth, c.root + 24]) ev.push({ beat: 2, dur: 2, inst: 'swell', midi: m, vel: 0.3 + 0.35 * st, group: g });
    }
  }

  // ── story: the endings ────────────────────────────────────────────────────
  /** Bar 0 is an intro on the theme's first chord (under the ending's sting), then the eight bars loop. */
  private endingChords(id: EndingId): Chord[] {
    const d = ENDINGS[id];
    const i = this.endingBar === 0 ? 0 : (this.endingBar - 1) % d.chords.length;
    return [parseChord(d.chords[i])];
  }

  private endingEvents(ev: NoteEv[], s: Style, id: EndingId, chords: Chord[]): void {
    const g: Group = 'ending';
    const d = ENDINGS[id];
    const ch = chords[0];
    const intro = this.endingBar === 0;
    const bi = intro ? -1 : (this.endingBar - 1) % d.chords.length;
    const B = (step: number) => stepToBeat(step, s.swing);
    const v = voiceChord(ch, this.voicing);
    this.voicing = v;
    const fifth = ch.root + (ch.tones.includes(7) ? 7 : ch.tones[2] ?? 7);
    const melody = intro ? [] : d.melody[bi];
    const lead = (vel: number) => {
      for (const [step, len, midi] of melody) ev.push({ beat: B(step), dur: (len / 4) * 0.92, inst: 'lead', midi, vel, group: g });
    };

    if (id === 'saved') {
      if (intro) {
        // a brass swell on the tonic rising out of the sting, and the bass
        v.forEach((m) => ev.push({ beat: 0, dur: 4, inst: 'swell', midi: m, vel: 0.5, group: g }));
        ev.push({ beat: 0, dur: 3.5, inst: 'bass', midi: ch.root, vel: 0.55, group: g });
        return;
      }
      lead(0.52);
      for (const [step, len, midi] of melody) ev.push({ beat: B(step), dur: (len / 4) * 0.8, inst: 'glock', midi, vel: 0.3, group: g });
      // bouncy keys
      const pat: Pat = [[0, 2], [3, 2], [6, 3], [10, 2], [12, 3]];
      pat.forEach(([st, len], i) => (i ? v.slice(0, 3) : v).forEach((m, k) => ev.push({ beat: B(st) + k * 0.012, dur: len / 4, inst: 'keys', midi: m, vel: i ? 0.33 : 0.4, group: g })));
      // bass: root, fifth, root, octave, then a step into the next bar
      const nextRoot = parseChord(d.chords[(bi + 1) % d.chords.length]).root;
      ([[0, ch.root], [6, fifth], [8, ch.root], [10, ch.root + 12], [14, nextRoot - 1]] as const).forEach(([st, m], i) =>
        ev.push({ beat: B(st), dur: i === 0 ? 1.2 : 0.5, inst: 'bass', midi: m, vel: i === 0 ? 0.54 : 0.44, group: g }));
      // brushed kit: kick on 1 and 3, brush on 2 and 4, soft hats in eighths, a little fill every fourth bar
      for (const st of [0, 8]) ev.push({ beat: B(st), dur: 0.3, inst: 'kick', midi: 0, vel: 0.36, group: g });
      for (const b of [1, 3]) ev.push({ beat: b, dur: 0.5, inst: 'brush', midi: 0, vel: 0.55, group: g });
      for (let st = 0; st < 16; st += 2) ev.push({ beat: B(st), dur: 0.1, inst: 'hat', midi: 0, vel: st % 4 ? 0.18 : 0.26, group: g });
      if (bi % 4 === 3) for (const st of [13, 14, 15]) ev.push({ beat: B(st), dur: 0.1, inst: 'tick', midi: 0, vel: 0.3, group: g });
      // soft brass on the theme's first bar and its turnaround
      if (bi === 0 || bi === 4) v.slice(0, 3).forEach((m) => ev.push({ beat: 0, dur: 2, inst: 'brass', midi: m, vel: 0.42, group: g }));
      if (bi === 7) v.slice(0, 3).forEach((m) => ev.push({ beat: 2, dur: 2, inst: 'swell', midi: m, vel: 0.45, group: g }));
      return;
    }

    if (id === 'scraped') {
      v.forEach((m) => ev.push({ beat: 0, dur: 4, inst: 'pad', midi: m, vel: 0.26, group: g }));
      ev.push({ beat: 0, dur: 2.6, inst: 'bass', midi: ch.root, vel: 0.55, group: g });
      if (intro) return;
      lead(0.5);
      ([[0, 7], [10, 5]] as const).forEach(([st, len], i) => v.forEach((m, k) => ev.push({ beat: B(st) + k * 0.015, dur: len / 4, inst: 'keys', midi: m, vel: i ? 0.3 : 0.36, group: g })));
      ev.push({ beat: B(10), dur: 1, inst: 'bass', midi: this.rng() < 0.5 ? fifth : ch.root + 12, vel: 0.42, group: g });
      for (const b of [1, 3]) ev.push({ beat: b, dur: 0.5, inst: 'brush', midi: 0, vel: 0.32, group: g });
      // the minor iv, and the turnaround, sigh in soft brass
      if (bi === 3 || bi === 7) v.slice(0, 3).forEach((m) => ev.push({ beat: 0, dur: 3, inst: 'brass', midi: m, vel: 0.36, group: g }));
      return;
    }

    // closed: a pad and a long low bass note per bar, the lone tune, and a far bell every other bar
    v.forEach((m) => ev.push({ beat: 0, dur: 4, inst: 'pad', midi: m, vel: 0.32, group: g }));
    ev.push({ beat: 0, dur: 3.8, inst: 'bass', midi: ch.root, vel: 0.46, group: g });
    if (intro) return;
    lead(0.46);
    if (bi % 2 === 1) {
      const top = ch.root + 36 + ch.tones[Math.min(2, ch.tones.length - 1)];
      ev.push({ beat: 2.5, dur: 2, inst: 'bell', midi: top > 88 ? top - 12 : top, vel: 0.3, group: g });
    }
  }

  private chordAt(chords: Chord[], step: number): Chord {
    return chords.length > 1 && step >= 8 ? chords[1] : chords[0];
  }

  private office(ev: NoteEv[], s: Style, chords: Chord[], next: number | null): void {
    const g: Group = 'office';
    const e = s.energy;
    const sw = s.swing;
    const B = (step: number) => stepToBeat(step, sw);

    // keys
    const pat = e > 0.8 ? KEYS_FRANTIC : e > 0.4 ? this.pick(KEYS_BUSY) : s.evening > 0.6 && this.rng() < 0.5 ? KEYS_CALM[1] : this.pick(KEYS_CALM);
    const kv = (0.42 + e * 0.18) * (1 - s.evening * 0.3);
    pat.forEach(([st, len], i) => {
      const ch = this.chordAt(chords, st);
      const v = voiceChord(ch, this.voicing);
      this.voicing = v;
      const vel = kv * (i === 0 ? 1 : 0.82);
      // fast comping uses three-note shells: lighter on the CPU and less muddy
      (e > 0.4 && i > 0 ? v.slice(0, 3) : v).forEach((m, k) => ev.push({ beat: B(st) + k * 0.012, dur: len / 4, inst: 'keys', midi: m, vel, group: g }));
    });

    // bass
    const root = (st: number) => this.chordAt(chords, st).root;
    const fifth = (st: number) => { const c = this.chordAt(chords, st); return c.root + (c.tones.includes(7) ? 7 : c.tones[2] ?? 7); };
    const bv = 0.62;
    if (s.menu || s.evening > 0.85) {
      ev.push({ beat: 0, dur: 3.5, inst: 'bass', midi: root(0), vel: bv * 0.85, group: g });
    } else if (e < 0.35) {
      ev.push({ beat: 0, dur: 2.4, inst: 'bass', midi: root(0), vel: bv, group: g });
      ev.push({ beat: B(10), dur: 0.9, inst: 'bass', midi: this.rng() < 0.5 ? fifth(10) : root(10) + 12, vel: bv * 0.8, group: g });
      if (next !== null && this.rng() < 0.6) {
        const appr = next + (this.rng() < 0.5 ? -1 : 2);
        ev.push({ beat: B(14), dur: 0.45, inst: 'bass', midi: appr, vel: bv * 0.7, group: g });
      }
    } else {
      const steps = e > 0.8 ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 3, 6, 8, 10, 14];
      steps.forEach((st, i) => {
        const m = e > 0.8 ? root(st) + (i % 2 ? 12 : 0) : i === 3 ? fifth(st) : i === 5 && next !== null ? next - 1 : root(st);
        ev.push({ beat: B(st), dur: e > 0.8 ? 0.4 : 0.6, inst: 'bass', midi: m, vel: bv * (i === 0 ? 1 : 0.8), group: g });
      });
    }

    // drums (none on menu; thin out in the evening)
    if (!s.menu && s.evening < 0.85) {
      ev.push({ beat: 1, dur: 0.5, inst: 'brush', midi: 0, vel: 0.5, group: g });
      ev.push({ beat: 3, dur: 0.5, inst: 'brush', midi: 0, vel: 0.55, group: g });
      if (s.evening < 0.5) {
        if (e < 0.25) {
          for (let st = 0; st < 16; st += 2) ev.push({ beat: B(st), dur: 0.1, inst: 'tick', midi: 0, vel: st % 4 ? 0.16 : 0.24, group: g });
        } else {
          const stepBy = e > 0.8 ? 1 : 2;
          for (let st = 0; st < 16; st += stepBy) ev.push({ beat: B(st), dur: 0.1, inst: 'hat', midi: 0, vel: (st % 4 === 0 ? 0.32 : 0.2) * (0.8 + e * 0.4), group: g });
        }
      }
      if (e >= 0.5) {
        const kicks = e > 0.8 ? [0, 6, 8, 14] : this.rng() < 0.4 ? [0, 8, 10] : [0, 8];
        for (const st of kicks) ev.push({ beat: B(st), dur: 0.3, inst: 'kick', midi: 0, vel: 0.5 + e * 0.2, group: g });
        ev.push({ beat: 1, dur: 0.2, inst: 'rim', midi: 0, vel: 0.35, group: g });
        ev.push({ beat: 3, dur: 0.2, inst: 'rim', midi: 0, vel: 0.38, group: g });
      }
    }

    // ostinato
    if (e >= 0.5 && !s.menu) {
      const v = this.voicing ?? [60, 64, 67];
      const by = e > 0.8 ? 1 : 2;
      let k = 0;
      for (let st = 0; st < 16; st += by, k++) {
        const ch = this.chordAt(chords, st);
        const vv = st >= 8 && chords.length > 1 ? voiceChord(ch, v) : v;
        const idx = [0, 1, 2, 1, 3, 2, 1, 2][k % 8] % vv.length;
        ev.push({ beat: B(st), dur: by / 4 * 0.9, inst: 'pluck', midi: vv[idx] + 12, vel: 0.22 + e * 0.12, group: g });
      }
    }

    // under high stakes the tune steps back a little for the pulse and the clock
    this.melody(ev, s, chords, g, s.menu ? 0.4 : (0.35 + 0.45 * e) * (1 - 0.7 * s.evening) * (1 - 0.4 * s.stakes));
  }

  private melody(ev: NoteEv[], s: Style, chords: Chord[], g: Group, prob: number): void {
    // phrases are two bars long; decide at even bars
    const half = this.bar % 2;
    if (half === 0) {
      const slot = this.phraseCount % 4;
      this.phraseCount++;
      const busy = s.energy > 0.6;
      if (this.rng() > prob || (slot === 3 && this.rng() < 0.35)) this.phrase = null;
      else if (slot === 0 || !this.motifA) this.phrase = this.motifA = this.newMotif(busy);
      else if (slot === 1 || !this.motifB) this.phrase = this.motifB = this.newMotif(busy);
      else if (slot === 2) this.phrase = this.motifA;
      else this.phrase = this.vary(this.motifB);
    }
    if (!this.phrase) return;
    const reg = s.tension > 0.5 ? 2 : 0; // tense: a little higher
    for (const n of this.phrase.notes) {
      if (Math.floor(n.step / 16) !== half) continue;
      const st = n.step % 16;
      const ch = this.chordAt(chords, st);
      let m = this.degToMidi(n.deg + reg, ch);
      if (st % 8 === 0 || n === this.phrase.notes[this.phrase.notes.length - 1]) m = nearestChordTone(m, ch);
      ev.push({ beat: stepToBeat(st, s.swing), dur: n.len / 4 * 0.92, inst: 'lead', midi: m, vel: 0.38 + s.energy * 0.12, group: g });
    }
  }

  private newMotif(busy: boolean): Motif {
    const rhythm = busy && this.rng() < 0.6 ? RHYTHM_BUSY : this.pick(RHYTHMS);
    let deg = Math.floor(this.rng() * 5) + 2;
    const notes = rhythm.map(([step, len], i) => {
      if (i > 0) {
        const r = this.rng();
        deg += r < 0.3 ? -1 : r < 0.6 ? 1 : r < 0.75 ? -2 : r < 0.9 ? 2 : 0;
        deg = Math.max(0, Math.min(9, deg));
      }
      return { step, len, deg };
    });
    // phrase ends lower, settling
    notes[notes.length - 1].deg = Math.max(0, notes[notes.length - 1].deg - 1);
    return { notes };
  }

  private vary(m: Motif): Motif {
    return { notes: m.notes.map((n, i) => (i >= m.notes.length / 2 ? { ...n, deg: Math.max(0, Math.min(9, n.deg + this.pick([-1, 1, 2]))) } : n)) };
  }

  /** Scale degree (0 = C5 region) to midi over a chord. */
  private degToMidi(deg: number, ch: Chord): number {
    const sc = chordScale(ch); // F G A Bb C D E order
    // degree 0 = C5 (index 4 of the F scale)
    const idx = deg + 4;
    const oct = Math.floor(idx / 7);
    const pc = sc[idx % 7];
    let m = 65 + oct * 12 + ((pc - 5 + 12) % 12);
    if (m > 89) m -= 12;
    return m;
  }

  private disco(ev: NoteEv[], s: Style, chords: Chord[]): void {
    const g: Group = 'disco';
    for (let b = 0; b < 4; b++) ev.push({ beat: b, dur: 0.4, inst: 'kick', midi: 0, vel: 0.85, group: g });
    for (let b = 0; b < 4; b++) ev.push({ beat: b + 0.5, dur: 0.3, inst: 'ohat', midi: 0, vel: 0.42, group: g });
    if (s.energy > 0.55) for (let st = 1; st < 16; st += 2) ev.push({ beat: st / 4, dur: 0.1, inst: 'hat', midi: 0, vel: 0.14, group: g });
    ev.push({ beat: 1, dur: 0.3, inst: 'clap', midi: 0, vel: 0.6, group: g });
    ev.push({ beat: 3, dur: 0.3, inst: 'clap', midi: 0, vel: 0.6, group: g });
    // octave bass: low on the beat, high on the offbeat (the offbeat carries it)
    for (let st = 0; st < 16; st += 2) {
      const ch = this.chordAt(chords, st);
      const off = st % 4 === 2;
      ev.push({ beat: st / 4, dur: 0.4, inst: 'bass', midi: ch.root + (off ? 12 : 0), vel: off ? 0.72 : 0.5, group: g });
    }
    // stabs on the "and" of 2 and 4, sometimes an extra push
    const stabSteps = this.rng() < 0.5 ? [6, 14] : [6, 11, 14];
    for (const st of stabSteps) {
      const v = voiceChord(this.chordAt(chords, st), this.voicing, 60, 80);
      this.voicing = v;
      v.slice(0, 3).forEach((m) => ev.push({ beat: st / 4, dur: 0.35, inst: 'stab', midi: m, vel: 0.45, group: g }));
    }
    this.melody(ev, { ...s, swing: 0 }, chords, g, 0.55);
  }

  private drone(ev: NoteEv[], chords: Chord[]): void {
    const g: Group = 'drone';
    const r = chords[0].root;
    ev.push({ beat: 0, dur: 4, inst: 'drone', midi: r, vel: 0.5, group: g });
    ev.push({ beat: 0, dur: 4, inst: 'drone', midi: r + 7, vel: 0.3, group: g });
    if (this.rng() < 0.45) {
      const tones = chords[0].tones;
      const m = r + 36 + tones[Math.floor(this.rng() * tones.length)];
      ev.push({ beat: Math.floor(this.rng() * 6) / 2, dur: 2, inst: 'bell', midi: m > 88 ? m - 12 : m, vel: 0.35, group: g });
    }
  }

  private frozen(ev: NoteEv[], chords: Chord[]): void {
    const g: Group = 'frozen';
    const v = voiceChord(chords[0], this.voicing);
    ev.push({ beat: 0, dur: 4, inst: 'pad', midi: chords[0].root + 12, vel: 0.4, group: g });
    v.forEach((m) => ev.push({ beat: 0, dur: 4, inst: 'pad', midi: m, vel: 0.3, group: g }));
  }
}

export function nearestChordTone(m: number, ch: Chord): number {
  const pcs = ch.tones.map((i) => (ch.root + i) % 12);
  let best = m, bd = 99;
  for (let d = -3; d <= 3; d++) {
    if (pcs.includes(((m + d) % 12 + 12) % 12) && Math.abs(d) < bd) { bd = Math.abs(d); best = m + d; }
  }
  return best;
}
