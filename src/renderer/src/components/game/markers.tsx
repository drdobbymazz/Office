// Name tags over the people today's story is about, shown while the camera is zoomed out (when
// everyone is about ten pixels wide and Michael is hard to tell from Jim). They hide when the
// camera is close, while the person speaks, and while they are held or selected.

import { useEffect, useMemo, useRef } from 'react';
import type { CharId } from '@/game/core/types';
import { useGame, useUi } from './ctx';
import { storyMarks } from './screenLogic';

/** Camera zoom at and above which faces are easy to tell apart, so the tags step aside. */
const CLOSE_ZOOM = 2;

export function StoryMarkers() {
  const game = useGame();
  const chapter = useUi((s) => (s.mode === 'story' && s.story && !s.story.saga ? s.story.chapter : 0));
  const ids = useMemo(() => storyMarks(chapter), [chapter]);
  const names = useUi((s) => ids.map((id) => s.people.find((p) => p.id === id)?.name ?? '').join('|'));
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!ids.length) return;
    let raf = 0;
    const frame = (): void => {
      raf = requestAnimationFrame(frame);
      const st = game.store.getState();
      const speaking = new Set(game.activeSpeech().map((sp) => sp.who));
      ids.forEach((id, i) => {
        const el = refs.current[i];
        if (!el) return;
        const head = game.headOnScreen(id as CharId);
        const p = st.people.find((x) => x.id === id);
        const show = head.visible && head.scale < CLOSE_ZOOM && !!p?.present && !speaking.has(id as CharId)
          && st.holding !== id && st.selectedId !== id && !st.finishing;
        el.style.display = show ? 'block' : 'none';
        if (show) el.style.transform = `translate(${Math.round(head.x)}px, ${Math.round(head.y) - 3}px) translate(-50%, -100%)`;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ids, game]);

  if (!ids.length) return null;
  const list = names.split('|');
  return (
    <>
      {ids.map((id, i) => (
        <div key={id} ref={(el) => { refs.current[i] = el; }} aria-hidden="true"
          style={{
            display: 'none', position: 'absolute', left: 0, top: 0, pointerEvents: 'none', whiteSpace: 'nowrap',
            padding: '2px 4px 1px', background: 'var(--cth-lemon)', color: 'var(--cth-ink-900)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-900), 1px 1px 0 rgba(26, 19, 32, 0.35)',
            fontFamily: 'var(--cth-font-display)', fontSize: 6, lineHeight: '8px', letterSpacing: 0
          }}>
          {(list[i] || '').toUpperCase()}
        </div>
      ))}
    </>
  );
}
