// The speech bubble rules: newest first, at most three full bubbles, no two text boxes overlapping,
// nothing on the HUD, and a tag when there is no room.
import { describe, expect, it } from 'vitest';
import { layoutBubbles, MAX_FULL, type Box, type BubbleIn } from '@/components/game/bubbleLayout';

const area = { minX: 4, maxX: 600, minY: 4, maxY: 408 };

function bubble(id: string, hx: number, hy: number, startedAt: number, w = 150, h = 34): BubbleIn {
  return { id, hx, hy, w, h, tailH: 6, below: 40, startedAt };
}

function overlap(a: Box, b: Box): boolean {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
}

describe('bubble layout', () => {
  it('puts a lone line right above its speaker', () => {
    const [p] = layoutBubbles([bubble('a', 300, 200, 1)], [], area);
    expect(p.full).toBe(true);
    expect(p.flipped).toBe(false);
    expect(p.top + 34).toBeLessThanOrEqual(200 - 6);
    expect(p.left).toBeLessThan(300);
    expect(p.left + 150).toBeGreaterThan(300);
  });

  it('never lets two full bubbles overlap, and shows at most three', () => {
    // Five people talking in a tight group, the classic crowded conference room.
    const items = [0, 1, 2, 3, 4].map((i) => bubble(`p${i}`, 250 + i * 14, 180 + (i % 2) * 8, i));
    const out = layoutBubbles(items, [], area);
    const full = out.filter((o) => o.full);
    expect(full.length).toBeLessThanOrEqual(MAX_FULL);
    const boxes = full.map((o) => ({ l: o.left, t: o.top, r: o.left + 150, b: o.top + 34 }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j])).toBe(false);
    expect(out.length).toBe(5);
  });

  it('gives the newest line the best spot', () => {
    const older = bubble('old', 300, 200, 1);
    const newer = bubble('new', 306, 200, 2);
    const out = layoutBubbles([older, newer], [], area);
    const n = out.find((o) => o.id === 'new')!;
    expect(n.full).toBe(true);
    expect(n.flipped).toBe(false);
    expect(Math.abs(n.left - (306 - 75))).toBeLessThan(2);
  });

  it('keeps clear of the HUD', () => {
    const hud: Box = { l: 8, t: 4, r: 328, b: 66 };
    const [p] = layoutBubbles([bubble('a', 120, 90, 1)], [hud], area);
    if (p.full) expect(overlap({ l: p.left, t: p.top, r: p.left + 150, b: p.top + 34 }, hud)).toBe(false);
    else expect(p.full).toBe(false);
  });

  it('turns a line with no room into a tag over the speaker', () => {
    const tiny = { minX: 0, maxX: 120, minY: 0, maxY: 60 };
    const [p] = layoutBubbles([bubble('a', 60, 30, 1, 110, 40)], [], tiny);
    expect(p.full).toBe(false);
    expect(p.top).toBeLessThan(30);
  });

  it('holds a fresh tag as a tag', () => {
    const it = { ...bubble('a', 300, 200, 1), holdTag: true };
    expect(layoutBubbles([it], [], area)[0].full).toBe(false);
  });
});
