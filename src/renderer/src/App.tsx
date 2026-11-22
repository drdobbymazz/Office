import { useEffect, useRef, useState } from 'react';
import { createGame, type Game } from '@/game/game';
import { GameUI } from '@/components/game/GameUI';
import { createActorView, portraitUrl } from '@/scene/office/actor';
import { createFxView } from '@/scene/office/fx';
import { createSim } from '@/game/sim';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { claudeAvailable, createBrain, createReflexes, probeOllama } from '@/game/brain';
import { createAudio } from '@/game/audio';
import { BANK, SUGGESTIONS, TIPS } from '@/game/core/content';
import { colors } from '@/design/tokens';
import './game.css';

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/** Load every face and weight the interface uses, but never hold the game up for more than a couple of seconds. */
function fontsReady(): Promise<void> {
  const faces = ['400 14px "Pixelify Sans"', '500 14px "Pixelify Sans"', '700 16px "Pixelify Sans"', '12px "Press Start 2P"', '16px "VT323"'];
  // 'Aa5': the digit 5 comes from its own small face (see design/global.css), so ask for it too.
  const all = Promise.all(faces.map((f) => document.fonts.load(f, 'Aa5'))).then(() => undefined, () => undefined);
  const limit = new Promise<void>((resolve) => setTimeout(resolve, 2500));
  return Promise.race([all, limit]);
}

/**
 * The game: the office floor fills the window (a Pixi canvas owned by the game),
 * and the interface is laid over it.
 */
export function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let made: Game | null = null;
    // Speech bubbles are measured as they are made, so the fonts must be in before the first line is spoken.
    fontsReady().then(() => createGame(host, {
      createActorView, createFxView, portraitUrl, createSim, chaosScripts: CHAOS_SCRIPTS,
      createBrain, createReflexes, probeOllama, claudeAvailable, createAudio, bank: BANK
    }))
      .then((g) => {
        if (cancelled) {
          g.destroy();
          return;
        }
        made = g;
        setGame(g);
        // For poking at the running game from the console and from tests.
        (window as unknown as { __game?: Game }).__game = g;
      })
      .catch((err: unknown) => {
        console.error('[game] failed to start', err);
        if (!cancelled) setError(err instanceof Error ? err.stack || err.message : String(err));
      });
    return () => {
      cancelled = true;
      made?.destroy();
    };
  }, []);

  return (
    <div className="md-game" style={{ background: hex(colors.ink[900]) }}>
      <div ref={hostRef} className="md-floor" />
      {game && <GameUI game={game} suggestions={SUGGESTIONS} tips={TIPS} />}
      {error && (
        <pre className="md-crash">
          The office could not start.{'\n\n'}
          {error}
        </pre>
      )}
    </div>
  );
}
