// The game camera for the office floor: where the screen is looking and how
// it gets there. (The original Camera.ts only fits the map to the window; a
// phone needs pan, pinch and a camera that can go and look at things.)
//
// Three sources of intent, in order of authority:
//   1. the player's fingers (pan, pinch, double-tap): they always win, and the
//      automatic camera backs off for a few seconds afterwards;
//   2. a person being followed (the selected one);
//   3. points of interest from the game (a scene starting, a fire), which the
//      camera glides to, holds, and leaves.
// Everything is eased. When it comes to rest it prefers a zoom at which one
// art pixel covers a whole number of screen pixels, so the pixel art is crisp.

import { MAP_PX_H, MAP_PX_W, TILE, WORLD_H, WORLD_W } from '@/game/core/world';
import { clamp } from '@/game/core/types';
import type { Vec } from '@/game/core/types';
import type { ViewRect } from '@/game/view/api';

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Interest {
  rect: Rect;
  weight: number;
  /** Seconds left to hold it once arrived. */
  hold: number;
}

/** Seconds the automatic camera stays out of the way after the player touches the view. */
const HANDS_OFF = 7;
/** Smallest area the camera frames: about a room's worth of floor. */
const MIN_FRAME_W = 11 * TILE;
const MIN_FRAME_H = 7.5 * TILE;
/**
 * The whole office with a sliver of pavement, so the front door reads as a door. 344 px tall: on a
 * 412 px phone that leaves exactly the HUD's 68 px above it at a crisp 1:1 zoom.
 */
const HOME: Rect = { x: 0, y: TILE, w: MAP_PX_W, h: MAP_PX_H - TILE + 8 };
/** How far past the edge of the world the view may show. */
const OVERSCAN = 20;

export class FloorCamera {
  /** Current centre (world px) and zoom (CSS px per world px). */
  x = MAP_PX_W / 2;
  y = MAP_PX_H / 2;
  zoom = 1;

  private tx = this.x;
  private ty = this.y;
  private tz = 1;

  private screenW = 915;
  private screenH = 412;
  private dpr = 1;
  private sized = false;
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

  private vx = 0;
  private vy = 0;
  private coasting = false;

  private handsOff = 0;
  private auto = true;
  private interest: Interest | null = null;
  private follow: (() => Vec | null) | null = null;
  private followBroken = false;
  private followZoom = 3;
  /** The player has parked the view somewhere on purpose (zoomed in by hand). */
  private parked = false;

  private shakePower = 0;
  private shakeLeft = 0;
  private shakeTotal = 1;
  private shakeT = 0;
  shakeX = 0;
  shakeY = 0;

  // ── geometry ───────────────────────────────────────────────────────────────

  /** dpr = the canvas resolution (physical px per CSS px), used to keep pixels crisp. */
  resize(w: number, h: number, dpr: number): void {
    this.screenW = Math.max(1, w);
    this.screenH = Math.max(1, h);
    this.dpr = Math.max(1, dpr);
    if (!this.sized || !this.parked) this.goHome(!this.sized);
    this.sized = true;
    this.clampTarget();
  }

  setInsets(i: Insets): void {
    const same = i.left === this.insets.left && i.right === this.insets.right && i.top === this.insets.top && i.bottom === this.insets.bottom;
    if (same) return;
    this.insets = { ...i };
    if (!this.parked && !this.follow && !this.interest) this.goHome();
    this.clampTarget();
  }

  private usableCentre(): Vec {
    const { left, right, top, bottom } = this.insets;
    return { x: left + (this.screenW - left - right) / 2, y: top + (this.screenH - top - bottom) / 2 };
  }

  private usableSize(): { w: number; h: number } {
    const { left, right, top, bottom } = this.insets;
    return { w: Math.max(96, this.screenW - left - right), h: Math.max(96, this.screenH - top - bottom) };
  }

  /** Largest zoom not above `z` at which an art pixel is a whole number of screen pixels (if that costs little). */
  private crisp(z: number): number {
    const physical = Math.floor(z * this.dpr + 1e-6);
    if (physical < 1) return z;
    const snapped = physical / this.dpr;
    return snapped >= z * 0.78 ? snapped : z;
  }

  /** Zoom at which the whole office fits the usable screen. */
  homeZoom(): number {
    const u = this.usableSize();
    return this.crisp(Math.min(u.w / HOME.w, u.h / HOME.h));
  }

  minZoom(): number {
    const u = this.usableSize();
    return Math.min(this.homeZoom(), Math.min(u.w / WORLD_W, u.h / WORLD_H)) * 0.9;
  }

  maxZoom(): number {
    return Math.max(this.homeZoom() * 2, this.crisp(this.usableSize().h / (4.5 * TILE)));
  }

  /** A comfortable close-up: a few desks across. */
  roomZoom(): number {
    const u = this.usableSize();
    return clamp(this.crisp(Math.min(u.w / MIN_FRAME_W, u.h / MIN_FRAME_H)), this.homeZoom(), this.maxZoom());
  }

  toScreen(wx: number, wy: number): Vec {
    const c = this.usableCentre();
    return { x: c.x + (wx - this.x) * this.zoom + this.shakeX, y: c.y + (wy - this.y) * this.zoom + this.shakeY };
  }

  toWorld(sx: number, sy: number): Vec {
    const c = this.usableCentre();
    return { x: this.x + (sx - c.x) / this.zoom, y: this.y + (sy - c.y) / this.zoom };
  }

  /** The visible world rectangle (whole screen, including parts under UI). */
  viewRect(): ViewRect {
    const a = this.toWorld(0, 0);
    const b = this.toWorld(this.screenW, this.screenH);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, zoom: this.zoom };
  }

  /** Offset and scale for the world container, rounded to whole screen pixels so tiles do not shimmer. */
  transform(): { x: number; y: number; scale: number } {
    const c = this.usableCentre();
    const snap = (v: number): number => Math.round(v * this.dpr) / this.dpr;
    return {
      x: snap(c.x - this.x * this.zoom + this.shakeX),
      y: snap(c.y - this.y * this.zoom + this.shakeY),
      scale: this.zoom
    };
  }

  // ── intent: player ─────────────────────────────────────────────────────────

  /** The player touched the view: stop gliding, stop following, back off. */
  grab(): void {
    this.handsOff = HANDS_OFF;
    this.coasting = false;
    this.vx = 0;
    this.vy = 0;
    this.followBroken = this.follow !== null || this.interest !== null;
    this.follow = null;
    this.interest = null;
    this.tx = this.x;
    this.ty = this.y;
    this.tz = this.zoom;
  }

  /** Drag by a screen-space delta. */
  panBy(dxScreen: number, dyScreen: number): void {
    this.tx -= dxScreen / this.zoom;
    this.ty -= dyScreen / this.zoom;
    this.x = this.tx;
    this.y = this.ty;
    this.parked = this.zoom > this.homeZoom() * 1.08;
    this.followBroken = false;
    this.clampTarget(true);
  }

  /** Let go with a velocity (screen px/s): the view coasts to a stop. */
  fling(vxScreen: number, vyScreen: number): void {
    this.vx = -vxScreen / this.zoom;
    this.vy = -vyScreen / this.zoom;
    this.coasting = Math.hypot(this.vx, this.vy) > 30;
    this.handsOff = HANDS_OFF;
  }

  /** Zoom by a factor about a screen point (pinch midpoint or cursor). */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toWorld(sx, sy);
    const z = clamp(this.tz * factor, this.minZoom(), this.maxZoom());
    this.tz = z;
    this.zoom = z;
    // Keep the world point under the fingers where it was.
    const c = this.usableCentre();
    this.tx = this.x = before.x - (sx - c.x) / z;
    this.ty = this.y = before.y - (sy - c.y) / z;
    this.parked = z > this.homeZoom() * 1.08;
    this.followBroken = false;
    this.handsOff = HANDS_OFF;
    this.clampTarget(true);
  }

  /** Fingers lifted after a pinch: settle on a crisp zoom if one is close. */
  settleZoom(): void {
    const snapped = Math.round(this.tz * this.dpr) / this.dpr;
    if (snapped > 0 && Math.abs(snapped - this.tz) / this.tz < 0.07) this.tz = clamp(snapped, this.minZoom(), this.maxZoom());
    if (this.tz < this.homeZoom() * 1.08) this.goHome();
  }

  /** Double-tap: zoom into the tapped spot, or back out if already close. */
  toggleZoomAt(sx: number, sy: number): void {
    this.handsOff = HANDS_OFF;
    this.follow = null;
    this.interest = null;
    this.followBroken = false;
    if (this.zoom > this.homeZoom() * 1.3) {
      this.goHome();
      return;
    }
    const p = this.toWorld(sx, sy);
    this.tx = p.x;
    this.ty = p.y;
    this.tz = this.roomZoom();
    this.parked = true;
    this.clampTarget();
  }

  // ── intent: game ───────────────────────────────────────────────────────────

  setAuto(on: boolean): void {
    this.auto = on;
    if (!on) this.interest = null;
  }

  /** Frame a world rectangle with breathing room, and stay there. */
  frame(rect: Rect): void {
    const r = padRect(rect);
    const u = this.usableSize();
    this.tz = clamp(this.crisp(Math.min(u.w / r.w, u.h / r.h)), this.homeZoom(), this.roomZoom());
    this.tx = r.x + r.w / 2;
    this.ty = r.y + r.h / 2;
    this.parked = this.tz > this.homeZoom() * 1.08;
    this.coasting = false;
    this.follow = null;
    this.interest = null;
    this.clampTarget();
  }

  goHome(immediate = false): void {
    this.follow = null;
    this.interest = null;
    this.followBroken = false;
    this.parked = false;
    this.coasting = false;
    this.tz = this.homeZoom();
    this.tx = HOME.x + HOME.w / 2;
    this.ty = HOME.y + HOME.h / 2;
    if (immediate) {
      this.x = this.tx;
      this.y = this.ty;
      this.zoom = this.tz;
    }
  }

  /** Follow a moving point (the selected person) until the player pans away. */
  followPoint(get: () => Vec | null, zoom?: number): void {
    this.follow = get;
    this.followZoom = zoom ?? this.roomZoom();
    this.interest = null;
    this.followBroken = false;
    this.handsOff = 0;
    this.parked = false;
    this.coasting = false;
  }

  /** Stop tracking; return to the whole office unless the player has parked the view. */
  stopFollowing(): void {
    const was = this.follow !== null || this.followBroken;
    this.follow = null;
    this.followBroken = false;
    if (was && !this.parked) this.goHome();
  }

  get following(): boolean {
    return this.follow !== null;
  }

  /** Something worth looking at happened. Ignored while the player is steering or following. */
  suggest(rect: Rect, weight: number, holdMs: number): void {
    if (!this.auto || this.follow || this.handsOff > 0 || this.parked) return;
    if (this.interest && this.interest.weight > weight && this.interest.hold > 0.6) return;
    this.interest = { rect, weight, hold: Math.max(1.5, holdMs / 1000) };
  }

  shake(power: number, ms: number): void {
    if (power * ms < this.shakePower * this.shakeLeft * 1000) return;
    this.shakePower = clamp(power, 0, 1);
    this.shakeLeft = ms / 1000;
    this.shakeTotal = Math.max(0.05, ms / 1000);
  }

  // ── per frame ──────────────────────────────────────────────────────────────

  /** dt in real seconds (the camera keeps moving while the game is paused). */
  update(dt: number): void {
    const d = Math.min(0.1, Math.max(0, dt));
    if (this.handsOff > 0) {
      this.handsOff -= d;
      // Left alone at the wide view: settle back to the whole office.
      if (this.handsOff <= 0 && !this.parked && !this.follow && !this.interest) this.goHome();
    }

    if (this.coasting) {
      this.tx += this.vx * d;
      this.ty += this.vy * d;
      const drag = Math.exp(-d * 4.2);
      this.vx *= drag;
      this.vy *= drag;
      if (Math.hypot(this.vx, this.vy) < 6) this.coasting = false;
      this.clampTarget();
    }

    if (this.follow) {
      const p = this.follow();
      if (p) {
        this.tx = p.x;
        this.ty = p.y - 10;
        this.tz = clamp(this.followZoom, this.homeZoom(), this.maxZoom());
        this.clampTarget();
      } else {
        this.follow = null;
        this.goHome();
      }
    } else if (this.interest) {
      const it = this.interest;
      const r = padRect(it.rect);
      const u = this.usableSize();
      // The automatic camera never goes in as close as the player can: context matters more than drama.
      const want = Math.min(u.w / r.w, u.h / r.h) * 0.9;
      // Small talk earns a gentle push-in; only the things that matter get the full close-up.
      const home = this.homeZoom();
      const cap = it.weight >= 0.55 ? this.roomZoom() : Math.max(home, this.crisp(home + (this.roomZoom() - home) * 0.5));
      this.tz = clamp(this.crisp(want), home, cap);
      this.tx = r.x + r.w / 2;
      this.ty = r.y + r.h / 2;
      this.clampTarget();
      const arrived = Math.abs(this.x - this.tx) * this.zoom < 10 && Math.abs(this.y - this.ty) * this.zoom < 10;
      if (arrived) it.hold -= d;
      if (it.hold <= 0) {
        this.interest = null;
        this.goHome();
      }
    }

    // Ease toward the target. Zoom is eased in log space so it feels even.
    const k = 1 - Math.exp(-d * (this.follow ? 5.5 : 3.4));
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.zoom *= Math.pow(this.tz / this.zoom, k);
    if (Math.abs(this.zoom - this.tz) < 0.0015) this.zoom = this.tz;

    // Shake: a decaying wobble, in whole art pixels so it feels like the pixel world shaking.
    if (this.shakeLeft > 0) {
      this.shakeLeft -= d;
      this.shakeT += d;
      const fall = clamp(this.shakeLeft / this.shakeTotal, 0, 1);
      const amp = this.shakePower * 5 * fall * fall * this.zoom;
      this.shakeX = Math.round((Math.sin(this.shakeT * 61) + Math.sin(this.shakeT * 37.3 + 1.7)) * 0.5 * amp);
      this.shakeY = Math.round((Math.sin(this.shakeT * 53 + 0.6) + Math.sin(this.shakeT * 29.1 + 2.9)) * 0.5 * amp);
      if (this.shakeLeft <= 0) {
        this.shakePower = 0;
        this.shakeX = 0;
        this.shakeY = 0;
      }
    }
  }

  /** Keep the target inside the world so the player can never get lost in the void. */
  private clampTarget(alsoCurrent = false): void {
    this.tz = clamp(this.tz, this.minZoom(), this.maxZoom());
    const u = this.usableSize();
    const halfW = u.w / 2 / this.tz;
    const halfH = u.h / 2 / this.tz;
    const loX = -OVERSCAN + halfW;
    const hiX = WORLD_W + OVERSCAN - halfW;
    const loY = -OVERSCAN + halfH;
    const hiY = WORLD_H + OVERSCAN - halfH;
    // When the view is wider than the world, centre on the office itself.
    this.tx = loX > hiX ? HOME.x + HOME.w / 2 : clamp(this.tx, loX, hiX);
    this.ty = loY > hiY ? HOME.y + HOME.h / 2 : clamp(this.ty, loY, hiY);
    if (alsoCurrent) {
      this.x = this.tx;
      this.y = this.ty;
    }
  }
}

function padRect(r: Rect): Rect {
  const w = Math.max(MIN_FRAME_W, r.w * 1.3);
  const h = Math.max(MIN_FRAME_H, r.h * 1.3);
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
}
