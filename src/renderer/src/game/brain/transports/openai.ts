// OpenAI-compatible servers (LM Studio, llama.cpp server, vLLM, OpenRouter ...):
// POST {base}/chat/completions with stream: true (server-sent events).
// Not every server understands a strict json_schema, so on HTTP 400 we step
// down to { type: 'json_object' }, then to no response_format at all, and
// remember the step for later calls.

import type { BrainSettings, ChatRequest, ChatResponse, ChatTransport, TransportStatus } from '../api';
import { stripThink } from '../jsonStream';
import { now } from '../util';
import { BrainError, CallGuard, DEFAULT_TIMEOUTS, errorText, fetchQuick, joinUrl, networkError, readLines } from './common';
import type { TransportOptions } from './common';
import { stripUndefined } from './ollama';

type FormatMode = 'schema' | 'object' | 'none';

interface SseChunk {
  choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string } | string;
}

export class OpenAiTransport implements ChatTransport {
  readonly kind = 'openai' as const;
  readonly autonomous = true;
  private format: FormatMode = 'schema';
  private warm = false;
  private readonly t: typeof DEFAULT_TIMEOUTS;

  constructor(
    private readonly settings: BrainSettings,
    private readonly opts: TransportOptions = {}
  ) {
    this.t = { ...DEFAULT_TIMEOUTS, ...stripUndefined(opts) };
  }

  get formatMode(): FormatMode {
    return this.format;
  }

  private headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = {};
    if (json) h['Content-Type'] = 'application/json';
    if (this.settings.apiKey) h.Authorization = `Bearer ${this.settings.apiKey}`;
    return h;
  }

  async status(signal?: AbortSignal): Promise<TransportStatus> {
    const base = this.settings.baseUrl;
    const url = joinUrl(base, '/models');
    try {
      let res: Response;
      try {
        res = await fetchQuick(url, { method: 'GET', headers: this.headers(false) }, this.t.statusTimeoutMs, signal);
      } catch (e) {
        if (e instanceof BrainError && (e.kind === 'timeout' || e.kind === 'abort')) throw e;
        throw networkError(url, base);
      }
      if (res.status === 401 || res.status === 403) throw new BrainError('auth', `The server at ${base} refused the key (HTTP ${res.status}). Check the API key in settings.`);
      if (!res.ok) throw new BrainError('http', `The server at ${base} answered with an error (HTTP ${res.status}). Does the address end in /v1?`);
      const j = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
      const models = (j?.data ?? []).map((m) => m.id ?? '').filter(Boolean);
      if (models.length && this.settings.model && !models.includes(this.settings.model)) {
        return { ok: false, models, error: `That server has no model called ${this.settings.model}. Pick one of: ${models.slice(0, 6).join(', ')}.` };
      }
      return { ok: true, models };
    } catch (e) {
      return { ok: false, models: [], error: e instanceof Error ? e.message : String(e) };
    }
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    for (;;) {
      try {
        return await this.once(req);
      } catch (e) {
        if (e instanceof BrainError && e.kind === 'http' && e.status === 400 && this.format !== 'none') {
          this.format = this.format === 'schema' ? 'object' : 'none';
          continue;
        }
        throw e;
      }
    }
  }

  private async once(req: ChatRequest): Promise<ChatResponse> {
    const base = this.settings.baseUrl;
    const url = joinUrl(base, '/chat/completions');
    const body: Record<string, unknown> = {
      model: this.settings.model,
      messages: req.messages,
      stream: true,
      temperature: req.temperature,
      top_p: 0.92,
      max_tokens: req.maxTokens
    };
    if (this.format === 'schema') body.response_format = { type: 'json_schema', json_schema: { name: 'reply', strict: true, schema: req.schema } };
    else if (this.format === 'object') body.response_format = { type: 'json_object' };

    const guard = new CallGuard(req.signal);
    const t0 = now();
    const firstMs = this.warm ? this.t.firstTokenTimeoutMs : this.t.coldTimeoutMs;
    guard.arm(firstMs, `The model did not answer within ${Math.round(firstMs / 1000)} s.`);
    let waking = false;
    guard.wakeAfter(this.t.wakingAfterMs, () => {
      waking = true;
      this.opts.onProgress?.({ phase: 'waking', waitedMs: now() - t0 });
    });
    let content = '';
    let shown = '';
    let firstTokenMs: number | undefined;
    let finished = false;
    let usage: SseChunk['usage'];
    try {
      let res: Response;
      try {
        res = await fetch(url, { method: 'POST', headers: this.headers(true), body: JSON.stringify(body), signal: guard.signal });
      } catch (e) {
        throw guard.explain(e, () => networkError(url, base));
      }
      if (!res.ok) {
        const msg = errorText(await res.text().catch(() => ''));
        if (res.status === 401 || res.status === 403) throw new BrainError('auth', `The server refused the key (HTTP ${res.status}). Check the API key in settings.`, res.status);
        if (res.status === 404 && /model/i.test(msg)) throw new BrainError('model', `That server has no model called ${this.settings.model}.`, 404);
        if (res.status === 429) throw new BrainError('rate', 'The server says to slow down (HTTP 429).', 429);
        throw new BrainError('http', `The server said: ${msg || 'error'} (HTTP ${res.status}).`, res.status);
      }
      if (!res.body) throw new BrainError('http', 'The server sent an empty reply.');
      const onLine = (line: string): void => {
        if (!line.startsWith('data:')) return;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          finished = true;
          return;
        }
        let c: SseChunk;
        try {
          c = JSON.parse(data) as SseChunk;
        } catch {
          return;
        }
        if (c.error) throw new BrainError('http', `The server said: ${typeof c.error === 'string' ? c.error : c.error.message ?? 'error'}`);
        if (c.usage) usage = c.usage;
        const ch = c.choices?.[0];
        const piece = ch?.delta?.content ?? '';
        const thought = ch?.delta?.reasoning_content ?? ch?.delta?.reasoning ?? '';
        if ((piece || thought) && firstTokenMs === undefined) {
          firstTokenMs = now() - t0;
          guard.clearWake();
          this.warm = true;
          this.opts.onProgress?.({ phase: 'writing', waitedMs: firstTokenMs });
        }
        if (piece || thought) guard.arm(this.t.stallTimeoutMs, 'The model went quiet in the middle of a reply.');
        if (piece) {
          content += piece;
          const visible = stripThink(content);
          if (visible !== shown) {
            shown = visible;
            req.onText?.(visible);
          }
        }
        if (ch?.finish_reason) finished = true;
      };
      try {
        await readLines(res.body, onLine, guard.signal);
      } catch (e) {
        throw guard.explain(e, () => new BrainError('connect', 'The server hung up in the middle of a reply.'));
      }
      if (!finished) throw new BrainError('connect', 'The server hung up in the middle of a reply.');
    } finally {
      guard.dispose();
      if (waking || firstTokenMs !== undefined) this.opts.onProgress?.({ phase: 'idle', waitedMs: now() - t0 });
    }
    const ms = now() - t0;
    const text = stripThink(content);
    const outputTokens = usage?.completion_tokens ?? Math.round(content.length / 4);
    const genMs = firstTokenMs !== undefined ? ms - firstTokenMs : ms;
    return {
      text,
      stats: {
        ms,
        firstTokenMs,
        promptTokens: usage?.prompt_tokens,
        outputTokens,
        tokPerSec: genMs > 0 && outputTokens ? outputTokens / (genMs / 1000) : undefined
      }
    };
  }
}
