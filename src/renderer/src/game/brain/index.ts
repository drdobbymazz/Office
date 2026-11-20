// The brain's public face. See api.ts for the contract.

import type { InstinctBank } from '@/game/core/content/types';
import type { Brain, BrainSettings, ChatTransport, Reflexes } from './api';
import { InstinctBrain } from './instinct';
import type { LooseBank } from './instinct';
import { LlmBrain } from './llmBrain';
import type { BrainDeps } from './llmBrain';
import { ClaudeTransport, claudeAvailable } from './transports/claude';
import type { TransportOptions } from './transports/common';
import { listOllamaModels } from './transports/ollama';
import { OllamaTransport } from './transports/ollama';
import { OpenAiTransport } from './transports/openai';
import type { BrainWorld } from './world';

export type { BrainPersona, BrainWorld } from './world';
export type { BrainDeps } from './llmBrain';
export type { TransportOptions, TransportProgress } from './transports/common';
export { BrainError } from './transports/common';
export { InstinctBrain } from './instinct';
export { LlmBrain } from './llmBrain';
export { PromptBook } from './prompts';
export { claudeAvailable };

/** One chat transport for the chosen back end, or null for 'instinct'. */
export function createTransport(settings: BrainSettings, options: TransportOptions = {}): ChatTransport | null {
  switch (settings.provider) {
    case 'ollama':
      return new OllamaTransport(settings, options);
    case 'openai':
      return new OpenAiTransport(settings, options);
    case 'claude':
      return new ClaudeTransport(settings);
    default:
      return null;
  }
}

/**
 * The brain for these settings: LlmBrain for ollama / openai / claude (with
 * instinct behind every request), InstinctBrain for 'instinct'.
 */
export function createBrain(settings: BrainSettings, deps: BrainDeps): Brain {
  if (settings.provider === 'instinct') return new InstinctBrain(deps.bank as LooseBank, deps.world, deps.rng);
  let brain: LlmBrain | null = null;
  const options: TransportOptions = {
    ...deps.transportOptions,
    onProgress: (p) => {
      brain?.noteProgress(p);
      deps.transportOptions?.onProgress?.(p);
      deps.onProgress?.(p);
    }
  };
  const transport = deps.transport ?? createTransport(settings, options);
  if (!transport) return new InstinctBrain(deps.bank as LooseBank, deps.world, deps.rng);
  brain = new LlmBrain(settings, transport, deps);
  return brain;
}

/** Instant no-model lines (barks). */
export function createReflexes(bank: InstinctBank | LooseBank, world?: BrainWorld): Reflexes {
  return new InstinctBrain(bank as LooseBank, world);
}

/**
 * Find a running Ollama: the first candidate address (in the order given) that
 * answers /api/tags. Candidates are tried at the same time, so this takes at
 * most a few seconds. Never throws.
 */
export async function probeOllama(
  candidates: string[],
  signal?: AbortSignal
): Promise<{ baseUrl: string; models: string[] } | null> {
  const list = candidates.map((c) => c.trim().replace(/\/+$/, '')).filter((c, i, a) => a.indexOf(c) === i);
  if (!list.length) return null;
  const results = list.map((base) =>
    listOllamaModels(base || '', 3_000, signal).then(
      (models) => ({ baseUrl: base, models }),
      () => null
    )
  );
  // Answer as soon as the best-ranked candidate that can answer has answered.
  for (const r of results) {
    const got = await r;
    if (got) return got;
  }
  return null;
}
