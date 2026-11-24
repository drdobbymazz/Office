// SETTINGS: the story (in story mode), sound, game, brain and data.

import { useState } from 'react';
import type { ProviderKind } from '@/game/brain/api';
import type { GameSettings } from '@/game/app/gameApi';
import { GIcon, type GIconName } from './icons';
import { STANDING_START } from '@/game/story/rules';
import { Btn, Label, Light, Section, Seg, Toggle } from './kit';
import { useGame, useUi } from './ctx';
import { useStory } from './Story';

const PROVIDERS: { id: ProviderKind; name: string; hint: string }[] = [
  { id: 'ollama', name: 'Ollama', hint: 'Your own model server.' },
  { id: 'openai', name: 'OpenAI-compatible', hint: 'LM Studio, llama.cpp, vLLM and others.' },
  { id: 'claude', name: 'Claude', hint: 'Only inside a Claude artifact.' },
  { id: 'instinct', name: 'Instinct only', hint: 'No model. Written lines and simple rules.' }
];

function Radio({ on, name, hint, onTap }: { on: boolean; name: string; hint: string; onTap: () => void }) {
  return (
    <button type="button" className="gu-hit" onClick={onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '4px 8px', border: 'none',
        textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation',
        background: on ? 'var(--cth-lilac-light)' : 'var(--cth-cream-50)',
        boxShadow: on ? 'inset 0 0 0 2px var(--cth-ink-900)' : 'inset 0 0 0 1px var(--cth-ink-700)'
      }}>
      <span style={{ width: 16, height: 16, flexShrink: 0, background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)', display: 'grid', placeItems: 'center' }}>
        {on && <span style={{ width: 8, height: 8, background: 'var(--cth-ink-900)' }} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, lineHeight: '18px' }}>{name}</span>
        <span style={{ display: 'block', fontSize: 12, lineHeight: '14px', color: 'var(--cth-ink-500)' }}>{hint}</span>
      </span>
    </button>
  );
}

function BrainSection() {
  const game = useGame();
  const brain = useUi((s) => s.settings.brain);
  const inArtifact = useUi((s) => s.inArtifact);
  const [models, setModels] = useState<string[]>([]);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const providers = PROVIDERS.filter((p) => p.id !== 'claude' || inArtifact)
    .filter((p) => !inArtifact || p.id === 'claude' || p.id === 'instinct');
  // Inside an artifact there is no network, so server settings never apply.
  const needsServer = !inArtifact && (brain.provider === 'ollama' || brain.provider === 'openai');

  const test = () => {
    setTesting(true);
    setResult(null);
    game.testBrain().then((st) => {
      if (st.models.length) setModels(st.models);
      setResult(st.ok
        ? { ok: true, text: `Connected${st.waking ? ', the model is waking up' : ''}${st.tokPerSec ? `. ${st.tokPerSec.toFixed(1)} tokens a second.` : '.'}` }
        : { ok: false, text: st.error ?? 'Could not connect.' });
      game.uiSound(st.ok ? 'confirm' : 'deny');
    }).catch(() => setResult({ ok: false, text: 'Could not connect.' })).finally(() => setTesting(false));
  };

  // "name" and "name:latest" are the same model to the server, so they are the same here too.
  const bare = (m: string): string => m.replace(/:latest$/, '');
  const current = models.find((m) => bare(m) === bare(brain.model)) ?? brain.model;
  const modelList = models.includes(current) || !current ? models : [current, ...models];
  return (
    <Section title="BRAIN" accent="lilac">
      <Label>Who plays the staff</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {providers.map((p) => (
          <Radio key={p.id} on={brain.provider === p.id} name={p.name} hint={p.hint}
            onTap={() => { game.uiSound('tap'); game.updateBrain({ provider: p.id }); setResult(null); }} />
        ))}
      </div>
      {needsServer && (
        <>
          <Label>Server address</Label>
          <input className="gu-field gu-hit" value={brain.baseUrl} spellCheck={false} autoCapitalize="off" autoCorrect="off"
            inputMode="url" onChange={(e) => game.updateBrain({ baseUrl: e.target.value })} placeholder="http://localhost:11434" />
          {brain.provider === 'openai' && (
            <>
              <Label>Key (if the server needs one)</Label>
              <input className="gu-field gu-hit" type="password" value={brain.apiKey} autoComplete="off"
                onChange={(e) => game.updateBrain({ apiKey: e.target.value })} placeholder="optional" />
            </>
          )}
          <Label>Model</Label>
          {modelList.length > 0 ? (
            <select className="gu-field gu-hit" value={current} onChange={(e) => game.updateBrain({ model: e.target.value })}>
              {modelList.map((m) => <option key={m} value={m}>{bare(m)}{models.length && !models.includes(m) ? ' (not found)' : ''}</option>)}
            </select>
          ) : (
            <input className="gu-field gu-hit" value={brain.model} spellCheck={false} autoCapitalize="off"
              onChange={(e) => game.updateBrain({ model: e.target.value })} placeholder="artemis-custom" />
          )}
          {modelList.length === 0 && <div style={{ fontSize: 12, lineHeight: '14px', color: 'var(--cth-ink-500)' }}>Press Test to fill this list from the server.</div>}
        </>
      )}
      {brain.provider === 'claude' && (
        <>
          <Label>Speed</Label>
          <Seg value={brain.claudeTier} accent="lilac" onChange={(v) => game.updateBrain({ claudeTier: v })}
            options={[{ value: 'quick', label: 'Quick' }, { value: 'default', label: 'Thorough' }]} />
        </>
      )}
      {brain.provider !== 'instinct' && (
        <>
          <Label>Wildness · {brain.temperature.toFixed(1)}</Label>
          <input type="range" className="gu-range gu-hit" min={3} max={13} value={Math.round(brain.temperature * 10)}
            onChange={(e) => game.updateBrain({ temperature: Number(e.target.value) / 10 })} />
        </>
      )}
      <Btn variant="primary" size="md" full icon="refresh" disabled={testing} onClick={test} sound="tap">
        {testing ? 'Testing...' : 'Test'}
      </Btn>
      {result && (
        <div className="gu-drop" style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px 8px 14px', fontSize: 14, lineHeight: '18px',
          background: 'var(--cth-cream-50)', boxShadow: `inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 var(--cth-${result.ok ? 'mint' : 'coral'})`
        }}>
          <span style={{ marginTop: 4 }}><Light color={result.ok ? 'var(--cth-mint)' : 'var(--cth-coral)'} /></span>
          <span>{result.text}</span>
        </div>
      )}
    </Section>
  );
}

function GameSection() {
  const game = useGame();
  const s = useUi((st) => ({
    dayMinutes: st.settings.dayMinutes, autoCamera: st.settings.autoCamera, captions: st.settings.captions,
    sandbox: st.settings.sandbox, haptics: st.settings.haptics, quality: st.settings.quality, story: st.mode === 'story'
  }));
  const set = (p: Partial<GameSettings>) => game.updateSettings(p);
  return (
    <Section title="GAME" accent="lemon">
      <Label>Length of a day</Label>
      {s.story ? (
        // A story day always runs at the length it was balanced for, and keeps its cooldowns:
        // the two sandbox settings apply in Sandbox and Endless Saga instead.
        <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
          Classic Story days always last 10 minutes. Day length and No cooldowns apply in Sandbox and Endless Saga.
        </div>
      ) : (
        <Seg value={s.dayMinutes} onChange={(v) => set({ dayMinutes: v })}
          options={[{ value: 6, label: '6 min' }, { value: 10, label: '10 min' }, { value: 16, label: '16 min' }]} />
      )}
      <Toggle label="Camera follows the action" on={s.autoCamera} onChange={(v) => set({ autoCamera: v })} />
      <Toggle label="Subtitles" hint="Show the line being spoken." on={s.captions} onChange={(v) => set({ captions: v })} />
      {!s.story && <Toggle label="No cooldowns" hint="Sandbox & Endless Saga: powers can be used again at once." on={s.sandbox} onChange={(v) => set({ sandbox: v })} />}
      <Toggle label="Vibration" on={s.haptics} onChange={(v) => set({ haptics: v })} />
      <Label>Picture quality</Label>
      <Seg value={s.quality} onChange={(v) => set({ quality: v })}
        options={[{ value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'high', label: 'High' }]} />
    </Section>
  );
}

const VOLS: { key: keyof GameSettings['volumes']; label: string }[] = [
  { key: 'master', label: 'Everything' }, { key: 'music', label: 'Music' }, { key: 'sfx', label: 'Effects' }, { key: 'voice', label: 'Voices' }
];

function SoundSection() {
  const game = useGame();
  const vol = useUi((s) => s.settings.volumes);
  const muted = useUi((s) => s.settings.muted);
  return (
    <Section title="SOUND" accent="sky">
      <Toggle label="Mute" on={muted} onChange={(v) => game.updateSettings({ muted: v })} />
      {VOLS.map((v) => (
        <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: muted ? 0.5 : 1 }}>
          <span style={{ flex: '0 0 84px', minWidth: 84, fontSize: 14 }}>{v.label}</span>
          <input type="range" className="gu-range gu-hit" min={0} max={10} value={Math.round(vol[v.key] * 10)}
            onChange={(e) => game.updateSettings({ volumes: { ...vol, [v.key]: Number(e.target.value) / 10 } })}
            onPointerUp={() => game.uiSound('tap')} />
        </div>
      ))}
    </Section>
  );
}

/** One story action with its own "are you sure" in place, as on the title card. */
function StoryAction({ icon, label, ask, go, onGo, danger }: {
  icon: GIconName; label: string; ask: string; go: string; onGo: () => void; danger?: boolean;
}) {
  const [sure, setSure] = useState(false);
  if (!sure) return <Btn variant="secondary" size="md" full icon={icon} onClick={() => setSure(true)} sound="open">{label}</Btn>;
  return (
    <div className="gu-drop" style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px 10px 14px', background: 'var(--cth-cream-50)',
      boxShadow: `inset 0 0 0 2px var(--cth-ink-900), inset 6px 0 0 var(--cth-${danger ? 'coral' : 'lemon'})`
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <GIcon name="warn" px={16} style={{ marginTop: 2 }} />
        <span style={{ fontSize: 14, lineHeight: '18px' }}>{ask}</span>
      </div>
      {/* One above the other: the panel is narrow on a phone, and both labels must read in full. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Btn variant={danger ? 'destructive' : 'primary'} size="md" full onClick={() => { setSure(false); onGo(); }} sound="confirm">{go}</Btn>
        <Btn variant="secondary" size="md" full onClick={() => setSure(false)} sound="close">Keep playing</Btn>
      </div>
    </div>
  );
}

/** Story or Endless Saga: start the day or the campaign again, or leave for the title. */
function StorySection() {
  const game = useGame();
  const story = useStory();
  const phase = useUi((s) => s.phase);
  if (!story) return null;
  const day = story.weekday;
  const saga = story.saga;
  return (
    <Section title={saga ? 'SAGA' : 'STORY'} accent={saga ? 'lilac' : 'peach'}>
      <div style={{ fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
        {saga
          ? `Season ${saga.season} · ${saga.arcTitle}, day ${story.chapter} of ${story.chapters}: ${day}, ${story.title}.`
          : `Closing Time, day ${story.chapter} of ${story.chapters}: ${day}, ${story.title}.`}
      </div>
      {(phase === 'playing' || phase === 'briefing') && (
        <StoryAction icon="refresh" label="Restart this day" go={`Restart ${day}`}
          ask={`Start ${day} again from 08:50? Everything done today is undone${saga ? ' and standing returns to this morning' : ' and the influence comes back'}.`}
          onGo={() => game.retryDay()} />
      )}
      <StoryAction icon="back" label="Back to the title" go="Leave"
        ask={`Leave for the title? Your progress is saved, and ${day} starts again from the morning when you come back.`}
        onGo={() => game.toTitle()} />
      <StoryAction icon="play" label={saga ? 'Start a new Saga' : 'Start the week again'} go={saga ? 'New saga' : 'New week'} danger
        ask={saga
          ? `Start a brand new Endless Saga from Season 1 Monday? Your current seasons and Season ${saga.season} standing are reset.`
          : `Start a new week from Monday? Standing goes back to ${STANDING_START} and this week is lost.`}
        onGo={() => (saga ? game.startSaga(true) : game.startStory(true))} />
    </Section>
  );
}

function DataSection() {
  const game = useGame();
  const narrative = useUi((s) => s.mode === 'story' || s.mode === 'saga');
  const [sure, setSure] = useState(false);
  return (
    <Section title="DATA" accent="peach">
      {!sure ? (
        <>
          <div style={{ fontSize: 14, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
            {narrative ? 'The sandbox office, Classic Story, and Endless Saga save separately. This wipes the sandbox only.' : 'The office saves itself as you play.'}
          </div>
          <Btn variant="destructive" size="md" full onClick={() => setSure(true)} sound="open">{narrative ? 'Wipe the sandbox office' : 'Start again from day 1'}</Btn>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <GIcon name="warn" px={16} style={{ marginTop: 2 }} />
            <span style={{ fontSize: 14, lineHeight: '18px' }}>
              {narrative ? 'This wipes every memory, feeling and day of the sandbox office. Your story & saga saves are kept. It cannot be undone.' : 'This wipes every memory, feeling and day so far. It cannot be undone.'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" size="md" full onClick={() => setSure(false)} sound="close">Keep playing</Btn>
            <Btn variant="destructive" size="md" full onClick={() => { setSure(false); game.resetWorld(); }} sound="confirm">Wipe it</Btn>
          </div>
        </>
      )}
    </Section>
  );
}

export function SettingsTab() {
  // The things a player changes most come first; the model setup is for the owner, further down.
  return (
    <>
      <StorySection />
      <SoundSection />
      <GameSection />
      <BrainSection />
      <DataSection />
    </>
  );
}
