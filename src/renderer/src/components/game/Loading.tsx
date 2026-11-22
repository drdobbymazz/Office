// While the office is being built (fonts, the map, the cast), the same cream card as the start-up
// splash in index.html, with the game's pixel logo. When the game is ready the interface's first
// paper wipe slides off it, so the start goes cream, cream, title: never a dark empty screen.
// Needs no game context.

import gameLogo from '@/assets/logo/game-logo.png?url';

export function LoadingCard() {
  const scale = typeof window !== 'undefined' && window.innerHeight >= 340 && window.innerWidth >= 340 ? 2 : 1;
  return (
    <div role="status" aria-label="Loading the office" style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
      backgroundColor: 'var(--cth-cream-100)',
      backgroundImage: 'repeating-linear-gradient(45deg, rgba(232, 217, 160, 0.28) 0 1px, transparent 1px 6px)',
      color: 'var(--cth-ink-900)', fontFamily: 'var(--cth-font-ui)', zIndex: 50
    }}>
      <img src={gameLogo} alt="Munder Difflin, Inc. The living office" width={132 * scale} height={84 * scale} draggable={false}
        style={{ display: 'block', imageRendering: 'pixelated', boxShadow: '4px 4px 0 rgba(26, 19, 32, 0.25)' }} />
      <div style={{ fontSize: 15, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>warming up the office...</div>
    </div>
  );
}
