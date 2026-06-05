// The Director — drives the emergent office sandbox with a local LLM.
//
// On a cadence it picks a character, assembles a prompt from their persona + the
// current scene + the recent transcript, asks the local Ollama model for their
// next spoken line (and optional action), then plays it out on the office floor.
// The player is the director/god: they set the scene, inject events, prompt a
// character directly, and dial the drama — the cast improvises the rest.
//
// This module is backend-agnostic about the floor: it emits beats through an
// injected sink (see useDirector), which speaks the line above the right avatar
// and mirrors it into the sidebar. Nothing here touches Pixi or the store.

import type { OfficeCharacterName } from '@/scene/office/cast';
import { personaFor, PERSONAS } from './personas';

/** A character the director can cast in a scene (mirrors a store agent). */
export interface DirectorActor {
  id: string;
  displayName: string;
  character: OfficeCharacterName;
}

export type BeatAction = 'none' | 'approach' | 'leave' | 'toDesk' | 'coffee';

/** One line of the unfolding scene. */
export interface Beat {
  id: string;
  /** Actor id, or 'director' for a player-injected event. */
  speakerId: string;
  speakerName: string;
  character?: OfficeCharacterName;
  text: string;
  mood?: string;
  action?: BeatAction;
  /** Actor id this beat is aimed at (for approach/leave), if any. */
  targetId?: string;
  ts: number;
}

export interface DirectorScene {
  /** Where the action is happening (flavour for the prompt). */
  location: string;
  /** Time-of-day / situation flavour. */
  situation: string;
  /** 0 = mundane workday, 1 = maximum chaos/drama. */
  drama: number;
}

export interface DirectorConfig {
  baseUrl?: string;
  model: string;
  /** Seconds between beats at drama 0; higher drama tightens this. */
  basePaceSec: number;
}

/** What a single character carries between beats (and across reloads). */
export interface NpcMemory {
  /** Recent salient events from this character's point of view (capped). */
  recent: string[];
  /** A distilled "what's on their mind" line, refreshed by reflection. */
  mind?: string;
}

/** A full save of the world — persisted to localStorage so a reload resumes. */
export interface WorldSnapshot {
  version: number;
  day: number;
  scene: DirectorScene;
  transcript: Beat[];
  /** Per-actor memory, keyed by actor id. */
  memory: Record<string, NpcMemory>;
  savedAt: number;
}

export const WORLD_VERSION = 1;

interface DirectorDeps {
  /** Live roster of NPCs currently on the floor. */
  getActors: () => DirectorActor[];
  /** Called for every new beat (player- or LLM-authored) to render it. */
  onBeat: (beat: Beat) => void;
  /** Called when generation state flips, for spinner UI. */
  onBusy?: (busy: boolean) => void;
  /** Called when a generation errors, for surfacing in the UI. */
  onError?: (message: string) => void;
}

const MAX_TRANSCRIPT = 200;
const PROMPT_CONTEXT_BEATS = 14;
/** How many recent events each character keeps in working memory. */
const MAX_RECENT = 12;
/** How many of those to surface in the prompt. */
const MEMORY_IN_PROMPT = 6;
/** Reflect a character's working memory into a "mind" line once it reaches this. */
const REFLECT_AT = 10;
/** Beats kept in a persisted snapshot (the transcript is trimmed for storage). */
const SNAPSHOT_TRANSCRIPT = 80;

/** JSON schema constraining each character's turn. */
const TURN_SCHEMA = {
  type: 'object',
  properties: {
    line: { type: 'string' },
    mood: { type: 'string' },
    action: { type: 'string', enum: ['none', 'approach', 'leave', 'toDesk', 'coffee'] },
    target: { type: 'string' }
  },
  required: ['line']
} as const;

let beatSeq = 0;
function newBeatId(): string {
  beatSeq += 1;
  return `b-${Date.now()}-${beatSeq}`;
}

export class Director {
  private deps: DirectorDeps;
  private cfg: DirectorConfig;
  private scene: DirectorScene = {
    location: 'the Scranton branch bullpen',
    situation: 'an ordinary Tuesday at the office',
    drama: 0.35
  };

  private transcript: Beat[] = [];
  /** Per-actor long-term-ish memory (recent events + a distilled mind line). */
  private memory = new Map<string, NpcMemory>();
  /** Which day of the simulated office it is. */
  private day = 1;
  /** Actors currently being reflected on, so we never double-fire. */
  private reflecting = new Set<string>();
  private paused = true;
  private generating = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSpeakerId: string | null = null;
  /** An active two-person scene: the director keeps the exchange between this
   *  pair for `left` more beats before opening the floor back up. Gives
   *  conversations a coherent back-and-forth instead of scattered one-liners. */
  private focus: { a: string; b: string; left: number } | null = null;
  /** A character the player forced to speak next, with an optional instruction. */
  private forced: { id: string; instruction?: string } | null = null;
  /** Pending director notes (injected events) to weave into the next turn. */
  private pendingNotes: string[] = [];

  constructor(cfg: DirectorConfig, deps: DirectorDeps) {
    this.cfg = cfg;
    this.deps = deps;
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    if (!this.paused) return;
    this.paused = false;
    this.schedule(400);
  }

  pause(): void {
    this.paused = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  isPaused(): boolean { return this.paused; }
  isGenerating(): boolean { return this.generating; }

  dispose(): void {
    this.pause();
    this.transcript = [];
  }

  setConfig(patch: Partial<DirectorConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  // ─── scene controls (player / god) ──────────────────────────────────────────

  getScene(): DirectorScene { return { ...this.scene }; }

  setScene(patch: Partial<DirectorScene>): void {
    this.scene = { ...this.scene, ...patch };
    if (this.scene.drama < 0) this.scene.drama = 0;
    if (this.scene.drama > 1) this.scene.drama = 1;
  }

  /** Drop a director event into the scene — biases the next few turns and shows
   *  up in the transcript as a stage direction. */
  injectEvent(text: string): void {
    const t = text.trim();
    if (!t) return;
    this.pendingNotes.push(t);
    // Everyone present witnesses the event, so it enters their memory too.
    for (const a of this.deps.getActors()) this.remember(a.id, `Something happened: ${t}`);
    const beat: Beat = {
      id: newBeatId(),
      speakerId: 'director',
      speakerName: 'Director',
      text: t,
      ts: Date.now()
    };
    this.push(beat);
    // If running, pull the next beat forward so the reaction feels immediate.
    if (!this.paused && !this.generating) this.schedule(300);
  }

  /** Force a specific character to take the next turn, optionally with a private
   *  instruction ("confront Michael about the budget"). */
  promptCharacter(actorId: string, instruction?: string): void {
    this.forced = { id: actorId, instruction: instruction?.trim() || undefined };
    if (this.paused) {
      // One-shot: run a single beat even while paused.
      this.runBeat().catch(() => { /* surfaced via onError */ });
    } else {
      this.schedule(150);
    }
  }

  /** Run exactly one beat now (used by the Step button while paused). */
  step(): void {
    if (this.generating) return;
    this.runBeat().catch(() => { /* surfaced via onError */ });
  }

  getTranscript(): Beat[] { return this.transcript.slice(); }

  // ─── scheduling ─────────────────────────────────────────────────────────────

  private paceMs(): number {
    // Higher drama → faster banter. Clamp to a sane floor.
    const factor = 1 - this.scene.drama * 0.6;
    return Math.max(2500, this.cfg.basePaceSec * 1000 * factor);
  }

  private schedule(delayMs?: number): void {
    if (this.paused) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.runBeat()
        .catch(() => { /* surfaced via onError */ })
        .finally(() => { if (!this.paused) this.schedule(); });
    }, delayMs ?? this.paceMs());
  }

  // ─── beat generation ────────────────────────────────────────────────────────

  private async runBeat(): Promise<void> {
    if (this.generating) return;
    const actors = this.deps.getActors();
    if (actors.length === 0) return;

    const speaker = this.pickSpeaker(actors);
    if (!speaker) return;
    const instruction = this.forced?.id === speaker.id ? this.forced.instruction : undefined;
    this.forced = null;

    this.generating = true;
    this.deps.onBusy?.(true);
    try {
      const messages = this.buildMessages(speaker, actors, instruction);
      const res = await window.cth.ollamaChat({
        model: this.cfg.model,
        baseUrl: this.cfg.baseUrl,
        messages,
        format: TURN_SCHEMA as unknown as Record<string, unknown>,
        options: { temperature: 0.6 + this.scene.drama * 0.4 }
      });
      if (!res.ok || !res.content) {
        this.deps.onError?.(res.error || 'no response from model');
        return;
      }
      const turn = parseTurn(res.content);
      if (!turn.line) return;

      const target = turn.target ? this.resolveTarget(turn.target, actors, speaker.id) : undefined;
      const beat: Beat = {
        id: newBeatId(),
        speakerId: speaker.id,
        speakerName: speaker.displayName,
        character: speaker.character,
        text: turn.line,
        mood: turn.mood,
        action: turn.action,
        targetId: target?.id,
        ts: Date.now()
      };
      this.lastSpeakerId = speaker.id;
      this.pendingNotes = []; // consumed into this turn
      // A line aimed at someone opens (or extends) a two-person scene between
      // them, so the next few beats stay a coherent back-and-forth.
      if (target) {
        const sceneLen = 2 + Math.round(this.scene.drama * 3);
        if (this.focus && this.focusHas(speaker.id) && this.focusHas(target.id)) {
          this.focus.left = Math.max(this.focus.left, sceneLen);
        } else {
          this.focus = { a: speaker.id, b: target.id, left: sceneLen };
        }
      }
      this.recordMemory(speaker, beat, target);
      this.push(beat);
      // Distil a character's mind once their working memory fills up (async,
      // never blocks the beat loop).
      if ((this.memory.get(speaker.id)?.recent.length ?? 0) >= REFLECT_AT) {
        void this.reflectActor(speaker.id, speaker.displayName);
      }
    } finally {
      this.generating = false;
      this.deps.onBusy?.(false);
    }
  }

  private focusHas(id: string): boolean {
    return !!this.focus && (this.focus.a === id || this.focus.b === id);
  }

  /** Pick who speaks next: a forced choice, else the other half of an active
   *  two-person scene, else someone in the last speaker's orbit (for
   *  back-and-forth), else a fresh voice — never twice in a row. */
  private pickSpeaker(actors: DirectorActor[]): DirectorActor | null {
    if (this.forced) {
      const f = actors.find((a) => a.id === this.forced!.id);
      if (f) return f;
    }

    // In a focused scene, bounce the line back to the other participant.
    if (this.focus) {
      const a = actors.find((x) => x.id === this.focus!.a);
      const b = actors.find((x) => x.id === this.focus!.b);
      if (a && b) {
        this.focus.left -= 1;
        const next = this.lastSpeakerId === this.focus.a ? b : a;
        if (this.focus.left <= 0) this.focus = null;
        return next;
      }
      this.focus = null; // a participant wandered off — end the scene
    }

    const pool = actors.length > 1
      ? actors.filter((a) => a.id !== this.lastSpeakerId)
      : actors;

    const last = actors.find((a) => a.id === this.lastSpeakerId);
    if (last) {
      const orbit = PERSONAS[last.character]?.orbits ?? [];
      const connected = pool.filter((a) => orbit.includes(a.character));
      if (connected.length && Math.random() < 0.6) {
        return connected[Math.floor(Math.random() * connected.length)];
      }
    }
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }

  private resolveTarget(
    raw: string, actors: DirectorActor[], selfId: string
  ): DirectorActor | undefined {
    const q = raw.trim().toLowerCase();
    if (!q) return undefined;
    return actors.find(
      (a) => a.id !== selfId &&
        (a.displayName.toLowerCase() === q || a.character === q || a.displayName.toLowerCase().includes(q))
    );
  }

  private buildMessages(
    speaker: DirectorActor, actors: DirectorActor[], instruction?: string
  ): Array<{ role: 'system' | 'user'; content: string }> {
    const p = personaFor(speaker.character);
    const present = actors.map((a) => a.displayName).join(', ');

    const system = [
      `You are ${speaker.displayName}, ${p.role}, at Dunder Mifflin's paper company office.`,
      `VOICE: ${p.voice}`,
      `YOU WANT: ${p.wants}`,
      '',
      'You are a character in an improvised, emergent office comedy. Stay completely in character.',
      'Speak ONE short, natural line of dialogue (max ~30 words) — what you would actually say out loud',
      'right now. Be funny, specific, and reactive to what was just said. Do not narrate, do not describe',
      'actions in prose, do not break character or mention being an AI.',
      '',
      'Respond ONLY as JSON with this shape:',
      '{ "line": "<your spoken line>", "mood": "<one word>", "action": "none|approach|leave|toDesk|coffee", "target": "<a coworker\'s name or empty>" }',
      'Use action "approach" + a target when you walk over to someone; "leave" to walk off; otherwise "none".'
    ].join('\n');

    const scene = [
      `SCENE: Day ${this.day}. ${this.scene.situation} — at ${this.scene.location}.`,
      `People present: ${present}.`,
      `Drama level: ${Math.round(this.scene.drama * 100)}% (higher = more heightened, chaotic, dramatic).`
    ];

    // What this character carries with them — continuity across the session.
    const mem = this.memory.get(speaker.id);
    if (mem?.mind) scene.push('', `On your mind: ${mem.mind}`);
    if (mem?.recent.length) {
      scene.push('', 'You remember (most recent last):');
      for (const r of mem.recent.slice(-MEMORY_IN_PROMPT)) scene.push(`- ${r}`);
    }

    if (this.pendingNotes.length) {
      scene.push('', 'JUST HAPPENED (react to this): ' + this.pendingNotes.join(' '));
    }
    const recent = this.transcript.slice(-PROMPT_CONTEXT_BEATS);
    if (recent.length) {
      scene.push('', 'Recent conversation:');
      for (const b of recent) {
        scene.push(b.speakerId === 'director' ? `[scene] ${b.text}` : `${b.speakerName}: ${b.text}`);
      }
    }
    scene.push('', instruction
      ? `Now it's your turn. Specifically: ${instruction}. Respond as ${speaker.displayName} in JSON.`
      : `Now it's your turn, ${speaker.displayName}. Respond in JSON.`);

    return [
      { role: 'system', content: system },
      { role: 'user', content: scene.join('\n') }
    ];
  }

  // ─── memory ─────────────────────────────────────────────────────────────────

  private mem(id: string): NpcMemory {
    let m = this.memory.get(id);
    if (!m) { m = { recent: [] }; this.memory.set(id, m); }
    return m;
  }

  /** Append an event to a character's working memory, capped to the most recent. */
  private remember(id: string, event: string): void {
    const m = this.mem(id);
    m.recent.push(event);
    if (m.recent.length > MAX_RECENT) m.recent = m.recent.slice(-MAX_RECENT);
  }

  /** Both participants remember a line of dialogue from their own POV. */
  private recordMemory(speaker: DirectorActor, beat: Beat, target?: DirectorActor): void {
    const to = target ? ` to ${target.displayName}` : '';
    this.remember(speaker.id, `You said${to}: "${beat.text}"`);
    if (target) this.remember(target.id, `${speaker.displayName} said to you: "${beat.text}"`);
  }

  /** Distil a character's recent events into a one-line "mind". Runs in the
   *  background (never blocks beats), one per actor at a time, and is skipped
   *  while a beat is generating so the two don't contend for the local model. */
  private async reflectActor(id: string, name: string): Promise<void> {
    if (this.reflecting.has(id) || this.generating) return;
    const m = this.memory.get(id);
    if (!m || m.recent.length === 0) return;
    this.reflecting.add(id);
    try {
      const res = await window.cth.ollamaChat({
        model: this.cfg.model,
        baseUrl: this.cfg.baseUrl,
        messages: [
          { role: 'system', content: `Summarize, in ONE short sentence, what is on ${name}'s mind right now — their current mood, grudges, goals, and what just happened to them. Write it as a private note in ${name}'s own head. Output only the sentence.` },
          { role: 'user', content: (m.mind ? `So far: ${m.mind}\n\n` : '') + 'Recent events:\n' + m.recent.map((r) => `- ${r}`).join('\n') }
        ],
        options: { temperature: 0.5 }
      });
      if (res.ok && res.content) {
        m.mind = res.content.trim().replace(/^["']|["']$/g, '').slice(0, 240);
        // Keep working memory lean once it's been folded into the mind line.
        m.recent = m.recent.slice(-Math.floor(MAX_RECENT / 2));
      }
    } catch { /* reflection is best-effort */ } finally {
      this.reflecting.delete(id);
    }
  }

  // ─── day / persistence ──────────────────────────────────────────────────────

  getDay(): number { return this.day; }

  /** Current "mind" line per actor id (for the UI to peek at). */
  getMinds(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [id, m] of this.memory) if (m.mind) out[id] = m.mind;
    return out;
  }

  /** Roll over to a fresh day: clear the visible scene but KEEP every character's
   *  memory, so yesterday's grudges and threads carry over. */
  newDay(): void {
    this.day += 1;
    this.transcript = [];
    this.lastSpeakerId = null;
    this.focus = null;
    this.pendingNotes = [];
    for (const a of this.deps.getActors()) this.remember(a.id, `A new day (day ${this.day}) begins at the office.`);
    this.push({
      id: newBeatId(), speakerId: 'director', speakerName: 'Director',
      text: `Day ${this.day} — a new morning at Dunder Mifflin.`, ts: Date.now()
    });
  }

  /** Snapshot the whole world for persistence. */
  getSnapshot(): WorldSnapshot {
    const memory: Record<string, NpcMemory> = {};
    for (const [id, m] of this.memory) memory[id] = { recent: m.recent.slice(), mind: m.mind };
    return {
      version: WORLD_VERSION,
      day: this.day,
      scene: { ...this.scene },
      transcript: this.transcript.slice(-SNAPSHOT_TRANSCRIPT),
      memory,
      savedAt: Date.now()
    };
  }

  /** Restore a saved world. Returns the transcript so the UI can repopulate. */
  hydrate(s: WorldSnapshot): Beat[] {
    if (!s || s.version !== WORLD_VERSION) return [];
    this.day = s.day || 1;
    this.scene = { ...this.scene, ...s.scene };
    this.transcript = Array.isArray(s.transcript) ? s.transcript.slice() : [];
    this.memory = new Map();
    for (const [id, m] of Object.entries(s.memory ?? {})) {
      this.memory.set(id, { recent: Array.isArray(m.recent) ? m.recent.slice(-MAX_RECENT) : [], mind: m.mind });
    }
    this.lastSpeakerId = null;
    this.focus = null;
    return this.transcript.slice();
  }

  private push(beat: Beat): void {
    this.transcript.push(beat);
    if (this.transcript.length > MAX_TRANSCRIPT) {
      this.transcript = this.transcript.slice(-MAX_TRANSCRIPT);
    }
    this.deps.onBeat(beat);
  }
}

interface ParsedTurn {
  line: string;
  mood?: string;
  action?: BeatAction;
  target?: string;
}

/** Tolerant parse of the model's JSON turn — falls back to treating the whole
 *  output as a spoken line if it isn't valid JSON. */
function parseTurn(raw: string): ParsedTurn {
  const text = raw.trim();
  // Strip ```json fences some models add despite format:json.
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    const obj = JSON.parse(unfenced) as Record<string, unknown>;
    const line = typeof obj.line === 'string' ? obj.line.trim() : '';
    const action = typeof obj.action === 'string' ? (obj.action as BeatAction) : 'none';
    return {
      line,
      mood: typeof obj.mood === 'string' ? obj.mood.trim() : undefined,
      action: (['none', 'approach', 'leave', 'toDesk', 'coffee'] as const).includes(action) ? action : 'none',
      target: typeof obj.target === 'string' ? obj.target.trim() : undefined
    };
  } catch {
    // Not JSON — try to salvage a "line" field, else use the raw text.
    const m = unfenced.match(/"line"\s*:\s*"([^"]+)"/);
    return { line: m ? m[1].trim() : unfenced.replace(/^\{|\}$/g, '').trim() };
  }
}
