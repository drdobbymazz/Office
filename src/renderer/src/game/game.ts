// The game itself: wires the simulation, the brain, the director, the floor,
// the sound and the UI store together, and is the one object the React UI
// talks to (GameApi). Everything it needs is passed in as `parts`, so it can
// be assembled with stand-ins in a test page.

import { create } from 'zustand';
import type {
  BrainUi, DayReport, GameApi, GameSettings, PersonDetail, PersonUi, ScreenPoint, TargetingUi, ToastUi, UiState
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
import { ROOMS, WORLD_W, roomRectPx } from '@/game/core/world';
import type { CreateActorView, CreateFxView, PortraitUrl, RenderFrame } from '@/game/view/api';
import { GameFloor } from '@/scene/office/floor/GameFloor';
import { FloorInput } from '@/scene/office/floor/input';
import { Director } from '@/game/director/director';
import type { Sim, SimOptions } from '@/game/sim';
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
        id: v.id, name: v.name, role: v.role, summary: v.summary, speech: 'Brisk and businesslike.', wants: 'to get this over with',
        fears: 'nothing here', quirk: '', secret: '', examples: [] as string[]
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

  let sim = parts.createSim({
    bus, reflexes, dayMinutes: settings.dayMinutes, sandbox: settings.sandbox, save: loadJson<SimOptions['save']>(SAVE_KEY) ?? undefined,
    now: () => performance.now()
  });
  for (const s of parts.chaosScripts) sim.registerChaos(s);

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
    settings, holding: null, targeting: null, inArtifact: false
  }));
  const set = store.setState;
  const get = store.getState;

  let director = makeDirector();
  let objectives = new Objectives(sim, bus, () => sim.meters(), () => sim.incidentsToday);

  function makeDirector(): Director {
    return new Director({
      sim, brain, instinct,
      pace: () => 1,
      onBusy: (b) => {
        brainBusy = { thinking: b.thinking, queued: b.queued };
      }
    });
  }

  // ── feed, captions, toasts ─────────────────────────────────────────────────

  let feedBuffer: FeedItem[] = [];
  let linesToday = 0;
  let chaosPeak = 0;
  let stockStart = sim.meters().stock;
  let captionUntil = 0;
  let toastSeq = 0;
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
    }),
    bus.on('speech', (sp: Speech) => {
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
    bus.on('sfx', (e) => audio.sfx(e.id, { ...e.opts, pan: e.opts?.pan ?? pan(e.x) })),
    bus.on('loop', (e) => audio.loop(e.id, e.on)),
    bus.on('shake', (e) => {
      floor.camera.shake(e.power, e.ms);
      if (e.power > 0.3) buzz(Math.min(200, Math.round(e.ms / 3)));
    }),
    bus.on('focus', (e) => {
      if (settings.autoCamera) floor.camera.suggest({ x: e.x, y: e.y, w: e.w, h: e.h }, e.weight, e.holdMs);
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
      audio.sfx('dayStart');
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
        ...s.brain, provider: chosen, state, model: st.model || settings.brain.model,
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
    if (settings.brain.provider !== 'ollama') {
      void refreshStatus();
      return;
    }
    const sameOrigin = location.protocol.startsWith('http') ? `${location.origin}/ollama` : '';
    const candidates = [...new Set([settings.brain.baseUrl, sameOrigin, 'http://localhost:11434'].filter(Boolean))];
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
    const m = sim.meters();
    const day = sim.day;
    const stats = { incidents: sim.incidentsToday, stockStart, stockEnd: m.stock, morale: m.morale, chaosPeak: Math.round(chaosPeak) };
    flushFeed();
    const todays = get().feed.filter((f) => f.day === day && f.kind === 'say' && f.who && f.text.length > 18);
    const quotes = pickSpread(todays, 3).map((f) => ({ who: f.who as CharId, name: displayName(f.who as CharId), avatar: avatar(f.who as CharId, f.emotion), text: f.text }));
    const base: DayReport = { day, headline: '', paragraphs: [], awards: [], quotes, stats: { ...stats, lines: linesToday }, writing: true };
    set({ phase: 'report', report: base, caption: null });
    audio.sfx('dayEnd');
    audio.setMusicMood({ menu: true });
    saveJson(SAVE_KEY, sim.serialize());
    const res = await director.writeReport(stats);
    if (get().report?.day !== day) return;
    set({
      report: {
        ...base,
        headline: res.headline,
        paragraphs: res.paragraphs,
        awards: res.awards.filter((a) => a.who).map((a) => ({ title: a.title, who: a.who, name: displayName(a.who), avatar: avatar(a.who, 'proud'), why: a.why })),
        writing: false
      }
    });
    saveJson(SAVE_KEY, sim.serialize());
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
    if (get().phase === 'playing') objectives.update();
    set((s) => ({
      objectives: objectives.ui(),
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
      menu: get().phase !== 'playing'
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
    const active = !s.paused && s.phase !== 'report' && !waiting;
    const simDt = active ? real * s.speed : 0;
    if (simDt > 0) {
      sim.update(simDt);
      if (s.phase === 'playing') director.update(simDt);
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
      saveJson(SAVE_KEY, sim.serialize());
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
    const reason = sim.startChaos(id, target);
    if (reason) {
      audio.sfx('deny');
      return reason;
    }
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

  const input = new FloorInput(floor, {
    tapPerson: (who) => {
      audio.sfx('select');
      select(who);
    },
    tapEmpty: () => select(null),
    pickUp: (who) => {
      if (get().phase !== 'playing') return false;
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
      saveJson(SAVE_KEY, sim.serialize());
    } else {
      last = performance.now();
      audio.resume();
      if (get().phase === 'playing') void keepAwake();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

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
      sim.beginDay(sim.day + 1);
      director.reset();
      set({ phase: 'playing', report: null, paused: false });
      audio.setMusicMood({ menu: false });
      saveJson(SAVE_KEY, sim.serialize());
    },

    triggerChaos,
    customEvent(text) {
      director.customEvent(text);
      objectives.note('custom');
      audio.sfx('confirm');
    },
    whisper(who, text) {
      director.whisper(who, text);
      objectives.note('whisper', who);
      audio.sfx('whisperSend');
    },
    announce(text) {
      director.announce(text);
      objectives.note('announce');
    },
    cue(who, instruction) {
      director.cue(who, instruction);
      objectives.note('cue', who);
      audio.sfx('confirm');
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
      director.dispose();
      floor.clearFx();
      sim = parts.createSim({ bus, reflexes, dayMinutes: settings.dayMinutes, sandbox: settings.sandbox, now: () => performance.now() });
      for (const s of parts.chaosScripts) sim.registerChaos(s);
      director = makeDirector();
      objectives.dispose();
      objectives = new Objectives(sim, bus, () => sim.meters(), () => sim.incidentsToday);
      feedBuffer = [];
      set({ feed: [], report: null, phase: 'playing', paused: false, selectedId: null, caption: null, targeting: null });
      floor.camera.goHome();
      toast('The office starts again from day 1.', 'info');
    },
    goFullscreen() {
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
      for (const t of timers) clearTimeout(t);
      for (const off of offs) off();
      saveJson(SAVE_KEY, sim.serialize());
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

