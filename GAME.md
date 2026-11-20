# Munder Difflin: the living office

A pixel-art office whose fifteen staff think for themselves, and you are the unseen force that
makes things happen to them. Played on a phone held sideways (it also works in a desktop browser
and in the Electron app).

Every worker is played by **your own local model through [Ollama](https://ollama.com/)**
(default: `artemis-custom`). No cloud, no API key. The model writes what each person says, what
they feel, what they decide to do next, and how they feel about each other afterwards.

## What you do

You are the **Overseer**. The staff do not know you exist.

- **Powers**: 34 events in four groups.
  - *Disasters*: fire, burst pipe, blackout, earthquake, fire drill, locked in, Wi-Fi down, snack storm.
  - *Weird*: abduction, haunting, zero gravity, time freeze, smite, shrink ray, embiggen, body swap, disco fever, bees, raccoon.
  - *Treats*: pizza party, office puppy, bonus rain, surprise party, triple espresso.
  - *Mind games*: Cupid's arrow, grudge, truth serum, nap attack, paranoia, layoff rumour, all-hands, inspection, boss for a day, leak a secret.
- **Whisper** a thought into one person's head. They think it is their own idea.
- **Announce** something over the loudspeaker to everyone.
- **Anything**: type any event at all ("a horse walks into the office"). The model works out what it is, it appears on the floor, and the staff have to deal with it.
- **Pick people up**: press on someone, then drag. Let go to drop them, or fling them.
- **Tap** someone to see their mood, what they are thinking, who they like and dislike, what they remember, and (once it comes out) their secret.

The staff remember what happens, hold grudges, form plans and act on them. Each office day runs
09:00 to 17:00 and ends with a written report. The world saves itself in the browser.

### Touch controls

| Gesture | What it does |
|---|---|
| Drag empty floor | Pan |
| Pinch | Zoom |
| Double tap | Zoom in on that spot, or back out |
| Tap a person | Select and follow them |
| Press a person, then drag | Pick them up; release to drop or fling |

## Playing on your phone

The page has to be able to reach the laptop that runs Ollama. There are two good ways.

### A. Serve it from the laptop (simplest at home)

On the laptop that runs Ollama:

```bash
npm install --ignore-scripts
```

```bash
npm run build:web
```

```bash
npm run serve
```

It prints addresses such as `http://MSI.local:8787`. Open one on your phone (same Wi-Fi), turn the
phone sideways, and press **Start the day**. This small server hands out the game and forwards
model requests to Ollama on the same machine, so there is nothing to configure in Ollama and no
browser security settings to fight. Options: `--port 8787`, `--ollama http://127.0.0.1:11434`.

### B. Hosted page plus Tailscale (works away from home)

Deploy the web build anywhere static (the repo's `vercel.json` already builds it for Vercel:
`npm run build:web`, output `dist-web`). Because a hosted page is `https`, the model address must be
`https` too: use the laptop's Tailscale Serve address (the default in Settings is
`https://msi.tail780d1f.ts.net`). Ollama must allow the page's origin:

```bash
OLLAMA_ORIGINS=https://your-app.vercel.app ollama serve
```

The phone must be on the tailnet, and Tailscale must be signed in on the laptop.

### If it says the model is offline

The game keeps running: the staff fall back to hand-written lines ("instinct") until the model
answers, and it retries by itself every 20 seconds. Open **Settings > Brain**, check the address
and model, and press **Test**: the message says what is wrong in plain words.

A 16 GB model can take up to a minute to load the first time it is asked something.

## Development

```bash
npm run dev:web
```

runs the web game at `http://localhost:5173`.

```bash
npm run mock-llm
```

runs a stand-in for Ollama on port 11500 that answers in the right format at 7 tokens a second
(point Settings > Brain at `http://localhost:11500`). It also has deliberately broken "models" for
testing how the game copes.

```bash
npm test
```

runs the logic tests (map, simulation, brain, written lines).

`npm run dev` still runs the Electron build.

## How it is put together

| Piece | Where | Role |
|---|---|---|
| Map, rooms, desks | `src/renderer/src/game/core/world.ts` | The existing Tiled map as logic: walkable tiles, rooms, named spots, paths. |
| The fifteen people | `src/renderer/src/game/core/cast.ts` | Personas, temperaments, voices, how they feel about each other on day one. |
| Powers | `src/renderer/src/game/core/chaos.ts`, `game/sim/chaos/` | The catalogue, and one script per event. |
| Simulation | `src/renderer/src/game/sim/` | Headless and deterministic: movement, routines, the working day, being picked up, memory, relationships, meters, saving. |
| Brain | `src/renderer/src/game/brain/` | Ollama / OpenAI-compatible / Claude transports with streaming, prompts, tolerant parsing, the instinct fallback, health tracking. |
| Director | `src/renderer/src/game/director/` | Decides when the model is asked for something and plays what it writes on the floor. |
| Floor | `src/renderer/src/scene/office/floor/`, `actor/`, `fx/` | The original map renderer plus expressive sprites, pixel effects, and a touch camera. |
| Interface | `src/renderer/src/components/game/` | The phone-landscape UI in the original cream pixel style. |
| Sound | `src/renderer/src/game/audio/` | Everything synthesized at runtime: effects, each person's talking blips, adaptive music. |
| Game | `src/renderer/src/game/game.ts` | Wires all of the above together behind one `GameApi`. |

### How the model is used at 7 tokens a second

- One request at a time. A **scene** (a few lines between people who are together) streams, so the
  first line is spoken while the rest is still being written.
- The long, unchanging part of every prompt (the setting, the fifteen people, the rules) is
  identical between calls, so Ollama reuses it and only reads the new part.
- Replies are constrained to a JSON shape and capped in length. Anything unusable is retried once,
  then answered from the written fallback, so the game never stalls.
- Reflexes ("FIRE!") come from hand-written lines at once; the model's fuller reaction follows a
  few seconds later.

## Notes

- The characters and office are a parody of a well-known TV comedy, and the tile art is LimeZu's
  free pack, which is licensed for non-commercial use only (`src/renderer/src/assets/ATTRIBUTION.md`).
  Fine for a personal project; both would need replacing before any commercial release.
