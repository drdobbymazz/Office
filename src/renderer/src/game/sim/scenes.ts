// Scenes: how the director makes people talk. Asks are queued for the
// director to pull; an opened scene takes its people over (gathering them
// within talking distance, turning them to each other) until it is closed or
// breaks up.

import type { CharId, Speech, Tile } from '@/game/core/types';
import { roomAt, TILE } from '@/game/core/world';
import type { SceneLine } from '@/game/brain/api';
import type { OpenSceneOpts, SceneAsk, SceneHandle } from '@/game/core/simApi';
import { idleAct, makeJob, restartJob, cancelJob, type Job } from './jobs';
import type { Person } from './people';
import type { SimCore } from './core';

interface SceneRec {
  id: string;
  people: CharId[];
  members: Set<CharId>;
  ready: boolean;
  alive: boolean;
  closed: boolean;
  openedAt: number;
  lastLineAt: number;
  anchor: CharId;
  speaker: CharId | null;
  speakerUntil: number;
  handle: SceneHandle;
}

interface QueuedAsk {
  ask: SceneAsk;
  at: number;
}

const GATHER_TIMEOUT = 14;
const IDLE_CLOSE = 45;
const MAX_SCENE = 240;
const MAX_ASKS = 24;

export class SceneManager {
  private asks: QueuedAsk[] = [];
  private scenes = new Map<string, SceneRec>();

  constructor(private core: SimCore) {}

  request(ask: SceneAsk): void {
    if (!ask || typeof ask.why !== 'string') return;
    const people = ask.people ? [...new Set(ask.people)].slice(0, 4) : undefined;
    const clean: SceneAsk = { ...ask, people, priority: Number.isFinite(ask.priority) ? ask.priority : 1 };
    // The same people for the same reason replaces the older ask.
    const sig = (a: SceneAsk): string => `${a.trigger}|${(a.people ?? []).slice().sort().join(',')}|${a.room ?? ''}`;
    const s = sig(clean);
    this.asks = this.asks.filter((q) => sig(q.ask) !== s);
    this.asks.push({ ask: clean, at: this.core.time });
    if (this.asks.length > MAX_ASKS) {
      this.asks.sort((a, b) => b.ask.priority - a.ask.priority || b.at - a.at);
      this.asks.length = MAX_ASKS;
    }
  }

  /** Hand the queued asks to the director, highest priority first. */
  take(): SceneAsk[] {
    this.prune();
    const out = this.asks.sort((a, b) => b.ask.priority - a.ask.priority || a.at - b.at).map((q) => q.ask);
    this.asks = [];
    return out;
  }

  pendingCount(): number {
    return this.asks.length;
  }

  private prune(): void {
    const now = this.core.time;
    this.asks = this.asks.filter((q) => now - q.at <= (q.ask.staleAfter ?? 30));
  }

  activeCount(): number {
    let n = 0;
    for (const s of this.scenes.values()) if (s.alive) n++;
    return n;
  }

  sceneOf(id: string): SceneRec | undefined {
    return this.scenes.get(id);
  }

  open(opts: OpenSceneOpts): SceneHandle | null {
    const core = this.core;
    if (!opts || !Array.isArray(opts.people)) return null;
    const ids = [...new Set(opts.people)];
    if (ids.length < 1 || ids.length > 4) return null;
    const existing = this.scenes.get(opts.id);
    if (existing && existing.alive) return null;
    const people: Person[] = [];
    for (const id of ids) {
      const p = core.byId(id);
      if (!p || !p.available) return null;
      people.push(p);
    }
    // The anchor stays put; prefer someone sitting down, then anyone standing still.
    const seatedAt = (p: Person): boolean => !!p.job && p.job.phase === 'act' && !!p.job.act?.seated;
    const anchor = people.find(seatedAt) ?? people.find((p) => !p.walk) ?? people[0];

    const rec: SceneRec = {
      id: opts.id, people: ids, members: new Set(ids), ready: false, alive: true, closed: false,
      openedAt: core.time, lastLineAt: core.time, anchor: anchor.id, speaker: null, speakerUntil: 0,
      handle: null as unknown as SceneHandle
    };
    const self = this;
    rec.handle = {
      id: opts.id,
      people: ids,
      get ready() {
        return rec.ready;
      },
      get alive() {
        return rec.alive;
      },
      line(l: SceneLine): Speech {
        return self.line(rec, l);
      },
      close(): void {
        self.close(rec);
      }
    };
    this.scenes.set(opts.id, rec);

    for (const p of people) {
      // A plain settle is only finding a free tile; one with something to do (staying where the
      // player put them) is picked up again after the talk.
      p.stash = p.job && (p.job.kind !== 'settle' || p.job.act) ? p.job : null;
      p.job = null;
      p.walk = null;
      p.waiting = false;
      p.sceneId = opts.id;
      const other = people.find((o) => o !== p) ?? null;
      const faceWho = other ? (p === anchor ? other.id : anchor.id) : undefined;
      if (p === anchor || !opts.gather || (this.closeEnough(p, anchor) && p.res && core.isAt(p, p.res))) {
        const stayAct = seatedAt(p) && p.stash?.act
          ? { ...p.stash.act, anim: 'idle' as const, seconds: Infinity, faceWho, doing: `talking${other ? ` with ${other.name}` : ''}` }
          : { ...idleAct(`talking${other ? ` with ${other.name}` : ''}`, Infinity), faceWho };
        const j = makeJob('gather', { kind: 'here' }, { act: stayAct, doing: p.doing });
        if (p.res && core.isAt(p, p.res)) j.want = { kind: 'tile', tile: p.res };
        p.job = j;
      } else {
        p.job = makeJob('gather', { kind: 'near', who: anchor.id }, {
          doing: `going over to ${anchor.name}`,
          act: { ...idleAct(`talking with ${anchor.name}`, Infinity), faceWho: anchor.id }
        });
      }
    }
    if (!opts.gather) rec.ready = true;
    core.focusOn(people, 0.8, 2500);
    return rec.handle;
  }

  private closeEnough(p: Person, anchor: Person): boolean {
    const a = anchor.res ?? anchor.tile;
    const b = p.res ?? p.tile;
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
  }

  private line(rec: SceneRec, l: SceneLine): Speech {
    const core = this.core;
    rec.lastLineAt = core.time;
    const who = l.who;
    const p = core.byId(who);
    const act = l.act ?? 'none';
    const kind = act === 'whisper' ? 'whisper' : act === 'shout' || act === 'storm_off' ? 'shout' : 'say';
    const sp = core.say(who, l.say ?? '', { kind, emotion: l.feel, act, to: l.to ?? null });
    if (!p) return sp;
    rec.speaker = who;
    rec.speakerUntil = core.time + sp.durationMs / 1000;
    // Everyone else looks at the speaker.
    for (const id of rec.members) {
      if (id === who) continue;
      const o = core.byId(id);
      if (o) core.faceToward(o, p, sp.durationMs / 1000 + 0.5);
    }
    // The speaker looks at whoever they are talking to.
    const to = l.to && l.to !== 'all' ? core.byId(l.to) : null;
    if (to && to !== p) core.faceToward(p, to, sp.durationMs / 1000);
    else if (!to) {
      const other = [...rec.members].map((m) => core.byId(m)).find((o) => o && o !== p);
      if (other) core.faceToward(p, other, sp.durationMs / 1000);
    }
    if (rec.members.has(who)) this.movementAct(rec, p, act, to ?? null);
    return sp;
  }

  /** step_closer / back_away / walk_off / storm_off move the speaker. */
  private movementAct(rec: SceneRec, p: Person, act: string, to: Person | null): void {
    const core = this.core;
    if (p.air || p.seized) return;
    if (act === 'walk_off' || act === 'storm_off') {
      rec.members.delete(p.id);
      p.sceneId = null;
      p.stash = null;
      if (p.plan) p.plan = null;
      const storm = act === 'storm_off';
      if (storm) core.feel(p.id, 'angry', 0.8, 8);
      core.walkOff(p, storm);
      if (rec.members.size === 0) this.finish(rec, false);
      return;
    }
    if (act !== 'step_closer' && act !== 'back_away') return;
    const target = to ?? [...rec.members].map((m) => core.byId(m)).find((o) => o && o !== p) ?? null;
    if (!target) return;
    const from = p.res ?? p.tile;
    const tt = target.res ?? target.tile;
    const d0 = Math.hypot(tt.x - from.x, tt.y - from.y);
    let best: Tile | null = null;
    let bestD = act === 'step_closer' ? d0 : d0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = from.x + dx;
      const y = from.y + dy;
      if (!core.nav.free(x, y, p.num) || (x === tt.x && y === tt.y)) continue;
      const d = Math.hypot(tt.x - x, tt.y - y);
      if (act === 'step_closer' ? d < bestD && d >= 1 : d > bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    if (!best) {
      core.react(p.id, act === 'back_away' ? 'cower' : 'point', 0.8);
      return;
    }
    const keep = p.job?.act;
    p.job = makeJob('gather', { kind: 'tile', tile: best }, {
      doing: p.doing,
      style: 'walk',
      act: keep ? { ...keep, seated: false, seconds: Infinity, faceWho: target.id } : { ...idleAct(p.doing, Infinity), faceWho: target.id }
    });
    p.walk = null;
  }

  update(): void {
    const core = this.core;
    this.prune();
    for (const rec of this.scenes.values()) {
      if (!rec.alive) continue;
      for (const id of rec.members) {
        const p = core.byId(id);
        if (!p || !p.onFloor || p.air || p.seized || p.frozen || p.asleep || p.goingHome || p.sceneId !== rec.id) {
          this.finish(rec, true);
          break;
        }
      }
      if (!rec.alive) continue;
      if (!rec.ready) {
        let all = true;
        for (const id of rec.members) {
          const p = core.byId(id);
          if (p && p.job && p.job.kind === 'gather' && p.job.phase !== 'act') all = false;
        }
        if (all || core.time - rec.openedAt > GATHER_TIMEOUT) rec.ready = true;
      }
      if ((rec.ready && core.time - rec.lastLineAt > IDLE_CLOSE) || core.time - rec.openedAt > MAX_SCENE) this.finish(rec, false);
    }
    // Forget finished scenes after a while.
    if (this.scenes.size > 32) {
      for (const [k, rec] of this.scenes) if (!rec.alive) this.scenes.delete(k);
    }
  }

  /** Someone was picked up / seized / sent home: their scene ends. */
  breakFor(p: Person, _why: string): void {
    if (!p.sceneId) return;
    const rec = this.scenes.get(p.sceneId);
    p.sceneId = null;
    if (rec && rec.alive) {
      rec.members.delete(p.id);
      p.stash = null;
      this.finish(rec, true);
    }
  }

  private close(rec: SceneRec): void {
    if (rec.closed) return;
    rec.closed = true;
    if (rec.alive) this.finish(rec, false);
  }

  private finish(rec: SceneRec, broke: boolean): void {
    if (!rec.alive) return;
    rec.alive = false;
    void broke;
    for (const id of rec.members) {
      const p = this.core.byId(id);
      if (!p || p.sceneId !== rec.id) continue;
      p.sceneId = null;
      this.release(p);
    }
    rec.members.clear();
  }

  /** Let someone go back to what they were doing before the scene. */
  private release(p: Person): void {
    const stash: Job | null = p.stash;
    p.stash = null;
    p.faceTo = null;
    if (p.air || p.seized) return;
    if (p.job && p.job.kind === 'gather') cancelJob(p, false);
    if (stash && stash.kind === 'planWait') {
      // The plan has played out.
      p.plan = null;
      stash.finished = true;
      return;
    }
    if (stash && !stash.finished) restartJob(p, stash);
  }

  closeAll(): void {
    for (const rec of this.scenes.values()) if (rec.alive) this.finish(rec, true);
    this.scenes.clear();
    this.asks = [];
  }

  /** World rectangle around a scene's people (for the camera). */
  rectFor(ids: readonly CharId[]): { x: number; y: number; w: number; h: number } {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const id of ids) {
      const p = this.core.byId(id);
      if (!p) continue;
      x0 = Math.min(x0, p.x - TILE);
      x1 = Math.max(x1, p.x + TILE);
      y0 = Math.min(y0, p.y - TILE * 2.5);
      y1 = Math.max(y1, p.y + TILE * 0.5);
    }
    if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  roomOf(rec: SceneRec): string {
    const p = this.core.byId(rec.anchor);
    return p ? roomAt(p.tile) : 'bullpen';
  }
}
