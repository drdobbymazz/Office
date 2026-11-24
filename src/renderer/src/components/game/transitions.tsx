// Moving between screens. One transition for every change of screen (title, chapter card, the day,
// the report, the ending): a sheet of cream office paper crosses the screen in six steps, about
// 240 ms, with the `wipe` sound. The screen underneath changes while the sheet covers it. And a
// band across the floor as each day starts ("TUESDAY", "Day 2 of 5 · Not Speaking").

import { useEffect, useRef, useState } from 'react';
import type { GameApi } from '@/game/app/gameApi';
import { useUi } from './ctx';
import { reducedMotion } from './screenKit';

/** How long each half of the wipe takes (3 steps each). */
const HALF = 120;

/**
 * The screen to show for `key`, a step behind it: when `key` changes, the paper sheet covers the
 * old screen first, then the new one is shown and the sheet moves off. Returns the key to render
 * and the wipe overlay.
 */
export function useScreenWipe(key: string, game: GameApi): { shown: string; wipe: JSX.Element | null } {
  const [shown, setShown] = useState(key);
  const [phase, setPhase] = useState<'cover' | 'reveal' | null>(() => (reducedMotion() ? null : 'reveal'));
  const first = useRef(true);
  useEffect(() => {
    // On first mount the sheet only moves off: the start-up splash gives way to the title smoothly.
    if (first.current) {
      first.current = false;
      const t = window.setTimeout(() => setPhase(null), HALF + 40);
      return () => window.clearTimeout(t);
    }
    if (key === shown) { setPhase(null); return; }
    if (reducedMotion()) { setShown(key); setPhase(null); return; }
    setPhase('cover');
    game.uiSound('wipe');
    const t1 = window.setTimeout(() => { setShown(key); setPhase('reveal'); }, HALF);
    const t2 = window.setTimeout(() => setPhase(null), HALF * 2 + 40);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const wipe = phase ? (
    <div className={`sc-wipe ${phase}`} key={phase} aria-hidden>
      <div className="sc-wipe-sheet" />
    </div>
  ) : null;
  return { shown, wipe };
}

/**
 * As a day starts: a lemon band across the floor with the weekday and the chapter, in four steps
 * on, a second's hold and four steps off. It never takes a tap.
 */
export function DayBand({ right, bottom }: { right: number; bottom: number }) {
  const st = useUi((s) => ({
    weekday: s.weekday, day: s.day,
    chapter: s.story?.chapter ?? 0, chapters: s.story?.chapters ?? 0, title: s.story?.title ?? '',
    unitLabel: s.story?.unitLabel ?? 'Day',
  }));
  return (
    <div aria-hidden style={{ position: 'absolute', left: 0, right, top: 0, bottom, pointerEvents: 'none', overflow: 'hidden', zIndex: 15 }}>
      <div className="sc-band" style={{
        position: 'absolute', left: 0, right: 0, top: '38%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '10px 16px 9px', background: 'var(--cth-lemon)',
        boxShadow: 'inset 0 2px 0 var(--cth-ink-900), inset 0 -2px 0 var(--cth-ink-900), 0 4px 0 rgba(26, 19, 32, 0.25)'
      }}>
        <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 16, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>
          {st.weekday.toUpperCase()}
        </span>
        <span style={{ fontSize: 15, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
          {st.chapter ? `${st.unitLabel} ${st.chapter} of ${st.chapters} · ${st.title}` : `Day ${st.day}`}
        </span>
      </div>
    </div>
  );
}

/** Shows the day band for a moment whenever `dayKey` (a count of days started) goes up. */
export function useDayBand(dayKey: number): boolean {
  const [on, setOn] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    if (!dayKey || dayKey === last.current) return;
    last.current = dayKey;
    if (reducedMotion()) return;
    setOn(true);
    const t = window.setTimeout(() => setOn(false), 1450);
    return () => window.clearTimeout(t);
  }, [dayKey]);
  return on;
}

/**
 * A list that lets its items leave: an item removed from `items` stays in the result for `ms`
 * with `out: true` (so it can play an exit), in the place it had. New items join at the end.
 */
export function useLeaving<T>(items: readonly T[], keyOf: (t: T) => string, ms = 170): { item: T; key: string; out: boolean }[] {
  const [, redraw] = useState(0);
  const gone = useRef(new Map<string, { item: T; until: number }>());
  const prev = useRef<readonly T[]>(items);
  const order = useRef<string[]>(items.map(keyOf));
  // Worked out while rendering, so a removed item never vanishes for a frame before it leaves.
  if (prev.current !== items) {
    const keys = new Set(items.map(keyOf));
    if (!reducedMotion()) {
      for (const t of prev.current) {
        const k = keyOf(t);
        if (!keys.has(k) && !gone.current.has(k)) gone.current.set(k, { item: t, until: performance.now() + ms });
      }
    }
    for (const k of keys) gone.current.delete(k);
    prev.current = items;
  }
  useEffect(() => {
    if (!gone.current.size) return;
    const soonest = Math.min(...Array.from(gone.current.values(), (g) => g.until));
    const t = window.setTimeout(() => {
      const now = performance.now();
      for (const [k, g] of gone.current) if (g.until <= now + 4) gone.current.delete(k);
      redraw((n) => n + 1);
    }, Math.max(0, soonest - performance.now()) + 4);
    return () => window.clearTimeout(t);
  });
  const live = new Map(items.map((t) => [keyOf(t), t] as const));
  const out: { item: T; key: string; out: boolean }[] = [];
  for (const k of order.current) {
    const t = live.get(k);
    if (t !== undefined) out.push({ item: t, key: k, out: false });
    else { const g = gone.current.get(k); if (g) out.push({ item: g.item, key: k, out: true }); }
  }
  const placed = new Set(out.map((x) => x.key));
  for (const [k, t] of live) if (!placed.has(k)) out.push({ item: t, key: k, out: false });
  order.current = out.map((x) => x.key);
  return out;
}
