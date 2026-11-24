// Name tags over the people today's story is about, shown while the camera is zoomed out (when
// everyone is about ten pixels wide and Michael is hard to tell from Jim). They hide when the
// camera is close, while the person speaks, and while they are held or selected.
//
// A chapter may name its own tags for right now (`StoryUi.marks`), each with a few words ("has the
// tape"): those go on a second, lighter line of the same tag. Without them, the fixed list for the
// day (screenLogic.storyMarks) is used. A tag that would sit under the HUD block steps aside.

import { useEffect, useMemo, useRef } from 'react';
import type { CharId } from '@/game/core/types';
import { useGame, useUi } from './ctx';
import { STRIP_W, hudBottom } from './hudGeometry';
import { markList } from './screenLogic';

/** Camera zoom at and above which faces are easy to tell apart, so the tags step aside. */
const CLOSE_ZOOM = 2;

export function StoryMarkers() {
  const game = useGame();
  const chapter = useUi((s) => (s.mode === 'story' && s.story && !s.story.saga ? s.story.chapter : 0));
  const episodeId = useUi((s) => s.story?.episodeId);
  // A string key, so a fresh but equal list from the store does not restart the frame loop.
  const marksKey = useUi((s) => (s.story?.marks ? JSON.stringify(s.story.marks) : ''));
  const tags = useMemo(
    () => markList(chapter, episodeId, marksKey ? (JSON.parse(marksKey) as { id: string; label?: string }[]) : undefined),
    [chapter, episodeId, marksKey]
  );
  const ids = useMemo(() => tags.map((t) => t.id), [tags]);
  const names = useUi((s) => ids.map((id) => s.people.find((p) => p.id === id)?.name ?? '').join('|'));
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!ids.length) return;
    let raf = 0;
    const frame = (): void => {
      raf = requestAnimationFrame(frame);
      const st = game.store.getState();
      const speaking = new Set(game.activeSpeech().map((sp) => sp.who));
      // The HUD block (status strip and mission row) in the top left corner, with a little margin.
      const hudR = STRIP_W + 24;
      const hudB = hudBottom(!!st.story) + 2;
      ids.forEach((id, i) => {
        const el = refs.current[i];
        if (!el) return;
        const head = game.headOnScreen(id as CharId);
        const p = st.people.find((x) => x.id === id);
        let show = head.visible && head.scale < CLOSE_ZOOM && !!p?.present && !speaking.has(id as CharId)
          && st.holding !== id && st.selectedId !== id && !st.finishing;
        const x = Math.round(head.x);
        const y = Math.round(head.y) - 3;
        if (show) {
          const w = el.offsetWidth || 40;
          const h = el.offsetHeight || 10;
          if (x - w / 2 < hudR && y - h < hudB) show = false;
        }
        el.style.visibility = show ? 'visible' : 'hidden';
        if (show) el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ids, game]);

  if (!ids.length) return null;
  const list = names.split('|');
  return (
    <>
      {tags.map((t, i) => (
        <div key={t.id} ref={(el) => { refs.current[i] = el; }} aria-hidden="true"
          style={{
            // Hidden but laid out, so its size is known before it is first placed.
            visibility: 'hidden', position: 'absolute', left: 0, top: 0, pointerEvents: 'none', whiteSpace: 'nowrap',
            // The ink behind the lines is the tag's 1 px outline and the rule between its two lines.
            display: 'flex', flexDirection: 'column', gap: 1, padding: 1, background: 'var(--cth-ink-900)', color: 'var(--cth-ink-900)',
            boxShadow: '1px 1px 0 rgba(26, 19, 32, 0.35)',
          }}>
          <span style={{
            textAlign: 'center', padding: '1px 3px 0', background: 'var(--cth-lemon)',
            fontFamily: 'var(--cth-font-display)', fontSize: 6, lineHeight: '8px', letterSpacing: 0
          }}>
            {(list[i] || '').toUpperCase()}
          </span>
          {t.label && (
            <span style={{
              textAlign: 'center', padding: '0 3px', background: 'var(--cth-cream-50)',
              color: 'var(--cth-ink-700)', fontFamily: 'var(--cth-font-mono)', fontSize: 11, lineHeight: '9px'
            }}>
              {t.label}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
