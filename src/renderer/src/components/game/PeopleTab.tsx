// PEOPLE: all fifteen as compact rows; a tap opens their sheet in the same
// panel (portrait in their current emotion, thought, bars, feelings about the
// others, memories, secret, and things you can do to them).

import { useEffect, useState } from 'react';
import type { PersonDetail, PersonUi } from '@/game/app/gameApi';
import type { CharId } from '@/game/core/types';
import { formatClock } from '@/game/core/types';
import { GIcon, emotionIcon, statusIcon } from './icons';
import { Bar, Btn, Head, Label, LikeBar, Portrait, Section, TextTool, usePress } from './kit';
import { useContent, useGame, useUi } from './ctx';
import { useNav } from './Dock';
import { WhisperTool } from './PowersTab';
import { EMOTION_WORD, STATUS_WORD, ROOM_SHORT, cap, fill, readableOnCream } from './words';

function Row({ p, onTap }: { p: PersonUi; onTap: () => void }) {
  const { pressed, handlers } = usePress();
  const selected = useUi((s) => s.selectedId === p.id);
  return (
    <button type="button" className="gu-hit" {...handlers} onClick={onTap} aria-label={p.name}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 48, padding: '4px 8px 4px 4px', border: 'none',
        textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation', opacity: p.present ? 1 : 0.5,
        background: selected ? 'var(--cth-sky-light)' : pressed ? 'var(--cth-cream-200)' : 'var(--cth-cream-50)',
        boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)'
      }}>
      <Head src={p.avatar} scale={2} box={14} ring={p.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16, lineHeight: '18px', color: readableOnCream(p.color) }}>{p.name}</span>
          {p.speaking && <GIcon name="tell" px={16} title="Talking" />}
          {p.statuses.slice(0, 2).map((s) => <GIcon key={s} name={statusIcon(s)} px={16} title={STATUS_WORD[s]} />)}
        </div>
        <div style={{ fontSize: 13, lineHeight: '15px', color: 'var(--cth-ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {p.present ? `${ROOM_SHORT[p.room] ?? p.roomName} · ${p.doing}` : cap(p.doing || 'not here')}
        </div>
      </div>
      <GIcon name={emotionIcon(p.emotion)} px={16} title={EMOTION_WORD[p.emotion]} />
    </button>
  );
}

function ThoughtBox({ text }: { text: string }) {
  // The thought-cloud look of scene/office/ThoughtBubble: cream, 1 px ink, two trailing puffs.
  return (
    <div style={{ position: 'relative', paddingBottom: 12 }}>
      <div style={{
        background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-900)', padding: '6px 10px',
        fontSize: 15, lineHeight: '19px', fontStyle: 'italic', color: 'var(--cth-ink-700)',
        clipPath: 'polygon(2px 0, calc(100% - 2px) 0, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 0 calc(100% - 2px), 0 2px)'
      }}>{text || '...'}</div>
      <span style={{ position: 'absolute', left: 22, bottom: 4, width: 8, height: 6, background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-900)' }} />
      <span style={{ position: 'absolute', left: 16, bottom: 0, width: 4, height: 4, background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-900)' }} />
    </div>
  );
}

/** The whispered idea they have held all day, marked in the whisper colour. */
function ConvictionBox({ text, since }: { text: string; since: number }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px',
      background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 2px var(--cth-lilac), inset 4px 0 0 var(--cth-lilac)'
    }}>
      <GIcon name="whisper" px={16} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px', letterSpacing: 0.5, color: 'var(--cth-ink-500)' }}>
          SURE OF IT SINCE {formatClock(since)}
        </div>
        <div style={{ fontSize: 15, lineHeight: '18px', color: 'var(--cth-ink-900)' }}>{cap(text)}</div>
      </div>
    </div>
  );
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 52, fontSize: 13, color: 'var(--cth-ink-700)' }}>{label}</span>
      <Bar value={value} color={color} h={10} segments={10} />
    </div>
  );
}

function CueTool({ who, name }: { who: CharId; name: string }) {
  const game = useGame();
  const { suggestions } = useContent();
  const people = useUi((s) => s.people);
  const [sent, setSent] = useState<string | null>(null);
  const other = people.find((p) => p.id !== who && p.present)?.name ?? 'someone';
  return (
    <>
      <TextTool hint={`${name} will try to do exactly this next.`} placeholder="go and apologise to Angela" accent="sky"
        suggestions={suggestions.cues.map((c) => fill(c, name, other))} sendLabel={`Tell ${name}`}
        onSend={(t) => { game.cue(who, t); setSent(`${name} has their orders.`); }} />
      {sent && <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}><GIcon name="check" px={16} />{sent}</div>}
    </>
  );
}

function Sheet({ id, onBack }: { id: CharId; onBack: () => void }) {
  const game = useGame();
  const [d, setD] = useState<PersonDetail | null>(() => game.person(id));
  const [tool, setTool] = useState<'whisper' | 'cue' | null>(null);
  useEffect(() => {
    setD(game.person(id));
    const t = window.setInterval(() => setD(game.person(id)), 500);
    return () => window.clearInterval(t);
  }, [game, id]);
  if (!d) return <Section title="NOT FOUND"><Btn onClick={onBack} icon="back">Back</Btn></Section>;
  const big = game.avatar(d.id, d.emotion) || d.avatar;
  const moodPct = (d.mood + 1) / 2;
  return (
    <>
      <Section title={d.name.toUpperCase()} accent="sky"
        right={<Btn size="sm" variant="secondary" icon="back" label="Back to everyone" sound="close" onClick={onBack} square />}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ padding: 4, background: 'var(--cth-cream-200)', boxShadow: `inset 0 0 0 2px var(--cth-ink-900), inset 0 -8px 0 ${d.color}` }}>
            <Portrait src={big} scale={3} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 16, lineHeight: '18px' }}>{d.fullName}</div>
            <div style={{ fontSize: 13, lineHeight: '15px', color: 'var(--cth-ink-500)' }}>{d.role}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <GIcon name={emotionIcon(d.emotion)} px={16} />
              <span style={{ fontSize: 15 }}>{cap(EMOTION_WORD[d.emotion])}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-700)' }}>
              {d.present ? `${cap(d.doing)} in ${d.roomName}.` : 'Not in the building.'}
            </div>
          </div>
        </div>
        {/* Right after a whisper the thought and the conviction are the same words: show them once. */}
        {(!d.conviction || d.thought.trim() !== d.conviction.text.trim()) && <ThoughtBox text={d.thought} />}
        {d.conviction && <ConvictionBox text={d.conviction.text} since={d.conviction.since} />}
        <StatBar label="Mood" value={moodPct} color={d.mood >= 0 ? 'var(--cth-mint)' : 'var(--cth-coral)'} />
        <StatBar label="Energy" value={d.energy} color="var(--cth-lemon)" />
        <StatBar label="Stress" value={d.stress} color="var(--cth-coral)" />
        {d.statuses.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {d.statuses.map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 4px', background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)', fontSize: 13 }}>
                <GIcon name={statusIcon(s)} px={16} />{STATUS_WORD[s]}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Btn stack icon="whisper" variant={tool === 'whisper' ? 'accent' : 'secondary'} accent="lilac" full onClick={() => setTool(tool === 'whisper' ? null : 'whisper')}>Whisper</Btn>
          <Btn stack icon="tell" variant={tool === 'cue' ? 'accent' : 'secondary'} accent="sky" full onClick={() => setTool(tool === 'cue' ? null : 'cue')}>Tell them to...</Btn>
          <Btn stack icon="poke" variant="secondary" full disabled={!d.present} onClick={() => game.poke(d.id)}>Poke</Btn>
          <Btn stack icon="follow" variant="secondary" full disabled={!d.present} onClick={() => game.focusPerson(d.id)}>Follow</Btn>
        </div>
        {tool === 'whisper' && <WhisperTool fixedWho={d.id} />}
        {tool === 'cue' && <CueTool who={d.id} name={d.name} />}
      </Section>

      <Section title="FEELINGS">
        {d.bonds.length === 0 && <div style={{ fontSize: 14, color: 'var(--cth-ink-500)' }}>No strong feelings about anyone yet.</div>}
        {d.bonds.slice(0, 6).map((b) => {
          const score = Math.abs(b.score) > 1 ? b.score / 100 : b.score;
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Head src={b.avatar} scale={2} box={14} ring={b.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, color: readableOnCream(b.color), flex: 1 }}>{b.name}</span>
                  <LikeBar score={score} w={56} />
                </div>
                <div style={{ fontSize: 12, lineHeight: '14px', color: 'var(--cth-ink-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.label}: {b.note}
                </div>
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="MEMORIES">
        {d.memories.length === 0 && <div style={{ fontSize: 14, color: 'var(--cth-ink-500)' }}>Nothing yet.</div>}
        {d.memories.slice(0, 6).map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, fontSize: 14, lineHeight: '17px' }}>
            <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 16, color: 'var(--cth-ink-500)', flexShrink: 0 }}>D{m.day} {formatClock(m.clock)}</span>
            <span>{m.text}</span>
          </div>
        ))}
      </Section>

      <Section title="SECRET" accent={d.secret ? 'lemon' : undefined}>
        {d.secret ? (
          <div style={{ fontSize: 15, lineHeight: '19px' }}>{cap(d.secret)}.</div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: 10,
            background: 'repeating-linear-gradient(45deg, var(--cth-cream-200) 0 4px, var(--cth-cream-300) 4px 8px)',
            boxShadow: 'inset 0 0 0 2px var(--cth-ink-700)'
          }}>
            <GIcon name="lock" px={32} />
            <span style={{ fontSize: 14, lineHeight: '17px', color: 'var(--cth-ink-700)' }}>Locked. Truth serum or a leak might bring it out.</span>
          </div>
        )}
      </Section>

      <Section inset pad={10}>
        <Label>About</Label>
        <div style={{ fontSize: 14, lineHeight: '18px' }}>{d.summary}</div>
        <div style={{ fontSize: 13, lineHeight: '17px', color: 'var(--cth-ink-700)' }}><b style={{ fontWeight: 400, color: 'var(--cth-ink-500)' }}>Wants:</b> {d.wants}</div>
        <div style={{ fontSize: 13, lineHeight: '17px', color: 'var(--cth-ink-700)' }}><b style={{ fontWeight: 400, color: 'var(--cth-ink-500)' }}>Fears:</b> {d.fears}</div>
      </Section>
    </>
  );
}

export function PeopleTab() {
  const game = useGame();
  const nav = useNav();
  const people = useUi((s) => s.people);
  const id = nav.personId;
  if (id) {
    return <Sheet key={id} id={id} onBack={() => { nav.openPerson(null); game.select(null); }} />;
  }
  const here = people.filter((p) => p.present).length;
  return (
    <Section title="EVERYONE" accent="sky" pad={8}
      right={<span style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 14 }}>{here} in</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {people.map((p) => (
          <Row key={p.id} p={p} onTap={() => { game.uiSound('select'); game.select(p.id); nav.openPerson(p.id); }} />
        ))}
      </div>
    </Section>
  );
}
