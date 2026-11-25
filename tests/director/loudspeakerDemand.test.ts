// Loudspeaker demands and other delegated acts: only people who spoke in the scene, and did not refuse
// in their own words, are staged doing what was asked. Also: a reaction scene the player caused is not
// dropped just because another one is still playing.

import { describe, expect, it } from 'vitest';
import type { ChatRequest, ChatResponse, ChatTransport, SceneRequest } from '@/game/brain/api';
import { createBrain, LlmBrain } from '@/game/brain/index';
import { InstinctBrain, type LooseBank } from '@/game/brain/instinct';
import type { BrainWorld } from '@/game/brain/world';
import { CAST_LIST, SETTING } from '@/game/core/cast';
import { BANK as GAME_BANK } from '@/game/core/content';
import type { CharId, RoomId } from '@/game/core/types';
import { roomsFor, walkableTilesIn } from '@/game/core/world';
import { Director } from '@/game/director/director';
import { CHAOS_SCRIPTS } from '@/game/sim/chaos';
import { createRng } from '@/game/sim/rng';
import { makeSim, runUntil } from '../sim/helpers';
import { settings } from '../brain/fixtures';

const OFFICE_WORLD: BrainWorld = {
  setting: SETTING,
  people: CAST_LIST.map((c) => ({
    id: c.id, name: c.name, role: c.role, summary: c.persona.summary, speech: c.persona.speech,
    wants: c.persona.wants, fears: c.persona.fears, quirk: c.persona.quirk, secret: c.persona.secret,
    examples: [...c.persona.examples], nerve: c.temperament.nerve, fixes: [...c.fixes]
  })),
  rooms: roomsFor('office').filter((r) => r.id !== 'outside').map((r) => ({ id: r.id, name: r.name }))
};

/** The model's reply to "Everyone, punch the person next to you!" in the live test (p1b), byte for byte. */
const PUNCH_REPLY =
  '{"lines":[{"who":"Jim","say":"Well... I don\'t know who that was but they sound like a terrible boss. And also me on Fridays.", "feel":"amused","to":"Pam","act":"laugh"},' +
  '{"who":"Pam","say":"Oh my God, what? No way am I punching anyone this early in the morning.", "feel":"surprised","to":"all","act":"shake_head"},' +
  '{"who":"Dwight","say":"That is an unauthorized order. As Assistant Regional Manager, only I can delegate physical directives on this floor. And you\'re not even a person — that was a speaker.", "feel":"determined","to":"all","act":"point"},' +
  '{"who":"Stanley","say":"I\'m sitting right here and nothing is happening to me or anybody else.", "feel":"bored","to":"none","act":"shrug"}],' +
  '"summary":"The office heard an anonymous voice over the loudspeaker order everyone to punch the person next to them; Jim joked about it, Pam refused in horror, Dwight declared it unauthorized, and Stanley barely",' +
  '"shifts":[],"plans":[],"stageAction":{"kind":"none","actor":"Dwight","target":"Jim","detail":"Stanley sits nearest to him but he doesn\'t move"},"rumor":"","complies":false,"compliers":["Meredith","Creed"]}';

type Kind = 'scene' | 'directive' | 'other';
interface Call { kind: Kind; user: string; speakers: string[]; compliers?: string[] }

/**
 * The office at 9:15 with a model brain whose replies come from `reply` (a scene's speakers are the
 * first names the reply format allows). Anything `reply` leaves alone gets a dull two-line chat, and
 * other requests an empty object (the brain then falls back to its written rules).
 */
function modelOffice(seed: number, reply: (call: Call) => string | null) {
  const { sim, bus } = makeSim({ dayMinutes: 10, seed, sandbox: false });
  for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
  const calls: Call[] = [];
  const transport: ChatTransport = {
    kind: 'ollama',
    autonomous: true,
    status: async () => ({ ok: true, models: ['artemis-custom'] }),
    chat: async (req: ChatRequest): Promise<ChatResponse> => {
      const props = (req.schema as { properties?: Record<string, { items?: { properties?: { who?: { enum?: string[] } }; enum?: string[] } }> }).properties ?? {};
      const kind: Kind = props.lines ? 'scene' : props.verb ? 'directive' : 'other';
      const speakers = props.lines?.items?.properties?.who?.enum ?? [];
      const call: Call = { kind, user: req.messages[1]?.content ?? '', speakers, ...(props.compliers ? { compliers: props.compliers.items?.enum ?? [] } : {}) };
      calls.push(call);
      const text = reply(call) ?? (kind === 'scene'
        ? JSON.stringify({
            lines: speakers.slice(0, 2).map((who, i) => ({ who, say: i ? 'Back to work.' : 'Well, that happened.', feel: 'neutral', to: 'none', act: 'none' })),
            summary: 'They talked.', shifts: [], plans: []
          })
        : '{}');
      return { text, stats: { ms: 10, tokPerSec: 8 } };
    }
  };
  const brain = createBrain(settings(), { bank: GAME_BANK, world: OFFICE_WORLD, transport, rng: createRng(seed) }) as LlmBrain;
  const director = new Director({ sim, brain, instinct: brain.instinct, speed: () => 8 });
  const feed: string[] = [];
  bus.on('feed', (f) => feed.push(f.text));
  runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);
  director.reset();
  const advance = async (seconds: number, stopWhen?: () => boolean): Promise<void> => {
    for (let i = 0; i < Math.ceil(seconds / 0.1); i++) {
      sim.update(0.1);
      director.update(0.1);
      for (let k = 0; k < 6; k++) await Promise.resolve();
      if (stopWhen?.()) break;
    }
  };
  const put = (who: CharId, room: RoomId, i: number): void => sim.teleport(who, walkableTilesIn(room)[i]);
  /** Jim, Pam, Dwight and Stanley alone in the bullpen (the busiest room); everyone else spread out, Meredith in the break room. */
  const stageBullpen = (): void => {
    put('jim', 'bullpen', 2); put('pam', 'bullpen', 4); put('dwight', 'bullpen', 6); put('stanley', 'bullpen', 8);
    put('michael', 'boss', 1);
    put('kevin', 'annex', 1); put('toby', 'annex', 3);
    put('angela', 'accounts', 1); put('oscar', 'accounts', 3);
    put('phyllis', 'kitchen', 1); put('ryan', 'kitchen', 3); put('meredith', 'kitchen', 5);
    put('andy', 'meeting', 1); put('kelly', 'meeting', 3); put('creed', 'meeting', 5);
  };
  const ordered = (name: string): Call[] => calls.filter((c) => c.kind === 'directive' && c.user.startsWith(`${name} (in`));
  return { sim, director, brain, calls, feed, advance, put, stageBullpen, ordered };
}

const sceneReply = (lines: [string, string][], extra: Record<string, unknown>): string => JSON.stringify({
  lines: lines.map(([who, say]) => ({ who, say, feel: 'neutral', to: 'all', act: 'none' })),
  summary: 'The office answered the loudspeaker.',
  shifts: [], plans: [], stageAction: { kind: 'none', actor: lines[0][0], target: 'none', detail: '' }, rumor: '',
  ...extra
});

describe('loudspeaker demands', () => {
  it('"Everyone, punch the person next to you!" with the live reply stages nobody, and remembers a whole sentence', async () => {
    const o = modelOffice(201, (c) => (c.kind === 'scene' && /GROUP REQUEST DECISION/.test(c.user) ? PUNCH_REPLY : null));
    o.stageBullpen();
    o.director.announce('Everyone, punch the person next to you!');
    // Creed wanders in to watch, silently (he was an onlooker in the live run).
    o.put('creed', 'bullpen', 10);
    await o.advance(60);

    const demand = o.calls.find((c) => /GROUP REQUEST DECISION/.test(c.user));
    expect(demand).toBeTruthy();
    // The model is asked to decide only for the four people it writes lines for.
    expect([...demand!.speakers].sort()).toEqual(['Dwight', 'Jim', 'Pam', 'Stanley']);
    expect([...(demand!.compliers ?? [])].sort()).toEqual(['Dwight', 'Jim', 'Pam', 'Stanley']);
    const decision = demand!.user.slice(demand!.user.indexOf('GROUP REQUEST DECISION'));
    expect(decision).not.toMatch(/Meredith|Creed|Michael|Angela/);

    // "complies": false with Meredith and Creed listed: nobody is ordered to do anything, nobody is hit.
    expect(o.calls.filter((c) => c.kind === 'directive')).toEqual([]);
    expect(o.sim.people().filter((p) => o.sim.hasStatus(p.id, 'knockedOut'))).toEqual([]);
    expect(o.feed.some((t) => /punches|knocked .* out/i.test(t))).toBe(false);

    // The summary was cut at the reply format's 200 characters ("...and Stanley barely"): it is stored
    // as a finished sentence, not a fragment.
    const memory = o.sim.briefFor('jim', []).memories.join(' | ');
    expect(memory).toContain('Jim joked about it, Pam refused in horror, Dwight declared it unauthorized');
    expect(memory).not.toContain('Stanley barely');
  });

  it('a speaker who agrees is staged; a speaker listed as agreeing who refused out loud is not', async () => {
    const o = modelOffice(202, (c) => {
      if (c.kind === 'scene' && /GROUP REQUEST DECISION/.test(c.user)) {
        return sceneReply(
          [
            ['Jim', 'Is this a team-building thing?'],
            ['Pam', 'No way am I punching anyone this early in the morning.'],
            ['Dwight', 'Fine. Consider it a security drill. Brace yourself, Jim.'],
            ['Stanley', 'Leave me out of it.']
          ],
          { complies: true, compliers: ['Pam', 'Dwight'] }
        );
      }
      if (c.kind === 'directive') {
        return JSON.stringify({ verb: 'knockout', targetPerson: 'Jim', targetRoom: 'none', power: 'none', item: '', summary: 'punches Jim', delegatedAction: '' });
      }
      return null;
    });
    o.stageBullpen();
    o.director.announce('Everyone, punch the person next to you!');
    const knockedOut = (): boolean => o.sim.people().some((p) => o.sim.hasStatus(p.id, 'knockedOut'));
    await o.advance(70, knockedOut);
    expect(o.ordered('Dwight')).toHaveLength(1);
    expect(o.ordered('Pam')).toHaveLength(0);
    // Who the punch lands on is the knockout staging's business; here it is that Dwight threw it.
    expect(knockedOut()).toBe(true);
    expect(o.feed.some((t) => /^Dwight punches/.test(t))).toBe(true);
  });

  it('a demand addressed by name ("Dwight, punch Jim!") puts Dwight in the scene and he decides', async () => {
    const o = modelOffice(203, (c) => {
      if (c.kind === 'scene' && /REQUEST DECISION/.test(c.user)) {
        const other = c.speakers.find((s) => s !== 'Dwight') ?? 'Jim';
        return sceneReply(
          [['Dwight', 'With pleasure. This is for the stapler, Jim.'], [other, 'Wait, what?']],
          { complies: true }
        );
      }
      if (c.kind === 'directive') {
        return JSON.stringify({ verb: 'knockout', targetPerson: 'Jim', targetRoom: 'none', power: 'none', item: '', summary: 'punches Jim', delegatedAction: '' });
      }
      return null;
    });
    o.stageBullpen();
    o.director.announce('Dwight, punch Jim!');
    const knockedOut = (): boolean => o.sim.people().some((p) => o.sim.hasStatus(p.id, 'knockedOut'));
    await o.advance(70, knockedOut);
    const demand = o.calls.find((c) => c.kind === 'scene' && /REQUEST DECISION/.test(c.user));
    expect(demand?.speakers).toContain('Dwight');
    expect(o.ordered('Dwight')).toHaveLength(1);
    expect(knockedOut()).toBe(true);
    expect(o.feed.some((t) => /^Dwight punches/.test(t))).toBe(true);
  });

  it('someone named as agreeing who never spoke in the scene is not staged', async () => {
    const o = modelOffice(204, (c) => {
      if (c.kind === 'scene' && /REQUEST DECISION/.test(c.user)) {
        // Only Pam gets a line; the reply still says Dwight agreed.
        return sceneReply([['Pam', 'Oh my God, Dwight, do not.']], { complies: true });
      }
      if (c.kind === 'directive') {
        return JSON.stringify({ verb: 'knockout', targetPerson: 'Jim', targetRoom: 'none', power: 'none', item: '', summary: 'punches Jim', delegatedAction: '' });
      }
      return null;
    });
    o.stageBullpen();
    o.director.announce('Dwight, punch Jim!');
    await o.advance(60);
    expect(o.calls.some((c) => c.kind === 'scene' && /REQUEST DECISION/.test(c.user))).toBe(true);
    expect(o.ordered('Dwight')).toHaveLength(0);
    expect(o.sim.people().filter((p) => o.sim.hasStatus(p.id, 'knockedOut'))).toEqual([]);
  });
});

describe('reaction scenes the player caused', () => {
  it('a second knockout a few seconds after the first still gets its scene while the first one plays for a minute', async () => {
    const seed = 205;
    const { sim } = makeSim({ dayMinutes: 10, seed, sandbox: false });
    for (const s of CHAOS_SCRIPTS) sim.registerChaos(s);
    const brain = new InstinctBrain(GAME_BANK as LooseBank, OFFICE_WORLD, createRng(seed));
    const director = new Director({ sim, brain, instinct: brain });
    runUntil(sim, () => sim.clock >= 9 * 60 + 15, 300);
    director.reset();
    sim.teleport('creed', walkableTilesIn('kitchen')[1]);
    sim.teleport('kevin', walkableTilesIn('kitchen')[3]);

    // The first reaction scene takes a minute to write, as a slow model does.
    const aftermaths: SceneRequest[] = [];
    let release: (() => void) | null = null;
    const orig = brain.scene.bind(brain);
    brain.scene = async (req, cb) => {
      if (req.trigger === 'aftermath') {
        aftermaths.push(req);
        if (aftermaths.length === 1) await new Promise<void>((r) => { release = r; });
      }
      return orig(req, cb);
    };
    const advance = async (seconds: number, stopWhen?: () => boolean): Promise<void> => {
      for (let i = 0; i < Math.ceil(seconds / 0.1); i++) {
        sim.update(0.1);
        director.update(0.1);
        await Promise.resolve();
        await Promise.resolve();
        if (stopWhen?.()) break;
      }
    };

    director.cue('dwight', 'punch jim');
    director.cue('creed', 'punch kevin');
    await advance(40, () => sim.hasStatus('jim', 'knockedOut') && sim.hasStatus('kevin', 'knockedOut') && aftermaths.length === 1);
    expect(sim.hasStatus('jim', 'knockedOut') && sim.hasStatus('kevin', 'knockedOut')).toBe(true);
    expect(aftermaths).toHaveLength(1);

    // Well past the 40 seconds a queued reaction used to be allowed to wait.
    await advance(60);
    expect(release).not.toBeNull();
    release!();
    await advance(60, () => aftermaths.length >= 2);
    expect(aftermaths).toHaveLength(2);
    const actors = aftermaths.map((a) => a.people[0]?.id);
    expect(actors.sort()).toEqual(['creed', 'dwight']);
  });
});
