// The no-model brain. Assembles believable short exchanges from the
// hand-written bank (openers, replies, event reactions, barks), with simple
// rules for feelings, gestures, summaries and plans. Instant, always available,
// and the fallback for every LlmBrain request that fails.

import type { LooseVoiceBank, VoiceBank } from '@/game/core/content/types';
import { CHAOS_IDS, PLAN_KINDS } from '@/game/core/types';
import type { ChaosId, CharId, EmotionId, LineAct, Plan, PlanKind, RelationShift, TargetRoomId } from '@/game/core/types';
import type {
  BarkKind, Brain, BrainStatus, CustomVibe, InterpretRequest, InterpretResult, MindResult, MindsRequest, PersonBrief,
  Reflexes, ReportRequest, ReportResult, SceneCallbacks, SceneLine, SceneRequest, SceneResult, StoryTheme
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
      const said = quotes.filter((q) => storyThemeOf(q) !== null).pop() ?? quotes[quotes.length - 1];
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
