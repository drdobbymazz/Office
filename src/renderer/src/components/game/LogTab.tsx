// LOG: the old Scene Transcript. Everything that has happened, newest at the
// bottom, with a filter by person.

import { displayName } from '@/game/core/cast';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FeedItem } from '@/game/core/types';
import { formatClock } from '@/game/core/types';
import { PixelPanel } from '@/components/PixelPanel';
import { GIcon } from './icons';
import { PersonStrip } from './pickers';
import { useUi } from './ctx';
import { FEED_ICON, readableOnCream } from './words';

let lastFilter: string | null = null;

function Line({ f, color, name, otherName }: { f: FeedItem; color: string; name: string; otherName: string }) {
  const time = <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 15, lineHeight: '18px', color: 'var(--cth-ink-300)', flexShrink: 0, width: 36 }}>{formatClock(f.clock)}</span>;
  switch (f.kind) {
    case 'say':
      return (
        <div style={{ display: 'flex', gap: 6, fontSize: 15, lineHeight: '19px' }}>
          {time}
          <span><span style={{ color }}>{name}: </span><span style={{ color: 'var(--cth-ink-900)' }}>{f.text}</span></span>
        </div>
      );
    case 'think':
      return (
        <div style={{ display: 'flex', gap: 6, fontSize: 15, lineHeight: '19px', fontStyle: 'italic', color: 'var(--cth-ink-500)' }}>
          {time}
          <span><span style={{ color }}>{name}</span> thinks: {f.text}</span>
        </div>
      );
    case 'event':
    case 'overseer':
      return (
        <div style={{
          display: 'flex', gap: 6, alignItems: 'flex-start', padding: '4px 6px 4px 10px', fontSize: 14, lineHeight: '18px',
          background: f.kind === 'overseer' ? 'var(--cth-lilac-light)' : 'var(--cth-lemon-light)',
          boxShadow: `inset 0 0 0 1px var(--cth-ink-700), inset 4px 0 0 var(--cth-${f.kind === 'overseer' ? 'lilac' : 'lemon'})`
        }}>
          {time}
          <GIcon name={f.icon || FEED_ICON[f.kind]} px={16} style={{ marginTop: 1 }} />
          <span>{f.text}</span>
        </div>
      );
    case 'shift':
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
          {time}
          <GIcon name="morale" px={16} />
          <span>{f.text || `${name} feels differently about ${otherName}.`}</span>
        </div>
      );
    default:
      return (
        <div style={{ textAlign: 'center', fontFamily: 'var(--cth-font-mono)', fontSize: 17, lineHeight: '18px', color: 'var(--cth-ink-500)', padding: '2px 0' }}>
          {formatClock(f.clock)} · {f.text}
        </div>
      );
  }
}

export function LogTab() {
  const feed = useUi((s) => s.feed);
  const people = useUi((s) => s.people);
  const [who, setWho] = useState<string | null>(lastFilter);
  const end = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  useEffect(() => { lastFilter = who; }, [who]);

  const meta = useMemo(() => new Map(people.map((p) => [p.id, { name: p.name, color: readableOnCream(p.color) }])), [people]);
  const shown = useMemo(() => (who ? feed.filter((f) => f.who === who || f.other === who) : feed).slice(-120), [feed, who]);

  // Stay pinned to the newest line unless the player has scrolled up to read.
  useLayoutEffect(() => {
    const sc = end.current?.closest('[data-tab-scroll]') as HTMLElement | null;
    if (!sc) return;
    const onScroll = () => { stick.current = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60; };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => {
    const sc = end.current?.closest('[data-tab-scroll]') as HTMLElement | null;
    if (sc && stick.current) sc.scrollTop = sc.scrollHeight;
  }, [shown.length, who]);

  return (
    <>
      <div className="gu-paper" style={{ position: 'sticky', top: -8, zIndex: 3, margin: '-8px -8px 0', padding: '8px 8px 4px', boxShadow: '0 2px 0 var(--cth-ink-300)' }}>
        <PersonStrip value={who} onPick={setWho} allowAll />
      </div>
      <PixelPanel variant="default" title="SCENE TRANSCRIPT" noPadding>
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {shown.length === 0 && (
            <p style={{ margin: 0, fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
              {who ? 'Nothing from them yet.' : 'Nothing has happened yet. Give it a minute, or make something happen.'}
            </p>
          )}
          {shown.map((f) => {
            const m = f.who ? meta.get(f.who) : undefined;
            const o = f.other ? meta.get(f.other) : undefined;
            return <Line key={f.id} f={f} name={m?.name ?? (f.who ? displayName(f.who) : '')} color={m?.color ?? 'var(--cth-ink-700)'} otherName={o?.name ?? (f.other ? displayName(f.other) : '')} />;
          })}
          <div ref={end} />
        </div>
      </PixelPanel>
    </>
  );
}
