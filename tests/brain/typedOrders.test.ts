// Typed whispers and orders as the game reads them with the model online: the written parser
// ("the words") and the model's JSON are merged, and the result says what happens and to whom.
// Every case here was seen in a live test. The model's replies are canned (they are the real
// model's answers where the live test recorded them), the cast is the real one.
//
// The rule the merge keeps: when the model reads the text correctly, the words must not overrule
// it or throw away the person it named. In story mode (careful) a grave act still needs grave words,
// so there the fix is always to teach the words, never to trust the model more.
import { describe, expect, it } from 'vitest';
import type { ChatResponse, ChatTransport, DirectiveRequest, DirectiveResult } from '@/game/brain/api';
import { createBrain } from '@/game/brain/index';
import {
  InstinctBrain, callName, isNegatedDirective, meansGoingHome, nameParts, passesOnOrder, withoutEncouragement,
  withoutQuotedSpeech, type LooseBank
} from '@/game/brain/instinct';
import { CAST_LIST } from '@/game/core/cast';
import { BANK } from '@/game/core/content';
import { TARGET_ROOMS } from '@/game/core/types';
import type { BrainWorld } from '@/game/brain/world';
import { room as roomDef } from '@/game/core/world';
import { WORLD as CAST_WORLD } from '../story/harness';
import { settings } from './fixtures';

type Person = { id: string; name: string; room: string };
const CAST: Person[] = CAST_LIST.map((c) => ({ id: c.id, name: c.name, room: 'bullpen' }));
const INSPECTOR: Person = { id: 'visitor:inspector', name: 'The Inspector', room: 'bullpen' };
const FIGGIS: Person = { id: 'visitor:figgis', name: 'Mr Figgis', room: 'bullpen' };
// As in the game, the brain's world lists the visitors after the staff.
const visitor = (p: Person) => ({ id: p.id, name: p.name, role: 'Visitor', summary: '', speech: '', wants: '', fears: '', quirk: '', secret: '', examples: [] });
const WORLD: BrainWorld = { ...CAST_WORLD, people: [...CAST_WORLD.people, visitor(INSPECTOR), visitor(FIGGIS)] };
const rooms = TARGET_ROOMS.map((id) => ({ id: id as string, name: roomDef(id).name }));

interface Opts {
  careful?: boolean;
  allowDelegate?: boolean;
  /** Cast members who are not in the office. */
  absent?: string[];
  visitors?: Person[];
  kind?: 'whisper' | 'cue';
}

function request(actor: string, text: string, o: Opts = {}): DirectiveRequest {
  const people = [...CAST.filter((p) => !(o.absent ?? []).includes(p.id)), ...(o.visitors ?? [])];
  return {
    id: 'typed',
    actor: people.find((p) => p.id === actor)!,
    kind: o.kind ?? 'cue',
    text,
    people,
    rooms,
    ...(o.allowDelegate === false ? { allowDelegate: false } : {}),
    ...(o.careful ? { careful: true } : {})
  } as DirectiveRequest;
}

// The words alone (the offline reading, and the base the model's reply is merged with).
const instinct = new InstinctBrain(BANK as LooseBank, WORLD);
const words = (actor: string, text: string, o: Opts = {}): DirectiveResult => instinct.interpretDirectiveNow(request(actor, text, o));

// The model online, answering with a canned reply.
let reply = '{}';
const transport: ChatTransport = {
  kind: 'ollama',
  autonomous: true,
  status: async () => ({ ok: true, models: [] }),
  chat: async (): Promise<ChatResponse> => ({ text: reply, stats: { ms: 10, tokPerSec: 100 } })
};
const brain = createBrain(settings(), { bank: BANK as LooseBank, world: WORLD, transport });

interface Says {
  verb: string;
  target?: string;
  room?: string;
  summary?: string;
  delegated?: string;
}
async function merged(actor: string, text: string, model: Says, o: Opts = {}): Promise<DirectiveResult> {
  reply = JSON.stringify({
    verb: model.verb,
    targetPerson: model.target ?? 'none',
    targetRoom: model.room ?? 'bullpen',
    power: 'none',
    item: '',
    summary: model.summary ?? '',
    delegatedAction: model.delegated ?? ''
  });
  const r = await brain.interpretDirective!(request(actor, text, o));
  expect(r.source, 'the model answered').toBe('model');
  return r;
}

describe('A. the model names who is meant when the words cannot', () => {
  it('a surname: "punch Halpert" punches Jim, in the sandbox and in story mode', async () => {
    for (const careful of [false, true]) {
      const r = await merged('dwight', 'punch Halpert', { verb: 'knockout', target: 'Jim', summary: 'punches Jim square in the face' }, { careful });
      expect(r.verb, `careful ${careful}`).toBe('knockout');
      expect(r.targetPerson, `careful ${careful}`).toBe('jim');
      expect(r.summary).toBe('punches Jim square in the face');
    }
  });

  it('no space, or another language: the sandbox follows the model', async () => {
    for (const text of ['punchjim', '짐을 때려']) {
      const r = await merged('dwight', text, { verb: 'knockout', target: 'Jim', summary: 'punches Jim in the face' });
      expect(r.verb, text).toBe('knockout');
      expect(r.targetPerson, text).toBe('jim');
    }
  });

  it('no space, in story mode: the words do not read an attack, so none happens (the careful rule)', async () => {
    const r = await merged('dwight', 'punchjim', { verb: 'knockout', target: 'Jim' }, { careful: true });
    expect(r.verb).toBe('social');
  });

  it('a typo: "slap Dwigt" slaps Dwight', async () => {
    const r = await merged('jim', 'slap Dwigt', { verb: 'knockout', target: 'Dwight', summary: 'slaps Dwight across the face' });
    expect(r).toMatchObject({ verb: 'knockout', targetPerson: 'dwight' });
  });

  it('a pronoun: "go to Michael\'s office and punch him" punches Michael, "kiss her" kisses Pam', async () => {
    const punch = await merged('dwight', "go to Michael's office and punch him", { verb: 'knockout', target: 'Michael', room: 'boss', summary: 'punches Michael in the face' });
    expect(punch).toMatchObject({ verb: 'knockout', targetPerson: 'michael' });
    const kiss = await merged('jim', 'kiss her', { verb: 'romance', target: 'Pam', summary: 'kisses Pam passionately in the middle of the bullpen' });
    expect(kiss).toMatchObject({ verb: 'romance', targetPerson: 'pam' });
  });

  it('a visitor must still be named in the text: the model alone cannot pick one', async () => {
    const r = await merged('dwight', 'punch him', { verb: 'knockout', target: 'Mr Figgis' }, { visitors: [FIGGIS] });
    expect(r.targetPerson).toBeNull();
    const named = await merged('dwight', 'punch Mr Figgis', { verb: 'knockout', target: 'Mr Figgis' }, { visitors: [FIGGIS] });
    expect(named.targetPerson).toBe('visitor:figgis');
  });

  it('a solo stunt never gains a partner the player did not name', async () => {
    expect((await merged('michael', 'dance on the desk', { verb: 'perform', target: 'Pam' })).targetPerson).toBeNull();
    expect((await merged('meredith', 'strip naked', { verb: 'expose', target: 'Creed' })).targetPerson).toBeNull();
    expect((await merged('stanley', 'take a nap', { verb: 'recover', target: 'Phyllis' })).targetPerson).toBeNull();
  });

  it('the model may still pick between people the text names', async () => {
    const r = await merged('pam', 'tell Kevin to slap Dwight', { verb: 'delegate', target: 'Kevin', delegated: 'slap Dwight', summary: 'tells Kevin to slap Dwight' });
    expect(r).toMatchObject({ verb: 'delegate', targetPerson: 'kevin', delegatedText: 'slap Dwight' });
  });

  it('a summary that names someone other than the person acted on is never kept', async () => {
    // The words name Pam; the model says Jim. Pam is the one punched, so the summary may not say Jim.
    const r = await merged('dwight', 'punch Pam', { verb: 'knockout', target: 'Jim', summary: 'punches Jim square in the face' });
    expect(r.targetPerson).toBe('pam');
    expect(r.summary).not.toMatch(/Jim/);
    expect(r.summary).toBe('punches Pam');
  });

  it('a summary of an act the merge overruled is never kept', async () => {
    // Story mode: "punch Jim" can never become an elimination, so "kills Jim" is not what happened.
    const r = await merged('dwight', 'punch Jim', { verb: 'eliminate', target: 'Jim', summary: 'kills Jim with a stapler' }, { careful: true });
    expect(r.verb).toBe('knockout');
    expect(r.summary).toBe('punches Jim');
  });

  it('someone named who is not here: nobody else is hit, it stays talk', async () => {
    const absent = { absent: ['toby'] };
    expect(words('dwight', 'punch Toby', absent).verb).toBe('social');
    // The live reply: the model knew Toby was not on the list and named nobody.
    expect((await merged('dwight', 'punch Toby', { verb: 'knockout', room: 'annex', summary: 'punches Toby in the face' }, absent)).verb).toBe('social');
    // Nor may the model put someone who is here in his place.
    expect((await merged('dwight', 'punch Toby', { verb: 'knockout', target: 'Jim' }, absent)).verb).toBe('social');
    expect((await merged('dwight', 'tell Toby to dance', { verb: 'delegate', target: 'Toby', delegated: 'dance' }, absent)).verb).toBe('social');
    // When Toby is here, it is Toby.
    expect(await merged('dwight', 'punch Toby', { verb: 'knockout', target: 'Toby' })).toMatchObject({ verb: 'knockout', targetPerson: 'toby' });
  });
});

describe('B. "the" and titles are never a name on their own', () => {
  it('name parts', () => {
    expect(callName('The Inspector')).toBe('Inspector');
    expect(callName('Mr Figgis')).toBe('Figgis');
    expect(callName('Jim Halpert')).toBe('Jim');
    expect(nameParts('The Inspector')).toEqual(['The Inspector', 'Inspector']);
    expect(nameParts('Mr Figgis')).toEqual(['Mr Figgis', 'Figgis']);
  });

  it('"punch the temp" with the Inspector on the floor: the words name nobody, the model\'s Ryan stands', async () => {
    const o = { visitors: [INSPECTOR] };
    expect(words('dwight', 'punch the temp', o).targetPerson).toBeNull();
    const r = await merged('dwight', 'punch the temp', { verb: 'knockout', target: 'Ryan', summary: 'punches Ryan square in the face' }, o);
    expect(r).toMatchObject({ verb: 'knockout', targetPerson: 'ryan' });
  });

  it('a visitor named properly is still found', () => {
    expect(words('dwight', 'punch the Inspector', { visitors: [INSPECTOR] }).targetPerson).toBe('visitor:inspector');
    expect(words('jim', 'bring Mr Figgis to the conference room', { visitors: [FIGGIS] })).toMatchObject({ verb: 'drag', targetPerson: 'visitor:figgis' });
    expect(words('jim', 'take Figgis to the conference room', { visitors: [FIGGIS] }).targetPerson).toBe('visitor:figgis');
  });
});

describe('C. what someone is told to say is talk', () => {
  it('the quote after a speaking verb is taken out before the act is read', () => {
    expect(withoutQuotedSpeech('say "I will kill you" to Dwight')).toBe('say to Dwight');
    expect(withoutQuotedSpeech('tell Kevin "Angela is going to kill you"')).toBe('tell Kevin');
    expect(withoutQuotedSpeech("say 'I'll kill you' to Dwight")).toBe('say to Dwight');
    expect(withoutQuotedSpeech('punch Jim and shout "take that"')).toBe('punch Jim and shout');
  });

  it('say "I will kill you" to Dwight: talk with Dwight, in the sandbox and in story mode', async () => {
    expect(words('jim', 'say "I will kill you" to Dwight')).toMatchObject({ verb: 'social', targetPerson: 'dwight' });
    for (const careful of [false, true]) {
      const r = await merged('jim', 'say "I will kill you" to Dwight', { verb: 'social', target: 'Dwight', summary: "says 'I will kill you' to Dwight with a completely straight face" }, { careful });
      expect(r.verb, `careful ${careful}`).toBe('social');
    }
  });

  it('tell Kevin "Angela is going to kill you": talk with Kevin, even when the model reads a hand-on order with nothing in it', async () => {
    expect(words('pam', 'tell Kevin "Angela is going to kill you"')).toMatchObject({ verb: 'social', targetPerson: 'kevin' });
    expect(words('pam', 'tell Kevin: "Angela is going to kill you"')).toMatchObject({ verb: 'social', targetPerson: 'kevin' });
    for (const careful of [false, true]) {
      const r = await merged('pam', 'tell Kevin "Angela is going to kill you"', { verb: 'delegate', target: 'Kevin', room: 'annex', summary: 'walks over to Kevin and tells him Angela is going to kill him' }, { careful });
      expect(r.verb, `careful ${careful}`).toBe('social');
    }
  });

  it('an act beside the speech is still the act, and a line passed on to say is said', () => {
    expect(words('dwight', 'punch Jim and shout "take that"')).toMatchObject({ verb: 'knockout', targetPerson: 'jim' });
    // The second person in a chain receives the line to say, with passing on switched off.
    expect(words('jim', 'say "I will kill you"', { allowDelegate: false }).verb).toBe('social');
  });
});

describe('D. which clause a "don\'t" governs', () => {
  it('encouragement in front of an order is not a "don\'t"', () => {
    expect(withoutEncouragement("Don't be shy, kiss Pam")).toBe('kiss Pam');
    expect(withoutEncouragement('stop being a coward and punch Jim')).toBe('punch Jim');
    expect(withoutEncouragement("don't hesitate to punch Jim")).toBe('punch Jim');
    expect(isNegatedDirective("Don't be shy, kiss Pam", 'Jim Halpert')).toBe(false);
    expect(isNegatedDirective('stop being a coward and punch Jim', 'Dwight Schrute')).toBe(false);
    expect(isNegatedDirective("don't be shy, but don't kiss Pam", 'Jim Halpert')).toBe(true);
  });

  it('"Don\'t be shy, kiss Pam" is the kiss', async () => {
    expect(words('jim', "Don't be shy, kiss Pam")).toMatchObject({ verb: 'romance', targetPerson: 'pam' });
    const r = await merged('jim', "Don't be shy, kiss Pam", { verb: 'romance', target: 'Pam', summary: 'kisses Pam on the lips in front of everyone' });
    expect(r).toMatchObject({ verb: 'romance', targetPerson: 'pam' });
  });

  it('"stop being a coward and punch Jim" is the punch, in story mode too', async () => {
    expect(words('dwight', 'stop being a coward and punch Jim')).toMatchObject({ verb: 'knockout', targetPerson: 'jim' });
    for (const careful of [false, true]) {
      const r = await merged('dwight', 'stop being a coward and punch Jim', { verb: 'knockout', target: 'Jim', summary: 'punches Jim square in the face' }, { careful });
      expect(r, `careful ${careful}`).toMatchObject({ verb: 'knockout', targetPerson: 'jim' });
    }
  });

  it('an order taken back at the end does nothing, whatever the model says', async () => {
    expect(words('dwight', "Punch Jim. Just kidding, don't.").verb).toBe('social');
    for (const verb of ['social', 'knockout']) {
      const r = await merged('dwight', "Punch Jim. Just kidding, don't.", { verb, target: 'Jim' });
      expect(r.verb, `model ${verb}`).toBe('social');
    }
    for (const t of ['kiss Pam. Never mind.', 'smash the printer, scratch that', "punch Jim. On second thought, don't.", 'punch Jim, just kidding', 'quit your job. Actually, don\'t.']) {
      expect(words('dwight', t).verb, t).toBe('social');
    }
  });

  it('a "don\'t" that is not taken back is not a take-back', () => {
    expect(words('dwight', "punch Jim, don't hold back")).toMatchObject({ verb: 'knockout', targetPerson: 'jim' });
    expect(words('jim', 'kiss Pam, never mind Dwight').verb).toBe('romance');
  });

  it('a real "don\'t" still forbids it, even when the model answers with the act', async () => {
    const cases: [string, string, Says][] = [
      ['dwight', "don't punch Jim", { verb: 'knockout', target: 'Jim' }],
      ['dwight', 'never hit anyone', { verb: 'knockout', target: 'Jim' }],
      ['jim', 'do not under any circumstances kiss Pam', { verb: 'romance', target: 'Pam' }]
    ];
    for (const [who, text, model] of cases) {
      expect(words(who, text).verb, text).toBe('social');
      expect((await merged(who, text, model)).verb, text).toBe('social');
    }
  });
});

describe('E. story mode: deliberate orders the words now read', () => {
  it('"knock Dwight out" is a knockout in story mode', async () => {
    expect(words('jim', 'knock Dwight out')).toMatchObject({ verb: 'knockout', targetPerson: 'dwight' });
    const r = await merged('jim', 'knock Dwight out', { verb: 'knockout', target: 'Dwight', summary: 'punches Dwight in the face, knocking him unconscious' }, { careful: true });
    expect(r).toMatchObject({ verb: 'knockout', targetPerson: 'dwight' });
  });

  it('"go home for the day" sends Stanley home in story mode', async () => {
    expect(words('stanley', 'go home for the day').verb).toBe('walk_out');
    const r = await merged('stanley', 'go home for the day', { verb: 'walk_out', summary: 'packs up his crossword and walks out the front door without a word' }, { careful: true });
    expect(r.verb).toBe('walk_out');
  });

  it('the other phrasings seen as talk are now read as the orders they are', () => {
    expect(words('dwight', 'beat Dwight to a pulp', {}).verb).toBe('social'); // Dwight cannot beat himself up
    expect(words('jim', 'beat Dwight to a pulp')).toMatchObject({ verb: 'knockout', targetPerson: 'dwight' });
    expect(words('jim', 'beat him up').verb).toBe('knockout');
    expect(words('jim', "knock Dwight's lights out")).toMatchObject({ verb: 'knockout', targetPerson: 'dwight' });
    for (const t of ['go home', 'leave the office', 'clock out early', 'head home early', 'leave work now']) {
      expect(words('stanley', t).verb, t).toBe('walk_out');
    }
  });

  it('idioms stay mild, in story mode too', async () => {
    const mild = ['social', 'go_to', 'recover'];
    const o = { visitors: [FIGGIS] };
    const idioms: [string, string][] = [
      ['stanley', 'go big or go home'],
      ['jim', 'knock it off'],
      ['jim', "knock on Michael's door"],
      ['andy', "knock Mr Figgis's socks off"],
      ['angela', 'beat the deadline'],
      ['michael', 'leave the report on my desk'],
      ['jim', 'knock it out of the park'],
      ['pam', 'leave the office supplies alone']
    ];
    for (const [who, text] of idioms) {
      expect(mild, `${text} (words)`).toContain(words(who, text).verb);
      expect(mild, `${text} (words, Mr Figgis here)`).toContain(words(who, text, o).verb);
      expect(meansGoingHome(text), text).toBe(false);
      for (const verb of ['knockout', 'walk_out', 'eliminate']) {
        const r = await merged(who, text, { verb }, { careful: true, ...o });
        expect(mild, `${text} with the model saying ${verb}`).toContain(r.verb);
      }
    }
  });
});

describe('F. with passing orders on switched off, "tell X to ..." is talk with X', () => {
  it('the words read a pass-on order', () => {
    expect(passesOnOrder('tell Kevin to slap Dwight')).toBe(true);
    expect(passesOnOrder('go over to Pam and ask her to dance')).toBe(true);
    expect(passesOnOrder('tell Kevin: slap Dwight')).toBe(true);
    expect(passesOnOrder('ask Pam out to dinner')).toBe(false);
    expect(passesOnOrder('slap Dwight')).toBe(false);
  });

  it('"tell Kevin to slap Dwight" never becomes a slap on Kevin, or by the speaker', async () => {
    const off = { allowDelegate: false };
    expect(words('jim', 'tell Kevin to slap Dwight', off)).toMatchObject({ verb: 'social', targetPerson: 'kevin' });
    for (const careful of [false, true]) {
      const live = await merged('jim', 'tell Kevin to slap Dwight', { verb: 'delegate', target: 'Kevin', delegated: 'slap Dwight', summary: 'tells Kevin to slap Dwight' }, { ...off, careful });
      expect(live.verb, `careful ${careful}`).toBe('social');
      const direct = await merged('jim', 'tell Kevin to slap Dwight', { verb: 'knockout', target: 'Dwight' }, { ...off, careful });
      expect(direct.verb, `careful ${careful}`).toBe('social');
    }
  });

  it('with passing on allowed it is still passed on', async () => {
    expect(words('jim', 'tell Kevin to slap Dwight')).toMatchObject({ verb: 'delegate', targetPerson: 'kevin', delegatedText: 'slap Dwight' });
    const r = await merged('jim', 'tell Kevin to slap Dwight', { verb: 'delegate', target: 'Kevin', delegated: 'slap Dwight' });
    expect(r).toMatchObject({ verb: 'delegate', targetPerson: 'kevin' });
  });
});

describe('"off" and "lock" next to a person', () => {
  it('"off" kills only as a verb with a person as its object', () => {
    for (const t of ['off Toby', 'off him', 'off the lot of them', "I'll off him"]) {
      expect(words('dwight', t).verb, t).toBe('eliminate');
    }
  });

  it('every other "off" is mild, or what it really means', () => {
    const cases: [string, string, string[]][] = [
      ['dwight', 'Challenge Jim to a dance-off.', ['social', 'perform']],
      ['jim', 'have a face-off with Dwight', ['social']],
      ['dwight', 'tell Jim off', ['social']],
      ['jim', 'show off to Pam', ['social', 'perform']],
      ['jim', 'see Pam off', ['social']],
      ['jim', 'piss Dwight off', ['social']],
      ['jim', 'wind Dwight up and set him off', ['social']],
      ['stanley', 'take the day off', ['social']],
      ['dwight', 'hands off Pam', ['social']],
      ['jim', 'back off, Dwight', ['social']],
      ['jim', 'kick off the meeting with Michael', ['social']],
      ['jim', 'get the tape off Dwight', ['steal']],
      ['dwight', 'Snatch the tape off Michael', ['steal']]
    ];
    for (const [who, text, ok] of cases) expect(ok, text).toContain(words(who, text).verb);
    expect(words('dwight', 'Snatch the tape off Michael')).toMatchObject({ targetPerson: 'michael', item: 'tape' });
  });

  it('a dance-off stays a dance-off in the sandbox, where the words used to force an elimination on a mild model', async () => {
    const r = await merged('dwight', 'Challenge Jim to a dance-off.', { verb: 'social', target: 'Jim' });
    expect(['social', 'perform']).toContain(r.verb);
    expect(r.targetPerson).toBe('jim');
  });

  it('lock_in needs a person shut in somewhere', () => {
    for (const t of ['pick the lock', 'Pick the lock and swap the tapes.', 'check the lock', 'look at the lock on the briefcase', 'lock the briefcase', 'lock the door', 'lock your screen', 'seal the envelope']) {
      expect(words('dwight', t).verb, t).not.toBe('lock_in');
    }
    expect(words('jim', 'lock Dwight in the annex')).toMatchObject({ verb: 'lock_in', targetPerson: 'dwight', targetRoom: 'annex' });
    expect(words('jim', 'lock him in').verb).toBe('lock_in');
    expect(words('dwight', 'lock Angela in the conference room')).toMatchObject({ verb: 'lock_in', targetPerson: 'angela', targetRoom: 'meeting' });
    expect(words('dwight', 'lock Jim and Pam in the annex')).toMatchObject({ verb: 'lock_in', targetPerson: 'jim' });
    expect(words('dwight', 'lock up Kevin').verb).toBe('lock_in');
    expect(words('dwight', 'barricade the door').verb).toBe('lock_in');
    expect(words('kelly', 'trap Ryan in the annex')).toMatchObject({ verb: 'lock_in', targetPerson: 'ryan' });
  });

  it('picking a lock in story mode never becomes a grave act', async () => {
    // The live reply: the model read a theft with nobody named. The words read no grave act, so nothing grave happens.
    const r = await merged('dwight', 'Pick the lock and swap the tapes.', { verb: 'steal', room: 'boss' }, { careful: true });
    expect(r.verb).toBe('social');
  });
});

describe('what already worked keeps working', () => {
  it('deliberate orders in story mode', async () => {
    const cases: [string, string, Says, string, string | null][] = [
      ['stanley', 'quit your job', { verb: 'walk_out' }, 'walk_out', null],
      ['dwight', 'drag Michael to the conference room', { verb: 'drag', target: 'Michael', room: 'meeting' }, 'drag', 'michael'],
      ['dwight', 'pull the fire alarm', { verb: 'trigger_power' }, 'trigger_power', null],
      ['dwight', 'smash the fax machine', { verb: 'sabotage' }, 'sabotage', null],
      ['dwight', 'punch Jim', { verb: 'knockout', target: 'Jim' }, 'knockout', 'jim']
    ];
    for (const [who, text, model, verb, target] of cases) {
      const r = await merged(who, text, model, { careful: true });
      expect(r.verb, text).toBe(verb);
      if (target) expect(r.targetPerson, text).toBe(target);
    }
  });

  it('innocent sentences the words call grave are saved by a mild model in story mode', async () => {
    const cases: [string, string, Says][] = [
      ['jim', 'shoot Pam a smile', { verb: 'romance', target: 'Pam' }],
      ['dwight', 'hit Michael with the bad news', { verb: 'social', target: 'Michael' }],
      ['jim', 'lock in the Figgis order', { verb: 'social' }]
    ];
    for (const [who, text, model] of cases) {
      const r = await merged(who, text, model, { careful: true });
      expect(['social', 'romance', 'go_to'], text).toContain(r.verb);
    }
  });

  it('a mild order stays mild in story mode', async () => {
    const r = await merged('dwight', 'follow Jim', { verb: 'knockout', target: 'Jim' }, { careful: true });
    expect(r.verb).toBe('follow');
    const p = await merged('dwight', 'punch Jim', { verb: 'eliminate', target: 'Jim' }, { careful: true });
    expect(p.verb).toBe('knockout');
  });
});
