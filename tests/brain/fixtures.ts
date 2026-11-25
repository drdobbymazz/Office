// A small invented world and voice bank for the brain tests. Deliberately NOT
// the game's cast: the brain must work with whatever world it is given.

import type { VoiceBank } from '@/game/core/content/types';
import { CHAOS_IDS } from '@/game/core/types';
import type { ChaosId } from '@/game/core/types';
import { BARK_KINDS, CUSTOM_VIBES, DEFAULT_BRAIN_SETTINGS } from '@/game/brain/api';
import type { BarkKind, BrainSettings, CustomVibe, MindsRequest, PersonBrief, SceneRequest } from '@/game/brain/api';
import type { BrainWorld } from '@/game/brain/world';
import type { LooseBank } from '@/game/brain/instinct';

export const WORLD: BrainWorld = {
  setting:
    'It is set in the back office of Mossgrove Garden Centre, a muddy little plant shop. ' +
    'Sometimes an unseen force makes strange things happen there. The staff do not know it exists, though Ivy suspects.',
  people: [
    {
      id: 'fern', name: 'Fern Holloway', role: 'Manager',
      summary: 'Brisk, bossy and secretly terrified of bees.',
      speech: 'Short orders. Calls everyone "team". Sighs a lot.',
      wants: 'a tidy shop', fears: 'bees', quirk: 'alphabetises seed packets', secret: 'she cannot keep a cactus alive',
      examples: ['Team. Positions. Now.', 'I am not panicking. I am delegating.', 'Who watered the plastic plants?']
    },
    {
      id: 'basil', name: 'Basil Okafor', role: 'Sales assistant',
      summary: 'Cheerful chatterbox who names every plant and talks to them.',
      speech: 'Warm and rambling, full of plant puns. Calls people "petal".',
      wants: 'a pay rise', fears: 'the compost heap', quirk: 'sings to the ferns', secret: 'he is allergic to pollen',
      examples: ['Morning, petal! Have you met Gerald? He is a begonia.', 'Lettuce not fight.', 'That is a cactus, not a cuddle.']
    },
    {
      id: 'ivy', name: 'Ivy Marsh', role: 'Caretaker',
      summary: 'Stoic caretaker who fixes everything and suspects something is watching the shop.',
      speech: 'Low, flat, few words. Grim little proverbs.',
      wants: 'quiet', fears: 'nothing', quirk: 'counts the gnomes every hour', secret: 'she was once a stunt driver',
      examples: ['The gnomes moved again. Gnomes do not move.', 'Is only mud.', 'Something is watching. I know it.']
    },
    {
      id: 'rowan', name: 'Rowan Pike', role: 'Work-experience student',
      summary: 'Nervous teenager on work experience who apologises to everything, including doors and plant pots.',
      speech: 'Fast, anxious, lots of "sorry, sorry". Asks if things count towards his grade.',
      wants: 'a good report', fears: 'Fern', quirk: 'carries three watering cans', secret: 'he broke the till',
      examples: ['Sorry! Sorry. Is that bad? That sounds bad.', 'Does this count towards my grade?', 'I watered it. Was I not meant to water it?']
    }
  ],
  rooms: [
    { id: 'shop', name: 'the Shop Floor' },
    { id: 'greenhouse', name: 'the Greenhouse' },
    { id: 'kitchen', name: 'the Staff Kitchen' },
    { id: 'yard', name: 'the Yard' }
  ]
};

const barks = (who: string): Record<BarkKind, string[]> =>
  Object.fromEntries(BARK_KINDS.map((k) => [k, [`${who} ${k} one!`, `${who} ${k} two!`, `${who} ${k} three!`]])) as Record<BarkKind, string[]>;
const chaos = (who: string): Record<ChaosId, string[]> =>
  Object.fromEntries(CHAOS_IDS.map((c) => [c, [`${who} sees the ${c}!`, `${who} cannot believe the ${c}.`]])) as Record<ChaosId, string[]>;
const custom = (who: string): Record<CustomVibe, string[]> =>
  Object.fromEntries(CUSTOM_VIBES.map((v) => [v, [`${who}: a ${v} {thing}!`, `${who} stares at the {thing}.`]])) as Record<CustomVibe, string[]>;

function voice(who: string): VoiceBank {
  return {
    barks: barks(who),
    chaos: chaos(who),
    idle: Array.from({ length: 8 }, (_, i) => `${who} idle thought ${i + 1}.`),
    openers: Array.from({ length: 8 }, (_, i) => `{other}, ${who} opener ${i + 1}.`),
    replies: {
      warm: Array.from({ length: 6 }, (_, i) => `Aw, {other}, ${who} warm ${i + 1}.`),
      cold: Array.from({ length: 6 }, (_, i) => `No, {other}. ${who} cold ${i + 1}.`),
      neutral: Array.from({ length: 6 }, (_, i) => `Hm, {other}. ${who} neutral ${i + 1}.`)
    },
    whispered: Array.from({ length: 4 }, (_, i) => `${who} thinks ${i + 1}: {thought}`),
    announced: Array.from({ length: 4 }, (_, i) => `${who} heard the speaker ${i + 1}.`),
    custom: custom(who)
  };
}

/** Rowan is missing on purpose: the brain must use its generic voice for him. */
export const BANK: LooseBank = { fern: voice('Fern'), basil: voice('Basil'), ivy: voice('Ivy') };

/** A seeded random number generator, so instinct tests are repeatable. */
export function seeded(seed = 1): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function person(id: string, over: Partial<PersonBrief> = {}): PersonBrief {
  const p = WORLD.people.find((x) => x.id === id);
  return {
    id,
    name: p?.name ?? id,
    mood: 'neutral',
    state: [],
    goal: '',
    feelings: [],
    memories: [],
    ...over
  };
}

export function sceneReq(over: Partial<SceneRequest> = {}): SceneRequest {
  return {
    id: 's1',
    day: 2,
    clock: '10:42',
    place: 'the Staff Kitchen',
    trigger: 'ambient',
    why: 'Fern and Basil meet by the kettle.',
    people: [
      person('fern', { mood: 'angry', goal: 'find out who used her mug', feelings: [{ about: 'basil', text: 'annoying, always singing; a rival for the till' }] }),
      person('basil', { mood: 'happy', feelings: [{ about: 'fern', text: 'his favourite boss, secretly likes her' }] })
    ],
    onlookers: ['Ivy'],
    facts: ['The kettle is broken.'],
    recent: [{ who: 'Fern', say: 'Who took my mug?' }],
    minLines: 2,
    maxLines: 4,
    chaos: 0.4,
    ...over
  };
}

export function mindsReq(over: Partial<MindsRequest> = {}): MindsRequest {
  return {
    id: 'm1',
    day: 2,
    clock: '11:05',
    people: [
      { ...person('ivy', { mood: 'suspicious', goal: 'count the gnomes' }), place: 'the Yard', doing: 'counting gnomes' },
      { ...person('rowan', { mood: 'nervous', feelings: [{ about: 'fern', text: 'terrifying' }] }), place: 'the Shop Floor', doing: 'watering' }
    ],
    facts: [],
    allowed: ['work', 'talk', 'coffee', 'confront', 'hide', 'wander', 'snack'],
    others: [
      { id: 'fern', name: 'Fern Holloway', place: 'the Shop Floor' },
      { id: 'basil', name: 'Basil Okafor', place: 'the Greenhouse' }
    ],
    chaos: 0.3,
    ...over
  };
}

export function settings(over: Partial<BrainSettings> = {}): BrainSettings {
  return { ...DEFAULT_BRAIN_SETTINGS, provider: 'ollama', model: 'artemis-custom', ...over };
}

// ── The mock server, in-process ─────────────────────────────────────────────

export interface MockServer {
  port: number;
  url: string;
  requests: { method: string; path: string; body: Record<string, unknown>; headers: Record<string, string>; at: number }[];
  set(o: {
    tps?: number; load?: number; apiKey?: string;
    /** POST /api/show: 'missing' answers 404 like an old server, 'nocaps' leaves out the capabilities list. */
    show?: 'normal' | 'missing' | 'nocaps';
    showDelay?: number;
    /** Report these capabilities for every model instead of the usual ones. */
    capabilities?: string[] | null;
  }): void;
  unload(): void;
  close(): Promise<void>;
}

export async function startMock(o: { port?: number; tps?: number; load?: number; apiKey?: string } = {}): Promise<MockServer> {
  const mod = (await import('../../tools/mock-ollama.mjs')) as { startMockOllama: (o: object) => Promise<MockServer> };
  return mod.startMockOllama({ port: 0, tps: 4000, load: 0, ...o });
}
