// The full-screen cards' decisions (screenLogic.ts), the numbers they show (from the story rules)
// and the title logo asset. No DOM: the cards themselves are checked with screenshots.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dayPicture, reportActions, resultLines, revealTimes, splitHook } from '@/components/game/screenLogic';
import { CLOSED_BELOW, ENDING_RULE_TEXT, SAVED_AT } from '@/components/game/storyNumbers';
import * as rules from '@/game/story/rules';
import { CHAPTER_DEFS } from '@/game/story';

describe('chapter card', () => {
  it('leads with the first sentence of the opening and keeps the rest in order', () => {
    const { hook, rest } = splitHook([
      'Corporate is closing one of its branches on Friday, and this one is on the list. Michael got the memo this morning.',
      'At 15:00 the vice president will phone.'
    ]);
    expect(hook).toBe('Corporate is closing one of its branches on Friday, and this one is on the list.');
    expect(rest).toEqual(['Michael got the memo this morning.', 'At 15:00 the vice president will phone.']);
  });

  it('does not split a time or a single sentence', () => {
    expect(splitHook(['Corporate wants the accounts by 17:00.'])).toEqual({ hook: 'Corporate wants the accounts by 17:00.', rest: [] });
    expect(splitHook([])).toEqual({ hook: '', rest: [] });
  });

  it('every real chapter opens with a hook that is one sentence', () => {
    for (const def of CHAPTER_DEFS) {
      const { hook } = splitHook(def.intro);
      expect(hook.length).toBeGreaterThan(10);
      expect(hook.length).toBeLessThan(160);
    }
  });

  it('pictures the day\'s people, and never points at Thursday\'s suspects', () => {
    expect(dayPicture(1).faces.map((f) => f.id)).toEqual(['michael']);
    expect(dayPicture(2).faces.map((f) => f.id)).toContain('angela');
    expect(dayPicture(2).faces.map((f) => f.id)).toContain('oscar');
    const thursday = dayPicture(4);
    expect(thursday.faces).toEqual([]);
    expect(thursday.icon).toBeTruthy();
  });
});

describe('report', () => {
  it('a won day leads on to the next day and asks before retrying', () => {
    expect(reportActions(true, false)).toEqual({ lead: 'next', confirmRetry: true, nextLabel: 'Next day' });
    expect(reportActions(true, true).nextLabel).toBe('See how the week ended');
  });

  it('a lost day leads with trying again, at once, and still lets you move on', () => {
    const a = reportActions(false, false);
    expect(a.lead).toBe('retry');
    expect(a.confirmRetry).toBe(false);
    expect(a.nextLabel).toBe('Move on anyway');
  });

  it('keeps page one to the first paragraph on phones, all of it on a tablet', () => {
    const text = ['Michael and ten others were in the room.', 'The vice president explained.'];
    expect(resultLines(text, 800)).toEqual({ shown: text, moved: [] });
    expect(resultLines(text, 412)).toEqual({ shown: [text[0]], moved: [text[1]] });
    expect(resultLines(text, 360)).toEqual({ shown: [text[0]], moved: [text[1]] });
    expect(resultLines([text[0]], 360)).toEqual({ shown: [text[0]], moved: [] });
  });

  it('reveals the stamp, then each change, then the count, then the week, in order', () => {
    const { times, countMs } = revealTimes(4, 19);
    expect(times).toHaveLength(1 + 4 + 2);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
    expect(countMs).toBeGreaterThanOrEqual(300);
    expect(countMs).toBeLessThanOrEqual(900);
    // The whole reveal stays short: a tap skips it, but nobody should have to.
    expect(times[times.length - 1]).toBeLessThan(3500);
  });
});

describe('numbers on the screens come from the story rules', () => {
  it('uses the ending thresholds the rules use', () => {
    const r = rules as unknown as { ENDING?: { saved: number; closedBelow: number }; endingFor: (s: number) => string };
    if (r.ENDING) {
      expect(SAVED_AT).toBe(r.ENDING.saved);
      expect(CLOSED_BELOW).toBe(r.ENDING.closedBelow);
    } else {
      expect(r.endingFor(SAVED_AT)).toBe('saved');
      expect(r.endingFor(SAVED_AT - 1)).not.toBe('saved');
      expect(r.endingFor(CLOSED_BELOW - 1)).toBe('closed');
      expect(r.endingFor(CLOSED_BELOW)).not.toBe('closed');
    }
    expect(ENDING_RULE_TEXT).toContain(String(SAVED_AT));
    expect(ENDING_RULE_TEXT).toContain(String(CLOSED_BELOW));
  });
});

describe('title logo', () => {
  it('is a small pixel image, drawn at whole-number scales (132 x 84)', () => {
    const png = readFileSync(resolve(__dirname, '../../src/renderer/src/assets/logo/game-logo.png'));
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    expect([w, h]).toEqual([132, 84]);
  });
});
