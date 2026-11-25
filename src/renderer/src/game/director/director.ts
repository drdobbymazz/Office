// The director: decides WHEN the language model is asked for something, and
// plays what it writes out on the floor.
//
// The model is slow (about 7 tokens a second on the owner's laptop), so there
// is exactly one conversation with it at a time and nothing is wasted:
//   - a SCENE is a few lines between people who are together. It streams: the
//     first line is spoken while the rest is still being written.
//   - a MINDS round asks, for a few people who are on their own, what each is
//     thinking and what they will do next. That is where plans come from.
//   - INTERPRET turns something the player typed into something stageable.
//   - REPORT writes up the day.
// The sim keeps the office moving by itself in between. The director only
// ever asks the sim to do things through its public surface.

import type { Brain, DelegateTone, DirectiveRequest, DirectiveResult, InterpretResult, MindResult, PersonBrief, ReportResult, SceneDelegation, SceneLine, SceneRequest, SceneResult, SceneTrigger, StageAction, StoryReportInfo, StoryTheme } from '@/game/brain/api';
import { saysNo } from '@/game/brain/clean';
import { isNegatedDirective, isStopCommand, normalizeDelegatedCommand, splitCompoundDirective } from '@/game/brain/instinct';
import { detectChaos, storyThemeOf } from '@/game/brain/instinctRules';
import type { ScriptLine } from '@/game/story/types';
import { CAST } from '@/game/core/cast';
import type { DirectorSimApi, SceneAsk, SceneHandle, SimApi, SimPerson } from '@/game/core/simApi';
import type { CharId, LineAct, Plan, RoomId, ShiftKind, Speech, TargetRoomId } from '@/game/core/types';
import { PLAN_KINDS, TARGET_ROOMS, formatClock, isCastId } from '@/game/core/types';
import { TILE, getWorldLocation, room as roomDef } from '@/game/core/world';
import { Guests } from './guests';
import { Directives } from './directives';
import { convictionLever, invitesPeople, keepsAway, mentionsFood, roomNamedIn, speaksToEveryone, stayedLine, summonChance, summonLine, withoutRooms } from './summon';

export interface DirectorOptions {
  sim: DirectorSimApi;
  /** The configured brain (a model, or instinct). */
  brain: Brain;
  /** The no-model brain, used when the model may not be called on a timer. */
  instinct: Brain;
  /** 0.5 relaxed .. 2 frantic: scales the pauses between ambient scenes. */
  pace?: () => number;
  /** Measured output speed of the model in tokens a second (0 = not known yet). */
  speed?: () => number;
  /** Called whenever the director starts or stops waiting on the model. */
  onBusy?: (state: { thinking: boolean; queued: number; source: 'model' | 'instinct' | null }) => void;
  /** People something else (a story chapter) is holding where they are: announcements do not move them. */
  pinned?: (who: CharId) => boolean;
  /** Story mode: how long (sim seconds) people summoned to a room wait there today; undefined for the usual. */
  summonStay?: (room: RoomId) => number | undefined;
  /** Story mode: typed orders and whispers are read carefully (the model may not escalate mild words). */
  carefulOrders?: () => boolean;
  /**
   * Story mode: today's chapter stages this whisper or order itself (Episode 3: told to take the tape,
   * they fetch it from whoever has it). The thought still shows and sticks, but nothing else is staged
   * from the sentence: the model is not asked, and there is no theft and no scene.
   */
  ownsOrder?: (who: CharId, text: string, kind: 'whisper' | 'cue') => boolean;
  /** Story mode: what the office is talking about right now (plain sentences). Small talk may pick from these. */
  storyTopics?: () => string[];
  /** Story mode: today's chapter may replace a scene's change in feeling (return the delta to apply). */
  vetoShift?: (who: CharId, about: CharId, delta: number) => number;
}

/** Options for a hand-written story scene (see ChapterCtx.script). */
export interface ScriptOptions {
  room?: RoomId;
  /** 'model': once the lines are spoken, let the model carry the scene on. */
  then?: 'model' | 'none';
  /** One plain sentence on what the scene is about, for the model's carry-on. */
  why?: string;
  done?: () => void;
}

interface Pending {
  ask: SceneAsk;
  at: number;
  /** A player action: the model may always be called for it. */
  fromPlayer: boolean;
}

/** A hand-written story scene, waiting or being played. */
interface ScriptRun {
  lines: ScriptLine[];
  /** What has been said so far, "Name: "line"", for the model's carry-on. */
  said: string[];
  /** Structured version of the same lines, for the carry-on request. */
  recent: { who: string; say: string }[];
  /** Who has spoken (in order), for the carry-on. */
  people: CharId[];
  /** What voices with no body (the vice president on the phone) said: not in anyone's "said just before". */
  phone: string[];
  opts: ScriptOptions;
  nextAt: number;
  started: boolean;
  startedAt: number;
  /** The speakers held together, facing each other, while it plays (null: they were busy, or apart). */
  handle: SceneHandle | null;
}

interface Running {
  ask: SceneAsk;
  handle: SceneHandle;
  people: CharId[];
  room: RoomId;
  abort: AbortController;
  /** Lines received from the model and not yet spoken. */
  buffer: SceneLine[];
  spoken: number;
  result: SceneResult | null;
  failed: boolean;
  /** Sim time when the next line may start. */
  nextAt: number;
  startedAt: number;
  /** Sim time since the last line ended with nothing new to say (for the "thinking" dots). */
  waitedSince: number;
  dotted: boolean;
  fromPlayer: boolean;
  /** The model has written its last line and is now on the summary. */
  linesDone: boolean;
  /** Sim time the people were let go while the summary was still coming (0 = not yet). */
  releasedAt: number;
  /** Story mode: the story theme this scene is about. */
  topic?: StoryTheme;
}

const SHIFT_DELTA: Record<ShiftKind, number> = {
  likes_more: 12, likes_less: -12, trusts_more: 8, trusts_less: -10, admires: 14, resents: -15, fancies: 16, fears: -8
};

/** Seconds people answering an announcement wait where they were sent. */
const SUMMON_STAY = 100;

/** Story mode: the share of small talk and chance meetings that are about the story while it has topics. */
const STORY_SHARE = 0.35;
/** A story beat even when the sentence also names an office event ("the inspector", "a farewell"). */
const STORY_BEAT = /\bfarewell\b|\bspeakerphone\b|\bvice president\b|\bfiggis\b|\bemailing corporate\b|\bnot speaking\b|\bmade up\b/i;

let seq = 0;
const nextId = (p: string): string => `${p}-${(seq += 1).toString(36)}`;

export class Director {
  private sim: DirectorSimApi;
  private api: SimApi;
  private brain: Brain;
  private instinct: Brain;
  private opts: DirectorOptions;
  private queue: Pending[] = [];
  private running: Running | null = null;
  /** How many non-scene requests (minds / interpret / report) are in flight. */
  private sideN = 0;
  /** Lets a round of private thoughts be dropped the moment the player does something. */
  private mindsAbort: AbortController | null = null;
  private ambientAt = 6;
  private mindsAt = 40;
  private musingAt = 9;
  /** Conversations finished since the last round of thoughts. */
  private scenesSinceMinds = 0;
  /** Sim time of the next look for people who could be chatting. */
  private idleAt = 0;
  private lastTopic = '';
  /** Sim time each pair last finished talking, so the same two do not hog the floor. */
  private pairAt = new Map<string, number>();
  /** Facts already seen, and the newest one while it is still news (a fact, or a new story topic). */
  private knownFacts = new Set<string>();
  private breaking: { fact: string; at: number; scenes: number; topic?: boolean } | null = null;
  /** Story mode: topic sentences seen today (a new one mid-day is news), and when each was last talked about. */
  private seenTopics = new Set<string>();
  private topicUsedAt = new Map<string, number>();
  /** The story theme of a scene asked for here (small talk about the story, a chance meeting given a topic). */
  private askTopic = new WeakMap<SceneAsk, StoryTheme>();
  /** Lines spoken in the story's scenes today ("who|text"), so the report can quote them first. */
  private storySaid = new Set<string>();
  private factsAt = 0;
  /** People holding a whispered idea: when they next act on it, and how often they have. */
  private drives = new Map<CharId, { nextAt: number; acts: number; directive?: DirectiveResult }>();
  private lastSpoke = new Map<CharId, number>();
  private lastMinded = new Map<CharId, number>();
  private lastAutoRendezvousAt = -999;
  private lastAutoWildAt = -999;
  private lastModelActionAt = -999;
  private lastModelRumorAt = -999;
  private lastModelActivityAt = -999;
  private dayHeadlines: string[] = [];
  private lastSpokenByPerson = new Map<CharId, { who: string; say: string; at: number }>();
  /** Free-text events currently on the floor, to be cleared when their time is up. */
  /** What the Anything power put on the floor: guests, creatures, things (director/guests.ts). */
  private guests: Guests;
  private directives: Directives;
  private disposed = false;
  /** Hand-written story scenes, played in order. While one plays no other scene starts. */
  private scripts: ScriptRun[] = [];

  constructor(opts: DirectorOptions) {
    this.opts = opts;
    this.sim = opts.sim;
    this.api = opts.sim;
    this.brain = opts.brain;
    this.instinct = opts.instinct;
    this.guests = new Guests({ sim: opts.sim, scene: (ask, fromPlayer) => this.enqueue(ask, fromPlayer), slow: () => this.slow });
    this.directives = new Directives({
      sim: opts.sim,
      scene: (ask, fromPlayer) => this.enqueue(ask, fromPlayer),
      onChainNext: (actor, nextText, kind, allowDelegate) => {
        if (this.disposed) return;
        const cur = this.api.person(actor);
        if (!cur || !cur.present) return;
        this.dispatchDirective(actor, nextText, kind, this.buildDirectiveFallback(actor, nextText, kind), allowDelegate, 0);
      }
    });
  }

  setBrain(brain: Brain): void {
    this.brain = brain;
  }

  dispose(): void {
    this.disposed = true;
    this.closeScript();
    this.scripts = [];
    this.stopScene(false);
    this.queue.length = 0;
    this.guests.clear();
    this.directives.clear();
  }

  /**
   * A fresh day: drop anything left over from yesterday. Story scenes asked for while the office was
   * being set up (before nine) are today's and are kept; any later ones (the rest of the day is being
   * skipped) end now, and whoever asked for them is told they are done.
   */
  reset(): void {
    // Before nine a new day is being set up; later, the rest of today is being skipped.
    const newDay = this.api.clock < 9 * 60;
    if (!newDay) this.flushScripts();
    else {
      this.topicUsedAt.clear();
      this.storySaid.clear();
    }
    this.stopScene(false);
    this.queue.length = 0;
    this.guests.clear();
    this.directives.clear();
    this.ambientAt = this.api.time + 8;
    this.mindsAt = this.api.time + (this.slow ? 45 : 22);
    this.musingAt = this.api.time + 10;
    this.scenesSinceMinds = 0;
    this.pairAt.clear();
    this.knownFacts.clear();
    // What is already true when the day starts is the background, not breaking news.
    for (const f of this.sim.facts().slice(1)) this.knownFacts.add(f);
    this.seenTopics = new Set(this.storyTopics());
    this.breaking = null;
    this.drives.clear();
    this.lastAutoRendezvousAt = -999;
    this.lastAutoWildAt = -999;
    this.lastModelActionAt = -999;
    this.lastModelRumorAt = -999;
    this.lastModelActivityAt = -999;
    this.dayHeadlines = [];
    this.lastSpokenByPerson.clear();
  }

  /** Story mode: what the office is talking about now (empty in the sandbox). */
  private storyTopics(): string[] {
    try {
      return (this.opts.storyTopics?.() ?? []).filter((t) => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim());
    } catch {
      return [];
    }
  }

  get thinking(): boolean {
    return (this.running !== null && this.running.result === null && !this.running.failed) || this.sideN > 0;
  }

  /**
   * A model that writes only a few words a second (a laptop GPU) cannot do
   * everything: its time goes to conversations first. Unknown counts as slow
   * until the first reply has been timed.
   */
  private get slow(): boolean {
    const speed = this.opts.speed?.() ?? 0;
    return speed <= 0 || speed < 16;
  }

  // ── things the player does ─────────────────────────────────────────────────

  /**
   * The player has done something: whatever the model is writing in the
   * background (private thoughts, small talk, the tail of a finished chat) is
   * dropped so the answer to the player comes first.
   */
  private clearTheWay(): void {
    this.mindsAbort?.abort();
    this.mindsAbort = null;
    // Any conversation the player did not ask for gives way, whatever it was about.
    const r = this.running;
    if (r && !r.fromPlayer) this.stopScene(true);
  }

  /** Put a thought in someone's head. */
  whisper(who: CharId, text: string): void {
    const p = this.api.person(who);
    const thought = tidy(text, 160);
    if (!p || !thought) return;
    this.clearTheWay();
    if (isStopCommand(thought, p.name)) {
      this.directives.cancelActor(who, true);
      this.api.convince(who, null);
      this.drives.delete(who);
      this.api.setThought(who, '');
      this.api.resume(who);
      this.api.narrate(`You whisper to ${p.name}: "${thought}"`, { kind: 'overseer', icon: 'whisper', room: p.room });
      this.api.narrate(`${p.name} lets it go.`, { kind: 'event', icon: 'whisper', room: p.room });
      return;
    }
    this.api.emote(who, 'idea');
    this.api.feel(who, 'surprised', 0.7, 3);
    this.api.setThought(who, thought);
    // It sticks: for the rest of the day they are sure of it and act on it (see driveConvictions).
    this.api.convince(who, thought, true);
    this.drives.set(who, { nextAt: this.api.time + 30 + this.api.rng() * 15, acts: 0 });
    this.api.remember([who], `A thought came into your head from nowhere, and it feels like your own: "${thought}"`, 2.5);
    this.api.narrate(`You whisper to ${p.name}: "${thought}"`, { kind: 'overseer', icon: 'whisper', room: p.room });
    // Today's chapter stages this one itself: whatever they were doing before stops, and nothing else is read into it.
    if (this.opts.ownsOrder?.(who, text, 'whisper')) {
      this.directives.cancelActor(who, true);
      return;
    }
    const steps = splitCompoundDirective(thought);
    const first = steps[0] ?? thought;
    if (steps.length > 1) this.directives.queueChain(who, steps.slice(1), 'whisper', true);
    else this.directives.clearChain(who);
    this.dispatchDirective(who, first, 'whisper', this.buildDirectiveFallback(who, first, 'whisper'), true, 0);
  }

  /** Clear a player-sent whisper (leaves Story Mode puzzle convictions untouched). */
  cancelWhisper(who: CharId): void {
    const p = this.api.person(who);
    if (!p || !p.conviction?.fromPlayer) return;
    const old = p.conviction.text;
    this.directives.cancelActor(who, true);
    this.api.convince(who, null);
    this.drives.delete(who);
    if (p.thought === old) this.api.setThought(who, '');
    this.api.resume(who);
    this.api.narrate(`${p.name} shakes off the thought.`, { kind: 'event', icon: 'whisper', room: p.room });
  }

  /** Speak to everyone over the loudspeaker. */
  announce(text: string): void {
    const said = tidy(text, 200);
    if (!said) return;
    this.clearTheWay();
    this.api.sfx('paChime');
    this.api.narrate(`Over the loudspeaker: "${said}"`, { kind: 'overseer', icon: 'announce' });
    this.api.remember('all', `A voice over the loudspeaker said: "${said}"`);
    for (const p of this.api.people()) {
      if (!p.present || !p.available) continue;
      this.api.react(p.id, 'startle', 0.7);
    }
    // An announcement that names a room and asks people to go there sends most of them.
    const sent = this.summon(said);
    // The people talking about it are, where possible, the ones who stayed put.
    const stayed = this.biggestGroup(4, sent);
    const group = stayed.length >= 2 ? stayed : this.biggestGroup(4);
    const paDelegation = sent.length || keepsAway(said) || isNegatedDirective(said) || isStopCommand(said)
      ? null
      : this.parseLoudspeakerDemand(said, group);
    const scenePeople = paDelegation
      ? [...new Set([...(paDelegation.targets ?? [paDelegation.target]), ...group])].slice(0, 4)
      : group;
    if (!scenePeople.length) return;
    const paLead = paDelegation?.tone === 'ask'
      ? 'just asked over the office loudspeaker'
      : paDelegation?.tone === 'dare'
        ? 'just dared everyone over the office loudspeaker'
        : 'just commanded over the office loudspeaker';
    this.enqueue({
      people: scenePeople,
      trigger: 'announce',
      why: paDelegation
        ? `A voice nobody recognises ${paLead}: "${said}". Each person decides strictly in character whether to actually do it or refuse.`
        : `A voice nobody recognises has just said over the office loudspeaker: "${said}"`,
      ...(paDelegation ? { delegation: paDelegation } : {}),
      priority: 9,
      minLines: Math.min(3, scenePeople.length + 1),
      maxLines: 4,
      staleAfter: 40
    }, true);
  }

  private parseLoudspeakerDemand(said: string, fallbackGroup: CharId[]): SceneDelegation | null {
    if (!this.instinct.interpretDirectiveNow) return null;
    const presentCast = this.api
      .people()
      .filter((p) => p.isCast && p.present && !this.api.hasStatus(p.id, 'eliminated') && !this.api.hasStatus(p.id, 'quit'));
    if (!presentCast.length) return null;
    const clean = said.trim();
    // Require an explicit group/person vocative or imperative opener so plain statements ("The printer is broken") aren't treated as orders.
    const addrMatch = /^(?:attention(?:\s+(?:everyone|everybody|all\s+staff))?|everyone|everybody|all\s+staff|all\s+of\s+you|the\s+whole\s+office|hey\s+(?:everyone|everybody))[,:!.]?\s+(.+)$/i.exec(clean);
    let innerAction = addrMatch ? addrMatch[1].trim() : clean;
    let addressed: CharId[] = [];
    if (!addrMatch) {
      let rest = clean;
      while (true) {
        const matched = presentCast.find((p) => {
          const firstEsc = p.name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(
            `^${firstEsc}(?=(?:\\s+and\\s+|\\s*,\\s*|\\s*:\\s*|\\s+(?:strip|undress|get|put|dance|twerk|kiss|hug|punch|kill|eliminate|knock|shove|splash|quit|walk|bark|howl|scream|cry|wake|revive|resurrect|take|attack|fight|flash|moon|streak|seduce|tell)\\b))`,
            'i'
          ).test(rest);
        });
        if (!matched) break;
        if (!addressed.includes(matched.id)) addressed.push(matched.id);
        const firstEsc = matched.name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        rest = rest.replace(new RegExp(`^${firstEsc}(?:\\s*,\\s*|\\s*:\\s*|\\s+and\\s+|\\s+)`, 'i'), '').trim();
      }
      if (addressed.length) {
        innerAction = rest || clean;
      } else {
        const startsImperative = /^(?:please\s+)?(?:strip|undress|get\s+(?:naked|nude|dressed)|put\s+(?:your\s+)?clothes|dance|twerk|kiss|hug|punch|kill|eliminate|knock\s*out|shove|splash|quit|walk\s+out|bark|howl|scream|cry|wake\s+up|revive|resurrect|take\s+off\s+(?:your\s+)?clothes|attack|fight|flash|moon|streak|seduce|tell\s+)/i.test(clean);
        if (!startsImperative) return null;
      }
    }
    const parsed = this.instinct.interpretDirectiveNow({
      id: 'pa-check',
      actor: { id: 'loudspeaker' as CharId, name: 'Loudspeaker', room: 'bullpen' },
      kind: 'cue',
      text: innerAction,
      people: presentCast.map((p) => ({ id: p.id, name: p.name, room: p.room })),
      rooms: TARGET_ROOMS.map((id) => ({ id: id as string, name: roomDef(id).name })),
      allowDelegate: true
    });
    if (parsed.verb === 'social' || parsed.verb === 'go_to' || (parsed.verb === 'recover' && parsed.item === 'stop')) {
      return null;
    }
    // "Everyone, ..." is decided by the people seen talking about it, never by the whole office: someone who
    // says nothing (or is in another room) must not be staged carrying it out.
    const finalTargets = addressed.length ? addressed.slice(0, 4) : fallbackGroup.filter((id) => isCastId(id)).slice(0, 4);
    if (!finalTargets.length) return null;
    const tone: DelegateTone = /\bi\s+dare\b/i.test(clean)
      ? 'dare'
      : /\b(?:please|could\s+you|would\s+you)\b/i.test(clean)
        ? 'ask'
        : 'order';
    return {
      asker: 'loudspeaker',
      target: finalTargets[0],
      ...(finalTargets.length > 1 ? { targets: finalTargets } : {}),
      tone,
      action: innerAction.slice(0, 120),
      command: normalizeDelegatedCommand(innerAction),
      depth: 0
    };
  }

  /**
   * "Everyone to the conference room", "Free cake in the break room", "Jim, Michael's office":
   * the people it names (or, failing that, everyone) go there and wait a while, each by
   * temperament. Anyone busy with a whispered idea, or held by the story, ignores it.
   * Returns who went.
   */
  private summon(text: string): CharId[] {
    const room = roomNamedIn(text);
    if (!room) return [];
    const roomName = roomDef(room).name;
    if (!invitesPeople(text)) {
      // "Nobody go to the annex" names a room without inviting anyone: say so, never stay silent.
      if (keepsAway(text)) this.api.narrate('Nobody moves.', { icon: 'announce', room });
      return [];
    }
    if (this.api.isHazard(room)) {
      this.api.narrate(`Nobody wants to go anywhere near ${roomName} right now.`, { icon: 'announce' });
      return [];
    }
    const food = mentionsFood(text);
    const rest = withoutRooms(text);
    const present = this.api.people().filter((p) => p.present);
    const named = present.filter((p) => mentions(rest, p.name) || (!p.isCast && mentions(rest, p.name.split(' ').pop() ?? p.name)));
    const everyone = !named.length || speaksToEveryone(rest);
    const pool = everyone ? [...present.filter((p) => p.isCast), ...named.filter((p) => !p.isCast)] : named;
    const namedIds = new Set(named.map((p) => p.id));
    const went: CharId[] = [];
    /** Heard it, and chose to stay (held by the story, or sure of an idea of their own). */
    const stayed: string[] = [];
    /** Sure of an idea that says they only go where someone else goes. */
    const followers: { p: SimPerson; leader: string }[] = [];
    const send = (p: SimPerson): void => {
      this.api.goTo(p.id, { room }, {
        doing: `heading to ${roomName}`,
        stay: Math.max(SUMMON_STAY, this.opts.summonStay?.(room) ?? 0),
        stayDoing: food ? `waiting for the food in ${roomName}` : `waiting in ${roomName} as asked`
      });
      went.push(p.id);
    };
    for (const p of pool) {
      if (!p.present || this.api.isSeized(p.id) || this.api.isAirborne(p.id)) continue;
      if (p.statuses.some((st) => st.kind === 'asleep' || st.kind === 'frozen' || st.kind === 'knockedOut' || st.kind === 'eliminated' || st.kind === 'quit')) continue;
      if (!p.available && !p.sceneId) continue;
      if (this.opts.pinned?.(p.id)) {
        stayed.push(p.name);
        continue;
      }
      if (p.conviction) {
        // An idea that says what would move them is a way in: food, their name, or a friend going.
        const lever = convictionLever(p.conviction.text);
        if ((lever?.kind === 'food' && food) || (lever?.kind === 'named' && namedIds.has(p.id))) send(p);
        else if (lever?.kind === 'follow') followers.push({ p, leader: lever.who });
        else stayed.push(p.name);
        continue;
      }
      const chance = summonChance(p.id, { food, named: namedIds.has(p.id) });
      if (this.api.rng() >= chance) continue;
      send(p);
    }
    for (const f of followers) {
      const leader = present.find((o) => o.name.toLowerCase() === f.leader);
      if (leader && (went.includes(leader.id) || leader.room === room)) send(f.p);
      else stayed.push(f.p.name);
    }
    // Someone who only goes where a friend goes follows them even when only the friend was called.
    for (const p of present) {
      if (!p.isCast || pool.includes(p) || went.includes(p.id) || !p.conviction) continue;
      if (this.api.isSeized(p.id) || this.api.isAirborne(p.id) || (!p.available && !p.sceneId)) continue;
      const lever = convictionLever(p.conviction.text);
      if (lever?.kind !== 'follow') continue;
      const leader = present.find((o) => o.name.toLowerCase() === lever.who);
      if (leader && went.includes(leader.id)) send(p);
    }
    // Who went, then who heard it and stayed (never "Nobody moves." when the reason can be named).
    if (went.length || !stayed.length) this.api.narrate(summonLine(went.map((id) => this.api.person(id)?.name ?? id), roomName, !everyone), { icon: 'announce', room });
    if (stayed.length) this.api.narrate(stayedLine(stayed), { icon: 'announce', room });
    return went;
  }

  private buildDirectiveFallback(who: CharId, what: string, kind: 'whisper' | 'cue'): () => void {
    return () => {
      const p = this.api.person(who);
      if (!p || !p.present) return;
      const roomName = roomDef(p.room).name;
      const clean = withoutRooms(what);
      const named = this.api.people().filter((o) => o.id !== who && o.present && mentions(clean, o.name)).map((o) => o.id).slice(0, 2);
      const near = this.companions(p, 1);
      const people = [who, ...(named.length ? named : near)];
      if (kind === 'whisper') {
        this.enqueue({
          people,
          trigger: 'whisper',
          why: `${p.name} has just had a sudden thought that feels like ${possessive(p.name)} own idea: "${what}". ${p.name} believes it and acts on it.`,
          priority: 10,
          minLines: people.length > 1 ? 2 : 1,
          maxLines: people.length > 1 ? 3 : 2,
          staleAfter: 40
        }, true);
        return;
      }
      const negated = isNegatedDirective(what, p.name);
      const talkOnly = negated || /^(say|tell|ask|apologiz|confess|admit|compliment|insult|argue|chat|talk|gossip|yell\s+at|shout\s+at|warn|thank|congratulate|invite|remind|explain|call)\b/i.test(what);
      if (!talkOnly) {
        this.api.react(who, 'cheer', 1.4);
        this.api.fx({ kind: 'burst', what: 'sparkles', x: p.x, y: p.y - 14, count: 10 });
        this.api.narrate(`${p.name} acts on an impulse in ${roomName}: ${what}!`, { kind: 'event', icon: 'tell', room: p.room, beat: true });
      }
      this.enqueue({
        people,
        trigger: 'cue',
        why: negated
          ? `${p.name} decides right now NOT to do this: ${what}. React in character.`
          : talkOnly
            ? `${p.name} decides right now to speak up and ${what}.`
            : `${p.name} is physically doing this right now in ${roomName} in front of everyone: ${what}. (${p.name} is actually performing this action themselves — NOT merely talking about it or asking anyone else to do it.)`,
        priority: 10,
        minLines: people.length > 1 ? 2 : 1,
        maxLines: people.length > 1 ? 4 : 2,
        staleAfter: 45
      }, true);
    };
  }

  /** Tell one person exactly what to do. */
  cue(who: CharId, instruction: string): void {
    const p = this.api.person(who);
    const what = tidy(instruction, 160);
    if (!p || !what) return;
    this.clearTheWay();
    this.api.emote(who, 'alert');
    this.api.feel(who, 'determined', 0.75, 5);
    this.api.setThought(who, what);
    this.api.narrate(`You nudge ${p.name}: ${what}`, { kind: 'overseer', icon: 'tell', room: p.room });
    // If the instruction names someone else (outside room names), frame around them.
    const named = this.api.people().filter((o) => o.id !== who && o.present && mentions(withoutRooms(what), o.name)).map((o) => o.id).slice(0, 2);
    const people = [who, ...(named.length ? named : this.companions(p, 1))];
    this.focusOn(people, 10);
    // Today's chapter stages this one itself: whatever they were doing before stops, and nothing else is read into it.
    if (this.opts.ownsOrder?.(who, instruction, 'cue')) {
      this.directives.cancelActor(who, true);
      return;
    }
    const steps = splitCompoundDirective(what);
    const first = steps[0] ?? what;
    if (steps.length > 1) this.directives.queueChain(who, steps.slice(1), 'cue', true);
    else this.directives.clearChain(who);
    this.dispatchDirective(who, first, 'cue', this.buildDirectiveFallback(who, first, 'cue'), true, 0);
  }

  private dispatchDirective(
    who: CharId,
    text: string,
    kind: 'whisper' | 'cue',
    fallbackScene: () => void,
    allowDelegate = true,
    delegateDepth = 0
  ): void {
    const actor = this.api.person(who);
    if (!actor || !actor.present) return;
    const includeEliminated = /\b(revive|resurrect|bring\s+.+\s+back|cpr)\b/i.test(text);
    const req: DirectiveRequest = {
      id: nextId('directive'),
      actor: {
        id: actor.id,
        name: actor.name,
        room: actor.room,
        ...(isCastId(actor.id) ? { pronoun: CAST[actor.id].pronoun } : {})
      },
      kind,
      text,
      people: this.api
        .people()
        .filter((o) => o.present && (includeEliminated || !this.api.hasStatus(o.id, 'eliminated')) && !this.api.hasStatus(o.id, 'quit'))
        .map((o) => ({
          id: o.id,
          name: o.name,
          room: o.room,
          ...(isCastId(o.id) ? { pronoun: CAST[o.id].pronoun } : {})
        })),
      rooms: TARGET_ROOMS.map((id) => ({ id: id as string, name: roomDef(id).name })),
      allowDelegate,
      ...(this.opts.carefulOrders?.() ? { careful: true } : {})
    };
    const apply = (res: DirectiveResult): void => {
      if (this.disposed) return;
      if (kind === 'whisper') {
        const d = this.drives.get(who);
        if (d) d.directive = res;
      }
      if (res.verb !== 'social' && this.directives.start(who, res, text, kind, delegateDepth)) {
        if (kind === 'cue') this.api.setThought(who, '');
        return;
      }
      fallbackScene();
    };
    const fallback = (): DirectiveResult => (
      this.instinct.interpretDirectiveNow
        ? this.instinct.interpretDirectiveNow(req)
        : { verb: 'social', targetPerson: null, targetRoom: null, power: 'none', item: '', summary: text.slice(0, 120), source: 'instinct' }
    );
    if (this.brain === this.instinct || !this.brain.interpretDirective) {
      apply(fallback());
      return;
    }
    this.sideN += 1;
    this.report();
    void this.brain
      .interpretDirective(req)
      .catch(() => fallback())
      .then((res) => apply(res))
      .finally(() => {
        this.sideN = Math.max(0, this.sideN - 1);
        this.report();
      });
  }

  /** Something the player typed: "a horse walks into the office". */
  customEvent(text: string): void {
    const what = tidy(text, 180);
    if (!what) return;
    this.clearTheWay();
    this.api.narrate(`You make it happen: ${what}`, { kind: 'overseer', icon: 'anything' });
    const rooms = TARGET_ROOMS.map((id) => ({
      id: id as string,
      name: roomDef(id).name,
      people: this.api.peopleIn(id).filter((p) => p.present).map((p) => p.name)
    }));
    this.sideN += 1;
    this.report();
    const brewing = this.guests.brew(what);
    void this.brain
      .interpret({ id: nextId('interpret'), text: what, rooms })
      .catch(() => this.instinct.interpret({ id: nextId('interpret'), text: what, rooms }))
      .then((res) => {
        if (!this.disposed) this.guests.stage(what, res, brewing);
      })
      .catch((err) => console.warn('[director] custom event failed', err))
      .finally(() => {
        this.api.removeEffect(brewing.key);
        this.sideN = Math.max(0, this.sideN - 1);
        this.report();
      });
  }

  // ── every frame ────────────────────────────────────────────────────────────

  /** dt: seconds of game time (0 while paused). */
  update(dt: number): void {
    if (this.disposed || dt <= 0) return;
    const now = this.api.time;
    for (const ask of this.sim.takeSceneAsks()) this.enqueue(this.withStoryTopic(ask), false);
    // While a story scene plays nothing else may start, so what is waiting does not go stale meanwhile.
    if (this.scripts.length) for (const q of this.queue) q.at = Math.min(now, q.at + dt);
    // The same for a reaction to something the player did, while another one the player caused is playing
    // (a slow model takes most of a minute over one) or the model is busy on the player's behalf: two
    // knockouts a few seconds apart each get their scene, in turn.
    else if (this.running?.fromPlayer || this.sideN > 0) for (const q of this.queue) if (q.fromPlayer) q.at = Math.min(now, q.at + dt);
    this.pruneQueue(now);
    this.guests.update(dt);
    this.directives.update(dt);

    if (now >= this.factsAt) {
      this.factsAt = now + 1;
      this.watchFacts(now);
      this.watchTopics(now);
      this.driveConvictions(now);
    }

    if (this.scripts.length) this.advanceScript(now);
    else if (this.running) this.advanceScene(now);
    else this.startNext(now);

    // While someone is waiting for the model, the office should not fall silent.
    if (now >= this.musingAt) {
      this.musingAt = now + 9 + this.api.rng() * 9;
      void this.musing();
    }
    if (!this.running && this.sideN === 0 && now >= this.mindsAt) {
      // Conversations come first. A round of private thoughts costs a slow model
      // twenty seconds, so it waits for a quiet moment and happens less often.
      const slow = this.slow;
      const model = this.brain.autonomous && this.brain.kind !== 'instinct';
      const owed = this.scenesSinceMinds >= (slow ? (model ? 2 : 3) : 1);
      if (this.queue.length && !owed) this.mindsAt = now + 3;
      else {
        this.mindsAt = now + (slow ? (model ? 45 : 70) + this.api.rng() * (model ? 20 : 30) : (model ? 24 : 28) + this.api.rng() * (model ? 12 : 14));
        this.scenesSinceMinds = 0;
        this.mindsRound(slow ? 2 : 3);
      }
    }
  }

  /**
   * When something new becomes true on the floor (a fire, a puppy, someone shrunk),
   * it is news: small talk in progress gives way, and the next conversations are
   * about it. The first entry of facts() is only the time, so it is skipped.
   */
  private watchFacts(now: number): void {
    const facts = this.sim.facts().slice(1);
    let fresh: string | null = null;
    for (const f of facts) {
      if (this.knownFacts.has(f)) continue;
      this.knownFacts.add(f);
      fresh ??= f;
    }
    // Forget what is no longer true, so the same thing happening again counts as news again.
    for (const f of this.knownFacts) if (!facts.includes(f)) this.knownFacts.delete(f);
    if (!fresh) return;
    this.breakNews(fresh, now, false);
  }

  private rememberHeadline(text: string): void {
    const clean = text.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (this.dayHeadlines.some((h) => h.toLowerCase() === key)) return;
    this.dayHeadlines.push(clean);
    if (this.dayHeadlines.length > 8) this.dayHeadlines.shift();
  }

  private breakNews(text: string, now: number, topic: boolean): void {
    this.rememberHeadline(text);
    this.breaking = { fact: text, at: now, scenes: 0, topic };
    const r = this.running;
    if (r && r.ask.trigger === 'ambient' && !r.fromPlayer && !r.releasedAt) this.stopScene(true);
    this.ambientAt = Math.min(this.ambientAt, now + 0.8);
    this.idleAt = Math.min(this.idleAt, now + 0.8);
  }

  /**
   * Story mode: a topic that appears during the day (the call has happened, the client has arrived)
   * is news too, worth the next two conversations. Each sentence counts once a day; a fresh fact on
   * the floor in the last few seconds goes first.
   */
  private watchTopics(now: number): void {
    let fresh: string | null = null;
    for (const t of this.storyTopics()) {
      if (this.seenTopics.has(t)) continue;
      this.seenTopics.add(t);
      fresh ??= t;
    }
    if (!fresh || (this.breaking && !this.breaking.topic && now - this.breaking.at < 20)) return;
    this.breakNews(fresh, now, true);
  }

  /** One of the story's topics, the one talked about least lately (and not the same twice running). */
  private pickTopic(topics: string[], now: number): string {
    const ranked = topics
      .map((t, i) => ({ t, at: this.topicUsedAt.get(t) ?? -999 - i }))
      .sort((a, b) => a.at - b.at);
    const pick = ranked[0].t;
    this.topicUsedAt.set(pick, now);
    return pick;
  }

  /** Remember that a scene is about a story topic, so the written lines can match it. */
  private tagTopic<T extends SceneAsk>(ask: T, text: string): T {
    const theme = storyThemeOf(text);
    if (theme) this.askTopic.set(ask, theme);
    return ask;
  }

  /** Story mode: about a third of the sim's chance meetings are about what the office is talking about. */
  private withStoryTopic(ask: SceneAsk): SceneAsk {
    if (ask.trigger !== 'ambient') return ask;
    const topics = this.storyTopics();
    if (!topics.length || this.api.rng() >= STORY_SHARE) return ask;
    const topic = this.pickTopic(topics, this.api.time);
    return this.tagTopic({ ...ask, why: `${ask.why.replace(/\s*$/, '')} They are talking about this: ${topic}` }, topic);
  }

  /**
   * The story theme a scene is about, for the written lines: one tagged here, or (story mode only) one
   * the story asked for, like the call on Monday. An office event (a fire, a puppy) keeps its own lines.
   */
  private topicFor(ask: SceneAsk): StoryTheme | undefined {
    const tagged = this.askTopic.get(ask);
    if (tagged) return tagged;
    if (ask.trigger !== 'event' && ask.trigger !== 'aftermath' && ask.trigger !== 'plan') return undefined;
    // Story mode, or a beat a chapter asked for itself (an urgent event: the call, the pitch, the catch).
    if (!this.storyTopics().length && !(ask.trigger === 'event' && ask.priority >= 8)) return undefined;
    if (detectChaos(ask.why) && !STORY_BEAT.test(ask.why)) return undefined;
    return storyThemeOf(ask.why) ?? undefined;
  }

  /**
   * A whispered idea is not a passing thought: every minute or so the person
   * does something about it (goes to have it out with whoever it names, tells
   * someone else, takes over a room), until the day ends.
   */
  private driveConvictions(now: number): void {
    for (const [who, d] of this.drives) {
      const p = this.api.person(who);
      if (!p || !p.conviction) {
        this.drives.delete(who);
        continue;
      }
      if (now < d.nextAt) continue;
      if (!p.present || !p.available || p.urgent || p.plan || p.sceneId || p.speaking) {
        d.nextAt = now + 4;
        continue;
      }
      // An idea about being somewhere ("I should be in the conference room") takes them there
      // for a while, every other turn, as long as it is not about somebody.
      const place = roomNamedIn(p.conviction.text);
      const aboutSomeone = this.api.people().some((o) => o.isCast && o.id !== p.id && mentions(withoutRooms(p.conviction!.text), o.name));
      if (place && !aboutSomeone && d.acts % 2 === 0) {
        d.acts += 1;
        d.nextAt = now + (this.slow ? 70 : 50) + this.api.rng() * 30;
        if (p.room !== place && !this.api.isHazard(place)) {
          const name = roomDef(place).name;
          this.api.emote(who, 'idea');
          this.api.feel(who, 'determined', 0.7, 10);
          this.api.goTo(who, { room: place }, { doing: `heading to ${name}`, stay: 60, stayDoing: `waiting in ${name}` });
        }
        continue;
      }
      const plan = this.convictionPlan(p, p.conviction.text, d.acts);
      d.acts += 1;
      d.nextAt = now + (this.slow ? 70 : 50) + this.api.rng() * 30;
      if (!plan) continue;
      this.api.emote(who, 'idea');
      this.api.feel(who, 'determined', 0.7, 10);
      this.api.setPlan(who, plan);
    }
  }

  /** What someone does next about their idea. Turns go: act on it, tell someone, act on it again... */
  private convictionPlan(p: SimPerson, text: string, acts: number): Plan | null {
    const about = `"${text.length > 90 ? `${text.slice(0, 88)}...` : text}"`;
    const others = this.api.people().filter((o) => o.isCast && o.present && o.id !== p.id);
    if (!others.length) return null;
    const named = others.filter((o) => mentions(withoutRooms(text), o.name));
    const nearest = (list: SimPerson[]): SimPerson | undefined =>
      list.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    const t = text.toLowerCase();
    const kind: Plan['kind'] =
      /\b(love|loves|fancy|fancies|crush|kiss|marry|date|dating|attractive|soulmate|adore)\b/.test(t) ? 'flirt'
        : /\b(prank|trick)\b/.test(t) ? 'prank'
          : /\b(kill|murder|assassinate|knock\s*out|punch|hit|shove|push|fight|attack|hate|hates|steal|stole|stolen|lie|lies|lying|liar|cheat|cheating|betray|blame|sabotag\w*|smash|wreck|fire|fired|replace|enemy|plot|plotting|against|took|hid|hidden|ruin|spy|spying|fake|wrong|owes?)\b/.test(t) ? 'confront'
            : /\b(secret|rumou?r|heard|affair|pregnant|quitting|leaving)\b/.test(t) ? 'gossip'
              : 'talk';
    // Every second turn they spread the word to someone the idea is not about.
    if (acts % 2 === 1) {
      const listener = nearest(others.filter((o) => !named.includes(o)));
      if (listener) return { kind: 'gossip', target: listener.id, about };
    }
    // An idea about running the place sends them to sit in the boss's office now and then.
    if (acts % 4 === 2 && /\b(manager|boss|in charge|promot\w*|run the (office|branch|place))\b/.test(t)) {
      return { kind: 'wander', target: 'boss', about: `trying out the boss's office: ${about}` };
    }
    const target = named.length ? named[acts % named.length] : nearest(others);
    return target ? { kind, target: target.id, about } : null;
  }

  // ── queue ──────────────────────────────────────────────────────────────────

  private enqueue(ask: SceneAsk, fromPlayer: boolean): void {
    // One ambient chat waiting is plenty; one about the story takes the place of one that is not.
    if (ask.trigger === 'ambient') {
      const waiting = this.queue.findIndex((q) => q.ask.trigger === 'ambient');
      if (waiting >= 0) {
        if (this.askTopic.has(ask) && !this.askTopic.has(this.queue[waiting].ask)) this.queue.splice(waiting, 1);
        else return;
      }
    }
    this.queue.push({ ask, at: this.api.time, fromPlayer });
    this.queue.sort((a, b) => b.ask.priority - a.ask.priority || a.at - b.at);
    if (this.queue.length > 12) this.queue.length = 12;
    // Something important should not wait behind small talk.
    // The same goes for a conversation that is over and only waiting for its summary:
    // the player should not wait for paperwork.
    const r = this.running;
    if (
      r &&
      ask.priority >= 8 &&
      (r.ask.priority <= 3 || r.releasedAt > 0 || (fromPlayer && !r.fromPlayer && r.ask.priority < ask.priority))
    ) {
      this.stopScene(true);
    }
    this.report();
  }

  private pruneQueue(now: number): void {
    const before = this.queue.length;
    this.queue = this.queue.filter((q) => now - q.at <= (q.ask.staleAfter ?? 25));
    if (this.queue.length !== before) this.report();
  }

  private startNext(now: number): void {
    if (this.sideN > 0) return;
    while (this.queue.length) {
      const next = this.queue[0];
      const ambient = next.ask.priority <= 2;
      if (ambient && now < this.ambientAt) return;
      this.queue.shift();
      if (this.startScene(next, now)) {
        this.report();
        return;
      }
    }
    // Nobody has asked for anything, so the office makes its own small talk.
    if (now >= this.ambientAt && now >= this.idleAt) {
      this.idleAt = now + 2.5;
      const ask = this.smallTalk(now);
      if (ask && this.startScene({ ask, at: now, fromPlayer: false }, now)) this.report();
    }
  }

  /**
   * Two people who could plausibly be talking right now, and something for them
   * to talk about. Whoever has been quiet longest goes first, so over a day
   * everybody gets heard.
   */
  private smallTalk(now: number): SceneAsk | null {
    const clock = this.api.clock;
    if (clock < 9 * 60 + 2 || clock > 16 * 60 + 50) return null;
    // Something that has just happened is worth two conversations, while it is fresh.
    const news = this.breaking && now - this.breaking.at < 50 && this.breaking.scenes < 2 ? this.breaking : null;
    // Otherwise, in the thick of it, the events' own scenes do the talking.
    if (!news && this.api.chaos > 70) return null;
    const rng = this.api.rng;
    const everyone = this.api.people().filter((p) => p.isCast && p.present && p.available && !p.urgent && !p.plan && !p.speaking && this.canSpeak(p.id));
    if (!everyone.length) return null;
    // News is best discussed by the people standing in it.
    const text = news?.fact.toLowerCase() ?? '';
    const where = news ? TARGET_ROOMS.find((id) => text.includes(roomDef(id).name.toLowerCase())) : undefined;
    const local = where ? everyone.filter((p) => p.room === where) : [];
    const free = local.length ? local : everyone;
    const quiet = (p: SimPerson): number => now - (this.lastSpoke.get(p.id) ?? -999);
    // A little noise, so people who have all been silent equally long are not always taken in the same order.
    const turn = new Map(free.map((p) => [p.id, quiet(p) + rng() * 40]));
    const pool = free.slice().sort((x, y) => turn.get(y.id)! - turn.get(x.id)!).slice(0, 4);
    const a = pool[Math.floor(rng() * pool.length)];
    const place = roomDef(a.room).name;

    const near = free
      .filter((o) => o.id !== a.id && o.room === a.room && !this.talkedLately(a.id, o.id, now))
      .map((o) => {
        const dist = Math.hypot(o.x - a.x, o.y - a.y);
        const feeling = Math.abs(this.api.bond(a.id, o.id)) / 100 + this.api.chemistry(a.id, o.id) / 200;
        return { o, dist, score: feeling + Math.max(0, 1 - dist / 260) + Math.min(1, quiet(o) / 120) * 0.6 + rng() * 0.5 };
      })
      .sort((x, y) => y.score - x.score);

    const storyTopics = this.storyTopics();
    if (!near.length) {
      if (news) {
        news.scenes += 1;
        this.lastTopic = 'news';
        const ask: SceneAsk = {
          people: [a.id], room: a.room, trigger: 'event', priority: 6, minLines: 1, maxLines: 1, gather: false,
          why: news.topic
            ? `${a.name} has just heard this: ${news.fact} ${a.name} says something about it out loud.`
            : `This is happening right now: ${news.fact} ${a.name} says something about it out loud.`
        };
        return news.topic ? this.tagTopic(ask, news.fact) : ask;
      }
      // Story mode: alone, they mutter about what the office is talking about.
      if (storyTopics.length && quiet(a) >= 30 && rng() < STORY_SHARE) {
        const topic = this.pickTopic(storyTopics, now);
        this.lastTopic = 'story';
        return this.tagTopic({
          people: [a.id], room: a.room, trigger: 'ambient', priority: 1, minLines: 1, maxLines: 1, gather: false,
          why: `${a.name} is alone in ${place}, thinking about this: ${topic} ${a.name} says one thing about it out loud.`
        }, topic);
      }
      // Alone in the room: a line down the phone or under the breath.
      if (quiet(a) < 45) return null;
      return {
        people: [a.id], room: a.room, trigger: 'ambient', priority: 1, minLines: 1, maxLines: 1, gather: false,
        why: `${a.name} is alone in ${place}, ${a.doing}. ${a.name} says one thing out loud, to nobody or down the phone.`
      };
    }

    const { o: b, dist } = near[0];
    const people = [a.id, b.id];
    // Now and then a third joins in, when the model is quick enough to afford it.
    if (!this.slow && near.length > 1 && rng() < 0.25) people.push(near[1].o.id);

    if (news) {
      news.scenes += 1;
      this.lastTopic = 'news';
      const names = people.map((id) => this.api.person(id)?.name ?? id).join(' and ');
      const ask: SceneAsk = {
        people, room: a.room, trigger: 'event', priority: 6, minLines: 2, maxLines: 3, gather: dist > 110,
        why: news.topic
          ? `${names} have just heard this and are talking about it: ${news.fact}`
          : `This is happening right now: ${news.fact} ${names} are reacting to it.`
      };
      return news.topic ? this.tagTopic(ask, news.fact) : ask;
    }

    // Story mode: about a third of the chats are about what the office is talking about in the story.
    if (storyTopics.length && rng() < STORY_SHARE) {
      const topic = this.pickTopic(storyTopics, now);
      this.lastTopic = 'story';
      return this.tagTopic({
        people, room: a.room, trigger: 'ambient', priority: 1, minLines: 2, maxLines: people.length > 2 ? 4 : 3, gather: dist > 110,
        why: `${people.map((id) => this.api.person(id)?.name ?? id).join(' and ')} are talking about this: ${topic}`
      }, topic);
    }

    const bond = this.api.bond(a.id, b.id);
    const chem = this.api.chemistry(a.id, b.id);
    const fling = this.api.isFling(a.id, b.id);
    // The first fact is only the day and the time; the rest are things that have happened, newest first.
    const facts = this.sim.facts().slice(1);
    const topics: [string, string][] = [];
    if (facts.length) topics.push(['fact', `${a.name} and ${b.name} are talking about this: ${facts[Math.floor(rng() * Math.min(3, facts.length))]}`]);
    if (bond <= -20) topics.push(['feud', `${a.name} and ${b.name} do not get on. ${a.name} has found something small to pick at.`]);
    if (bond >= 30) topics.push(['pals', `${a.name} and ${b.name} get on well. They are having a quiet word instead of working.`]);
    if (fling) topics.push(['fling', `${a.name} and ${b.name} are keeping their secret office hookups under wraps in ${place}, trading shameless looks when nobody is watching.`]);
    else if (chem >= 45) topics.push(['crush', `${a.name} has strong sexual tension with ${b.name} and finds an excuse to linger and flirt shamelessly in ${place}.`]);
    if (a.statuses.some((s) => s.kind === 'aroused') || b.statuses.some((s) => s.kind === 'aroused')) {
      topics.push(['aroused', `${a.name} and ${b.name} are dealing with serious pent-up sexual tension in ${place} right now.`]);
    }
    if (a.statuses.some((s) => s.kind === 'afterglow') || b.statuses.some((s) => s.kind === 'afterglow')) {
      topics.push(['afterglow', `Someone here just stumbled back out of a hookup with rumpled clothes and messy hair in ${place}.`]);
    }
    if (a.statuses.some((s) => s.kind === 'flustered') || b.statuses.some((s) => s.kind === 'flustered')) {
      topics.push(['flustered', `Someone here is still blushing and breathless after a shamelessly steamy moment in ${place}.`]);
    }
    if (a.statuses.some((s) => s.kind === 'scandal') || b.statuses.some((s) => s.kind === 'scandal')) {
      topics.push(['scandal', `Explicit office sex-and-exposure gossip is ripping through ${place} around ${a.name} and ${b.name} after an earlier incident.`]);
    }
    if (a.statuses.some((s) => s.kind === 'bound') || b.statuses.some((s) => s.kind === 'bound')) {
      topics.push(['bound', `Someone in ${place} is still playfully cuffed in front of everyone while they trade cheeky safe-word jokes.`]);
    }
    if (a.statuses.some((s) => s.kind === 'dominated') || b.statuses.some((s) => s.kind === 'dominated')) {
      topics.push(['dominated', `The dom/sub power-play energy between ${a.name} and ${b.name} has everyone in ${place} staring.`]);
    }
    if (a.statuses.some((s) => s.kind === 'blackmailed') || b.statuses.some((s) => s.kind === 'blackmailed')) {
      topics.push(['blackmailed', `Someone in ${place} is sweating bullets over blackmail leverage and trying to buy silence.`]);
    }
    if (a.statuses.some((s) => s.kind === 'voyeur') || b.statuses.some((s) => s.kind === 'voyeur')) {
      topics.push(['voyeur', `Everyone in ${place} knows someone was just caught sneaking a voyeur peek on their coworkers.`]);
    }
    if (a.statuses.some((s) => s.kind === 'exhibitionist') || b.statuses.some((s) => s.kind === 'exhibitionist')) {
      topics.push(['exhibitionist', `Someone in ${place} is riding a shameless exhibitionist thrill and daring the office to keep staring.`]);
    }
    if (a.thought) topics.push(['thought', `${a.name} keeps thinking: "${a.thought}" Now ${a.name} says something about it to ${b.name}.`]);
    // A whispered idea is what they most want to talk about, all day. Not someone keeping a secret for
    // the story: they act on what they are sure of but would never bring it up.
    const sureA = a.conviction && !this.keepsSecret(a.id) ? a.conviction : null;
    const sureB = b.conviction && !this.keepsSecret(b.id) ? b.conviction : null;
    const sure = sureA ?? sureB;
    if (sure) {
      const who = sureA ? a : b;
      const other = who === a ? b : a;
      const line: [string, string] = ['conviction', `${who.name} has been sure all day that "${sure.text}", and brings it up with ${other.name} again.`];
      topics.push(line, line);
    }
    if (this.brain.kind !== 'instinct') {
      const wildSparks: [string, string][] = [
        [
          'emergent',
          `${a.name} (${a.emotion}) and ${b.name} (${b.emotion}) cross paths in ${place}. Let them spark a natural conversation grounded in their real feelings, crushes, grudges, memories, or today's office drama.`
        ],
        [
          'wild_dare',
          `${a.name} challenges ${b.name} to an outrageous truth-or-dare or strip bet right in ${place} while nobody from corporate is looking.`
        ],
        [
          'wild_heat',
          `The AC is broken and ${place} is stiflingly hot - ${a.name} and ${b.name} complain about sweating through their clothes and threaten to start peeling layers off.`
        ],
        [
          'wild_scheme',
          `${a.name} pulls ${b.name} aside in ${place} with an unhinged scheme, illicit desk flask, or weird conspiracy about a coworker.`
        ],
        [
          'wild_showoff',
          `${a.name} tries to impress or scandalize ${b.name} in ${place} by boasting, flexing, or threatening an impromptu stunt or lap dance.`
        ]
      ];
      if (!this.opts.carefulOrders?.()) {
        wildSparks.push(
          [
            'wild_blackmail',
            `${a.name} hints at dirty compromising dirt on ${b.name} in ${place}, teasing an outrageous blackmail favor to keep quiet.`
          ],
          [
            'wild_kink_dare',
            `${a.name} dares ${b.name} into a cheeky boss-and-pet or fuzzy-cuffs power-play bet right in ${place}.`
          ],
          [
            'wild_exhibition',
            `${a.name} brags to ${b.name} in ${place} about climbing onto a desk for a shameless strip dare while corporate isn't watching.`
          ],
          [
            'wild_voyeur',
            `${a.name} whispers to ${b.name} in ${place} about who was just spotted peeping around the annex doors.`
          ]
        );
      }
      const pickWild = wildSparks[Math.floor(rng() * wildSparks.length)];
      topics.push(pickWild);
      if (this.dayHeadlines.length) {
        const hl = this.dayHeadlines[Math.floor(rng() * this.dayHeadlines.length)];
        topics.push(['headline', `${a.name} and ${b.name} react in ${place} to today's office headline: ${hl}`]);
      }
    } else {
      topics.push(['doing', `A quiet moment in ${place}. ${a.name} is ${a.doing} and ${b.name} is ${b.doing}.`]);
      if (clock < 10 * 60) topics.push(['early', `It is early and nobody in ${place} has done any work yet. ${a.name} says so to ${b.name}.`]);
      else if (clock >= 11 * 60 + 30 && clock < 13 * 60) topics.push(['lunch', `It is nearly lunch. ${a.name} and ${b.name} are talking about anything except work.`]);
      else if (clock >= 15 * 60 + 30) topics.push(['late', `The afternoon is dragging in ${place}. ${a.name} wants to go home and says so to ${b.name}.`]);
    }
    // Not the same kind of chat twice running.
    const fresh = topics.filter((t) => t[0] !== this.lastTopic);
    const [kind, why] = (fresh.length ? fresh : topics)[Math.floor(rng() * (fresh.length || topics.length))];
    this.lastTopic = kind;

    const ask: SceneAsk = {
      people, room: a.room, trigger: 'ambient', priority: 1, why,
      minLines: 2, maxLines: people.length > 2 ? 4 : 3,
      // Neighbours call across the desks; anyone further away walks over.
      gather: dist > 110
    };
    // Story mode: a chat about one of the story's facts is a chat about the story.
    return kind === 'fact' && storyTopics.length ? this.tagTopic(ask, why) : ask;
  }

  /** The story has them keeping a secret (a hidden note): what they are sure of is not to be said out loud. */
  private keepsSecret(who: CharId): boolean {
    try {
      return !!this.sim.briefFor(who, []).hidden;
    } catch {
      return false;
    }
  }

  // ── scenes ─────────────────────────────────────────────────────────────────

  private startScene(p: Pending, now: number): boolean {
    const ask = p.ask;
    let ids = (ask.people ?? []).filter((id) => this.canSpeak(id));
    if (!ids.length && ask.room) ids = this.pickFromRoom(ask.room, 3);
    if (!ids.length) return false;
    ids = ids.slice(0, 4);
    const first = this.api.person(ids[0]);
    if (!first) return false;
    // Small talk between two people who have only just finished talking is skipped.
    if (ask.trigger === 'ambient' && ids.length === 2 && this.talkedLately(ids[0], ids[1], now)) return false;
    const room = ask.room ?? first.room;

    const id = nextId('scene');

    // An announcement is shouted across the room; everything else is a huddle.
    const handle = this.sim.openScene({ id, people: ids, gather: ask.gather ?? (ask.trigger !== 'announce' && ids.length > 1) });
    if (!handle) return false;

    const abort = new AbortController();
    const req = this.buildRequest(id, ask, ids, room);
    const r: Running = {
      ask, handle, people: ids, room, abort, buffer: [], spoken: 0, result: null, failed: false,
      nextAt: now + 0.4, startedAt: now, waitedSince: now, dotted: false, fromPlayer: p.fromPlayer,
      linesDone: false, releasedAt: 0, topic: req.topic
    };
    this.running = r;
    this.focusOn(ids, ask.priority);

    // A brain that may not be called on a timer (Claude inside an Artifact) only writes for the player's own actions.
    const brain = this.brain.autonomous || p.fromPlayer ? this.brain : this.instinct;
    void brain
      .scene(req, {
        signal: abort.signal,
        onLine: (line) => { if (this.running === r) r.buffer.push(line); },
        onLinesEnd: () => { if (this.running === r) r.linesDone = true; }
      })
      .then((res) => {
        if (this.running !== r) return;
        r.result = res;
        // Lines that never arrived through the stream (a non-streaming reply) are played now.
        const have = r.spoken + r.buffer.length;
        for (let i = have; i < res.lines.length; i++) r.buffer.push(res.lines[i]);
        this.report();
      })
      .catch(() => {
        if (this.running === r) r.failed = true;
        this.report();
      });
    return true;
  }

  private advanceScene(now: number): void {
    const r = this.running;
    if (!r) return;
    if (r.releasedAt) {
      // Everyone has gone back to work; only the summary is still on its way.
      if (r.result || r.failed) this.finishScene(r);
      else if (now - r.releasedAt > 45) this.stopScene(false);
      return;
    }
    if (!r.handle.alive) {
      this.stopScene(true);
      return;
    }
    if (now < r.nextAt) return;
    // Give people a moment to walk over, but do not hold a ready line for ever.
    if (!r.handle.ready && now - r.startedAt < 7) return;

    const line = r.buffer.shift();
    if (line) {
      const speech = r.handle.line(line);
      r.spoken += 1;
      r.dotted = false;
      this.lastSpoke.set(line.who, now);
      if (speech.text) {
        this.lastSpokenByPerson.set(line.who, { who: this.api.person(line.who)?.name ?? line.who, say: speech.text, at: now });
      }
      if (r.topic) this.storySaid.add(`${line.who}|${speech.text}`);
      const gap = 0.25 + this.api.rng() * 0.35;
      r.nextAt = now + speech.durationMs / 1000 + gap;
      r.waitedSince = r.nextAt;
      return;
    }

    if (r.result || r.failed) {
      this.finishScene(r);
      return;
    }
    if (r.linesDone && r.spoken > 0) {
      // The talking is over. Let them go now rather than stand about while the summary is written.
      r.releasedAt = now;
      r.handle.close();
      return;
    }
    // Nothing to say yet: the model is still writing. Show that someone is thinking.
    if (!r.dotted && now - r.waitedSince > 1.6) {
      r.dotted = true;
      const who = r.people[r.spoken % r.people.length];
      this.api.emote(who, 'dots');
    }
    // A scene that has produced nothing for a long time is let go; the brain will still fall back by itself.
    if (now - Math.max(r.startedAt, r.waitedSince) > 75) this.stopScene(true);
  }

  // ── hand-written story scenes ──────────────────────────────────────────────

  /**
   * Play a story's hand-written lines, in order, once any story scene before it has finished: what
   * is being said gives way, and no other scene starts until the last line is spoken. The speakers
   * stop and turn to each other (taking a step or two when close but not together). Voice lines
   * (someone on the phone) show as captions. With `then: 'model'` the model carries the scene on
   * afterwards, on the same subject. `done` always runs once, even if the day ends first.
   */
  playScript(lines: ScriptLine[], opts: ScriptOptions = {}): void {
    if (this.disposed || !lines.length) {
      scriptDone(opts);
      return;
    }
    this.scripts.push({ lines: [...lines], said: [], recent: [], people: [], phone: [], opts, nextAt: 0, started: false, startedAt: 0, handle: null });
  }

  private advanceScript(now: number): void {
    const sc = this.scripts[0];
    if (!sc) return;
    if (!sc.started) {
      this.beginScript(sc, now);
      return;
    }
    if (now < sc.nextAt) return;
    // A moment for the speakers to turn to each other (or take a step or two), never long.
    if (sc.handle && sc.handle.alive && !sc.handle.ready && now - sc.startedAt < 4) return;
    const line = sc.lines.shift();
    if (!line) {
      this.endScript(sc);
      return;
    }
    if (line.voice) {
      const said = `${line.voice.name}: "${line.text}"`;
      this.api.narrate(said, { icon: line.voice.icon ?? 'phone', room: line.voice.room ?? sc.opts.room, beat: true });
      sc.said.push(said);
      sc.phone.push(said);
      sc.nextAt = now + Math.max(2.5, line.text.length / 14) + 0.6;
      return;
    }
    const p = line.who ? this.api.person(line.who) : undefined;
    if (!line.who || !p || !p.present) {
      sc.nextAt = now;
      return;
    }
    const speech = this.speakScriptLine(sc, line, p);
    this.lastSpoke.set(p.id, now);
    if (speech.text) this.storySaid.add(`${p.id}|${speech.text}`);
    if (!sc.people.includes(p.id)) sc.people.push(p.id);
    sc.said.push(`${p.name}: "${line.text}"`);
    sc.recent.push({ who: p.name, say: line.text });
    if (sc.recent.length > 10) sc.recent.shift();
    sc.nextAt = now + Math.max(1.2, speech.durationMs / 1000) + 0.5;
  }

  /** Clear the floor for a story scene: what is being said gives way, and the speakers turn to each other. */
  private beginScript(sc: ScriptRun, now: number): void {
    sc.started = true;
    sc.startedAt = now;
    sc.nextAt = now + 0.3;
    const r = this.running;
    // A reaction the player asked for that has not started talking yet waits its turn instead of being lost.
    if (r && r.fromPlayer && r.spoken === 0 && !r.releasedAt) this.queue.unshift({ ask: r.ask, at: now, fromPlayer: true });
    this.stopScene(false);
    const speakers = [...new Set(sc.lines.map((l) => l.who).filter((id): id is CharId => !!id))]
      .map((id) => this.api.person(id))
      .filter((p): p is SimPerson => !!p && p.present);
    sc.handle = this.huddle(speakers);
    if (speakers.length) this.focusOn(speakers.map((p) => p.id), 9);
  }

  /**
   * Hold the speakers together while their lines are said, facing each other. Only people who are
   * free (not walking somewhere for the story, asleep or held) and in one room; close but not side by
   * side, they take a step or two; far apart, they stay where they are and just turn.
   */
  private huddle(people: SimPerson[]): SceneHandle | null {
    if (people.length < 2 || people.length > 4) return null;
    const room = people[0].room;
    if (people.some((p) => !p.available || p.urgent || p.room !== room)) return null;
    let far = 0;
    for (const a of people) for (const b of people) far = Math.max(far, Math.hypot(a.x - b.x, a.y - b.y));
    try {
      return this.sim.openScene({ id: nextId('script'), people: people.map((p) => p.id), gather: far > 2.5 * TILE && far < 9 * TILE });
    } catch {
      return null;
    }
  }

  private speakScriptLine(sc: ScriptRun, line: ScriptLine, p: SimPerson): Speech {
    const act: LineAct = line.kind === 'shout' ? 'shout' : line.kind === 'whisper' ? 'whisper' : 'none';
    if (sc.handle && sc.handle.alive && sc.handle.people.includes(p.id) && line.kind !== 'think') {
      return sc.handle.line({ who: p.id, say: line.text, feel: line.emotion ?? p.emotion, to: line.to ?? null, act });
    }
    // Not in a huddle (busy, or somewhere else): turn to whoever it is said to, or to the last speaker.
    const toward = line.to ?? [...sc.people].reverse().find((id) => id !== p.id && this.api.person(id)?.present);
    if (toward && line.kind !== 'think' && !this.api.isAirborne(p.id)) this.api.face(p.id, toward);
    return this.api.say(p.id, line.text, { kind: line.kind, emotion: line.emotion, to: line.to ?? null });
  }

  private endScript(sc: ScriptRun): void {
    if (this.scripts[0] === sc) this.scripts.shift();
    this.closeScript(sc);
    if (sc.opts.then === 'model') this.carryOn(sc);
    scriptDone(sc.opts);
  }

  private closeScript(sc: ScriptRun | undefined = this.scripts[0]): void {
    if (!sc?.handle) return;
    try {
      sc.handle.close();
    } catch {
      /* the scene may already be over */
    }
    sc.handle = null;
  }

  /** End every story scene now (the day is ending, or being skipped): each one's `done` still runs. */
  private flushScripts(): void {
    const all = this.scripts;
    this.scripts = [];
    for (const sc of all) {
      this.closeScript(sc);
      scriptDone(sc.opts);
    }
  }

  /**
   * The model takes the scene on from where the hand-written lines stop, on the same subject: the
   * lines said out loud are in "Said just before"; what a voice on the phone said is not, so it goes in
   * the reason. Written lines (no model) follow the story theme the reason is about.
   */
  private carryOn(sc: ScriptRun): void {
    const people = sc.people.filter((id) => this.canSpeak(id)).slice(0, 4);
    if (!people.length) return;
    const what = sc.opts.why?.trim() ?? '';
    const phone = sc.phone.slice(-2);
    const why = [
      what ? (/[.!?]$/.test(what) ? what : `${what}.`) : '',
      phone.length ? `On the phone: ${phone.join(' ')}` : '',
      'They carry on from what was just said, in their own words, without repeating it.'
    ].filter(Boolean).join(' ');
    const ask: SceneAsk = { people, room: sc.opts.room, trigger: 'event', priority: 9, minLines: 2, maxLines: 3, staleAfter: 40, gather: false, recent: sc.recent.slice(-10), why };
    if (what) this.tagTopic(ask, what);
    else if (phone.length) this.tagTopic(ask, phone.join(' '));
    this.enqueue(ask, false);
  }

  private finishScene(r: Running): void {
    const res = r.result;
    r.handle.close();
    this.running = null;
    this.scenesSinceMinds += 1;
    if (res) {
      if (res.source === 'model') this.lastModelActivityAt = this.api.time;
      const onlookers = this.api.peopleIn(r.room).filter((p) => p.present && !r.people.includes(p.id)).map((p) => p.id);
      // Memories and feelings are for the staff: a guest from the Anything power comes and goes.
      if (res.summary) {
        this.api.rememberRumor([...r.people, ...onlookers].filter((id): id is CharId => isCastId(id)), res.summary, 1);
        if (r.ask.priority >= 8 || res.stageAction || res.rumor) this.rememberHeadline(res.summary);
      }
      for (const s of res.shifts) {
        if (s.who === s.about || !isCastId(s.who) || !isCastId(s.about)) continue;
        const base = SHIFT_DELTA[s.change] ?? 0;
        // Story mode: today's chapter may adjust (or ignore) the change while it counts progress itself.
        const delta = this.opts.vetoShift ? this.opts.vetoShift(s.who, s.about, base) : base;
        if (delta) this.api.shiftBond(s.who, s.about, delta, s.note || res.summary);
        if (s.change === 'fancies') {
          this.api.shiftChemistry(s.who, s.about, 14);
          if (this.api.bond(s.about, s.who) >= 0) this.api.shiftChemistry(s.about, s.who, 6);
          if (this.api.chemistry(s.who, s.about) >= 50) this.api.addStatus(s.who, 'aroused', 45, s.about);
        }
      }
      if (r.ask.planKind === 'flirt' && r.people.length >= 2 && isCastId(r.people[0]) && isCastId(r.people[1])) {
        const [p0, p1] = r.people;
        this.api.shiftChemistry(p0, p1, 10);
        this.api.shiftChemistry(p1, p0, 8);
        this.api.addStatus(p1, 'flustered', 25, p0);
        if (this.api.chemistry(p0, p1) >= 45 || this.api.chemistry(p1, p0) >= 45) {
          this.api.addStatus(p0, 'aroused', 45, p1);
          this.api.addStatus(p1, 'aroused', 45, p0);
        }
      }
      if (res.rumor && this.api.time - this.lastModelRumorAt >= 60) {
        this.lastModelRumorAt = this.api.time;
        this.api.setFact('rumor:model', `Office gossip: ${res.rumor}`, 180);
        this.api.narrate(`Rumor spreads: ${res.rumor}`, { kind: 'event', icon: 'rumour', room: r.room });
        this.rememberHeadline(res.rumor);
      }
      if (res.stageAction) {
        this.executeModelStageAction(res.stageAction);
      }
      // One plan per conversation, and one follow-up at most: a plan to go straight
      // back to the person you were just talking to is only allowed once, or the
      // same two people would hold the floor all day.
      const followUp = r.ask.trigger === 'plan';
      const hotKinds = new Set(['aroused', 'flustered', 'afterglow', 'scandal', 'naked', 'bound', 'dominated', 'blackmailed', 'voyeur', 'exhibitionist']);
      const hotPair =
        !this.opts.carefulOrders?.() &&
        this.brain.kind !== 'instinct' &&
        r.people.length >= 2 &&
        (this.api.isFling(r.people[0], r.people[1]) ||
          r.people.some((id) => this.api.person(id)?.statuses.some((s) => hotKinds.has(s.kind))));
      for (const p of res.plans) {
        if (!isCastId(p.who) || !this.api.person(p.who)?.present) continue;
        const again = typeof p.plan.target === 'string' && r.people.includes(p.plan.target);
        if (res.source === 'model' && (this.tryModelRendezvous(p.who, p.plan) || this.tryModelWildAct(p.who, p.plan))) break;
        const keepGoing = hotPair && p.plan.kind !== 'talk';
        if (again && followUp && !keepGoing) continue;
        this.api.setPlan(p.who, p.plan);
        break;
      }
    }
    // Anyone keeping score (the story) hears that these people really talked.
    if (res || r.spoken > 0) {
      this.api.bus.emit('sceneDone', { people: [...r.people], trigger: r.ask.trigger, planKind: r.ask.planKind, room: r.room });
    }
    const done = this.api.time;
    for (let i = 0; i < r.people.length; i++) {
      for (let j = i + 1; j < r.people.length; j++) this.pairAt.set(pairKey(r.people[i], r.people[j]), done);
    }
    const pace = clampPace(this.opts.pace?.() ?? 1);
    // Busier offices talk more: the gap shrinks with chaos.
    const calm = 1 - Math.min(1, this.api.chaos / 100) * 0.6;
    // Written lines repeat sooner than a model's, so without a model the pauses are longer.
    const canned = !this.brain.autonomous || this.brain.kind === 'instinct' ? 2.4 : 1;
    this.ambientAt = this.api.time + (5 + this.api.rng() * 6) * calm * canned / pace;
    this.report();

    const del = r.ask.delegation;
    if (del) {
      const nextDepth = (del.depth ?? 0) + 1;
      const nextAllowDelegate = nextDepth <= 1;
      const cmd = del.command || del.action;
      // Only someone who spoke in this scene and did not refuse in their own words goes along with it:
      // the reply may name people who never said a word, or contradict what they said.
      const agreed = (id: CharId): boolean => {
        const own = res?.lines.filter((l) => l.who === id) ?? [];
        return own.length > 0 && !own.some((l) => saysNo(l.say));
      };
      if (del.executor === 'asker') {
        if (res?.complies && del.asker !== 'loudspeaker' && agreed(del.target)) {
          const askerId = del.asker;
          const askerPerson = this.api.person(askerId);
          if (askerPerson && askerPerson.present && !this.api.hasStatus(askerId, 'eliminated') && !this.api.hasStatus(askerId, 'quit')) {
            const steps = splitCompoundDirective(cmd);
            const first = steps[0] || cmd;
            if (steps.length > 1) this.directives.queueChain(askerId, steps.slice(1), 'cue', false);
            this.dispatchDirective(askerId, first, 'cue', () => {
              const cur = this.api.person(askerId);
              if (!cur) return;
              const rName = roomDef(cur.room).name;
              this.api.react(askerId, 'cheer', 1.4);
              this.api.fx({ kind: 'burst', what: 'sparkles', x: cur.x, y: cur.y - 14, count: 10 });
              this.api.narrate(`${cur.name} gets the go-ahead in ${rName} and does it: ${cmd}!`, { kind: 'event', icon: 'tell', room: cur.room, beat: true });
              const witnesses = this.companions(cur, 2);
              this.enqueue({
                people: [askerId, ...witnesses],
                room: cur.room,
                trigger: 'aftermath',
                why: `${cur.name} just got permission and physically did this in ${rName}: ${cmd}. React directly to what ${cur.name} just did!`,
                priority: 10,
                minLines: witnesses.length ? 2 : 1,
                maxLines: witnesses.length ? 3 : 2,
                staleAfter: 40
              }, true);
            }, false, nextDepth);
          }
        }
      } else {
        const rawCompliers = res?.complies === false
          ? []
          : del.targets && del.targets.length > 1
            ? (res?.compliers ?? (res?.complies ? [del.target] : []))
            : (res?.complies ? [del.target] : []);
        const compliers = [...new Set(rawCompliers)].filter((tid) => {
          const tp = this.api.person(tid);
          return !!tp && tp.present && agreed(tid) && !this.api.hasStatus(tid, 'eliminated') && !this.api.hasStatus(tid, 'quit');
        });
        if (compliers.length) {
          // Mutual two-person act ("tell Jim and Pam to kiss"): Jim walks up and kisses Pam rather than both acting at thin air.
          const mutualMatch = /^(?:to\s+)?(kiss|make\s+out(?:\s+with)?|hug|cuddle|slow\s+dance(?:\s+with)?|flirt(?:\s+with)?|massage|sneak\s+(?:away|off)(?:\s+with)?|fight|brawl|wrestle|slap|punch|hook\s+up(?:\s+with)?|sleep\s+together|have\s+sex(?:\s+with)?)(?:\s+(?:with\s+)?each\s+other)?[.!?]*$/i.exec(cmd.trim());
          if (mutualMatch && compliers.length === 2 && del.targets?.length === 2) {
            const [aId, bId] = compliers;
            const bName = this.api.person(bId)?.name.split(/\s+/)[0] ?? bId;
            const baseVerb = mutualMatch[1].replace(/\s+with$/i, '');
            const lowVerb = baseVerb.toLowerCase();
            const mutualCmd = lowVerb === 'make out' || lowVerb === 'hook up' || lowVerb === 'have sex' || lowVerb === 'slow dance' || lowVerb === 'flirt' || lowVerb === 'sneak away' || lowVerb === 'sneak off'
              ? `${baseVerb} with ${bName}`
              : lowVerb === 'sleep together'
                ? `sleep with ${bName}`
                : `${baseVerb} ${bName}`;
            const fallbackMutual = () => {
              const cur = this.api.person(aId);
              if (!cur) return;
              const rName = roomDef(cur.room).name;
              this.api.react(aId, 'cheer', 1.4);
              this.api.fx({ kind: 'burst', what: 'sparkles', x: cur.x, y: cur.y - 14, count: 10 });
              this.api.narrate(`${cur.name} goes through with it in ${rName}: ${mutualCmd}!`, { kind: 'event', icon: 'tell', room: cur.room, beat: true });
              this.enqueue({
                people: [aId, bId],
                room: cur.room,
                trigger: 'aftermath',
                why: `${cur.name} and ${bName} just agreed to ${del.action} and actually do it in ${rName}!`,
                priority: 10,
                minLines: 2,
                maxLines: 3,
                staleAfter: 40
              }, true);
            };
            this.dispatchDirective(aId, mutualCmd, 'cue', fallbackMutual, false, nextDepth);
          } else {
            for (const tid of compliers) {
              const steps = splitCompoundDirective(cmd);
              const first = steps[0] || cmd;
              if (steps.length > 1) this.directives.queueChain(tid, steps.slice(1), 'cue', false);
              this.dispatchDirective(tid, first, 'cue', () => {
                const cur = this.api.person(tid);
                if (!cur) return;
                const rName = roomDef(cur.room).name;
                this.api.react(tid, 'cheer', 1.4);
                this.api.fx({ kind: 'burst', what: 'sparkles', x: cur.x, y: cur.y - 14, count: 10 });
                this.api.narrate(`${cur.name} actually goes through with it in ${rName}: ${del.action}!`, { kind: 'event', icon: 'tell', room: cur.room, beat: true });
                const witnesses = this.companions(cur, 2);
                this.enqueue({
                  people: [tid, ...witnesses],
                  room: cur.room,
                  trigger: 'aftermath',
                  why: `${cur.name} just agreed to and physically did this in ${rName}: ${del.action}. React directly to ${cur.name} doing it!`,
                  priority: 10,
                  minLines: witnesses.length ? 2 : 1,
                  maxLines: witnesses.length ? 3 : 2,
                  staleAfter: 40
                }, true);
              }, nextAllowDelegate, nextDepth);
            }
          }
        }
      }
    }
  }

  /** Abandon the scene in progress (the people are released; nothing is remembered). */
  private stopScene(tellPeople: boolean): void {
    const r = this.running;
    if (!r) return;
    r.abort.abort();
    r.handle.close();
    this.running = null;
    if (tellPeople && r.spoken > 0 && !r.releasedAt) this.api.remember(r.people, 'A conversation was cut short.');
    this.report();
  }

  private buildRequest(id: string, ask: SceneAsk, ids: CharId[], room: RoomId): SceneRequest {
    const delExtra = ask.delegation
      ? this.api
          .people()
          .filter((p) => p.isCast && p.present && !ids.includes(p.id) && mentions(withoutRooms(ask.delegation!.action), p.name))
          .map((p) => p.id)
      : [];
    const localCast = this.api.peopleIn(room).filter((p) => p.present && p.isCast && !ids.includes(p.id));
    const roomRomantics = localCast
      .filter((o) =>
        ids.some(
          (w) =>
            this.api.chemistry(w, o.id) >= 40 ||
            this.api.chemistry(o.id, w) >= 40 ||
            this.api.isFling(w, o.id)
        )
      )
      .map((o) => o.id)
      .slice(0, 2);
    const people = ids.map((who) =>
      this.sim.briefFor(who, [...new Set([...ids.filter((o) => o !== who), ...delExtra, ...roomRomantics])])
    );
    const onlookers = this.api.peopleIn(room).filter((p) => p.present && !ids.includes(p.id)).map((p) => p.name).slice(0, 5);
    const solo = ids.length === 1;
    const lively = this.api.chaos > 45;
    const modelActive = this.brain.kind !== 'instinct';
    const topic = this.topicFor(ask);
    const facts = this.sim.facts().slice(0, modelActive ? 12 : 10);
    if (
      ids.length === 2 &&
      (room === 'annex' || room === 'meeting' || room === 'boss' || room === 'accounts') &&
      onlookers.length === 0
    ) {
      facts.push(`They are alone together in ${roomDef(room).name} with nobody else watching.`);
    }
    if (getWorldLocation() === 'park') {
      facts.push('Everyone is outdoors at Scranton Community Park, away from the usual office rules.');
    }
    const recent = ask.recent ?? this.sim.recentLines(room, modelActive ? 10 : 5);
    if (modelActive && recent.length < 3) {
      const seenLine = new Set(recent.map((l) => `${l.who}:${l.say}`));
      for (const id of ids) {
        const last = this.lastSpokenByPerson.get(id);
        if (last && this.api.time - last.at <= 150 && !seenLine.has(`${last.who}:${last.say}`)) {
          recent.push({ who: last.who, say: last.say });
          seenLine.add(`${last.who}:${last.say}`);
        }
      }
    }
    const unleashedArc = modelActive && !solo && !this.opts.carefulOrders?.();
    const dramatic = ask.priority >= 8 && !solo;
    const defaultMin = unleashedArc
      ? (dramatic ? (ids.length >= 3 ? 5 : 4) : 3)
      : (solo ? 1 : 2);
    const defaultMax = solo
      ? 2
      : unleashedArc
        ? (dramatic ? (ids.length >= 3 ? 7 : 6) : (ids.length >= 3 ? 6 : 5))
        : modelActive
          ? (dramatic ? 5 : lively ? 4 : 3)
          : (lively ? 4 : 3);
    const minLines = unleashedArc ? Math.max(ask.minLines ?? 0, defaultMin) : (ask.minLines ?? defaultMin);
    const maxLines = unleashedArc ? Math.max(minLines, ask.maxLines ?? 0, defaultMax) : (ask.maxLines ?? defaultMax);
    return {
      id,
      day: this.api.day,
      clock: formatClock(this.api.clock),
      place: roomDef(room).name,
      trigger: ask.trigger as SceneTrigger,
      why: ask.why,
      people,
      onlookers,
      facts,
      ...(modelActive && this.dayHeadlines.length ? { headlines: this.dayHeadlines.slice(-6) } : {}),
      recent,
      minLines,
      maxLines,
      chaos: Math.min(1, this.api.chaos / 100),
      ...(modelActive ? { unleashed: true } : {}),
      ...(topic ? { topic } : {}),
      ...(ask.delegation ? { delegation: ask.delegation } : {})
    };
  }

  // ── people on their own: thoughts and plans ────────────────────────────────

  private mindsRound(count = 3): void {
    // Without a model that may run on a timer, the sim's own routine is the mind.
    if (!this.brain.autonomous || this.brain.kind === 'instinct') return;
    const now = this.api.time;
    const free = this.api
      .people()
      .filter((p) => p.present && p.available && p.isCast && !p.plan && now - (this.lastMinded.get(p.id) ?? -999) > 50)
      .sort((a, b) => (b.conviction ? 1 : 0) - (a.conviction ? 1 : 0) || (this.lastMinded.get(a.id) ?? -999) - (this.lastMinded.get(b.id) ?? -999))
      .slice(0, count);
    if (free.length < 2) return;
    for (const p of free) this.lastMinded.set(p.id, now);
    const ids = free.map((p) => p.id);
    const presentCast = this.api.people().filter((p) => p.present && p.isCast);
    const others = this.api.people().filter((p) => p.present).map((p) => ({ id: p.id, name: p.name, place: roomDef(p.room).name }));
    this.sideN += 1;
    this.report();
    const abort = new AbortController();
    this.mindsAbort = abort;
    void this.brain
      .minds({
        id: nextId('minds'),
        day: this.api.day,
        clock: formatClock(this.api.clock),
        people: free.map((p) => {
          const linked = this.romanticLinksFor(p.id, presentCast);
          const withIds = [...new Set([...ids.filter((o) => o !== p.id), ...linked])];
          return { ...this.sim.briefFor(p.id, withIds), place: roomDef(p.room).name, doing: p.doing };
        }),
        facts: this.sim.facts().slice(0, 8),
        ...(this.dayHeadlines.length ? { headlines: this.dayHeadlines.slice(-4) } : {}),
        allowed: [...PLAN_KINDS],
        others,
        chaos: Math.min(1, this.api.chaos / 100)
      }, abort.signal)
      .then((minds) => {
        if (!this.disposed && !abort.signal.aborted) this.applyMinds(minds);
      })
      .catch(() => undefined)
      .finally(() => {
        if (this.mindsAbort === abort) this.mindsAbort = null;
        this.sideN = Math.max(0, this.sideN - 1);
        this.report();
      });
  }

  private applyMinds(minds: MindResult[]): void {
    this.lastModelActivityAt = this.api.time;
    let shown = 0;
    for (const m of minds) {
      const p = this.api.person(m.who);
      if (!p || !p.present || !p.available) continue;
      this.api.feel(m.who, m.feel, 0.6, 6);
      if (m.thought) {
        this.api.setThought(m.who, m.thought);
        // One or two thought bubbles is charming; a room full of them is noise.
        if (shown < 2) {
          this.api.say(m.who, m.thought, { kind: 'think', emotion: m.feel });
          shown += 1;
        }
      }
      if (m.plan && m.plan.kind !== 'work') {
        if (!this.tryModelRendezvous(m.who, m.plan) && !this.tryModelWildAct(m.who, m.plan)) this.api.setPlan(m.who, m.plan);
      }
    }
  }

  private romanticLinksFor(who: CharId, pool: readonly SimPerson[]): CharId[] {
    return pool
      .filter((o) => o.id !== who && (this.api.isFling(who, o.id) || this.api.chemistry(who, o.id) >= 35))
      .sort((a, b) => (this.api.isFling(who, b.id) ? 100 : this.api.chemistry(who, b.id)) - (this.api.isFling(who, a.id) ? 100 : this.api.chemistry(who, a.id)))
      .slice(0, 2)
      .map((o) => o.id);
  }

  /** Turn bold model-chosen flirt/hookup plans into an actual private-room rendezvous on the floor. */
  private tryModelRendezvous(who: CharId, plan: Plan): boolean {
    if (plan.kind !== 'flirt' || typeof plan.target !== 'string' || !isCastId(who) || !isCastId(plan.target)) return false;
    if (this.opts.carefulOrders?.() || this.api.time - this.lastAutoRendezvousAt < 75) return false;
    if (this.opts.pinned?.(who) || this.opts.pinned?.(plan.target)) return false;
    const a = this.api.person(who);
    const t = this.api.person(plan.target);
    if (!a || !t || !a.present || !t.present || !a.available || !t.available || a.sceneId || t.sceneId) return false;
    if (this.api.hasStatus(who, 'eliminated') || this.api.hasStatus(plan.target, 'eliminated') || this.api.hasStatus(who, 'quit') || this.api.hasStatus(plan.target, 'quit')) return false;
    const fling = this.api.isFling(who, plan.target);
    const chemA = this.api.chemistry(who, plan.target);
    const chemB = this.api.chemistry(plan.target, who);
    const aroused = a.statuses.some((s) => s.kind === 'aroused') || t.statuses.some((s) => s.kind === 'aroused');
    const wantsPrivate = /\b(sneak|hook\s*up|quickie|get\s+a\s+room|annex|conference\s+room|closet|alone|fool\s+around|private)\b/i.test(plan.about ?? '');
    const shouldGo = (wantsPrivate && (fling || chemA >= 55 || aroused)) || ((fling || Math.min(chemA, chemB) >= 70) && aroused);
    if (!shouldGo) return false;
    this.lastAutoRendezvousAt = this.api.time;
    const raw = `sneak away with ${t.name}`;
    return this.directives.start(who, {
      verb: 'romance',
      targetPerson: plan.target,
      targetRoom: null,
      power: 'none',
      item: '',
      summary: `sneaks away with ${t.name}`,
      source: 'model'
    }, raw, 'cue', 0);
  }

  /** Trigger spontaneous stripping or bold stunts from autonomous model plans in unlocked modes. */
  private tryModelWildAct(who: CharId, plan: Plan): boolean {
    if (!isCastId(who) || this.opts.carefulOrders?.() || this.opts.pinned?.(who)) return false;
    if (this.api.time - this.lastAutoWildAt < 45) return false;
    const a = this.api.person(who);
    if (!a || !a.present || !a.available || a.sceneId) return false;
    if (this.api.hasStatus(who, 'eliminated') || this.api.hasStatus(who, 'quit') || this.api.hasStatus(who, 'naked')) return false;

    const about = (plan.about ?? '').toLowerCase();
    const wantsStrip = /\b(strip|naked|nude|flash|undress|streak|clothes\s+off|topless|skinny)\b/.test(about);
    const wantsTableDance = /\b(table\s*danc|exhibition)\b/.test(about);
    const wantsKink = /\b(whip|cuff|handcuff|tie\s+up|dominat|worship|lick|kink)\b/.test(about);
    const wantsBlackmail = /\b(blackmail|extort)\b/.test(about);
    const wantsVoyeur = /\b(peep|voyeur|spy)\b/.test(about);
    const wantsLap = /\b(lap\s*danc|twerk|grind|seduce|show\s+off)\b/.test(about);
    const wildCast = who === 'meredith' || who === 'creed' || who === 'kelly' || who === 'ryan' || who === 'michael' || who === 'andy' || who === 'kevin';
    const hot = a.statuses.some((s) => s.kind === 'aroused' || s.kind === 'party' || s.kind === 'afterglow' || s.kind === 'exhibitionist');
    const chaotic = this.api.chaos >= 55;
    const boldPlan = plan.kind === 'flirt' || plan.kind === 'prank' || plan.kind === 'wander';
    if (!wantsStrip && !wantsTableDance && !wantsKink && !wantsBlackmail && !wantsVoyeur && !wantsLap && !((wildCast || chaotic) && hot && boldPlan)) return false;

    this.lastAutoWildAt = this.api.time;
    const tId = typeof plan.target === 'string' && isCastId(plan.target) && plan.target !== who && !this.opts.pinned?.(plan.target)
      ? plan.target
      : null;
    const t = tId ? this.api.person(tId) : undefined;
    const targetOk = !!t && t.present && !this.api.hasStatus(t.id, 'eliminated') && !this.api.hasStatus(t.id, 'quit');
    if (wantsBlackmail && targetOk) {
      return this.directives.start(who, {
        verb: 'romance',
        targetPerson: t.id,
        targetRoom: null,
        power: 'none',
        item: '',
        summary: `blackmails ${t.name} with dirty secrets`,
        source: 'model'
      }, `blackmail ${t.name}`, 'cue', 0);
    }
    if (wantsKink && targetOk) {
      const summary = /\bcuff|tie/.test(about)
        ? `handcuffs ${t.name} in a kinky dare`
        : /\bworship/.test(about)
          ? `worships at ${t.name}'s feet`
          : /\bwhip/.test(about)
            ? `playfully whips ${t.name}`
            : /\blick/.test(about)
              ? `licks ${t.name} shamelessly`
              : `dominates ${t.name} in a kinky dare`;
      const raw = /\bcuff|tie/.test(about)
        ? `handcuff ${t.name}`
        : /\bworship/.test(about)
          ? `worship ${t.name}`
          : /\bwhip/.test(about)
            ? `whip ${t.name}`
            : /\blick/.test(about)
              ? `lick ${t.name}`
              : `dominate ${t.name}`;
      return this.directives.start(who, {
        verb: 'romance',
        targetPerson: t.id,
        targetRoom: null,
        power: 'none',
        item: '',
        summary,
        source: 'model'
      }, raw, 'cue', 0);
    }
    if (wantsVoyeur) {
      return this.directives.start(who, {
        verb: targetOk ? 'romance' : 'perform',
        targetPerson: targetOk ? t.id : null,
        targetRoom: null,
        power: 'none',
        item: '',
        summary: targetOk ? `peeps shamelessly on ${t.name}` : 'sneaks a voyeur peek around the room',
        source: 'model'
      }, targetOk ? `peep on ${t.name}` : 'peep around', 'cue', 0);
    }
    if (wantsTableDance) {
      return this.directives.start(who, {
        verb: 'expose',
        targetPerson: targetOk ? t.id : null,
        targetRoom: null,
        power: 'none',
        item: '',
        summary: 'puts on a tabletop strip show',
        source: 'model'
      }, 'table dance and strip naked', 'cue', 0);
    }
    if (wantsLap && /\blap\s*danc|seduce|grind/.test(about) && targetOk) {
      return this.directives.start(who, {
        verb: 'romance',
        targetPerson: t.id,
        targetRoom: null,
        power: 'none',
        item: '',
        summary: `gives ${t.name} an impromptu lap dance`,
        source: 'model'
      }, `give ${t.name} a lap dance`, 'cue', 0);
    }
    if (wantsLap && /\btwerk/.test(about)) {
      return this.directives.start(who, {
        verb: 'perform',
        targetPerson: targetOk ? t.id : null,
        targetRoom: null,
        power: 'none',
        item: '',
        summary: 'twerks shamelessly right on the floor',
        source: 'model'
      }, 'twerk wildly', 'cue', 0);
    }
    return this.directives.start(who, {
      verb: 'expose',
      targetPerson: targetOk ? t.id : null,
      targetRoom: null,
      power: 'none',
      item: '',
      summary: wantsStrip ? 'rips off their clothes completely naked' : 'strips naked without warning',
      source: 'model'
    }, targetOk ? `strip naked in front of ${t.name}` : 'strip naked', 'cue', 0);
  }

  /** Execute a physical act triggered organically by the model from scene dialogue. */
  private executeModelStageAction(act: StageAction): boolean {
    if (this.api.time - this.lastModelActionAt < 18) return false;
    if (this.opts.pinned?.(act.actor) || (act.target && this.opts.pinned?.(act.target))) return false;
    const grave = new Set<StageAction['kind']>(['slap', 'shove', 'splash_drink', 'steal', 'walk_out', 'blackmail']);
    if (this.opts.carefulOrders?.() && grave.has(act.kind)) return false;
    const a = this.api.person(act.actor);
    if (!a || !a.present || this.api.hasStatus(act.actor, 'eliminated') || this.api.hasStatus(act.actor, 'quit')) return false;
    const t = act.target ? this.api.person(act.target) : undefined;
    if (act.target && (!t || !t.present || this.api.hasStatus(act.target, 'eliminated') || this.api.hasStatus(act.target, 'quit'))) return false;
    const tName = t?.name ?? 'someone';
    let res: DirectiveResult;
    let raw: string;
    switch (act.kind) {
      case 'kiss':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: `kisses ${tName}`, source: 'model' };
        raw = `kiss ${tName}`;
        break;
      case 'make_out':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: `makes out with ${tName}`, source: 'model' };
        raw = `make out with ${tName}`;
        break;
      case 'flirt':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: `flirts shamelessly with ${tName}`, source: 'model' };
        raw = `flirt with ${tName}`;
        break;
      case 'hug':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: `pulls ${tName} into a close hug`, source: 'model' };
        raw = `hug ${tName}`;
        break;
      case 'sneak_away':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: `sneaks away with ${tName}`, source: 'model' };
        raw = `sneak away with ${tName}`;
        break;
      case 'strip':
        res = { verb: 'expose', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || 'strips completely naked', source: 'model' };
        raw = act.target ? `strip naked in front of ${tName}` : 'strip naked';
        break;
      case 'flash':
        res = { verb: 'expose', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || (act.target ? `flashes ${tName}` : 'flashes everyone'), source: 'model' };
        raw = act.target ? `flash ${tName}` : 'flash everyone';
        break;
      case 'lap_dance':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `gives ${tName} a shameless lap dance`, source: 'model' };
        raw = `give ${tName} a lap dance`;
        break;
      case 'grope':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `gropes and spanks ${tName}`, source: 'model' };
        raw = `grope and spank ${tName}`;
        break;
      case 'quickie':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `pulls ${tName} into a frantic quickie`, source: 'model' };
        raw = `have a quickie with ${tName}`;
        break;
      case 'whip':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `playfully whips ${tName}`, source: 'model' };
        raw = `whip ${tName}`;
        break;
      case 'tie_up':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `handcuffs ${tName} in a kinky dare`, source: 'model' };
        raw = `handcuff ${tName}`;
        break;
      case 'worship':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `drops to worship ${tName}`, source: 'model' };
        raw = `worship ${tName}`;
        break;
      case 'dominate':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `dominates ${tName}`, source: 'model' };
        raw = `dominate ${tName}`;
        break;
      case 'lick':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `licks ${tName} shamelessly`, source: 'model' };
        raw = `lick ${tName}`;
        break;
      case 'table_dance':
        res = { verb: 'expose', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || 'puts on a tabletop strip show', source: 'model' };
        raw = 'table dance and strip naked';
        break;
      case 'cowgirl':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `rides ${tName} cowgirl-style`, source: 'model' };
        raw = `cowgirl with ${tName}`;
        break;
      case 'reverse_cowgirl':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `rides ${tName} reverse cowgirl`, source: 'model' };
        raw = `reverse cowgirl with ${tName}`;
        break;
      case 'missionary':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `pins ${tName} down missionary-style`, source: 'model' };
        raw = `missionary with ${tName}`;
        break;
      case 'doggy':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `takes ${tName} from behind`, source: 'model' };
        raw = `doggy-style with ${tName}`;
        break;
      case 'blowjob':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `goes down on ${tName}`, source: 'model' };
        raw = `give ${tName} a blowjob`;
        break;
      case 'handjob':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `works ${tName} with a handjob`, source: 'model' };
        raw = `give ${tName} a handjob`;
        break;
      case 'fingering':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `fingers ${tName} shamelessly`, source: 'model' };
        raw = `finger ${tName}`;
        break;
      case 'sixty_nine':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `twists into a 69 with ${tName}`, source: 'model' };
        raw = `sixty-nine with ${tName}`;
        break;
      case 'facesit':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `sits on ${tName}'s face`, source: 'model' };
        raw = `sit on ${tName}'s face`;
        break;
      case 'orgasm':
        res = act.target
          ? { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `makes ${tName} climax`, source: 'model' }
          : { verb: 'perform', targetPerson: null, targetRoom: null, power: 'none', item: '', summary: act.detail || 'climaxes shamelessly', source: 'model' };
        raw = act.target ? `make ${tName} orgasm` : 'orgasm shamelessly';
        break;
      case 'blackmail':
        res = { verb: 'romance', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || `blackmails ${tName} over dirty secrets`, source: 'model' };
        raw = `blackmail ${tName}`;
        break;
      case 'peep':
        res = { verb: act.target ? 'romance' : 'perform', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || (act.target ? `peeps on ${tName}` : 'peeps around'), source: 'model' };
        raw = act.target ? `peep on ${tName}` : 'peep around';
        break;
      case 'exhibit':
        res = { verb: 'expose', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || 'puts on a brazen exhibitionist strip show', source: 'model' };
        raw = act.target ? `strip naked in front of ${tName}` : 'exhibitionist strip show';
        break;
      case 'twerk':
        res = { verb: 'perform', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || 'twerks shamelessly right on the floor', source: 'model' };
        raw = 'twerk wildly';
        break;
      case 'stunt':
        res = { verb: 'perform', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: act.detail || 'does a wild backflip', source: 'model' };
        raw = act.detail || 'backflip';
        break;
      case 'slap':
        res = { verb: 'knockout', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: `slaps ${tName}`, source: 'model' };
        raw = `slap ${tName}`;
        break;
      case 'shove':
        res = { verb: 'shove', targetPerson: act.target, targetRoom: null, power: 'none', item: '', summary: `shoves ${tName}`, source: 'model' };
        raw = `shove ${tName}`;
        break;
      case 'splash_drink':
        res = { verb: 'shove', targetPerson: act.target, targetRoom: null, power: 'none', item: 'coffee', summary: `splashes coffee on ${tName}`, source: 'model' };
        raw = `splash coffee on ${tName}`;
        break;
      case 'steal': {
        const item = act.detail || 'stapler';
        res = { verb: 'steal', targetPerson: act.target, targetRoom: null, power: 'none', item, summary: `snatches ${tName}'s ${item}`, source: 'model' };
        raw = `steal ${tName}'s ${item}`;
        break;
      }
      case 'walk_out':
        res = { verb: 'walk_out', targetPerson: null, targetRoom: null, power: 'none', item: '', summary: 'storms out for the day', source: 'model' };
        raw = 'quit';
        break;
      default:
        return false;
    }
    this.lastModelActionAt = this.api.time;
    return this.directives.start(act.actor, res, raw, 'cue', 0);
  }

  /** An idle thought from the written bank, only when no autonomous model is actively running the show. */
  private async musing(): Promise<void> {
    if (this.api.chaos > 60) return;
    if (this.brain.kind !== 'instinct' && this.brain.autonomous) {
      if (this.running || this.sideN > 0 || this.api.time - this.lastModelActivityAt < 55) return;
    }
    const now = this.api.time;
    const idle = this.api.people().filter((p) => p.present && p.available && p.isCast && !p.speaking && now - (this.lastSpoke.get(p.id) ?? -99) > 20);
    if (!idle.length) return;
    const p = idle[Math.floor(this.api.rng() * idle.length)];
    // Story mode: now and then the idle thought is about what the office is talking about.
    const topics = this.storyTopics();
    const theme = topics.length && this.api.rng() < STORY_SHARE ? storyThemeOf(topics[Math.floor(this.api.rng() * topics.length)]) : null;
    try {
      const [m] = await this.instinct.minds({
        id: nextId('muse'),
        day: this.api.day,
        clock: formatClock(this.api.clock),
        people: [{ ...this.sim.briefFor(p.id, []), place: roomDef(p.room).name, doing: p.doing }],
        facts: [],
        allowed: ['work'],
        others: [],
        chaos: 0,
        ...(theme ? { topic: theme } : {})
      });
      const again = this.api.person(p.id);
      if (this.disposed || !m?.thought || !again || !again.present || !again.available || again.speaking) return;
      this.lastSpoke.set(p.id, this.api.time);
      this.api.say(p.id, m.thought, { kind: 'think', emotion: m.feel, quiet: true });
    } catch {
      /* a missed musing does not matter */
    }
  }

  // ── free-text events ───────────────────────────────────────────────────────

  // ── the end of the day ─────────────────────────────────────────────────────

  /** Ask for the day's write-up. Always resolves (the brain falls back to a plain summary). */
  async writeReport(
    stats: { incidents: number; stockStart: number; stockEnd: number; morale: number; chaosPeak: number },
    story?: StoryReportInfo,
    /** Called at once with the quick written summary, so the report never sits empty while a slow model writes. */
    onDraft?: (draft: ReportResult) => void
  ): Promise<ReportResult> {
    this.flushScripts();
    this.stopScene(false);
    this.queue.length = 0;
    const req = {
      id: nextId('report'),
      day: this.api.day,
      log: pickLog(this.sim.dayLog(), REPORT_LOG),
      stats,
      people: this.api.people().filter((p) => p.isCast).map((p) => ({ id: p.id, name: p.name, mood: p.emotion })),
      ...(story ? { story } : {})
    };
    this.sideN += 1;
    this.report();
    if (onDraft) {
      void this.instinct.report(req).then((d) => {
        try {
          onDraft(d);
        } catch (err) {
          console.error('[director] report draft failed', err);
        }
      }, () => undefined);
    }
    let res: ReportResult;
    try {
      // Ending the day is something the player's play led to, so the model may write it.
      res = await this.brain.report(req);
    } catch {
      res = await this.instinct.report(req);
    } finally {
      this.sideN = Math.max(0, this.sideN - 1);
      this.report();
    }
    this.sim.setTakeaways(res.takeaways.filter((t) => isCastId(t.who) && !!t.text));
    return res;
  }

  /**
   * Quotes of the day, from the day's spoken lines (in order): lines from the story's scenes first,
   * up to two of them, spread through the day, then the rest. Returned in the order they were said.
   */
  pickQuotes<T extends { who?: CharId; text: string }>(items: readonly T[], n: number): T[] {
    if (n <= 0 || !items.length) return [];
    const story = items.filter((f) => !!f.who && this.storySaid.has(`${f.who}|${f.text}`));
    const rest = items.filter((f) => !story.includes(f));
    const chosen = spreadOut(story, Math.min(story.length, Math.max(1, n - 1)));
    for (const f of spreadOut(rest, n - chosen.length)) chosen.push(f);
    return chosen.sort((a, b) => items.indexOf(a) - items.indexOf(b)).slice(0, n);
  }

  // ── choosing people ────────────────────────────────────────────────────────

  private talkedLately(a: CharId, b: CharId, now: number): boolean {
    if (this.brain.kind === 'instinct' || this.opts.carefulOrders?.()) {
      return now - (this.pairAt.get(pairKey(a, b)) ?? -999) < 90;
    }
    const pa = this.api.person(a);
    const pb = this.api.person(b);
    const hotKinds = new Set(['aroused', 'flustered', 'afterglow', 'scandal', 'naked', 'bound', 'dominated', 'blackmailed', 'voyeur', 'exhibitionist']);
    const hot =
      this.api.isFling(a, b) ||
      !!pa?.statuses.some((s) => hotKinds.has(s.kind)) ||
      !!pb?.statuses.some((s) => hotKinds.has(s.kind));
    return now - (this.pairAt.get(pairKey(a, b)) ?? -999) < (hot ? 40 : 90);
  }

  private canSpeak(id: CharId): boolean {
    const p = this.api.person(id);
    return !!p && p.present && !p.sceneId && !p.statuses.some((s) => s.kind === 'asleep' || s.kind === 'frozen' || s.kind === 'abducted' || s.kind === 'knockedOut' || s.kind === 'eliminated' || s.kind === 'quit');
  }

  /** People close enough to be drawn into whatever `p` is doing. */
  private companions(p: SimPerson, max: number): CharId[] {
    return this.api
      .peopleNear(p.x, p.y, 56)
      .filter((o) => o.id !== p.id && o.isCast && this.canSpeak(o.id))
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
      .slice(0, max)
      .map((o) => o.id);
  }

  private pickFromRoom(room: RoomId, max: number): CharId[] {
    const now = this.api.time;
    return this.api
      .peopleIn(room)
      .filter((p) => p.isCast && this.canSpeak(p.id))
      // Whoever has been quiet longest gets the floor.
      .sort((a, b) => (this.lastSpoke.get(a.id) ?? -999) - (this.lastSpoke.get(b.id) ?? -999) || (now % 2 ? 1 : -1))
      .slice(0, max)
      .map((p) => p.id);
  }

  private busiestRoom(skip: readonly CharId[] = []): TargetRoomId {
    let best: TargetRoomId = 'bullpen';
    let n = -1;
    for (const id of TARGET_ROOMS) {
      const c = this.api.peopleIn(id).filter((p) => p.present && !skip.includes(p.id)).length;
      if (c > n) {
        n = c;
        best = id;
      }
    }
    return best;
  }

  /** The most people who are in one room together and able to talk (leaving out `skip`). */
  private biggestGroup(max: number, skip: readonly CharId[] = []): CharId[] {
    const room = this.busiestRoom(skip);
    const picked = this.pickFromRoom(room, max).filter((id) => !skip.includes(id));
    if (picked.length >= 2) return picked;
    return this.api.people().filter((p) => p.isCast && this.canSpeak(p.id) && !skip.includes(p.id)).slice(0, max).map((p) => p.id);
  }

  private focusOn(ids: CharId[], priority: number): void {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const p = this.api.person(id);
      if (!p) continue;
      x0 = Math.min(x0, p.x - 14);
      x1 = Math.max(x1, p.x + 14);
      y0 = Math.min(y0, p.y - 40);
      y1 = Math.max(y1, p.y + 8);
    }
    if (!Number.isFinite(x0)) return;
    this.api.bus.emit('focus', { x: x0, y: y0, w: x1 - x0, h: y1 - y0, weight: Math.min(1, 0.2 + priority / 12), holdMs: 5200 });
  }

  private report(): void {
    const r = this.running;
    const waiting = (r !== null && r.result === null && !r.failed) || this.sideN > 0;
    const source = r?.result ? r.result.source : waiting ? 'model' : null;
    this.opts.onBusy?.({ thinking: waiting, queued: this.queue.length, source });
  }
}

// ── small helpers ────────────────────────────────────────────────────────────

/** Strip control characters and trim: the only cleaning player text gets. The model's house rules do the rest. */
function tidy(text: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** How many lines of the day's log the report is written from (the prompt keeps them all). */
const REPORT_LOG = 30;
/** Lines that open and close every day: no news in them. */
const ROUTINE_LINE = /staff are arriving for work|^it's five o'clock|^day \d+ is over/i;
/** A spoken line in the log: `Jim: "Morning."` */
const SPOKEN_LINE = /^[^:"]{1,40}: ".*"$/;

/**
 * The lines the day's write-up works from: everything that happened (story beats, events), newest
 * kept if there are too many, then the newest spoken lines to fill up, all in the order they came.
 * The last forty lines alone would be the afternoon's chatter, with the morning's story cut off.
 */
export function pickLog(log: readonly string[], max: number): string[] {
  const lines = log.map((l, i) => ({ l: l.trim(), i })).filter((x) => x.l && !ROUTINE_LINE.test(x.l));
  const events = lines.filter((x) => !SPOKEN_LINE.test(x.l));
  const spoken = lines.filter((x) => SPOKEN_LINE.test(x.l));
  const keep = events.slice(-Math.ceil(max * 0.7));
  for (const x of spoken.slice(-(max - keep.length))) keep.push(x);
  return keep.sort((a, b) => a.i - b.i).slice(-max).map((x) => x.l);
}

/** Up to n items spread through a list (first, middle, last...). */
function spreadOut<T>(items: readonly T[], n: number): T[] {
  if (n <= 0) return [];
  if (items.length <= n) return [...items];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[Math.floor(((i + 0.5) / n) * items.length)]);
  return out;
}

/** Tell a story scene's owner it is over; a mistake there must not stop the director. */
function scriptDone(opts: ScriptOptions): void {
  try {
    opts.done?.();
  } catch (err) {
    console.error('[director] script done failed', err);
  }
}

function pairKey(a: CharId, b: CharId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Trim to one tidy sentence ending in a single full stop. */
function sentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  if (!t) return '';
  const body = t.charAt(0).toUpperCase() + t.slice(1);
  return /[!?]$/.test(body) ? body : `${body}.`;
}

function mentions(text: string, name: string): boolean {
  return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

function clampPace(v: number): number {
  return v < 0.4 ? 0.4 : v > 2.5 ? 2.5 : v;
}

