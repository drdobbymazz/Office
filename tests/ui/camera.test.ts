// The camera keeps the rooms that matter on Monday (Michael's office, the conference room) below the
// HUD block on phones held sideways, with the side panel open or closed.
import { describe, expect, it } from 'vitest';
import { FloorCamera } from '@/scene/office/floor/camera';
import { ROOMS, TILE } from '@/game/core/world';
import { hudInset } from '@/components/game/hudGeometry';

const RAIL = 56;
/** The panel's sheet width at a viewport width (Dock.tsx sheetWidth, not wide screens). */
const sheet = (w: number): number => (w < 840 ? 244 : 256);

function framed(w: number, h: number, right: number, story = true, dpr = 3): FloorCamera {
  const cam = new FloorCamera();
  cam.resize(w, h, dpr);
  cam.setInsets({ left: 0, right, top: hudInset(story), bottom: 0 });
  cam.goHome(true);
  return cam;
}

function onScreen(cam: FloorCamera, id: string): { l: number; t: number; r: number; b: number } {
  const rect = ROOMS.find((x) => x.id === id)!.rect;
  const a = cam.toScreen(rect.x * TILE, rect.y * TILE);
  const z = cam.toScreen((rect.x + rect.w) * TILE, (rect.y + rect.h) * TILE);
  return { l: a.x, t: a.y, r: z.x, b: z.y };
}

describe('camera framing under the HUD', () => {
  for (const [w, h] of [[915, 412], [844, 390], [740, 360]] as const) {
    for (const open of [true, false]) {
      it(`${w}x${h}, panel ${open ? 'open' : 'closed'}: Monday's rooms are below the HUD and fully on screen`, () => {
        const right = RAIL + (open ? sheet(w) : 0);
        for (const dpr of [1, 2, 3]) {
          const cam = framed(w, h, right, true, dpr);
          for (const id of ['boss', 'meeting']) {
            const r = onScreen(cam, id);
            expect(r.t).toBeGreaterThanOrEqual(hudInset(true));
            expect(r.l).toBeGreaterThanOrEqual(0);
            expect(r.r).toBeLessThanOrEqual(w - right);
            expect(r.b).toBeLessThanOrEqual(h);
          }
        }
      });
    }
  }

  it('keeps a crisp 1:1 zoom on a 915x412 phone with the panel open', () => {
    for (const dpr of [1, 2, 3]) expect(framed(915, 412, RAIL + 256, true, dpr).zoom).toBe(1);
  });

  it('frames the sandbox below its one-row strip too', () => {
    const cam = framed(915, 412, RAIL + 256, false);
    expect(onScreen(cam, 'boss').t).toBeGreaterThanOrEqual(hudInset(false));
    expect(cam.zoom).toBe(1);
  });
});
