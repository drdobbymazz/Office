// The game's view of the office floor.
//
// It reuses the original map renderer (TiledMapRenderer, the same art) and adds
// what the game needs on top: the pavement outside the front door, one
// expressive sprite per person, the effects layers, a touch camera, and the
// queries the UI needs (where is that person's head on screen? who is under
// this finger?). It knows nothing about game rules: it draws RenderFrames.

import { Application, Container, Graphics } from 'pixi.js';
// PixiJS builds shader code with new Function(), which the Electron CSP blocks: this patches it.
import 'pixi.js/unsafe-eval';
import type {
  ActorView, CreateActorView, CreateFxView, FxCue, FxPerson, FxView, PersonState, RenderFrame
} from '@/game/view/api';
import type { CharId, TargetRoomId, Vec } from '@/game/core/types';
import { TARGET_ROOMS, isCastId } from '@/game/core/types';
import { MAP_PX_H, MAP_PX_W, TILE, WORLD_H, type WorldLocation, roomRectPx, targetRoomAtPx } from '@/game/core/world';
import { colors } from '@/design/tokens';
import { loadOfficeMap } from '../mapLoader';
import { FloorCamera } from './camera';
import type { Insets } from './camera';
import { createParkMap } from './parkMap';

export interface FloorDeps {
  createActorView: CreateActorView;
  createFxView: CreateFxView;
}

export type Quality = 'auto' | 'low' | 'high';

export interface HeadPoint {
  x: number;
  y: number;
  scale: number;
  visible: boolean;
}

interface Actor {
  view: ActorView;
  unseen: number;
  shown: boolean;
  sprite: string;
}

/** Smallest comfortable touch target, CSS px. */
const TOUCH = 44;

export class GameFloor {
  readonly camera = new FloorCamera();
  readonly canvas: HTMLCanvasElement;

  private app: Application;
  private host: HTMLElement;
  private deps: FloorDeps;
  private world = new Container();
  private shadows = new Container();
  private sorted: Container;
  private fx: FxView;
  private actors = new Map<CharId, Actor>();
  private fxPeople: FxPerson[] = [];
  private marks = new Graphics();
  private targetMode: 'none' | 'room' | 'person' = 'none';
  private hoverRoom: TargetRoomId | null = null;
  private pulse = 0;
  private gripAt: Vec | null = null;
  private observer: ResizeObserver | null = null;
  private officeVisuals: Container[];
  private parkGround: Container;
  private parkCanopy: Container;
  private parkUpdate: (dt: number) => void;
  private w = 1;
  private h = 1;
  private resolution = 1;
  private lastFrame: RenderFrame | null = null;
  private destroyed = false;

  private constructor(app: Application, host: HTMLElement, deps: FloorDeps, map: Awaited<ReturnType<typeof loadOfficeMap>>, resolution: number) {
    this.app = app;
    this.host = host;
    this.deps = deps;
    this.resolution = resolution;
    this.canvas = app.canvas as HTMLCanvasElement;

    const mapRoot = map.getContainer();
    this.sorted = map.getCharacterContainer();
    this.sorted.sortableChildren = true;
    const officeTiles = mapRoot.children.filter((ch) => ch !== this.sorted);
    this.fx = deps.createFxView(app.renderer, this.sorted);

    // Draw order: see the comment at the top of game/view/api.ts.
    const sortedIndex = mapRoot.getChildIndex(this.sorted);
    mapRoot.addChildAt(this.shadows, sortedIndex);
    mapRoot.addChildAt(this.fx.floor, sortedIndex);
    const officeDecor = drawOfficeDecor();
    const officeSurroundings = drawSurroundings();
    mapRoot.addChildAt(officeDecor, mapRoot.getChildIndex(this.fx.floor));
    mapRoot.addChildAt(officeSurroundings, 0);
    this.officeVisuals = [...officeTiles, officeDecor, officeSurroundings];

    const park = createParkMap();
    this.parkGround = park.ground;
    this.parkCanopy = park.canopy;
    this.parkUpdate = park.update;
    this.parkGround.visible = false;
    this.parkCanopy.visible = false;
    mapRoot.addChildAt(this.parkGround, mapRoot.getChildIndex(this.shadows));
    mapRoot.addChildAt(this.parkCanopy, mapRoot.getChildIndex(this.sorted) + 1);

    this.world.addChild(mapRoot, this.fx.air, this.marks);
    app.stage.addChild(this.world, this.fx.screen);
    app.stage.eventMode = 'none';
    app.stage.interactiveChildren = false;
  }

  /** Switch the visible floor backdrop between the Office building and Scranton Community Park. */
  setLocation(loc: WorldLocation): void {
    const isPark = loc === 'park';
    for (const v of this.officeVisuals) v.visible = !isPark;
    this.parkGround.visible = isPark;
    this.parkCanopy.visible = isPark;
  }

  static async create(host: HTMLElement, deps: FloorDeps, quality: Quality = 'auto'): Promise<GameFloor> {
    const app = new Application();
    const rect = host.getBoundingClientRect();
    const resolution = resolutionFor(quality);
    await app.init({
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      antialias: false,
      roundPixels: true,
      resolution,
      autoDensity: true,
      background: colors.ink[900],
      powerPreference: 'high-performance',
      preference: 'webgl',
      autoStart: false,
      sharedTicker: false
    });
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.imageRendering = 'pixelated';
    host.appendChild(canvas);

    const map = await loadOfficeMap();
    const floor = new GameFloor(app, host, deps, map, resolution);
    floor.resize();
    floor.observer = new ResizeObserver(() => floor.resize());
    floor.observer.observe(host);
    return floor;
  }

  // ── size ───────────────────────────────────────────────────────────────────

  resize(): void {
    if (this.destroyed) return;
    const rect = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.app.renderer.resize(w, h);
    this.camera.resize(w, h, this.resolution);
  }

  get width(): number {
    return this.w;
  }

  get height(): number {
    return this.h;
  }

  setInsets(i: Insets): void {
    this.camera.setInsets(i);
  }

  // ── drawing ────────────────────────────────────────────────────────────────

  /**
   * Draw one frame.
   * simDt: seconds of game time since the last frame (0 while paused).
   * realDt: seconds of wall time (the camera and highlights keep moving while paused).
   */
  render(frame: RenderFrame, simDt: number, realDt: number): void {
    if (this.destroyed) return;
    this.lastFrame = frame;
    this.camera.update(realDt);
    const t = this.camera.transform();
    this.world.position.set(t.x, t.y);
    this.world.scale.set(t.scale);

    for (const a of this.actors.values()) a.shown = false;
    this.fxPeople.length = 0;
    for (const p of frame.people) {
      const actor = this.actorFor(p);
      actor.shown = true;
      actor.unseen = 0;
      actor.view.update(simDt, p);
      if (p.visible && p.alpha > 0.05) {
        const head = actor.view.headTop();
        this.fxPeople.push({ id: p.id, x: p.x, y: p.y - p.lift, headY: head.y, scale: p.scale, visible: true, statuses: p.statuses });
      }
    }
    for (const [id, a] of this.actors) {
      if (a.shown) continue;
      a.view.container.visible = false;
      a.view.shadow.visible = false;
      a.unseen += realDt;
      // Visitors are thrown away once gone; the staff are kept for tomorrow.
      if (a.unseen > 6 && !isCastId(id)) this.dropActor(id, a);
    }

    this.fx.sync(frame.effects);
    this.fx.update(simDt, { time: frame.time, people: this.fxPeople, view: this.camera.viewRect(), screenW: this.w, screenH: this.h });
    if (this.parkGround.visible) this.parkUpdate(realDt);

    this.drawMarks(realDt);
    this.app.renderer.render(this.app.stage);
  }

  private actorFor(p: PersonState): Actor {
    let a = this.actors.get(p.id);
    if (a && a.sprite !== p.sprite) {
      // Same person, different body (should be rare): rebuild.
      this.dropActor(p.id, a);
      a = undefined;
    }
    if (a) return a;
    const view = this.deps.createActorView(p.id, p.sprite);
    this.sorted.addChild(view.container);
    this.shadows.addChild(view.shadow);
    a = { view, unseen: 0, shown: false, sprite: p.sprite };
    this.actors.set(p.id, a);
    return a;
  }

  private dropActor(id: CharId, a: Actor): void {
    a.view.container.parent?.removeChild(a.view.container);
    a.view.shadow.parent?.removeChild(a.view.shadow);
    a.view.destroy();
    this.actors.delete(id);
  }

  cue(c: FxCue): void {
    this.fx.cue(c);
  }

  clearFx(): void {
    this.fx.clear();
  }

  // ── queries ────────────────────────────────────────────────────────────────

  /** Where someone's head is on screen (for speech bubbles). */
  headOnScreen(who: CharId, out: HeadPoint = { x: 0, y: 0, scale: 1, visible: false }): HeadPoint {
    const a = this.actors.get(who);
    if (!a || !a.shown || !a.view.container.visible) {
      out.visible = false;
      return out;
    }
    const h = a.view.headTop();
    const s = this.camera.toScreen(h.x, h.y);
    out.x = s.x;
    out.y = s.y;
    out.scale = this.camera.zoom;
    out.visible = a.view.container.alpha > 0.3 && s.x > -30 && s.x < this.w + 30 && s.y > -30 && s.y < this.h + 40;
    return out;
  }

  /** Middle of a person's body in world pixels, or null if they are not on the floor. */
  personWorld(who: CharId): Vec | null {
    const a = this.actors.get(who);
    if (!a || !a.shown) return null;
    return a.view.chest();
  }

  /** Who is under a screen point (front-most first), or null. */
  personAt(sx: number, sy: number): CharId | null {
    const frame = this.lastFrame;
    if (!frame) return null;
    const p = this.camera.toWorld(sx, sy);
    // People are small: pad the hit box until it is a comfortable touch target.
    const want = TOUCH / this.camera.zoom;
    let best: CharId | null = null;
    let bestScore = -Infinity;
    for (const s of frame.people) {
      if (!s.visible || s.alpha < 0.4) continue;
      const a = this.actors.get(s.id);
      if (!a) continue;
      const b = a.view.hitBox();
      const padX = Math.max(0, (want - b.w) / 2);
      const padY = Math.max(0, (want - b.h) / 2);
      if (p.x < b.x - padX || p.x > b.x + b.w + padX || p.y < b.y - padY || p.y > b.y + b.h + padY) continue;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      // Nearest to the finger wins; someone lower on screen (in front) breaks ties.
      const score = -Math.hypot(p.x - cx, p.y - cy) + s.y * 0.01 + s.lift;
      if (score > bestScore) {
        bestScore = score;
        best = s.id;
      }
    }
    return best;
  }

  /** Which targetable room a screen point is over, or null. */
  roomAtScreen(sx: number, sy: number): TargetRoomId | null {
    const p = this.camera.toWorld(sx, sy);
    return targetRoomAtPx(p.x, p.y);
  }

  // ── highlights drawn over the floor ────────────────────────────────────────

  setTargetMode(mode: 'none' | 'room' | 'person', hover: TargetRoomId | null = null): void {
    this.targetMode = mode;
    this.hoverRoom = hover;
  }

  /** Show where the Overseer's finger is gripping (world px), or hide with null. */
  setGrip(at: Vec | null): void {
    this.gripAt = at;
  }

  private drawMarks(dt: number): void {
    const g = this.marks;
    g.clear();
    this.pulse += dt;
    if (this.targetMode === 'room') {
      // Stepped blink, like the rest of the pixel UI.
      const on = Math.floor(this.pulse / 0.4) % 2 === 0;
      for (const id of TARGET_ROOMS) {
        const r = roomRectPx(id);
        const hot = id === this.hoverRoom;
        g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).fill({ color: colors.accent.lemon, alpha: hot ? 0.34 : on ? 0.16 : 0.08 });
        g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).stroke({ width: hot ? 2 : 1, color: hot ? colors.ink[900] : colors.accent.lemon, alpha: 1 });
      }
    }
    const at = this.gripAt;
    if (at) {
      // A little pixel pincer above the held person.
      const x = Math.round(at.x);
      const y = Math.round(at.y);
      const open = Math.floor(this.pulse / 0.25) % 2;
      g.rect(x - 3 - open, y - 6, 2, 5).fill(colors.cream[50]).stroke({ width: 1, color: colors.ink[900] });
      g.rect(x + 1 + open, y - 6, 2, 5).fill(colors.cream[50]).stroke({ width: 1, color: colors.ink[900] });
      g.rect(x - 3, y - 9, 6, 3).fill(colors.cream[50]).stroke({ width: 1, color: colors.ink[900] });
    }
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer?.disconnect();
    for (const a of this.actors.values()) a.view.destroy();
    this.actors.clear();
    this.fx.destroy();
    this.canvas.remove();
    try {
      this.app.destroy(true, { children: true });
    } catch {
      /* already torn down */
    }
  }
}

function resolutionFor(q: Quality): number {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  // Pixel art gains nothing above 3x, and big canvases cost battery.
  if (q === 'low') return Math.min(dpr, 1.5);
  if (q === 'high') return Math.min(dpr, 4);
  return Math.min(dpr, 3);
}

/**
 * The pavement outside the front door: a few rows of paving and a strip of
 * road, in the map's own muted palette, so people have somewhere to arrive
 * from and to stand during a fire drill.
 */
function drawSurroundings(): Container {
  const c = new Container();
  const g = new Graphics();
  const top = MAP_PX_H;
  const slab = 0xb9b4a6;
  const slabDark = 0xa39d8e;
  const joint = 0x8c8678;
  const kerb = 0xd8d3c4;
  const road = 0x454250;
  const roadLine = 0xe8d9a0;
  const paveH = 3 * TILE;

  // Business-park lawn & dark trim framing outside the office walls (strictly outside 544x416).
  g.rect(-240, -180, MAP_PX_W + 480, WORLD_H + 340).fill(0x527a46);
  for (let gx = -224; gx < MAP_PX_W + 224; gx += 40) {
    for (let gy = -160; gy < top + 20; gy += 36) {
      if ((Math.abs(gx + gy) / 4) % 3 === 0) g.rect(gx, gy, 18, 12).fill(0x496f3e);
    }
  }
  // Hedges & trees around the north/west/east perimeter outside the building footprint.
  const drawShrub = (x: number, y: number, w: number, h: number) => {
    g.rect(x + 1, y + 2, w, h).fill(0x2d4a26);
    g.rect(x, y, w, h).fill(0x3a6432);
    g.rect(x + 2, y + 2, Math.max(4, w - 5), Math.max(3, Math.floor(h * 0.5))).fill(0x568b46);
  };
  for (let hx = 16; hx < MAP_PX_W - 32; hx += 48) drawShrub(hx, -20, 26, 14);
  for (let hy = 16; hy < MAP_PX_H - 32; hy += 56) {
    drawShrub(-24, hy, 18, 22);
    drawShrub(MAP_PX_W + 6, hy, 18, 22);
  }

  g.rect(0, top, MAP_PX_W, paveH).fill(slab);
  // Sidewalk planters beside the front entrance.
  drawShrub(5 * TILE, top + 6, 22, 12);
  drawShrub(25 * TILE, top + 6, 22, 12);
  // Paving slabs, two tiles wide, offset on alternate rows like brickwork.
  for (let row = 0; row < 3; row++) {
    const y = top + row * TILE;
    g.rect(0, y, MAP_PX_W, 1).fill(joint);
    const offset = row % 2 === 0 ? 0 : TILE;
    for (let x = offset; x < MAP_PX_W; x += 2 * TILE) {
      g.rect(x, y, 1, TILE).fill(joint);
      if (((x / TILE) + row) % 5 === 0) g.rect(x + 2, y + 2, 2 * TILE - 4, TILE - 4).fill(slabDark);
    }
  }
  // Welcome doormat in front of the door.
  g.rect(16 * TILE + 2, top + 2, TILE - 4, 6).fill(0x7a4b3a).stroke({ width: 1, color: 0x4a2c22 });
  // Concrete curb & expanded asphalt parking lot south of the sidewalk.
  g.rect(-240, top + paveH, MAP_PX_W + 480, 3).fill(kerb);
  g.rect(-240, top + paveH + 3, MAP_PX_W + 480, WORLD_H + 140 - top - paveH).fill(road);
  // Yellow parking bay lines & road center dashes.
  for (let x = 24; x < MAP_PX_W; x += 48) {
    g.rect(x, top + paveH + 4, 2, 16).fill(0xdcb448);
  }
  for (let x = -180; x < MAP_PX_W + 180; x += 28) {
    g.rect(x, top + paveH + 26, 12, 2).fill(roadLine);
  }

  // Parked pixel cars tucked into parking bays outside the walkable pavement.
  const drawCar = (cx: number, cy: number, body: number, roof: number) => {
    g.rect(cx + 2, cy + 1, 30, 12).fill(0x221c29);
    g.rect(cx, cy, 30, 11).fill(body);
    g.rect(cx + 6, cy + 2, 14, 7).fill(roof);
    g.rect(cx + 8, cy + 3, 5, 5).fill(0x9bd2ee);
    g.rect(cx + 15, cy + 3, 4, 5).fill(0x9bd2ee);
    g.rect(cx + 3, cy - 1, 5, 2).fill(0x1a1320);
    g.rect(cx + 22, cy - 1, 5, 2).fill(0x1a1320);
    g.rect(cx + 3, cy + 10, 5, 2).fill(0x1a1320);
    g.rect(cx + 22, cy + 10, 5, 2).fill(0x1a1320);
    g.rect(cx + 29, cy + 2, 1, 2).fill(0xfff1a8);
    g.rect(cx + 29, cy + 7, 1, 2).fill(0xfff1a8);
  };
  drawCar(34, top + paveH + 6, 0x4b749f, 0x6f9ac4);
  drawCar(130, top + paveH + 6, 0xc8963e, 0xe4b85e);
  drawCar(370, top + paveH + 6, 0x9aa2b2, 0xc4ccd8);

  c.addChild(g);
  return c;
}

/** Crisp, purely visual interior studio accents placed on walls and furniture tops. */
function drawOfficeDecor(): Container {
  const c = new Container();
  const g = new Graphics();

  // Conference room north wall whiteboard + colorful markers.
  g.rect(11 * TILE, 2 * TILE + 5, 4 * TILE, 8).fill(0x3a3242);
  g.rect(11 * TILE + 1, 2 * TILE + 6, 4 * TILE - 2, 6).fill(0xf7f3ea);
  g.rect(11 * TILE + 4, 2 * TILE + 8, 12, 1).fill(0x3d7ac9);
  g.rect(12 * TILE + 6, 2 * TILE + 10, 18, 1).fill(0xd94848);
  g.rect(14 * TILE + 2, 2 * TILE + 7, 8, 2).fill(0x479e55);

  // Spider conference phone in the center of the conference table area.
  g.rect(13 * TILE + 5, 6 * TILE + 3, 6, 5).fill(0x282430);
  g.rect(13 * TILE + 7, 6 * TILE + 4, 2, 3).fill(0x52b788);

  // Tiny mugs & desk pads on boss/sales desks (matching DESKS positions visually).
  const mugSpots: [number, number, number][] = [
    [3 * TILE + 11, 3 * TILE + 9, 0xe05248],
    [2 * TILE + 11, 12 * TILE + 9, 0x5292d6],
    [6 * TILE + 11, 12 * TILE + 9, 0xd8a838],
    [10 * TILE + 11, 12 * TILE + 9, 0xe8e2d5],
    [14 * TILE + 11, 12 * TILE + 9, 0xb87ac4]
  ];
  for (const [mx, my, col] of mugSpots) {
    g.rect(mx, my, 3, 3).fill(col);
    g.rect(mx, my, 2, 1).fill(0xfffdf5);
  }

  // Boss office warm desk lamp beside Michael's desk corner.
  g.rect(3 * TILE - 12, 3 * TILE + 6, 4, 5).fill(0x5a4630);
  g.rect(3 * TILE - 13, 3 * TILE + 4, 6, 3).fill(0xf2c864);

  // Break room counter mugs & paper cups next to the cooler.
  g.rect(27 * TILE + 3, 16 * TILE + 10, 3, 4).fill(0xd64848);
  g.rect(27 * TILE + 8, 16 * TILE + 10, 3, 4).fill(0x4894d6);
  g.rect(32 * TILE + 2, 3 * TILE + 11, 3, 4).fill(0xf5f2ec);

  c.addChild(g);
  return c;
}
