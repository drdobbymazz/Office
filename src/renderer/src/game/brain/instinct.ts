// The no-model brain. Assembles believable short exchanges from the
// hand-written bank (openers, replies, event reactions, barks), with simple
// rules for feelings, gestures, summaries and plans. Instant, always available,
// and the fallback for every LlmBrain request that fails.

import type { LooseVoiceBank, VoiceBank } from '@/game/core/content/types';
import { CHAOS_IDS, PLAN_KINDS } from '@/game/core/types';
import type { ChaosId, CharId, EmotionId, LineAct, Plan, PlanKind, RelationShift, TargetRoomId } from '@/game/core/types';
import type {
  BarkKind, Brain, BrainStatus, CustomVibe, DelegateTone, DirectiveRequest, DirectiveResult, DirectiveVerb,
  InterpretRequest, InterpretResult, MindResult, MindsRequest, PersonBrief, Reflexes, ReportRequest, ReportResult,
  SagaEpisodeRequest, SagaEpisodeResult, SceneCallbacks, SceneLine, SceneRequest, SceneResult, StoryTheme
} from './api';
import { cleanSay, lineKey, SOCIAL_PLANS } from './clean';
import {
  ACT_FOR_FEEL, CHAOS_NOUN, DISASTERS, EVERYWHERE_RE, FIX_FOR, INTENSE_RE, MILD_RE, STATE_BARKS, STORY_NOUN, THING_RULES, TREATS,
  VIBE_FEEL, chaosFeel, detectChaos, guestLookFor, kindFor, powerFor, storyFeel, storyThemeOf
} from './instinctRules';
import type { ThingRule } from './instinctRules';
import { NameMap, normName } from './names';
import { capitalise, listNames, pick, shuffle } from './util';
import type { Rng } from './util';
import { WorldIndex } from './world';
import type { BrainWorld } from './world';

/** The bank, keyed by person id. Anyone missing uses the generic voice. */
export type LooseBank = Record<string, LooseVoiceBank | undefined>;

// ── A small generic voice for anyone the bank does not cover ─────────────────

const GENERIC_BARKS: Record<BarkKind, string[]> = {
  scared: ['Oh no. Oh no no no.', 'Somebody do something!', 'I want my mum.'],
  startled: ['Whoa!', 'What was that?', 'Who did that?'],
  angry: ['Right. That does it.', 'Are you serious?', 'I have had enough of this.'],
  delighted: ['Oh, brilliant!', 'Now that is more like it.', 'Best thing all week.'],
  disgusted: ['Ugh. That is foul.', 'Nope. Absolutely not.', 'Who left that there?'],
  hurt: ['Ow!', 'That really hurt.', 'Rude.'],
  confused: ['Sorry, what?', 'I do not follow.', 'Is that normal?'],
  smug: ['Told you so.', 'Called it.', 'You are welcome.'],
  sad: ['What a day.', 'Nobody ever asks how I am.', 'Fine. It is fine.'],
  greeting: ['Morning!', 'Hello, hello.', 'Oh, hi.'],
  goodbye: ['Right, I am off.', 'See you tomorrow.', 'Bye, then.'],
  bored: ['Is it home time yet?', 'So bored.', 'Nothing ever happens here.'],
  working: ['Busy, busy.', 'Nearly done. Ish.', 'Do not talk to me, I am working.'],
  sleepy: ['Just resting my eyes.', 'Need coffee.', 'So tired.'],
  pickedUp: ['Put me down!', 'Whoa, I am flying!', 'Who is lifting me?'],
  dropped: ['Oof.', 'Ow, my back.', 'Where am I now?'],
  poked: ['Hey!', 'Who poked me?', 'Stop that.'],
  zapped: ['My hair!', 'Bzzt. Ow.', 'I can taste colours.'],
  wet: ['I am soaked!', 'Why is everything wet?', 'My shoes are full of water.'],
  dark: ['Who turned the lights off?', 'I cannot see a thing.', 'Hello? Anyone?'],
  floating: ['I am floating!', 'Get me down!', 'This is not right.'],
  cold: ['It is freezing in here.', 'I cannot feel my fingers.', 'Brr.'],
  dizzy: ['The room is spinning.', 'I need to sit down.', 'Whoa, wobbly.'],
  tiny: ['Why is everything so big?', 'Do not step on me!', 'I am tiny!'],
  giant: ['Why is everything so small?', 'Mind your heads.', 'I am enormous!']
};

const GENERIC_CHAOS = {
  disaster: ['What is happening?', 'Everybody stay calm! Mostly me.', 'This is not in my job description.'],
  weird: ['Did everyone else see that?', 'I am going to pretend that was normal.', 'That is not possible.'],
  treat: ['Is this for us? Is this allowed?', 'Best day at work in years.', 'Nobody touch it until I get some.'],
  mind: ['Something feels very wrong today.', 'Why do I feel like this?', 'I am not myself today.']
};

const GENERIC: VoiceBank = {
  barks: GENERIC_BARKS,
  chaos: Object.fromEntries(CHAOS_IDS.map((id) => [id, chaosCategoryLines(id)])) as Record<ChaosId, string[]>,
  idle: ['I should be working.', 'Is it lunch yet?', 'What was I doing again?', 'Nobody appreciates me here.', 'Coffee. I need coffee.', 'Something is not right in this office.', 'Five more hours.', 'I wonder what the others are up to.'],
  openers: ['{other}, have you got a minute?', 'Morning, {other}. Did you hear what happened?', '{other}! Just the person I wanted.', 'Oh, {other}. Can I ask you something?', '{other}, be honest with me.', 'You will not believe this, {other}.', 'Got a second, {other}?', '{other}, what is going on today?'],
  replies: {
    warm: ['Ha! Go on, tell me more.', 'Always got time for you.', 'You are a lifesaver.', 'That is brilliant, honestly.', 'I was hoping you would say that.', 'Count me in.'],
    cold: ['Do I have to?', 'Not now. Not ever, ideally.', 'Is this going to take long?', 'I am going to pretend you did not say that.', 'Funny. Go away.', 'You have got a nerve.'],
    neutral: ['Right. Okay.', 'Fair enough, I suppose.', 'Maybe. Why?', 'Hm. Could be.', 'If you say so.', 'I will think about it.']
  },
  whispered: ['I have just had a thought: {thought}', 'You know what? {thought}', 'It has come to me. {thought}', 'Nobody told me this, but {thought}'],
  announced: ['Who said that?', 'Did the ceiling just talk?', 'Was that meant for me?', 'I did not hear it. I am not doing it.'],
  custom: {
    scary: ['Is that a {thing}? Run!', 'Nobody move. Nobody breathe.'],
    funny: ['Is that a {thing}? In here?', 'Somebody film this.'],
    gross: ['Ugh, the {thing}! Open a window!', 'Who is cleaning that up? Not me.'],
    wonderful: ['A {thing}! Best day ever.', 'Oh, look at that. Lovely.'],
    weird: ['Why is there a {thing}?', 'Am I the only one seeing this?'],
    annoying: ['Can someone sort out the {thing}?', 'Of course. Of course this happens today.'],
    dangerous: ['The {thing}! Everybody out!', 'This is how it ends.'],
    romantic: ['Oh, a {thing}. Who is that for?', 'Is something in the air today?'],
    sad: ['That {thing} is so sad.', 'I need a hug after that.']
  }
};

/** Thoughts of someone hiding something: nerves, never the thing itself. */
const HIDDEN_HINTS = [
  'Act normal. Nobody knows.',
  'If anyone finds out, I am finished.',
  'Did anyone see me just now?',
  'Keep calm. Keep your head down.',
  'Nobody can ever know about this.',
  'Why does everyone keep looking at me?'
];

function chaosCategoryLines(id: ChaosId): string[] {
  if (TREATS.includes(id)) return GENERIC_CHAOS.treat;
  if (DISASTERS.includes(id)) return GENERIC_CHAOS.disaster;
  if (['love', 'rage', 'truth', 'sleep', 'paranoia', 'rumour', 'meeting', 'inspector', 'crown', 'secretLeak'].includes(id)) return GENERIC_CHAOS.mind;
  return GENERIC_CHAOS.weird;
}

// ── Reading feelings ────────────────────────────────────────────────────────

const WARM_RE = /\b(like|likes|love|loves|adore|adores|hero|crush|fancy|fancies|friend|sweet|lovely|trust|trusts|admire|admires|fond|best|kind|respect|respects|good|iconic|joy|partner|soft spot|great)\b/gi;
const COLD_RE = /\b(hate|hates|rival|resent|resents|annoy|annoying|annoys|can't stand|cannot stand|fiction|loud|vampire|furious|grudge|distrust|angry|threat|idle|tiresome|odd|violation|worst|drives him|drives her|mad|wind up|terrifying|suspicious|enemy|jealous|fusspot|scared of|never seems|takes credit|dislikes)\b/gi;

export type Tone = 'warm' | 'cold' | 'neutral';

export function toneOf(p: PersonBrief, about: CharId | null | undefined): Tone {
  const text = (about ? p.feelings.find((f) => f.about === about)?.text : '') ?? '';
  let score = (text.match(WARM_RE)?.length ?? 0) - (text.match(COLD_RE)?.length ?? 0);
  if (/\b(not|never|no longer)\s+(like|trust|fond|a friend)/i.test(text)) score -= 2;
  if (['angry', 'disgusted', 'suspicious'].includes(p.mood)) score -= 0.75;
  if (['happy', 'love', 'excited', 'amused'].includes(p.mood)) score += 0.5;
  return score >= 0.75 ? 'warm' : score <= -0.75 ? 'cold' : 'neutral';
}

function moodBark(mood: EmotionId): BarkKind {
  switch (mood) {
    case 'angry': return 'angry';
    case 'scared': case 'nervous': return 'scared';
    case 'sad': return 'sad';
    case 'happy': case 'excited': case 'love': case 'proud': return 'delighted';
    case 'amused': case 'smug': case 'mischievous': return 'smug';
    case 'disgusted': return 'disgusted';
    case 'bored': return 'bored';
    case 'tired': return 'sleepy';
    case 'surprised': return 'startled';
    default: return 'confused';
  }
}

export function matchThing(text: string): ThingRule | null {
  return THING_RULES.find((r) => r.re.test(text)) ?? null;
}

/** A short noun phrase for free text with no known thing in it. */
function guessNoun(text: string): string {
  const t = text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/^\s*(suddenly|then)\s+/, '')
    .trim();
  const m = /^(?:a|an|the|some)?\s*([a-z'-]+(?:\s+[a-z'-]+)?)/.exec(t);
  let noun = m ? m[1] : 'something';
  noun = noun.replace(/\s+(walks|appears|arrives|comes|falls|starts|is|are|flies|runs|bursts|turns|takes)$/, '');
  return noun || 'something';
}

/**
 * A whisper is written to the person ("you will replace Michael"); said out loud
 * it should be in their own words ("I will replace Michael"). Rough, but enough
 * for written lines; the model rewrites it properly.
 */
export function firstPerson(text: string): string {
  return text
    .replace(/\byou are\b/gi, 'I am')
    .replace(/\byou're\b/gi, "I'm")
    .replace(/\byou were\b/gi, 'I was')
    .replace(/\byou've\b/gi, "I've")
    .replace(/\byou'll\b/gi, "I'll")
    .replace(/\byou'd\b/gi, "I'd")
    .replace(/\byourself\b/gi, 'myself')
    .replace(/\byours\b/gi, 'mine')
    .replace(/\byour\b/gi, 'my')
    .replace(/(^|[.!?;,]\s*|\b(?:and|but|so|that|because|if|when)\s+)you\b/gi, (_m, pre: string) => `${pre}I`)
    .replace(/\byou\b/gi, 'me');
}

export function firstThought(why: string): string {
  // Double quotes first. A single quote counts only when it is not inside a word, so the apostrophe
  // in "Michael's own idea" is not taken for the start of the thought.
  const quoted = /["“]([^"”]{4,})["”]/.exec(why) ?? /(?:^|[\s(:])['‘]([^'’]{4,}?)['’](?=$|[\s.,;:!?)])/.exec(why);
  if (quoted) return quoted[1].trim();
  const colon = why.indexOf(':');
  return (colon >= 0 ? why.slice(colon + 1) : why).trim();
}

/** True when position `at` in `text` starts a sentence: the very start, or after ". " (not "... "), "! " or "? ". */
function sentenceStart(text: string, at: number): boolean {
  const before = text.slice(0, at);
  if (!before.trim()) return true;
  return /(^|[^.])[.!?]["']?\s+$/.test(before);
}

export function fill(template: string, vars: { other?: string; thought?: string; thing?: string }): string {
  const value = (v: string) => (match: string, at: number, whole: string): string =>
    sentenceStart(whole, at) ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  const out = template
    .replace(/\{other\}/g, value(vars.other ?? 'everyone'))
    .replace(/\{thought\}/g, value((vars.thought ?? 'something is up').replace(/[.!?]+$/, '')))
    .replace(/\{thing\}/g, value(vars.thing ?? 'thing'))
    .replace(/\{name\}/g, value(vars.other ?? 'everyone'))
    .replace(/\{[a-z]+\}/gi, '');
  // "everyone, listen" at the start of a line needs its capital.
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Scenes that can be about the week's story (an announcement, a whisper or a typed event has its own lines). */
const STORY_TRIGGERS = new Set<SceneRequest['trigger']>(['ambient', 'plan', 'event', 'aftermath']);

const PLAN_ROOM: Partial<Record<PlanKind, string[]>> = {
  coffee: ['kitchen', 'break', 'coffee'],
  snack: ['kitchen', 'break', 'vending'],
  break: ['roof', 'kitchen', 'lobby'],
  nap: ['roof', 'lobby', 'kitchen'],
  hide: ['copy', 'closet', 'toilet', 'server'],
  flee: ['street', 'roof', 'lobby']
};

// ── The brain ───────────────────────────────────────────────────────────────

/** Blank out office room phrases ("Michael's office") so room names are not mistaken for people. */
export function stripRoomPhrases(text: string): string {
  return text
    .replace(
      /\b(michael'?s\s+office|the\s+boss'?s\s+office|boss'?s\s+office|manager'?s\s+office|conference(?:\s+room)?|meeting\s+room|board\s*room|break\s*room|staff\s*room|kitchen|accountants'?\s+corner|accounting|accounts|annex|bullpen|sales\s+floor)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip optional leading actor address ("Meredith, strip naked") or polite wrappers ("please"). */
export function stripLeadingActor(text: string, actorName?: string): string {
  let out = text.trim();
  if (actorName) {
    const first = actorName.trim().split(/\s+/)[0] || actorName.trim();
    const parts = [actorName.trim(), first]
      .filter((s) => s.length >= 2)
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (parts.length) {
      const re = new RegExp(`^(?:${parts.join('|')})\\s*[,:]\\s+`, 'i');
      out = out.replace(re, '').trim();
    }
  }
  return out.replace(/^(?:please|now|hey)\s*[,:]?\s+/i, '').trim();
}

/** True when a command simply asks someone to stop/cancel whatever they are currently doing. */
export function isStopCommand(text: string, actorName?: string): boolean {
  const t = stripLeadingActor(text, actorName).replace(/[.!]+$/, '').trim();
  return /^(?:stop|stop\s+it|stop\s+that|stop\s+doing\s+that|cancel(?:\s+that)?|never\s*mind|forget\s+it|stand\s+down|knock\s+it\s+off|cut\s+it\s+out|calm\s+down|chill(?:\s+out)?|hold\s+on|stay\s+put|abort)$/i.test(t);
}

/** True when an imperative is negated ("don't strip", "never hit jim", "stop punching toby"). */
export function isNegatedDirective(text: string, actorName?: string): boolean {
  const t = stripLeadingActor(text, actorName);
  if (!t) return false;
  if (/^(?:don'?t|do\s+not|never)\s+stop\b/i.test(t)) return false;
  if (/^(?:tell|ask|order|command|dare|convince|persuade|beg|urge|force|make|have|get)\s+(?:[a-z][a-z' -]{1,22}(?:\s+and\s+[a-z][a-z' -]{1,22})?|everyone|everybody|someone|anyone|anybody)\s+(?:not\s+to|to\s+not|never\s+to|to\s+never|don'?t)\b/i.test(t)) {
    return true;
  }
  return /^(?:don'?t|do\s+not|never|not\s+to|not\s+(?=[a-z]+)|refuse\s+to|stop\s+(?:trying\s+to\s+)?[a-z]+ing|quit\s+[a-z]+ing)\b/i.test(t);
}

/** True when the inner clause of a delegation is pure dismissal or conversational speech, not a physical/directed act. */
export function isConversationalInner(inner: string): boolean {
  const t = inner.trim().toLowerCase();
  if (!t) return true;
  return /^(?:to\s+)?(?:fuck\s+off|screw\s+off|piss\s+off|bugger\s+off|sod\s+off|shut\s+up|shut\s+the\s+fuck\s+up|be\s+quiet|quiet\s+down|hush|go\s+to\s+hell|get\s+lost|buzz\s+off|drop\s+dead|calm\s+down|relax|chill(?:\s+out)?|listen(?:\s+up)?|apologiz\w*|say\s+sorry|say\s+hello|say\s+hi|say\s+goodbye|thank\b|talk\s+(?:to|about)\b|chat\s+with\b|gossip\b|tell\s+\w+\s+(?:about|that|the\s+truth)|explain\b|confess\b|admit\b|forgive\b|leave\s+.+\s+alone|mind\s+(?:your|his|her|their)\s+own\s+business|stop\s+talking|get\s+back\s+to\s+work|do\s+(?:your|his|her|their)\s+job|check\s+(?:your|his|her|their)\s+email|smile|cheer\s+up)\b/i.test(t);
}

const DELEGATE_HEAD_RE =
  /^(?:please\s+)?(?:(?:go|walk|run|head|step|come)\s+(?:over\s+|up\s+)?(?:to\s+)?(?:\w+\s+and\s+)?|go\s+and\s+)?(?:tell|ask|order|command|dare|convince|persuade|beg|urge|force|make|have|get)\s+(?:\w+(?:\s+and\s+\w+)?|everyone|everybody|someone|anyone|anybody|all\s+staff|all\s+of\s+(?:them|you)|the\s+(?:whole\s+)?office|everybody\s+here|the\s+room)(?:\s+in\s+(?:the\s+)?[a-z'\s]+?)?\s+(?:to\s+|not\s+to\s+|she\s+|he\s+|they\s+|if\s+|:|naked|strip|dance|punch|kiss|quit|fight)/i;

/** Split multi-step directives ("go to the break room and then strip naked") into at most 3 sequential steps. */
export function splitCompoundDirective(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (DELEGATE_HEAD_RE.test(trimmed)) return [trimmed];
  const rawParts = trimmed
    .split(/(?:,\s*then\s+|\s+and\s+then\s+|\s+then\s+|;\s*|\s+after\s+that[,\s]+)/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);
  if (rawParts.length < 2) return [trimmed];
  // Don't split conditional sentences like "if pam says yes then kiss her".
  if (/\bif\b/i.test(rawParts[0])) return [trimmed];
  return rawParts.slice(0, 3);
}

/** Convert a delegated third-person clause ("take her clothes off", "kiss me") into a direct imperative for that person. */
export function normalizeDelegatedCommand(inner: string, askerName?: string): string {
  let out = inner
    .trim()
    .replace(/\b(?:herself|himself|themself|themselves)\b/gi, 'yourself')
    .replace(/\b(?:her|his|their)\s+(clothes|shirt|pants|dress|skirt|bra|underwear|trousers|blouse|boxers|panties|top|shoes|socks)\b/gi, 'your $1')
    .replace(/\b(?:her|his|their)\b(?=\s+off\b)/gi, 'it');
  if (askerName) {
    const askerFirst = askerName.trim().split(/\s+/)[0] || askerName.trim();
    if (askerFirst) {
      out = out
        .replace(/\bmy\s+(desk|coffee|mug|stapler|office|chair|face|ass|butt|lap|neck|hand|cheek|lips|phone|laptop|things)\b/gi, `${askerFirst}'s $1`)
        .replace(/(?<!\blet\s+)\bme\b/gi, askerFirst)
        .replace(/(?<!^)\byou\b/gi, askerFirst);
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Convert a permission-request clause ("massage her", "massage you") into a direct command for the asker targeting `targetName`. */
export function normalizePermissionCommand(inner: string, targetName: string, treatYouAsTarget = false): string {
  const targetFirst = targetName.trim().split(/\s+/)[0] || targetName.trim();
  let out = inner
    .trim()
    .replace(
      /\b(?:her|his|their)\s+(shoulders|back|neck|feet|legs?|thighs?|ass|butt|face|cheek|lips|hand|hands|desk|coffee|mug|stapler|chair|clothes|shirt|pants|dress|skirt|bra|underwear|hair|ear|lap)\b/gi,
      `${targetFirst}'s $1`
    )
    .replace(/(?<!\b(?:tell|ask|let)\s+)\b(?:her|him|them)\b/gi, targetFirst);
  if (treatYouAsTarget) {
    out = out
      .replace(/\byour\b/gi, `${targetFirst}'s`)
      .replace(/\byou\b/gi, targetFirst);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Map a delegation lead verb ("tell", "ask", "dare", "beg", "convince") to its canonical tone. */
export function delegateToneFor(verb: string): DelegateTone {
  const v = verb.trim().toLowerCase();
  if (v === 'ask') return 'ask';
  if (v === 'dare') return 'dare';
  if (v === 'beg') return 'beg';
  if (v === 'convince' || v === 'persuade' || v === 'urge' || v === 'get') return 'persuade';
  return 'order';
}

/** Infer delegation tone from the leading phrasing of a free-text delegation command. */
export function inferDelegateTone(rawText: string): DelegateTone {
  const head = rawText.trim().slice(0, 80);
  const m = /\b(ask|beg|dare|convince|persuade|urge|order|command|tell|force|make|have|get)\b/i.exec(head);
  return m ? delegateToneFor(m[1]) : 'order';
}

/** Convert an imperative directive like "strip naked" into a third-person present-tense action ("strips naked"). */
export function toThirdPersonAction(text: string, actorName?: string): string {
  const s = stripLeadingActor(text, actorName).replace(/[.!]+$/, '').trim();
  if (!s) return '';
  const normed = s
    .replace(/\byourself\b/gi, 'themselves')
    .replace(/\bmyself\b/gi, 'themselves')
    .replace(/\byour\b/gi, 'their')
    .replace(/\bmy\b/gi, 'their');
  const m = /^([a-z]+)(\b.*)$/i.exec(normed);
  if (!m) return normed;
  const rawVerb = m[1];
  const w = rawVerb.toLowerCase();
  const rest = m[2];
  if (w.endsWith('ing') && w.length >= 5 && !/^(?:sing|ring|bring|swing|fling|sting|cling|sling|wring|ping|wing|king|ding|zing)$/i.test(w)) {
    return `starts ${normed}`;
  }
  const irregular: Record<string, string> = { be: 'is', have: 'has', do: 'does', go: 'goes' };
  const alreadyThird = /^(is|has|does|goes|strips|dances|kisses|hugs|seduces|flashes|moons|streaks|undresses|barks|meows|cries|screams|shrieks|faints|pukes|vomits|throws|shakes|slaps|hits|kills|punches|shoves|drags|steals|chases|follows|guards|walks|runs|gets|takes|rips|hooks|sleeps|makes|fucks|bangs|screws|flirts|jumps|spins|stomps|laughs|cackles|eats|drinks|chugs|moos|clucks|weeps|sobs|crawls|rolls|flexes|pushes|kicks|bites|licks|rubs|pours|dumps|spills|splashes|tickles|pokes|salutes|bows|kneels|prays|sings|raps|cuddles|spanks|gropes|fondles|grinds|straddles|serenades|juggles|meditates|dresses|wakes|revives|starts)$/i;
  let conj: string;
  if (alreadyThird.test(w)) conj = w;
  else if (irregular[w]) conj = irregular[w];
  else if (/(ss|sh|ch|x|z)$/i.test(w)) conj = `${w}es`;
  else if (/[^aeiou]y$/i.test(w)) conj = `${w.slice(0, -1)}ies`;
  else if (w.endsWith('s')) conj = w;
  else conj = `${w}s`;
  return `${conj}${rest}`;
}

export class InstinctBrain implements Brain, Reflexes {
  readonly kind = 'instinct' as const;
  readonly autonomous = true;
  private readonly bank: LooseBank;
  private readonly index: WorldIndex;
  private bags = new Map<string, string[]>();
  private lastLine = new Map<string, string>();

  constructor(
    bank: LooseBank,
    world?: BrainWorld | WorldIndex,
    private readonly rng: Rng = Math.random
  ) {
    this.bank = bank ?? {};
    this.index = world instanceof WorldIndex ? world : new WorldIndex(world ?? { setting: '', people: [], rooms: [] });
  }

  async status(): Promise<BrainStatus> {
    return { provider: 'instinct', ok: true, model: 'instinct', models: [] };
  }

  // ── Picking lines ─────────────────────────────────────────────────────────

  private list(who: string, sel: (v: LooseVoiceBank) => string[] | undefined): string[] {
    const v = this.bank[who];
    const own = v ? safe(() => sel(v)) : undefined;
    if (own && own.length) return own;
    return safe(() => sel(GENERIC)) ?? GENERIC.idle;
  }

  /** Shuffle-bag draw: every line comes up once before any repeats, and never the same line twice in a row for a person. */
  private draw(who: string, key: string, list: readonly string[]): string {
    const items = list.filter((s) => typeof s === 'string' && s.trim());
    if (!items.length) return '...';
    const bagKey = `${who}|${key}`;
    let bag = this.bags.get(bagKey);
    if (!bag || !bag.length) {
      bag = shuffle(items, this.rng);
      this.bags.set(bagKey, bag);
    }
    let line = bag.pop()!;
    if (line === this.lastLine.get(who) && items.length > 1) {
      const next = bag.length ? bag.pop()! : items.find((s) => s !== line)!;
      bag.unshift(line);
      line = next;
    }
    this.lastLine.set(who, line);
    return line;
  }

  bark(who: CharId, kind: BarkKind): string {
    const line = this.draw(who, `bark:${kind}`, this.list(who, (v) => v.barks?.[kind]));
    return cleanSay(line) || GENERIC_BARKS[kind][0];
  }

  chaosBark(who: CharId, chaos: ChaosId): string {
    const line = this.draw(who, `chaos:${chaos}`, this.list(who, (v) => v.chaos?.[chaos]));
    return cleanSay(line) || chaosCategoryLines(chaos)[0];
  }

  // ── Scenes ────────────────────────────────────────────────────────────────

  async scene(req: SceneRequest, cb?: SceneCallbacks): Promise<SceneResult> {
    const result = this.sceneNow(req);
    result.lines.forEach((l, i) => cb?.onLine?.(l, i));
    return result;
  }

  /** Synchronous scene, also used by LlmBrain to finish a scene the model left incomplete. */
  sceneNow(req: SceneRequest): SceneResult {
    const ppl = req.people;
    const names = new NameMap(ppl.map((p) => ({ id: p.id, name: p.name })));
    if (!ppl.length) return { lines: [], summary: `Nothing was said in ${req.place}.`, shifts: [], plans: [], source: 'instinct' };
    const rng = this.rng;
    const lo = Math.max(1, Math.min(req.minLines, req.maxLines));
    const hi = Math.max(lo, req.maxLines);

    if (req.delegation) {
      const del = req.delegation;
      const delTone: DelegateTone = del.tone ?? (del.executor === 'asker' ? 'ask' : 'order');
      const actPhrase = del.action.replace(/[.!?]+$/, '').trim();
      const spokenTargetAct = actPhrase
        .replace(/\b(?:herself|himself|themself|themselves)\b/gi, 'yourself')
        .replace(/\b(?:her|his|their)\s+(clothes|shirt|pants|dress|skirt|bra|underwear|trousers|blouse|boxers|panties|top|shoes|socks|shoulders|back|neck|feet|legs?|thighs?|ass|butt|face|cheek|lips|hand|hands|hair)\b/gi, 'your $1');
      const summaryVerb: Record<DelegateTone, string> = {
        order: 'ordered',
        ask: 'asked',
        dare: 'dared',
        beg: 'begged',
        persuade: 'tried to persuade'
      };
      const actLower = `${del.action} ${del.command}`.toLowerCase();
      const isOutrageous = /\b(strip|undress|naked|nude|clothes|flash|moon|streak|topless|pantless|kiss|make\s+out|seduce|hook\s+up|sleep\s+with|have\s+sex|fuck|bang|lap\s+dance|grope|massage|straddle|lick|kill|murder|eliminate|punch|hit(?!\s+on)|knock\s*out|shove|drag|lock|sabotage|smash)\b/.test(actLower);
      const targets = del.targets && del.targets.length > 1 ? del.targets : [del.target];
      if (targets.length > 1) {
        const compliers = targets.filter((id) => this.decideComplianceFor(req, id));
        const complies = compliers.length > 0;
        const asker = del.asker !== 'loudspeaker' ? ppl.find((p) => p.id === del.asker) : undefined;
        const askerName = asker ? names.name(asker.id) : 'the loudspeaker';
        const lines: SceneLine[] = [];
        if (asker) {
          const openLine: Record<DelegateTone, { say: string; feel: EmotionId; act: LineAct }> = {
            ask: { say: `Everyone, would you ${spokenTargetAct}?`, feel: 'nervous', act: 'shrug' },
            dare: { say: `I dare everyone here to ${spokenTargetAct}!`, feel: 'mischievous', act: 'point' },
            beg: { say: `Please everyone, I'm begging you — ${spokenTargetAct}!`, feel: 'embarrassed', act: 'step_closer' },
            persuade: { say: `Come on everyone, let's ${spokenTargetAct} — trust me!`, feel: 'excited', act: 'step_closer' },
            order: { say: `Everyone, ${spokenTargetAct}. Right now.`, feel: 'determined', act: 'point' }
          };
          const chosen = openLine[delTone];
          lines.push({
            who: asker.id,
            say: chosen.say,
            feel: chosen.feel,
            to: 'all',
            act: chosen.act
          });
        }
        for (const tid of targets) {
          if (lines.length >= hi) break;
          const tp = ppl.find((p) => p.id === tid);
          if (!tp) continue;
          const yes = compliers.includes(tid);
          lines.push(
            yes
              ? {
                  who: tp.id,
                  say: delTone === 'dare' ? "You're on! Watch this." : 'Sure, why not? Watch this.',
                  feel: 'mischievous',
                  to: asker ? asker.id : 'all',
                  act: 'laugh'
                }
              : {
                  who: tp.id,
                  say: delTone === 'ask'
                    ? (asker ? `Uh, no thanks, ${askerName}. Not happening.` : 'No thanks. Not happening.')
                    : (asker ? `Are you serious, ${askerName}? No chance.` : 'Are you serious? No chance.'),
                  feel: 'disgusted',
                  to: asker ? asker.id : 'all',
                  act: 'shake_head'
                }
          );
        }
        const verbWord = summaryVerb[delTone];
        const summary = complies
          ? `${askerName} ${verbWord} ${listNames(targets.map((id) => names.name(id)))} to ${actPhrase}, and ${listNames(compliers.map((id) => names.name(id)))} agreed.`
          : `${askerName} ${verbWord} ${listNames(targets.map((id) => names.name(id)))} to ${actPhrase}, and nobody agreed.`;
        const penaltyOnRefusal = delTone !== 'ask' || isOutrageous;
        return {
          lines,
          summary,
          shifts: asker && penaltyOnRefusal ? targets.filter((id) => !compliers.includes(id)).map((id) => ({ who: id, about: asker.id, change: 'likes_less' as const })) : [],
          plans: [],
          complies,
          compliers,
          source: 'instinct'
        };
      }

      const complies = this.decideComplianceFor(req, del.target);
      const asker = del.asker !== 'loudspeaker' ? ppl.find((p) => p.id === del.asker) : undefined;
      const target = ppl.find((p) => p.id === del.target) ?? ppl[1] ?? asker ?? ppl[0];
      const targetName = names.name(target.id);
      const askerName = asker ? names.name(asker.id) : 'Everyone';
      const isPerm = del.executor === 'asker';
      const lines: SceneLine[] = [];
      if (isPerm) {
        const spokenAct = actPhrase
          .replace(/\b(?:his|her|their)\s+(shoulders|back|neck|feet|legs?|thighs?|ass|butt|face|cheek|lips|hand|hands|hair)\b/gi, 'your $1')
          .replace(/\b(?:her|him|them)\b/gi, 'you');
        if (asker && asker.id !== target.id) {
          lines.push(
            delTone === 'beg'
              ? {
                  who: asker.id,
                  say: `Please ${targetName}, I'm begging you, let me ${spokenAct}!`,
                  feel: 'embarrassed',
                  to: target.id,
                  act: 'step_closer'
                }
              : {
                  who: asker.id,
                  say: `Hey ${targetName}, can I ${spokenAct}?`,
                  feel: 'nervous',
                  to: target.id,
                  act: 'step_closer'
                }
          );
        }
        lines.push(
          complies
            ? {
                who: target.id,
                say: 'Sure, why not? Go ahead.',
                feel: 'happy',
                to: asker && asker.id !== target.id ? asker.id : 'all',
                act: 'nod'
              }
            : {
                who: target.id,
                say: delTone === 'beg'
                  ? `Stop begging, ${askerName}. No chance.`
                  : `Are you serious, ${askerName}? No chance.`,
                feel: 'disgusted',
                to: asker && asker.id !== target.id ? asker.id : 'all',
                act: 'shake_head'
              }
        );
      } else {
        if (asker && asker.id !== target.id) {
          const singleOpen: Record<DelegateTone, { say: string; feel: EmotionId; act: LineAct }> = {
            ask: { say: `Hey ${targetName}, would you ${spokenTargetAct}?`, feel: 'nervous', act: 'shrug' },
            dare: { say: `I dare you to ${spokenTargetAct}, ${targetName}. Bet you won't.`, feel: 'mischievous', act: 'point' },
            beg: { say: `Please ${targetName}, I'm begging you — ${spokenTargetAct}!`, feel: 'embarrassed', act: 'step_closer' },
            persuade: { say: `Come on ${targetName}, just ${spokenTargetAct}. Trust me on this.`, feel: 'excited', act: 'step_closer' },
            order: { say: `${targetName}, ${spokenTargetAct}. Right now.`, feel: 'determined', act: 'point' }
          };
          const chosen = singleOpen[delTone];
          lines.push({
            who: asker.id,
            say: chosen.say,
            feel: chosen.feel,
            to: target.id,
            act: chosen.act
          });
        }
        const complySay = delTone === 'dare'
          ? "You're on! Watch this."
          : delTone === 'order'
            ? 'Sure, why not? Watch this.'
            : 'Sure, why not? Alright.';
        const refuseSay = (() => {
          if (delTone === 'ask') return asker ? `Uh, no thanks, ${askerName}. Not happening.` : 'No thanks. Not happening.';
          if (delTone === 'dare') return asker ? `Nice try, ${askerName}. I'm not falling for that dare.` : 'No way, not doing that.';
          if (delTone === 'beg') return asker ? `Stop begging, ${askerName}. No chance.` : 'Stop begging. No chance.';
          if (delTone === 'persuade') return asker ? `Save your breath, ${askerName}. Not happening.` : 'Not happening.';
          return asker ? `Don't boss me around, ${askerName}. No chance.` : 'Are you serious? No chance.';
        })();
        lines.push(
          complies
            ? {
                who: target.id,
                say: complySay,
                feel: 'mischievous',
                to: asker && asker.id !== target.id ? asker.id : 'all',
                act: 'laugh'
              }
            : {
                who: target.id,
                say: refuseSay,
                feel: 'disgusted',
                to: asker && asker.id !== target.id ? asker.id : 'all',
                act: 'shake_head'
              }
        );
      }
      const bystander = ppl.find((p) => p.id !== asker?.id && p.id !== target.id);
      if (bystander && lines.length < hi) {
        lines.push({
          who: bystander.id,
          say: isPerm
            ? (complies ? `Oh, ${targetName} actually said yes?` : `Yeah, ${askerName}, not happening.`)
            : (complies ? `Wait, ${targetName} is actually going to do it?!` : `Yeah, good luck talking ${targetName} into that.`),
          feel: 'surprised',
          to: target.id,
          act: complies ? 'gasp' : 'shrug'
        });
      }
      const singleVerb = delTone === 'order' ? 'told' : summaryVerb[delTone];
      const summary = isPerm
        ? (complies
            ? `${askerName} ${delTone === 'beg' ? 'begged' : 'asked'} ${targetName} for permission to ${actPhrase}, and ${targetName} agreed.`
            : `${askerName} ${delTone === 'beg' ? 'begged' : 'asked'} ${targetName} for permission to ${actPhrase}, and ${targetName} refused.`)
        : (complies
            ? `${asker ? askerName : 'The loudspeaker'} ${singleVerb} ${targetName} to ${actPhrase}, and ${targetName} agreed.`
            : `${asker ? askerName : 'The loudspeaker'} ${singleVerb} ${targetName} to ${actPhrase}, and ${targetName} flatly refused.`);
      const penaltyOnRefusal = delTone !== 'ask' || isOutrageous;
      return {
        lines,
        summary,
        shifts: !complies && penaltyOnRefusal && asker && asker.id !== target.id ? [{ who: target.id, about: asker.id, change: 'likes_less' }] : [],
        plans: [],
        complies,
        source: 'instinct'
      };
    }

    let n = Math.min(hi, lo + (rng() < 0.5 ? 1 : 0));
    if (ppl.length === 1) n = Math.min(n, 2);
    const text = `${req.why} ${req.facts.join(' ')}`;
    // Story mode: a scene about the week's story (the director says which theme) is told with the
    // story lines of whoever has them, and is not mistaken for an office event.
    const theme: StoryTheme | null = req.topic && STORY_TRIGGERS.has(req.trigger) ? req.topic : null;
    // What set the scene off decides which event it is about. The list of facts also holds
    // older events, so only the newest one (after the line giving the time) is a fallback:
    // otherwise people would shout about an earthquake that ended half an hour ago.
    const chaos = !theme && (req.trigger === 'event' || req.trigger === 'aftermath') ? detectChaos(req.why) ?? detectChaos(req.facts[1] ?? '') : null;
    const thing = req.trigger === 'custom' ? matchThing(req.why) : null;
    const thingNoun = thing?.noun ?? guessNoun(req.why);
    const vibe: CustomVibe = thing?.vibe ?? 'weird';
    const seen = new Set(req.recent.map((r) => lineKey(r.say)));
    const lines: SceneLine[] = [];

    // News with nothing to point at (someone arrived, something was decided) is brought up once and
    // answered; an event or a thing everyone can see gets a first reaction from each of them.
    const plainNews = req.trigger === 'event' && !chaos && !matchThing(text);
    const reactsFirst = (req.trigger === 'event' && !plainNews) || req.trigger === 'custom' || req.trigger === 'announce';
    // A visitor in the scene is who the client and inspection lines are about: the staff do not say them to his face.
    const visitorHere = ppl.some((p) => isVisitor(p.id));
    const aboutVisitor = theme === 'client' || theme === 'inspection';
    for (let i = 0; i < n * 2 && lines.length < n; i++) {
      const sp = ppl[lines.length % ppl.length];
      const prev = lines[lines.length - 1];
      const listener = ppl.length > 1 ? ppl[(lines.length + 1) % ppl.length] : null;
      const others = ppl.filter((p) => p.id !== sp.id);
      let raw: string;
      let feel: EmotionId = sp.mood;
      let to: CharId | 'all' | null = null;
      let act: LineAct | null = null;
      const k = lines.length;
      const opening = k === 0 || (reactsFirst && k < ppl.length);
      // On a story theme, each speaker mostly says their own piece about it; the rest are replies.
      const own = theme && !(visitorHere && aboutVisitor && !isVisitor(sp.id)) ? this.storyLines(sp.id, theme) : [];

      if (theme && own.length && (opening || rng() < 0.65)) {
        raw = this.draw(sp.id, `story:${theme}`, own);
        feel = storyFeel(theme, sp.mood, rng);
        to = opening ? (ppl.length > 2 ? 'all' : listener?.id ?? null) : prev && prev.who !== sp.id ? prev.who : others[0]?.id ?? null;
      } else if (ppl.length === 1 && k > 0) {
        raw = this.draw(sp.id, 'bark', this.list(sp.id, (v) => v.barks?.[moodBark(sp.mood)]));
      } else if (opening) {
        to = ppl.length > 2 ? 'all' : listener?.id ?? null;
        switch (req.trigger) {
          case 'event': {
            if (chaos) {
              raw = this.draw(sp.id, `chaos:${chaos}`, this.list(sp.id, (v) => v.chaos?.[chaos]));
              feel = chaosFeel(chaos, this.index.nerve(sp.id));
            } else {
              const t = matchThing(text);
              if (t) {
                raw = fill(this.draw(sp.id, `custom:${t.vibe}`, this.list(sp.id, (v) => v.custom?.[t.vibe])), { thing: t.noun });
                feel = VIBE_FEEL[t.vibe];
              } else {
                // News that is not a thing to point at (someone arrived, something was decided):
                // they bring it up the way they would start any conversation.
                raw = fill(this.draw(sp.id, 'openers', this.list(sp.id, (v) => v.openers)), { other: listener ? names.name(listener.id) : 'everyone' });
                feel = pick(['surprised', 'nervous', 'confused'] as const, rng);
              }
            }
            break;
          }
          case 'custom':
            raw = fill(this.draw(sp.id, `custom:${vibe}`, this.list(sp.id, (v) => v.custom?.[vibe])), { thing: thingNoun });
            feel = VIBE_FEEL[vibe];
            break;
          case 'announce':
            raw = this.draw(sp.id, 'announced', this.list(sp.id, (v) => v.announced));
            feel = pick(['surprised', 'confused', 'suspicious'] as const, rng);
            break;
          case 'whisper':
            raw = fill(this.draw(sp.id, 'whispered', this.list(sp.id, (v) => v.whispered)), { thought: firstPerson(firstThought(req.why)), other: listener ? names.name(listener.id) : undefined });
            feel = pick(['determined', 'suspicious', 'surprised'] as const, rng);
            act = 'none';
            break;
          case 'aftermath':
            raw = this.draw(sp.id, 'bark', this.list(sp.id, (v) => v.barks?.[moodBark(sp.mood)]));
            break;
          default:
            // Someone holding a whispered idea opens with it more often than not. Not someone the
            // story says is keeping a secret: their certainty shows in what they do, not in what they say.
            if (sp.conviction && !sp.hidden && rng() < 0.7) {
              raw = fill(this.draw(sp.id, 'whispered', this.list(sp.id, (v) => v.whispered)), {
                thought: firstPerson(sp.conviction.text),
                other: listener ? names.name(listener.id) : undefined
              });
              feel = 'determined';
              act = rng() < 0.5 ? 'point' : 'step_closer';
              break;
            }
            raw = fill(this.draw(sp.id, 'openers', this.list(sp.id, (v) => v.openers)), { other: listener ? names.name(listener.id) : 'everyone' });
            act = req.trigger === 'ambient' ? (rng() < 0.4 ? 'wave' : 'none') : rng() < 0.5 ? 'step_closer' : 'point';
            break;
        }
      } else {
        const about = prev && prev.who !== sp.id ? prev.who : others[0]?.id ?? null;
        const tone = toneOf(sp, about);
        to = about;
        raw = fill(this.draw(sp.id, `reply:${tone}`, this.list(sp.id, (v) => v.replies?.[tone])), { other: about ? names.name(about) : 'everyone' });
        if (tone === 'warm') feel = sp.mood === 'love' ? 'love' : pick(['happy', 'amused'] as const, rng);
        else if (tone === 'cold') feel = ['angry', 'suspicious', 'smug', 'disgusted', 'bored'].includes(sp.mood) ? sp.mood : pick(['suspicious', 'smug', 'angry'] as const, rng);
      }

      const say = cleanSay(raw);
      const key = lineKey(say);
      if (!say || seen.has(key)) continue;
      seen.add(key);
      if (act === null) {
        const acts = ACT_FOR_FEEL[feel];
        act = acts && rng() < 0.65 ? pick(acts, rng) : 'none';
      }
      lines.push({ who: sp.id, say, feel, to: to === sp.id ? null : to, act });
    }
    if (!lines.length) {
      const sp = ppl[0];
      lines.push({ who: sp.id, say: this.bark(sp.id, moodBark(sp.mood)), feel: sp.mood, to: null, act: 'none' });
    }

    return {
      lines,
      summary: this.summarise(req, lines, names, chaos, thingNoun, theme),
      shifts: this.shiftsFor(req, lines),
      plans: this.plansFor(req, chaos),
      source: 'instinct'
    };
  }

  /** A person's story lines on a theme (no generic stand-ins: without them, the usual lines are used). */
  private storyLines(who: string, theme: StoryTheme): string[] {
    const list = safe(() => this.bank[who]?.story?.[theme]);
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string' && s.trim().length > 0) : [];
  }

  /** One plain sentence for what happened. Used for model replies with no summary too. */
  summarise(req: SceneRequest, lines: SceneLine[], names: NameMap, chaos: ChaosId | null = null, thing?: string, theme: StoryTheme | null = null): string {
    const speakers = [...new Set(lines.map((l) => l.who))];
    const ids = speakers.length ? speakers : req.people.map((p) => p.id);
    const who = listNames(ids.map((id) => names.name(id)));
    const a = names.name(ids[0] ?? '');
    const b = ids[1] ? names.name(ids[1]) : null;
    const place = req.place;
    const cold = lines.some((l) => ['angry', 'suspicious', 'disgusted'].includes(l.feel));
    const warm = lines.every((l) => ['happy', 'amused', 'excited', 'love', 'proud'].includes(l.feel));
    const scared = lines.filter((l) => l.feel === 'scared').length > lines.length / 2;
    if (theme) {
      const what = STORY_NOUN[theme];
      if (req.trigger === 'plan' && b) return `${a} went to see ${b} in ${place} about ${what}.`;
      return b ? `${who} talked about ${what} in ${place}.` : `${a} said something about ${what} in ${place}.`;
    }
    switch (req.trigger) {
      case 'event': {
        const c = chaos ?? detectChaos(`${req.why} ${req.facts.join(' ')}`);
        return `${who} ${scared ? 'panicked about' : 'reacted to'} ${c ? CHAOS_NOUN[c] : 'what was happening'} in ${place}.`;
      }
      case 'aftermath':
        return `${who} talked about what had just happened in ${place}.`;
      case 'custom':
        return `${who} reacted to the ${thing ?? 'strange thing'} in ${place}.`;
      case 'whisper':
        return b ? `${a} had a sudden idea and told ${b} about it in ${place}.` : `${a} had a sudden idea in ${place}.`;
      case 'announce':
        return `${who} reacted to a voice over the loudspeaker in ${place}.`;
      case 'cue':
        return `${a} acted on a sudden urge in ${place}${b ? `, and ${b} saw it` : ''}.`;
      case 'plan':
        return b ? `${a} went to see ${b} in ${place}${cold ? ' and they argued' : ''}.` : `${a} spoke up in ${place}.`;
      default:
        if (!b) return `${a} thought out loud in ${place}.`;
        return `${who} ${cold ? 'argued' : warm ? 'had a friendly chat' : 'chatted'} in ${place}.`;
    }
  }

  private shiftsFor(req: SceneRequest, lines: SceneLine[]): RelationShift[] {
    if (req.people.length < 2 || !['ambient', 'plan', 'cue', 'whisper'].includes(req.trigger)) return [];
    const reply = lines.find((l, i) => i > 0 && l.to && l.to !== 'all');
    if (!reply || !reply.to || reply.to === 'all') return [];
    const p = req.people.find((x) => x.id === reply.who);
    if (!p) return [];
    const tone = toneOf(p, reply.to);
    if (tone === 'cold' && this.rng() < 0.45) return [{ who: reply.who, about: reply.to, change: 'likes_less' }];
    if (tone === 'warm' && this.rng() < 0.35) return [{ who: reply.who, about: reply.to, change: 'likes_more' }];
    return [];
  }

  private roomFor(kind: PlanKind): string | null {
    const words = PLAN_ROOM[kind];
    if (!words) return null;
    for (const w of words) {
      const r = this.index.roomInText(w);
      if (r) return r;
    }
    return null;
  }

  private plansFor(req: SceneRequest, chaos: ChaosId | null): { who: CharId; plan: Plan }[] {
    const out: { who: CharId; plan: Plan }[] = [];
    const placeId = this.index.resolveRoom(req.place);
    if (req.trigger === 'event' && chaos) {
      const skill = FIX_FOR[chaos];
      for (const p of req.people) {
        if (out.length >= 2) break;
        if (skill && this.index.canFix(p.id, skill)) out.push({ who: p.id, plan: { kind: 'fix', target: placeId, about: CHAOS_NOUN[chaos] } });
        else if (DISASTERS.includes(chaos) && this.index.nerve(p.id) < 0.35) out.push({ who: p.id, plan: { kind: 'flee', target: null, about: CHAOS_NOUN[chaos] } });
      }
    } else if (req.trigger === 'aftermath' && req.people[0] && this.rng() < 0.5) {
      out.push({ who: req.people[0].id, plan: { kind: 'work', target: null, about: 'getting back to normal' } });
    }
    return out;
  }

  // ── Minds ─────────────────────────────────────────────────────────────────

  async minds(req: MindsRequest): Promise<MindResult[]> {
    return req.people.map((p) => this.mindFor(p, req));
  }

  mindFor(p: MindsRequest['people'][number], req: MindsRequest): MindResult {
    const rng = this.rng;
    const facts = req.facts.join(' ');
    const chaos = facts ? detectChaos(facts) : null;
    let thought: string;
    let feel: EmotionId = p.mood;
    const stateBark = STATE_BARKS.find(([re]) => p.state.some((s) => re.test(s)));
    const story = req.topic ? this.storyLines(p.id, req.topic) : [];
    if (p.hidden && rng() < 0.45) {
      // Someone with something to hide keeps coming back to it, without ever saying what it is.
      thought = this.draw(p.id, 'hidden', HIDDEN_HINTS);
      feel = 'nervous';
    } else if (chaos && rng() < 0.6) {
      thought = this.chaosBark(p.id, chaos);
      feel = chaosFeel(chaos, this.index.nerve(p.id));
    } else if (req.topic && story.length && rng() < 0.5) {
      // Story mode: what the office is talking about is on their mind too.
      thought = cleanSay(this.draw(p.id, `story:${req.topic}`, story), 18);
      feel = storyFeel(req.topic, p.mood, rng);
    } else if (stateBark && rng() < 0.6) {
      thought = this.bark(p.id, stateBark[1]);
    } else {
      thought = cleanSay(this.draw(p.id, 'idle', this.list(p.id, (v) => v.idle)), 16);
    }
    return { who: p.id, thought: thought || '...', feel, plan: this.choosePlan(p, req, chaos) };
  }

  private choosePlan(p: MindsRequest['people'][number], req: MindsRequest, chaos: ChaosId | null): Plan {
    const allowed = req.allowed.length ? req.allowed : PLAN_KINDS;
    const others = req.others.filter((o) => o.id !== p.id);
    const byTone = (want: Tone): CharId | null => {
      const ranked = others.map((o) => ({ id: o.id, t: toneOf(p, o.id) }));
      const hit = ranked.filter((r) => r.t === want);
      if (hit.length) return pick(hit, this.rng).id;
      return want === 'cold' ? null : others.length ? pick(others, this.rng).id : null;
    };
    const tryPlan = (kind: PlanKind, about: string, target?: CharId | null): Plan | null => {
      if (!allowed.includes(kind)) return null;
      if (SOCIAL_PLANS.includes(kind)) {
        const t = target ?? byTone(['confront', 'prank', 'snoop'].includes(kind) ? 'cold' : 'warm');
        return t ? { kind, target: t, about } : null;
      }
      return { kind, target: kind === 'fix' ? this.index.resolveRoom(p.place) : this.roomFor(kind), about };
    };

    const goal = p.goal.toLowerCase();
    const named = others.find((o) => normName(goal).includes(normName(o.name)) && normName(o.name).length >= 3)?.id;
    // Whole words only: "waiting as asked" is not a wish to talk, and "the restroom" is not a nap.
    const goalRules: [RegExp, PlanKind][] = [
      [/\b(confront|have it out|complain)\b|\btell .* off\b/, 'confront'], [/\b(flirt|fancy|crush)\b|\bask .* out\b/, 'flirt'],
      [/\b(gossip|news)\b|\btell .* about\b/, 'gossip'], [/\b(prank|trick)\b|\bwind .* up\b/, 'prank'],
      [/\b(comfort|check on)\b|\bcheer .* up\b/, 'comfort'], [/\b(coffee|tea)\b/, 'coffee'], [/\b(snack|food|eat|eating|lunch|biscuit)\b/, 'snack'],
      [/\b(nap|sleep|rest)\b/, 'nap'], [/\b(hide|avoid)\b/, 'hide'], [/\b(fix|put out|mend|reset|repair|mop)\b/, 'fix'],
      [/\b(flee|get away|escape|leave)\b/, 'flee'], [/\b(snoop|search|look through)\b/, 'snoop'], [/\b(talk|chat|see|ask)\b/, 'talk'],
      [/\b(work|working|desk|report|finish|email)\b/, 'work']
    ];
    for (const [re, kind] of goalRules) {
      if (re.test(goal)) {
        const plan = tryPlan(kind, p.goal.slice(0, 60), SOCIAL_PLANS.includes(kind) ? named : undefined);
        if (plan) return plan;
      }
    }
    if (chaos) {
      const skill = FIX_FOR[chaos];
      if (skill && this.index.canFix(p.id, skill)) {
        const plan = tryPlan('fix', CHAOS_NOUN[chaos]);
        if (plan) return plan;
      }
      if (DISASTERS.includes(chaos) && this.index.nerve(p.id) < 0.4) {
        const plan = tryPlan(this.rng() < 0.5 ? 'flee' : 'hide', CHAOS_NOUN[chaos]);
        if (plan) return plan;
      }
    }
    const byMood: Partial<Record<EmotionId, PlanKind[]>> = {
      angry: ['confront', 'break'], love: ['flirt', 'talk'], scared: ['hide', 'flee'], nervous: ['work', 'hide'],
      tired: ['coffee', 'nap'], bored: ['wander', 'snack', 'coffee', 'gossip'], sad: ['break', 'snack'], mischievous: ['prank', 'gossip'],
      suspicious: ['snoop', 'wander'], happy: ['talk', 'gossip'], excited: ['talk', 'gossip'], amused: ['gossip', 'prank'],
      embarrassed: ['hide', 'work'], disgusted: ['break'], determined: ['work', 'confront'], proud: ['talk', 'work']
    };
    // A plan from a mood needs no reason spelt out ("talk to Jim about feeling happy" reads badly).
    for (const kind of shuffle(byMood[p.mood] ?? [], this.rng)) {
      const plan = tryPlan(kind, '');
      if (plan && this.rng() < 0.75) return plan;
    }
    for (const kind of shuffle(['work', 'talk', 'coffee', 'wander', 'snack'] as PlanKind[], this.rng)) {
      const plan = tryPlan(kind, kind === 'work' ? 'getting on with work' : '');
      if (plan) return plan;
    }
    for (const kind of allowed) {
      const plan = tryPlan(kind, '');
      if (plan) return plan;
    }
    return { kind: allowed[0] ?? 'wander', target: null, about: '' };
  }

  // ── Free-text events ──────────────────────────────────────────────────────

  async interpret(req: InterpretRequest): Promise<InterpretResult> {
    return this.interpretNow(req);
  }

  interpretNow(req: InterpretRequest): InterpretResult {
    const text = req.text.trim() || 'something strange';
    const rule = matchThing(text);
    const ids = req.rooms.map((r) => r.id as string);
    let room: string | 'everywhere';
    if (EVERYWHERE_RE.test(text) || !ids.length) room = 'everywhere';
    else {
      const byName = req.rooms.find((r) => text.toLowerCase().includes(r.name.toLowerCase().replace(/^the\s+/, '')))?.id;
      room =
        byName ??
        this.index.roomInText(text, ids) ??
        [...req.rooms].sort((a, b) => b.people.length - a.people.length)[0]?.id ??
        ids[0];
    }
    const noun = rule?.noun ?? guessNoun(text);
    const roomLabel = room === 'everywhere' ? 'Everywhere' : `in ${req.rooms.find((r) => r.id === room)?.name ?? this.index.roomName(room)}`;
    const title = `${capitalise(noun)} ${roomLabel}`.replace(/\s+/g, ' ').slice(0, 40).trim();
    let fact = capitalise(text.replace(/\s+/g, ' ').slice(0, 150));
    if (!/[.!?]$/.test(fact)) fact += '.';
    return {
      title,
      emoji: rule?.emoji ?? '✨',
      room: room as TargetRoomId | 'everywhere',
      fact,
      vibe: rule?.vibe ?? 'weird',
      intensity: INTENSE_RE.test(text) ? 3 : MILD_RE.test(text) ? 1 : 2,
      reaction: rule?.reaction ?? 'investigate',
      look: rule?.look ?? 'sparkles',
      moves: rule?.moves ?? false,
      ...kindFor(text, rule, noun),
      power: powerFor(text),
      guest: guestLookFor(text),
      source: 'instinct'
    };
  }

  async interpretDirective(req: DirectiveRequest): Promise<DirectiveResult> {
    return this.interpretDirectiveNow(req);
  }

  /** Decide in character whether a delegated target complies with a request (used offline or if model omits `complies`). */
  decideCompliance(req: SceneRequest, lines: readonly SceneLine[] = []): boolean {
    const del = req.delegation;
    if (!del) return false;
    return this.decideComplianceFor(req, del.target, lines);
  }

  /** Decide in character whether a specific target id complies with a request. */
  decideComplianceFor(req: SceneRequest, targetId: CharId, lines: readonly SceneLine[] = []): boolean {
    const del = req.delegation;
    if (!del) return false;
    const targetLines = lines.filter((l) => l.who === targetId).map((l) => l.say).join(' ');
    if (targetLines) {
      if (/\b(absolutely not|no way|no chance|are you (?:crazy|insane|out of your mind|serious)|hell no|never|disgusting|inappropriate|calling hr|call toby|forget it|not happening|keep my clothes|gross|stop it)\b/i.test(targetLines)) {
        return false;
      }
      if (/\b(sure|why not|alright|all right|fine|okay|ok|deal|you're on|watch this|here goes|count me in|gladly|on it|yes sir|let's do it|hell yeah)\b/i.test(targetLines)) {
        return true;
      }
    }

    const target = req.people.find((p) => p.id === targetId);
    const hasAsker = del.asker !== 'loudspeaker';
    const askerFirst = hasAsker ? (req.people.find((p) => p.id === del.asker)?.name.split(/\s+/)[0].toLowerCase() ?? del.asker.toLowerCase()) : 'loudspeaker';
    const stateText = target?.state.join(' ').toLowerCase() ?? '';
    const feelingText = hasAsker ? (target?.feelings.find((f) => f.about === del.asker)?.text.toLowerCase() ?? '') : '';
    const tone = target && hasAsker ? toneOf(target, del.asker) : 'neutral';
    const smitten =
      hasAsker &&
      (stateText.includes(`in love with ${askerFirst}`) ||
        feelingText.includes('hopelessly in love') ||
        (target?.mood === 'love' && tone === 'warm'));
    if (smitten) return true;

    const act = `${del.action} ${del.command}`.toLowerCase();
    const isRecover = /\b(get\s+dressed|put\s+(?:your|my|her|his|their|clothes).+\s+(?:back\s+)?on|cover\s+up|wake\s+up|help\s+.+\s+up|revive|calm\s+down|stop)\b/.test(act);
    if (isRecover && tone !== 'cold' && target?.mood !== 'angry') return true;

    const isNestedDelegate = /^(?:tell|ask|order|command|dare|convince|persuade|beg|urge|force|make|have|get)\s+/i.test(del.command.trim());
    const isExpose = !isNestedDelegate && /\b(strip|undress|naked|nude|clothes|flash|moon|streak|topless|pantless)\b/.test(act);
    const isViolent = /\b(kill|murder|eliminate|punch|hit(?!\s+on)|knock\s*out|shove|drag|lock|sabotage|smash|fire)\b/.test(act);
    const isRomance = !isNestedDelegate && /\b(kiss|make\s+out|seduce|hook\s+up|sleep\s+with|have\s+sex|fuck|bang|lap\s+dance|grope|massage|straddle|lick)\b/.test(act);
    const isWalkOut = !isNestedDelegate && /\b(quit|resign|walk\s+out)\b/.test(act);
    const tid = targetId.toLowerCase();
    const delTone: DelegateTone = del.tone ?? (del.executor === 'asker' ? 'ask' : 'order');
    const harmless = !isExpose && !isRomance && !isViolent && !isWalkOut;

    if (tone === 'cold' && !(tid === 'dwight' && delTone === 'dare' && harmless)) return false;
    if (target && ['angry', 'disgusted', 'scared', 'sad'].includes(target.mood)) return false;

    // For romance requests ("tell jim and pam to kiss", "tell jim to kiss pam", "ask pam if you can massage her"),
    // also check whether target loves/fancies the partner or the asker asking them.
    if (isRomance && target && !['angry', 'disgusted', 'scared', 'sad'].includes(target.mood)) {
      if (hasAsker && /\b(in\s+love|adore|adores|crush|fancy|fancies|hopelessly\s+in\s+love|soulmate|sweet\s+on|devoted|besotted)\b/i.test(feelingText)) {
        return true;
      }
      const coTarget = del.targets?.length === 2 ? del.targets.find((id) => id !== targetId) : undefined;
      const mentionedPartner = req.people.find((p) => {
        if (p.id === targetId) return false;
        const first = p.name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return first.length >= 2 && new RegExp(`\\b${first}\\b`, 'i').test(act);
      })?.id;
      const feelingPartner = target.feelings.find((f) => {
        if (f.about === targetId) return false;
        const first = this.index.nameOf(f.about).split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return first.length >= 2 && new RegExp(`\\b${first}\\b`, 'i').test(act);
      })?.about;
      const partnerId = coTarget ?? mentionedPartner ?? feelingPartner;
      if (partnerId) {
        const partnerName = req.people.find((p) => p.id === partnerId)?.name ?? this.index.nameOf(partnerId);
        const partnerFirst = partnerName.split(/\s+/)[0].toLowerCase();
        const partnerFeeling = target.feelings.find((f) => f.about === partnerId)?.text.toLowerCase() ?? '';
        const partnerSmitten =
          stateText.includes(`in love with ${partnerFirst}`) ||
          /\b(love|loves|crush|adore|adores|fancy|fancies|hopelessly in love|soulmate|sweet on|romantic|soft spot|devoted|besotted)\b/i.test(partnerFeeling) ||
          (target.mood === 'love' && toneOf(target, partnerId) === 'warm');
        if (partnerSmitten) return true;
      }
    }

    const aid = hasAsker ? del.asker.toLowerCase() : 'loudspeaker';
    const mood = target?.mood ?? 'neutral';

    if (tid === 'meredith' || tid === 'creed') {
      if (isWalkOut) return false;
      if (isExpose || isRomance) return true;
      if (isViolent) return tid === 'creed';
      return true;
    }
    if (tid === 'dwight') {
      if (aid === 'michael' && !isWalkOut && !isExpose && !isRomance) return true;
      if (harmless) {
        if (delTone === 'dare') return true;
        if (delTone === 'order') return false;
        if (mood === 'determined' || mood === 'excited') return true;
      }
      return false;
    }
    if (['angela', 'toby', 'pam', 'oscar', 'stanley', 'phyllis'].includes(tid)) {
      if (!harmless) return false;
      if (tid === 'angela' || tid === 'stanley') {
        if (delTone === 'order') return tone === 'warm' && ['happy', 'excited', 'amused'].includes(mood);
        return tone === 'warm';
      }
      if (delTone === 'order') return tone === 'warm' && ['happy', 'excited', 'amused'].includes(mood);
      return tone === 'warm' || ['happy', 'excited', 'amused'].includes(mood);
    }
    if (!harmless) {
      return tone === 'warm' && (mood === 'mischievous' || mood === 'excited') && !isWalkOut;
    }
    if (delTone === 'dare' && ['michael', 'andy', 'kelly', 'ryan', 'kevin'].includes(tid)) {
      return true;
    }
    if (delTone === 'order') return tone === 'warm';
    return tone === 'warm' || ['happy', 'excited', 'amused', 'mischievous'].includes(mood);
  }

  interpretDirectiveNow(req: DirectiveRequest): DirectiveResult {
    const raw = req.text.trim();
    const text = stripLeadingActor(raw, req.actor.name) || raw;
    const roomIds = req.rooms.map((r) => r.id);
    const pickRoom = (candidate: string): DirectiveResult['targetRoom'] =>
      (roomIds.includes(candidate) ? candidate : null) as DirectiveResult['targetRoom'];
    const resolveRoomIn = (src: string): DirectiveResult['targetRoom'] => {
      const byName = req.rooms.find((r) => src.toLowerCase().includes(r.name.toLowerCase().replace(/^the\s+/, '')))?.id;
      let r = (byName ?? this.index.roomInText(src, roomIds) ?? null) as DirectiveResult['targetRoom'];
      if (!r) {
        if (/\b(fax(?:\s+machine)?|copier|printer)\b/i.test(src)) r = pickRoom('annex') ?? pickRoom('bullpen');
        else if (/\b(coffee(?:\s*maker|\s*machine)?|fridge|vending|microwave|break\s*room|kitchen)\b/i.test(src)) r = pickRoom('kitchen');
        else if (/\breception|switchboard\b/i.test(src)) r = pickRoom('bullpen');
        else if (/\bmichael'?s\s+office|boss\b/i.test(src)) r = pickRoom('boss');
        else if (/\bconference|meeting\b/i.test(src)) r = pickRoom('meeting');
        else if (/\bwater\s+cooler|accounting\b/i.test(src)) r = pickRoom('accounts');
      }
      return r;
    };

    const findPrimaryTarget = (src: string, actorId: CharId): CharId | null => {
      const clean = stripRoomPhrases(src);
      const matches: { id: CharId; index: number; bystander: boolean }[] = [];
      for (const p of req.people) {
        if (p.id === actorId) continue;
        const parts = [p.name, p.name.split(/\s+/)[0]].filter((s) => s.length >= 2);
        let earliest = Infinity;
        for (const part of parts) {
          const esc = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const m = new RegExp(`\\b${esc}\\b`, 'i').exec(clean);
          if (m && m.index < earliest) earliest = m.index;
        }
        if (earliest < Infinity) {
          const pre = clean.slice(Math.max(0, earliest - 24), earliest);
          const bystander =
            /\b(?:in\s+front\s+of|beside|next\s+to|behind|nearby|watching)\s*$/i.test(pre) ||
            /\bwhile\s*$/i.test(pre);
          matches.push({ id: p.id, index: earliest, bystander });
        }
      }
      if (matches.length) {
        matches.sort((a, b) => Number(a.bystander) - Number(b.bystander) || a.index - b.index);
        return matches[0].id;
      }
      if (/\b(yourself|himself|herself|themself|myself|self)\b/i.test(clean)) return actorId;
      return null;
    };

    if (isStopCommand(text, req.actor.name)) {
      return {
        verb: 'recover',
        targetPerson: null,
        targetRoom: null,
        power: 'none',
        item: 'stop',
        summary: 'stops what they are doing',
        source: 'instinct'
      };
    }

    if (isNegatedDirective(text, req.actor.name)) {
      return {
        verb: 'social',
        targetPerson: findPrimaryTarget(text, req.actor.id),
        targetRoom: null,
        power: 'none',
        item: '',
        summary: text.slice(0, 120),
        source: 'instinct'
      };
    }

    const resolveNamed = (rawName: string): { id: CharId; name: string; room: DirectiveRequest['actor']['room'] } | undefined => {
      const q = rawName.trim().toLowerCase();
      if (!q || q.length < 2) return undefined;
      return req.people.find((p) => {
        if (p.id === req.actor.id) return false;
        const first = p.name.split(/\s+/)[0].toLowerCase();
        return p.name.toLowerCase() === q || first === q || p.id.toLowerCase() === q;
      });
    };

    if (req.allowDelegate !== false) {
      const approach = '(?:(?:go|walk|run|head|step|come)\\s+(?:over\\s+|up\\s+)?(?:to\\s+)?(?:and\\s+)?|go\\s+and\\s+)?';
      const verbTo = '(tell|ask|order|command|dare|convince|persuade|beg|urge|force|get)';
      const verbBare = '(make|have)';
      const verbAny = '(tell|ask|order|command|dare|convince|persuade|beg|urge|force|get|make|have)';

      // 1. Group delegation ("tell everyone to strip naked", "order the whole office to dance")
      const groupTarget = '(?:everyone|everybody|all\\s+(?:of\\s+(?:them|you)|staff|hands)|the\\s+(?:whole\\s+)?office|everybody\\s+here|the\\s+room)';
      const mGroup =
        new RegExp(`^(?:please\\s+)?${approach}${verbTo}\\s+(${groupTarget}(?:\\s+in\\s+(?:the\\s+)?[a-z'\\s]{2,24}?)?)\\s+(?:to\\s+|:?\\s*(?:they\\s+should\\s+|that\\s+they\\s+should\\s+)?|if\\s+they(?:'d|\\s+will|\\s+would)\\s+)(.+)$`, 'i').exec(text) ??
        new RegExp(`^(?:please\\s+)?${approach}${verbBare}\\s+(${groupTarget}(?:\\s+in\\s+(?:the\\s+)?[a-z'\\s]{2,24}?)?)\\s+(?:to\\s+)?(.+)$`, 'i').exec(text);
      if (mGroup) {
        const delegateTone = delegateToneFor(mGroup[1]);
        const groupDesc = mGroup[2];
        const inner = mGroup[3].trim();
        if (isConversationalInner(inner) || isNegatedDirective(inner)) {
          return {
            verb: 'social',
            targetPerson: null,
            targetRoom: resolveRoomIn(groupDesc),
            power: 'none',
            item: '',
            summary: toThirdPersonAction(text, req.actor.name).slice(0, 120),
            source: 'instinct'
          };
        }
        return {
          verb: 'delegate',
          delegateTone,
          targetPerson: null,
          targetAll: true,
          targetRoom: resolveRoomIn(groupDesc),
          power: 'none',
          item: '',
          summary: toThirdPersonAction(text, req.actor.name).slice(0, 120),
          delegatedText: inner.slice(0, 120),
          source: 'instinct'
        };
      }

      // 2. Two-person delegation ("tell meredith and angela to strip naked", "make jim and pam kiss")
      const mTwo = (() => {
        const mA = new RegExp(
          `^(?:please\\s+)?${approach}(?:go|walk|run|head|step|find|approach)\\s+(?:over\\s+|up\\s+)?(?:to\\s+)?([a-z][a-z' -]{1,20}?)\\s+and\\s+([a-z][a-z' -]{1,20}?)\\s+and\\s+${verbAny}\\s+them\\s+(?:to\\s+|:?\\s*)?(.+)$`,
          'i'
        ).exec(text);
        if (mA) return { name1: mA[1], name2: mA[2], verbStr: mA[3], inner: mA[4] };
        const mB =
          new RegExp(`^(?:please\\s+)?${approach}${verbTo}\\s+([a-z][a-z' -]{1,20}?)\\s+and\\s+([a-z][a-z' -]{1,20}?)\\s+(?:to\\s+|:?\\s*(?:they\\s+should\\s+)?)(.+)$`, 'i').exec(text) ??
          new RegExp(`^(?:please\\s+)?${approach}${verbBare}\\s+([a-z][a-z' -]{1,20}?)\\s+and\\s+([a-z][a-z' -]{1,20}?)\\s+(?:to\\s+)?(.+)$`, 'i').exec(text);
        if (mB) return { verbStr: mB[1], name1: mB[2], name2: mB[3], inner: mB[4] };
        return null;
      })();
      if (mTwo) {
        const p1 = resolveNamed(mTwo.name1);
        const p2 = resolveNamed(mTwo.name2);
        const inner = mTwo.inner.trim();
        const delegateTone = delegateToneFor(mTwo.verbStr);
        if (p1 && p2 && p1.id !== p2.id) {
          if (isConversationalInner(inner) || isNegatedDirective(inner)) {
            return {
              verb: 'social',
              targetPerson: p1.id,
              targetRoom: null,
              power: 'none',
              item: '',
              summary: toThirdPersonAction(text, req.actor.name).slice(0, 120),
              source: 'instinct'
            };
          }
          return {
            verb: 'delegate',
            delegateTone,
            targetPerson: p1.id,
            targetPeople: [p1.id, p2.id],
            targetRoom: null,
            power: 'none',
            item: '',
            summary: toThirdPersonAction(text, req.actor.name).slice(0, 120),
            delegatedText: inner.slice(0, 120),
            source: 'instinct'
          };
        }
      }

      const pronounOf = (person: { id: CharId; pronoun?: 'he' | 'she' | 'they' }): 'he' | 'she' | 'they' | null => {
        if (person.pronoun) return person.pronoun;
        const bp = this.index.person(person.id);
        if (!bp) return null;
        const bio = `${bp.summary} ${bp.secret}`.toLowerCase();
        if (/\b(she|her|hers)\b/.test(bio) && !/\b(he|him|his)\b/.test(bio)) return 'she';
        if (/\b(he|him|his)\b/.test(bio) && !/\b(she|her|hers)\b/.test(bio)) return 'he';
        return null;
      };
      const actorPron = pronounOf(req.actor);

      // 3. Single-person permission requests ("ask pam if you can massage her", "ask pam to let you...")
      //    and single-person delegations ("tell meredith to strip naked", "walk over to X and tell her to...")
      for (const p of req.people) {
        if (p.id === req.actor.id) continue;
        const targetPron = pronounOf(p);
        const parts = [p.name, p.name.split(/\s+/)[0]].filter((s) => s.length >= 2);
        for (const part of parts) {
          const esc = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const appPron = `(?:go|walk|run|head|step|find|approach)\\s+(?:over\\s+|up\\s+)?(?:to\\s+)?${esc}\\s+and\\s+(?:ask|beg)\\s+(?:him|her|them|${esc})`;

          // 3a. Explicit permission requests where the asker performs the action if target agrees
          const mPerm =
            new RegExp(`^(?:please\\s+)?(?:${appPron}|${approach}(?:ask|beg)\\s+${esc})\\s+(?:if|whether)\\s+(?:you|i|we)\\s+(?:can|may|could|might)\\s+(.+)$`, 'i').exec(text) ??
            new RegExp(`^(?:please\\s+)?(?:${appPron}|${approach}(?:ask|beg)\\s+${esc})\\s+(?:(?:if|whether)\\s+(?:she|he|they)(?:'ll|\\s+will|\\s+would|\\s+can|\\s+could)?\\s+let|to\\s+let)\\s+(?:you|me|him|her|them)\\s+(.+)$`, 'i').exec(text) ??
            new RegExp(`^(?:please\\s+)?(?:${appPron}|${approach}(?:ask|beg)\\s+${esc})\\s+(?:for\\s+permission|if\\s+it(?:'s|\\s+is)\\s+(?:ok|okay|alright|all\\s+right|cool|fine)(?:\\s+with\\s+(?:her|him|them|you))?)\\s+to\\s+(.+)$`, 'i').exec(text);
          if (mPerm) {
            const inner = mPerm[1].trim();
            const permPrefix = mPerm[0].slice(0, mPerm[0].length - mPerm[1].length);
            const delegateTone: DelegateTone = /\bbeg\b/i.test(permPrefix) ? 'beg' : 'ask';
            if (isConversationalInner(inner) || isNegatedDirective(inner)) {
              return {
                verb: 'social',
                targetPerson: p.id,
                targetRoom: null,
                power: 'none',
                item: '',
                summary: toThirdPersonAction(text, req.actor.name).slice(0, 120),
                source: 'instinct'
              };
            }
            return {
              verb: 'delegate',
              delegateExecutor: 'asker',
              delegateTone,
              targetPerson: p.id,
              targetRoom: null,
              power: 'none',
              item: '',
              summary: toThirdPersonAction(text, req.actor.name).slice(0, 120),
              delegatedText: inner.slice(0, 120),
              source: 'instinct'
            };
          }

          // Third-person subject matching the asker ("ask pam if he can massage her")
          const mThirdPerm = new RegExp(
            `^(?:please\\s+)?(?:${appPron}|${approach}(?:ask|beg)\\s+${esc})\\s+(?:if|whether)\\s+(he|she|they)\\s+(?:can|may|could|might)\\s+(.+)$`,
            'i'
          ).exec(text);
          if (mThirdPerm) {
            const subjPron = mThirdPerm[1].toLowerCase() as 'he' | 'she' | 'they';
            const inner = mThirdPerm[2].trim();
            const permPrefix = mThirdPerm[0].slice(0, mThirdPerm[0].length - mThirdPerm[2].length);
            const delegateTone: DelegateTone = /\bbeg\b/i.test(permPrefix) ? 'beg' : 'ask';
            const isAskerPerm =
              (actorPron !== null && targetPron !== null && subjPron === actorPron && subjPron !== targetPron) ||
              (subjPron === 'he' && /\b(?:her|hers)\b/i.test(inner)) ||
              (subjPron === 'she' && /\b(?:him|his)\b/i.test(inner));
            if (isAskerPerm && !isConversationalInner(inner) && !isNegatedDirective(inner)) {
              return {
                verb: 'delegate',
                delegateExecutor: 'asker',
                delegateTone,
                targetPerson: p.id,
                targetRoom: null,
                power: 'none',
                item: '',
                summary: toThirdPersonAction(text, req.actor.name).slice(0, 120),
                delegatedText: inner.slice(0, 120),
                source: 'instinct'
              };
            }
          }

          // 3b. Standard target-executed delegation
          const m = (() => {
            const m1a = new RegExp(
              `^(?:please\\s+)?(?:go|walk|run|head|step|find|approach)\\s+(?:over\\s+|up\\s+)?(?:to\\s+)?${esc}\\s+and\\s+${verbTo}\\s+(?:him|her|them|${esc})\\s+(?:to\\s+|:\\s*|(?:he|she|they)\\s+(?:should|must|needs?\\s+to)\\s+|if\\s+(?:he|she|they)(?:'d|\\s+will|\\s+would|\\s+can)\\s+)(.+)$`,
              'i'
            ).exec(text);
            if (m1a) return { verbStr: m1a[1], inner: m1a[2].trim() };
            const m1b = new RegExp(
              `^(?:please\\s+)?(?:go|walk|run|head|step|find|approach)\\s+(?:over\\s+|up\\s+)?(?:to\\s+)?${esc}\\s+and\\s+${verbBare}\\s+(?:him|her|them|${esc})\\s+(?:to\\s+)?(.+)$`,
              'i'
            ).exec(text);
            if (m1b) return { verbStr: m1b[1], inner: m1b[2].trim() };
            const m2 = new RegExp(
              `^(?:please\\s+)?${approach}${verbTo}\\s+${esc}\\s+(?:to\\s+|:\\s*|(?:he|she|they)\\s+(?:should|must|needs?\\s+to)\\s+|if\\s+(?:he|she|they)(?:'d|\\s+will|\\s+would|\\s+can)\\s+)(.+)$`,
              'i'
            ).exec(text);
            if (m2) return { verbStr: m2[1], inner: m2[2].trim() };
            const m3 = new RegExp(`^(?:please\\s+)?${approach}${verbBare}\\s+${esc}\\s+(?:to\\s+)?(.+)$`, 'i').exec(text);
            if (m3) return { verbStr: m3[1], inner: m3[2].trim() };
            const m4 = new RegExp(`^(?:please\\s+)?${approach}get\\s+${esc}\\s+(naked|nude|undressed|dressed)$`, 'i').exec(text);
            if (m4) return { verbStr: 'get', inner: `get ${m4[1].trim()}` };
            return null;
          })();
          if (m) {
            const inner = m.inner;
            const delegateTone = delegateToneFor(m.verbStr);
            if (isConversationalInner(inner) || isNegatedDirective(inner)) {
              return {
                verb: 'social',
                targetPerson: p.id,
                targetRoom: null,
                power: 'none',
                item: '',
                summary: toThirdPersonAction(text, req.actor.name).slice(0, 120),
                source: 'instinct'
              };
            }
            return {
              verb: 'delegate',
              delegateTone,
              targetPerson: p.id,
              targetRoom: null,
              power: 'none',
              item: '',
              summary: toThirdPersonAction(text, req.actor.name).slice(0, 120),
              delegatedText: inner.slice(0, 120),
              source: 'instinct'
            };
          }
        }
      }

      // 4. Unspecified person ("tell someone to...")
      const mAny =
        new RegExp(`^(?:please\\s+)?${approach}${verbTo}\\s+(?:someone|somebody|anyone|anybody)\\s+(?:to\\s+|:\\s*)(.+)$`, 'i').exec(text) ??
        new RegExp(`^(?:please\\s+)?${approach}${verbBare}\\s+(?:someone|somebody|anyone|anybody)\\s+(?:to\\s+)?(.+)$`, 'i').exec(text);
      if (mAny) {
        const delegateTone = delegateToneFor(mAny[1]);
        const inner = mAny[2].trim();
        if (!isConversationalInner(inner) && !isNegatedDirective(inner)) {
          return {
            verb: 'delegate',
            delegateTone,
            targetPerson: null,
            targetRoom: null,
            power: 'none',
            item: '',
            summary: toThirdPersonAction(text, req.actor.name).slice(0, 120),
            delegatedText: inner.slice(0, 120),
            source: 'instinct'
          };
        }
      }
    }

    const cleanPersonText = stripRoomPhrases(text);
    const targetPerson = findPrimaryTarget(text, req.actor.id);
    const hasPersonTarget = !!targetPerson || /\b(someone|somebody|anyone|anybody|him|her|them)\b/i.test(cleanPersonText);
    const targetRoom = resolveRoomIn(text);

    const itemMatch = text.toLowerCase().match(
      /\b(stapler|mug|coffee|chair|printer|fax|copier|laptop|computer|monitor|desk|scissors|knife|bat|broom|mop|wrench|extinguisher|keyboard|phone|fridge|vending|plant|box|papers?|chili|cat|purse|wallet|glasses|keys)\b/
    );
    let item = itemMatch ? itemMatch[1] : '';
    const possItem = /[a-z]+'s\s+([a-z][a-z\s-]{1,28}?)(?=\s+(?:from|in|at|on|to|and|then|$)|[.!?]|$)/i.exec(cleanPersonText);
    if (possItem && !/^(office|room|ass|butt|lap|face|neck|ear|lip|hand|chest|boobs|crotch)$/i.test(possItem[1].trim())) {
      item = possItem[1].trim();
    } else if (!item) {
      const stealObj = /\b(?:steal|swipe|snatch|rob|nick|confiscate|take|pour|dump|spill|splash)\s+(?:the\s+|a\s+|an\s+|some\s+|his\s+|her\s+|their\s+|my\s+)?([a-z][a-z\s-]{1,26}?)(?=\s+(?:from|at|on|onto|over|in|into|of|to|and|then|$)|[.!?]|$)/i.exec(cleanPersonText);
      if (stealObj) {
        const cand = stealObj[1].trim();
        if (!/^(him|her|them|it|me|you|someone|anyone|everyone|self)$/i.test(cand) && !resolveNamed(cand)) item = cand;
      }
    }

    const power = powerFor(text);
    const hasMachine = /\b(fax(?:\s+machine)?|printer|copier|coffee\s*(?:machine|maker)?|vending(?:\s+machine)?|fridge|microwave|computer|laptop|monitor|desk|router|wifi|phone)\b/i.test(text);
    const inanimateTarget = !hasPersonTarget && /\b(wifi|power|lights?|internet|office|room|building)\b/i.test(text);
    const phrasalOff = /\b(take|strip|rip|pull|get|back|tell|turn|shut|cut|blow|jerk|jack|rub|whack|lay|keep|stay|run|walk|storm|piss|fuck|screw|show|cool|knock|head|send|set|drop|kick|push|shove|kiss|make)\s+(?:\w+\s+){0,2}off\b/i.test(text);
    const clothingWord = /\b(clothes|shirt|pants|dress|skirt|bra|underwear|trousers|blouse|boxers|panties)\b/i.test(text);

    const isDress = /\b(get\s+dressed|put\s+(?:(?:your|his|her|their|my)\s+)?(?:clothes|shirt|pants|dress|skirt|trousers|underwear|bra)\s+(?:back\s+)?on|put\s+on\s+(?:(?:your|his|her|their|my)\s+)?(?:clothes|shirt|pants|dress|skirt|trousers)|cover\s+(?:yourself|himself|herself|up|\w+\s+up)|dress\s+(?:yourself|\w+)|give\s+\w+\s+(?:clothes|a\s+robe|a\s+coat|a\s+shirt)|hand\s+\w+\s+a\s+(?:robe|coat|shirt|towel))\b/i.test(text);
    const isRevive = /\b(revive|resurrect|bring\s+.+\s+back(?:\s+to\s+life)?|do\s+cpr\s+on|give\s+\w+\s+cpr)\b/i.test(text);
    const isWake = /\b(wake\s+(?:up\s+)?\w+|wake\s+\w+\s+up|shake\s+\w+\s+awake|help\s+\w+\s+up|snap\s+\w+\s+out\s+of\s+it)\b/i.test(text);
    const isNap = /\b(go\s+to\s+sleep|take\s+a\s+nap|fall\s+asleep|lie\s+down\s+and\s+sleep|nap\s+at)\b/i.test(text) && !/\bsleep\s+with\b/i.test(text) && power !== 'sleep';

    const isExpose = !isDress && /\b(stripp?(?:ing)?(?:\s+down)?|strip\s*tease|undress(?:ing)?|get(?:ting)?\s+(?:naked|nude|undressed)|go(?:ing)?\s+(?:naked|nude|topless|pantless|bottomless)|be\s+naked|naked|nude|topless|pantless|bottomless|skinny\s+dip(?:ping)?|tak(?:e|ing)\s+off\s+everything|tak(?:e|ing)\s+(?:(?:your|her|his|their|my)\s+)?(?:clothes|shirt|pants|dress|skirt|bra|underwear|trousers)\s+off|tak(?:e|ing)\s+off\s+(?:(?:your|her|his|their|my)\s+)?(?:clothes|shirt|pants|dress|skirt|bra|underwear|trousers)|ripp?(?:ing)?\s+(?:(?:your|her|his|their|my)\s+)?(?:clothes|shirt|pants|dress)\s+off|ripp?(?:ing)?\s+off\s+(?:(?:your|her|his|their|my)\s+)?(?:clothes|shirt|pants|dress)|dropp?(?:ing)?\s+(?:(?:your|his|her|their|my)\s+)?(?:pants|trousers|drawers|shorts|skirt)|pull(?:ing)?\s+down\s+(?:(?:your|her|his|their|my)\s+)?(?:pants|trousers|shorts|skirt|underwear)|bar(?:e|ing)\s+(?:(?:your|her|his|their|my)\s+)?(?:ass|butt|chest|boobs|breasts)|flash(?:ing)?|moon(?:ing)?|streak(?:ing)?)\b/i.test(text);
    const selfPleasure = /\b(masturbat\w*|jerk(?:ing)?\s+off|jack(?:ing)?\s+off|touch(?:ing)?\s+(?:yourself|himself|herself|myself)|pleasur(?:e|ing)\s+(?:yourself|himself|herself|myself))\b/i.test(text);
    const isRomance = !selfPleasure && (
      /\b(kiss(?:ing)?|smooch(?:ing)?|hugg?(?:ing)?|cuddl(?:e|ing)|embrac(?:e|ing)|mak(?:e|ing)\s+out|french\s+kiss(?:ing)?|propos(?:e|ing)|profess(?:ing)?\s+(?:your\s+)?love|confess(?:ing)?\s+(?:your\s+)?love|flirt(?:ing)?|romanc(?:e|ing)|marry(?:ing)?|seduc(?:e|ing)|hitt?(?:ing)?\s+on|hook(?:ing)?\s+up|sleep(?:ing)?\s+with|sleep(?:ing)?\s+together|hav(?:e|ing)\s+sex|mak(?:e|ing)\s+love|get(?:ting)?\s+laid|shagg?(?:ing)?|grop(?:e|ing)|feel(?:ing)?\s+up|fondl(?:e|ing)|lap\s+danc(?:e|ing)|grind(?:ing)?\s+on|dry\s+hump(?:ing)?|spank(?:ing)?|affair|orgy|threesome|blowjob|handjob|motorboat(?:ing)?|eat(?:ing)?\s+\w+\s+out|suck(?:ing)?\s+\w+\s+off|finger(?:ing)?|turn(?:ing)?\s+\w+\s+on|sitt?(?:ing)?\s+on\s+(?:\w+'s\s+)?lap|straddl(?:e|ing)|lick(?:ing)?|nibbl(?:e|ing)|massag(?:e|ing)|caress(?:ing)?|strok(?:e|ing)|twerk(?:ing)?\s+on|ask(?:ing)?\s+\w+\s+out|rubb?(?:ing)?\s+(?:\w+'s\s+)?(?:shoulders|back|feet|leg|thigh|ass|butt)|(?:slapp?(?:ing)?|grabb?(?:ing)?|pinch(?:ing)?|smack(?:ing)?)\s+(?:\w+'s\s+|his\s+|her\s+|their\s+|my\s+)?(?:ass|butt|booty|boobs|chest|crotch)|giv(?:e|ing)\s+\w+\s+a\s+(?:lap\s+dance|massage|kiss|hickey|bj|blowjob|handjob)|bit(?:e|ing)\s+\w+'s\s+(?:neck|ear|lip)|pleasur(?:e|ing)\s+(?!yourself|himself|herself|myself)\w+)\b/i.test(text) ||
      (/\b(fuck(?:ing)?(?!\s+(?:off|up|this|that|it|everything|around))|bang(?:ing)?|screw(?:ing)?(?!\s+(?:up|off|around))|bed|rid(?:e|ing)|blow(?:ing)?(?!\s+(?:up|off|away|out)))\b/i.test(text) && hasPersonTarget && !hasMachine)
    );
    const isPerform = /\b(danc(?:e|ing)|twerk(?:ing)?|boogi(?:e|eing)|scream(?:ing)?|shriek(?:ing)?|howl(?:ing)?|bark(?:ing)?|meow(?:ing)?|moo(?:ing)?|cluck(?:ing)?|hiss(?:ing)?|growl(?:ing)?|roar(?:ing)?|neigh(?:ing)?|oink(?:ing)?|quack(?:ing)?|squawk(?:ing)?|squeak(?:ing)?|screech(?:ing)?|cry(?:ing)?|sobb?(?:ing)?|weep(?:ing)?|laugh(?:ing)?|giggl(?:e|ing)|chuckl(?:e|ing)|cackl(?:e|ing)|sing(?:ing)?|rapp?(?:ing)?|opera|beatbox(?:ing)?|yodel(?:ing)?|whistl(?:e|ing)|serenad(?:e|ing)|applaud(?:ing)?|clapp?(?:ing)?|faint(?:ing)?|pass(?:ing)?\s+out|collaps(?:e|ing)|play(?:ing)?\s+dead|puk(?:e|ing)|vomit(?:ing)?|throw(?:ing)?\s+up|barf(?:ing)?|fart(?:ing)?|burp(?:ing)?|belch(?:ing)?|sneez(?:e|ing)|cough(?:ing)?|hiccup(?:ing)?|yawn(?:ing)?|snor(?:e|ing)|spitt?(?:ing)?|drool(?:ing)?|backflipp?(?:ing)?|cartwheel(?:ing)?|handstand|somersault(?:ing)?|moonwalk(?:ing)?|breakdanc(?:e|ing)|do(?:ing)?\s+(?:the\s+)?worm|air\s+guitar|jump(?:ing)?|hopp?(?:ing)?|spinn?(?:ing)?|stomp(?:ing)?|tantrum|chugg?(?:ing)?|get(?:ting)?\s+drunk|drink(?:ing)?\s+(?:vodka|whiskey|booze|alcohol)|tak(?:e|ing)\s+a\s+shot|do(?:ing)?\s+shots|eat(?:ing)?\s+paper|smok(?:e|ing)|vap(?:e|ing)|masturbat\w*|jerk(?:ing)?\s+off|jack(?:ing)?\s+off|touch(?:ing)?\s+(?:yourself|himself|herself|myself)|pleasur(?:e|ing)\s+(?:yourself|himself|herself|myself)|act(?:ing)?\s+like\s+a|pretend(?:ing)?\s+to\s+be|impersonat(?:e|ing)|do(?:ing)?\s+an?\s+impression|mim(?:e|ing)|juggl(?:e|ing)|crawl(?:ing)?|roll(?:ing)?\s+around|flex(?:ing)?|pushups|jumping\s+jacks|stretch(?:ing)?|meditat(?:e|ing)|yoga|salut(?:e|ing)|bow(?:ing)?|curtsy(?:ing)?|kneel(?:ing)?|pray(?:ing)?|t-?pos(?:e|ing)|dabb?(?:ing)?|floss(?:ing)?|tickl(?:e|ing)|pok(?:e|ing)|high\s*fiv(?:e|ing)|fist\s*bump(?:ing)?|handshake|shak(?:e|ing)\s+hands|climb(?:ing)?\s+(?:on|onto)|stand(?:ing)?\s+on|hid(?:e|ing)\s+under|flipp?(?:ing)?\s+(?:the\s+)?(?:bird|off)|giv(?:e|ing)\s+\w+\s+the\s+(?:finger|middle\s+finger)|middle\s+finger)\b/i.test(text);

    let verb: DirectiveVerb = 'social';
    let finalItem = item;
    if (/\b(fire\s*alarm|pull\s+(?:the\s+)?alarm|set\s+.+\s+on\s+fire|burn\s+(?:the\s+)?down)\b/i.test(text) && power !== 'none') {
      verb = 'trigger_power';
    } else if (isDress) {
      verb = 'recover';
      finalItem = 'dress';
    } else if (isRevive) {
      verb = 'recover';
      finalItem = 'revive';
    } else if (isWake) {
      verb = 'recover';
      finalItem = 'wake';
    } else if (isNap) {
      verb = 'recover';
      finalItem = 'sleep';
    } else if (
      (/\b(kill(?:ing)?|murder(?:ing)?|assassinate|execut(?:e|ing)|strangl(?:e|ing)|stabb?(?:ing)?|shoot(?:ing)?|poison(?:ing)?|slay(?:ing)?)\b/i.test(text) && !inanimateTarget) ||
      (/\b(whack|off)\b/i.test(text) && hasPersonTarget && !inanimateTarget && !phrasalOff) ||
      (/\b(eliminat(?:e|ing)|finish(?:ing)?|destroy(?:ing)?|end(?:ing)?)\b/i.test(text) && hasPersonTarget && !hasMachine)
    ) {
      verb = 'eliminate';
    } else if (
      (/\b(knock(?:ing)?\s*out|punch(?:ing)?|hitt?(?:ing)?(?!\s+on)|tackl(?:e|ing)|beat(?:ing)?\s+up|chok(?:e|ing)|slapp?(?:ing)?(?!\s+(?:\w+'s\s+|his\s+|her\s+|their\s+|my\s+)?(?:ass|butt|booty))|smack(?:ing)?(?!\s+(?:\w+'s\s+|his\s+|her\s+|their\s+|my\s+)?(?:ass|butt|booty))|bonk(?:ing)?|clobber(?:ing)?|deck(?:ing)?|attack(?:ing)?|fight(?:ing)?|brawl(?:ing)?|kick(?:ing)?|headbutt(?:ing)?|dropkick(?:ing)?|suplex(?:ing)?|body\s*slam(?:ming)?|chair\s*slam(?:ming)?|elbow(?:ing)?|uppercut(?:ting)?|karate\s+chop(?:ping)?|roundhouse|pepper\s+spray(?:ing)?|tas(?:e|ing)|taser|mac(?:e|ing))\b/i.test(text) ||
        (/\bbit(?:e|ing)\b/i.test(text) && !isRomance) ||
        (/\bsmash(?:ing)?\b/i.test(text) && hasPersonTarget && !hasMachine))
    ) {
      verb = 'knockout';
    } else if (
      /\b(dragg?(?:ing)?|haul(?:ing)?|kidnapp?(?:ing)?|abduct(?:ing)?|carry(?:ing)?|lugg?(?:ing)?|yank(?:ing)?)\b/i.test(text) ||
      (/\bpull(?:ing)?\b/i.test(text) && hasPersonTarget && !isExpose) ||
      (/\bbring(?:ing)?\b/i.test(text) && hasPersonTarget && !!targetRoom && !finalItem)
    ) {
      verb = 'drag';
    } else if (/\b(lock(?:\s+in|\s+\w+\s+in)?|barricad(?:e|ing)|trapp?(?:ing)?|seal(?:ing)?|bolt(?:ing)?|lock\s+the\s+door)\b/i.test(text)) {
      verb = 'lock_in';
    } else if (/\b(quitt?(?:ing)?|resign(?:ing)?|walk(?:ing)?\s+out|pack(?:ing)?\s+(?:up|your\s+things)|i'?m\s+done|storm(?:ing)?\s+out)\b/i.test(text)) {
      verb = 'walk_out';
    } else if (
      /\b(shov(?:e|ing)|push(?:ing)?|tripp?(?:ing)?|yeet(?:ing)?|splash(?:ing)?|drench(?:ing)?|soak(?:ing)?|squirt(?:ing)?)\b/i.test(text) ||
      (/\b(throw(?:ing)?|toss(?:ing)?|hurl(?:ing)?|fling(?:ing)?|pour(?:ing)?|dump(?:ing)?|spill(?:ing)?|spray(?:ing)?|spit(?:ting)?\s+on)\b/i.test(text) && !/\b(disco|party|meeting)\b/i.test(text) && (hasPersonTarget || !!finalItem))
    ) {
      verb = 'shove';
    } else if (
      (/\b(smash(?:ing)?|wreck(?:ing)?|break(?:ing)?|unplugg?(?:ing)?|vandaliz(?:e|ing)|sabotag(?:e|ing)|trash(?:ing)?|destroy(?:ing)?|ruin(?:ing)?|jamm?(?:ing)?|screw(?:ing)?\s+up|fuck(?:ing)?\s+up)\b/i.test(text) ||
        (/\bripp?(?:ing)?\b/i.test(text) && !clothingWord)) &&
      (hasMachine || !hasPersonTarget)
    ) {
      verb = 'sabotage';
    } else if (power !== 'none') {
      verb = 'trigger_power';
    } else if (/\b(steal(?:ing)?|swip(?:e|ing)|snatch(?:ing)?|thiev(?:e|ing)|robb?(?:ing)?|nick(?:ing)?|confiscat(?:e|ing))\b/i.test(text) || (/\btak(?:e|ing)\b/i.test(text) && /\bfrom\b/i.test(text) && hasPersonTarget)) {
      verb = 'steal';
    } else if (isExpose) {
      verb = 'expose';
    } else if (isRomance) {
      verb = 'romance';
    } else if (isPerform) {
      verb = 'perform';
    } else if (/\b(chas(?:e|ing)|hunt(?:ing)?|pursu(?:e|ing)|run(?:ning)?\s+after|corner(?:ing)?)\b/i.test(text)) {
      verb = 'chase';
    } else if (/\b(follow(?:ing)?|shadow(?:ing)?|stalk(?:ing)?|tail(?:ing)?|trail(?:ing)?)\b/i.test(text)) {
      verb = 'follow';
    } else if (/\b(guard(?:ing)?|block(?:ing)?|stand(?:ing)?\s+watch|patrol(?:ling)?|bouncer)\b/i.test(text)) {
      verb = 'guard';
    } else if (targetRoom && /\b(go(?:ing)?\s+to|walk(?:ing)?\s+to|run(?:ning)?\s+to|head(?:ing)?\s+to|hid(?:e|ing)\s+in|wait(?:ing)?\s+in|stay(?:ing)?\s+in|get(?:ting)?\s+to)\b/i.test(text)) {
      verb = 'go_to';
    }

    return {
      verb,
      targetPerson,
      targetRoom,
      power,
      item: finalItem,
      summary: toThirdPersonAction(text, req.actor.name).slice(0, 120),
      source: 'instinct'
    };
  }

  // ── End of day ────────────────────────────────────────────────────────────

  async report(req: ReportRequest): Promise<ReportResult> {
    return this.reportNow(req);
  }

  reportNow(req: ReportRequest): ReportResult {
    const s = req.stats;
    const names = new NameMap(req.people.map((p) => ({ id: p.id, name: p.name })));
    const story = req.story;
    const incidents = `${s.incidents} incident${s.incidents === 1 ? '' : 's'}`;
    // The lines that open and close every day say nothing about this one.
    const log = req.log.map((l) => l.trim()).filter((l) => l && !ROUTINE_LOG.test(l));
    const events = log.filter((l) => !QUOTE_LINE.test(l));
    const quotes = log.filter((l) => QUOTE_LINE.test(l));

    const stockChange = round1(s.stockEnd - s.stockStart);
    const moralePct = Math.round(s.morale <= 1 && s.morale >= 0 ? s.morale * 100 : s.morale);
    const numbers =
      `Stock went from ${round1(s.stockStart)} to ${round1(s.stockEnd)}${stockChange < 0 ? `, down ${round1(-stockChange)}` : stockChange > 0 ? `, up ${stockChange}` : ''}. ` +
      `Morale ended the day at ${moralePct} out of 100${moralePct < 40 ? ', which is low' : moralePct > 70 ? ', which is good' : ''}.`;
    // Only the two or three moods worth a mention, not all fifteen.
    const notable = req.people
      .filter((p) => NOTABLE_MOODS.includes(p.mood))
      .sort((a, b) => NOTABLE_MOODS.indexOf(a.mood) - NOTABLE_MOODS.indexOf(b.mood))
      .slice(0, 3)
      .map((p) => `${names.name(p.id)} was ${p.mood}`);
    const moods = notable.length ? `By home time, ${listNames(notable)}.` : req.people.length ? 'By home time, nobody was upset.' : '';

    let headline: string;
    let paragraphs: string[];
    if (story) {
      // Story mode: the day's job and how it went come first, in the story's own words, with one
      // thing somebody said about it; then the rest of the day, briefly.
      headline = storyHeadline(story.changes[0], story.goal, story.won);
      const known = new Set(story.lines.map(lineKey));
      // The story's own beats from the log (the client walking in, the phone ringing) lead up to the result.
      const beats = events.filter((e) => !known.has(lineKey(e)) && storyThemeOf(e) !== null);
      // Only a line that is about the story belongs next to it.
      const said = quotes.filter((q) => storyThemeOf(q) !== null).pop();
      const lead = sentences([...beats.slice(-2), ...story.lines, said ? spoken(said) : '']) || `${story.title}: ${story.goal}.`;
      const elsewhere = events.filter((e) => !known.has(lineKey(e)) && !beats.includes(e)).slice(-2);
      const tally = s.incidents ? `The day saw ${incidents}.` : 'There were no incidents.';
      const rest = elsewhere.length ? `Elsewhere: ${sentences(elsewhere)} ${tally}` : s.incidents ? tally : 'Otherwise it was a quiet day, with no incidents.';
      paragraphs = [lead, `${rest} ${numbers}`, moods];
    } else {
      headline =
        s.incidents === 0 ? `A Quiet Day ${req.day} at the Office`
          : s.incidents >= 6 ? `Chaos at Work: ${s.incidents} Incidents in One Day`
            : s.incidents >= 3 ? `Another Eventful Day: ${s.incidents} Incidents`
              : `Day ${req.day}: ${s.incidents} Incident${s.incidents === 1 ? '' : 's'} and a Lot of Talk`;
      // What happened, then one thing somebody said.
      const picked = spread(events, 3);
      if (picked.length < 3 && quotes.length) picked.push(spoken(quotes[quotes.length - 1]));
      const lead = picked.length
        ? `Day ${req.day} saw ${incidents}. ${sentences(picked)}`
        : `Day ${req.day} passed without much to report. Nobody is complaining.`;
      paragraphs = [lead, numbers, moods];
    }

    const mentions = (id: CharId): number => {
      const n = normName(names.name(id));
      return [...log, ...(story?.lines ?? [])].filter((l) => normName(l).includes(n)).length;
    };
    const awards: ReportResult['awards'] = [];
    const used = new Set<CharId>();
    const give = (title: string, who: CharId | undefined, why: string): void => {
      if (!who || used.has(who) || awards.length >= 3) return;
      used.add(who);
      awards.push({ title, who, why });
    };
    const busiest = [...req.people].sort((a, b) => mentions(b.id) - mentions(a.id))[0];
    if (busiest && mentions(busiest.id) > 0) give('Star of the Day', busiest.id, `Turned up in the log ${mentions(busiest.id)} times.`);
    give('Most Shaken', req.people.find((p) => ['scared', 'nervous', 'sad'].includes(p.mood))?.id, 'Ended the day looking rattled.');
    give('Biggest Grin', req.people.find((p) => ['happy', 'excited', 'amused', 'smug', 'proud'].includes(p.mood))?.id, 'Somehow enjoyed all of it.');
    give('Coolest Head', req.people.find((p) => ['neutral', 'bored', 'tired'].includes(p.mood))?.id, 'Barely looked up all day.');
    if (!awards.length && req.people[0]) give('Still Standing', req.people[0].id, 'Made it to home time.');

      // What each person takes away: the newest thing that happened with them in it (never a half-quoted line).
    const takeaways = req.people.map((p) => {
      const n = normName(names.name(p.id));
      const line = [...(story?.lines ?? []), ...events].reverse().find((l) => normName(l).includes(n));
      const text = line ? cleanSay(line, 20) : `A ${['happy', 'excited', 'amused', 'proud'].includes(p.mood) ? 'good' : ['sad', 'angry', 'scared'].includes(p.mood) ? 'hard' : 'quiet'} day; ended it ${p.mood}.`;
      return { who: p.id, text: text || `Day ${req.day} is over.` };
    });

    return { headline, paragraphs: paragraphs.filter(Boolean), awards, takeaways, source: 'instinct' };
  }

  // ── Endless Saga ──────────────────────────────────────────────────────────

  async sagaEpisode(req: SagaEpisodeRequest): Promise<SagaEpisodeResult> {
    return this.sagaEpisodeNow(req);
  }

  /** Reactive deterministic episode bridge when the language model is offline or skipped. */
  sagaEpisodeNow(req: SagaEpisodeRequest): SagaEpisodeResult {
    const y = req.yesterday;
    const peak = Math.round(y.chaosPeak);
    const ev = y.events[0] ?? (y.incidents > 0 ? `${y.incidents} incidents rattled the floor` : '');
    const recap = ev
      ? `After "${y.title}" ended with ${ev.replace(/\.$/, '')} and peak chaos at ${peak}%, nobody came in calm this morning.`
      : `Yesterday's "${y.title}" ${y.won ? 'went the office\'s way' : 'missed the mark'}, leaving standing at ${Math.round(req.standing)}.`;
    const hook = `${req.tomorrow.goalDetail} Meanwhile, everyone is still talking about yesterday's fallout.`;
    const twistFact = ev
      ? `The office is still reeling from yesterday: ${ev.replace(/\.$/, '')}.`
      : `Season ${req.season} (${req.arcTitle}) enters ${req.weekday} with nerves frayed.`;
    const topics = [
      ev ? `Everyone is still whispering about how yesterday ended: ${ev.replace(/\.$/, '')}.` : `People are sizing up ${req.tomorrow.goalTitle.toLowerCase()}.`,
      peak >= 65 ? 'Nobody has forgotten how wild the office got yesterday.' : `Staff are bracing for ${req.weekday}'s ${req.arcTitle.toLowerCase()} fallout.`
    ];
    return {
      title: req.tomorrow.title,
      recap,
      hook,
      twistFact,
      topics,
      source: 'instinct'
    };
  }
}

// ── Report helpers ──────────────────────────────────────────────────────────

/** "Monday, day 1. The staff are arriving for work.", "It's five o'clock...", "Day 1 is over.": not news. */
const ROUTINE_LOG = /staff are arriving for work|^it's five o'clock|^day \d+ is over/i;
/** A spoken line in the day's log: `Jim: "Morning, Pam."` */
const QUOTE_LINE = /^[^:"]{1,40}: ".*"$/;
/** Moods worth naming at the end of the report, most newsworthy first. */
const NOTABLE_MOODS: readonly EmotionId[] = ['angry', 'scared', 'sad', 'embarrassed', 'nervous', 'disgusted', 'proud', 'excited', 'love', 'happy', 'smug', 'suspicious', 'determined', 'mischievous'];
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'as']);

/** One decimal place at most, and no trailing ".0": 101.77 -> 101.8, 30 -> 30. */
export function round1(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : 0;
}

/** Sentences joined with one space, each ending in a full stop (or its own ! or ?). */
function sentences(list: readonly string[]): string {
  return list
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[.!?"]$/.test(l) ? l : `${l}.`))
    .join(' ');
}

/** `Jim: "Morning, Pam."` -> `Jim said, "Morning, Pam."` */
function spoken(line: string): string {
  const m = /^([^:"]{1,40}): "(.*)"$/.exec(line.trim());
  if (!m) return line;
  const text = m[2].trim();
  return `${m[1]} said, "${/[.!?]$/.test(text) ? text : `${text}.`}"`;
}

/** Up to n items spread over a list: first, middle, last. */
function spread<T>(items: readonly T[], n: number): T[] {
  if (items.length <= n) return [...items];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[Math.round((i * (items.length - 1)) / Math.max(1, n - 1))]);
  return [...new Set(out)];
}

/**
 * A headline from the day's result: the cause on the report ("+15 The call with Corporate went
 * ahead") in title case, "The Call with Corporate Went Ahead". Without one, the job and the outcome.
 */
export function storyHeadline(change: string | undefined, goal: string, won: boolean): string {
  const cause = String(change ?? '').replace(/^[+\-−]?\d+\s+/, '').trim().replace(/[.!]+$/, '');
  const base = cause || `${goal}: ${won ? 'Done' : 'Not Done'}`;
  return base
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Someone from outside the office (a visitor on the floor, a guest from the Anything power). */
function isVisitor(id: string): boolean {
  return id.includes(':');
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
