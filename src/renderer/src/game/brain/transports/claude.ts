// Claude, only when the game runs inside a claude.ai Artifact, through the
// page's window.claude sampling. There is no system role: the input is one
// string (instructions, then the data, then the format). It may only be used
// as the direct result of a player action, never on a timer: autonomous=false.

import type { BrainSettings, ChatRequest, ChatResponse, ChatTransport, TransportStatus } from '../api';
import { stripThink } from '../jsonStream';
import { now } from '../util';
import { BrainError } from './common';

interface SampleOptions {
  modelTier?: 'quick' | 'default';
  cache?: boolean;
  onText?: (e: { text: string }) => void;
  signal?: AbortSignal;
}
type SampleFn = (input: string, options?: SampleOptions) => Promise<unknown>;

interface ClaudeRuntime {
  use?: (capability: string) => Promise<unknown> | unknown;
}

declare global {
  interface Window {
    claude?: ClaudeRuntime;
  }
}

function runtime(): ClaudeRuntime | undefined {
  return typeof window !== 'undefined' ? window.claude : undefined;
}

async function getSample(): Promise<SampleFn | null> {
  try {
    const s = await runtime()?.use?.('sample');
    return typeof s === 'function' ? (s as SampleFn) : null;
  } catch {
    return null;
  }
}

/** Is window.claude sampling usable here (inside an Artifact)? Never throws. */
export async function claudeAvailable(): Promise<boolean> {
  return (await getSample()) !== null;
}

const GONE_CODES = new Set(['not_granted', 'sampling_disabled', 'not_declared']);

function textOf(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const r = result as { text?: unknown; content?: unknown };
    if (typeof r.text === 'string') return r.text;
    if (typeof r.content === 'string') return r.content;
    if (Array.isArray(r.content)) {
      return r.content.map((b: unknown) => (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string' ? (b as { text: string }).text : '')).join('');
    }
  }
  return '';
}

export class ClaudeTransport implements ChatTransport {
  readonly kind = 'claude' as const;
  readonly autonomous = false;
  /** Set when sampling was refused for good: never ask again this session. */
  private gone: string | null = null;

  constructor(private readonly settings: BrainSettings) {}

  async status(): Promise<TransportStatus> {
    if (this.gone) return { ok: false, models: [], error: this.gone };
    const ok = await claudeAvailable();
    return ok
      ? { ok: true, models: [this.settings.claudeTier] }
      : { ok: false, models: [], error: 'Claude is only available when the game is opened inside a claude.ai Artifact.' };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (this.gone) throw new BrainError('denied', this.gone);
    if (req.signal?.aborted) throw new BrainError('abort', 'Cancelled.');
    const sample = await getSample();
    if (!sample) throw new BrainError('denied', 'Claude is only available when the game is opened inside a claude.ai Artifact.');

    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const rest = req.messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n\n');
    const input =
      `${system}\n\nTHE REQUEST\n${rest}\n\n` +
      `Reply with only the JSON object, following this JSON Schema:\n${JSON.stringify(req.schema)}`;

    const t0 = now();
    let firstTokenMs: number | undefined;
    let soFar = '';
    let shown = '';
    const onText = ({ text }: { text: string }): void => {
      if (typeof text !== 'string') return;
      if (firstTokenMs === undefined) firstTokenMs = now() - t0;
      // Cumulative text is expected; accept deltas too.
      soFar = text.startsWith(soFar) ? text : soFar + text;
      const visible = stripThink(soFar);
      if (visible !== shown) {
        shown = visible;
        req.onText?.(visible);
      }
    };
    let result: unknown;
    try {
      result = await sample(input, { modelTier: this.settings.claudeTier, cache: false, onText, signal: req.signal });
    } catch (e) {
      const code = e && typeof e === 'object' ? String((e as { code?: unknown }).code ?? '') : '';
      const message = e && typeof e === 'object' ? String((e as { message?: unknown }).message ?? '') : String(e);
      if (code === 'cancelled' || req.signal?.aborted) throw new BrainError('abort', 'Cancelled.');
      if (GONE_CODES.has(code)) {
        this.gone = 'Claude is not allowed to write for this game here.';
        throw new BrainError('denied', this.gone);
      }
      if (code === 'rate_limited') throw new BrainError('rate', 'Claude asked us to slow down for a moment.');
      throw new BrainError('http', message || 'Claude could not answer.');
    }
    const text = stripThink(textOf(result) || soFar);
    const ms = now() - t0;
    return { text, stats: { ms, firstTokenMs: firstTokenMs ?? ms, outputTokens: Math.round(text.length / 4) } };
  }
}
