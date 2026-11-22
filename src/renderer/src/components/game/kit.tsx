// Touch-friendly building blocks that look exactly like the existing pieces
// (PixelButton, PixelPanel title bars, PixelBadge) but press on pointer events,
// so the hard-shadow press works with a finger as well as a mouse.

import { CSSProperties, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AccentColorName } from '@/design/tokens';
import type { SfxId } from '@/game/audio/api';
import type { GameApi, ToastUi } from '@/game/app/gameApi';
import { PixelPanel } from '@/components/PixelPanel';
import { PORTRAIT_H, PORTRAIT_W } from '@/scene/office/portraitArt';
import { GIcon, type GIconName } from './icons';
import { useGame } from './ctx';
import { CLOSED_BELOW, SAVED_AT } from './storyNumbers';

// ── press handling ──

export function usePress(disabled?: boolean) {
  const [pressed, setPressed] = useState(false);
  const handlers = useMemo(() => ({
    onPointerDown: () => { if (!disabled) setPressed(true); },
    onPointerUp: () => setPressed(false),
    onPointerCancel: () => setPressed(false),
    onPointerLeave: () => setPressed(false)
  }), [disabled]);
  return { pressed, handlers };
}

// ── Btn: PixelButton, for fingers ──

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'accent';
type BtnSize = 'sm' | 'md' | 'lg';

const BTN_H: Record<BtnSize, number> = { sm: 32, md: 40, lg: 48 };

export interface BtnProps {
  variant?: BtnVariant;
  size?: BtnSize;
  accent?: AccentColorName;
  icon?: GIconName;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
  /** UI sound on tap; null for none. */
  sound?: SfxId | null;
  style?: CSSProperties;
  label?: string;
  coach?: string;
  square?: boolean;
  /** Icon above a short label, for tight grids. */
  stack?: boolean;
}

export function Btn({
  variant = 'secondary', size = 'md', accent, icon, children, onClick, disabled = false, full = false,
  sound = 'tap', style, label, coach, square = false, stack = false
}: BtnProps) {
  const game = useGame();
  const { pressed, handlers } = usePress(disabled);
  const p = (() => {
    switch (variant) {
      case 'primary': return { fill: 'var(--cth-ink-900)', text: 'var(--cth-cream-50)', border: 'var(--cth-ink-900)', shadow: 'var(--cth-ink-900)' };
      case 'ghost': return { fill: 'transparent', text: 'var(--cth-ink-700)', border: 'var(--cth-ink-500)', shadow: 'var(--cth-ink-500)' };
      case 'destructive': return { fill: 'var(--cth-coral)', text: 'var(--cth-ink-900)', border: 'var(--cth-ink-900)', shadow: 'var(--cth-ink-900)' };
      case 'accent': return { fill: `var(--cth-${accent ?? 'lemon'})`, text: 'var(--cth-ink-900)', border: 'var(--cth-ink-900)', shadow: 'var(--cth-ink-900)' };
      default: return { fill: 'var(--cth-cream-100)', text: 'var(--cth-ink-900)', border: 'var(--cth-ink-900)', shadow: 'var(--cth-ink-700)' };
    }
  })();
  const h = BTN_H[size];
  const down = pressed && !disabled;
  return (
    <button
      type="button"
      className="gu-hit"
      aria-label={label}
      title={label}
      data-coach={coach}
      disabled={disabled}
      {...handlers}
      onClick={disabled ? undefined : () => { if (sound) game.uiSound(sound); onClick?.(); }}
      style={{
        height: stack ? 52 : h,
        minWidth: square ? h : 0,
        flexDirection: stack ? 'column' : 'row',
        width: square ? h : full ? '100%' : undefined,
        padding: square ? 0 : size === 'sm' ? '0 8px' : size === 'lg' ? '0 16px' : '0 12px',
        marginBottom: 2,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: stack ? 2 : 6,
        background: disabled ? 'var(--cth-cream-300)' : p.fill,
        color: disabled ? 'var(--cth-ink-500)' : p.text,
        border: 'none', borderRadius: 0,
        boxShadow: down || disabled
          ? `inset 0 0 0 2px ${disabled ? 'var(--cth-ink-500)' : p.border}`
          : `inset 0 0 0 2px ${p.border}, 0 2px 0 ${p.shadow}`,
        transform: down ? 'translateY(2px)' : 'none',
        fontFamily: 'var(--cth-font-ui)',
        fontSize: stack ? 14 : size === 'lg' ? 18 : size === 'sm' ? 14 : 16,
        lineHeight: '20px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: full ? 1 : 0,
        touchAction: 'manipulation',
        ...style
      }}
    >
      {icon && <GIcon name={icon} px={16} />}
      {children}
    </button>
  );
}

// ── Section: a PixelPanel with the original title bar, plus an optional slot on the right ──

export function Section({ title, accent, right, children, pad = 12, style, inset }: {
  title?: string; accent?: AccentColorName; right?: ReactNode; children?: ReactNode; pad?: number;
  style?: CSSProperties; inset?: boolean;
}) {
  return (
    <PixelPanel variant={inset ? 'inset' : 'default'} noPadding style={{ flexShrink: 0, ...style }}>
      {title && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, minHeight: 30,
          padding: '6px 12px 4px',
          background: accent ? `var(--cth-${accent})` : 'var(--cth-cream-200)',
          fontFamily: 'var(--cth-font-display)', fontSize: 12, lineHeight: '20px',
          boxShadow: 'inset 0 -1px 0 var(--cth-ink-900)'
        }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          {right}
        </div>
      )}
      <div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </PixelPanel>
  );
}

export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="gu-label" style={style}>{children}</div>;
}

// ── Bar: a stepped meter ──

export function Bar({ value, color = 'var(--cth-mint)', w, h = 10, segments = 0, style }: {
  value: number; color?: string; w?: number | string; h?: number; segments?: number; style?: CSSProperties;
}) {
  const v = Math.max(0, Math.min(1, value));
  // Snap the fill to whole segments (or 2 px) so it moves in steps.
  const pct = segments > 0 ? Math.round(v * segments) / segments : v;
  return (
    <div style={{
      position: 'relative', width: w ?? '100%', height: h, flexShrink: w ? 0 : 1, minWidth: 0,
      background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)', ...style
    }}>
      <div style={{
        position: 'absolute', left: 2, top: 2, bottom: 2,
        width: `calc((100% - 4px) * ${pct})`, background: color
      }} />
      {segments > 1 && (
        <div style={{
          position: 'absolute', inset: 2,
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0 calc(100% / ${segments} - 1px), var(--cth-ink-900) calc(100% / ${segments} - 1px) calc(100% / ${segments}))`
        }} />
      )}
    </div>
  );
}

/** A bar from -1 (dislike, coral) to 1 (like, mint) with a centre tick. */
export function LikeBar({ score, w = 64 }: { score: number; w?: number }) {
  const s = Math.max(-1, Math.min(1, score));
  const half = (w - 4) / 2;
  const len = Math.round(Math.abs(s) * half);
  return (
    <div style={{ position: 'relative', width: w, height: 10, background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)', flexShrink: 0 }}>
      <div style={{
        position: 'absolute', top: 2, bottom: 2,
        left: s >= 0 ? 2 + half : 2 + half - len, width: len,
        background: s >= 0 ? 'var(--cth-mint)' : 'var(--cth-coral)'
      }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 1 + half, width: 2, background: 'var(--cth-ink-900)' }} />
    </div>
  );
}

// ── Portraits ──

/** A whole portrait from a data URL, at an integer scale. */
export function Portrait({ src, scale = 2, style }: { src: string; scale?: number; style?: CSSProperties }) {
  return (
    <img src={src} alt="" draggable={false}
      style={{ width: PORTRAIT_W * scale, height: PORTRAIT_H * scale, imageRendering: 'pixelated', display: 'block', flexShrink: 0, ...style }} />
  );
}

/** Head-and-shoulders crop of a portrait in a square box. */
export function Head({ src, scale = 2, box = 14, ring, style }: {
  src: string; scale?: number; box?: number; ring?: string; style?: CSSProperties;
}) {
  const size = box * scale;
  return (
    <div style={{
      width: size, height: size, flexShrink: 0, position: 'relative', overflow: 'hidden',
      background: 'var(--cth-cream-200)',
      boxShadow: ring ? `inset 0 0 0 2px ${ring}` : 'inset 0 0 0 1px var(--cth-ink-700)', ...style
    }}>
      <img src={src} alt="" draggable={false} style={{
        position: 'absolute', imageRendering: 'pixelated',
        width: PORTRAIT_W * scale, height: PORTRAIT_H * scale,
        left: -Math.round(((PORTRAIT_W - box) / 2) * scale), top: Math.round(1 * scale)
      }} />
    </div>
  );
}

// ── Chips ──

export function Chip({ children, onClick, active, accent = 'lemon', icon, style, sound = 'tap' }: {
  children?: ReactNode; onClick?: () => void; active?: boolean; accent?: AccentColorName; icon?: GIconName;
  style?: CSSProperties; sound?: SfxId | null;
}) {
  const game = useGame();
  const { pressed, handlers } = usePress();
  return (
    <button type="button" className="gu-hit" {...handlers}
      onClick={() => { if (sound) game.uiSound(sound); onClick?.(); }}
      style={{
        minHeight: 40, padding: '6px 10px', marginBottom: 2,
        display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'left',
        background: active ? `var(--cth-${accent}-light)` : 'var(--cth-cream-50)',
        border: 'none', borderRadius: 0,
        boxShadow: pressed ? `inset 0 0 0 1px var(--cth-ink-900)` : `inset 0 0 0 1px var(--cth-ink-900), 0 2px 0 var(--cth-ink-700)`,
        transform: pressed ? 'translateY(2px)' : 'none',
        fontFamily: 'var(--cth-font-ui)', fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-900)',
        cursor: 'pointer', touchAction: 'manipulation', ...style
      }}>
      {icon && <GIcon name={icon} px={16} />}
      {children}
    </button>
  );
}

/** Small status light, the square dot used in PixelBadge. */
export function Light({ color, blink }: { color: string; blink?: boolean }) {
  return <span style={{
    width: 10, height: 10, flexShrink: 0, display: 'inline-block', background: color,
    boxShadow: 'inset 0 0 0 1px var(--cth-ink-900)', animation: blink ? 'gu-blink 1s steps(1) infinite' : undefined
  }} />;
}

// ── Segmented choice ──

export function Seg<T extends string | number>({ value, options, onChange, accent = 'lemon' }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; accent?: AccentColorName;
}) {
  const game = useGame();
  return (
    <div style={{ display: 'flex', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)', padding: 2, gap: 2, background: 'var(--cth-cream-200)' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" className="gu-hit"
            onClick={() => { game.uiSound('tap'); onChange(o.value); }}
            style={{
              flex: 1, minHeight: 40, border: 'none', borderRadius: 0, padding: '0 4px',
              background: on ? `var(--cth-${accent})` : 'transparent',
              boxShadow: on ? 'inset 0 0 0 1px var(--cth-ink-900)' : 'none',
              fontFamily: 'var(--cth-font-ui)', fontSize: 14, color: 'var(--cth-ink-900)', cursor: 'pointer',
              touchAction: 'manipulation'
            }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// ── On/off switch row ──

export function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  const game = useGame();
  return (
    <button type="button" className="gu-hit"
      onClick={() => { game.uiSound('tap'); onChange(!on); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 40, padding: 0,
        background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation'
      }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 16, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 12, lineHeight: '14px', color: 'var(--cth-ink-500)' }}>{hint}</span>}
      </span>
      <span style={{
        position: 'relative', width: 44, height: 24, flexShrink: 0,
        background: on ? 'var(--cth-mint)' : 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)'
      }}>
        <span style={{
          position: 'absolute', top: 4, left: on ? 24 : 4, width: 16, height: 16,
          background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)'
        }} />
      </span>
    </button>
  );
}

// ── Text tool: a box, tappable suggestions and a Send button ──

export function TextTool({ placeholder, hint, suggestions, onSend, sendLabel = 'Send', disabled, accent = 'lilac', coach, autoFocus, cost, short, warn }: {
  placeholder: string; hint?: string; suggestions: string[]; onSend: (text: string) => void; sendLabel?: string;
  disabled?: boolean; accent?: AccentColorName; coach?: string; autoFocus?: boolean;
  /** Story mode: what sending costs in influence (shown on the button). */
  cost?: number;
  /** Story mode: why it cannot be afforded right now ("Not enough influence: ..."), or null. */
  short?: string | null;
  /** Story mode: a side effect to know about before sending ("Using this fails Quiet hands"). */
  warn?: string | null;
}) {
  const game = useGame();
  const [text, setText] = useState('');
  const [page, setPage] = useState(0);
  const [typingPause, setTypingPause] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const pausedByUs = useRef(false);
  const shown = useMemo(() => {
    if (suggestions.length <= 3) return suggestions;
    const out: string[] = [];
    for (let i = 0; i < 3; i++) out.push(suggestions[(page * 3 + i) % suggestions.length]);
    return out;
  }, [suggestions, page]);
  // Story mode: the day holds still while the player types (a phone keyboard is slow, and the story has deadlines).
  const holdForTyping = useCallback(() => {
    const st = game.store.getState();
    if (st.mode !== 'story' || st.phase !== 'playing' || st.paused || st.finishing) return;
    pausedByUs.current = true;
    setTypingPause(true);
    game.setPaused(true);
  }, [game]);
  const releaseNow = useCallback(() => {
    if (!pausedByUs.current) return;
    pausedByUs.current = false;
    setTypingPause(false);
    // Only carry on if nothing else paused the day meanwhile.
    if (game.store.getState().paused) game.setPaused(false);
  }, [game]);
  // The box loses focus as the finger lands on Send: let go a moment later, after the tap has
  // been delivered, so nothing moves under the finger and the line is sent before the day restarts.
  const releaseTimer = useRef(0);
  const releaseTyping = useCallback(() => {
    window.clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(releaseNow, 300);
  }, [releaseNow]);
  const refocus = useCallback(() => {
    window.clearTimeout(releaseTimer.current);
    holdForTyping();
  }, [holdForTyping]);
  useEffect(() => () => { window.clearTimeout(releaseTimer.current); releaseNow(); }, [releaseNow]);
  const send = useCallback(() => {
    const t = text.trim();
    if (!t || disabled || short) return;
    onSend(t);
    setText('');
    ref.current?.blur();
  }, [text, disabled, short, onSend]);
  const sendBtn = (
    <Btn variant="primary" size="md" full icon="arrow-right" disabled={disabled || !!short || !text.trim()} onClick={send} sound="whisperSend">
      {sendLabel}
    </Btn>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-coach={coach}>
      {hint && <div style={{ fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>{hint}</div>}
      <div style={{ position: 'relative' }}>
        <textarea
          ref={ref}
          className="gu-field gu-hit"
          rows={2}
          maxLength={160}
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onFocus={refocus}
          onBlur={releaseTyping}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ minHeight: 64 }}
        />
        {/* Laid over the box, so showing or hiding it never moves the buttons under a finger. */}
        {typingPause && (
          <span style={{
            position: 'absolute', right: 6, bottom: 5, display: 'flex', alignItems: 'center', gap: 3, padding: '1px 4px 1px 2px',
            background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', pointerEvents: 'none',
            fontSize: 12, lineHeight: '14px', color: 'var(--cth-ink-500)'
          }}>
            <GIcon name="pause" px={16} />The day waits while you type
          </span>
        )}
      </div>
      {shown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
          {shown.map((s, i) => (
            <Chip key={i + s} onClick={() => setText(s)} accent={accent} style={{ width: '100%' }}>{s}</Chip>
          ))}
        </div>
      )}
      {warn && !short && <Warning text={warn} />}
      <div style={{ display: 'flex', gap: 8, marginTop: cost ? 4 : 0 }}>
        {suggestions.length > 3 && (
          <Btn variant="ghost" size="md" icon="refresh" onClick={() => setPage((p) => p + 1)} label="More ideas">Ideas</Btn>
        )}
        {cost ? (
          // Story mode: the cost sits as a tag on the button's top edge, so long labels keep their room.
          <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
            {sendBtn}
            <CostPips n={cost} short={!!short} chip style={{ position: 'absolute', top: -7, right: 6, pointerEvents: 'none' }} />
          </div>
        ) : sendBtn}
      </div>
      {short && <Refusal text={short} />}
    </div>
  );
}

// ── Story mode pieces: pips, costs, the standing bar, icon tiles ──

/** A row of square pips: filled for what is left, hollow for what is spent (the influence budget). */
export function Pips({ left, max, size = 10, gap = 2, color = 'var(--cth-lilac)', style, title }: {
  left: number; max: number; size?: number; gap?: number; color?: string; style?: CSSProperties; title?: string;
}) {
  const n = Math.max(0, Math.max(max, left));
  const edge = size >= 8 ? 2 : 1;
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap, flexShrink: 0, ...style }}>
      {Array.from({ length: n }, (_, i) => {
        const on = i < left;
        return (
          <span key={i} style={{
            width: size, height: size, flexShrink: 0,
            background: on ? color : 'var(--cth-cream-200)',
            boxShadow: `inset 0 0 0 ${edge}px ${on ? 'var(--cth-ink-900)' : 'var(--cth-ink-300)'}`
          }} />
        );
      })}
    </span>
  );
}

/**
 * What something costs in influence: one small lilac pip per point, and the number beside them
 * (both coral when it cannot be afforded).
 */
export function CostPips({ n, short, chip, num = true, style }: { n: number; short?: boolean; chip?: boolean; num?: boolean; style?: CSSProperties }) {
  const pips = (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} style={{
          width: 6, height: 6, flexShrink: 0, background: short ? 'var(--cth-coral)' : 'var(--cth-lilac)',
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-900)'
        }} />
      ))}
    </span>
  );
  return (
    <span title={`Costs ${n} influence`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
      ...(chip ? { padding: '1px 3px', background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-900)' } : null),
      ...style
    }}>
      {pips}
      {num && (
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 16, lineHeight: '10px', color: short ? '#c43c3c' : 'var(--cth-ink-700)' }}>{n}</span>
      )}
    </span>
  );
}

let uiToastSeq = 0;

/**
 * A toast from the interface itself (a refusal the player caused by tapping something), in the same
 * place and style as the game's own toasts. Goes away by itself.
 */
export function uiToast(game: GameApi, text: string, tone: ToastUi['tone'] = 'bad', icon?: string): void {
  uiToastSeq += 1;
  const id = `ui${uiToastSeq}`;
  game.store.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone, icon }] }));
  window.setTimeout(() => game.dismissToast(id), 3600);
}

/** Thresholds for the end of the week, from the story rules (storyNumbers.ts): the marks on the bar. */
export const STANDING_SAFE = SAVED_AT;
export const STANDING_RISK = CLOSED_BELOW;
export function standingColor(v: number): string {
  return v >= STANDING_SAFE ? 'var(--cth-mint)' : v >= STANDING_RISK ? 'var(--cth-lemon)' : 'var(--cth-coral)';
}
/** Plain words for where the standing sits now. */
export function standingWord(v: number): string {
  return v >= STANDING_SAFE ? 'On course to stay open' : v >= STANDING_RISK ? 'At risk' : 'On course to close';
}

/**
 * Branch standing, 0 to 100, filled in the colour of its zone, with small marks at 40 and 65.
 * With `from`, the part gained or lost since then is hatched.
 */
export function StandingBar({ value, from, h = 12, w, marks = true, style }: {
  value: number; from?: number; h?: number; w?: number | string; marks?: boolean; style?: CSSProperties;
}) {
  const clamp = (x: number) => Math.max(0, Math.min(100, x)) / 100;
  const v = clamp(value);
  const f = from === undefined ? v : clamp(from);
  const lo = Math.min(v, f), hi = Math.max(v, f);
  const gain = v >= f;
  const color = standingColor(value);
  const hatch = (c: string) => `repeating-linear-gradient(135deg, ${c} 0 2px, var(--cth-cream-50) 2px 4px)`;
  return (
    <div title={`Standing ${Math.round(value)} of 100`} style={{
      position: 'relative', width: w ?? '100%', height: h, flexShrink: w ? 0 : 1, minWidth: 0,
      background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)', ...style
    }}>
      <div style={{ position: 'absolute', left: 2, top: 2, bottom: 2, width: `calc((100% - 4px) * ${lo})`, background: color }} />
      {hi > lo && (
        <div style={{
          position: 'absolute', top: 2, bottom: 2, left: `calc(2px + (100% - 4px) * ${lo})`, width: `calc((100% - 4px) * ${hi - lo})`,
          background: hatch(gain ? color : 'var(--cth-coral)'), boxShadow: gain ? undefined : 'inset 0 0 0 1px var(--cth-coral)'
        }} />
      )}
      {marks && [STANDING_RISK, STANDING_SAFE].map((m) => (
        <div key={m} style={{ position: 'absolute', top: -2, bottom: -2, width: 2, left: `calc(1px + (100% - 4px) * ${m / 100})`, background: 'var(--cth-ink-700)' }} />
      ))}
    </div>
  );
}

/** A square icon tile with an ink edge, the same as the goal tiles in the Director tab. */
export function IconTile({ icon, size = 24, bg = 'var(--cth-cream-50)', style, title }: {
  icon: GIconName | string; size?: number; bg?: string; style?: CSSProperties; title?: string;
}) {
  return (
    <div title={title} style={{
      width: size, height: size, flexShrink: 0, display: 'grid', placeItems: 'center', background: bg,
      boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)', ...style
    }}>
      <GIcon name={icon} px={size >= 40 ? 32 : 16} />
    </div>
  );
}

/** A side effect to know about before confirming, with a lemon edge ("Using a power fails Quiet hands"). */
export function Warning({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <div className="gu-drop" style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px 7px 14px', background: 'var(--cth-lemon-light)',
      boxShadow: 'inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 var(--cth-lemon)', fontSize: 14, lineHeight: '18px', ...style
    }}>
      <GIcon name="warn" px={16} style={{ marginTop: 1 }} />
      <span style={{ minWidth: 0 }}>{text}</span>
    </div>
  );
}

/** A refusal line with a coral edge, as under the power cards ("Not enough influence: ..."). */
export function Refusal({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <div className="gu-drop" style={{
      display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px 8px 14px', background: 'var(--cth-cream-50)',
      boxShadow: 'inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 var(--cth-coral)', fontSize: 14, lineHeight: '18px', ...style
    }}>
      <GIcon name="warn" px={16} />
      <span style={{ minWidth: 0 }}>{text}</span>
    </div>
  );
}

/** Light pixel divider. */
export function Rule() {
  return <div style={{ height: 0, borderTop: '2px dashed var(--cth-ink-300)', margin: '2px 0' }} />;
}
