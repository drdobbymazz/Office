// The building: a wide two-storey office with a roof terrace, seen as a cutaway
// from the front (like a doll's house). Landscape-first: the whole building
// fits a phone held sideways.
//
// Coordinates are "world units". x grows to the right, y grows DOWNWARD
// (screen convention), and each floor has a walking baseline: the y of
// people's feet. Ground floor baseline is y = 0, so everything above ground
// has negative y.
//
//        x: -300        0        400       800  920      1320      1720
//                       |         |         |    |         |         |
//  y=-600 ── roof ──────┬─────────────────[lift]────────────────────┬──
//                       │  BOSS   │ MEETING │hall│ KITCHEN │ SERVER  │
//  y=-300 ── floor 1 ───┼─────────┼─────────┼────┼─────────┼─────────┤
//          street       │  LOBBY  │  SALES  │hall│   OPS   │  COPY   │
//  y=0 ──── floor 0 ────┴─────────┴─────────┴────┴─────────┴─────────┴──
//
// This file is the single source of truth for geometry. The sim walks people
// along it, the renderer draws furniture at the anchors, and the camera frames
// rooms from it. If you need a new spot, add an anchor here.

import type { AnimId, CastId, Facing, FloorIndex, RoomId, Vec } from './types';

// ── Dimensions ───────────────────────────────────────────────────────────────

/** Floor-to-floor distance. */
export const FLOOR_H = 300;
/** Clear height inside a room (floor to ceiling). */
export const ROOM_H = 268;
/** Thickness of the slab between floors (FLOOR_H - ROOM_H). */
export const SLAB = 32;
/** Thickness of the outer walls. */
export const WALL = 24;
export const ROOM_W = 400;
export const HALL_W = 120;
/** Interior runs from x = 0 to x = BUILDING_W. */
export const BUILDING_W = 4 * ROOM_W + HALL_W; // 1720

/** Feet baseline (y) for floor 0, floor 1, roof. */
export const FLOOR_Y: readonly [number, number, number] = [0, -FLOOR_H, -2 * FLOOR_H];

/** Nominal height of a standing adult at CharacterLook.height = 1. */
export const CHAR_H = 150;
/**
 * Height of a seat surface above the floor. Equal to the rig's hip height, so a
 * seated person's torso and head stay where they are when standing; only the
 * legs fold. Draw every chair, sofa and stool with its seat at this height.
 */
export const SEAT_H = 44;
/** Height of a desk / table top above the floor. */
export const DESK_H = 62;
/** Height of a kitchen counter top above the floor. */
export const COUNTER_H = 72;
/** Height of an interior door opening. */
export const DOOR_H = 190;
/** Lift doorway: centred on the lift x, this wide and tall. */
export const LIFT_DOOR_W = 84;
export const LIFT_DOOR_H = 196;

/** How far the pavement extends left of the front door. */
export const STREET_W = 300;

/** Everything worth showing: building, roof sky, pavement, the alley on the right. */
export const WORLD_BOUNDS = { x0: -460, x1: BUILDING_W + 440, y0: -940, y1: 80 } as const;
/** The building itself with a little margin: the default camera framing. */
export const BUILDING_BOUNDS = { x0: -WALL - 40, x1: BUILDING_W + WALL + 40, y0: -2 * FLOOR_H - 215, y1: 46 } as const;

export function floorY(floor: FloorIndex | number): number {
  return FLOOR_Y[Math.max(0, Math.min(2, Math.round(floor))) as FloorIndex];
}

/** Walkable x range for each floor (feet stay inside this). */
export const FLOOR_RANGE: readonly [readonly [number, number], readonly [number, number], readonly [number, number]] = [
  [-STREET_W, BUILDING_W - 22],
  [22, BUILDING_W - 22],
  [30, BUILDING_W - 30]
];

export function clampToFloor(floor: FloorIndex, x: number): number {
  const [lo, hi] = FLOOR_RANGE[floor];
  return x < lo ? lo : x > hi ? hi : x;
}

// ── Rooms ────────────────────────────────────────────────────────────────────

export interface RoomDef {
  id: RoomId;
  /** Display name, also used in prompts. British English. */
  name: string;
  floor: FloorIndex;
  x0: number;
  x1: number;
  /** One plain line for prompts and tooltips. */
  blurb: string;
}

export const ROOMS: readonly RoomDef[] = [
  { id: 'street', name: 'the pavement outside', floor: 0, x0: -STREET_W, x1: 0, blurb: 'The pavement by the front door. Bus stop, lamp post, fresh air.' },
  { id: 'lobby', name: 'the Lobby', floor: 0, x0: 0, x1: 400, blurb: 'Reception. Bea\'s desk, a sofa, the "days without incident" board.' },
  { id: 'sales', name: 'the Sales Floor', floor: 0, x0: 400, x1: 800, blurb: 'Three desks, a leaderboard and a gong that Marcus rings too often.' },
  { id: 'hall0', name: 'the ground floor lift hall', floor: 0, x0: 800, x1: 920, blurb: 'The lift doors and a fire extinguisher.' },
  { id: 'ops', name: 'the Ops Floor', floor: 0, x0: 920, x1: 1320, blurb: 'Accounts, design and HR share three desks and one water cooler.' },
  { id: 'copy', name: 'the Copy Room', floor: 0, x0: 1320, x1: 1720, blurb: 'The big printer, supply shelves, Oleg\'s corner and the supply closet.' },
  { id: 'boss', name: "the Boss's Office", floor: 1, x0: 0, x1: 400, blurb: 'Diane\'s office. Big desk, trophies, a putting mat.' },
  { id: 'meeting', name: 'the Meeting Room', floor: 1, x0: 400, x1: 800, blurb: 'A long table, four chairs, a whiteboard nobody wipes.' },
  { id: 'hall1', name: 'the first floor lift hall', floor: 1, x0: 800, x1: 920, blurb: 'The lift doors upstairs.' },
  { id: 'kitchen', name: 'the Break Room', floor: 1, x0: 920, x1: 1320, blurb: 'Coffee machine, microwave, fridge, vending machine and the loo door.' },
  { id: 'server', name: 'the Server Room', floor: 1, x0: 1320, x1: 1720, blurb: 'Gus\'s lair. Humming racks, the breaker panel and a corkboard of red string.' },
  { id: 'roof', name: 'the Roof', floor: 2, x0: 0, x1: BUILDING_W, blurb: 'A terrace with deck chairs on one side and aerials and pigeons on the other.' },
  { id: 'lift', name: 'the lift', floor: 0, x0: 800, x1: 920, blurb: 'Inside the lift car.' }
];

const ROOM_BY_ID = new Map<RoomId, RoomDef>(ROOMS.map((r) => [r.id, r]));

export function room(id: RoomId): RoomDef {
  const r = ROOM_BY_ID.get(id);
  if (!r) throw new Error(`unknown room ${id}`);
  return r;
}

/** Which room a point on a floor is in. */
export function roomAt(floor: FloorIndex, x: number): RoomId {
  if (floor === 2) return 'roof';
  if (floor === 0) {
    if (x < 0) return 'street';
    if (x < 400) return 'lobby';
    if (x < 800) return 'sales';
    if (x < 920) return 'hall0';
    if (x < 1320) return 'ops';
    return 'copy';
  }
  if (x < 400) return 'boss';
  if (x < 800) return 'meeting';
  if (x < 920) return 'hall1';
  if (x < 1320) return 'kitchen';
  return 'server';
}

/** World-space rectangle of a room's interior (for camera framing, highlights, FX). */
export function roomRect(id: RoomId): { x: number; y: number; w: number; h: number } {
  const r = room(id);
  const base = floorY(r.floor);
  if (id === 'roof') return { x: r.x0, y: base - 230, w: r.x1 - r.x0, h: 230 };
  return { x: r.x0, y: base - ROOM_H, w: r.x1 - r.x0, h: ROOM_H };
}

export function roomCentre(id: RoomId): Vec {
  const q = roomRect(id);
  return { x: q.x + q.w / 2, y: q.y + q.h / 2 };
}

// ── Anchors: named places where people stand, sit, or pass through ───────────

export type AnchorKind =
  | 'desk'    // a person's own workplace; they sit BEHIND the desk front (legs hidden)
  | 'seat'    // any other seat (sofa, deck chair, meeting chair, stool)
  | 'stand'   // standing at a thing to use it (coffee machine, printer ...)
  | 'spot'    // somewhere to loiter or chat
  | 'door'    // the front door (lobby <-> street)
  | 'hide'    // a door you vanish behind for a while (the loo, the supply closet)
  | 'stairs'  // stairwell door
  | 'lift'    // lift doorway
  | 'exit';   // walk off the edge of the world (going home)

export interface AnchorDef {
  id: string;
  room: RoomId;
  floor: FloorIndex;
  x: number;
  kind: AnchorKind;
  /** Whose desk / seat this is. */
  owner?: CastId;
  /** Way to face when using it. Omitted = face the viewer (either way is fine). */
  face?: Facing;
  /** Animation that fits using it. */
  use?: AnimId;
  /** The prop this anchor operates (see PROP_STATES). */
  prop?: string;
  /**
   * true  = the person is drawn BEHIND the furniture's front panel (desk, long table).
   * false = drawn in front of the back wall furniture, fully visible.
   */
  behind?: boolean;
}

const A = (
  id: string, room: RoomId, floor: FloorIndex, x: number, kind: AnchorKind, extra: Partial<AnchorDef> = {}
): AnchorDef => ({ id, room, floor, x, kind, ...extra });

export const ANCHORS: readonly AnchorDef[] = [
  // ── street (floor 0, outside, left of the front door) ──
  A('exit.left', 'street', 0, -STREET_W, 'exit'),
  A('spot.busStop', 'street', 0, -215, 'spot'),
  A('spot.assembly1', 'street', 0, -70, 'spot'),
  A('spot.assembly2', 'street', 0, -105, 'spot'),
  A('spot.assembly3', 'street', 0, -140, 'spot'),
  A('spot.assembly4', 'street', 0, -175, 'spot'),
  A('spot.assembly5', 'street', 0, -210, 'spot'),
  A('spot.assembly6', 'street', 0, -245, 'spot'),
  A('spot.assembly7', 'street', 0, -88, 'spot'),
  A('spot.assembly8', 'street', 0, -122, 'spot'),
  A('spot.assembly9', 'street', 0, -158, 'spot'),
  A('spot.assembly10', 'street', 0, -192, 'spot'),

  // ── lobby ──
  A('door.entrance', 'lobby', 0, 8, 'door'),
  A('spot.lobbyPlant', 'lobby', 0, 44, 'spot'),
  A('seat.sofa1', 'lobby', 0, 92, 'seat'),
  A('seat.sofa2', 'lobby', 0, 142, 'seat'),
  A('spot.reception', 'lobby', 0, 186, 'spot', { face: 1 }),
  A('desk.bea', 'lobby', 0, 256, 'desk', { owner: 'bea', use: 'type', behind: true, prop: 'monitor.bea' }),
  A('spot.lobbySign', 'lobby', 0, 318, 'spot'),
  A('stairs.L0', 'lobby', 0, 366, 'stairs'),

  // ── sales floor ──
  A('desk.marcus', 'sales', 0, 468, 'desk', { owner: 'marcus', use: 'type', behind: true, prop: 'monitor.marcus' }),
  A('spot.gong', 'sales', 0, 533, 'stand', { use: 'operate', prop: 'gong' }),
  A('desk.rosa', 'sales', 0, 598, 'desk', { owner: 'rosa', use: 'type', behind: true, prop: 'monitor.rosa' }),
  A('spot.salesBoard', 'sales', 0, 663, 'spot'),
  A('desk.tobi', 'sales', 0, 728, 'desk', { owner: 'tobi', use: 'type', behind: true, prop: 'monitor.tobi' }),

  // ── ground floor lift hall ──
  A('spot.hall0', 'hall0', 0, 826, 'spot'),
  A('lift.0', 'hall0', 0, 860, 'lift'),
  A('spot.extinguisher', 'hall0', 0, 900, 'stand', { use: 'operate' }),

  // ── ops floor ──
  A('spot.watercooler', 'ops', 0, 952, 'stand', { use: 'drink', prop: 'watercooler' }),
  A('desk.priya', 'ops', 0, 1035, 'desk', { owner: 'priya', use: 'type', behind: true, prop: 'monitor.priya' }),
  A('desk.lena', 'ops', 0, 1150, 'desk', { owner: 'lena', use: 'type', behind: true, prop: 'monitor.lena' }),
  A('desk.nigel', 'ops', 0, 1262, 'desk', { owner: 'nigel', use: 'type', behind: true, prop: 'monitor.nigel' }),
  A('spot.opsMid', 'ops', 0, 1093, 'spot'),
  A('spot.opsRight', 'ops', 0, 1206, 'spot'),

  // ── copy room ──
  A('spot.printer', 'copy', 0, 1400, 'stand', { use: 'operate', prop: 'printer' }),
  A('spot.shelves', 'copy', 0, 1492, 'stand', { use: 'operate' }),
  A('desk.oleg', 'copy', 0, 1566, 'seat', { owner: 'oleg', use: 'drink' }),
  A('door.closet', 'copy', 0, 1632, 'hide'),
  A('stairs.R0', 'copy', 0, 1690, 'stairs'),

  // ── boss's office ──
  A('spot.putting', 'boss', 1, 62, 'stand', { use: 'operate', face: -1 }),
  A('seat.bossGuest', 'boss', 1, 124, 'seat', { face: 1 }),
  A('desk.diane', 'boss', 1, 236, 'desk', { owner: 'diane', use: 'type', behind: true, prop: 'monitor.diane' }),
  A('spot.trophies', 'boss', 1, 318, 'spot'),
  A('stairs.L1', 'boss', 1, 366, 'stairs'),

  // ── meeting room ──
  A('spot.whiteboard', 'meeting', 1, 432, 'stand', { use: 'write', face: 1, prop: 'whiteboard' }),
  A('seat.meet1', 'meeting', 1, 498, 'seat', { behind: true }),
  A('seat.meet2', 'meeting', 1, 566, 'seat', { behind: true }),
  A('seat.meet3', 'meeting', 1, 634, 'seat', { behind: true }),
  A('seat.meet4', 'meeting', 1, 702, 'seat', { behind: true }),
  A('spot.meetStand1', 'meeting', 1, 462, 'spot'),
  A('spot.meetStand2', 'meeting', 1, 748, 'spot'),
  A('spot.meetStand3', 'meeting', 1, 778, 'spot'),
  A('spot.meetStand4', 'meeting', 1, 532, 'spot'),
  A('spot.meetStand5', 'meeting', 1, 668, 'spot'),

  // ── first floor lift hall ──
  A('spot.hall1', 'hall1', 1, 826, 'spot'),
  A('lift.1', 'hall1', 1, 860, 'lift'),
  A('spot.hall1b', 'hall1', 1, 898, 'spot'),

  // ── break room ──
  A('door.wc', 'kitchen', 1, 956, 'hide'),
  A('spot.coffee', 'kitchen', 1, 1034, 'stand', { use: 'operate', prop: 'coffee' }),
  A('spot.microwave', 'kitchen', 1, 1104, 'stand', { use: 'operate', prop: 'microwave' }),
  A('spot.breakChat', 'kitchen', 1, 1160, 'spot'),
  A('spot.fridge', 'kitchen', 1, 1218, 'stand', { use: 'operate', prop: 'fridge' }),
  A('spot.vending', 'kitchen', 1, 1282, 'stand', { use: 'operate', prop: 'vending' }),
  A('spot.breakLeft', 'kitchen', 1, 996, 'spot'),
  A('spot.breakMid', 'kitchen', 1, 1068, 'spot'),

  // ── server room ──
  A('spot.racks', 'server', 1, 1400, 'stand', { use: 'operate', prop: 'servers' }),
  A('spot.breaker', 'server', 1, 1494, 'stand', { use: 'operate', prop: 'breaker' }),
  A('desk.gus', 'server', 1, 1588, 'desk', { owner: 'gus', use: 'type', behind: true, prop: 'monitor.gus' }),
  A('spot.corkboard', 'server', 1, 1648, 'spot'),
  A('stairs.R1', 'server', 1, 1690, 'stairs'),

  // ── roof ──
  A('spot.roofEdge', 'roof', 2, 58, 'spot', { face: -1 }),
  A('seat.deck1', 'roof', 2, 190, 'seat'),
  A('seat.deck2', 'roof', 2, 282, 'seat'),
  A('spot.roofGarden', 'roof', 2, 392, 'spot'),
  A('spot.roofMid', 'roof', 2, 650, 'spot'),
  A('lift.2', 'roof', 2, 860, 'lift'),
  A('spot.roofMid2', 'roof', 2, 1010, 'spot'),
  A('spot.ac', 'roof', 2, 1130, 'spot'),
  A('spot.antenna', 'roof', 2, 1318, 'stand', { use: 'operate' }),
  A('spot.pigeons', 'roof', 2, 1540, 'spot'),
  A('stairs.R2', 'roof', 2, 1690, 'stairs')
];

const ANCHOR_BY_ID = new Map<string, AnchorDef>(ANCHORS.map((a) => [a.id, a]));

export function anchor(id: string): AnchorDef {
  const a = ANCHOR_BY_ID.get(id);
  if (!a) throw new Error(`unknown anchor ${id}`);
  return a;
}

export function findAnchor(id: string): AnchorDef | undefined {
  return ANCHOR_BY_ID.get(id);
}

export function anchorsIn(roomId: RoomId): AnchorDef[] {
  return ANCHORS.filter((a) => a.room === roomId);
}

export function anchorPos(id: string): Vec {
  const a = anchor(id);
  return { x: a.x, y: floorY(a.floor) };
}

/** A cast member's own desk / home seat. */
export function homeAnchor(owner: CastId): AnchorDef {
  const a = ANCHORS.find((q) => q.owner === owner);
  if (!a) throw new Error(`no home anchor for ${owner}`);
  return a;
}

// ── Ways between floors ──────────────────────────────────────────────────────

export interface ConnectorDef {
  id: 'lift' | 'stairsL' | 'stairsR';
  kind: 'lift' | 'stairs';
  x: number;
  /** Floors served, and the anchor at each. */
  stops: Partial<Record<FloorIndex, string>>;
}

export const CONNECTORS: readonly ConnectorDef[] = [
  { id: 'lift', kind: 'lift', x: 860, stops: { 0: 'lift.0', 1: 'lift.1', 2: 'lift.2' } },
  { id: 'stairsL', kind: 'stairs', x: 366, stops: { 0: 'stairs.L0', 1: 'stairs.L1' } },
  { id: 'stairsR', kind: 'stairs', x: 1690, stops: { 0: 'stairs.R0', 1: 'stairs.R1', 2: 'stairs.R2' } }
];

export const LIFT_X = 860;

// ── Props with state (the sim sets these; the building draws them) ───────────

/**
 * Every prop whose look changes at runtime, and the states it can be in.
 * EnvState.props maps prop id -> state. Anything missing uses the first state.
 * Each desk also has a monitor prop: "monitor.<castId>" using MONITOR_STATES.
 */
export const PROP_STATES = {
  printer: ['idle', 'printing', 'jam', 'rampage', 'dead'],
  coffee: ['idle', 'brewing', 'empty'],
  microwave: ['idle', 'on', 'burnt'],
  fridge: ['closed', 'open'],
  vending: ['idle', 'vend', 'stuck'],
  watercooler: ['idle', 'glug'],
  breaker: ['on', 'off'],
  servers: ['ok', 'hot', 'down'],
  gong: ['idle', 'rung'],
  whiteboard: ['chart', 'blank', 'doodle'],
  pa: ['idle', 'live'],
  blinds: ['open', 'closed']
} as const;

export const MONITOR_STATES = ['work', 'off', 'nosignal', 'error', 'slack'] as const;
export type MonitorState = (typeof MONITOR_STATES)[number];
export const MONITOR_OWNERS: readonly CastId[] = ['bea', 'marcus', 'rosa', 'tobi', 'priya', 'lena', 'nigel', 'diane', 'gus'];
