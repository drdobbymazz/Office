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
