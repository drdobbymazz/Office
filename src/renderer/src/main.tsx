import { createRoot } from 'react-dom/client';
import { App } from './App';
import { hasElectronBridge, installWebCth } from './platform/cthWeb';
import gameLogo from '@/assets/logo/game-logo.png?url';
import brandLogo from '@brand/logo.png?url';
import '@fontsource/press-start-2p';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/vt323';
import './design/global.css';

// Outside Electron (e.g. the Vercel web build) there is no preload bridge, so
// install the browser adapter: config in localStorage, Ollama over direct fetch.
if (!hasElectronBridge()) installWebCth();

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/png';
favicon.href = brandLogo;
document.head.appendChild(favicon);

const splashMark = document.querySelector('#cth-splash .mk');
if (splashMark) {
  // The game's pixel logo, as on the loading card and the title (it carries the name, so the text title goes).
  const img = document.createElement('img');
  img.src = gameLogo;
  img.alt = 'Munder Difflin, Inc. The living office';
  img.style.cssText = 'width:264px;height:168px;display:block;image-rendering:pixelated;box-shadow:4px 4px 0 rgba(26,19,32,0.25)';
  splashMark.replaceWith(img);
  document.querySelector('#cth-splash .title')?.remove();
}

const root = document.getElementById('root');
if (!root) throw new Error('No root element');

// No StrictMode: its double-mount in development would start two WebGL floors.
createRoot(root).render(<App />);

// Installed on a phone, the game should open offline. Only on the web (not Electron, not inside an Artifact frame).
// Not in the Android app either: it already carries every file, and a service worker there would
// try to fetch them over a network that does not exist.
if (import.meta.env.VITE_APP_SHELL !== '1' && 'serviceWorker' in navigator && window.top === window && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
