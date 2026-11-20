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
09:00 to 17:00 and ends with a written report. The world saves itself in the browser: grudges,
memories, the share price and the day number carry over. If you close the game part-way through a
day, that day starts again from the morning.

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

### C. A preview inside Claude

The same build can be published as a Claude Artifact, which is a quick way to look at the game on
a phone without setting anything up. A page inside Claude cannot reach a model server, so there
the staff run on the written lines, and Claude itself writes only what follows from your own
actions (a whisper, an announcement, a typed event, the day's report). It asks your permission the
first time. To publish a new one: `npm run build:web`, then publish a page that loads
`assets/index-*.css` and `assets/index-*.js` from `dist-web` with the `sample` capability.

### If it says the model is offline

The game keeps running: the staff fall back to hand-written lines ("instinct") until the model
answers, and it retries by itself every 20 seconds. Open **Settings > Brain**, check the address
and model, and press **Test**: the message says what is wrong in plain words.

A 16 GB model can take up to a minute to load the first time it is asked something.

### If the lines come out wrong

- **People talk out of character, or ignore who they are.** The model is probably reading only the
  end of the prompt. Each request is about 2,000 tokens (the day's report about 2,800), so the model
  needs a context window of 4,096 or more. Current Ollama defaults to that; older versions default
  to 2,048. Check with `ollama show artemis-custom`, and if needed add `PARAMETER num_ctx 4096` to
  its Modelfile and rebuild it. The game never sends this setting itself, because that would make
  Ollama reload the model.
- **Long silences before anyone speaks.** The first request has to read the whole cast (about
  1,600 tokens). After that only the new part is read, as long as nothing else uses the model in
  between. Another program talking to the same model throws that saved work away each time.
- **Odd symbols or half sentences.** The game already repairs or drops broken replies and retries
  once. If it happens a lot, lower **Wildness** in Settings > Brain.

## Development

```bash
npm run dev:web
```

runs the web game at `http://localhost:5173`.

```bash
npm run mock-llm
```

runs a stand-in for Ollama on port 11500 that answers in the right format at 7 tokens a second
(point Settings > Brain at `http://localhost:11500`). It prints how much text each request sent,
and it has deliberately broken "models" for testing how the game copes.

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
- When nothing else is happening, the director starts small talk between two people who are free,
  about something recent, how they feel about each other, or the time of day. Whoever has been
  quiet longest goes first, and the same two do not talk twice in a row.
- A slow model spends its time on dialogue. Rounds of private thoughts and plans happen about once
  every minute and a half instead of every half minute, and people go back to work as soon as the
  last line is spoken rather than waiting for the summary to finish.

In a test against a stand-in server at 7 tokens a second, the first conversation started about
20 seconds into the day and a new three-line conversation followed roughly every 25 to 30 seconds,
with hand-written thought bubbles and reactions in between.

## Notes

- The characters and office are a parody of a well-known TV comedy, and the tile art is LimeZu's
  free pack, which is licensed for non-commercial use only (`src/renderer/src/assets/ATTRIBUTION.md`).
  Fine for a personal project; both would need replacing before any commercial release.
