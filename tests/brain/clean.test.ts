import { describe, expect, it } from 'vitest';
import { cleanAct, cleanEmotion, cleanLine, cleanLines, cleanPlans, cleanSay, cleanShifts, lineKey } from '@/game/brain/clean';
import { NameMap } from '@/game/brain/names';
import { WorldIndex } from '@/game/brain/world';
import { WORLD } from './fixtures';

const speakers = new NameMap([
  { id: 'fern', name: 'Fern Holloway' },
  { id: 'basil', name: 'Basil Okafor' }
]);
const index = new WorldIndex(WORLD);
const rooms = (raw: unknown): string | null => index.resolveRoom(raw);

describe('cleanSay', () => {
  it('removes stage directions, asides, emojis, quotes and name prefixes', () => {
    expect(cleanSay('*sighs* (quietly) "Who took my mug?" 😠')).toBe('Who took my mug?');
    expect(cleanSay('"“Hello there.”"')).toBe('Hello there.');
    expect(cleanSay('Fern: Team. Positions. Now.', 22, (n) => speakers.resolve(n) !== null)).toBe('Team. Positions. Now.');
    expect(cleanSay('Note: this stays.', 22, (n) => speakers.resolve(n) !== null)).toBe('Note: this stays.');
    expect(cleanSay('Well  ,   that   was   odd .')).toBe('Well, that was odd.');
    expect(cleanSay('Wait — what?')).toBe('Wait, what?');
    expect(cleanSay('[laughs] 👍🏽')).toBe('');
    expect(cleanSay('   ')).toBe('');
    expect(cleanSay(42)).toBe('');
  });

  it('cuts long lines at a sentence end, or with dots', () => {
    const long = 'This is the first sentence and it is fine. ' + 'Then it goes on and on and on and on and on and on and on and on.';
    expect(cleanSay(long)).toBe('This is the first sentence and it is fine.');
    const run = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const out = cleanSay(run);
    expect(out.endsWith('...')).toBe(true);
    expect(out.split(' ').length).toBeLessThanOrEqual(22);
  });
});

describe('cleanLines', () => {
  it('keeps valid lines and repairs fields', () => {
    const seen = new Set<string>([lineKey('Who took my mug?')]);
    const lines = cleanLines(
      [
        { who: 'FERN', say: 'Basil. A word.', feel: 'Angry', to: 'basil okafor', act: 'shake head' },
        { who: 'Basil', say: 'Lettuce not fight!', feel: 'giddy', to: 'everyone', act: 'moonwalk' },
        { who: 'Nobody', say: 'I am not here.' },
        { who: 'Fern', say: 'Who took my mug?' }, // repeats an earlier line
        { who: 'Basil', say: 'Lettuce not fight!' }, // repeats a kept line
        { who: 'Fern', say: '*glares*' }, // nothing left
        { who: 'Fern', say: 'Fine.', to: 'Fern' },
        'not an object',
        { who: 'Basil', say: 'One too many.' }
      ],
      { speakers, maxLines: 3, seen }
    );
    expect(lines).toEqual([
      { who: 'fern', say: 'Basil. A word.', feel: 'angry', to: 'basil', act: 'shake_head' },
      { who: 'basil', say: 'Lettuce not fight!', feel: 'neutral', to: 'all', act: 'none' },
      { who: 'fern', say: 'Fine.', feel: 'neutral', to: null, act: 'none' }
    ]);
  });

  it('validates emotions and gestures', () => {
    expect(cleanEmotion('SCARED')).toBe('scared');
    expect(cleanEmotion('furious')).toBe('neutral');
    expect(cleanAct('step-closer')).toBe('step_closer');
    expect(cleanAct(undefined)).toBe('none');
  });

  it('preserves a 35-word natural speech line without "..." cutoff while keeping explicit cleanSay limits', () => {
    const line35 =
      'Look at this disaster on the floor right now because nobody bothered to lock the annex door before lunch and now the entire quarterly shipment of paper reams is completely soaking wet.';
    expect(line35.split(' ').length).toBeGreaterThanOrEqual(30);
    const cleaned = cleanLine(
      { who: 'Fern', say: line35, feel: 'angry', to: 'none', act: 'none' },
      { speakers, maxLines: 2, seen: new Set([lineKey('other')]) }
    );
    expect(cleaned?.say).toBe(line35);
    expect(cleaned?.say.endsWith('...')).toBe(false);

    // Explicit default maxWords=22 on cleanSay still bounds callers expecting 22-word cut.
    const fortyWords = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    expect(cleanSay(fortyWords).endsWith('...')).toBe(true);
  });

  it('trims an 80-word run-on line to the scene line limit (it has no sentence or clause to end at)', () => {
    const line80 = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ') + '.';
    const cleaned = cleanLine(
      { who: 'Fern', say: line80, feel: 'angry', to: 'none', act: 'none' },
      { speakers, maxLines: 2, seen: new Set([lineKey('other')]) }
    );
    expect(cleaned?.say.split(' ').length).toBeLessThanOrEqual(45);
    expect(cleaned?.say.endsWith('...')).toBe(true);
  });
});

describe('shifts and plans', () => {
  const people = new NameMap([...speakers.ids.map((id) => ({ id, name: speakers.name(id) })), { id: 'ivy', name: 'Ivy Marsh' }]);
  it('drops invalid shifts', () => {
    expect(
      cleanShifts(
        [
          { who: 'Fern', about: 'Basil', change: 'resents' },
          { who: 'Fern', about: 'Fern', change: 'admires' },
          { who: 'Basil', about: 'Ivy', change: 'adores' },
          { who: 'Ivy', about: 'Fern', change: 'fears' }, // Ivy does not speak
          { who: 'Fern', about: 'Basil', change: 'likes_less' } // duplicate pair
        ],
        speakers,
        people
      )
    ).toEqual([{ who: 'fern', about: 'basil', change: 'resents' }]);
  });

  it('checks plan kinds and targets', () => {
    expect(
      cleanPlans(
        [
          { who: 'Fern', plan: 'confront', target: 'Basil', about: 'the mug' },
          { who: 'Basil', plan: 'coffee', target: 'the Staff Kitchen', about: '' }
        ],
        speakers,
        people,
        rooms
      )
    ).toEqual([
      { who: 'fern', plan: { kind: 'confront', target: 'basil', about: 'the mug' } },
      { who: 'basil', plan: { kind: 'coffee', target: 'kitchen', about: '' } }
    ]);
    expect(cleanPlans([{ who: 'Fern', plan: 'confront', target: 'none' }], speakers, people, rooms)).toEqual([]);
    expect(cleanPlans([{ who: 'Fern', plan: 'confront', target: 'Fern' }], speakers, people, rooms)).toEqual([]);
    expect(cleanPlans([{ who: 'Fern', plan: 'teleport', target: 'Basil' }], speakers, people, rooms)).toEqual([]);
    expect(cleanPlans([{ who: 'Fern', plan: 'hide', target: 'Basil' }], speakers, people, rooms)).toEqual([
      { who: 'fern', plan: { kind: 'hide', target: null, about: '' } }
    ]);
    expect(cleanPlans([{ who: 'Fern', plan: 'work', target: 'none' }], speakers, people, rooms, ['talk'])).toEqual([]);
  });
});
