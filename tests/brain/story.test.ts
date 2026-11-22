// Story mode in the brain: sorting sentences into story themes, the no-model story lines, people
// who keep a secret, visitors' voices, the story-aware report, and small wording fixes.
import { describe, expect, it } from 'vitest';
import { STORY_THEMES } from '@/game/brain/api';
import type { ReportRequest, StoryTheme } from '@/game/brain/api';
import { InstinctBrain, fill, type LooseBank } from '@/game/brain/instinct';
import { storyThemeOf } from '@/game/brain/instinctRules';
import { VOICES, VISITOR_VOICES } from '@/game/core/content';
import { CAST_IDS } from '@/game/core/types';
import { WORLD as GAME_WORLD } from '../story/harness';
import { person, sceneReq, seeded } from './fixtures';

const BANKED = VOICES as unknown as LooseBank;
const brain = (seed = 7): InstinctBrain => new InstinctBrain(BANKED, GAME_WORLD, seeded(seed));
const who = (id: string, over: Parameters<typeof person>[1] = {}) => person(id, { name: GAME_WORLD.people.find((p) => p.id === id)?.name ?? id, ...over });

describe('story themes', () => {
  const cases: [string, StoryTheme | null][] = [
    ['Michael has not come out of his office all morning, and nobody knows why.', 'hiding'],
    ['Michael has shut himself in his office and is not taking visitors.', 'hiding'],
    ["Michael's door has been closed since nine.", 'hiding'],
    ['Everyone now knows Corporate may close this branch on Friday.', 'closure'],
    ['The regional vice president is on the speakerphone, explaining that this branch is on the list.', 'closure'],
    ['Corporate may close the branch on Friday. Nobody knows what happens to them if it does.', 'closure'],
    ["Corporate wants the quarter's accounts by 17:00. Angela and Oscar are not speaking after a row about the figures.", 'feud'],
    ['Angela and Oscar have made up.', 'feud'],
    ["Mr Figgis of Figgis Hardware, the branch's biggest customer, is coming at 10:30.", 'client'],
    ['Mr Figgis is coming. Without his order, the branch has no chance.', 'client'],
    ["Someone in the office has been emailing Corporate behind everyone's back.", 'leak'],
    ['Kelly has just been caught emailing Corporate, and admits it.', 'leak'],
    ["Corporate's inspector arrives at 13:00 to decide whether this branch stays open.", 'inspection'],
    ['The inspector comes at one. This may be the last day.', 'inspection'],
    ['The inspector has been and gone. Corporate decides tonight.', 'waiting'],
    ['Michael is giving a tearful farewell speech in the break room.', 'verdict'],
    ['Corporate rang: the branch stays open.', 'verdict'],
    ['The break room is on fire.', null],
    ['A rumour is going round that someone is getting sacked today.', null],
    ['Mr Figgis, the branch\'s biggest customer, is waiting in reception.', 'client']
  ];
  for (const [text, theme] of cases) {
    it(`"${text.slice(0, 50)}..." is ${theme ?? 'no theme'}`, () => expect(storyThemeOf(text)).toBe(theme));
  }
});

describe('the story bank', () => {
  it('every person has at least three lines on every theme', () => {
    for (const id of CAST_IDS) {
      for (const t of STORY_THEMES) expect(VOICES[id].story?.[t]?.length ?? 0, `${id}.${t}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('a chat about the closure is told in the speakers\' own story lines', async () => {
    const b = brain(3);
    for (let run = 0; run < 12; run++) {
      const r = await b.scene(sceneReq({
        trigger: 'ambient', topic: 'closure', why: 'Michael and Stanley are talking about this: Corporate may close the branch on Friday.',
        people: [who('michael'), who('stanley')], recent: [], facts: [], minLines: 2, maxLines: 3
      }));
      const first = r.lines[0];
      expect(VOICES[first.who as 'michael'].story!.closure).toContain(first.say);
      // Everyone after the first either says their own piece on it or answers.
      for (const l of r.lines.slice(1)) {
        const v = VOICES[l.who as 'michael'];
        const answers = [...v.replies.warm, ...v.replies.cold, ...v.replies.neutral].map((x) => x.replace('{other}', ''));
        expect(v.story!.closure.includes(l.say) || answers.some((a) => l.say.includes(a.replace(/^[, ]+/, '').slice(0, 8)))).toBe(true);
      }
      expect(r.summary).toBe('Michael and Stanley talked about the branch closing in the Staff Kitchen.');
    }
  });

  it('a story beat the chapter asks for (the call) uses the story lines, not a stray opener', async () => {
    const r = await brain(5).scene(sceneReq({
      trigger: 'event', topic: 'closure',
      why: 'The regional vice president is on the speakerphone, explaining that this branch is on the list.',
      people: [who('michael'), who('jim'), who('pam')], recent: [], facts: [], minLines: 3, maxLines: 3
    }));
    expect(VOICES.michael.story!.closure).toContain(r.lines[0].say);
    expect(r.lines.every((l) => !/quick question|got a sec|can i ask you/i.test(l.say))).toBe(true);
  });

  it('without a theme the usual lines are used (the sandbox is unchanged)', async () => {
    const r = await brain(9).scene(sceneReq({ trigger: 'ambient', people: [who('jim'), who('pam')], recent: [], facts: [] }));
    const all = Object.values(VOICES.jim.story!).flat();
    expect(all).not.toContain(r.lines[0].say);
  });

  it('a thought can be about the story too', async () => {
    const b = brain(11);
    const thoughts = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const [m] = await b.minds({
        id: 'm', day: 2, clock: '10:00', people: [{ ...who('kevin'), place: 'the annex', doing: 'typing' }],
        facts: [], allowed: ['work'], others: [], chaos: 0, topic: 'feud'
      });
      thoughts.add(m.thought);
    }
    expect([...thoughts].some((t) => VOICES.kevin.story!.feud.includes(t))).toBe(true);
  });
});

describe('a secret stays a secret', () => {
  it('someone with a hidden note never opens with what they are sure of', async () => {
    const b = brain(13);
    const conviction = { text: 'If I stay in my office, nothing bad can happen this week.', since: '08:50' };
    for (let run = 0; run < 40; run++) {
      const r = await b.scene(sceneReq({
        trigger: 'ambient', why: 'Michael and Jim are talking.', recent: [], facts: [],
        people: [who('michael', { conviction, hidden: 'Michael knows the branch may close and is hiding it.' }), who('jim')]
      }));
      for (const l of r.lines) expect(l.say.toLowerCase()).not.toContain('nothing bad can happen');
    }
    // Without the secret the same person brings it up.
    let said = 0;
    for (let run = 0; run < 20; run++) {
      const r = await b.scene(sceneReq({ trigger: 'ambient', why: 'Michael and Jim are talking.', recent: [], facts: [], people: [who('michael', { conviction }), who('jim')] }));
      if (r.lines.some((l) => l.say.toLowerCase().includes('nothing bad can happen'))) said++;
    }
    expect(said).toBeGreaterThan(5);
  });
});

describe('visitors have voices', () => {
  it('Mr Figgis talks like himself about the deal, and the staff do not talk about him to his face', async () => {
    const b = brain(17);
    for (let run = 0; run < 10; run++) {
      const r = await b.scene(sceneReq({
        trigger: 'event', topic: 'client', why: 'Mr Figgis has sat down with Jim to decide whether Figgis Hardware signs for another year.',
        people: [person('visitor:figgis', { name: 'Mr Figgis' }), who('jim')], recent: [], facts: [], minLines: 3, maxLines: 4
      }));
      expect(VISITOR_VOICES['visitor:figgis'].bank.story!.client).toContain(r.lines[0].say);
      for (const l of r.lines.filter((x) => x.who === 'jim')) expect(VOICES.jim.story!.client).not.toContain(l.say);
      for (const l of r.lines) expect(l.say).not.toMatch(/^Mr[,!.]/);
    }
  });

  it('the inspector never says a line meant for someone under a spell', async () => {
    const b = brain(19);
    const r = await b.scene(sceneReq({
      trigger: 'event', why: "An inspector from Corporate is inspecting the office with a clipboard, and has reached Michael's office.",
      people: [person('visitor:inspector', { name: 'The Inspector' }), who('michael')], recent: [], facts: [], minLines: 2, maxLines: 2
    }));
    const insp = r.lines.find((l) => l.who === 'visitor:inspector')!;
    expect(VISITOR_VOICES['visitor:inspector'].bank.chaos!.inspector).toContain(insp.say);
    for (let i = 0; i < 6; i++) expect(['Why do I feel like this?', 'I am not myself today.']).not.toContain(b.bark('visitor:inspector', 'confused'));
  });
});

describe('the report leads with the day\'s story', () => {
  const base: ReportRequest = {
    id: 'r', day: 1,
    log: [
      'Monday, day 1. The staff are arriving for work.',
      'Over the loudspeaker: "Everyone to the conference room, now!"',
      'The phone rings in the conference room. Michael puts the vice president on speaker.',
      'Jim: "So the branch might close. I\'m going to need a minute. Maybe a week."',
      'Kevin: "Okay."',
      'Fire breaks out in the break room.',
      "It's five o'clock. Everyone heads home.",
      'Day 1 is over.'
    ],
    stats: { incidents: 1, stockStart: 100.1, stockEnd: 101.77, morale: 57, chaosPeak: 20 },
    people: CAST_IDS.map((id, i) => ({ id, name: GAME_WORLD.people.find((p) => p.id === id)!.name, mood: i === 3 ? 'angry' : i === 7 ? 'sad' : i === 9 ? 'proud' : 'neutral' })),
    story: {
      title: 'Monday: The Memo', goal: 'All hands for the call', won: true,
      lines: ['The call with Corporate went ahead, and the whole office heard it together.'],
      changes: ['+15 The call with Corporate went ahead', '+5 Extra goal: Quiet hands']
    }
  };

  it('without a model: headline from the outcome, the story first, rounded numbers, a few moods', async () => {
    const r = await brain().report(base);
    expect(r.headline).toBe('The Call with Corporate Went Ahead');
    // The story's beat from the log, then the result, then what somebody said about it.
    expect(r.paragraphs[0]).toMatch(/^The phone rings in the conference room\. Michael puts the vice president on speaker\. The call with Corporate went ahead, and the whole office heard it together\./);
    expect(r.paragraphs[0]).toContain('Jim said, "So the branch might close.');
    expect(r.paragraphs[1]).toContain('Fire breaks out in the break room.');
    expect(r.paragraphs[1]).toContain('from 100.1 to 101.8, up 1.7');
    expect(r.paragraphs.join(' ')).not.toMatch(/\d\.\d{2,}/);
    expect(r.paragraphs.join(' ')).not.toMatch(/arriving for work|five o'clock|is over\./);
    const moods = r.paragraphs[2];
    expect(moods).toBe('By home time, Dwight was angry, Stanley was sad and Andy was proud.');
    for (const t of r.takeaways) expect((t.text.match(/"/g) ?? []).length % 2).toBe(0);
  });

  it('a lost day says so', async () => {
    const r = await brain().report({ ...base, story: { ...base.story!, won: false, lines: ['At 15:00 the vice president phoned an almost empty conference room.'], changes: ['-10 Nobody was there for the call'] } });
    expect(r.headline).toBe('Nobody Was There for the Call');
    expect(r.paragraphs[0]).toContain('At 15:00 the vice president phoned an almost empty conference room.');
  });

  it('the sandbox report rounds too and names only a few moods', async () => {
    const r = await brain().report({ ...base, story: undefined });
    expect(r.headline).toContain('1 Incident');
    expect(r.paragraphs[0]).toMatch(/^Day 1 saw 1 incident\./);
    expect(r.paragraphs[1]).toContain('from 100.1 to 101.8, up 1.7');
    expect(r.paragraphs[2].split(' was ').length - 1).toBeLessThanOrEqual(3);
  });
});

describe('small wording fixes', () => {
  it('a name filled in after a full stop gets its capital, an ellipsis does not', () => {
    expect(fill('Hey, Stan. Oh. {other}.', {})).toBe('Hey, Stan. Oh. Everyone.');
    expect(fill('{other}, a word.', { other: 'everyone' })).toBe('Everyone, a word.');
    expect(fill('Wait... {other} too?', { other: 'everyone' })).toBe('Wait... everyone too?');
    expect(fill('Listen, {other}.', { other: 'everyone' })).toBe('Listen, everyone.');
  });

  it('plans from a mood need no reason, and "as asked" is not a wish to talk', async () => {
    const b = new InstinctBrain(BANKED, GAME_WORLD, seeded(23));
    for (let i = 0; i < 30; i++) {
      const [m] = await b.minds({
        id: 'm', day: 1, clock: '15:05',
        people: [{ ...who('phyllis', { mood: 'happy', goal: 'waiting in the conference room as asked' }), place: 'the conference room', doing: 'waiting in the conference room as asked' }],
        facts: [], allowed: ['work', 'talk', 'gossip', 'coffee'], chaos: 0,
        others: [{ id: 'michael', name: 'Michael Scott', place: 'the conference room' }]
      });
      expect(m.plan.about ?? '').not.toMatch(/feeling|as asked/);
    }
  });
});
