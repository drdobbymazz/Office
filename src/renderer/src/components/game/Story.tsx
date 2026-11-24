// Story mode pieces shared by the chapter card, the mission chip, the Director
// tab, the report and the ending: goal rows, the week strip, the standing and
// influence meters, and what an action costs today. Same parts as the rest of
// the overlay (icon tiles, bars, pips, the pixel fonts); nothing new.

import type { ActionId, StoryGoalUi, StoryUi } from '@/game/app/gameApi';
import { STANDING } from '@/game/story/rules';
import { GIcon } from './icons';
import { Bar, IconTile, Label, Light, Pips, StandingBar, standingWord } from './kit';
import { ENDING_RULE_TEXT } from './storyNumbers';
import { useUi } from './ctx';

/** Each extra goal done is worth this much standing (from the story rules, so the two never disagree). */
export const EXTRA_WORTH = STANDING.extra;

export const STANDING_NOTE = 'How likely Corporate is to keep the branch open';
/** How the week ends, from the story rules (the same numbers the standing bar marks). */
export const MARKS_NOTE = ENDING_RULE_TEXT;
export const INFLUENCE_NOTE = 'Powers and tools cost influence. Picking people up and poking them is free.';

export function useStory(): StoryUi | null {
  return useUi((s) => s.story);
}

export function notEnough(cost: number, left: number): string {
  return `Not enough influence: this costs ${cost}, you have ${left}.`;
}

/** What an action costs today, and why it cannot be used. Null in the sandbox. */
export interface CostInfo {
  cost: number;
  left: number;
  /** "Not enough influence: ..." when it costs more than is left, else null. */
  short: string | null;
  /** The plain reason a power is locked today, else null. */
  locked: string | null;
}

export function useCost(id: ActionId): CostInfo | null {
  return useUi((s) => costOf(s.story, id));
}

export function costOf(story: StoryUi | null, id: ActionId): CostInfo | null {
  if (!story || story.saga) return null;
  const cost = story.costs[id] ?? 0;
  const left = story.influence.left;
  const locked = (story.locked as Record<string, string | undefined>)[id] ?? null;
  return { cost, left, short: cost > left ? notEnough(cost, left) : null, locked };
}

// ── goals ──

export function tileIcon(g: StoryGoalUi): string {
  return g.state === 'won' ? 'check' : g.state === 'lost' ? 'x' : g.icon || 'goal';
}
export function tileBg(state: StoryGoalUi['state']): string {
  return state === 'won' ? 'var(--cth-mint)' : state === 'lost' ? 'var(--cth-coral)' : 'var(--cth-cream-50)';
}

/** The live status line under a goal, with a square light: lemon while open, mint when won, coral when lost. */
export function GoalStatus({ goal }: { goal: StoryGoalUi }) {
  const text = goal.state === 'won' ? goal.status || 'Done' : goal.state === 'lost' ? goal.status || 'Failed' : goal.status;
  if (!text) return null;
  const color = goal.state === 'won' ? 'var(--cth-mint)' : goal.state === 'lost' ? 'var(--cth-coral)' : 'var(--cth-lemon)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, lineHeight: '17px', color: 'var(--cth-ink-700)' }}>
      <Light color={color} />
      <span style={{ minWidth: 0 }}>{text}</span>
    </div>
  );
}

/** The main goal: icon tile, title, one plain sentence, and (while playing) the status and progress. */
export function GoalBlock({ goal, tile = 32, live = true }: { goal: StoryGoalUi; tile?: number; live?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <IconTile icon={tileIcon(goal)} size={tile} bg={tileBg(goal.state)} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 17, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>{goal.title}</div>
        <div style={{ fontSize: 14, lineHeight: '17px', color: 'var(--cth-ink-500)' }}>{goal.detail}</div>
        {live && <GoalStatus goal={goal} />}
        {live && goal.state === 'open' && <Bar value={goal.progress} color="var(--cth-peach)" h={10} segments={10} />}
      </div>
    </div>
  );
}

/** One extra goal: a small tile that becomes a check, the title, the detail and what it is worth. */
export function ExtraRow({ goal, live = true, worth }: { goal: StoryGoalUi; live?: boolean; worth?: number }) {
  const done = goal.state === 'won';
  const lost = goal.state === 'lost';
  const pts = worth ?? EXTRA_WORTH;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', opacity: lost ? 0.6 : done ? 0.8 : 1 }}>
      <IconTile icon={done ? 'check' : lost ? 'x' : goal.icon || 'goal'} size={24} bg={done ? 'var(--cth-mint)' : lost ? 'var(--cth-cream-300)' : 'var(--cth-cream-50)'} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 15, lineHeight: '18px', textDecoration: done ? 'line-through' : undefined }}>{goal.title}</div>
        <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{goal.detail}</div>
        {live && goal.state === 'open' && goal.status && (
          <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-700)' }}>{goal.status}</div>
        )}
      </div>
      <span title={`Worth ${pts} standing`} style={{
        fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '18px', flexShrink: 0,
        color: done ? '#2f8a45' : lost ? 'var(--cth-ink-300)' : 'var(--cth-ink-500)'
      }}>+{pts}</span>
    </div>
  );
}

// ── meters ──

/** Branch standing (or Team Spirit) with its plain label: the number, the bar, and what it means. */
export function StandingMeter({ value, from, note = true, label, noteText }: {
  value: number; from?: number; note?: boolean; label?: string; noteText?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <GIcon name="branch" px={16} />
        <Label style={{ flex: 1, minWidth: 0 }}>{label ?? 'Branch standing'}</Label>
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 24, lineHeight: '18px' }}>{Math.round(value)}</span>
      </div>
      <StandingBar value={value} from={from} h={12} style={{ margin: '2px 0' }} />
      {note && (
        <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
          {noteText ?? <>{STANDING_NOTE}: <span style={{ color: 'var(--cth-ink-700)' }}>{standingWord(value).toLowerCase()}.</span> {MARKS_NOTE}</>}
        </div>
      )}
    </div>
  );
}

/** Today's influence as pips, with how many are left. */
export function InfluenceMeter({ left, max, note = false }: { left: number; max: number; note?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <GIcon name="influence" px={16} />
        <Label style={{ flex: 1, minWidth: 0 }}>Influence</Label>
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
          {left}<span style={{ color: 'var(--cth-ink-500)' }}>/{max}</span>
        </span>
      </div>
      <Pips left={left} max={max} size={12} gap={3} style={{ flexWrap: 'wrap', margin: '2px 0' }} />
      {note && <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{INFLUENCE_NOTE}</div>}
    </div>
  );
}

/** "Ways in": one line per hint, each with the tip bulb. */
export function HintList({ hints }: { hints: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {hints.map((h, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <GIcon name="tip" px={16} style={{ marginTop: 1 }} />
          <span style={{ fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>{h}</span>
        </div>
      ))}
    </div>
  );
}

// ── the week ──

/**
 * Five tiles, Monday to Friday: a check on days won, a cross on days lost, today in lemon.
 * With `titles`, each tile carries the chapter name underneath (the ending). `compact` is the
 * small one-line version for a card's footer.
 */
export function WeekStrip({ week, current, titles = false, compact = false }: { week: StoryUi['week']; current?: number; titles?: boolean; compact?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${week.length}, minmax(0, 1fr))`, gap: compact ? 3 : 4 }}>
      {week.map((d) => {
        const today = d.chapter === current && !d.result;
        const future = !d.result && !today;
        const bg = d.result === 'won' ? 'var(--cth-mint)' : d.result === 'lost' ? 'var(--cth-coral)' : today ? 'var(--cth-lemon)' : 'var(--cth-cream-50)';
        // Days still to come are drawn lighter, but their text stays readable (ink-500, not ink-300).
        const ink = future ? 'var(--cth-ink-500)' : 'var(--cth-ink-900)';
        return (
          <div key={d.chapter} title={`${d.weekday}: ${d.title}${d.result ? (d.result === 'won' ? ', won' : ', lost') : ''}`}
            style={{
              display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: compact ? 0 : 3, minWidth: 0,
              height: compact ? 20 : undefined,
              padding: compact ? 0 : titles ? '6px 4px 6px' : '5px 2px 4px', background: bg,
              boxShadow: future ? 'inset 0 0 0 2px var(--cth-ink-300)' : today ? `inset 0 0 0 2px var(--cth-ink-900)${compact ? '' : ', 0 2px 0 var(--cth-ink-900)'}` : 'inset 0 0 0 2px var(--cth-ink-900)',
              marginBottom: compact ? 0 : 2
            }}>
            {compact ? (
              d.result
                ? <GIcon name={d.result === 'won' ? 'check' : 'x'} px={16} />
                : <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '10px', color: ink }}>{d.weekday.slice(0, 1).toUpperCase()}</span>
            ) : (
              <>
                <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '10px', color: ink }}>
                  {d.weekday.slice(0, 3).toUpperCase()}
                </span>
                <div style={{ height: 16, display: 'grid', placeItems: 'center' }}>
                  {d.result
                    ? <GIcon name={d.result === 'won' ? 'check' : 'x'} px={16} />
                    : <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '16px', color: ink }}>{d.chapter}</span>}
                </div>
                {titles && (
                  <span style={{
                    fontSize: 12, lineHeight: '14px', textAlign: 'center', color: 'var(--cth-ink-900)', minHeight: 28,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>{d.title}</span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
