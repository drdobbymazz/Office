// JSON Schemas sent with each request (Ollama `format`, OpenAI json_schema).
// Ollama turns them into a grammar, so the model can only write valid names,
// emotions and gestures. Property order is the order the model writes in:
// the useful part ("lines") comes first so it can stream to the screen.

import { EMOTIONS, LINE_ACTS, PLAN_KINDS, SHIFT_KINDS, TARGET_ROOMS } from '@/game/core/types';
import type { PlanKind } from '@/game/core/types';
import { CUSTOM_KINDS, CUSTOM_LOOKS, CUSTOM_POWERS, CUSTOM_REACTIONS, CUSTOM_VIBES, DIRECTIVE_VERBS, GUEST_COLOURS, GUEST_SKINS, GUEST_STYLES } from './api';

export type JsonSchema = Record<string, unknown>;

const str = (maxLength?: number): JsonSchema => (maxLength ? { type: 'string', maxLength } : { type: 'string' });
const oneOf = (values: readonly string[]): JsonSchema => ({ type: 'string', enum: dedupe(values) });
const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false
});
const arr = (items: JsonSchema, minItems: number, maxItems: number): JsonSchema => ({
  type: 'array',
  items,
  minItems: Math.max(0, Math.min(minItems, maxItems)),
  maxItems
});

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export interface SceneSchemaInput {
  /** First names of the speakers. */
  speakers: string[];
  /** Names a shift or plan may be about (speakers and onlookers). */
  people: string[];
  /** Room ids a plan may target. */
  rooms: readonly string[];
  minLines: number;
  maxLines: number;
}

export function sceneSchema(s: SceneSchemaInput): JsonSchema {
  const speakers = s.speakers.length ? s.speakers : ['Someone'];
  const people = dedupe([...speakers, ...s.people]);
  return obj({
    lines: arr(
      obj({
        who: oneOf(speakers),
        say: str(360),
        feel: oneOf(EMOTIONS),
        to: oneOf([...speakers, 'all', 'none']),
        act: oneOf(LINE_ACTS)
      }),
      s.minLines,
      s.maxLines
    ),
    summary: str(200),
    shifts: arr(obj({ who: oneOf(speakers), about: oneOf(people), change: oneOf(SHIFT_KINDS) }), 0, 2),
    plans: arr(
      obj({
        who: oneOf(speakers),
        plan: oneOf(PLAN_KINDS),
        target: oneOf([...people, ...s.rooms, 'none']),
        about: str(60)
      }),
      0,
      2
    )
  });
}

export interface MindsSchemaInput {
  people: string[];
  others: string[];
  rooms: readonly string[];
  allowed: readonly PlanKind[];
}

export function mindsSchema(s: MindsSchemaInput): JsonSchema {
  const n = Math.max(1, s.people.length);
  return obj({
    minds: arr(
      obj({
        who: oneOf(s.people.length ? s.people : ['Someone']),
        thought: str(220),
        feel: oneOf(EMOTIONS),
        plan: oneOf(s.allowed.length ? s.allowed : PLAN_KINDS),
        target: oneOf([...s.others, ...s.rooms, 'none']),
        about: str(60)
      }),
      n,
      n
    )
  });
}

export function interpretSchema(rooms: readonly string[]): JsonSchema {
  return obj({
    title: str(40),
    emoji: str(12),
    room: oneOf([...(rooms.length ? rooms : TARGET_ROOMS), 'everywhere']),
    fact: str(160),
    vibe: oneOf(CUSTOM_VIBES),
    intensity: { type: 'integer', enum: [1, 2, 3] },
    reaction: oneOf(CUSTOM_REACTIONS),
    look: oneOf(CUSTOM_LOOKS),
    moves: { type: 'boolean' },
    kind: oneOf(CUSTOM_KINDS),
    name: str(30),
    power: oneOf(CUSTOM_POWERS),
    skin: oneOf(GUEST_SKINS),
    hair: oneOf(GUEST_COLOURS),
    outfit: oneOf(GUEST_COLOURS),
    trim: oneOf(GUEST_COLOURS),
    style: oneOf(GUEST_STYLES)
  });
}

export function directiveSchema(people: string[], rooms: readonly string[]): JsonSchema {
  return obj({
    verb: oneOf(DIRECTIVE_VERBS),
    targetPerson: oneOf([...people, 'none']),
    targetRoom: oneOf([...(rooms.length ? rooms : TARGET_ROOMS), 'none']),
    power: oneOf(CUSTOM_POWERS),
    item: str(32),
    summary: str(120)
  });
}

export function reportSchema(people: string[]): JsonSchema {
  const names = people.length ? people : ['Someone'];
  return obj({
    headline: str(80),
    paragraphs: arr(str(500), 2, 3),
    awards: arr(obj({ title: str(40), who: oneOf(names), why: str(120) }), 1, 3),
    takeaways: arr(obj({ who: oneOf(names), text: str(120) }), 0, names.length)
  });
}

export function sagaEpisodeSchema(): JsonSchema {
  return obj({
    title: str(44),
    recap: str(220),
    hook: str(260),
    twistFact: str(180),
    topics: arr(str(120), 2, 2)
  });
}
