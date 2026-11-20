// Target pickers: a miniature plan of the office (drawn from ROOMS) with tiny
// portraits of who is in each room, a grid of people, and a slim strip of heads.

import { useMemo } from 'react';
import type { PersonUi } from '@/game/app/gameApi';
import type { AccentColorName } from '@/design/tokens';
import type { CharId, TargetRoomId } from '@/game/core/types';
import { TARGET_ROOMS } from '@/game/core/types';
import { ROOMS } from '@/game/core/world';
import { Head, usePress } from './kit';
import { useGame, useUi } from './ctx';
import { ROOM_SHORT, readableOnCream } from './words';

const PLAN = ROOMS.filter((r) => (TARGET_ROOMS as readonly string[]).includes(r.id));
const MIN_Y = Math.min(...PLAN.map((r) => r.rect.y));
const MAX_Y = Math.max(...PLAN.map((r) => r.rect.y + r.rect.h));
// Rooms keep their real order, heights and relative widths, but the corridors
// between them are squeezed out so each room is wide enough to tap and label.
const TOP = PLAN.filter((r) => r.rect.y < 11).sort((a, b) => a.rect.x - b.rect.x);
const BOTTOM = PLAN.filter((r) => r.rect.y >= 11).sort((a, b) => a.rect.x - b.rect.x);
const LAYOUT = new Map<string, { x: number; w: number }>();
// The conference room gives a little width to the accounting corner so "Accounts" fits.
const WEIGHT: Record<string, number> = { meeting: -2, accounts: 1 };
for (const band of [TOP, BOTTOM]) {
  const wOf = (r: (typeof PLAN)[number]) => r.rect.w + (WEIGHT[r.id] ?? 0);
  const total = band.reduce((n, r) => n + wOf(r), 0);
  let x = 0;
  for (const r of band) { LAYOUT.set(r.id, { x: (x / total) * 100, w: (wOf(r) / total) * 100 }); x += wOf(r); }
}

function RoomCell({ id, name, rect, people, selected, accent, onPick }: {
  id: TargetRoomId; name: string; rect: { x: number; y: number; w: number; h: number }; people: PersonUi[];
  selected: boolean; accent: AccentColorName; onPick: (r: TargetRoomId) => void;
}) {
  const { pressed, handlers } = usePress();
  const lay = LAYOUT.get(id) ?? { x: 0, w: 10 };
  const left = lay.x;
  const w = lay.w;
  const top = ((rect.y - MIN_Y) / (MAX_Y - MIN_Y)) * 100;
  const h = (rect.h / (MAX_Y - MIN_Y)) * 100;
  const shown = people.slice(0, id === 'bullpen' ? 12 : 4);
  return (
    <button type="button" className="gu-hit" aria-label={name} {...handlers} onClick={() => onPick(id)}
      style={{
        position: 'absolute', left: `calc(${left}% + 1px)`, top: `calc(${top}% + 1px)`, width: `calc(${w}% - 2px)`, height: `calc(${h}% - 2px)`,
        border: 'none', padding: 4, margin: 0, cursor: 'pointer', touchAction: 'manipulation',
        background: selected ? `var(--cth-${accent})` : pressed ? 'var(--cth-cream-200)' : 'var(--cth-cream-50)',
        boxShadow: selected ? 'inset 0 0 0 3px var(--cth-ink-900)' : 'inset 0 0 0 2px var(--cth-ink-900)',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', overflow: 'hidden', textAlign: 'left'
      }}>
      <span style={{ fontSize: 12, lineHeight: '13px', color: 'var(--cth-ink-900)', padding: '1px 1px 0' }}>{ROOM_SHORT[id]}</span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 1, maxWidth: '100%' }}>
        {shown.map((p) => <Head key={p.id} src={p.avatar} scale={1} box={12} ring={p.color} />)}
        {people.length > shown.length && <span style={{ fontSize: 12, lineHeight: '10px' }}>+{people.length - shown.length}</span>}
      </span>
    </button>
  );
}

export function RoomMap({ value, onPick, accent = 'coral' }: { value: TargetRoomId | null; onPick: (r: TargetRoomId) => void; accent?: AccentColorName }) {
  const people = useUi((s) => s.people);
  const byRoom = useMemo(() => {
    const m = new Map<string, PersonUi[]>();
    for (const p of people) if (p.present) m.set(p.room, [...(m.get(p.room) ?? []), p]);
    return m;
  }, [people]);
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: `32 / ${(MAX_Y - MIN_Y) * 1.45}`,
      background: 'var(--cth-ink-700)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)', padding: 2
    }}>
      <div style={{ position: 'absolute', inset: 2 }}>
        {PLAN.map((r) => (
          <RoomCell key={r.id} id={r.id as TargetRoomId} name={r.name} rect={r.rect} people={byRoom.get(r.id) ?? []}
            selected={value === r.id} accent={accent} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function PersonCell({ p, selected, disabled, accent, onPick }: { p: PersonUi; selected: boolean; disabled: boolean; accent: AccentColorName; onPick: () => void }) {
  const { pressed, handlers } = usePress(disabled);
  return (
    <button type="button" className="gu-hit" disabled={disabled} {...handlers} onClick={onPick} aria-label={p.name}
      style={{
        minHeight: 64, padding: '6px 2px 4px', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', touchAction: 'manipulation',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: selected ? `var(--cth-${accent}-light)` : 'var(--cth-cream-50)',
        boxShadow: selected ? 'inset 0 0 0 3px var(--cth-ink-900)' : pressed ? 'inset 0 0 0 1px var(--cth-ink-900)' : 'inset 0 0 0 1px var(--cth-ink-900), 0 2px 0 var(--cth-ink-700)',
        transform: pressed ? 'translateY(2px)' : 'none', marginBottom: 2, opacity: disabled ? 0.4 : 1
      }}>
      <Head src={p.avatar} scale={2} box={14} ring={selected ? 'var(--cth-ink-900)' : undefined} />
      <span style={{ fontSize: 13, lineHeight: '14px', color: readableOnCream(p.color), maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
    </button>
  );
}

export function PersonGrid({ value, onPick, exclude, accent = 'coral', cols = 4 }: {
  value: CharId | null; onPick: (id: CharId) => void; exclude?: CharId | null; accent?: AccentColorName; cols?: number;
}) {
  const people = useUi((s) => s.people);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
      {people.filter((p) => p.id !== exclude).map((p) => (
        <PersonCell key={p.id} p={p} selected={value === p.id} disabled={!p.present || p.busy} accent={accent} onPick={() => onPick(p.id)} />
      ))}
    </div>
  );
}

/** One row of heads that scrolls sideways. `null` means everyone (when allowAll). */
export function PersonStrip({ value, onPick, allowAll }: { value: CharId | null; onPick: (id: CharId | null) => void; allowAll?: boolean }) {
  const game = useGame();
  const people = useUi((s) => s.people);
  return (
    <div className="gu-scroll-x gu-hit" style={{ display: 'flex', gap: 4, paddingBottom: 4 }}>
      {allowAll && (
        <button type="button" onClick={() => { game.uiSound('tap'); onPick(null); }}
          style={{
            minWidth: 52, height: 44, border: 'none', flexShrink: 0, cursor: 'pointer', touchAction: 'manipulation',
            background: value === null ? 'var(--cth-lemon)' : 'var(--cth-cream-50)',
            boxShadow: value === null ? 'inset 0 0 0 3px var(--cth-ink-900)' : 'inset 0 0 0 1px var(--cth-ink-900)',
            fontFamily: 'var(--cth-font-ui)', fontSize: 14
          }}>All</button>
      )}
      {people.map((p) => {
        const on = value === p.id;
        return (
          <button key={p.id} type="button" aria-label={p.name} onClick={() => { game.uiSound('tap'); onPick(p.id); }}
            style={{
              width: 44, height: 44, padding: 0, border: 'none', flexShrink: 0, cursor: 'pointer', touchAction: 'manipulation',
              display: 'grid', placeItems: 'center', opacity: p.present ? 1 : 0.4,
              background: on ? 'var(--cth-lilac-light)' : 'var(--cth-cream-50)',
              boxShadow: on ? 'inset 0 0 0 3px var(--cth-ink-900)' : 'inset 0 0 0 1px var(--cth-ink-900)'
            }}>
            <Head src={p.avatar} scale={2} box={14} />
          </button>
        );
      })}
    </div>
  );
}
