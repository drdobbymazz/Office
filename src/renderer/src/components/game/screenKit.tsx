// Small parts shared by the full-screen cards (title, chapter card, report, ending): a scroll area
// that says when there is more below, page dots, staged reveals and a count-up. Built from the
// same pieces as the rest of the overlay (ink edges, cream fills, step animations).

import { CSSProperties, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GIcon } from './icons';

export function reducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/**
 * A scrolling column for a card's body. When more is hidden below, a dithered cream fade covers
 * the cut and a small chevron button (which scrolls on) shows; at the bottom both go away.
 */
export function ScrollArea({ children, style, inner, fade = 'var(--cth-cream-50)', onEnd }: {
  children: ReactNode;
  /** The outer box (sizing in the card's layout). */
  style?: CSSProperties;
  /** The scrolling column itself (padding, gap, direction). */
  inner?: CSSProperties;
  /** The colour behind the content, for the fade. */
  fade?: string;
  /** Called once when the reader reaches the bottom. */
  onEnd?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  const ended = useRef(false);
  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollHeight - el.clientHeight - el.scrollTop;
    setMore(left > 4);
    if (left <= 4 && !ended.current) { ended.current = true; onEnd?.(); }
  }, [onEnd]);
  useLayoutEffect(() => {
    check();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [check, children]);
  const down = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ top: Math.max(40, el.clientHeight - 48), behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  return (
    <div style={{ position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column', ...style }}>
      <div ref={ref} className="sc-scroll gu-hit" onScroll={check}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', ...inner }}>
        {children}
      </div>
      {more && (
        <>
          <div className="sc-more" style={{ ['--sc-fade-bg' as string]: fade } as CSSProperties} />
          <button type="button" className="sc-chev" aria-label="More below" onClick={down}>
            <span style={{ display: 'block', transform: 'rotate(90deg)' }}><GIcon name="chev-right" px={16} /></span>
          </button>
        </>
      )}
    </div>
  );
}

/** Two or more pages: square dots, the current one filled. */
export function PageDots({ n, at, onPick }: { n: number; at: number; onPick?: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} aria-label={`Page ${at + 1} of ${n}`}>
      {Array.from({ length: n }, (_, i) => (
        <button key={i} type="button" className="gu-hit" aria-label={`Page ${i + 1}`} onClick={() => onPick?.(i)}
          style={{ border: 'none', padding: 8, margin: -8 + 2, background: 'transparent', cursor: 'pointer', touchAction: 'manipulation' }}>
          <span className={`sc-dot${i === at ? ' on' : ''}`} style={{ display: 'block' }} />
        </button>
      ))}
    </div>
  );
}

/**
 * A staged reveal: returns how many stages have been reached. `times` are the delays (ms from
 * the start) at which each stage begins. `skip()` jumps to the end. With reduced motion, or when
 * `instant`, everything is there at once.
 */
export function useStages(times: number[], opts: { instant?: boolean; onStage?: (i: number) => void } = {}): { stage: number; skip: () => void; done: boolean } {
  const all = times.length;
  const [stage, setStage] = useState(() => (opts.instant || reducedMotion() ? all : 0));
  const onStage = useRef(opts.onStage);
  onStage.current = opts.onStage;
  useEffect(() => {
    if (stage >= all) return;
    const t = window.setTimeout(() => {
      setStage((s) => {
        const n = Math.min(all, s + 1);
        onStage.current?.(n - 1);
        return n;
      });
    }, Math.max(0, times[stage] - (stage > 0 ? times[stage - 1] : 0)));
    return () => window.clearTimeout(t);
  }, [stage, all, times]);
  const skip = useCallback(() => setStage(all), [all]);
  return { stage, skip, done: stage >= all };
}

/**
 * Counts from `from` to `to` once `run` is true, one whole number at a time, over about `ms`.
 * Calls `onStep` for each number shown (for the tick sound).
 */
export function useCountUp(from: number, to: number, run: boolean, ms: number, onStep?: (v: number) => void): number {
  const a = Math.round(from), b = Math.round(to);
  const [v, setV] = useState(a);
  const step = useRef(onStep);
  step.current = onStep;
  useEffect(() => { if (!run) setV(a); }, [a, run]);
  useEffect(() => {
    if (!run) return;
    if (reducedMotion() || a === b) { setV(b); return; }
    const n = Math.abs(b - a);
    const dir = b > a ? 1 : -1;
    const every = Math.max(24, Math.min(90, ms / n));
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      const next = a + dir * i;
      setV(next);
      step.current?.(next);
      if (i >= n) window.clearInterval(t);
    }, every);
    return () => window.clearInterval(t);
  }, [a, b, run, ms]);
  return v;
}

/** Keep the last non-null value, so a card can finish leaving after its data has gone. */
export function useLast<T>(v: T | null | undefined): T | null {
  const ref = useRef<T | null>(v ?? null);
  if (v !== null && v !== undefined) ref.current = v;
  return ref.current;
}
