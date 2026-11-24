// Pixel-art scenery for Scranton Community Park (Episode 2: Day in the Park).
// Uses the exact 16px tile grid and zone rectangles as world.ts (`PARK_GRID`):
// Gazebo (boss, 1..6 x 3..7), Picnic Pavilion (meeting, 9..17 x 3..7), Duck Pond
// (annex, 19..24 x 3..10), Quiet Grove (accounts, 26..32 x 3..8), Great Lawn
// (bullpen, 1..23 x 11..20), BBQ & Snack Stand (kitchen, 24..32 x 11..20),
// and the Park Gate / Car Park (outside, y >= 22).

import { Container, Graphics } from 'pixi.js';
import { MAP_PX_H, MAP_PX_W, TILE, WORLD_H } from '@/game/core/world';

export interface ParkMapVisuals {
  ground: Container;
  canopy: Container;
  update(dt: number): void;
}

const T = (x: number, y: number) => ({ x: x * TILE, y: y * TILE });

export function createParkMap(): ParkMapVisuals {
  const ground = new Container();
  const canopy = new Container();
  const g = new Graphics();
  const c = new Graphics();
  const anim = new Graphics();

  // ── Outer park meadow & grass variation ──────────────────────────────────
  g.rect(-240, -180, MAP_PX_W + 480, WORLD_H + 340).fill(0x558a44);
  for (let gx = -208; gx < MAP_PX_W + 208; gx += 32) {
    for (let gy = -144; gy < MAP_PX_H + 16; gy += 32) {
      const hash = Math.abs((gx * 13 + gy * 7) / 16) % 7;
      if (hash < 2) g.rect(gx + 4, gy + 4, 22, 14).fill(0x4d7e3d);
      else if (hash === 3) g.rect(gx + 6, gy + 6, 16, 12).fill(0x61994e);
    }
  }
  // Sunny open Great Lawn highlight & small wildflowers.
  g.rect(1 * TILE, 11 * TILE, 23 * TILE, 10 * TILE).fill(0x639c4f);
  for (let i = 0; i < 42; i++) {
    const fx = 24 + ((i * 73) % (MAP_PX_W - 48));
    const fy = 56 + ((i * 101) % (MAP_PX_H - 72));
    // Skip paths, pond water, gazebo & pavilion interior.
    if (fy > 60 && fy < 120 && fx > 300 && fx < 390) continue;
    g.rect(fx, fy, 2, 2).fill(i % 3 === 0 ? 0xf7e36d : i % 3 === 1 ? 0xffffff : 0xf49ec4);
  }

  // ── Warm gravel park pathways connecting gate & all zones ────────────────
  const path = (x: number, y: number, w: number, h: number) => {
    g.rect(x - 1, y - 1, w + 2, h + 2).fill(0xb09f7a);
    g.rect(x, y, w, h).fill(0xd6c79c);
    for (let px = x + 4; px < x + w - 4; px += 12) {
      for (let py = y + 4; py < y + h - 4; py += 12) {
        if (((px + py) % 24) === 0) g.rect(px, py, 3, 2).fill(0xc2b287);
      }
    }
  };
  // Main walkway up from Park Gate (15..17, 21) to Promenade (y: 9..10).
  path(15 * TILE, 8 * TILE, 3 * TILE, 14 * TILE);
  // East-west central park promenade connecting Gazebo -> Pavilion -> Pond -> Grove.
  path(3 * TILE, 8 * TILE + 2, 27 * TILE, 2 * TILE - 4);
  // Branch path down to BBQ patio.
  path(25 * TILE, 9 * TILE, 2 * TILE, 4 * TILE);
  // Path between Park Gate & street car park.
  path(15 * TILE, MAP_PX_H, 3 * TILE, 3 * TILE);

  // ── Perimeter hedgerows & split-rail park fence ───────────────────────────
  const drawHedge = (x: number, y: number, w: number, h: number) => {
    g.rect(x + 1, y + 2, w, h).fill(0x2a4822);
    g.rect(x, y, w, h).fill(0x3a6430);
    g.rect(x + 2, y + 2, Math.max(4, w - 4), Math.max(3, Math.floor(h * 0.5))).fill(0x528842);
  };
  // North boundary border (y: 0..2)
  for (let hx = 16; hx < MAP_PX_W - 16; hx += 40) {
    drawHedge(hx, TILE, 30, 18);
  }
  // West & East perimeter borders
  for (let hy = 2 * TILE; hy < MAP_PX_H - TILE; hy += 40) {
    drawHedge(2, hy, 12, 30);
    drawHedge(MAP_PX_W - 14, hy, 12, 30);
  }
  // Wooden park fence along y = 21 with open Park Gate at x: 15..17
  const drawFenceSegment = (x0: number, x1: number, y: number) => {
    g.rect(x0, y + 4, x1 - x0, 2).fill(0x8e6942);
    g.rect(x0, y + 10, x1 - x0, 2).fill(0x735230);
    for (let px = x0; px <= x1; px += 16) {
      g.rect(px, y + 1, 4, 14).fill(0x5c3e24);
      g.rect(px + 1, y + 1, 2, 13).fill(0x9e774d);
    }
  };
  drawFenceSegment(TILE, 14 * TILE + 8, 21 * TILE);
  drawFenceSegment(18 * TILE, 32 * TILE + 12, 21 * TILE);
  // Stone gate pillars beside the open gate
  for (const gx of [14 * TILE + 10, 18 * TILE - 4]) {
    g.rect(gx, 21 * TILE - 2, 10, 18).fill(0x69635c);
    g.rect(gx + 1, 21 * TILE, 8, 14).fill(0x9d968c);
    g.rect(gx + 2, 21 * TILE - 3, 6, 3).fill(0xc5beb3);
  }
  // Wooden "SCRANTON PARK" welcome sign beside the gate
  g.rect(19 * TILE + 2, 20 * TILE + 10, 3, 12).fill(0x5c3e24);
  g.rect(20 * TILE + 8, 20 * TILE + 10, 3, 12).fill(0x5c3e24);
  g.rect(19 * TILE, 20 * TILE + 4, 28, 10).fill(0x4b331d);
  g.rect(19 * TILE + 1, 20 * TILE + 5, 26, 8).fill(0xd6b078);
  g.rect(19 * TILE + 4, 20 * TILE + 8, 20, 2).fill(0x4a311c);

  // ── 1. The Gazebo (boss: x 1..6, y 3..7) ──────────────────────────────────
  const gz = T(1, 3);
  g.rect(gz.x - 2, gz.y - 2, 6 * TILE + 4, 5 * TILE + 6).fill(0x6e4d2e);
  g.rect(gz.x, gz.y, 6 * TILE, 5 * TILE).fill(0xc49560);
  // Horizontal cedar deck planks
  for (let py = gz.y + 4; py < gz.y + 5 * TILE; py += 6) {
    g.rect(gz.x, py, 6 * TILE, 1).fill(0x9d7042);
  }
  // Gazebo steps & rails
  g.rect(3 * TILE, 8 * TILE, 2 * TILE, 8).fill(0xb2814c);
  g.rect(3 * TILE, 8 * TILE + 4, 2 * TILE, 2).fill(0x8c6036);
  // Non-walkable gazebo corner posts at (1, 3) and (6, 3)
  for (const [px, py] of [[1, 3], [6, 3]] as const) {
    const p = T(px, py);
    g.rect(p.x + 2, p.y + 2, 12, 12).fill(0x4e341e);
    g.rect(p.x + 3, p.y + 3, 10, 10).fill(0x8e6138);
  }
  // Speaker podium inside Gazebo
  g.rect(3 * TILE + 4, 3 * TILE + 4, 8, 10).fill(0x543820);
  g.rect(3 * TILE + 5, 3 * TILE + 3, 6, 3).fill(0xeae3d1);
  // Gazebo pitched roof overhang on canopy (semi-transparent lower eaves so sprites stay crisp)
  c.rect(gz.x - 4, 2 * TILE, 6 * TILE + 8, 18).fill(0x7c3b34);
  c.rect(gz.x, 2 * TILE + 2, 6 * TILE, 12).fill(0x9e4b42);
  c.rect(gz.x - 2, 3 * TILE + 2, 6 * TILE + 4, 6).fill({ color: 0x7c3b34, alpha: 0.45 });

  // ── 2. The Picnic Pavilion (meeting: x 9..17, y 3..7) ───────────────────────
  const pv = T(9, 3);
  g.rect(pv.x - 2, pv.y - 2, 9 * TILE + 4, 5 * TILE + 4).fill(0x8f8a7d);
  g.rect(pv.x, pv.y, 9 * TILE, 5 * TILE).fill(0xc2b9a5);
  for (let fx = pv.x; fx < pv.x + 9 * TILE; fx += 16) g.rect(fx, pv.y, 1, 5 * TILE).fill(0xa9a08d);
  for (let fy = pv.y; fy < pv.y + 5 * TILE; fy += 16) g.rect(pv.x, fy, 9 * TILE, 1).fill(0xa9a08d);
  // Central long timber picnic table on x: 11..15, y: 5 (matches PARK_GRID obstacle)
  g.rect(11 * TILE + 2, 5 * TILE - 3, 5 * TILE - 4, 3).fill(0x6e4b2b); // north bench
  g.rect(11 * TILE + 2, 5 * TILE + TILE, 5 * TILE - 4, 3).fill(0x6e4b2b); // south bench
  g.rect(11 * TILE + 1, 5 * TILE + 1, 5 * TILE - 2, 14).fill(0x4e341d);
  g.rect(11 * TILE + 2, 5 * TILE + 2, 5 * TILE - 4, 12).fill(0x9f6b3d);
  // Red checkered runner + thermos on table
  g.rect(12 * TILE + 4, 5 * TILE + 4, 2 * TILE + 8, 8).fill(0xd94b43);
  g.rect(12 * TILE + 12, 5 * TILE + 6, 16, 4).fill(0xfaf4e6);
  // Pavilion corner posts & green/cream bunting overhead
  c.rect(pv.x - 4, 2 * TILE + 4, 9 * TILE + 8, 12).fill(0x3a6b48);
  c.rect(pv.x, 2 * TILE + 6, 9 * TILE, 8).fill(0x529263);
  for (let bx = pv.x + 6; bx < pv.x + 9 * TILE - 6; bx += 12) {
    c.rect(bx, 3 * TILE + 1, 6, 4).fill(bx % 24 === 6 ? 0xf2c94c : 0xe35d52);
  }

  // ── 3. The Duck Pond (annex: x 19..24, y 3..10) ───────────────────────────
  const pd = T(20, 4);
  // Shoreline pebble border + rich pond water (matches x 20..23, y 4..6 obstacle)
  g.rect(pd.x - 4, pd.y - 4, 4 * TILE + 8, 3 * TILE + 8).fill(0x9b927d);
  g.rect(pd.x - 2, pd.y - 2, 4 * TILE + 4, 3 * TILE + 4).fill(0xc4b898);
  g.rect(pd.x, pd.y, 4 * TILE, 3 * TILE).fill(0x2f7ea3);
  g.rect(pd.x + 4, pd.y + 4, 4 * TILE - 8, 3 * TILE - 8).fill(0x3f9bc2);
  // Lily pads & shoreline reeds
  g.rect(pd.x + 6, pd.y + 8, 8, 7).fill(0x4ea34a);
  g.rect(pd.x + 11, pd.y + 10, 3, 3).fill(0xf7a8c4);
  g.rect(pd.x + 42, pd.y + 24, 9, 8).fill(0x4ea34a);
  g.rect(pd.x + 10, pd.y - 6, 2, 6).fill(0x6b4b2a);
  g.rect(pd.x + 14, pd.y - 7, 2, 7).fill(0x6b4b2a);
  // Cedar wooden dock on y = 7 (walkable!)
  g.rect(21 * TILE, 7 * TILE, 2 * TILE, TILE).fill(0x996b3d);
  for (let dy = 7 * TILE + 2; dy < 8 * TILE; dy += 4) g.rect(21 * TILE, dy, 2 * TILE, 1).fill(0x6e4b28);

  // ── 4. The Quiet Grove (accounts: x 26..32, y 3..8) ───────────────────────
  g.rect(26 * TILE, 3 * TILE, 7 * TILE, 5 * TILE + 8).fill(0x447539);
  // Park benches
  for (const [bx, by] of [[27, 6], [30, 6]] as const) {
    const p = T(bx, by);
    g.rect(p.x + 1, p.y + 8, 22, 6).fill(0x6e4929);
    g.rect(p.x + 2, p.y + 9, 20, 4).fill(0xa87544);
  }
  // Stone drinking fountain at (32, 3) (matching cooler anchor)
  const ft = T(32, 3);
  g.rect(ft.x + 2, ft.y + 2, 12, 12).fill(0x7c7a76);
  g.rect(ft.x + 4, ft.y + 4, 8, 8).fill(0xb8b5ae);
  g.rect(ft.x + 6, ft.y + 6, 4, 4).fill(0x52b6e0);
  // Oak trees at (26,4), (29,3), (31,4)
  for (const [tx, ty] of [[26, 4], [29, 3], [31, 4]] as const) {
    const tr = T(tx, ty);
    g.rect(tr.x + 2, tr.y + 8, 12, 6).fill({ color: 0x26411f, alpha: 0.45 });
    g.rect(tr.x + 5, tr.y + 2, 6, 12).fill(0x664226);
    g.rect(tr.x + 6, tr.y + 2, 2, 11).fill(0x885c37);
    // Leafy canopy drawn above actors
    const cy = tr.y - 14;
    c.rect(tr.x - 10, cy + 4, 36, 22).fill({ color: 0x2f5a27, alpha: 0.85 });
    c.rect(tr.x - 6, cy, 28, 22).fill({ color: 0x457f37, alpha: 0.85 });
    c.rect(tr.x - 2, cy + 2, 18, 12).fill({ color: 0x62a44c, alpha: 0.8 });
  }

  // ── 5. The Great Lawn (bullpen: x 1..23, y 11..20) ────────────────────────
  // Checkered picnic blankets
  const drawBlanket = (bx: number, by: number, c1: number, c2: number) => {
    const p = T(bx, by);
    g.rect(p.x, p.y, 26, 20).fill(c1);
    for (let dx = 0; dx < 26; dx += 6) {
      for (let dy = 0; dy < 20; dy += 5) {
        if (((dx / 6 + dy / 5) % 2) === 0) g.rect(p.x + dx, p.y + dy, 6, 5).fill(c2);
      }
    }
    // Picnic basket corner accent
    g.rect(p.x + 2, p.y + 2, 7, 5).fill(0x8c5c32);
    g.rect(p.x + 3, p.y + 3, 5, 3).fill(0xb8814d);
  };
  drawBlanket(3, 12, 0xe86158, 0xfcf7e8);
  drawBlanket(9, 16, 0x5c9ad2, 0xfcf7e8);
  drawBlanket(19, 12, 0xf0c954, 0xfcf7e8);
  // Three-legged race chalk lane + bright orange cones in bullpen meadow
  g.rect(5 * TILE, 15 * TILE + 6, 7 * TILE, 2).fill({ color: 0xffffff, alpha: 0.75 });
  g.rect(5 * TILE, 17 * TILE + 6, 7 * TILE, 2).fill({ color: 0xffffff, alpha: 0.75 });
  for (const [cx, cy] of [[5, 15], [5, 17], [12, 15], [12, 17]] as const) {
    const cp = T(cx, cy);
    g.rect(cp.x + 2, cp.y + 6, 6, 6).fill(0xf26419);
    g.rect(cp.x + 3, cp.y + 4, 4, 3).fill(0xff9f1c);
  }
  // Red frisbee resting on the grass
  g.rect(14 * TILE + 4, 15 * TILE + 6, 8, 5).fill(0xd9383a);
  g.rect(14 * TILE + 6, 15 * TILE + 7, 4, 3).fill(0xf26b6b);

  // ── 6. The BBQ & Snack Stand (kitchen: x 24..32, y 11..20) ─────────────────
  const bb = T(25, 12);
  g.rect(bb.x - 4, bb.y, 7 * TILE + 8, 7 * TILE).fill(0xa89f8b);
  g.rect(bb.x, bb.y + 4, 7 * TILE, 7 * TILE - 8).fill(0xcfc5ae);
  // Brick charcoal BBQ grill at (25, 14)
  const gr = T(25, 14);
  g.rect(gr.x + 1, gr.y + 2, 14, 12).fill(0x524844);
  g.rect(gr.x + 2, gr.y + 3, 12, 8).fill(0x2a2526);
  g.rect(gr.x + 3, gr.y + 4, 10, 5).fill(0xd95826);
  g.rect(gr.x + 4, gr.y + 5, 8, 3).fill(0xf7b733);
  // Snack cart at (30..31, 13)
  const sc = T(30, 13);
  g.rect(sc.x + 1, sc.y + 2, 2 * TILE - 2, TILE - 2).fill(0x4b331d);
  g.rect(sc.x + 2, sc.y + 3, 2 * TILE - 4, TILE - 6).fill(0xf7f2e4);
  for (let sx = sc.x + 2; sx < sc.x + 2 * TILE - 4; sx += 6) {
    g.rect(sx, sc.y + 2, 3, 5).fill(0xd64545);
  }
  // Blue cooler chest near (28, 18)
  g.rect(28 * TILE + 2, 18 * TILE + 3, 12, 9).fill(0x2a69ac);
  g.rect(28 * TILE + 2, 18 * TILE + 3, 12, 3).fill(0xf5f5f5);
  // Checkered picnic tables at cafe area (27..28, 14..16)
  for (const ty of [14, 16]) {
    g.rect(27 * TILE + 2, ty * TILE + 12, 2 * TILE - 4, 6).fill(0x8e5d34);
    g.rect(27 * TILE + 4, ty * TILE + 13, 2 * TILE - 8, 4).fill(0xe35d52);
  }

  // ── 7. Park Car Park (outside: y >= 22) ──────────────────────────────────
  const top = MAP_PX_H;
  const paveH = 3 * TILE;
  g.rect(-240, top + paveH, MAP_PX_W + 480, 3).fill(0xcfc8b4);
  g.rect(-240, top + paveH + 3, MAP_PX_W + 480, WORLD_H + 140 - top - paveH).fill(0x484654);
  for (let x = 24; x < MAP_PX_W; x += 48) g.rect(x, top + paveH + 4, 2, 16).fill(0xdcb448);
  for (let x = -180; x < MAP_PX_W + 180; x += 28) g.rect(x, top + paveH + 26, 12, 2).fill(0xe8d9a0);
  // Parked cars outside the park
  const drawCar = (cx: number, cy: number, body: number, roof: number) => {
    g.rect(cx + 2, cy + 1, 30, 12).fill(0x221c29);
    g.rect(cx, cy, 30, 11).fill(body);
    g.rect(cx + 6, cy + 2, 14, 7).fill(roof);
    g.rect(cx + 8, cy + 3, 5, 5).fill(0x9bd2ee);
    g.rect(cx + 15, cy + 3, 4, 5).fill(0x9bd2ee);
  };
  drawCar(42, top + paveH + 6, 0x4b749f, 0x6f9ac4);
  drawCar(150, top + paveH + 6, 0xc8963e, 0xe4b85e);
  drawCar(380, top + paveH + 6, 0x5d8d5e, 0x82b883);

  ground.addChild(g);
  canopy.addChild(c, anim);

  let elapsed = 0;
  const update = (dt: number): void => {
    elapsed += dt;
    anim.clear();
    // Two swimming pixel ducks on the Duck Pond
    const d1x = pd.x + 22 + Math.sin(elapsed * 0.7) * 14;
    const d1y = pd.y + 18 + Math.cos(elapsed * 0.5) * 4;
    const d2x = pd.x + 42 + Math.cos(elapsed * 0.6) * 12;
    const d2y = pd.y + 30 + Math.sin(elapsed * 0.8) * 3;
    for (const [dx, dy, col] of [[d1x, d1y, 0xfff8dc], [d2x, d2y, 0x7a9e52]] as const) {
      const rx = Math.round(dx);
      const ry = Math.round(dy);
      anim.rect(rx - 3, ry + 3, 8, 1).fill({ color: 0xbfe7f7, alpha: 0.7 });
      anim.rect(rx - 2, ry, 5, 3).fill(col);
      anim.rect(rx + 2, ry - 2, 3, 2).fill(col === 0x7a9e52 ? 0x2c6b43 : 0xffffff);
      anim.rect(rx + 5, ry - 1, 2, 1).fill(0xf29f05);
    }
    // Gentle rising BBQ charcoal smoke puffs
    for (let s = 0; s < 3; s++) {
      const phase = (elapsed * 0.6 + s * 0.33) % 1;
      const sx = Math.round(gr.x + 6 + Math.sin(elapsed * 2 + s * 2) * 2);
      const sy = Math.round(gr.y + 2 - phase * 16);
      anim.rect(sx, sy, 4, 3).fill({ color: 0xe6e4df, alpha: (1 - phase) * 0.55 });
    }
  };
  update(0);

  return { ground, canopy, update };
}
