// DIRECTOR: the old Director panel, kept recognisable. Model light and name,
// play / pause / fast-forward, the day, today's goals and a tip.

import { useEffect, useState } from 'react';
import { formatClock } from '@/game/core/types';
import { GIcon } from './icons';
import { Bar, Btn, Label, Light, Section } from './kit';
import { useContent, useGame, useUi } from './ctx';
import { useNav } from './Dock';

export function brainLight(state: string): { color: string; text: string; blink: boolean } {
  switch (state) {
    case 'online': return { color: 'var(--cth-mint)', text: 'Model online', blink: false };
    case 'connecting': return { color: 'var(--cth-lemon)', text: 'Connecting...', blink: true };
    case 'instinct': return { color: 'var(--cth-lilac)', text: 'Instinct only', blink: false };
    default: return { color: 'var(--cth-coral)', text: 'Model offline', blink: false };
  }
}

export function ModelStatus({ compact }: { compact?: boolean }) {
  const game = useGame();
  const b = useUi((s) => ({ state: s.brain.state, model: s.brain.model, tps: s.brain.tokPerSec, thinking: s.brain.thinking, queued: s.brain.queued }));
  const [testing, setTesting] = useState(false);
  const l = brainLight(b.state);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Light color={l.color} blink={l.blink || b.thinking} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* The speed sits with the status, so a long model name cannot push it out of sight. */}
        <div style={{ fontSize: 14, lineHeight: '16px', color: 'var(--cth-ink-700)', whiteSpace: 'nowrap' }}>
          {l.text}
          {b.state === 'online' && b.tps ? <span style={{ color: 'var(--cth-ink-500)' }}> · {b.tps.toFixed(1)} tok/s</span> : null}
        </div>
        <div style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18, lineHeight: '18px', color: 'var(--cth-ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {b.state === 'instinct' ? 'no model' : b.model}
        </div>
      </div>
      {!compact && (
        <Btn variant="ghost" size="md" icon="refresh" label="Check the model again" disabled={testing} square
          onClick={() => { setTesting(true); game.testBrain().finally(() => setTesting(false)); }} />
      )}
    </div>
  );
}

function TipLine() {
  const { tips } = useContent();
  const [i, setI] = useState(() => Math.floor(Math.random() * Math.max(1, tips.length)));
  useEffect(() => {
    const t = window.setInterval(() => setI((x) => x + 1), 9000);
    return () => window.clearInterval(t);
  }, []);
  if (!tips.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <GIcon name="tip" px={16} style={{ marginTop: 2 }} />
      <span style={{ fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>{tips[i % tips.length]}</span>
    </div>
  );
}

export function DirectorTab() {
  const game = useGame();
  const nav = useNav();
  const s = useUi((st) => ({
    paused: st.paused, speed: st.speed, day: st.day, weekday: st.weekday, clock: Math.floor(st.clock / 5) * 5,
    progress: st.dayProgress, error: st.brain.state === 'offline' ? st.brain.error : null, thinking: st.brain.thinking, queued: st.brain.queued
  }));
  const objectives = useUi((st) => st.objectives);

  return (
    <>
      <Section title="DIRECTOR">
        <ModelStatus />
        {s.error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Set in the terminal face: the advice includes a setting to type, and its asterisk must be readable. */}
            <p style={{ margin: 0, fontFamily: 'var(--cth-font-mono)', fontSize: 17, lineHeight: '17px', color: 'var(--cth-ink-700)' }}>{s.error}</p>
            <Btn size="md" variant="secondary" icon="gear" onClick={() => nav.go('settings')} sound="open">Open brain settings</Btn>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {s.paused ? (
            <Btn variant="primary" size="md" full icon="play" onClick={() => game.setPaused(false)}>Play</Btn>
          ) : (
            <Btn variant="secondary" size="md" full icon="pause" onClick={() => game.setPaused(true)}>Pause</Btn>
          )}
          <Btn variant={s.speed === 2 ? 'accent' : 'ghost'} accent="sky" size="md" icon="ff"
            onClick={() => game.setSpeed(s.speed === 2 ? 1 : 2)} label={s.speed === 2 ? 'Back to normal speed' : 'Fast-forward'}>
            {s.speed === 2 ? '2x' : 'Fast'}
          </Btn>
        </div>
        <div style={{ fontSize: 14, color: 'var(--cth-ink-500)', minHeight: 18 }}>
          {s.paused ? 'Paused. The office is holding its breath.' : s.thinking ? `The staff are thinking${s.queued > 1 ? ` (${s.queued} waiting)` : ''}...` : s.speed === 2 ? 'Running at double speed.' : 'Live.'}
        </div>
      </Section>

      <Section title={`DAY ${s.day}`} right={<span style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 14 }}>{s.weekday}</span>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18 }}>09:00</span>
          <div style={{ flex: 1, position: 'relative' }}>
            <Bar value={s.progress} color="var(--cth-lemon)" h={12} segments={8} />
          </div>
          <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18 }}>17:00</span>
        </div>
        <div style={{ fontSize: 14, color: 'var(--cth-ink-700)' }}>
          It is {formatClock(s.clock)}. {s.progress >= 1 ? 'The day is over.' : `${Math.max(1, Math.round((1 - s.progress) * 8))} hours until home time.`}
        </div>
      </Section>

      <Section title="TODAY'S GOALS" accent="peach">
        {objectives.length === 0 && <div style={{ fontSize: 14, color: 'var(--cth-ink-500)' }}>No goals today. Do as you please.</div>}
        {objectives.map((o) => (
          <div key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', opacity: o.done ? 0.75 : 1 }}>
            <div style={{ width: 24, height: 24, flexShrink: 0, display: 'grid', placeItems: 'center', background: o.done ? 'var(--cth-mint)' : 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)' }}>
              <GIcon name={o.done ? 'check' : o.icon || 'goal'} px={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 16, lineHeight: '18px', textDecoration: o.done ? 'line-through' : undefined }}>{o.title}</div>
              <div style={{ fontSize: 14, lineHeight: '17px', color: 'var(--cth-ink-500)' }}>{o.detail}</div>
              {!o.done && <Bar value={o.progress} color="var(--cth-peach)" h={8} />}
            </div>
          </div>
        ))}
      </Section>

      <Section inset pad={10}>
        <Label>Tip</Label>
        <TipLine />
      </Section>
    </>
  );
}
