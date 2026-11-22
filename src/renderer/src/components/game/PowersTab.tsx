// POWERS: four category sub-tabs, a two-column grid of cards, a target picker
// in the same panel, a big confirm button, and the three text tools.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CharId, ChaosCategory, ChaosId, ChaosTarget, TargetRoomId } from '@/game/core/types';
import { CHAOS, CHAOS_CATEGORIES, CHAOS_LIST, type ChaosDef } from '@/game/core/chaos';
import { ROOMS } from '@/game/core/world';
import { GIcon } from './icons';
import { Btn, Chip, CostPips, Head, Label, Pips, Refusal, Section, TextTool, usePress } from './kit';
import { RoomMap, PersonGrid, PersonStrip } from './pickers';
import { useContent, useGame, useNow, useUi, useViewport } from './ctx';
import { useNav } from './Dock';
import { CONFIRM, fill } from './words';
import { costOf, useCost, useStory } from './Story';

const ROOM_NAME: Record<string, string> = Object.fromEntries(ROOMS.map((r) => [r.id, r.name]));
const TARGET_WORD = { room: 'Pick a room', person: 'Pick a person', pair: 'Pick two people', none: '' } as const;
const accentOf = (c: ChaosCategory) => CHAOS_CATEGORIES.find((x) => x.id === c)!.accent;

// Remembered while the app runs, so the tab reopens where the player left it.
let lastCat: ChaosCategory = 'disaster';
let lastTool: 'whisper' | 'announce' | 'anything' = 'whisper';

function CatTabs({ value, onChange }: { value: ChaosCategory; onChange: (c: ChaosCategory) => void }) {
  const game = useGame();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
      {CHAOS_CATEGORIES.map((c) => {
        const on = c.id === value;
        return (
          <button key={c.id} type="button" className="gu-hit" onClick={() => { game.uiSound('tap'); onChange(c.id); }}
            style={{
              minHeight: 40, border: 'none', padding: '4px 2px', cursor: 'pointer', touchAction: 'manipulation',
              background: on ? `var(--cth-${c.accent})` : 'var(--cth-cream-50)',
              boxShadow: on ? 'inset 0 0 0 2px var(--cth-ink-900)' : `inset 0 0 0 1px var(--cth-ink-900), inset 0 -4px 0 var(--cth-${c.accent})`,
              fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '14px', color: 'var(--cth-ink-900)'
            }}>{c.name}</button>
        );
      })}
    </div>
  );
}

function Card({ def, now, onTap }: { def: ChaosDef; now: number; onTap: () => void }) {
  const cd = useUi((s) => s.cooldowns[def.id]);
  const sandbox = useUi((s) => s.settings.sandbox);
  const price = useCost(def.id);
  const { pressed, handlers } = usePress();
  const left = !sandbox && cd && cd.readyAt > now ? cd.readyAt - now : 0;
  const frac = left > 0 && cd && cd.total > 0 ? Math.ceil((left / cd.total) * 8) / 8 : 0;
  const accent = accentOf(def.category);
  // Story mode: locked today, or more than the influence left. Still tappable, to say why.
  const locked = price?.locked ?? null;
  const dim = left > 0 || !!locked || !!price?.short;
  return (
    <button type="button" className="gu-hit" {...handlers} onClick={onTap} aria-label={def.name}
      style={{
        position: 'relative', textAlign: 'left', border: 'none', padding: '10px 8px 8px', cursor: 'pointer', touchAction: 'manipulation',
        minHeight: 104, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden',
        background: 'var(--cth-cream-50)',
        boxShadow: pressed
          ? `inset 0 0 0 2px var(--cth-ink-900), inset 0 4px 0 var(--cth-${accent})`
          : `inset 0 0 0 2px var(--cth-ink-900), inset 0 4px 0 var(--cth-${accent}), 0 2px 0 var(--cth-ink-700)`,
        transform: pressed ? 'translateY(2px)' : 'none', marginBottom: 2
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', opacity: dim ? 0.55 : 1 }}>
        <GIcon name={def.id} px={32} />
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {price && !locked && price.cost > 0 && <CostPips n={price.cost} short={!!price.short} style={{ marginTop: 1 }} />}
          {def.target !== 'none' && !locked && (
            <span title={TARGET_WORD[def.target]} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, lineHeight: '14px', color: 'var(--cth-ink-500)' }}>
              <GIcon name={def.target === 'room' ? 'target' : 'people'} px={16} />
            </span>
          )}
        </span>
      </div>
      <span style={{ fontSize: 15, lineHeight: '17px', color: 'var(--cth-ink-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: dim ? 0.55 : 1 }}>{def.name}</span>
      <span style={{
        fontSize: 12, lineHeight: '14px', color: locked ? 'var(--cth-ink-700)' : 'var(--cth-ink-500)', opacity: dim && !locked ? 0.55 : 1,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
      }}>{locked ?? def.blurb}</span>
      {locked && (
        <span title="Locked today" style={{
          position: 'absolute', right: 6, top: 10, width: 24, height: 24, display: 'grid', placeItems: 'center',
          background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)'
        }}>
          <GIcon name="lock" px={16} />
        </span>
      )}
      {left > 0 && (
        <>
          <div className="gu-wipe" style={{ height: `${frac * 100}%` }} />
          <span style={{
            position: 'absolute', right: 6, top: 10, padding: '0 4px', background: 'var(--cth-ink-900)', color: 'var(--cth-cream-50)',
            fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '20px'
          }}>{Math.ceil(left / 1000)}s</span>
        </>
      )}
    </button>
  );
}

type Step = 'room' | 'who' | 'other' | 'confirm';

function firstStep(def: ChaosDef): Step {
  if (def.target === 'room') return 'room';
  if (def.target === 'person' || def.target === 'pair') return 'who';
  return 'confirm';
}

function Flow({ def, onDone }: { def: ChaosDef; onDone: (fired: boolean) => void }) {
  const game = useGame();
  const vp = useViewport();
  const nav = useNav();
  const people = useUi((s) => s.people);
  const targeting = useUi((s) => s.targeting);
  const cd = useUi((s) => s.cooldowns[def.id]);
  const sandbox = useUi((s) => s.settings.sandbox);
  const price = useCost(def.id);
  const now = useNow(250, !!cd && cd.readyAt > performance.now());
  const [step, setStep] = useState<Step>(() => firstStep(def));
  const [target, setTarget] = useState<ChaosTarget>(() => (def.fixedRoom ? { room: def.fixedRoom } : {}));
  const [error, setError] = useState<string | null>(null);
  const clearing = useRef(false);
  const accent = accentOf(def.category);
  const nameOf = (id?: CharId) => people.find((p) => p.id === id)?.name ?? '';

  // Let the player aim on the floor too.
  useEffect(() => {
    if (step === 'confirm' && def.target !== 'pair') return;
    const need = def.target === 'room' ? 'room' : def.target === 'pair' ? 'pair' : def.target === 'person' ? 'person' : null;
    if (!need || def.fixedRoom && need === 'room') return;
    clearing.current = false;
    game.beginTargeting({ chaos: def.id, need, who: target.who ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id, step]);
  useEffect(() => () => { clearing.current = true; game.beginTargeting(null); }, [game]);

  // Floor picks come back through the store.
  const prevTargeting = useRef(targeting);
  useEffect(() => {
    const prev = prevTargeting.current;
    prevTargeting.current = targeting;
    if (clearing.current) return;
    if (prev && !targeting) { onDone(true); return; } // the game fired it from a floor tap
    if (targeting && def.target === 'pair' && targeting.who && step === 'who') {
      setTarget((t) => ({ ...t, who: targeting.who! }));
      setStep('other');
    }
  }, [targeting, def.target, step, onDone]);

  const left = !sandbox && cd && cd.readyAt > now ? Math.ceil((cd.readyAt - now) / 1000) : 0;
  const blocked = price ? price.locked ?? price.short : null;
  const complete = def.target === 'none' || (def.target === 'room' && !!target.room) || (def.target === 'person' && !!target.who) || (def.target === 'pair' && !!target.who && !!target.other);

  const summary = (() => {
    if (def.target === 'room' && target.room) return `In ${ROOM_NAME[target.room]}.`;
    if (def.target === 'person' && target.who) return `On ${nameOf(target.who)}.`;
    if (def.target === 'pair' && target.who && target.other) return `${nameOf(target.who)} and ${nameOf(target.other)}.`;
    if (def.fixedRoom) return `In ${ROOM_NAME[def.fixedRoom]}.`;
    if (def.target === 'none') return 'The whole office.';
    return '';
  })();

  const confirm = () => {
    const reason = game.triggerChaos(def.id, target);
    if (reason) { game.uiSound('deny'); setError(reason); return; }
    game.uiSound('confirm');
    clearing.current = true;
    game.beginTargeting(null);
    onDone(true);
    if (!vp.wide) nav.setOpen(false);
  };

  return (
    <Section title={def.name.toUpperCase()} accent={accent}
      right={<Btn size="sm" variant="secondary" icon="x" label="Cancel" sound="close" onClick={() => onDone(false)} square />}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <GIcon name={def.id} px={32} />
        <span style={{ fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>{def.blurb}</span>
      </div>

      {step === 'room' && (
        <>
          <Label>Where?</Label>
          <RoomMap value={target.room ?? null} accent={accent}
            onPick={(r: TargetRoomId) => { game.uiSound('select'); setTarget({ room: r }); setStep('confirm'); setError(null); }} />
          <Hint>Or tap a room on the floor.</Hint>
        </>
      )}
      {step === 'who' && (
        <>
          <Label>{def.askWho ?? 'Who?'}</Label>
          <PersonGrid value={target.who ?? null} accent={accent}
            onPick={(id) => { game.uiSound('select'); setTarget((t) => ({ ...t, who: id })); setStep(def.target === 'pair' ? 'other' : 'confirm'); setError(null); }} />
          <Hint>Or tap someone on the floor.</Hint>
        </>
      )}
      {step === 'other' && (
        <>
          <PickedRow id={target.who!} label="First" onChange={() => { setTarget({}); setStep('who'); }} />
          <Label>{def.askOther ?? 'And who else?'}</Label>
          <PersonGrid value={target.other ?? null} exclude={target.who} accent={accent}
            onPick={(id) => { game.uiSound('select'); setTarget((t) => ({ ...t, other: id })); setStep('confirm'); setError(null); }} />
        </>
      )}
      {step === 'confirm' && (
        <>
          {def.target === 'room' && target.room && (
            <ChangeRow text={summary} onChange={() => { setTarget({}); setStep('room'); }} />
          )}
          {def.target === 'person' && target.who && <PickedRow id={target.who} label="Target" onChange={() => { setTarget({}); setStep('who'); }} />}
          {def.target === 'pair' && target.who && target.other && (
            <>
              <PickedRow id={target.who} label="First" onChange={() => { setTarget({}); setStep('who'); }} />
              <PickedRow id={target.other} label="Second" onChange={() => { setTarget((t) => ({ who: t.who })); setStep('other'); }} />
            </>
          )}
          {(def.target === 'none') && <div style={{ fontSize: 14, color: 'var(--cth-ink-500)' }}>{summary}</div>}
        </>
      )}

      {error && (
        <div className="gu-drop" style={{
          display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', background: 'var(--cth-cream-50)',
          boxShadow: 'inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 var(--cth-coral)', fontSize: 14, lineHeight: '18px'
        }}>
          <span style={{ width: 2 }} />
          <GIcon name="warn" px={16} />
          <span>{error}</span>
        </div>
      )}
      {!error && blocked && <Refusal text={blocked} />}

      <Btn variant="accent" accent={accent} size="lg" full disabled={!complete || left > 0 || !!blocked} onClick={confirm} sound={null}
        style={{ fontSize: 18 }}>
        {left > 0 ? `Ready in ${left}s` : CONFIRM[def.id]}
        {price && price.cost > 0 && !price.locked && <CostPips n={price.cost} short={!!price.short} chip />}
      </Btn>
    </Section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{children}</div>;
}

function PickedRow({ id, label, onChange }: { id: CharId; label: string; onChange: () => void }) {
  const p = useUi((s) => s.people.find((x) => x.id === id) ?? null);
  if (!p) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)' }}>
      <Head src={p.avatar} scale={2} box={14} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="gu-label">{label}</div>
        <div style={{ fontSize: 16 }}>{p.name}</div>
      </div>
      <Btn size="md" variant="ghost" onClick={onChange}>Change</Btn>
    </div>
  );
}

function ChangeRow({ text, onChange }: { text: string; onChange: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 4px 8px', background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)' }}>
      <GIcon name="target" px={16} />
      <span style={{ flex: 1, fontSize: 15 }}>{text}</span>
      <Btn size="md" variant="ghost" onClick={onChange}>Change</Btn>
    </div>
  );
}

// ── text tools ──

export function WhisperTool({ fixedWho, autoFocus }: { fixedWho?: CharId; autoFocus?: boolean }) {
  const game = useGame();
  const price = useCost('whisper');
  const { suggestions } = useContent();
  const people = useUi((s) => s.people);
  const [who, setWho] = useState<CharId | null>(fixedWho ?? null);
  const [sent, setSent] = useState<string | null>(null);
  const target = people.find((p) => p.id === (fixedWho ?? who));
  const other = useMemo(() => {
    const rest = people.filter((p) => p.id !== target?.id);
    return rest.length ? rest[(target?.name.length ?? 0) % rest.length].name : 'someone';
  }, [people, target?.id, target?.name.length]);
  const list = useMemo(() => suggestions.whispers.map((s) => fill(s, target?.name ?? 'them', other)), [suggestions.whispers, target?.name, other]);
  return (
    <>
      {!fixedWho && (
        <>
          <Label>{target ? `Whisper to ${target.name}` : 'Pick a person first'}</Label>
          <PersonStrip value={who} onPick={(id) => { setWho(id); setSent(null); }} />
        </>
      )}
      <TextTool coach="whisper" autoFocus={autoFocus}
        hint="Only they hear it. They think it is their own idea."
        placeholder={target ? `A thought for ${target.name}...` : 'Pick someone above first'}
        suggestions={target ? list : []} disabled={!target} sendLabel="Send whisper" cost={price?.cost} short={target ? price?.short : null}
        onSend={(t) => { if (!target) return; game.whisper(target.id, t); setSent(`Whispered to ${target.name}.`); }} />
      {sent && <Sent text={sent} />}
    </>
  );
}

function Sent({ text }: { text: string }) {
  return (
    <div className="gu-drop" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, color: 'var(--cth-ink-700)' }}>
      <GIcon name="check" px={16} /> {text}
    </div>
  );
}

function AnnounceTool() {
  const game = useGame();
  const price = useCost('announce');
  const { suggestions } = useContent();
  const [sent, setSent] = useState<string | null>(null);
  return (
    <>
      <TextTool hint="Everyone hears this over the loudspeaker." placeholder="Attention, everyone..." accent="peach"
        suggestions={suggestions.announcements} sendLabel="Announce" cost={price?.cost} short={price?.short}
        onSend={(t) => { game.announce(t); setSent('Announced to the whole office.'); }} />
      {sent && <Sent text={sent} />}
    </>
  );
}

function AnythingTool() {
  const game = useGame();
  const price = useCost('anything');
  const { suggestions } = useContent();
  const [sent, setSent] = useState<string | null>(null);
  return (
    <>
      <TextTool hint="Type anything. The office has to deal with it." placeholder="a horse walks into the office" accent="lemon"
        suggestions={suggestions.customEvents} sendLabel="Make it happen" cost={price?.cost} short={price?.short}
        onSend={(t) => { game.customEvent(t); setSent('On its way. Watch the floor.'); }} />
      {sent && <Sent text={sent} />}
    </>
  );
}

const TOOLS = [
  { id: 'whisper', label: 'Whisper', icon: 'whisper' },
  { id: 'announce', label: 'Announce', icon: 'announce' },
  { id: 'anything', label: 'Anything', icon: 'anything' }
] as const;

function Tools() {
  const [tool, setTool] = useState(lastTool);
  useEffect(() => { lastTool = tool; }, [tool]);
  return (
    <Section title="SAY SOMETHING" accent="lilac">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {TOOLS.map((t) => (
          <Chip key={t.id} active={tool === t.id} accent="lilac" icon={t.icon} onClick={() => setTool(t.id)}
            style={{ justifyContent: 'center', flexDirection: 'column', gap: 2, padding: '6px 2px', fontSize: 13 }}>
            {t.label}
          </Chip>
        ))}
      </div>
      {tool === 'whisper' && <WhisperTool />}
      {tool === 'announce' && <AnnounceTool />}
      {tool === 'anything' && <AnythingTool />}
    </Section>
  );
}

export function PowersTab({ initial }: { initial?: { chaos?: ChaosId } } = {}) {
  const game = useGame();
  const [cat, setCat] = useState<ChaosCategory>(initial?.chaos ? CHAOS[initial.chaos].category : lastCat);
  const [sel, setSel] = useState<ChaosId | null>(initial?.chaos ?? pendingChaos.take());
  const [denied, setDenied] = useState<string | null>(null);
  const cooldowns = useUi((s) => s.cooldowns);
  const sandbox = useUi((s) => s.settings.sandbox);
  const story = useStory();
  const anyCooling = !sandbox && Object.values(cooldowns).some((c) => c && c.readyAt > performance.now());
  const now = useNow(250, anyCooling);
  useEffect(() => { lastCat = cat; }, [cat]);
  const cards = CHAOS_LIST.filter((d) => d.category === cat);

  if (sel) {
    return <Flow key={sel} def={CHAOS[sel]} onDone={() => setSel(null)} />;
  }

  return (
    <>
      {story && <InfluenceRow left={story.influence.left} max={story.influence.max} />}
      <CatTabs value={cat} onChange={(c) => { setCat(c); setDenied(null); }} />
      {denied && (
        <div className="gu-drop" style={{ padding: '8px 10px', background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 var(--cth-coral)', fontSize: 14, paddingLeft: 14 }}>
          {denied}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }} data-coach="cards">
        {cards.map((d) => (
          <Card key={d.id} def={d} now={now} onTap={() => {
            const price = costOf(story, d.id);
            const why = price ? price.locked ?? price.short : null;
            if (why) {
              game.uiSound('deny');
              setDenied(price?.locked ? `${d.name} is locked today. ${why}` : why);
              return;
            }
            const cd = cooldowns[d.id];
            if (!sandbox && cd && cd.readyAt > performance.now()) {
              game.uiSound('deny');
              setDenied(`${d.name} is ready again in ${Math.ceil((cd.readyAt - performance.now()) / 1000)} seconds.`);
              return;
            }
            game.uiSound('card');
            setDenied(null);
            setSel(d.id);
          }} />
        ))}
      </div>
      <Tools />
    </>
  );
}

/** Story mode: what is left of today's influence, above the cards. */
function InfluenceRow({ left, max }: { left: number; max: number }) {
  return (
    <div title="Influence: today's budget for powers and tools" style={{
      display: 'flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '4px 8px', flexShrink: 0,
      background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)'
    }}>
      <GIcon name="influence" px={16} />
      <Pips left={left} max={max} size={10} gap={2} style={{ flex: 1, minWidth: 0, overflow: 'hidden' }} />
      <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '18px', color: 'var(--cth-ink-700)', whiteSpace: 'nowrap' }}>
        {left}<span style={{ color: 'var(--cth-ink-500)' }}>/{max}</span>
      </span>
    </div>
  );
}

/** Lets the harness (or another tab) open Powers with a card already chosen. */
export const pendingChaos = {
  id: null as ChaosId | null,
  set(id: ChaosId | null) { this.id = id; },
  take(): ChaosId | null { const v = this.id; this.id = null; return v; }
};
