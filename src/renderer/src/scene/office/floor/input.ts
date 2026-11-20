// Touch and mouse on the office floor.
//
//   drag empty space            pan (with a coasting stop)
//   two fingers                 pinch zoom + pan
//   wheel                       zoom at the cursor
//   double tap                  zoom in on that spot / back out
//   tap a person                select them
//   tap empty space             deselect
//   press on a person, then drag   pick them up; let go to drop or fling them
//
// While the UI is asking for a target, a tap picks a room or a person instead.

import type { GameFloor } from './GameFloor';
import type { CharId, TargetRoomId, Vec } from '@/game/core/types';

export interface InputHandlers {
  /** A person was tapped. */
  tapPerson(who: CharId): void;
  /** Empty space was tapped (deselect). */
  tapEmpty(world: Vec): void;
  /** Try to pick someone up. Return false to refuse (then it becomes a pan). */
  pickUp(who: CharId, world: Vec): boolean;
  /** The held person follows the finger. */
  dragTo(world: Vec): void;
  /** Let go. Velocity in world units/second. */
  drop(vx: number, vy: number): void;
  /** What kind of target the UI is waiting for. */
  targeting(): 'none' | 'room' | 'person';
  pickRoom(room: TargetRoomId): void;
  pickPerson(who: CharId): void;
  /** Any touch on the world (used to unlock audio, dismiss hints). */
  touched(): void;
}

interface Pointer {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startT: number;
  /** Person under the finger when it went down. */
  onPerson: CharId | null;
  moved: boolean;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

const TAP_SLOP = 10;
const TAP_MS = 320;
const DOUBLE_TAP_MS = 300;
/** Hold this long on a person before a drag lifts them (shorter = a quick swipe pans instead). */
const LIFT_AFTER_MS = 130;
/** Hold this long without moving and they are lifted anyway. */
const LONG_PRESS_MS = 380;
const EDGE = 46;

export class FloorInput {
  private stage: GameFloor;
  private h: InputHandlers;
  private el: HTMLElement;
  private pointers = new Map<number, Pointer>();
  private samples: Sample[] = [];
  private holding: CharId | null = null;
  private holdPointer = -1;
  private pinchDist = 0;
  private pinchMid: Vec = { x: 0, y: 0 };
  private lastTapT = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private panning = false;
  private disposers: (() => void)[] = [];
  enabled = true;

  constructor(stage: GameFloor, handlers: InputHandlers) {
    this.stage = stage;
    this.h = handlers;
    this.el = stage.canvas;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void => {
      this.el.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => this.el.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e));
    on('pointercancel', (e) => this.up(e, true));
    on('wheel', (e) => this.wheel(e), { passive: false });
    on('contextmenu', (e) => e.preventDefault());
  }

  get held(): CharId | null {
    return this.holding;
  }

  private local(e: PointerEvent | WheelEvent): Vec {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.h.touched();
    const p = this.local(e);
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable: fine */
    }
    const onPerson = this.pointers.size === 0 ? this.stage.personAt(p.x, p.y) : null;
    this.pointers.set(e.pointerId, {
      id: e.pointerId, x: p.x, y: p.y, startX: p.x, startY: p.y, startT: performance.now(), onPerson, moved: false
    });

    if (this.pointers.size === 1) {
      this.samples.length = 0;
      this.samples.push({ t: performance.now(), x: p.x, y: p.y });
      this.panning = false;
      this.stage.camera.grab();
      if (onPerson && this.h.targeting() === 'none') {
        this.clearPress();
        this.pressTimer = setTimeout(() => {
          const ptr = this.pointers.get(e.pointerId);
          if (ptr && !ptr.moved && !this.holding && this.pointers.size === 1) this.lift(ptr);
        }, LONG_PRESS_MS);
      }
    } else if (this.pointers.size === 2 && !this.holding) {
      this.clearPress();
      this.panning = false;
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      for (const q of this.pointers.values()) q.moved = true;
    }
  }

  private lift(ptr: Pointer): void {
    if (!ptr.onPerson) return;
    const world = this.stage.camera.toWorld(ptr.x, ptr.y);
    if (!this.h.pickUp(ptr.onPerson, world)) return;
    this.holding = ptr.onPerson;
    this.holdPointer = ptr.id;
    ptr.moved = true;
    this.stage.setGrip(world);
    this.h.dragTo(world);
  }

  private move(e: PointerEvent): void {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) {
      // Hovering mouse while targeting a room: light up the room under it.
      if (this.enabled && e.pointerType === 'mouse' && this.h.targeting() === 'room') {
        const p = this.local(e);
        this.stage.setTargetMode('room', this.stage.roomAtScreen(p.x, p.y));
      }
      return;
    }
    const p = this.local(e);
    const dx = p.x - ptr.x;
    const dy = p.y - ptr.y;
    ptr.x = p.x;
    ptr.y = p.y;
    const now = performance.now();

    if (this.holding) {
      if (ptr.id !== this.holdPointer) return;
      this.pushSample(now, p);
      const world = this.stage.camera.toWorld(p.x, p.y);
      this.stage.setGrip(world);
      this.h.dragTo(world);
      return;
    }

    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.pinchDist > 0 && dist > 0) {
        this.stage.camera.panBy(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
        this.stage.camera.zoomAt(mid.x, mid.y, dist / this.pinchDist);
      }
      this.pinchDist = dist;
      this.pinchMid = mid;
      return;
    }

    if (!ptr.moved && Math.hypot(p.x - ptr.startX, p.y - ptr.startY) > TAP_SLOP) {
      ptr.moved = true;
      this.clearPress();
      // A drag that began on a person after a short hold lifts them; a quick swipe pans.
      if (ptr.onPerson && this.h.targeting() === 'none' && now - ptr.startT >= LIFT_AFTER_MS) {
        this.lift(ptr);
        if (this.holding) return;
      }
      this.panning = true;
    }
    if (this.panning) {
      this.pushSample(now, p);
      this.stage.camera.panBy(dx, dy);
    }
  }

  private up(e: PointerEvent, cancelled = false): void {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    this.clearPress();
    try {
      this.el.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const now = performance.now();

    if (this.holding && ptr.id === this.holdPointer) {
      const v = this.velocity(now);
      const z = this.stage.camera.zoom;
      this.holding = null;
      this.holdPointer = -1;
      this.stage.setGrip(null);
      this.h.drop(cancelled ? 0 : v.x / z, cancelled ? 0 : v.y / z);
      return;
    }

    if (this.pointers.size === 1) {
      // One finger left after a pinch: carry on as a pan from here, without a jump.
      const rest = [...this.pointers.values()][0];
      rest.moved = true;
      this.panning = true;
      this.samples.length = 0;
      this.pinchDist = 0;
      this.stage.camera.settleZoom();
      return;
    }
    if (this.pointers.size > 0) return;
    this.pinchDist = 0;

    if (this.panning) {
      this.panning = false;
      if (!cancelled) {
        const v = this.velocity(now);
        this.stage.camera.fling(v.x, v.y);
      }
      return;
    }
    if (cancelled || ptr.moved || now - ptr.startT > TAP_MS) return;
    this.tap(ptr, now);
  }

  private tap(ptr: Pointer, now: number): void {
    const mode = this.h.targeting();
    if (mode === 'room') {
      const room = this.stage.roomAtScreen(ptr.x, ptr.y);
      if (room) this.h.pickRoom(room);
      return;
    }
    const who = this.stage.personAt(ptr.x, ptr.y);
    if (mode === 'person') {
      if (who) this.h.pickPerson(who);
      return;
    }
    if (who) {
      this.lastTapT = 0;
      this.h.tapPerson(who);
      return;
    }
    const double = now - this.lastTapT < DOUBLE_TAP_MS && Math.hypot(ptr.x - this.lastTapX, ptr.y - this.lastTapY) < 36;
    if (double) {
      this.lastTapT = 0;
      this.stage.camera.toggleZoomAt(ptr.x, ptr.y);
      return;
    }
    this.lastTapT = now;
    this.lastTapX = ptr.x;
    this.lastTapY = ptr.y;
    this.h.tapEmpty(this.stage.camera.toWorld(ptr.x, ptr.y));
  }

  private wheel(e: WheelEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this.local(e);
    this.stage.camera.grab();
    // Trackpads send many small deltas, mice a few big ones: scale by size.
    const step = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016));
    this.stage.camera.zoomAt(p.x, p.y, step);
  }

  /** Call every frame: carries the view along when someone is held near a screen edge. */
  update(dt: number): void {
    if (!this.holding) return;
    const ptr = this.pointers.get(this.holdPointer);
    if (!ptr) return;
    const w = this.stage.width;
    const h = this.stage.height;
    let px = 0;
    let py = 0;
    if (ptr.x < EDGE) px = (EDGE - ptr.x) / EDGE;
    else if (ptr.x > w - EDGE) px = -(ptr.x - (w - EDGE)) / EDGE;
    if (ptr.y < EDGE) py = (EDGE - ptr.y) / EDGE;
    else if (ptr.y > h - EDGE) py = -(ptr.y - (h - EDGE)) / EDGE;
    if (px === 0 && py === 0) return;
    // Only scroll when there is somewhere to scroll to (zoomed in).
    if (this.stage.camera.zoom <= this.stage.camera.homeZoom() * 1.05) return;
    const speed = 520 * dt;
    this.stage.camera.panBy(px * speed, py * speed);
    const world = this.stage.camera.toWorld(ptr.x, ptr.y);
    this.stage.setGrip(world);
    this.h.dragTo(world);
  }

  /** Drop whoever is held (the app lost focus, the game paused ...). */
  cancel(): void {
    this.clearPress();
    if (this.holding) {
      this.holding = null;
      this.holdPointer = -1;
      this.stage.setGrip(null);
      this.h.drop(0, 0);
    }
    this.pointers.clear();
    this.panning = false;
  }

  private pushSample(t: number, p: Vec): void {
    this.samples.push({ t, x: p.x, y: p.y });
    while (this.samples.length > 8) this.samples.shift();
  }

  /** Finger velocity over the last ~90 ms, in screen px/second. */
  private velocity(now: number): Vec {
    const s = this.samples;
    if (s.length < 2) return { x: 0, y: 0 };
    const last = s[s.length - 1];
    if (now - last.t > 90) return { x: 0, y: 0 };
    let first = s[0];
    for (const q of s) {
      if (last.t - q.t <= 90) {
        first = q;
        break;
      }
    }
    const dt = (last.t - first.t) / 1000;
    if (dt < 0.012) return { x: 0, y: 0 };
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
  }

  private clearPress(): void {
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  destroy(): void {
    this.cancel();
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }
}
