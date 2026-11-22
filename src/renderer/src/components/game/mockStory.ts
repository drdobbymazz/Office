// Story data for the mock game: the five chapters of "Closing Time" with their
// texts and numbers, and a builder that turns a point in the week into the
// StoryUi the screens read. Only the harness uses this; the real story lives
// in the game.

import type { ActionId, StandingChangeUi, StoryGoalUi, StoryUi } from '@/game/app/gameApi';
import type { CharId, ChaosId } from '@/game/core/types';
import { CHAOS_LIST } from '@/game/core/chaos';

export type DayResult = 'won' | 'lost' | null;
export type EndingId = 'saved' | 'scraped' | 'closed';

interface Outcome { text: string[]; changes: StandingChangeUi[]; sideDone: string[] }

export interface MockChapter {
  weekday: string;
  title: string;
  intro: string[];
  hints: string[];
  budget: number;
  goal: { id: string; title: string; detail: string; icon: string; before: string; during: string; progress: number; won: string; lost: string };
  side: { id: string; title: string; detail: string; icon: string }[];
  /** Extras already done in the mid-day state. */
  sideDuring?: string[];
  /** Influence spent by the mid-day state. */
  spent: number;
  locked?: Partial<Record<ChaosId, string>>;
  accuse?: boolean;
  won: Outcome;
  lost: Outcome;
}

export const MOCK_LEAK: CharId = 'toby';
export const START_STANDING = 40;

export const MOCK_CHAPTERS: MockChapter[] = [
  {
    weekday: 'Monday', title: 'The Memo', budget: 8, spent: 3,
    intro: [
      'Corporate is closing one of its branches on Friday, and this one is on the list. Michael got the memo this morning. He has told nobody and shut himself in his office.',
      'At 15:00 the regional vice president will phone the conference room to explain. If Michael and most of the staff are not in that room, Corporate will take it as a sign that nobody here cares.',
      'You are the unseen force in this building. You cannot speak to them, but you can move them, put thoughts in their heads and make things happen.'
    ],
    hints: [
      'Michael thinks hiding in his office makes the closure less real. His card in People shows what he believes.',
      'An announcement that names a room sends people there. Not everyone listens.',
      'People you drop somewhere stay put for a little while.',
      'Whispering to someone replaces what they were sure of.'
    ],
    goal: {
      id: 'call', title: 'All hands for the call', icon: 'phone',
      detail: 'Get Michael and at least 9 others into the conference room at the same time, between 14:00 and 15:00.',
      before: 'The call is at 15:00', during: '7 of 10 in the room, Michael not yet', progress: 0.6,
      won: 'The call went ahead', lost: 'Nobody took the call'
    },
    side: [
      { id: 'quiet', title: 'Quiet hands', detail: 'Win the main goal without using any power. Whispers, announcements and your hand only.', icon: 'poke' },
      { id: 'calm', title: 'Calm Monday', detail: 'No incidents all day.', icon: 'incident' }
    ],
    locked: { meeting: 'Michael has cancelled every meeting today.' },
    won: {
      text: [
        'Michael and ten others were in the conference room when the phone rang at 14:40.',
        'The vice president explained that one branch will close on Friday, and that this branch is on the list. Everyone knows now.'
      ],
      changes: [
        { text: 'The call with Corporate went ahead', delta: 15 },
        { text: 'Extra goal: Quiet hands', delta: 5 },
        { text: '2 incidents were reported to Corporate', delta: -4 },
        { text: 'Morale was 60 or more at 17:00', delta: 3 }
      ],
      sideDone: ['quiet']
    },
    lost: {
      text: [
        'At 15:00 the vice president phoned an almost empty conference room and hung up after a minute.',
        'Everyone found out about the closure anyway. Kevin told them at 16:00.'
      ],
      changes: [
        { text: 'The call with Corporate fell flat', delta: -10 },
        { text: '2 incidents were reported to Corporate', delta: -4 }
      ],
      sideDone: []
    }
  },
  {
    weekday: 'Tuesday', title: 'Not Speaking', budget: 8, spent: 2,
    intro: [
      "Corporate wants the quarter's accounts by 17:00. Angela, Oscar and Kevin do the accounts.",
      'Angela and Oscar had a row yesterday about the figures, and now they are not speaking. Kevin cannot finish the accounts alone.',
      'Get Angela and Oscar back on good terms before the day is out.'
    ],
    hints: [
      'A finished conversation with both of them in it helps, and more if a whisper or an order started it.',
      'Locked In shuts two people in the conference room. They have to talk.',
      'Dwight is sure Oscar is plotting against Angela, and keeps telling her so. Whispering to Dwight changes his mind.',
      "Cupid's Arrow works on one of them at a time."
    ],
    goal: {
      id: 'makeup', title: 'Make up', icon: 'love',
      detail: 'Get Angela and Oscar back on good terms, both ways, before 17:00.',
      before: 'They are not speaking', during: 'Angela 12/15, Oscar 3/15', progress: 0.7,
      won: 'They are speaking again', lost: 'Still not speaking'
    },
    side: [
      { id: 'stirring', title: 'Who keeps stirring?', detail: 'Change Dwight\'s mind about Oscar.', icon: 'whisper' },
      { id: 'team', title: 'The accounts team', detail: 'Once they have made up, get Angela, Oscar and Kevin into the accounting corner together.', icon: 'people' }
    ],
    sideDuring: ['stirring'],
    won: {
      text: ['Angela and Oscar are speaking again. They sat down with Kevin and finished the accounts at 16:20.'],
      changes: [
        { text: 'The accounts went in on time', delta: 15 },
        { text: 'Extra goal: Who keeps stirring?', delta: 5 },
        { text: '1 incident was reported to Corporate', delta: -2 }
      ],
      sideDone: ['stirring']
    },
    lost: {
      text: ['The accounts went to Corporate late, with two sets of figures that do not match.', 'Dwight did stop stirring, but by then it was too late.'],
      changes: [
        { text: 'The accounts went in late', delta: -10 },
        { text: 'Extra goal: Who keeps stirring?', delta: 5 },
        { text: '1 incident was reported to Corporate', delta: -2 }
      ],
      sideDone: ['stirring']
    }
  },
  {
    weekday: 'Wednesday', title: 'The Client', budget: 9, spent: 4,
    intro: [
      "Mr Figgis of Figgis Hardware is the branch's biggest customer. He comes in at 10:30 to decide whether to sign for another year.",
      'Without him the branch has no chance on Friday. He is easily annoyed, and every minute he waits costs patience.',
      'Get him into the conference room with a salesperson while he is still in a good mood.'
    ],
    hints: [
      'His card in People says what he likes and what he cannot stand.',
      'Salespeople: Jim, Dwight, Phyllis, Stanley and Andy. Michael is not one today, whatever he thinks.',
      'A disaster anywhere near him costs patience.'
    ],
    goal: {
      id: 'figgis', title: 'Sign Mr Figgis', icon: 'coin',
      detail: 'Get Mr Figgis and a salesperson into the conference room together for 15 seconds, while his patience is 50 or more.',
      before: 'Arrives at 10:30', during: 'Patience 64', progress: 0.64,
      won: 'He signed for another year', lost: 'He walked out'
    },
    side: [
      { id: 'dog', title: 'Dog person', detail: 'Use the Office Puppy where he is.', icon: 'puppy' },
      { id: 'hands', title: 'Hands off', detail: 'Never pick him up.', icon: 'poke' }
    ],
    won: {
      text: ['Mr Figgis signed for another year. Jim walked him through the prices, and the puppy did the rest.'],
      changes: [
        { text: 'Mr Figgis signed for another year', delta: 15 },
        { text: 'Extra goal: Dog person', delta: 5 },
        { text: '3 incidents were reported to Corporate', delta: -6 },
        { text: 'Morale was 60 or more at 17:00', delta: 3 }
      ],
      sideDone: ['dog']
    },
    lost: {
      text: ['Mr Figgis had enough and walked out at 11:50. He did not sign.', 'Michael told him a joke about hammers on the way to the door.'],
      changes: [
        { text: 'Mr Figgis left without signing', delta: -10 },
        { text: '3 incidents were reported to Corporate', delta: -6 }
      ],
      sideDone: []
    }
  },
  {
    weekday: 'Thursday', title: 'The Leak', budget: 7, spent: 1, accuse: true,
    intro: [
      "Someone in this office has been emailing Corporate behind everyone's back: complaints, gossip and the worst moments of the week.",
      'Find out who before 17:00, then accuse them from their card in People.',
      'You have two tries. A wrong accusation turns the office against someone innocent.'
    ],
    hints: [
      'Tap people to read their private thoughts.',
      'The leak has to slip away to the fax machine in the annex now and then. Watch who goes.',
      'Truth Serum makes someone unable to lie. It is not cheap.'
    ],
    goal: {
      id: 'leak', title: 'Find the leak', icon: 'secretLeak',
      detail: 'Work out who has been emailing Corporate, and accuse them from their card in People.',
      before: '2 tries', during: '2 tries left', progress: 0,
      won: 'You found the leak', lost: 'The leaks go on'
    },
    side: [
      { id: 'noserum', title: 'No serum needed', detail: 'Find the leak without using Truth Serum.', icon: 'truth' },
      { id: 'first', title: 'First try', detail: 'Accuse the right person first time.', icon: 'target' }
    ],
    won: {
      text: ['Toby admits sending the emails to Corporate. He says he only wanted someone to listen.'],
      changes: [
        { text: 'You found the leak', delta: 15 },
        { text: '4 incidents were reported to Corporate', delta: -8 },
        { text: 'Morale was 30 or less at 17:00', delta: -3 }
      ],
      sideDone: []
    },
    lost: {
      text: ['The leaks go on. Kelly and Creed had nothing to do with it, and neither of them is speaking to anyone.'],
      changes: [
        { text: 'The leak was not found', delta: -10 },
        { text: '2 incidents were reported to Corporate', delta: -4 }
      ],
      sideDone: []
    }
  },
  {
    weekday: 'Friday', title: 'The Verdict', budget: 10, spent: 4,
    intro: [
      'Today Corporate decides. Their inspector arrives at 13:00 to tour the office, and everything from this week has been reported.',
      'Make the office look worth keeping while he tours: people at their desks, no disasters, and Michael waiting in his office at the end.',
      'Michael has other ideas. He wants to give a farewell speech in the break room.'
    ],
    hints: [
      'People at their own desks score at each stop of the tour.',
      'Michael has to be in his office when the tour gets there.',
      'A disaster during the tour costs points.',
      'Michael keeps wandering off to the break room until he changes his mind.'
    ],
    goal: {
      id: 'inspection', title: 'Pass the inspection', icon: 'inspector',
      detail: "Score 60 or more on the inspector's tour of the bullpen, the accounting corner and Michael's office.",
      before: 'Inspector at 13:00', during: 'Stop 2 of 3', progress: 0.45,
      won: 'Score 74', lost: 'Score 41'
    },
    side: [
      { id: 'spotless', title: 'Spotless', detail: 'No incidents all day.', icon: 'incident' },
      { id: 'full', title: 'Full house', detail: 'All fifteen staff in the building at 16:00.', icon: 'people' }
    ],
    locked: { inspector: 'Corporate is sending its own inspector today.' },
    won: {
      text: ["The inspector found people at their desks and Michael waiting in his office. He wrote down 74 out of 100."],
      changes: [
        { text: 'The inspection went well', delta: 15 },
        { text: '1 incident was reported to Corporate', delta: -2 }
      ],
      sideDone: []
    },
    lost: {
      text: ['The inspector found half the desks empty and Michael in the break room, mid-speech. He wrote down 41 out of 100.'],
      changes: [
        { text: 'The inspection went badly', delta: -10 },
        { text: 'Extra goal: Full house', delta: 5 },
        { text: 'Morale was 60 or more at 17:00', delta: 3 }
      ],
      sideDone: ['full']
    }
  }
];

export const MOCK_ENDINGS: Record<EndingId, { title: string; text: string[] }> = {
  saved: {
    title: 'THE BRANCH STAYS OPEN',
    text: [
      "At 17:00 the phone rang in Michael's office. Corporate is keeping the Scranton branch open.",
      "They mentioned the full room for Monday's call, Mr Figgis signing for another year and the leak being found. They did not mention the raccoon.",
      'Michael has called a meeting to celebrate. Nobody is going, but they are all smiling.'
    ]
  },
  scraped: {
    title: 'OPEN, JUST',
    text: [
      'Corporate is keeping the branch open, just. The budget is cut in half from Monday, and Michael is on probation.',
      'Mr Figgis signing helped. The late accounts and the leak that was never found did not.',
      'Michael says it is the best news he has ever had. It is not, but it could have been worse.'
    ]
  },
  closed: {
    title: 'CLOSING TIME',
    text: [
      'Corporate is closing the Scranton branch. The staff have a month to clear their desks.',
      'The accounts were late, Mr Figgis took his business elsewhere and the leak was never found. Corporate had heard enough.',
      'Dwight is taking the stapler. Kevin is taking the chilli. Pam says the paper will miss them.'
    ]
  }
};

/** The week each ending comes from. */
export const ENDING_WEEK: Record<EndingId, DayResult[]> = {
  saved: ['won', 'lost', 'won', 'won', 'won'],
  scraped: ['won', 'lost', 'won', 'lost', 'lost'],
  closed: ['won', 'lost', 'lost', 'lost', 'lost']
};

/** The week the mid-week screens show. */
export const DEFAULT_WEEK: DayResult[] = ['won', 'lost', 'won', 'won', null];

export function endingFor(standing: number): EndingId {
  return standing >= 65 ? 'saved' : standing >= 40 ? 'scraped' : 'closed';
}

const clampStanding = (v: number) => Math.max(0, Math.min(100, v));

export function dayDelta(chapter: number, result: DayResult): number {
  if (!result) return 0;
  const ch = MOCK_CHAPTERS[chapter - 1];
  return (result === 'won' ? ch.won : ch.lost).changes.reduce((n, c) => n + c.delta, 0);
}

/** Standing at the start of a chapter, from the results of the days before it. */
export function standingAt(chapter: number, results: DayResult[]): number {
  let v = START_STANDING;
  for (let i = 1; i < chapter; i++) v = clampStanding(v + dayDelta(i, results[i - 1] ?? null));
  return v;
}

/** What each action costs: tools by the rules, powers by how much chaos they make. */
export function mockCosts(): Partial<Record<ActionId, number>> {
  const out: Partial<Record<ActionId, number>> = { whisper: 1, cue: 1, announce: 1, anything: 3 };
  for (const d of CHAOS_LIST) out[d.id] = d.chaos <= 10 ? 2 : d.chaos <= 18 ? 3 : 4;
  return out;
}

export type Stage = 'briefing' | 'start' | 'play' | 'done' | 'ending';

export interface BuildOpts {
  chapter: number;
  results: DayResult[];
  stage: Stage;
  /** Stage 'done': how the day went. */
  won?: boolean;
  /** Override influence left. */
  left?: number;
  accused?: CharId[];
  /** Stage 'ending'. */
  ending?: EndingId;
}

/** Build the StoryUi for a point in the week. */
export function buildStory(o: BuildOpts): StoryUi {
  const n = Math.max(1, Math.min(MOCK_CHAPTERS.length, o.chapter));
  const ch = MOCK_CHAPTERS[n - 1];
  const before = standingAt(n, o.results);
  const done = o.stage === 'done';
  const outcome = done ? (o.won ? ch.won : ch.lost) : null;
  const playing = o.stage === 'play';
  const accused = o.accused ?? [];
  const wrong = accused.filter((id) => id !== MOCK_LEAK).length;
  const triesLeft = Math.max(0, 2 - wrong);

  let goalState: StoryGoalUi['state'] = 'open';
  if (done) goalState = o.won ? 'won' : 'lost';
  if (ch.accuse && accused.includes(MOCK_LEAK)) goalState = 'won';
  if (ch.accuse && triesLeft === 0 && goalState === 'open') goalState = 'lost';

  let status = o.stage === 'briefing' || o.stage === 'start' ? ch.goal.before : ch.goal.during;
  if (ch.accuse && goalState === 'open') status = `${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left`;
  if (goalState === 'won') status = ch.accuse && !done ? `${nameOf(MOCK_LEAK)} admitted it` : ch.goal.won;
  if (goalState === 'lost') status = ch.goal.lost;

  const goal: StoryGoalUi = {
    id: ch.goal.id, title: ch.goal.title, detail: ch.goal.detail, icon: ch.goal.icon,
    progress: playing ? ch.goal.progress : goalState === 'won' ? 1 : 0, status, state: goalState
  };
  const side: StoryGoalUi[] = ch.side.map((x) => {
    const won = done ? outcome!.sideDone.includes(x.id) : playing ? (ch.sideDuring ?? []).includes(x.id) : false;
    return {
      id: x.id, title: x.title, detail: x.detail, icon: x.icon, progress: won ? 1 : 0, status: '',
      state: won ? 'won' : done ? 'lost' : 'open'
    };
  });

  const results = o.results.slice(0, MOCK_CHAPTERS.length);
  const week = MOCK_CHAPTERS.map((c, i) => {
    let result: DayResult = i + 1 < n ? results[i] ?? null : null;
    if (i + 1 === n && done) result = o.won ? 'won' : 'lost';
    if (o.stage === 'ending') result = results[i] ?? null;
    return { chapter: i + 1, title: c.title, weekday: c.weekday, result };
  });

  const after = outcome ? clampStanding(before + outcome.changes.reduce((s, c) => s + c.delta, 0)) : before;
  const finalStanding = o.stage === 'ending' ? standingAt(MOCK_CHAPTERS.length + 1, results) : after;
  const endingId = o.ending ?? endingFor(finalStanding);
  const extraBonus = side.filter((x) => x.state === 'won').length * 2;
  const left = o.left ?? (playing ? ch.budget - ch.spent + extraBonus : o.stage === 'done' ? Math.max(0, ch.budget - ch.spent - 3) : ch.budget);

  return {
    chapter: n, chapters: MOCK_CHAPTERS.length, title: ch.title, weekday: ch.weekday,
    intro: ch.intro, hints: ch.hints, goal, side,
    standing: o.stage === 'ending' ? finalStanding : after,
    influence: { left, max: ch.budget },
    costs: mockCosts(),
    locked: ch.locked ?? {},
    accuse: ch.accuse && !done ? { triesLeft, accused, label: 'Accuse of leaking' } : null,
    result: outcome ? { won: !!o.won, text: outcome.text, changes: outcome.changes, standingBefore: before, standingAfter: after } : null,
    ending: o.stage === 'ending' ? { id: endingId, title: MOCK_ENDINGS[endingId].title, text: MOCK_ENDINGS[endingId].text, epilogue: [] } : null,
    week,
    recap: n > 1 ? 'Yesterday Angela and Oscar made up, and the accounts went in on time.' : null,
    help: [],
    warns: {},
    suggest: { whisper: [], announce: [] },
    canFinish: !!outcome || goal.state !== 'open'
  };
}

function nameOf(id: CharId): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
