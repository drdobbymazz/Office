import { createContext, useContext, useEffect, useState } from 'react';
import { shallow } from 'zustand/shallow';
import type { GameApi, UiState } from '@/game/app/gameApi';
import type { Suggestions, Tips } from '@/game/core/content/types';

export interface UiCtx {
  game: GameApi;
  suggestions: Suggestions;
  tips: Tips;
}

export const GameCtx = createContext<UiCtx | null>(null);

export function useGame(): GameApi {
  const c = useContext(GameCtx);
  if (!c) throw new Error('GameUI context missing');
  return c.game;
}

export function useContent(): { suggestions: Suggestions; tips: Tips } {
  const c = useContext(GameCtx);
  if (!c) throw new Error('GameUI context missing');
  return c;
}

/** Narrow subscription to the UI store, compared shallowly. */
export function useUi<T>(sel: (s: UiState) => T): T {
  const game = useGame();
  return game.store(sel, shallow);
}

/** Re-render every `ms` while mounted (cooldown counters, typing effects). Returns performance.now(). */
export function useNow(ms: number, on = true): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(performance.now()), ms);
    return () => window.clearInterval(t);
  }, [ms, on]);
  return now;
}

export interface Viewport {
  w: number;
  h: number;
  portrait: boolean;
  /** Short landscape phone (412 tall or less). */
  short: boolean;
  /** Desktop-size window. */
  wide: boolean;
}

function measure(): Viewport {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { w, h, portrait: h > w, short: h <= 440, wide: w >= 1200 && h >= 640 };
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState(measure);
  useEffect(() => {
    const on = () => setVp(measure());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return vp;
}
