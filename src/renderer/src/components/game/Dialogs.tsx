// Full-screen moments: the start card, the end-of-day report, the
// "turn your phone sideways" card and the first-run coach marks.

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import brandLogo from '@brand/logo.png?url';
import { PixelPanel } from '@/components/PixelPanel';
import { GIcon } from './icons';
import { Btn, Head, Label, Portrait } from './kit';
import { useContent, useGame, useNow, useUi, type Viewport } from './ctx';
import { ModelStatus } from './DirectorTab';
import { useNav } from './Dock';

const backdrop: React.CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(26, 19, 32, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left))', pointerEvents: 'auto', zIndex: 20
};
const hardShadow = 'var(--cth-panel-border-dialog), 4px 4px 0 rgba(26, 19, 32, 0.25)';

function RotatingTip() {
  const { tips } = useContent();
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((x) => x + 1), 6000);
    return () => window.clearInterval(t);
  }, []);
  if (!tips.length) return null;
  return (
    <div key={i} className="gu-drop" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minHeight: 36 }}>
      <GIcon name="tip" px={16} style={{ marginTop: 2 }} />
      <span style={{ fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>{tips[i % tips.length]}</span>
    </div>
  );
}

export function TitleCard({ vp }: { vp: Viewport }) {
  const game = useGame();
  const day = useUi((s) => s.day);
  const side = !vp.portrait && vp.w >= 700;
  return (
    <div style={backdrop}>
      <div className="gu-pop gu-scroll" style={{ width: side ? 'min(600px, 100%)' : 'min(400px, 100%)', maxHeight: '100%' }}>
        <PixelPanel variant="dialog" noPadding style={{ boxShadow: hardShadow }}>
          <div style={{ display: 'flex', flexDirection: side ? 'row' : 'column', gap: 16, padding: 16, alignItems: side ? 'center' : 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0, width: side ? 200 : undefined }}>
              <img src={brandLogo} alt="Munder Difflin" draggable={false}
                style={{ height: side ? 96 : 72, width: 'auto', imageRendering: 'auto', display: 'block', boxShadow: '4px 4px 0 rgba(26,19,32,0.25)' }} />
              <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                {['michael', 'dwight', 'pam', 'jim', 'angela'].map((id) => <Portrait key={id} src={game.avatar(id)} scale={side ? 2 : 1} />)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 17, lineHeight: '22px' }}>
                Fifteen office workers with minds of their own. You are the unseen force that makes their day strange.
              </p>
              <div style={{ padding: 8, background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)' }}>
                <ModelStatus />
              </div>
              <RotatingTip />
              <Btn variant="primary" size="lg" full icon="play" sound="confirm" style={{ height: 52, fontSize: 18 }}
                onClick={() => { game.begin(); game.goFullscreen(); }}>
                {day > 1 ? `Start day ${day}` : 'Start the day'}
              </Btn>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

// ── End of day report ──

function useTyped(paragraphs: string[], writing: boolean): { text: string[]; typing: boolean } {
  const total = useMemo(() => paragraphs.reduce((n, p) => n + p.length, 0), [paragraphs]);
  const [shown, setShown] = useState(0);
  const typing = shown < total;
  const now = useNow(33, typing);
  useEffect(() => { if (shown < total) setShown((s) => Math.min(total, s + 4)); }, [now]); // eslint-disable-line react-hooks/exhaustive-deps
  let left = shown;
  const text = paragraphs.map((p) => { const t = p.slice(0, Math.max(0, left)); left -= p.length; return t; }).filter((t) => t.length > 0);
  return { text, typing: typing || writing };
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ padding: '6px 8px', background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)', minWidth: 0 }}>
      <div className="gu-label">{label}</div>
      <div style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 26, lineHeight: '24px', color: color ?? 'var(--cth-ink-900)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, lineHeight: '14px', color: 'var(--cth-ink-500)' }}>{sub}</div>}
    </div>
  );
}

export function ReportCard({ vp }: { vp: Viewport }) {
  const game = useGame();
  const r = useUi((s) => s.report);
  const typed = useTyped(r?.paragraphs ?? [], !!r?.writing);
  if (!r) return null;
  const two = !vp.portrait && vp.w >= 760;
  const up = r.stats.stockEnd >= r.stats.stockStart;
  return (
    <div style={backdrop}>
      <div className="gu-pop" style={{ width: two ? 'min(880px, 100%)' : 'min(460px, 100%)', height: '100%', maxHeight: two ? 640 : '100%', display: 'flex' }}>
        <PixelPanel variant="dialog" noPadding style={{ boxShadow: hardShadow, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px 6px', background: 'var(--cth-lemon)',
            boxShadow: 'inset 0 -1px 0 var(--cth-ink-900)', margin: 5, marginBottom: 0
          }}>
            <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 16, lineHeight: '24px' }}>DAY {r.day}</span>
            <span style={{ fontSize: 14, color: 'var(--cth-ink-700)' }}>End of day report</span>
          </div>
          <div className="gu-scroll gu-hit" style={{ flex: 1, minHeight: 0, padding: '12px 16px', display: 'flex', flexDirection: two ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: 3, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--cth-font-display)', fontSize: 12, lineHeight: '20px', fontWeight: 400 }}>{r.headline}</h2>
              {typed.text.map((p, i) => (
                <p key={i} className={typed.typing && i === typed.text.length - 1 ? 'gu-caret' : undefined}
                  style={{ margin: 0, fontSize: 16, lineHeight: '21px', color: 'var(--cth-ink-900)' }}>{p}</p>
              ))}
              {typed.text.length === 0 && <p className="gu-caret" style={{ margin: 0, fontSize: 16, color: 'var(--cth-ink-500)' }}>Writing up the day</p>}
              {r.quotes.length > 0 && (
                <>
                  <Label style={{ marginTop: 4 }}>Quotes of the day</Label>
                  {r.quotes.map((q, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Head src={q.avatar} scale={2} box={14} />
                      <div style={{ fontSize: 15, lineHeight: '19px' }}>
                        <span style={{ fontStyle: 'italic' }}>"{q.text}"</span>
                        <span style={{ color: 'var(--cth-ink-500)' }}> {q.name}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, width: two ? undefined : '100%' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <Stat label="Incidents" value={String(r.stats.incidents)} />
                <Stat label="Share price" value={r.stats.stockEnd.toFixed(1)} sub={`${up ? 'up' : 'down'} ${Math.abs(r.stats.stockEnd - r.stats.stockStart).toFixed(1)} today`} color={up ? '#2f8a45' : '#c43c3c'} />
                <Stat label="Morale" value={`${Math.round(r.stats.morale)}%`} />
                <Stat label="Peak chaos" value={`${Math.round(r.stats.chaosPeak)}%`} />
                <Stat label="Lines spoken" value={String(r.stats.lines)} />
              </div>
              {r.awards.length > 0 && <Label>Awards</Label>}
              {r.awards.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 6, background: 'var(--cth-cream-100)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)' }}>
                  <div style={{ position: 'relative' }}>
                    <Portrait src={a.avatar} scale={2} />
                    <GIcon name="trophy" px={16} style={{ position: 'absolute', right: -6, bottom: -2 }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px' }}>{a.title.toUpperCase()}</div>
                    <div style={{ fontSize: 16, lineHeight: '19px' }}>{a.name}</div>
                    <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{a.why}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '8px 12px 12px', boxShadow: 'inset 0 1px 0 var(--cth-ink-300)', margin: '0 5px 5px' }}>
            <Btn variant="primary" size="lg" icon="arrow-right" sound="confirm" onClick={() => game.nextDay()}>Next day</Btn>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

// ── Portrait warning ──

export function RotateCard({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="gu-paper" style={{ ...backdrop, background: undefined }}>
      <div className="gu-pop" style={{ width: 'min(320px, 100%)' }}>
        <PixelPanel variant="dialog" title="TURN SIDEWAYS" noPadding style={{ boxShadow: hardShadow }}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
            <div style={{ width: 96, height: 96, display: 'grid', placeItems: 'center', background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)' }}>
              <div style={{ animation: 'gu-rotate-phone 2.4s steps(1) infinite' }}>
                <GIcon name="phone" px={64} />
              </div>
            </div>
            <div style={{ fontSize: 18, lineHeight: '22px' }}>Turn your phone sideways</div>
            <div style={{ fontSize: 15, lineHeight: '19px', color: 'var(--cth-ink-500)' }}>The office is wide. It fits much better that way.</div>
            <Btn variant="secondary" size="md" full onClick={onPlay}>Play anyway</Btn>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

// ── First-run coach marks ──

interface Mark { text: string; find: () => DOMRect | null; prepare?: () => void }

export function Coach({ onDone }: { onDone: () => void }) {
  const game = useGame();
  const nav = useNav();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const marks: Mark[] = useMemo(() => [
    {
      text: 'Press and hold anyone on the floor, then drag them somewhere new.',
      find: () => {
        const ppl = game.store.getState().people.filter((p) => p.present);
        for (const p of ppl) {
          const h = game.headOnScreen(p.id);
          if (h.visible) return new DOMRect(h.x - 12, h.y, 24, 32);
        }
        return null;
      }
    },
    {
      text: 'Open Powers to start a fire, a flood, a flying saucer...',
      find: () => document.querySelector('[data-coach="tab-powers"]')?.getBoundingClientRect() ?? null
    },
    {
      text: 'Or whisper a thought. They will think it was their own idea.',
      prepare: () => nav.go('powers'),
      find: () => {
        const el = document.querySelector('[data-coach="whisper"] textarea') as HTMLElement | null;
        return el?.getBoundingClientRect() ?? null;
      }
    }
  ], [game, nav]);

  const mark = marks[i];
  useLayoutEffect(() => {
    mark.prepare?.();
    let n = 0;
    const tick = () => {
      const r = mark.find();
      if (r && i === 2 && n === 0) {
        (document.querySelector('[data-coach="whisper"]') as HTMLElement | null)?.scrollIntoView({ block: 'center' });
      }
      n++;
      setRect(mark.find());
    };
    tick();
    const t = window.setInterval(tick, 300);
    return () => window.clearInterval(t);
  }, [mark, i]);

  const finish = () => { game.uiSound('close'); onDone(); };
  const next = () => { game.uiSound('tap'); if (i < marks.length - 1) setI(i + 1); else onDone(); };

  // Put the card beside the target: to its left when the target is on the right half, else below or above.
  const vw = window.innerWidth, vh = window.innerHeight;
  const W = 232;
  let style: React.CSSProperties = { left: (vw - W) / 2, top: vh / 2 - 60 };
  let arrow: { dir: 'right' | 'down' | 'up'; x: number; y: number } | null = null;
  if (rect) {
    if (rect.left > vw * 0.6) {
      const top = Math.max(8, Math.min(vh - 150, rect.top + rect.height / 2 - 50));
      style = { left: Math.max(8, rect.left - W - 28), top };
      arrow = { dir: 'right', x: rect.left - 24, y: rect.top + rect.height / 2 - 8 };
    } else if (rect.top > vh / 2) {
      style = { left: Math.max(8, Math.min(vw - W - 8, rect.left + rect.width / 2 - W / 2)), top: Math.max(8, rect.top - 170) };
      arrow = { dir: 'down', x: rect.left + rect.width / 2 - 8, y: rect.top - 22 };
    } else {
      style = { left: Math.max(8, Math.min(vw - W - 8, rect.left + rect.width / 2 - W / 2)), top: rect.bottom + 28 };
      arrow = { dir: 'up', x: rect.left + rect.width / 2 - 8, y: rect.bottom + 4 };
    }
  }
  return (
    <>
      {arrow && (
        <div style={{ position: 'absolute', left: arrow.x, top: arrow.y, pointerEvents: 'none', zIndex: 30,
          animation: `${arrow.dir === 'right' ? 'gu-point-right' : 'gu-point-down'} 0.8s steps(1) infinite` }}>
          <div style={{ transform: arrow.dir === 'up' ? 'rotate(180deg)' : arrow.dir === 'right' ? 'rotate(-90deg)' : undefined }}>
            <PointerArrow />
          </div>
        </div>
      )}
      <div className="gu-hit gu-pop" style={{ position: 'absolute', width: W, zIndex: 31, ...style }}>
        <PixelPanel variant="dialog" noPadding style={{ boxShadow: hardShadow }}>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px', padding: '3px 4px 1px', background: 'var(--cth-lemon)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-900)' }}>
                {i + 1} / {marks.length}
              </span>
            </div>
            <div style={{ fontSize: 16, lineHeight: '20px' }}>{mark.text}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" size="md" onClick={finish} sound={null}>Skip</Btn>
              <Btn variant="primary" size="md" full onClick={next} sound={null}>{i < marks.length - 1 ? 'Next' : 'Got it'}</Btn>
            </div>
          </div>
        </PixelPanel>
      </div>
    </>
  );
}

function PointerArrow() {
  // A chunky pixel arrow pointing down, ink outline and lemon fill.
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" shapeRendering="crispEdges" style={{ display: 'block' }}>
      <path d="M5 0h6v10h4v2h-1v1h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4v-1H3v-1H2v-1H1v-2h4z" fill="var(--cth-ink-900)" />
      <path d="M6 1h4v10h3v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4v-1H3v-1h3z" fill="var(--cth-lemon)" />
    </svg>
  );
}
