import { useState, type CSSProperties } from 'react';
import type { HarnessConfig } from '@/store/config';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';

export interface GameSettingsModalProps {
  config: HarnessConfig;
  onClose: () => void;
}

const inputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px',
  border: '2px solid var(--cth-ink-900)', background: 'var(--cth-cream-50)',
  fontFamily: 'var(--cth-font-mono, monospace)', fontSize: 13, color: 'var(--cth-ink-900)'
};
const labelStyle: CSSProperties = {
  fontFamily: 'var(--cth-font-display)', fontSize: 9, lineHeight: '12px',
  color: 'var(--cth-ink-500)', textTransform: 'uppercase', letterSpacing: '0.04em'
};

/** Wipe persisted state (Electron localStorage keys + the web adapter's config). */
function clearLocalState(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith('cth.') || k.startsWith('cthweb.') || k.startsWith('cthgame.'))) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
  } catch { /* noop */ }
}

export function GameSettingsModal({ config, onClose }: GameSettingsModalProps) {
  const [baseUrl, setBaseUrl] = useState(config.llmBaseUrl ?? '');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await window.cth.updateConfig({ llmBaseUrl: baseUrl.trim() || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const reset = () => {
    clearLocalState();
    window.location.reload();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26, 19, 32, 0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: '92vw' }}>
        <PixelPanel variant="dialog" title="SETTINGS" noPadding>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>Ollama server</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://127.0.0.1:11434"
                />
                <PixelButton variant="primary" size="md" onClick={save}>
                  {saved ? 'saved' : 'save'}
                </PixelButton>
              </div>
              <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
                Where your local model lives. Leave blank for the default. In a browser
                you must start Ollama allowing this origin:&nbsp;
                <code>OLLAMA_ORIGINS={typeof location !== 'undefined' ? location.origin : '*'} ollama serve</code>
              </span>
            </div>

            <div style={{ height: 2, background: 'var(--cth-ink-300)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 10, color: '#6E1423' }}>
                RESET
              </span>
              <p style={{ margin: 0, fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
                Clear the saved scene, roster state, and settings, then reload.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <PixelButton variant="secondary" size="md" onClick={onClose}>close</PixelButton>
              <PixelButton variant="destructive" size="md" onClick={reset}>reset world</PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}
