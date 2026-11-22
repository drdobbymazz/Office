// Story mode in the director: small talk and chance meetings about the story's topics, a new topic
// as news, people keeping a secret, hand-written scenes (order, huddle, carry-on, never dropped),
// and the day's write-up keeping the story.
import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '@/game/core/bus';
import { VOICES } from '@/game/core/content';
import type { CharId, FeedItem } from '@/game/core/types';
import type { ReportRequest, SceneCallbacks, SceneRequest } from '@/game/brain/api';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import { Director, pickLog } from '@/game/director/director';
import { createSim } from '@/game/sim';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { createRng } from '@/game/sim/rng';
import type { ScriptLine } from '@/game/story/types';
import { WORLD } from '../story/harness';

/** The no-model brain, noting every scene and report it is asked for. */
class Spy extends InstinctBrain {
  scenes: SceneRequest[] = [];
  reports: ReportRequest[] = [];
  async scene(req: SceneRequest, cb?: SceneCallbacks) {
    this.scenes.push(req);
    return super.scene(req, cb);
  }
  async report(req: ReportRequest) {
    this.reports.push(req);
    return super.report(req);
  }
}

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

function office(topics: () => string[], seed = 5) {
  const bus = new Bus<GameEvents>();
  const brain = new Spy(VOICES as unknown as LooseBank, WORLD, createRng(seed));
  const sim = createSim({ bus, reflexes: brain, seed, dayMinutes: 10, sandbox: false, now: () => 0 });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  const feed: FeedItem[] = [];
  bus.on('feed', (f) => feed.push(f));
  const director = new Director({ sim, brain, instinct: brain, speed: () => 7, storyTopics: topics });
  director.reset();
  let n = 0;
  const step = async (sec: number): Promise<void> => {
    for (let t = 0; t < sec; t += 0.1) {
      sim.update(0.1);
      director.update(0.1);
      if (++n % 5 === 0) await flush();
    }
  };
  const toClock = async (h: number, m = 0): Promise<void> => {
    while (sim.clock < h * 60 + m) await step(0.5);
  };
  return { bus, brain, sim, director, feed, step, toClock };
}

const CLOSURE = 'Corporate may close the branch on Friday. Nobody knows what happens to them if it does.';
const CLIENT = 'Mr Figgis is coming. Without his order, the branch has no chance.';

describe('the office talks about the story', () => {
  it('about a third of the small talk and chance meetings are about it while it has topics', async () => {
    const o = office(() => [CLOSURE]);
    await o.toClock(9, 2);
    o.brain.scenes.length = 0;
    await o.toClock(13, 30);
    const chats = o.brain.scenes.filter((s) => s.trigger === 'ambient');
    const story = chats.filter((s) => s.topic === 'closure');
    expect(chats.length).toBeGreaterThanOrEqual(8);
    const share = story.length / chats.length;
    expect(share, `${story.length} of ${chats.length}`).toBeGreaterThan(0.2);
    expect(share, `${story.length} of ${chats.length}`).toBeLessThan(0.65);
    for (const s of story) expect(s.why).toContain(CLOSURE);
    // Without a model the lines come from the story bank.
    const said = o.feed.filter((f) => f.kind === 'say').map((f) => f.text);
    const bank = Object.values(VOICES).flatMap((v) => (v as { story?: { closure?: string[] } }).story?.closure ?? []);
    expect(said.filter((t) => bank.includes(t)).length).toBeGreaterThan(3);
  }, 60_000);

  it('the sandbox has no story topics, so none of this happens there', async () => {
    const o = office(() => []);
    await o.toClock(11);
    expect(o.brain.scenes.some((s) => s.topic)).toBe(false);
  }, 60_000);

  it('a topic that appears during the day is news: the next chats are about it', async () => {
    const topics = [CLOSURE];
    const o = office(() => topics);
    await o.toClock(10);
    o.brain.scenes.length = 0;
    topics.push(CLIENT);
    await o.step(40);
    const news = o.brain.scenes.filter((s) => s.why.includes(CLIENT));
    expect(news.length).toBeGreaterThanOrEqual(1);
    expect(news[0].topic).toBe('client');
    expect(news[0].trigger).toBe('event');
  }, 60_000);

  it('someone keeping a secret is never made to bring up what they are sure of', async () => {
    const o = office(() => [CLOSURE]);
    o.sim.convince('michael', 'If I stay in my office, nothing bad can happen this week.');
    o.sim.setHiddenNote('michael', 'Michael knows the branch may close and is hiding it.');
    await o.toClock(12);
    expect(o.brain.scenes.filter((s) => /Michael has been sure all day/.test(s.why))).toEqual([]);
    expect(o.feed.filter((f) => f.who === 'michael' && /nothing bad can happen/i.test(f.text))).toEqual([]);
  }, 90_000);
});

describe('hand-written scenes', () => {
  const lines = (who: CharId, n: number, tag: string): ScriptLine[] => Array.from({ length: n }, (_, i) => ({ who, text: `${tag} line ${i + 1}.` }));

  it('play one after another, in order, and each says when it is done', async () => {
    const o = office(() => [CLOSURE]);
    await o.toClock(9, 30);
    const done: string[] = [];
    o.director.playScript([...lines('jim', 2, 'First')], { done: () => done.push('first') });
    o.director.playScript([{ who: 'dwight', text: 'Second line one.' }, { voice: { name: 'The vice president' }, text: 'Second line two.' }], { done: () => done.push('second') });
    await o.step(30);
    expect(done).toEqual(['first', 'second']);
    const said = o.feed.filter((f) => /^(First|Second) line|The vice president: "Second/.test(f.text)).map((f) => f.text);
    expect(said).toEqual(['First line 1.', 'First line 2.', 'Second line one.', 'The vice president: "Second line two."']);
    const voice = o.feed.find((f) => f.text.startsWith('The vice president'))!;
    expect(voice.beat).toBe(true);
  }, 60_000);

  it('hold the speakers together, facing each other, while it plays', async () => {
    const o = office(() => []);
    await o.toClock(10);
    // Two people at desks in the same room, free to talk.
    const pair = (['jim', 'dwight', 'stanley', 'phyllis', 'andy'] as CharId[]).filter((id) => o.sim.person(id)?.available && o.sim.person(id)?.room === 'bullpen').slice(0, 2);
    expect(pair.length).toBe(2);
    const [a, b] = pair;
    o.director.playScript([{ who: a, text: 'Did you hear?', to: b }, { who: b, text: 'I heard.', to: a }, { who: a, text: 'Well then.' }]);
    await o.step(1.5);
    const sa = o.sim.person(a)!.sceneId;
    expect(sa).not.toBeNull();
    expect(o.sim.person(b)!.sceneId).toBe(sa);
    await o.step(20);
    expect(o.sim.person(a)!.sceneId).toBeNull();
  }, 60_000);

  it('the model (or the written lines) carry the scene on, on the same subject', async () => {
    const o = office(() => [CLOSURE]);
    await o.toClock(10);
    o.brain.scenes.length = 0;
    o.director.playScript([{ who: 'jim', text: 'They are closing us?' }, { who: 'pam', text: 'That is what he said.' }], {
      then: 'model', why: 'The vice president has just said the branch is on the list to close.'
    });
    await o.step(25);
    const carry = o.brain.scenes.find((s) => s.trigger === 'event' && s.why.includes('carry on'));
    expect(carry).toBeTruthy();
    expect(carry!.topic).toBe('closure');
    expect(carry!.people.map((p) => p.id).every((id) => ['jim', 'pam'].includes(id))).toBe(true);
    expect(carry!.recent.map((r) => r.say)).toContain('That is what he said.');
  }, 60_000);

  it('a reaction the player asked for waits for a long scene instead of going stale', async () => {
    const o = office(() => []);
    await o.toClock(10);
    o.director.playScript(lines('dwight', 16, 'Long'));
    await o.step(1);
    o.director.whisper('kevin', 'The vending machine is free today.');
    await o.step(90);
    expect(o.feed.filter((f) => /^Long line/.test(f.text)).length).toBe(16);
    expect(o.brain.scenes.some((s) => s.trigger === 'whisper' && s.people[0].id === 'kevin')).toBe(true);
  }, 60_000);

  it('end at once when the rest of the day is skipped, and still say they are done', async () => {
    const o = office(() => []);
    await o.toClock(10);
    let done = 0;
    o.director.playScript(lines('jim', 5, 'Cut'), { done: () => done++ });
    o.director.playScript(lines('jim', 2, 'Queued'), { done: () => done++ });
    await o.step(1);
    o.director.reset();
    expect(done).toBe(2);
    await o.step(10);
    expect(o.feed.filter((f) => /^Queued line/.test(f.text))).toEqual([]);
  }, 60_000);

  it('asked for while the office is being set up (before nine), they wait for the day to start', async () => {
    const o = office(() => []);
    let done = 0;
    o.director.playScript([{ who: 'michael', text: 'Nobody come in!' }], { done: () => done++ });
    o.director.reset();
    expect(done).toBe(0);
    await o.toClock(9, 10);
    expect(done).toBe(1);
  }, 60_000);
});

describe('the day\'s write-up', () => {
  it('keeps the morning\'s story beats, not just the afternoon\'s chatter', async () => {
    const o = office(() => [CLOSURE]);
    await o.toClock(9, 20);
    o.sim.narrate('The phone rings in the conference room. Michael puts the vice president on speaker.', { beat: true });
    for (let i = 0; i < 80; i++) o.sim.say('kevin', `Chatter number ${i}.`);
    const story = { title: 'Monday: The Memo', goal: 'All hands for the call', won: true, lines: ['The call went ahead.'], changes: ['+8 The call with Corporate went ahead'] };
    await o.director.writeReport({ incidents: 0, stockStart: 100, stockEnd: 101, morale: 60, chaosPeak: 0 }, story);
    const req = o.brain.reports[0];
    expect(req.story).toEqual(story);
    expect(req.log).toContain('The phone rings in the conference room. Michael puts the vice president on speaker.');
    expect(req.log.length).toBeLessThanOrEqual(30);
    expect(req.log.some((l) => /arriving for work/.test(l))).toBe(false);
  }, 60_000);

  it('picks the log by importance, in order', () => {
    const log = ['Monday, day 1. The staff are arriving for work.', 'Fire breaks out.', ...Array.from({ length: 50 }, (_, i) => `Kevin: "Line ${i}."`), 'The fire is out.'];
    const picked = pickLog(log, 10);
    expect(picked.length).toBe(10);
    expect(picked[0]).toBe('Fire breaks out.');
    expect(picked[picked.length - 1]).toBe('The fire is out.');
    expect(picked).toContain('Kevin: "Line 49."');
  });

  it('quotes of the day come from the story\'s scenes first', async () => {
    const o = office(() => [CLOSURE]);
    await o.toClock(9, 30);
    o.director.playScript([{ who: 'jim', text: 'So the branch might really close on Friday, then.' }]);
    await o.toClock(12);
    const says = o.feed.filter((f) => f.kind === 'say' && f.text.length > 18);
    const quotes = o.director.pickQuotes(says, 3);
    expect(quotes.length).toBe(3);
    const story = new Set(['So the branch might really close on Friday, then.', ...Object.values(VOICES).flatMap((v) => (v as { story?: { closure?: string[] } }).story?.closure ?? [])]);
    expect(quotes.filter((q) => story.has(q.text)).length).toBeGreaterThanOrEqual(1);
    // With no story lines at all, it is the usual spread of the day.
    expect(o.director.pickQuotes(says.filter((f) => !story.has(f.text)), 3).length).toBe(3);
    // In the order they were said.
    expect(quotes.map((q) => says.indexOf(q))).toEqual([...quotes.map((q) => says.indexOf(q))].sort((x, y) => x - y));
  }, 60_000);
});
