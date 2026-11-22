// The main panel: a rail of tab icons on its inner edge, and the open tab's
// sheet beside it. On a phone held sideways it sits on the right, full height;
// collapsed, only the rail stays. In portrait it becomes a bottom sheet with
// the rail along its top.

import { createContext, forwardRef, ReactNode, useContext } from 'react';
import type { CharId } from '@/game/core/types';
import { GIcon } from './icons';
import { useGame, type Viewport } from './ctx';
import { TABS, type TabId } from './words';
import { usePress } from './kit';
import { DirectorTab } from './DirectorTab';
import { PowersTab } from './PowersTab';
import { PeopleTab } from './PeopleTab';
import { LogTab } from './LogTab';
import { SettingsTab } from './SettingsTab';

export interface Nav {
  tab: TabId;
  open: boolean;
  go(tab: TabId): void;
  setOpen(open: boolean): void;
  /** Person sheet open in the People tab. */
  personId: CharId | null;
  openPerson(id: CharId | null): void;
}

export const NavCtx = createContext<Nav | null>(null);
export function useNav(): Nav {
  const n = useContext(NavCtx);
  if (!n) throw new Error('NavCtx missing');
  return n;
}

export const RAIL = 56;
export function sheetWidth(vp: Viewport): number {
  if (vp.wide) return 324;
  return vp.w < 840 ? 244 : 256;
}

function RailTab({ id, label, icon, accent, active, vertical, onTap }: {
  id: string; label: string; icon: string; accent: string; active: boolean; vertical: boolean; onTap: () => void;
}) {
  const { pressed, handlers } = usePress();
  return (
    <button type="button" className="gu-tab gu-hit" aria-label={label} data-coach={`tab-${id}`} {...handlers} onClick={onTap}
      style={{
        width: vertical ? RAIL : undefined, flex: vertical ? undefined : 1, height: vertical ? (active ? 60 : 48) : RAIL,
        background: active ? 'var(--cth-cream-100)' : 'transparent',
        // The open tab joins the sheet: ink on three sides, open on the sheet side.
        boxShadow: active
          ? vertical
            ? `inset 2px 0 0 var(--cth-ink-900), inset 0 2px 0 var(--cth-ink-900), inset 0 -2px 0 var(--cth-ink-900), inset 6px 0 0 var(--cth-${accent})`
            : `inset 2px 0 0 var(--cth-ink-900), inset -2px 0 0 var(--cth-ink-900), inset 0 2px 0 var(--cth-ink-900), inset 0 6px 0 var(--cth-${accent})`
          : 'none',
        marginRight: vertical && active ? -2 : 0,
        marginBottom: !vertical && active ? -2 : 0,
        zIndex: active ? 2 : 1,
        transform: pressed ? 'translateY(1px)' : 'none',
        touchAction: 'manipulation'
      }}>
      {/* The open tab keeps its full-size icon (the stripe marks it) and names itself underneath, inside the rail. */}
      <GIcon name={icon} px={32} style={{ opacity: active ? 1 : 0.85 }} />
      {active && (
        <span style={{
          fontFamily: 'var(--cth-font-ui)', fontSize: 11, lineHeight: '12px', color: 'var(--cth-ink-900)',
          maxWidth: vertical ? RAIL - 6 : undefined, overflow: 'hidden', whiteSpace: 'nowrap'
        }}>{label}</span>
      )}
    </button>
  );
}

function CollapseTab({ open, vertical, onTap }: { open: boolean; vertical: boolean; onTap: () => void }) {
  const { pressed, handlers } = usePress();
  const icon = vertical ? (open ? 'chev-right' : 'chev-left') : open ? 'minimize' : 'expand';
  return (
    <button type="button" className="gu-tab gu-hit" aria-label={open ? 'Hide panel' : 'Show panel'} {...handlers} onClick={onTap}
      style={{
        width: vertical ? RAIL - 8 : 44, height: vertical ? 40 : 40, margin: vertical ? '0 4px 0 4px' : '4px 4px 4px 0',
        background: 'var(--cth-cream-50)',
        boxShadow: pressed ? 'inset 0 0 0 2px var(--cth-ink-900)' : 'inset 0 0 0 2px var(--cth-ink-900), 0 2px 0 var(--cth-ink-700)',
        transform: pressed ? 'translateY(2px)' : 'none', touchAction: 'manipulation'
      }}>
      <GIcon name={icon} px={16} />
    </button>
  );
}

function TabBody({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'director': return <DirectorTab />;
    case 'powers': return <PowersTab />;
    case 'people': return <PeopleTab />;
    case 'log': return <LogTab />;
    case 'settings': return <SettingsTab />;
  }
}

export const Dock = forwardRef<HTMLDivElement, { vp: Viewport; portrait: boolean; children?: ReactNode }>(function Dock({ vp, portrait }, ref) {
  const game = useGame();
  const nav = useNav();
  const vertical = !portrait;
  const w = sheetWidth(vp);

  const tapTab = (id: TabId) => {
    if (nav.open && nav.tab === id) { game.uiSound('close'); nav.setOpen(false); return; }
    game.uiSound(nav.open ? 'tap' : 'open');
    nav.go(id);
  };
  const toggle = () => { game.uiSound(nav.open ? 'close' : 'open'); nav.setOpen(!nav.open); };

  const rail = (
    <div style={{
      display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: vertical ? 'flex-start' : 'flex-end',
      gap: vertical ? 2 : 0,
      width: vertical ? RAIL : '100%', height: vertical ? '100%' : RAIL,
      padding: vertical ? '8px 0' : '0 0 0 4px',
      background: 'var(--cth-cream-200)',
      boxShadow: vertical
        ? 'inset 2px 0 0 var(--cth-ink-900), inset -2px 0 0 var(--cth-ink-900)'
        : 'inset 0 2px 0 var(--cth-ink-900), inset 0 -2px 0 var(--cth-ink-900)',
      position: 'relative', flexShrink: 0
    }}>
      {TABS.map((t) => (
        <RailTab key={t.id} id={t.id} label={t.label} icon={t.icon} accent={t.accent}
          active={nav.open && nav.tab === t.id} vertical={vertical} onTap={() => tapTab(t.id)} />
      ))}
      <div style={{ flex: 1 }} />
      <CollapseTab open={nav.open} vertical={vertical} onTap={toggle} />
    </div>
  );

  const tabMeta = TABS.find((t) => t.id === nav.tab)!;
  const sheet = nav.open && (
    <div key={nav.tab} className="gu-paper" style={{
      display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0,
      width: vertical ? w : '100%', height: vertical ? '100%' : undefined, flex: vertical ? undefined : 1,
      boxShadow: vertical ? 'inset -1px 0 0 var(--cth-ink-700)' : 'none'
    }}>
      <div className="gu-scroll gu-hit" data-tab-scroll style={{ flex: 1, minHeight: 0, padding: 8, paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <TabBody tab={nav.tab} />
      </div>
      <span hidden>{tabMeta.label}</span>
    </div>
  );

  if (vertical) {
    return (
      <div ref={ref} className="gu-hit" style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, display: 'flex', isolation: 'isolate', zIndex: 5,
        paddingRight: 'env(safe-area-inset-right)', background: nav.open ? 'var(--cth-cream-100)' : 'transparent'
      }}>
        {rail}
        {sheet}
      </div>
    );
  }
  return (
    <div ref={ref} className="gu-hit" style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, height: nav.open ? '58%' : RAIL, isolation: 'isolate', zIndex: 5,
      display: 'flex', flexDirection: 'column', background: 'var(--cth-cream-100)',
      paddingBottom: nav.open ? 'env(safe-area-inset-bottom)' : 0
    }}>
      {rail}
      {sheet}
    </div>
  );
});
