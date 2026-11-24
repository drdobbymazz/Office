// The model-driven brain: prompt + transport + streaming parse + cleaning,
// with InstinctBrain behind every request so the game is never stuck.
//
// Rules it keeps:
// - Every method resolves with something usable. Errors, timeouts and
//   rubbish replies fall back to instinct (source: 'instinct').
// - A reply that does not parse is tried once more at a lower temperature.
// - Two transport failures in a row: offline. Offline requests answer from
//   instinct at once; the server is re-checked at most every 20 s.
// - One request at a time goes to the model; the rest wait their turn in order.
// - Scene lines are handed to onLine as soon as each one is complete in the
//   stream. Lines already shown are never taken back: if the reply then
//   breaks, the scene is finished around them.

import type { InstinctBank } from '@/game/core/content/types';
import { PLAN_KINDS } from '@/game/core/types';
import type { CharId, TargetRoomId } from '@/game/core/types';
import type {
  Brain, BrainSettings, BrainStatus, ChatStats, ChatTransport, DirectiveRequest, DirectiveResult, DirectiveVerb,
  InterpretRequest, InterpretResult, MindResult, MindsRequest, ReportRequest, ReportResult, SagaEpisodeRequest,
  SagaEpisodeResult, SceneCallbacks, SceneLine, SceneRequest, SceneResult
} from './api';
import {
  CUSTOM_KINDS, CUSTOM_LOOKS, CUSTOM_POWERS, CUSTOM_REACTIONS, CUSTOM_VIBES, DIRECTIVE_VERBS, GUEST_COLOURS,
  GUEST_SKINS, GUEST_STYLES
} from './api';
import type { CustomPower } from './api';
import { cleanEmotion, cleanLine, cleanPlan, cleanPlans, cleanSay, cleanShifts, cleanText, lineKey } from './clean';
import type { LineContext } from './clean';
import { InstinctBrain, inferDelegateTone, isNegatedDirective, stripRoomPhrases } from './instinct';
import type { LooseBank } from './instinct';
import { ArrayItemStream, parseLoose } from './jsonStream';
import { NameMap } from './names';
import { PromptBook } from './prompts';
import type { RequestKind } from './prompts';
import { directiveSchema, interpretSchema, mindsSchema, reportSchema, sagaEpisodeSchema, sceneSchema } from './schema';
import type { JsonSchema } from './schema';
import { BrainError, isAbort } from './transports/common';
import type { TransportOptions, TransportProgress } from './transports/common';
import { now, Rolling } from './util';
import type { Rng } from './util';
import { WorldIndex } from './world';
import type { BrainWorld } from './world';

export interface BrainDeps {
  bank: InstinctBank | LooseBank;
  world: BrainWorld;
  /** Randomness for the instinct fallback (tests pass a seeded one). */
  rng?: Rng;
  /** "Waking the model" progress, for a status line in the UI. */
  onProgress?: (p: TransportProgress) => void;
  /** How often an offline brain may re-check the server. Default 20 s. */
  recheckMs?: number;
  /** Timeouts for the transport createBrain builds. */
  transportOptions?: TransportOptions;
  /** Use this transport instead of building one from settings (tests). */
  transport?: ChatTransport;
}

const OFFLINE_AFTER = 2;
const RATE_BACKOFF_MS = 30_000;

interface RunSpec<T> {
  kind: RequestKind;
  user: string;
  schema: JsonSchema;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
  onText?: (soFar: string) => void;
  /** Called before each attempt (reset streaming state). */
  onAttempt?: () => void;
  /** Turn the reply into a result, or null when it is unusable. */
  parse: (text: string) => T | null;
  /** Make the best of what already arrived (streamed lines) when the call fails. */
  salvage?: () => T | null;
  fallback: () => T;
}

/** Readings that take a person out of the day or wreck something: never accepted from the model alone in story mode. */
const GRAVE_VERBS = new Set<DirectiveVerb>(['eliminate', 'knockout', 'walk_out', 'sabotage', 'lock_in', 'drag', 'trigger_power', 'shove', 'steal']);

export class LlmBrain implements Brain {
  readonly kind: BrainSettings['provider'];
  readonly autonomous: boolean;
  readonly instinct: InstinctBrain;
  private readonly index: WorldIndex;
  private readonly book: PromptBook;
  private readonly recheckMs: number;

  private failuresInRow = 0;
  private offline = false;
  private denied = false;
  private backoffUntil = 0;
  private everChecked = false;
  private lastCheck = -Infinity;
  private checking: Promise<void> | null = null;
  private lastError: string | undefined;
  private models: string[] = [];
  private tps = new Rolling();
  private firstLine = new Rolling();
  private tail: Promise<void> = Promise.resolve();
  /** What the model is doing right now, for the UI. */
  phase: TransportProgress['phase'] = 'idle';

  constructor(
    private readonly settings: BrainSettings,
    private readonly transport: ChatTransport,
    deps: BrainDeps
  ) {
    this.kind = settings.provider;
    this.autonomous = transport.autonomous;
    this.index = new WorldIndex(deps.world);
    this.book = new PromptBook(this.index);
    this.instinct = new InstinctBrain(deps.bank as LooseBank, this.index, deps.rng);
    this.recheckMs = deps.recheckMs ?? 20_000;
  }

  /** The prompt builder (for tests and prompt dumps). */
  get prompts(): PromptBook {
    return this.book;
  }

  /** Called by createBrain's transport progress hook. */
  noteProgress(p: TransportProgress): void {
    this.phase = p.phase;
  }

  // ── Health ────────────────────────────────────────────────────────────────

  private unavailable(): boolean {
    return this.denied || this.offline || now() < this.backoffUntil;
  }

  private recheck(): Promise<void> {
    if (this.checking) return this.checking;
    this.lastCheck = now();
    this.checking = (async () => {
      try {
        const s = await this.transport.status();
        this.everChecked = true;
        if (s.models.length) this.models = s.models;
        if (s.ok) {
          this.offline = false;
          this.failuresInRow = 0;
          this.lastError = undefined;
        } else {
          this.offline = true;
          this.lastError = s.error ?? 'The model server is not answering.';
        }
      } catch (e) {
        this.offline = true;
        this.lastError = e instanceof Error ? e.message : String(e);
      } finally {
        this.lastCheck = now();
        this.checking = null;
      }
    })();
    return this.checking;
  }

  private kickRecheck(): void {
    if (this.offline && !this.denied && now() - this.lastCheck >= this.recheckMs) void this.recheck();
  }

  async status(): Promise<BrainStatus> {
    if (!this.denied && (!this.everChecked || now() - this.lastCheck >= this.recheckMs)) await this.recheck();
    else if (this.checking) await this.checking;
    const ok = !this.offline && !this.denied;
    return {
      provider: this.settings.provider,
      ok,
      model: this.settings.provider === 'claude' ? this.settings.claudeTier : this.settings.model,
      models: this.models,
      error: ok ? undefined : this.lastError,
      tokPerSec: this.tps.value,
      firstLineMs: this.firstLine.value
    };
  }

  private noteSuccess(stats: ChatStats): void {
    this.failuresInRow = 0;
    this.offline = false;
    this.everChecked = true;
    this.lastError = undefined;
    this.tps.add(stats.tokPerSec);
  }

  private noteFailure(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    this.lastError = message;
    if (e instanceof BrainError && e.kind === 'denied') {
      this.denied = true;
      this.offline = true;
      return;
    }
    if (e instanceof BrainError && e.kind === 'rate') this.backoffUntil = now() + RATE_BACKOFF_MS;
    this.failuresInRow++;
    if (this.failuresInRow >= OFFLINE_AFTER) {
      this.offline = true;
      this.lastCheck = now();
    }
  }

  // ── Queue ─────────────────────────────────────────────────────────────────

  /** Wait for our turn. Rejects if the caller gives up while waiting. */
  private async acquire(signal?: AbortSignal): Promise<() => void> {
    let release!: () => void;
    const prev = this.tail;
    this.tail = new Promise<void>((r) => (release = r));
    if (!signal) {
      await prev;
      return release;
    }
    if (signal.aborted) {
      void prev.then(release);
      throw new BrainError('abort', 'Cancelled.');
    }
    let onAbort: (() => void) | null = null;
    const aborted = new Promise<'aborted'>((resolve) => {
      onAbort = () => resolve('aborted');
      signal.addEventListener('abort', onAbort, { once: true });
    });
    const r = await Promise.race([prev.then(() => 'ready' as const), aborted]);
    if (onAbort) signal.removeEventListener('abort', onAbort);
    if (r === 'aborted') {
      // Keep the chain intact: our slot frees when the one before us does.
      void prev.then(release);
      throw new BrainError('abort', 'Cancelled.');
    }
    return release;
  }

  private async run<T>(spec: RunSpec<T>): Promise<T> {
    if (this.unavailable()) {
      this.kickRecheck();
      return spec.fallback();
    }
    let release: () => void;
    try {
      release = await this.acquire(spec.signal);
    } catch {
      return spec.fallback();
    }
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (this.unavailable()) return spec.salvage?.() ?? spec.fallback();
        spec.onAttempt?.();
        const temperature = attempt === 0 ? spec.temperature : Math.max(0.2, spec.temperature * 0.6);
        let text: string;
        try {
          const res = await this.transport.chat({
            messages: [
              { role: 'system', content: this.book.system(spec.kind) },
              { role: 'user', content: spec.user }
            ],
            schema: spec.schema,
            temperature,
            maxTokens: spec.maxTokens,
            signal: spec.signal,
            onText: spec.onText
          });
          this.noteSuccess(res.stats);
          text = res.text;
        } catch (e) {
          if (!(isAbort(e) && spec.signal?.aborted)) this.noteFailure(e);
          return spec.salvage?.() ?? spec.fallback();
        }
        let result: T | null = null;
        try {
          result = spec.parse(text);
        } catch {
          result = null;
        }
        if (result) return result;
        const salvaged = spec.salvage?.();
        if (salvaged) return salvaged;
      }
      return spec.fallback();
    } finally {
      release();
    }
  }

  private temp(chaos: number): number {
    const c = Number.isFinite(chaos) ? Math.max(0, Math.min(1, chaos)) : 0.5;
    return this.settings.temperature * (0.85 + 0.3 * c);
  }

  /** NameMap of people a shift or plan may name: the speakers plus onlookers we know. */
  private peopleMap(base: NameMap, extraNames: string[]): NameMap {
    const m = new NameMap(base.ids.map((id) => ({ id, name: base.name(id) })));
    for (const n of extraNames) {
      const id = this.index.idForName(n);
      if (id) m.add(id, this.index.person(id)?.name ?? n);
    }
    return m;
  }

  private rooms = (raw: unknown): string | null => this.index.resolveRoom(raw);

  // ── Scenes ────────────────────────────────────────────────────────────────

  async scene(req: SceneRequest, cb?: SceneCallbacks): Promise<SceneResult> {
    const names = new NameMap(req.people.map((p) => ({ id: p.id, name: p.name })));
    const people = this.peopleMap(names, req.onlookers);
    const maxLines = Math.max(1, req.maxLines);
    const ctx: LineContext = { speakers: names, maxLines, seen: new Set(req.recent.map((r) => lineKey(r.say))) };
    const lines: SceneLine[] = [];
    let t0 = now();
    let stream = new ArrayItemStream('lines');
    let ended = false;
    const linesEnd = (): void => {
      if (ended || !lines.length) return;
      ended = true;
      try {
        cb?.onLinesEnd?.();
      } catch {
        /* a UI callback must not break the brain */
      }
    };

    const emit = (line: SceneLine): void => {
      if (lines.length >= maxLines) return;
      if (!lines.length) this.firstLine.add(now() - t0);
      lines.push(line);
      try {
        cb?.onLine?.(line, lines.length - 1);
      } catch {
        /* a UI callback must not break the brain */
      }
    };
    const take = (raw: unknown): void => {
      if (lines.length >= maxLines) return;
      const line = cleanLine(raw, ctx);
      if (line) emit(line);
    };
    const delTargets = req.delegation?.targets && req.delegation.targets.length > 1 ? req.delegation.targets : undefined;
    const resolveTargetId = (raw: unknown): CharId | null => names.resolve(raw) ?? (typeof raw === 'string' ? this.index.idForName(raw) : null);
    const delegationTargetNames = delTargets
      ? delTargets.map((id) => (names.has(id) ? names.name(id) : this.index.nameOf(id)))
      : undefined;

    const build = (value: Record<string, unknown> | null): SceneResult => {
      let complies: boolean | undefined;
      let compliers: CharId[] | undefined;
      if (req.delegation) {
        if (delTargets) {
          const parsed: CharId[] = [];
          if (Array.isArray(value?.compliers)) {
            for (const raw of value.compliers) {
              const id = resolveTargetId(raw);
              if (id && delTargets.includes(id) && !parsed.includes(id)) parsed.push(id);
            }
          }
          if (!Array.isArray(value?.compliers) || (value?.complies === true && parsed.length === 0)) {
            compliers = delTargets.filter((id) => this.instinct.decideComplianceFor(req, id, lines));
          } else {
            compliers = parsed;
          }
          complies = compliers.length > 0;
        } else {
          complies = typeof value?.complies === 'boolean' ? value.complies : this.instinct.decideCompliance(req, lines);
        }
      }
      return {
        lines: lines.slice(),
        summary: cleanText(value?.summary, 200) || this.instinct.summarise(req, lines, names),
        shifts: cleanShifts(value?.shifts, names, people),
        plans: cleanPlans(value?.plans, names, people, this.rooms),
        ...(complies !== undefined ? { complies } : {}),
        ...(compliers !== undefined ? { compliers } : {}),
        source: 'model'
      };
    };

    return this.run<SceneResult>({
      kind: 'scene',
      user: this.book.sceneUser(req, names),
      schema: sceneSchema({
        speakers: names.names,
        people: people.names,
        rooms: this.index.roomIds,
        minLines: req.minLines,
        maxLines,
        hasDelegation: !!req.delegation,
        ...(delegationTargetNames ? { delegationTargets: delegationTargetNames } : {})
      }),
      temperature: this.temp(req.chaos),
      maxTokens: (delTargets ? 170 : req.delegation ? 140 : 120) + 95 * maxLines,
      signal: cb?.signal,
      onAttempt: () => {
        t0 = now();
        stream = new ArrayItemStream('lines');
      },
      onText: (soFar) => {
        for (const raw of stream.push(soFar)) {
          try {
            take(JSON.parse(raw));
          } catch {
            /* incomplete or odd item: the final parse gets another look */
          }
        }
        if (stream.closed || lines.length >= maxLines) linesEnd();
      },
      parse: (text) => {
        const p = parseLoose(text);
        const arr = p?.value.lines;
        if (Array.isArray(arr)) for (const item of arr.slice(stream.count)) take(item);
        return lines.length ? build(p?.value ?? null) : null;
      },
      salvage: () => (lines.length ? build(null) : null),
      fallback: () => {
        const r = this.instinct.sceneNow(req);
        r.lines.forEach((l, i) => {
          try {
            cb?.onLine?.(l, i);
          } catch {
            /* ignore */
          }
        });
        return r;
      }
    });
  }

  // ── Minds ─────────────────────────────────────────────────────────────────

  async minds(req: MindsRequest, signal?: AbortSignal): Promise<MindResult[]> {
    if (!req.people.length) return [];
    const names = new NameMap(req.people.map((p) => ({ id: p.id, name: p.name })));
    const others = new NameMap(req.others.map((o) => ({ id: o.id, name: o.name })));
    for (const p of req.people) others.add(p.id, p.name);
    const allowed = req.allowed.length ? req.allowed : PLAN_KINDS;
    const targetNames = req.others.map((o) => others.name(o.id));
    const instinctAll = (): MindResult[] => req.people.map((p) => this.instinct.mindFor(p, req));

    return this.run<MindResult[]>({
      kind: 'minds',
      user: this.book.mindsUser(req, names, others),
      schema: mindsSchema({ people: names.names, others: targetNames, rooms: this.index.roomIds, allowed }),
      temperature: this.temp(req.chaos),
      maxTokens: 60 + 85 * req.people.length,
      signal,
      parse: (text) => {
        const arr = parseLoose(text)?.value.minds;
        if (!Array.isArray(arr)) return null;
        const got = new Map<CharId, MindResult>();
        for (const item of arr) {
          if (!item || typeof item !== 'object') continue;
          const r = item as Record<string, unknown>;
          const who = names.resolve(r.who);
          if (!who || got.has(who)) continue;
          const thought = cleanSay(r.thought, 64);
          if (!thought) continue;
          const person = req.people.find((p) => p.id === who)!;
          const plan = cleanPlan(r, who, others, this.rooms, allowed) ?? this.instinct.mindFor(person, req).plan;
          got.set(who, { who, thought, feel: cleanEmotion(r.feel), plan });
        }
        if (!got.size) return null;
        return req.people.map((p) => got.get(p.id) ?? this.instinct.mindFor(p, req));
      },
      fallback: instinctAll
    });
  }

  // ── Free-text events ──────────────────────────────────────────────────────

  async interpret(req: InterpretRequest, signal?: AbortSignal): Promise<InterpretResult> {
    const roomIds = req.rooms.map((r) => r.id as string);
    return this.run<InterpretResult>({
      kind: 'interpret',
      user: this.book.interpretUser(req),
      schema: interpretSchema(roomIds),
      temperature: this.temp(0.5),
      maxTokens: 240,
      signal,
      parse: (text) => {
        const v = parseLoose(text)?.value;
        if (!v) return null;
        const title = cleanText(v.title, 40);
        const fact = cleanText(v.fact, 160);
        if (!title || !fact) return null;
        const base = this.instinct.interpretNow(req);
        const room = typeof v.room === 'string' && (v.room === 'everywhere' || roomIds.includes(v.room)) ? v.room : base.room;
        const intensity = Number(v.intensity);
        const oneOf = <T extends string>(list: readonly T[], raw: unknown, dflt: T): T =>
          typeof raw === 'string' && (list as readonly string[]).includes(raw.trim().toLowerCase()) ? (raw.trim().toLowerCase() as T) : dflt;
        const rawPower = (CUSTOM_POWERS as readonly string[]).includes(String(v.power)) ? (v.power as CustomPower) : base.power;
        const power = rawPower === 'none' && base.power !== 'none' ? base.power : rawPower;
        return {
          title,
          emoji: firstEmoji(v.emoji),
          room: room as TargetRoomId | 'everywhere',
          fact: /[.!?]$/.test(fact) ? fact : `${fact}.`,
          vibe: oneOf(CUSTOM_VIBES, v.vibe, base.vibe),
          intensity: intensity === 1 || intensity === 2 || intensity === 3 ? intensity : base.intensity,
          reaction: oneOf(CUSTOM_REACTIONS, v.reaction, base.reaction),
          look: oneOf(CUSTOM_LOOKS, v.look, base.look),
          moves: typeof v.moves === 'boolean' ? v.moves : base.moves,
          kind: oneOf(CUSTOM_KINDS, v.kind, base.kind),
          name: cleanText(v.name, 30) || base.name,
          power,
          guest: {
            skin: oneOf(GUEST_SKINS, v.skin, base.guest.skin),
            hair: oneOf(GUEST_COLOURS, v.hair, base.guest.hair),
            outfit: oneOf(GUEST_COLOURS, v.outfit, base.guest.outfit),
            trim: oneOf(GUEST_COLOURS, v.trim, base.guest.trim),
            style: oneOf(GUEST_STYLES, v.style, base.guest.style)
          },
          source: 'model'
        };
      },
      fallback: () => this.instinct.interpretNow(req)
    });
  }

  private normalizeDirective(
    v: Record<string, unknown>,
    base: DirectiveResult,
    names: NameMap,
    roomIds: string[],
    rawText: string,
    allowDelegate = true,
    actorName = '',
    careful = false
  ): DirectiveResult {
    const cleanRaw = stripRoomPhrases(rawText);
    const isMentionedInClean = (id: CharId): boolean => {
      const fullName = names.name(id);
      const firstName = fullName.split(/\s+/)[0] || fullName;
      return [fullName, firstName]
        .filter((s) => s.length >= 2)
        .some((part) => new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(cleanRaw));
    };

    if (isNegatedDirective(rawText, actorName)) {
      return {
        verb: 'social',
        targetPerson: base.targetPerson,
        targetRoom: null,
        power: 'none',
        item: '',
        summary: base.summary,
        source: 'model'
      };
    }

    const physicalPriority = new Set<DirectiveVerb>([
      'eliminate', 'knockout', 'shove', 'drag', 'lock_in', 'sabotage',
      'trigger_power', 'walk_out', 'steal', 'romance', 'expose', 'perform',
      'delegate', 'recover', 'chase', 'follow', 'guard'
    ]);
    let verb = (DIRECTIVE_VERBS as readonly string[]).includes(String(v.verb))
      ? (v.verb as DirectiveVerb)
      : base.verb;
    if (!allowDelegate && verb === 'delegate') {
      verb = base.verb === 'delegate' ? 'social' : base.verb;
    }
    // Never let a timid model soften an unmistakable physical order into plain chat or walking.
    if (physicalPriority.has(base.verb) && (verb === 'social' || verb === 'go_to')) {
      verb = base.verb;
    }
    // Story mode: a model may not escalate. When the plain words carry no physical order at all, a
    // reading that removes someone from the day or wrecks something is the model's invention.
    if (careful && GRAVE_VERBS.has(verb) && !physicalPriority.has(base.verb)) {
      verb = base.verb;
    }
    // Keep self-exposure (stripping/flashing) on its own staging path rather than collapsing into interpersonal romance.
    if (base.verb === 'expose' && verb === 'romance') {
      verb = 'expose';
    }
    // Never let a reversal ("get dressed", "wake up jim", "stop") turn into exposing or attacking.
    if (base.verb === 'recover') {
      verb = 'recover';
    }
    const rawResolved = v.targetPerson && v.targetPerson !== 'none' ? names.resolve(v.targetPerson) : null;
    const resolvedPerson = rawResolved && isMentionedInClean(rawResolved) ? rawResolved : null;
    let targetPerson = resolvedPerson ?? base.targetPerson;
    // Never let the model turn a delegated request into an action by the speaker.
    if (allowDelegate && base.verb === 'delegate') {
      verb = 'delegate';
      targetPerson = base.targetPerson ?? resolvedPerson;
    }
    // Do not let the model invent a coworker target when the player ordered a solo expose/perform/recover stunt.
    if ((verb === 'expose' || verb === 'perform' || verb === 'recover') && base.targetPerson === null && resolvedPerson) {
      if (!isMentionedInClean(resolvedPerson)) targetPerson = null;
    }
    const rawRoom = typeof v.targetRoom === 'string' && v.targetRoom !== 'none' ? v.targetRoom : '';
    const resolvedRoom = rawRoom ? (roomIds.includes(rawRoom) ? rawRoom : this.rooms(rawRoom)) : null;
    const targetRoom = ((resolvedRoom && roomIds.includes(resolvedRoom) ? resolvedRoom : null) ?? base.targetRoom) as DirectiveResult['targetRoom'];
    const power = (CUSTOM_POWERS as readonly string[]).includes(String(v.power))
      ? (v.power as CustomPower)
      : base.power;
    const delegatedText = verb === 'delegate' ? (cleanText(v.delegatedAction, 120) || base.delegatedText || '') : '';
    if (verb === 'delegate' && !delegatedText) {
      verb = base.verb !== 'delegate' ? base.verb : 'social';
    }
    const item = base.verb === 'recover' ? (base.item || cleanText(v.item, 32)) : (base.item.includes(' ') ? base.item : (cleanText(v.item, 32) || base.item));
    return {
      verb,
      targetPerson,
      ...(verb === 'delegate' && base.targetPeople?.length ? { targetPeople: base.targetPeople } : {}),
      ...(verb === 'delegate' && base.targetAll ? { targetAll: true } : {}),
      ...(verb === 'delegate' && base.delegateExecutor ? { delegateExecutor: base.delegateExecutor } : {}),
      ...(verb === 'delegate' ? { delegateTone: base.delegateTone ?? inferDelegateTone(rawText) } : {}),
      targetRoom,
      power: power === 'none' && base.power !== 'none' ? base.power : power,
      item,
      summary: cleanText(v.summary, 120) || base.summary,
      ...(delegatedText ? { delegatedText } : {}),
      source: 'model'
    };
  }

  async interpretDirective(req: DirectiveRequest, signal?: AbortSignal): Promise<DirectiveResult> {
    const base = this.instinct.interpretDirectiveNow(req);
    const names = new NameMap(req.people.map((p) => ({ id: p.id, name: p.name })));
    const roomIds = req.rooms.map((r) => r.id as string);
    const allowDelegate = req.allowDelegate !== false;
    return this.run<DirectiveResult>({
      kind: 'directive',
      user: this.book.directiveUser(req, names),
      schema: directiveSchema(names.names, roomIds),
      temperature: 0.25,
      maxTokens: 200,
      signal,
      parse: (text) => {
        const v = parseLoose(text)?.value;
        if (!v) return null;
        return this.normalizeDirective(v, base, names, roomIds, req.text, allowDelegate, req.actor.name, req.careful === true);
      },
      fallback: () => base
    });
  }

  // ── End of day ────────────────────────────────────────────────────────────

  async report(req: ReportRequest, signal?: AbortSignal): Promise<ReportResult> {
    const names = new NameMap(req.people.map((p) => ({ id: p.id, name: p.name })));
    return this.run<ReportResult>({
      kind: 'report',
      user: this.book.reportUser(req, names),
      schema: reportSchema(names.names),
      temperature: this.temp(0.5),
      maxTokens: 520,
      signal,
      parse: (text) => {
        const v = parseLoose(text)?.value;
        if (!v) return null;
        const headline = cleanText(v.headline, 90);
        const paragraphs = (Array.isArray(v.paragraphs) ? v.paragraphs : []).map((p) => cleanText(p, 700)).filter(Boolean).slice(0, 3);
        if (!headline || !paragraphs.length) return null;
        const awards: ReportResult['awards'] = [];
        for (const a of Array.isArray(v.awards) ? v.awards : []) {
          if (!a || typeof a !== 'object') continue;
          const r = a as Record<string, unknown>;
          const who = names.resolve(r.who);
          const title = cleanText(r.title, 50);
          if (who && title && awards.length < 3) awards.push({ title, who, why: cleanText(r.why, 140) });
        }
        const took = new Map<CharId, string>();
        for (const t of Array.isArray(v.takeaways) ? v.takeaways : []) {
          if (!t || typeof t !== 'object') continue;
          const r = t as Record<string, unknown>;
          const who = names.resolve(r.who);
          const txt = cleanText(r.text, 140);
          if (who && txt && !took.has(who)) took.set(who, txt);
        }
        const base = this.instinct.reportNow(req);
        return {
          headline,
          paragraphs,
          awards: awards.length ? awards : base.awards,
          takeaways: req.people.map((p) => ({ who: p.id, text: took.get(p.id) ?? base.takeaways.find((b) => b.who === p.id)?.text ?? '' })),
          source: 'model'
        };
      },
      fallback: () => this.instinct.reportNow(req)
    });
  }

  async sagaEpisode(req: SagaEpisodeRequest, signal?: AbortSignal): Promise<SagaEpisodeResult> {
    const base = this.instinct.sagaEpisodeNow(req);
    return this.run<SagaEpisodeResult>({
      kind: 'saga',
      user: this.book.sagaUser(req),
      schema: sagaEpisodeSchema(),
      temperature: this.temp(0.6),
      maxTokens: 280,
      signal,
      parse: (text) => {
        const v = parseLoose(text)?.value;
        if (!v) return null;
        const title = cleanText(v.title, 44) || base.title;
        const recap = cleanText(v.recap, 220);
        const hook = cleanText(v.hook, 260);
        const twistFact = cleanText(v.twistFact, 180) || base.twistFact;
        if (!recap || !hook) return null;
        const topics = (Array.isArray(v.topics) ? v.topics : [])
          .map((t) => cleanText(t, 120))
          .filter(Boolean)
          .slice(0, 2);
        return {
          title,
          recap,
          hook,
          twistFact,
          topics: topics.length ? topics : base.topics,
          source: 'model'
        };
      },
      fallback: () => base
    });
  }
}

const PICTO_RE = /\p{Extended_Pictographic}/u;

/** The first emoji in a string (with its joiners and modifiers), or ''. */
export function firstEmoji(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!PICTO_RE.test(s)) return '';
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  if (seg) {
    for (const { segment } of seg.segment(s)) if (PICTO_RE.test(segment)) return segment;
  }
  const m = /\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}]*/u.exec(s);
  return m ? m[0] : '';
}
