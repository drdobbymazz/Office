// Ollama: POST {base}/api/chat, streamed as NDJSON.
//
// We send only what we must. Options such as num_ctx or num_gpu make Ollama
// reload the model (a minute for a 16 GB model at the laptop), so they are
// never sent. `think` is not sent either, until a reply shows that the model
// reasons out loud: from then on we send think:false, and drop it again if the
// server says it does not understand it.

import type { BrainSettings, ChatRequest, ChatResponse, ChatTransport, TransportStatus } from '../api';
import { stripThink } from '../jsonStream';
import { now } from '../util';
import {
  BrainError, CallGuard, DEFAULT_TIMEOUTS, errorText, fetchQuick, joinUrl, networkError, readLines
} from './common';
import type { TransportOptions } from './common';

interface OllamaChunk {
  message?: { content?: string; thinking?: string };
  done?: boolean;
  error?: string;
  eval_count?: number;
  eval_duration?: number;
  prompt_eval_count?: number;
}

/** "artemis-custom" matches "artemis-custom:latest". */
export function sameModel(a: string, b: string): boolean {
  const n = (s: string): string => s.trim().toLowerCase().replace(/:latest$/, '');
  return n(a) === n(b);
}

function modelMissing(model: string): BrainError {
  return new BrainError('model', `That server has no model called ${model}. On the laptop run: ollama pull ${model}`);
}

export async function listOllamaModels(base: string, timeoutMs: number, signal?: AbortSignal): Promise<string[]> {
  const url = joinUrl(base, '/api/tags');
  let res: Response;
  try {
    res = await fetchQuick(url, { method: 'GET' }, timeoutMs, signal);
  } catch (e) {
    if (e instanceof BrainError && (e.kind === 'abort' || e.kind === 'timeout')) {
      if (e.kind === 'timeout') throw new BrainError('timeout', `The model server at ${base} did not answer in time. Is the laptop awake?`);
      throw e;
    }
    throw networkError(url, base);
  }
  if (!res.ok) throw new BrainError('http', `The model server at ${base} answered with an error (HTTP ${res.status}).`, res.status);
  let j: { models?: { name?: string; model?: string }[] };
  try {
    j = (await res.json()) as typeof j;
  } catch {
    throw new BrainError('http', `The address ${base} answered, but it does not look like an Ollama server.`);
  }
  if (!j || !Array.isArray(j.models)) throw new BrainError('http', `The address ${base} answered, but it does not look like an Ollama server.`);
  return j.models.map((m) => m.name ?? m.model ?? '').filter(Boolean);
}

export class OllamaTransport implements ChatTransport {
  readonly kind = 'ollama' as const;
  readonly autonomous = true;
  /** Has any call produced a token yet? Until then the model may still be loading. */
  private warm = false;
  private think: 'omit' | 'false' | 'never' = 'omit';
  /** Ollama before 0.5 takes only the word "json" as a format, not a schema. Found out by asking. */
  private plainJson = false;
  private readonly t: typeof DEFAULT_TIMEOUTS;

  constructor(
    private readonly settings: BrainSettings,
    private readonly opts: TransportOptions = {}
  ) {
    this.t = { ...DEFAULT_TIMEOUTS, ...stripUndefined(opts) };
  }

  /** For diagnostics and tests. */
  get thinkMode(): 'omit' | 'false' | 'never' {
    return this.think;
  }

  async status(signal?: AbortSignal): Promise<TransportStatus> {
    try {
      const models = await listOllamaModels(this.settings.baseUrl, this.t.statusTimeoutMs, signal);
      if (!models.some((m) => sameModel(m, this.settings.model))) {
        return { ok: false, models, error: modelMissing(this.settings.model).message };
      }
      return { ok: true, models };
    } catch (e) {
      return { ok: false, models: [], error: e instanceof Error ? e.message : String(e) };
    }
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: this.settings.model,
      messages: req.messages,
      stream: true,
      format: this.plainJson ? 'json' : req.schema,
      keep_alive: this.settings.keepAlive || '30m',
      options: {
        temperature: req.temperature,
        num_predict: req.maxTokens,
        top_p: 0.92,
        repeat_penalty: 1.1
      }
    };
    if (this.think === 'false') body.think = false;
    try {
      return await this.once(body, req);
    } catch (e) {
      if (e instanceof BrainError && e.kind === 'http' && 'think' in body && /think/i.test(e.message)) {
        this.think = 'never';
        delete body.think;
        return await this.once(body, req);
      }
      // An older server that does not know schemas: plain JSON mode still works, because
      // the reply format is spelled out in the instructions as well.
      if (e instanceof BrainError && e.kind === 'http' && e.status === 400 && !this.plainJson && /format|unmarshal|schema/i.test(e.message)) {
        this.plainJson = true;
        body.format = 'json';
        return await this.once(body, req);
      }
      throw e;
    }
  }

  private async once(body: Record<string, unknown>, req: ChatRequest): Promise<ChatResponse> {
    const base = this.settings.baseUrl;
    const url = joinUrl(base, '/api/chat');
    const guard = new CallGuard(req.signal);
    const t0 = now();
    const firstMs = this.warm ? this.t.firstTokenTimeoutMs : this.t.coldTimeoutMs;
    guard.arm(
      firstMs,
      this.warm
        ? `The model did not answer within ${Math.round(firstMs / 1000)} s. Is the laptop busy or asleep?`
        : `The model took more than ${Math.round(firstMs / 1000)} s to wake up. It may still be loading: try again in a minute.`
    );
    let waking = false;
    guard.wakeAfter(this.t.wakingAfterMs, () => {
      waking = true;
      this.opts.onProgress?.({ phase: 'waking', waitedMs: now() - t0 });
    });

    let content = '';
    let thinking = '';
    let shown = '';
    let firstTokenMs: number | undefined;
    let final: OllamaChunk | null = null;

    try {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: guard.signal
        });
      } catch (e) {
        throw guard.explain(e, () => networkError(url, base));
      }
      if (!res.ok) {
        const msg = errorText(await res.text().catch(() => ''));
        if (res.status === 404 || /not found|pull/i.test(msg)) throw modelMissing(this.settings.model);
        throw new BrainError('http', `The model server said: ${msg || 'error'} (HTTP ${res.status}).`, res.status);
      }
      if (!res.body) throw new BrainError('http', 'The model server sent an empty reply.');

      const onLine = (line: string): void => {
        let c: OllamaChunk;
        try {
          c = JSON.parse(line) as OllamaChunk;
        } catch {
          return;
        }
        if (c.error) throw new BrainError('http', `The model server said: ${c.error}`);
        const piece = c.message?.content ?? '';
        const thought = c.message?.thinking ?? '';
        if ((piece || thought) && firstTokenMs === undefined) {
          firstTokenMs = now() - t0;
          guard.clearWake();
          this.warm = true;
          this.opts.onProgress?.({ phase: 'writing', waitedMs: firstTokenMs });
        }
        if (piece || thought) guard.arm(this.t.stallTimeoutMs, 'The model went quiet in the middle of a reply.');
        thinking += thought;
        if (piece) {
          content += piece;
          const visible = stripThink(content);
          if (visible !== shown) {
            shown = visible;
            req.onText?.(visible);
          }
        }
        if (c.done) final = c;
      };
      try {
        await readLines(res.body, onLine, guard.signal);
      } catch (e) {
        throw guard.explain(e, () => new BrainError('connect', 'The model server hung up in the middle of a reply.'));
      }
      if (!final) throw new BrainError('connect', 'The model server hung up in the middle of a reply.');
    } catch (e) {
      // Even a failed reply tells us whether the model reasons out loud.
      this.noteThinking(content, thinking);
      throw e;
    } finally {
      guard.dispose();
      if (waking || firstTokenMs !== undefined) this.opts.onProgress?.({ phase: 'idle', waitedMs: now() - t0 });
    }

    this.noteThinking(content, thinking);
    const f = final as OllamaChunk;
    const ms = now() - t0;
    const outputTokens = f.eval_count;
    const tokPerSec =
      f.eval_count && f.eval_duration ? f.eval_count / (f.eval_duration / 1e9) : outputTokens && firstTokenMs !== undefined && ms > firstTokenMs ? outputTokens / ((ms - firstTokenMs) / 1000) : undefined;
    return {
      text: stripThink(content),
      stats: { ms, firstTokenMs, promptTokens: f.prompt_eval_count, outputTokens, tokPerSec }
    };
  }

  private noteThinking(content: string, thinking: string): void {
    if (this.think === 'omit' && (thinking.trim() || /<think>/i.test(content))) this.think = 'false';
  }
}

export function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && typeof v === 'number') (out as Record<string, unknown>)[k] = v;
  return out;
}
