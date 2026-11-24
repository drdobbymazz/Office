// The game's interface for a phone held sideways, laid over the full-screen
// office floor (drawn on a canvas beneath by someone else). The root lets
// touches through; only real controls take them, so the player can still pan,
// pinch and drag people on the floor.
//
// Reads the UI store through narrow selectors and calls GameApi methods. Nothing else.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/pixelify-sans/700.css';
import './gameui.css';
import './screens.css';
import type { GameApi } from '@/game/app/gameApi';
import type { CharId, ChaosId } from '@/game/core/types';
import type { Suggestions, Tips } from '@/game/core/content/types';
import { GameCtx, useViewport, type UiCtx } from './ctx';
import { BubbleLayer, type Bounds } from './Bubbles';
import { StoryMarkers } from './markers';
import { EventsAndToasts, hudBottom, hudInset, MissionChip, OfflineBanner, StatusStrip, STRIP_W, Subtitle } from './Hud';
import { StoryCoach } from './coach';
import { Dock, NavCtx, type Nav } from './Dock';
import { ChapterCard, Coach, EndingCard, FinaleSkip, IntroSkip, ReportCard, RotateCard, TitleCard } from './Dialogs';
import { CeremonyBanner } from './ceremony';
import { DayBand, useDayBand, useScreenWipe } from './transitions';
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
  const intro = game.store((s) => s.intro);
  const finale = game.store((s) => s.phase === 'ending' && s.finale);
  const tutorialDone = game.store((s) => s.settings.tutorialDone);
  const selectedId = game.store((s) => s.selectedId);
  const mode = game.store((s) => s.mode);
  const storyOn = game.store((s) => (s.mode === 'story' || s.mode === 'saga') && !!s.story);

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
  const blocked = portrait && (vp.coarse || vp.w < 600) && !playAnyway;

  // What is on screen trails the game's phase by half a wipe: the paper sheet covers the old screen
  // before the new one is shown (transitions.tsx). The intro and finale count as their own screens.
  const { shown: screen, wipe } = useScreenWipe(intro ? 'intro' : finale ? 'finale' : phase, game);
  // The panel and the HUD belong to the day itself; the full-screen cards get the office behind them.
  const dockOn = screen === 'playing';
  // A band across the floor each time a day starts (from its card, a report or the title).
  const lastScreen = useRef(screen);
  const [daysStarted, setDaysStarted] = useState(0);
  useEffect(() => {
    if (screen === 'playing' && lastScreen.current !== 'playing') {
      setDaysStarted((n) => n + 1);
      // A new day opens on the list of people, not on whoever was looked at yesterday (who may not be here).
      setPersonId(null);
    }
    lastScreen.current = screen;
  }, [screen]);
  const band = useDayBand(daysStarted);

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
  }, [measure, open, tab, portrait, blocked, dockOn]);
  // The camera keeps the office below the HUD block (status strip and mission row), so nothing that matters
  // hides under it. Set behind the day's card and report too, so the floor does not jump when the day starts.
  const framedForHud = screen === 'playing' || screen === 'briefing' || screen === 'report';
  const chipTopInset = framedForHud ? hudInset(storyOn) : 0;
  useEffect(() => {
    game.setInsets({ left: 0, right: cover.right, top: chipTopInset, bottom: cover.bottom });
  }, [game, cover.right, cover.bottom, chipTopInset]);

  // Events go beside the status strip when there is room, under it (and the mission chip) when not.
  const freeBeside = vp.w - cover.right - (STRIP_W + 24);
  const eventsLeft = freeBeside >= 220 ? `calc(${SAFE_LEFT} + ${STRIP_W + 8}px)` : SAFE_LEFT;
  const playing = phase === 'playing';
  const chip = playing && storyOn;
  const underHud = hudBottom(storyOn) + 8;

  // Tapping the mission chip opens the Director tab at the mission.
  const openMission = useCallback(() => {
    setTab('director'); setOpenState(true);
    window.setTimeout(() => {
      (document.querySelector('[data-mission]') as HTMLElement | null)?.scrollIntoView({ block: 'start' });
    }, 60);
  }, []);

  return (
    <GameCtx.Provider value={ctx}>
      <NavCtx.Provider value={nav}>
        <div className="gu-root">
          {screen === 'playing' && <StoryMarkers />}
          <BubbleLayer bounds={bounds} />
          {screen === 'playing' && (
            <>
              <StatusStrip left={SAFE_LEFT} />
              {chip && <MissionChip left={SAFE_LEFT} onOpen={openMission} />}
              <div style={{ position: 'absolute', inset: 0, top: freeBeside >= 220 ? 0 : underHud, pointerEvents: 'none' }}>
                <EventsAndToasts left={eventsLeft} right={cover.right} />
              </div>
              <Subtitle right={cover.right} bottom={cover.bottom} />
              <OfflineBanner left={SAFE_LEFT} top={underHud} onFix={() => nav.go('settings')} />
              <CeremonyBanner right={cover.right} top={Math.round(vp.h * 0.3)} />
              {band && <DayBand right={cover.right} bottom={cover.bottom} />}
            </>
          )}
          {/* The intro and finale are narrated on the floor: captions and skip controls stay visible. */}
          {(screen === 'finale' || screen === 'intro') && <Subtitle right={0} bottom={0} />}
          {!blocked && dockOn && <Dock ref={dockRef} vp={vp} portrait={portrait} />}
          {screen === 'title' && !blocked && <TitleCard vp={vp} />}
          {screen === 'briefing' && !blocked && <ChapterCard vp={vp} />}
          {screen === 'report' && !blocked && <ReportCard vp={vp} />}
          {screen === 'ending' && !blocked && <EndingCard vp={vp} />}
          {screen === 'intro' && !blocked && <IntroSkip />}
          {screen === 'finale' && !blocked && <FinaleSkip />}
          {screen === 'playing' && !blocked && (storyOn
            ? (mode === 'story' && <StoryCoach />)
            : !tutorialDone && <Coach onDone={() => game.updateSettings({ tutorialDone: true })} />)}
          {blocked && <RotateCard onPlay={() => { game.uiSound('tap'); setPlayAnyway(true); }} />}
          {wipe}
        </div>
      </NavCtx.Provider>
    </GameCtx.Provider>
  );
}
