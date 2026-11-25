// Cleaning what the model wrote. The model is good but not tidy: it adds
// *stage directions*, (asides), quotes, emojis, "Marcus:" prefixes, and lines
// that run on. Everything here is defensive: unknown input in, valid game data
// (or nothing) out.

import { EMOTIONS, LINE_ACTS, PLAN_KINDS, SHIFT_KINDS } from '@/game/core/types';
import type { CharId, EmotionId, LineAct, Plan, PlanKind, RelationShift, RoomId } from '@/game/core/types';
import { STAGE_ACTIONS, type SceneLine, type StageAction } from './api';
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

// Where a text field runs on into the reply format itself. Seen live in a spoken line,
// `...HACKED!」「feel":"excited","to":"all","act":"cheer"},{`, and at the end of an order's summary, `...over his {`.
const REPLY_KEY = 'who|say|feel|to|act|lines|summary|shifts|plans|stageAction|rumor|complies|compliers|verb|targetPerson|targetRoom|power|item|delegatedAction';
const FORMAT_LEAK = new RegExp(`[「」『』]|"\\s*[,:]\\s*"(?:${REPLY_KEY})"\\s*:|\\b(?:${REPLY_KEY})"\\s*:|\\s*[{}\\[]+\\s*$`);

/** The text before any leak of the reply format into it. cut: something was taken off, so the text may now stop mid-phrase. */
export function beforeFormatLeak(raw: string): { text: string; cut: boolean } {
  const m = FORMAT_LEAK.exec(raw);
  if (!m) return { text: raw, cut: false };
  return { text: raw.slice(0, m.index).replace(/["\s,;:-]+$/, ''), cut: true };
}

/** Most words a scene line keeps: the prompt asks for 40 or fewer, and a longer line is trimmed to whole sentences. */
export const LINE_WORDS = 45;

/**
 * Tidy one spoken line. Returns '' when nothing usable is left.
 * maxWords: lines longer than this are trimmed back to whole sentences where possible.
 */
export function cleanSay(raw: unknown, maxWords = 22, isName?: (s: string) => boolean): string {
  if (typeof raw !== 'string') return '';
  let s = beforeFormatLeak(raw.replace(/\r?\n+/g, ' ')).text.trim();
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

/** Where each sentence in `s` ends (just after its closing mark and any closing quote). */
function sentenceEnds(s: string): number[] {
  const ends: number[] = [];
  const re = /[.!?…]+["'”’)]*(?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) ends.push(m.index + m[0].length);
  return ends;
}

const wordCount = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * Keep a line to whole sentences. A line within the limit is left alone. A longer one keeps as many
 * whole sentences as fit; when that would leave only a word or two, one more finished sentence a
 * little over the limit is kept rather than chopped. Failing that it ends at the last clause break,
 * and only a run-on with no break at all trails off with dots.
 */
function cutWords(s: string, maxWords: number): string {
  const words = s.split(' ');
  if (words.length <= maxWords) return s;
  const ends = sentenceEnds(s);
  // A line the writer finished itself ends where it ends, even without a full stop.
  if (ends[ends.length - 1] !== s.length) ends.push(s.length);
  let whole = '';
  for (const e of ends) {
    const head = s.slice(0, e);
    if (wordCount(head) > maxWords) break;
    whole = head;
  }
  if (wordCount(whole) < 4) {
    const next = ends.find((e) => e > whole.length && wordCount(s.slice(0, e)) <= Math.ceil(maxWords * 1.5));
    if (next) whole = s.slice(0, next);
  }
  if (whole) return whole.trim();
  // Too long and nothing finished within reach: end at the last comma or semicolon, as a sentence.
  const head = words.slice(0, maxWords).join(' ');
  const brk = Math.max(head.lastIndexOf(','), head.lastIndexOf(';'), head.lastIndexOf(':'));
  if (brk > 0 && wordCount(head.slice(0, brk)) >= 6) return `${head.slice(0, brk).trim()}.`;
  const cap = maxWords <= 22 ? Math.min(maxWords, 18) : Math.min(maxWords, maxWords - 2);
  const short = words.slice(0, cap).join(' ').replace(/[,;:]$/, '');
  return `${short}...`;
}

/**
 * A field that is meant to be one or two finished sentences (a scene's summary, a rumour), which
 * is stored as people's memory and shown in later prompts. maxChars is the reply format's cap: text
 * that reaches it was cut off while being written, so it is trimmed back to its last finished
 * sentence, or failing that its last finished clause, and ended with a full stop. Returns '' when
 * nothing complete is left (the caller then writes its own).
 */
export function cleanSentence(raw: unknown, maxChars: number): string {
  if (typeof raw !== 'string') return '';
  const cut = raw.length >= maxChars;
  let s = cleanText(raw, Number.MAX_SAFE_INTEGER);
  if (!s) return '';
  if (cut || s.length > maxChars) {
    const room = s.slice(0, maxChars);
    const ends = sentenceEnds(room);
    const last = ends[ends.length - 1];
    if (last) s = room.slice(0, last);
    else {
      // The last clause break, leaving out the clause that was cut off.
      const brk = Math.max(room.lastIndexOf(';'), room.lastIndexOf(','), room.lastIndexOf(':'));
      if (brk < 20) return '';
      s = room.slice(0, brk);
    }
  }
  s = s.trim().replace(/[,;:\s]+$/, '');
  return /[.!?…]["'”’)]*$/.test(s) ? s : `${s}.`;
}

/**
 * True when a spoken line plainly turns something down ("No way am I punching anyone", "I will not",
 * "Absolutely not"). Used to keep someone who refused out loud from being staged doing it anyway,
 * whatever the rest of the reply said.
 */
export function saysNo(text: string): boolean {
  return REFUSAL.test(text.replace(/[’‘]/g, "'"));
}

const REFUSAL = new RegExp(
  [
    // "No.", "Nope", "Never." to open with; not "No way!" (often delight) or "No problem".
    "^(?:no|nope|nah|never)\\b(?!\\s*(?:way\\s*[!?]|problem|worries|doubt|question|kidding|joke))",
    "\\b(?:absolutely|definitely|certainly|hell)\\s+not\\b",
    "\\bhell\\s+no\\b",
    "\\bno\\s+way\\s+(?:am\\s+i|i'm|i\\s+am|i'll|i\\s+will|i'd|in\\s+hell)\\b",
    "\\b(?:no|not\\s+a)\\s+chance\\b",
    "\\bnot\\s+happening\\b",
    "\\bforget\\s+it\\b",
    "\\bcount\\s+me\\s+out\\b",
    "\\bi\\s+refuse\\b",
    "\\bi\\s+will\\s+not\\b",
    "\\bi\\s+won't\\s+(?:do|be|go)\\b",
    "\\bi(?:'m|\\s+am)\\s+not\\s+(?:doing|going\\s+to|gonna|about\\s+to)\\b"
  ].join('|'),
  'i'
);

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

/**
 * One raw line object -> a valid SceneLine, or null. Adds it to ctx.seen.
 */
export function cleanLine(raw: unknown, ctx: LineContext): SceneLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const who = ctx.speakers.resolve(r.who);
  if (!who) return null;
  const say = cleanSay(r.say, LINE_WORDS, (n) => ctx.speakers.resolve(n) !== null);
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
    const note = cleanText(r.note, 70);
    out.push({ who, about, change: change as RelationShift['change'], ...(note ? { note } : {}) });
  }
  return out.slice(0, 3);
}

const INTERPERSONAL_STAGE = new Set([
  'kiss', 'make_out', 'flirt', 'sneak_away', 'lap_dance', 'grope', 'quickie', 'slap', 'shove', 'splash_drink', 'steal', 'hug',
  'whip', 'tie_up', 'worship', 'dominate', 'lick', 'blackmail', 'peep',
  'cowgirl', 'reverse_cowgirl', 'missionary', 'doggy', 'blowjob', 'handjob', 'fingering', 'sixty_nine', 'facesit'
]);

export function cleanStageAction(raw: unknown, speakers: NameMap, people: NameMap): StageAction | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const kindRaw = typeof r.kind === 'string' ? r.kind.trim().toLowerCase() : '';
  if (!kindRaw || kindRaw === 'none' || !(STAGE_ACTIONS as readonly string[]).includes(kindRaw)) return undefined;
  const actor = speakers.resolve(r.actor);
  if (!actor) return undefined;
  let target = people.resolve(r.target);
  if (target === actor) target = null;
  if (INTERPERSONAL_STAGE.has(kindRaw) && !target) {
    target = speakers.ids.find((id) => id !== actor) ?? null;
    if (!target) return undefined;
  }
  return {
    kind: kindRaw as StageAction['kind'],
    actor,
    target,
    detail: cleanText(r.detail, 90)
  };
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
