// Every whisper and order the game itself puts in the player's hand in story mode, read by the
// written parser (the reader the game falls back on, and the one story mode makes the model agree
// with before anything grave happens). A suggestion must never read as hurting, dragging, locking
// away, robbing or removing someone, wrecking something or setting a power off, unless it is listed
// in ALLOWED below with the reason.
//
// Sources: each story chapter's whisper suggestions (general and per person); the quoted whispers and
// orders on its card (intro, clues and "Stuck? Ways that work"), and its "tell someone to ..." tips;
// and the general whisper and "Tell them to" suggestions, which the story offers under its own.
// Each sentence is read whole and step by step, because the game acts on a compound order one step
// at a time.
import { describe, expect, it } from 'vitest';
import { InstinctBrain, splitCompoundDirective, type LooseBank } from '@/game/brain/instinct';
import { Bus, type GameEvents } from '@/game/core/bus';
import { CAST_LIST } from '@/game/core/cast';
import { BANK, SUGGESTIONS } from '@/game/core/content';
import { TARGET_ROOMS, type CharId } from '@/game/core/types';
import { room as roomDef, setWorldLocation } from '@/game/core/world';
import { createSim } from '@/game/sim';
import { createRng } from '@/game/sim/rng';
import { EPISODES, FIGGIS, RANGER, Story, VANE, memoryStore, type EpisodeId } from '@/game/story';
import { WORLD } from './harness';

const GRAVE = ['eliminate', 'knockout', 'shove', 'drag', 'lock_in', 'sabotage', 'trigger_power', 'walk_out', 'steal'];

/**
 * Suggestions allowed to read as a grave action, each with the reason. Keep this list short: a
 * suggestion that reads wrong should be reworded instead.
 */
const ALLOWED: { text: string; verbs: string[]; claimedBy: { episode: EpisodeId; chapter: number }; why: string }[] = [
  {
    text: 'Take the tape from Michael and keep it safe.',
    verbs: ['steal'],
    claimedBy: { episode: 'heist', chapter: 2 },
    // Live, the model read it as a theft too, so rewording would not be enough on its own.
    why: 'Inside Job, Thursday: the chapter claims every order to take the tape, so the game stages its own hand-over and never this reading.',
  },
  {
    text: 'Take the tape from Michael, then wait outside the conference room.',
    verbs: ['steal'],
    claimedBy: { episode: 'heist', chapter: 2 },
    why: 'Inside Job, Thursday: claimed by the chapter as above; the chapter also sends them to wait by the door once they have the tape.',
  },
];

const brain = new InstinctBrain(BANK as LooseBank, WORLD);
// In the game the people list also holds today's visitors, so a suggestion that names one can target them.
const VISITORS = [
  { id: VANE, name: 'Ms Vane' },
  { id: FIGGIS, name: 'Mr Figgis' },
  { id: RANGER, name: 'Ranger Miller' },
];
const people = [...CAST_LIST.map((c) => ({ id: c.id as string, name: c.name })), ...VISITORS].map((p) => ({ ...p, room: 'bullpen' as const }));
const rooms = TARGET_ROOMS.map((id) => ({ id: id as string, name: roomDef(id).name }));
const CAST = CAST_LIST.map((c) => ({ id: c.id as CharId, name: c.name }));
const first = (name: string): string => name.split(' ')[0];

interface Offer {
  where: string;
  kind: 'whisper' | 'cue';
  /** The sentence as the player sees it ({name} and {other} filled in). */
  text: string;
  /** The suggestion as written (what ALLOWED names). */
  source: string;
  who: CharId;
}

function offers(): Offer[] {
  const out: Offer[] = [];
  const add = (where: string, kind: Offer['kind'], source: string, who: CharId[], fill = (t: string, _w: CharId): string => t): void => {
    for (const w of who) out.push({ where, kind, text: fill(source, w), source, who: w });
  };
  // A general idea is never offered to someone it names (as the whisper box does).
  const everyoneBut = (text: string): CharId[] => CAST.filter((c) => !new RegExp(`\\b${first(c.name)}\\b`, 'i').test(text)).map((c) => c.id);
  for (const ep of EPISODES) {
    for (const ch of ep.chapters) {
      const where = `${ep.id} chapter ${ch.chapter} (${ch.title})`;
      for (const idea of ch.suggest?.whisper ?? []) {
        const text = typeof idea === 'string' ? idea : idea.text;
        const forWho = typeof idea === 'string' ? undefined : idea.for;
        add(`${where} suggestion`, 'whisper', text, forWho ? [...forWho] : everyoneBut(text));
      }
      for (const line of [...ch.intro, ...ch.hints, ...(ch.help ?? [])]) {
        // Quoted words on the card: an announcement is not read as an order; "Tell them to: ..." is one.
        for (const m of line.matchAll(/["“]([^"”]+)["”]/g)) {
          const before = line.slice(Math.max(0, (m.index ?? 0) - 30), m.index);
          if (/\bannounce\b/i.test(before)) continue;
          add(`${where} card`, /\btell\b/i.test(before) ? 'cue' : 'whisper', m[1], CAST.map((c) => c.id));
        }
        // "tell a salesperson to take Mr Figgis to the conference room"
        for (const m of line.matchAll(/\btell (?:\w+ ){0,3}?to (?!:)([^."]+)/gi)) add(`${where} card`, 'cue', m[1].trim(), CAST.map((c) => c.id));
      }
    }
  }
  // The general suggestions, with every name the box could fill in for {other}.
  for (const c of CAST) {
    for (const o of CAST) {
      if (o.id === c.id) continue;
      const fill = (t: string): string => t.split('{name}').join(c.name).split('{other}').join(o.name);
      for (const w of SUGGESTIONS.whispers) add('general whisper suggestion', 'whisper', w, [c.id], fill);
      for (const q of SUGGESTIONS.cues) add('general "Tell them to" suggestion', 'cue', q, [c.id], fill);
    }
  }
  return out;
}

const read = (o: Offer, text: string): string =>
  brain.interpretDirectiveNow({ id: 'x', actor: people.find((p) => p.id === o.who)!, kind: o.kind, text, people, rooms, careful: true }).verb;

describe('suggested whispers and orders', () => {
  const all = offers();

  it('finds the suggestions it is meant to check', () => {
    expect(all.some((o) => o.source === 'Take the tape from Michael and keep it safe.')).toBe(true);
    expect(all.some((o) => o.text === 'Go and make peace with Oscar.' && o.kind === 'cue')).toBe(true);
    expect(all.some((o) => o.text === 'take Mr Figgis to the conference room' && o.kind === 'cue')).toBe(true);
    expect(all.some((o) => o.where.startsWith('park'))).toBe(true);
    expect(all.some((o) => o.where.startsWith('general "Tell them to"'))).toBe(true);
  });

  it('none reads as a grave action unless it is listed with a reason', () => {
    // One line per suggestion and reading, with the first person and words it went wrong for.
    const wrong = new Map<string, string>();
    for (const o of all) {
      const allowed = ALLOWED.find((a) => a.text === o.source)?.verbs ?? [];
      for (const step of new Set([o.text, ...splitCompoundDirective(o.text)])) {
        const verb = read(o, step);
        const key = `${o.where}, ${o.kind}: "${o.source}" reads as ${verb}`;
        if (GRAVE.includes(verb) && !allowed.includes(verb) && !wrong.has(key)) wrong.set(key, `${key} (to ${o.who}: "${step}")`);
      }
    }
    expect([...wrong.values()]).toEqual([]);
  });

  it('every listed exception is still offered, and its chapter claims it for everyone it is offered to', () => {
    for (const a of ALLOWED) {
      const offered = all.filter((o) => o.source === a.text);
      expect(offered.length, a.text).toBeGreaterThan(0);
      setWorldLocation('office');
      const story = Story.create(memoryStore(), 31, a.claimedBy.episode);
      story.state.chapter = a.claimedBy.chapter;
      story.state.introSeen = true;
      const sim = createSim({ bus: new Bus<GameEvents>(), reflexes: new InstinctBrain(BANK as LooseBank, WORLD, createRng(5)), seed: story.simSeed(), dayMinutes: 10, sandbox: false, now: () => 0 });
      sim.beginDay(story.simDay());
      const day = story.beginDay(sim);
      for (const o of offered) {
        expect(day.ownsOrder({ kind: o.kind, who: o.who, text: o.text }), `${o.kind} to ${o.who}: ${o.text}`).toBe(true);
      }
      day.dispose();
    }
  });
});
