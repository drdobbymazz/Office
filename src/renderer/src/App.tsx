import { useEffect, useRef, useState } from 'react';
import { createGame, type Game } from '@/game/game';
import { GameUI } from '@/components/game/GameUI';
import { createActorView, portraitUrl } from '@/scene/office/actor';
import { createFxView } from '@/scene/office/fx';
import { createSim } from '@/game/sim';
import { claudeAvailable, createBrain, createReflexes, probeOllama } from '@/game/brain';
import { createAudio } from '@/game/audio';
import { BANK, SUGGESTIONS, TIPS } from '@/game/core/content';
import { colors } from '@/design/tokens';
import './game.css';

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

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
    createGame(host, {
      createActorView, createFxView, portraitUrl, createSim, chaosScripts: [],
      createBrain, createReflexes, probeOllama, claudeAvailable, createAudio, bank: BANK
    })
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
