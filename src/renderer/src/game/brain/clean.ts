// Cleaning what the model wrote. The model is good but not tidy: it adds
// *stage directions*, (asides), quotes, emojis, "Marcus:" prefixes, and lines
// that run on. Everything here is defensive: unknown input in, valid game data
// (or nothing) out.

import { EMOTIONS, LINE_ACTS, PLAN_KINDS, SHIFT_KINDS } from '@/game/core/types';
import type { CharId, EmotionId, LineAct, Plan, PlanKind, RelationShift, RoomId } from '@/game/core/types';
import type { SceneLine } from './api';
import { NameMap, normName } from './names';

/** Turns a room word into a room id (from the world), or null. */
export type RoomResolver = (raw: unknown) => string | null;

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍️⃣]/gu;

/** Plans that need a person as the target. */
export const SOCIAL_PLANS: readonly PlanKind[] = ['talk', 'confront', 'flirt', 'gossip', 'prank', 'comfort', 'snoop'];

/** Key used to spot repeated lines: letters and digits only. */
export function lineKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Tidy one spoken line. Returns '' when nothing usable is left.
 * maxWords: lines longer than this are cut at a sentence end where possible.
 */
export function cleanSay(raw: unknown, maxWords = 22, isName?: (s: string) => boolean): string {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(/\r?\n+/g, ' ').trim();
  // "Marcus: Hello" -> "Hello" (only when the prefix is someone's name).
  const prefix = /^([A-Z][A-Za-z' .-]{1,24}):\s+(?=\S)/.exec(s);
  if (prefix && isName?.(prefix[1])) s = s.slice(prefix[0].length);
  s = s
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[*()[\]]/g, ' ')
    .replace(EMOJI_RE, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  // Wrapping quotes, possibly nested or doubled.
  for (let k = 0; k < 3; k++) {
    const m = /^["'“‘](.*)["'”’]$/.exec(s);
    if (!m || m[1].includes('"')) break;
    s = m[1].trim();
  }
  s = s.replace(/^["“]+|["”]+$/g, '').trim();
  s = s.replace(/\s+([,.!?;:])/g, '$1').replace(/^[,.;:\s]+/, '').replace(/,\s*$/, '').trim();
  if (!/[a-z0-9]/i.test(s)) return '';
  return cutWords(s, maxWords);
}

function cutWords(s: string, maxWords: number): string {
  const words = s.split(' ');
  if (words.length <= maxWords) return s;
  const head = words.slice(0, maxWords).join(' ');
  // Last sentence end within the limit, if it leaves a decent line.
  let cut = -1;
  const re = /[.!?](?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head))) cut = m.index + 1;
  if (cut > 0 && head.slice(0, cut).split(' ').length >= 4) return head.slice(0, cut);
  const cap = maxWords <= 22 ? Math.min(maxWords, 18) : Math.min(maxWords, maxWords - 2);
  const short = words.slice(0, cap).join(' ').replace(/[,;:]$/, '');
  return `${short}...`;
}

/** Short plain text field (summary, about, title). */
export function cleanText(raw: unknown, maxChars: number): string {
  if (typeof raw !== 'string') return '';
  let s = raw
    .replace(/\r?\n+/g, ' ')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(EMOJI_RE, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“](.*)["”]$/, '$1')
    .trim();
  if (s.length > maxChars) {
    const cut = s.lastIndexOf(' ', maxChars);
    s = s.slice(0, cut > maxChars / 2 ? cut : maxChars).replace(/[,;:]$/, '');
  }
  return /[a-z0-9]/i.test(s) ? s : '';
}

export function cleanEmotion(raw: unknown): EmotionId {
  if (typeof raw !== 'string') return 'neutral';
  const v = raw.trim().toLowerCase();
  return (EMOTIONS as readonly string[]).includes(v) ? (v as EmotionId) : 'neutral';
}

export function cleanAct(raw: unknown): LineAct {
  if (typeof raw !== 'string') return 'none';
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (LINE_ACTS as readonly string[]).includes(v) ? (v as LineAct) : 'none';
}

export interface LineContext {
  /** The speakers of this scene. */
  speakers: NameMap;
  maxLines: number;
  /** Keys of lines already said (earlier lines, and lines kept so far). */
  seen: Set<string>;
}

/** One raw line object -> a valid SceneLine, or null. Adds it to ctx.seen. */
export function cleanLine(raw: unknown, ctx: LineContext): SceneLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const who = ctx.speakers.resolve(r.who);
  if (!who) return null;
  const say = cleanSay(r.say, 120, (n) => ctx.speakers.resolve(n) !== null);
  if (!say) return null;
  const key = lineKey(say);
  if (!key || ctx.seen.has(key)) return null;
  let to: CharId | 'all' | null = null;
  if (typeof r.to === 'string') {
    const t = normName(r.to);
    if (t === 'all' || t === 'everyone' || t === 'everybody') to = 'all';
    else to = ctx.speakers.resolve(r.to);
    if (to === who) to = null;
  }
  ctx.seen.add(key);
  return { who, say, feel: cleanEmotion(r.feel), to, act: cleanAct(r.act) };
}

export function cleanLines(raw: unknown, ctx: LineContext): SceneLine[] {
  if (!Array.isArray(raw)) return [];
  const out: SceneLine[] = [];
  for (const item of raw) {
    if (out.length >= ctx.maxLines) break;
    const line = cleanLine(item, ctx);
    if (line) out.push(line);
  }
  return out;
}

export function cleanShifts(raw: unknown, speakers: NameMap, people: NameMap): RelationShift[] {
  if (!Array.isArray(raw)) return [];
  const out: RelationShift[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const who = speakers.resolve(r.who);
    const about = people.resolve(r.about);
    const change = typeof r.change === 'string' ? r.change.trim().toLowerCase() : '';
    if (!who || !about || who === about || !(SHIFT_KINDS as readonly string[]).includes(change)) continue;
    if (out.some((s) => s.who === who && s.about === about)) continue;
    out.push({ who, about, change: change as RelationShift['change'] });
  }
  return out.slice(0, 3);
}

/**
 * One raw plan -> a valid Plan, or null. Social plans need a person (not
 * themselves); place plans take a room or nothing.
 */
export function cleanPlan(
  r: Record<string, unknown>,
  who: CharId,
  people: NameMap,
  rooms: RoomResolver,
  allowed: readonly PlanKind[] = PLAN_KINDS
): Plan | null {
  const kind = typeof r.plan === 'string' ? r.plan.trim().toLowerCase() : typeof r.kind === 'string' ? r.kind.trim().toLowerCase() : '';
  if (!(allowed as readonly string[]).includes(kind)) return null;
  const k = kind as PlanKind;
  const about = cleanText(r.about, 60);
  if (SOCIAL_PLANS.includes(k)) {
    const target = people.resolve(r.target);
    if (!target || target === who) return null;
    return { kind: k, target, about };
  }
  const room = rooms(r.target) as RoomId | null;
  return { kind: k, target: room, about };
}

export function cleanPlans(
  raw: unknown,
  speakers: NameMap,
  people: NameMap,
  rooms: RoomResolver,
  allowed: readonly PlanKind[] = PLAN_KINDS
): { who: CharId; plan: Plan }[] {
  if (!Array.isArray(raw)) return [];
  const out: { who: CharId; plan: Plan }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const who = speakers.resolve(r.who);
    if (!who || out.some((p) => p.who === who)) continue;
    const plan = cleanPlan(r, who, people, rooms, allowed);
    if (plan) out.push({ who, plan });
  }
  return out;
}
