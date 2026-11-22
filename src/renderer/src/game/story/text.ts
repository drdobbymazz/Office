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
    'Between 14:00 and 15:00 the regional vice president will phone the conference room to explain. He will only talk to a room with Michael and at least 9 of the staff in it. Anything less, and Corporate will decide that nobody here cares.',
    'You are the unseen force in this building. You cannot speak to them, but you can move them, put thoughts in their heads and make things happen.'
  ],
  goal: {
    id: 'call', title: 'All hands for the call', icon: 'meeting',
    detail: 'Get Michael and at least 9 others into the conference room at the same time, between 14:00 and 15:00.',
    stamp: ['CALL MADE', 'CALL MISSED'] as [string, string], room: 'meeting' as const
  },
  /** Clues for the card: what to notice, not what to do. */
  hints: [
    'Michael has not left his office since nine. His card says why.',
    'An announcement that names a room sends people there, if they feel like going. Count who turns up.',
    'Some people will not come just because they are asked. Their cards say what would move them.',
    'Michael threw something in the bin this morning. Not everyone minds their own business.'
  ],
  /** Recipes, shown only after a failed try or a retry. */
  help: [
    'From about 13:30, announce "Everyone to the conference room, please." People wait there for over an hour.',
    'Carry Michael into the room last, once the others are there. Left alone, he slips back to his office.',
    'Or whisper Michael a new idea that names the conference room, and he goes there by himself.',
    'At about 10:20 Creed goes through Michael\'s bin. Whisper him something else to think about, or carry him away, and the memo stays secret.',
    'If the memo gets out: Kevin comes for food, Ryan comes when asked by name, and Kelly goes wherever Ryan goes.'
  ],
  extras: [
    { id: 'quiet', title: 'Quiet hands', icon: 'poke', detail: 'Win the call without a power, Anything or Tell them to. Whispers, announcements and your hand only.' },
    { id: 'full', title: 'Full room', icon: 'people', detail: 'Have at least 12 others in the room with Michael when the phone rings.' }
  ],
  locked: { meeting: 'Michael has cancelled every meeting today.' },
  conviction: 'If I stay in my office, nothing bad can happen this week.',
  hidden: 'Michael knows Corporate may close the branch on Friday and is hiding it.',
  hiding: 'hiding in his office',
  toOffice: 'hurrying back to his office',
  fact: 'Michael has shut himself in his office and is not taking visitors.',
  topicHiding: 'Michael has not come out of his office all day.',
  topicCancelled: 'Michael is not taking visitors and has cancelled every meeting today.',
  before: 'Corporate rings between 14:00 and 15:00',
  two: 'It is 14:00. The vice president rings as soon as Michael and 9 others are in the conference room.',
  late: (n: number, michael: boolean) => `It is 14:45. ${n} of 10 in the room${michael ? '' : ', Michael not yet'}. At 15:00 the vice president gives up.`,
  slipBack: 'Michael slips back to his office.',
  freed: 'Michael stops hiding and comes out of his office.',
  ring: 'The phone rings in the conference room. Michael puts the vice president on speaker.',
  vp: 'The vice president',
  call: {
    hello: 'Good afternoon, everyone. I will keep this short.',
    news: 'Corporate is closing one branch on Friday, and yours is on the list.',
    michael: 'On the list. Not closed. A list is just a list.',
    inspector: 'Our inspector visits on Friday. Show us this branch is worth keeping.',
    staff: 'Friday. That is four days.',
    rally: 'Nobody panic. We have four days, and we have me.'
  },
  sceneWhy: 'The regional vice president has just told the office on the speakerphone that Corporate may close this branch on Friday.',
  closure: 'Everyone now knows Corporate may close this branch on Friday.',
  won: 'The call with Corporate went ahead, and the whole office heard it together.',
  missed: 'At 15:00 the vice president phoned an almost empty conference room and hung up after a minute.',
  lockedOut: 'After being shut in the conference room, Michael gives up on hiding. He stays there.',
  changeWon: 'The call with Corporate went ahead',
  changeLost: 'Nobody was there for the call',
  warnQuiet: 'Using this fails Quiet hands.',
  // The bin, and what happens if the memo gets out.
  bin: {
    goes: 'Creed is going through the bin outside Michael\'s office.',
    going: 'heading for Michael\'s bin',
    searching: 'going through Michael\'s bin',
    stopped: 'Creed wanders off without finding anything in the bin.',
    found: 'Creed found Michael\'s memo in the bin. Now everyone is whispering that a branch is closing.',
    fact: 'Creed found a memo in Michael\'s bin. People are whispering that a branch is closing.',
    topic: 'Creed found a memo in Michael\'s bin saying a branch is closing.'
  },
  stragglers: [
    {
      id: 'kevin' as CastId,
      conviction: 'If there are going to be layoffs, I am staying by the snacks. Only food would get me out of here.',
      doing: 'guarding the snacks', going: 'heading for the snacks', at: { room: 'kitchen' as const },
      beat: 'Kevin has gone to stand by the snacks in the break room.'
    },
    {
      id: 'ryan' as CastId,
      conviction: 'I am updating my CV in the annex. I will only come out if someone asks for me by name.',
      doing: 'updating his CV', going: 'slipping off to the annex', at: { anchor: 'spot.annex2' },
      beat: 'Ryan is hiding in the annex, updating his CV.'
    },
    {
      id: 'kelly' as CastId,
      conviction: 'I am not going anywhere unless Ryan goes too.',
      doing: 'sticking close to Ryan', going: 'following Ryan', at: { near: 'ryan' as CastId },
      beat: 'Kelly has followed Ryan into the annex.'
    }
  ],
  kellyFollows: 'Kelly follows Ryan to the conference room.',
  suggest: {
    announce: ['Everyone to the conference room for the call, please.'],
    whisper: ['I should be in the conference room at two.']
  }
};

// ── Tuesday: Not Speaking ────────────────────────────────────────────────────

export const ROW = {
  title: 'Not Speaking',
  intro: [
    "Corporate wants the quarter's accounts by 17:00. Angela, Oscar and Kevin do the accounts.",
    'Angela and Oscar had a row yesterday about the figures and are not speaking. Kevin cannot finish alone.',
    'Get Angela and Oscar talking again before five, so the accounts go in on time.'
  ],
  goal: {
    id: 'makeup', title: 'Make up', icon: 'love',
    detail: 'Before 17:00, get Angela and Oscar through 3 talks that go well, or get them to like each other again.',
    stamp: ['MADE UP', 'NOT SPEAKING'] as [string, string], room: 'accounts' as const
  },
  hints: [
    "Angela's opinion of Oscar keeps getting worse. Someone has been talking to her.",
    'A talk helps, most of all one they did not choose to have.',
    'Two people stuck in a room together have to talk.',
    'Read their cards. What each of them likes, or cannot stand, could bring them together.'
  ],
  help: [
    'Dwight keeps telling Angela that Oscar is plotting against her. Whisper Dwight a kinder idea about Oscar.',
    'Whisper Angela and Oscar the idea of making peace with each other, and use Tell them to: "Go and make peace with Oscar."',
    'Locked In shuts them in the conference room together. Cupid\'s Arrow makes one fall for the other for a while.',
    'A surprise party for one with the other in the room, Truth Serum on either of them, or a raccoon in the accounting corner all bring them closer.',
    'After lunch Kevin starts worrying Oscar about the deadline. Change his mind too.'
  ],
  extras: [
    { id: 'stirring', title: 'Who keeps stirring?', icon: 'whisper', detail: 'Find who keeps turning Angela against Oscar, and change their mind.' },
    { id: 'kind', title: 'Kind words only', icon: 'quote', detail: 'Make up without Locked In or Cupid\'s Arrow.' }
  ],
  bondNote: 'the row about the accounts',
  fact: "Corporate wants the quarter's accounts by 17:00. Angela and Oscar are not speaking after a row about the figures.",
  dwight: 'Oscar is plotting to get Angela fired.',
  gossip: "Oscar's plot",
  dwightWarns: 'Dwight warns Angela about Oscar\'s plot again. She trusts Oscar a little less.',
  kevin: 'Angela is going to blame Oscar for the late accounts.',
  kevinGossip: 'Angela blaming Oscar for the late accounts',
  kevinStarts: 'After lunch Kevin starts worrying out loud about the deadline. He keeps going over to Oscar.',
  kevinWarns: 'Kevin tells Oscar that Angela will blame him for the late accounts. Oscar goes quiet again.',
  talkPushed: 'Angela and Oscar have a proper talk. It goes well.',
  talkChat: 'Angela and Oscar exchange a few polite words.',
  lockedTalk: 'Angela and Oscar were locked in together. They had to talk.',
  party: (who: string, other: string) => `${other} brings ${who} a slice of the birthday cake. ${who} almost smiles.`,
  truthOscar: 'Oscar cannot lie, and says he misses working with Angela. Word gets back to her.',
  truthAngela: "Angela cannot lie, and admits Oscar's figures were right. Oscar hears about it.",
  enemy: (thing: string) => `Angela and Oscar team up against the ${thing}.`,
  puppy: 'Angela cannot stand the puppy. Oscar takes her side, and she notices.',
  status: (n: number) => `Talks that went well: ${n} of 3`,
  scene: {
    angela: 'Your figures were right, Oscar.',
    oscar: 'And your summary was clearer than mine.',
    kevin: 'So can we finish the accounts now? I am hungry.'
  },
  won: 'Angela and Oscar are speaking again. They sit down with Kevin to finish the accounts.',
  madeUp: 'Angela and Oscar have made up.',
  lost: 'The accounts went to Corporate late, with two sets of figures that do not match.',
  lateFact: "The quarter's accounts went to Corporate late.",
  changeWon: 'The accounts went in on time',
  changeLost: 'The accounts went in late',
  warnKind: 'Using this fails Kind words only.',
  topicRow: 'Angela and Oscar are not speaking after a row about the figures.',
  topicDue: 'The accounts are due at five.',
  topicDwight: 'Dwight keeps saying Oscar is plotting against Angela, which keeps the row going.',
  topicMadeUp: 'Angela and Oscar are speaking again.',
  recapCall: 'Yesterday the vice president told the whole office that the branch may close on Friday.',
  recapNoCall: 'Yesterday nobody was there for Corporate\'s call, but the news that the branch may close got round anyway.',
  suggest: {
    announce: ['Angela and Oscar, please come to the conference room.'],
    whisper: ['Maybe I was wrong about Oscar.', 'Life is too short to stay angry.']
  }
};

// ── Wednesday: The Client ────────────────────────────────────────────────────

export const CLIENT = {
  title: 'The Client',
  intro: [
    "Mr Figgis of Figgis Hardware, the branch's biggest customer, comes at 10:30 to decide whether to sign for another year. Without him the branch has no chance on Friday.",
    'He is easily annoyed, and his patience starts running out the moment he walks in. Get him into a meeting with the right salesperson while he is still willing to talk business.'
  ],
  goal: {
    id: 'sign', title: 'Sign Mr Figgis', icon: 'coin',
    detail: "Get Mr Figgis and a salesperson together in the conference room (or Michael's office) for a while. Under 50 patience he will not talk business.",
    stamp: ['SIGNED', 'NO DEAL'] as [string, string], room: 'meeting' as const
  },
  hints: [
    'His card says what he loves and what he cannot stand.',
    'Not every salesperson suits him. Think about how each of them sells.',
    'Michael is sure he can close the deal himself. Give him something else to think about.',
    'A disaster anywhere near him costs patience.'
  ],
  help: [
    'As soon as he arrives, announce "Mr Figgis and Jim, please come to the conference room." Phyllis and Stanley work too.',
    'Andy tells jokes and Dwight shouts. Mr Figgis hates both, so they only win him over when he is in a very good mood.',
    'The Office Puppy in the room where he is cheers him up a lot. So does a dog brought in with Anything.',
    'Whisper anything to Michael and he stops bothering Mr Figgis.',
    'You can also tell a salesperson to take Mr Figgis to the conference room.'
  ],
  extras: [
    { id: 'dog', title: 'Dog person', icon: 'puppy', detail: 'Bring a dog to the room where Mr Figgis is.' },
    { id: 'michael', title: 'Keep Michael away', icon: 'door', detail: 'Michael never talks to Mr Figgis.' }
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
  arrives: 'Mr Figgis from Figgis Hardware walks in. His patience starts running out now.',
  arrivesLate: 'Mr Figgis from Figgis Hardware walks in. He has heard the accounts went in late yesterday, and his patience is already short.',
  waiting: 'waiting in reception',
  meddle: 'the deal he is sure he can close',
  meddled: 'Michael tells Mr Figgis a joke. Mr Figgis does not laugh.',
  fedUp50: 'Mr Figgis is getting fed up. Under 50 patience he will not talk business. Cheer him up first.',
  tooAnnoyed: 'Mr Figgis is too annoyed to talk business. Cheer him up first.',
  statusAnnoyed: (p: number) => `Patience ${p}: too annoyed to talk business`,
  statusPatience: (p: number) => `Patience ${p} (talks business from 50)`,
  statusPitch: (sales: string, s: number, of: number) => `${sales} pitching: ${s}s of ${of}`,
  meetingFact: (sales: string, room: string) => `Mr Figgis is in a meeting with ${sales} in ${room}, deciding whether to sign again.`,
  sitsDown: (sales: string, room: string) => `${sales} sits down with Mr Figgis in ${room}.`,
  pitchWhy: (sales: string) => `Mr Figgis has sat down with ${sales} to decide whether Figgis Hardware signs for another year. He wants a straight answer and a fair price.`,
  rough: {
    andy: 'Andy opens with a joke. Mr Figgis does not laugh.',
    dwight: 'Dwight raises his voice. Mr Figgis winces.'
  } as Record<string, string>,
  lostHim: (sales: string) => `${sales} has lost him. Mr Figgis has heard enough for now.`,
  takesOver: (sales: string, from: string) => `${sales} takes over from ${from}.`,
  pitch: {
    jim: [
      ['jim', 'Mr Figgis, same price as last year, and we deliver on Fridays. That is it.'],
      ['figgis', 'No speech? No jokes?'],
      ['jim', 'No jokes. Just paper.'],
      ['figgis', 'Good. That is what I came for.']
    ],
    phyllis: [
      ['phyllis', 'Mr Figgis, I know your shop. You need paper on time, at a fair price.'],
      ['figgis', 'Go on.'],
      ['phyllis', 'Same price as last year, and I will look after your orders myself.'],
      ['figgis', 'That is a straight answer. Thank you.']
    ],
    stanley: [
      ['stanley', 'Same price. Same paper. Sign here.'],
      ['figgis', 'That is it?'],
      ['stanley', 'That is it.'],
      ['figgis', 'Finally, someone who gets it.']
    ],
    andy: [
      ['andy', 'Mr Figgis! Why did the paper go to school? To get a little more ruled!'],
      ['figgis', 'I did not come here for jokes.'],
      ['andy', 'Ha. Right. Totally. So, about the price...'],
      ['figgis', 'Get to the point, young man.']
    ],
    dwight: [
      ['dwight', 'MR FIGGIS. OUR PAPER IS THE STRONGEST PAPER IN PENNSYLVANIA.'],
      ['figgis', 'Please stop shouting.'],
      ['dwight', 'I AM NOT SHOUTING. I AM SELLING.'],
      ['figgis', 'You are doing both.']
    ]
  } as Record<string, [string, string][]>,
  signed: 'Mr Figgis signed for another year.',
  signedRough: 'Mr Figgis signed for another year, mostly to make it stop.',
  signedFact: 'Figgis Hardware has signed for another year.',
  fedUp: 'Mr Figgis has had enough and walks out.',
  late: 'Mr Figgis has another appointment and leaves without signing.',
  goneFact: 'Figgis Hardware, the biggest customer, walked away without signing.',
  escort: (sales: string, room: string) => `${sales} takes Mr Figgis to ${room}.`,
  fetching: 'going to fetch Mr Figgis',
  dogAnything: 'Mr Figgis kneels down to pat the dog. For a moment he almost smiles.',
  warnDisaster: 'A disaster near Mr Figgis costs a lot of patience.',
  warnDisco: 'Loud music annoys Mr Figgis.',
  topicComing: 'Mr Figgis from Figgis Hardware is coming at half past ten to decide whether to sign again.',
  topicWaiting: 'Mr Figgis is waiting in reception and does not look happy.',
  topicSigned: 'Figgis Hardware signed for another year.',
  topicGone: 'Mr Figgis walked out without signing.',
  recapAccounts: 'Yesterday Angela and Oscar made up, and the accounts went in on time.',
  recapLate: 'Yesterday the accounts went in late, and Mr Figgis has heard about it.',
  changeWon: 'Figgis Hardware signed for another year',
  changeLost: 'Figgis Hardware walked away',
  suggest: {
    announce: ['Mr Figgis, please come to the conference room.'],
    whisper: ['I should look after Mr Figgis myself.', 'I have paperwork to finish in my office.']
  }
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
