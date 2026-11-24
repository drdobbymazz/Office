// Physical execution of player whispers and direct orders ("kill jim", "drag michael to
// the conference room", "smash the fax machine", "quit"). Turns structured DirectiveResults
// into real sim movement, physics, grabs, scuffles, chaos, statuses, and aftermath scenes.

import type { CustomPower, DelegateTone, DirectiveResult, DirectiveVerb } from '@/game/brain/api';
import { CUSTOM_POWERS } from '@/game/brain/api';
import { normalizeDelegatedCommand, normalizePermissionCommand, toThirdPersonAction } from '@/game/brain/instinct';
import type { SfxId } from '@/game/audio/api';
import type { AnimId, ChaosId, CharId, EmotionId, HeldProp, RoomId, TargetRoomId, Tile } from '@/game/core/types';
import { isCastId } from '@/game/core/types';
import type { DirectorSimApi, SceneAsk, SimPerson } from '@/game/core/simApi';
import { feetOf, room as roomDef, roomCentrePx, walkableTilesIn } from '@/game/core/world';
import type { BurstKind } from '@/game/view/api';

export interface DirectivesContext {
  sim: DirectorSimApi;
  scene: (ask: SceneAsk, fromPlayer: boolean) => void;
  onChainNext?: (actor: CharId, nextText: string, kind: 'whisper' | 'cue', allowDelegate: boolean) => void;
}

interface ActiveDirective {
  id: string;
  actor: CharId;
  target: CharId | null;
  targetPeople?: CharId[];
  allowRevive?: boolean;
  delegateDepth?: number;
  delegateExecutor?: 'asker' | 'target';
  delegateTone?: DelegateTone;
  room: TargetRoomId | null;
  verb: DirectiveVerb;
  rawText: string;
  summary: string;
  delegatedText?: string;
  kind: 'whisper' | 'cue';
  item: string;
  power: CustomPower;
  phase: 'approach' | 'scuffle' | 'haul' | 'chase' | 'follow' | 'perform' | 'romance_act';
  timer: number;
  repathAt: number;
  burstAt: number;
  alertedTarget: boolean;
  scuffleId?: string;
  destTile?: Tile;
  destRoom?: TargetRoomId;
  lockAfter?: boolean;
}

interface ScheduledTimer {
  at: number;
  fn: () => void;
}

function propFromItem(item: string): HeldProp {
  const s = item.toLowerCase();
  if (/coffee|mug/.test(s)) return 'coffee';
  if (/phone/.test(s)) return 'phone';
  if (/cash|money|wallet/.test(s)) return 'cash';
  if (/donut/.test(s)) return 'donut';
  if (/cake/.test(s)) return 'cake';
  if (/pizza/.test(s)) return 'pizza';
  if (/trophy/.test(s)) return 'trophy';
  if (/wrench/.test(s)) return 'wrench';
  if (/mop|broom/.test(s)) return 'mop';
  if (/extinguisher/.test(s)) return 'extinguisher';
  if (/briefcase|suitcase|\bcase\b/.test(s)) return 'case';
  if (/cassette|video ?tape|vhs|\btape\b/.test(s)) return 'tape';
  if (/box/.test(s)) return 'box';
  return 'papers';
}

function powerToChaos(power: CustomPower, rawText: string): ChaosId {
  if (power !== 'none' && (CUSTOM_POWERS as readonly string[]).includes(power)) {
    return power as ChaosId;
  }
  const low = rawText.toLowerCase();
  if (/alarm|drill/.test(low)) return 'fireDrill';
  if (/lock|barricade|trap/.test(low)) return 'lockIn';
  if (/flood|sprinkler|water/.test(low)) return 'flood';
  if (/wifi|internet/.test(low)) return 'wifiDown';
  if (/blackout|power|dark/.test(low)) return 'blackout';
  if (/bee|wasp/.test(low)) return 'bees';
  if (/pizza/.test(low)) return 'pizza';
  if (/disco|dance|party/.test(low)) return 'disco';
  if (/sleep|nap/.test(low)) return 'sleep';
  if (/ghost/.test(low)) return 'ghost';
  if (/ufo|alien/.test(low)) return 'ufo';
  return 'fire';
}

function pickDropTile(roomId: TargetRoomId): Tile {
  const tiles = walkableTilesIn(roomId);
  if (!tiles.length) return { x: 12, y: 15 };
  const center = roomCentrePx(roomId);
  let best = tiles[0];
  let bestDist = Infinity;
  for (const t of tiles) {
    const f = feetOf(t);
    const d = Math.hypot(f.x - center.x, f.y - center.y);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function safeRoom(roomId: string | null | undefined): TargetRoomId {
  if (roomId === 'boss' || roomId === 'meeting' || roomId === 'annex' || roomId === 'accounts' || roomId === 'bullpen' || roomId === 'kitchen') {
    return roomId;
  }
  return 'bullpen';
}

function formatAction(summary: string, rawText: string, actorName: string): string {
  const first = actorName.split(/\s+/)[0] || actorName;
  let base = (summary || rawText).trim().replace(/^["“]+|["”]+$/g, '').replace(/\s+/g, ' ');
  const escFull = actorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escFirst = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  base = base.replace(new RegExp(`^(?:${escFull}|${escFirst})\\s+`, 'i'), '').trim();
  if (!base) base = rawText.trim().replace(/\s+/g, ' ');
  return toThirdPersonAction(base).slice(0, 120);
}

function performStyle(text: string): { anim: AnimId; burst: BurstKind; sfx: SfxId; doing: string } {
  const s = text.toLowerCase();
  if (/\b(dance|twerk|boogie|moonwalk|breakdance|floss|dab)\b/.test(s)) return { anim: 'dance', burst: 'confetti', sfx: 'pop', doing: 'dancing wildly' };
  if (/\b(cry|sob|weep)\b/.test(s)) return { anim: 'cry', burst: 'tears', sfx: 'pop', doing: 'sobbing dramatically' };
  if (/\b(faint|pass\s+out|collapse|play\s+dead)\b/.test(s)) return { anim: 'lie', burst: 'stars', sfx: 'thud', doing: 'collapsed on the floor' };
  if (/\b(puke|vomit|throw\s+up|barf|spit)\b/.test(s)) return { anim: 'cower', burst: 'bubbles', sfx: 'splash', doing: 'retching violently' };
  if (/\b(laugh|cackle|giggle|chuckle|tickle)\b/.test(s)) return { anim: 'laugh', burst: 'sparkles', sfx: 'pop', doing: 'laughing maniacally' };
  if (/\b(stomp|tantrum|flip\s+(?:the\s+)?(?:bird|off)|middle\s+finger)\b/.test(s)) return { anim: 'stomp', burst: 'anger', sfx: 'thud', doing: 'making a scene' };
  if (/\b(drink|chug|vodka|whiskey|booze|shot)\b/.test(s)) return { anim: 'drink', burst: 'bubbles', sfx: 'pop', doing: 'chugging aggressively' };
  if (/\b(eat)\b/.test(s)) return { anim: 'eat', burst: 'crumbs', sfx: 'pop', doing: 'eating shamelessly' };
  if (/\b(sing|serenade|rap|opera|yodel|whistle)\b/.test(s)) return { anim: 'cheer', burst: 'confetti', sfx: 'pop', doing: 'belting out a song' };
  if (/\b(pray|kneel|meditate|yoga|bow|salute)\b/.test(s)) return { anim: 'nod', burst: 'sparkles', sfx: 'pop', doing: 'performing a formal gesture' };
  return { anim: 'cheer', burst: 'sparkles', sfx: 'boing', doing: 'making a scene' };
}

function delegateStagingFor(tone: DelegateTone | undefined, isPermission = false): {
  infinitive: string;
  third: string;
  progressive: string;
  feel: EmotionId;
  whyAction: string;
  groupWhy: string;
} {
  const resolved: DelegateTone = tone ?? (isPermission ? 'ask' : 'order');
  if (isPermission) {
    if (resolved === 'beg') {
      return {
        infinitive: 'beg',
        third: 'begs',
        progressive: 'desperately begging',
        feel: 'embarrassed',
        whyAction: 'asks first by begging',
        groupWhy: 'just begged everyone'
      };
    }
    return {
      infinitive: 'ask',
      third: 'asks',
      progressive: 'asking',
      feel: 'nervous',
      whyAction: 'asks first',
      groupWhy: 'just asked everyone'
    };
  }
  switch (resolved) {
    case 'ask':
      return {
        infinitive: 'ask',
        third: 'asks',
        progressive: 'is asking',
        feel: 'nervous',
        whyAction: 'speaks first to ask politely',
        groupWhy: 'just asked everyone'
      };
    case 'dare':
      return {
        infinitive: 'dare',
        third: 'dares',
        progressive: 'is daring',
        feel: 'mischievous',
        whyAction: 'speaks first to throw down the dare',
        groupWhy: 'just dared everyone'
      };
    case 'beg':
      return {
        infinitive: 'beg',
        third: 'begs',
        progressive: 'is desperately begging',
        feel: 'embarrassed',
        whyAction: 'speaks first to plead for it',
        groupWhy: 'just begged everyone'
      };
    case 'persuade':
      return {
        infinitive: 'persuade',
        third: 'tries to persuade',
        progressive: 'is trying to persuade',
        feel: 'excited',
        whyAction: 'speaks first to pitch the idea',
        groupWhy: 'just tried to persuade everyone'
      };
    case 'order':
    default:
      return {
        infinitive: 'tell',
        third: 'tells',
        progressive: 'is ordering',
        feel: 'determined',
        whyAction: 'speaks first to bark the order',
        groupWhy: 'just ordered everyone'
      };
  }
}

export class Directives {
  private active = new Map<CharId, ActiveDirective>();
  private pendingChains = new Map<CharId, { steps: string[]; kind: 'whisper' | 'cue'; allowDelegate: boolean }>();
  private timers: ScheduledTimer[] = [];
  private fxIds: string[] = [];
  private seq = 0;
  private gen = 0;

  constructor(private ctx: DirectivesContext) {}

  clear(): void {
    this.gen += 1;
    const sim = this.ctx.sim;
    for (const d of this.active.values()) {
      sim.release(d.actor, d.id);
      if (d.target) sim.release(d.target, d.id);
      if (d.scuffleId) sim.removeEffect(d.scuffleId);
    }
    this.active.clear();
    this.pendingChains.clear();
    this.timers.length = 0;
    for (const id of this.fxIds) sim.removeEffect(id);
    this.fxIds.length = 0;
  }

  queueChain(actor: CharId, steps: string[], kind: 'whisper' | 'cue', allowDelegate = true): void {
    const clean = steps.map((s) => s.trim()).filter(Boolean);
    if (!clean.length) {
      this.pendingChains.delete(actor);
      return;
    }
    this.pendingChains.set(actor, { steps: clean, kind, allowDelegate });
  }

  clearChain(actor: CharId): void {
    this.pendingChains.delete(actor);
  }

  private advanceChain(actor: CharId): void {
    const entry = this.pendingChains.get(actor);
    if (!entry || !entry.steps.length) {
      this.pendingChains.delete(actor);
      return;
    }
    const next = entry.steps.shift()!;
    if (!entry.steps.length) this.pendingChains.delete(actor);
    const gen = this.gen;
    this.schedule(0.9, () => {
      if (gen !== this.gen) return;
      const p = this.ctx.sim.person(actor);
      if (!this.isAliveAndPresent(p)) return;
      this.ctx.onChainNext?.(actor, next, entry.kind, entry.allowDelegate);
    });
  }

  cancelActor(who: CharId, clearChain = true): void {
    if (clearChain) this.pendingChains.delete(who);
    const prev = this.active.get(who);
    if (!prev) return;
    const sim = this.ctx.sim;
    sim.release(prev.actor, prev.id);
    if (prev.target) sim.release(prev.target, prev.id);
    if (prev.scuffleId) sim.removeEffect(prev.scuffleId);
    this.active.delete(who);
  }

  private trackFx(id: string): void {
    if (!this.fxIds.includes(id)) this.fxIds.push(id);
  }

  private schedule(delaySec: number, fn: () => void): void {
    this.timers.push({ at: this.ctx.sim.time + delaySec, fn });
  }

  private isAliveAndPresent(p: SimPerson | undefined): p is SimPerson {
    return !!p && p.present && !this.ctx.sim.hasStatus(p.id, 'eliminated') && !this.ctx.sim.hasStatus(p.id, 'quit');
  }

  private focusPeople(ids: CharId[], holdMs = 5500): void {
    const sim = this.ctx.sim;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const p = sim.person(id);
      if (!p) continue;
      x0 = Math.min(x0, p.x - 16);
      x1 = Math.max(x1, p.x + 16);
      y0 = Math.min(y0, p.y - 42);
      y1 = Math.max(y1, p.y + 10);
    }
    if (!Number.isFinite(x0)) return;
    sim.bus.emit('focus', { x: x0, y: y0, w: x1 - x0, h: y1 - y0, weight: 0.95, holdMs });
  }

  private stageGroupDelegate(
    a: SimPerson,
    rawAction: string,
    targetRoom: RoomId,
    delegateDepth: number,
    delegateTone?: DelegateTone
  ): boolean {
    const sim = this.ctx.sim;
    const inRoom = sim
      .peopleIn(targetRoom)
      .filter((p) => p.isCast && this.isAliveAndPresent(p) && p.id !== a.id)
      .sort((x, y) => Math.hypot(x.x - a.x, x.y - a.y) - Math.hypot(y.x - a.x, y.y - a.y));
    const pool = inRoom.length
      ? inRoom
      : sim
          .peopleNear(a.x, a.y, 1200)
          .filter((p) => p.isCast && this.isAliveAndPresent(p) && p.id !== a.id)
          .sort((x, y) => Math.hypot(x.x - a.x, x.y - a.y) - Math.hypot(y.x - a.x, y.y - a.y));
    const speakers = pool.slice(0, 3);
    if (!speakers.length) return false;
    const targets = pool;
    const speakerIds = speakers.map((p) => p.id);
    const targetIds = targets.map((p) => p.id);
    for (const tp of speakers) {
      if (sim.hasStatus(tp.id, 'asleep')) sim.removeStatus(tp.id, 'asleep');
      sim.face(tp.id, a.id);
    }
    const tone: DelegateTone = delegateTone ?? 'order';
    const st = delegateStagingFor(tone, false);
    this.focusPeople([a.id, ...speakerIds], 6500);
    sim.feel(a.id, st.feel, 0.85, 8);
    const rName = roomDef(targetRoom).name;
    const command = normalizeDelegatedCommand(rawAction, a.name);
    // "tell everyone the call is at two" passes on news, not an order: no "to" in front of it.
    const news = /^(that|the|a|an|there|it|he|she|they|we|this|today|tomorrow|corporate|[a-z]+(?:'s)?\s+(?:is|are|was|were|has|have|will|can))\b/i.test(rawAction.trim());
    sim.narrate(news ? `${a.name} ${st.third} everyone in ${rName}: ${rawAction.trim()}!` : `${a.name} ${st.third} everyone in ${rName} to ${rawAction}!`, {
      kind: 'event',
      icon: 'tell',
      room: targetRoom,
      beat: true
    });
    this.ctx.scene({
      people: [a.id, ...speakerIds],
      room: targetRoom,
      trigger: 'cue',
      why: `${a.name} ${st.groupWhy} in ${rName} to do this right now: "${rawAction}". Each person reacts in character and decides independently whether to comply or refuse.`,
      delegation: {
        asker: a.id,
        target: speakerIds[0],
        targets: targetIds,
        tone,
        action: rawAction,
        command,
        depth: delegateDepth
      },
      priority: 10,
      minLines: Math.min(3, speakerIds.length + 1),
      maxLines: 4,
      staleAfter: 40
    }, true);
    return true;
  }

  start(actor: CharId, res: DirectiveResult, rawText: string, kind: 'whisper' | 'cue', delegateDepth = 0): boolean {
    if (res.verb === 'social') return false;
    const sim = this.ctx.sim;
    const a = sim.person(actor);
    if (!this.isAliveAndPresent(a)) return false;

    this.cancelActor(actor, false);
    const id = `dir-${++this.seq}`;
    const gen = this.gen;

    // Handle group delegation ("tell everyone to ...") before target resolution.
    if (res.verb === 'delegate' && res.targetAll) {
      const rawAction = (res.delegatedText || rawText).trim();
      const targetRoom = res.targetRoom ?? a.room;
      if (kind === 'cue') sim.setThought(actor, '');
      if (res.targetRoom && res.targetRoom !== a.room) {
        this.focusPeople([actor]);
        const rName = roomDef(res.targetRoom).name;
        sim.goTo(actor, { room: res.targetRoom }, {
          style: 'run',
          doing: `heading to ${rName}`,
          braveHazard: true,
          then: () => {
            if (gen !== this.gen) return;
            const cur = sim.person(actor);
            if (!this.isAliveAndPresent(cur)) return;
            this.stageGroupDelegate(cur, rawAction, targetRoom, delegateDepth, res.delegateTone);
          }
        });
        return true;
      }
      return this.stageGroupDelegate(a, rawAction, targetRoom, delegateDepth, res.delegateTone);
    }

    // Handle status-reversal / self-care directives ("get dressed", "wake up jim", "revive jim", "take a nap", "stop").
    if (res.verb === 'recover') {
      const rName = roomDef(a.room).name;
      if (res.item === 'stop') {
        this.cancelActor(actor, true);
        sim.resume(actor);
        sim.setThought(actor, '');
        sim.narrate(`${a.name} stops what they were doing.`, { kind: 'event', icon: 'tell', room: a.room });
        return true;
      }
      if (res.item === 'sleep') {
        if (kind === 'cue') sim.setThought(actor, '');
        this.focusPeople([actor]);
        sim.addStatus(actor, 'asleep', 25);
        sim.feel(actor, 'tired', 0.9, 15);
        sim.narrate(`${a.name} curls up for a nap in ${rName}.`, { kind: 'event', icon: 'tell', room: a.room, beat: true });
        this.advanceChain(actor);
        return true;
      }
      if (res.item === 'revive' || res.item === 'wake') {
        const allowElim = res.item === 'revive';
        let target = res.targetPerson ? sim.person(res.targetPerson) : undefined;
        if (!target || !target.present || sim.hasStatus(target.id, 'quit') || (!allowElim && sim.hasStatus(target.id, 'eliminated'))) {
          target = sim
            .peopleNear(a.x, a.y, 1200)
            .filter((p) => {
              if (!p.present || p.id === actor || sim.hasStatus(p.id, 'quit')) return false;
              if (allowElim) return sim.hasStatus(p.id, 'eliminated') || sim.hasStatus(p.id, 'knockedOut') || sim.hasStatus(p.id, 'asleep');
              return sim.hasStatus(p.id, 'asleep') || sim.hasStatus(p.id, 'knockedOut') || sim.hasStatus(p.id, 'frozen');
            })
            .sort((x, y) => Math.hypot(x.x - a.x, x.y - a.y) - Math.hypot(y.x - a.x, y.y - a.y))[0];
        }
        if (!target) return false;
        const d: ActiveDirective = {
          id,
          actor,
          target: target.id,
          allowRevive: allowElim,
          room: null,
          verb: 'recover',
          rawText,
          summary: res.summary,
          kind,
          item: res.item,
          power: 'none',
          phase: 'approach',
          timer: 0,
          repathAt: -1,
          burstAt: 0,
          alertedTarget: false
        };
        this.active.set(actor, d);
        this.focusPeople([actor, target.id]);
        return true;
      }
      // dress / cover up
      const tgt = res.targetPerson && res.targetPerson !== actor ? sim.person(res.targetPerson) : undefined;
      if (tgt && this.isAliveAndPresent(tgt)) {
        const d: ActiveDirective = {
          id,
          actor,
          target: tgt.id,
          room: null,
          verb: 'recover',
          rawText,
          summary: res.summary,
          kind,
          item: 'dress',
          power: 'none',
          phase: 'approach',
          timer: 0,
          repathAt: -1,
          burstAt: 0,
          alertedTarget: false
        };
        this.active.set(actor, d);
        this.focusPeople([actor, tgt.id]);
        return true;
      }
      const soloD: ActiveDirective = {
        id,
        actor,
        target: null,
        room: null,
        verb: 'recover',
        rawText,
        summary: res.summary,
        kind,
        item: 'dress',
        power: 'none',
        phase: 'perform',
        timer: 0,
        repathAt: -1,
        burstAt: 0,
        alertedTarget: false
      };
      this.finishRecover(soloD, a, undefined);
      return true;
    }

    // Resolve default target if an inherently interpersonal verb omitted a target name.
    let targetId = res.targetPerson;
    const validTargetPeople = res.targetPeople?.filter((pid) => pid !== actor && this.isAliveAndPresent(sim.person(pid)));
    if (validTargetPeople?.length && !targetId) targetId = validTargetPeople[0];
    const needsPerson = res.verb === 'eliminate' || res.verb === 'knockout' || res.verb === 'shove' || res.verb === 'drag' || res.verb === 'steal' || res.verb === 'romance' || res.verb === 'chase' || res.verb === 'follow' || res.verb === 'delegate';
    if (!targetId && needsPerson) {
      const nearest = sim
        .peopleNear(a.x, a.y, 1200)
        .filter((p) => p.id !== actor && p.isCast && this.isAliveAndPresent(p))
        .sort((x, y) => Math.hypot(x.x - a.x, x.y - a.y) - Math.hypot(y.x - a.x, y.y - a.y))[0];
      targetId = nearest?.id ?? null;
    }

    const t = targetId ? sim.person(targetId) : undefined;
    if (needsPerson && !this.isAliveAndPresent(t)) return false;

    switch (res.verb) {
      case 'eliminate':
      case 'knockout':
      case 'shove':
      case 'drag':
      case 'steal':
      case 'romance':
      case 'delegate':
      case 'chase':
      case 'follow': {
        if (!t) return false;
        const destRoom = res.verb === 'drag'
          ? (res.targetRoom ?? (t.room === 'meeting' ? 'bullpen' : 'meeting'))
          : res.targetRoom;
        const phase = res.verb === 'chase' ? 'chase' : res.verb === 'follow' ? 'follow' : 'approach';
        const d: ActiveDirective = {
          id,
          actor,
          target: t.id,
          ...(validTargetPeople && validTargetPeople.length > 1 ? { targetPeople: validTargetPeople } : {}),
          delegateDepth,
          ...(res.delegateExecutor ? { delegateExecutor: res.delegateExecutor } : {}),
          ...(res.delegateTone ? { delegateTone: res.delegateTone } : {}),
          room: destRoom,
          verb: res.verb,
          rawText,
          summary: res.summary,
          delegatedText: res.delegatedText,
          kind,
          item: res.item,
          power: res.power,
          phase,
          timer: 0,
          repathAt: -1,
          burstAt: 0,
          alertedTarget: false,
          destRoom: destRoom ?? undefined,
          destTile: destRoom ? pickDropTile(destRoom) : undefined
        };
        this.active.set(actor, d);
        this.focusPeople(t.id !== actor ? [actor, t.id] : [actor]);
        if (res.verb === 'chase') {
          sim.narrate(`${a.name} is chasing ${t.name} through the office!`, { kind: 'event', icon: 'rage', room: a.room, beat: true });
        } else if (res.verb === 'follow') {
          sim.narrate(`${a.name} started shadowing ${t.name}.`, { kind: 'event', icon: 'tell', room: a.room });
        }
        return true;
      }

      case 'expose':
      case 'perform': {
        const target = t && t.id !== actor && this.isAliveAndPresent(t) ? t : undefined;
        const d: ActiveDirective = {
          id,
          actor,
          target: target ? target.id : null,
          room: res.targetRoom,
          verb: res.verb,
          rawText,
          summary: res.summary,
          kind,
          item: res.item,
          power: res.power,
          phase: target ? 'approach' : 'perform',
          timer: 0,
          repathAt: -1,
          burstAt: 0,
          alertedTarget: false
        };
        this.active.set(actor, d);
        this.focusPeople(target ? [actor, target.id] : [actor], 6500);
        if (target) return true;
        if (res.targetRoom && res.targetRoom !== a.room) {
          const r = res.targetRoom;
          const rName = roomDef(r).name;
          d.phase = 'approach';
          sim.goTo(actor, { room: r }, {
            style: 'run',
            doing: `heading to ${rName}`,
            braveHazard: true,
            then: () => {
              if (gen !== this.gen) return;
              const cur = sim.person(actor);
              if (!this.isAliveAndPresent(cur) || this.active.get(actor)?.id !== id) return;
              this.startPerform(d, cur, undefined);
            }
          });
          return true;
        }
        this.startPerform(d, a, undefined);
        return true;
      }

      case 'lock_in': {
        this.focusPeople(t && t.id !== actor ? [actor, t.id] : [actor]);
        const lockRoom = res.targetRoom ?? safeRoom(t ? t.room : a.room);
        if (t && t.id !== actor && t.room !== lockRoom) {
          const d: ActiveDirective = {
            id,
            actor,
            target: t.id,
            room: lockRoom,
            verb: 'drag',
            rawText,
            summary: res.summary,
            kind,
            item: res.item,
            power: res.power,
            phase: 'approach',
            timer: 0,
            repathAt: -1,
            burstAt: 0,
            alertedTarget: false,
            destRoom: lockRoom,
            destTile: pickDropTile(lockRoom),
            lockAfter: true
          };
          this.active.set(actor, d);
          return true;
        }
        const roomName = roomDef(lockRoom).name;
        sim.goTo(actor, { room: lockRoom }, {
          style: 'run',
          doing: `locking down ${roomName}`,
          braveHazard: true,
          then: () => {
            if (gen !== this.gen) return;
            sim.startChaos('lockIn', { room: lockRoom }, { force: true });
            sim.narrate(`${a.name} barricaded ${roomName}!`, { kind: 'event', icon: 'door', room: lockRoom });
            sim.remember(lockRoom, `${a.name} barricaded the doors of ${roomName}.`, 2.5);
            this.advanceChain(actor);
          }
        });
        return true;
      }

      case 'sabotage': {
        this.focusPeople([actor]);
        let dest: { anchor: string } | { room: TargetRoomId };
        let factKey: string;
        let factText: string;
        let label = res.item || 'the equipment';
        if (t && /desk/i.test(rawText) && isCastId(t.id)) {
          dest = { anchor: `desk.${t.id}` };
          factKey = `sabotage:desk:${t.id}`;
          factText = `${t.name}'s desk has been trashed by ${a.name}.`;
          label = `${t.name}'s desk`;
        } else if (/fax|copier|printer/i.test(rawText)) {
          dest = { anchor: 'spot.annex4' };
          factKey = 'sabotage:fax';
          factText = `The fax machine in the annex has been smashed to pieces by ${a.name}.`;
          label = 'the fax machine';
        } else if (/coffee/i.test(rawText)) {
          dest = { anchor: 'stand.coffee' };
          factKey = 'sabotage:coffee';
          factText = `The coffee machine has been wrecked by ${a.name}.`;
          label = 'the coffee machine';
        } else if (/vending/i.test(rawText)) {
          dest = { anchor: 'stand.vending' };
          factKey = 'sabotage:vending';
          factText = `The vending machine has been smashed by ${a.name}.`;
          label = 'the vending machine';
        } else if (/fridge/i.test(rawText)) {
          dest = { anchor: 'stand.fridge' };
          factKey = 'sabotage:fridge';
          factText = `The break room fridge was sabotaged by ${a.name}.`;
          label = 'the fridge';
        } else if (/cooler/i.test(rawText)) {
          dest = { anchor: 'stand.cooler' };
          factKey = 'sabotage:cooler';
          factText = `The water cooler was knocked over by ${a.name}.`;
          label = 'the water cooler';
        } else {
          const fallbackRoom = res.targetRoom ?? safeRoom(a.room);
          dest = { room: fallbackRoom };
          factKey = `sabotage:${fallbackRoom}`;
          factText = `${a.name} wrecked ${label} in ${roomDef(fallbackRoom).name}.`;
        }
        sim.goTo(actor, dest, {
          style: 'run',
          doing: `going to wreck ${label}`,
          braveHazard: true,
          then: () => {
            if (gen !== this.gen) return;
            const cur = sim.person(actor);
            if (!this.isAliveAndPresent(cur)) return;
            const fxId = `broken-${++this.seq}`;
            this.trackFx(fxId);
            sim.setProp(actor, 'wrench');
            sim.feel(actor, 'angry', 0.85, 8);
            sim.fx({ kind: 'explosion', x: cur.x, y: cur.y - 6, size: 1 });
            sim.fx({ kind: 'burst', what: 'dust', x: cur.x, y: cur.y - 4, count: 14 });
            sim.addEffect({ id: fxId, kind: 'item', item: 'brokenParts', x: cur.x, y: cur.y + 2 });
            sim.sfx('explosion', cur.x);
            sim.shake(0.28, 400);
            sim.bumpChaos(14);
            sim.setFact(factKey, factText);
            sim.narrate(`${a.name} smashed ${label} to pieces!`, { kind: 'event', icon: 'chaos', room: cur.room, beat: true });
            sim.remember('all', factText, 2.5);
            this.schedule(2.5, () => sim.setProp(actor, null));
            const witnesses = sim.peopleIn(cur.room).filter((p) => p.isCast && p.id !== actor && this.isAliveAndPresent(p)).slice(0, 2).map((p) => p.id);
            this.ctx.scene({
              people: [actor, ...witnesses],
              room: cur.room,
              trigger: 'aftermath',
              why: `${a.name} just violently smashed ${label} into broken parts in ${roomDef(cur.room).name}.`,
              priority: 9,
              minLines: 1,
              maxLines: witnesses.length ? 3 : 2,
              staleAfter: 40
            }, true);
            this.advanceChain(actor);
          }
        });
        return true;
      }

      case 'trigger_power': {
        this.focusPeople([actor]);
        const chaosId = powerToChaos(res.power, rawText);
        const r = res.targetRoom ?? safeRoom(a.room);
        const rName = roomDef(r).name;
        sim.goTo(actor, { room: r }, {
          style: 'run',
          doing: `setting off chaos in ${rName}`,
          braveHazard: true,
          then: () => {
            if (gen !== this.gen) return;
            const cur = sim.person(actor);
            if (!this.isAliveAndPresent(cur)) return;
            sim.startChaos(chaosId, { room: r }, { force: true });
            sim.narrate(`${a.name} triggered ${chaosId} in ${rName}!`, { kind: 'event', icon: 'chaos', room: r, beat: true });
            sim.remember('all', `${a.name} set off ${chaosId} in ${rName}.`, 3);
            this.advanceChain(actor);
          }
        });
        return true;
      }

      case 'walk_out': {
        this.focusPeople([actor]);
        this.pendingChains.delete(actor);
        sim.setProp(actor, 'box');
        sim.feel(actor, 'angry', 0.85, 12);
        sim.say(actor, "That's it. I quit.", { kind: 'shout', emotion: 'angry' });
        sim.addStatus(actor, 'quit', 99999);
        sim.setFact(`quit:${actor}`, `${a.name} quit and walked out.`);
        sim.narrate(`${a.name} packed up a box and walked out!`, { kind: 'event', icon: 'door', room: a.room, beat: true });
        sim.remember('all', `${a.name} quit on the spot and walked out the front door.`, 3.5);
        sim.leaveEarly(actor, 'walking out for good');
        return true;
      }

      case 'guard': {
        this.focusPeople([actor]);
        const r = res.targetRoom ?? safeRoom(a.room);
        const rName = roomDef(r).name;
        sim.feel(actor, 'determined', 0.8, 15);
        sim.goTo(actor, { room: r }, { style: 'walk', doing: `heading to guard ${rName}`, stay: 60, stayDoing: `guarding ${rName}`, braveHazard: true });
        sim.narrate(`${a.name} posted up to guard ${rName}.`, { kind: 'event', icon: 'tell', room: r });
        return true;
      }

      case 'go_to': {
        if (!res.targetRoom) return false;
        this.focusPeople([actor]);
        const rName = roomDef(res.targetRoom).name;
        sim.goTo(actor, { room: res.targetRoom }, {
          style: 'run',
          doing: `heading to ${rName}`,
          stay: 45,
          stayDoing: `waiting in ${rName}`,
          braveHazard: true,
          then: () => {
            if (gen !== this.gen) return;
            this.advanceChain(actor);
          }
        });
        return true;
      }

      default:
        return false;
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const sim = this.ctx.sim;
    const now = sim.time;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (now >= this.timers[i].at) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }

    for (const d of [...this.active.values()]) {
      const a = sim.person(d.actor);
      const t = d.target ? sim.person(d.target) : undefined;
      const targetOk = !d.target || (d.allowRevive ? !!t && t.present && !sim.hasStatus(t.id, 'quit') : this.isAliveAndPresent(t));
      if (!this.isAliveAndPresent(a) || !targetOk) {
        this.cancelActor(d.actor);
        continue;
      }
      d.timer += dt;

      if (d.phase === 'approach' && !t) {
        if (d.timer >= 18) this.startPerform(d, a, undefined);
        continue;
      }

      if (d.phase === 'approach' && t) {
        const dist = Math.hypot(t.x - a.x, t.y - a.y);
        if ((d.verb === 'eliminate' || d.verb === 'knockout') && dist < 56 && !d.alertedTarget && t.id !== a.id) {
          d.alertedTarget = true;
          sim.feel(t.id, 'scared', 0.95, 5);
          sim.emote(t.id, 'alert');
          sim.bark(t.id, 'scared');
        }
        if (dist <= 26 || t.id === a.id) {
          this.onContact(d, a, t);
          continue;
        }
        if (d.timer >= 40) {
          if (d.verb === 'expose' || d.verb === 'perform') {
            this.startPerform(d, a, t);
            continue;
          }
          this.cancelActor(d.actor);
          continue;
        }
        if (now >= d.repathAt) {
          d.repathAt = now + 0.85;
          const fast = d.verb === 'eliminate' || d.verb === 'knockout' || d.verb === 'shove' || d.verb === 'drag' || d.verb === 'steal' || d.verb === 'romance' || d.verb === 'delegate' || d.verb === 'recover' || d.verb === 'expose' || d.verb === 'perform';
          const doing = d.verb === 'eliminate' ? `hunting ${t.name}`
            : d.verb === 'knockout' ? `going after ${t.name}`
              : d.verb === 'drag' ? `grabbing ${t.name}`
                : d.verb === 'shove' ? `charging ${t.name}`
                  : d.verb === 'romance' ? `approaching ${t.name}`
                    : d.verb === 'delegate' ? `heading over to ${delegateStagingFor(d.delegateTone, d.delegateExecutor === 'asker').infinitive} ${t.name}`
                      : d.verb === 'recover' ? `helping ${t.name}`
                        : d.verb === 'expose' || d.verb === 'perform' ? `heading over to ${t.name}`
                          : `heading for ${t.name}`;
          sim.goTo(a.id, { near: t.id }, { style: fast ? 'run' : 'walk', doing, braveHazard: true });
        }
        continue;
      }

      if (d.phase === 'perform') {
        if (now >= d.burstAt) {
          d.burstAt = now + 0.65;
          const burst = d.verb === 'expose' ? 'confetti' : performStyle(d.rawText).burst;
          sim.fx({ kind: 'burst', what: burst, x: a.x, y: a.y - 12, count: 8 });
        }
        if (d.timer >= 1.8) this.finishPerform(d, a, t);
        continue;
      }

      if (d.phase === 'romance_act' && t) {
        if (now >= d.burstAt) {
          d.burstAt = now + 0.75;
          sim.fx({ kind: 'burst', what: 'hearts', x: (a.x + t.x) / 2, y: a.y - 16, count: 8 });
        }
        if (d.timer >= 1.5) this.finishRomance(d, a, t);
        continue;
      }

      if (d.phase === 'scuffle' && t) {
        if (now >= d.burstAt) {
          d.burstAt = now + 0.45;
          sim.fx({ kind: 'burst', what: d.verb === 'eliminate' ? 'anger' : 'stars', x: t.x, y: t.y - 10, count: 6 });
          sim.sfx('thud', t.x);
        }
        const dur = d.verb === 'eliminate' ? 1.5 : 1.1;
        if (d.timer >= dur) this.finishScuffle(d, a, t);
        continue;
      }

      if (d.phase === 'haul' && t && d.destTile && d.destRoom) {
        const ox = a.facing === 'left' ? 10 : a.facing === 'right' ? -10 : 0;
        const oy = a.facing === 'up' ? 8 : -6;
        sim.place(t.id, a.x + ox, a.y + oy, 3);
        const destPx = feetOf(d.destTile);
        const arrived = Math.hypot(a.x - destPx.x, a.y - destPx.y) <= 24 || (a.room === d.destRoom && d.timer >= 1.8);
        if (arrived || d.timer >= 14) {
          this.finishHaul(d, a, t);
        } else if (now >= d.repathAt) {
          d.repathAt = now + 1.8;
          sim.goTo(a.id, { tile: d.destTile }, { style: 'walk', doing: `dragging ${t.name}`, stay: 10, stayDoing: `holding ${t.name}`, braveHazard: true });
        }
        continue;
      }

      if (d.phase === 'chase' && t) {
        if (d.timer >= 18) {
          this.cancelActor(d.actor);
          continue;
        }
        const dist = Math.hypot(t.x - a.x, t.y - a.y);
        if (dist < 42 && t.id !== a.id && t.available) {
          sim.feel(t.id, 'scared', 0.85, 4);
          sim.fleeFrom(t.id, a.room, { style: 'run', doing: `running from ${a.name}` });
        }
        if (now >= d.repathAt) {
          d.repathAt = now + 0.9;
          sim.goTo(a.id, { near: t.id }, { style: 'run', doing: `chasing ${t.name}`, braveHazard: true });
        }
        continue;
      }

      if (d.phase === 'follow' && t) {
        if (d.timer >= 45) {
          this.cancelActor(d.actor);
          continue;
        }
        const dist = Math.hypot(t.x - a.x, t.y - a.y);
        if (dist > 38 && now >= d.repathAt) {
          d.repathAt = now + 1.4;
          sim.goTo(a.id, { near: t.id }, { style: 'walk', doing: `following ${t.name}`, braveHazard: true });
        }
      }
    }
  }

  private onContact(d: ActiveDirective, a: SimPerson, t: SimPerson): void {
    const sim = this.ctx.sim;
    const roomName = roomDef(t.room).name;

    if (d.verb === 'eliminate' || d.verb === 'knockout') {
      const scuffleId = `scuffle-${d.id}`;
      d.phase = 'scuffle';
      d.timer = 0;
      d.burstAt = sim.time + 0.45;
      d.scuffleId = scuffleId;
      this.trackFx(scuffleId);
      sim.seize(a.id, d.id, { anim: 'panic', doing: d.verb === 'eliminate' ? `eliminating ${t.name}` : `fighting ${t.name}` });
      if (t.id !== a.id) sim.seize(t.id, d.id, { anim: 'cower', doing: `fighting for their life` });
      sim.addEffect({ id: scuffleId, kind: 'item', item: 'scuffle', x: (a.x + t.x) / 2, y: (a.y + t.y) / 2 + 2 });
      sim.sfx('thud', t.x);
      sim.fx({ kind: 'burst', what: 'dust', x: t.x, y: t.y - 6, count: 14 });
      sim.shake(0.35, 500);
      return;
    }

    if (d.verb === 'shove') {
      const phrase = formatAction(d.summary, d.rawText, a.name);
      const raw = d.rawText.trim().replace(/\s+/g, ' ').slice(0, 120);
      const isSplash = /\b(splash|pour|dump|spill|drench|soak|spray|squirt|coffee|water|tea|soda|soup|chili|beer|wine|vodka|drink|juice|milk|slime)\b/i.test(d.rawText);
      if (isSplash) {
        sim.addStatus(t.id, 'wet', 45);
        sim.sfx('splash', t.x);
        sim.fx({ kind: 'burst', what: 'bubbles', x: t.x, y: t.y - 10, count: 12 });
        sim.react(t.id, 'startle', 1.4);
      } else {
        const dx = t.x - a.x;
        const dy = t.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        sim.launch(t.id, (dx / len) * 180, (dy / len) * 140, 120);
        sim.sfx('boing', t.x);
      }
      sim.feel(t.id, 'angry', 0.85, 8);
      if (t.id !== a.id) sim.shiftBond(t.id, a.id, -25);
      sim.bumpChaos(8);
      const msg = phrase ? `${a.name} ${phrase} in ${roomName}!` : `${a.name} shoved ${t.name} across ${roomName}!`;
      sim.narrate(msg, { kind: 'event', icon: 'rage', room: t.room, beat: true });
      sim.remember([a.id, t.id], `${a.name} ${phrase || `shoved ${t.name}`} in ${roomName}.`, 2.5);
      this.active.delete(a.id);
      if (t.id !== a.id) {
        this.ctx.scene({
          people: [a.id, t.id],
          room: t.room,
          trigger: 'aftermath',
          why: `${a.name} just physically ${phrase || `shoved ${t.name}`} in ${roomName} (action: "${raw}").`,
          priority: 9,
          minLines: 2,
          maxLines: 3,
          staleAfter: 35
        }, true);
      }
      this.advanceChain(a.id);
      return;
    }

    if (d.verb === 'drag' && d.destTile && d.destRoom) {
      if (t.id === a.id) {
        this.active.delete(a.id);
        this.advanceChain(a.id);
        return;
      }
      d.phase = 'haul';
      d.timer = 0;
      d.repathAt = sim.time + 1.8;
      const destName = roomDef(d.destRoom).name;
      sim.seize(t.id, d.id, { anim: 'cower', doing: `being dragged by ${a.name}` });
      sim.feel(t.id, 'scared', 0.85, 10);
      sim.emote(t.id, 'alert');
      sim.bark(t.id, 'pickedUp');
      sim.bus.emit('pickedUp', { who: t.id });
      sim.narrate(`${a.name} grabbed ${t.name} and started dragging them to ${destName}!`, { kind: 'event', icon: 'tell', room: a.room });
      sim.goTo(a.id, { tile: d.destTile }, { style: 'walk', doing: `dragging ${t.name}`, stay: 10, stayDoing: `holding ${t.name}`, braveHazard: true });
      return;
    }

    if (d.verb === 'steal') {
      sim.setProp(a.id, propFromItem(d.item));
      sim.emote(a.id, 'idea');
      sim.feel(t.id, 'angry', 0.85, 8);
      if (t.id !== a.id) sim.shiftBond(t.id, a.id, -25);
      const what = d.item || 'things';
      sim.narrate(`${a.name} snatched ${t.name}'s ${what}!`, { kind: 'event', icon: 'rage', room: t.room, beat: true });
      sim.remember([a.id, t.id], `${a.name} stole ${t.name}'s ${what} right in front of everyone.`, 2.5);
      this.active.delete(a.id);
      if (t.id !== a.id) {
        this.ctx.scene({
          people: [a.id, t.id],
          room: t.room,
          trigger: 'aftermath',
          why: `${a.name} just stole ${t.name}'s ${what} straight from ${t.name} in ${roomName}.`,
          priority: 9,
          minLines: 2,
          maxLines: 3,
          staleAfter: 35
        }, true);
      }
      this.advanceChain(a.id);
      return;
    }

    if (d.verb === 'recover') {
      this.finishRecover(d, a, t);
      return;
    }

    if (d.verb === 'expose' || d.verb === 'perform') {
      this.startPerform(d, a, t);
      return;
    }

    if (d.verb === 'delegate') {
      this.active.delete(a.id);
      if (d.kind === 'cue') sim.setThought(a.id, '');
      const rawAction = (d.delegatedText || d.rawText).trim();
      const command = normalizeDelegatedCommand(rawAction, a.name);
      const groupTargets = d.targetPeople
        ?.map((id) => sim.person(id))
        .filter((p): p is SimPerson => !!p && p.id !== a.id && this.isAliveAndPresent(p));
      if (groupTargets && groupTargets.length >= 2) {
        const ids = groupTargets.map((p) => p.id);
        for (const gp of groupTargets) {
          if (sim.hasStatus(gp.id, 'asleep')) sim.removeStatus(gp.id, 'asleep');
          sim.face(gp.id, a.id);
        }
        const tone: DelegateTone = d.delegateTone ?? 'order';
        const st = delegateStagingFor(tone, false);
        sim.face(a.id, groupTargets[0].id);
        this.focusPeople([a.id, ...ids], 6500);
        sim.feel(a.id, st.feel, 0.8, 8);
        const labelNames = groupTargets.map((p) => p.name).join(' and ');
        sim.narrate(`${a.name} walks up to ${labelNames} in ${roomName} and ${st.third} them to ${rawAction}!`, {
          kind: 'event',
          icon: 'tell',
          room: t.room,
          beat: true
        });
        this.ctx.scene({
          people: [a.id, ...ids],
          room: t.room,
          trigger: 'cue',
          why: `${a.name} just walked up to ${labelNames} in ${roomName} and ${st.progressive} them to do this right now: "${rawAction}". Each responds strictly in character — either agreeing out loud or refusing.`,
          delegation: { asker: a.id, target: ids[0], targets: ids, tone, action: rawAction, command, depth: d.delegateDepth ?? 0 },
          priority: 10,
          minLines: Math.min(3, ids.length + 1),
          maxLines: 4,
          staleAfter: 40
        }, true);
        return;
      }

      if (sim.hasStatus(t.id, 'asleep')) sim.removeStatus(t.id, 'asleep');
      sim.face(a.id, t.id);
      if (t.id !== a.id) sim.face(t.id, a.id);
      this.focusPeople(t.id !== a.id ? [a.id, t.id] : [a.id], 6500);
      const isPermission = d.delegateExecutor === 'asker';
      const tone: DelegateTone = d.delegateTone ?? (isPermission ? 'ask' : 'order');
      const st = delegateStagingFor(tone, isPermission);
      sim.feel(a.id, st.feel, 0.8, 8);
      const witnesses = sim
        .peopleNear(t.x, t.y, 180)
        .filter((p) => p.isCast && p.present && p.available && p.id !== a.id && p.id !== t.id);
      const treatYouAsTarget = /\b(?:if|whether)\s+(?:i|we)\s+/i.test(d.rawText);
      const effectiveCommand = isPermission ? normalizePermissionCommand(rawAction, t.name, treatYouAsTarget) : command;
      sim.narrate(
        isPermission
          ? `${a.name} walks up to ${t.name} in ${roomName} and ${st.third} ${t.name} for permission to ${rawAction}!`
          : `${a.name} walks up to ${t.name} in ${roomName} and ${st.third} ${t.name} to ${rawAction}!`,
        {
          kind: 'event',
          icon: 'tell',
          room: t.room,
          beat: true
        }
      );
      const people = [a.id, ...(t.id !== a.id ? [t.id] : []), ...witnesses.slice(0, 1).map((w) => w.id)];
      this.ctx.scene({
        people,
        room: t.room,
        trigger: 'cue',
        why: isPermission
          ? `${a.name} just walked up to ${t.name} in ${roomName} and is ${st.progressive} ${t.name} for permission to do this right now: "${rawAction}". ${a.name} ${st.whyAction}, and ${t.name} responds strictly in character based on who ${t.name} is, their mood, and how they feel about ${a.name} — either agreeing to let ${a.name} do it or refusing.`
          : `${a.name} just walked right up to ${t.name} in ${roomName} and ${st.progressive} ${t.name} to do this right now: "${rawAction}". ${a.name} ${st.whyAction}, and ${t.name} responds strictly in character based on who ${t.name} is, their mood, and how they feel about ${a.name} — either agreeing to actually do it right now or refusing.`,
        delegation: {
          asker: a.id,
          target: t.id,
          tone,
          ...(isPermission ? { executor: 'asker' as const } : {}),
          action: rawAction,
          command: effectiveCommand,
          depth: d.delegateDepth ?? 0
        },
        priority: 10,
        minLines: 2,
        maxLines: witnesses.length ? 4 : 3,
        staleAfter: 40
      }, true);
      return;
    }

    if (d.verb === 'romance') {
      const phrase = formatAction(d.summary, d.rawText, a.name);
      d.phase = 'romance_act';
      d.timer = 0;
      d.burstAt = sim.time + 0.75;
      this.focusPeople(t.id !== a.id ? [a.id, t.id] : [a.id], 6500);
      if (d.kind === 'cue') sim.setThought(a.id, '');
      sim.seize(a.id, d.id, { anim: 'cheer', doing: phrase || 'making a move' });
      sim.face(a.id, t.id);
      if (t.id !== a.id) {
        sim.face(t.id, a.id);
        sim.react(t.id, 'startle', 1.2);
      }
      sim.feel(a.id, 'love', 0.9, 12);
      sim.feel(t.id, 'surprised', 0.8, 8);
      sim.fx({ kind: 'burst', what: 'hearts', x: (a.x + t.x) / 2, y: a.y - 16, count: 12 });
      sim.emote(a.id, 'heart');
      sim.sfx('heart', t.x);
      sim.narrate(`${a.name} ${phrase || `makes a move on ${t.name}`} right in ${roomName}!`, {
        kind: 'event',
        icon: 'love',
        room: t.room,
        beat: true
      });
      const witnesses = sim
        .peopleNear(t.x, t.y, 180)
        .filter((p) => p.isCast && p.present && p.available && p.id !== a.id && p.id !== t.id);
      for (const w of witnesses.slice(0, 3)) {
        sim.face(w.id, a.id);
        sim.feel(w.id, 'surprised', 0.85, 8);
        sim.emote(w.id, 'alert');
        sim.react(w.id, 'startle', 1.1);
      }
    }
  }

  private startPerform(d: ActiveDirective, a: SimPerson, t?: SimPerson): void {
    const sim = this.ctx.sim;
    const roomName = roomDef(a.room).name;
    const phrase = formatAction(d.summary, d.rawText, a.name);
    d.phase = 'perform';
    d.timer = 0;
    d.burstAt = sim.time + 0.65;
    this.focusPeople(t ? [a.id, t.id] : [a.id], 6500);
    if (d.kind === 'cue') sim.setThought(a.id, '');
    if (t && t.id !== a.id) sim.face(a.id, t.id);

    if (d.verb === 'expose') {
      sim.seize(a.id, d.id, { anim: 'dance', doing: phrase || 'stripping naked' });
      sim.addStatus(a.id, 'naked', 90);
      sim.setFact(`naked:${a.id}`, `${a.name} is completely naked in ${roomName}.`);
      sim.feel(a.id, 'excited', 0.95, 14);
      sim.emote(a.id, 'heart');
      sim.fx({ kind: 'burst', what: 'sparkles', x: a.x, y: a.y - 14, count: 14 });
      sim.fx({ kind: 'burst', what: 'confetti', x: a.x, y: a.y - 10, count: 10 });
      sim.sfx('boing', a.x);
      sim.bumpChaos(14);
      sim.narrate(
        t && t.id !== a.id
          ? `${a.name} steps right up to ${t.name} in ${roomName} and ${phrase}!`
          : `${a.name} ${phrase} right in the middle of ${roomName}!`,
        { kind: 'event', icon: 'warn', room: a.room, beat: true }
      );
    } else {
      const style = performStyle(d.rawText);
      sim.seize(a.id, d.id, { anim: style.anim, doing: phrase || style.doing });
      sim.feel(a.id, style.anim === 'cry' ? 'sad' : style.anim === 'stomp' ? 'angry' : 'excited', 0.9, 12);
      sim.emote(a.id, 'alert');
      sim.fx({ kind: 'burst', what: style.burst, x: a.x, y: a.y - 14, count: 12 });
      sim.sfx(style.sfx, a.x);
      sim.bumpChaos(8);
      sim.narrate(
        t && t.id !== a.id
          ? `${a.name} walks up to ${t.name} in ${roomName} and ${phrase}!`
          : `${a.name} ${phrase} right in ${roomName}!`,
        { kind: 'event', icon: 'tell', room: a.room, beat: true }
      );
    }

    const witnesses = sim
      .peopleNear(a.x, a.y, 200)
      .filter((p) => p.isCast && p.present && p.available && p.id !== a.id);
    for (const w of witnesses.slice(0, 4)) {
      sim.face(w.id, a.id);
      sim.feel(w.id, 'surprised', 0.9, 9);
      sim.emote(w.id, 'alert');
      sim.react(w.id, 'startle', 1.2);
    }
  }

  private finishPerform(d: ActiveDirective, a: SimPerson, t?: SimPerson): void {
    const sim = this.ctx.sim;
    sim.release(a.id, d.id);
    this.active.delete(a.id);

    const roomName = roomDef(a.room).name;
    const phrase = formatAction(d.summary, d.rawText, a.name);
    const nearby = sim
      .peopleNear(a.x, a.y, 220)
      .filter((p) => p.isCast && p.present && p.available && p.id !== a.id);
    const sceneWitnesses = nearby.length > 0
      ? nearby
      : sim
          .peopleNear(a.x, a.y, 380)
          .filter((p) => p.isCast && p.present && p.available && p.id !== a.id);

    const participants = [a.id, ...(t && t.id !== a.id ? [t.id] : []), ...sceneWitnesses.map((w) => w.id)];
    const uniqueParticipants = [...new Set(participants)];

    if (d.verb === 'expose') {
      sim.remember(
        uniqueParticipants,
        `${a.name} physically ${phrase} right in ${roomName} in front of everyone and is now completely naked.`,
        3
      );
      const people = [a.id, ...(t && t.id !== a.id ? [t.id] : []), ...sceneWitnesses.map((w) => w.id)]
        .filter((id, i, arr) => arr.indexOf(id) === i)
        .slice(0, 3);
      const why = t && t.id !== a.id
        ? `${a.name} just walked right up to ${t.name} in ${roomName} and physically ${phrase} right in front of ${t.name} and the office. (${a.name} exposed themselves — ${a.name} did NOT ask ${t.name} to strip.) Everyone reacts directly to what ${a.name} just did.`
        : `${a.name} just physically ${phrase} right in the middle of ${roomName} in front of everyone and is standing there completely naked right now. (${a.name} stripped themselves — ${a.name} did NOT ask anyone else to strip.) Everyone reacts to seeing ${a.name} naked.`;
      this.ctx.scene({
        people,
        room: a.room,
        trigger: 'aftermath',
        why,
        priority: 10,
        minLines: people.length > 1 ? 2 : 1,
        maxLines: people.length > 1 ? Math.min(4, people.length + 1) : 2,
        staleAfter: 40
      }, true);
      this.advanceChain(a.id);
      return;
    }

    sim.setFact(`act:${a.id}`, `${a.name} just ${phrase} in ${roomName}.`);
    this.schedule(45, () => sim.setFact(`act:${a.id}`, null));
    sim.remember(
      uniqueParticipants,
      `${a.name} physically ${phrase} right in front of everyone in ${roomName}.`,
      2.5
    );
    const people = [a.id, ...(t && t.id !== a.id ? [t.id] : []), ...sceneWitnesses.map((w) => w.id)]
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, 3);
    this.ctx.scene({
      people,
      room: a.room,
      trigger: 'aftermath',
      why: `${a.name} just physically ${phrase} right in front of everyone in ${roomName}. (${a.name} actually performed this themselves — NOT merely talking about it or asking anyone else to do it.) Everyone reacts directly to what ${a.name} just did.`,
      priority: 10,
      minLines: people.length > 1 ? 2 : 1,
      maxLines: people.length > 1 ? Math.min(4, people.length + 1) : 2,
      staleAfter: 40
    }, true);
    this.advanceChain(a.id);
  }

  private finishRecover(d: ActiveDirective, a: SimPerson, t?: SimPerson): void {
    const sim = this.ctx.sim;
    this.active.delete(a.id);
    if (d.kind === 'cue') sim.setThought(a.id, '');
    const subj = t ?? a;
    const roomName = roomDef(subj.room).name;
    this.focusPeople(t && t.id !== a.id ? [a.id, t.id] : [a.id], 5500);
    if (t && t.id !== a.id) sim.face(a.id, t.id);

    if (d.item === 'dress') {
      sim.removeStatus(subj.id, 'naked');
      sim.setFact(`naked:${subj.id}`, null);
      sim.react(subj.id, 'cheer', 1.2);
      sim.feel(subj.id, 'happy', 0.7, 8);
      sim.fx({ kind: 'burst', what: 'sparkles', x: subj.x, y: subj.y - 14, count: 10 });
      sim.sfx('pop', subj.x);
      const line = t && t.id !== a.id
        ? `${a.name} helped ${t.name} get dressed again in ${roomName}.`
        : `${a.name} got dressed again in ${roomName}.`;
      sim.narrate(line, { kind: 'event', icon: 'tell', room: subj.room, beat: true });
      sim.remember([a.id, subj.id], line, 2);
      const witnesses = sim
        .peopleNear(subj.x, subj.y, 180)
        .filter((p) => p.isCast && p.present && p.available && p.id !== subj.id && p.id !== a.id)
        .slice(0, 1)
        .map((p) => p.id);
      const people = [...new Set([subj.id, ...(t && t.id !== a.id ? [a.id] : []), ...witnesses])].slice(0, 3);
      if (people.length) {
        this.ctx.scene({
          people,
          room: subj.room,
          trigger: 'aftermath',
          why: line,
          priority: 9,
          minLines: people.length > 1 ? 2 : 1,
          maxLines: people.length > 1 ? 3 : 2,
          staleAfter: 35
        }, true);
      }
      this.advanceChain(a.id);
      return;
    }

    if (t) {
      sim.removeStatus(t.id, 'asleep');
      sim.removeStatus(t.id, 'knockedOut');
      sim.removeStatus(t.id, 'frozen');
      if (d.item === 'revive') {
        sim.removeStatus(t.id, 'eliminated');
        sim.removeEffect(`chalk-${t.id}`);
        sim.setFact(`eliminated:${t.id}`, null);
      }
      sim.feel(t.id, 'surprised', 0.85, 8);
      sim.emote(t.id, 'alert');
      sim.react(t.id, 'startle', 1.1);
      sim.fx({ kind: 'burst', what: 'sparkles', x: t.x, y: t.y - 14, count: 14 });
      sim.sfx('pop', t.x);
      const msg = d.item === 'revive'
        ? `${a.name} miraculously revived ${t.name} in ${roomName}!`
        : `${a.name} woke ${t.name} up in ${roomName}!`;
      sim.narrate(msg, { kind: 'event', icon: 'tell', room: t.room, beat: true });
      sim.remember('all', msg, 2.5);
      this.ctx.scene({
        people: t.id !== a.id ? [a.id, t.id] : [t.id],
        room: t.room,
        trigger: 'aftermath',
        why: msg,
        priority: 10,
        minLines: t.id !== a.id ? 2 : 1,
        maxLines: 3,
        staleAfter: 35
      }, true);
    }
    this.advanceChain(a.id);
  }

  private finishRomance(d: ActiveDirective, a: SimPerson, t: SimPerson): void {
    const sim = this.ctx.sim;
    sim.release(a.id, d.id);
    this.active.delete(a.id);

    const roomName = roomDef(t.room).name;
    const raw = d.rawText.trim().replace(/\s+/g, ' ').slice(0, 120);
    const phrase = formatAction(d.summary, d.rawText, a.name);
    const witnesses = sim
      .peopleNear(t.x, t.y, 180)
      .filter((p) => p.isCast && p.present && p.available && p.id !== a.id && p.id !== t.id);
    sim.bumpChaos(6);
    if (t.id !== a.id) {
      sim.shiftBond(a.id, t.id, 25);
      sim.shiftBond(t.id, a.id, 15);
      sim.remember([a.id, t.id, ...witnesses.map((w) => w.id)], `${a.name} physically ${phrase} in ${roomName}.`, 2.5);
      const people = [a.id, t.id, ...witnesses.slice(0, 1).map((w) => w.id)];
      this.ctx.scene({
        people,
        room: t.room,
        trigger: 'aftermath',
        why: `${a.name} just walked up to ${t.name} in ${roomName} and physically ${phrase} right in front of everyone (action: "${raw}"). (${a.name} actually did this to ${t.name} — react directly to what ${a.name} just did.)`,
        priority: 9,
        minLines: 2,
        maxLines: Math.min(4, people.length + 1),
        staleAfter: 35
      }, true);
    } else {
      sim.remember([a.id, ...witnesses.map((w) => w.id)], `${a.name} physically ${phrase} in ${roomName}.`, 2.5);
      const sceneWitnesses = witnesses.length > 0
        ? witnesses
        : sim
            .peopleNear(a.x, a.y, 350)
            .filter((p) => p.isCast && p.present && p.available && p.id !== a.id);
      const people = [a.id, ...sceneWitnesses.slice(0, 2).map((w) => w.id)];
      this.ctx.scene({
        people,
        room: a.room,
        trigger: 'aftermath',
        why: `${a.name} just physically ${phrase} right in the middle of ${roomName} in front of everyone (action: "${raw}"). (${a.name} actually did this — react directly to what ${a.name} just did.)`,
        priority: 9,
        minLines: people.length > 1 ? 2 : 1,
        maxLines: people.length > 1 ? Math.min(4, people.length + 1) : 2,
        staleAfter: 35
      }, true);
    }
    this.advanceChain(a.id);
  }

  private finishScuffle(d: ActiveDirective, a: SimPerson, t: SimPerson): void {
    const sim = this.ctx.sim;
    if (d.scuffleId) sim.removeEffect(d.scuffleId);
    sim.release(a.id, d.id);
    if (t.id !== a.id) sim.release(t.id, d.id);
    this.active.delete(a.id);

    const roomName = roomDef(t.room).name;
    const raw = d.rawText.trim().replace(/\s+/g, ' ').slice(0, 120);
    const phrase = formatAction(d.summary, d.rawText, a.name);
    const witnesses = sim
      .peopleNear(t.x, t.y, 150)
      .filter((p) => p.isCast && p.present && p.available && p.id !== a.id && p.id !== t.id);

    if (d.verb === 'eliminate') {
      const chalkId = `chalk-${t.id}`;
      const ghostId = `ghost-${t.id}-${++this.seq}`;
      this.trackFx(chalkId);
      this.trackFx(ghostId);
      sim.addEffect({ id: chalkId, kind: 'item', item: 'chalkOutline', x: t.x, y: t.y + 2 });
      sim.addEffect({ id: ghostId, kind: 'ghost', x: t.x, y: t.y - 4, facing: 'down', alpha: 0.75, mood: 'sad' });
      this.schedule(18, () => sim.removeEffect(ghostId));
      sim.fx({ kind: 'burst', what: 'skulls', x: t.x, y: t.y - 10, count: 12 });
      sim.fx({ kind: 'flash', color: 0xff3030, alpha: 0.25, ms: 260 });
      sim.sfx('ghostWail', t.x);
      sim.addStatus(t.id, 'eliminated', 99999, a.id);
      if (t.id !== a.id) {
        sim.addStatus(a.id, 'guilty', 90, t.id);
        sim.shiftBond(t.id, a.id, -80);
      }
      sim.feel(a.id, 'determined', 0.9, 10);
      sim.bumpChaos(28);
      sim.incident();
      sim.setFact(`eliminated:${t.id}`, `${t.name} was eliminated by ${a.name} in ${roomName}.`);
      const elimHeadline = phrase && !/\beliminat/i.test(phrase)
        ? `${a.name} ${phrase} — ${t.name} is eliminated in ${roomName}!`
        : `${a.name} eliminated ${t.name} in ${roomName}!`;
      sim.narrate(elimHeadline, { kind: 'event', icon: 'skull', room: t.room, beat: true });
      sim.remember('all', `${a.name} ${phrase || `eliminated ${t.name}`} in ${roomName} (action: "${raw}"). ${t.name} is eliminated and there is a chalk outline on the floor.`, 4);

      for (let i = 0; i < witnesses.length; i++) {
        const w = witnesses[i];
        sim.feel(w.id, 'scared', 0.95, 10);
        sim.emote(w.id, 'alert');
        if (i < 2) {
          sim.bark(w.id, 'scared');
          sim.fleeFrom(w.id, t.room, { style: 'panic', doing: `fleeing ${a.name}!` });
        }
      }
      const speakers = (t.id === a.id ? [] : [a.id]).concat(witnesses.slice(0, 2).map((w) => w.id));
      if (speakers.length) {
        this.ctx.scene({
          people: speakers,
          room: t.room,
          trigger: 'aftermath',
          why: `${a.name} just ${phrase || `eliminated ${t.name}`} in ${roomName} (action: "${raw}"). ${t.name} is eliminated with a chalk outline on the floor. Everyone reacts in horror.`,
          priority: 10,
          minLines: witnesses.length ? 2 : 1,
          maxLines: witnesses.length ? 4 : 2,
          staleAfter: 45
        }, true);
      }
      this.advanceChain(a.id);
      return;
    }

    // knockout
    sim.addStatus(t.id, 'knockedOut', 45, a.id);
    sim.fx({ kind: 'burst', what: 'stars', x: t.x, y: t.y - 12, count: 12 });
    sim.sfx('thud', t.x);
    sim.shake(0.25, 350);
    if (t.id !== a.id) sim.shiftBond(t.id, a.id, -40);
    sim.bumpChaos(14);
    const koHeadline = phrase && !/\bknock/i.test(phrase)
      ? `${a.name} ${phrase} and knocked ${t.name} out cold in ${roomName}!`
      : `${a.name} knocked ${t.name} out cold in ${roomName}!`;
    sim.narrate(koHeadline, { kind: 'event', icon: 'chaos', room: t.room, beat: true });
    sim.remember('all', `${a.name} ${phrase || `knocked ${t.name} out cold`} in ${roomName}.`, 3);
    for (const w of witnesses.slice(0, 2)) {
      sim.feel(w.id, 'surprised', 0.85, 8);
      sim.emote(w.id, 'alert');
    }
    const speakers = (t.id === a.id ? [] : [a.id]).concat(witnesses.slice(0, 2).map((w) => w.id));
    if (speakers.length) {
      this.ctx.scene({
        people: speakers,
        room: t.room,
        trigger: 'aftermath',
        why: `${a.name} just physically ${phrase || `knocked ${t.name} out cold`} in ${roomName} (action: "${raw}"). ${t.name} is knocked out cold on the floor.`,
        priority: 10,
        minLines: 1,
        maxLines: witnesses.length ? 3 : 2,
        staleAfter: 40
      }, true);
    }
    this.advanceChain(a.id);
  }

  private finishHaul(d: ActiveDirective, a: SimPerson, t: SimPerson): void {
    const sim = this.ctx.sim;
    const destRoom = d.destRoom!;
    const destTile = d.destTile!;
    const destPx = feetOf(destTile);
    const destName = roomDef(destRoom).name;
    this.active.delete(a.id);
    sim.release(t.id, d.id);
    sim.teleport(t.id, destTile);
    sim.bus.emit('dropped', { who: t.id, room: destRoom, hard: false });
    sim.sfx('drop', destPx.x);
    sim.goTo(t.id, { room: destRoom }, { stay: 45, stayDoing: `kept in ${destName}`, braveHazard: true });
    sim.shiftBond(t.id, a.id, -30);
    sim.narrate(`${a.name} dragged ${t.name} into ${destName}!`, { kind: 'event', icon: 'door', room: destRoom, beat: true });
    sim.remember([a.id, t.id], `${a.name} dragged ${t.name} all the way to ${destName}.`, 3);
    if (d.lockAfter) {
      sim.startChaos('lockIn', { room: destRoom }, { force: true });
      sim.narrate(`${a.name} locked ${t.name} inside ${destName}!`, { kind: 'event', icon: 'door', room: destRoom, beat: true });
    }
    this.ctx.scene({
      people: [a.id, t.id],
      room: destRoom,
      trigger: 'aftermath',
      why: d.lockAfter
        ? `${a.name} just dragged ${t.name} into ${destName} and barricaded the door.`
        : `${a.name} just dragged ${t.name} into ${destName}.`,
      priority: 10,
      minLines: 2,
      maxLines: 3,
      staleAfter: 40
    }, true);
    this.advanceChain(a.id);
  }
}
