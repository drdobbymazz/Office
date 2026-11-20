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
import { MAP_PX_H, MAP_PX_W, TILE, WORLD_H, roomRectPx, targetRoomAtPx } from '@/game/core/world';
import { colors } from '@/design/tokens';
import { loadOfficeMap } from '../mapLoader';
import { FloorCamera } from './camera';
import type { Insets } from './camera';

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
    this.fx = deps.createFxView(app.renderer, this.sorted);

    // Draw order: see the comment at the top of game/view/api.ts.
    const sortedIndex = mapRoot.getChildIndex(this.sorted);
    mapRoot.addChildAt(this.shadows, sortedIndex);
    mapRoot.addChildAt(this.fx.floor, sortedIndex);
    mapRoot.addChildAt(drawPavement(), 0);
    this.world.addChild(mapRoot, this.fx.air, this.marks);
    app.stage.addChild(this.world, this.fx.screen);
    app.stage.eventMode = 'none';
    app.stage.interactiveChildren = false;
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
    out.scale = 1;
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
function drawPavement(): Container {
  const c = new Container();
  const g = new Graphics();
  const top = MAP_PX_H;
  const slab = 0xb9b4a6;
  const slabDark = 0xa39d8e;
  const joint = 0x8c8678;
  const kerb = 0xd8d3c4;
  const road = 0x4a4654;
  const roadLine = 0xe8d9a0;
  const paveH = 3 * TILE;

  g.rect(0, top, MAP_PX_W, paveH).fill(slab);
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
  // A doormat in front of the door.
  g.rect(16 * TILE + 2, top + 2, TILE - 4, 6).fill(0x7a4b3a).stroke({ width: 1, color: 0x4a2c22 });
  // Kerb and road.
  g.rect(0, top + paveH, MAP_PX_W, 3).fill(kerb);
  g.rect(0, top + paveH + 3, MAP_PX_W, WORLD_H - top - paveH - 3).fill(road);
  for (let x = 6; x < MAP_PX_W; x += 28) g.rect(x, top + paveH + 9, 12, 2).fill(roadLine);
  c.addChild(g);
  return c;
}
