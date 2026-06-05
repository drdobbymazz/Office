// Local-LLM bridge — talks to a local Ollama server over HTTP.
//
// The renderer never hits Ollama directly: under file:// (production) the
// renderer's origin is "null", which Ollama's CORS policy rejects, and routing
// through the main process keeps the base URL + timeouts in one place. The
// renderer calls these via the `ollama:*` IPC handlers (see index.ts) which the
// game director uses to drive in-character dialogue on the office floor.

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_CHAT_TIMEOUT_MS = 60_000;
const DEFAULT_STATUS_TIMEOUT_MS = 4_000;

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  /** Ollama server base URL; defaults to http://127.0.0.1:11434. */
  baseUrl?: string;
  /** Model tag, e.g. 'llama3.1' or 'mistral'. */
  model: string;
  messages: OllamaChatMessage[];
  /** 'json' to force a JSON object, or a JSON-schema object for structured output. */
  format?: 'json' | Record<string, unknown>;
  /** Sampling options passed through to Ollama (temperature, num_predict, …). */
  options?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface OllamaChatResult {
  ok: boolean;
  /** The assistant message content (raw text; may be JSON when `format` is set). */
  content?: string;
  error?: string;
}

export interface OllamaStatus {
  /** True iff the server answered /api/tags. */
  available: boolean;
  /** Installed model tags (e.g. ['llama3.1:latest', 'mistral:latest']). */
  models: string[];
  baseUrl: string;
  error?: string;
}

function normBaseUrl(url?: string): string {
  const u = (url || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return u || DEFAULT_BASE_URL;
}

/** Probe the server and list installed models. Never throws. */
export async function ollamaStatus(baseUrl?: string): Promise<OllamaStatus> {
  const base = normBaseUrl(baseUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_STATUS_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) {
      return { available: false, models: [], baseUrl: base, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    const models = Array.isArray(data.models)
      ? data.models.map((m) => m.name).filter((n): n is string => typeof n === 'string')
      : [];
    return { available: true, models, baseUrl: base };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = /abort/i.test(msg)
      ? 'Ollama did not respond — is it running? (`ollama serve`)'
      : msg;
    return { available: false, models: [], baseUrl: base, error: friendly };
  } finally {
    clearTimeout(timer);
  }
}

/** One non-streaming chat completion. Never throws — errors come back as
 *  `{ ok:false, error }` so the director can degrade gracefully. */
export async function ollamaChat(req: OllamaChatRequest): Promise<OllamaChatResult> {
  const base = normBaseUrl(req.baseUrl);
  const model = (req.model || '').trim();
  if (!model) return { ok: false, error: 'no model selected' };
  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    return { ok: false, error: 'no messages' };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? DEFAULT_CHAT_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = {
      model,
      messages: req.messages,
      stream: false
    };
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
    const friendly = /abort/i.test(msg) ? 'generation timed out' : msg;
    return { ok: false, error: friendly };
  } finally {
    clearTimeout(timer);
  }
}
