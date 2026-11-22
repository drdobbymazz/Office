// The goal stamp: when today's goal (or an extra goal) is settled, the game sets
// UiState.ceremony and plays its sound; this shows it as a rubber stamp that slams onto the
// floor in three steps, shakes by a pixel, holds about a second and a half and steps away.
// Mint for won, coral for lost; extra goals get a smaller stamp. It never takes a tap.

import { useEffect, useState } from 'react';
import type { CeremonyUi } from '@/game/app/gameApi';
import { GIcon } from './icons';
import { useUi } from './ctx';

const HOLD_MAIN = 1500;
const HOLD_EXTRA = 1200;

export function CeremonyBanner({ right, top }: { right: number; top: number }) {
  const c = useUi((s) => s.ceremony);
  const playing = useUi((s) => s.phase === 'playing');
  const [shown, setShown] = useState<CeremonyUi | null>(null);
  useEffect(() => {
    if (!c) return;
    setShown(c);
    const main = c.kind === 'goalWon' || c.kind === 'goalLost';
    const t = window.setTimeout(() => setShown((s) => (s?.id === c.id ? null : s)), (main ? HOLD_MAIN : HOLD_EXTRA) + 200);
    return () => window.clearTimeout(t);
  }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown || !playing) return null;
  const main = shown.kind === 'goalWon' || shown.kind === 'goalLost';
  const won = shown.kind === 'goalWon' || shown.kind === 'extraWon';
  return (
    <div aria-live="polite" style={{
      position: 'absolute', left: 0, right, top, display: 'flex', justifyContent: 'center',
      pointerEvents: 'none', zIndex: 16, padding: '0 8px'
    }}>
      {main ? <MainStamp key={shown.id} c={shown} won={won} /> : <ExtraStamp key={shown.id} c={shown} won={won} />}
    </div>
  );
}

/** Today's goal: big words in Press Start 2P on mint or coral, inside a double ink edge. */
function MainStamp({ c, won }: { c: CeremonyUi; won: boolean }) {
  const fill = won ? 'var(--cth-mint)' : 'var(--cth-coral)';
  return (
    <div className="sc-stamp" style={{ ['--sc-hold' as string]: `${HOLD_MAIN}ms`, maxWidth: '100%' } as React.CSSProperties}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px 10px 10px', background: fill, minWidth: 0,
        boxShadow: 'inset 0 0 0 3px var(--cth-ink-900), inset 0 0 0 5px var(--cth-cream-50), inset 0 0 0 7px var(--cth-ink-900), 4px 4px 0 rgba(26, 19, 32, 0.25)'
      }}>
        <div style={{
          width: 44, height: 44, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--cth-cream-50)',
          boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)', marginLeft: 4
        }}>
          <GIcon name={won ? 'trophy' : 'x'} px={32} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 24, lineHeight: '28px', color: 'var(--cth-ink-900)', whiteSpace: 'nowrap' }}>
            {c.title}
          </span>
          {c.detail && (
            <span style={{ fontSize: 16, lineHeight: '19px', color: 'var(--cth-ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {won ? 'Done: ' : 'Missed: '}{c.detail}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** An extra goal: a small stamp, cream with a mint or coral edge. */
function ExtraStamp({ c, won }: { c: CeremonyUi; won: boolean }) {
  const accent = won ? 'var(--cth-mint)' : 'var(--cth-coral)';
  return (
    <div className="sc-stamp-small" style={{ ['--sc-hold' as string]: `${HOLD_EXTRA}ms`, maxWidth: '100%' } as React.CSSProperties}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 8px', background: 'var(--cth-cream-50)', minWidth: 0,
        boxShadow: `inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 ${accent}, 4px 4px 0 rgba(26, 19, 32, 0.25)`
      }}>
        <span style={{ width: 2 }} />
        <div style={{ width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', background: accent, boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)' }}>
          <GIcon name={won ? 'check' : 'x'} px={16} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '10px', color: 'var(--cth-ink-500)' }}>
            {won ? 'EXTRA GOAL DONE' : 'EXTRA GOAL MISSED'}
          </span>
          <span style={{ fontSize: 16, lineHeight: '19px', color: 'var(--cth-ink-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.title}{c.detail ? <span style={{ color: 'var(--cth-ink-700)' }}>{` · ${c.detail}`}</span> : null}
          </span>
        </div>
      </div>
    </div>
  );
}
