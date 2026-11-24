// The game itself: wires the simulation, the brain, the director, the floor,
// the sound and the UI store together, and is the one object the React UI
// talks to (GameApi). Everything it needs is passed in as `parts`, so it can
// be assembled with stand-ins in a test page.

import { create } from 'zustand';
import type {
  ActionId, BrainUi, DayReport, GameApi, GameMode, GameSettings, PersonDetail, PersonUi, ScreenPoint, StoryUi, TargetingUi, ToastUi, UiState
} from '@/game/app/gameApi';
import type { Meters, CooldownUi, ActiveChaosUi } from '@/game/app/gameApi';
import type { Brain, BrainSettings, BrainStatus, Reflexes } from '@/game/brain/api';
import type { BrainWorld } from '@/game/brain/world';
import type { AudioApi, SfxId } from '@/game/audio/api';
import type { InstinctBank } from '@/game/core/content/types';
import type { ChaosScript } from '@/game/core/simApi';
import type {
  ChaosId, ChaosTarget, CharId, EmotionId, FeedItem, Speech, TargetRoomId
} from '@/game/core/types';
import { Bus } from '@/game/core/bus';
import type { GameBus } from '@/game/core/bus';
import { CAST_LIST, SETTING, VISITORS, displayName, voiceOf } from '@/game/core/cast';
import { ROOMS, WORLD_W, roomCentrePx, roomRectPx } from '@/game/core/world';
import type { CreateActorView, CreateFxView, PortraitUrl, RenderFrame } from '@/game/view/api';
import { GameFloor } from '@/scene/office/floor/GameFloor';
import { FloorInput } from '@/scene/office/floor/input';
import { Director } from '@/game/director/director';
import type { Sim, SimOptions } from '@/game/sim';
import { EXTRA_INFLUENCE, Story, StoryDay, browserStore, type EndingId, type PlayerAction } from '@/game/story';
import { FINALE_PREROLL, FinaleScene } from '@/game/story/finale';
import { SAGA_EXTRA_STANDING, Saga, SagaDay } from '@/game/saga';
import { Objectives } from './objectives';
import { loadSettings, saveSettings } from './settings';
import { loadJson, removeKey, saveJson } from './storage';

export interface GameParts {
  createActorView: CreateActorView;
  createFxView: CreateFxView;
  portraitUrl: PortraitUrl;
  createSim(opts: SimOptions): Sim;
  chaosScripts: ChaosScript[];
  createBrain(settings: BrainSettings, deps: { bank: InstinctBank; world: BrainWorld }): Brain;
  createReflexes(bank: InstinctBank, world?: BrainWorld): Reflexes;
  probeOllama(candidates: string[], signal?: AbortSignal): Promise<{ baseUrl: string; models: string[] } | null>;
  claudeAvailable(): Promise<boolean>;
  createAudio(): AudioApi;
  bank: InstinctBank;
}

export interface Game extends GameApi {
  destroy(): void;
}

const SAVE_KEY = 'world.v2';
/** Story days always run at the length they were balanced for. */
const STORY_DAY_MINUTES = 10;
/** How fast the rest of a story day runs after "Finish the day" (sim seconds per real second): about 15 s from mid-morning. */
const FINISH_SPEED = 40;
const FEED_MAX = 300;
const UI_TICK = 0.2;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

function brainWorld(): BrainWorld {
  return {
    setting: SETTING,
    people: [
      ...CAST_LIST.map((c) => ({
        id: c.id, name: c.name, role: c.role, summary: c.persona.summary, speech: c.persona.speech, wants: c.persona.wants,
        fears: c.persona.fears, quirk: c.persona.quirk, secret: c.persona.secret, examples: [...c.persona.examples],
        nerve: c.temperament.nerve, fixes: [...c.fixes]
      })),
      ...Object.values(VISITORS).map((v) => ({
        id: v.id, name: v.name, role: v.role, summary: v.summary, speech: 'Brisk and businesslike.', wants: v.wants ?? 'to get this over with',
        fears: v.fears ?? 'nothing here', quirk: v.quirk ?? '', secret: '', examples: [] as string[]
      }))
    ],
    rooms: ROOMS.filter((r) => r.id !== 'outside').map((r) => ({ id: r.id, name: r.name }))
  };
}

export async function createGame(host: HTMLElement, parts: GameParts): Promise<Game> {
  let settings: GameSettings = loadSettings();
  const bus: GameBus = new Bus();
  const world = brainWorld();
  const reflexes = parts.createReflexes(parts.bank, world);
  const audio = parts.createAudio();
  audio.setVolumes(settings.volumes);
  audio.setMuted(settings.muted);

  function buildSim(o: { save?: SimOptions['save']; dayMinutes: number; sandbox: boolean; seed?: number }): Sim {
    const next = parts.createSim({ bus, reflexes, dayMinutes: o.dayMinutes, sandbox: o.sandbox, seed: o.seed, save: o.save ?? undefined, now: () => performance.now() });
    for (const sc of parts.chaosScripts) next.registerChaos(sc);
    // Development only: a handle for poking at the world from the browser console.
    if (import.meta.env.DEV) (window as unknown as { __sim?: unknown }).__sim = next;
    return next;
  }
  const sandboxSim = (): Sim => buildSim({ save: loadJson<SimOptions['save']>(SAVE_KEY), dayMinutes: settings.dayMinutes, sandbox: settings.sandbox });

  let sim = sandboxSim();

  // ── story & saga modes ──
  let mode: GameMode = 'sandbox';
  let story: Story | null = null;
  let saga: Saga | null = null;
  /** Today's story day (its goals, budget and logic), while one is set up. */
  let day: StoryDay | null = null;
  /** Today's Endless Saga day while one is set up. */
  let sagaDay: SagaDay | null = null;
  const today = (): StoryDay | null => day;
  /** finishDay: the rest of the day runs at FINISH_SPEED with no new scenes, voices or banners. */
  let finishing = false;
  /** Skipping ahead in a story day: the clock time to stop at (finishing is true meanwhile). */
  let skipUntil: number | null = null;
  /** Back to normal play after a skip (it reached its time, or something happened on the way). */
  const stopSkip = (): void => {
    if (skipUntil === null) return;
    skipUntil = null;
    finishing = false;
    store.setState({ finishing: false, skippingTo: null, speed: 1 });
  };
  /** A story/saga day's office is built behind its chapter card: hold its morning jingle until "Start the day". */
  let holdDayStart = false;
  /** The week's last scene, playing on the floor while UiState.finale is true. */
  let finaleScene: FinaleScene | null = null;

  const instinct = parts.createBrain({ ...settings.brain, provider: 'instinct' }, { bank: parts.bank, world });
  let brain: Brain = parts.createBrain(settings.brain, { bank: parts.bank, world });
  let brainBusy = { thinking: false, queued: 0 };

  const floor = await GameFloor.create(host, { createActorView: parts.createActorView, createFxView: parts.createFxView }, settings.quality);
  floor.camera.setAuto(settings.autoCamera);

  const avatar = (who: CharId, emotion: EmotionId = 'neutral'): string => {
    try {
      return parts.portraitUrl(who, emotion, 3);
    } catch {
      return '';
    }
  };

  // ── UI state ───────────────────────────────────────────────────────────────

  const initialBrain: BrainUi = {
    provider: settings.brain.provider,
    state: settings.brain.provider === 'instinct' ? 'instinct' : 'connecting',
    model: settings.brain.model, thinking: false, queued: 0, tokPerSec: null, error: null
  };
  const store = create<UiState>(() => ({
    phase: 'title', paused: false, speed: 1, day: sim.day, weekday: sim.weekday, clock: sim.clock, dayProgress: sim.dayProgress,
    meters: sim.meters(), incidentsToday: sim.incidentsToday, incidentFreeDays: sim.incidentFreeDays, brain: initialBrain,
    people: [], selectedId: null, feed: [], caption: null, cooldowns: {}, activeChaos: [], objectives: [], toasts: [], report: null,
    settings, holding: null, targeting: null, inArtifact: false, mode: 'sandbox', story: null,
    storySaved: Story.peek(browserStore), sagaSaved: Saga.peek(browserStore),
    beat: null, ceremony: null, finishing: false, finale: false
  }));
  const set = store.setState;
  const get = store.getState;

  let director = makeDirector();
  let objectives = new Objectives(sim, bus, () => sim.meters(), () => sim.incidentsToday);

  function makeDirector(): Director {
    return new Director({
      sim, brain, instinct,
      pace: () => 1,
      speed: () => store.getState().brain.tokPerSec ?? 0,
      onBusy: (b) => {
        brainBusy = { thinking: b.thinking, queued: b.queued };
      },
      // Someone today's chapter is holding where they are does not answer announcements (Classic Story only).
      pinned: (who) => (mode === 'story' ? day?.pinned(who) ?? false : false),
      // Today's chapter may make summoned people wait longer (Monday: until the call).
      summonStay: (room) => (mode === 'story' ? day?.summonStay(room) : undefined),
      // The story's days are puzzles: a whisper is read by its plain words, and the model may not escalate it.
      carefulOrders: () => mode === 'story',
      // What the office is talking about in Story or Endless Saga right now (small talk picks it up).
      storyTopics: () => (mode === 'story' && day ? day.topics() : mode === 'saga' && sagaDay ? sagaDay.topics() : []),
      // Classic Story may adjust a scene's change in feeling while counting progress; Saga leaves shifts raw.
      vetoShift: (who, about, delta) => (mode === 'story' && day ? day.vetoShift(who, about, delta) : delta)
    });
  }

  /** Put a different simulation on the floor (a story day, or back to the sandbox). */
  function swapWorld(next: Sim): void {
    input.cancel();
    if (get().selectedId) select(null);
    beginTargeting(null);
    director.dispose();
    floor.clearFx();
    sim = next;
    director = makeDirector();
    objectives.dispose();
    objectives = new Objectives(sim, bus, () => sim.meters(), () => sim.incidentsToday);
    stockStart = sim.meters().stock;
    linesToday = 0;
    chaosPeak = 0;
    set({ report: null, caption: null, holding: null });
    floor.camera.goHome();
  }

  // ── feed, captions, toasts ─────────────────────────────────────────────────

  let feedBuffer: FeedItem[] = [];
  let linesToday = 0;
  let chaosPeak = 0;
  let stockStart = sim.meters().stock;
  let captionUntil = 0;
  let toastSeq = 0;
  /** When the world last made a sound of its own (so a story caption does not double it). */
  let lastWorldSfxAt = -1e9;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  function toast(text: string, tone: ToastUi['tone'] = 'info', icon?: string): void {
    const id = `t${(toastSeq += 1)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone, icon }] }));
    later(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3600);
  }

  function buzz(pattern: number | number[]): void {
    if (!settings.haptics) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* no vibration here */
    }
  }

  const pan = (x?: number): number | undefined => (x === undefined ? undefined : Math.max(-1, Math.min(1, (x / WORLD_W) * 2 - 1)) * 0.7);

  const offs = [
    bus.on('feed', (item) => {
      feedBuffer.push(item);
      if (item.kind === 'say') linesToday += 1;
      // Story & Saga narration worth seeing on the floor, not only in the Log.
      // A story moment that needs the player (Mr Figgis walking in) brings the game back to normal speed.
      // Something worth seeing happened while skipping ahead: the skip ends here.
      if (item.beat && skipUntil !== null) stopSkip();
      if (item.slow && (mode === 'story' || mode === 'saga') && !finishing && get().speed > 1) {
        set({ speed: 1 });
        toast('Back to normal speed: this needs you.', 'info', 'ff');
      }
      if (item.beat && !finishing) {
        const words = item.text.split(/\s+/).length;
        set({ beat: { id: item.id, text: item.text, icon: item.icon, room: item.room, holdFor: Math.max(3.5, Math.min(9, 2 + words * 0.32)) } });
        // A caption that comes with no sound of its own (a deadline, a clue) gets a soft cue, so it is never missed.
        const at = performance.now();
        later(() => {
          if (Math.abs(lastWorldSfxAt - at) > 300 && !finishing) audio.sfx('toast', { volume: 0.7 });
        }, 90);
      }
    }),
    bus.on('speech', (sp: Speech) => {
      if (finishing) return;
      const p = sim.person(sp.who);
      audio.speak(voiceOf(sp.who), sp.text, {
        cps: sp.cps, emotion: p?.emotion, style: sp.kind, pan: pan(p?.x)
      });
      if (sp.kind === 'say' || sp.kind === 'shout') {
        captionUntil = performance.now() + sp.durationMs + 400;
        set({ caption: { id: sp.id, day: sim.day, clock: sim.clock, kind: 'say', who: sp.who, text: sp.text, emotion: p?.emotion } });
      }
    }),
    bus.on('fx', (c) => floor.cue(c)),
    bus.on('sfx', (e) => {
      // A story day's office is built behind its chapter card: its morning jingle plays on "Start the day" instead.
      if (e.id === 'dayStart' && holdDayStart) return;
      if (finishing && e.id !== 'dayEnd') return;
      lastWorldSfxAt = performance.now();
      audio.sfx(e.id, { ...e.opts, pan: e.opts?.pan ?? pan(e.x) });
    }),
    bus.on('loop', (e) => audio.loop(e.id, e.on)),
    bus.on('shake', (e) => {
      floor.camera.shake(e.power, e.ms);
      if (e.power > 0.3) buzz(Math.min(200, Math.round(e.ms / 3)));
    }),
    bus.on('focus', (e) => {
      if (!settings.autoCamera) return;
      // While something big is going on, the camera does not wander off to listen to small talk.
      if (e.weight < 0.5 && sim.activeChaos().length > 0) return;
      floor.camera.suggest({ x: e.x, y: e.y, w: e.w, h: e.h }, e.weight, e.holdMs);
    }),
    bus.on('toast', (e) => toast(e.text, e.tone ?? 'info', e.icon)),
    bus.on('buzz', (e) => buzz(e.pattern)),
    bus.on('pickedUp', () => buzz(12)),
    bus.on('dropped', (e) => buzz(e.hard ? [18, 30, 18] : 10)),
    bus.on('objective', (e) => {
      toast(`Goal done: ${e.title}`, 'good', 'check');
      audio.sfx('objective');
    }),
    bus.on('chaosStart', () => buzz(25)),
    bus.on('dayStart', () => {
      objectives.startDay(sim.day);
      stockStart = sim.meters().stock;
      linesToday = 0;
      chaosPeak = 0;
    }),
    bus.on('dayEnd', () => void endDay())
  ];

  // ── the brain ──────────────────────────────────────────────────────────────

  let statusTimer = 0;
  let statusRunning = false;

  function applyStatus(st: BrainStatus): void {
    const chosen = settings.brain.provider;
    const state: BrainUi['state'] = chosen === 'instinct' ? 'instinct' : st.ok ? 'online' : 'offline';
    set((s) => ({
      brain: {
        ...s.brain, provider: chosen, state, model: (st.model || settings.brain.model).replace(/:latest$/, ''),
        tokPerSec: st.tokPerSec ?? null, error: st.ok ? null : st.error ?? 'The model is not answering.'
      }
    }));
  }

  async function refreshStatus(): Promise<BrainStatus> {
    statusRunning = true;
    try {
      const st = await brain.status();
      applyStatus(st);
      return st;
    } catch (err) {
      const st: BrainStatus = { provider: settings.brain.provider, ok: false, model: settings.brain.model, models: [], error: String(err) };
      applyStatus(st);
      return st;
    } finally {
      statusRunning = false;
    }
  }

  function rebuildBrain(): void {
    brain = parts.createBrain(settings.brain, { bank: parts.bank, world });
    director.setBrain(brain);
    set((s) => ({ brain: { ...s.brain, provider: settings.brain.provider, model: settings.brain.model, state: settings.brain.provider === 'instinct' ? 'instinct' : 'connecting', error: null } }));
    void refreshStatus();
  }

  function patchSettings(patch: Partial<GameSettings>): void {
    settings = { ...settings, ...patch };
    saveSettings(settings);
    set({ settings });
  }

  /** First run: find the model server and settle on a model without the player having to. */
  async function findBrain(): Promise<void> {
    const inArtifact = await parts.claudeAvailable().catch(() => false);
    if (inArtifact) {
      set({ inArtifact: true });
      // Inside Claude there is no network: only Claude itself or instinct can voice the staff.
      if (settings.brain.provider === 'ollama' || settings.brain.provider === 'openai') {
        patchSettings({ brain: { ...settings.brain, provider: 'claude' } });
        rebuildBrain();
        return;
      }
    }
    // Opened inside Claude but without leave to ask it anything: a model server cannot be
    // reached from there either, so the written lines are the honest default.
    const framed = typeof (window as unknown as { claude?: { use?: unknown } }).claude?.use === 'function';
    if (!inArtifact && framed && (settings.brain.provider === 'ollama' || settings.brain.provider === 'openai')) {
      patchSettings({ brain: { ...settings.brain, provider: 'instinct' } });
      rebuildBrain();
      return;
    }
    if (settings.brain.provider !== 'ollama') {
      void refreshStatus();
      return;
    }
    const sameOrigin = location.protocol.startsWith('http') ? `${location.origin}/ollama` : '';
    const lanHosts = location.protocol.startsWith('http') ? ['http://192.168.1.124:11434', 'http://MSI.lan:11434'] : [];
    // A build can name extra places to look (the Android app names the laptop on the home network).
    const extra = String(import.meta.env.VITE_OLLAMA_CANDIDATES ?? '').split(',').map((u) => u.trim()).filter(Boolean);
    const candidates = [...new Set([settings.brain.baseUrl, ...extra, sameOrigin, ...lanHosts, 'http://localhost:11434'].filter(Boolean))];
    const found = await parts.probeOllama(candidates).catch(() => null);
    if (found) {
      const want = settings.brain.model;
      const model = found.models.includes(want) ? want
        : found.models.find((m) => m.startsWith('artemis-custom')) ?? found.models.find((m) => m.startsWith(want)) ?? found.models[0] ?? want;
      if (found.baseUrl !== settings.brain.baseUrl || model !== settings.brain.model) {
        patchSettings({ brain: { ...settings.brain, baseUrl: found.baseUrl, model } });
        rebuildBrain();
        return;
      }
    }
    void refreshStatus();
  }

  // ── the day ────────────────────────────────────────────────────────────────

  async function endDay(): Promise<void> {
    if (get().phase === 'report') return;
    const storyDay = today();
    const activeSagaDay = mode === 'saga' ? sagaDay : null;
    const m = sim.meters();
    const day = sim.day;
    const stats = { incidents: sim.incidentsToday, stockStart, stockEnd: m.stock, morale: m.morale, chaosPeak: Math.round(chaosPeak) };
    flushFeed();
    const todays = get().feed.filter((f) => f.day === day && f.kind === 'say' && f.who && f.text.length > 18);
    const quotes = director.pickQuotes(todays, 3).map((f) => ({ who: f.who as CharId, name: displayName(f.who as CharId), avatar: avatar(f.who as CharId, f.emotion), text: f.text }));
    const base: DayReport = { day, headline: '', paragraphs: [], awards: [], quotes, stats: { ...stats, lines: linesToday }, writing: true };
    // Story & Saga modes: settle the day, move Branch Standing and save, before the report shows.
    if (mode === 'story' && story && storyDay) {
      story.finishDay(storyDay, sim.serialize());
      set({ storySaved: Story.peek(browserStore) });
    } else if (mode === 'saga' && saga && activeSagaDay) {
      saga.finishDay(activeSagaDay, sim.serialize());
      set({ sagaSaved: Saga.peek(browserStore) });
    }
    skipUntil = null;
    finishing = false;
    set({ phase: 'report', report: base, caption: null, beat: null, finishing: false, skippingTo: null });
    pushStory();
    const storyResult =
      mode === 'story' && story ? story.result
      : mode === 'saga' && saga ? saga.result
      : null;
    audio.sfx(storyResult ? (storyResult.won ? 'dayWon' : 'dayLost') : 'dayEnd');
    audio.setMusicMood({ menu: true });
    saveWorld();
    const storyInfo =
      storyResult && mode === 'story' && story ? {
        title: `${story.def.weekday}: ${story.def.title}`,
        goal: story.def.goal.title,
        won: storyResult.won,
        lines: [...storyResult.text],
        changes: storyResult.changes.map((c) => `${c.delta > 0 ? '+' : ''}${c.delta} ${c.text}`)
      }
      : storyResult && mode === 'saga' && saga ? {
        title: `Season ${saga.season} (${saga.arc.title}) · ${saga.def.weekday}: ${saga.def.title}`,
        goal: saga.def.goalInfo.title,
        won: storyResult.won,
        lines: [...storyResult.text],
        changes: storyResult.changes.map((c) => `${c.delta > 0 ? '+' : ''}${c.delta} ${c.text}`)
      }
      : undefined;
    const awardsOf = (r: { awards: { title: string; who: CharId; why: string }[] }): DayReport['awards'] =>
      r.awards.filter((a) => a.who).map((a) => ({ title: a.title, who: a.who, name: displayName(a.who), avatar: avatar(a.who, 'proud'), why: a.why }));
    // A slow model can take a minute over the write-up: the quick written summary shows at once,
    // and the model's own version replaces it when it arrives.
    const res = await director.writeReport(stats, storyInfo, (draft) => {
      const cur = get().report;
      if (!cur || cur.day !== day || !cur.writing) return;
      set({ report: { ...base, headline: draft.headline, paragraphs: draft.paragraphs, awards: awardsOf(draft), writing: true, draft: true } });
    });
    if (get().report?.day !== day) return;
    set({
      report: {
        ...base,
        headline: res.headline,
        paragraphs: res.paragraphs,
        awards: awardsOf(res),
        writing: false,
        draft: false
      }
    });
    saveWorld();
    // In Endless Saga, ask the model to craft tomorrow's reactive opening & plot twist while reading the report.
    if (mode === 'saga' && saga && activeSagaDay && brain.sagaEpisode) {
      const targetSaga = saga;
      const req = targetSaga.buildEpisodeRequest(activeSagaDay, sim.dayLog());
      void brain.sagaEpisode(req).then((ep) => {
        if (saga !== targetSaga) return;
        targetSaga.applyAiEpisode(req.season, req.day, ep);
        pushStory();
      }).catch(() => undefined);
    }
  }

  /** The sandbox world saves itself; story and saga days save via their own state/world stores. */
  function saveWorld(): void {
    if (mode === 'sandbox') saveJson(SAVE_KEY, sim.serialize());
  }

  // ── story & saga modes ─────────────────────────────────────────────────────

  let lastStoryKey = '';

  /** Keep UiState.story in step (only a new object when something changed). */
  function pushStory(): void {
    const ui: StoryUi | null =
      mode === 'story' && story ? story.ui(day)
      : mode === 'saga' && saga ? saga.ui(sagaDay)
      : null;
    const key = ui ? JSON.stringify(ui) : '';
    if (key === lastStoryKey && (ui !== null) === (get().story !== null)) return;
    lastStoryKey = key;
    set({ story: ui, mode });
  }

  let ceremonySeq = 0;

  function handleGoalNotice(
    g: { id: string; title: string; state: 'won' | 'lost'; main: boolean },
    mainDef: { stamp?: readonly [string, string]; icon: string; room?: Parameters<typeof roomCentrePx>[0] } | undefined,
    extraDetail: string
  ): void {
    if (finishing) return;
    const won = g.state === 'won';
    ceremonySeq += 1;
    if (g.main && mainDef) {
      const stamp = mainDef.stamp ?? ['GOAL DONE', 'GOAL FAILED'];
      set({ ceremony: { id: `c${ceremonySeq}`, kind: won ? 'goalWon' : 'goalLost', title: won ? stamp[0] : stamp[1], detail: g.title, icon: mainDef.icon, room: mainDef.room } });
      audio.sfx(won ? 'goalWin' : 'goalFail');
      if (won) {
        if (mainDef.room) {
          const c = roomCentrePx(mainDef.room);
          floor.cue({ kind: 'burst', what: 'stars', x: c.x, y: c.y, count: 16 });
          floor.cue({ kind: 'burst', what: 'confetti', x: c.x, y: c.y - 8, count: 12 });
        }
        buzz([20, 40, 20, 40, 60]);
      } else buzz([60, 40, 60]);
      return;
    }
    const detail = won ? extraDetail : undefined;
    set({ ceremony: { id: `c${ceremonySeq}`, kind: won ? 'extraWon' : 'extraLost', title: g.title, detail } });
    if (won) {
      toast(`Goal done: ${g.title}${/[.?!]$/.test(g.title) ? '' : '.'} ${extraDetail}`, 'good', 'check');
      audio.sfx('objective');
    } else {
      toast(`Goal failed: ${g.title}`, 'bad', 'x');
      audio.sfx('deny');
    }
  }

  function resetDayOverlay(): void {
    day?.dispose();
    day = null;
    sagaDay?.dispose();
    sagaDay = null;
    feedBuffer = [];
    skipUntil = null;
    finishing = false;
    set({ feed: [], beat: null, ceremony: null, finishing: false, skippingTo: null });
    holdDayStart = true;
  }

  /** Build the office for the story's current day (from its saved morning) and show the chapter card. */
  function storyDayStart(): void {
    if (!story) return;
    resetDayOverlay();
    const next = buildSim({ save: story.daySave(), dayMinutes: STORY_DAY_MINUTES, sandbox: false, seed: story.simSeed() });
    if (next.day !== story.chapter) next.beginDay(story.chapter);
    // Building the office announces the day it was saved on before today begins: only today belongs in today's Log.
    feedBuffer = feedBuffer.filter((f) => f.day === next.day);
    story.recordStart(next.serialize());
    mode = 'story';
    swapWorld(next);
    day = story.beginDay(sim, {
      onGoal: (g) => handleGoalNotice(g, day?.def.goal, `+${EXTRA_INFLUENCE} influence`),
      script: (lines, o) => director.playScript(lines, o)
    });
    set({ mode: 'story', phase: 'briefing', paused: false, report: null, storySaved: Story.peek(browserStore), sagaSaved: Saga.peek(browserStore) });
    audio.setMusicMood({ menu: true });
    pushUi();
  }

  /** Build the office for the active Endless Saga day with full sandbox settings & zero restrictions. */
  function sagaDayStart(): void {
    if (!saga) return;
    resetDayOverlay();
    const next = buildSim({ save: saga.daySave(), dayMinutes: settings.dayMinutes, sandbox: settings.sandbox, seed: saga.simSeed() });
    const absDay = (saga.season - 1) * 5 + saga.chapter;
    if (next.day !== absDay) next.beginDay(absDay);
    feedBuffer = feedBuffer.filter((f) => f.day === next.day);
    saga.recordStart(next.serialize());
    mode = 'saga';
    swapWorld(next);
    sagaDay = saga.beginDay(sim, {
      onGoal: (g) => handleGoalNotice(g, sagaDay?.def.goalInfo, `+${SAGA_EXTRA_STANDING} standing`)
    });
    set({ mode: 'saga', phase: 'briefing', paused: false, report: null, storySaved: Story.peek(browserStore), sagaSaved: Saga.peek(browserStore) });
    audio.setMusicMood({ menu: true });
    pushUi();
  }

  function showEnding(): void {
    day?.dispose();
    day = null;
    mode = 'story';
    finishing = false;
    const ending = story?.endingId() ?? 'scraped';
    // The week's last scene plays on the floor first; the ending card waits for it (or for Skip).
    finaleScene = buildFinale(ending);
    set({ mode: 'story', phase: 'ending', paused: false, report: null, beat: null, ceremony: null, finishing: false, finale: !!finaleScene, storySaved: Story.peek(browserStore) });
    // The ending's sting and music start as the ending begins (the scene's phone call follows a moment later).
    audio.sfx(ending === 'saved' ? 'endingSaved' : ending === 'closed' ? 'endingClosed' : 'endingScraped');
    audio.setMusicMood({ menu: true, ending });
    pushUi();
  }

  function showSagaEnding(): void {
    sagaDay?.dispose();
    sagaDay = null;
    mode = 'saga';
    finishing = false;
    const ending = saga?.endingId() ?? 'scraped';
    set({
      mode: 'saga', phase: 'ending', paused: false, report: null, beat: null, ceremony: null,
      finishing: false, finale: false, sagaSaved: Saga.peek(browserStore)
    });
    audio.sfx(ending === 'saved' ? 'endingSaved' : ending === 'closed' ? 'endingClosed' : 'endingScraped');
    audio.setMusicMood({ menu: true, ending });
    pushUi();
  }

  /** The office for the last scene (everyone in, quietly), with the scene on top. Null if it cannot be built. */
  function buildFinale(ending: EndingId): FinaleScene | null {
    if (!story) return null;
    try {
      const next = buildSim({ save: story.endSnapshot, dayMinutes: STORY_DAY_MINUTES, sandbox: false, seed: (story.simSeed() ^ 0x5eed) >>> 0 || 1 });
      // Arrivals happen off stage: no greetings, footsteps or jingles while the staff come in.
      finishing = true;
      next.beginDay(story.chapter);
      for (let t = 0; t < FINALE_PREROLL; t += 0.25) next.update(0.25);
      finishing = false;
      feedBuffer = [];
      swapWorld(next);
      set({ feed: [] });
      const scene = new FinaleScene(sim, ending, story.state.notes);
      floor.camera.frame(scene.frame);
      return scene;
    } catch (err) {
      finishing = false;
      console.error('[game] the last scene could not be set up', err);
      return null;
    }
  }

  function endFinale(): void {
    finaleScene?.skip();
    finaleScene = null;
    if (get().finale) set({ finale: false });
  }

  /** Leave Story or Saga for the sandbox office (rebuilt from its own save). */
  function enterSandbox(): void {
    day?.dispose();
    day = null;
    story = null;
    sagaDay?.dispose();
    sagaDay = null;
    saga = null;
    mode = 'sandbox';
    feedBuffer = [];
    set({ feed: [] });
    swapWorld(sandboxSim());
    set({ mode: 'sandbox', story: null, storySaved: Story.peek(browserStore), sagaSaved: Saga.peek(browserStore) });
    lastStoryKey = '';
  }

  /**
   * Classic Story mode: pay for an action, or refuse it with a toast and a 'deny' (locked today, or
   * not enough influence). Returns the reason, or null when paid. Sandbox & Endless Saga are free.
   */
  function pay(action: ActionId): string | null {
    if (mode !== 'story' || !day) return null;
    // Nothing can be done to an office that has not opened yet (or has closed for the day).
    if (get().phase !== 'playing') return 'The day has not started.';
    const reason = day.refusal(action);
    if (reason) {
      toast(reason, 'bad', 'influence');
      audio.sfx('deny');
      return reason;
    }
    day.spend(action);
    return null;
  }

  /** Nobody to whisper to or order about: say so (they have not arrived, or have gone), and charge nothing. */
  function notHere(who: CharId): boolean {
    const p = sim.person(who);
    if (p?.present) return false;
    toast(`${p?.name ?? 'They'} ${sim.clock < 9 * 60 + 10 ? 'is not in yet' : 'is not in the building'}.`, 'bad', 'door');
    audio.sfx('deny');
    return true;
  }

  function noteStory(a: PlayerAction): void {
    if (mode === 'story' && day) day.note(a);
    else if (mode === 'saga' && sagaDay) sagaDay.note(a);
  }

  // ── the loop ───────────────────────────────────────────────────────────────

  let raf = 0;
  let last = performance.now();
  let uiClock = 0;
  let saveClock = 0;
  let running = true;
  let hidden = false;

  function flushFeed(): void {
    if (!feedBuffer.length) return;
    const add = feedBuffer;
    feedBuffer = [];
    set((s) => ({ feed: [...s.feed, ...add].slice(-FEED_MAX) }));
  }

  function pushUi(): void {
    const m = sim.meters();
    if (m.chaos > chaosPeak) chaosPeak = m.chaos;
    const selected = get().selectedId;
    const people = sim.peopleUi().map((p) => ({ ...p, avatar: avatar(p.id, p.emotion), color: p.color || hex(0x8890a6) }));
    if (selected && !people.some((p) => p.id === selected && p.present)) select(null);
    flushFeed();
    if (get().caption && performance.now() > captionUntil) set({ caption: null });
    if (get().phase === 'playing' && mode === 'sandbox') objectives.update();
    pushStory();
    set((s) => ({
      objectives: mode === 'sandbox' ? objectives.ui() : [],
      day: sim.day, weekday: sim.weekday || WEEKDAYS[(sim.day - 1) % 5], clock: sim.clock, dayProgress: sim.dayProgress, meters: m,
      incidentsToday: sim.incidentsToday, incidentFreeDays: sim.incidentFreeDays, people, cooldowns: sim.cooldowns(), activeChaos: sim.activeChaos(),
      holding: input.held,
      brain: s.brain.thinking === brainBusy.thinking && s.brain.queued === brainBusy.queued ? s.brain : { ...s.brain, thinking: brainBusy.thinking, queued: brainBusy.queued }
    }));
    audio.setMusicMood({
      chaos: m.chaos / 100, hour: sim.clock / 60,
      disco: sim.activeChaos().some((c) => c.id === 'disco'),
      blackout: sim.activeChaos().some((c) => c.id === 'blackout'),
      frozen: sim.activeChaos().some((c) => c.id === 'timeFreeze'),
      menu: get().phase !== 'playing',
      stakes: mode === 'story' && day && get().phase === 'playing'
        ? day.stakes()
        : mode === 'saga' && sagaDay && get().phase === 'playing'
          ? sagaDay.stakes()
          : 0,
      ending: get().phase === 'ending' ? (mode === 'saga' ? saga?.endingId() : story?.endingId()) ?? null : null
    });
  }

  function tick(now: number): void {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const real = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (hidden) return;
    const s = get();
    // Behind the start card the office idles through the first few minutes of the morning, then waits.
    const waiting = s.phase === 'title' && sim.dayProgress > 0.06;
    // Behind a chapter card the office is held at its 08:50 start; behind the ending card nothing moves,
    // but the week's last scene plays on the floor first (at normal speed).
    const finale = s.phase === 'ending' && s.finale && !!finaleScene;
    const held = s.phase === 'briefing' || (s.phase === 'ending' && !finale);
    const active = (!s.paused || finishing) && s.phase !== 'report' && !held && !waiting;
    const simDt = active ? real * (finishing ? FINISH_SPEED : finale ? 1 : s.speed) : 0;
    if (simDt > 0) {
      // Large steps are split so people still walk and arrive properly.
      const steps = Math.max(1, Math.ceil(simDt / 0.25));
      for (let i = 0; i < steps; i++) {
        const dt = simDt / steps;
        sim.update(dt);
        if (s.phase === 'playing') {
          if (!finishing) director.update(dt);
          if (mode === 'story') day?.update(dt);
          else if (mode === 'saga') sagaDay?.update(dt);
        } else if (finale) finaleScene?.update(dt);
      }
      if (finale && finaleScene?.done) endFinale();
      if (skipUntil !== null && (sim.clock >= skipUntil || s.phase !== 'playing')) stopSkip();
    }
    input.update(real);
    floor.render(sim.frame(), simDt, real);

    uiClock += real;
    if (uiClock >= UI_TICK) {
      uiClock = 0;
      pushUi();
    }
    statusTimer += real;
    if (statusTimer > 15 && !statusRunning) {
      statusTimer = 0;
      void refreshStatus();
    }
    saveClock += simDt;
    if (saveClock > 45) {
      saveClock = 0;
      saveWorld();
    }
  }

  // ── selection, targeting, input ────────────────────────────────────────────

  function select(who: CharId | null): void {
    if (get().selectedId === who) return;
    set({ selectedId: who });
    sim.select(who);
    if (who) floor.camera.followPoint(() => floor.personWorld(who));
    else floor.camera.stopFollowing();
  }

  function triggerChaos(id: ChaosId, target: ChaosTarget): string | null {
    if (mode === 'story' && day) {
      if (get().phase !== 'playing') return 'The day has not started.';
      // Locked today, or not enough influence: refused before anything happens.
      const no = day.refusal(id);
      if (no) {
        toast(no, 'bad', day.lockedUi()[id] ? 'lock' : 'influence');
        audio.sfx('deny');
        return no;
      }
    }
    // Paid for only if it happens: a power the office refuses (cooling down, nobody there) is free.
    const reason = mode === 'story' && day ? day.attempt(id, () => sim.startChaos(id, target)) : sim.startChaos(id, target);
    if (reason) {
      audio.sfx('deny');
      return reason;
    }
    noteStory({ kind: 'power', id, target });
    audio.sfx('confirm');
    return null;
  }

  function beginTargeting(t: TargetingUi | null): void {
    set({ targeting: t });
    floor.setTargetMode(!t ? 'none' : t.need === 'room' ? 'room' : 'person');
  }

  function finishTargeting(target: ChaosTarget): void {
    const t = get().targeting;
    if (!t) return;
    beginTargeting(null);
    const reason = triggerChaos(t.chaos, target);
    if (reason) toast(reason, 'bad');
  }

  /** When the player was last told that pick-ups wait for the clock (story, paused). */
  let pausedNoteAt = -Infinity;
  const input = new FloorInput(floor, {
    tapPerson: (who) => {
      audio.sfx('select');
      select(who);
    },
    tapEmpty: () => select(null),
    pickUp: (who) => {
      if (get().phase !== 'playing') return false;
      // In the story, carrying people about while the clock is stopped would make every deadline free:
      // say so, and let the drag pan instead.
      if (mode === 'story' && (get().paused || finishing)) {
        // One press can ask twice (on the long press and on the first move): say it once.
        if (get().paused && performance.now() - pausedNoteAt > 2500) {
          pausedNoteAt = performance.now();
          toast('Paused: tap the clock to carry on, then pick them up.', 'info', 'pause');
        }
        return false;
      }
      const ok = sim.pickUp(who);
      if (ok) audio.sfx('pickup');
      return ok;
    },
    dragTo: (w) => sim.dragTo(w.x, w.y),
    drop: (vx, vy) => {
      sim.drop(vx, vy);
      audio.sfx('drop');
    },
    targeting: () => {
      const t = get().targeting;
      return !t ? 'none' : t.need === 'room' ? 'room' : 'person';
    },
    pickRoom: (room: TargetRoomId) => finishTargeting({ room }),
    pickPerson: (who) => {
      const t = get().targeting;
      if (!t) return;
      if (t.need === 'person') finishTargeting({ who });
      else if (!t.who) {
        audio.sfx('select');
        set({ targeting: { ...t, who } });
      } else if (t.who !== who) finishTargeting({ who: t.who, other: who });
    },
    touched: () => void audio.unlock()
  });

  // ── the app going to the background ────────────────────────────────────────

  let wakeLock: { release(): Promise<void> } | null = null;
  async function keepAwake(): Promise<void> {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      wakeLock = null;
    }
  }
  const onVisibility = (): void => {
    hidden = document.hidden;
    if (hidden) {
      input.cancel();
      audio.suspend();
      saveWorld();
    } else {
      last = performance.now();
      audio.resume();
      if (get().phase === 'playing') void keepAwake();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  // Closing the tab or reloading: phones fire this more reliably than anything else.
  const onPageHide = (): void => { saveWorld(); };
  window.addEventListener('pagehide', onPageHide);

  // ── the public surface ─────────────────────────────────────────────────────

  const game: Game = {
    store,

    begin() {
      void audio.unlock().then(() => audio.startMusic());
      if (get().phase === 'title') {
        set({ phase: 'playing', paused: false });
        director.reset();
        audio.setMusicMood({ menu: false });
        void keepAwake();
      }
    },
    setPaused(paused) {
      set({ paused });
      if (paused) input.cancel();
    },
    setSpeed(speed) {
      set({ speed });
    },
    nextDay() {
      if (get().phase !== 'report') return;
      floor.clearFx();
      if (mode === 'story' && story) {
        // On to the next chapter's card, or the end of the week.
        if (story.advance() === 'ending') showEnding();
        else storyDayStart();
        return;
      }
      if (mode === 'saga' && saga) {
        if (saga.advance() === 'ending') showSagaEnding();
        else sagaDayStart();
        return;
      }
      sim.beginDay(sim.day + 1);
      director.reset();
      set({ phase: 'playing', report: null, paused: false });
      audio.setMusicMood({ menu: false });
      saveWorld();
    },

    startStory(fresh) {
      void audio.unlock().then(() => audio.startMusic());
      // Keep the sandbox office as it was before stepping into the story.
      saveWorld();
      sagaDay?.dispose();
      sagaDay = null;
      saga = null;
      finaleScene = null;
      if (get().finale) set({ finale: false });
      let s = fresh ? null : Story.load(browserStore);
      if (!s || s.stage === 'ended') s = Story.create(browserStore, (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
      story = s;
      lastStoryKey = '';
      // A day that was finished but not moved on from carries on with the next one.
      if (s.stage === 'done' && s.advance() === 'ending') {
        showEnding();
        return;
      }
      storyDayStart();
    },
    startSaga(fresh) {
      void audio.unlock().then(() => audio.startMusic());
      saveWorld();
      day?.dispose();
      day = null;
      story = null;
      finaleScene = null;
      if (get().finale) set({ finale: false });
      let s = fresh ? null : Saga.load(browserStore);
      if (!s) s = Saga.create(browserStore, (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
      else if (s.stage === 'ended') s.startNextSeason();
      saga = s;
      lastStoryKey = '';
      if (s.stage === 'done' && s.advance() === 'ending') {
        showSagaEnding();
        return;
      }
      sagaDayStart();
    },
    nextSeason() {
      if (mode !== 'saga' || !saga) return;
      saga.startNextSeason();
      sagaDayStart();
    },
    startSandbox() {
      if (mode === 'story' || mode === 'saga') {
        enterSandbox();
        set({ phase: 'title' });
      }
      game.begin();
    },
    beginChapter() {
      void audio.unlock().then(() => audio.startMusic());
      if (get().phase !== 'briefing') return;
      if (mode === 'story' && !day) return;
      if (mode === 'saga' && !sagaDay) return;
      if (mode !== 'story' && mode !== 'saga') return;
      set({ phase: 'playing', paused: false });
      holdDayStart = false;
      audio.sfx('dayStart');
      director.reset();
      audio.setMusicMood({ menu: false });
      void keepAwake();
      pushUi();
    },
    retryDay() {
      const phase = get().phase;
      if (phase !== 'report' && phase !== 'playing' && phase !== 'briefing') return;
      if (mode === 'story' && story) {
        story.retry();
        storyDayStart();
        return;
      }
      if (mode === 'saga' && saga) {
        saga.retry();
        sagaDayStart();
      }
    },
    skipFinale() {
      if (get().phase === 'ending' && get().finale) endFinale();
    },
    skipAhead() {
      if (mode !== 'story' || !day || get().phase !== 'playing' || finishing) return;
      const t = day.nextBeat();
      if (t === null) return;
      skipUntil = t;
      finishing = true;
      select(null);
      beginTargeting(null);
      set({ finishing: true, skippingTo: t, paused: false, caption: null });
      audio.sfx('whoosh');
    },
    finishDay() {
      const activeDay = mode === 'story' && story ? day : mode === 'saga' && saga ? sagaDay : null;
      if (skipUntil !== null) stopSkip();
      if (!activeDay || get().phase !== 'playing' || finishing) return;
      if (!activeDay.settled) return;
      finishing = true;
      director.reset();
      select(null);
      beginTargeting(null);
      set({ finishing: true, paused: false, caption: null, beat: null, ceremony: null });
      audio.sfx('whoosh');
    },
    accuse(who) {
      if (get().phase !== 'playing') return;
      if (mode === 'story' && day) day.accuse(who);
      else if (mode === 'saga' && sagaDay) sagaDay.accuse(who);
      else return;
      pushUi();
    },
    toTitle() {
      skipUntil = null;
      finishing = false;
      finaleScene = null;
      set({ finishing: false, beat: null, ceremony: null, finale: false });
      if (mode === 'story' || mode === 'saga') enterSandbox();
      else saveWorld();
      set({ phase: 'title', paused: false, report: null, storySaved: Story.peek(browserStore), sagaSaved: Saga.peek(browserStore) });
      audio.setMusicMood({ menu: true });
      pushUi();
    },

    triggerChaos,
    customEvent(text) {
      if (!text.trim() || pay('anything')) return false;
      director.customEvent(text);
      noteStory({ kind: 'anything', text });
      objectives.note('custom');
      audio.sfx('confirm');
      return true;
    },
    whisper(who, text) {
      if (!text.trim() || notHere(who) || pay('whisper')) return false;
      director.whisper(who, text);
      noteStory({ kind: 'whisper', who, text });
      objectives.note('whisper', who);
      audio.sfx('whisperSend');
      return true;
    },
    announce(text) {
      if (!text.trim() || pay('announce')) return false;
      director.announce(text);
      noteStory({ kind: 'announce', text });
      objectives.note('announce');
      return true;
    },
    cue(who, instruction) {
      if (!instruction.trim() || notHere(who) || pay('cue')) return false;
      director.cue(who, instruction);
      noteStory({ kind: 'cue', who, text: instruction });
      objectives.note('cue', who);
      audio.sfx('confirm');
      return true;
    },
    poke(who) {
      sim.poke(who);
      audio.sfx('pop');
      buzz(8);
    },

    beginTargeting,

    select,
    focusPerson(who) {
      floor.camera.followPoint(() => floor.personWorld(who));
    },
    focusRoom(room) {
      floor.camera.frame(roomRectPx(room));
    },
    resetCamera() {
      floor.camera.goHome();
    },
    setInsets(insets) {
      floor.setInsets(insets);
    },

    person(who) {
      const d = sim.personDetail(who);
      if (!d) return null;
      return {
        ...d,
        avatar: avatar(who, d.emotion),
        bonds: d.bonds.map((b) => ({ ...b, avatar: avatar(b.id, 'neutral') }))
      };
    },
    headOnScreen(who): ScreenPoint {
      return floor.headOnScreen(who);
    },
    activeSpeech() {
      return sim.frame().speeches;
    },
    avatar,

    updateSettings(patch) {
      const before = settings;
      patchSettings(patch);
      if (patch.volumes) audio.setVolumes(settings.volumes);
      if (patch.muted !== undefined) audio.setMuted(settings.muted);
      if (patch.autoCamera !== undefined) floor.camera.setAuto(settings.autoCamera);
      if (patch.brain && JSON.stringify(patch.brain) !== JSON.stringify(before.brain)) rebuildBrain();
      // Day length and sandbox are read by the sim when the next day begins.
    },
    updateBrain(patch) {
      patchSettings({ brain: { ...settings.brain, ...patch } });
      rebuildBrain();
    },
    testBrain() {
      statusTimer = 0;
      return refreshStatus();
    },
    resetWorld() {
      removeKey(SAVE_KEY);
      // In Story or Endless Saga, only the sandbox office is wiped; the active arc carries on.
      if (mode === 'story' || mode === 'saga') {
        toast('The sandbox office starts again from day 1.', 'info');
        return;
      }
      director.dispose();
      floor.clearFx();
      sim = buildSim({ dayMinutes: settings.dayMinutes, sandbox: settings.sandbox });
      director = makeDirector();
      objectives.dispose();
      objectives = new Objectives(sim, bus, () => sim.meters(), () => sim.incidentsToday);
      feedBuffer = [];
      set({ feed: [], report: null, phase: 'playing', paused: false, selectedId: null, caption: null, targeting: null });
      floor.camera.goHome();
      toast('The office starts again from day 1.', 'info');
    },
    goFullscreen() {
      // The Android app is full screen and landscape already; its web view has no fullscreen mode to enter.
      if (import.meta.env.VITE_APP_SHELL === '1') return;
      const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
      const lock = (): void => {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        o.lock?.('landscape').catch(() => undefined);
      };
      try {
        const p = el.requestFullscreen?.();
        if (p) p.then(lock).catch(() => undefined);
      } catch {
        /* not allowed here: play in the window */
      }
    },
    uiSound(id: SfxId) {
      audio.sfx(id);
    },
    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      for (const t of timers) clearTimeout(t);
      for (const off of offs) off();
      saveWorld();
      day?.dispose();
      sagaDay?.dispose();
      void wakeLock?.release().catch(() => undefined);
      input.destroy();
      objectives.dispose();
      director.dispose();
      floor.destroy();
      audio.dispose();
      bus.clear();
    }
  };

  pushUi();
  raf = requestAnimationFrame(tick);
  void findBrain();
  return game;
}

/** A few items spread across a list (first, middle, last ...), for "quotes of the day". */
function pickSpread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items.slice();
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[Math.floor(((i + 0.5) / n) * items.length)]);
  return out;
}

