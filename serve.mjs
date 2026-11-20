#!/usr/bin/env node
// Serve the built game AND forward /ollama/* to your Ollama server.
//
// Why: a web page opened on your phone cannot always call Ollama directly
// (browsers block an https page from calling an http address, and Ollama
// refuses pages from origins it has not been told about). If the game and the
// model answer from the SAME address, none of that applies.
//
// On the laptop that runs Ollama:
//
//   npm run build:web
//   node serve.mjs                # then open the printed address on your phone
//
// Options (flags or environment variables):
//   --port 8787            PORT          port to listen on
//   --ollama http://127.0.0.1:11434   OLLAMA_URL   where Ollama is
//   --dir dist-web         folder with the built game
//
// No dependencies: plain Node 18+.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('port', process.env.PORT || 8787));
const OLLAMA = new URL(arg('ollama', process.env.OLLAMA_URL || 'http://127.0.0.1:11434'));
const ROOT = path.resolve(here, arg('dir', 'dist-web'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8'
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`No built game in ${ROOT}. Run "npm run build:web" first.`);
  process.exit(1);
}

function proxy(req, res) {
  const target = new URL(req.url.replace(/^\/ollama/, '') || '/', OLLAMA);
  const lib = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host };
  // Ollama checks Origin; from here the request is local, so drop the browser's.
  delete headers.origin;
  delete headers.referer;
  const up = lib.request(target, { method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    // Stream straight through so lines appear as the model writes them.
    r.pipe(res);
  });
  up.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Could not reach Ollama at ${OLLAMA.origin}: ${err.message}` }));
  });
  req.on('aborted', () => up.destroy());
  res.on('close', () => up.destroy());
  req.pipe(up);
}

function serveFile(req, res) {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (err, stat) => {
    const real = !err && stat.isFile() ? file : path.join(ROOT, 'index.html');
    const ext = path.extname(real).toLowerCase();
    const hashed = /\/assets\//.test(real.replace(/\\/g, '/'));
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    fs.createReadStream(real).pipe(res);
  });
}

http
  .createServer((req, res) => {
    if ((req.url || '').startsWith('/ollama')) proxy(req, res);
    else if (req.method === 'GET' || req.method === 'HEAD') serveFile(req, res);
    else res.writeHead(405).end('Method not allowed');
  })
  .listen(PORT, '0.0.0.0', () => {
    const addrs = Object.values(os.networkInterfaces())
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => `http://${n.address}:${PORT}`);
    console.log(`The office is being served from ${ROOT}`);
    console.log(`Model requests go to ${OLLAMA.origin}`);
    console.log('\nOpen one of these on your phone (same Wi-Fi), held sideways:');
    for (const a of [`http://${os.hostname()}.local:${PORT}`, ...addrs]) console.log(`  ${a}`);
    console.log(`\nOn this machine: http://localhost:${PORT}`);
  });
