// Harness for the audio module: /harness/audio.html
//   (no params)        buttons for every sfx / loop / voice, music mood controls
//   ?analyze=1         render everything offline, measure it, draw it, and put
//                      the numbers in window.__analysis (window.__ready when done)
//   &only=sfx,loops,voices,music   limit the analysis
//   &id=gong           analyse only these sfx/loop ids (comma list)

import { LOOP_IDS, SFX_IDS, type LoopId, type MusicMood, type SfxId } from './api';
import { CAST } from '@/game/core/cast';
import { EMOTIONS, type EmotionId } from '@/game/core/types';
import { createAudio } from './index';
import { SFX } from './sfx';
import { planSpeech } from './speech';
import { DEFAULT_MOOD, styleForMood } from './music';
import { analyze, centroidOf, estimateBpm, estimateF0, mixdown, onsetRate, powerSpectrum, rmsFrames, soundDistance, type Metrics } from './analysis';
import { renderLoop, renderMusic, renderMusicScript, renderSfx, renderSpeech, toWav } from './render';

declare global {
  interface Window { __ready?: boolean; __analysis?: unknown; __h?: Record<string, unknown> }
}

const q = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};
const style = el('style');
style.textContent = `
  h2 { font-size: 15px; margin: 14px 0 6px; color: #ffa51f; }
  .row { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  button { background: #2b2650; color: #fff; border: 2px solid #0d0b1c; border-radius: 8px; padding: 5px 9px; font: inherit; cursor: pointer; box-shadow: 0 2px 0 #0d0b1c; }
  button.on { background: #2f7dff; }
  button:active { transform: translateY(1px); box-shadow: none; }
  label { display: inline-flex; gap: 4px; align-items: center; margin-right: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 8px; }
  .card { background: #221d3d; border-radius: 8px; padding: 6px; }
  .card b { color: #fff; }
  .card .n { font: 11px/1.3 ui-monospace, monospace; color: #bcb6e8; white-space: pre; }
  .bad { color: #ff6b6b !important; }
  canvas { display: block; width: 220px; height: 84px; background: #120f22; border-radius: 4px; margin: 3px 0; }
  table { border-collapse: collapse; font: 11px ui-monospace, monospace; }
  td, th { padding: 2px 6px; border-bottom: 1px solid #332c5c; text-align: right; }
  th { color: #ffa51f; } td:first-child, th:first-child { text-align: left; }
`;
document.head.appendChild(style);

const LINES: Record<string, string> = Object.fromEntries(Object.values(CAST).map((c) => [c.id, c.persona.examples[0]]));

// ─────────────────────────────────────────────────────────────── interactive
function interactive() {
  const audio = createAudio();
  const mood: MusicMood = { ...DEFAULT_MOOD };
  const top = el('div', { class: 'row' });
  const unlock = el('button', {}, 'Unlock audio');
  unlock.onclick = async () => { await audio.unlock(); unlock.textContent = 'Unlocked'; unlock.classList.add('on'); };
  top.appendChild(unlock);
  for (const k of ['master', 'music', 'sfx', 'voice'] as const) {
    const l = el('label', {}, k);
    const r = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: k === 'music' ? '0.6' : '0.9' });
    r.oninput = () => audio.setVolumes({ [k]: Number(r.value) });
    l.appendChild(r);
    top.appendChild(l);
  }
  const mute = el('button', {}, 'Mute');
  let muted = false;
  mute.onclick = () => { muted = !muted; audio.setMuted(muted); mute.classList.toggle('on', muted); };
  top.appendChild(mute);
  app.appendChild(top);

  app.appendChild(el('h2', {}, 'Sound effects'));
  const sfxRow = el('div', { class: 'row' });
  for (const id of SFX_IDS) {
    const b = el('button', {}, id);
    b.onclick = () => audio.sfx(id, { pan: (Math.random() - 0.5) * 0.6 });
    sfxRow.appendChild(b);
  }
  app.appendChild(sfxRow);

  app.appendChild(el('h2', {}, 'Loops'));
  const loopRow = el('div', { class: 'row' });
  const on = new Set<LoopId>();
  for (const id of LOOP_IDS) {
    const b = el('button', {}, id);
    b.onclick = () => { const v = !on.has(id); if (v) on.add(id); else on.delete(id); audio.loop(id, v); b.classList.toggle('on', v); };
    loopRow.appendChild(b);
  }
  app.appendChild(loopRow);

  app.appendChild(el('h2', {}, 'Voices'));
  const vrow = el('div', { class: 'row' });
  const emo = el('select');
  for (const e of EMOTIONS) emo.appendChild(el('option', { value: e }, e));
  const sty = el('select');
  for (const s of ['say', 'shout', 'whisper', 'think']) sty.appendChild(el('option', { value: s }, s));
  vrow.append('emotion ', emo, ' style ', sty);
  app.appendChild(vrow);
  const people = el('div', { class: 'row' });
  const out = el('div', { class: 'n' });
  for (const c of Object.values(CAST)) {
    const b = el('button', {}, c.name);
    b.style.borderColor = '#' + c.color.toString(16).padStart(6, '0');
    b.onclick = () => {
      const text = LINES[c.id];
      const cps = 32;
      audio.speak(c.voice, text, { cps, emotion: emo.value as EmotionId, style: sty.value as 'say' });
      // typewriter so you can see the sync
      out.textContent = `${c.name}: `;
      let i = 0;
      const t = setInterval(() => { out.textContent = `${c.name}: ${text.slice(0, ++i)}`; if (i >= text.length) clearInterval(t); }, 1000 / cps);
    };
    people.appendChild(b);
  }
  app.appendChild(people);
  app.appendChild(out);

  app.appendChild(el('h2', {}, 'Music'));
  const mrow = el('div', { class: 'row' });
  const play = el('button', {}, 'Start music');
  let playing = false;
  play.onclick = () => { playing = !playing; if (playing) audio.startMusic(); else audio.stopMusic(); play.classList.toggle('on', playing); play.textContent = playing ? 'Stop music' : 'Start music'; };
  mrow.appendChild(play);
  for (const [k, max, step] of [['chaos', 1, 0.01], ['hour', 24, 0.25]] as const) {
    const l = el('label', {}, k);
    const r = el('input', { type: 'range', min: '0', max: String(max), step: String(step), value: String(mood[k]) });
    const v = el('span', {}, String(mood[k]));
    r.oninput = () => { (mood[k] as number) = Number(r.value); v.textContent = r.value; audio.setMusicMood({ [k]: Number(r.value) }); };
    l.append(r, v);
    mrow.appendChild(l);
  }
  for (const k of ['disco', 'blackout', 'frozen', 'menu'] as const) {
    const b = el('button', {}, k);
    b.onclick = () => { mood[k] = !mood[k]; b.classList.toggle('on', mood[k]); audio.setMusicMood({ [k]: mood[k] }); };
    mrow.appendChild(b);
  }
  app.appendChild(mrow);
  window.__h = { audio };
  (window as unknown as { __cast: typeof CAST }).__cast = CAST;
  window.__ready = true;
}

// ─────────────────────────────────────────────────────────────── analysis
function draw(buf: AudioBuffer, m: Metrics): HTMLCanvasElement {
  const c = el('canvas');
  const W = 440, H = 168;
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const x = mixdown([buf.getChannelData(0), buf.getChannelData(1)]);
  // waveform (top 60%)
  const wh = H * 0.6, mid = wh / 2;
  // normalised to the peak so quiet sounds are still readable (the level is in the numbers)
  let pk = 1e-9;
  for (const v of x) pk = Math.max(pk, Math.abs(v));
  const sc = 0.95 / pk;
  g.fillStyle = '#2f7dff';
  const per = Math.max(1, Math.floor(x.length / W));
  for (let px = 0; px < W; px++) {
    let lo = 0, hi = 0;
    for (let i = px * per; i < Math.min(x.length, (px + 1) * per); i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i]; }
    g.fillRect(px, mid - hi * sc * mid, 1, Math.max(1, (hi - lo) * sc * mid));
  }
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(0, mid, W, 1);
  // -60 dB tail marker
  g.fillStyle = '#ffa51f';
  g.fillRect((m.tail / buf.duration) * W, 0, 1, wh);
  // spectrum (bottom 40%), log frequency 40 Hz .. 16 kHz, -100..0 dB
  const ps = powerSpectrum(x, 2048);
  const sh = H - wh, top = wh;
  g.strokeStyle = '#ffd36b';
  g.beginPath();
  const binHz = buf.sampleRate / 2048;
  let mx = 1e-20;
  for (const v of ps) mx = Math.max(mx, v);
  for (let px = 0; px < W; px++) {
    const f = 40 * Math.pow(16000 / 40, px / W);
    const k = Math.min(ps.length - 1, Math.round(f / binHz));
    const dbv = 10 * Math.log10(ps[k] / mx + 1e-12);
    const y = top + sh * Math.min(1, -dbv / 90);
    if (px === 0) g.moveTo(px, y); else g.lineTo(px, y);
  }
  g.stroke();
  g.fillStyle = '#7a72b8';
  g.font = '18px monospace';
  g.fillText(`${m.centroid.toFixed(0)} Hz`, W - 110, H - 6);
  return c;
}

const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);

function flags(m: Metrics, maxTail: number): string[] {
  const out: string[] = [];
  if (m.nan) out.push('NaN');
  if (m.clipped) out.push('CLIP');
  if (m.first > 1e-3) out.push('CLICK-START');
  if (m.last > 1e-3) out.push('CLICK-END');
  if (m.peakDb < -40) out.push('SILENT');
  if (m.tail > maxTail) out.push('TOO-LONG');
  if (Math.abs(m.dc) > 0.002) out.push('DC');
  return out;
}

function card(grid: HTMLElement, name: string, buf: AudioBuffer, m: Metrics, extra: string, maxTail: number) {
  const d = el('div', { class: 'card' });
  const fl = flags(m, maxTail);
  d.appendChild(el('b', {}, name));
  d.appendChild(draw(buf, m));
  const n = el('div', { class: 'n' }, `pk ${f1(m.peakDb)}  rms ${f1(m.activeRmsDb)} dB\nlen ${f2(m.tail)}s  dc ${m.dc.toExponential(1)}\n${extra}`);
  d.appendChild(n);
  if (fl.length) d.appendChild(el('div', { class: 'n bad' }, fl.join(' ')));
  grid.appendChild(d);
}

const round = (m: Metrics) => ({
  peakDb: +f1(m.peakDb), rmsDb: +f1(m.rmsDb), activeRmsDb: +f1(m.activeRmsDb), tail: +m.tail.toFixed(3), onset: +m.onset.toFixed(3),
  dc: +m.dc.toExponential(2), centroid: Math.round(m.centroid), nan: m.nan, clipped: m.clipped,
  first: +m.first.toExponential(2), last: +m.last.toExponential(2), maxJump: +m.maxJump.toFixed(3), env: m.env
});

async function analysisMode() {
  const only = (q.get('only') ?? 'sfx,loops,voices,music').split(',');
  const ids = q.get('id')?.split(',');
  const result: Record<string, unknown> = {};
  const t0 = performance.now();
  const status = el('div', { class: 'n' }, 'rendering...');
  app.appendChild(status);
  const wavs: Record<string, AudioBuffer> = {};

  if (only.includes('sfx')) {
    app.appendChild(el('h2', {}, 'Sound effects'));
    const grid = el('div', { class: 'grid' });
    app.appendChild(grid);
    const res: Record<string, ReturnType<typeof round>> = {};
    const all: Record<string, Metrics> = {};
    for (const id of SFX_IDS) {
      if (ids && !ids.includes(id)) continue;
      const b = await renderSfx(id);
      wavs[id] = b;
      const m = analyze([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
      all[id] = m;
      res[id] = round(m);
      card(grid, id, b, m, `cent ${Math.round(m.centroid)} Hz  jump ${f2(m.maxJump)}`, SFX[id].dur + 0.7);
    }
    // nearest neighbour by rough perceptual distance
    const near: Record<string, { to: string; d: number }> = {};
    for (const a of Object.keys(all)) {
      let best = { to: '', d: Infinity };
      for (const b of Object.keys(all)) if (a !== b) { const d = soundDistance(all[a], all[b]); if (d < best.d) best = { to: b, d: +d.toFixed(3) }; }
      near[a] = best;
    }
    result.sfx = res;
    result.sfxNearest = near;
  }

  if (only.includes('loops')) {
    app.appendChild(el('h2', {}, 'Loops (3 s: fade in, hold, fade out)'));
    const grid = el('div', { class: 'grid' });
    app.appendChild(grid);
    const res: Record<string, unknown> = {};
    for (const id of LOOP_IDS) {
      if (ids && !ids.includes(id)) continue;
      const b = await renderLoop(id, 3);
      wavs['loop-' + id] = b;
      const m = analyze([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
      res[id] = round(m);
      card(grid, id, b, m, `cent ${Math.round(m.centroid)} Hz`, 4.6);
    }
    result.loops = res;
  }

  if (only.includes('voices')) {
    app.appendChild(el('h2', {}, 'Voices (one line each, cps 30)'));
    const grid = el('div', { class: 'grid' });
    app.appendChild(grid);
    const res: Record<string, unknown> = {};
    const text = 'Right, who moved my stapler? I need it now!';
    for (const c of Object.values(CAST)) {
      const opts = { cps: 30, emotion: 'neutral' as EmotionId };
      const plan = planSpeech(c.voice, text, opts);
      const b = await renderSpeech(c.voice, text, opts, text.length / 30 + 1.6);
      wavs['voice-' + c.id] = b;
      const x = mixdown([b.getChannelData(0), b.getChannelData(1)]);
      const m = analyze([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
      // decimate by 2 for the pitch tracker
      const half = new Float32Array(Math.floor(x.length / 2));
      for (let i = 0; i < half.length; i++) half[i] = (x[2 * i] + x[2 * i + 1]) / 2;
      const f0 = estimateF0(half, b.sampleRate / 2);
      const planF0 = Math.exp(plan.blips.reduce((s, bl) => s + Math.log(bl.f0), 0) / plan.blips.length);
      const meanDur = plan.blips.reduce((s, bl) => s + bl.dur, 0) / plan.blips.length;
      const r = {
        ...round(m), blips: plan.blips.length, blipsPerSec: +(plan.blips.length / plan.duration).toFixed(2),
        meanBlipMs: Math.round(meanDur * 1000), planF0: Math.round(planF0), measuredF0: Math.round(f0), onsetsPerSec: +onsetRate(x, b.sampleRate).toFixed(2)
      };
      res[c.id] = r;
      card(grid, `${c.name} (${c.voice.wave} ${c.voice.pitch} Hz x${c.voice.speed})`, b, m,
        `f0 ${r.measuredF0} Hz (plan ${r.planF0})\n${r.blips} blips ${r.blipsPerSec}/s ${r.meanBlipMs} ms`, 99);
    }
    // the same person across emotions and styles
    const emo: Record<string, unknown> = {};
    for (const [label, opts] of [
      ['neutral', { cps: 30 }], ['angry', { cps: 30, emotion: 'angry' }], ['scared', { cps: 30, emotion: 'scared' }],
      ['sad', { cps: 30, emotion: 'sad' }], ['excited', { cps: 30, emotion: 'excited' }],
      ['shout', { cps: 30, style: 'shout' }], ['whisper', { cps: 30, style: 'whisper' }], ['think', { cps: 30, style: 'think' }]
    ] as const) {
      const b = await renderSpeech(CAST.kelly.voice, text, opts, text.length / 30 + 1.6);
      const m = analyze([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
      const plan = planSpeech(CAST.kelly.voice, text, opts);
      emo[label] = { activeRmsDb: +f1(m.activeRmsDb), centroid: Math.round(m.centroid), blips: plan.blips.length, meanF0: Math.round(plan.blips.reduce((s, x) => s + x.f0, 0) / plan.blips.length), clipped: m.clipped, last: +m.last.toExponential(1) };
      card(grid, `Kelly, ${label}`, b, m, `cent ${Math.round(m.centroid)} Hz`, 99);
    }
    result.voices = res;
    result.kellyEmotions = emo;
  }

  if (only.includes('music')) {
    app.appendChild(el('h2', {}, 'Music (8 bars per mood)'));
    const grid = el('div', { class: 'grid' });
    app.appendChild(grid);
    const res: Record<string, unknown> = {};
    const moods: [string, Partial<MusicMood>][] = [
      ['calm', { chaos: 0 }], ['chaos .5', { chaos: 0.5 }], ['chaos 1', { chaos: 1 }], ['disco', { disco: true }],
      ['blackout', { blackout: true }], ['frozen', { frozen: true }], ['menu', { menu: true }], ['evening', { hour: 18 }]
    ];
    for (const [label, mood] of moods) {
      const b = await renderMusic(mood, 8);
      wavs['music-' + label] = b;
      const x = mixdown([b.getChannelData(0), b.getChannelData(1)]);
      const m = analyze([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
      // measure the steady part only (skip the fade-in bar and the fade-out)
      const from = Math.floor(b.sampleRate * 2.6), to = Math.floor(b.length - b.sampleRate * 1.6);
      const body = x.subarray(from, to);
      let e = 0;
      for (const v of body) e += v * v;
      const r = {
        ...round(m), bodyRmsDb: +f1(20 * Math.log10(Math.sqrt(e / body.length) + 1e-12)),
        bpm: +estimateBpm(body, b.sampleRate).toFixed(1), scheduledBpm: styleForMood({ ...DEFAULT_MOOD, ...mood }).bpm, onsetsPerSec: +onsetRate(body, b.sampleRate).toFixed(2),
        bodyCentroid: Math.round(centroidOf(powerSpectrum(body), b.sampleRate))
      };
      res[label] = r;
      card(grid, `music: ${label}`, b, m, `body rms ${r.bodyRmsDb} dB  bpm ${r.scheduledBpm} (meas ${r.bpm})\nonsets ${r.onsetsPerSec}/s  cent ${r.bodyCentroid}`, 99);
    }
    // a scripted ride: calm -> chaos ramp -> disco -> calm, measured in 2 s windows
    const script: [number, Partial<MusicMood>][] = [[0, { chaos: 0 }], [10, { chaos: 0.5 }], [20, { chaos: 1 }], [30, { chaos: 0, disco: true }], [40, { disco: false }]];
    const b = await renderMusicScript(script, 50);
    wavs['music-script'] = b;
    const x = mixdown([b.getChannelData(0), b.getChannelData(1)]);
    const fr = rmsFrames(x, b.sampleRate, 2, 2);
    const m = analyze([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
    res.script = { windowsRmsDb: Array.from(fr, (v) => +f1(20 * Math.log10(v + 1e-12))), clipped: m.clipped, peakDb: +f1(m.peakDb) };
    card(grid, 'music: calm>chaos .5>1>disco>calm', b, m, `2 s windows rms:\n${Array.from(fr, (v) => Math.round(20 * Math.log10(v + 1e-12))).join(' ')}`, 99);
    result.music = res;
  }

  result.renderMs = Math.round(performance.now() - t0);
  status.textContent = `done in ${result.renderMs} ms`;
  window.__analysis = result;
  window.__h = {
    wav: (name: string) => {
      const b = wavs[name];
      if (!b) return null;
      const bytes = new Uint8Array(toWav(b));
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    names: () => Object.keys(wavs)
  };
  window.__ready = true;
}

// ─────────────────────────────────────────────────────────────── lab
// window.__lab: render and measure from a script (Playwright) in the real browser.
const lab = {
  /** One sfx voice straight into an OfflineAudioContext (no bus, reverb or dynamics). */
  async rawSfx(id: SfxId, o: { at?: number; seconds?: number; pitch?: number } = {}) {
    const def = SFX[id];
    const sr = 44100, at = o.at ?? 0.052;
    const ctx = new OfflineAudioContext(2, Math.ceil((o.seconds ?? def.dur + 0.8) * sr), sr);
    const out = ctx.createGain();
    out.gain.value = def.gain;
    out.connect(ctx.destination);
    let last = at;
    def.build({ ctx, dest: out, track(_s, stopAt) { last = Math.max(last, stopAt); } }, o.pitch ?? 1, at);
    const b = await ctx.startRendering();
    return { ...round(analyze([b.getChannelData(0), b.getChannelData(1)], sr)), lastStop: +(last - at).toFixed(3) };
  },
  /** Sfx through the whole engine (bus, reverb, compressor, limiter, soft clip): [id, at seconds][]. */
  async engineSfx(list: [SfxId, number][], seconds = 4, mood?: Partial<MusicMood>) {
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
    const { Engine } = await import('./engine');
    const e = new Engine(ctx, false);
    if (mood) { const p = e.ensureMusic(); p.setMood({ ...DEFAULT_MOOD, ...mood }); p.start(0); p.scheduleUntil(seconds - 1); p.stop(seconds - 1, 0.8); }
    for (const [id, at] of list) e.sfx(id, {}, at);
    const t0 = performance.now();
    const b = await ctx.startRendering();
    const ms = performance.now() - t0;
    const chs = [b.getChannelData(0), b.getChannelData(1)];
    let over = 0;
    for (const c of chs) for (const v of c) if (Math.abs(v) > 0.75) over++;
    return { ...round(analyze(chs, sr)), renderMs: Math.round(ms), overKnee: over };
  },
  /** Music through the engine: [atSeconds, mood][] steps. Returns 1 s window RMS and render time. */
  async music(steps: [number, Partial<MusicMood>][], seconds: number) {
    const t0 = performance.now();
    const b = await renderMusicScript(steps, seconds);
    const ms = performance.now() - t0;
    const x = mixdown([b.getChannelData(0), b.getChannelData(1)]);
    const fr = rmsFrames(x, b.sampleRate, 1, 1);
    return { ...round(analyze([b.getChannelData(0), b.getChannelData(1)], b.sampleRate)), renderMs: Math.round(ms), windowsRmsDb: Array.from(fr, (v) => +f1(20 * Math.log10(v + 1e-12))) };
  },
  ids: SFX_IDS
};
(window as unknown as { __lab: typeof lab }).__lab = lab;

if (q.get('analyze')) analysisMode().catch((e) => { console.error(e); app.appendChild(el('pre', { class: 'bad' }, String(e?.stack ?? e))); window.__ready = true; });
else interactive();

export type { SfxId };
