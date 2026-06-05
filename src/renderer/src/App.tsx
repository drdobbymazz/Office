import { useEffect, useState } from 'react';
import { useStore } from '@/store/store';
import type { HarnessConfig } from '@/store/config';
import { OfficeFloor } from '@/scene/office/OfficeFloor';
import { useDirector } from '@/game/useDirector';
import { GameDirectorPanel } from '@/components/GameDirectorPanel';
import { GameSettingsModal } from '@/components/GameSettingsModal';
import { PixelPanel } from '@/components/PixelPanel';
import { Icon } from '@/components/Icon';
import { SidebarSplitter } from '@/components/SidebarSplitter';
import brandLogo from '@brand/logo.png?url';

export function App() {
  const sidebarWidth = useStore(s => s.sidebarWidth);
  const setSidebarWidth = useStore(s => s.setSidebarWidth);

  const [config, setConfig] = useState<HarnessConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [vpWidth, setVpWidth] = useState<number>(window.innerWidth);

  // Initial config load
  useEffect(() => {
    let cancelled = false;
    window.cth.getConfig().then(c => { if (!cancelled) setConfig(c); });
    return () => { cancelled = true; };
  }, []);

  // The local-LLM director: seeds the cast and runs the office sandbox.
  const game = useDirector(config);

  // Track viewport width for splitter clamping
  useEffect(() => {
    const onResize = () => setVpWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!config) {
    return <div style={{ width: '100vw', height: '100vh', background: 'var(--cth-cream-100)' }} />;
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100vw', height: '100vh',
      overflow: 'hidden'
    }}>
      {/* Title bar */}
      <div
        className="cth-titlebar-drag"
        style={{
          height: 36, minHeight: 36,
          background: 'linear-gradient(180deg, var(--cth-cream-100) 0%, var(--cth-cream-200) 100%)',
          borderBottom: '2px solid var(--cth-ink-900)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 96,
          paddingRight: 12,
          gap: 12,
          userSelect: 'none'
        }}
      >
        <img
          src={brandLogo}
          alt="Munder Difflin"
          style={{ height: 20, width: 'auto', display: 'block' }}
        />
        <span style={{
          fontFamily: 'var(--cth-font-ui)',
          fontSize: 14,
          color: 'var(--cth-ink-500)'
        }}>
          local-LLM office sandbox
        </span>
        <button
          className="cth-titlebar-nodrag"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
          style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, padding: 0,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--cth-ink-700)'
          }}
        >
          <Icon name="gear" />
        </button>
      </div>

      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex',
        padding: 16,
        gap: 0
      }}>
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
          <OfficeFloor />
          {!game.ollama.available && game.ollama.checked && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none'
            }}>
              <div style={{ pointerEvents: 'auto', width: 380 }}>
                <PixelPanel variant="dialog" title="NO LOCAL MODEL" noPadding>
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>
                      The cast is powered by a local model via Ollama. Start it, then press
                      <b> refresh</b> in the Director panel.
                    </p>
                    <pre style={{
                      margin: 0, fontSize: 12, padding: 8, overflowX: 'auto',
                      background: 'var(--cth-cream-50)', border: '2px solid var(--cth-ink-900)'
                    }}>{`ollama serve
ollama pull danger   # or any model`}</pre>
                  </div>
                </PixelPanel>
              </div>
            </div>
          )}
        </div>

        <SidebarSplitter
          width={sidebarWidth}
          onChange={setSidebarWidth}
          viewportWidth={vpWidth}
        />

        <div style={{
          width: sidebarWidth, flexShrink: 0,
          minHeight: 0, display: 'flex', flexDirection: 'column'
        }}>
          <GameDirectorPanel game={game} />
        </div>
      </div>

      {settingsOpen && (
        <GameSettingsModal config={config} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
