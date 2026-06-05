// Game-mode glue: seed the office cast as local-LLM NPCs, run the Director, and
// surface its live transcript + controls to the God panel.
//
// Mirrors useHive's role for the Claude harness, but for the Ollama sandbox: it
// only activates when config.mode === 'game'. It seeds the cast into the store
// (PTY-less NPCs the floor already knows how to animate), spins up a Director,
// pipes each beat to the floor (a thought cloud above the speaker) and the
// sidebar, and returns a controller the UI drives.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type Agent } from '@/store/store';
import type { HarnessConfig } from '@/store/config';
import { OFFICE_CAST, type OfficeCharacterName } from '@/scene/office/cast';
import type { AccentColorName } from '@/design/tokens';
import { Director, type Beat, type DirectorActor, type DirectorScene } from './director';
import { personaFor } from './personas';

const ACCENTS: AccentColorName[] = ['coral', 'mint', 'sky', 'lemon', 'lilac', 'peach'];
const DEFAULT_PACE_SEC = 7;
/** How many beats of transcript the panel keeps in view. */
const PANEL_TRANSCRIPT_MAX = 120;

/** The starting cast — the full Office ensemble. */
const DEFAULT_CAST: OfficeCharacterName[] = OFFICE_CAST.map((c) => c.name);

function npcAgent(name: OfficeCharacterName, idx: number): Agent {
  const member = OFFICE_CAST.find((c) => c.name === name)!;
  return {
    id: `npc-${name}`,
    name: member.displayName,
    character: name,
    accent: ACCENTS[idx % ACCENTS.length],
    description: personaFor(name).role,
    project: 'office-game',
    tmuxTarget: '',
    cwd: '',
    status: 'idle',
    action: 'idle',
    progress: 0,
    currentStation: 'desk',
    isNpc: true,
    recentTextTs: Date.now()
  };
}

export interface GameController {
  start: () => void;
  pause: () => void;
  step: () => void;
  injectEvent: (text: string) => void;
  promptCharacter: (actorId: string, instruction?: string) => void;
  setScene: (patch: Partial<DirectorScene>) => void;
  /** Switch the active model live (and persist it to config). */
  setModel: (model: string) => void;
  /** Re-check the Ollama server + refresh the installed-model list. */
  refreshOllama: (baseUrl?: string) => void;
}

export interface GameState {
  active: boolean;
  controller: GameController;
  transcript: Beat[];
  busy: boolean;
  error: string | null;
  paused: boolean;
  scene: DirectorScene;
  ollama: { checked: boolean; available: boolean; models: string[]; error?: string };
  model: string;
  actors: DirectorActor[];
}

export function useDirector(config: HarnessConfig | null): GameState {
  const active = !!config?.onboardingComplete && config.mode === 'game';

  const [transcript, setTranscript] = useState<Beat[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const [scene, setSceneState] = useState<DirectorScene>({
    location: 'the Scranton branch bullpen',
    situation: 'an ordinary Tuesday at the office',
    drama: 0.35
  });
  const [ollama, setOllama] = useState<GameState['ollama']>({
    checked: false, available: false, models: []
  });

  // Live override so picking a model in the panel takes effect without a reload
  // (App loads config once). Falls back to the persisted choice, then the first
  // installed model.
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const model = modelOverride || config?.gameModel || ollama.models[0] || '';
  const directorRef = useRef<Director | null>(null);

  // Read the live NPC roster straight from the store (no React dep — the Director
  // pulls it on demand each beat so it always sees who's actually on the floor).
  const getActors = (): DirectorActor[] =>
    useStore.getState().agents
      .filter((a) => a.isNpc)
      .map((a) => ({ id: a.id, displayName: a.name, character: a.character }));

  // 1) Seed the cast into the store when game mode turns on; clear it on exit.
  useEffect(() => {
    if (!active) return;
    const npcs = DEFAULT_CAST.map((name, i) => npcAgent(name, i));
    useStore.getState().seedCast(npcs);
  }, [active]);

  // 2) Probe Ollama once game mode is active (and whenever the base URL changes).
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    window.cth.ollamaStatus(config?.llmBaseUrl).then((s) => {
      if (cancelled) return;
      setOllama({ checked: true, available: s.available, models: s.models, error: s.error });
    });
    return () => { cancelled = true; };
  }, [active, config?.llmBaseUrl]);

  // 3) Build the Director. Re-created only when game mode flips; config (model,
  //    base URL) is pushed in via setConfig so we don't tear down on every edit.
  useEffect(() => {
    if (!active) { directorRef.current?.dispose(); directorRef.current = null; return; }
    const director = new Director(
      { baseUrl: config?.llmBaseUrl, model, basePaceSec: DEFAULT_PACE_SEC },
      {
        getActors,
        onBeat: (beat) => {
          setTranscript((prev) => [...prev, beat].slice(-PANEL_TRANSCRIPT_MAX));
          if (beat.speakerId === 'director') return;
          // Speak above the avatar + mirror into the sidebar feed.
          window.dispatchEvent(new CustomEvent('cth:game-say', {
            detail: { id: beat.speakerId, text: beat.text }
          }));
          useStore.getState().updateAgent(beat.speakerId, {
            recentAssistantText: beat.text,
            recentTextTs: Date.now()
          });
          // An "approach" beat flies a paper envelope to the target for flair.
          if (beat.action === 'approach' && beat.targetId) {
            window.dispatchEvent(new CustomEvent('cth:demo-handoff', {
              detail: { from: beat.speakerId, to: beat.targetId, act: 'inform' }
            }));
          }
        },
        onBusy: setBusy,
        onError: (m) => setError(m)
      }
    );
    directorRef.current = director;
    return () => { director.dispose(); directorRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // 4) Keep the running Director's model / base URL in sync with config + probe.
  useEffect(() => {
    directorRef.current?.setConfig({ model, baseUrl: config?.llmBaseUrl });
  }, [model, config?.llmBaseUrl]);

  const controller = useMemo<GameController>(() => ({
    start: () => {
      setError(null);
      directorRef.current?.start();
      setPaused(false);
    },
    pause: () => {
      directorRef.current?.pause();
      setPaused(true);
    },
    step: () => { setError(null); directorRef.current?.step(); },
    injectEvent: (text) => directorRef.current?.injectEvent(text),
    promptCharacter: (id, instruction) => directorRef.current?.promptCharacter(id, instruction),
    setScene: (patch) => {
      directorRef.current?.setScene(patch);
      setSceneState((s) => ({ ...s, ...patch }));
    },
    setModel: (m) => {
      setModelOverride(m);
      window.cth.updateConfig({ gameModel: m });
    },
    refreshOllama: (baseUrl) => {
      window.cth.ollamaStatus(baseUrl ?? config?.llmBaseUrl).then((s) =>
        setOllama({ checked: true, available: s.available, models: s.models, error: s.error }));
    }
  }), [config?.llmBaseUrl]);

  const actors = active
    ? useStore.getState().agents.filter((a) => a.isNpc)
        .map((a) => ({ id: a.id, displayName: a.name, character: a.character }))
    : [];

  return { active, controller, transcript, busy, error, paused, scene, ollama, model, actors };
}
