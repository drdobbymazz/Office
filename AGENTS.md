# AGENTS.md

## What this is
- Electron + Vite + React + Pixi.js adult office-comedy sim. The same renderer ships as an Electron app, a static web SPA (`dist-web/`) and an Android APK.
- Entrypoints: `src/main/index.ts` (Electron main), `src/preload/index.ts` (IPC bridge), `src/renderer/src/main.tsx` (React app), `src/renderer/src/game/game.ts` (sim + director + floor wiring).
- Layers: `src/renderer/src/game/` is the pure simulation/logic layer (its only Pixi touch is a type-only import in `game/view/api.ts`; don’t add runtime Pixi/DOM there); `src/renderer/src/scene/office/` is Pixi rendering; `src/renderer/src/components/game/` is UI.
- `@` aliases `src/renderer/src`; `@brand` aliases `docs`. Configured in both Vite and Vitest configs.

## Commands
- `npm install` runs `electron-rebuild` for `node-pty`. For web-only/tests, `npm install --ignore-scripts` avoids the native rebuild (see `GAME.md`).
- `npm run dev` = Electron dev. `npm run dev:web` = browser dev server (root `src/renderer`).
- `npm run typecheck` = node + web tsc. **Run it explicitly**; `npm run build` does not typecheck and CI runs typecheck separately.
- `npm run build` = Electron build (`out/`). `npm run build:web` = `dist-web/`. `npm run build:android` = web build + APK at `dist-android/munder-difflin.apk` (needs Java + Android build tools; can `--skip-web`).
- `npm test` = full Vitest suite. Single file: `npx vitest run tests/sim/social.test.ts`. Single test: add `-t "name"`.
- No lint or formatter script exists. Do not invent ESLint/Prettier commands.
- Full suite is ~930 tests and takes minutes; story tests run whole office days. Under parallel load a few timing tests can flake; use `npx vitest run --no-file-parallelism` for a stable full run.

## Simulation rules that are easy to break
- **Story vs sandbox is a hard split.** `SimCore.sandbox` gates the needs-driven routine/plans, gossip, chemistry drift and scheduled huddles. Authored story mode intentionally keeps the old deterministic pacing. If you add new autonomous behavior, gate it to sandbox or expect `tests/story/*` and `tests/director/story.test.ts` to fail.
- `tests/sim/helpers.ts` `makeSim()` defaults to `sandbox: true`; story tests pass `sandbox: false`. Use the helpers and `invariantErrors()` rather than hand-rolling a sim.
- Needs live in `game/sim/needs.ts`; knowledge/rumors in `game/sim/knowledge.ts`; both feed routine choice, briefs, inspector and saves. Preserve save round-tripping (`game/sim/save.ts`).
- Story choreography is sensitive to extra scenes/asks. In story mode, don’t let ambient chatter supersede scripted scenes; the gates in `sim/scenes.ts` and `sim/core.ts` exist for this.
- Actor frame cache key packs bit flags; `STATUS.naked` is a bit and `specKey` multiplies status by 64. If you add a `STATUS` bit, widen that multiplier. `censored` is a legacy status and renders no censor overlay.

## Testing and visual checks
- Vitest runs in `node` with `tests/**/*.test.ts`; importing `pixi.js` or DOM-only modules into tests will break. Pure renderer modules (`portraitArt.ts`, `actor/art.ts`, `poses.ts`) are safe to import.
- Story tests: `tests/story/*`, `tests/director/story.test.ts`, and `tests/brain/unleashed.test.ts` are the most behavior-sensitive. Prefer targeted runs while iterating.
- Visual harness pages are served by the Vite dev server under `/harness/`: `actors.html`, `fx.html`, `sim.html`, `floor.html`, `brain.html`, `audio.html`, `ui.html`. Example: `/harness/actors.html?view=anims&id=pam&set=0`; `sim.html` exposes `window.__h` for stepping a simulation.
- UI must use the design tokens in `src/renderer/src/design/tokens.ts`; `tokens.css` mirrors it and both must change together.
- `main.tsx` deliberately omits React StrictMode: double-mounting starts two WebGL floors.

## Repo gotchas
- Build output is gitignored: `out/`, `dist-web/`, `dist-android/`, `node_modules/`. Don’t commit generated artifacts or `android/debug.keystore`.
- `CONTRIBUTING.md` claims there is no test suite; that is stale. Trust `package.json` and `vitest.config.ts`.
- CI (`.github/workflows/ci.yml`) runs `npm ci` + `npm run typecheck` (blocking) and `npm run build` (continue-on-error) for PRs to `main`.
- Story tuning constants live at the top of `game/story/*Chapters.ts` and `game/story/heistChapters.ts`; player-facing story words live in the matching `*Text.ts` files. `GAME.md` documents the actual chapter rules.
