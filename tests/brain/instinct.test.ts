import { describe, expect, it } from 'vitest';
import { CHAOS_IDS, EMOTIONS, LINE_ACTS, PLAN_KINDS, SHIFT_KINDS } from '@/game/core/types';
import { BARK_KINDS, CUSTOM_LOOKS, CUSTOM_REACTIONS, CUSTOM_VIBES } from '@/game/brain/api';
import type { SceneTrigger } from '@/game/brain/api';
import { InstinctBrain, toneOf } from '@/game/brain/instinct';
import { createReflexes } from '@/game/brain/index';
import { BANK, WORLD, mindsReq, person, sceneReq, seeded } from './fixtures';

const TRIGGERS: SceneTrigger[] = ['ambient', 'plan', 'event', 'aftermath', 'whisper', 'announce', 'cue', 'custom'];
const WHY: Record<SceneTrigger, string> = {
  ambient: 'They bump into each other by the kettle.',
  plan: 'Fern came over to ask about the mug.',
  event: 'Fire breaks out in the Staff Kitchen.',
  aftermath: 'The fire in the Staff Kitchen has just been put out.',
  whisper: 'A thought appears in their head: "Basil stole the mug".',
  announce: 'A voice on the loudspeaker says: "The gnomes are watching."',
  cue: 'They feel like dancing on the table.',
  custom: 'A horse walks into the Staff Kitchen.'
};

describe('InstinctBrain scenes', () => {
  const brain = new InstinctBrain(BANK, WORLD, seeded(11));
  const ids = WORLD.people.map((p) => p.id);

  it('produces a valid scene for every trigger and every person, alone and in pairs', async () => {
    for (const trigger of TRIGGERS) {
      for (const a of ids) {
        for (const b of [null, ...ids.filter((x) => x !== a)]) {
          const people = b ? [person(a, { mood: 'angry' }), person(b, { mood: 'happy' })] : [person(a, { mood: 'scared' })];
          const req = sceneReq({ trigger, why: WHY[trigger], people, minLines: 2, maxLines: 4 });
          const seen: number[] = [];
          const r = await brain.scene(req, { onLine: (_l, i) => seen.push(i) });
          expect(r.source).toBe('instinct');
          expect(r.lines.length).toBeGreaterThan(0);
          expect(r.lines.length).toBeLessThanOrEqual(4);
          expect(seen).toEqual(r.lines.map((_, i) => i));
          const speakers = people.map((p) => p.id);
          for (const l of r.lines) {
            expect(speakers).toContain(l.who);
            expect(l.say).toMatch(/[a-z]/i);
            expect(l.say).not.toMatch(/\{[a-z]+\}/);
            expect(EMOTIONS).toContain(l.feel);
            expect(LINE_ACTS).toContain(l.act);
            expect(l.to === null || l.to === 'all' || speakers.includes(l.to)).toBe(true);
            expect(l.to).not.toBe(l.who);
          }
          const keys = r.lines.map((l) => l.say);
          expect(new Set(keys).size).toBe(keys.length);
          expect(r.summary).toMatch(/\.$/);
          for (const s of r.shifts) expect(SHIFT_KINDS).toContain(s.change);
          for (const p of r.plans) expect(PLAN_KINDS).toContain(p.plan.kind);
        }
      }
    }
  });

  it('uses the right part of the bank for each trigger', async () => {
    const pair = [person('fern'), person('basil')];
    const ev = await brain.scene(sceneReq({ trigger: 'event', why: WHY.event, people: pair }));
    expect(ev.lines[0].say).toMatch(/Fern (sees|cannot believe) the fire/);
    expect(ev.summary).toMatch(/fire in the Staff Kitchen\.$/);
    const wh = await brain.scene(sceneReq({ trigger: 'whisper', why: WHY.whisper, people: pair }));
    expect(wh.lines[0].say).toContain('Basil stole the mug');
    const an = await brain.scene(sceneReq({ trigger: 'announce', why: WHY.announce, people: pair }));
    expect(an.lines[0].say).toContain('heard the speaker');
    const cu = await brain.scene(sceneReq({ trigger: 'custom', why: WHY.custom, people: pair }));
    expect(cu.lines[0].say).toContain('horse');
    expect(cu.summary).toContain('horse');
    const am = await brain.scene(sceneReq({ trigger: 'ambient', why: WHY.ambient, people: pair }));
    expect(am.lines[0].say).toMatch(/^Basil, Fern opener/);
  });

  it('picks warm or cold replies from feelings and mood', async () => {
    expect(toneOf(person('fern', { feelings: [{ about: 'basil', text: 'his rival; annoying' }] }), 'basil')).toBe('cold');
    expect(toneOf(person('basil', { feelings: [{ about: 'fern', text: 'his best friend, adores her' }] }), 'fern')).toBe('warm');
    expect(toneOf(person('ivy'), 'fern')).toBe('neutral');
    const r = await brain.scene(sceneReq({ trigger: 'ambient', minLines: 3, maxLines: 3 }));
    expect(r.lines[1].say).toContain('Basil warm');
    expect(r.lines[2].say).toContain('Fern cold');
  });

  it('gives a person with no bank entry a generic voice', async () => {
    const r = await brain.scene(sceneReq({ people: [person('rowan'), person('visitor:inspector', { name: 'The Inspector' })] }));
    expect(r.lines.length).toBeGreaterThan(0);
    expect(r.summary).toMatch(/Rowan|Inspector/);
  });

  it('a caretaker plans to fix a fire; a nervous person flees', async () => {
    const r = await brain.scene(sceneReq({ trigger: 'event', why: WHY.event, people: [person('ivy'), person('rowan')] }));
    expect(r.plans).toContainEqual({ who: 'ivy', plan: { kind: 'fix', target: 'kitchen', about: 'the fire' } });
    expect(r.plans.find((p) => p.who === 'rowan')?.plan.kind).toBe('flee');
  });
});

describe('InstinctBrain minds, interpret, report', () => {
  const brain = new InstinctBrain(BANK, WORLD, seeded(5));

  it('minds: a thought and an allowed plan for everyone', async () => {
    for (let run = 0; run < 40; run++) {
      const req = mindsReq();
      const m = await brain.minds(req);
      expect(m.map((x) => x.who)).toEqual(['ivy', 'rowan']);
      for (const x of m) {
        expect(x.thought).toMatch(/[a-z]/i);
        expect(req.allowed).toContain(x.plan.kind);
        if (['talk', 'confront'].includes(x.plan.kind)) expect(['fern', 'basil']).toContain(x.plan.target);
      }
    }
    const m = await brain.minds(mindsReq({ allowed: ['coffee'] }));
    expect(m.every((x) => x.plan.kind === 'coffee' && x.plan.target === 'kitchen')).toBe(true);
    const fire = await brain.minds(mindsReq({ facts: ['The Shop Floor is on fire.'], allowed: [...PLAN_KINDS] }));
    expect(fire.find((x) => x.who === 'ivy')!.plan.kind).toBe('fix');
  });

  it('interpret: keywords pick emoji, vibe, reaction and look', async () => {
    const rooms = WORLD.rooms.map((r, i) => ({ id: r.id as never, name: r.name, people: i === 0 ? ['Fern', 'Basil'] : [] }));
    const horse = await brain.interpret({ id: 'i', text: 'a horse walks into the greenhouse', rooms });
    expect(horse).toMatchObject({ title: 'Horse in the Greenhouse', emoji: '🐴', room: 'greenhouse', vibe: 'funny', moves: true, source: 'instinct' });
    expect(horse.fact).toBe('A horse walks into the greenhouse.');
    const kitchen = await brain.interpret({ id: 'i', text: 'a terrible smell in the break room', rooms });
    expect(kitchen.room).toBe('kitchen');
    expect(kitchen.look).toBe('stink');
    const swarm = await brain.interpret({ id: 'i', text: 'a giant swarm of spiders everywhere', rooms });
    expect(swarm.room).toBe('everywhere');
    expect(swarm.intensity).toBe(3);
    expect(swarm.vibe).toBe('scary');
    const odd = await brain.interpret({ id: 'i', text: 'the concept of Tuesday arrives', rooms });
    expect(odd.vibe).toBe('weird');
    expect(odd.room).toBe('shop'); // busiest room
    for (const r of [horse, kitchen, swarm, odd]) {
      expect(CUSTOM_VIBES).toContain(r.vibe);
      expect(CUSTOM_REACTIONS).toContain(r.reaction);
      expect(CUSTOM_LOOKS).toContain(r.look);
      expect(r.title.length).toBeLessThanOrEqual(40);
    }
  });

  it('report: a plain write-up from the log and stats', async () => {
    const r = await brain.report({
      id: 'r', day: 3, log: ['Fern shouted at Basil about the mug.', 'Fire broke out in the Staff Kitchen.', 'Ivy put the fire out.'],
      stats: { incidents: 2, stockStart: 120, stockEnd: 90, morale: 0.35, chaosPeak: 0.9 },
      people: [{ id: 'fern', name: 'Fern Holloway', mood: 'angry' }, { id: 'ivy', name: 'Ivy Marsh', mood: 'neutral' }, { id: 'rowan', name: 'Rowan Pike', mood: 'scared' }]
    });
    expect(r.headline).toContain('2 Incidents');
    expect(r.paragraphs[0]).toContain('Day 3 saw 2 incidents');
    expect(r.paragraphs[1]).toContain('from 120 to 90, down 30');
    expect(r.paragraphs[1]).toContain('35 out of 100, which is low');
    expect(r.awards.length).toBeGreaterThan(0);
    expect(new Set(r.awards.map((a) => a.who)).size).toBe(r.awards.length);
    expect(r.takeaways.map((t) => t.who)).toEqual(['fern', 'ivy', 'rowan']);
    expect(r.takeaways[1].text).toContain('Ivy put the fire out');
    for (const t of r.takeaways) expect(t.text.length).toBeGreaterThan(0);
  });
});

describe('Reflexes', () => {
  it('barks for every kind and chaos event, never the same line twice in a row, for anyone', () => {
    const r = createReflexes(BANK, WORLD);
    for (const who of ['fern', 'rowan', 'stranger']) {
      for (const kind of BARK_KINDS) {
        let last = '';
        for (let i = 0; i < 8; i++) {
          const line = r.bark(who, kind);
          expect(line.length).toBeGreaterThan(0);
          expect(line).not.toBe(last);
          last = line;
        }
      }
      for (const c of CHAOS_IDS) expect(r.chaosBark(who, c).length).toBeGreaterThan(0);
    }
  });

  it('shuffle-bags: every line comes up before any repeats', () => {
    const r = createReflexes(BANK, WORLD);
    const got = [r.bark('fern', 'scared'), r.bark('fern', 'scared'), r.bark('fern', 'scared')];
    expect(new Set(got).size).toBe(3);
  });

  it('copes with a broken or empty bank', () => {
    const r = createReflexes({ fern: { barks: {} as never } }, WORLD);
    expect(r.bark('fern', 'angry').length).toBeGreaterThan(0);
    expect(createReflexes({}).chaosBark('x', 'fire').length).toBeGreaterThan(0);
  });
});
