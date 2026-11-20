// Player settings: defaults, loading, saving.

import type { GameSettings } from '@/game/app/gameApi';
import { DEFAULT_BRAIN_SETTINGS } from '@/game/brain/api';
import { loadJson, saveJson } from './storage';

const KEY = 'settings.v1';

export const DEFAULT_SETTINGS: GameSettings = {
  brain: { ...DEFAULT_BRAIN_SETTINGS },
  volumes: { master: 0.9, music: 0.45, sfx: 0.8, voice: 0.7 },
  muted: false,
  dayMinutes: 10,
  autoCamera: true,
  captions: true,
  sandbox: false,
  haptics: true,
  quality: 'auto',
  tutorialDone: false
};

export function loadSettings(): GameSettings {
  const saved = loadJson<Partial<GameSettings>>(KEY);
  if (!saved || typeof saved !== 'object') return structuredClone(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    brain: { ...DEFAULT_SETTINGS.brain, ...(saved.brain ?? {}) },
    volumes: { ...DEFAULT_SETTINGS.volumes, ...(saved.volumes ?? {}) }
  };
}

export function saveSettings(s: GameSettings): void {
  saveJson(KEY, s);
}
