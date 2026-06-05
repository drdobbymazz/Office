# Local-LLM Office Sandbox

The floor is now a **director / god-mode roleplaying sandbox** powered entirely by a
**local model via [Ollama](https://ollama.com/)** — no Claude, no cloud, no API keys.
The Office cast become LLM-driven NPCs that improvise and react to each other while
*you* set the scene, inject events, nudge individual characters, and dial the drama.

## What you do

- **Run the scene** — the Director picks characters, builds a prompt from their persona +
  the current scene + the recent transcript, asks your local model for their next line,
  and plays it out as dialogue (a thought cloud over the avatar) + movement on the floor.
- **Set the scene** — situation text + a drama slider (higher = faster, more heightened).
- **Inject an event** — "the printer bursts into flames" — and watch the room react.
- **Cue a character** — force someone to speak next, optionally with a private instruction.
- Conversations stay coherent: a line aimed at a coworker opens a short two-person scene,
  and an `approach` walks the speaker over to whoever they addressed.

## Memory & continuity

- **Each character remembers.** Every line a character says or hears enters their working
  memory, which is fed back into their next prompt — so grudges, jokes, and threads persist
  through the session instead of resetting every beat. The cue panel shows what's *on a
  character's mind* (a reflected one-line summary the model distils as their memory fills up).
- **Days.** Press **new day →** to roll the world over: the visible scene clears but everyone
  *keeps their memory*, so yesterday's drama carries into the morning.
- **The world saves itself.** Scene, day, transcript, and every character's memory persist to
  `localStorage` and resume automatically on reload. Wipe it from **Settings → reset world**.

## Run it locally (desktop, Electron)

```bash
# 1. Start your local model server and pull a model
ollama serve
ollama pull danger            # the default model name; use any tag you like

# 2. Run the app
npm install                   # rebuilds node-pty for Electron
npm run dev
```

Open the **Director** panel (right side), pick your model, and press **run scene**.
Point at a non-default server or model in **Settings** (gear icon).

## Run it on the web / deploy to Vercel

The game UI is a plain static SPA, so it deploys to Vercel as-is. It talks to **your own
local Ollama** directly from the browser.

```bash
npm run dev:web               # local dev server
npm run build:web             # static build → dist-web/
```

Deploy: import the repo on Vercel (config is in [`vercel.json`](./vercel.json) — build
`npm run build:web`, output `dist-web`). Because the page runs over HTTPS but reaches
`http://localhost:11434`, you must start Ollama allowing the page's origin:

```bash
OLLAMA_ORIGINS=https://your-app.vercel.app ollama serve
# (for local web dev: OLLAMA_ORIGINS=http://localhost:5173 ollama serve)
```

> Chromium browsers allow an HTTPS page to reach `http://localhost` / `http://127.0.0.1`
> (the localhost secure-context exception), so the local model is reachable without a tunnel.
> Each visitor uses the Ollama running on *their own* machine — fully local, nothing leaves it.

## Architecture (game mode)

| Piece | Role |
|---|---|
| `src/main/ollama.ts` | Ollama HTTP bridge (Electron) — model list + JSON-constrained chat. |
| `src/renderer/src/platform/cthWeb.ts` | Browser adapter — config in `localStorage`, Ollama over `fetch`. Installed when there's no Electron preload. |
| `src/renderer/src/game/personas.ts` | Voice cards for all 15 cast members. |
| `src/renderer/src/game/director.ts` | The engine: beat scheduler, prompt assembly, two-person scene focus. |
| `src/renderer/src/game/useDirector.ts` | Seeds the cast as NPCs, runs the Director, pipes beats to the floor. |
| `src/renderer/src/components/GameDirectorPanel.tsx` | God-mode control surface. |
