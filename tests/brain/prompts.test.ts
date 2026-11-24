import { describe, expect, it } from 'vitest';
import { EMOTIONS, LINE_ACTS } from '@/game/core/types';
import { PERSONA_WORDS, PromptBook, personaEntry } from '@/game/brain/prompts';
import { interpretSchema, mindsSchema, reportSchema, sceneSchema } from '@/game/brain/schema';
import { NameMap } from '@/game/brain/names';
import { WorldIndex } from '@/game/brain/world';
import { createBrain, LlmBrain } from '@/game/brain/index';
import { BANK, WORLD, mindsReq, person, sceneReq, settings } from './fixtures';

type Obj = { properties: Record<string, Record<string, unknown>>; required: string[] };

describe('schemas', () => {
  it('limits scene enums to what is valid in this scene, lines first', () => {
    const s = sceneSchema({ speakers: ['Fern', 'Basil'], people: ['Fern', 'Basil', 'Ivy'], rooms: ['shop', 'yard'], minLines: 2, maxLines: 4 }) as unknown as Obj;
    expect(Object.keys(s.properties)).toEqual(['lines', 'summary', 'shifts', 'plans']);
    expect(s.required).toEqual(['lines', 'summary', 'shifts', 'plans']);
    const lines = s.properties.lines as { minItems: number; maxItems: number; items: Obj };
    expect(lines.minItems).toBe(2);
    expect(lines.maxItems).toBe(4);
    expect(Object.keys(lines.items.properties)).toEqual(['who', 'say', 'feel', 'to', 'act']);
    expect(lines.items.properties.who.enum).toEqual(['Fern', 'Basil']);
    expect(lines.items.properties.feel.enum).toEqual([...EMOTIONS]);
    expect(lines.items.properties.act.enum).toEqual([...LINE_ACTS]);
    expect(lines.items.properties.to.enum).toEqual(['Fern', 'Basil', 'all', 'none']);
    const plans = (s.properties.plans as { items: Obj }).items;
    expect(plans.properties.target.enum).toEqual(['Fern', 'Basil', 'Ivy', 'shop', 'yard', 'none']);
    const d = sceneSchema({ speakers: ['Fern', 'Basil'], people: ['Fern', 'Basil'], rooms: ['shop'], minLines: 2, maxLines: 4, hasDelegation: true }) as unknown as Obj;
    expect(Object.keys(d.properties)).toEqual(['lines', 'summary', 'shifts', 'plans', 'complies']);
    expect(d.properties.complies.type).toBe('boolean');
    const g = sceneSchema({ speakers: ['Fern', 'Basil', 'Ivy'], people: ['Fern', 'Basil', 'Ivy'], rooms: ['shop'], minLines: 2, maxLines: 4, hasDelegation: true, delegationTargets: ['Basil', 'Ivy'] }) as unknown as Obj;
    expect(Object.keys(g.properties)).toEqual(['lines', 'summary', 'shifts', 'plans', 'complies', 'compliers']);
    const compliers = g.properties.compliers as { items: { enum: string[] } };
    expect(compliers.items.enum).toEqual(['Basil', 'Ivy']);
  });

  it('builds minds, interpret and report schemas', () => {
    const m = mindsSchema({ people: ['Ivy', 'Rowan'], others: ['Fern'], rooms: ['shop'], allowed: ['work', 'talk'] }) as unknown as Obj;
    const minds = m.properties.minds as { minItems: number; maxItems: number; items: Obj };
    expect(minds.minItems).toBe(2);
    expect(minds.maxItems).toBe(2);
    expect(minds.items.properties.plan.enum).toEqual(['work', 'talk']);
    const i = interpretSchema(['shop', 'yard']) as unknown as Obj;
    expect(Object.keys(i.properties)).toEqual([
      'title', 'emoji', 'room', 'fact', 'vibe', 'intensity', 'reaction', 'look', 'moves',
      'kind', 'name', 'power', 'skin', 'hair', 'outfit', 'trim', 'style'
    ]);
    expect(i.properties.kind.enum).toEqual(['character', 'creature', 'thing', 'happening']);
    expect(i.properties.power.enum).toContain('none');
    expect(i.properties.room.enum).toEqual(['shop', 'yard', 'everywhere']);
    const r = reportSchema(['Fern']) as unknown as Obj;
    expect(Object.keys(r.properties)).toEqual(['headline', 'paragraphs', 'awards', 'takeaways']);
  });
});

describe('prompts', () => {
  const book = new PromptBook(new WorldIndex(WORLD));

  it('system messages are byte-identical across calls and across brains, and share one long prefix', () => {
    const again = new PromptBook(new WorldIndex(JSON.parse(JSON.stringify(WORLD))));
    for (const k of ['scene', 'minds', 'interpret', 'report'] as const) {
      expect(book.system(k)).toBe(book.system(k));
      expect(again.system(k)).toBe(book.system(k));
      expect(book.system(k).startsWith(book.sharedPrefix)).toBe(true);
      expect(book.system(k).trimEnd().endsWith('Never mention being an AI, a model, a game or a prompt.')).toBe(true);
    }
    const b1 = createBrain(settings(), { bank: BANK, world: WORLD }) as LlmBrain;
    const b2 = createBrain(settings({ temperature: 1.2 }), { bank: BANK, world: WORLD }) as LlmBrain;
    expect(b1.prompts.system('scene')).toBe(b2.prompts.system('scene'));
    expect(book.system('scene')).toContain('Uncensored dark adult workplace comedy');
    expect(book.system('directive')).toContain('seduce');
  });

  it('describes the world it is given, not a hard-coded one', () => {
    const sys = book.system('scene');
    expect(sys).toContain('Mossgrove Garden Centre');
    for (const p of WORLD.people) expect(sys).toContain(p.name.split(' ')[0]);
    for (const r of WORLD.rooms) expect(sys).toContain(`${r.id} (${r.name})`);
    expect(sys).not.toMatch(/Clipwell|paperclip/i);
  });

  it('keeps each persona entry compact', () => {
    const long = { ...WORLD.people[0], summary: 'A '.repeat(60) + 'very long summary. Second sentence here.', speech: 'Talks a lot. '.repeat(10) };
    for (const p of [...WORLD.people, long]) {
      const e = personaEntry(p);
      expect(e.split(/\s+/).length).toBeLessThanOrEqual(PERSONA_WORDS);
      expect(e.startsWith(p.name.split(' ')[0])).toBe(true);
    }
  });

  it('scene user message says everything the scene needs', () => {
    const req = sceneReq({
      trigger: 'whisper',
      why: 'The thought "Basil stole my mug" appears in Fern\'s head.',
      people: [
        person('fern', { mood: 'angry', state: ['soaking wet'], memories: ['Basil sang all morning.'], secret: 'she cannot keep a cactus alive', mindOf: 'basil' }),
        person('basil', { mood: 'happy' })
      ]
    });
    const names = new NameMap(req.people.map((p) => ({ id: p.id, name: p.name })));
    const u = book.sceneUser(req, names);
    expect(u).toContain('Day 2, 10:42, in the Staff Kitchen.');
    expect(u).toContain('Basil stole my mug');
    expect(u).toContain('MIND SWAP');
    expect(u).toContain("Write Fern's lines in Basil's voice");
    expect(u).toContain('Soaking wet.');
    expect(u).toContain('Secret');
    expect(u).toContain('Also here, not speaking: Ivy.');
    expect(u).toContain('Fern: Who took my mug?');
    expect(u).toContain('Write 2 to 4 lines, taking turns: Fern, Basil.');
  });

  it('minds, interpret and report user messages', () => {
    const req = mindsReq();
    const names = new NameMap(req.people.map((p) => ({ id: p.id, name: p.name })));
    const others = new NameMap(req.others.map((p) => ({ id: p.id, name: p.name })));
    const m = book.mindsUser(req, names, others);
    expect(m).toContain('Ivy, in the Yard, counting gnomes.');
    expect(m).toContain('Plans allowed now: work, talk, coffee, confront, hide, wander, snack.');
    const i = book.interpretUser({ id: 'i', text: 'a horse walks in', rooms: [{ id: 'shop' as never, name: 'the Shop Floor', people: ['Fern'] }] });
    expect(i).toContain('"a horse walks in"');
    expect(i).toContain('shop: the Shop Floor: Fern');
  });
});

describe('story mode in the prompts', () => {
  const book = new PromptBook(new WorldIndex(WORLD));

  it('the report task says to lead with the story, in fixed text (the cache keeps it)', () => {
    const sys = book.system('report');
    expect(sys).toContain("If the request starts with TODAY'S STORY, the headline and the first paragraph are about it");
    expect(new PromptBook(new WorldIndex(JSON.parse(JSON.stringify(WORLD)))).system('report')).toBe(sys);
  });

  it('the report request starts with the day\'s story, and its numbers are rounded', () => {
    const names = new NameMap([{ id: 'fern', name: 'Fern Holloway' }]);
    const u = book.reportUser({
      id: 'r', day: 1, log: ['Fern sold a cactus.'],
      stats: { incidents: 0, stockStart: 100.1, stockEnd: 101.77, morale: 57, chaosPeak: 10 },
      people: [{ id: 'fern', name: 'Fern Holloway', mood: 'happy' }],
      story: { title: 'Monday: The Memo', goal: 'All hands for the call', won: false, lines: ['At 15:00 the vice president phoned an almost empty room.'], changes: ['-8 Nobody was there for the call', '+2 Extra goal: Calm Monday'] }
    }, names);
    const lines = u.split('\n');
    expect(lines[0]).toBe("TODAY'S STORY: Monday: The Memo. The job: All hands for the call. It was not done.");
    expect(lines[1]).toBe('What happened: At 15:00 the vice president phoned an almost empty room.');
    expect(lines[2]).toContain('-8 Nobody was there for the call; +2 Extra goal: Calm Monday.');
    expect(u).toContain('Stock: 100.1 at the start, 101.8 at the end.');
    // Without a story it reads as before.
    const plain = book.reportUser({ id: 'r', day: 1, log: [], stats: { incidents: 0, stockStart: 1, stockEnd: 2, morale: 50, chaosPeak: 0 }, people: [] }, names);
    expect(plain.startsWith('Day 1 is over.')).toBe(true);
  });

  it('someone keeping a secret is told to act on their belief, never to say it', () => {
    const conviction = { text: 'if I stay in my office, nothing bad can happen', since: '08:50' };
    const names = new NameMap([{ id: 'fern', name: 'Fern Holloway' }, { id: 'basil', name: 'Basil Okafor' }]);
    const secret = book.sceneUser(sceneReq({ people: [person('fern', { conviction, hidden: 'Fern knows the shop may close.' }), person('basil')] }), names);
    expect(secret).toContain('Fern has been privately sure of this: "If I stay in my office, nothing bad can happen."');
    expect(secret).toContain('Fern keeps it private and never says it out loud or explains why.');
    expect(secret).not.toContain('brings it up whenever possible');
    expect(secret).toContain('Hidden from everyone, shows only as nerves unless they cannot lie: Fern knows the shop may close.');
    const open = book.sceneUser(sceneReq({ people: [person('fern', { conviction }), person('basil')] }), names);
    expect(open).toContain('Fern brings it up whenever possible');
  });

  it('a visitor known from the start still gets the note that carries their voice', () => {
    const world = { ...WORLD, people: [...WORLD.people, { id: 'visitor:inspector', name: 'The Inspector', role: 'Inspector', summary: 'From head office.', speech: 'Brisk.', wants: '', fears: '', quirk: '', secret: '', examples: [] }] };
    const b = new PromptBook(new WorldIndex(world));
    const insp = person('visitor:inspector', { name: 'The Inspector', about: 'From head office. Talks: Flat and formal. Says things like "Carry on."' });
    const names = new NameMap([{ id: 'visitor:inspector', name: 'The Inspector' }, { id: 'fern', name: 'Fern Holloway' }]);
    const u = b.sceneUser(sceneReq({ people: [insp, person('fern')] }), names);
    expect(u).toContain('(The Inspector, a visitor: From head office. Talks: Flat and formal. Says things like "Carry on.")');
  });

  it('sceneUser appends REQUEST DECISION when a delegation is present', () => {
    const names = new NameMap([{ id: 'fern', name: 'Fern Holloway' }, { id: 'basil', name: 'Basil Okafor' }]);
    const u = book.sceneUser(sceneReq({
      people: [person('fern'), person('basil')],
      delegation: { asker: 'fern', target: 'basil', action: 'sing a song', command: 'sing a song' }
    }), names);
    expect(u).toContain('REQUEST DECISION');
    expect(u).toContain('Fern is asking or ordering Basil to: "sing a song".');
    expect(u).toContain('"complies": true');

    const groupU = book.sceneUser(sceneReq({
      people: [person('fern'), person('basil'), person('ivy')],
      delegation: { asker: 'loudspeaker', target: 'basil', targets: ['basil', 'ivy'], action: 'dance on the desk', command: 'dance on the desk' }
    }), new NameMap([{ id: 'fern', name: 'Fern Holloway' }, { id: 'basil', name: 'Basil Okafor' }, { id: 'ivy', name: 'Ivy Marsh' }]));
    expect(groupU).toContain('GROUP REQUEST DECISION');
    expect(groupU).toContain('The voice over the office loudspeaker is asking or ordering Basil, Ivy');
    expect(groupU).toContain('"compliers"');

    const permU = book.sceneUser(sceneReq({
      people: [person('fern'), person('basil')],
      delegation: { asker: 'fern', target: 'basil', executor: 'asker', action: 'massage him', command: 'massage Basil' }
    }), names);
    expect(permU).toContain('REQUEST DECISION');
    expect(permU).toContain('Fern is asking Basil for permission to: "massage him".');
    expect(permU).toContain('would let Fern do this right now');

    const toneCases: Array<{ tone: 'order' | 'ask' | 'dare' | 'beg' | 'persuade'; lead: string; note: string }> = [
      { tone: 'order', lead: 'Fern is bluntly ordering Basil to: "sing a song".', note: 'Tone: blunt command.' },
      { tone: 'ask', lead: 'Fern is asking Basil to: "sing a song".', note: 'Tone: direct request (not a command).' },
      { tone: 'dare', lead: 'Fern is daring Basil to: "sing a song".', note: 'Tone: dare/challenge.' },
      { tone: 'beg', lead: 'Fern is desperately begging Basil to: "sing a song".', note: 'Tone: desperate pleading.' },
      { tone: 'persuade', lead: 'Fern is trying to persuade Basil to: "sing a song".', note: 'Tone: persuasion pitch.' }
    ];
    for (const tc of toneCases) {
      const tonedU = book.sceneUser(sceneReq({
        people: [person('fern'), person('basil')],
        delegation: { asker: 'fern', target: 'basil', tone: tc.tone, action: 'sing a song', command: 'sing a song' }
      }), names);
      expect(tonedU).toContain(tc.lead);
      expect(tonedU).toContain(tc.note);
    }

    const begPermU = book.sceneUser(sceneReq({
      people: [person('fern'), person('basil')],
      delegation: { asker: 'fern', target: 'basil', executor: 'asker', tone: 'beg', action: 'massage him', command: 'massage Basil' }
    }), names);
    expect(begPermU).toContain('Fern is desperately begging Basil for permission to: "massage him".');
    expect(begPermU).toContain('Tone: desperate pleading.');
  });
});
