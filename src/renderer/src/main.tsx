import { createRoot } from 'react-dom/client';
import { App } from './App';
import { hasElectronBridge, installWebCth } from './platform/cthWeb';
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
  const img = document.createElement('img');
  img.src = brandLogo;
  img.alt = 'Munder Difflin';
  img.style.cssText = 'height:56px;width:auto;display:block';
  splashMark.replaceWith(img);
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
