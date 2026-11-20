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

import type { Brain, InterpretResult, MindResult, PersonBrief, ReportResult, SceneLine, SceneRequest, SceneResult, SceneTrigger } from '@/game/brain/api';
import type { DirectorSimApi, SceneAsk, SceneHandle, SimApi, SimPerson } from '@/game/core/simApi';
import type { CharId, RoomId, ShiftKind, TargetRoomId } from '@/game/core/types';
import { PLAN_KINDS, TARGET_ROOMS, formatClock, isCastId } from '@/game/core/types';
import { feetOf, room as roomDef, roomCentrePx, walkableTilesIn } from '@/game/core/world';

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
}

interface Pending {
  ask: SceneAsk;
  at: number;
  /** A player action: the model may always be called for it. */
  fromPlayer: boolean;
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
}

const SHIFT_DELTA: Record<ShiftKind, number> = {
  likes_more: 12, likes_less: -12, trusts_more: 8, trusts_less: -10, admires: 14, resents: -15, fancies: 16, fears: -8
};

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
  /** Facts already seen, and the newest one while it is still news. */
  private knownFacts = new Set<string>();
  private breaking: { fact: string; at: number; scenes: number } | null = null;
  private factsAt = 0;
  private lastSpoke = new Map<CharId, number>();
  private lastMinded = new Map<CharId, number>();
  /** Free-text events currently on the floor, to be cleared when their time is up. */
  private customs: { key: string; lookId: string; until: number; x: number; y: number; poof: boolean }[] = [];
  private disposed = false;

  constructor(opts: DirectorOptions) {
    this.opts = opts;
    this.sim = opts.sim;
    this.api = opts.sim;
    this.brain = opts.brain;
    this.instinct = opts.instinct;
  }

  setBrain(brain: Brain): void {
    this.brain = brain;
  }

  dispose(): void {
    this.disposed = true;
    this.stopScene(false);
    this.queue.length = 0;
  }

  /** A fresh day: drop anything left over from yesterday. */
  reset(): void {
    this.stopScene(false);
    this.queue.length = 0;
    this.expireCustoms(Infinity);
    this.ambientAt = this.api.time + 8;
    this.mindsAt = this.api.time + (this.slow ? 45 : 22);
    this.musingAt = this.api.time + 10;
    this.scenesSinceMinds = 0;
    this.pairAt.clear();
    this.knownFacts.clear();
    this.breaking = null;
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
    this.api.emote(who, 'idea');
    this.api.feel(who, 'surprised', 0.7, 3);
    this.api.setThought(who, thought);
    this.api.remember([who], `A thought came into your head from nowhere, and it feels like your own: "${thought}"`);
    this.api.narrate(`You whisper to ${p.name}: "${thought}"`, { kind: 'overseer', icon: 'whisper', room: p.room });
    const near = this.companions(p, 1);
    this.enqueue({
      people: [who, ...near],
      trigger: 'whisper',
      why: `${p.name} has just had a sudden thought that feels like ${possessive(p.name)} own idea: "${thought}". ${p.name} believes it and acts on it.`,
      priority: 10,
      minLines: near.length ? 2 : 1,
      maxLines: near.length ? 3 : 2,
      staleAfter: 40
    }, true);
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
    const group = this.biggestGroup(4);
    if (!group.length) return;
    this.enqueue({
      people: group,
      trigger: 'announce',
      why: `A voice nobody recognises has just said over the office loudspeaker: "${said}"`,
      priority: 9,
      minLines: Math.min(3, group.length + 1),
      maxLines: 4,
      staleAfter: 40
    }, true);
  }

  /** Tell one person exactly what to do. */
  cue(who: CharId, instruction: string): void {
    const p = this.api.person(who);
    const what = tidy(instruction, 160);
    if (!p || !what) return;
    this.clearTheWay();
    this.api.emote(who, 'alert');
    this.api.narrate(`You nudge ${p.name}: ${what}`, { kind: 'overseer', icon: 'tell', room: p.room });
    // If the instruction names someone else, bring them into it.
    const named = this.api.people().filter((o) => o.id !== who && o.present && mentions(what, o.name)).map((o) => o.id).slice(0, 2);
    const people = [who, ...(named.length ? named : this.companions(p, 1))];
    this.enqueue({
      people,
      trigger: 'cue',
      why: `${p.name} feels an urge ${p.name} cannot explain to do exactly this, right now: ${what}`,
      priority: 10,
      minLines: people.length > 1 ? 2 : 1,
      maxLines: people.length > 1 ? 4 : 2,
      staleAfter: 45
    }, true);
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
    void this.brain
      .interpret({ id: nextId('interpret'), text: what, rooms })
      .catch(() => this.instinct.interpret({ id: nextId('interpret'), text: what, rooms }))
      .then((res) => {
        if (!this.disposed) this.stageCustom(what, res);
      })
      .catch((err) => console.warn('[director] custom event failed', err))
      .finally(() => {
        this.sideN = Math.max(0, this.sideN - 1);
        this.report();
      });
  }

  // ── every frame ────────────────────────────────────────────────────────────

  /** dt: seconds of game time (0 while paused). */
  update(dt: number): void {
    if (this.disposed || dt <= 0) return;
    const now = this.api.time;
    for (const ask of this.sim.takeSceneAsks()) this.enqueue(ask, false);
    this.pruneQueue(now);
    if (this.customs.length) this.expireCustoms(now);

    if (now >= this.factsAt) {
      this.factsAt = now + 1;
      this.watchFacts(now);
    }

    if (this.running) this.advanceScene(now);
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
      const owed = this.scenesSinceMinds >= (slow ? 3 : 1);
      if (this.queue.length && !owed) this.mindsAt = now + 3;
      else {
        this.mindsAt = now + (slow ? 70 + this.api.rng() * 30 : 28 + this.api.rng() * 14);
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
    this.breaking = { fact: fresh, at: now, scenes: 0 };
    const r = this.running;
    if (r && r.ask.trigger === 'ambient' && !r.fromPlayer && !r.releasedAt) this.stopScene(true);
    this.ambientAt = Math.min(this.ambientAt, now + 0.8);
    this.idleAt = Math.min(this.idleAt, now + 0.8);
  }

  // ── queue ──────────────────────────────────────────────────────────────────

  private enqueue(ask: SceneAsk, fromPlayer: boolean): void {
    // One ambient chat waiting is plenty.
    if (ask.trigger === 'ambient' && this.queue.some((q) => q.ask.trigger === 'ambient')) return;
    this.queue.push({ ask, at: this.api.time, fromPlayer });
    this.queue.sort((a, b) => b.ask.priority - a.ask.priority || a.at - b.at);
    if (this.queue.length > 12) this.queue.length = 12;
    // Something important should not wait behind small talk.
    // The same goes for a conversation that is over and only waiting for its summary:
    // the player should not wait for paperwork.
    const r = this.running;
    if (r && ask.priority >= 8 && (r.ask.priority <= 3 || r.releasedAt > 0)) this.stopScene(true);
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
        const feeling = Math.abs(this.api.bond(a.id, o.id)) / 100;
        return { o, dist, score: feeling + Math.max(0, 1 - dist / 260) + Math.min(1, quiet(o) / 120) * 0.6 + rng() * 0.5 };
      })
      .sort((x, y) => y.score - x.score);

    if (!near.length) {
      if (news) {
        news.scenes += 1;
        this.lastTopic = 'news';
        return {
          people: [a.id], room: a.room, trigger: 'event', priority: 6, minLines: 1, maxLines: 1, gather: false,
          why: `This is happening right now: ${news.fact} ${a.name} says something about it out loud.`
        };
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
      return {
        people, room: a.room, trigger: 'event', priority: 6, minLines: 2, maxLines: 3, gather: dist > 110,
        why: `This is happening right now: ${news.fact} ${people.map((id) => this.api.person(id)?.name ?? id).join(' and ')} are reacting to it.`
      };
    }

    const bond = this.api.bond(a.id, b.id);
    // The first fact is only the day and the time; the rest are things that have happened, newest first.
    const facts = this.sim.facts().slice(1);
    const topics: [string, string][] = [];
    if (facts.length) topics.push(['fact', `${a.name} and ${b.name} are talking about this: ${facts[Math.floor(rng() * Math.min(3, facts.length))]}`]);
    if (bond <= -20) topics.push(['feud', `${a.name} and ${b.name} do not get on. ${a.name} has found something small to pick at.`]);
    if (bond >= 30) topics.push(['pals', `${a.name} and ${b.name} get on well. They are having a quiet word instead of working.`]);
    if (a.thought) topics.push(['thought', `${a.name} keeps thinking: "${a.thought}" Now ${a.name} says something about it to ${b.name}.`]);
    topics.push(['doing', `A quiet moment in ${place}. ${a.name} is ${a.doing} and ${b.name} is ${b.doing}.`]);
    if (clock < 10 * 60) topics.push(['early', `It is early and nobody in ${place} has done any work yet. ${a.name} says so to ${b.name}.`]);
    else if (clock >= 11 * 60 + 30 && clock < 13 * 60) topics.push(['lunch', `It is nearly lunch. ${a.name} and ${b.name} are talking about anything except work.`]);
    else if (clock >= 15 * 60 + 30) topics.push(['late', `The afternoon is dragging in ${place}. ${a.name} wants to go home and says so to ${b.name}.`]);
    // Not the same kind of chat twice running.
    const fresh = topics.filter((t) => t[0] !== this.lastTopic);
    const [kind, why] = (fresh.length ? fresh : topics)[Math.floor(rng() * (fresh.length || topics.length))];
    this.lastTopic = kind;

    return {
      people, room: a.room, trigger: 'ambient', priority: 1, why,
      minLines: 2, maxLines: people.length > 2 ? 4 : 3,
      // Neighbours call across the desks; anyone further away walks over.
      gather: dist > 110
    };
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
    const r: Running = {
      ask, handle, people: ids, room, abort, buffer: [], spoken: 0, result: null, failed: false,
      nextAt: now + 0.4, startedAt: now, waitedSince: now, dotted: false, fromPlayer: p.fromPlayer,
      linesDone: false, releasedAt: 0
    };
    this.running = r;
    this.focusOn(ids, ask.priority);

    const req = this.buildRequest(id, ask, ids, room);
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

  private finishScene(r: Running): void {
    const res = r.result;
    r.handle.close();
    this.running = null;
    this.scenesSinceMinds += 1;
    if (res) {
      const onlookers = this.api.peopleIn(r.room).filter((p) => p.present && !r.people.includes(p.id)).map((p) => p.id);
      if (res.summary) this.api.remember([...r.people, ...onlookers], res.summary);
      for (const s of res.shifts) {
        if (s.who === s.about) continue;
        this.api.shiftBond(s.who, s.about, SHIFT_DELTA[s.change] ?? 0, res.summary);
      }
      // One plan per conversation, and one follow-up at most: a plan to go straight
      // back to the person you were just talking to is only allowed once, or the
      // same two people would hold the floor all day.
      const followUp = r.ask.trigger === 'plan';
      for (const p of res.plans) {
        if (!this.api.person(p.who)?.present) continue;
        const again = typeof p.plan.target === 'string' && r.people.includes(p.plan.target);
        if (again && followUp) continue;
        this.api.setPlan(p.who, p.plan);
        break;
      }
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
    const people = ids.map((who) => this.sim.briefFor(who, ids.filter((o) => o !== who)));
    const onlookers = this.api.peopleIn(room).filter((p) => p.present && !ids.includes(p.id)).map((p) => p.name).slice(0, 5);
    const solo = ids.length === 1;
    const lively = this.api.chaos > 45;
    return {
      id,
      day: this.api.day,
      clock: formatClock(this.api.clock),
      place: roomDef(room).name,
      trigger: ask.trigger as SceneTrigger,
      why: ask.why,
      people,
      onlookers,
      facts: this.sim.facts().slice(0, 6),
      recent: this.sim.recentLines(room, 5),
      minLines: ask.minLines ?? (solo ? 1 : 2),
      maxLines: ask.maxLines ?? (solo ? 2 : lively ? 4 : 3),
      chaos: Math.min(1, this.api.chaos / 100)
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
      .sort((a, b) => (this.lastMinded.get(a.id) ?? -999) - (this.lastMinded.get(b.id) ?? -999))
      .slice(0, count);
    if (free.length < 2) return;
    for (const p of free) this.lastMinded.set(p.id, now);
    const ids = free.map((p) => p.id);
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
        people: free.map((p) => ({ ...this.sim.briefFor(p.id, ids.filter((o) => o !== p.id)), place: roomDef(p.room).name, doing: p.doing })),
        facts: this.sim.facts().slice(0, 6),
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
      if (m.plan && m.plan.kind !== 'work') this.api.setPlan(m.who, m.plan);
    }
  }

  /** An idle thought from the written bank, so the office has life while the model is busy or absent. */
  private async musing(): Promise<void> {
    if (this.api.chaos > 60) return;
    const now = this.api.time;
    const idle = this.api.people().filter((p) => p.present && p.available && p.isCast && !p.speaking && now - (this.lastSpoke.get(p.id) ?? -99) > 20);
    if (!idle.length) return;
    const p = idle[Math.floor(this.api.rng() * idle.length)];
    try {
      const [m] = await this.instinct.minds({
        id: nextId('muse'),
        day: this.api.day,
        clock: formatClock(this.api.clock),
        people: [{ ...this.sim.briefFor(p.id, []), place: roomDef(p.room).name, doing: p.doing }],
        facts: [],
        allowed: ['work'],
        others: [],
        chaos: 0
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

  private stageCustom(text: string, res: InterpretResult): void {
    const everywhere = res.room === 'everywhere' || !(TARGET_ROOMS as readonly string[]).includes(res.room);
    const room = (everywhere ? this.busiestRoom() : res.room) as TargetRoomId;
    const tiles = walkableTilesIn(room);
    const spot = tiles.length ? feetOf(tiles[Math.floor(this.api.rng() * tiles.length)]) : roomCentrePx(room);
    const key = nextId('custom');
    const seconds = 26 + res.intensity * 8;
    const title = res.title || text;

    // One plain sentence in the feed: what is now true.
    const fact = sentence(res.fact || text);
    this.api.narrate(fact, { kind: 'event', icon: 'anything', room });
    this.api.setFact(key, fact);
    this.api.bumpChaos(6 + res.intensity * 6);
    this.api.remember(everywhere ? 'all' : room, fact);
    this.api.bus.emit('focus', { x: spot.x - 60, y: spot.y - 50, w: 120, h: 90, weight: 0.8, holdMs: 5000 });

    if (res.emoji) {
      this.api.fx({ kind: 'poof', x: spot.x, y: spot.y - 8 });
      this.api.addEffect({ id: key, kind: 'emoji', emoji: res.emoji, x: spot.x, y: spot.y, size: 16 + res.intensity * 5, bob: res.moves });
    }
    const lookId = `${key}-look`;
    switch (res.look) {
      case 'shake': this.api.shake(0.25 * res.intensity, 900); break;
      case 'flash': this.api.fx({ kind: 'flash', color: 0xffffff, alpha: 0.6, ms: 260 }); break;
      case 'sparkles': this.api.addEffect({ id: lookId, kind: 'cloud', what: 'magic', x: spot.x, y: spot.y - 10, radius: 26 }); break;
      case 'smoke': this.api.addEffect({ id: lookId, kind: 'smoke', room, density: 0.25 * res.intensity }); break;
      case 'confetti': this.api.addEffect({ id: lookId, kind: 'rain', room, what: 'confetti', rate: 0.5 }); break;
      case 'darken': this.api.addEffect({ id: lookId, kind: 'dark', rooms: [room], level: 0.25 * res.intensity, emergency: false }); break;
      case 'drip': this.api.addEffect({ id: lookId, kind: 'sprinklers', room }); break;
      case 'hearts': this.api.fx({ kind: 'burst', what: 'hearts', x: spot.x, y: spot.y - 16, count: 14 }); break;
      case 'stink': this.api.addEffect({ id: lookId, kind: 'cloud', what: 'stink', x: spot.x, y: spot.y - 8, radius: 30 }); break;
      case 'gloom': this.api.addEffect({ id: lookId, kind: 'cloud', what: 'gloom', x: spot.x, y: spot.y - 8, radius: 34 }); break;
      case 'cash': this.api.addEffect({ id: lookId, kind: 'rain', room, what: 'cash', rate: 0.5 }); break;
      case 'paper': this.api.addEffect({ id: lookId, kind: 'rain', room, what: 'paper', rate: 0.5 }); break;
      default: break;
    }

    const witnesses = (everywhere ? this.api.people() : this.api.peopleIn(room)).filter((p) => p.present && p.available);
    for (const p of witnesses) {
      this.api.face(p.id, spot);
      switch (res.reaction) {
        case 'flee': this.api.feel(p.id, 'scared', 0.8, 8); this.api.fleeFrom(p.id, room); break;
        case 'cower': this.api.feel(p.id, 'scared', 0.7, 6); this.api.react(p.id, 'cower', 3); break;
        case 'freeze': this.api.feel(p.id, 'surprised', 0.8, 5); this.api.react(p.id, 'startle', 1.2); break;
        case 'cheer': this.api.feel(p.id, 'excited', 0.8, 6); this.api.react(p.id, 'cheer', 2.2); break;
        case 'dance': this.api.feel(p.id, 'happy', 0.7, 6); this.api.react(p.id, 'dance', 4); break;
        case 'laugh': this.api.feel(p.id, 'amused', 0.8, 5); this.api.react(p.id, 'laugh', 2); break;
        case 'argue': this.api.feel(p.id, 'angry', 0.6, 6); this.api.react(p.id, 'stomp', 1.2); break;
        case 'gather':
        case 'investigate': this.api.feel(p.id, 'surprised', 0.6, 5); this.api.goTo(p.id, { tile: { x: Math.floor(spot.x / 16), y: Math.floor((spot.y - 1) / 16) } }, { doing: `going to look at ${title.toLowerCase()}` }); break;
        default: this.api.react(p.id, 'startle', 0.6); break;
      }
    }

    const speakers = witnesses.filter((p) => p.isCast).sort(() => this.api.rng() - 0.5).slice(0, 3).map((p) => p.id);
    if (speakers.length) {
      this.enqueue({
        people: speakers,
        room,
        trigger: 'custom',
        why: fact,
        priority: 9,
        minLines: Math.min(3, speakers.length + 1),
        maxLines: 4,
        staleAfter: 45
      }, true);
    }

    // It does not last for ever: update() clears it away after a while.
    this.customs.push({ key, lookId, until: this.api.time + seconds, x: spot.x, y: spot.y, poof: !!res.emoji });
  }

  private expireCustoms(now: number): void {
    for (let i = this.customs.length - 1; i >= 0; i--) {
      const c = this.customs[i];
      if (now < c.until) continue;
      this.api.removeEffect(c.key);
      this.api.removeEffect(c.lookId);
      this.api.setFact(c.key, null);
      if (c.poof) this.api.fx({ kind: 'poof', x: c.x, y: c.y - 8 });
      this.customs.splice(i, 1);
    }
  }

  // ── the end of the day ─────────────────────────────────────────────────────

  /** Ask for the day's write-up. Always resolves (the brain falls back to a plain summary). */
  async writeReport(stats: { incidents: number; stockStart: number; stockEnd: number; morale: number; chaosPeak: number }): Promise<ReportResult> {
    this.stopScene(false);
    this.queue.length = 0;
    const req = {
      id: nextId('report'),
      day: this.api.day,
      log: this.sim.dayLog().slice(-40),
      stats,
      people: this.api.people().filter((p) => p.isCast).map((p) => ({ id: p.id, name: p.name, mood: p.emotion }))
    };
    this.sideN += 1;
    this.report();
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

  // ── choosing people ────────────────────────────────────────────────────────

  private talkedLately(a: CharId, b: CharId, now: number): boolean {
    return now - (this.pairAt.get(pairKey(a, b)) ?? -999) < 90;
  }

  private canSpeak(id: CharId): boolean {
    const p = this.api.person(id);
    return !!p && p.present && !p.sceneId && !p.statuses.some((s) => s.kind === 'asleep' || s.kind === 'frozen' || s.kind === 'abducted');
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

  private busiestRoom(): TargetRoomId {
    let best: TargetRoomId = 'bullpen';
    let n = -1;
    for (const id of TARGET_ROOMS) {
      const c = this.api.peopleIn(id).filter((p) => p.present).length;
      if (c > n) {
        n = c;
        best = id;
      }
    }
    return best;
  }

  /** The most people who are in one room together and able to talk. */
  private biggestGroup(max: number): CharId[] {
    const room = this.busiestRoom();
    const picked = this.pickFromRoom(room, max);
    if (picked.length >= 2) return picked;
    return this.api.people().filter((p) => p.isCast && this.canSpeak(p.id)).slice(0, max).map((p) => p.id);
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

