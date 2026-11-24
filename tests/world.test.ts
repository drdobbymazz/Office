import { describe, expect, it } from 'vitest';
import { ANCHORS, GRID_H, GRID_W, PARK_ROOMS, anchor, deskOf, findPath, isWalkable, roomAt, roomsFor, setWorldLocation, walkableTilesIn } from '@/game/core/world';
import { CAST_IDS, TARGET_ROOMS } from '@/game/core/types';
import { CAST, BOND_SEEDS } from '@/game/core/cast';
import { CHAOS } from '@/game/core/chaos';

describe('the office map', () => {
  it('has the expected size and a walkable front door', () => {
    expect(GRID_W).toBe(34);
    expect(GRID_H).toBe(26);
    expect(isWalkable(16, 20)).toBe(true);
    expect(isWalkable(16, 21)).toBe(true);
    expect(isWalkable(0, 0)).toBe(false);
  });

  it('gives every cast member a desk', () => {
    for (const id of CAST_IDS) {
      const d = deskOf(id);
      expect(isWalkable(d.tile.x, d.tile.y), `${id}'s desk`).toBe(true);
      expect(CAST[id].name.length).toBeGreaterThan(0);
    }
  });

  it('has every listed anchor on a walkable tile, reachable from the front door', () => {
    const door = anchor('door.entrance').tile;
    const expected = ['stand.coffee', 'stand.vending', 'stand.counter', 'stand.fridge', 'stand.cooler', 'seat.cafe1', 'seat.cafe4', 'spot.meetHead', 'spot.boss1', 'exit.door', 'exit.street', 'spot.outside16'];
    for (const id of expected) expect(ANCHORS.some((a) => a.id === id), id).toBe(true);
    for (const a of ANCHORS) {
      expect(isWalkable(a.tile.x, a.tile.y), a.id).toBe(true);
      const path = findPath(door, a.tile);
      expect(path, `path to ${a.id}`).not.toBeNull();
    }
  });

  it('has walkable tiles in every targetable room and maps them back', () => {
    for (const r of TARGET_ROOMS) {
      const tiles = walkableTilesIn(r);
      expect(tiles.length, r).toBeGreaterThan(5);
      for (const t of tiles) expect(roomAt(t)).toBe(r);
    }
  });

  it('has consistent cast and chaos data', () => {
    for (const [a, b] of BOND_SEEDS) {
      expect(CAST[a]).toBeTruthy();
      expect(CAST[b]).toBeTruthy();
    }
    for (const c of Object.values(CAST)) for (const h of c.haunts) expect(ANCHORS.some((a) => a.id === h), `${c.id} haunt ${h}`).toBe(true);
    expect(Object.keys(CHAOS).length).toBe(34);
  });

  it('supports Scranton Community Park zones with all anchors reachable', () => {
    setWorldLocation('park');
    try {
      expect(roomsFor('park')).toEqual(PARK_ROOMS);
      expect(PARK_ROOMS.length).toBe(7);
      const gate = anchor('door.entrance').tile;
      for (const r of TARGET_ROOMS) {
        const tiles = walkableTilesIn(r);
        expect(tiles.length, `park room ${r}`).toBeGreaterThan(5);
        for (const t of tiles) expect(roomAt(t)).toBe(r);
      }
      for (const a of ANCHORS) {
        expect(isWalkable(a.tile.x, a.tile.y), `park ${a.id}`).toBe(true);
        expect(findPath(gate, a.tile), `park path to ${a.id}`).not.toBeNull();
      }
    } finally {
      setWorldLocation('office');
    }
  });
});
