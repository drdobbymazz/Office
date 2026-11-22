// Every word the story says to the player, in one place. Plain words, short
// sentences, British English, no dashes for punctuation. Say who did what and
// what changed; a joke only ever comes after the fact.

import type { CastId } from '@/game/core/types';

export const STORY_TITLE = 'Closing Time';

// ── Monday: The Memo ─────────────────────────────────────────────────────────

export const MEMO = {
  title: 'The Memo',
  intro: [
    'Corporate is closing one of its branches on Friday, and this one is on the list. Michael got the memo this morning. He has told nobody and shut himself in his office.',
    'At 15:00 the regional vice president will phone the conference room to explain. If Michael and most of the staff are not in that room, Corporate will take it as a sign that nobody here cares.',
    'You are the unseen force in this building. You cannot speak to them, but you can move them, put thoughts in their heads and make things happen.'
  ],
  goal: {
    id: 'call', title: 'All hands for the call', icon: 'meeting',
    detail: 'Get Michael and at least 9 others into the conference room at the same time, between 14:00 and 15:00.'
  },
  hints: [
    'Michael thinks hiding in his office makes the closure less real. His card in People shows what he believes.',
    'An announcement that names a room sends people there. Not everyone listens.',
    'People you drop somewhere stay put for a little while.',
    'Whispering to someone replaces what they were sure of.'
  ],
  extras: [
    { id: 'quiet', title: 'Quiet hands', icon: 'poke', detail: 'Win the call without a power, Anything or Tell them to. Whispers, announcements and your hand only.' },
    { id: 'calm', title: 'Calm Monday', icon: 'check', detail: 'Get through the day without a single incident.' }
  ],
  locked: { meeting: 'Michael has cancelled every meeting today.' },
  conviction: 'If I stay in my office, the closure is not real.',
  hidden: 'Michael knows Corporate may close the branch on Friday and is hiding it.',
  hiding: 'hiding in his office',
  fact: 'Michael has shut himself in his office and is not taking visitors.',
  before: 'The call is at 15:00',
  ring: 'The phone rings in the conference room. Michael puts the vice president on speaker.',
  sceneWhy: 'The regional vice president is on the speakerphone in the conference room, explaining that Corporate will close one branch on Friday and that this branch is on the list.',
  closure: 'Everyone now knows Corporate may close this branch on Friday.',
  won: 'The call with Corporate went ahead, and the whole office heard it together.',
  missed: 'At 15:00 the vice president phoned an almost empty conference room and hung up after a minute.',
  lockedOut: 'After being shut in the conference room, Michael gives up on hiding. He stays there.',
  changeWon: 'The call with Corporate went ahead',
  changeLost: 'Nobody was there for the call'
};

// ── Tuesday: Not Speaking ────────────────────────────────────────────────────

export const ROW = {
  title: 'Not Speaking',
  intro: [
    "Corporate wants the quarter's accounts by 17:00. Angela, Oscar and Kevin do the accounts.",
    'Angela and Oscar had a row yesterday about the figures and are not speaking. Kevin cannot finish alone.',
    'Get Angela and Oscar back on good terms before five, so the accounts go in on time.'
  ],
  goal: {
    id: 'makeup', title: 'Make up', icon: 'love',
    detail: 'Before 17:00, get Angela to like Oscar and Oscar to like Angela (both feelings at +15 or better).'
  },
  hints: [
    'Every real conversation between the two of them helps. One they were pushed into helps more.',
    'Dwight is sure Oscar is plotting against Angela, and keeps telling her so. His card in People shows it.',
    'Two people locked in a room have to talk to each other.',
    "Cupid's Arrow makes one person fall for another for a while."
  ],
  extras: [
    { id: 'stirring', title: 'Who keeps stirring?', icon: 'whisper', detail: "Change Dwight's mind about Oscar's plot." },
    { id: 'team', title: 'The accounts team', icon: 'people', detail: 'Once they have made up, get Angela, Oscar and Kevin into the accounting corner together.' }
  ],
  bondNote: 'the row about the accounts',
  fact: "Corporate wants the quarter's accounts by 17:00. Angela and Oscar are not speaking after a row about the figures.",
  dwight: 'Oscar is plotting to get Angela fired.',
  gossip: "Oscar's plot",
  lockedTalk: 'Angela and Oscar were locked in together. They had to talk.',
  won: 'Angela and Oscar are speaking again. They sit down with Kevin to finish the accounts.',
  madeUp: 'Angela and Oscar have made up.',
  lost: 'The accounts went to Corporate late, with two sets of figures that do not match.',
  lateFact: "The quarter's accounts went to Corporate late.",
  changeWon: 'The accounts went in on time',
  changeLost: 'The accounts went in late'
};

// ── Wednesday: The Client ────────────────────────────────────────────────────

export const CLIENT = {
  title: 'The Client',
  intro: [
    "Mr Figgis of Figgis Hardware, the branch's biggest customer, comes at 10:30 to decide whether to sign for another year. Without him the branch has no chance on Friday.",
    'He is easily annoyed. Get him into the conference room with a salesperson while he is still in a good mood.'
  ],
  goal: {
    id: 'sign', title: 'Sign Mr Figgis', icon: 'coin',
    detail: 'Get Mr Figgis and a salesperson together in the conference room (or Michael\'s office) for a while, before his patience drops below 50.'
  },
  hints: [
    'His card in People says what he likes and what he cannot stand.',
    'Salespeople: Jim, Dwight, Phyllis, Stanley and Andy. Michael is not one today, whatever he thinks.',
    'A disaster anywhere near him costs patience.',
    'Michael is sure he can close the deal himself, and keeps going over to try. Mr Figgis cannot stand his jokes.'
  ],
  extras: [
    { id: 'dog', title: 'Dog person', icon: 'puppy', detail: 'Use the Office Puppy in the room where Mr Figgis is.' },
    { id: 'handsOff', title: 'Hands off', icon: 'poke', detail: 'Never pick Mr Figgis up.' }
  ],
  name: 'Mr Figgis',
  role: 'Owner, Figgis Hardware',
  summary: "Mr Figgis, who owns Figgis Hardware, the branch's biggest customer. A gruff man who has come to decide whether to sign for another year.",
  wants: 'a straight answer and a fair price',
  fears: 'jokes, loud noise and being grabbed',
  quirk: 'loves dogs',
  fact: "Mr Figgis of Figgis Hardware, the branch's biggest customer, is coming at 10:30 to decide whether to sign for another year.",
  waitingFact: 'Mr Figgis, the branch\'s biggest customer, is waiting in reception. He is easily annoyed.',
  before: 'Mr Figgis arrives at 10:30',
  arrives: 'Mr Figgis from Figgis Hardware walks in and waits in reception.',
  waiting: 'waiting in reception',
  meddle: 'the deal he is sure he can close',
  pitchWhy: (sales: string) => `Mr Figgis has sat down with ${sales} to decide whether Figgis Hardware signs for another year. He wants a straight answer and a fair price.`,
  signed: 'Mr Figgis signed for another year.',
  signedFact: 'Figgis Hardware has signed for another year.',
  fedUp: 'Mr Figgis has had enough and walks out.',
  late: 'Mr Figgis has another appointment and leaves without signing.',
  goneFact: 'Figgis Hardware, the biggest customer, walked away without signing.',
  changeWon: 'Figgis Hardware signed for another year',
  changeLost: 'Figgis Hardware walked away'
};

// ── Thursday: The Leak ───────────────────────────────────────────────────────

export const LEAK = {
  title: 'The Leak',
  intro: [
    'Someone in the office has been emailing Corporate behind everyone\'s back: complaints, gossip and the worst moments of the week.',
    'Find out who before 17:00 and accuse them from their card in People. You have two tries. A wrong accusation turns the office against an innocent person.'
  ],
  goal: {
    id: 'leak', title: 'Find the leak', icon: 'accuse',
    detail: 'Before 17:00, accuse the person who has been emailing Corporate. Two tries.'
  },
  hints: [
    'Tap people to read their private thoughts.',
    'The leak has to slip away to the fax machine in the annex now and then. Watch who goes.',
    'Truth Serum makes someone unable to lie. It is not cheap.'
  ],
  extras: [
    { id: 'noSerum', title: 'No serum needed', icon: 'truth', detail: 'Catch the leak without using Truth Serum.' },
    { id: 'firstTry', title: 'First try', icon: 'accuse', detail: 'Catch the leak with your first accusation.' }
  ],
  candidates: ['ryan', 'toby', 'creed', 'kelly', 'andy', 'phyllis'] as CastId[],
  hidden: (name: string) => `Secretly, ${name} has been emailing Corporate about everyone in the office. ${name} hides it, gets nervous when Corporate or emails come up, and never admits it unless unable to lie.`,
  fact: "Someone in the office has been emailing Corporate behind everyone's back.",
  thoughts: ['Did I clear the fax log?', 'Corporate will love this one.', 'Act normal. Nobody saw you.', 'One more email and I am done for the week.', 'Delete, delete, delete.'],
  fax: { doing: 'heading to the fax machine', stay: 'using the fax machine' },
  shred: { doing: 'hurrying to the fax machine', stay: 'shredding the fax log' },
  herrings: [
    { doing: 'heading to the annex for staples', stay: 'looking for staples in the annex' },
    { doing: 'taking a parcel to the annex', stay: 'dropping off a parcel in the annex' },
    { doing: 'going to the annex for printer paper', stay: 'fetching printer paper in the annex' }
  ],
  confession: 'Fine! It was me. I have been emailing Corporate.',
  confessed: (name: string) => `${name} confesses to emailing Corporate.`,
  denial: 'I have never emailed Corporate in my life. Not once.',
  ruledOut: (name: string, pronoun: string) => `${name} cannot lie right now, and says plainly that ${pronoun} has never emailed Corporate.`,
  label: 'Accuse of leaking',
  right: (name: string) => `${name} admits sending the emails to Corporate.`,
  caughtWhy: (name: string) => `${name} has just been caught emailing Corporate behind everyone's back, and admits it.`,
  caughtFact: (name: string) => `${name} was caught emailing Corporate behind everyone's back.`,
  wrong: (name: string) => `${name} had nothing to do with it, and is not happy about being blamed.`,
  wrongNote: 'blamed for the leak',
  tries: (n: number) => (n === 1 ? '1 try left' : `${n} tries left`),
  outOfTries: 'Two wrong accusations. The leaks go on.',
  nobody: 'Nobody was caught. The leaks go on.',
  itWas: (name: string) => `It was ${name} all along.`,
  changeWon: 'The leak was caught',
  changeLost: 'The leak was never caught'
};

// ── Friday: The Verdict ──────────────────────────────────────────────────────

export const VERDICT = {
  title: 'The Verdict',
  intro: [
    'Today Corporate decides. Their inspector arrives at 13:00 to tour the office, and everything this week has been reported.',
    'Make the office look worth keeping while he tours: people at their desks, no disasters, and Michael waiting in his office at the end.'
  ],
  goal: {
    id: 'inspection', title: 'Pass the inspection', icon: 'inspector',
    detail: "Score 60 or more: the inspector checks the bullpen desks, the accounting desks, then Michael's office, from 13:00."
  },
  hints: [
    'Michael wants to give a farewell speech in the break room. If he gives it while the inspector is here, everyone will go and listen.',
    'Staff hurry to their desks when the inspector walks in. Anything that pulls them away costs you.',
    "The inspector's last stop is Michael's office. Michael should be in it.",
    'A disaster during the tour is noted. Points: desks in the bullpen 30, accounting desks 25, Michael 30, no incidents 15.'
  ],
  extras: [
    { id: 'spotless', title: 'Spotless', icon: 'check', detail: 'Get through the whole day without a single incident.' },
    { id: 'fullHouse', title: 'Full house', icon: 'people', detail: 'Have all fifteen staff in the building at 16:00.' }
  ],
  conviction: 'Today is the day to give a farewell speech in the break room.',
  practising: 'practising a farewell speech',
  hurrying: 'hurrying to the break room to give his speech',
  waitingOffice: 'waiting in his office for the inspector',
  fact: "Corporate's inspector arrives at 13:00 to decide whether this branch stays open.",
  before: 'The inspector comes at 13:00',
  speech: 'Michael stands on a chair in the break room and calls everyone in for his farewell speech.',
  speechWhy: 'Michael is giving a tearful farewell speech in the break room, while the inspector from Corporate tours the office.',
  listening: "listening to Michael's farewell speech",
  goingToListen: "going to hear Michael's farewell speech",
  giving: 'giving a farewell speech',
  stop: (n: number) => `Stop ${n} of 3`,
  score: (n: number) => `Score ${n}`,
  passed: (n: number) => `The inspector took his notes and left. The office scored ${n} out of 100, enough to look worth keeping.`,
  failed: (n: number) => `The inspector took his notes and left. The office scored ${n} out of 100.`,
  never: 'The inspector never got round the office.',
  changeWon: 'The inspection went well',
  changeLost: 'The inspection went badly'
};

// ── The report and the ending ────────────────────────────────────────────────

export const CHANGES = {
  extra: (title: string) => `Extra goal: ${title}`,
  incidents: (n: number) => (n === 1 ? '1 incident was reported to Corporate' : `${n} incidents were reported to Corporate`),
  moraleHigh: 'Morale was high at five o\'clock',
  moraleLow: 'Morale was low at five o\'clock'
};

/** How the week ends, in one plain sentence (for the standing meter and the ending card). */
export const ENDING_RULE = 'After Friday: 75 or more and a passed inspection keeps the branch open. Under 45 closes it.';

export const NOT_ENOUGH = (cost: number, left: number): string => `Not enough influence: this costs ${cost}, you have ${left}.`;
export const LOCKED_TODAY = 'Not available today.';

export interface WeekRecap {
  call?: boolean;
  accounts?: boolean;
  figgis?: boolean;
  leakName?: string;
  leakFound?: boolean;
  inspection?: number;
}

/** One plain sentence on how the week went, from what happened. */
function weekLine(w: WeekRecap): string {
  const bits: string[] = [];
  bits.push(w.call ? 'The whole office heard the call from Corporate on Monday' : 'Nobody turned up for the call from Corporate on Monday');
  bits.push(w.accounts ? 'the accounts went in on time' : 'the accounts went in late');
  bits.push(w.figgis ? 'Figgis Hardware signed for another year' : 'Figgis Hardware walked away');
  return `${bits[0]}, ${bits[1]}, and ${bits[2]}.`;
}

function leakLine(w: WeekRecap): string {
  if (!w.leakName) return '';
  return w.leakFound ? `${w.leakName} was caught sending emails to Corporate.` : `${w.leakName} kept emailing Corporate, and nobody ever found out.`;
}

export function endingText(id: 'saved' | 'scraped' | 'closed', w: WeekRecap): { title: string; text: string[] } {
  const week = weekLine(w);
  const leak = leakLine(w);
  const inspected = w.inspection !== undefined ? `The inspector gave the office ${w.inspection} out of 100.` : '';
  switch (id) {
    case 'saved':
      return {
        title: 'THE BRANCH STAYS OPEN',
        text: [
          `On Friday evening Corporate rang to say the Scranton branch stays open. ${inspected}`.trim(),
          `${week} ${leak}`.trim(),
          'Michael called everyone into the conference room to celebrate. For once, nobody minded.'
        ]
      };
    case 'scraped':
      return {
        title: 'OPEN, JUST',
        text: [
          `Corporate is keeping the Scranton branch open, but only just. ${inspected}`.trim(),
          `${week} ${leak}`.trim(),
          "The budget is cut in half and Michael is on probation. He has already planned a probation party."
        ]
      };
    default:
      return {
        title: 'CLOSING TIME',
        text: [
          `Corporate is closing the Scranton branch. ${inspected}`.trim(),
          `${week} ${leak}`.trim(),
          'The staff packed their desks into boxes. Dwight took the stapler. Michael says this is not goodbye, it is see you later.'
        ]
      };
  }
}
