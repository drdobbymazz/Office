// Small pixel art for the effects layer: emote icons, particle shapes, a pixel
// font. Drawn as rows of characters so every pixel is placed by hand, then
// outlined in the same ink the people use.

import type { Texture } from 'pixi.js';
import type { BurstKind, EmoteIcon } from '@/game/view/api';
import { INK, Pix, ascii, cachedTex, shade } from './pix';

// One palette for the hand-placed art, picked to sit with the office tiles and
// the cream interface (accents from design/tokens.ts, slightly deepened).
export const C = {
  ink: INK,
  white: 0xfffdf5,
  cream: 0xf4e9c7,
  red: 0xe84a4a,
  redD: 0xa82e3a,
  pink: 0xff86a8,
  pinkD: 0xd0507a,
  yellow: 0xffd93d,
  yellowD: 0xd99a26,
  orange: 0xff9a3c,
  blue: 0x5aa8f0,
  blueD: 0x2f6cc0,
  blueL: 0xb6e0ff,
  green: 0x5cc36e,
  greenD: 0x2f8a46,
  cash: 0x8fd17c,
  cashD: 0x4f9a52,
  purple: 0xb48cf0,
  purpleD: 0x7a52c0,
  grey: 0xb8b4c0,
  greyD: 0x847e92,
  greyL: 0xdedbe4,
  brown: 0x8a5a3a,
  brownL: 0xb98252,
  brownD: 0x5a3a26,
  mint: 0x6bcf7f,
  sky: 0x4ecdc4
} as const;

const P: Record<string, number> = {
  k: C.ink, w: C.white, c: C.cream, r: C.red, R: C.redD, p: C.pink, q: C.pinkD,
  y: C.yellow, Y: C.yellowD, o: C.orange, b: C.blue, B: C.blueD, l: C.blueL,
  g: C.green, G: C.greenD, m: C.cash, M: C.cashD, u: C.purple, U: C.purpleD,
  s: C.grey, S: C.greyD, a: C.greyL, n: C.brown, N: C.brownD, h: C.brownL
};

// ── emote icons ──────────────────────────────────────────────────────────────

const EMOTE_ROWS: Record<EmoteIcon, string[]> = {
  alert: [
    '.rr.',
    'rwrR',
    'rwrR',
    'rrrR',
    '.rR.',
    '.rR.',
    '....',
    '.rr.',
    '.RR.'
  ],
  question: [
    '.bbbb.',
    'blbbbB',
    'bb..bB',
    '...bbB',
    '..bbB.',
    '..bB..',
    '......',
    '..bb..',
    '..BB..'
  ],
  dots: [
    '.wwwwwwwww.',
    'wwwwwwwwwww',
    'wwkwwkwwkww',
    'wwwwwwwwwww',
    '.wwwwwwwwa.',
    '..wwa......',
    '.wa........'
  ],
  heart: [
    '.pp...pp.',
    'pwpp.pppp',
    'pwppppppq',
    'pppppppqq',
    '.pppppqq.',
    '..ppppq..',
    '...ppq...',
    '....q....'
  ],
  brokenHeart: [
    '.pp....pp.',
    'pwpp..pppp',
    'pwppp.pppq',
    'pppp.ppppq',
    '.ppp.pppq.',
    '..ppp.pq..',
    '...pp.q...',
    '....p.....'
  ],
  anger: [
    '.rr.rr.',
    'rR...Rr',
    'r.....r',
    '.......',
    'r.....r',
    'rR...Rr',
    '.rr.rr.'
  ],
  sweat: [
    '...b..',
    '..bb..',
    '.blbb.',
    'blbbbB',
    'blbbbB',
    'bbbbBB',
    '.BBBB.'
  ],
  idea: [
    '..yyy..',
    '.ywyyy.',
    'ywwyyyY',
    'ywyyyyY',
    'yyyyyYY',
    '.yyyYY.',
    '..yYY..',
    '..sss..',
    '..SSS..',
    '...S...'
  ],
  music: [
    '...uuuuu',
    '...uUUUu',
    '...u...u',
    '...u...u',
    '.uuu.uuu',
    'uuuu.uuu',
    'uuU.uuuU'
  ],
  zzz: [
    'lllll...',
    '...l....',
    '..l.....',
    '.l..lll.',
    'lllll.l.',
    '.....l..',
    '....lll.'
  ],
  skull: [
    '.wwwwww.',
    'wwwwwwwa',
    'wkkwwkka',
    'wkkwwkka',
    'wwwkwwwa',
    '.wwwwwa.',
    '.wkwkwa.'
  ],
  star: [
    '....y....',
    '...ywy...',
    '...ywy...',
    'yyyywyyyy',
    '.yyyyyyY.',
    '..yyyyY..',
    '.yyyYyyY.',
    '.yYY.YYY.',
    '.Y.....Y.'
  ],
  eye: [
    '..wwwww..',
    '.wwbbbww.',
    'wwbbkbbwa',
    'wwbkkkbwa',
    'wwbbkbbwa',
    '.wwbbbwa.',
    '..aaaaa..'
  ],
  money: [
    '..g..',
    '.ggg.',
    'g.g.G',
    '.ggg.',
    '..g.g',
    'G.g.g',
    '.ggG.',
    '..G..'
  ],
  no: [
    'rr...rr',
    'rrr.rrR',
    '.rrrrR.',
    '..rrR..',
    '.rrrrr.',
    'rrR.rrr',
    'rR...rR'
  ],
  yes: [
    '......gg',
    '.....ggG',
    'gg..ggG.',
    'GggggG..',
    '.GggG...',
    '..GG....'
  ],
  laugh: [
    '..yyyyy..',
    '.yyyyyyy.',
    'yykyyykyy',
    'ykykykyky',
    'yyyyyyyyY',
    'yRRRRRRRY',
    '.yRrrrRY.',
    '..yRRRY..',
    '...YYY...'
  ],
  tear: [
    '..yyyyy..',
    '.yyyyyyy.',
    'ykkyyykky',
    'ylyyyylyy',
    'ylyyyylyY',
    'ylykkkylY',
    'ylYyyyYlY',
    '.l.YYY.l.',
    '.l.....l.'
  ],
  fire: [
    '...r....',
    '..rr..r.',
    '..ror.rr',
    '.royorr.',
    '.royyor.',
    'royywyor',
    'royywyor',
    '.royyor.',
    '..rrrr..'
  ],
  coffee: [
    '.a..a...',
    '..a..a..',
    '.a..a...',
    'wwwwwww.',
    'wnnnnnwkk',
    'wwwwwwwk.k',
    'awwwwwwkk',
    '.aaaaa...'
  ],
  paper: [
    'wwwwa.',
    'wkkwwa',
    'wwwwww',
    'wkkkkw',
    'wwwwww',
    'wkkkkw',
    'wwwwww',
    'wkkkwa',
    'aaaaaa'
  ]
};

export const EMOTE_ICONS = Object.keys(EMOTE_ROWS) as EmoteIcon[];

export function emoteTex(icon: EmoteIcon): Texture {
  return cachedTex('emote:' + icon, () => ascii(EMOTE_ROWS[icon] ?? EMOTE_ROWS.question, P));
}

// ── particle shapes ──────────────────────────────────────────────────────────

const SHAPES: Record<string, string[]> = {
  heart: ['.p.p.', 'ppppp', 'qpppq', '.qpq.', '..q..'],
  heartTiny: ['p.p', 'ppp', '.q.'],
  star: ['..y..', '.yyy.', 'yywyy', '.yYy.', '.Y.Y.'],
  note: ['.uuu', '.u.u', '.u.u', 'uu.u', 'uuuu', '..uu'],
  noteB: ['.u..', '.uu.', '.u.u', '.u..', 'uu..', 'uu..'],
  z: ['lll', '.l.', 'lll'],
  zBig: ['llll', '..l.', '.l..', 'llll'],
  sweat: ['.b.', 'blb', 'bbB', '.B.'],
  tear: ['l', 'b', 'B'],
  anger: ['r.r', '...', 'r.r'],
  angerBig: ['.r.r.', 'rR.Rr', '.....', 'rR.Rr', '.r.r.'],
  skull: ['.www.', 'wkwkw', 'wwwww', '.wkw.'],
  feather: ['....ww', '.wwwa.', 'wwaa..', 'a.....'],
  featherB: ['ww....', '.awww.', '..aaww', '.....a'],
  bubble: ['.ll.', 'lw.l', 'l..l', '.ll.'],
  bubblePop: ['l..l', '....', '....', 'l..l'],
  coin0: ['.yy.', 'yywY', 'yyyY', '.YY.'],
  coin1: ['.y.', 'ywY', 'yyY', '.Y.'],
  coin2: ['y', 'Y', 'Y', 'Y'],
  cash0: ['mmmmm', 'mMwMm', 'mmmmm'],
  cash1: ['mmmm', 'mMMm', 'mmmm'],
  cash2: ['mmmmm', 'MMMMM'],
  paper0: ['wwwa', 'wssw', 'wwww', 'wssw', 'aaaa'],
  paper1: ['wwwa', 'wssw', 'aaaa'],
  paper2: ['wwww'],
  chips: ['.rr.', 'ryyr', 'ryyr', 'rrrr', '.RR.'],
  chipsB: ['.bb.', 'bwwb', 'bwwb', 'bbbb', '.BB.'],
  candy: ['nnnnn', 'NhhhN'],
  donut: ['.pp.', 'pnnp', 'pnnp', '.hh.'],
  soda: ['ss', 'rr', 'rw', 'RR'],
  pencil: ['yyyyhk'],
  pencilV: ['k', 'h', 'y', 'y', 'y', 'y'],
  stapler: ['.ss..', 'rrrrr', 'SSSSS'],
  mug: ['wwwk', 'wnwk', 'wwww', 'aaa.'],
  clip: ['sss', 's.s', 'ss.'],
  crumb: ['h'],
  crumbB: ['hN'],
  drop: ['l', 'b'],
  debris: ['sa', 'Ss'],
  debrisB: ['nh', 'Nn'],
  spark: ['w'],
  streak: ['y', 'w', 'y'],
  slice: ['yyyy', 'yryh', '.yyh', '..h.'],
  eye0: ['.www.', 'wkwww', '.www.'],
  eye1: ['.www.', 'wwkww', '.www.'],
  eye2: ['.www.', 'wwwkw', '.www.'],
  speed: ['wwww'],
  speedS: ['www'],
  zig: ['y.', '.y', 'y.']
};

export function shapePix(name: string, outline = false): Pix {
  return ascii(SHAPES[name] ?? SHAPES.spark, P, outline ? INK : null);
}

export function shapeTex(name: string, outline = false): Texture {
  return cachedTex('shape:' + name + (outline ? ':o' : ''), () => ascii(SHAPES[name] ?? SHAPES.spark, P, outline ? INK : null));
}

export function squareTex(size: number): Texture {
  return cachedTex('sq:' + size, () => new Pix(size, size).rect(0, 0, size, size, 0xffffff));
}

/** A plus-shaped twinkle, frames grow 1 → 3 → 5 → 3. White, tint it. */
export function sparkleFrames(): Texture[] {
  const out: Texture[] = [];
  const sizes = [0, 1, 2, 1];
  for (let i = 0; i < sizes.length; i++) {
    out.push(cachedTex('sparkle:' + i, () => {
      const r = sizes[i];
      const p = new Pix(5, 5);
      for (let d = -r; d <= r; d++) { p.set(2 + d, 2, 0xffffff); p.set(2, 2 + d, 0xffffff); }
      if (r === 2) { p.set(2, 2, 0xffffff); }
      return p;
    }));
  }
  return out;
}

/** A gold version of the twinkle, with a warm rim. */
export function goldSparkleFrames(): Texture[] {
  const out: Texture[] = [];
  const sizes = [0, 1, 2, 1];
  for (let i = 0; i < sizes.length; i++) {
    out.push(cachedTex('gsparkle:' + i, () => {
      const r = sizes[i];
      const p = new Pix(5, 5);
      for (let d = -r; d <= r; d++) { p.set(2 + d, 2, Math.abs(d) === r && r > 0 ? C.yellowD : C.yellow); p.set(2, 2 + d, Math.abs(d) === r && r > 0 ? C.yellowD : C.yellow); }
      p.set(2, 2, 0xffffff);
      return p;
    }));
  }
  return out;
}

export function framesOf(names: string[], outline = false): Texture[] {
  return names.map((n) => shapeTex(n, outline));
}

/** Confetti: a little rectangle that tumbles (2x1, 1x1, 1x2). White, tint it. */
export function confettiFrames(): Texture[] {
  return [
    cachedTex('conf0', () => new Pix(2, 1).rect(0, 0, 2, 1, 0xffffff)),
    cachedTex('conf1', () => new Pix(1, 1).rect(0, 0, 1, 1, 0xffffff)),
    cachedTex('conf2', () => new Pix(1, 2).rect(0, 0, 1, 2, 0xffffff)),
    cachedTex('conf1', () => new Pix(1, 1))
  ];
}

export const CONFETTI_TINTS = [C.red, C.yellow, C.blue, C.green, C.pink, C.purple, C.orange, C.sky];

// ── burst recipes: which shapes a burst throws and how they move ────────────

export interface BurstStyle {
  frames: string[] | 'confetti' | 'sparkle' | 'square';
  tints?: number[];
  /** 'pop' throws up and out with gravity; 'rise' floats up; 'fall' drops; 'ring' spreads flat. */
  motion: 'pop' | 'rise' | 'fall' | 'ring' | 'flutter';
  count: number;
  speed: number;
  life: number;
  outline?: boolean;
  still?: boolean;
  fps?: number;
}

export const BURSTS: Record<BurstKind, BurstStyle> = {
  confetti: { frames: 'confetti', tints: CONFETTI_TINTS, motion: 'flutter', count: 26, speed: 70, life: 2.2, fps: 10 },
  hearts: { frames: ['heart'], motion: 'rise', count: 8, speed: 26, life: 1.6, outline: true },
  stars: { frames: ['star'], motion: 'pop', count: 8, speed: 60, life: 1.0, outline: true },
  cash: { frames: ['cash0', 'cash1', 'cash2', 'cash1'], motion: 'flutter', count: 14, speed: 60, life: 2.6, outline: true, fps: 8 },
  paper: { frames: ['paper0', 'paper1', 'paper2', 'paper1'], motion: 'flutter', count: 12, speed: 60, life: 2.6, outline: true, fps: 7 },
  feathers: { frames: ['feather', 'featherB'], motion: 'flutter', count: 10, speed: 40, life: 2.4, fps: 3 },
  bubbles: { frames: ['bubble'], motion: 'rise', count: 10, speed: 20, life: 1.6 },
  notes: { frames: ['note', 'noteB'], motion: 'rise', count: 6, speed: 22, life: 1.6, outline: true, still: true },
  sweat: { frames: ['sweat'], motion: 'pop', count: 6, speed: 45, life: 0.8 },
  tears: { frames: ['tear'], motion: 'pop', count: 8, speed: 35, life: 0.9 },
  anger: { frames: ['angerBig'], motion: 'pop', count: 4, speed: 30, life: 0.8, outline: true },
  zzz: { frames: ['zBig', 'z'], motion: 'rise', count: 4, speed: 14, life: 2.0, outline: true, still: true },
  skulls: { frames: ['skull'], motion: 'rise', count: 5, speed: 22, life: 1.4, outline: true },
  sparkles: { frames: 'sparkle', tints: [0xffffff, C.yellow, C.blueL], motion: 'pop', count: 12, speed: 40, life: 0.9, fps: 10 },
  dust: { frames: 'square', tints: [0xd8ccb4, 0xbfb29a, 0xe8e0cc], motion: 'ring', count: 14, speed: 40, life: 0.7 },
  crumbs: { frames: ['crumb', 'crumbB'], motion: 'pop', count: 12, speed: 45, life: 1.6, still: true },
  water: { frames: ['drop'], motion: 'pop', count: 14, speed: 55, life: 1.0 },
  snacks: { frames: ['chips', 'chipsB', 'candy', 'donut', 'soda'], motion: 'pop', count: 10, speed: 70, life: 3.0, outline: true, still: true }
};

// ── a 3 x 5 pixel font for floating text ────────────────────────────────────

const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001110',
  '!': '010010010000010', '?': '110001010000010', '.': '000000000000010', ',': '000000000010100',
  '+': '000010111010000', '-': '000000111000000', '$': '011110010011110', ':': '000010000010000',
  "'": '010010000000000', '%': '101001010100101', '/': '001001010100100', '#': '101111101111101',
  '(': '010100100100010', ')': '010001001001010', '&': '010101010101011', '*': '000101010101000',
  ' ': '000000000000000'
};

/** Text drawn in the 3x5 font, coloured, with an ink outline. */
export function textPix(text: string, color: number): Pix {
  const s = text.toUpperCase().slice(0, 28);
  const w = Math.max(1, s.length * 4 - 1) + 2;
  const p = new Pix(w, 7);
  const hi = shade(color, 1.25);
  for (let i = 0; i < s.length; i++) {
    const g = FONT[s[i]] ?? FONT['?'];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (g[r * 3 + c] === '1') p.set(1 + i * 4 + c, 1 + r, r === 0 ? hi : color);
    }
  }
  return p.outline(INK, true);
}
