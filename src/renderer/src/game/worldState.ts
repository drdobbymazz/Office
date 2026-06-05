// Persistence for the office sandbox — saves the whole world (day, scene,
// transcript, per-NPC memory) to localStorage so a reload resumes where you
// left off. Works identically in Electron and the browser (both have
// localStorage); nothing here touches window.cth.

import type { WorldSnapshot } from './director';
import { WORLD_VERSION } from './director';

const WORLD_KEY = 'cthgame.world';

export function loadWorld(): WorldSnapshot | null {
  try {
    const raw = localStorage.getItem(WORLD_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as WorldSnapshot;
    if (!snap || snap.version !== WORLD_VERSION) return null;
    return snap;
  } catch {
    return null;
  }
}

export function saveWorld(snap: WorldSnapshot): void {
  try {
    localStorage.setItem(WORLD_KEY, JSON.stringify(snap));
  } catch {
    /* quota / serialization — best-effort */
  }
}

export function clearWorld(): void {
  try { localStorage.removeItem(WORLD_KEY); } catch { /* noop */ }
}
