// Shared plumbing for the transports: errors the player can act on, timeouts,
// abort handling, and reading a streamed HTTP body line by line.

export type BrainErrorKind =
  | 'abort'      // we (the caller) cancelled it
  | 'timeout'    // no answer in time
  | 'connect'    // could not reach the server, or it hung up
  | 'cors'       // the browser blocked the call
  | 'model'      // the model is not installed
  | 'auth'       // key refused
  | 'http'       // some other server error
  | 'denied'     // Claude sampling not allowed here, for good
  | 'rate';      // slow down

export class BrainError extends Error {
  constructor(
    readonly kind: BrainErrorKind,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'BrainError';
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof BrainError ? e.kind === 'abort' : !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';
}

export interface TransportProgress {
  /** waking: no reply yet and it is taking a while (model loading); writing: tokens arriving; idle: done. */
  phase: 'waking' | 'writing' | 'idle';
  waitedMs: number;
}

export interface TransportOptions {
  /** First token of the very first call (model may be loading). Default 120 s. */
  coldTimeoutMs?: number;
  /** First token of later calls. Default 45 s. */
  firstTokenTimeoutMs?: number;
  /** Longest silence in the middle of a reply. Default 30 s. */
  stallTimeoutMs?: number;
  /** Timeout for status / model list calls. Default 6 s. */
  statusTimeoutMs?: number;
  /** Report 'waking' if nothing has arrived after this long. Default 3 s. */
  wakingAfterMs?: number;
  onProgress?: (p: TransportProgress) => void;
}

export const DEFAULT_TIMEOUTS = {
  coldTimeoutMs: 120_000,
  firstTokenTimeoutMs: 45_000,
  stallTimeoutMs: 30_000,
  statusTimeoutMs: 6_000,
  wakingAfterMs: 3_000
};

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

/** Absolute form of the URL, for messages (relative "/ollama" is resolved against the page). */
function shownUrl(url: string): string {
  try {
    if (typeof location !== 'undefined') return new URL(url, location.href).href;
  } catch {
    /* fall through */
  }
  return url;
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

/**
 * A fetch that failed before any HTTP answer. In a browser, "could not
 * connect", "blocked by CORS" and "blocked as mixed content" all look the same
 * (TypeError: Failed to fetch), so we guess from the addresses involved.
 */
export function networkError(url: string, base: string): BrainError {
  const shown = shownUrl(base);
  if (typeof location !== 'undefined' && location.protocol) {
    try {
      const target = new URL(url, location.href);
      if (location.protocol === 'https:' && target.protocol === 'http:' && !isLocalHost(target.hostname)) {
        return new BrainError(
          'cors',
          `This page is on https, so the browser will not let it call the plain http address ${shown}. ` +
            'Use the laptop\'s Tailscale https address instead, or open the game from the laptop\'s own server.'
        );
      }
      if (target.origin !== location.origin) {
        return new BrainError(
          'connect',
          `Could not reach the model server at ${shown}. Is the laptop awake and Ollama running? ` +
            'If it is, the browser may be blocking the call (CORS): on the laptop set OLLAMA_ORIGINS=* and restart Ollama, ' +
            'or open the game from the laptop\'s own server.'
        );
      }
    } catch {
      /* fall through */
    }
  }
  return new BrainError('connect', `Could not reach the model server at ${shown}. Is the laptop awake and Ollama running?`);
}

/** Pull a readable message out of an error body ({"error": "..."} or {"error": {"message": "..."}}). */
export function errorText(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: unknown; message?: unknown };
    const e = j.error;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') return (e as { message: string }).message;
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* not JSON */
  }
  return body.trim().slice(0, 200);
}

/**
 * One AbortController for a call: aborts when the caller's signal aborts, or
 * when our own timer fires. Remembers WHY it aborted so we can say so.
 */
export class CallGuard {
  readonly controller = new AbortController();
  reason: BrainError | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private onOuterAbort = (): void => this.abort(new BrainError('abort', 'Cancelled.'));

  constructor(private readonly outer?: AbortSignal) {
    if (outer?.aborted) this.abort(new BrainError('abort', 'Cancelled.'));
    else outer?.addEventListener('abort', this.onOuterAbort, { once: true });
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  abort(reason: BrainError): void {
    if (this.controller.signal.aborted) return;
    this.reason = reason;
    this.controller.abort(reason);
  }

  /** (Re)arm the timeout. */
  arm(ms: number, message: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.abort(new BrainError('timeout', message)), ms);
  }

  wakeAfter(ms: number, fn: () => void): void {
    this.wakeTimer = setTimeout(fn, ms);
  }

  clearWake(): void {
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.clearWake();
    this.outer?.removeEventListener('abort', this.onOuterAbort);
  }

  /** Turn whatever a failed fetch/read threw into a BrainError. */
  explain(e: unknown, fallback: () => BrainError): BrainError {
    if (this.reason) return this.reason;
    if (e instanceof BrainError) return e;
    return fallback();
  }
}

/** Read a streamed body and call onLine for each complete line of text. */
export async function readLines(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const cancel = (): void => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw signal.reason ?? new BrainError('abort', 'Cancelled.');
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (line.trim()) onLine(line);
      }
    }
    buf += decoder.decode();
    if (buf.trim()) onLine(buf);
    if (signal.aborted) throw signal.reason ?? new BrainError('abort', 'Cancelled.');
  } finally {
    signal.removeEventListener('abort', cancel);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

/** fetch with a timeout, for small status calls. */
export async function fetchQuick(url: string, init: RequestInit, ms: number, outer?: AbortSignal): Promise<Response> {
  const guard = new CallGuard(outer);
  guard.arm(ms, 'The server took too long to answer.');
  try {
    return await fetch(url, { ...init, signal: guard.signal });
  } catch (e) {
    throw guard.explain(e, () => new BrainError('connect', String(e)));
  } finally {
    guard.dispose();
  }
}
