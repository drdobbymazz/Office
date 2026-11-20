// The office, as the game logic sees it.
//
// The floor is the existing Tiled map (assets/maps/office.tmj): 34 x 22 tiles of
// 16 px, drawn top-down. This file reads the same map the renderer draws and
// gives the sim what it needs: which tiles can be walked on, which room a tile
// is in, and the named places people use (desks, cafe seats, the coffee
// machine, the door ...). No Pixi in here, so it runs in tests.
//
//        x: 0         1         2         3
//           0123456789012345678901234567890123
//      y 3  ##.....##..####...#......#.##.####   BOSS (1-6)  MEETING (9-17)  ANNEX (19-24)  ACCOUNTS (26-32)
//        4  ##.D...##.#######.#......#######.#
//        5  #.###.....#######.#.##.####D##D#.#
//        6  #.###..##..####....#######.......#
//        7  #......##.........##D##D##.......#
//        8  #####.#######.#####......#.......#   three short corridors lead down
//        9  #####.#######.#####......#.#######
//       10  #####.#######.#####......#.#######
//       11  #.##..##..##..##..##..####.#######   BULLPEN (1-23)              KITCHEN (24-32)
//       12  ####.###.###.###.###.####.....####
//       13  ##D#.#D#.#D#.#D#.#D#.#D###...v####   desks row A        v = vending machine spot
//       14  #.......................###cc.####   c = cafe seats
//       15  #........................k.##....#   k = coffee machine spot
//       16  #.##..##..##..##..##..###..cc....#
//       17  ####.###.###.###.###.####.#..###.#
//       18  ##D#.#D#.#D#.#D#.#D#.#D##.########   desks row B
//       19  #.......................#.########
//       20  #...............E.......#.......##   E = just inside the front door
//       21  ################.#################   the door itself (16, 21)
//       22+ the pavement outside (added here; not part of the Tiled map)
//
// Positions: a person stands at the bottom-centre of their tile, so
// feet = (tile.x * 16 + 8, tile.y * 16 + 16). World pixels, y grows downward.

import officeMapRaw from '@/assets/maps/office.tmj?raw';
import { findPath as bfs } from '@/scene/office/pathfinding';
import type { AnimId, CastId, Dir, RoomId, TargetRoomId, Tile, Vec } from './types';

export const TILE = 16;

interface RawLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: { name: string; x: number; y: number; width?: number; height?: number }[];
}
interface RawMap {
  width: number;
  height: number;
  layers: RawLayer[];
}

const RAW = JSON.parse(officeMapRaw) as RawMap;

/** Size of the Tiled map in tiles. */
export const MAP_W = RAW.width; // 34
export const MAP_H = RAW.height; // 22
/** Rows of pavement added below the map for "outside". */
export const OUTSIDE_ROWS = 4;
/** Size of the walkable grid in tiles (map + pavement). */
export const GRID_W = MAP_W;
export const GRID_H = MAP_H + OUTSIDE_ROWS;
/** Size of the whole world in pixels (map + pavement). */
export const WORLD_W = GRID_W * TILE; // 544
export const WORLD_H = GRID_H * TILE; // 416
/** Size of just the Tiled map in pixels. */
export const MAP_PX_W = MAP_W * TILE; // 544
export const MAP_PX_H = MAP_H * TILE; // 352

const TILE_ID_MASK = 0x1fffffff;
/** Same rule as TiledMapRenderer: these named spots are walkable even though a chair tile blocks them. */
const WALKABLE_SPAWN_PREFIXES = ['desk-', 'pc-', 'warroom-', 'entrance'];

function buildGrid(): { grid: boolean[][]; spawns: Map<string, Tile> } {
  const grid: boolean[][] = Array.from({ length: GRID_H }, () => Array<boolean>(GRID_W).fill(false));
  const collision = RAW.layers.find((l) => l.name === 'collision' && l.type === 'tilelayer');
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const raw = collision?.data ? collision.data[y * MAP_W + x] : 0;
      grid[y][x] = (raw & TILE_ID_MASK) === 0;
    }
  }
  const spawns = new Map<string, Tile>();
  const layer = RAW.layers.find((l) => l.name === 'spawn-points' && l.type === 'objectgroup');
  for (const o of layer?.objects ?? []) {
    const t = { x: Math.floor(o.x / TILE), y: Math.floor(o.y / TILE) };
    spawns.set(o.name, t);
    if (WALKABLE_SPAWN_PREFIXES.some((p) => o.name.startsWith(p)) && t.y >= 0 && t.y < MAP_H && t.x >= 0 && t.x < MAP_W) {
      grid[t.y][t.x] = true;
    }
  }
  // The pavement: everything below the map is open ground.
  for (let y = MAP_H; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) grid[y][x] = true;
  return { grid, spawns };
}

/** Close off pockets of floor that cannot be reached from the front door (behind desks, in corners). */
function sealUnreachable(grid: boolean[][], from: Tile): void {
  const seen: boolean[][] = Array.from({ length: GRID_H }, () => Array<boolean>(GRID_W).fill(false));
  const queue: Tile[] = [from];
  seen[from.y][from.x] = true;
  while (queue.length) {
    const t = queue.pop() as Tile;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = t.x + dx;
      const y = t.y + dy;
      if (y < 0 || y >= GRID_H || x < 0 || x >= GRID_W || seen[y][x] || !grid[y][x]) continue;
      seen[y][x] = true;
      queue.push({ x, y });
    }
  }
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (!seen[y][x]) grid[y][x] = false;
}

const BUILT = buildGrid();
sealUnreachable(BUILT.grid, BUILT.spawns.get('entrance') ?? { x: 16, y: 20 });
/** GRID[y][x] is true where people can walk. Every walkable tile can be reached from the front door. */
export const GRID: readonly (readonly boolean[])[] = BUILT.grid;
/** Named spawn points from the Tiled map, in tiles. */
export const SPAWNS: ReadonlyMap<string, Tile> = BUILT.spawns;

export function isWalkable(x: number, y: number): boolean {
  return y >= 0 && y < GRID_H && x >= 0 && x < GRID_W && GRID[y][x];
}

const WALKABLE = { width: GRID_W, height: GRID_H, isWalkable };

/** Shortest walkable route (list of tiles after `from`, ending at `to`), [] if already there, null if unreachable. */
export function findPath(from: Tile, to: Tile): Tile[] | null {
  return bfs(WALKABLE, from, to);
}

/** Where someone standing on a tile has their feet, in world pixels. */
export function feetOf(t: Tile): Vec {
  return { x: t.x * TILE + TILE / 2, y: t.y * TILE + TILE };
}

/** The tile under a feet position. */
export function tileAt(px: number, py: number): Tile {
  return { x: Math.floor(px / TILE), y: Math.floor((py - 1) / TILE) };
}

export const sameTile = (a: Tile, b: Tile): boolean => a.x === b.x && a.y === b.y;

/** The walkable tile nearest to a tile (itself if walkable), searching outward. */
export function nearestWalkable(t: Tile, maxRadius = 8): Tile | null {
  if (isWalkable(t.x, t.y)) return t;
  for (let r = 1; r <= maxRadius; r++) {
    let best: Tile | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = t.x + dx;
        const y = t.y + dy;
        if (!isWalkable(x, y)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

// ── Rooms ────────────────────────────────────────────────────────────────────

export interface RoomDef {
  id: RoomId;
  /** Display name, also used in prompts. */
  name: string;
  /** Tile rectangle: x, y is the top-left tile; w, h in tiles. */
  rect: { x: number; y: number; w: number; h: number };
  /** One plain line for prompts and tooltips. */
  blurb: string;
}

export const ROOMS: readonly RoomDef[] = [
  { id: 'boss', name: "Michael's office", rect: { x: 1, y: 3, w: 6, h: 5 }, blurb: "The manager's office in the corner. A big desk and a door he likes to close dramatically." },
  { id: 'meeting', name: 'the conference room', rect: { x: 9, y: 3, w: 9, h: 5 }, blurb: 'A long table with pink chairs. Where every meeting that could have been an email happens.' },
  { id: 'annex', name: 'the annex', rect: { x: 19, y: 3, w: 6, h: 8 }, blurb: 'Two desks tucked between the conference room and accounting.' },
  { id: 'accounts', name: 'the accounting corner', rect: { x: 26, y: 3, w: 7, h: 6 }, blurb: 'Two desks by the windows and the water cooler.' },
  { id: 'bullpen', name: 'the bullpen', rect: { x: 1, y: 11, w: 23, h: 10 }, blurb: 'The open-plan sales floor: two rows of desks and the front door.' },
  { id: 'kitchen', name: 'the break room', rect: { x: 24, y: 11, w: 9, h: 10 }, blurb: 'Coffee machine, vending machine, fridge and a cafe table.' },
  { id: 'outside', name: 'the pavement outside', rect: { x: 0, y: MAP_H, w: GRID_W, h: OUTSIDE_ROWS }, blurb: 'Outside the front door. Where everyone stands during a fire drill.' }
];

const ROOM_BY_ID = new Map<RoomId, RoomDef>(ROOMS.map((r) => [r.id, r]));

export function room(id: RoomId): RoomDef {
  const r = ROOM_BY_ID.get(id);
  if (!r) throw new Error(`unknown room ${id}`);
  return r;
}

/** Which room a tile belongs to. Corridor tiles count as the room they lead down into. */
export function roomAt(t: Tile): RoomId {
  if (t.y >= MAP_H) return 'outside';
  for (const r of ROOMS) {
    const q = r.rect;
    if (t.x >= q.x && t.x < q.x + q.w && t.y >= q.y && t.y < q.y + q.h) return r.id;
  }
  if (t.y >= 8) return t.x >= 24 ? 'kitchen' : 'bullpen';
  if (t.x < 8) return 'boss';
  if (t.x < 18) return 'meeting';
  if (t.x < 25) return 'annex';
  return 'accounts';
}

/** A room's rectangle in world pixels. */
export function roomRectPx(id: RoomId): { x: number; y: number; w: number; h: number } {
  const q = room(id).rect;
  return { x: q.x * TILE, y: q.y * TILE, w: q.w * TILE, h: q.h * TILE };
}

export function roomCentrePx(id: RoomId): Vec {
  const q = roomRectPx(id);
  return { x: q.x + q.w / 2, y: q.y + q.h / 2 };
}

const WALKABLE_BY_ROOM = new Map<RoomId, Tile[]>();
/** Every walkable tile in a room (cached). */
export function walkableTilesIn(id: RoomId): readonly Tile[] {
  let list = WALKABLE_BY_ROOM.get(id);
  if (!list) {
    list = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (GRID[y][x] && roomAt({ x, y }) === id) list.push({ x, y });
      }
    }
    WALKABLE_BY_ROOM.set(id, list);
  }
  return list;
}

/** Which targetable room a world pixel is over, or null (walls and the pavement give null). */
export function targetRoomAtPx(px: number, py: number): TargetRoomId | null {
  const t = { x: Math.floor(px / TILE), y: Math.floor(py / TILE) };
  if (t.y >= MAP_H || t.y < 3 || t.x < 1 || t.x > 32) return null;
  const id = roomAt(t);
  return id === 'outside' ? null : id;
}

// ── Anchors: named places where people sit, stand or pass through ────────────

export type AnchorKind =
  | 'desk'   // someone's own workplace (seated)
  | 'seat'   // any other seat (cafe table, spare desk)
  | 'stand'  // standing at a thing to use it (coffee machine, vending machine ...)
  | 'spot'   // somewhere to loiter or chat
  | 'door'   // just inside the front door
  | 'exit';  // the door itself: step through to leave the building

export interface AnchorDef {
  id: string;
  room: RoomId;
  tile: Tile;
  kind: AnchorKind;
  /** Way to face when there. */
  face: Dir;
  /** Whose desk this is. */
  owner?: CastId;
  /** Animation that fits using it. */
  use?: AnimId;
}

/** Face the adjacent furniture, as the original game does for seats: prefer up, then down, left, right. */
export function faceFurniture(t: Tile): Dir {
  if (!isWalkable(t.x, t.y - 1)) return 'up';
  if (!isWalkable(t.x, t.y + 1)) return 'down';
  if (!isWalkable(t.x - 1, t.y)) return 'left';
  if (!isWalkable(t.x + 1, t.y)) return 'right';
  return 'down';
}

function spawn(name: string, fallback: Tile): Tile {
  return SPAWNS.get(name) ?? fallback;
}

/** Who sits where. Spawn names are the ones already in the Tiled map. */
const DESKS: readonly [CastId, string, Tile][] = [
  ['michael', 'desk-ceo', { x: 3, y: 4 }],
  ['jim', 'pc-1', { x: 2, y: 13 }],
  ['dwight', 'pc-2', { x: 6, y: 13 }],
  ['stanley', 'pc-3', { x: 10, y: 13 }],
  ['phyllis', 'pc-4', { x: 14, y: 13 }],
  ['andy', 'pc-5', { x: 18, y: 13 }],
  ['creed', 'pc-6', { x: 22, y: 13 }],
  ['meredith', 'desk-team-lead', { x: 2, y: 18 }],
  ['kelly', 'desk-backend-engineer', { x: 6, y: 18 }],
  ['ryan', 'desk-product-manager', { x: 10, y: 18 }],
  ['pam', 'desk-data-engineer', { x: 14, y: 18 }],
  ['kevin', 'desk-agent-organizer', { x: 20, y: 7 }],
  ['toby', 'warroom-seat', { x: 23, y: 7 }],
  ['angela', 'desk-chief-architect', { x: 27, y: 5 }],
  ['oscar', 'desk-ui-ux-expert', { x: 30, y: 5 }]
];

function buildAnchors(): AnchorDef[] {
  const out: AnchorDef[] = [];
  const add = (id: string, tile: Tile, kind: AnchorKind, face: Dir, extra: Partial<AnchorDef> = {}): void => {
    out.push({ id, room: roomAt(tile), tile, kind, face, ...extra });
  };

  for (const [owner, name, fallback] of DESKS) {
    const t = spawn(name, fallback);
    add(`desk.${owner}`, t, 'desk', faceFurniture(t), { owner, use: 'type' });
  }
  // Two spare desks in the second row (visitors, snooping, naps).
  add('seat.spare1', spawn('desk-project-manager', { x: 18, y: 18 }), 'seat', 'up', { use: 'type' });
  add('seat.spare2', spawn('desk-market-researcher', { x: 22, y: 18 }), 'seat', 'up', { use: 'type' });

  // The break room.
  const cafe: [string, Tile][] = [
    ['seat.cafe1', spawn('cafe-seat-1', { x: 27, y: 14 })],
    ['seat.cafe2', spawn('cafe-seat-2', { x: 27, y: 16 })],
    ['seat.cafe3', spawn('cafe-seat-3', { x: 28, y: 14 })],
    ['seat.cafe4', spawn('cafe-seat-4', { x: 28, y: 16 })]
  ];
  for (const [id, t] of cafe) add(id, t, 'seat', faceFurniture(t), { use: 'eat' });
  const coffee = spawn('cafe-stand-coffee', { x: 25, y: 15 });
  add('stand.coffee', coffee, 'stand', faceFurniture(coffee), { use: 'operate' });
  const vending = spawn('cafe-stand-vending', { x: 29, y: 13 });
  add('stand.vending', vending, 'stand', 'right', { use: 'operate' });
  add('stand.counter', { x: 27, y: 17 }, 'stand', 'down', { use: 'operate' });
  add('stand.fridge', { x: 28, y: 17 }, 'stand', 'down', { use: 'operate' });
  add('spot.kitchen1', { x: 26, y: 12 }, 'spot', 'down');
  add('spot.kitchen2', { x: 30, y: 15 }, 'spot', 'left');
  add('spot.kitchen3', { x: 31, y: 16 }, 'spot', 'left');
  add('spot.kitchen4', { x: 26, y: 16 }, 'spot', 'right');

  // The accounting corner and the water cooler.
  add('stand.cooler', { x: 32, y: 4 }, 'stand', 'up', { use: 'drink' });
  add('spot.accounts1', { x: 28, y: 7 }, 'spot', 'up');
  add('spot.accounts2', { x: 30, y: 7 }, 'spot', 'up');
  add('spot.accounts3', { x: 26, y: 7 }, 'spot', 'right');
  add('spot.accounts4', { x: 32, y: 7 }, 'spot', 'left');

  // The annex.
  add('spot.annex1', { x: 20, y: 9 }, 'spot', 'up');
  add('spot.annex2', { x: 23, y: 9 }, 'spot', 'up');
  add('spot.annex3', { x: 21, y: 10 }, 'spot', 'down');
  add('spot.annex4', { x: 22, y: 9 }, 'spot', 'left');

  // Michael's office: in front of his desk.
  add('spot.boss1', { x: 3, y: 7 }, 'spot', 'up');
  add('spot.boss2', { x: 5, y: 7 }, 'spot', 'up');
  add('spot.boss3', { x: 5, y: 4 }, 'spot', 'left');
  add('spot.boss4', { x: 1, y: 7 }, 'spot', 'right');

  // The conference room: along the near side of the table, and at its ends.
  for (let i = 0; i < 7; i++) add(`spot.meet${i + 1}`, { x: 10 + i, y: 7 }, 'spot', 'up');
  add('spot.meet8', { x: 9, y: 5 }, 'spot', 'right');
  add('spot.meet9', { x: 17, y: 5 }, 'spot', 'left');
  add('spot.meet10', { x: 9, y: 4 }, 'spot', 'right');
  add('spot.meet11', { x: 17, y: 4 }, 'spot', 'left');
  add('spot.meet12', { x: 9, y: 7 }, 'spot', 'right');
  add('spot.meet13', { x: 17, y: 7 }, 'spot', 'left');
  add('spot.meet14', { x: 16, y: 3 }, 'spot', 'down');
  add('spot.meet15', { x: 10, y: 3 }, 'spot', 'down');
  /** Where whoever is running the meeting stands. */
  add('spot.meetHead', { x: 9, y: 6 }, 'spot', 'right');

  // The bullpen: the aisles between the desk rows.
  const aisle: Tile[] = [
    { x: 4, y: 14 }, { x: 8, y: 15 }, { x: 12, y: 14 }, { x: 16, y: 15 }, { x: 20, y: 14 },
    { x: 3, y: 19 }, { x: 8, y: 20 }, { x: 12, y: 19 }, { x: 19, y: 20 }, { x: 22, y: 19 },
    { x: 16, y: 14 }, { x: 4, y: 15 }
  ];
  aisle.forEach((t, i) => add(`spot.bullpen${i + 1}`, t, 'spot', 'down'));

  // The front door.
  const entrance = spawn('entrance', { x: 16, y: 20 });
  add('door.entrance', entrance, 'door', 'up');
  add('exit.door', { x: entrance.x, y: MAP_H - 1 }, 'exit', 'down');

  // The pavement: a line-up for fire drills, and where people come from and go to.
  for (let i = 0; i < 16; i++) {
    add(`spot.outside${i + 1}`, { x: 9 + (i % 8) * 2, y: MAP_H + 1 + Math.floor(i / 8) }, 'spot', 'up');
  }
  add('exit.street', { x: 2, y: MAP_H + 2 }, 'exit', 'left');

  return out.filter((a) => isWalkable(a.tile.x, a.tile.y));
}

export const ANCHORS: readonly AnchorDef[] = buildAnchors();
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

/** A cast member's own desk. */
export function deskOf(owner: CastId): AnchorDef {
  return anchor(`desk.${owner}`);
}

/**
 * The monitor on each person's desk, in world pixels (centre of the screen),
 * for effects that touch screens (blackout, "no signal").
 */
export function monitorPx(owner: CastId): Vec {
  const a = deskOf(owner);
  const dy = a.face === 'down' ? 1 : -1;
  return { x: a.tile.x * TILE + TILE / 2, y: (a.tile.y + dy) * TILE + TILE / 2 };
}

/** Fixed things events are staged around, as tiles. */
export const LANDMARKS = {
  frontDoor: { x: 16, y: 21 } as Tile,
  vendingMachine: { x: 31, y: 13 } as Tile,
  coffeeMachine: { x: 25, y: 14 } as Tile,
  fridge: { x: 28, y: 18 } as Tile,
  waterCooler: { x: 32, y: 3 } as Tile,
  conferenceTable: { x: 13, y: 5 } as Tile,
  /** The gap people walk through to get into the conference room (for "locked in"). */
  meetingDoor: { x: 13, y: 8 } as Tile,
  /** The second way into the conference room, from Michael's office. */
  meetingSideDoor: { x: 8, y: 5 } as Tile,
  bossDoor: { x: 5, y: 8 } as Tile
} as const;
