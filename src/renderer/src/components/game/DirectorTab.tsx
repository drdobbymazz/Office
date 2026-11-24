// DIRECTOR: the old Director panel, kept recognisable. Model light and name,
// play / pause / fast-forward, the day, today's goals and a tip. In the story the
// mission comes first, with "Finish the day" once nothing left today can change it.

import { useEffect, useState } from 'react';
import { formatClock } from '@/game/core/types';
import { GIcon } from './icons';
import { Bar, Btn, Label, Light, Pips, Rule, Section } from './kit';
import { useContent, useGame, useUi } from './ctx';
import { useNav } from './Dock';
import { ExtraRow, GoalBlock, HintList, INFLUENCE_NOTE, StandingMeter, useStory } from './Story';
import type { StoryUi } from '@/game/app/gameApi';

export function brainLight(state: string): { color: string; text: string; blink: boolean } {
  switch (state) {
    case 'online': return { color: 'var(--cth-mint)', text: 'Model online', blink: false };
    case 'connecting': return { color: 'var(--cth-lemon)', text: 'Connecting...', blink: true };
    case 'instinct': return { color: 'var(--cth-lilac)', text: 'Written lines only', blink: false };
    default: return { color: 'var(--cth-coral)', text: 'Model offline: using written lines', blink: false };
  }
}

export function ModelStatus({ compact }: { compact?: boolean }) {
  const game = useGame();
  const b = useUi((s) => ({ state: s.brain.state, provider: s.brain.provider, model: s.brain.model, tps: s.brain.tokPerSec, thinking: s.brain.thinking, queued: s.brain.queued }));
  // Inside Claude, Claude writes only what follows from the player's own actions.
  const claude = b.provider === 'claude' && b.state === 'online';
  const [testing, setTesting] = useState(false);
  const l = brainLight(b.state);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Light color={l.color} blink={l.blink || b.thinking} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* The speed sits with the status, so a long model name cannot push it out of sight. */}
        <div style={{ fontSize: 14, lineHeight: '16px', color: 'var(--cth-ink-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {claude ? 'Claude answers what you do' : l.text}
          {b.state === 'online' && !claude && b.tps ? <span style={{ color: 'var(--cth-ink-500)' }}> · {b.tps.toFixed(1)} tok/s</span> : null}
        </div>
        <div style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18, lineHeight: '18px', color: 'var(--cth-ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {b.state === 'instinct' ? 'no model' : b.state === 'offline' ? 'You can still play' : claude ? 'the rest is instinct' : b.model}
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

/** Today's influence with its pips: "6/8", or "8/8 +2 bonus" once extra goals have paid out above the budget. */
function InfluenceLine({ left, max }: { left: number; max: number }) {
  const bonus = Math.max(0, left - max);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <GIcon name="influence" px={16} />
        <Label style={{ flex: 1, minWidth: 0 }}>Influence</Label>
        {bonus > 0 && <span style={{ fontSize: 13, lineHeight: '14px', color: '#2f8a45' }}>+{bonus} bonus</span>}
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
          {Math.min(left, max)}<span style={{ color: 'var(--cth-ink-500)' }}>/{max}</span>
        </span>
      </div>
      <Pips left={Math.min(left, max)} max={max} size={12} gap={3} style={{ flexWrap: 'wrap', margin: '2px 0' }} />
      <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{INFLUENCE_NOTE}</div>
    </div>
  );
}

/** Story & Saga mode: today's job in place of random goals, and the way out once settled. */
function MissionSection({ story }: { story: StoryUi }) {
  const game = useGame();
  const finishing = useUi((s) => s.finishing);
  const lost = story.goal.state === 'lost';
  const saga = story.saga;
  return (
    <div data-mission style={{ display: 'flex', flexDirection: 'column', scrollMarginTop: 8 }}>
      <Section title="MISSION" accent="peach" right={
        <span style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 14, whiteSpace: 'nowrap' }}>
          {saga ? `S${saga.season} · ${story.title}` : story.title}
        </span>
      }>
        {saga && (
          <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-700)' }}>
            <strong>{saga.arcTitle}</strong> · {saga.arcTagline}
          </div>
        )}
        <GoalBlock goal={story.goal} />
        {saga?.twist && (
          <div style={{
            padding: '6px 8px 6px 10px', fontSize: 13, lineHeight: '17px', color: 'var(--cth-ink-900)',
            background: 'var(--cth-lilac-light)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-900), inset 4px 0 0 var(--cth-lilac)'
          }}>
            <div className="gu-label" style={{ marginBottom: 2 }}>Reactive twist</div>
            {saga.twist}
          </div>
        )}
        {finishing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
            <GIcon name="ff" px={16} style={{ animation: 'gu-blink 0.5s steps(1) infinite' }} />
            Running to five o'clock. The report comes next.
          </div>
        )}
        {story.canFinish && !finishing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
              {lost
                ? 'Nothing left today can change this. Try again from the morning, or finish the day and see the report.'
                : 'Nothing left today can change the result. Finish the day to run quickly to five o\'clock and the report.'}
            </div>
            {lost && (
              <Btn variant="primary" size="md" full icon="refresh" onClick={() => game.retryDay()}>Try the day again now</Btn>
            )}
            <Btn variant={lost ? 'secondary' : 'primary'} size="md" full icon="ff" sound="confirm" onClick={() => game.finishDay()}>Finish the day</Btn>
          </div>
        )}
        {story.side.length > 0 && (
          <>
            <Label style={{ marginTop: 4 }}>{saga ? 'Bonus goals (+3 standing)' : 'Extra goals'}</Label>
            {story.side.map((g) => <ExtraRow key={g.id} goal={g} worth={saga ? 3 : undefined} />)}
          </>
        )}
        <Rule />
        <StandingMeter value={story.standing} />
        {!saga && <InfluenceLine left={story.influence.left} max={story.influence.max} />}
        {story.hints.length > 0 && (
          <>
            <Rule />
            <Label>Clues</Label>
            <HintList hints={story.hints} />
          </>
        )}
        {story.help.length > 0 && (
          <>
            <Rule />
            <Label>Stuck? How to do it</Label>
            <HintList hints={story.help} />
          </>
        )}
      </Section>
    </div>
  );
}

/** "About 3 hours until home time", "40 minutes until home time". */
function untilHome(clock: number): string {
  const mins = Math.max(0, 17 * 60 - clock);
  if (mins <= 0) return 'The day is over.';
  if (mins < 60) return `${Math.max(5, Math.round(mins / 5) * 5)} minutes until home time.`;
  const h = Math.round(mins / 60);
  return `About ${h} ${h === 1 ? 'hour' : 'hours'} until home time.`;
}

export function DirectorTab() {
  const game = useGame();
  const nav = useNav();
  const s = useUi((st) => ({
    paused: st.paused, speed: st.speed, day: st.day, weekday: st.weekday, clock: Math.floor(st.clock / 5) * 5, finishing: st.finishing,
    progress: st.dayProgress, error: st.brain.state === 'offline' ? st.brain.error : null, thinking: st.brain.thinking, queued: st.brain.queued
  }));
  const objectives = useUi((st) => st.objectives);
  const story = useStory();
  const [why, setWhy] = useState(false);

  const status = s.finishing ? "Running to five o'clock."
    : s.paused ? 'Paused. Tap Play, or the clock at the top, to carry on.'
      : s.thinking ? `The staff are thinking${s.queued > 1 ? ` (${s.queued} waiting)` : ''}...`
        : s.speed === 2 ? 'Running at double speed.' : 'Running at normal speed.';

  const director = (
    <Section title="DIRECTOR">
      <ModelStatus />
      {s.error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn size="md" variant="ghost" onClick={() => setWhy(!why)} sound="tap">{why ? 'Hide' : 'Why?'}</Btn>
            <Btn size="md" variant="secondary" icon="gear" full onClick={() => nav.go('settings')} sound="open">Brain settings</Btn>
          </div>
          {/* Set in the terminal face: the advice includes a setting to type, and its asterisk must be readable. */}
          {why && <p style={{ margin: 0, fontFamily: 'var(--cth-font-mono)', fontSize: 17, lineHeight: '17px', color: 'var(--cth-ink-700)' }}>{s.error}</p>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {s.paused ? (
          <Btn variant="primary" size="md" full icon="play" disabled={s.finishing} onClick={() => game.setPaused(false)}>Play</Btn>
        ) : (
          <Btn variant="secondary" size="md" full icon="pause" disabled={s.finishing} onClick={() => game.setPaused(true)}>Pause</Btn>
        )}
        <Btn variant={s.speed === 2 ? 'accent' : 'ghost'} accent="sky" size="md" icon="ff" disabled={s.finishing}
          onClick={() => game.setSpeed(s.speed === 2 ? 1 : 2)} label={s.speed === 2 ? 'Back to normal speed' : 'Fast-forward'}>
          {s.speed === 2 ? '2x' : 'Fast'}
        </Btn>
      </div>
      <div style={{ fontSize: 14, color: 'var(--cth-ink-500)', minHeight: 18 }}>{status}</div>
    </Section>
  );

  const day = (
    <Section title={`DAY ${s.day}`} right={<span style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 14 }}>{s.weekday}</span>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18 }}>09:00</span>
        <div style={{ flex: 1, position: 'relative' }}>
          <Bar value={s.progress} color="var(--cth-lemon)" h={12} segments={8} />
        </div>
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18 }}>17:00</span>
      </div>
      <div style={{ fontSize: 14, color: 'var(--cth-ink-700)' }}>
        It is {formatClock(s.clock)}. {s.progress >= 1 ? 'The day is over.' : untilHome(s.clock)}
      </div>
    </Section>
  );

  // The story's mission comes first: it is what the player opens this tab for.
  if (story) {
    return (
      <>
        <MissionSection story={story} />
        {director}
        {day}
      </>
    );
  }

  return (
    <>
      {director}
      {day}
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
