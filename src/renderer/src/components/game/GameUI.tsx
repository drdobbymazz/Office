// The game's interface for a phone held sideways, laid over the full-screen
// office floor (drawn on a canvas beneath by someone else). The root lets
// touches through; only real controls take them, so the player can still pan,
// pinch and drag people on the floor.
//
// Reads the UI store through narrow selectors and calls GameApi methods. Nothing else.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/pixelify-sans/700.css';
import './gameui.css';
import type { GameApi } from '@/game/app/gameApi';
import type { CharId, ChaosId } from '@/game/core/types';
import type { Suggestions, Tips } from '@/game/core/content/types';
import { GameCtx, useViewport, type UiCtx } from './ctx';
import { BubbleLayer, type Bounds } from './Bubbles';
import { EventsAndToasts, OfflineBanner, StatusStrip, STRIP_W, Subtitle } from './Hud';
import { Dock, NavCtx, type Nav } from './Dock';
import { Coach, ReportCard, RotateCard, TitleCard } from './Dialogs';
import { pendingChaos } from './PowersTab';
import type { TabId } from './words';

export interface GameUIInitial {
  tab?: TabId;
  open?: boolean;
  personId?: CharId;
  chaos?: ChaosId;
  playAnyway?: boolean;
}

const SAFE_LEFT = 'max(8px, env(safe-area-inset-left))';

export function GameUI(props: { game: GameApi; suggestions: Suggestions; tips: Tips; initial?: GameUIInitial }): JSX.Element {
  const { game, suggestions, tips, initial } = props;
  const ctx = useMemo<UiCtx>(() => ({ game, suggestions, tips }), [game, suggestions, tips]);
  const vp = useViewport();
  const [tab, setTab] = useState<TabId>(initial?.tab ?? 'director');
  const [open, setOpenState] = useState<boolean>(initial?.open ?? true);
  const [personId, setPersonId] = useState<CharId | null>(initial?.personId ?? null);
  const [playAnyway, setPlayAnyway] = useState(!!initial?.playAnyway);
  const [cover, setCover] = useState({ right: 0, bottom: 0 });
  const dockRef = useRef<HTMLDivElement | null>(null);
  const bounds = useRef<Bounds>({ left: 0, right: 0, top: 0, bottom: 0 });

  if (initial?.chaos && pendingChaos.id === null && tab === 'powers') pendingChaos.set(initial.chaos);

  const phase = game.store((s) => s.phase);
  const tutorialDone = game.store((s) => s.settings.tutorialDone);
  const selectedId = game.store((s) => s.selectedId);

  const nav = useMemo<Nav>(() => ({
    tab, open, personId,
    go: (t) => { setTab(t); setOpenState(true); },
    setOpen: setOpenState,
    openPerson: setPersonId
  }), [tab, open, personId]);

  // Tapping someone on the floor opens their sheet.
  const lastSel = useRef(selectedId);
  useEffect(() => {
    if (selectedId && selectedId !== lastSel.current && selectedId !== personId) {
      setTab('people'); setPersonId(selectedId); setOpenState(true);
    }
    lastSel.current = selectedId;
  }, [selectedId, personId]);

  const portrait = vp.portrait;
  const blocked = portrait && !playAnyway;

  // Tell the camera how much of the screen the panel covers, whenever it changes.
  const measure = useCallback(() => {
    const el = dockRef.current;
    const vw = window.innerWidth, vh = window.innerHeight;
    let right = 0, bottom = 0;
    if (el) {
      const r = el.getBoundingClientRect();
      if (portrait) bottom = Math.max(0, Math.round(vh - r.top));
      else right = Math.max(0, Math.round(vw - r.left));
    }
    bounds.current = { left: 0, right, top: 0, bottom };
    setCover((c) => (c.right === right && c.bottom === bottom ? c : { right, bottom }));
  }, [portrait]);
  useLayoutEffect(() => {
    measure();
    const el = dockRef.current;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure, open, tab, portrait, blocked]);
  useEffect(() => {
    game.setInsets({ left: 0, right: cover.right, top: 0, bottom: cover.bottom });
  }, [game, cover.right, cover.bottom]);

  // Events go beside the status strip when there is room, under it when not.
  const freeBeside = vp.w - cover.right - (STRIP_W + 24);
  const eventsLeft = freeBeside >= 220 ? `calc(${SAFE_LEFT} + ${STRIP_W + 8}px)` : SAFE_LEFT;
  const playing = phase === 'playing';

  return (
    <GameCtx.Provider value={ctx}>
      <NavCtx.Provider value={nav}>
        <div className="gu-root">
          <BubbleLayer bounds={bounds} />
          {phase !== 'title' && (
            <>
              <StatusStrip left={SAFE_LEFT} />
              <div style={{ position: 'absolute', inset: 0, top: freeBeside >= 220 ? 0 : 76, pointerEvents: 'none' }}>
                <EventsAndToasts left={eventsLeft} right={cover.right} />
              </div>
              <Subtitle right={cover.right} bottom={cover.bottom} />
              <OfflineBanner left={SAFE_LEFT} onFix={() => nav.go('settings')} />
            </>
          )}
          {!blocked && <Dock ref={dockRef} vp={vp} portrait={portrait} />}
          {phase === 'title' && !blocked && <TitleCard vp={vp} />}
          {phase === 'report' && !blocked && <ReportCard vp={vp} />}
          {playing && !tutorialDone && !blocked && (
            <Coach onDone={() => game.updateSettings({ tutorialDone: true })} />
          )}
          {blocked && <RotateCard onPlay={() => { game.uiSound('tap'); setPlayAnyway(true); }} />}
        </div>
      </NavCtx.Provider>
    </GameCtx.Provider>
  );
}
