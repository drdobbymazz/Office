// Checks the hand-written text against the rules in game/core/content/types.ts.
import { describe, expect, it } from 'vitest';
import { BANK, CHAOS_TEXT, SUGGESTIONS, TIPS, VISITOR_VOICES, VOICES } from '@/game/core/content';
import type { LooseVoiceBank, VoiceBank } from '@/game/core/content';
import { CAST_IDS, CHAOS_IDS } from '@/game/core/types';
import { CHAOS } from '@/game/core/chaos';
import { BARK_KINDS, CUSTOM_VIBES, STORY_THEMES } from '@/game/brain/api';

const EMOJI = /\p{Extended_Pictographic}/u;
const DASHES = /[‒–—―]/;
const CURLY = /[‘’“”]/;
const PLACEHOLDER = /\{([a-z]+)\}/gi;

const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9{} ]/g, '').replace(/\s+/g, ' ').trim();
const placeholders = (s: string): string[] => [...s.matchAll(PLACEHOLDER)].map((m) => m[1]);

/** Lines of dialogue lifted from elsewhere that must not ship. */
const BANNED = [
  /that'?s what she said/i, /bears,? beets/i, /identity theft/i, /dunder/i, /mifflin/i,
  /did i stutter/i, /big tuna/i, /nard dog/i, /i declare bankruptcy/i, /mung bean/i
];

interface Entry { field: string; text: string; allowed: string[]; maxWords: number }

/** Every spoken line for one person, with the placeholders each field allows. */
function linesOf(v: VoiceBank | LooseVoiceBank): Entry[] {
  const out: Entry[] = [];
  // Story lines open a chat or answer one, so they name nobody in particular.
  for (const k of STORY_THEMES) for (const t of v.story?.[k] ?? []) out.push({ field: `story.${k}`, text: t, allowed: [], maxWords: 18 });
  for (const k of BARK_KINDS) for (const t of v.barks?.[k] ?? []) out.push({ field: `barks.${k}`, text: t, allowed: [], maxWords: 6 });
  for (const k of CHAOS_IDS) for (const t of v.chaos?.[k] ?? []) out.push({ field: `chaos.${k}`, text: t, allowed: [], maxWords: 18 });
  for (const t of v.idle ?? []) out.push({ field: 'idle', text: t, allowed: [], maxWords: 18 });
  for (const t of v.openers ?? []) out.push({ field: 'openers', text: t, allowed: ['other'], maxWords: 18 });
  for (const tone of ['warm', 'cold', 'neutral'] as const) {
    for (const t of v.replies?.[tone] ?? []) out.push({ field: `replies.${tone}`, text: t, allowed: ['other'], maxWords: 18 });
  }
  // {thought} is itself a short sentence, so the rest of the line is kept to 12 words.
  for (const t of v.whispered ?? []) out.push({ field: 'whispered', text: t, allowed: ['thought', 'other'], maxWords: 13 });
  for (const t of v.announced ?? []) out.push({ field: 'announced', text: t, allowed: [], maxWords: 18 });
  for (const k of CUSTOM_VIBES) for (const t of v.custom?.[k] ?? []) out.push({ field: `custom.${k}`, text: t, allowed: ['thing'], maxWords: 18 });
  return out;
}

function checkText(where: string, text: string, allowed: string[], maxWords: number): string[] {
  const errs: string[] = [];
  if (typeof text !== 'string' || !text.trim()) return [`${where}: empty`];
  if (text !== text.trim()) errs.push(`${where}: stray spaces "${text}"`);
  if (words(text) > maxWords) errs.push(`${where}: ${words(text)} words (max ${maxWords}) "${text}"`);
  if (EMOJI.test(text)) errs.push(`${where}: emoji "${text}"`);
  if (DASHES.test(text)) errs.push(`${where}: dash "${text}"`);
  if (CURLY.test(text)) errs.push(`${where}: curly quote "${text}"`);
  for (const p of placeholders(text)) if (!allowed.includes(p)) errs.push(`${where}: placeholder {${p}} not allowed "${text}"`);
  for (const re of BANNED) if (re.test(text)) errs.push(`${where}: borrowed line "${text}"`);
  return errs;
}

describe('voice banks', () => {
  it('has a bank for every person', () => {
    expect(Object.keys(BANK).sort()).toEqual([...CAST_IDS].sort());
  });

  for (const id of CAST_IDS) {
    describe(id, () => {
      const v = BANK[id];

      it('meets every count', () => {
        const short: string[] = [];
        for (const k of BARK_KINDS) if ((v.barks[k]?.length ?? 0) < 3) short.push(`barks.${k}`);
        for (const k of CHAOS_IDS) if ((v.chaos[k]?.length ?? 0) < 2) short.push(`chaos.${k}`);
        if (v.idle.length < 8) short.push('idle');
        if (v.openers.length < 8) short.push('openers');
        for (const tone of ['warm', 'cold', 'neutral'] as const) if (v.replies[tone].length < 6) short.push(`replies.${tone}`);
        if (v.whispered.length < 4) short.push('whispered');
        if (v.announced.length < 4) short.push('announced');
        for (const k of CUSTOM_VIBES) if ((v.custom[k]?.length ?? 0) < 2) short.push(`custom.${k}`);
        for (const k of STORY_THEMES) if ((v.story?.[k]?.length ?? 0) < 3) short.push(`story.${k}`);
        expect(short.join("\n")).toBe("");
      });

      it('has no unknown keys', () => {
        expect(Object.keys(v.barks).sort()).toEqual([...BARK_KINDS].sort());
        expect(Object.keys(v.chaos).sort()).toEqual([...CHAOS_IDS].sort());
        expect(Object.keys(v.custom).sort()).toEqual([...CUSTOM_VIBES].sort());
      });

      it('follows the writing rules', () => {
        const errs = linesOf(v).flatMap((e) => checkText(`${id}.${e.field}`, e.text, e.allowed, e.maxWords));
        expect(errs.join("\n")).toBe("");
      });

      it('every whisper reaction uses {thought}', () => {
        expect(v.whispered.filter((t) => !t.includes('{thought}'))).toEqual([]);
      });

      it('every opener names the other person', () => {
        expect(v.openers.filter((t) => !t.includes('{other}'))).toEqual([]);
      });

      it('never repeats a line', () => {
        const seen = new Map<string, string>();
        const dupes: string[] = [];
        for (const e of linesOf(v)) {
          const k = norm(e.text);
          if (seen.has(k)) dupes.push(`"${e.text}" in ${seen.get(k)} and ${e.field}`);
          else seen.set(k, e.field);
        }
        expect(dupes.join("\n")).toBe("");
      });
    });
  }

  it('no two people share a line of three words or more', () => {
    const owner = new Map<string, string>();
    const shared: string[] = [];
    for (const id of CAST_IDS) {
      for (const e of linesOf(BANK[id])) {
        if (words(e.text) < 3) continue;
        const k = norm(e.text);
        const prev = owner.get(k);
        if (prev && prev !== id) shared.push(`"${e.text}": ${prev} and ${id}`);
        else owner.set(k, id);
      }
    }
    expect(shared.join("\n")).toBe("");
  });
});

describe('visitor voices', () => {
  it('Mr Figgis and the inspector have voices, handed to the brain with the staff', () => {
    expect(Object.keys(VISITOR_VOICES).sort()).toEqual(['visitor:figgis', 'visitor:inspector']);
    for (const [id, v] of Object.entries(VISITOR_VOICES)) {
      expect((VOICES as Record<string, unknown>)[id]).toBe(v.bank);
      expect(v.speech.trim().length).toBeGreaterThan(10);
      expect(v.examples.length).toBeGreaterThanOrEqual(2);
    }
    expect(Object.keys(BANK).sort()).toEqual([...CAST_IDS].sort());
  });

  for (const [id, v] of Object.entries(VISITOR_VOICES)) {
    it(`${id} follows the writing rules`, () => {
      const errs = [...linesOf(v.bank), ...v.examples.map((t) => ({ field: 'examples', text: t, allowed: [], maxWords: 18 }))]
        .flatMap((e) => checkText(`${id}.${e.field}`, e.text, e.allowed, e.maxWords));
      expect(errs.join("\n")).toBe("");
      expect((v.bank.openers ?? []).filter((t) => !t.includes('{other}'))).toEqual([]);
      expect((v.bank.whispered ?? []).filter((t) => !t.includes('{thought}'))).toEqual([]);
    });
  }
});

describe('chaos narration', () => {
  it('covers every event', () => {
    expect(Object.keys(CHAOS_TEXT).sort()).toEqual([...CHAOS_IDS].sort());
  });

  for (const id of CHAOS_IDS) {
    it(id, () => {
      const def = CHAOS[id];
      const allowed: string[] = [];
      if (def.target === 'room' || def.fixedRoom) allowed.push('room');
      if (def.target === 'person' || def.target === 'pair') allowed.push('who');
      if (def.target === 'pair') allowed.push('other');
      const t = CHAOS_TEXT[id];
      const errs: string[] = [];
      for (const f of ['start', 'end', 'fact', 'aftermath', 'memory'] as const) {
        errs.push(...checkText(`${id}.${f}`, t[f], allowed, 22));
        if (!/[.!?]$/.test(t[f])) errs.push(`${id}.${f}: no full stop`);
      }
      // Person and pair events must say who; room events should say where.
      if (def.target === 'person' || def.target === 'pair') {
        if (!t.start.includes('{who}')) errs.push(`${id}.start: does not name {who}`);
      }
      if (def.target === 'pair' && !t.start.includes('{other}')) errs.push(`${id}.start: does not name {other}`);
      if (def.target === 'room' && !t.start.includes('{room}')) errs.push(`${id}.start: does not name {room}`);
      expect(errs.join("\n")).toBe("");
    });
  }
});

describe('suggestions and tips', () => {
  it('meets the counts', () => {
    expect(SUGGESTIONS.whispers.length).toBeGreaterThanOrEqual(24);
    expect(SUGGESTIONS.announcements.length).toBeGreaterThanOrEqual(16);
    expect(SUGGESTIONS.customEvents.length).toBeGreaterThanOrEqual(20);
    expect(SUGGESTIONS.cues.length).toBeGreaterThanOrEqual(16);
    expect(TIPS.length).toBeGreaterThanOrEqual(12);
  });

  it('follows the writing rules', () => {
    const errs: string[] = [];
    const groups: [string, string[], string[]][] = [
      ['whispers', SUGGESTIONS.whispers, ['name', 'other']],
      ['announcements', SUGGESTIONS.announcements, []],
      ['customEvents', SUGGESTIONS.customEvents, []],
      ['cues', SUGGESTIONS.cues, ['other']],
      ['tips', TIPS, []]
    ];
    for (const [name, list, allowed] of groups) {
      const seen = new Set<string>();
      list.forEach((t, i) => {
        errs.push(...checkText(`${name}[${i}]`, t, allowed, name === 'tips' ? 24 : 18));
        if (seen.has(norm(t))) errs.push(`${name}[${i}]: repeated "${t}"`);
        seen.add(norm(t));
      });
    }
    expect(errs.join("\n")).toBe("");
  });
});
