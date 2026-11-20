// The world the brain writes for, passed in as data. The brain never imports
// the game's cast or rooms: the same code works for any office and any staff.

import { firstName, normName } from './names';

export interface BrainPersona {
  id: string;
  name: string;
  role: string;
  summary: string;
  speech: string;
  wants: string;
  fears: string;
  quirk: string;
  secret: string;
  examples: string[];
  /** Optional 0..1: calm in a crisis. When absent it is guessed from the text above. */
  nerve?: number;
  /** Optional: problems they deal with ('fire', 'flood', 'power', 'wifi', 'machine', 'door', 'pest'). Guessed from the role when absent. */
  fixes?: string[];
}

export interface BrainWorld {
  /** One short paragraph: where this is, who these people are, the unseen force. */
  setting: string;
  people: BrainPersona[];
  rooms: { id: string; name: string }[];
}

/** Groups of words that mean the same kind of room, for free text ("the kitchen" vs "the Break Room"). */
const ROOM_SYNONYMS: readonly string[][] = [
  ['kitchen', 'break', 'breakroom', 'canteen', 'coffee', 'fridge', 'microwave', 'pantry'],
  ['meeting', 'boardroom', 'conference'],
  ['server', 'servers', 'it', 'racks'],
  ['boss', 'director', 'manager', 'ceo'],
  ['lobby', 'reception', 'entrance', 'foyer'],
  ['copy', 'printer', 'photocopier', 'print', 'supply', 'closet'],
  ['roof', 'terrace', 'rooftop'],
  ['toilet', 'loo', 'bathroom', 'restroom', 'toilets'],
  ['street', 'pavement', 'outside', 'car', 'carpark', 'parking']
];

/**
 * Lookups over a BrainWorld: names to ids, room words to room ids, and a few
 * rough traits read from the persona text (how brave, what they fix) for the
 * no-model brain.
 */
export class WorldIndex {
  readonly roomIds: string[];
  private byId = new Map<string, BrainPersona>();

  constructor(readonly world: BrainWorld) {
    for (const p of world.people) this.byId.set(p.id, p);
    this.roomIds = world.rooms.map((r) => r.id);
  }

  person(id: string): BrainPersona | undefined {
    return this.byId.get(id);
  }

  /** First name for any id (falls back to the id itself, tidied). */
  nameOf(id: string): string {
    const p = this.byId.get(id);
    return p ? firstName(p.name) : firstName(id.replace(/^[a-z]+:/i, ''));
  }

  /** Find a person by any spelling of their name. */
  idForName(raw: string): string | null {
    const n = normName(raw);
    if (!n) return null;
    for (const p of this.world.people) {
      if (normName(p.name) === n || normName(firstName(p.name)) === n || normName(p.id) === n) return p.id;
    }
    return null;
  }

  roomName(id: string): string {
    return this.world.rooms.find((r) => r.id === id)?.name ?? id;
  }

  /** "the Break Room", "kitchen", "Break room" -> the room id, or null. */
  resolveRoom(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const n = normName(raw);
    if (!n) return null;
    for (const r of this.world.rooms) {
      if (normName(r.id) === n || normName(r.name) === n || normName(r.name.replace(/^the\s+/i, '')) === n) return r.id;
    }
    return null;
  }

  /** The room a piece of free text names, if any. */
  roomInText(text: string, among?: readonly string[]): string | null {
    const words = new Set(text.toLowerCase().split(/[^a-z]+/).filter(Boolean));
    const rooms = this.world.rooms.filter((r) => !among || among.includes(r.id));
    const lower = text.toLowerCase();
    // Direct: the room's own name or id.
    for (const r of rooms) {
      const name = r.name.toLowerCase().replace(/^the\s+/, '');
      if (name && lower.includes(name)) return r.id;
      if (words.has(r.id.toLowerCase())) return r.id;
    }
    // Synonyms: "kitchen" finds a room called "the Break Room".
    for (const group of ROOM_SYNONYMS) {
      if (!group.some((w) => words.has(w))) continue;
      for (const r of rooms) {
        const rw = `${r.id} ${r.name}`.toLowerCase().split(/[^a-z]+/);
        if (rw.some((w) => group.includes(w))) return r.id;
      }
    }
    return null;
  }

  private text(id: string): string {
    const p = this.byId.get(id);
    return p ? `${p.role} ${p.summary} ${p.speech} ${p.quirk}`.toLowerCase() : '';
  }

  /** 0..1: how calmly they meet a crisis, read from their description. */
  nerve(id: string): number {
    const given = this.byId.get(id)?.nerve;
    if (typeof given === 'number' && Number.isFinite(given)) return Math.max(0, Math.min(1, given));
    const t = this.text(id);
    if (!t) return 0.5;
    let v = 0.5;
    if (/anxious|nervous|panic|timid|scared|jumpy|paranoid|worrier|fussy|terrified|fears/.test(t)) v -= 0.3;
    if (/stoic|calm|icy|unflappable|fearless|deadpan|nothing surprises|tough|brave|cool/.test(t)) v += 0.35;
    return Math.max(0, Math.min(1, v));
  }

  /** Does their job make them the one who deals with this kind of problem? */
  canFix(id: string, skill: 'fire' | 'flood' | 'power' | 'wifi' | 'machine' | 'door' | 'pest'): boolean {
    const given = this.byId.get(id)?.fixes;
    if (Array.isArray(given)) return given.includes(skill);
    const t = this.text(id);
    if (!t) return false;
    if (/caretaker|janitor|maintenance|handyman|facilities|fixes everything/.test(t)) return skill !== 'wifi';
    if (/\bit\b|tech|computer|network|server|engineer/.test(t)) return skill === 'power' || skill === 'wifi' || skill === 'machine';
    if (/security|guard|fire marshal|safety/.test(t)) return skill === 'fire' || skill === 'pest';
    return false;
  }
}
