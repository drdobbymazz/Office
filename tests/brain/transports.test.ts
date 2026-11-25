import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChatRequest } from '@/game/brain/api';
import { OllamaTransport } from '@/game/brain/transports/ollama';
import { OpenAiTransport } from '@/game/brain/transports/openai';
import { ClaudeTransport, claudeAvailable } from '@/game/brain/transports/claude';
import { BrainError, networkError } from '@/game/brain/transports/common';
import { createTransport, probeOllama } from '@/game/brain/index';
import { sceneSchema } from '@/game/brain/schema';
import { parseLoose } from '@/game/brain/jsonStream';
import { settings, startMock } from './fixtures';
import type { MockServer } from './fixtures';

let mock: MockServer;
beforeAll(async () => {
  mock = await startMock();
});
afterAll(async () => {
  await mock.close();
});
afterEach(() => {
  mock.set({ tps: 4000, load: 0, apiKey: '', show: 'normal', showDelay: 0, capabilities: null });
});

const schema = sceneSchema({ speakers: ['Fern', 'Basil'], people: ['Fern', 'Basil'], rooms: ['shop'], minLines: 2, maxLines: 3 });
const req = (over: Partial<ChatRequest> = {}): ChatRequest => ({
  messages: [
    { role: 'system', content: 'SYSTEM' },
    { role: 'user', content: 'Day 1, 09:00, in the Shop Floor. Write 2 to 3 lines.' }
  ],
  schema,
  temperature: 0.8,
  maxTokens: 400,
  ...over
});

const ollama = (model = 'artemis-custom', extra = {}) =>
  new OllamaTransport(settings({ baseUrl: mock.url, model }), { wakingAfterMs: 50, ...extra });

async function rejects(p: Promise<unknown>): Promise<BrainError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(BrainError);
    return e as BrainError;
  }
  throw new Error('expected a rejection');
}

describe('Ollama transport', () => {
  it('streams text in order and reports stats', async () => {
    const seen: string[] = [];
    const t = ollama();
    const res = await t.chat(req({ onText: (s) => seen.push(s) }));
    expect(seen.length).toBeGreaterThan(5);
    for (let i = 1; i < seen.length; i++) expect(seen[i].startsWith(seen[i - 1])).toBe(true);
    expect(seen[seen.length - 1]).toBe(res.text);
    expect(parseLoose(res.text)?.value.lines).toBeTruthy();
    expect(res.stats.ms).toBeGreaterThan(0);
    expect(res.stats.firstTokenMs).toBeGreaterThanOrEqual(0);
    expect(res.stats.outputTokens).toBeGreaterThan(0);
    expect(res.stats.promptTokens).toBeGreaterThan(0);
    expect(res.stats.tokPerSec).toBeGreaterThan(0);
  });

  it('sends only safe options: no num_ctx, no num_gpu, no think by default', async () => {
    await ollama().chat(req());
    const body = mock.requests.filter((r) => r.path === '/api/chat').pop()!.body as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.format).toEqual(schema);
    expect(body.keep_alive).toBe('30m');
    expect(body).not.toHaveProperty('think');
    const options = body.options as Record<string, unknown>;
    expect(Object.keys(options).sort()).toEqual(['num_predict', 'repeat_penalty', 'temperature', 'top_p']);
    expect(options.num_predict).toBe(400);
  });

  it('honours the token cap', async () => {
    const res = await ollama().chat(req({ maxTokens: 10 }));
    expect(res.stats.outputTokens).toBe(10);
  });

  it('strips reasoning and then sends think:false', async () => {
    const t = ollama('mock-thinker');
    const seen: string[] = [];
    const r1 = await t.chat(req({ onText: (s) => seen.push(s) }));
    expect(r1.text.startsWith('{')).toBe(true);
    expect(seen.every((s) => !s.includes('<think>'))).toBe(true);
    expect(t.thinkMode).toBe('false');
    await t.chat(req());
    const body = mock.requests.filter((r) => r.path === '/api/chat').pop()!.body as Record<string, unknown>;
    expect(body.think).toBe(false);
  });

  it('falls back to plain JSON mode on a server too old for schemas', async () => {
    const t = ollama('mock-oldjson');
    const r1 = await t.chat(req());
    expect(parseLoose(r1.text)).toBeTruthy();
    const sent = mock.requests.filter((r) => r.path === '/api/chat').map((r) => (r.body as Record<string, unknown>).format);
    expect(sent.slice(-2)).toEqual([schema, 'json']);
    // and it remembers, so the next request does not waste a round trip
    await t.chat(req());
    expect((mock.requests.filter((r) => r.path === '/api/chat').pop()!.body as Record<string, unknown>).format).toBe('json');
  });

  it('drops think again when the server rejects it', async () => {
    const t = ollama('mock-nothink');
    const r1 = await t.chat(req());
    expect(r1.text.startsWith('{')).toBe(true);
    expect(t.thinkMode).toBe('false');
    const r2 = await t.chat(req());
    expect(parseLoose(r2.text)).toBeTruthy();
    expect(t.thinkMode).toBe('never');
    const last = mock.requests.filter((r) => r.path === '/api/chat').pop()!.body as Record<string, unknown>;
    expect(last).not.toHaveProperty('think');
  });

  it('turns a missing model into a plain message with the fix', async () => {
    const e = await rejects(ollama('mock-404').chat(req()));
    expect(e.kind).toBe('model');
    expect(e.message).toBe('That server has no model called mock-404. On the laptop run: ollama pull mock-404');
    const s = await ollama('nope').status();
    expect(s.ok).toBe(false);
    expect(s.error).toContain('ollama pull nope');
    expect(s.models).toContain('artemis-custom:latest');
  });

  it('says when it cannot connect', async () => {
    const t = new OllamaTransport(settings({ baseUrl: 'http://127.0.0.1:1' }));
    const e = await rejects(t.chat(req()));
    expect(e.kind).toBe('connect');
    expect(e.message).toBe('Could not reach the model server at http://127.0.0.1:1. Is the laptop awake and Ollama running?');
    const s = await t.status();
    expect(s.ok).toBe(false);
    expect(s.error).toContain('Could not reach');
  });

  it('reports a dropped connection', async () => {
    const e = await rejects(ollama('mock-drop').chat(req()));
    expect(e.kind).toBe('connect');
    expect(e.message).toContain('hung up');
  });

  it('can be cancelled', async () => {
    mock.set({ tps: 50 });
    const ac = new AbortController();
    const seen: string[] = [];
    const p = ollama().chat(req({ signal: ac.signal, onText: (s) => seen.push(s) }));
    setTimeout(() => ac.abort(), 80);
    const e = await rejects(p);
    expect(e.kind).toBe('abort');
    const pre = new AbortController();
    pre.abort();
    expect((await rejects(ollama().chat(req({ signal: pre.signal })))).kind).toBe('abort');
  });

  it('times out a cold model with a plain message and reports waking', async () => {
    mock.unload();
    mock.set({ load: 600 });
    const phases: string[] = [];
    const t = ollama('danger', { coldTimeoutMs: 250, onProgress: (p: { phase: string }) => phases.push(p.phase) });
    const e = await rejects(t.chat(req()));
    expect(e.kind).toBe('timeout');
    expect(e.message).toContain('wake up');
    expect(phases).toContain('waking');
  });

  it('allows a slow cold start within the cold timeout, then uses the shorter one', async () => {
    mock.unload();
    mock.set({ load: 300 });
    const phases: string[] = [];
    const t = ollama('artemis-custom', { coldTimeoutMs: 2000, firstTokenTimeoutMs: 200, onProgress: (p: { phase: string }) => phases.push(p.phase) });
    await t.chat(req());
    expect(phases).toEqual(['waking', 'writing', 'idle']);
    await t.chat(req());
  });

  it('times out a stalled reply', async () => {
    const t = ollama('mock-slow', { stallTimeoutMs: 300 });
    const e = await rejects(t.chat(req()));
    expect(e.kind).toBe('timeout');
    expect(e.message).toContain('went quiet');
  });

  it('works with a relative base URL resolved by fetch (proxy case) via absolute fallback', async () => {
    // Node has no page origin, so a relative URL cannot be fetched here; the message must still be plain.
    const t = new OllamaTransport(settings({ baseUrl: '/ollama' }));
    const e = await rejects(t.chat(req()));
    expect(e.message).toContain('/ollama');
  });
});

// A model that can reason out loud spends a first reply's whole token cap on hidden reasoning unless
// think:false is sent, so the transport asks the server what the model can do before the first chat.
describe('Ollama transport: knowing up front whether the model reasons', () => {
  const since = (n: number, path: string) => mock.requests.slice(n).filter((r) => r.path === path);
  const chats = (n: number) => since(n, '/api/chat').map((r) => r.body as Record<string, unknown>);

  it('a thinking-capable model gets think:false on its very first chat, and the server is asked once', async () => {
    const n = mock.requests.length;
    const t = ollama('mock-thinker');
    expect((await t.status()).ok).toBe(true);
    const seen: string[] = [];
    const r1 = await t.chat(req({ onText: (s) => seen.push(s) }));
    expect(chats(n)[0].think).toBe(false);
    // It never reasoned, so the reply is all answer.
    expect(r1.text.startsWith('{')).toBe(true);
    expect(seen.every((s) => !s.includes('<think>'))).toBe(true);
    expect(t.thinkMode).toBe('false');
    await t.status();
    await t.chat(req());
    expect(chats(n).map((b) => b.think)).toEqual([false, false]);
    expect(since(n, '/api/show')).toHaveLength(1);
  });

  it('asks before the first chat when the status was never checked (the real box lists "thinking")', async () => {
    mock.set({ capabilities: ['completion', 'tools', 'thinking'] });
    const n = mock.requests.length;
    const t = ollama('artemis-custom');
    await t.chat(req());
    expect(chats(n)[0].think).toBe(false);
    // The check sends the model's name and nothing else: no options that could make Ollama reload it.
    expect(since(n, '/api/show').map((r) => r.body)).toEqual([{ model: 'artemis-custom' }]);
  });

  it('a model without the capability gets no think field', async () => {
    const n = mock.requests.length;
    const t = ollama('artemis-custom');
    await t.status();
    await t.chat(req());
    await t.chat(req());
    expect(chats(n).every((b) => !('think' in b))).toBe(true);
    expect(t.thinkMode).toBe('omit');
    expect(since(n, '/api/show')).toHaveLength(1);
  });

  it('a server without /api/show behaves as before: the first reply shows the reasoning, then think:false', async () => {
    mock.set({ show: 'missing' });
    const n = mock.requests.length;
    const t = ollama('mock-thinker');
    await t.status();
    const seen: string[] = [];
    const r1 = await t.chat(req({ onText: (s) => seen.push(s) }));
    expect(chats(n)[0]).not.toHaveProperty('think');
    expect(r1.text.startsWith('{')).toBe(true);
    expect(seen.every((s) => !s.includes('<think>'))).toBe(true);
    expect(t.thinkMode).toBe('false');
    await t.chat(req());
    expect(chats(n)[1].think).toBe(false);
    // A 404 is an answer: it is not asked again.
    expect(since(n, '/api/show')).toHaveLength(1);
  });

  it('a server that does not list capabilities behaves as before', async () => {
    mock.set({ show: 'nocaps' });
    const n = mock.requests.length;
    const t = ollama('mock-thinker');
    await t.chat(req());
    await t.chat(req());
    expect(chats(n).map((b) => b.think)).toEqual([undefined, false]);
  });

  it('a slow check never holds up a chat, and its answer is used once it comes', async () => {
    mock.set({ showDelay: 2200, capabilities: ['completion', 'thinking'] });
    const n = mock.requests.length;
    const t = ollama('artemis-custom');
    const t0 = Date.now();
    await t.chat(req());
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(chats(n)[0]).not.toHaveProperty('think');
    await new Promise((r) => setTimeout(r, 1000));
    await t.chat(req());
    expect(chats(n)[1].think).toBe(false);
  });

  it('a check that gets no answer never fails a chat, and is tried at most twice', async () => {
    mock.set({ showDelay: 400, capabilities: ['completion', 'thinking'] });
    const n = mock.requests.length;
    const t = ollama('artemis-custom', { statusTimeoutMs: 100 });
    for (let i = 0; i < 3; i++) expect(parseLoose((await t.chat(req())).text)).toBeTruthy();
    expect(chats(n).every((b) => !('think' in b))).toBe(true);
    expect(since(n, '/api/show')).toHaveLength(2);
  });

  it('still drops think when the server rejects it, even after the server said the model can think', async () => {
    mock.set({ capabilities: ['completion', 'thinking'] });
    const n = mock.requests.length;
    const t = ollama('mock-nothink');
    const r1 = await t.chat(req());
    expect(parseLoose(r1.text)).toBeTruthy();
    expect(t.thinkMode).toBe('never');
    expect(chats(n).map((b) => 'think' in b)).toEqual([true, false]);
    await t.chat(req());
    expect(chats(n)[2]).not.toHaveProperty('think');
  });
});

describe('browser network errors', () => {
  const g = globalThis as { location?: unknown };
  afterEach(() => {
    delete g.location;
  });
  it('explains mixed content on an https page', () => {
    g.location = { protocol: 'https:', href: 'https://game.example/', origin: 'https://game.example' };
    const e = networkError('http://192.168.1.20:11434/api/chat', 'http://192.168.1.20:11434');
    expect(e.kind).toBe('cors');
    expect(e.message).toContain('https');
    expect(e.message).toContain('Tailscale');
  });
  it('mentions CORS for another origin, and resolves relative addresses', () => {
    g.location = { protocol: 'http:', href: 'http://localhost:5173/', origin: 'http://localhost:5173' };
    expect(networkError('http://laptop:11434/api/chat', 'http://laptop:11434').message).toContain('OLLAMA_ORIGINS');
    const same = networkError('/ollama/api/chat', '/ollama');
    expect(same.message).toBe('Could not reach the model server at http://localhost:5173/ollama. Is the laptop awake and Ollama running?');
  });
});

describe('probeOllama', () => {
  it('returns the first candidate that answers', async () => {
    const r = await probeOllama(['http://127.0.0.1:1', `${mock.url}/`, 'http://127.0.0.1:2']);
    expect(r?.baseUrl).toBe(mock.url);
    expect(r?.models).toContain('artemis-custom:latest');
    expect(await probeOllama(['http://127.0.0.1:1'])).toBeNull();
    expect(await probeOllama([])).toBeNull();
  });
});

describe('OpenAI-compatible transport', () => {
  const oa = (model = 'artemis-custom', apiKey = '') => new OpenAiTransport(settings({ provider: 'openai', baseUrl: `${mock.url}/v1`, model, apiKey }));

  it('streams SSE and lists models', async () => {
    const seen: string[] = [];
    const t = oa();
    const res = await t.chat(req({ onText: (s) => seen.push(s) }));
    expect(seen.length).toBeGreaterThan(3);
    expect(parseLoose(res.text)?.value.lines).toBeTruthy();
    expect(res.stats.outputTokens).toBeGreaterThan(0);
    const body = mock.requests.filter((r) => r.path === '/v1/chat/completions').pop()!.body as { response_format: { type: string } };
    expect(body.response_format.type).toBe('json_schema');
    const s = await t.status();
    expect(s.ok).toBe(true);
    expect(s.models).toContain('artemis-custom');
  });

  it('steps down to json_object and then to no format on HTTP 400', async () => {
    const t1 = oa('mock-noschema');
    await t1.chat(req());
    expect(t1.formatMode).toBe('object');
    const t2 = oa('mock-strict400');
    const r = await t2.chat(req());
    expect(t2.formatMode).toBe('none');
    expect(parseLoose(r.text)).toBeTruthy();
  });

  it('sends the key and explains a refused one', async () => {
    mock.set({ apiKey: 'sekrit' });
    const e = await rejects(oa().chat(req()));
    expect(e.kind).toBe('auth');
    expect(e.message).toContain('API key');
    const r = await oa('artemis-custom', 'sekrit').chat(req());
    expect(r.text.length).toBeGreaterThan(10);
    const last = mock.requests.filter((x) => x.path === '/v1/chat/completions').pop()!;
    expect(last.headers.authorization).toBe('Bearer sekrit');
  });

  it('reports drops and missing models', async () => {
    expect((await rejects(oa('mock-drop').chat(req()))).kind).toBe('connect');
    expect((await rejects(oa('mock-404').chat(req()))).kind).toBe('model');
  });
});

describe('Claude transport', () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it('is unavailable outside an Artifact', async () => {
    expect(await claudeAvailable()).toBe(false);
    const t = new ClaudeTransport(settings({ provider: 'claude' }));
    expect(t.autonomous).toBe(false);
    expect((await t.status()).ok).toBe(false);
    expect((await rejects(t.chat(req()))).kind).toBe('denied');
  });

  it('builds one input string and streams through onText', async () => {
    let input = '';
    let opts: Record<string, unknown> = {};
    const reply = JSON.stringify({ lines: [{ who: 'Fern', say: 'Team.', feel: 'angry', to: 'none', act: 'none' }], summary: 's', shifts: [], plans: [] });
    g.window = {
      claude: {
        use: async (cap: string) =>
          cap === 'sample'
            ? async (i: string, o: { onText: (e: { text: string }) => void }) => {
                input = i;
                opts = o as unknown as Record<string, unknown>;
                o.onText({ text: reply.slice(0, 20) });
                o.onText({ text: reply });
                return { text: reply };
              }
            : undefined
      }
    };
    expect(await claudeAvailable()).toBe(true);
    const seen: string[] = [];
    const t = createTransport(settings({ provider: 'claude', claudeTier: 'quick' }))!;
    const r = await t.chat(req({ onText: (s) => seen.push(s) }));
    expect(r.text).toBe(reply);
    expect(seen).toEqual([reply.slice(0, 20), reply]);
    expect(input.indexOf('SYSTEM')).toBeLessThan(input.indexOf('Day 1'));
    expect(input.indexOf('Day 1')).toBeLessThan(input.indexOf('JSON Schema'));
    expect(opts.modelTier).toBe('quick');
    expect(opts.cache).toBe(false);
  });

  it('hides itself for good when refused, and backs off when rate limited', async () => {
    let code = 'rate_limited';
    g.window = { claude: { use: async () => async () => Promise.reject({ code, message: 'no' }) } };
    const t = new ClaudeTransport(settings({ provider: 'claude' }));
    expect((await rejects(t.chat(req()))).kind).toBe('rate');
    code = 'not_granted';
    expect((await rejects(t.chat(req()))).kind).toBe('denied');
    code = 'whatever';
    expect((await rejects(t.chat(req()))).kind).toBe('denied');
    expect((await t.status()).ok).toBe(false);
    code = 'cancelled';
    const t2 = new ClaudeTransport(settings({ provider: 'claude' }));
    expect((await rejects(t2.chat(req()))).kind).toBe('abort');
  });
});
