// Plain sentences the person card builds from what someone is doing and where.
import { describe, expect, it } from 'vitest';
import { doingWhere } from '@/components/game/words';

describe('doingWhere', () => {
  it('names the room when the activity does not', () => {
    expect(doingWhere('typing', 'the bullpen')).toBe('Typing in the bullpen.');
    expect(doingWhere('talking to Jim', 'the break room')).toBe('Talking to Jim in the break room.');
  });

  it('says the place once when the activity already has one', () => {
    expect(doingWhere('hiding in his office', 'the bullpen')).toBe('Hiding in his office.');
    expect(doingWhere('waiting in the conference room as asked', 'the conference room')).toBe('Waiting in the conference room as asked.');
    expect(doingWhere('typing at his desk', 'the bullpen')).toBe('Typing at his desk.');
  });

  it('is on the pavement, not in it', () => {
    expect(doingWhere('arriving for work', 'the pavement outside')).toBe('Arriving for work on the pavement outside.');
  });

  it('copes with nothing to say', () => {
    expect(doingWhere('', 'the annex')).toBe('Standing about in the annex.');
  });
});
