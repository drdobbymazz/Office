// Small things over the floor: the status strip (top-left), running events and
// toasts (top-centre), the subtitle line (bottom-centre) and the offline banner.
// Only real controls take touches; the rest lets them through to the floor.

import { CSSProperties, useEffect, useState } from 'react';
import { CHAOS } from '@/game/core/chaos';
import { formatClock } from '@/game/core/types';
import { GIcon } from './icons';
import { Bar, Btn, Head, IconTile, Pips, StandingBar, usePress } from './kit';
import { useGame, useNow, useUi } from './ctx';
import { readableOnCream } from './words';
import { tileBg, tileIcon } from './Story';
import { useLeaving } from './transitions';

const toastKey = (t: { id: string }) => t.id;

const chipPanel: CSSProperties = {
  background: 'var(--cth-cream-100)',
  boxShadow: 'var(--cth-panel-border), 4px 4px 0 rgba(26, 19, 32, 0.25)'
};

export const STRIP_W = 228;

export function StatusStrip({ left }: { left: string }) {
  const s = useUi((st) => ({
    day: st.day, weekday: st.weekday, clock: Math.floor(st.clock), chaos: st.meters.chaos, morale: st.meters.morale,
    stock: st.meters.stock, delta: st.meters.stockDelta, free: st.incidentFreeDays, paused: st.paused, speed: st.speed,
    story: st.story ? { left: st.story.influence.left, max: st.story.influence.max, standing: Math.round(st.story.standing) } : null
  }));
  const up = s.delta >= 0;
  return (
    <div data-avoid style={{ position: 'absolute', top: 8, left, width: STRIP_W, padding: '8px 10px 8px', ...chipPanel }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 20 }}>
        <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px', padding: '3px 4px 1px', background: 'var(--cth-ink-900)', color: 'var(--cth-cream-50)' }}>
          DAY {s.day}
        </span>
        <span style={{ fontSize: 14, color: 'var(--cth-ink-700)' }}>{s.weekday.slice(0, 3)}</span>
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 22, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>
          {formatClock(s.clock)}
        </span>
        {s.paused
          ? <GIcon name="pause" px={16} title="Paused" style={{ animation: 'gu-blink 1s steps(1) infinite' }} />
          : s.speed === 2 ? <GIcon name="ff" px={16} title="Fast" /> : null}
        <span style={{ flex: 1 }} />
        <span title="Days without incident" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <GIcon name="incident" px={16} />
          <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '20px' }}>{s.free}</span>
        </span>
      </div>
      {s.story ? (
        // Story mode: what the player spends (influence) and what is at stake (branch standing).
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, height: 16 }}>
          <GIcon name="influence" px={16} title="Influence left today" />
          <Pips left={s.story.left} max={s.story.max} size={Math.max(s.story.left, s.story.max) > 10 ? 6 : 7} gap={2} title={`Influence: ${s.story.left} of ${s.story.max} left`} />
          <span style={{ flex: 1 }} />
          <GIcon name="branch" px={16} title="Branch standing" />
          <StandingBar value={s.story.standing} w={40} h={10} marks={false} />
          <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '16px', minWidth: 18, textAlign: 'right' }}>{s.story.standing}</span>
        </div>
      ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <GIcon name="chaos" px={16} title="Chaos" />
        <Bar value={s.chaos / 100} w={44} h={10} color="var(--cth-coral)" segments={6} />
        <GIcon name="morale" px={16} title="Morale" />
        <Bar value={s.morale / 100} w={44} h={10} color="var(--cth-mint)" segments={6} />
        <GIcon name="stock" px={16} title="Share price" />
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18, lineHeight: '16px', color: up ? '#2f8a45' : '#c43c3c', whiteSpace: 'nowrap' }}>
          {s.stock.toFixed(1)}{up ? '▲' : '▼'}
        </span>
      </div>
      )}
    </div>
  );
}

/** Where the mission chip sits (under the status strip), and how much room it can take at most. */
export const CHIP_TOP = 74;
export const CHIP_MAX_H = 52;

/**
 * Story mode: today's mission in a chip under the status strip, the same width. The goal tile,
 * the short status, a progress bar, influence pips and a small standing bar. A tap opens the
 * Director tab at the mission.
 */
export function MissionChip({ left, onOpen }: { left: string; onOpen: () => void }) {
  const game = useGame();
  const g = useUi((st) => st.story?.goal ?? null);
  const { pressed, handlers } = usePress();
  if (!g) return null;
  // One row, so it covers as little of the floor as possible: the goal tile, the live status and its bar.
  // Influence and standing live in the status strip above.
  return (
    <button type="button" className="gu-hit" data-avoid {...handlers} aria-label={`Today's goal: ${g.title}`} title={g.status || g.title}
      onClick={() => { game.uiSound('open'); onOpen(); }}
      style={{
        position: 'absolute', top: CHIP_TOP, left, width: STRIP_W, padding: '5px 8px 5px 6px', border: 'none', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', touchAction: 'manipulation',
        fontFamily: 'var(--cth-font-ui)', color: 'var(--cth-ink-900)',
        ...chipPanel,
        boxShadow: pressed ? 'var(--cth-panel-border), 2px 2px 0 rgba(26, 19, 32, 0.25)' : chipPanel.boxShadow,
        transform: pressed ? 'translate(2px, 2px)' : 'none'
      }}>
      <IconTile icon={tileIcon(g)} size={24} bg={tileBg(g.state)} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{
          fontSize: 14, lineHeight: '15px', overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
        }}>{g.status || g.title}</span>
        {g.state === 'open' && <Bar value={g.progress} color="var(--cth-peach)" h={6} segments={8} />}
      </div>
    </button>
  );
}

function EventChip({ id, label, endsAt, room }: { id: string; label: string; endsAt: number; room: string | null }) {
  const game = useGame();
  const now = useNow(500, endsAt > 0);
  const { pressed, handlers } = usePress();
  const left = endsAt > 0 ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
  const def = CHAOS[id as keyof typeof CHAOS];
  return (
    <button type="button" className="gu-hit gu-drop" {...handlers}
      onClick={() => { game.uiSound('tap'); if (room && room !== 'outside') game.focusRoom(room as never); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px 0 8px', border: 'none',
        background: 'var(--cth-cream-50)', cursor: 'pointer', touchAction: 'manipulation',
        boxShadow: pressed
          ? `inset 0 0 0 2px var(--cth-ink-900), inset 4px 0 0 var(--cth-coral)`
          : `inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 var(--cth-${def ? catAccent(def.category) : 'coral'}), 2px 2px 0 rgba(26,19,32,0.25)`,
        transform: pressed ? 'translateY(2px)' : 'none', fontFamily: 'var(--cth-font-ui)', fontSize: 14, color: 'var(--cth-ink-900)',
        whiteSpace: 'nowrap', maxWidth: 260
      }}>
      <span style={{ width: 2 }} />
      <GIcon name={id} px={16} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {left !== null && <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18, color: 'var(--cth-ink-500)' }}>{left}s</span>}
    </button>
  );
}

function catAccent(c: string): string {
  return c === 'disaster' ? 'coral' : c === 'weird' ? 'lilac' : c === 'treat' ? 'mint' : 'sky';
}

export function EventsAndToasts({ left, right }: { left: string; right: number }) {
  const game = useGame();
  const active = useUi((s) => s.activeChaos);
  const toasts = useLeaving(useUi((s) => s.toasts), toastKey);
  return (
    <div style={{
      position: 'absolute', top: 8, left, right: right + 8,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none'
    }}>
      {active.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, maxWidth: '100%' }}>
          {active.slice(-3).map((a) => <EventChip key={a.key} id={a.id} label={a.label} endsAt={a.endsAt} room={a.room} />)}
          {active.length > 3 && <span style={{ ...chipPanel, padding: '6px 8px', fontSize: 14 }}>+{active.length - 3}</span>}
        </div>
      )}
      {toasts.map(({ item: t, out }) => (
        <button key={t.id} type="button" className={out ? 'gu-hit sc-leave' : 'gu-hit gu-drop'}
          onClick={() => { game.uiSound('close'); game.dismissToast(t.id); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, maxWidth: 'min(360px, 100%)', padding: '8px 12px 8px 14px',
            border: 'none', textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation',
            background: 'var(--cth-cream-50)',
            boxShadow: `var(--cth-panel-border-dialog), inset 6px 0 0 var(--cth-${t.tone === 'good' ? 'mint' : t.tone === 'bad' ? 'coral' : 'sky'}), 4px 4px 0 rgba(26,19,32,0.25)`,
            fontFamily: 'var(--cth-font-ui)', fontSize: 15, lineHeight: '18px', color: 'var(--cth-ink-900)'
          }}>
          {t.icon && <GIcon name={t.icon} px={16} />}
          <span>{t.text}</span>
        </button>
      ))}
    </div>
  );
}

export function Subtitle({ right, bottom }: { right: number; bottom: number }) {
  const game = useGame();
  const cap = useUi((s) => (s.settings.captions ? s.caption : null));
  const person = useUi((s) => (cap?.who ? s.people.find((p) => p.id === cap.who) ?? null : null));
  if (!cap || !cap.text) return null;
  const name = person?.name ?? cap.who ?? '';
  const color = person ? readableOnCream(person.color) : 'var(--cth-ink-700)';
  return (
    <div style={{ position: 'absolute', left: 8, right: right + 8, bottom: bottom + 8, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div key={cap.id} className="gu-drop" data-avoid style={{
        display: 'flex', alignItems: 'center', gap: 8, maxWidth: 520, minWidth: 0, padding: '6px 12px 6px 6px',
        background: 'var(--cth-cream-50)', boxShadow: 'var(--cth-panel-border-dialog), 4px 4px 0 rgba(26,19,32,0.25)'
      }}>
        {cap.who && <Head src={person?.avatar ?? game.avatar(cap.who)} scale={2} box={14} ring={person?.color} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, lineHeight: '14px', color }}>{name}</div>
          <div style={{
            fontSize: 16, lineHeight: '20px', color: 'var(--cth-ink-900)', fontStyle: cap.kind === 'think' ? 'italic' : undefined,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
          }}>{cap.text}</div>
        </div>
      </div>
    </div>
  );
}

export function OfflineBanner({ left, top = 80, onFix }: { left: string; top?: number; onFix: () => void }) {
  const offline = useUi((s) => s.brain.state === 'offline');
  // Said once, then out of the way: the red light on the Director tab keeps saying it.
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!offline) { setSeen(false); return; }
    const t = window.setTimeout(() => setSeen(true), 14000);
    return () => window.clearTimeout(t);
  }, [offline]);
  if (!offline || seen) return null;
  return (
    <div className="gu-hit gu-drop" data-avoid style={{
      position: 'absolute', top, left, width: STRIP_W, display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 6px 6px 10px', background: 'var(--cth-lemon-light)',
      boxShadow: 'inset 0 0 0 2px var(--cth-ink-900), 4px 4px 0 rgba(26,19,32,0.25)'
    }}>
      <GIcon name="warn" px={16} />
      <span style={{ flex: 1, fontSize: 13, lineHeight: '15px' }}>Can't reach your model. The staff are running on instinct.</span>
      <Btn size="md" variant="primary" onClick={onFix} sound="open">Fix</Btn>
    </div>
  );
}
