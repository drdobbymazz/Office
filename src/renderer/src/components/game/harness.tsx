// Harness for the game UI: the real office map in a small Pixi canvas, the
// mock game, and GameUI on top. URL parameters open any state directly:
//   ?screen=play|title|report  &tab=director|powers|people|log|settings  &collapsed=1
//   &target=room|person|pair   &person=dwight  &offline=1  &artifact=1  &portrait=1 (play anyway)
//   &tutorial=1  &bubbles=1 (demo bubbles, fully typed)  &quiet=1 (no new lines)  &icons=1 (icon sheet)

import '@fontsource/press-start-2p';
import '@fontsource/pixelify-sans';
import '@fontsource/vt323';
import '@/design/global.css';
import 'pixi.js/unsafe-eval';
import { createRoot } from 'react-dom/client';
import { Application, Container, Sprite } from 'pixi.js';
import { loadOfficeMap } from '@/scene/office/mapLoader';
import { getCastFrames, type OfficeCharacterName } from '@/scene/office/cast';
import type { CastId, ChaosId } from '@/game/core/types';
import { GameUI, type GameUIInitial } from './GameUI';
import { createMock, type MockGame } from './mockGame';
import { PLACEHOLDER_SUGGESTIONS, PLACEHOLDER_TIPS } from './placeholders';
import { ALL_ICON_NAMES, GIcon, badIconGrids } from './icons';
import { EMOTIONS } from '@/game/core/types';
import type { TabId } from './words';

declare global {
  interface Window { __ready?: boolean; __h?: Record<string, unknown> }
}

const q = new URLSearchParams(location.search);
const flag = (k: string) => q.get(k) === '1';

async function startFloor(game: MockGame) {
  const host = document.getElementById('floor')!;
  const app = new Application();
  await app.init({ background: 0x1a1320, antialias: false, roundPixels: true, resolution: 1, resizeTo: window });
  host.appendChild(app.canvas);
  const world = new Container();
  app.stage.addChild(world);
  try {
    const map = await loadOfficeMap();
    world.addChild(map.getContainer());
  } catch (e) {
    console.warn('map failed', e);
  }
  const people = new Container();
  people.sortableChildren = true;
  world.addChild(people);
  const sprites = new Map<string, Sprite>();
  for (const p of game.positions()) {
    const frames = await getCastFrames(p.id as OfficeCharacterName);
    const s = new Sprite(frames[0][0]);
    s.anchor.set(0.5, 1);
    people.addChild(s);
    sprites.set(p.id, s);
  }
  app.ticker.add(() => {
    world.scale.set(game.camera.scale);
    world.position.set(game.camera.x, game.camera.y);
    for (const p of game.positions()) {
      const s = sprites.get(p.id);
      if (!s) continue;
      s.visible = p.present;
      s.position.set(Math.round(p.x), Math.round(p.y));
      s.zIndex = p.y;
    }
  });
}

function IconSheet() {
  const bad = badIconGrids();
  const names = [...ALL_ICON_NAMES, ...EMOTIONS.map((e) => `emo-${e}`), 'gear', 'x', 'check', 'arrow-right'];
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: 'var(--cth-cream-100)', padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start' }}>
      {bad.length > 0 && <pre style={{ width: '100%', color: 'red' }}>{bad.join('\n')}</pre>}
      {names.map((n) => (
        <div key={n} style={{ width: 76, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}><GIcon name={n} px={16} /><GIcon name={n} px={32} /></div>
          <span style={{ fontSize: 11, fontFamily: 'var(--cth-font-mono)' }}>{n}</span>
        </div>
      ))}
    </div>
  );
}

async function main() {
  const root = createRoot(document.getElementById('root')!);
  if (flag('icons')) {
    root.render(<IconSheet />);
    window.__ready = true;
    return;
  }
  const game = createMock({ offline: flag('offline'), inArtifact: flag('artifact') });
  const screen = q.get('screen') ?? 'play';
  if (screen === 'title') game.store.setState({ phase: 'title' });
  if (flag('tutorial')) game.store.setState((s) => ({ settings: { ...s.settings, tutorialDone: false } }));
  if (flag('quiet') || flag('bubbles')) game.setChatter(false);

  const initial: GameUIInitial = {
    tab: (q.get('tab') as TabId) ?? undefined,
    open: !flag('collapsed'),
    playAnyway: flag('portrait')
  };
  const target = q.get('target');
  if (target) {
    initial.tab = 'powers';
    initial.chaos = ({ room: 'fire', person: 'smite', pair: 'love' } as Record<string, ChaosId>)[target];
  }
  const person = q.get('person');
  if (person) {
    initial.tab = 'people';
    initial.personId = person;
    game.store.setState({ selectedId: person });
  }

  await startFloor(game);
  // Let people walk about a little so the floor looks lived in.
  if (!flag('still')) game.step(2);

  if (screen === 'report') game.showReport();
  if (flag('bubbles')) demoBubbles(game);
  if (q.get('cool') === '1') {
    game.triggerChaos('fire', { room: 'kitchen' });
    game.triggerChaos('quake', {});
    game.triggerChaos('blackout', {});
  }

  root.render(<GameUI game={game} suggestions={PLACEHOLDER_SUGGESTIONS} tips={PLACEHOLDER_TIPS} initial={initial} />);

  window.__h = {
    game,
    step: (s: number) => game.step(s),
    report: () => game.showReport(),
    say: (who: CastId, text: string, kind?: 'say' | 'shout' | 'whisper' | 'think') => game.say(who, text, kind ?? 'say', true),
    bubbles: () => demoBubbles(game),
    offline: (v: boolean) => game.setOffline(v),
    fire: (id: ChaosId, room?: string) => game.triggerChaos(id, room ? { room: room as never } : {})
  };
  window.setTimeout(() => { window.__ready = true; }, 400);
}

function demoBubbles(game: MockGame) {
  game.say('michael', 'Everybody, conference room, five minutes. This is not a drill. It might be a drill.', 'say', true);
  game.say('dwight', 'FIRE! Nobody touch anything!', 'shout', true);
  game.say('pam', 'Did anyone else hear that?', 'whisper', true);
  game.say('stanley', 'Seven more hours. I can do this.', 'think', true);
  game.say('kevin', 'Not the muffins.', 'say', true);
  game.say('angela', 'I knew it was Oscar.', 'say', true);
}

main();
