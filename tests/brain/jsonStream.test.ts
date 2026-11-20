import { describe, expect, it } from 'vitest';
import { ArrayItemStream, parseLoose, stripNoise } from '@/game/brain/jsonStream';

const LINES = [
  { who: 'Fern', say: 'Who put a {brace} in my "tea"?', feel: 'angry', to: 'Basil', act: 'point' },
  { who: 'Basil', say: 'Not me, petal. Back\\slash and ] bracket, honest.', feel: 'amused', to: 'Fern', act: 'laugh' },
  { who: 'Ivy', say: 'Unicode: café, “quotes”, and a tab\there.', feel: 'suspicious', to: 'all', act: 'none' },
  { who: 'Rowan', say: 'Sorry! {"who":"fake"} is just text.', feel: 'nervous', to: 'none', act: 'back_away' }
];

const REPLY = { lines: LINES, summary: 'Fern blamed Basil for the {tea}.', shifts: [], plans: [{ who: 'Fern', plan: 'confront', target: 'Basil', about: '[mug]' }] };

const SAMPLES: string[] = [
  JSON.stringify(REPLY),
  JSON.stringify(REPLY, null, 2),
  'Sure! Here you go:\n```json\n' + JSON.stringify(REPLY, null, 1) + '\n```\nHope that helps.',
  // A nested "lines" key deeper down must not be mistaken for the real one.
  JSON.stringify({ meta: { lines: [{ who: 'X', say: 'decoy' }] }, lines: LINES.slice(0, 2), summary: 's' })
];

const expected = (sample: string): string[] => {
  const v = parseLoose(sample)!.value as { lines: unknown[] };
  return v.lines.map((l) => JSON.stringify(l));
};

describe('ArrayItemStream', () => {
  it('hands out each complete line exactly once, in order, for every way of cutting the stream', () => {
    for (const sample of SAMPLES) {
      const want = expected(sample);
      // Fed one character at a time.
      const s1 = new ArrayItemStream('lines');
      const got1: string[] = [];
      for (let i = 1; i <= sample.length; i++) got1.push(...s1.push(sample.slice(0, i)));
      expect(got1.map((g) => JSON.stringify(JSON.parse(g)))).toEqual(want);

      // Fed in two pieces cut at every possible position.
      for (let cut = 0; cut <= sample.length; cut++) {
        const s = new ArrayItemStream('lines');
        const first = s.push(sample.slice(0, cut));
        // Every item handed out so far is complete and appears in the final list, in order.
        first.forEach((g, i) => expect(JSON.stringify(JSON.parse(g))).toBe(want[i]));
        const rest = s.push(sample);
        expect([...first, ...rest].map((g) => JSON.stringify(JSON.parse(g)))).toEqual(want);
      }
    }
  });

  it('fires each line as soon as its closing brace arrives', () => {
    const text = JSON.stringify(REPLY);
    const s = new ArrayItemStream('lines');
    const firstClose = text.indexOf('"act":"point"}') + '"act":"point"}'.length;
    expect(s.push(text.slice(0, firstClose - 1))).toEqual([]);
    expect(s.push(text.slice(0, firstClose))).toHaveLength(1);
  });

  it('copes with random chunk sizes (fuzz)', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const sample of SAMPLES) {
      const want = expected(sample);
      for (let run = 0; run < 200; run++) {
        const s = new ArrayItemStream('lines');
        const got: string[] = [];
        let pos = 0;
        while (pos < sample.length) {
          pos = Math.min(sample.length, pos + 1 + Math.floor(rnd() * 12));
          got.push(...s.push(sample.slice(0, pos)));
        }
        expect(got.map((g) => JSON.stringify(JSON.parse(g)))).toEqual(want);
      }
    }
  });

  it('does not repeat items when the text is rewritten (a reasoning block stripped)', () => {
    const json = JSON.stringify(REPLY);
    const s = new ArrayItemStream('lines');
    const a = s.push('garbage ' + json.slice(0, 200));
    const b = s.push(json);
    expect(a.length + b.length).toBe(LINES.length);
  });
});

describe('parseLoose', () => {
  it('reads clean, fenced and chatty replies', () => {
    for (const sample of SAMPLES) expect(parseLoose(sample)?.value.lines).toBeTruthy();
  });

  it('strips think blocks, even unclosed ones', () => {
    expect(stripNoise('<think>{"lines":[]}</think>{"a":1}')).toBe('{"a":1}');
    expect(parseLoose('<think>hmm {"lines": [</think>\n{"lines":[{"who":"A","say":"hi"}]}')!.value.lines).toHaveLength(1);
    expect(parseLoose('<think>still thinking {"x":1}')).toBeNull();
  });

  it('removes trailing commas', () => {
    expect(parseLoose('{"lines":[{"who":"A","say":"x"},],}')!.value.lines).toHaveLength(1);
  });

  it('repairs a reply cut off at any point, keeping exactly the complete lines', () => {
    const text = JSON.stringify(REPLY);
    const ends: number[] = [];
    // Positions just after each line object closes.
    let from = 0;
    for (const l of LINES) {
      const piece = JSON.stringify(l);
      const at = text.indexOf(piece, from) + piece.length;
      ends.push(at);
      from = at;
    }
    for (let cut = 1; cut < text.length; cut++) {
      const r = parseLoose(text.slice(0, cut));
      const complete = ends.filter((e) => e <= cut).length;
      const lines = (r?.value.lines as unknown[] | undefined) ?? [];
      if (cut < ends[0]) expect(lines.length).toBe(0);
      else expect(lines.length).toBe(complete);
      for (let i = 0; i < lines.length; i++) expect(lines[i]).toEqual(LINES[i]);
    }
  });

  it('returns null for text with no JSON', () => {
    expect(parseLoose('Honestly? Have a biscuit.')).toBeNull();
    expect(parseLoose('')).toBeNull();
  });
});
