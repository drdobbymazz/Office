// The story's narrator on the floor: the newest story beat (UiState.beat) as a caption at the bottom
// of the floor, in the look of the Log's event rows (lemon bar, icon, plain sentence). It types out,
// stays up for the beat's holdFor seconds, and a newer beat replaces it at once. A tap puts it away
// (and looks at the room it is about, when it names one).

import { useEffect, useRef, useState } from 'react';
import type { BeatUi } from '@/game/app/gameApi';
import { GIcon } from './icons';
import { useGame, useNow, useUi } from './ctx';

/** Letters a second for the typewriter. */
const TYPE_CPS = 42;

export function BeatCaption() {
  const game = useGame();
  const beat = useUi((s) => s.beat);
  const phase = useUi((s) => s.phase);
  const [shown, setShown] = useState<{ beat: BeatUi; at: number } | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!beat) { setShown(null); return; }
    setShown({ beat, at: performance.now() });
    // Long enough to type it out and read it, never shorter than the beat asks for.
    const typeFor = beat.text.length / TYPE_CPS;
    timer.current = window.setTimeout(() => setShown(null), Math.max(beat.holdFor, typeFor + 2.5) * 1000);
    return () => window.clearTimeout(timer.current);
  }, [beat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typing = !!shown && (performance.now() - shown.at) / 1000 < shown.beat.text.length / TYPE_CPS;
  useNow(40, typing);
  if (!shown || phase !== 'playing') return null;
  const b = shown.beat;
  // Read the clock here (the hook only re-renders), so the last frame always shows the whole line.
  const count = Math.min(b.text.length, Math.floor(((performance.now() - shown.at) / 1000) * TYPE_CPS));
  const done = count >= b.text.length;

  return (
    <button key={b.id} type="button" className="gu-hit gu-drop" data-avoid aria-label={b.text}
      onClick={() => {
        game.uiSound('tap');
        if (b.room && b.room !== 'outside') game.focusRoom(b.room as never);
        setShown(null);
      }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: 'min(540px, 100%)', minWidth: 0, padding: '8px 12px 8px 14px',
        border: 'none', textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation',
        background: 'var(--cth-lemon-light)',
        boxShadow: 'inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 var(--cth-lemon), 4px 4px 0 rgba(26, 19, 32, 0.25)',
        fontFamily: 'var(--cth-font-ui)', color: 'var(--cth-ink-900)'
      }}>
      <span style={{ width: 2, flexShrink: 0 }} />
      <GIcon name={b.icon || 'quote'} px={16} style={{ marginTop: 2 }} />
      {/* The whole sentence is laid out from the start (the rest is clear), so the box never jumps as it types. */}
      <span style={{ fontSize: 16, lineHeight: '20px', minWidth: 0 }}>
        <span className={done ? undefined : 'gu-caret'}>{b.text.slice(0, count)}</span>
        {!done && <span style={{ color: 'transparent' }}>{b.text.slice(count)}</span>}
      </span>
    </button>
  );
}
