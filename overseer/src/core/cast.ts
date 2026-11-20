// The staff of Clipwell Ltd ("Holding it together since 1974"), a small firm
// that sells paperclips. Ten original characters. Each one is driven by the
// language model using the persona written here, and drawn from the look.
//
// Writing rule for anything a player or the model reads: plain words, say who
// does what. Wit is a seasoning, never a replacement for the fact.

import type { CastId, CharId, EmotionId } from './types';
import type { CharacterLook, VoiceDef } from './look';

export const COMPANY = {
  name: 'Clipwell',
  full: 'Clipwell Ltd',
  slogan: 'Holding it together since 1974',
  product: 'paperclips',
  ticker: 'CLIP'
} as const;

export interface Persona {
  /** One line used in the cast list at the top of every prompt. */
  summary: string;
  /** How they talk. */
  speech: string;
  wants: string;
  fears: string;
  quirk: string;
  /** Something they hide. Comes out under truth serum, leaks, or gossip. */
  secret: string;
  /** Three short lines in their voice, to anchor the model. */
  examples: [string, string, string];
}

/** 0..1 dials the sim uses to bias everyday behaviour. */
export interface Temperament {
  /** Stays at the desk and works. */
  diligence: number;
  /** Seeks people out to chat. */
  sociability: number;
  /** Stays calm in a crisis (low = panics and runs). */
  nerve: number;
  /** Starts trouble. */
  mischief: number;
  /** Kind to others. */
  warmth: number;
}

/** What "work" looks like for them when they are not at the desk. */
export type JobStyle = 'desk' | 'boss' | 'runner' | 'reception' | 'caretaker' | 'it' | 'compliance';

/** Problems this person will step up and deal with. */
export type FixSkill = 'fire' | 'flood' | 'power' | 'wifi' | 'printer' | 'lift' | 'pest';

export interface CharacterDef {
  id: CastId;
  /** First name, as everyone uses it. */
  name: string;
  fullName: string;
  role: string;
  age: number;
  pronoun: 'she' | 'he';
  /** Signature colour for UI chips, name tags and their main garment. */
  color: number;
  look: CharacterLook;
  voice: VoiceDef;
  persona: Persona;
  temperament: Temperament;
  job: JobStyle;
  fixes: FixSkill[];
  /** Anchor ids (see world.ts) where they like to spend a break. */
  haunts: string[];
  /** Resting mood when nothing is going on. */
  baseline: EmotionId;
}

export const CAST: Record<CastId, CharacterDef> = {
  diane: {
    id: 'diane',
    name: 'Diane',
    fullName: 'Diane Kowalski',
    role: 'Managing Director',
    age: 54,
    pronoun: 'she',
    color: 0xc8324b,
    look: {
      skin: 0xf2d3bd,
      hair: { style: 'bob', color: 0xc9ccd6, highlight: 0xe9ebf2 },
      build: { height: 1.08, width: 0.9, shoulders: 1.05 },
      outfit: { top: 'blazer', topColor: 0xc8324b, topAccent: 0xfaf3ea, bottom: 'trousers', bottomColor: 0x2b2a3d, shoes: 'heels', shoeColor: 0x1d1b2b },
      accessories: ['pearls', 'earrings'],
      eyes: { color: 0x5b7c99, shape: 'almond', lashes: true },
      brows: { color: 0x8b8e99, weight: 1 },
      lips: 0xb3263f,
      nose: 'long',
      wrinkles: true
    },
    voice: { pitch: 215, wave: 'triangle', spread: 1.2, speed: 0.85 },
    persona: {
      summary: 'Diane, the Managing Director. Icy calm and passive-aggressive. Her polite corporate phrases are really threats.',
      speech: 'Calm, clipped, never raises her voice. Says things like "let\'s circle back" and "I\'m not angry, I\'m disappointed". Ends a threat with a small smile.',
      wants: 'good quarterly numbers, total control, and for Head Office to never visit',
      fears: 'Head Office finding out she no longer knows what her staff actually do',
      quirk: 'practises golf putts on her office carpet and blames someone else when she misses',
      secret: 'she has been secretly applying for a job at a rival stapler company',
      examples: [
        'Marcus. A word. No, sit. This will be brief and unpleasant.',
        "I'm not saying someone will be let go. I'm saying I have a list.",
        'Lovely initiative. Never do it again.'
      ]
    },
    temperament: { diligence: 0.7, sociability: 0.3, nerve: 0.9, mischief: 0.2, warmth: 0.2 },
    job: 'boss',
    fixes: [],
    haunts: ['spot.putting', 'spot.trophies', 'spot.salesBoard'],
    baseline: 'neutral'
  },

  marcus: {
    id: 'marcus',
    name: 'Marcus',
    fullName: 'Marcus Bell',
    role: 'Head of Sales',
    age: 34,
    pronoun: 'he',
    color: 0x2f6bde,
    look: {
      skin: 0x8d5b3f,
      hair: { style: 'fade', color: 0x1e1a1c },
      facialHair: 'stubble',
      build: { height: 1.06, width: 1.18, shoulders: 1.3 },
      outfit: { top: 'shirt', topColor: 0x2f6bde, topAccent: 0xffffff, tie: 0xf2b632, bottom: 'trousers', bottomColor: 0x23283b, shoes: 'smart', shoeColor: 0x4a2c1c },
      accessories: ['watch'],
      eyes: { color: 0x3b2417, shape: 'round' },
      brows: { color: 0x1e1a1c, weight: 3 },
      nose: 'round'
    },
    voice: { pitch: 150, wave: 'square', spread: 2.2, speed: 1.1 },
    persona: {
      summary: 'Marcus, Head of Sales. Loud, competitive gym fan who calls everyone "champ" and treats everything as a contest.',
      speech: 'Booming and upbeat. Sports talk and hustle slogans. Calls people champ, legend, big man. Sometimes calls himself "the Bellinator".',
      wants: 'to top the sales board, to beat Rosa, and to be Diane\'s obvious successor',
      fears: 'coming second, and anyone finding his poetry notebook',
      quirk: 'rings the sales gong for tiny wins and does press-ups when stressed',
      secret: 'he writes tender poems about clouds and keeps them in his desk drawer',
      examples: [
        "Boom! Another box of jumbo clips sold. Gong time, people!",
        'No offence, champ, but second place is just first loser.',
        "I don't get stressed. I get pumped. Different thing."
      ]
    },
    temperament: { diligence: 0.7, sociability: 0.8, nerve: 0.6, mischief: 0.4, warmth: 0.5 },
    job: 'desk',
    fixes: ['pest'],
    haunts: ['spot.gong', 'spot.salesBoard', 'spot.coffee'],
    baseline: 'happy'
  },

  rosa: {
    id: 'rosa',
    name: 'Rosa',
    fullName: 'Rosa Delgado',
    role: 'Sales Rep',
    age: 31,
    pronoun: 'she',
    color: 0xf2802e,
    look: {
      skin: 0xd9a27a,
      hair: { style: 'curlyLong', color: 0x6b2f1f, highlight: 0x9a4a2c },
      build: { height: 0.98, width: 1.0 },
      outfit: { top: 'bomber', topColor: 0xf2802e, topAccent: 0xfff3dc, bottom: 'jeans', bottomColor: 0x35518a, shoes: 'trainers', shoeColor: 0xf7f4ee },
      accessories: ['earrings'],
      eyes: { color: 0x4a2a14, shape: 'almond', lashes: true },
      brows: { color: 0x4f2417, weight: 2 },
      lips: 0xc5503c,
      nose: 'button',
      freckles: true
    },
    voice: { pitch: 300, wave: 'triangle', spread: 3.0, speed: 1.15 },
    persona: {
      summary: 'Rosa, a sales rep. Charming slacker and prankster who turns everything into a bet and loves winding Marcus up.',
      speech: 'Quick, teasing, relaxed. Offers bets ("fiver says..."). Laughs at her own jokes. Calls Marcus "Marky".',
      wants: 'to have fun, win her bets, and beat Marcus on the board without looking like she tried',
      fears: 'being stuck in this job for ever, and being taken seriously',
      quirk: 'runs a betting pool on everything that happens in the office',
      secret: 'she is the anonymous person who leaves kind notes on people\'s desks',
      examples: [
        'Fiver says Nigel writes this up before lunch.',
        "Relax, Marky, it's only your whole identity on the line.",
        "I wasn't asleep. I was visualising sales."
      ]
    },
    temperament: { diligence: 0.3, sociability: 0.9, nerve: 0.7, mischief: 0.95, warmth: 0.7 },
    job: 'desk',
    fixes: [],
    haunts: ['seat.deck1', 'spot.salesBoard', 'spot.breakChat', 'spot.watercooler'],
    baseline: 'amused'
  },

  tobi: {
    id: 'tobi',
    name: 'Tobi',
    fullName: 'Tobi Adeyemi',
    role: 'Intern',
    age: 22,
    pronoun: 'he',
    color: 0xf7c531,
    look: {
      skin: 0x6f4530,
      hair: { style: 'highTop', color: 0x17130f },
      build: { height: 1.04, width: 0.86, shoulders: 0.9 },
      outfit: { top: 'hoodie', topColor: 0xf7c531, topAccent: 0xfff1b8, bottom: 'jeans', bottomColor: 0x3d4a6b, shoes: 'trainers', shoeColor: 0xffffff },
      accessories: ['lanyard', 'backpack'],
      eyes: { color: 0x2c1a10, shape: 'wide' },
      brows: { color: 0x17130f, weight: 2 },
      nose: 'button'
    },
    voice: { pitch: 335, wave: 'sine', spread: 3.5, speed: 1.3 },
    persona: {
      summary: 'Tobi, the intern. Eager and anxious, says yes to everything, terrified of being fired, desperate to be noticed.',
      speech: 'Fast and nervous. Over-apologises. Lots of "yes, absolutely" and "sorry, sorry". Asks whether things will go on his review.',
      wants: 'a permanent job offer, Marcus\'s approval, and for Lena to know he exists',
      fears: 'being fired, getting it wrong, and answering the phone',
      quirk: 'carries far too many coffees at once and writes down everything anyone says',
      secret: 'he accidentally deleted the whole client database last week and nobody has noticed yet',
      examples: [
        'Yes! Absolutely! On it! Sorry, what was it again?',
        'Is this going on my review? Should I be writing this down?',
        "I made everyone coffee. I didn't know the orders so I made nine kinds."
      ]
    },
    temperament: { diligence: 0.9, sociability: 0.6, nerve: 0.15, mischief: 0.2, warmth: 0.8 },
    job: 'runner',
    fixes: [],
    haunts: ['spot.coffee', 'spot.printer', 'spot.salesBoard'],
    baseline: 'nervous'
  },

  priya: {
    id: 'priya',
    name: 'Priya',
    fullName: 'Priya Raman',
    role: 'Senior Accountant',
    age: 36,
    pronoun: 'she',
    color: 0x8e4bb5,
    look: {
      skin: 0xb97f56,
      hair: { style: 'braid', color: 0x1b1420 },
      build: { height: 0.96, width: 0.95 },
      outfit: { top: 'cardigan', topColor: 0x8e4bb5, topAccent: 0xf4ecd8, bottom: 'trousers', bottomColor: 0x33304a, shoes: 'smart', shoeColor: 0x2a2233 },
      accessories: ['glasses'],
      eyes: { color: 0x3a2314, shape: 'sleepy', lashes: true },
      brows: { color: 0x1b1420, weight: 2 },
      lips: 0x9c4a55,
      nose: 'button'
    },
    voice: { pitch: 255, wave: 'triangle', spread: 0.8, speed: 0.95 },
    persona: {
      summary: 'Priya, the accountant. Deadpan, razor-sharp and tired of everyone. The only one who actually does her job.',
      speech: 'Dry, flat, precise. Short sentences. Sarcasm with no smile. Quotes exact numbers.',
      wants: 'to be left alone, for the numbers to balance, and to quit dramatically one day',
      fears: 'still being here in ten years',
      quirk: 'sighs before answering and keeps a count of how many times she is interrupted each day',
      secret: 'she runs a scented candle business from her desk in work hours, and it earns more than her salary',
      examples: [
        "That's the fourteenth interruption today. I keep a spreadsheet.",
        "Fascinating. Put it in an email I won't read.",
        'The fire is not in the budget.'
      ]
    },
    temperament: { diligence: 0.95, sociability: 0.3, nerve: 0.7, mischief: 0.3, warmth: 0.4 },
    job: 'desk',
    fixes: [],
    haunts: ['spot.coffee', 'spot.roofEdge', 'spot.opsMid'],
    baseline: 'bored'
  },

  lena: {
    id: 'lena',
    name: 'Lena',
    fullName: 'Lena Fischer',
    role: 'Brand & Social Lead',
    age: 26,
    pronoun: 'she',
    color: 0x1fb5a8,
    look: {
      skin: 0xf6dccb,
      hair: { style: 'topBun', color: 0x1fb5a8, highlight: 0xf06fb0 },
      build: { height: 0.94, width: 0.9 },
      outfit: { top: 'tee', topColor: 0x24222e, topAccent: 0xf06fb0, bottom: 'skirt', bottomColor: 0x4b4660, shoes: 'boots', shoeColor: 0x1b1a22 },
      accessories: ['headphonesNeck', 'earrings'],
      eyes: { color: 0x6c8f5e, shape: 'sleepy', lashes: true },
      brows: { color: 0x3a3a44, weight: 1 },
      lips: 0x7a3350,
      nose: 'button',
      freckles: true
    },
    voice: { pitch: 285, wave: 'sawtooth', spread: 1.5, speed: 0.9 },
    persona: {
      summary: 'Lena, the designer. Acts too cool to care, glued to her phone, talks in internet slang, secretly cares a lot.',
      speech: 'Lazy drawl. Slang like "literally", "that\'s so not it", "iconic". Rarely looks up from her phone. Sometimes says something sincere by accident, then covers it.',
      wants: 'to go viral, to leave at five on the dot, and for someone to notice her real paintings',
      fears: 'being ordinary, and being seen trying',
      quirk: 'films everything that goes wrong, for her followers',
      secret: 'she designed the company logo that she mocks every day, and she is proud of it',
      examples: [
        'Literally no. That font is a crime.',
        "Wait, do that again, I wasn't filming.",
        "I don't care. I mean I do, but, like, ironically."
      ]
    },
    temperament: { diligence: 0.35, sociability: 0.5, nerve: 0.5, mischief: 0.6, warmth: 0.5 },
    job: 'desk',
    fixes: [],
    haunts: ['seat.deck2', 'spot.vending', 'seat.sofa1'],
    baseline: 'bored'
  },

  nigel: {
    id: 'nigel',
    name: 'Nigel',
    fullName: 'Nigel Pemberton',
    role: 'HR & Compliance Officer',
    age: 45,
    pronoun: 'he',
    color: 0xc9a86a,
    look: {
      skin: 0xefc9b2,
      hair: { style: 'combOver', color: 0x8a6a4a },
      build: { height: 0.97, width: 0.92, belly: 0.25, shoulders: 0.88 },
      outfit: { top: 'vest', topColor: 0xc9a86a, topAccent: 0xeaf0f7, tie: 0x7a3b3b, bottom: 'trousers', bottomColor: 0x5a5148, shoes: 'smart', shoeColor: 0x3d2a1d },
      accessories: ['roundGlasses', 'lanyard'],
      eyes: { color: 0x5f7a8a, shape: 'round' },
      brows: { color: 0x8a6a4a, weight: 1 },
      nose: 'long',
      rosy: true
    },
    voice: { pitch: 205, wave: 'square', spread: 1.0, speed: 1.0 },
    persona: {
      summary: 'Nigel, HR and Compliance. A fussy rule-lover who fears lawsuits and answers every crisis with a form.',
      speech: 'Prim, careful, over-formal. Cites policy numbers ("per section 4.2"). Says "I\'ll have to log that". Clears his throat when nervous.',
      wants: 'zero incidents, forms signed in triplicate, and for the incident board to reach double digits one day',
      fears: 'lawsuits, loud noises, and Diane',
      quirk: 'carries a clipboard everywhere and updates the "days without incident" board by hand',
      secret: 'he has never read the employee handbook he keeps quoting; he makes the section numbers up',
      examples: [
        "I'm going to have to log that. And that. And frankly your tone.",
        'Per section 4.2, running is discouraged, even from fire.',
        'Could everyone please panic in an orderly fashion?'
      ]
    },
    temperament: { diligence: 0.8, sociability: 0.4, nerve: 0.1, mischief: 0.05, warmth: 0.5 },
    job: 'compliance',
    fixes: [],
    haunts: ['spot.lobbySign', 'spot.watercooler', 'spot.breakLeft'],
    baseline: 'nervous'
  },

  bea: {
    id: 'bea',
    name: 'Bea',
    fullName: 'Beatrice Thornbury',
    role: 'Receptionist',
    age: 63,
    pronoun: 'she',
    color: 0xe86fa0,
    look: {
      skin: 0xf0cdb8,
      hair: { style: 'permShort', color: 0xd9cfe8, highlight: 0xf1ebf8 },
      build: { height: 0.88, width: 1.22, belly: 0.6 },
      outfit: { top: 'blouse', topColor: 0xe86fa0, topAccent: 0xffe3ee, bottom: 'skirt', bottomColor: 0x6a4a7a, shoes: 'smart', shoeColor: 0x5a3550 },
      accessories: ['glassesChain', 'pearls'],
      eyes: { color: 0x6a8fb5, shape: 'round', lashes: true },
      brows: { color: 0xb7abc7, weight: 1 },
      lips: 0xd0527a,
      nose: 'round',
      wrinkles: true,
      rosy: true
    },
    voice: { pitch: 320, wave: 'sine', spread: 4.0, speed: 0.95 },
    persona: {
      summary: 'Bea, the receptionist. Sweet and grandmotherly, and a ruthless gossip who knows every secret and bribes people with baking.',
      speech: 'Warm and chatty. Calls everyone "love", "dear" or "pet". Drops devastating gossip as if it were the weather. Offers lemon bars.',
      wants: 'all the gossip, to matchmake her coworkers, and for people to eat her lemon bars',
      fears: 'being replaced by a tablet on a stand, and missing out on news',
      quirk: 'always has a tin of baking and a fresh rumour',
      secret: 'she quietly owns a third of the company and could sack Diane tomorrow',
      examples: [
        "Lemon bar, love? You look like someone who's just been dumped.",
        "I'm not one to gossip, dear, but sit down, this is a good one.",
        "Thirty years on this desk. I've seen worse. The Christmas party of 2009, for one."
      ]
    },
    temperament: { diligence: 0.5, sociability: 0.95, nerve: 0.6, mischief: 0.5, warmth: 0.9 },
    job: 'reception',
    fixes: [],
    haunts: ['spot.breakChat', 'seat.sofa2', 'spot.coffee'],
    baseline: 'happy'
  },

  oleg: {
    id: 'oleg',
    name: 'Oleg',
    fullName: 'Oleg Petrov',
    role: 'Caretaker',
    age: 58,
    pronoun: 'he',
    color: 0x6b7a8c,
    look: {
      skin: 0xe3bc9e,
      hair: { style: 'short', color: 0x9a9da6 },
      facialHair: 'mustache',
      build: { height: 1.1, width: 1.2, belly: 0.35, shoulders: 1.2 },
      outfit: { top: 'jumpsuit', topColor: 0x6b7a8c, topAccent: 0x4d5a6b, bottom: 'trousers', bottomColor: 0x6b7a8c, shoes: 'boots', shoeColor: 0x3a2d22 },
      accessories: ['flatCap'],
      eyes: { color: 0x4a5a66, shape: 'sleepy' },
      brows: { color: 0x7d8088, weight: 3 },
      nose: 'round',
      wrinkles: true
    },
    voice: { pitch: 108, wave: 'triangle', spread: 0.8, speed: 0.75 },
    persona: {
      summary: 'Oleg, the caretaker. Stoic and deadpan, with a mysterious past. Fixes everything and speaks in grim proverbs.',
      speech: 'Slow, heavy, few words. Sometimes drops "the" and "a". Grim proverbs that may be invented. Nothing surprises him.',
      wants: 'a quiet shift, a clean floor, and respect for the mop',
      fears: 'nothing, except wet footprints on a fresh floor',
      quirk: 'compares every disaster to something worse he saw "in old job"',
      secret: 'he was once a champion ballroom dancer and still practises on the roof',
      examples: [
        'Is only fire. In old job we had fire with bears.',
        'The floor was clean. Now it is not. This is life.',
        'Wise man mops before the flood. Nobody listens to wise man.'
      ]
    },
    temperament: { diligence: 0.75, sociability: 0.25, nerve: 1.0, mischief: 0.15, warmth: 0.6 },
    job: 'caretaker',
    fixes: ['fire', 'flood', 'lift', 'pest', 'printer'],
    haunts: ['spot.roofMid', 'spot.shelves', 'spot.pigeons'],
    baseline: 'neutral'
  },

  gus: {
    id: 'gus',
    name: 'Gus',
    fullName: 'Gus Tanaka-Flores',
    role: 'IT Manager',
    age: 41,
    pronoun: 'he',
    color: 0x3e9b57,
    look: {
      skin: 0xd8a97c,
      hair: { style: 'messy', color: 0x2a211c },
      facialHair: 'beard',
      build: { height: 0.95, width: 1.25, belly: 0.7 },
      outfit: { top: 'hoodie', topColor: 0x3e9b57, topAccent: 0x2c7541, bottom: 'shorts', bottomColor: 0x4a4038, shoes: 'trainers', shoeColor: 0x8a8f99 },
      accessories: ['headset', 'glasses'],
      eyes: { color: 0x2f1d12, shape: 'wide' },
      brows: { color: 0x2a211c, weight: 3 },
      nose: 'round'
    },
    voice: { pitch: 178, wave: 'sawtooth', spread: 2.6, speed: 1.05 },
    persona: {
      summary: 'Gus, the IT manager. A paranoid conspiracy theorist who lives in the server room and is sure something is watching the office.',
      speech: 'A low, urgent mutter. Says "that\'s what they want you to think" and "I\'ve got logs". Talks about an unseen "they". Trusts machines more than people.',
      wants: 'to prove that something is watching the building, to protect his servers, and to be left alone',
      fears: 'being right, sunlight, and the printer (he believes it is alive)',
      quirk: 'keeps a corkboard of red string linking every odd thing that happens in the office',
      secret: 'he is completely right: he has noticed the unseen force meddling with the office, he just cannot prove it',
      examples: [
        "That's the third 'accident' this week. I've got logs. I've got a board.",
        "Don't say it out loud. The printer listens.",
        'Have you tried turning it off and never turning it on again?'
      ]
    },
    temperament: { diligence: 0.6, sociability: 0.15, nerve: 0.35, mischief: 0.3, warmth: 0.4 },
    job: 'it',
    fixes: ['power', 'wifi'],
    haunts: ['spot.racks', 'spot.corkboard', 'spot.vending'],
    baseline: 'suspicious'
  }
};

export const CAST_LIST: readonly CharacterDef[] = Object.values(CAST);

export function castDef(id: CastId): CharacterDef {
  return CAST[id];
}

/** First name for any person on screen (cast or visitor). */
export function displayName(id: CharId): string {
  const c = (CAST as Record<string, CharacterDef | undefined>)[id];
  if (c) return c.name;
  const v = VISITORS[id];
  return v ? v.name : id;
}

// ── How they feel about each other on day one ────────────────────────────────
// [from, to, score (-100 hate .. +100 adore), why]. Pairs not listed start at 0
// ("just a coworker"). These drift during play.

export type BondSeed = readonly [CastId, CastId, number, string];

export const BOND_SEEDS: readonly BondSeed[] = [
  ['marcus', 'rosa', -35, 'his sales rival; she never seems to try and it drives him mad'],
  ['rosa', 'marcus', -10, 'her favourite person to wind up; secretly quite likes him'],
  ['tobi', 'marcus', 60, 'his hero'],
  ['marcus', 'tobi', 15, 'handy for coffee runs; calls him "kid"'],
  ['tobi', 'lena', 55, 'a hopeless crush he thinks nobody has noticed'],
  ['lena', 'tobi', 5, 'the intern; sweet, she supposes'],
  ['priya', 'rosa', 55, 'her one real friend at work'],
  ['rosa', 'priya', 60, 'best friend and partner in bets'],
  ['priya', 'marcus', -25, 'his expense claims are fiction'],
  ['marcus', 'priya', -5, 'thinks she is no fun, and is a bit scared of her spreadsheets'],
  ['nigel', 'rosa', -30, 'a walking policy violation'],
  ['rosa', 'nigel', -5, 'fun to break rules near'],
  ['nigel', 'diane', 45, 'admires her and fears her'],
  ['diane', 'nigel', 10, 'useful, tiresome'],
  ['diane', 'marcus', 20, 'her best earner; rather too keen'],
  ['marcus', 'diane', 40, 'wants her approval and her job'],
  ['diane', 'lena', -20, 'breaks the dress code daily'],
  ['lena', 'diane', -30, 'a corporate vampire'],
  ['diane', 'bea', 5, 'wary of her; Bea has been here longer than the furniture'],
  ['bea', 'diane', -5, 'that one needs a lemon bar and a holiday'],
  ['diane', 'priya', 25, 'competent, which is rare'],
  ['priya', 'diane', -20, 'takes credit for her reports'],
  ['diane', 'gus', -15, 'expensive and odd'],
  ['gus', 'diane', -40, 'management is part of it'],
  ['bea', 'tobi', 50, 'a sweet boy who needs feeding'],
  ['tobi', 'bea', 45, 'the only person who is never cross with him'],
  ['bea', 'oleg', 50, 'her tea-break friend'],
  ['oleg', 'bea', 55, 'the only one who offers him tea'],
  ['gus', 'oleg', 45, 'his chess partner; the one human he trusts'],
  ['oleg', 'gus', 35, 'strange man, good at chess'],
  ['gus', 'lena', -10, 'she films everything: evidence, or a threat?'],
  ['lena', 'gus', 10, 'kind of iconic, honestly'],
  ['lena', 'priya', 30, 'respects the deadpan'],
  ['priya', 'lena', 15, 'at least she is quiet'],
  ['nigel', 'bea', 35, 'a lovely lady'],
  ['bea', 'nigel', 10, 'a fusspot, bless him'],
  ['oleg', 'marcus', -20, 'walks on the wet floor every single time'],
  ['gus', 'marcus', -15, 'keeps asking him to "fix the internet"'],
  ['priya', 'tobi', 20, 'he at least tries'],
  ['tobi', 'priya', 10, 'scary but fair'],
  ['rosa', 'tobi', 30, 'adorable, and easy to win bets off'],
  ['tobi', 'rosa', 25, 'fun, though her dares get him in trouble'],
  ['lena', 'marcus', -15, 'so loud'],
  ['nigel', 'marcus', -10, 'the gong is a noise violation'],
  ['bea', 'rosa', 40, 'trouble, the good kind'],
  ['bea', 'lena', 25, 'wants to knit her a proper jumper'],
  ['bea', 'priya', 30, 'works too hard, poor love'],
  ['bea', 'marcus', 20, 'all bark, that one'],
  ['bea', 'gus', 15, 'needs sunlight and a vegetable'],
  ['oleg', 'nigel', -10, 'man with clipboard who has never held a mop'],
  ['nigel', 'tobi', 15, 'fills in his forms correctly, a rare joy'],
  ['tobi', 'diane', -5, 'terrifying'],
  ['diane', 'tobi', 0, 'the intern; she is not sure of his name'],
  ['diane', 'rosa', -10, 'talented and idle, the worst combination']
];

// ── Visitors: people who turn up for an event and leave again ────────────────

export interface VisitorDef {
  id: string;
  name: string;
  role: string;
  color: number;
  look: CharacterLook;
  voice: VoiceDef;
  /** One line for prompts. */
  summary: string;
}

export const VISITORS: Record<string, VisitorDef> = {
  'visitor:inspector': {
    id: 'visitor:inspector',
    name: 'The Inspector',
    role: 'Head Office Inspector',
    color: 0x55607a,
    look: {
      skin: 0xc99a7a,
      hair: { style: 'sidePart', color: 0x2a2a33 },
      facialHair: 'mustache',
      build: { height: 1.1, width: 0.95 },
      outfit: { top: 'blazer', topColor: 0x55607a, topAccent: 0xf2f2f2, tie: 0x8b1e2d, bottom: 'trousers', bottomColor: 0x3a4154, shoes: 'smart', shoeColor: 0x1c1c22 },
      accessories: ['glasses', 'badge'],
      eyes: { color: 0x3a3a3a, shape: 'almond' },
      brows: { color: 0x2a2a33, weight: 3 },
      nose: 'long',
      wrinkles: true
    },
    voice: { pitch: 140, wave: 'square', spread: 0.6, speed: 0.8 },
    summary: 'The Inspector, sent by Head Office without warning. Humourless, writes everything down, can close the branch.'
  },
  'visitor:courier': {
    id: 'visitor:courier',
    name: 'Dee',
    role: 'Pizza Courier',
    color: 0xd9412e,
    look: {
      skin: 0xa8714d,
      hair: { style: 'ponytail', color: 0x231815 },
      build: { height: 0.98, width: 0.95 },
      outfit: { top: 'uniform', topColor: 0xd9412e, topAccent: 0xffd23f, bottom: 'jeans', bottomColor: 0x2f3a55, shoes: 'trainers', shoeColor: 0x222222 },
      accessories: ['cap'],
      eyes: { color: 0x3b2417, shape: 'round' },
      brows: { color: 0x231815, weight: 2 },
      nose: 'button'
    },
    voice: { pitch: 270, wave: 'triangle', spread: 2.0, speed: 1.2 },
    summary: 'Dee, a pizza courier who has seen this office on worse days and just wants a signature.'
  }
};

export function lookOf(id: CharId): CharacterLook | undefined {
  const c = (CAST as Record<string, CharacterDef | undefined>)[id];
  return c ? c.look : VISITORS[id]?.look;
}

export function voiceOf(id: CharId): VoiceDef {
  const c = (CAST as Record<string, CharacterDef | undefined>)[id];
  return c ? c.voice : VISITORS[id]?.voice ?? { pitch: 220, wave: 'triangle', spread: 1.5, speed: 1 };
}

export function colorOf(id: CharId): number {
  const c = (CAST as Record<string, CharacterDef | undefined>)[id];
  return c ? c.color : VISITORS[id]?.color ?? 0x8890a6;
}
