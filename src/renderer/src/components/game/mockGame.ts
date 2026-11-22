// A fake game for building and screenshotting the interface on its own.
// The clock runs, meters drift, the fifteen walk between rooms and change
// mood, lines are spoken over their heads, the feed fills, cooldowns tick and
// a report appears on demand. Seeded, so screenshots repeat.
//
// It also owns a tiny camera (world -> screen) so the harness can draw the
// office and people where headOnScreen() says they are.
//
// Story mode is pretend too: the five chapters' texts and numbers come from
// mockStory.ts, influence is spent, Thursday's accusation works (the leak is
// Toby), and jumpStory() opens any point of the week for screenshots.

import { create } from 'zustand';
import type {
  ActiveChaosUi, DayReport, GameApi, GameSettings, PersonDetail, PersonUi, ScreenPoint, TargetingUi, ToastUi, UiState
} from '@/game/app/gameApi';
import type { BrainSettings, BrainStatus } from '@/game/brain/api';
import { DEFAULT_BRAIN_SETTINGS } from '@/game/brain/api';
import type { SfxId } from '@/game/audio/api';
import {
  CAST_IDS, type CastId, type ChaosId, type ChaosTarget, type CharId, type EmotionId, type FeedItem,
  type RoomId, type Speech, type SpeechKind, type StatusKind, type TargetRoomId
} from '@/game/core/types';
import { CAST, BOND_SEEDS } from '@/game/core/cast';
import { CHAOS } from '@/game/core/chaos';
import { MAP_PX_H, MAP_PX_W, ROOMS, TILE, walkableTilesIn, deskOf } from '@/game/core/world';
import { paintPortrait } from '@/scene/office/portraitArt';
import type { ActionId } from '@/game/app/gameApi';
import {
  buildStory, DEFAULT_WEEK, ENDING_WEEK, MOCK_CHAPTERS, MOCK_LEAK, standingAt,
  type DayResult, type EndingId, type Stage
} from './mockStory';

export interface StoryJump {
  /** title (a story saved on day 3), title-new (nothing saved), briefing, play, report, ending */
  stage: 'title' | 'title-new' | 'briefing' | 'play' | 'report' | 'ending';
  chapter?: number;
  /** report: won or lost */
  won?: boolean;
  ending?: EndingId;
  /** play: only this much influence left */
  left?: number;
  /** play, Thursday: people already accused */
  accused?: CharId[];
}

export interface MockGame extends GameApi {
  /** World -> screen transform the harness backdrop should use. */
  camera: { scale: number; x: number; y: number };
  positions(): { id: CastId; x: number; y: number; present: boolean }[];
  /** Advance the pretend world by this many seconds at once. */
  step(seconds: number): void;
  /** Put a line over someone's head now (fully typed when `typed`). */
  say(who: CastId, text: string, kind?: SpeechKind, typed?: boolean): void;
  showReport(): void;
  setOffline(off: boolean): void;
  setInArtifact(on: boolean): void;
  /** Stop the speech generator (for still screenshots). */
  setChatter(on: boolean): void;
  /** Story mode: open any point of the week directly. */
  jumpStory(j: StoryJump): void;
  destroy(): void;
}

// ── seeded random ──
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LINES: Record<SpeechKind, string[]> = {
  say: [
    'Has anyone seen my stapler? It was right here.',
    'I am not saying it was a ghost. I am saying it was not not a ghost.',
    'Can we please have one normal day?',
    'That is the third time this week the printer has done that.',
    'I brought muffins. They are for me.',
    'Conference room in five. Bring snacks.',
    'Did you hear about accounting? Big news.',
    'I would like it on the record that I saw this coming.',
    'Okay, who moved my chair three inches to the left?',
    'This is fine. Everything is completely fine.'
  ],
  shout: ['FIRE! Everybody out!', 'WHO DID THIS?', 'MY DESK IS WET!', 'NOBODY PANIC!'],
  whisper: ['Do not tell anyone, but...', 'I think Toby is reading my emails.', 'Psst. Meet me by the fridge.'],
  think: ['Five more hours. I can do five more hours.', 'Why is everyone looking at me?', 'I could just leave. Nobody would notice.', 'I wonder if there is cake.']
};

const DOING = [
  'typing at the desk', 'getting a coffee', 'on the phone', 'chatting', 'staring at the ceiling', 'filing papers',
  'eating a snack', 'pretending to work', 'looking for the stapler', 'reading the noticeboard'
];
const THOUGHTS = [
  'If I keep my head down, nobody will ask me to do anything.',
  'Somebody has been at my yoghurt again. I will find out who.',
  'I should tell them how I feel. Maybe after lunch.',
  'That noise from the break room was not normal.',
  'I am the only one here who actually works.'
];
const MOODS: EmotionId[] = ['neutral', 'happy', 'amused', 'bored', 'tired', 'suspicious', 'nervous', 'smug', 'excited', 'sad', 'angry', 'confused'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const STATUS_FOR: Partial<Record<ChaosId, StatusKind>> = {
  smite: 'frizzy', shrink: 'tiny', giant: 'giant', espresso: 'caffeinated', truth: 'truth', paranoia: 'paranoid',
  crown: 'crowned', birthday: 'party', ufo: 'abducted', love: 'love', rage: 'rage', bodySwap: 'swapped',
  flood: 'wet', fire: 'sooty', ghost: 'spooked', bees: 'stung', sleep: 'asleep', moneyRain: 'rich', timeFreeze: 'frozen'
};

interface Mover {
  id: CastId;
  x: number; y: number; tx: number; ty: number;
  wait: number;
  room: RoomId;
  emotion: EmotionId;
  intensity: number;
  doing: string;
  statuses: { kind: StatusKind; until: number }[];
  present: boolean;
  thought: string;
  mood: number; energy: number; stress: number;
}

const ROOM_NAME: Record<string, string> = Object.fromEntries(ROOMS.map((r) => [r.id, r.name]));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function createMockGame(): GameApi {
  return createMock();
}

export function createMock(opts: { seed?: number; offline?: boolean; inArtifact?: boolean } = {}): MockGame {
  const rnd = mulberry32(opts.seed ?? 7);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  let idSeq = 1;
  const nid = (p: string) => `${p}${idSeq++}`;

  // ── portraits ──
  const avatarCache = new Map<string, string>();
  function avatar(who: CharId): string {
    const key = (CAST_IDS as readonly string[]).includes(who) ? who : 'creed';
    let url = avatarCache.get(key);
    if (url) return url;
    const c = document.createElement('canvas');
    c.width = 18; c.height = 28;
    const ctx = c.getContext('2d');
    if (ctx) paintPortrait(ctx, key as CastId, 1);
    url = c.toDataURL();
    avatarCache.set(key, url);
    return url;
  }

  // ── people ──
  const tilesOf = new Map<RoomId, ReturnType<typeof walkableTilesIn>>();
  const tiles = (r: RoomId) => {
    let t = tilesOf.get(r);
    if (!t) { t = walkableTilesIn(r); tilesOf.set(r, t); }
    return t;
  };
  const spot = (r: RoomId) => {
    const list = tiles(r);
    const t = list.length ? pick(list) : { x: 10, y: 15 };
    return { x: t.x * TILE + 8, y: t.y * TILE + 16 };
  };
  const movers: Mover[] = CAST_IDS.map((id) => {
    let x = 200, y = 250, room: RoomId = 'bullpen';
    try { const d = deskOf(id); x = d.tile.x * TILE + 8; y = d.tile.y * TILE + 16; room = d.room; } catch { /* no desk */ }
    return {
      id, x, y, tx: x, ty: y, wait: 1 + rnd() * 8, room,
      emotion: CAST[id].baseline, intensity: 0.4, doing: 'typing at the desk', statuses: [],
      present: id !== 'creed', thought: pick(THOUGHTS), mood: rnd() * 1.2 - 0.4, energy: 0.4 + rnd() * 0.6, stress: rnd() * 0.6
    };
  });
  const byId = new Map(movers.map((m) => [m.id, m]));
  const speaking = new Set<CharId>();

  // ── store ──
  const baseSettings: GameSettings = {
    brain: { ...DEFAULT_BRAIN_SETTINGS },
    volumes: { master: 0.8, music: 0.5, sfx: 0.8, voice: 0.7 },
    muted: false, dayMinutes: 10, autoCamera: true, captions: true, sandbox: false, haptics: true,
    quality: 'auto', tutorialDone: true, storyCoachDone: true
  };
  const feed: FeedItem[] = [];
  const store = create<UiState>()(() => ({
    phase: 'playing', paused: false, speed: 1, day: 3, weekday: 'Wednesday', clock: 10 * 60 + 12,
    dayProgress: (10 * 60 + 12 - 540) / 480,
    meters: { chaos: 34, morale: 62, productivity: 55, stock: 104.2, stockDelta: 1.6, stockHistory: [] },
    incidentsToday: 1, incidentFreeDays: 0,
    brain: opts.offline
      ? { provider: 'ollama', state: 'offline', model: 'artemis-custom', thinking: false, queued: 0, tokPerSec: null, error: "Can't reach the server at msi.tail780d1f.ts.net. Check that Ollama is running and the address is right." }
      : { provider: 'ollama', state: 'online', model: 'artemis-custom', thinking: false, queued: 0, tokPerSec: 7.1, error: null },
    people: [], selectedId: null, feed: [], caption: null, cooldowns: {}, activeChaos: [],
    objectives: [
      { id: 'o1', title: 'Fire in the kitchen', detail: 'Start a fire in the break room while three people are in it.', progress: 0.34, done: false, icon: 'fire' },
      { id: 'o2', title: 'Make peace', detail: 'Get Dwight and Jim to say something nice to each other.', progress: 0, done: false, icon: 'morale' },
      { id: 'o3', title: 'Steady hands', detail: 'Keep morale above 50 until 5pm.', progress: 1, done: true, icon: 'stock' }
    ],
    toasts: [], report: null, settings: baseSettings, holding: null, targeting: null,
    inArtifact: !!opts.inArtifact, mode: 'sandbox', story: null, storySaved: null,
    beat: null, ceremony: null, finishing: false
  }));

  function personUi(m: Mover): PersonUi {
    const c = CAST[m.id];
    return {
      id: m.id, name: c.name, role: c.role, color: hex(c.color), avatar: avatar(m.id), room: m.room,
      roomName: ROOM_NAME[m.room] ?? m.room, emotion: m.emotion, intensity: m.intensity,
      statuses: m.statuses.map((s) => s.kind), doing: m.present ? m.doing : 'gone home', speaking: speaking.has(m.id),
      present: m.present, busy: m.statuses.some((s) => s.kind === 'asleep' || s.kind === 'abducted' || s.kind === 'frozen')
    };
  }

  function pushFeed(item: Omit<FeedItem, 'id' | 'day' | 'clock'>): FeedItem {
    const s = store.getState();
    const f: FeedItem = { id: nid('f'), day: s.day, clock: Math.floor(s.clock), ...item };
    feed.push(f);
    if (feed.length > 200) feed.shift();
    return f;
  }

  function toast(text: string, tone: ToastUi['tone'] = 'info', icon?: string) {
    const t: ToastUi = { id: nid('t'), text, tone, icon };
    store.setState((s) => ({ toasts: [...s.toasts, t].slice(-3) }));
    window.setTimeout(() => api.dismissToast(t.id), 4200);
  }

  // ── speech ──
  let speeches: Speech[] = [];
  let chatter = true;
  function say(who: CastId, text: string, kind: SpeechKind = 'say', typed = false) {
    const cps = kind === 'shout' ? 22 : kind === 'whisper' ? 12 : 15;
    const durationMs = (text.length / cps) * 1000 + 2600;
    const now = performance.now();
    const sp: Speech = { id: nid('s'), who, kind, text, startedAt: typed ? now - text.length / cps * 1000 - 50 : now, durationMs: typed ? 600000 : durationMs, cps };
    speeches = speeches.filter((x) => x.who !== who).concat(sp);
    speaking.add(who);
    const item = pushFeed({ kind: kind === 'think' ? 'think' : 'say', who, text, emotion: byId.get(who)?.emotion });
    if (kind !== 'think') store.setState({ caption: item });
  }

  // ── chaos ──
  const cooldownReady = new Map<ChaosId, number>();
  function triggerChaos(id: ChaosId, target: ChaosTarget): string | null {
    const def = CHAOS[id];
    const s = store.getState();
    const now = performance.now();
    const ready = cooldownReady.get(id) ?? 0;
    if (!s.settings.sandbox && ready > now) return `Still cooling down. Ready in ${Math.ceil((ready - now) / 1000)} seconds.`;
    if (def.target === 'room' && !target.room) return 'Pick a room first.';
    if ((def.target === 'person' || def.target === 'pair') && !target.who) return 'Pick a person first.';
    if (def.target === 'pair' && !target.other) return 'Pick the second person first.';
    if (target.who && target.who === target.other) return 'Pick two different people.';
    const victim = target.who ? byId.get(target.who as CastId) : undefined;
    if (victim && !victim.present) return `${CAST[victim.id].name} is not in the building.`;
    const refusal = storyRefusal(id);
    if (refusal) { toast(refusal, 'bad', 'influence'); return refusal; }
    storySpend(id);
    if (id === 'secretLeak' && victim) revealed.add(victim.id);

    const total = s.settings.sandbox ? 0 : def.cooldown * 1000;
    cooldownReady.set(id, now + total);
    const room = target.room ?? def.fixedRoom ?? (victim ? victim.room : null);
    const label = target.room ? `${def.name} in ${ROOM_NAME[target.room]}` : victim ? `${def.name}: ${CAST[victim.id].name}` : def.name;
    const active: ActiveChaosUi = { key: nid('c'), id, label: cap(label), room, endsAt: def.duration ? now + def.duration * 1000 : 0 };
    if (victim) {
      const k = STATUS_FOR[id];
      if (k) victim.statuses.push({ kind: k, until: simTime + def.duration });
      victim.emotion = def.category === 'treat' ? 'excited' : 'scared';
    }
    pushFeed({ kind: 'overseer', text: `You used ${def.name}${target.room ? ' on ' + ROOM_NAME[target.room] : victim ? ' on ' + CAST[victim.id].name : ''}.`, icon: id });
    pushFeed({ kind: 'event', text: cap(def.blurb), icon: id, room: room ?? undefined });
    store.setState((st) => ({
      cooldowns: { ...st.cooldowns, [id]: { readyAt: now + total, total } },
      activeChaos: def.duration ? [...st.activeChaos, active] : st.activeChaos,
      meters: { ...st.meters, chaos: Math.max(0, Math.min(100, st.meters.chaos + def.chaos)) },
      incidentsToday: st.incidentsToday + (def.incident ? 1 : 0),
      incidentFreeDays: def.incident ? 0 : st.incidentFreeDays
    }));
    if (victim) say(victim.id, def.category === 'treat' ? 'Oh! For me?' : pick(LINES.shout), def.category === 'treat' ? 'say' : 'shout');
    toast(cap(label) + '.', def.category === 'treat' ? 'good' : 'bad', id);
    publish();
    return null;
  }

  // ── story mode ──
  interface StoryRun { chapter: number; results: DayResult[]; stage: Stage; won?: boolean; left?: number; accused: CharId[]; ending?: EndingId; since: number }
  let run: StoryRun | null = null;
  let saved: { chapter: number; results: DayResult[] } | null = null;
  const blankWeek = (): DayResult[] => MOCK_CHAPTERS.map(() => null);

  function storyUi() {
    if (!run) return null;
    return buildStory({ chapter: run.chapter, results: run.results, stage: run.stage, won: run.won, left: run.left, accused: run.accused, ending: run.ending });
  }
  function pushStory() { store.setState({ story: storyUi() }); }
  function savedUi() {
    if (!saved) return null;
    const ch = MOCK_CHAPTERS[saved.chapter - 1];
    return { chapter: saved.chapter, chapters: MOCK_CHAPTERS.length, title: ch.title, weekday: ch.weekday, standing: standingAt(saved.chapter, saved.results) };
  }
  function toBriefing(chapter: number, results: DayResult[]) {
    run = { chapter, results, stage: 'briefing', accused: [], since: simTime };
    const ch = MOCK_CHAPTERS[chapter - 1];
    store.setState({
      mode: 'story', phase: 'briefing', report: null, paused: false, day: chapter, weekday: ch.weekday, clock: 8 * 60 + 50, dayProgress: 0,
      incidentsToday: 0, activeChaos: [], cooldowns: {}, toasts: [], story: storyUi()
    });
    cooldownReady.clear();
  }
  /** Story mode: the reason an action cannot be paid for now, or null (sandbox: always null). */
  function storyRefusal(id: ActionId): string | null {
    const st = store.getState().story;
    if (!st || !run) return null;
    const locked = (st.locked as Record<string, string | undefined>)[id];
    if (locked) return locked;
    const cost = st.costs[id] ?? 0;
    if (cost > st.influence.left) return `Not enough influence: this costs ${cost}, you have ${st.influence.left}.`;
    return null;
  }
  function storySpend(id: ActionId) {
    const st = store.getState().story;
    if (!st || !run) return;
    run.left = Math.max(0, st.influence.left - (st.costs[id] ?? 0));
    pushStory();
  }
  /** For the four tools: pay, or say why not with a toast. */
  function storyPay(id: ActionId): boolean {
    const why = storyRefusal(id);
    if (why) { toast(why, 'bad', 'influence'); return false; }
    storySpend(id);
    return true;
  }

  // ── report ──
  let reportTimer = 0;
  function showReport() {
    const s = store.getState();
    const paras = [
      'Wednesday began quietly. Michael called two meetings before ten, and nobody went to the second one.',
      'At 11:40 a fire broke out in the break room. Dwight put it out with a fire extinguisher and a speech nobody asked for. Kevin saved the muffins.',
      'After lunch a raccoon got into the kitchen. Angela blamed Oscar. Oscar blamed the raccoon. The raccoon blamed nobody and took the bagels.',
      'By five, morale had recovered, mostly because Pam ordered pizza. The share price closed up 1.6.'
    ];
    const r: DayReport = {
      day: s.day, headline: 'Raccoon Steals Bagels, Fire Steals Show', paragraphs: [], writing: true,
      awards: [
        { title: 'Hero of the Day', who: 'dwight', name: 'Dwight', avatar: avatar('dwight'), why: 'Put out the fire. Will not stop talking about it.' },
        { title: 'Most Dramatic', who: 'michael', name: 'Michael', avatar: avatar('michael'), why: 'Cried twice, once on purpose.' },
        { title: 'Best Snack Saved', who: 'kevin', name: 'Kevin', avatar: avatar('kevin'), why: 'Rescued four muffins from the flames.' }
      ],
      quotes: [
        { who: 'jim', name: 'Jim', avatar: avatar('jim'), text: 'I am sure that raccoon has a reason.' },
        { who: 'angela', name: 'Angela', avatar: avatar('angela'), text: 'Nobody touches the bagels. That was the one rule.' }
      ],
      stats: { incidents: 3, stockStart: 102.6, stockEnd: 104.2, morale: 64, chaosPeak: 71, lines: 148 }
    };
    if (run) {
      const goal = s.story?.goal;
      run.won = goal ? goal.state !== 'lost' : true;
      run.stage = 'done';
      pushStory();
    }
    store.setState({ phase: 'report', report: r });
    let i = 0;
    window.clearInterval(reportTimer);
    reportTimer = window.setInterval(() => {
      const cur = store.getState().report;
      if (!cur) { window.clearInterval(reportTimer); return; }
      i++;
      store.setState({ report: { ...cur, paragraphs: paras.slice(0, i), writing: i < paras.length } });
      if (i >= paras.length) window.clearInterval(reportTimer);
    }, 1400);
  }

  // ── camera ──
  const insets = { left: 0, right: 0, top: 0, bottom: 0 };
  const camera = { scale: 1, x: 0, y: 0 };
  function fitCamera() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const fw = Math.max(100, vw - insets.left - insets.right - 16);
    const fh = Math.max(100, vh - insets.top - insets.bottom - 16);
    camera.scale = Math.min(fw / MAP_PX_W, fh / MAP_PX_H);
    camera.x = Math.round(insets.left + (vw - insets.left - insets.right - MAP_PX_W * camera.scale) / 2);
    camera.y = Math.round(insets.top + (vh - insets.top - insets.bottom - MAP_PX_H * camera.scale) / 2);
  }
  fitCamera();
  window.addEventListener('resize', fitCamera);

  // ── simulation ──
  let simTime = 0;
  let nextLine = 1.5;
  let last = performance.now();
  let lastPublish = 0;
  let raf = 0;
  const revealed = new Set<CastId>();

  function advance(dt: number) {
    const s = store.getState();
    if (s.phase !== 'playing' || s.paused) return;
    dt *= s.speed;
    simTime += dt;
    if (run && run.stage === 'start' && simTime - run.since > 6) { run.stage = 'play'; pushStory(); }
    for (const m of movers) {
      if (!m.present) continue;
      if (m.statuses.some((x) => x.kind === 'frozen' || x.kind === 'asleep')) continue;
      const dx = m.tx - m.x, dy = m.ty - m.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const v = Math.min(d, 34 * dt);
        m.x += (dx / d) * v; m.y += (dy / d) * v;
      } else {
        m.wait -= dt;
        if (m.wait <= 0) {
          const r = pick(['bullpen', 'bullpen', 'kitchen', 'meeting', 'accounts', 'annex', 'boss'] as RoomId[]);
          const p = spot(r);
          m.tx = p.x; m.ty = p.y; m.room = r; m.wait = 5 + rnd() * 12;
          m.doing = r === 'kitchen' ? pick(['getting a coffee', 'eating a snack', 'raiding the fridge']) : pick(DOING);
          if (rnd() < 0.35) { m.emotion = pick(MOODS); m.intensity = 0.3 + rnd() * 0.6; }
        }
      }
      m.statuses = m.statuses.filter((x) => x.until > simTime);
    }
    // clock: one working day lasts settings.dayMinutes real minutes
    const perSec = 480 / (s.settings.dayMinutes * 60);
    const clock = Math.min(17 * 60, s.clock + perSec * dt);
    // meters drift
    const m = s.meters;
    const stock = Math.max(60, m.stock + (rnd() - 0.48) * 0.4 * dt);
    const hist = m.stockHistory.length >= 60 ? m.stockHistory.slice(1) : m.stockHistory.slice();
    if (Math.floor(simTime) !== Math.floor(simTime - dt)) hist.push(stock);
    store.setState({
      clock, dayProgress: Math.max(0, Math.min(1, (clock - 540) / 480)),
      meters: {
        ...m,
        chaos: Math.max(0, m.chaos - 0.5 * dt),
        morale: Math.max(0, Math.min(100, m.morale + (rnd() - 0.5) * 0.8 * dt)),
        stock, stockDelta: stock - 102.6, stockHistory: hist
      }
    });
    // speech
    const now = performance.now();
    speeches = speeches.filter((sp) => {
      const alive = now < sp.startedAt + sp.durationMs;
      if (!alive) {
        speaking.delete(sp.who);
        const cap = store.getState().caption;
        if (cap && cap.who === sp.who && cap.text === sp.text) store.setState({ caption: null });
      }
      return alive;
    });
    if (chatter) {
      nextLine -= dt;
      if (nextLine <= 0) {
        nextLine = 2 + rnd() * 3;
        const free = movers.filter((x) => x.present && !speaking.has(x.id));
        if (free.length && speeches.length < 4) {
          const who = pick(free);
          const r = rnd();
          const kind: SpeechKind = r < 0.6 ? 'say' : r < 0.75 ? 'think' : r < 0.88 ? 'whisper' : 'shout';
          say(who.id, pick(LINES[kind]), kind);
          if (rnd() < 0.15) {
            const other = pick(movers.filter((x) => x.id !== who.id));
            pushFeed({ kind: 'shift', who: who.id, other: other.id, text: `${CAST[who.id].name} likes ${CAST[other.id].name} a little less.` });
          }
        }
      }
    }
    // events end
    if (s.activeChaos.some((a) => a.endsAt && a.endsAt < now)) {
      const ended = s.activeChaos.filter((a) => a.endsAt && a.endsAt < now);
      ended.forEach((a) => pushFeed({ kind: 'event', text: `${a.label} is over.`, icon: a.id }));
      store.setState({ activeChaos: s.activeChaos.filter((a) => !a.endsAt || a.endsAt >= now) });
    }
  }

  // Wednesday's visitor, waiting in reception (story mode only).
  const FIGGIS = 'visitor:figgis';
  function visitors(): PersonUi[] {
    if (!run || run.chapter !== 3 || run.stage === 'briefing' || run.stage === 'ending') return [];
    return [{
      id: FIGGIS, name: 'Mr Figgis', role: 'Owner, Figgis Hardware', color: '#8a6a3a', avatar: avatar('creed'), room: 'bullpen',
      roomName: 'Reception', emotion: 'suspicious', intensity: 0.5, statuses: [], doing: 'waiting in reception', speaking: false, present: true, busy: false
    }];
  }
  function figgisDetail(): PersonDetail {
    return {
      ...visitors()[0], fullName: 'Mr Figgis', age: 61,
      summary: "Owns Figgis Hardware, the branch's biggest customer. Here to decide whether to sign for another year.",
      wants: 'a straight answer and a fair price', fears: 'jokes, loud noise, being grabbed', quirk: 'loves dogs',
      secret: null, thought: 'Ten minutes. If nobody comes in ten minutes, I am leaving.', conviction: null, plan: null,
      mood: -0.1, energy: 0.6, stress: 0.4, bonds: [], memories: [{ day: 3, clock: 630, text: 'Arrived at Munder Difflin. Nobody said hello.' }]
    };
  }

  function publish() {
    store.setState({ people: [...movers.map(personUi), ...visitors()], feed: feed.slice() });
  }

  function frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    advance(dt);
    if (now - lastPublish > 250) { lastPublish = now; publish(); }
    raf = requestAnimationFrame(frame);
  }

  // A morning's worth of history so the log is not empty.
  pushFeed({ kind: 'system', text: 'Day 3 begins. Wednesday, 09:00.' });
  pushFeed({ kind: 'say', who: 'michael', text: 'Good morning, Scranton! Who is ready to make some paper?' });
  pushFeed({ kind: 'think', who: 'stanley', text: 'Seven hours and forty-eight minutes.' });
  pushFeed({ kind: 'overseer', text: 'You whispered to Dwight: "Jim is plotting against you."', icon: 'whisper' });
  pushFeed({ kind: 'say', who: 'dwight', text: 'Jim. I know what you are planning. I always know.' });
  pushFeed({ kind: 'say', who: 'jim', text: 'I am planning to eat this sandwich.' });
  pushFeed({ kind: 'shift', who: 'dwight', other: 'jim', text: 'Dwight trusts Jim less.' });
  pushFeed({ kind: 'event', text: 'Fire breaks out in the break room.', icon: 'fire', room: 'kitchen' });
  pushFeed({ kind: 'say', who: 'kevin', text: 'Not the muffins!', emotion: 'scared' });
  publish();
  raf = requestAnimationFrame(frame);

  const api: MockGame = {
    store,
    camera,
    begin() { store.setState({ phase: 'playing', paused: false }); },
    startStory(fresh) {
      const from = !fresh && saved ? saved : { chapter: 1, results: blankWeek() };
      saved = null;
      toBriefing(from.chapter, from.results.slice());
      store.setState({ storySaved: null });
    },
    startSandbox() {
      run = null;
      store.setState({ mode: 'sandbox', story: null, phase: 'playing', paused: false });
    },
    beginChapter() {
      if (!run) return;
      run.stage = 'start'; run.left = undefined; run.since = simTime;
      store.setState({ phase: 'playing', paused: false, clock: 540, dayProgress: 0, story: storyUi() });
      pushFeed({ kind: 'system', text: `Day ${run.chapter} begins. ${MOCK_CHAPTERS[run.chapter - 1].weekday}, 09:00.` });
      publish();
    },
    retryDay() {
      if (!run) return;
      const results = run.results.slice();
      results[run.chapter - 1] = null;
      toBriefing(run.chapter, results);
    },
    finishDay() {
      // The mock has no day to run quickly: its report comes from the harness URL instead.
    },
    accuse(who) {
      const st = store.getState().story;
      if (!run || !st?.accuse || st.goal.state !== 'open' || run.accused.includes(who)) return;
      const name = CAST[who as CastId]?.name ?? who;
      run.accused = [...run.accused, who];
      pushStory();
      const now = store.getState().story!;
      if (who === MOCK_LEAK) {
        pushFeed({ kind: 'event', text: `${name} admits sending the emails to Corporate.`, icon: 'secretLeak' });
        toast(`Goal done: ${now.goal.title}`, 'good', 'check');
      } else {
        pushFeed({ kind: 'event', text: `${name} had nothing to do with it, and is not happy about being blamed.`, icon: 'accuse' });
        if (now.goal.state === 'lost') toast(`Goal failed: ${now.goal.title}`, 'bad', 'x');
        else toast(`${name} had nothing to do with it. ${now.accuse?.triesLeft ?? 0} ${now.accuse?.triesLeft === 1 ? 'try' : 'tries'} left.`, 'bad', 'accuse');
      }
      publish();
    },
    toTitle() {
      if (run && run.stage !== 'ending') saved = { chapter: run.chapter, results: run.results.slice() };
      if (run && run.stage === 'ending') saved = null;
      run = null;
      store.setState({ phase: 'title', report: null, mode: 'sandbox', story: null, storySaved: savedUi() });
    },
    jumpStory(j) {
      const chapter = Math.max(1, Math.min(MOCK_CHAPTERS.length, j.chapter ?? 1));
      const week = (): DayResult[] => DEFAULT_WEEK.map((r, i) => (i + 1 < chapter ? r : null));
      window.clearInterval(reportTimer);
      if (j.stage === 'title' || j.stage === 'title-new') {
        run = null;
        saved = j.stage === 'title' ? { chapter: j.chapter ?? 3, results: DEFAULT_WEEK.map((r, i) => (i + 1 < (j.chapter ?? 3) ? r : null)) } : null;
        store.setState({ phase: 'title', mode: 'sandbox', story: null, report: null, storySaved: savedUi() });
        return;
      }
      if (j.stage === 'ending') {
        const id = j.ending ?? 'saved';
        run = { chapter: MOCK_CHAPTERS.length, results: ENDING_WEEK[id].slice(), stage: 'ending', accused: [], ending: id, since: simTime };
        store.setState({ mode: 'story', phase: 'ending', report: null, day: 5, weekday: 'Friday', clock: 17 * 60, dayProgress: 1, story: storyUi() });
        return;
      }
      toBriefing(chapter, week());
      if (j.stage === 'briefing') return;
      run!.stage = 'play';
      run!.left = j.left;
      run!.accused = j.accused ?? [];
      store.setState({ phase: 'playing', clock: 11 * 60 + 25, dayProgress: (11 * 60 + 25 - 540) / 480, story: storyUi() });
      if (j.stage === 'report') {
        run!.won = j.won ?? true;
        showReport();
        run!.won = j.won ?? true;
        pushStory();
      }
    },
    setPaused(paused) { store.setState({ paused }); },
    setSpeed(speed) { store.setState({ speed }); },
    nextDay() {
      if (run) {
        run.results[run.chapter - 1] = run.won === false ? 'lost' : 'won';
        if (run.chapter < MOCK_CHAPTERS.length) { toBriefing(run.chapter + 1, run.results.slice()); return; }
        run.stage = 'ending'; run.ending = undefined;
        store.setState({ phase: 'ending', report: null, clock: 17 * 60, story: storyUi() });
        return;
      }
      const s = store.getState();
      const day = s.day + 1;
      store.setState({ phase: 'playing', report: null, day, weekday: WEEKDAYS[(day - 1) % 5], clock: 540, dayProgress: 0, incidentsToday: 0, incidentFreeDays: s.incidentsToday ? 0 : s.incidentFreeDays + 1 });
      pushFeed({ kind: 'system', text: `Day ${day} begins.` });
      publish();
    },
    triggerChaos,
    customEvent(text) { if (!storyPay('anything')) return; pushFeed({ kind: 'overseer', text: `You made this happen: "${text}"`, icon: 'anything' }); toast('Something is about to happen.', 'info', 'anything'); publish(); },
    whisper(who, text) {
      if (!storyPay('whisper')) return;
      pushFeed({ kind: 'overseer', text: `You whispered to ${CAST[who as CastId]?.name ?? who}: "${text}"`, icon: 'whisper' });
      const m = byId.get(who as CastId);
      if (m) { m.thought = text; window.setTimeout(() => say(m.id, 'Wait. I just had the best idea.', 'think'), 900); }
      publish();
    },
    announce(text) { if (!storyPay('announce')) return; pushFeed({ kind: 'overseer', text: `Over the loudspeaker: "${text}"`, icon: 'announce' }); toast('Announcement made.', 'info', 'announce'); publish(); },
    cue(who, instruction) { if (!storyPay('cue')) return; pushFeed({ kind: 'overseer', text: `You told ${CAST[who as CastId]?.name ?? who} to ${instruction}.`, icon: 'tell' }); publish(); },
    poke(who) {
      const m = byId.get(who as CastId);
      if (m) { m.emotion = 'surprised'; say(m.id, 'Hey! Who did that?', 'shout'); }
      pushFeed({ kind: 'overseer', text: `You poked ${CAST[who as CastId]?.name ?? who}.`, icon: 'poke' });
      publish();
    },
    beginTargeting(t: TargetingUi | null) { store.setState({ targeting: t }); },
    select(who) { store.setState({ selectedId: who }); },
    focusPerson() { /* camera follow: nothing to do in the mock */ },
    focusRoom(_room: TargetRoomId) { /* no-op */ },
    resetCamera() { /* no-op */ },
    setInsets(i) { Object.assign(insets, i); fitCamera(); },
    person(who): PersonDetail | null {
      if (who === FIGGIS && visitors().length) return figgisDetail();
      const m = byId.get(who as CastId);
      if (!m) return null;
      const c = CAST[m.id];
      const bonds = BOND_SEEDS.filter((b) => b[0] === m.id)
        .map((b) => ({ id: b[1], name: CAST[b[1]].name, color: hex(CAST[b[1]].color), avatar: avatar(b[1]), score: b[2] / 100, label: b[2] > 50 ? 'adores' : b[2] > 15 ? 'likes' : b[2] < -50 ? 'hates' : b[2] < -15 ? 'dislikes' : 'neutral', note: b[3] }))
        .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
      return {
        ...personUi(m), fullName: c.fullName, age: 30 + (c.name.length * 7) % 25, summary: c.persona.summary,
        wants: c.persona.wants, fears: c.persona.fears, quirk: c.persona.quirk,
        secret: revealed.has(m.id) ? c.persona.secret : null, thought: m.thought, conviction: null,
        plan: { kind: 'coffee', target: 'kitchen', about: 'a third cup' },
        mood: m.mood, energy: m.energy, stress: m.stress, bonds,
        memories: [
          { day: 3, clock: 610, text: 'There was a fire in the break room.' },
          { day: 3, clock: 560, text: 'Michael called a meeting about meetings.' },
          { day: 2, clock: 900, text: 'Someone ate the last doughnut.' }
        ]
      };
    },
    headOnScreen(who): ScreenPoint {
      const m = byId.get(who as CastId);
      if (!m || !m.present) return { x: 0, y: 0, scale: 1, visible: false };
      const x = camera.x + m.x * camera.scale;
      const y = camera.y + (m.y - 30) * camera.scale;
      const visible = x > insets.left && x < window.innerWidth - insets.right && y > 0 && y < window.innerHeight - insets.bottom;
      return { x, y, scale: Math.max(0.75, Math.min(1, camera.scale / 2)), visible };
    },
    activeSpeech() { return speeches; },
    avatar(who) { return avatar(who); },
    updateSettings(patch) { store.setState((s) => ({ settings: { ...s.settings, ...patch } })); },
    updateBrain(patch: Partial<BrainSettings>) {
      store.setState((s) => {
        const brain = { ...s.settings.brain, ...patch };
        return {
          settings: { ...s.settings, brain },
          brain: { ...s.brain, provider: brain.provider, model: brain.model, state: brain.provider === 'instinct' ? 'instinct' : s.brain.state }
        };
      });
    },
    testBrain(): Promise<BrainStatus> {
      const s = store.getState();
      store.setState({ brain: { ...s.brain, state: s.brain.provider === 'instinct' ? 'instinct' : 'connecting' } });
      return new Promise((resolve) => window.setTimeout(() => {
        const cur = store.getState();
        const offline = offlineFlag && cur.settings.brain.provider !== 'instinct';
        const st: BrainStatus = offline
          ? { provider: cur.settings.brain.provider, ok: false, model: cur.settings.brain.model, models: [], error: "Can't reach the server at msi.tail780d1f.ts.net. Check that Ollama is running and the address is right." }
          : { provider: cur.settings.brain.provider, ok: true, model: cur.settings.brain.model, models: ['artemis-custom', 'llama3.1:8b', 'qwen2.5:7b-instruct', 'mistral-nemo'], tokPerSec: 7.2 };
        store.setState({
          brain: {
            ...cur.brain,
            state: cur.settings.brain.provider === 'instinct' ? 'instinct' : st.ok ? 'online' : 'offline',
            error: st.ok ? null : st.error ?? null, tokPerSec: st.tokPerSec ?? null
          }
        });
        resolve(st);
      }, 700));
    },
    resetWorld() { store.setState({ day: 1, weekday: 'Monday', clock: 540, dayProgress: 0, phase: 'title' }); feed.length = 0; pushFeed({ kind: 'system', text: 'The office has been reset to day 1.' }); publish(); },
    goFullscreen() { /* no-op in the harness */ },
    uiSound(_id: SfxId) { /* silent mock */ },
    dismissToast(id) { store.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })); },

    positions() { return movers.map((m) => ({ id: m.id, x: m.x, y: m.y, present: m.present })); },
    step(seconds) { const n = Math.ceil(seconds / 0.1); for (let i = 0; i < n; i++) advance(0.1); publish(); },
    say,
    showReport,
    setOffline(off) {
      offlineFlag = off;
      const s = store.getState();
      store.setState({ brain: off
        ? { ...s.brain, state: 'offline', tokPerSec: null, error: "Can't reach the server at msi.tail780d1f.ts.net. Check that Ollama is running and the address is right." }
        : { ...s.brain, state: 'online', error: null, tokPerSec: 7.1 } });
    },
    setInArtifact(on) { store.setState({ inArtifact: on }); },
    setChatter(on) { chatter = on; },
    destroy() { cancelAnimationFrame(raf); window.removeEventListener('resize', fitCamera); window.clearInterval(reportTimer); }
  };
  let offlineFlag = !!opts.offline;
  return api;
}
