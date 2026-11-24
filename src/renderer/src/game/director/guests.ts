// What the Anything power leaves on the floor, and for how long.
//
//   character  someone who can talk (Superman): a real person on the floor who
//              walks up to people, speaks in scenes, and leaves by the front door
//   creature   an animal or monster (a horse): wanders the office, goes up to
//              people, who react
//   thing      an object (a statue): stays where it appeared
//   happening  weather, a smell, a mood: an effect in the room
//
// While it is here a fact stays true, so every conversation can mention it.
// Typing an event can also set off one of the real powers (a dragon starts a
// fire), and people who saw it make plans about it. When it goes, the people
// it met talk it over.

import type { CustomKind, CustomVibe, GuestColour, GuestLookWords, InterpretResult } from '@/game/brain/api';
import type { DirectorSimApi, SceneAsk, SimPerson } from '@/game/core/simApi';
import type { CharId, Dir, EmotionId, Plan, TargetRoomId, Vec } from '@/game/core/types';
import { TARGET_ROOMS, formatClock, isCastId } from '@/game/core/types';
import { anchor, feetOf, findPath, room as roomDef, roomAt, roomCentrePx, tileAt, walkableTilesIn } from '@/game/core/world';
import { registerVisitor } from '@/game/core/cast';
import type { GuestLook } from '@/game/core/cast';
import type { AnimId } from '@/game/core/types';
import type { EmoteIcon } from '@/game/view/api';
import type { Species } from '@/scene/office/fx/sprites';

function speciesFor(text: string, name: string, emoji: string): Species | null {
  const s = `${text} ${name} ${emoji}`.toLowerCase();
  if (/\b(bears?|grizzl\w*|pandas?|cubs?|polar)\b/.test(s) || emoji === '🐻' || emoji === '🐼') return 'bear';
  if (/\b(horses?|pon(?:y|ies)|unicorns?|stallion|mustang)\b/.test(s) || emoji === '🐴' || emoji === '🦄') return 'horse';
  if (/\b(dragons?|wyverns?|drakes?)\b/.test(s) || emoji === '🐉') return 'dragon';
  if (/\b(cats?|kittens?|kitty|tabby|lions?|tigers?|panther)\b/.test(s) || emoji === '🐱' || emoji === '🐯' || emoji === '🦁') return 'cat';
  if (/\b(t-?rex|dinosaurs?|dinos?|raptors?|godzilla)\b/.test(s) || emoji === '🦖' || emoji === '🦕') return 'dino';
  if (/\b(robots?|androids?|cyborgs?|bots?|mechs?)\b/.test(s) || emoji === '🤖') return 'robot';
  if (/\b(aliens?|martians?|et|extraterrestrial)\b/.test(s) || emoji === '👽' || emoji === '👾') return 'alien';
  if (/\b(sharks?|jaws)\b/.test(s) || emoji === '🦈') return 'shark';
  if (/\b(raccoons?|trash\s+panda)\b/.test(s) || emoji === '🦝') return 'raccoon';
  if (/\b(dogs?|pupp(?:y|ies)|hounds?|corgi|golden)\b/.test(s) || emoji === '🐶' || emoji === '🐕') return 'puppy';
  if (/\b(pigeons?|birds?|seagulls?|doves?|ducks?|owls?|hawks?|eagles?)\b/.test(s) || emoji === '🐦' || emoji === '🕊️' || emoji === '🦆') return 'pigeon';
  return null;
}

export interface GuestContext {
  sim: DirectorSimApi;
  /** Queue a scene. fromPlayer: the player's own action, which any brain may write. */
  scene(ask: SceneAsk, fromPlayer: boolean): void;
  /** The model writes slowly: fewer, longer gaps between scenes. */
  slow(): boolean;
}

interface Guest {
  key: string;
  kind: CustomKind;
  /** On the floor and in the log: "Superman", "The Horse", or the title for a thing. */
  name: string;
  /** What the player typed. */
  text: string;
  fact: string;
  title: string;
  vibe: CustomVibe;
  intensity: 1 | 2 | 3;
  room: TargetRoomId;
  /** Clock minutes when it appeared. */
  since: number;
  leaveAt: number;
  leaving: boolean;
  leftAt: number;
  /** A character: its visitor id in the sim. */
  who: CharId | null;
  /** The emoji: a badge over a character's head, the body of a creature or thing. */
  emojiKey: string | null;
  species: Species | null;
  facing: Dir;
  lookKey: string | null;
  /** A cloud or a downpour is a moment, not the whole visit. */
  lookUntil: number;
  /** A creature's or thing's position, and a creature's route. */
  x: number;
  y: number;
  path: Vec[];
  pauseUntil: number;
  goingTo: CharId | null;
  /** People it has gone up to, and who saw it arrive. */
  met: Set<CharId>;
  nextVisitAt: number;
  visiting: CharId | null;
  visitAt: number;
  /** A real power it sets off, a moment after it appears. */
  power: InterpretResult['power'];
  powerAt: number;
}

const RGB: Record<GuestColour, [number, number, number]> = {
  black: [44, 42, 52], white: [236, 236, 230], grey: [138, 140, 150], silver: [190, 194, 206], red: [198, 52, 48],
  orange: [226, 128, 48], yellow: [230, 200, 66], gold: [212, 168, 58], green: [70, 148, 80], blue: [52, 96, 196],
  navy: [36, 48, 96], purple: [118, 72, 160], pink: [226, 130, 172], brown: [118, 78, 48], blonde: [222, 190, 112]
};
const STYLE: Record<GuestLookWords['style'], GuestLook['style']> = {
  suit: 'suit', shirt: 'dressshirt', polo: 'polo', sweater: 'sweater', cardigan: 'cardigan', blouse: 'blouse'
};
const HAIR_STYLES: GuestLook['hairStyle'][] = ['styleShort', 'styleFloppy', 'styleSpiky', 'styleCurly', 'styleMessy', 'styleFrame'];

const FEEL: Record<CustomVibe, EmotionId> = {
  scary: 'scared', funny: 'amused', gross: 'disgusted', wonderful: 'excited', weird: 'confused',
  annoying: 'angry', dangerous: 'scared', romantic: 'love', sad: 'sad'
};
const MOOD: Record<CustomVibe, number> = {
  scary: -0.15, funny: 0.15, gross: -0.12, wonderful: 0.25, weird: 0, annoying: -0.12, dangerous: -0.2, romantic: 0.15, sad: -0.2
};
/** How someone reacts when a creature comes right up to them. */
const MEET: Record<CustomVibe, { anim: AnimId; emote: EmoteIcon }> = {
  scary: { anim: 'cower', emote: 'sweat' }, dangerous: { anim: 'cower', emote: 'alert' }, funny: { anim: 'laugh', emote: 'music' },
  wonderful: { anim: 'cheer', emote: 'heart' }, romantic: { anim: 'wave', emote: 'heart' }, weird: { anim: 'think', emote: 'question' },
  gross: { anim: 'shake', emote: 'anger' }, annoying: { anim: 'facepalm', emote: 'anger' }, sad: { anim: 'cry', emote: 'tear' }
};

let seq = 0;

/** The shimmer shown while the model works out what was typed. */
export interface Brewing {
  key: string;
  room: TargetRoomId;
  tile: { x: number; y: number };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function sentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  if (!t) return '';
  const body = t.charAt(0).toUpperCase() + t.slice(1);
  return /[!?]$/.test(body) ? body : `${body}.`;
}

export class Guests {
  private list: Guest[] = [];

  constructor(private readonly ctx: GuestContext) {}

  get count(): number {
    return this.list.length;
  }

  /**
   * The moment the player sends it, before the model has worked out what it is:
   * a shimmer where it will most likely appear, so a slow model reads as a build-up.
   */
  brew(text: string): Brewing {
    const sim = this.ctx.sim;
    const t = text.toLowerCase();
    const named = TARGET_ROOMS.find((id) => {
      const n = roomDef(id).name.toLowerCase().replace(/^the\s+/, '');
      return t.includes(n) || (id === 'kitchen' && /\bkitchen\b/.test(t)) || (id === 'meeting' && /\bconference\b/.test(t)) || (id === 'boss' && /\bmichael'?s office\b/.test(t));
    });
    const room = named ?? this.busiestRoom();
    const tiles = walkableTilesIn(room);
    const tile = tiles.length ? tiles[Math.floor(sim.rng() * tiles.length)] : tileAt(roomCentrePx(room).x, roomCentrePx(room).y);
    const spot = feetOf(tile);
    const key = `brew-${(seq += 1)}`;
    sim.addEffect({ id: key, kind: 'cloud', what: 'magic', x: spot.x, y: spot.y - 10, radius: 18 });
    sim.sfx('sparkle', spot.x);
    for (const p of sim.peopleNear(spot.x, spot.y, 90).filter((o) => o.isCast && o.available).slice(0, 3)) {
      sim.face(p.id, spot);
      sim.emote(p.id, 'question');
    }
    return { key, room, tile };
  }

  /** The player typed something and the brain worked out what it is: put it on the floor. */
  stage(text: string, res: InterpretResult, brewing?: Brewing): void {
    const sim = this.ctx.sim;
    const rng = sim.rng;
    if (brewing) sim.removeEffect(brewing.key);
    const everywhere = res.room === 'everywhere' || !(TARGET_ROOMS as readonly string[]).includes(res.room);
    const room = (everywhere ? (brewing?.room ?? this.busiestRoom()) : res.room) as TargetRoomId;
    const tiles = walkableTilesIn(room);
    // It comes out of the shimmer if the model put it in the room we guessed.
    const tile = brewing && brewing.room === room ? brewing.tile
      : tiles.length ? tiles[Math.floor(rng() * tiles.length)] : tileAt(roomCentrePx(room).x, roomCentrePx(room).y);
    const spot = feetOf(tile);
    const now = sim.time;
    const key = `guest-${(seq += 1)}`;
    const kind: CustomKind = res.kind;
    const name = (res.name || '').trim() || (kind === 'character' ? 'The Visitor' : kind === 'creature' ? `The ${res.title.split(' ')[0] || 'Creature'}` : res.title || 'It');
    const fact = sentence(res.fact || text);
    // How long it stays (seconds of game time; a 10-minute day is 600).
    const stay = { character: 150, creature: 110, thing: 170, happening: 45 }[kind] + res.intensity * { character: 40, creature: 30, thing: 50, happening: 15 }[kind];

    const g: Guest = {
      key, kind, name, text, fact, title: res.title || name, vibe: res.vibe, intensity: res.intensity, room,
      since: sim.clock, leaveAt: now + stay, leaving: false, leftAt: 0, who: null, emojiKey: null, species: null, facing: 'right', lookKey: null,
      lookUntil: now + 30 + res.intensity * 8, x: spot.x, y: spot.y, path: [], pauseUntil: now + 3, goingTo: null, met: new Set(),
      nextVisitAt: now + (this.ctx.slow() ? 40 : 28), visiting: null, visitAt: 0,
      power: res.power, powerAt: res.power !== 'none' ? now + 1.6 : Infinity
    };
    this.list.push(g);

    sim.narrate(fact, { kind: 'event', icon: 'anything', room });
    sim.setFact(key, fact);
    sim.bumpChaos(6 + res.intensity * 6);
    sim.remember(everywhere ? 'all' : room, fact, 2);
    sim.bus.emit('focus', { x: spot.x - 60, y: spot.y - 56, w: 120, h: 96, weight: 0.85, holdMs: 6000 });

    // What it looks like.
    sim.fx({ kind: 'poof', x: spot.x, y: spot.y - 8 });
    const species = kind !== 'character' && kind !== 'happening' ? speciesFor(text, name, res.emoji) : null;
    if (kind === 'character') {
      g.who = this.spawnCharacter(g, res, tile);
      if (res.emoji) {
        g.emojiKey = `${key}-badge`;
        sim.addEffect({ id: g.emojiKey, kind: 'emoji', emoji: res.emoji, x: spot.x, y: spot.y, size: 10, bob: true, lift: 33 });
      }
    } else if (species) {
      g.emojiKey = key;
      g.species = species;
      sim.addEffect({ id: key, kind: 'creature', species, x: spot.x, y: spot.y, facing: 'right', anim: 'idle', carrying: false });
    } else if (res.emoji) {
      g.emojiKey = key;
      const size = kind === 'creature' ? 18 + res.intensity * 4 : 16 + res.intensity * 5;
      sim.addEffect({ id: key, kind: 'emoji', emoji: res.emoji, x: spot.x, y: spot.y, size, bob: kind === 'creature' || res.moves });
    }
    g.lookKey = this.addLook(g, res.look, spot);

    // Who saw it. Two or three of them stay to speak in the first scene (chosen before
    // anyone is sent anywhere); two more make plans; the rest react.
    const witnesses = (everywhere ? sim.people() : sim.peopleIn(room)).filter((p) => p.present && p.available && p.isCast);
    const calm = witnesses.filter((p) => !p.urgent).sort(() => rng() - 0.5);
    const speakers = calm.slice(0, g.who ? 2 : 3).map((p) => p.id);
    const planners = calm.slice(speakers.length, speakers.length + 2);
    for (const p of witnesses) {
      g.met.add(p.id);
      sim.bumpMood(p.id, MOOD[res.vibe]);
      if (speakers.includes(p.id)) {
        // Rooted to the spot: they are about to say something about it.
        sim.face(p.id, spot);
        sim.feel(p.id, FEEL[res.vibe], 0.85, 10);
        sim.react(p.id, 'startle', 0.8);
      } else this.react(p, res, spot, room);
    }

    // The first scene: the guest speaks, if it can, with the people who saw it.
    const people = g.who ? [g.who, ...speakers] : speakers;
    if (people.length) {
      this.ctx.scene({
        people,
        room,
        trigger: 'custom',
        why: g.who ? `${fact} ${name} has just appeared in front of them and speaks first.` : fact,
        priority: 9,
        minLines: Math.min(3, people.length + 1),
        maxLines: 4,
        staleAfter: 45
      }, true);
    }

    // Some of the others decide to do something about it.
    this.planAround(g, planners, res.reaction);
  }

  /** Every frame (dt in game seconds). */
  update(dt: number): void {
    const sim = this.ctx.sim;
    const now = sim.time;
    for (const g of [...this.list]) {
      if (g.lookKey && now >= g.lookUntil) {
        sim.removeEffect(g.lookKey);
        g.lookKey = null;
      }
      if (now >= g.powerAt) {
        g.powerAt = Infinity;
        const reason = sim.startChaos(g.power as Parameters<DirectorSimApi['startChaos']>[0], { room: g.room }, { force: true });
        if (reason) console.info(`[guests] ${g.name} could not set off ${g.power}: ${reason}`);
      }
      if (g.kind === 'character') this.updateCharacter(g, now);
      else if (g.kind === 'creature' || g.species) this.updateCreature(g, now, dt);
      else if (now >= g.leaveAt) this.depart(g, true);
    }
  }

  /** A new day, or the game closing: everything goes, quietly. */
  clear(): void {
    for (const g of [...this.list]) this.depart(g, false);
    this.list.length = 0;
  }

  // ── characters ─────────────────────────────────────────────────────────────

  private spawnCharacter(g: Guest, res: InterpretResult, tile: { x: number; y: number }): CharId {
    const sim = this.ctx.sim;
    const id = `visitor:${g.key}`;
    const h = hash(g.name.toLowerCase());
    const w = res.guest;
    const look: GuestLook = {
      skin: w.skin,
      hair: RGB[w.hair],
      outfit: RGB[w.outfit],
      trim: RGB[w.trim === w.outfit ? (w.outfit === 'white' ? 'grey' : 'white') : w.trim],
      style: STYLE[w.style],
      hairStyle: /\bbald\b/i.test(g.text) ? 'styleBald' : w.hair === 'white' || w.hair === 'grey' ? 'styleRecede' : HAIR_STYLES[h % HAIR_STYLES.length]
    };
    const [r, gr, b] = look.outfit;
    registerVisitor({
      id,
      name: g.name,
      role: g.title,
      color: (r << 16) | (gr << 8) | b,
      voice: { pitch: 110 + (h % 190), wave: (['triangle', 'square', 'sawtooth'] as const)[(h >>> 8) % 3], spread: 0.8 + ((h >>> 12) % 10) / 10, speed: 0.9 + ((h >>> 16) % 4) / 10 },
      summary: `${g.name}, who appeared when this happened: "${g.text}". ${g.fact}`,
      look
    });
    sim.spawnVisitor(id, { tile });
    sim.feel(id, FEEL[g.vibe] === 'scared' ? 'smug' : g.vibe === 'sad' ? 'sad' : 'happy', 0.7, 30);
    return id;
  }

  private updateCharacter(g: Guest, now: number): void {
    const sim = this.ctx.sim;
    const me = g.who ? sim.person(g.who) : null;
    if (!me || !me.present) {
      // Gone on the way out (through the door): still a proper goodbye.
      if (!g.leaving) console.info(`[guests] ${g.name} vanished from the floor`);
      this.depart(g, g.leaving);
      return;
    }
    if (g.emojiKey) sim.patchEffect(g.emojiKey, { x: me.x, y: me.y });
    g.x = me.x;
    g.y = me.y;

    if (g.leaving) {
      // Out of the door, or given up on after half a minute (held up, stuck).
      if (now - g.leftAt > 30) this.depart(g, true);
      return;
    }
    if (now >= g.leaveAt && me.available && !me.sceneId) {
      g.leaving = true;
      g.leftAt = now;
      sim.goTo(g.who!, { anchor: 'exit.street' }, { doing: 'leaving', braveHazard: true, then: () => this.depart(g, true) });
      return;
    }

    // Going up to people, one at a time.
    if (g.visiting) {
      if (now - g.visitAt > 25) {
        g.visiting = null;
        g.nextVisitAt = now + 5;
      }
      return;
    }
    if (now < g.nextVisitAt || !me.available || me.sceneId || me.speaking) return;
    const target = this.nextPerson(g, me);
    if (!target) {
      g.nextVisitAt = now + 10;
      return;
    }
    g.visiting = target.id;
    g.visitAt = now;
    const who = g.who!;
    sim.goTo(who, { near: target.id }, {
      doing: `going over to ${target.name}`,
      stay: 14,
      stayDoing: `talking to ${target.name}`,
      braveHazard: true,
      then: () => this.visit(g, target.id)
    });
  }

  private visit(g: Guest, id: CharId): void {
    const sim = this.ctx.sim;
    const now = sim.time;
    if (g.visiting !== id || g.leaving) return;
    g.visiting = null;
    g.met.add(id);
    g.nextVisitAt = now + (this.ctx.slow() ? 42 : 30) + sim.rng() * 15;
    const t = sim.person(id);
    const me = g.who ? sim.person(g.who) : null;
    if (!t || !me || !t.present) return;
    sim.face(id, g.who!);
    sim.face(g.who!, id);
    sim.feel(id, FEEL[g.vibe], 0.7, 8);
    const third = sim
      .peopleNear(t.x, t.y, 48)
      .filter((o) => o.isCast && o.id !== id && o.present && o.available && !o.urgent)
      .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
    const people = [g.who!, id, ...(third && sim.rng() < 0.5 ? [third.id] : [])];
    this.ctx.scene({
      people,
      room: roomAt(t.tile),
      trigger: 'custom',
      why: `${g.name} has been in the office since ${formatClock(g.since)} (it started with: "${g.text}"). Now ${g.name} comes up to ${t.name}.`,
      priority: 7,
      minLines: 2,
      maxLines: people.length > 2 ? 4 : 3,
      staleAfter: 30
    }, false);
  }

  /** Someone it has not met yet, not too far away, not busy. */
  private nextPerson(g: Guest, me: SimPerson): SimPerson | null {
    const sim = this.ctx.sim;
    const free = sim.people().filter((p) => p.isCast && p.present && p.available && !p.urgent && !p.sceneId && p.id !== g.who);
    if (!free.length) return null;
    let fresh = free.filter((p) => !g.met.has(p.id) || sim.rng() < 0.15);
    if (!fresh.length) fresh = free;
    const near = fresh.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y)).slice(0, 4);
    return near[Math.floor(sim.rng() * near.length)] ?? null;
  }

  // ── creatures ──────────────────────────────────────────────────────────────

  private updateCreature(g: Guest, now: number, dt: number): void {
    const sim = this.ctx.sim;
    if (g.path.length) {
      const speed = 26 + g.intensity * 7;
      let step = speed * dt;
      while (step > 0 && g.path.length) {
        const n = g.path[0];
        const dx = n.x - g.x;
        const dy = n.y - g.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          g.facing = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
        }
        if (d <= step) {
          g.x = n.x;
          g.y = n.y;
          g.path.shift();
          step -= d;
        } else {
          g.x += (dx / d) * step;
          g.y += (dy / d) * step;
          step = 0;
        }
      }
      if (g.emojiKey) {
        sim.patchEffect(
          g.emojiKey,
          g.species
            ? { x: g.x, y: g.y, facing: g.facing, anim: g.path.length ? 'run' : 'idle' }
            : { x: g.x, y: g.y }
        );
      }
      if (g.path.length) return;
      // Arrived.
      if (g.leaving) {
        this.depart(g, true);
        return;
      }
      if (g.goingTo) this.meet(g, g.goingTo);
      g.goingTo = null;
      g.pauseUntil = now + 3 + sim.rng() * 3;
      return;
    }
    if (g.leaving) {
      if (now - g.leftAt > 30) this.depart(g, true);
      return;
    }
    if (now >= g.leaveAt) {
      g.leaving = true;
      g.leftAt = now;
      if (!this.walkTo(g, anchor('exit.street').tile)) this.depart(g, true);
      return;
    }
    if (now < g.pauseUntil) return;
    // Up to someone, or a wander about.
    const people = sim.people().filter((p) => p.isCast && p.present && !p.urgent);
    const target = sim.rng() < 0.6 && people.length ? people[Math.floor(sim.rng() * people.length)] : null;
    let ok = false;
    if (target) {
      g.goingTo = target.id;
      ok = this.walkTo(g, target.tile);
    } else {
      const here = roomAt(tileAt(g.x, g.y));
      const tiles = walkableTilesIn(here === 'outside' ? g.room : here);
      if (tiles.length) ok = this.walkTo(g, tiles[Math.floor(sim.rng() * tiles.length)]);
    }
    if (!ok) {
      g.goingTo = null;
      g.pauseUntil = now + 2;
    }
  }

  private walkTo(g: Guest, to: { x: number; y: number }): boolean {
    const path = findPath(tileAt(g.x, g.y), to);
    if (!path || !path.length) return false;
    g.path = path.map((t) => feetOf(t));
    return true;
  }

  /** A creature has come right up to someone. */
  private meet(g: Guest, id: CharId): void {
    const sim = this.ctx.sim;
    const p = sim.person(id);
    if (!p || !p.present || !p.available) return;
    g.met.add(id);
    const how = MEET[g.vibe];
    sim.face(id, { x: g.x, y: g.y });
    sim.emote(id, how.emote);
    sim.react(id, how.anim, 2);
    sim.feel(id, FEEL[g.vibe], 0.8, 6);
    if (g.vibe === 'scary' || g.vibe === 'dangerous') sim.fleeFrom(id, roomAt(p.tile), { doing: `getting away from ${g.name.toLowerCase()}`, stay: 8 });
    else if (sim.rng() < 0.4 && !p.speaking) {
      this.ctx.scene({
        people: [id],
        room: roomAt(p.tile),
        trigger: 'event',
        why: `${g.name} (it started with: "${g.text}") has just come right up to ${p.name}. ${p.name} says something to it.`,
        priority: 4,
        minLines: 1,
        maxLines: 1,
        staleAfter: 10,
        gather: false
      }, false);
    }
  }

  // ── everyone else ──────────────────────────────────────────────────────────

  private react(p: SimPerson, res: InterpretResult, spot: Vec, room: TargetRoomId): void {
    const sim = this.ctx.sim;
    sim.face(p.id, spot);
    switch (res.reaction) {
      case 'flee': sim.feel(p.id, 'scared', 0.8, 8); sim.fleeFrom(p.id, room); break;
      case 'cower': sim.feel(p.id, 'scared', 0.7, 6); sim.react(p.id, 'cower', 3); break;
      case 'freeze': sim.feel(p.id, 'surprised', 0.8, 5); sim.react(p.id, 'startle', 1.2); break;
      case 'cheer': sim.feel(p.id, 'excited', 0.8, 6); sim.react(p.id, 'cheer', 2.2); break;
      case 'dance': sim.feel(p.id, 'happy', 0.7, 6); sim.react(p.id, 'dance', 4); break;
      case 'laugh': sim.feel(p.id, 'amused', 0.8, 5); sim.react(p.id, 'laugh', 2); break;
      case 'argue': sim.feel(p.id, 'angry', 0.6, 6); sim.react(p.id, 'stomp', 1.2); break;
      case 'gather':
      case 'investigate':
        sim.feel(p.id, 'surprised', 0.6, 5);
        sim.goTo(p.id, { tile: tileAt(spot.x, spot.y) }, { doing: `going to look at ${res.title.toLowerCase()}`, stay: 10 });
        break;
      default: sim.react(p.id, 'startle', 0.6); break;
    }
  }

  /** Two of the people who saw it make a plan about it: go and talk to it, have it out, tell someone, hide. */
  private planAround(g: Guest, people: SimPerson[], reaction: InterpretResult['reaction']): void {
    const sim = this.ctx.sim;
    if (reaction === 'flee') return; // they are already running
    const about = g.name.toLowerCase().startsWith('the ') ? g.name.toLowerCase() : g.name;
    const scared = g.vibe === 'scary' || g.vibe === 'dangerous';
    const free = people.filter((p) => p.present && !p.plan).slice(0, 2);
    const elsewhere = sim.people().filter((o) => o.isCast && o.present && roomAt(o.tile) !== g.room);
    free.forEach((p, i) => {
      let plan: Plan | null = null;
      if (g.who && !scared && i === 0) {
        const kind: Plan['kind'] = g.vibe === 'romantic' ? 'flirt' : g.vibe === 'annoying' || g.vibe === 'gross' ? 'confront' : 'talk';
        plan = { kind, target: g.who, about: `meeting ${about}` };
      } else if (scared && i === 0) {
        plan = { kind: 'hide', target: null, about: `hiding from ${about}` };
      } else {
        const listener = elsewhere[Math.floor(sim.rng() * elsewhere.length)];
        if (listener && listener.id !== p.id) plan = { kind: 'gossip', target: listener.id, about: `${about} in ${roomDef(g.room).name}` };
      }
      if (plan) sim.setPlan(p.id, plan);
    });
  }

  private addLook(g: Guest, look: InterpretResult['look'], spot: Vec): string | null {
    const sim = this.ctx.sim;
    const id = `${g.key}-look`;
    const room = g.room;
    switch (look) {
      case 'shake': sim.shake(0.25 * g.intensity, 900); return null;
      case 'flash': sim.fx({ kind: 'flash', color: 0xffffff, alpha: 0.6, ms: 260 }); return null;
      case 'hearts': sim.fx({ kind: 'burst', what: 'hearts', x: spot.x, y: spot.y - 16, count: 14 }); return null;
      case 'sparkles': sim.addEffect({ id, kind: 'cloud', what: 'magic', x: spot.x, y: spot.y - 10, radius: 26 }); break;
      case 'smoke': sim.addEffect({ id, kind: 'smoke', room, density: 0.25 * g.intensity }); break;
      case 'confetti': sim.addEffect({ id, kind: 'rain', room, what: 'confetti', rate: 0.5 }); break;
      case 'darken': sim.addEffect({ id, kind: 'dark', rooms: [room], level: 0.25 * g.intensity, emergency: false }); break;
      case 'drip': sim.addEffect({ id, kind: 'sprinklers', room }); break;
      case 'stink': sim.addEffect({ id, kind: 'cloud', what: 'stink', x: spot.x, y: spot.y - 8, radius: 30 }); break;
      case 'gloom': sim.addEffect({ id, kind: 'cloud', what: 'gloom', x: spot.x, y: spot.y - 8, radius: 34 }); break;
      case 'cash': sim.addEffect({ id, kind: 'rain', room, what: 'cash', rate: 0.5 }); break;
      case 'paper': sim.addEffect({ id, kind: 'rain', room, what: 'paper', rate: 0.5 }); break;
      default: return null;
    }
    return id;
  }

  /** It goes. loud: say so, and let the people it met talk it over. */
  private depart(g: Guest, loud: boolean): void {
    const sim = this.ctx.sim;
    const i = this.list.indexOf(g);
    if (i < 0) return;
    this.list.splice(i, 1);
    if (g.emojiKey) sim.removeEffect(g.emojiKey);
    if (g.lookKey) sim.removeEffect(g.lookKey);
    sim.setFact(g.key, null);
    if (g.who) {
      const me = sim.person(g.who);
      if (me) {
        sim.fx({ kind: 'poof', x: me.x, y: me.y - 8 });
        sim.removeVisitor(g.who);
      }
    } else if (g.emojiKey) sim.fx({ kind: 'poof', x: g.x, y: g.y - 8 });
    if (!loud) return;
    const line = g.kind === 'character' ? `${g.name} has left the office.` : g.kind === 'creature' ? `${g.name} has gone.` : `${g.title}: over.`;
    sim.narrate(line, { kind: 'event', icon: 'anything', room: g.room });
    if (g.kind === 'happening') return;
    // The people who met it talk it over.
    const pool = [...g.met].filter((id) => isCastId(id) && sim.person(id)?.present && sim.person(id)?.available);
    const pair = pool.sort(() => sim.rng() - 0.5).slice(0, 2);
    if (pair.length) {
      this.ctx.scene({
        people: pair,
        trigger: 'aftermath',
        why: `${g.name} has just gone (it started with: "${g.text}"). They talk about what happened while it was here.`,
        priority: 5,
        minLines: 2,
        maxLines: 3,
        staleAfter: 40
      }, false);
    }
  }

  private busiestRoom(): TargetRoomId {
    let best: TargetRoomId = 'bullpen';
    let n = -1;
    for (const id of TARGET_ROOMS) {
      const c = this.ctx.sim.peopleIn(id).filter((p) => p.present).length;
      if (c > n) {
        n = c;
        best = id;
      }
    }
    return best;
  }
}
