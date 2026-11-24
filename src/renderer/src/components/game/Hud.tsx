// Small things over the floor: the HUD block (status strip and, in the story, the mission row) at the
// top left, running events and toasts (top centre), the bottom stack (the story caption and the
// subtitle for someone speaking off screen) and the offline banner.
// Only real controls take touches; the rest lets them through to the floor.
//
// The HUD is kept slim on purpose: the camera keeps the office below hudBottom() (GameUI passes it as
// the top inset), so Michael's office and the conference room never hide under it.

import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { CHAOS } from '@/game/core/chaos';
import { formatClock } from '@/game/core/types';
import type { ActionId, StoryUi } from '@/game/app/gameApi';
import { GIcon } from './icons';
import { Bar, Btn, Head, IconTile, Pips, StandingBar, standingWord, usePress } from './kit';
import { useGame, useNow, useUi } from './ctx';
import { readableOnCream } from './words';
import { tileBg, tileIcon } from './Story';
import { BeatCaption } from './caption';
import { CHIP_H, CHIP_TOP, HUD_TOP, STRIP_H, STRIP_W, hudBottom } from './hudGeometry';
import { useLeaving } from './transitions';
import { unshownLines } from './Bubbles';

type ToastGroup = { ids: string[]; text: string; icon?: string; tone: string };
const groupKey = (g: ToastGroup) => g.ids[0];

const chipPanel: CSSProperties = {
  background: 'var(--cth-cream-100)',
  boxShadow: 'var(--cth-panel-border), 4px 4px 0 rgba(26, 19, 32, 0.25)'
};

// ── geometry (hudGeometry.ts) ──

export { CHIP_H, CHIP_MAX_H, CHIP_TOP, HUD_TOP, STRIP_H, STRIP_W, hudBottom, hudInset } from './hudGeometry';

// ── status strip ──

/** What an action costs today, as plain words for the explanation ("1", "2 to 4"). */
function costRange(costs: StoryUi['costs'], ids: ActionId[]): string {
  const v = ids.map((id) => costs[id]).filter((n): n is number => typeof n === 'number');
  if (!v.length) return '';
  const lo = Math.min(...v), hi = Math.max(...v);
  return lo === hi ? String(lo) : `${lo} to ${hi}`;
}

export function StatusStrip({ left }: { left: string }) {
  const game = useGame();
  const s = useUi((st) => ({
    day: st.day, weekday: st.weekday, clock: Math.floor(st.clock), chaos: st.meters.chaos, morale: st.meters.morale,
    stock: st.meters.stock, delta: st.meters.stockDelta, free: st.incidentFreeDays, paused: st.paused, speed: st.speed,
    finishing: st.finishing, phase: st.phase,
    story: st.story ? {
      left: st.story.influence.left, max: st.story.influence.max, standing: Math.round(st.story.standing),
      saga: st.story.saga ? { season: st.story.saga.season } : null
    } : null
  }));
  const costs = useUi((st) => st.story?.costs ?? null);
  const [explain, setExplain] = useState(false);
  useEffect(() => {
    if (!explain) return;
    const t = window.setTimeout(() => setExplain(false), 10000);
    return () => window.clearTimeout(t);
  }, [explain]);
  const up = s.delta >= 0;
  const canPause = s.phase === 'playing' && !s.finishing;
  const story = s.story;
  const badge = story?.saga ? `S${story.saga.season} ${s.weekday.slice(0, 2).toUpperCase()}` : story ? s.weekday.slice(0, 3).toUpperCase() : `DAY ${s.day}`;

  const togglePause = () => {
    if (!canPause) return;
    game.uiSound(s.paused ? 'open' : 'close');
    game.setPaused(!s.paused);
  };

  const stateIcon = s.finishing
    ? <GIcon name="ff" px={16} title="Running to five o'clock" style={{ animation: 'gu-blink 0.5s steps(1) infinite' }} />
    : s.paused
      ? <GIcon name="pause" px={16} title="Paused" style={{ animation: 'gu-blink 1s steps(1) infinite' }} />
      : s.speed === 2
        ? <GIcon name="ff" px={16} title="Fast" />
        : <GIcon name="pause" px={16} title="Tap to pause" style={{ opacity: 0.4 }} />;

  return (
    <div data-avoid style={{ position: 'absolute', top: HUD_TOP, left, width: STRIP_W, height: STRIP_H, display: 'flex', alignItems: 'stretch', ...chipPanel }}>
      {/* The time: a tap pauses or resumes the day. */}
      <button type="button" className="gu-hit gu-pad" disabled={!canPause} onClick={togglePause}
        aria-label={s.paused ? 'Resume the day' : 'Pause the day'} title={s.paused ? 'Resume' : 'Pause'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '0 6px 0 6px', border: 'none', background: 'transparent',
          cursor: canPause ? 'pointer' : 'default', touchAction: 'manipulation', flexShrink: 0, color: 'var(--cth-ink-900)',
          boxShadow: 'inset -1px 0 0 var(--cth-ink-300)'
        }}>
        <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px', padding: '3px 4px 1px', background: 'var(--cth-ink-900)', color: 'var(--cth-cream-50)' }}>
          {badge}
        </span>
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 22, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>{formatClock(s.clock)}</span>
        {stateIcon}
      </button>
      {/* The numbers: a tap explains them. */}
      <button type="button" className="gu-hit gu-pad" onClick={() => { game.uiSound('tap'); setExplain(!explain); }}
        aria-label="What these numbers mean" aria-expanded={explain}
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px 0 7px', border: 'none',
          background: explain ? 'var(--cth-cream-200)' : 'transparent', cursor: 'pointer', touchAction: 'manipulation',
          fontFamily: 'var(--cth-font-ui)', color: 'var(--cth-ink-900)'
        }}>
        {story ? story.saga ? (
          <>
            <GIcon name="chaos" px={16} />
            <Bar value={s.chaos / 100} w={18} h={10} color="var(--cth-coral)" segments={4} />
            <GIcon name="morale" px={16} />
            <Bar value={s.morale / 100} w={18} h={10} color="var(--cth-mint)" segments={4} />
            <span style={{ flex: 1 }} />
            <GIcon name="branch" px={16} />
            <StandingBar value={story.standing} w={24} h={10} marks={false} />
            <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18, lineHeight: '16px', minWidth: 18, textAlign: 'right' }}>{story.standing}</span>
          </>
        ) : (
          <>
            <GIcon name="influence" px={16} />
            <Pips left={Math.min(story.left, story.max)} max={story.max} size={6} gap={2} />
            <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '16px', color: 'var(--cth-ink-700)' }}>{story.left}</span>
            {story.left > story.max && <span style={{ fontSize: 12, lineHeight: '12px', color: '#2f8a45' }}>+{story.left - story.max}</span>}
            <span style={{ flex: 1 }} />
            <GIcon name="branch" px={16} />
            <StandingBar value={story.standing} w={30} h={10} marks={false} />
            <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '16px', minWidth: 18, textAlign: 'right' }}>{story.standing}</span>
          </>
        ) : (
          <>
            <GIcon name="incident" px={16} />
            <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '16px' }}>{s.free}</span>
            <span style={{ flex: 1 }} />
            <GIcon name="chaos" px={16} />
            <Bar value={s.chaos / 100} w={26} h={10} color="var(--cth-coral)" segments={4} />
            <GIcon name="morale" px={16} />
            <Bar value={s.morale / 100} w={26} h={10} color="var(--cth-mint)" segments={4} />
            <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18, lineHeight: '16px', color: up ? '#2f8a45' : '#c43c3c', whiteSpace: 'nowrap' }}>
              {s.stock.toFixed(1)}{up ? '▲' : '▼'}
            </span>
          </>
        )}
      </button>
      {explain && (
        <Explain story={story} costs={costs} free={s.free} chaos={s.chaos} morale={s.morale} stock={s.stock} up={up} delta={s.delta}
          paused={s.paused} onClose={() => setExplain(false)} />
      )}
    </div>
  );
}

/** What the numbers on the strip mean, in plain words, under the HUD block. */
function Explain({ story, costs, free, chaos, morale, stock, up, delta, paused, onClose }: {
  story: { left: number; max: number; standing: number; saga: { season: number } | null } | null; costs: StoryUi['costs'] | null;
  free: number; chaos: number; morale: number; stock: number; up: boolean; delta: number; paused: boolean; onClose: () => void;
}) {
  const game = useGame();
  const rows: { icon: string; text: string }[] = [];
  if (story?.saga) {
    rows.push({ icon: 'chaos', text: `Chaos ${Math.round(chaos)}%: how wild the office is right now.` });
    rows.push({ icon: 'morale', text: `Morale ${Math.round(morale)}%: how happy everyone is.` });
    rows.push({ icon: 'branch', text: `Season ${story.saga.season} standing: ${story.standing}. Winning days and chaos shape corporate fallout.` });
    rows.push({ icon: 'powers', text: 'All 34 powers, Whispers, Loudspeaker and Anything are unlocked and free.' });
  } else if (story) {
    const words = costs ? costRange(costs, ['whisper', 'announce', 'cue']) : '';
    const any = costs ? costRange(costs, ['anything']) : '';
    const powers = costs ? costRange(costs, ['fire', 'flood', 'puppy', 'lockIn', 'love', 'meeting']) : '';
    const bonus = story.left > story.max ? ` That includes ${story.left - story.max} extra from goals done.` : '';
    rows.push({
      icon: 'influence',
      text: `Influence: ${story.left} left today, out of ${story.max}.${bonus} Whispers and announcements cost ${words || 1}, Anything ${any || 3}, powers ${powers || '2 to 4'}. Picking people up is free.`
    });
    rows.push({ icon: 'branch', text: `Branch standing: ${story.standing}. How likely Corporate is to keep the branch open: ${standingWord(story.standing).toLowerCase()}. Winning days raises it.` });
  } else {
    rows.push({ icon: 'incident', text: `Days without an incident: ${free}.` });
    rows.push({ icon: 'chaos', text: `Chaos ${Math.round(chaos)}%: how wild the office is right now.` });
    rows.push({ icon: 'morale', text: `Morale ${Math.round(morale)}%: how happy everyone is.` });
    rows.push({ icon: 'stock', text: `Share price ${stock.toFixed(1)}, ${up ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)} today.` });
  }
  rows.push({ icon: paused ? 'play' : 'pause', text: paused ? 'Paused. Tap the clock to carry on.' : 'Tap the clock to pause the day.' });
  return (
    <button type="button" className="gu-hit gu-drop" onClick={() => { game.uiSound('close'); onClose(); }} aria-label="Close"
      style={{
        position: 'absolute', left: 0, top: hudBottom(!!story) - HUD_TOP + 6, width: STRIP_W, padding: '8px 10px', border: 'none',
        display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation',
        background: 'var(--cth-cream-50)', boxShadow: 'var(--cth-panel-border-dialog), 4px 4px 0 rgba(26, 19, 32, 0.25)',
        fontFamily: 'var(--cth-font-ui)', color: 'var(--cth-ink-900)', zIndex: 4
      }}>
      {rows.map((r, i) => (
        <span key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, lineHeight: '17px' }}>
          <GIcon name={r.icon} px={16} style={{ marginTop: 1 }} />
          <span style={{ minWidth: 0 }}>{r.text}</span>
        </span>
      ))}
    </button>
  );
}

// ── mission row ──

function RowBtn({ icon, label, title, primary, onClick }: { icon?: string; label: string; title: string; primary?: boolean; onClick: () => void }) {
  const game = useGame();
  const { pressed, handlers } = usePress();
  return (
    <button type="button" className="gu-hit gu-pad-down" {...handlers} aria-label={title} title={title}
      onClick={() => { game.uiSound(primary ? 'confirm' : 'tap'); onClick(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, height: 22, padding: '0 7px 0 5px', border: 'none', flexShrink: 0,
        background: primary ? 'var(--cth-lemon)' : 'var(--cth-cream-50)', cursor: 'pointer', touchAction: 'manipulation',
        boxShadow: pressed ? 'inset 0 0 0 2px var(--cth-ink-900)' : 'inset 0 0 0 2px var(--cth-ink-900), 0 2px 0 var(--cth-ink-900)',
        transform: pressed ? 'translateY(2px)' : 'none', marginBottom: 2,
        fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '14px', color: 'var(--cth-ink-900)', whiteSpace: 'nowrap'
      }}>
      {icon && <GIcon name={icon} px={16} />}{label}
    </button>
  );
}

/**
 * Story mode: today's goal in one slim row under the status strip, the same width. The goal tile, the
 * live status and a thin progress bar; a tap opens the Director tab at the mission. Once the day is
 * settled it offers "Finish the day" (and "Try again" after a loss); while the rest of the day runs
 * quickly it says so.
 */
export function MissionChip({ left, onOpen }: { left: string; onOpen: () => void }) {
  const game = useGame();
  const g = useUi((st) => st.story?.goal ?? null);
  const canFinish = useUi((st) => !!st.story?.canFinish);
  const finishing = useUi((st) => st.finishing);
  const { pressed, handlers } = usePress();
  if (!g) return null;
  const lost = g.state === 'lost';
  const settled = canFinish && !finishing;
  const text = finishing ? "Running to five o'clock..." : g.status || g.title;
  return (
    <div data-avoid style={{
      position: 'absolute', top: CHIP_TOP, left, width: STRIP_W, height: CHIP_H, display: 'flex', alignItems: 'center', gap: 4,
      paddingRight: settled ? 4 : 0, ...chipPanel,
      boxShadow: pressed ? 'var(--cth-panel-border), 2px 2px 0 rgba(26, 19, 32, 0.25)' : chipPanel.boxShadow,
      transform: pressed ? 'translate(2px, 2px)' : 'none'
    }}>
      <button type="button" className="gu-hit gu-pad-down" {...handlers} aria-label={`Today's goal: ${g.title}. ${text}`} title={text}
        onClick={() => { game.uiSound('open'); onOpen(); }}
        style={{
          flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '0 8px 0 4px',
          border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation',
          fontFamily: 'var(--cth-font-ui)', color: 'var(--cth-ink-900)'
        }}>
        <IconTile icon={finishing ? 'ff' : tileIcon(g)} size={20} bg={finishing ? 'var(--cth-lemon)' : tileBg(g.state)} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: settled && lost ? 13 : 14, lineHeight: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
          {g.state === 'open' && g.progress > 0 && !finishing && <Bar value={g.progress} color="var(--cth-peach)" h={6} segments={10} />}
        </span>
      </button>
      {settled && lost && <RowBtn label="Try again" title="Try the day again now" onClick={() => game.retryDay()} />}
      {settled && <RowBtn icon="ff" label={lost ? 'Finish' : 'Finish the day'} title="Finish the day: run quickly to five o'clock and the report" primary onClick={() => game.finishDay()} />}
    </div>
  );
}

// ── running events and toasts ──

function EventChip({ id, label, endsAt, room }: { id: string; label: string; endsAt: number; room: string | null }) {
  const game = useGame();
  const now = useNow(500, endsAt > 0);
  const { pressed, handlers } = usePress();
  const left = endsAt > 0 ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
  const def = CHAOS[id as keyof typeof CHAOS];
  return (
    <button type="button" className="gu-hit gu-drop gu-pad" {...handlers} aria-label={room ? `${label}: look` : label}
      onClick={() => { game.uiSound('tap'); if (room && room !== 'outside') game.focusRoom(room as never); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px 0 8px', border: 'none',
        background: 'var(--cth-cream-50)', cursor: 'pointer', touchAction: 'manipulation',
        boxShadow: pressed
          ? `inset 0 0 0 2px var(--cth-ink-900), inset 4px 0 0 var(--cth-coral)`
          : `inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 var(--cth-${def ? catAccent(def.category) : 'coral'}), 2px 2px 0 rgba(26,19,32,0.25)`,
        transform: pressed ? 'translateY(2px)' : 'none', fontFamily: 'var(--cth-font-ui)', fontSize: 14, color: 'var(--cth-ink-900)',
        whiteSpace: 'nowrap', maxWidth: 'min(340px, 85vw)'
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
  const raw = useUi((s) => s.toasts);
  // The same words twice in a row (two refusals, say) show once, with a count.
  const grouped = useMemo(() => {
    const out: ToastGroup[] = [];
    for (const t of raw) {
      const last = out[out.length - 1];
      if (last && last.text === t.text) last.ids.push(t.id);
      else out.push({ ids: [t.id], text: t.text, icon: t.icon, tone: t.tone });
    }
    return out;
  }, [raw]);
  // Toasts leave with a short exit instead of vanishing (transitions.tsx).
  const toasts = useLeaving(grouped, groupKey);
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
        <button key={t.ids[0]} type="button" className={out ? 'gu-hit sc-leave' : 'gu-hit gu-drop'}
          onClick={() => { game.uiSound('close'); for (const id of t.ids) game.dismissToast(id); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, maxWidth: 'min(360px, 100%)', padding: '8px 12px 8px 14px',
            border: 'none', textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation',
            background: 'var(--cth-cream-50)',
            boxShadow: `var(--cth-panel-border-dialog), inset 6px 0 0 var(--cth-${t.tone === 'good' ? 'mint' : t.tone === 'bad' ? 'coral' : 'sky'}), 4px 4px 0 rgba(26,19,32,0.25)`,
            fontFamily: 'var(--cth-font-ui)', fontSize: 15, lineHeight: '18px', color: 'var(--cth-ink-900)'
          }}>
          {t.icon && <GIcon name={t.icon} px={16} />}
          <span>{t.text}</span>
          {t.ids.length > 1 && <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18, color: 'var(--cth-ink-500)' }}>x{t.ids.length}</span>}
        </button>
      ))}
    </div>
  );
}

// ── bottom stack: the story caption, then the subtitle ──

export function Subtitle({ right, bottom }: { right: number; bottom: number }) {
  const game = useGame();
  const cap = useUi((s) => (s.settings.captions ? s.caption : null));
  const person = useUi((s) => (cap?.who ? s.people.find((p) => p.id === cap.who) ?? null : null));
  useNow(250, !!cap?.who);
  // Only for lines the floor cannot show in full (off screen, under the panel, or folded into a "..."):
  // otherwise the bubble already says it and the subtitle would say everything twice.
  const unshown = !cap?.who || unshownLines.has(cap.id) || !game.headOnScreen(cap.who).visible;
  const showSub = !!cap && !!cap.text && unshown;
  const name = person?.name ?? cap?.who ?? '';
  const color = person ? readableOnCream(person.color) : 'var(--cth-ink-700)';
  return (
    <div style={{
      position: 'absolute', left: 8, right: right + 8, bottom: bottom + 8, display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 6, pointerEvents: 'none'
    }}>
      <BeatCaption />
      {showSub && cap && (
        <div key={cap.id} className="gu-drop" data-avoid style={{
          display: 'flex', alignItems: 'center', gap: 8, maxWidth: 520, minWidth: 0, padding: '6px 12px 6px 6px',
          background: 'var(--cth-cream-50)', boxShadow: 'var(--cth-panel-border-dialog), 4px 4px 0 rgba(26,19,32,0.25)'
        }}>
          {cap.who && <Head src={person?.avatar ?? game.avatar(cap.who)} scale={2} box={14} ring={person?.color} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, lineHeight: '14px', color }}>{name}</div>
            <div style={{
              fontSize: 16, lineHeight: '20px', color: cap.kind === 'think' ? 'var(--cth-ink-500)' : 'var(--cth-ink-900)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
            }}>{cap.text}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── offline ──

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
      <span style={{ flex: 1, fontSize: 13, lineHeight: '15px' }}>Can't reach your model, so the staff are using written lines. You can still play.</span>
      <Btn size="md" variant="primary" onClick={onFix} sound="open">Fix</Btn>
    </div>
  );
}
