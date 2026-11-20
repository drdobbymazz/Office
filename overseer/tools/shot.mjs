#!/usr/bin/env node
// Screenshot helper for visual checks. Needs a dev server already running
// (npm run dev -- --port <port> --strictPort).
//
//   node tools/shot.mjs <path-or-url> <out.png> [options]
//
// Options
//   --port 5173          dev server port (when <path-or-url> is a path like /harness/x.html)
//   --w 915 --h 412      viewport in CSS px (default: a phone held sideways)
//   --dpr 1              device pixel ratio (use 2 for screenshots a person will look at)
//   --wait 1200          ms to wait after load before the first capture
//   --wait-for "expr"    wait until this JS expression is truthy (e.g. "window.__ready")
//   --eval "js"          run JS in the page before capturing (repeatable; awaited)
//   --frames 6 --every 250   capture N frames, `every` ms apart, into one contact sheet
//   --cols 3             columns in the contact sheet
//   --tap "x,y"          tap at CSS px before capturing (repeatable, in order with --eval)
//   --script file.mjs    run `export default async (page, ctx) => {}` instead of a plain capture;
//                        ctx = { shot(name?), sheet(buffers, cols), out, wait(ms) }
//   --touch              emulate a touch device (hasTouch + isMobile)
//   --quiet              do not print console messages from the page
//
// Prints page console errors and uncaught exceptions, so a blank screenshot
// usually comes with its reason. Exit code 1 if the page threw.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}

const argv = process.argv.slice(2);
const positional = [];
const opts = { port: '5173', w: '915', h: '412', dpr: '1', wait: '1200', frames: '1', every: '250', cols: '0' };
const steps = []; // ordered --eval / --tap
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--touch' || a === '--quiet') opts[a.slice(2)] = true;
  else if (a === '--eval') steps.push({ type: 'eval', code: argv[++i] });
  else if (a === '--tap') steps.push({ type: 'tap', at: argv[++i] });
  else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
  else positional.push(a);
}
if (positional.length < 2) {
  console.error('usage: node tools/shot.mjs <path-or-url> <out.png> [options]  (see the header of this file)');
  process.exit(2);
}
const target = positional[0].startsWith('http') ? positional[0] : `http://localhost:${opts.port}${positional[0].startsWith('/') ? '' : '/'}${positional[0]}`;
const out = path.resolve(positional[1]);
fs.mkdirSync(path.dirname(out), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageThrew = false;

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: Number(opts.w), height: Number(opts.h) },
    deviceScaleFactor: Number(opts.dpr),
    hasTouch: !!opts.touch,
    isMobile: !!opts.touch
  });
  const page = await context.newPage();
  if (!opts.quiet) {
    page.on('console', (m) => {
      const t = m.type();
      const text = m.text();
      if (/GPU stall due to ReadPixels|GL Driver Message/.test(text)) return;
      if (t === 'error' || t === 'warning') console.log(`[page ${t}] ${text}`);
      else if (process.env.SHOT_VERBOSE) console.log(`[page ${t}] ${text}`);
    });
  }
  page.on('pageerror', (e) => {
    pageThrew = true;
    console.log(`[page exception] ${e.message}\n${(e.stack || '').split('\n').slice(0, 6).join('\n')}`);
  });
  page.on('requestfailed', (r) => console.log(`[request failed] ${r.url()} ${r.failure()?.errorText ?? ''}`));

  await page.goto(target, { waitUntil: 'load', timeout: 30000 });
  if (opts['wait-for']) {
    await page.waitForFunction(opts['wait-for'], null, { timeout: 20000 }).catch(() => {
      console.log(`[shot] --wait-for "${opts['wait-for']}" never became true (continuing)`);
    });
  }
  await sleep(Number(opts.wait));

  const sheet = async (buffers, cols) => {
    const n = buffers.length;
    const c = cols > 0 ? cols : Math.ceil(Math.sqrt(n));
    const imgs = buffers.map((b, i) =>
      `<figure><img src="data:image/png;base64,${b.toString('base64')}"><figcaption>${i + 1}</figcaption></figure>`).join('');
    const p2 = await context.newPage();
    const cellW = Number(opts.w);
    await p2.setViewportSize({ width: Math.min(4000, c * (cellW + 8) + 8), height: 800 });
    await p2.setContent(`<style>body{margin:8px;background:#111;display:grid;grid-template-columns:repeat(${c},${cellW}px);gap:8px}
      figure{margin:0;position:relative}img{width:${cellW}px;display:block}
      figcaption{position:absolute;left:4px;top:2px;font:700 14px sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000}</style>${imgs}`);
    await p2.waitForLoadState('load');
    const buf = await p2.screenshot({ fullPage: true });
    await p2.close();
    return buf;
  };

  const runSteps = async () => {
    for (const s of steps) {
      if (s.type === 'eval') await page.evaluate(`(async () => { ${s.code} })()`);
      else {
        const [x, y] = s.at.split(',').map(Number);
        if (opts.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
      }
      await sleep(120);
    }
  };

  if (opts.script) {
    const mod = await import(pathToFileURL(path.resolve(opts.script)).href);
    let n = 0;
    const ctx = {
      out,
      wait: sleep,
      sheet: (buffers, cols = 0) => sheet(buffers, cols),
      shot: async (name) => {
        const file = name ? path.join(path.dirname(out), name) : out.replace(/\.png$/, n ? `-${n}.png` : '.png');
        n++;
        await page.screenshot({ path: file });
        console.log(`[shot] wrote ${file}`);
        return file;
      }
    };
    await mod.default(page, ctx);
  } else {
    await runSteps();
    const frames = Number(opts.frames);
    if (frames <= 1) {
      await page.screenshot({ path: out });
    } else {
      const bufs = [];
      for (let i = 0; i < frames; i++) {
        bufs.push(await page.screenshot());
        if (i < frames - 1) await sleep(Number(opts.every));
      }
      fs.writeFileSync(out, await sheet(bufs, Number(opts.cols)));
    }
    console.log(`[shot] wrote ${out}`);
  }
} finally {
  await browser.close();
}
process.exit(pageThrew ? 1 : 0);
