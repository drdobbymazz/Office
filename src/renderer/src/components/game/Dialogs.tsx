// Full-screen moments: the start card, the story's chapter card, the
// end-of-day report, the end of the week, the "turn your phone sideways" card
// and the first-run coach marks.
//
// Every card fits a phone held sideways (360 to 412 px tall) without cutting a line: what does not
// fit goes on a second page, and a column that still has to scroll shows a dithered fade and a
// chevron. The screens change with the paper wipe in transitions.tsx.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gameLogo from '@/assets/logo/game-logo.png?url';
import { PixelPanel } from '@/components/PixelPanel';
import type { EpisodeSavedUi, StoryUi } from '@/game/app/gameApi';
import type { EmotionId } from '@/game/core/types';
import { EPISODES } from '@/game/story/episodes';
import { EXTRA_INFLUENCE, STANDING } from '@/game/story/rules';
import { STORY_TITLE } from '@/game/story/text';
import type { EpisodeId } from '@/game/story/types';
import { GIcon } from './icons';
import { Btn, Head, IconTile, Label, Light, Pips, Portrait, StandingBar, standingWord } from './kit';
import { useContent, useGame, useNow, useUi, type Viewport } from './ctx';
import { useNav } from './Dock';
import { ExtraRow, HintList, WeekStrip, INFLUENCE_NOTE, MARKS_NOTE, STANDING_NOTE, tileIcon, useStory } from './Story';
import { PageDots, ScrollArea, reducedMotion, useCountUp, useLast, useStages } from './screenKit';
import { dayPicture, episodeListLine, reportActions, resultLines, revealTimes, splitHook } from './screenLogic';

const backdrop: React.CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(26, 19, 32, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left))', pointerEvents: 'auto', zIndex: 20
};
const hardShadow = 'var(--cth-panel-border-dialog), 4px 4px 0 rgba(26, 19, 32, 0.25)';

/** The colour of a story card's band: the saga's lilac, else the episode's own colour. */
function storyBand(story: StoryUi): string {
  return story.saga ? 'var(--cth-lilac)' : story.band ?? 'var(--cth-lemon)';
}

/** Body text on the cards: a size smaller on the shortest phones so a page fits. */
function bodyType(vp: Viewport): { fontSize: number; lineHeight: string } {
  return vp.h < 380 ? { fontSize: 15, lineHeight: '19px' } : { fontSize: 16, lineHeight: '21px' };
}

/**
 * The frame every full-screen card shares: the dialog panel, a coloured band on top, the body, and
 * a footer for the buttons. The body decides how it scrolls.
 */
function Card({ vp, band, head, sub, children, footer, maxW = 880, fit = false }: {
  vp: Viewport; band: string; head: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode; footer: React.ReactNode; maxW?: number;
  /** Only as tall as its content (still never taller than the screen). */
  fit?: boolean;
}) {
  const two = !vp.portrait && vp.w >= 700;
  const short = vp.h < 420;
  return (
    <div style={backdrop}>
      <div style={{
        width: two ? `min(${maxW}px, 100%)` : 'min(460px, 100%)', height: fit ? 'auto' : '100%',
        maxHeight: two ? 'min(640px, 100%)' : '100%', display: 'flex'
      }}>
        <PixelPanel variant="dialog" noPadding style={{ boxShadow: hardShadow, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: short ? '6px 12px 5px' : '8px 12px 6px', background: band,
            boxShadow: 'inset 0 -1px 0 var(--cth-ink-900)', margin: 5, marginBottom: 0, flexShrink: 0, minWidth: 0
          }}>
            <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 16, lineHeight: '24px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{head}</span>
            <span style={{ flex: 1 }} />
            {sub && <span style={{ fontSize: 14, color: 'var(--cth-ink-700)', whiteSpace: 'nowrap', flexShrink: 0 }}>{sub}</span>}
          </div>
          {children}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: short ? '6px 12px 8px' : '8px 12px 12px', flexShrink: 0, flexWrap: 'wrap',
            boxShadow: 'inset 0 1px 0 var(--cth-ink-300)', margin: '0 5px 5px'
          }}>
            {footer}
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

/** An inline "are you sure" in place of a card's buttons. */
function Confirm({ text, keep, go, onKeep, onGo, danger = true }: {
  text: string; keep: string; go: string; onKeep: () => void; onGo: () => void; danger?: boolean;
}) {
  return (
    <div className="sc-rise" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: '1 1 220px', minWidth: 0 }}>
        <GIcon name="warn" px={16} style={{ marginTop: 2 }} />
        <span style={{ fontSize: 14, lineHeight: '18px' }}>{text}</span>
      </span>
      <span style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
        <Btn variant="secondary" size="md" onClick={onKeep} sound="close">{keep}</Btn>
        <Btn variant={danger ? 'destructive' : 'primary'} size="md" onClick={onGo} sound="confirm">{go}</Btn>
      </span>
    </div>
  );
}

// ── Title ──

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

/** The model, as one quiet line at the foot of the title card. */
function ModelLine() {
  const game = useGame();
  const b = useUi((s) => ({ state: s.brain.state, provider: s.brain.provider, model: s.brain.model, thinking: s.brain.thinking }));
  const baseUrl = useUi((s) => s.settings.brain.baseUrl);
  const [testing, setTesting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(baseUrl);
  const claude = b.provider === 'claude' && b.state === 'online';
  const line = b.state === 'online'
    ? (claude ? 'Claude answers what you do' : `Model online · ${b.model}`)
    : b.state === 'connecting' ? 'Connecting to the model...'
    : b.state === 'instinct' ? 'No model: the staff use written lines'
    : 'Model offline: the staff use written lines. You can still play.';
  const color = b.state === 'online' ? 'var(--cth-mint)' : b.state === 'connecting' ? 'var(--cth-lemon)' : b.state === 'instinct' ? 'var(--cth-lilac)' : 'var(--cth-coral)';
  const connect = () => {
    const clean = draft.trim().replace(/\/+$/, '');
    if (!clean) return;
    game.updateBrain({ provider: 'ollama', baseUrl: clean });
    setEditing(false);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 32 }}>
        <Light color={color} blink={b.state === 'connecting' || b.thinking} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{line}</span>
        {!claude && (
          <Btn variant="ghost" size="sm" onClick={() => { setDraft(baseUrl); setEditing((v) => !v); }} sound="tap">Server</Btn>
        )}
        {b.provider !== 'instinct' && (
          <Btn variant="ghost" size="sm" icon="refresh" label="Check the model again" disabled={testing} square
            onClick={() => { setTesting(true); game.testBrain().finally(() => setTesting(false)); }} />
        )}
      </div>
      {editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') connect(); }}
            placeholder="http://192.168.1.124:11434"
            style={{
              flex: 1, minWidth: 0, height: 28, padding: '0 8px',
              fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)',
              background: 'var(--cth-cream-50)', border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)'
            }}
          />
          <Btn variant="secondary" size="sm" onClick={connect} sound="confirm">Connect</Btn>
        </div>
      )}
    </div>
  );
}

const TITLE_FACES = ['michael', 'dwight', 'pam', 'jim', 'angela'];

export function TitleCard({ vp }: { vp: Viewport }) {
  const game = useGame();
  const day = useUi((s) => s.day);
  const mode = useUi((s) => s.mode);
  const saved = useUi((s) => s.storySaved);
  const rawEpisodes = useUi((s) => s.episodes);
  const sagaSaved = useUi((s) => s.sagaSaved);
  const [pickingEpisodes, setPickingEpisodes] = useState(false);
  const [askRestartEp, setAskRestartEp] = useState<EpisodeId | null>(null);
  const [askNewSaga, setAskNewSaga] = useState(false);
  const episodes: EpisodeSavedUi[] = rawEpisodes.length
    ? rawEpisodes
    : EPISODES.map((ep) => ({
        id: ep.id, number: ep.number, title: ep.title, subtitle: ep.subtitle, tagline: ep.tagline,
        chapters: ep.chapters.length, unitLabel: ep.unitLabel, band: ep.band, saved: ep === EPISODES[0] ? saved : null,
      }));
  const side = !vp.portrait && vp.w >= 640;
  // The plate is 132 x 84 art pixels: twice that where there is room, else once.
  const logoScale = side && vp.h >= 340 ? 2 : 1;
  const faceScale = side && vp.h >= 380 ? 2 : 1;
  const go = (start: () => void) => { start(); game.goFullscreen(); };
  const rise = (i: number): React.CSSProperties => ({ animationDelay: `${120 + i * 60}ms` });
  const anySavedEp = episodes.find((e) => e.saved);
  return (
    <div style={{ ...backdrop, background: 'rgba(26, 19, 32, 0.45)' }}>
      <div className="gu-scroll" style={{ width: side ? 'min(680px, 100%)' : 'min(420px, 100%)', maxHeight: '100%' }}>
        <PixelPanel variant="dialog" noPadding style={{ boxShadow: hardShadow }}>
          {pickingEpisodes ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: vp.h < 380 ? 12 : 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Btn variant="ghost" size="sm" icon="back" label="Back to title" onClick={() => { setAskRestartEp(null); setPickingEpisodes(false); }} sound="close" square />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 13, lineHeight: '18px' }}>STORY MODE · EPISODES</span>
                  <span style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>Choose an episode to start or continue</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {episodes.map((ep) => {
                  const epSaved = ep.saved;
                  const unitPlural = ep.chapters === 1 ? ep.unitLabel.toLowerCase() : `${ep.unitLabel.toLowerCase()}s`;
                  return (
                    <div key={ep.id} style={{
                      display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--cth-cream-50)',
                      boxShadow: `inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 ${ep.band || 'var(--cth-lemon)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, lineHeight: '14px', padding: '2px 5px 1px', background: 'var(--cth-ink-900)', color: 'var(--cth-cream-50)' }}>
                          EPISODE {ep.number}
                        </span>
                        <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 13, lineHeight: '18px' }}>{ep.title.toUpperCase()}</span>
                        <span style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{ep.subtitle} · {ep.chapters} {unitPlural}</span>
                      </div>
                      <div style={{ fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>{ep.tagline}</div>
                      {epSaved && askRestartEp === ep.id ? (
                        <Confirm
                          text={`Restart Episode ${ep.number}: ${ep.title}? Saved progress (${ep.unitLabel} ${epSaved.chapter}, standing ${Math.round(epSaved.standing)}) is reset.`}
                          keep="Keep it" go="Restart"
                          onKeep={() => setAskRestartEp(null)}
                          onGo={() => { setAskRestartEp(null); go(() => game.startStory(true, ep.id)); }}
                        />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Btn variant="primary" size="md" icon="play" sound="confirm" onClick={() => go(() => game.startStory(false, ep.id))}>
                            {epSaved ? `Continue: ${ep.unitLabel} ${epSaved.chapter}, ${epSaved.title}` : `Play Episode ${ep.number}`}
                          </Btn>
                          {epSaved && (
                            <>
                              <StandingBar value={epSaved.standing} w={48} h={9} marks={false} />
                              <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 17, lineHeight: '16px' }}>{Math.round(epSaved.standing)}</span>
                              <span style={{ flex: 1 }} />
                              <Btn variant="ghost" size="sm" icon="refresh" onClick={() => setAskRestartEp(ep.id)} sound="open">Restart</Btn>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: side ? 'row' : 'column', gap: side ? 18 : 10, padding: vp.h < 380 ? 12 : 16, alignItems: side ? 'center' : 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <img src={gameLogo} alt="Munder Difflin, Inc. The living office" draggable={false} className="sc-drop"
                  width={132 * logoScale} height={84 * logoScale}
                  style={{ display: 'block', imageRendering: 'pixelated', boxShadow: '4px 4px 0 rgba(26, 19, 32, 0.25)' }} />
                <div style={{ display: 'flex', gap: 2 }}>
                  {TITLE_FACES.map((id, i) => (
                    <div key={id} className="sc-hop" style={{ animationDelay: `${200 + i * 70}ms` }}>
                      <Portrait src={game.avatar(id)} scale={faceScale} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
                <p className="sc-rise" style={{ margin: 0, fontSize: 16, lineHeight: '20px', ...rise(0) }}>
                  Fifteen office workers with minds of their own. You are the unseen force that makes their day strange.
                </p>
                <div className="sc-rise" style={{ display: 'flex', flexDirection: 'column', gap: 5, ...rise(1) }}>
                  <Btn variant="primary" size="lg" full icon="play" sound="open" style={{ height: 'auto', minHeight: 50, padding: '6px 14px' }}
                    onClick={() => setPickingEpisodes(true)}>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0, whiteSpace: 'normal', textAlign: 'left' }}>
                      <span style={{ fontSize: 17, lineHeight: '20px' }}>Story Mode · Episodes</span>
                      <span style={{ fontSize: 12, lineHeight: '14px', color: 'var(--cth-cream-300)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {episodeListLine(episodes)}
                      </span>
                    </span>
                  </Btn>
                  {anySavedEp?.saved && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 32 }}>
                      <Btn variant="ghost" size="sm" icon="play" sound="confirm" onClick={() => go(() => game.startStory(false, anySavedEp.id))}>
                        Continue Ep {anySavedEp.number}: {anySavedEp.unitLabel} {anySavedEp.saved.chapter}
                      </Btn>
                      <span style={{ flex: 1 }} />
                      <StandingBar value={anySavedEp.saved.standing} w={48} h={9} marks={false} />
                      <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 17, lineHeight: '16px' }}>{Math.round(anySavedEp.saved.standing)}</span>
                    </div>
                  )}
                </div>
                <div className="sc-rise" style={{ display: 'flex', flexDirection: 'column', gap: 5, ...rise(2) }}>
                  <Btn variant="accent" accent="lilac" size="lg" full icon="branch" sound="confirm" style={{ height: 'auto', minHeight: 50, padding: '6px 14px' }}
                    onClick={() => go(() => game.startSaga())}>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0, whiteSpace: 'normal', textAlign: 'left' }}>
                      <span style={{ fontSize: 17, lineHeight: '20px' }}>
                        {sagaSaved ? `Continue Saga: S${sagaSaved.season} · ${sagaSaved.title}` : 'Endless Saga'}
                      </span>
                      <span style={{ fontSize: 12, lineHeight: '14px', color: 'var(--cth-ink-700)' }}>
                        {sagaSaved ? `${sagaSaved.arcTitle} · ${sagaSaved.weekday}` : 'Overarching weekly arcs + full sandbox freedom'}
                      </span>
                    </span>
                  </Btn>
                  {sagaSaved && !askNewSaga && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 34 }}>
                      <GIcon name="branch" px={16} title="Saga branch standing" />
                      <StandingBar value={sagaSaved.standing} w={56} h={9} marks={false} />
                      <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18, lineHeight: '16px' }}>{Math.round(sagaSaved.standing)}</span>
                      <span className="gu-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>S{sagaSaved.season}</span>
                      <span style={{ flex: 1 }} />
                      <Btn variant="ghost" size="sm" icon="refresh" onClick={() => setAskNewSaga(true)} sound="open">New saga</Btn>
                    </div>
                  )}
                  {sagaSaved && askNewSaga && (
                    <Confirm text={`Start a new Endless Saga from Season 1? Current progress (Season ${sagaSaved.season}, standing ${Math.round(sagaSaved.standing)}) is reset.`}
                      keep="Keep it" go="New saga" onKeep={() => setAskNewSaga(false)} onGo={() => { setAskNewSaga(false); go(() => game.startSaga(true)); }} />
                  )}
                </div>
                <div className="sc-rise" style={rise(2)}>
                  <Btn variant="secondary" size="md" full icon="powers" onClick={() => go(() => game.startSandbox())}>
                    Sandbox
                    <span style={{ color: 'var(--cth-ink-500)' }}>{mode === 'sandbox' && day > 1 ? `· day ${day}` : '· pure free play'}</span>
                  </Btn>
                </div>
                {/* On a short screen the tip makes way for the choices. */}
                {vp.h >= 420 && <div className="sc-rise" style={rise(3)}><RotatingTip /></div>}
                <div className="sc-rise" style={rise(3)}><ModelLine /></div>
              </div>
            </div>
          )}
        </PixelPanel>
      </div>
    </div>
  );
}

// ── Story & Saga: the chapter card ──

function DayFaces({ chapter, episodeId, saga, scale }: { chapter: number; episodeId?: EpisodeId; saga?: StoryUi['saga']; scale: number }) {
  const game = useGame();
  const pic = saga
    ? (saga.icon ? { faces: [] as { id: string; face: EmotionId }[], icon: saga.icon } : { faces: saga.faces })
    : dayPicture(chapter, episodeId);
  if (pic.icon) {
    return (
      <div className="sc-hop" style={{ animationDelay: '120ms' }}>
        <div style={{
          width: scale >= 3 ? 96 : 80, height: scale >= 3 ? 96 : 80, display: 'grid', placeItems: 'center', background: 'var(--cth-lemon-light)',
          boxShadow: 'inset 0 0 0 2px var(--cth-ink-900), 2px 2px 0 rgba(26, 19, 32, 0.25)'
        }}>
          <GIcon name={pic.icon} px={64} />
        </div>
      </div>
    );
  }
  const faces = pic.faces.map((c) => ({ id: c.id, src: game.avatar(c.id, c.face) || game.avatar(c.id) })).filter((c) => !!c.src);
  if (!faces.length) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
      {faces.map((f, i) => (
        <div key={f.id} className="sc-hop" style={{ animationDelay: `${120 + i * 80}ms` }}>
          <Portrait src={f.src} scale={scale} style={{ boxShadow: '2px 2px 0 rgba(26, 19, 32, 0.25)' }} />
        </div>
      ))}
    </div>
  );
}

const WEEKDAY_UPPER = (w: string) => w.toUpperCase();

/**
 * Before each day of Story or Endless Saga, in two beats. First the opening: the day, chapter's name,
 * who is featured, what happened before, and what is going on. Then the briefing: goal, extras, clues.
 */
export function ChapterCard({ vp }: { vp: Viewport }) {
  // Held while the wipe covers it (going back to the title clears the story at once).
  const story = useLast(useStory());
  // After a failed try the player has read the opening: go straight to the briefing, where the help is.
  const [beat, setBeat] = useState<'open' | 'brief'>(() => (story && story.help.length > 0 ? 'brief' : 'open'));
  if (!story) return null;
  return beat === 'open'
    ? <Opening vp={vp} story={story} onNext={() => setBeat('brief')} />
    : <Briefing vp={vp} story={story} onBack={() => setBeat('open')} />;
}

function Opening({ vp, story, onNext }: { vp: Viewport; story: StoryUi; onNext: () => void }) {
  const game = useGame();
  const two = !vp.portrait && vp.w >= 700;
  const { hook, rest } = splitHook(story.intro);
  const type = bodyType(vp);
  const saga = story.saga;
  const unit = story.unitLabel ?? 'Day';
  const unitUpper = unit.toUpperCase();
  const first = !saga && story.chapter === 1;
  const big = two && vp.h >= 380;
  const picCount = saga ? saga.faces.length : dayPicture(story.chapter, story.episodeId).faces.length;
  const n = Math.max(1, picCount);
  const scale = n <= 3 && big ? 3 : 2;
  // The picture's column: wide enough for the faces side by side at their scale.
  const col = Math.max(156, n * 18 * scale + (n - 1) * 4 + 16);
  const short = vp.h < 420;
  return (
    <Card fit vp={vp} band={storyBand(story)}
      head={saga ? `S${saga.season} DAY ${story.chapter} · ${WEEKDAY_UPPER(story.weekday)}` : `${unitUpper} ${story.chapter} · ${WEEKDAY_UPPER(story.weekday)}`}
      sub={saga ? saga.arcTitle : `${unit} ${story.chapter} of ${story.chapters}`}
      footer={
        <>
          <Btn variant="ghost" size={short ? 'md' : 'lg'} icon="back" label="Back to the title" onClick={() => game.toTitle()} sound="close">Title</Btn>
          <span style={{ flex: 1 }} />
          <Btn variant="primary" size={short ? 'md' : 'lg'} icon="arrow-right" onClick={onNext} sound="tap">{unit === 'Act' ? 'Act goal' : "Today's goal"}</Btn>
        </>
      }>
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: two ? 'row' : 'column', gap: 16, padding: two ? '12px 0 0 16px' : '10px 0 0 12px', minWidth: 0 }}>
        {two && (
          <div style={{ width: col, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 12 }}>
            <DayFaces chapter={story.chapter} episodeId={story.episodeId} saga={saga} scale={scale} />
          </div>
        )}
        <ScrollArea style={{ flex: '1 1 auto' }} inner={{ gap: 10, padding: two ? '0 16px 14px 0' : '0 12px 14px 0' }}>
          {first && (
            // A new episode starts here: its title banner before chapter 1.
            <div className="sc-drop" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 12, lineHeight: '16px', padding: '4px 6px 2px', background: 'var(--cth-ink-900)', color: 'var(--cth-cream-50)' }}>
                {(story.episodeBanner ?? story.episodeName ?? STORY_TITLE).toUpperCase()}
              </span>
              <span style={{ fontSize: 14, lineHeight: '17px', color: 'var(--cth-ink-500)' }}>
                {story.episodeBlurb ?? 'A story in five days, Monday to Friday'}
              </span>
            </div>
          )}
          {saga && (
            <div className="sc-drop" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 10, lineHeight: '14px', padding: '4px 6px 2px', background: 'var(--cth-ink-900)', color: 'var(--cth-cream-50)' }}>
                SEASON {saga.season} · {saga.arcTitle.toUpperCase()}
              </span>
              <span style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>Endless Saga · all powers free</span>
              {saga.aiCrafted && (
                <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px', padding: '2px 5px 1px', background: 'var(--cth-mint)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-900)' }}>
                  AI SHOWRUNNER
                </span>
              )}
            </div>
          )}
          <h2 className="sc-drop" style={{ margin: 0, fontFamily: 'var(--cth-font-display)', fontWeight: 400, fontSize: big ? 24 : 16, lineHeight: big ? '32px' : '24px', flexShrink: 0 }}>
            {story.title.toUpperCase()}
          </h2>
          {!two && <div style={{ flexShrink: 0 }}><DayFaces chapter={story.chapter} episodeId={story.episodeId} saga={saga} scale={2} /></div>}
          {story.recap && (
            <div className="sc-rise" style={{
              display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 10px 6px 12px', background: 'var(--cth-cream-100)', flexShrink: 0,
              boxShadow: 'inset 0 0 0 1px var(--cth-ink-700), inset 4px 0 0 var(--cth-lemon)', animationDelay: '80ms'
            }}>
              <span style={{ fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
                <span className="gu-label" style={{ marginRight: 6 }}>Before</span>{story.recap}
              </span>
            </div>
          )}
          <p className="sc-rise" style={{ margin: 0, fontSize: type.fontSize + 1, lineHeight: `${parseInt(type.lineHeight, 10) + 1}px`, color: 'var(--cth-ink-900)', flexShrink: 0, animationDelay: '140ms' }}>{hook}</p>
          {rest.map((p, i) => (
            <p key={i} className="sc-rise" style={{ margin: 0, ...type, color: 'var(--cth-ink-700)', flexShrink: 0, animationDelay: `${180 + i * 40}ms` }}>{p}</p>
          ))}
        </ScrollArea>
      </div>
    </Card>
  );
}

function Briefing({ vp, story, onBack }: { vp: Viewport; story: StoryUi; onBack: () => void }) {
  const game = useGame();
  const two = !vp.portrait && vp.w >= 700;
  const short = vp.h < 420;
  const [stuck, setStuck] = useState(true);
  const [howOpen, setHowOpen] = useState(story.chapter === 1);
  const goal = (
    <>
      <GoalCardTile story={story} />
      <Extras story={story} />
    </>
  );
  const clues = (
    <>
      {story.hints.length > 0 && (
        <>
          <Label>Clues</Label>
          <HintList hints={story.hints} />
        </>
      )}
      {story.help.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 8px 8px 10px', background: 'var(--cth-lemon-light)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)', flexShrink: 0 }}>
          <button type="button" className="gu-hit" onClick={() => { game.uiSound('tap'); setStuck((v) => !v); }} aria-expanded={stuck}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', padding: '4px 0', minHeight: 32, cursor: 'pointer', textAlign: 'left', touchAction: 'manipulation' }}>
            <GIcon name="tip" px={16} />
            <span style={{ flex: 1, fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px', color: 'var(--cth-ink-700)' }}>STUCK? WAYS THAT WORK</span>
            <span style={{ display: 'block', transform: stuck ? 'rotate(90deg)' : undefined }}><GIcon name="chev-right" px={16} /></span>
          </button>
          {stuck && story.help.map((h, i) => (
            <div key={i} style={{ fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-900)', paddingLeft: 22 }}>{h}</div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setHowOpen((v) => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, padding: 0,
        border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left'
      }}>
        <Label style={{ cursor: 'pointer' }}>{`How ${(story.spanLabel ?? 'the week').toLowerCase()} works`}</Label>
        {/* The pixel heading font has no triangle glyphs: the kit's chevron, turned down when open. */}
        <GIcon name="chev-right" px={12} style={{ transform: howOpen ? 'rotate(90deg)' : 'none' }} />
      </button>
      {howOpen && (
        story.saga ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <GIcon name="powers" px={16} style={{ marginTop: 1 }} />
              <span style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-700)' }}>All 34 powers, Whispers, Loudspeaker, and Anything are free and unlocked every day.</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <GIcon name="branch" px={16} style={{ marginTop: 1 }} />
              <span style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-700)' }}>
                Bonus goals (+3 standing each) and the chaos you cause change Standing and shape tomorrow's episode. After Friday's finale, the story carries straight on into Season {story.saga.season + 1}.
              </span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <GIcon name="influence" px={16} style={{ marginTop: 1 }} />
              <span style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-700)' }}>Influence is today's budget. {INFLUENCE_NOTE}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <GIcon name="branch" px={16} style={{ marginTop: 1 }} />
              <span style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-700)' }}>
                {story.standingMeaning
                  ? `${story.standingLabel ?? 'Standing'}: ${story.standingMeaning.charAt(0).toLowerCase() + story.standingMeaning.slice(1)}. ${story.endingRule ?? ''}`
                  : <>Standing is {STANDING_NOTE.charAt(0).toLowerCase() + STANDING_NOTE.slice(1)}. {MARKS_NOTE}</>}
              </span>
            </div>
          </>
        )
      )}
    </>
  );
  const saga = story.saga;
  const unit = story.unitLabel ?? 'Day';
  const unitLower = unit.toLowerCase();
  return (
    <Card vp={vp} band={storyBand(story)}
      head={saga ? `S${saga.season} · ${story.title.toUpperCase()}` : `${unit.toUpperCase()} ${story.chapter} · ${story.title.toUpperCase()}`}
      sub={saga ? `${saga.arcTitle} · Day ${story.chapter}` : `${unit} ${story.chapter} of ${story.chapters}`}
      footer={
        <>
          <FooterMeters story={story} vp={vp} />
          <span style={{ flex: 1 }} />
          <span style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <Btn variant="ghost" size={short ? 'md' : 'lg'} icon="back" label="Back to the story" onClick={onBack} sound="close" square />
            <Btn variant="primary" size={short ? 'md' : 'lg'} icon="play" sound="confirm" onClick={() => { game.beginChapter(); game.goFullscreen(); }}>Start the {unitLower}</Btn>
          </span>
        </>
      }>
      {two ? (
        <div className="sc-fade" style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, padding: '12px 0 0 16px' }}>
          <ScrollArea style={{ flex: 11 }} inner={{ gap: 10, padding: '0 8px 12px 0' }}>{goal}</ScrollArea>
          <ScrollArea style={{ flex: 9 }} inner={{ gap: 8, padding: '0 16px 12px 0' }}>{clues}</ScrollArea>
        </div>
      ) : (
        <ScrollArea style={{ flex: 1 }} inner={{ gap: 10, padding: '10px 12px 12px' }}>
          <div className="sc-fade" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{goal}{clues}</div>
        </ScrollArea>
      )}
    </Card>
  );
}

/** Influence (or Free Play badge in Saga), standing and the week in one row. */
function FooterMeters({ story, vp }: { story: StoryUi; vp: Viewport }) {
  const narrow = vp.w < 520;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, minWidth: 0, flexWrap: narrow ? 'wrap' : 'nowrap' }}>
      {story.saga ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} title="All powers, Whispers, Loudspeaker and Anything are free">
          <Label>Powers</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 20 }}>
            <GIcon name="powers" px={16} />
            <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 18, lineHeight: '16px', color: '#2f8a45' }}>FREE</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} title={`Influence: ${story.influence.left} of ${story.influence.max}`}>
          <Label>Influence</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 20 }}>
            <GIcon name="influence" px={16} />
            <Pips left={story.influence.left} max={story.influence.max} size={8} gap={2} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} title={`${story.standingLabel ?? 'Branch standing'} ${Math.round(story.standing)} of 100`}>
        <Label>{story.standingLabel ?? 'Standing'}</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 20 }}>
          <GIcon name="branch" px={16} />
          <StandingBar value={story.standing} w={52} h={10} />
          <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 20, lineHeight: '16px' }}>{Math.round(story.standing)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 150 }}>
        <Label>{story.spanLabel ?? 'The week'}</Label>
        <WeekStrip week={story.week} current={story.chapter} compact />
      </div>
    </div>
  );
}

function Extras({ story }: { story: StoryUi }) {
  if (!story.side.length) return null;
  const saga = !!story.saga;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Label style={{ marginTop: 4 }}>
        {saga ? 'Bonus goals: +3 standing each (everything stays free)' : `Extra goals: +${STANDING.extra} ${story.standingMeaning ? (story.standingLabel ?? 'standing').toLowerCase() : 'standing'} and +${EXTRA_INFLUENCE} influence each`}
      </Label>
      {story.side.map((x) => <ExtraRow key={x.id} goal={x} live={false} worth={saga ? 3 : undefined} />)}
    </div>
  );
}

/** The day's main goal on the chapter card: a peach-edged tile, like a toast. */
function GoalCardTile({ story }: { story: StoryUi }) {
  const g = story.goal;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      <Label>Today's goal</Label>
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 10px 10px 16px', background: 'var(--cth-cream-50)',
        boxShadow: 'inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 var(--cth-peach), 2px 2px 0 rgba(26,19,32,0.25)'
      }}>
        <IconTile icon={tileIcon(g)} size={40} bg="var(--cth-peach-light)" />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 10, lineHeight: '16px' }}>{g.title.toUpperCase()}</div>
          <div style={{ fontSize: 15, lineHeight: '19px', color: 'var(--cth-ink-700)' }}>{g.detail}</div>
          {g.status && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, lineHeight: '17px', color: 'var(--cth-ink-500)' }}>
              <GIcon name="clock" px={16} />{g.status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── End of day report ──

function useTyped(paragraphs: string[], writing: boolean, version = ''): { text: string[]; typing: boolean } {
  const total = useMemo(() => paragraphs.reduce((n, p) => n + p.length, 0), [paragraphs]);
  const [shown, setShown] = useState(0);
  // A different write-up (the model's version replacing the quick summary) types out from its start.
  useEffect(() => { setShown(0); }, [version]);
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
  // The card stays as it was while the wipe covers it, after the game has moved on to the next day.
  const r = useLast(useUi((s) => s.report));
  const live = useStory();
  const story = useLast(live?.result ? live : null);
  const mode = useUi((s) => s.mode);
  if (!r) return null;
  if (mode === 'story' || mode === 'saga') return story ? <StoryReport vp={vp} story={story} /> : null;
  return <SandboxReport vp={vp} />;
}

/** The day's write-up: the headline, the typed story, the quotes, the awards and some numbers. */
function DayWriteUp({ vp, story }: { vp: Viewport; story: StoryUi | null }) {
  const r = useLast(useUi((s) => s.report))!;
  const typed = useTyped(r.paragraphs, r.writing && !r.draft, r.draft ? 'draft' : 'final');
  const two = !vp.portrait && vp.w >= 700;
  const type = bodyType(vp);
  const up = r.stats.stockEnd >= r.stats.stockStart;
  const moved = story?.result ? resultLines(story.result.text, vp.h).moved : [];
  const words = (
    <div style={{ flex: 3, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {moved.map((t, i) => (
        <p key={`m${i}`} style={{ margin: 0, ...type, color: 'var(--cth-ink-700)' }}>{t}</p>
      ))}
      <h2 style={{ margin: 0, fontFamily: 'var(--cth-font-display)', fontSize: 12, lineHeight: '20px', fontWeight: 400 }}>{r.headline || 'The day'}</h2>
      {typed.text.map((p, i) => (
        <p key={i} className={typed.typing && i === typed.text.length - 1 ? 'gu-caret' : undefined}
          style={{ margin: 0, ...type, color: 'var(--cth-ink-900)' }}>{p}</p>
      ))}
      {typed.text.length === 0 && <p className="gu-caret" style={{ margin: 0, fontSize: 16, color: 'var(--cth-ink-500)' }}>Writing up the day</p>}
      {r.draft && !typed.typing && (
        <p className="gu-caret" style={{ margin: 0, fontSize: 14, lineHeight: '17px', color: 'var(--cth-ink-500)' }}>
          This is the short version. The model is writing a fuller one, and it will appear here
        </p>
      )}
      {r.quotes.length > 0 && (
        <>
          <Label style={{ marginTop: 4 }}>Quotes of the day</Label>
          {r.quotes.map((q, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Head src={q.avatar} scale={2} box={14} />
              <div style={{ fontSize: 15, lineHeight: '19px' }}>
                <span style={{ color: 'var(--cth-ink-900)' }}>"{q.text}"</span>
                <span style={{ color: 'var(--cth-ink-500)' }}> {q.name}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
  // What was spent: the budget, plus what extra goals gave back, less what is left.
  const bonus = story ? story.side.filter((x) => x.state === 'won').length * EXTRA_INFLUENCE : 0;
  const used = story ? Math.max(0, story.influence.max + bonus - story.influence.left) : 0;
  const numbers = (
    <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, width: two ? undefined : '100%' }}>
      {story ? (
        // Story & Saga modes: the numbers that move Branch Standing, not sandbox share price.
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {story.saga
            ? <Stat label="Peak chaos" value={`${Math.round(r.stats.chaosPeak)}%`} sub="today" />
            : <Stat label="Influence" value={String(used)} sub={`used, of ${story.influence.max + bonus}`} />}
          <Stat label="Incidents" value={String(r.stats.incidents)} sub={r.stats.incidents ? 'reported' : 'none'} />
          <Stat label="Morale" value={`${Math.round(r.stats.morale)}%`} sub="at five" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Stat label="Incidents" value={String(r.stats.incidents)} />
          <Stat label="Share price" value={r.stats.stockEnd.toFixed(1)} sub={`${up ? 'up' : 'down'} ${Math.abs(r.stats.stockEnd - r.stats.stockStart).toFixed(1)} today`} color={up ? '#2f8a45' : '#c43c3c'} />
          <Stat label="Morale" value={`${Math.round(r.stats.morale)}%`} />
          <Stat label="Peak chaos" value={`${Math.round(r.stats.chaosPeak)}%`} />
          <Stat label="Lines spoken" value={String(r.stats.lines)} />
        </div>
      )}
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
  );
  return two ? (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, padding: '12px 0 0 16px' }}>
      <ScrollArea style={{ flex: 3 }} inner={{ padding: '0 8px 12px 0' }}>{words}</ScrollArea>
      <ScrollArea style={{ flex: 2 }} inner={{ padding: '0 16px 12px 0' }}>{numbers}</ScrollArea>
    </div>
  ) : (
    <ScrollArea style={{ flex: 1 }} inner={{ gap: 16, padding: '12px 12px 12px' }}>{words}{numbers}</ScrollArea>
  );
}

function SandboxReport({ vp }: { vp: Viewport }) {
  const game = useGame();
  const r = useLast(useUi((s) => s.report))!;
  return (
    <Card vp={vp} band="var(--cth-lemon)" head={`DAY ${r.day}`} sub="End of day report"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Btn variant="primary" size={vp.h < 420 ? 'md' : 'lg'} icon="arrow-right" sound="confirm" onClick={() => game.nextDay()}>Next day</Btn>
        </>
      }>
      <DayWriteUp vp={vp} story={null} />
    </Card>
  );
}

/**
 * Story mode, in two pages. The result first, revealed in stages: the WON or LOST stamp lands,
 * the standing changes come in one by one, the number counts to its new value and today's tile
 * on the week turns over. Then the day itself: the story, the quotes, the awards, the numbers.
 */
function StoryReport({ vp, story }: { vp: Viewport; story: StoryUi }) {
  const game = useGame();
  const r = useLast(useUi((s) => s.report))!;
  const result = story.result!;
  const [page, setPage] = useState(0);
  const [askRetry, setAskRetry] = useState(false);
  const won = result.won;
  const lastDay = story.chapter >= story.chapters;
  const short = vp.h < 420;
  const delta = Math.round(result.standingAfter - result.standingBefore);
  const go = (p: number) => { if (p !== page) { game.uiSound('card'); setPage(p); } };
  const unit = story.unitLabel ?? 'Day';
  const unitLower = unit.toLowerCase();
  const act = reportActions(won, lastDay, unit, story.endNextLabel);
  const nextLabel = story.saga && lastDay ? 'See season finale' : act.nextLabel;
  const retry = () => {
    if (act.confirmRetry) { setAskRetry(true); return; }
    game.retryDay();
  };
  const size = short ? 'md' : 'lg';
  const buttons = askRetry ? (
    <Confirm text={`Play ${story.weekday} again from the start? This ${unitLower}'s win and its ${delta >= 0 ? '+' : ''}${delta} standing are undone until you win it again.`}
      keep="Keep the win" go="Play it again" danger={false}
      onKeep={() => setAskRetry(false)} onGo={() => { setAskRetry(false); game.retryDay(); }} />
  ) : (
    <span style={{ display: 'flex', gap: 8, marginLeft: 'auto', minWidth: 0 }}>
      {act.lead === 'next' ? (
        <>
          <Btn variant="secondary" size={size} icon="refresh" onClick={retry} style={{ flexShrink: 1, minWidth: 0 }}>
            {vp.w < 560 ? 'Again' : `Try the ${unitLower} again`}
          </Btn>
          <Btn variant="primary" size={size} icon="arrow-right" sound="confirm" onClick={() => game.nextDay()} style={{ flexShrink: 1, minWidth: 0 }}>{nextLabel}</Btn>
        </>
      ) : (
        // A lost day: trying again is the main way on; moving on is still there.
        <>
          <Btn variant="secondary" size={size} icon="arrow-right" onClick={() => game.nextDay()} style={{ flexShrink: 1, minWidth: 0 }}>
            {vp.w < 560 && !lastDay ? 'Move on' : nextLabel}
          </Btn>
          <Btn variant="primary" size={size} icon="play" sound="confirm" onClick={retry} style={{ flexShrink: 1, minWidth: 0 }}>Try the {unitLower} again</Btn>
        </>
      )}
    </span>
  );
  return (
    <Card vp={vp} band={storyBand(story)}
      head={story.saga ? `S${story.saga.season} · DAY ${story.chapter} · ${story.weekday.toUpperCase()}` : `${unit.toUpperCase()} ${story.chapter} · ${story.weekday.toUpperCase()}`}
      sub={story.saga ? story.saga.arcTitle : `End of ${unitLower} report`}
      footer={
        <>
          {!askRetry && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PageDots n={2} at={page} onPick={go} />
              <Btn variant="ghost" size="md" icon={page === 0 ? 'chev-right' : 'chev-left'} onClick={() => go(page === 0 ? 1 : 0)}>
                {page === 0 ? 'The day' : 'Result'}
              </Btn>
            </span>
          )}
          {buttons}
        </>
      }>
      {page === 0
        ? <ResultPage vp={vp} story={story} />
        : <div key="day" className="sc-fade" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}><DayWriteUp vp={vp} story={story} /></div>}
    </Card>
  );
}

/** Which result was last revealed in full, so going back to page one does not replay it. */
let revealedFor = '';

/** Page one of the story report, revealed in stages the first time it is shown. */
function ResultPage({ vp, story }: { vp: Viewport; story: StoryUi }) {
  const game = useGame();
  const result = story.result!;
  const two = !vp.portrait && vp.w >= 700;
  const type = bodyType(vp);
  const key = `${story.chapter}:${result.standingBefore}:${result.standingAfter}:${result.won}:${result.changes.length}`;
  const seen = useRef(revealedFor === key).current;
  const n = result.changes.length;
  const delta = result.standingAfter - result.standingBefore;
  const { times, countMs } = useMemo(() => revealTimes(n, delta), [n, delta]);
  const { stage, skip, done } = useStages(times, {
    instant: seen,
    onStage: (i) => {
      if (i === 0) game.uiSound('stamp');
      else if (i <= n) game.uiSound('tick');
      else if (i === n + 1) game.uiSound('card');
    }
  });
  useEffect(() => { if (done) revealedFor = key; }, [done, key]);
  const stamped = stage >= 1;
  const rows = Math.max(0, Math.min(n, stage - 1));
  const counting = stage >= n + 2;
  const flipped = stage >= n + 3;
  const lastTick = useRef(0);
  const shownStanding = useCountUp(result.standingBefore, result.standingAfter, counting, countMs, () => {
    const now = performance.now();
    if (now - lastTick.current > 70) { lastTick.current = now; game.uiSound('tick'); }
  });
  const won = result.won;
  const week = story.week.map((d) => (d.chapter === story.chapter && !flipped ? { ...d, result: null } : d));
  const left = (
    <div style={{ flex: 3, minWidth: 0, display: 'flex', flexDirection: 'column', gap: vp.h < 420 ? 6 : 8 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 6px 6px', minHeight: 44, flexShrink: 0,
        background: stamped ? (won ? 'var(--cth-mint)' : 'var(--cth-coral)') : 'var(--cth-cream-100)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)'
      }}>
        <span className={stamped && !seen ? 'sc-slam' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, visibility: stamped ? 'visible' : 'hidden' }}>
          <IconTile icon={won ? 'trophy' : 'x'} size={32} bg="var(--cth-cream-50)" />
          <span style={{
            fontFamily: 'var(--cth-font-display)', fontSize: 16, lineHeight: '20px', padding: '4px 6px 2px',
            background: 'var(--cth-ink-900)', color: 'var(--cth-cream-50)', flexShrink: 0
          }}>{won ? 'WON' : 'LOST'}</span>
        </span>
        <span style={{ fontSize: 18, lineHeight: '21px', minWidth: 0 }}>{story.goal.title}</span>
      </div>
      {resultLines(result.text, vp.h).shown.map((t, i) => (
        <p key={i} style={{ margin: 0, ...(vp.h < 420 ? { fontSize: 15, lineHeight: '19px' } : type), color: i === 0 ? 'var(--cth-ink-900)' : 'var(--cth-ink-700)' }}>{t}</p>
      ))}
      {n > 0 && <Label style={{ marginTop: 2 }}>Changes to standing</Label>}
      {result.changes.map((c, i) => (
        <div key={i} className={i < rows && !seen ? 'sc-rise' : undefined} style={{ visibility: i < rows ? 'visible' : 'hidden' }}>
          <ChangeRow text={c.text} delta={c.delta} />
        </div>
      ))}
    </div>
  );
  const right = (
    <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <GIcon name="branch" px={16} />
        <Label style={{ flex: 1 }}>{story.standingMeaning ? (story.standingLabel ?? 'Standing') : 'Branch standing'}</Label>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontFamily: 'var(--cth-font-mono)' }}>
        <span style={{ fontSize: 24, lineHeight: '20px', color: 'var(--cth-ink-500)' }}>{Math.round(result.standingBefore)}</span>
        <GIcon name="arrow-right" px={16} style={{ alignSelf: 'center' }} />
        <span style={{ fontSize: 34, lineHeight: '26px' }}>{shownStanding}</span>
        {counting && (
          <span className={seen ? undefined : 'sc-rise'} style={{ fontSize: 22, lineHeight: '20px', color: delta >= 0 ? '#2f8a45' : '#c43c3c' }}>{delta >= 0 ? '+' : ''}{Math.round(delta)}</span>
        )}
      </div>
      <StandingBar value={shownStanding} from={result.standingBefore} h={16} style={{ margin: '2px 0' }} />
      <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
        {story.standingMeaning
          ? `${story.standingMeaning}.`
          : <>{STANDING_NOTE}: <span style={{ color: 'var(--cth-ink-700)' }}>{standingWord(done ? result.standingAfter : shownStanding).toLowerCase()}.</span></>}
      </div>
      <div className={flipped && !seen ? 'sc-flip' : undefined} style={{ marginTop: 4 }}>
        <WeekStrip week={week} current={story.chapter} />
      </div>
    </div>
  );
  return (
    <div onPointerDown={() => { if (!done) skip(); }} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {two ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, padding: '12px 0 0 16px' }}>
          <ScrollArea style={{ flex: 3 }} inner={{ padding: '0 8px 12px 0' }}>{left}</ScrollArea>
          <ScrollArea style={{ flex: 2 }} inner={{ padding: '0 16px 12px 0' }}>{right}</ScrollArea>
        </div>
      ) : (
        <ScrollArea style={{ flex: 1 }} inner={{ gap: 14, padding: '12px 12px 12px' }}>{left}{right}</ScrollArea>
      )}
    </div>
  );
}

/** One standing change: the points in a mint or coral tile, then the plain cause. */
function ChangeRow({ text, delta }: { text: string; delta: number }) {
  const up = delta >= 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 44, flexShrink: 0, textAlign: 'center', padding: '2px 0 0', fontFamily: 'var(--cth-font-mono)', fontSize: 22, lineHeight: '20px',
        background: up ? 'var(--cth-mint)' : 'var(--cth-coral)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)'
      }}>{up ? '+' : '-'}{Math.abs(Math.round(delta))}</span>
      <span style={{ fontSize: 15, lineHeight: '18px', minWidth: 0 }}>{text}</span>
    </div>
  );
}

// ── Story: the end of the week ──

const ENDING_ACCENT: Record<'saved' | 'scraped' | 'closed', string> = { saved: 'var(--cth-mint)', scraped: 'var(--cth-lemon)', closed: 'var(--cth-coral)' };
const ENDING_FACE: Record<'saved' | 'scraped' | 'closed', EmotionId> = { saved: 'happy', scraped: 'nervous', closed: 'sad' };

/** The episode's opening scene on the floor: its banner and skip control. */
export function IntroSkip() {
  const game = useGame();
  const intro = useUi((s) => s.intro);
  const story = useUi((s) => s.story);
  const episodes = useUi((s) => s.episodes);
  if (!intro) return null;
  const ep = episodes.find((e) => e.id === story?.episodeId);
  const name = story?.episodeName ?? ep?.title ?? 'Story mode';
  const band = story?.band ?? ep?.band ?? 'var(--cth-mint)';
  return (
    <>
      <div style={{
        position: 'absolute', left: '50%', top: 'max(10px, env(safe-area-inset-top))', transform: 'translateX(-50%)',
        maxWidth: 'min(520px, calc(100% - 24px))', zIndex: 20, pointerEvents: 'none',
        padding: '7px 12px', background: 'var(--cth-cream-50)', boxShadow: hardShadow,
        display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', textAlign: 'center',
      }}>
        <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, lineHeight: '12px', color: 'var(--cth-ink-500)' }}>
          {ep ? `EPISODE ${ep.number} · ` : ''}{name.toUpperCase()}
        </span>
        <span style={{ fontSize: 15, lineHeight: '19px', color: 'var(--cth-ink-900)' }}>{intro.caption}</span>
        <div style={{ width: '100%', maxWidth: 260, height: 4, background: 'var(--cth-cream-300)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-900)' }}>
          <div style={{ width: `${Math.round(intro.progress * 100)}%`, height: '100%', background: band }} />
        </div>
      </div>
      {intro.canSkip && (
        <div style={{ position: 'absolute', right: 'max(12px, env(safe-area-inset-right))', bottom: 'max(12px, env(safe-area-inset-bottom))', zIndex: 20, pointerEvents: 'auto' }}>
          <Btn variant="secondary" size="md" icon="ff" onClick={() => game.skipIntro()} sound="tap">Skip intro</Btn>
        </div>
      )}
    </>
  );
}

/** While the week's last scene plays on the floor: only a way to skip it. */
export function FinaleSkip() {
  const game = useGame();
  return (
    <div style={{ position: 'absolute', right: 'max(12px, env(safe-area-inset-right))', bottom: 'max(12px, env(safe-area-inset-bottom))', zIndex: 20, pointerEvents: 'auto' }}>
      <Btn variant="secondary" size="md" icon="ff" onClick={() => game.skipFinale()} sound="tap">Skip</Btn>
    </div>
  );
}

/**
 * The end of the week, in two pages: how it ended (the verdict, the five faces, what Corporate
 * decided, the final standing and the week), then the people (how the week left them, and the
 * cast rolling up the page).
 */
export function EndingCard({ vp }: { vp: Viewport }) {
  const game = useGame();
  const live = useStory();
  // Held while the wipe covers it ("Play again" starts the next week at once).
  const story = useLast(live?.ending ? live : null);
  const [page, setPage] = useState(0);
  if (!story || !story.ending) return null;
  const e = story.ending;
  const saga = story.saga;
  const unitLower = (story.unitLabel ?? 'Day').toLowerCase();
  const epId = story.episodeId;
  const next = story.nextEpisode ?? null;
  const two = !vp.portrait && vp.w >= 700;
  const short = vp.h < 420;
  const type = bodyType(vp);
  const won = story.week.filter((d) => d.result === 'won').length;
  const go = (p: number) => { if (p !== page) { game.uiSound('card'); setPage(p); } };
  const verdict = (
    <div style={{ flex: 3, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: two ? 'row' : 'column', alignItems: 'center', gap: two ? 14 : 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {['michael', 'dwight', 'pam', 'jim', 'angela'].map((id, i) => (
            <div key={id} className="sc-hop" style={{ animationDelay: `${150 + i * 70}ms` }}>
              <Portrait src={game.avatar(id, ENDING_FACE[e.id]) || game.avatar(id)} scale={vp.h >= 380 ? 2 : 1} />
            </div>
          ))}
        </div>
        <h1 className="sc-slam" style={{
          margin: 0, flex: 1, fontFamily: 'var(--cth-font-display)', fontWeight: 400, textAlign: two ? 'left' : 'center',
          fontSize: two && vp.h >= 380 ? 20 : 16, lineHeight: two && vp.h >= 380 ? '30px' : '24px', color: 'var(--cth-ink-900)', animationDelay: '100ms'
        }}>{e.title}</h1>
      </div>
      {e.text.map((p, i) => (
        <p key={i} className="sc-rise" style={{ margin: 0, ...type, color: 'var(--cth-ink-900)', animationDelay: `${300 + i * 80}ms` }}>{p}</p>
      ))}
    </div>
  );
  const numbers = (
    <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, width: two ? undefined : '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <GIcon name="branch" px={16} />
        <Label style={{ flex: 1 }}>{story.standingLabel ?? 'Final standing'}</Label>
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 34, lineHeight: '24px', color: 'var(--cth-ink-900)' }}>{Math.round(story.standing)}</span>
      </div>
      <StandingBar value={story.standing} h={16} />
      <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
        {story.standingNote ?? `${STANDING_NOTE}. ${MARKS_NOTE}`}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <Label style={{ flex: 1 }}>{saga ? `Season ${saga.season}` : story.spanLabel ?? 'The week'}</Label>
        <span style={{ fontSize: 13, color: 'var(--cth-ink-700)' }}>{won} of {story.week.length} {unitLower}s won</span>
      </div>
      <WeekStrip week={story.week} titles />
      {saga && saga.history.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {saga.history.slice(-4).map((h) => (
            <span key={h.season} style={{
              fontSize: 12, lineHeight: '15px', padding: '2px 6px', background: 'var(--cth-cream-100)',
              boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)', color: 'var(--cth-ink-700)'
            }}>
              S{h.season}: {h.arcTitle} ({Math.round(h.standing)})
            </span>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <Card vp={vp} band={ENDING_ACCENT[e.id]}
      head={saga ? `SEASON ${saga.season} FINALE` : story.endHead ?? 'FRIDAY, 17:00'}
      sub={saga ? saga.arcTitle : story.endSub ?? 'The week is over'}
      footer={
        <>
          <Btn variant="secondary" size={short ? 'md' : 'lg'} icon="back" onClick={() => game.toTitle()} sound="close" style={{ flexShrink: 1, minWidth: 0 }}>
            {vp.w < 560 ? 'Title' : 'Back to the title'}
          </Btn>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 auto' }}>
            <PageDots n={2} at={page} onPick={go} />
            <Btn variant="ghost" size="md" icon={page === 0 ? 'chev-right' : 'chev-left'} onClick={() => go(page === 0 ? 1 : 0)}>
              {page === 0 ? 'The people' : 'The verdict'}
            </Btn>
          </span>
          {saga ? (
            <Btn variant="primary" size={short ? 'md' : 'lg'} icon="play" sound="confirm" onClick={() => game.nextSeason()} style={{ flexShrink: 1, minWidth: 0 }}>
              Start Season {saga.season + 1}
            </Btn>
          ) : !next ? (
            <Btn variant="primary" size={short ? 'md' : 'lg'} icon="play" sound="confirm" onClick={() => game.startStory(true, epId)} style={{ flexShrink: 1, minWidth: 0 }}>
              Play again
            </Btn>
          ) : (
            <span style={{ display: 'flex', gap: 6, flexShrink: 1, minWidth: 0 }}>
              <Btn variant="secondary" size={short ? 'md' : 'lg'} icon="refresh" sound="confirm" onClick={() => game.startStory(true, epId)} style={{ flexShrink: 1, minWidth: 0 }}>
                Play again
              </Btn>
              <Btn variant="primary" size={short ? 'md' : 'lg'} icon="arrow-right" sound="confirm" onClick={() => game.startStory(true, next.id)} style={{ flexShrink: 1, minWidth: 0 }}>
                Next: {next.title}
              </Btn>
            </span>
          )}
        </>
      }>
      {page === 0 ? (
        two ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, padding: '12px 0 0 16px' }}>
            <ScrollArea style={{ flex: 3 }} inner={{ padding: '0 8px 12px 0' }}>{verdict}</ScrollArea>
            <ScrollArea style={{ flex: 2 }} inner={{ padding: '0 16px 12px 0' }}>{numbers}</ScrollArea>
          </div>
        ) : (
          <ScrollArea style={{ flex: 1 }} inner={{ gap: 14, padding: '12px 12px 12px' }}>{verdict}{numbers}</ScrollArea>
        )
      ) : (
        <People vp={vp} story={story} />
      )}
    </Card>
  );
}

/** Page two of the ending: how the week left them, and the cast. */
function People({ vp, story }: { vp: Viewport; story: StoryUi }) {
  const two = !vp.portrait && vp.w >= 700;
  const epilogue = story.ending?.epilogue ?? [];
  const lines = epilogue.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Label>{story.saga ? 'Season highlights' : 'How the week left them'}</Label>
      {epilogue.map((l, i) => (
        <div key={i} className="sc-rise" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', animationDelay: `${i * 90}ms` }}>
          <span style={{ width: 8, height: 8, marginTop: 6, flexShrink: 0, background: 'var(--cth-ink-700)' }} />
          <span style={{ fontSize: 15, lineHeight: '19px', color: 'var(--cth-ink-900)' }}>{l}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="sc-fade" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: two ? 'row' : 'column', gap: 16, padding: two ? '12px 16px 12px' : '12px 12px 8px' }}>
      {lines && <ScrollArea style={{ flex: 3 }} inner={{ paddingRight: 8 }}>{lines}</ScrollArea>}
      <Credits style={{ flex: lines ? 2 : 1 }} />
    </div>
  );
}

/** The cast rolls up the page in whole-pixel steps, once, and stops on the last name. */
function Credits({ style }: { style?: React.CSSProperties }) {
  const people = useUi((s) => s.people.filter((p) => !p.id.startsWith('visitor:')).map((p) => ({ id: p.id, name: p.name, role: p.role, avatar: p.avatar, color: p.color })));
  const box = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const [roll, setRoll] = useState(0);
  useLayoutEffect(() => {
    const b = box.current, l = list.current;
    if (!b || !l) return;
    setRoll(Math.max(0, l.scrollHeight - b.clientHeight));
  }, [people.length]);
  const steps = Math.max(1, Math.round(roll / 2));
  const still = reducedMotion() || roll === 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, minWidth: 0, ...style }}>
      <Label>Starring</Label>
      <div ref={box} className={still ? 'sc-scroll' : undefined}
        style={{ position: 'relative', flex: 1, minHeight: 120, overflow: still ? undefined : 'hidden', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', background: 'var(--cth-cream-100)' }}>
        <div ref={list} className={still ? undefined : 'sc-roll'}
          style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px', maxWidth: 300, margin: '0 auto', ['--sc-roll' as string]: `-${roll}px`, ['--sc-roll-time' as string]: `${Math.max(6, roll / 30)}s`, ['--sc-roll-steps' as string]: steps } as React.CSSProperties}>
          {people.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Head src={p.avatar} scale={2} box={14} ring={p.color} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, lineHeight: '17px', color: 'var(--cth-ink-900)' }}>{p.name}</div>
                <div style={{ fontSize: 12, lineHeight: '14px', color: 'var(--cth-ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.role}</div>
              </div>
            </div>
          ))}
          <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px', color: 'var(--cth-ink-500)', padding: '8px 0 4px', textAlign: 'center' }}>THANKS FOR PLAYING</div>
        </div>
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
