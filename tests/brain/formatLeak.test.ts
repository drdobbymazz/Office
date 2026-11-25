// Bits of the reply format sometimes run on into a text field. Both cases here were seen live:
// a spoken line that carried the next keys of the reply, and an order's summary that stopped on a brace.
import { describe, expect, it } from 'vitest';
import type { ChatResponse, ChatTransport, DirectiveRequest } from '@/game/brain/api';
import { beforeFormatLeak, cleanSay } from '@/game/brain/clean';
import { createBrain } from '@/game/brain/index';
import type { LooseBank } from '@/game/brain/instinct';
import { CAST_LIST } from '@/game/core/cast';
import { BANK } from '@/game/core/content';
import { TARGET_ROOMS } from '@/game/core/types';
import { room as roomDef } from '@/game/core/world';
import { WORLD } from '../story/harness';
import { settings } from './fixtures';

describe('reply format leaking into text', () => {
  it('cuts a spoken line where the reply format starts', () => {
    const live =
      'I could sing about this! Mon statut est super génial, je vends du papier comme un champion. HACKED!」「feel":"excited","to":"all","act":"cheer"},{';
    expect(cleanSay(live, 45)).toBe('I could sing about this! Mon statut est super génial, je vends du papier comme un champion. HACKED!');
  });

  it('leaves ordinary quotes and commas in a line alone', () => {
    const say = 'He said "no", "never", and then he left.';
    expect(cleanSay(say, 45)).toBe(say);
    expect(beforeFormatLeak(say)).toEqual({ text: say, cut: false });
  });

  it('an order summary that stops on a brace goes back to its last finished clause', async () => {
    const people = CAST_LIST.map((c) => ({ id: c.id, name: c.name, room: 'bullpen' as const }));
    const transport: ChatTransport = {
      kind: 'ollama',
      autonomous: true,
      status: async () => ({ ok: true, models: [] }),
      chat: async (): Promise<ChatResponse> => ({
        text: JSON.stringify({
          verb: 'knockout', targetPerson: 'Jim', targetRoom: 'bullpen', power: 'none', item: '',
          summary: 'Kevin walks from the annex into the bullpen and punches Jim square in the jaw, sending him stumbling backward over his {',
          delegatedAction: ''
        }),
        stats: { ms: 10, tokPerSec: 100 }
      })
    };
    const brain = createBrain(settings(), { bank: BANK as LooseBank, world: WORLD, transport });
    const req = {
      id: 'leak', actor: people.find((p) => p.id === 'kevin')!, kind: 'cue', text: 'punch Jim', people,
      rooms: TARGET_ROOMS.map((id) => ({ id: id as string, name: roomDef(id).name }))
    } as DirectiveRequest;
    const res = await brain.interpretDirective!(req);
    expect(res.verb).toBe('knockout');
    expect(res.targetPerson).toBe('jim');
    expect(res.summary).toBe('Kevin walks from the annex into the bullpen and punches Jim square in the jaw');
  });
});
