// Browser platform adapter — lets the office sandbox run as a plain web app
// (e.g. deployed to Vercel) with no Electron main process.
//
// In Electron, the preload script installs the full `window.cth` bridge. In a
// browser there's no preload, so we install a lightweight shim that implements
// exactly what game mode needs: config persisted to localStorage, and Ollama
// reached by talking to the visitor's OWN local server directly over fetch.
//
// Everything else on the CthApi surface (PTYs, the hive, git, Slack, …) is
// Electron-only and never reached in game mode; a Proxy returns benign no-ops
// for any such call so a stray reference can't crash the floor.

import type { HarnessConfig } from '@/store/config';

// The user's Tailscale-served LLM laptop — the default model host. Reachable
// only while that machine is online on the tailnet; override in Settings.
const DEFAULT_OLLAMA = 'https://msi.tail780d1f.ts.net';
const CONFIG_KEY = 'cthweb.config';

const DEFAULT_CONFIG: HarnessConfig = {
  onboardingComplete: true,
  harnessHome: null,
  registeredRepos: [],
  autoMode: false,
  defaultCommand: 'claude',
  semanticMemory: false,
  embeddingModel: 'minilm',
  mode: 'game',
  llmBaseUrl: DEFAULT_OLLAMA,
  gameModel: 'danger'
};

function readConfig(): HarnessConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<HarnessConfig>) };
  } catch { /* fall through to defaults */ }
  return { ...DEFAULT_CONFIG };
}

function writeConfig(patch: Partial<HarnessConfig>): HarnessConfig {
  const next = { ...readConfig(), ...patch };
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

function normBase(url?: string): string {
  const u = (url || readConfig().llmBaseUrl || DEFAULT_OLLAMA).trim().replace(/\/+$/, '');
  return u || DEFAULT_OLLAMA;
}

async function ollamaStatus(baseUrl?: string) {
  const base = normBase(baseUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) return { available: false, models: [], baseUrl: base, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? []).map((m) => m.name).filter((n): n is string => typeof n === 'string');
    return { available: true, models, baseUrl: base };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A browser CORS rejection surfaces as a generic TypeError — hint at the fix.
    const friendly = /abort/i.test(msg)
      ? 'Ollama did not respond — is it running? (`ollama serve`)'
      : `${msg} — if Ollama is running, allow this origin: OLLAMA_ORIGINS=${location.origin} ollama serve`;
    return { available: false, models: [], baseUrl: base, error: friendly };
  } finally {
    clearTimeout(timer);
  }
}

interface ChatReq {
  baseUrl?: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  format?: unknown;
  options?: Record<string, unknown>;
  timeoutMs?: number;
}

async function ollamaChat(req: ChatReq) {
  const base = normBase(req.baseUrl);
  if (!req.model) return { ok: false, error: 'no model selected' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 60000);
  try {
    const body: Record<string, unknown> = { model: req.model, messages: req.messages, stream: false };
    if (req.format !== undefined) body.format = req.format;
    if (req.options) body.options = req.options;
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}` };
    }
    const data = (await res.json()) as { message?: { content?: string }; error?: string };
    if (data.error) return { ok: false, error: data.error };
    const content = data.message?.content;
    if (typeof content !== 'string') return { ok: false, error: 'no content in response' };
    return { ok: true, content };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort/i.test(msg) ? 'generation timed out' : msg };
  } finally {
    clearTimeout(timer);
  }
}

/** The methods game mode actually uses in the browser. */
const webHandlers: Record<string, unknown> = {
  getConfig: async () => readConfig(),
  updateConfig: async (patch: Partial<HarnessConfig>) => writeConfig(patch),
  ollamaStatus: (baseUrl?: string) => ollamaStatus(baseUrl),
  ollamaChat: (req: ChatReq) => ollamaChat(req),
  copyToClipboard: async (text: string) => {
    try { await navigator.clipboard.writeText(text); return { ok: true }; }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  },
  listPtys: async () => []
};

/** True when running under Electron (the preload bridge is present). */
export function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { cth?: unknown }).cth;
}

/** Install the browser shim onto window.cth. Any method we didn't implement
 *  returns a safe no-op (an unsub fn for `on*(cb)` listeners, else a resolved
 *  promise) so the Electron-only call sites degrade gracefully. */
export function installWebCth(): void {
  const proxy = new Proxy(webHandlers, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        const last = args[args.length - 1];
        if (typeof last === 'function') return () => { /* unsubscribe no-op */ };
        return Promise.resolve(undefined);
      };
    }
  });
  (window as unknown as { cth: unknown }).cth = proxy;
}
