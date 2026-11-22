// Where the speech bubbles go. The rules: the newest line gets the best spot; at most a few full
// bubbles at once; two text boxes never overlap, and nothing sits on the HUD; a line with no room
// becomes a small "..." tag over the speaker's head until there is room. Pure, so it is tested
// without a screen (tests/ui/bubbleLayout.test.ts).

export interface Box { l: number; t: number; r: number; b: number }

export interface BubbleIn {
  id: string;
  /** The speaker's head on screen. */
  hx: number;
  hy: number;
  /** Size of the full bubble. */
  w: number;
  h: number;
  /** Height of its tail (or thought puffs). */
  tailH: number;
  /** How far below the head the body ends on screen (a flipped bubble starts there). */
  below: number;
  /** When the line started: newer lines are placed first. */
  startedAt: number;
  /** Stay a tag this time (it only just became one: no flicker). */
  holdTag?: boolean;
}

export interface BubbleOut {
  id: string;
  full: boolean;
  left: number;
  top: number;
  /** Below the speaker, tail pointing up. */
  flipped: boolean;
}

export interface Area { minX: number; maxX: number; minY: number; maxY: number }

/** At most this many full bubbles at once. */
export const MAX_FULL = 3;
export const TAG_W = 22;
export const TAG_H = 14;
const GAP = 4;
/** A bubble further than this from its speaker no longer reads as theirs. */
const REACH_ABOVE = 100;
const REACH_BELOW = 130;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function overlaps(a: Box, b: Box, margin: number): boolean {
  return a.l < b.r + margin && a.r > b.l - margin && a.t < b.b + margin && a.b > b.t - margin;
}

/** The best free spot for a full bubble, or null when there is none near the speaker. */
function findSpot(it: BubbleIn, taken: Box[], area: Area): { left: number; top: number; flipped: boolean } | null {
  const wantLeft = clamp(it.hx - it.w / 2, area.minX, area.maxX - it.w);
  const wantTop = it.hy - GAP - it.tailH - it.h;
  const belowTop = it.hy + it.below + it.tailH;
  const tops = [wantTop, belowTop];
  const lefts = [wantLeft];
  for (const d of taken) {
    tops.push(d.t - it.h - GAP, d.b + GAP);
    lefts.push(d.l - it.w - GAP, d.r + GAP);
  }
  let best: { left: number; top: number; flipped: boolean; score: number } | null = null;
  for (const t0 of tops) {
    const t = clamp(t0, area.minY, area.maxY - it.h);
    // Above the head or below the body, never over the speaker.
    const above = t + it.h <= it.hy - it.tailH + 2;
    const under = t >= it.hy + it.below - 2;
    if (!above && !under) continue;
    if (above ? it.hy - (t + it.h) > REACH_ABOVE : t - it.hy > REACH_BELOW) continue;
    for (const l0 of lefts) {
      // The bubble spans the head's x, so the tail can reach it.
      const l = clamp(clamp(l0, it.hx - it.w + 12, it.hx - 12), area.minX, area.maxX - it.w);
      const box = { l, t, r: l + it.w, b: t + it.h };
      if (taken.some((d) => overlaps(box, d, 2))) continue;
      const score = Math.abs(t - wantTop) + Math.abs(l - wantLeft) * 0.7 + (above ? 0 : 30);
      if (!best || score < best.score) best = { left: l, top: t, flipped: !above, score };
    }
  }
  return best ? { left: best.left, top: best.top, flipped: best.flipped } : null;
}

/**
 * Place every live line: full bubbles (newest first, at most `maxFull`, never overlapping each other
 * or the obstacles), the rest as tags over their speakers.
 */
export function layoutBubbles(items: BubbleIn[], obstacles: Box[], area: Area, maxFull = MAX_FULL): BubbleOut[] {
  const order = [...items].sort((a, b) => b.startedAt - a.startedAt);
  const taken: Box[] = obstacles.slice();
  const out: BubbleOut[] = [];
  let full = 0;
  for (const it of order) {
    const spot = full < maxFull && !it.holdTag ? findSpot(it, taken, area) : null;
    if (spot) {
      taken.push({ l: spot.left, t: spot.top, r: spot.left + it.w, b: spot.top + it.h });
      out.push({ id: it.id, full: true, ...spot });
      full++;
    } else {
      const left = clamp(it.hx - TAG_W / 2, area.minX, area.maxX - TAG_W);
      const top = clamp(it.hy - it.tailH - TAG_H - 2, area.minY, area.maxY - TAG_H);
      out.push({ id: it.id, full: false, left, top, flipped: false });
    }
  }
  return out;
}
