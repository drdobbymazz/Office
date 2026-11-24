// Words that look like orders and are not: "the break room" is not "break", and "quit hiding" is
// not "quit". A natural whisper must never smash a room or make someone walk out for good.
import { describe, expect, it } from 'vitest';
import { InstinctBrain, meansQuitting, withoutBreakNouns, type LooseBank } from '@/game/brain/instinct';
import { CAST_LIST } from '@/game/core/cast';
import { BANK, WORLD } from '@/game/core/content';
import { TARGET_ROOMS } from '@/game/core/types';
import { room as roomDef } from '@/game/core/world';

const brain = new InstinctBrain(BANK as LooseBank, WORLD);
const people = CAST_LIST.map((c) => ({ id: c.id, name: c.name, room: 'bullpen' as const }));
const rooms = TARGET_ROOMS.map((id) => ({ id: id as string, name: roomDef(id).name }));
const verb = (who: string, kind: 'whisper' | 'cue', text: string): string =>
  brain.interpretDirectiveNow({ id: 'x', actor: people.find((p) => p.id === who)!, kind, text, people, rooms }).verb;

describe('typed orders: nouns and idioms are not orders', () => {
  it('a whisper that mentions the break room does not smash it', () => {
    expect(verb('michael', 'whisper', 'The inspector must find me waiting in my office. My farewell speech in the break room can wait until he has gone.')).not.toBe('sabotage');
    expect(verb('kevin', 'whisper', 'I need a coffee break.')).toBe('social');
    expect(verb('pam', 'cue', 'take a break in the break room')).not.toBe('sabotage');
    expect(withoutBreakNouns('wait in the break room')).not.toMatch(/\bbreak\b/i);
  });

  it('breaking a thing is still sabotage', () => {
    expect(verb('dwight', 'cue', 'break the fax machine')).toBe('sabotage');
    expect(verb('dwight', 'cue', 'smash the printer in the break room')).toBe('sabotage');
  });

  it('"quit doing something" means stop, not resign', () => {
    for (const t of ["I'm done hiding in my office.", 'I should quit warning Angela about Oscar.', 'quit it', 'quit talking and get back to work', "I'm done with the accounts."]) {
      expect(meansQuitting(t), t).toBe(false);
      expect(verb('dwight', 'whisper', t), t).not.toBe('walk_out');
    }
  });

  it('really quitting still walks out', () => {
    for (const t of ['quit your job', 'quit', 'resign at once', 'walk out', "I'm done. I quit.", "I'm done with this place.", 'pack up your things and go']) {
      expect(meansQuitting(t), t).toBe(true);
      expect(verb('stanley', 'cue', t), t).toBe('walk_out');
    }
  });
});

// ── Story mode: the model may not escalate mild words ────────────────────────
import type { ChatResponse, ChatTransport, DirectiveRequest } from '@/game/brain/api';
import { createBrain } from '@/game/brain/index';
import { BANK as TEST_BANK, WORLD as TEST_WORLD, settings } from './fixtures';

describe('typed orders in story mode: a careful reading', () => {
  let reply = '{}';
  const transport: ChatTransport = {
    kind: 'ollama',
    autonomous: true,
    status: async () => ({ ok: true, models: [] }),
    chat: async (): Promise<ChatResponse> => ({ text: reply, stats: { ms: 10, tokPerSec: 100 } })
  };
  const b = createBrain(settings(), { bank: TEST_BANK, world: TEST_WORLD, transport });
  const ask = (text: string, careful: boolean): Promise<{ verb: string }> => b.interpretDirective!({
    id: 'd', kind: 'whisper', text, careful,
    actor: { id: 'fern', name: 'Fern Holloway', room: 'bullpen' as never },
    people: [{ id: 'fern', name: 'Fern Holloway', room: 'bullpen' as never }, { id: 'basil', name: 'Basil Okafor', room: 'bullpen' as never }],
    rooms: [{ id: 'shop', name: 'the Shop Floor' }]
  } as DirectiveRequest);
  const says = (verb: string): string => JSON.stringify({ verb, targetPerson: 'none', targetRoom: 'none', power: 'none', item: '', summary: 'x', delegatedAction: '' });

  it('a mild whisper stays mild whatever the model makes of it', async () => {
    for (const grave of ['walk_out', 'eliminate', 'knockout', 'sabotage', 'lock_in', 'drag']) {
      reply = says(grave);
      const r = await ask('I should wait at my desk until the visitor has gone.', true);
      expect(r.verb, grave).not.toBe(grave);
    }
  });

  it('a deliberate order still works in story mode', async () => {
    reply = says('walk_out');
    expect((await ask('quit your job', true)).verb).toBe('walk_out');
    reply = says('knockout');
    expect((await ask('punch Basil', true)).verb).toBe('knockout');
  });

  it('in story mode the plain words and the model must agree before anyone is hurt', async () => {
    // The words say "punch", the model reads it as talk: in story mode nobody is hit.
    reply = says('social');
    expect((await ask('punch Basil', true)).verb).toBe('social');
    // In the sandbox a timid model does not soften a plain order.
    expect((await ask('punch Basil', false)).verb).toBe('knockout');
  });

  it('outside story mode the model may read between the lines', async () => {
    reply = says('walk_out');
    expect((await ask('I have had enough of all of you, goodbye forever.', false)).verb).toBe('walk_out');
  });
});
