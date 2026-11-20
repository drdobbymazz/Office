#!/usr/bin/env node
// A stand-in for the laptop's Ollama, for development and tests. Plain Node,
// no dependencies.
//
//   node tools/mock-ollama.mjs [--port 11500] [--tps 7] [--load 2000]
//
// Or in-process (tests):  const m = await startMockOllama({ port: 0, tps: 4000, load: 0 });
//                         ... m.url ... m.requests ... await m.close();
//
// Speaks:
//   GET  /                     "Ollama is running"
//   GET  /api/tags             model list
//   GET  /api/version
//   POST /api/chat             stream (NDJSON) and non-stream; honours `format`
//                              (a JSON Schema): writes JSON that fits it, with
//                              plausible content for the names in the schema
//   GET  /v1/models, POST /v1/chat/completions (SSE): the OpenAI-style path
//   OPTIONS + CORS headers like the real thing.
//
// Special models that misbehave on purpose:
//   mock-garbage   not JSON at all
//   mock-truncate  cuts the JSON off in the middle of a line (done_reason "length")
//   mock-thinker   reasons first (message.thinking and <think> tags) unless think:false
//   mock-nothink   puts <think> tags in content, and rejects the `think` field with HTTP 400
//   mock-drop      hangs up in the middle of the stream
//   mock-slow      1 token per second
//   mock-404       "model not found" (as does any unknown model)
//   mock-fences    wraps the JSON in a markdown code fence with chatter around it
//   mock-oldjson   (Ollama path) rejects a schema object in `format` with HTTP 400, as Ollama before 0.5 does
//   mock-noschema  (OpenAI path) rejects json_schema with HTTP 400
//   mock-strict400 (OpenAI path) rejects json_schema and json_object with HTTP 400

import http from 'node:http';
import { pathToFileURL } from 'node:url';

const BASE_MODELS = ['artemis-custom:latest', 'danger:latest'];
const SPECIAL = ['mock-garbage', 'mock-truncate', 'mock-thinker', 'mock-nothink', 'mock-drop', 'mock-slow', 'mock-fences', 'mock-oldjson', 'mock-noschema', 'mock-strict400'];
const KNOWN = [...BASE_MODELS, ...SPECIAL.map((m) => `${m}:latest`)];

const norm = (m) => String(m || '').trim().toLowerCase().replace(/:latest$/, '');
const isKnown = (m) => KNOWN.some((k) => norm(k) === norm(m));

// ── Content ─────────────────────────────────────────────────────────────────

const LINES = [
  'Right, {other}, who moved my stapler? I had it labelled.',
  "Don't look at me, {other}. I've been on the phone all morning.",
  'Fiver says this ends with someone crying in the loo.',
  "I'm writing this down. All of it. Twice.",
  'Is it just me, or is {place} getting smaller?',
  'We are not doing this again, {other}. Not after Tuesday.',
  'Oh, lovely. Another perfectly normal day, then.',
  'I told you, {other}. I told everyone. Nobody listens.',
  'Somebody put the kettle on before I lose it.',
  "That's going in my report, {other}, in capital letters.",
  'She said "fine" with {curly braces} in her voice. Not fine.',
  "I didn't sign up for this. I signed up for the pension.",
  'Can we all calm down and have a biscuit, please?',
  "If that's a joke, {other}, it's a very expensive one."
];
const THOUGHTS = [
  'If I look busy, nobody will ask me anything.',
  'Someone has eaten my yoghurt again. I know who.',
  'Five more minutes, then I am going for a coffee.',
  'Why is {other} always smiling? What do they know?',
  'This spreadsheet is lying to me.',
  'I could go home early. Nobody would notice.'
];
const FEELS = ['amused', 'angry', 'suspicious', 'surprised', 'smug', 'nervous', 'excited', 'confused'];
const ACTS = ['point', 'shrug', 'laugh', 'facepalm', 'none', 'step_closer', 'gasp'];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function textOf(messages) {
  return (messages || []).map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
}

function userText(messages) {
  const u = (messages || []).filter((m) => m.role === 'user');
  return u.length ? String(u[u.length - 1].content || '') : textOf(messages);
}

/** Build a value that fits the schema, with content that reads like a scene. */
function generate(schema, ctx) {
  const st = { lineIdx: hash(ctx.user) % LINES.length, whoIdx: 0 };
  const names = findNames(schema);
  const place = /in (the [A-Z][\w' ]+?)[.,\n]/.exec(ctx.user)?.[1] || 'the office';
  const event = /"([^"]+)"/.exec(ctx.user)?.[1] || 'something odd happens';
  const rooms = findEnum(schema, 'room') || [];

  const pick = (list, salt) => list[hash(ctx.user + salt) % list.length];
  const fillT = (t, who) =>
    t.replace(/\{other\}/g, names.find((n) => n !== who) || 'everyone').replace(/\{place\}/g, place);

  function gen(s, key, item) {
    if (!s || typeof s !== 'object') return null;
    if (s.type === 'object' || s.properties) {
      const out = {};
      const props = s.properties || {};
      const local = { who: null };
      for (const k of Object.keys(props)) out[k] = gen(props[k], k, local);
      return out;
    }
    if (s.type === 'array') {
      const min = s.minItems ?? 0;
      const max = s.maxItems ?? Math.max(min, 3);
      let n;
      if (key === 'lines') n = Math.max(min, Math.min(max, 3));
      else if (key === 'minds' || key === 'takeaways') n = max;
      else if (key === 'paragraphs' || key === 'awards') n = Math.max(min, Math.min(max, 2));
      else n = Math.max(min, Math.min(max, 1));
      const arr = [];
      st.whoIdx = 0;
      for (let i = 0; i < n; i++) arr.push(gen(s.items, key === 'paragraphs' ? 'paragraph' : key, null));
      return arr;
    }
    if (s.type === 'boolean') return /walk|run|fl[yi]|horse|dog|ghost|bird|animal/i.test(event);
    if (s.type === 'integer' || s.type === 'number') return Array.isArray(s.enum) ? s.enum[Math.min(1, s.enum.length - 1)] : 2;
    // strings
    const en = Array.isArray(s.enum) ? s.enum : null;
    if (key === 'who' && en) {
      const who = en[st.whoIdx++ % en.length];
      if (item) item.who = who;
      return who;
    }
    if (en) {
      const who = item?.who;
      switch (key) {
        case 'to': return en.find((n) => n !== who && n !== 'all' && n !== 'none') || 'none';
        case 'about': return en.find((n) => n !== who) || en[0];
        case 'feel': return en.includes(pick(FEELS, st.lineIdx)) ? pick(FEELS, st.lineIdx) : en[0];
        case 'act': return en.includes(pick(ACTS, st.lineIdx)) ? pick(ACTS, st.lineIdx) : en[0];
        case 'change': return en.includes('likes_less') ? 'likes_less' : en[0];
        case 'plan': {
          const p = ['confront', 'talk', 'coffee', 'work'].find((x) => en.includes(x)) || en[0];
          if (item) item.plan = p;
          return p;
        }
        case 'target': {
          if (item && ['confront', 'talk', 'flirt', 'gossip', 'prank', 'comfort', 'snoop'].includes(item.plan)) {
            return en.find((n) => names.includes(n) && n !== who) || en.find((n) => n !== who && n !== 'none') || en[0];
          }
          return en.includes('none') ? 'none' : en[0];
        }
        case 'room': {
          const hit = en.find((r) => r !== 'everywhere' && event.toLowerCase().includes(r));
          return hit || en[0];
        }
        default: return pick(en, key);
      }
    }
    const who = item?.who;
    switch (key) {
      case 'say': {
        const line = LINES[st.lineIdx++ % LINES.length];
        return fillT(line, who);
      }
      case 'thought': return fillT(THOUGHTS[(st.lineIdx++ + st.whoIdx) % THOUGHTS.length], who);
      case 'summary': return `${names.slice(0, 2).join(' and ') || 'Everyone'} argued about the missing stapler in ${place}.`;
      case 'about': return 'the missing stapler';
      case 'title': {
        const noun = event.replace(/^(a|an|the)\s+/i, '').split(/\s+/)[0] || 'Something';
        const room = rooms.find((r) => r !== 'everywhere' && event.toLowerCase().includes(r)) || rooms[0] || 'office';
        return `${noun[0].toUpperCase()}${noun.slice(1)} in the ${room}`;
      }
      case 'emoji': return /horse/i.test(event) ? '\u{1F434}' : /dog|pupp/i.test(event) ? '\u{1F436}' : '✨';
      case 'fact': return `${event[0].toUpperCase()}${event.slice(1)}.`;
      case 'headline': return 'Stapler Crisis Grips Office; Nobody Blames the Printer';
      case 'paragraph': return `It was a long day. ${names.slice(0, 2).join(' and ') || 'Everyone'} fell out over a stapler, and the kettle broke twice.`;
      case 'why': return 'For keeping calm when nobody else did.';
      case 'text': return 'Never leave a stapler unattended.';
      default: return 'something';
    }
  }
  return gen(schema, 'root', null);
}

function findNames(schema) {
  return findEnum(schema, 'who') || [];
}

function findEnum(schema, key) {
  let found = null;
  (function walk(s) {
    if (!s || typeof s !== 'object' || found) return;
    if (s.properties) {
      if (s.properties[key] && Array.isArray(s.properties[key].enum)) {
        found = s.properties[key].enum;
        return;
      }
      for (const v of Object.values(s.properties)) walk(v);
    }
    if (s.items) walk(s.items);
  })(schema);
  return found;
}

/** The text the model "writes" for this request. */
function compose(model, schema, messages, think) {
  const m = norm(model);
  const user = userText(messages);
  if (m === 'mock-garbage') return { content: 'Honestly? I think everyone should calm down and have a biscuit.', thinking: '' };
  const value = schema && typeof schema === 'object' ? generate(schema, { user }) : { reply: 'ok' };
  const json = JSON.stringify(value);
  if (m === 'mock-fences') return { content: "Sure! Here's what happens:\n```json\n" + JSON.stringify(value, null, 2) + "\n```\nLet me know if you want another!", thinking: '' };
  if (m === 'mock-truncate') {
    // Cut in the middle of the second line object if there is one.
    const second = json.indexOf('{"who"', json.indexOf('{"who"') + 1);
    const cut = second > 0 ? second + 20 : Math.floor(json.length * 0.55);
    return { content: json.slice(0, cut), thinking: '', truncated: true };
  }
  if (m === 'mock-thinker' && think !== false) {
    return { content: '<think>Who is in the scene? Keep it short.</think>\n' + json, thinking: 'Let me think about who speaks first, and why.' };
  }
  if (m === 'mock-nothink') return { content: '<think>Plan the reply.</think>' + json, thinking: '' };
  return { content: json, thinking: '' };
}

function tokenize(s) {
  return s.match(/[\s\S]{1,4}/g) || [];
}

// ── Server ──────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, User-Agent, Accept, X-Requested-With, OpenAI-Organization, X-Stainless-Lang',
  'Access-Control-Max-Age': '86400'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...CORS, 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startMockOllama(options = {}) {
  const opts = { port: 11500, tps: 7, load: 2000, host: '127.0.0.1', apiKey: '', quiet: true, ...options };
  const requests = [];
  const loaded = new Set();
  let lastSchema = null;
  const sockets = new Set();

  /** Emit `tokens` at the configured speed, calling write(tokenText, index). Returns false if the client went away. */
  async function pace(res, model, tokens, write, stopAt = tokens.length) {
    const tps = norm(model) === 'mock-slow' ? 1 : Math.max(0.1, opts.tps);
    if (!loaded.has(norm(model))) {
      loaded.add(norm(model));
      if (opts.load > 0) await sleep(opts.load);
    }
    const interval = 1000 / tps;
    const perTick = Math.max(1, Math.round(4 / interval));
    for (let i = 0; i < Math.min(stopAt, tokens.length); i += perTick) {
      if (res.destroyed || res.writableEnded) return false;
      for (let j = i; j < Math.min(i + perTick, stopAt, tokens.length); j++) write(tokens[j], j);
      await sleep(Math.max(1, interval * perTick));
    }
    return !res.destroyed;
  }

  async function ollamaChat(req, res, body) {
    const model = body.model;
    if (!isKnown(model)) return send(res, 404, { error: `model "${model}" not found, try pulling it first` });
    if (norm(model) === 'mock-nothink' && 'think' in body) return send(res, 400, { error: `"${model}" does not support thinking` });
    if (norm(model) === 'mock-oldjson' && body.format && typeof body.format === 'object') {
      return send(res, 400, { error: 'json: cannot unmarshal object into Go struct field ChatRequest.format of type string' });
    }
    const started = Date.now();
    const out = compose(model, body.format, body.messages, body.think);
    const cap = body.options?.num_predict > 0 ? body.options.num_predict : Infinity;
    let tokens = tokenize(out.content);
    let doneReason = out.truncated ? 'length' : 'stop';
    if (tokens.length > cap) {
      tokens = tokens.slice(0, cap);
      doneReason = 'length';
    }
    const thinkTokens = tokenize(out.thinking || '');
    const promptCount = Math.round(textOf(body.messages).length / 4);
    const tps = norm(model) === 'mock-slow' ? 1 : opts.tps;
    const final = (extra) => ({
      model, created_at: new Date().toISOString(), message: { role: 'assistant', content: '' }, done: true, done_reason: doneReason,
      total_duration: (Date.now() - started) * 1e6, load_duration: 0, prompt_eval_count: promptCount, prompt_eval_duration: 1e6,
      eval_count: tokens.length + thinkTokens.length, eval_duration: Math.round(((tokens.length + thinkTokens.length) / tps) * 1e9), ...extra
    });
    if (body.stream === false) {
      await pace(res, model, [...thinkTokens, ...tokens], () => {});
      return send(res, 200, final({ message: { role: 'assistant', content: tokens.join(''), ...(out.thinking ? { thinking: out.thinking } : {}) } }));
    }
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/x-ndjson' });
    const chunk = (message) => res.write(JSON.stringify({ model, created_at: new Date().toISOString(), message: { role: 'assistant', ...message }, done: false }) + '\n');
    if (thinkTokens.length) {
      const ok = await pace(res, model, thinkTokens, (t) => chunk({ content: '', thinking: t }));
      if (!ok) return;
    }
    const drop = norm(model) === 'mock-drop';
    const ok = await pace(res, model, tokens, (t) => chunk({ content: t }), drop ? Math.floor(tokens.length * 0.6) : tokens.length);
    if (!ok) return;
    if (drop) {
      res.socket?.destroy();
      return;
    }
    res.end(JSON.stringify(final()) + '\n');
  }

  async function openaiChat(req, res, body) {
    if (opts.apiKey && req.headers.authorization !== `Bearer ${opts.apiKey}`) {
      return send(res, 401, { error: { message: 'Incorrect API key provided.', type: 'invalid_request_error' } });
    }
    const model = body.model;
    if (!isKnown(model)) return send(res, 404, { error: { message: `The model '${model}' does not exist`, type: 'invalid_request_error', code: 'model_not_found' } });
    const rf = body.response_format;
    let schema = null;
    if (rf?.type === 'json_schema') {
      schema = rf.json_schema?.schema ?? null;
      lastSchema = schema;
      if (['mock-noschema', 'mock-strict400'].includes(norm(model))) return send(res, 400, { error: { message: "'response_format.type' : value is not one of the allowed values ['text','json_object']" } });
    } else if (rf?.type === 'json_object') {
      if (norm(model) === 'mock-strict400') return send(res, 400, { error: { message: 'response_format is not supported' } });
      schema = lastSchema;
    } else {
      schema = lastSchema;
    }
    const out = compose(model, schema, body.messages, undefined);
    const cap = body.max_tokens > 0 ? body.max_tokens : Infinity;
    let tokens = tokenize(out.content);
    let finish = out.truncated ? 'length' : 'stop';
    if (tokens.length > cap) {
      tokens = tokens.slice(0, cap);
      finish = 'length';
    }
    const id = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const usage = { prompt_tokens: Math.round(textOf(body.messages).length / 4), completion_tokens: tokens.length, total_tokens: 0 };
    if (!body.stream) {
      await pace(res, model, tokens, () => {});
      return send(res, 200, { id, object: 'chat.completion', created, model, choices: [{ index: 0, message: { role: 'assistant', content: tokens.join('') }, finish_reason: finish }], usage });
    }
    res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const ev = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const drop = norm(model) === 'mock-drop';
    const ok = await pace(res, model, tokens, (t, i) => ev({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: i === 0 ? { role: 'assistant', content: t } : { content: t }, finish_reason: null }] }), drop ? Math.floor(tokens.length * 0.6) : tokens.length);
    if (!ok) return;
    if (drop) {
      res.socket?.destroy();
      return;
    }
    ev({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: finish }], usage });
    res.end('data: [DONE]\n\n');
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', async () => {
      let body = {};
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          return send(res, 400, { error: 'invalid JSON body' });
        }
      }
      requests.push({ method: req.method, path, body, headers: req.headers, at: Date.now() });
      if (!opts.quiet) {
        // For a chat request, say how much text was sent: it shows what the real model would have to read.
        const sizes = Array.isArray(body.messages)
          ? '  ' + body.messages.map((m) => `${m.role} ${String(m.content ?? '').length} chars`).join(', ') + (body.options?.num_predict ? `, up to ${body.options.num_predict} tokens back` : '')
          : '';
        console.log(`${req.method} ${path}${body.model ? ` (${body.model})` : ''}${sizes}`);
      }
      try {
        if ((req.method === 'GET' || req.method === 'HEAD') && path === '/') return send(res, 200, 'Ollama is running', 'text/plain; charset=utf-8');
        if (req.method === 'GET' && path === '/api/version') return send(res, 200, { version: '0.12.0-mock' });
        if (req.method === 'GET' && path === '/api/tags') {
          return send(res, 200, { models: KNOWN.map((name) => ({ name, model: name, modified_at: new Date().toISOString(), size: 16_000_000_000, digest: 'mock', details: { family: 'gemma3', parameter_size: '31B', quantization_level: 'Q4_K_M' } })) });
        }
        if (req.method === 'POST' && path === '/api/chat') return await ollamaChat(req, res, body);
        if (req.method === 'GET' && path === '/v1/models') {
          if (opts.apiKey && req.headers.authorization !== `Bearer ${opts.apiKey}`) return send(res, 401, { error: { message: 'Incorrect API key provided.' } });
          return send(res, 200, { object: 'list', data: KNOWN.map((id) => ({ id: norm(id), object: 'model', owned_by: 'mock' })) });
        }
        if (req.method === 'POST' && path === '/v1/chat/completions') return await openaiChat(req, res, body);
        send(res, 404, '404 page not found', 'text/plain; charset=utf-8');
      } catch (e) {
        if (!res.headersSent) send(res, 500, { error: String(e && e.message ? e.message : e) });
        else res.destroy();
      }
    });
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, () => resolve());
  });
  const port = server.address().port;
  return {
    port,
    url: `http://${opts.host}:${port}`,
    requests,
    /** Change speed or load delay on the fly. */
    set(o) {
      Object.assign(opts, o);
    },
    /** Forget which models are loaded (next call pays the load delay again). */
    unload() {
      loaded.clear();
    },
    close() {
      return new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      });
    }
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const arg = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
  };
  const m = await startMockOllama({
    port: Number(arg('port', 11500)),
    tps: Number(arg('tps', 7)),
    load: Number(arg('load', 2000)),
    host: arg('host', '0.0.0.0'),
    apiKey: arg('key', ''),
    quiet: false
  });
  console.log(`Mock Ollama on http://localhost:${m.port}  (tps ${arg('tps', 7)}, load ${arg('load', 2000)} ms)`);
  console.log(`Models: ${KNOWN.join(', ')}`);
}
