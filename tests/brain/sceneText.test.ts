// What a scene stores and shows: lines of about 40 words or fewer that are never cut mid-sentence,
// summaries and rumours that are finished sentences, and a group decision that only counts people who
// spoke in the scene.

import { describe, expect, it } from 'vitest';
import type { ChatRequest, ChatResponse, ChatTransport, SceneRequest } from '@/game/brain/api';
import { cleanLine, cleanSentence, lineKey, LINE_WORDS, saysNo } from '@/game/brain/clean';
import { createBrain, LlmBrain } from '@/game/brain/index';
import { NameMap } from '@/game/brain/names';
import { SCENE_RUMOR_CHARS, SCENE_SUMMARY_CHARS, sceneSchema } from '@/game/brain/schema';
import type { BrainWorld } from '@/game/brain/world';
import { CAST_LIST, SETTING } from '@/game/core/cast';
import { BANK as GAME_BANK } from '@/game/core/content';
import { roomsFor } from '@/game/core/world';
import { sceneReq, settings } from './fixtures';

const OFFICE_WORLD: BrainWorld = {
  setting: SETTING,
  people: CAST_LIST.map((c) => ({
    id: c.id, name: c.name, role: c.role, summary: c.persona.summary, speech: c.persona.speech,
    wants: c.persona.wants, fears: c.persona.fears, quirk: c.persona.quirk, secret: c.persona.secret,
    examples: [...c.persona.examples], nerve: c.temperament.nerve, fixes: [...c.fixes]
  })),
  rooms: roomsFor('office').filter((r) => r.id !== 'outside').map((r) => ({ id: r.id, name: r.name }))
};

const words = (s: string): number => s.trim().split(/\s+/).length;

/** A model brain that answers every request with `reply`, keeping what it was sent. */
function cannedBrain(reply: () => string) {
  const sent: ChatRequest[] = [];
  const transport: ChatTransport = {
    kind: 'ollama',
    autonomous: true,
    status: async () => ({ ok: true, models: [] }),
    chat: async (req: ChatRequest): Promise<ChatResponse> => {
      sent.push(req);
      return { text: reply(), stats: { ms: 10, tokPerSec: 8 } };
    }
  };
  const brain = createBrain(settings(), { bank: GAME_BANK, world: OFFICE_WORLD, transport }) as LlmBrain;
  return { brain, sent };
}

const cast = (id: string) => ({ id, name: CAST_LIST.find((c) => c.id === id)!.name, mood: 'neutral' as const, state: [], goal: '', feelings: [], memories: [] });

/** The loudspeaker scene from the live test: four speakers, and the demand put (as it used to be) to the whole office. */
function punchScene(): SceneRequest {
  return sceneReq({
    place: 'the bullpen',
    trigger: 'announce',
    why: 'A voice nobody recognises just commanded over the office loudspeaker: "Everyone, punch the person next to you!".',
    people: ['jim', 'pam', 'dwight', 'stanley'].map(cast),
    onlookers: ['Phyllis', 'Andy', 'Kelly', 'Ryan', 'Creed'],
    recent: [],
    minLines: 3,
    maxLines: 4,
    unleashed: true,
    delegation: {
      asker: 'loudspeaker',
      target: 'jim',
      targets: ['jim', 'pam', 'dwight', 'stanley', 'michael', 'kevin', 'angela', 'oscar', 'phyllis', 'andy', 'kelly', 'ryan', 'toby', 'creed', 'meredith'],
      tone: 'order',
      action: 'punch the person next to you!',
      command: 'punch the person next to you!'
    }
  });
}

const PUNCH_REPLY =
  '{"lines":[{"who":"Jim","say":"Well... I don\'t know who that was but they sound like a terrible boss. And also me on Fridays.", "feel":"amused","to":"Pam","act":"laugh"},' +
  '{"who":"Pam","say":"Oh my God, what? No way am I punching anyone this early in the morning.", "feel":"surprised","to":"all","act":"shake_head"},' +
  '{"who":"Dwight","say":"That is an unauthorized order. As Assistant Regional Manager, only I can delegate physical directives on this floor. And you\'re not even a person — that was a speaker.", "feel":"determined","to":"all","act":"point"},' +
  '{"who":"Stanley","say":"I\'m sitting right here and nothing is happening to me or anybody else.", "feel":"bored","to":"none","act":"shrug"}],' +
  '"summary":"The office heard an anonymous voice over the loudspeaker order everyone to punch the person next to them; Jim joked about it, Pam refused in horror, Dwight declared it unauthorized, and Stanley barely",' +
  '"shifts":[],"plans":[],"stageAction":{"kind":"none","actor":"Dwight","target":"Jim","detail":"Stanley sits nearest to him but he doesn\'t move"},"rumor":"","complies":false,"compliers":["Meredith","Creed"]}';

describe('a group decision counts only the people who spoke', () => {
  it('the live punch reply: nobody agreed, and the cut summary is stored as a finished sentence', async () => {
    const { brain, sent } = cannedBrain(() => PUNCH_REPLY);
    const res = await brain.scene(punchScene());
    expect(res.source).toBe('model');
    expect(res.lines).toHaveLength(4);
    expect(res.complies).toBe(false);
    expect(res.compliers).toEqual([]);
    expect(res.summary).toBe(
      'The office heard an anonymous voice over the loudspeaker order everyone to punch the person next to them; Jim joked about it, Pam refused in horror, Dwight declared it unauthorized.'
    );

    // The request: the decision is put only to the four speakers, in the words and in the reply format.
    const req = sent[0];
    const user = req.messages[1].content;
    const decision = user.slice(user.indexOf('GROUP REQUEST DECISION'));
    expect(decision).toContain('Jim, Pam, Dwight, Stanley to: "punch the person next to you!"');
    expect(decision).not.toMatch(/Meredith|Creed|Michael|Toby/);
    expect(decision).not.toContain('for example');
    const compliers = (req.schema as { properties: { compliers: { items: { enum: string[] } } } }).properties.compliers;
    expect(compliers.items.enum).toEqual(['Jim', 'Pam', 'Dwight', 'Stanley']);
    // Four lines of about 40 words each, the group decision and the unleashed extras.
    expect(req.maxTokens).toBe(150 + 95 * 4 + 95);
    expect(user).toContain('Each line 40 words at most.');
  });

  it('a name for someone who did not speak is dropped, and "complies": false outweighs names', async () => {
    let reply = '';
    const { brain } = cannedBrain(() => reply);
    const lines = [
      { who: 'Jim', say: 'I mean, if everyone is doing it.', feel: 'amused', to: 'all', act: 'shrug' },
      { who: 'Dwight', say: 'Fine. Security drill. Brace yourself, Jim.', feel: 'determined', to: 'Jim', act: 'point' }
    ];
    reply = JSON.stringify({ lines, summary: 'Dwight agreed.', shifts: [], plans: [], complies: true, compliers: ['Dwight', 'Creed', 'Meredith'] });
    expect((await brain.scene(punchScene())).compliers).toEqual(['dwight']);

    reply = JSON.stringify({ lines, summary: 'Nobody agreed.', shifts: [], plans: [], complies: false, compliers: ['Dwight'] });
    const refused = await brain.scene(punchScene());
    expect(refused.complies).toBe(false);
    expect(refused.compliers).toEqual([]);

    // No list at all (a reply cut short): the written rules read only the people who spoke.
    reply = JSON.stringify({ lines, summary: 'They talked.', shifts: [], plans: [] });
    const unsure = await brain.scene(punchScene());
    for (const id of unsure.compliers ?? []) expect(['jim', 'dwight']).toContain(id);
  });

  it('reads a plain refusal in a line, without taking delight for one', () => {
    expect(saysNo('Oh my God, what? No way am I punching anyone this early in the morning.')).toBe(true);
    expect(saysNo('I will NOT be punching anybody! I am ASSISTANT Regional Manager.')).toBe(true);
    expect(saysNo('No.')).toBe(true);
    expect(saysNo('Absolutely not, Michael.')).toBe(true);
    expect(saysNo("I'm not doing that. Not today, not ever.")).toBe(true);
    expect(saysNo('Well... I don\'t know who that was but they sound like a terrible boss.')).toBe(false);
    expect(saysNo('No way! I love this song!')).toBe(false);
    expect(saysNo('No problem. Watch this.')).toBe(false);
    expect(saysNo('Fine. Security drill. Brace yourself, Jim.')).toBe(false);
  });
});

describe('spoken lines', () => {
  const speakers = new NameMap([{ id: 'dwight', name: 'Dwight Schrute' }, { id: 'jim', name: 'Jim Halpert' }]);
  const ctx = () => ({ speakers, maxLines: 4, seen: new Set([lineKey('earlier')]) });

  it('an over-long line is trimmed back to whole sentences within the line limit', () => {
    const kept =
      'False. That was not an authorized directive from management and therefore carries zero operational weight. Also, nobody is dancing on my watch. ' +
      'This could be a coordinated security breach designed to distract us while someone infiltrates the warehouse.';
    const say = `${kept} I have seen it before, in Scranton, in the spring of two thousand and four.`;
    const line = cleanLine({ who: 'Dwight', say, feel: 'determined', to: 'all', act: 'point' }, ctx());
    expect(line?.say).toBe(kept);
    expect(words(line!.say)).toBeLessThanOrEqual(LINE_WORDS);
  });

  it('a line of a few full sentences is left whole', () => {
    const say =
      'False. That was not an authorized directive from management and therefore carries zero operational weight. Also, nobody is dancing on my watch.';
    expect(cleanLine({ who: 'Dwight', say, feel: 'determined', to: 'all', act: 'point' }, ctx())?.say).toBe(say);
  });

  it('a line within the limit is left as it is', () => {
    const say = "Whoa okay that was... something. That's a pretty specific prank.";
    expect(cleanLine({ who: 'Jim', say, feel: 'amused', to: 'none', act: 'none' }, ctx())?.say).toBe(say);
  });

  it('the reply format puts no character cap on a spoken line', () => {
    const schema = sceneSchema({ speakers: ['Jim', 'Dwight'], people: ['Jim', 'Dwight'], rooms: ['bullpen'], minLines: 1, maxLines: 3 }) as {
      properties: { lines: { items: { properties: { say: Record<string, unknown> } } } };
    };
    expect(schema.properties.lines.items.properties.say).toEqual({ type: 'string' });
  });

  it('a long line with no cap in the way is still kept to whole sentences', async () => {
    const finished = 'I will NOT be punching anybody! I am ASSISTANT Regional Manager and I do not take orders from disembodied voices.';
    const long =
      `${finished} This is a security breach and everyone needs to lock their drawers immediately because the intruder could be anywhere in this building right now, ` +
      'hiding behind the copier or under a desk or inside the vending machine, waiting for exactly this kind of distraction to make a move.';
    const { brain } = cannedBrain(() => JSON.stringify({
      lines: [
        { who: 'Dwight', say: long, feel: 'determined', to: 'all', act: 'shout' },
        { who: 'Jim', say: 'Great.', feel: 'amused', to: 'none', act: 'none' }
      ],
      summary: 'Dwight refused.', shifts: [], plans: []
    }));
    const res = await brain.scene(sceneReq({ people: [cast('dwight'), cast('jim')], recent: [], minLines: 1, maxLines: 3 }));
    expect(res.lines.map((l) => l.say)).toEqual([finished, 'Great.']);
  });
});

describe('summaries and rumours', () => {
  it('a summary cut at the reply format\'s cap ends at its last finished clause, with a full stop', () => {
    const cut = (s: string): string => s.slice(0, SCENE_SUMMARY_CHARS);
    const security =
      'A mysterious voice over the loudspeaker ordered everyone to punch the person next to them; Jim found it funny, Pam was alarmed and warned Dwight not to do it, Dwight denounced the order as a security-risk';
    expect(cut(security).endsWith('as a security-')).toBe(true);
    expect(cleanSentence(cut(security), SCENE_SUMMARY_CHARS)).toBe(
      'A mysterious voice over the loudspeaker ordered everyone to punch the person next to them; Jim found it funny, Pam was alarmed and warned Dwight not to do it.'
    );
    const possible = cut(
      'Dwight heard the loudspeaker over the bullpen and immediately declared it an unauthorized directive. Jim and Pam laughed it off while Dwight logged an unauthorized directive and possible\'s security breach in his notebook'
    );
    expect(cleanSentence(possible, SCENE_SUMMARY_CHARS)).toBe('Dwight heard the loudspeaker over the bullpen and immediately declared it an unauthorized directive.');
  });

  it('a complete summary is kept, and given a full stop if it lacks one', () => {
    expect(cleanSentence('Meredith punched Stanley and Dwight took charge', SCENE_SUMMARY_CHARS)).toBe('Meredith punched Stanley and Dwight took charge.');
    expect(cleanSentence('Pam refused. Jim laughed!', SCENE_SUMMARY_CHARS)).toBe('Pam refused. Jim laughed!');
  });

  it('nothing finished left: empty, so the brain writes its own summary instead of storing a fragment', async () => {
    expect(cleanSentence('x'.repeat(SCENE_SUMMARY_CHARS), SCENE_SUMMARY_CHARS)).toBe('');
    const { brain } = cannedBrain(() => JSON.stringify({
      lines: [{ who: 'Jim', say: 'Nope.', feel: 'bored', to: 'none', act: 'none' }],
      summary: 'y'.repeat(SCENE_SUMMARY_CHARS), shifts: [], plans: [], stageAction: { kind: 'none', actor: 'Jim', target: 'none', detail: '' },
      rumor: 'Word is Meredith punched Kelly so hard that Kevin went down too, and nobody in the annex has stopped talking about it since lunch.'.slice(0, SCENE_RUMOR_CHARS)
    }));
    const res = await brain.scene(sceneReq({ people: [cast('jim')], recent: [], minLines: 1, maxLines: 1, unleashed: true }));
    expect(res.summary).not.toContain('yyy');
    expect(res.summary.length).toBeGreaterThan(5);
    expect(res.rumor).toBe('Word is Meredith punched Kelly so hard that Kevin went down too.');
  });
});
