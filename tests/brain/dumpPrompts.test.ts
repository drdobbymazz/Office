// Writes one full example of every request kind (system + user message) to a
// text file so a person can read the prompts as the model sees them.
// Runs only when asked:  DUMP_PROMPTS=/path/prompts.txt npx vitest run tests/brain/dumpPrompts.test.ts

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PromptBook } from '@/game/brain/prompts';
import { NameMap } from '@/game/brain/names';
import { WorldIndex } from '@/game/brain/world';
import type { BrainWorld } from '@/game/brain/world';
import { interpretSchema, mindsSchema, reportSchema, sceneSchema } from '@/game/brain/schema';
import { WORLD, mindsReq, person, sceneReq } from './fixtures';

const out = process.env.DUMP_PROMPTS;

describe.skipIf(!out)('prompt dump', () => {
  it('writes the example prompts', () => {
    const book = new PromptBook(new WorldIndex(WORLD));
    const tok = (s: string): number => Math.round(s.length / 4);
    const parts: string[] = [];
    const section = (title: string, system: string, user: string, schema: unknown): void => {
      parts.push(
        `${'='.repeat(78)}\n${title}\n` +
          `system ${system.length} chars (~${tok(system)} tokens), user ${user.length} chars (~${tok(user)} tokens), ` +
          `schema ${JSON.stringify(schema).length} chars\n${'='.repeat(78)}\n` +
          `----- SYSTEM -----\n${system}\n\n----- USER -----\n${user}\n`
      );
    };

    const scene = sceneReq({
      trigger: 'event',
      why: 'Fire breaks out in the Staff Kitchen.',
      people: [
        person('fern', {
          mood: 'scared', state: ['holding a fire extinguisher upside down'], goal: 'get everyone out without anyone noticing she is panicking',
          feelings: [{ about: 'basil', text: 'annoying, always singing' }, { about: 'ivy', text: 'relies on her completely' }],
          memories: ['Basil set off the smoke alarm last week with toast.']
        }),
        person('basil', { mood: 'excited', feelings: [{ about: 'fern', text: 'his favourite boss, secretly likes her' }], mindOf: 'rowan' }),
        person('ivy', { mood: 'neutral', goal: 'put the fire out', secret: 'she was once a stunt driver' })
      ],
      onlookers: ['Rowan'],
      facts: ['The Staff Kitchen is on fire.', 'Basil and Rowan have swapped minds.'],
      recent: [{ who: 'Basil', say: 'Morning, petals! Who wants toast?' }, { who: 'Fern', say: 'Nobody touch the toaster.' }],
      minLines: 3,
      maxLines: 4,
      chaos: 0.7
    });
    const names = new NameMap(scene.people.map((p) => ({ id: p.id, name: p.name })));
    section('SCENE', book.system('scene'), book.sceneUser(scene, names),
      sceneSchema({ speakers: names.names, people: [...names.names, 'Rowan'], rooms: WORLD.rooms.map((r) => r.id), minLines: 3, maxLines: 4 }));

    const minds = mindsReq();
    const mn = new NameMap(minds.people.map((p) => ({ id: p.id, name: p.name })));
    const on = new NameMap(minds.others.map((p) => ({ id: p.id, name: p.name })));
    section('MINDS', book.system('minds'), book.mindsUser(minds, mn, on),
      mindsSchema({ people: mn.names, others: on.names, rooms: WORLD.rooms.map((r) => r.id), allowed: minds.allowed }));

    const interpret = {
      id: 'i', text: 'a horse walks into the garden centre',
      rooms: WORLD.rooms.map((r, i) => ({ id: r.id as never, name: r.name, people: i === 0 ? ['Fern', 'Basil'] : i === 3 ? ['Ivy'] : [] }))
    };
    section('INTERPRET', book.system('interpret'), book.interpretUser(interpret), interpretSchema(WORLD.rooms.map((r) => r.id)));

    const report = {
      id: 'r', day: 2,
      log: ['09:10 Fern told Basil to stop singing.', '10:42 Fire broke out in the Staff Kitchen.', '10:44 Ivy put the fire out with a watering can.',
        '11:30 A horse walked into the Shop Floor.', '14:05 Rowan apologised to the horse.', '16:50 Basil and Fern made up over a cactus.'],
      stats: { incidents: 2, stockStart: 400, stockEnd: 362, morale: 0.58, chaosPeak: 0.81 },
      people: WORLD.people.map((p, i) => ({ id: p.id, name: p.name, mood: (['tired', 'happy', 'smug', 'nervous'] as const)[i] }))
    };
    const rn = new NameMap(report.people.map((p) => ({ id: p.id, name: p.name })));
    section('REPORT', book.system('report'), book.reportUser(report, rn), reportSchema(rn.names));

    // How big the system message gets with a full cast of 16 people at the word limit.
    const big: BrainWorld = {
      ...WORLD,
      people: Array.from({ length: 16 }, (_, i) => ({
        ...WORLD.people[i % 4],
        id: `p${i}`,
        name: `Person${i} Surname`,
        summary: 'A long-winded summary of this person that keeps going on about who they are, what they do and why. It has a second sentence too.',
        speech: 'Talks in a very particular way that takes a lot of words to describe properly, with catchphrases. And more.'
      })),
      rooms: [...WORLD.rooms, ...Array.from({ length: 8 }, (_, i) => ({ id: `room${i}`, name: `the Room Number ${i}` }))]
    };
    const bigBook = new PromptBook(new WorldIndex(big));
    parts.unshift(
      `Sizes (characters / 4 = rough tokens)\n` +
        `- shared system prefix, this 4-person world: ${book.sharedPrefix.length} chars (~${tok(book.sharedPrefix)} tokens)\n` +
        `- scene system, 16 people at the 45-word cap and 12 rooms: ${bigBook.system('scene').length} chars (~${tok(bigBook.system('scene'))} tokens)\n`
    );
    writeFileSync(out!, parts.join('\n'));
    expect(parts.length).toBe(5);
  });
});
