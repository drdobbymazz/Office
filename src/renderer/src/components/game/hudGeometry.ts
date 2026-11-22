// Where the HUD block sits (CSS px). The camera keeps the office below hudBottom(): GameUI passes
// hudBottom(story) + 2 as the floor's top inset, so the rooms that matter never hide under the HUD.
// Plain numbers, shared by Hud.tsx, GameUI.tsx and the camera tests.

/** Width of the HUD block. */
export const STRIP_W = 320;
/** Top of the status strip. */
export const HUD_TOP = 4;
/** Height of the status strip (one row). */
export const STRIP_H = 30;
/** Where the mission row sits (under the status strip). */
export const CHIP_TOP = HUD_TOP + STRIP_H + 4;
/** Height of the mission row (one line). */
export const CHIP_H = 28;
/** The mission row never grows: kept for callers that reserve room under it. */
export const CHIP_MAX_H = CHIP_H;

/** Bottom edge of the HUD block (CSS px from the top). The camera keeps the office below it. */
export function hudBottom(story: boolean): number {
  return story ? CHIP_TOP + CHIP_H : HUD_TOP + STRIP_H;
}

/** The floor's top inset for the camera: the HUD block and a 2 px gap. */
export function hudInset(story: boolean): number {
  return hudBottom(story) + 2;
}
