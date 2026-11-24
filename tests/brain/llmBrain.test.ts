import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMOTIONS, LINE_ACTS, PLAN_KINDS } from '@/game/core/types';
import type { Brain, ChatRequest, ChatResponse, ChatTransport, SceneLine, SceneResult } from '@/game/brain/api';
import { createBrain, LlmBrain } from '@/game/brain/index';
import { BANK, WORLD, mindsReq, sceneReq, seeded, settings, startMock } from './fixtures';
import type { MockServer } from './fixtures';

let mock: MockServer;
beforeAll(async () => {
  mock = await startMock();
});
afterAll(async () => {
  await mock.close();
});

const brainFor = (model: string, extra: Record<string, unknown> = {}): LlmBrain =>
  createBrain(settings({ baseUrl: mock.url, model }), {
    bank: BANK,
    world: WORLD,
    rng: seeded(3),
    transportOptions: { stallTimeoutMs: 400, firstTokenTimeoutMs: 2000, coldTimeoutMs: 2000 },
    ...extra
  }) as LlmBrain;

const req = sceneReq();
const speakerIds = req.people.map((p) => p.id);

function expectUsableScene(r: SceneResult): void {
  expect(r.lines.length).toBeGreaterThan(0);
  expect(r.lines.length).toBeLessThanOrEqual(req.maxLines);
  for (const l of r.lines) {
    expect(speakerIds).toContain(l.who);
    expect(l.say.trim().length).toBeGreaterThan(0);
    expect(EMOTIONS).toContain(l.feel);
    expect(LINE_ACTS).toContain(l.act);
    expect(l.to === null || l.to === 'all' || speakerIds.includes(l.to)).toBe(true);
  }
  expect(r.summary.length).toBeGreaterThan(5);
  for (const p of r.plans) expect(PLAN_KINDS).toContain(p.plan.kind);
}

describe('LlmBrain against the mock', () => {
  it('streams scene lines one by one before the reply finishes', async () => {
    mock.set({ tps: 300 });
    const brain = brainFor('artemis-custom');
    const got: { line: SceneLine; i: number; at: number }[] = [];
    const t0 = Date.now();
    const r = await brain.scene(req, { onLine: (line, i) => got.push({ line, i, at: Date.now() - t0 }) });
    const total = Date.now() - t0;
    mock.set({ tps: 4000 });
    expect(r.source).toBe('model');
    expectUsableScene(r);
    expect(got.map((g) => g.i)).toEqual(r.lines.map((_, i) => i));
    expect(got.map((g) => g.line)).toEqual(r.lines);
    // The first line arrived well before the whole reply did.
    expect(got[0].at).toBeLessThan(total * 0.7);
    expect(r.summary).toContain('argued');
    const st = await brain.status();
    expect(st.ok).toBe(true);
    expect(st.tokPerSec).toBeGreaterThan(0);
    expect(st.firstLineMs).toBeGreaterThan(0);
  });

  it('temperature follows chaos and token caps follow the request', async () => {
    const brain = brainFor('artemis-custom');
    await brain.scene({ ...req, chaos: 1, maxLines: 3 });
    const body = mock.requests.filter((r) => r.path === '/api/chat').pop()!.body as { options: { temperature: number; num_predict: number } };
    expect(body.options.temperature).toBeCloseTo(0.9 * 1.15, 5);
    expect(body.options.num_predict).toBe(60 + 45 * 3);
    await brain.minds(mindsReq());
    const b2 = mock.requests.filter((r) => r.path === '/api/chat').pop()!.body as { options: { num_predict: number } };
    expect(b2.options.num_predict).toBe(40 + 55 * 2);
  });

  it('sends the same system message every time', async () => {
    const brain = brainFor('artemis-custom');
    await brain.scene(req);
    await brain.scene({ ...req, why: 'Something else.' });
    const sys = mock.requests
      .filter((r) => r.path === '/api/chat')
      .slice(-2)
      .map((r) => (r.body as { messages: { content: string }[] }).messages[0].content);
    expect(sys[0]).toBe(sys[1]);
  });

  for (const model of ['mock-garbage', 'mock-truncate', 'mock-thinker', 'mock-nothink', 'mock-drop', 'mock-fences', 'mock-404']) {
    it(`still resolves with a usable scene: ${model}`, async () => {
      const brain = brainFor(model);
      const lines: SceneLine[] = [];
      const r = await brain.scene(req, { onLine: (l) => lines.push(l) });
      expectUsableScene(r);
      expect(lines).toEqual(r.lines);
      if (model === 'mock-thinker' || model === 'mock-nothink' || model === 'mock-fences') expect(r.source).toBe('model');
      if (model === 'mock-garbage' || model === 'mock-404') expect(r.source).toBe('instinct');
      if (model === 'mock-truncate') {
        expect(r.source).toBe('model');
        expect(r.lines.length).toBe(1); // the complete first line survives
      }
      if (model === 'mock-drop') expect(r.lines.length).toBeGreaterThan(0);
    });
  }

  it('retries an unparseable reply once at a lower temperature, then falls back', async () => {
    const before = mock.requests.length;
    const brain = brainFor('mock-garbage');
    const r = await brain.scene({ ...req, chaos: 0.5 });
    const calls = mock.requests.slice(before).filter((x) => x.path === '/api/chat').map((x) => (x.body as { options: { temperature: number } }).options.temperature);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBeLessThan(calls[0]);
    expect(r.source).toBe('instinct');
  });

  it('minds, interpret and report come back valid from the model and from every broken model', async () => {
    for (const model of ['artemis-custom', 'mock-garbage', 'mock-truncate', 'mock-fences', 'mock-drop']) {
      const brain = brainFor(model);
      const m = await brain.minds(mindsReq());
      expect(m.map((x) => x.who)).toEqual(['ivy', 'rowan']);
      for (const x of m) {
        expect(x.thought.length).toBeGreaterThan(0);
        expect(['work', 'talk', 'coffee', 'confront', 'hide', 'wander', 'snack']).toContain(x.plan.kind);
      }
      const i = await brain.interpret({
        id: 'i', text: 'a horse walks into the greenhouse',
        rooms: [{ id: 'shop' as never, name: 'the Shop Floor', people: ['Fern'] }, { id: 'greenhouse' as never, name: 'the Greenhouse', people: [] }]
      });
      expect(i.title.length).toBeGreaterThan(0);
      expect(['shop', 'greenhouse', 'everywhere']).toContain(i.room);
      expect([1, 2, 3]).toContain(i.intensity);
      const rep = await brain.report({
        id: 'r', day: 2, log: ['Fern shouted at Basil.', 'A horse walked into the Greenhouse.'],
        stats: { incidents: 2, stockStart: 100, stockEnd: 80, morale: 0.6, chaosPeak: 0.8 },
        people: [{ id: 'fern', name: 'Fern Holloway', mood: 'angry' }, { id: 'basil', name: 'Basil Okafor', mood: 'happy' }]
      });
      expect(rep.headline.length).toBeGreaterThan(0);
      expect(rep.paragraphs.length).toBeGreaterThan(0);
      expect(rep.takeaways.map((t) => t.who)).toEqual(['fern', 'basil']);
      if (model === 'artemis-custom') {
        expect(m.every(() => true)).toBe(true);
        expect(i.source).toBe('model');
        expect(i.room).toBe('greenhouse');
        expect(rep.source).toBe('model');
      }
    }
  });

  it('runs one request at a time, in order', async () => {
    mock.set({ tps: 1500 });
    const brain = brainFor('artemis-custom');
    const order: string[] = [];
    const before = mock.requests.length;
    await Promise.all(
      ['a', 'b', 'c'].map((tag) => brain.scene({ ...req, why: `Scene ${tag}.` }).then(() => order.push(tag)))
    );
    mock.set({ tps: 4000 });
    expect(order).toEqual(['a', 'b', 'c']);
    const sent = mock.requests.slice(before).filter((r) => r.path === '/api/chat');
    expect(sent.map((r) => (r.body as { messages: { content: string }[] }).messages[1].content.match(/Scene (\w)/)![1])).toEqual(['a', 'b', 'c']);
    // Each one started only after the one before had finished.
    for (let i = 1; i < sent.length; i++) expect(sent[i].at).toBeGreaterThanOrEqual(sent[i - 1].at);
  });

  it('a caller who gives up while queued gets instinct at once and does not block the queue', async () => {
    mock.set({ tps: 400 });
    const brain = brainFor('artemis-custom');
    const first = brain.scene(req);
    const ac = new AbortController();
    const second = brain.scene({ ...req, why: 'Queued.' }, { signal: ac.signal });
    ac.abort();
    const r2 = await second;
    expect(r2.source).toBe('instinct');
    const r1 = await first;
    expect(r1.source).toBe('model');
    mock.set({ tps: 4000 });
    expect((await brain.scene(req)).source).toBe('model');
  });
});

describe('health', () => {
  it('goes offline after two failures, answers from instinct at once, and comes back', async () => {
    const m2 = await startMock();
    const port = m2.port;
    const brain = createBrain(settings({ baseUrl: m2.url }), { bank: BANK, world: WORLD, recheckMs: 500 }) as LlmBrain;
    expect((await brain.status()).ok).toBe(true);
    expect((await brain.scene(req)).source).toBe('model');
    await m2.close();

    expect((await brain.scene(req)).source).toBe('instinct');
    expect((await brain.status()).ok).toBe(true); // one failure is not enough (status is cached)
    expect((await brain.scene(req)).source).toBe('instinct');
    const st = await brain.status();
    expect(st.ok).toBe(false);
    expect(st.error).toContain('Could not reach');

    // Offline: answers immediately without touching the network.
    const t0 = Date.now();
    expect((await brain.scene(req)).source).toBe('instinct');
    expect(Date.now() - t0).toBeLessThan(50);

    const m3 = await startMock({ port });
    try {
      await new Promise((r) => setTimeout(r, 550));
      expect((await brain.status()).ok).toBe(true);
      expect((await brain.scene(req)).source).toBe('model');
    } finally {
      await m3.close();
    }
  });

  it('a refusing Claude is hidden for good', async () => {
    let calls = 0;
    const transport: ChatTransport = {
      kind: 'claude',
      autonomous: false,
      status: async () => ({ ok: true, models: [] }),
      chat: async (_r: ChatRequest): Promise<ChatResponse> => {
        calls++;
        const { BrainError } = await import('@/game/brain/transports/common');
        throw new BrainError('denied', 'Claude is not allowed to write for this game here.');
      }
    };
    const brain: Brain = createBrain(settings({ provider: 'claude' }), { bank: BANK, world: WORLD, transport });
    expect(brain.autonomous).toBe(false);
    expect((await brain.scene(req)).source).toBe('instinct');
    expect((await brain.scene(req)).source).toBe('instinct');
    expect(calls).toBe(1);
    const st = await brain.status();
    expect(st.ok).toBe(false);
    expect(st.error).toContain('not allowed');
  });
});

describe('createBrain', () => {
  it('builds an InstinctBrain for instinct', async () => {
    const b = createBrain(settings({ provider: 'instinct' }), { bank: BANK, world: WORLD });
    expect(b.kind).toBe('instinct');
    expect((await b.status()).ok).toBe(true);
    expect((await b.scene(req)).source).toBe('instinct');
  });
});
