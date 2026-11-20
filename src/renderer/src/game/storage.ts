// localStorage that never throws. In private windows, sandboxed frames and
// previews, storage can be missing or refuse writes: the game must still run.

const PREFIX = 'overseer.';

export function loadJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to remove */
  }
}
