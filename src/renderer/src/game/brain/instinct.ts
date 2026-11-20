// The no-model brain. Assembles believable short exchanges from the
// hand-written bank (openers, replies, event reactions, barks), with simple
// rules for feelings, gestures, summaries and plans. Instant, always available,
// and the fallback for every LlmBrain request that fails.

import type { VoiceBank } from '@/game/core/content/types';
import { CHAOS_IDS, PLAN_KINDS } from '@/game/core/types';
import type { ChaosId, CharId, EmotionId, LineAct, Plan, PlanKind, RelationShift, TargetRoomId } from '@/game/core/types';
import type {
  BarkKind, Brain, BrainStatus, CustomVibe, InterpretRequest, InterpretResult, MindResult, MindsRequest, PersonBrief,
  Reflexes, ReportRequest, ReportResult, SceneCallbacks, SceneLine, SceneRequest, SceneResult
} from './api';
import { cleanSay, lineKey, SOCIAL_PLANS } from './clean';
import {
  ACT_FOR_FEEL, CHAOS_NOUN, DISASTERS, EVERYWHERE_RE, FIX_FOR, INTENSE_RE, MILD_RE, STATE_BARKS, THING_RULES, TREATS,
  VIBE_FEEL, chaosFeel, detectChaos
} from './instinctRules';
import type { ThingRule } from './instinctRules';
import { NameMap, normName } from './names';
import { capitalise, listNames, pick, shuffle } from './util';
import type { Rng } from './util';
import { WorldIndex } from './world';
import type { BrainWorld } from './world';

/** The bank, keyed by person id. Anyone missing uses the generic voice. */
export type LooseBank = Record<string, Partial<VoiceBank> | undefined>;

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

function firstThought(why: string): string {
  const quoted = /["“']([^"”']{4,})["”']/.exec(why);
  if (quoted) return quoted[1].trim();
  const colon = why.indexOf(':');
  return (colon >= 0 ? why.slice(colon + 1) : why).trim();
}

function fill(template: string, vars: { other?: string; thought?: string; thing?: string }): string {
  const out = template
    .replace(/\{other\}/g, vars.other ?? 'everyone')
    .replace(/\{thought\}/g, (vars.thought ?? 'something is up').replace(/[.!?]+$/, ''))
    .replace(/\{thing\}/g, vars.thing ?? 'thing')
    .replace(/\{name\}/g, vars.other ?? 'everyone')
    .replace(/\{[a-z]+\}/gi, '');
  // "everyone, listen" at the start of a line needs its capital.
  return out.charAt(0).toUpperCase() + out.slice(1);
}

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

  private list(who: string, sel: (v: Partial<VoiceBank>) => string[] | undefined): string[] {
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
    // What set the scene off decides which event it is about. The list of facts also holds
    // older events, so only the newest one (after the line giving the time) is a fallback:
    // otherwise people would shout about an earthquake that ended half an hour ago.
    const chaos = req.trigger === 'event' || req.trigger === 'aftermath' ? detectChaos(req.why) ?? detectChaos(req.facts[1] ?? '') : null;
    const thing = req.trigger === 'custom' ? matchThing(req.why) : null;
    const thingNoun = thing?.noun ?? guessNoun(req.why);
    const vibe: CustomVibe = thing?.vibe ?? 'weird';
    const seen = new Set(req.recent.map((r) => lineKey(r.say)));
    const lines: SceneLine[] = [];

    const reactsFirst = req.trigger === 'event' || req.trigger === 'custom' || req.trigger === 'announce';
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

      if (ppl.length === 1 && k > 0) {
        raw = this.draw(sp.id, 'bark', this.list(sp.id, (v) => v.barks?.[moodBark(sp.mood)]));
      } else if (k === 0 || (reactsFirst && k < ppl.length)) {
        to = ppl.length > 2 ? 'all' : listener?.id ?? null;
        switch (req.trigger) {
          case 'event': {
            if (chaos) {
              raw = this.draw(sp.id, `chaos:${chaos}`, this.list(sp.id, (v) => v.chaos?.[chaos]));
              feel = chaosFeel(chaos, this.index.nerve(sp.id));
            } else {
              const t = matchThing(text);
              raw = fill(this.draw(sp.id, `custom:${t?.vibe ?? 'weird'}`, this.list(sp.id, (v) => v.custom?.[t?.vibe ?? 'weird'])), { thing: t?.noun ?? 'that' });
              feel = VIBE_FEEL[t?.vibe ?? 'weird'];
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
            raw = fill(this.draw(sp.id, 'whispered', this.list(sp.id, (v) => v.whispered)), { thought: firstThought(req.why), other: listener ? names.name(listener.id) : undefined });
            feel = pick(['determined', 'suspicious', 'surprised'] as const, rng);
            act = 'none';
            break;
          case 'aftermath':
            raw = this.draw(sp.id, 'bark', this.list(sp.id, (v) => v.barks?.[moodBark(sp.mood)]));
            break;
          default:
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
      summary: this.summarise(req, lines, names, chaos, thingNoun),
      shifts: this.shiftsFor(req, lines),
      plans: this.plansFor(req, chaos),
      source: 'instinct'
    };
  }

  /** One plain sentence for what happened. Used for model replies with no summary too. */
  summarise(req: SceneRequest, lines: SceneLine[], names: NameMap, chaos: ChaosId | null = null, thing?: string): string {
    const speakers = [...new Set(lines.map((l) => l.who))];
    const ids = speakers.length ? speakers : req.people.map((p) => p.id);
    const who = listNames(ids.map((id) => names.name(id)));
    const a = names.name(ids[0] ?? '');
    const b = ids[1] ? names.name(ids[1]) : null;
    const place = req.place;
    const cold = lines.some((l) => ['angry', 'suspicious', 'disgusted'].includes(l.feel));
    const warm = lines.every((l) => ['happy', 'amused', 'excited', 'love', 'proud'].includes(l.feel));
    const scared = lines.filter((l) => l.feel === 'scared').length > lines.length / 2;
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
        if (!b) return `${a} talked to themselves in ${place}.`;
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
    if (chaos && rng() < 0.6) {
      thought = this.chaosBark(p.id, chaos);
      feel = chaosFeel(chaos, this.index.nerve(p.id));
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
    const goalRules: [RegExp, PlanKind][] = [
      [/confront|have it out|tell .* off|complain/, 'confront'], [/flirt|fancy|crush|ask .* out/, 'flirt'], [/gossip|tell .* about|news/, 'gossip'],
      [/prank|wind .* up|trick/, 'prank'], [/comfort|cheer .* up|check on/, 'comfort'], [/coffee|tea\b/, 'coffee'], [/snack|food|eat|lunch|biscuit/, 'snack'],
      [/nap|sleep|rest/, 'nap'], [/hide|avoid/, 'hide'], [/fix|put out|mend|reset|repair|mop/, 'fix'], [/flee|get away|escape|leave/, 'flee'],
      [/snoop|search|look through/, 'snoop'], [/talk|chat|see|ask/, 'talk'], [/work|desk|report|finish|email/, 'work']
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
    for (const kind of shuffle(byMood[p.mood] ?? [], this.rng)) {
      const plan = tryPlan(kind, `feeling ${p.mood}`);
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
    const headline =
      s.incidents === 0 ? `A Quiet Day ${req.day} at the Office`
        : s.incidents >= 6 ? `Chaos at Work: ${s.incidents} Incidents in One Day`
          : s.incidents >= 3 ? `Another Eventful Day: ${s.incidents} Incidents`
            : `Day ${req.day}: ${s.incidents} Incident${s.incidents === 1 ? '' : 's'} and a Lot of Talk`;
    const log = req.log.map((l) => l.trim()).filter(Boolean);
    const highlights = log.length <= 3 ? log : [log[0], log[Math.floor(log.length / 2)], log[log.length - 1]];
    const p1 = log.length
      ? `Day ${req.day} saw ${s.incidents} incident${s.incidents === 1 ? '' : 's'}. ${highlights.map((h) => (/[.!?]$/.test(h) ? h : `${h}.`)).join(' ')}`
      : `Day ${req.day} passed without much to report. Nobody is complaining.`;
    const stockChange = s.stockEnd - s.stockStart;
    const moralePct = Math.round(s.morale <= 1 && s.morale >= 0 ? s.morale * 100 : s.morale);
    const p2 =
      `Stock went from ${s.stockStart} to ${s.stockEnd}${stockChange < 0 ? `, down ${-stockChange}` : stockChange > 0 ? `, up ${stockChange}` : ''}. ` +
      `Morale ended the day at ${moralePct} out of 100${moralePct < 40 ? ', which is low' : moralePct > 70 ? ', which is good' : ''}.`;
    const moods = req.people.map((p) => `${names.name(p.id)} was ${p.mood}`);
    const p3 = moods.length ? `By home time, ${listNames(moods)}.` : '';

    const mentions = (id: CharId): number => {
      const n = normName(names.name(id));
      return log.filter((l) => normName(l).includes(n)).length;
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

    const takeaways = req.people.map((p) => {
      const n = normName(names.name(p.id));
      const line = [...log].reverse().find((l) => normName(l).includes(n));
      const text = line ? cleanSay(line, 20) : `A ${['happy', 'excited', 'amused', 'proud'].includes(p.mood) ? 'good' : ['sad', 'angry', 'scared'].includes(p.mood) ? 'hard' : 'quiet'} day; ended it ${p.mood}.`;
      return { who: p.id, text: text || `Day ${req.day} is over.` };
    });

    return { headline, paragraphs: [p1, p2, p3].filter(Boolean), awards, takeaways, source: 'instinct' };
  }
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
