// God-mode control surface for the local-LLM office sandbox.
//
// The player is the director: pick the local model, set the scene, run/pause the
// improv, inject events ("the printer's on fire"), nudge a single character, and
// watch the unfolding scene transcript. Pairs with useDirector (the engine).

import { useEffect, useRef, useState } from 'react';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { Icon } from './Icon';
import type { GameState } from '@/game/useDirector';

const label: React.CSSProperties = {
  fontFamily: 'var(--cth-font-display)', fontSize: 9, lineHeight: '12px',
  color: 'var(--cth-ink-500)', textTransform: 'uppercase', letterSpacing: '0.04em'
};
const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px',
  border: '2px solid var(--cth-ink-900)', background: 'var(--cth-cream-50)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)'
};

export function GameDirectorPanel({ game }: { game: GameState }) {
  const { controller, transcript, busy, error, paused, scene, ollama, model, actors } = game;
  const [event, setEvent] = useState('');
  const [nudgeId, setNudgeId] = useState('');
  const [nudgeText, setNudgeText] = useState('');
  const feedRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the transcript to the newest beat.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length]);

  const ready = ollama.available && !!model;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      {/* ── Engine + model ──────────────────────────────────────────────── */}
      <PixelPanel variant="default" title="DIRECTOR" noPadding>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: ollama.available ? 'var(--cth-mint)' : 'var(--cth-coral)'
            }} />
            <span style={{ fontSize: 12, color: 'var(--cth-ink-700)', flex: 1 }}>
              {ollama.checked
                ? (ollama.available ? `Ollama · ${ollama.models.length} model(s)` : 'Ollama offline')
                : 'checking Ollama…'}
            </span>
            <PixelButton variant="ghost" size="sm" onClick={() => controller.refreshOllama()}>
              refresh
            </PixelButton>
          </div>

          {!ollama.available && ollama.checked && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--cth-ink-500)', lineHeight: '16px' }}>
              {ollama.error || 'No local server found.'} Start it with{' '}
              <code style={{ fontFamily: 'var(--cth-font-mono, monospace)' }}>ollama serve</code> and{' '}
              <code style={{ fontFamily: 'var(--cth-font-mono, monospace)' }}>ollama pull llama3.1</code>.
            </p>
          )}

          <div>
            <div style={label}>model</div>
            <select
              value={model}
              onChange={(e) => controller.setModel(e.target.value)}
              style={field}
              disabled={!ollama.available}
            >
              {ollama.models.length === 0 && <option value="">— no models —</option>}
              {ollama.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {paused ? (
              <PixelButton variant="primary" size="md" fullWidth onClick={controller.start} disabled={!ready}>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <Icon name="play" /> run scene
                </span>
              </PixelButton>
            ) : (
              <PixelButton variant="secondary" size="md" fullWidth onClick={controller.pause}>
                pause
              </PixelButton>
            )}
            <PixelButton variant="ghost" size="md" onClick={controller.step} disabled={!ready || busy}>
              step
            </PixelButton>
          </div>
          <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', minHeight: 14 }}>
            {error ? <span style={{ color: 'var(--cth-coral)' }}>⚠ {error}</span>
              : busy ? 'thinking…'
              : paused ? 'paused' : 'live'}
          </div>
        </div>
      </PixelPanel>

      {/* ── Scene ───────────────────────────────────────────────────────── */}
      <PixelPanel variant="default" title="SCENE" noPadding>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={label}>situation</div>
            <input
              style={field}
              value={scene.situation}
              onChange={(e) => controller.setScene({ situation: e.target.value })}
              placeholder="an ordinary Tuesday at the office"
            />
          </div>
          <div>
            <div style={label}>drama · {Math.round(scene.drama * 100)}%</div>
            <input
              type="range" min={0} max={100} value={Math.round(scene.drama * 100)}
              onChange={(e) => controller.setScene({ drama: Number(e.target.value) / 100 })}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </PixelPanel>

      {/* ── God controls ────────────────────────────────────────────────── */}
      <PixelPanel variant="default" title="NUDGE" noPadding>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={label}>inject an event</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...field, flex: 1 }}
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && event.trim()) { controller.injectEvent(event); setEvent(''); }
                }}
                placeholder="the printer bursts into flames"
              />
              <PixelButton
                variant="primary" size="md"
                onClick={() => { if (event.trim()) { controller.injectEvent(event); setEvent(''); } }}
              >
                go
              </PixelButton>
            </div>
          </div>
          <div>
            <div style={label}>prompt a character</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <select value={nudgeId} onChange={(e) => setNudgeId(e.target.value)} style={{ ...field, flex: 1 }}>
                <option value="">— pick someone —</option>
                {actors.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...field, flex: 1 }}
                value={nudgeText}
                onChange={(e) => setNudgeText(e.target.value)}
                placeholder="(optional) what should they do?"
              />
              <PixelButton
                variant="secondary" size="md"
                disabled={!nudgeId}
                onClick={() => { if (nudgeId) { controller.promptCharacter(nudgeId, nudgeText || undefined); setNudgeText(''); } }}
              >
                cue
              </PixelButton>
            </div>
          </div>
        </div>
      </PixelPanel>

      {/* ── Transcript ──────────────────────────────────────────────────── */}
      <PixelPanel variant="default" title="SCENE TRANSCRIPT" noPadding style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          ref={feedRef}
          style={{ flex: 1, minHeight: 80, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {transcript.length === 0 && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--cth-ink-500)', lineHeight: '16px' }}>
              Press <b>run scene</b> to let the office come to life — or inject an event to kick things off.
            </p>
          )}
          {transcript.map((b) => b.speakerId === 'director' ? (
            <div key={b.id} style={{
              fontSize: 12, fontStyle: 'italic', color: 'var(--cth-ink-500)',
              borderLeft: '3px solid var(--cth-lemon)', paddingLeft: 8
            }}>
              ✦ {b.text}
            </div>
          ) : (
            <div key={b.id} style={{ fontSize: 13, lineHeight: '18px' }}>
              <span style={{ fontWeight: 700, color: 'var(--cth-ink-900)' }}>{b.speakerName}: </span>
              <span style={{ color: 'var(--cth-ink-700)' }}>{b.text}</span>
            </div>
          ))}
        </div>
      </PixelPanel>
    </div>
  );
}
