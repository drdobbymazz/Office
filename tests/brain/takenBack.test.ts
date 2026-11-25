// An order that is taken back at the end is read whole, so its first half is never acted on alone.
import { describe, expect, it } from 'vitest';
import { splitCompoundDirective } from '@/game/brain/instinct';

describe('compound orders that are taken back', () => {
  it('keeps "punch Jim; never mind" as one step', () => {
    expect(splitCompoundDirective('punch Jim; never mind')).toEqual(['punch Jim; never mind']);
    expect(splitCompoundDirective("go to the kitchen then punch Kevin. Just kidding, don't.")).toHaveLength(1);
  });

  it('still splits an ordinary chain into steps', () => {
    expect(splitCompoundDirective('go to the kitchen then punch Kevin')).toEqual(['go to the kitchen', 'punch Kevin']);
  });
});
