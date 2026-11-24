// The story's first-day coach (Monday, once: settings.storyCoachDone). It waits until Michael is on
// the floor, pauses the day, and walks through what Monday needs: the goal row, Michael's card and what
// he is sure of, saying something over the loudspeaker, and picking people up. It ends on the mission.
// The day carries on when it is done or skipped.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PixelPanel } from '@/components/PixelPanel';
import { Btn } from './kit';
import { useGame, useUi } from './ctx';
import { useNav } from './Dock';
import { showPowersTool } from './PowersTab';
import { hudBottom } from './Hud';

interface Mark {
  text: string;
  /** Get the panel ready for this step (open a tab, a card ...). */
  prepare?: () => void;
  /** Where to point, or null to sit in the middle. */
  find: () => DOMRect | null;
}

const W = 244;

/** Left edge of the panel (or the screen's right edge if it is not there). */
function railLeft(): number {
  return document.querySelector('[data-coach="tab-director"]')?.getBoundingClientRect().left ?? window.innerWidth;
}

function rectOf(sel: string): DOMRect | null {
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

export function StoryCoach() {
  const game = useGame();
  const nav = useNav();
  const episodeId = useUi((s) => s.story?.episodeId ?? 'office');
  const chapter = useUi((s) => s.story?.chapter ?? 0);
  const goalTitle = useUi((s) => s.story?.goal.title ?? '');
  const done = useUi((s) => s.settings.storyCoachDone);
  const finishing = useUi((s) => s.finishing);
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const resumeAfter = useRef(false);
  // The steps steer the panel through a ref, so a tab change does not restart the current step.
  const navRef = useRef(nav);
  navRef.current = nav;
  const live = episodeId === 'office' && chapter === 1 && !done && !finishing;

  // Start once Michael is on the floor and can be seen.
  useEffect(() => {
    if (!live || started) return;
    const t = window.setInterval(() => {
      const m = game.store.getState().people.find((p) => p.id === 'michael');
      if (m?.present && game.headOnScreen('michael').visible) {
        resumeAfter.current = !game.store.getState().paused;
        game.setPaused(true);
        setStarted(true);
      }
    }, 400);
    return () => window.clearInterval(t);
  }, [live, started, game]);

  const marks: Mark[] = useMemo(() => [
    {
      text: `This row is today's job: ${goalTitle}. It shows how close you are. Tap it any time for the details. The day is paused while you read.`,
      prepare: () => navRef.current.setOpen(true),
      find: () => rectOf('button[aria-label^="Today\'s goal"]')
    },
    {
      text: "Michael is the problem. His card shows what he is sure of, in the lilac box. A whisper puts a new thought in his head instead.",
      prepare: () => { navRef.current.go('people'); navRef.current.openPerson('michael'); },
      find: () => {
        const el = document.querySelector('[data-coach="conviction"]') as HTMLElement | null;
        if (el) el.scrollIntoView({ block: 'nearest' });
        return rectOf('[data-coach="conviction"]');
      }
    },
    {
      text: 'Say something over the loudspeaker. An announcement that names a room sends people there. Not everyone listens.',
      prepare: () => { showPowersTool('announce'); navRef.current.go('powers'); },
      find: () => rectOf('[data-coach="announce"] textarea')
    },
    {
      text: 'Or use your hand: press and hold anyone on the floor, then drag them where you want them. It is free, and they stay put for a while.',
      prepare: () => navRef.current.setOpen(false),
      find: () => {
        const limitX = railLeft() - 30;
        const top = hudBottom(true) + 30;
        const ppl = game.store.getState().people.filter((p) => p.present && p.id !== 'michael');
        let best: { x: number; y: number; d: number } | null = null;
        for (const p of ppl) {
          const h = game.headOnScreen(p.id);
          if (!h.visible || h.x < 30 || h.x > limitX || h.y < top || h.y > window.innerHeight - 60) continue;
          // Someone near the middle of the floor reads best.
          const d = Math.abs(h.x - limitX / 2) + Math.abs(h.y - window.innerHeight / 2);
          if (!best || d < best.d) best = { x: h.x, y: h.y, d };
        }
        return best ? new DOMRect(best.x - 12, best.y, 24, 32) : null;
      }
    },
    {
      text: 'Everything about today is in the Director tab: the goal, the extra goals and clues. Good luck.',
      prepare: () => navRef.current.go('director'),
      find: () => rectOf('[data-mission]')
    }
  ], [game, goalTitle]);

  const mark = marks[Math.min(i, marks.length - 1)];
  useLayoutEffect(() => {
    if (!started) return;
    mark.prepare?.();
    const tick = () => setRect(mark.find());
    const first = window.setTimeout(tick, 80);
    const t = window.setInterval(tick, 300);
    return () => { window.clearTimeout(first); window.clearInterval(t); };
  }, [mark, started]);

  // The card's real height (its text wraps differently on each step), so it is never placed over its target.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(190);
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 2) setCardH(h);
  });

  if (!live || !started) return null;

  const finish = () => {
    game.updateSettings({ storyCoachDone: true, tutorialDone: true });
    if (resumeAfter.current) game.setPaused(false);
  };
  const next = () => { game.uiSound('tap'); if (i < marks.length - 1) setI(i + 1); else finish(); };
  const skip = () => { game.uiSound('close'); finish(); };

  const { style, arrow } = placeCard(rect, cardH, window.innerHeight, railLeft());
  return (
    <>
      {arrow && (
        <div style={{ position: 'absolute', left: arrow.x, top: arrow.y, pointerEvents: 'none', zIndex: 30,
          animation: `${arrow.dir === 'right' ? 'gu-point-right' : 'gu-point-down'} 0.8s steps(1) infinite` }}>
          <div style={{ transform: arrow.dir === 'up' ? 'rotate(180deg)' : arrow.dir === 'right' ? 'rotate(-90deg)' : undefined }}>
            <PointerArrow />
          </div>
        </div>
      )}
      <div ref={cardRef} className="gu-hit gu-pop" style={{ position: 'absolute', width: W, zIndex: 31, ...style }}>
        <PixelPanel variant="dialog" noPadding style={{ boxShadow: 'var(--cth-panel-border-dialog), 4px 4px 0 rgba(26, 19, 32, 0.25)' }}>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px', padding: '3px 4px 1px', background: 'var(--cth-lemon)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-900)' }}>
                MONDAY · {i + 1} / {marks.length}
              </span>
            </div>
            <div style={{ fontSize: 15, lineHeight: '19px' }}>{mark.text}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" size="md" onClick={skip} sound={null}>Skip</Btn>
              <Btn variant="primary" size="md" full onClick={next} sound={null}>{i < marks.length - 1 ? 'Next' : 'Start'}</Btn>
            </div>
          </div>
        </PixelPanel>
      </div>
    </>
  );
}

type Arrow = { dir: 'right' | 'down' | 'up'; x: number; y: number };

/**
 * Where the card goes: to the left of anything in the panel, else below its target when it fits
 * there, else above. Tall targets (a whole section) are pointed at near their top.
 */
function placeCard(rect: DOMRect | null, cardH: number, vh: number, rail: number): { style: React.CSSProperties; arrow: Arrow | null } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  if (!rect) return { style: { left: Math.max(8, (rail - W) / 2), top: Math.max(8, (vh - cardH) / 2) }, arrow: null };
  const ax = rect.left + Math.min(rect.width / 2, 60);
  const ay = rect.top + Math.min(rect.height / 2, 30);
  if (rect.left >= rail - 4) {
    return {
      style: { left: Math.max(8, rect.left - W - 28), top: clamp(ay - cardH / 2, 8, vh - cardH - 8) },
      arrow: { dir: 'right', x: rect.left - 24, y: clamp(ay - 8, 8, vh - 28) }
    };
  }
  const roomBelow = vh - rect.bottom - 36;
  const roomAbove = rect.top - 34;
  if (roomBelow >= cardH || roomBelow >= roomAbove) {
    return {
      style: { left: clamp(ax - 40, 8, rail - W - 8), top: Math.min(rect.bottom + 28, vh - cardH - 8) },
      arrow: { dir: 'up', x: ax - 8, y: rect.bottom + 4 }
    };
  }
  return {
    style: { left: clamp(ax - W / 2, 8, rail - W - 8), top: Math.max(8, rect.top - cardH - 26) },
    arrow: { dir: 'down', x: ax - 8, y: rect.top - 22 }
  };
}

function PointerArrow() {
  // A chunky pixel arrow pointing down, ink outline and lemon fill (the same as the first-run coach).
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" shapeRendering="crispEdges" style={{ display: 'block' }}>
      <path d="M5 0h6v10h4v2h-1v1h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4v-1H3v-1H2v-1H1v-2h4z" fill="var(--cth-ink-900)" />
      <path d="M6 1h4v10h3v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4v-1H3v-1h3z" fill="var(--cth-lemon)" />
    </svg>
  );
}
