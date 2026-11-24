// Every word the story says to the player, in one place. Plain words, short
// sentences, British English, no dashes for punctuation. Say who did what and
// what changed; a joke only ever comes after the fact.

import type { CastId } from '@/game/core/types';

export const STORY_TITLE = 'Closing Time';

// ── Monday: The Memo ─────────────────────────────────────────────────────────

const MEMO_COUNT = (others: number, michael: boolean): string => {
  if (!michael && others >= 9) return `${others} in the room. Only Michael is missing`;
  if (!michael) return `${others} of 9 staff in the room, and no Michael yet`;
  return `Michael and ${others} of 9 staff in the room`;
};

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
    'From about 12:30, announce "Everyone to the conference room, please." People called that late wait there until the call.',
    'Carry Michael into the room last, once the others are there. Left alone, he slips back to his office.',
    'Or whisper Michael a new idea that names the conference room. He stops hiding, and just before two he goes there by himself and waits.',
    'At about 10:20 Creed goes through Michael\'s bin. Whisper him something else to think about, or carry him away, and the memo stays secret.',
    'If the memo gets out: Kevin comes for food, Ryan comes when asked by name, and Kelly goes wherever Ryan goes.'
  ],
  extras: [
    { id: 'quiet', title: 'Quiet hands', icon: 'poke', detail: 'Win the call using only whispers, announcements and your own hand. No powers, no typed events and no orders.' },
    { id: 'full', title: 'Full room', icon: 'people', detail: '12 or more others in the room when the phone rings.' }
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
  /** The live head count: how many are in the room, and who is still missing. */
  count: MEMO_COUNT,
  late: (others: number, michael: boolean) => `It is 14:45. ${MEMO_COUNT(others, michael)}. At 15:00 the vice president gives up.`,
  slipBack: 'Michael slips back to his office.',
  freed: 'Michael stops hiding and comes out of his office.',
  freedForCall: 'Michael stops hiding. He means to be in the conference room for the call.',
  toCall: 'heading to the conference room for the call',
  atCall: 'waiting in the conference room for the call',
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
  /** What the vice president found at 15:00, from who was actually in the room. */
  missed: (others: number, michael: boolean): string => {
    const staff = others === 1 ? '1 of the staff' : `${others} of the staff`;
    if (others >= 9 && !michael) return `At 15:00 the vice president phoned the conference room. ${others} of the staff were waiting, but Michael was not there, so he hung up after a minute.`;
    if (michael && others > 0) return `At 15:00 the vice president phoned the conference room. He found Michael and only ${staff}, and hung up after a minute.`;
    if (michael) return 'At 15:00 the vice president phoned the conference room. He found Michael on his own, and hung up after a minute.';
    if (others > 0) return `At 15:00 the vice president phoned the conference room. He found only ${staff} and no Michael, and hung up after a minute.`;
    return 'At 15:00 the vice president phoned an empty conference room and hung up after a minute.';
  },
  lockedOut: 'After being shut in the conference room, Michael gives up on hiding. He stays there.',
  changeWon: 'The call with Corporate went ahead',
  changeLost: 'The call with Corporate was missed',
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
    whisper: [
      { text: 'Hiding will not make this go away.', for: ['michael'] as CastId[] },
      { text: 'I should be in the conference room at two.', for: ['michael'] as CastId[], help: true },
      { text: 'I should water the plants today.', for: ['creed'] as CastId[], help: true }
    ]
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
  talkPushed: (n: number) => `Angela and Oscar have a proper talk, and it goes well. That is ${Math.min(3, n)} of 3.`,
  talkChat: 'Angela and Oscar exchange a few polite words. That counts as half a talk.',
  talkFace: 'Set down face to face, Angela and Oscar manage a few stiff words. That counts as half a talk.',
  /** The talks themselves, by how far the thaw has got: who walked over speaks first. */
  talks: [
    {
      angela: ['Oscar. I have checked my figures twice.', 'So have I. One of us is wrong, and I would like to know which.'],
      oscar: ['Angela. Your total and mine are forty dollars apart.', 'I am aware. Mine is the correct one.']
    },
    {
      angela: ['Show me where your number comes from.', 'Line twelve. Bring your own pencil.'],
      oscar: ['Can I see how you got your total?', 'You may look. You may not touch.']
    },
    {
      angela: ['It was the postage. We both missed it.', 'We did. I am glad you said "we".'],
      oscar: ['I found it. It was the postage, on both sheets.', 'Then we were both wrong. I can live with that.']
    }
  ] as { angela: [string, string]; oscar: [string, string] }[],
  face: { first: 'Oscar.', second: 'Angela.' },
  lostWhy: (talks: number, dwight: boolean, kevin: boolean): string => {
    const n = Math.floor(talks);
    const got = n === 0 ? 'Angela and Oscar never had one good talk' : `Angela and Oscar had ${n} good ${n === 1 ? 'talk' : 'talks'} of the 3 they needed`;
    const stir = dwight ? ' Dwight was still warning Angela about Oscar.' : kevin ? ' Kevin was still worrying Oscar about the deadline.' : '';
    return `${got}.${stir}`;
  },
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
  recapNoCall: 'Yesterday the office missed Corporate\'s call, but the news that the branch may close got round anyway.',
  suggest: {
    announce: ['Angela and Oscar, please come to the conference room.'],
    whisper: [
      { text: 'Life is too short to stay angry with Oscar.', for: ['angela'] as CastId[] },
      { text: 'Life is too short to stay angry with Angela.', for: ['oscar'] as CastId[] },
      { text: 'Maybe I was wrong about Oscar.', for: ['dwight'] as CastId[], help: true },
      { text: 'The accounts will be fine. No need to worry Oscar.', for: ['kevin'] as CastId[], help: true }
    ]
  }
};

// ── Wednesday: The Client ────────────────────────────────────────────────────

export const CLIENT = {
  title: 'The Client',
  intro: [
    "Mr Figgis of Figgis Hardware, the branch's biggest customer, comes at 10:30 to decide whether to sign for another year. Losing him would count against the branch on Friday.",
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
  statusPitch: (sales: string, s: number, of: number) => `${sales} pitching: ${s} of ${of} seconds`,
  meetingFact: (sales: string, room: string) => `Mr Figgis is in a meeting with ${sales} in ${room}, deciding whether to sign again.`,
  sitsDown: (sales: string, room: string) => `${sales} starts the pitch to Mr Figgis in ${room}.`,
  balloons: 'Michael has tied welcome balloons by the front door for Mr Figgis.',
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
    announce: [{ text: 'Mr Figgis and Stanley, please come to the conference room.', help: true }],
    whisper: [
      { text: 'I should look after Mr Figgis myself.', for: ['stanley', 'jim', 'phyllis', 'andy', 'dwight'] as CastId[] },
      { text: 'I have paperwork to finish in my office.', for: ['michael'] as CastId[], help: true }
    ]
  }
};

// ── Thursday: The Leak ───────────────────────────────────────────────────────

/** What each person brings to Thursday: as the leak, as an innocent with something to hide, or as someone running an errand. */
export interface LeakPerson {
  /** Why they did it, as one plain sentence about them ("He was building his brand with head office."). */
  motive: string;
  /** What they say when caught. */
  confession: string;
  /** Their private thoughts once the leak has started (in their voice; never a plain confession). */
  thoughts: string[];
  /** What they shout when wrongly accused, or say under Truth Serum when innocent. */
  denial: string;
  /** Nervous thoughts about their own, unrelated secret (an innocent who looks guilty). */
  secret: string[];
  /** Their reason for going to the fax machine as an innocent. */
  errand: string;
}

const LEAK_PEOPLE: Record<CastId, LeakPerson> = {
  michael: {
    motive: 'He wanted Corporate to know how hard he works.',
    confession: 'Okay. It was me. I just wanted Corporate to see how great I am.',
    thoughts: ['If they could see me now, they would give me a medal.', 'Head office needs to hear my side. My good side.'],
    denial: 'Me? Never. This office is my family. Also, I cannot work the fax machine.',
    secret: ['If anyone finds the drawer of spare mugs, I am done.', "World's Best Boss. It says so on the mug. All six mugs."],
    errand: 'Faxing my autograph to head office. They did not ask, but still.'
  },
  jim: {
    motive: 'It started as a prank on Dwight, and then Corporate started writing back.',
    confession: 'Okay. It was me. It started as a prank on Dwight, and then Corporate wrote back.',
    thoughts: ['Dwight will never work out where the stories came from.', 'One more page about the beet farm, then I stop. Probably.', 'Is it still a prank if someone at head office takes notes?', 'Keep a straight face. Look at the camera. There is no camera.'],
    denial: 'Me? I do not even know how the fax machine works. Ask Dwight, he has a manual.',
    secret: ['If Dwight finds my list of pranks, I am a dead man.', 'Note to self: move the prank list out of my drawer.'],
    errand: 'Faxing the Lackawanna order. Why do they still want faxes?'
  },
  pam: {
    motive: 'She wanted someone at Corporate to see what reception puts up with.',
    confession: 'It was me. I wanted someone at Corporate to see what reception puts up with.',
    thoughts: ['Someone up there should know what really happens at reception.', 'They cannot fire the person who answers the phone. Can they?', 'I will draw them a diagram next time.', 'Smile. Answer the phone. Nobody suspects the receptionist.'],
    denial: 'I answer the phones. I do not go behind anyone\'s back.',
    secret: ['If anyone sees my comic of the office, nobody will speak to me again.', 'I should never have drawn Angela as a cat.'],
    errand: 'Faxing the delivery note for the paper. Again.'
  },
  dwight: {
    motive: 'He was reporting every breach of the rules, as he sees it as his duty.',
    confession: 'Yes! It was me! I was reporting breaches of the rules, as is my duty!',
    thoughts: ['Breach number forty-one: Jim moved my stapler. It must be recorded.', 'A full report, in triplicate. As the rules demand.', 'When this is over, they will remember who kept the records.', 'Remember to include the photograph of Kevin\'s chilli.'],
    denial: 'I would never! I report breaches to Michael, in person, in writing, twice.',
    secret: ['If they find the beets in the ceiling, my preparations are ruined.', 'Supply cache seven may be compromised. Move it tonight.'],
    errand: 'Faxing my security report to myself, for the records.'
  },
  kevin: {
    motive: 'Someone at Corporate promised cookies to whoever kept them informed.',
    confession: 'Okay, it was me. They said they would send cookies.',
    thoughts: ['They said there might be cookies.', 'If I send three more, do I get a bigger box?', 'Nobody ever suspects the guy at the snack drawer.', 'I hope the cookies have chocolate chips.'],
    denial: 'Me? I can barely send an email. I tried once and it went to my mum.',
    secret: ['Nobody can know how big my snack drawer really is.', 'If they open my second drawer, they will find out its name.'],
    errand: 'Faxing the vending machine company. They owe me a chocolate bar.'
  },
  angela: {
    motive: 'She decided Corporate deserved an honest account of everyone\'s conduct.',
    confession: 'Fine. It was me. Somebody had to tell Corporate how disgracefully everyone behaves.',
    thoughts: ['Somebody has to tell them how this office really behaves.', 'Item twelve: Meredith\'s lunch break. Again.', 'A proper report, with dates. They will appreciate that.', 'If they read page six, Oscar is finished.'],
    denial: 'How dare you. I report people to their faces, as any decent person would.',
    secret: ['Nobody must know about Dwight and me. Nobody.', 'Did anyone see me smile at Dwight? I must be more careful.'],
    errand: 'Faxing the receipts. Properly filed, unlike some people\'s.'
  },
  oscar: {
    motive: 'He wanted Corporate to see the accounting errors before anyone blamed him for them.',
    confession: 'All right, it was me. I wanted Corporate to see the errors before they blamed me for them.',
    thoughts: ['If they saw the real figures, they would understand.', 'Someone had to tell them about the rounding.', 'It is not gossip if it has footnotes.', 'Act normal. Normal accountants love spreadsheets.'],
    denial: 'I keep notes about this office, yes. For my book club. Not for Corporate.',
    secret: ['If anyone finds my notes for the book club, I am finished.', 'The book club is going to love today.'],
    errand: 'Faxing a form to the tax office. Old fashioned, but secure.'
  },
  stanley: {
    motive: 'He hoped Corporate would close the branch early, so he could retire.',
    confession: 'Yes, it was me. I was hoping they would close us early. I have a boat to get to.',
    thoughts: ['If they close us, I retire early. Everyone wins.', 'Boat. Sunshine. No more meetings.', 'Nobody suspects the man doing the crossword.', 'Maybe it is all over by Christmas.'],
    denial: 'I do not even email my wife. I am not emailing Corporate.',
    secret: ['Two hundred and eleven days. Not that anyone is counting.', 'If they see the calendar in my drawer, they will know I am counting.'],
    errand: 'Faxing my holiday form. In ink.'
  },
  phyllis: {
    motive: 'She loves a good story, and Corporate turned out to be the best audience she ever had.',
    confession: 'I am not one to gossip, dear. I just wrote it all down and sent it to Corporate.',
    thoughts: ['Bob says they deserve to know.', 'I am not gossiping. I am informing.', 'They will love the bit about the conference room.', 'Knit one, purl one, and nobody suspects a thing.'],
    denial: 'Me, dear? I only tell Bob. Bob does not count.',
    secret: ['If anyone finds out where the rumours start, I will have to stop.', 'That rumour about Toby went better than I hoped.'],
    errand: 'Faxing Bob\'s order for the fridge shop.'
  },
  andy: {
    motive: 'He wanted Corporate to notice him before anyone else got Michael\'s job.',
    confession: 'Guilty. I wanted Corporate to notice me before somebody else got Michael\'s job.',
    thoughts: ['When Michael goes, someone has to step up. Ahem.', 'Head office should know who the real leader is around here.', 'Nard Dog, keep it together. Act natural.', 'Future regional manager, here. Just saying.'],
    denial: 'Me? I went to Cornell. We do not leak, we network.',
    secret: ['If anyone sees my list of compliments, I will never live it down.', 'Practise the compliment for Jim again. Natural. Breezy.'],
    errand: 'Faxing the rehearsal times for my singing group. Important.'
  },
  kelly: {
    motive: 'She thought the office deserved an audience, and Corporate read every word.',
    confession: 'Fine! It was me! Somebody had to tell them what goes on here!',
    thoughts: ['This is better than any celebrity gossip, honestly.', 'If I stop now, who will tell them about Ryan\'s start-up?', 'Act normal. You are a normal person who loves the fax machine.', 'They are going to die when they read the next one.'],
    denial: 'Excuse me? I tell everyone everything to their faces. Ask anyone.',
    secret: ['If Ryan sees my wedding board, I will literally die.', 'Nobody can know I have already picked the flowers.'],
    errand: 'Faxing my returns form. The shoes were the wrong pink.'
  },
  ryan: {
    motive: 'He was building his brand with head office.',
    confession: 'Okay, yes. I was building my brand with head office.',
    thoughts: ['Head office will remember who told them the truth.', 'This is basically networking.', 'They need disruptors up there. That is me.', 'When this place closes, I will already have a desk upstairs.'],
    denial: 'Me? I am a visionary. Visionaries do not send faxes.',
    secret: ['If anyone asks how many customers my start-up has, change the subject.', 'It is in stealth. It is not failing. It is stealth.'],
    errand: 'Faxing my business plan to an investor. Old school is disruptive now.'
  },
  toby: {
    motive: 'He just wanted someone at Corporate to listen to him for once.',
    confession: 'It was me. I just wanted someone at Corporate to listen for once.',
    thoughts: ['Maybe someone up there will finally do something about Michael.', 'Someone has to keep a record. That is my job, technically.', 'Nobody listens to HR. Maybe they will.', 'Keep calm. You are just a man near a fax machine.'],
    denial: 'I am in HR. If I had a complaint, I would file it properly. And nobody would read it.',
    secret: ['If anyone reads my novel, the regional manager chapter is going to look bad.', 'Chapter twelve needs a better murder weapon. The stapler?'],
    errand: 'Faxing the new safety forms. Nobody reads them, but still.'
  },
  creed: {
    motive: 'Nobody is quite sure. He says Corporate pays in cash.',
    confession: 'Guilty. I also fax the coastguard. And a man called Gary.',
    thoughts: ['They pay in cash. My favourite kind of customer.', 'Was it head office or the coastguard today? Does not matter.', 'Nobody notices Creed. That is the trick.', 'Should I mention the bees? I should mention the bees.'],
    denial: 'I have never been to Corporate. I have never been anywhere. Check my passports.',
    secret: ['If they ask for my real name, which one do I give?', 'Remember: today you are Creed. Tomorrow, who knows.'],
    errand: 'Faxing something to someone. It is fine. It is a fax.'
  },
  meredith: {
    motive: 'She had money on how long the branch would last.',
    confession: 'Fine, it was me. I had money on how long this place would last.',
    thoughts: ['If they close us by Friday, I win the pool.', 'Odds are looking good this week.', 'Nobody suspects the betting pool champion.', 'Keep it quiet. Six wins in a row.'],
    denial: 'Me? I cannot even find my car keys before noon.',
    secret: ['If anyone finds out I run the betting pool, I am buying drinks for life.', 'Six wins in a row. Nobody can know.'],
    errand: 'Faxing my expenses. They are mostly fine.'
  }
};

const listNames = (names: string[]): string => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export const LEAK = {
  title: 'The Leak',
  intro: [
    "Someone in the office has been sending Corporate the worst moments of the week, page by page, from the fax machine in the annex.",
    'Every time one of their pages goes, the fax machine beeps. Work out who it is and accuse them from their card in People. You have two tries, and a wrong accusation turns the office against someone innocent.'
  ],
  goal: {
    id: 'leak', title: 'Find the leak', icon: 'accuse', stamp: ['LEAK FOUND', 'LEAK ESCAPED'] as [string, string], room: 'annex' as const,
    detail: 'Before 17:00, accuse the person who keeps faxing Corporate. Two tries.'
  },
  hints: [
    'Everyone uses the fax machine now and then. Only the leak\'s pages make it beep.',
    'When it beeps, look at who is at the fax machine. Kevin and Toby sit in the annex and see who comes and goes.',
    'Private thoughts can give someone away, but people hide other things too.',
    'Truth Serum makes someone unable to lie. Today it costs 4.'
  ],
  help: [
    'When the fax machine beeps, pause and open People: anyone "at the fax machine" is a suspect. The leak is there at every beep.',
    'After a beep, tap Kevin or Toby: they think about who they saw at the fax machine.',
    'Use Paranoia on a suspect once a page has gone: the leak runs to the fax machine to tear up the log.',
    'Tell someone to keep an eye on the fax machine: they report who they see at the next beep.'
  ],
  extras: [
    { id: 'firstTry', title: 'First try', icon: 'accuse', detail: 'Catch the leak with your first accusation.' },
    { id: 'quick', title: 'Before the second page', icon: 'clock', detail: 'Catch the leak before the fax machine beeps a second time.' }
  ],
  suggest: {
    whisper: ['I should keep an eye on the fax machine today.', 'Who keeps using that fax machine?', 'Corporate will find out who is behind this.'],
    announce: ['Corporate is tracing every fax sent from this office.', 'Whoever is faxing Corporate: we know who you are.']
  },
  /** Everyone except Michael could be the leak. */
  candidates: ['jim', 'pam', 'dwight', 'kevin', 'angela', 'oscar', 'stanley', 'phyllis', 'andy', 'kelly', 'ryan', 'toby', 'creed', 'meredith'] as CastId[],
  /** Kevin and Toby sit in the annex: after a beep they think about who they saw. */
  witnesses: ['kevin', 'toby'] as CastId[],
  people: LEAK_PEOPLE,
  person: (id: CastId): LeakPerson => LEAK_PEOPLE[id] ?? LEAK_PEOPLE.creed,
  /** For the model only (at most 300 characters). */
  hidden: (name: string, motive: string) => `Secretly, ${name} has been faxing Corporate about the office from the fax machine in the annex. ${motive} ${name} hides it, gets nervous when Corporate or faxes come up, and admits it only if unable to lie.`,
  nervousNote: (name: string, secret: string) => `${name} is jumpy today about something else entirely: ${secret}. ${name} changes the subject whenever secrets come up, but has never sent anything to Corporate.`,
  fact: "Someone in the office has been faxing Corporate behind everyone's back. Every time a page goes, the fax machine in the annex beeps.",
  fax: { doing: 'going to the fax machine', stay: 'at the fax machine' },
  shred: { doing: 'hurrying to the fax machine', stay: 'tearing up the fax log' },
  watch: { doing: 'going to watch the fax machine', stay: 'keeping an eye on the fax machine' },
  beep: (n: number, time: string) => n === 1
    ? `The fax machine in the annex beeped at ${time}. A page just went to Corporate. Who is at the fax machine right now?`
    : `The fax machine in the annex beeped at ${time}. Another page just went to Corporate.`,
  beepLog: (time: string) => `${time}: the fax machine beeped.`,
  beepsFact: (n: number) => `The fax machine in the annex has beeped ${n === 1 ? 'once' : `${n} times`} today. Every beep is another page to Corporate.`,
  /** A witness at an annex desk thinks about who was at the fax machine (as true as they are). */
  witness: (who: CastId, names: string[]) => {
    const base = names.length ? `${listNames(names)} ${names.length > 1 ? 'were' : 'was'} at the fax machine when it beeped.` : 'Nobody was at the fax machine when it beeped. Odd.';
    return who === 'kevin' ? `${base} I think. I was eating.` : who === 'toby' ? `${base} I will make a note.` : base;
  },
  /** An informant reports what they saw. */
  report: (names: string[]) => (names.length ? `I was watching. ${listNames(names)} ${names.length > 1 ? 'were' : 'was'} at the fax machine when it beeped.` : 'I was watching. Nobody was at the fax machine when it beeped.'),
  vagueReport: 'I was watching the fax machine. Someone was there. They had a face.',
  dwightReport: 'I was watching. It was Jim. It is always Jim.',
  informant: (name: string) => `${name} goes to keep an eye on the fax machine.`,
  pointed: 'A few people suddenly look very uneasy.',
  shredding: (name: string) => `${name} hurries to the fax machine and starts tearing up the fax log.`,
  noShred: (name: string) => `${name} panics, but never goes near the fax machine.`,
  confessed: (name: string) => `${name} cannot lie right now, and confesses to faxing Corporate.`,
  ruledOut: (name: string, pronoun: string) => `${name} cannot lie right now, and says plainly that ${pronoun} has never sent Corporate anything.`,
  exposed: (name: string) => `Every computer pings: ${name}'s faxes to Corporate have just gone to the whole office. Everyone knows who the leak is.`,
  notInIt: (name: string) => `Nothing in ${name}'s secret has anything to do with Corporate. ${name} is not the leak.`,
  label: 'Accuse of leaking',
  right: (name: string) => `${name} admits faxing Corporate.`,
  motiveLine: (motive: string) => `Why: ${motive.charAt(0).toLowerCase()}${motive.slice(1)}`,
  caughtWhy: (name: string, motive: string) => `${name} has just been caught faxing Corporate behind everyone's back, and admits it. ${motive}`,
  caughtFact: (name: string) => `${name} was caught faxing Corporate behind everyone's back.`,
  reactions: ['So that is why the fax machine was always warm.', 'All this time? Wow.', 'I knew it was someone. I just did not know who.', 'I am not even surprised.'],
  wrong: (name: string) => `${name} had nothing to do with it, and is not happy about being blamed. The office turns on ${name}.`,
  wrongNote: 'blamed for the leak',
  wrongFact: (name: string) => `${name} was wrongly accused of faxing Corporate today.`,
  tries: (n: number) => (n === 1 ? '1 try left' : `${n} tries left`),
  status: (beeps: number, ruled: number) => `Beeps: ${beeps} · ruled out: ${ruled}`,
  outOfTries: 'Two wrong accusations. The leaks go on.',
  nobody: 'Nobody was caught. The leaks go on.',
  itWas: (name: string, pronoun: string, times: string[]) => times.length
    ? `It was ${name} all along: ${pronoun} was at the fax machine when it beeped at ${listNames(times)}.`
    : `It was ${name} all along.`,
  notCaughtFact: 'Nobody found out who has been faxing Corporate.',
  warns: {
    secretLeak: 'Today this sends one person\'s secret to everyone. On the leak, it exposes them. On anyone else, an innocent secret gets out.',
    announce: 'Mentioning Corporate or the fax over the loudspeaker makes the leak lie low for a while.'
  },
  // Worded so the small talk files them under the leak ("leak", "fax", "emailing Corporate").
  topics: {
    start: 'Someone has been leaking office gossip to Corporate by fax. People are wondering who.',
    beeps: 'The fax machine keeps beeping. Someone is leaking pages to Corporate.',
    wronged: (name: string) => `${name} was accused of being the leak, and it was not true.`
  },
  recapBusy: 'Figgis Hardware walked away yesterday, and the leak has plenty to report: the fax machine will be busy today.',
  recapQuiet: 'Figgis Hardware signed yesterday, so the leak has less to report: the fax machine will be quieter today.',
  changeWon: 'The leak was caught',
  changeLost: 'The leak was never caught'
};

// ── Friday: The Verdict ──────────────────────────────────────────────────────

export const VERDICT = {
  title: 'The Verdict',
  intro: [
    "Today Corporate decides. Their inspector arrives at 13:00 to tour the bullpen, the accounting corner and Michael's office, and to write down what he sees.",
    'Make the office look worth keeping while he tours: people at their desks, no disasters, and Michael waiting in his office at the end. Michael has other plans.'
  ],
  goal: {
    id: 'inspection', title: 'Pass the inspection', icon: 'inspector', stamp: ['PASSED', 'FAILED'] as [string, string], room: 'boss' as const,
    detail: "Score 60 or more on the inspector's tour from 13:00: desks in the bullpen 30, accounting desks 20, Michael in his office 30, no incidents 20."
  },
  hints: [
    'Michael is sure today is the day for a farewell speech in the break room. If he gives it during the tour, everyone goes to listen. His card shows what he is sure of.',
    'Only an idea about the speech, the inspector or his office will change his mind.',
    'Trouble is brewing for the tour. The captions say who is up to what before the inspector arrives.',
    'A disaster during the tour costs the 20 points for no incidents.'
  ],
  help: [
    'Whisper to Michael: "My farewell speech can wait until the inspector has gone. I should wait in my office." That stops the speech and keeps him in his office.',
    'Deal with each problem before the inspector reaches it: whisper to the person, pick them up, or use a power on them.',
    'If the speech starts anyway, announce "Everyone back to your desks" to pull the listeners back.'
  ],
  extras: [
    { id: 'ovation', title: 'Standing ovation', icon: 'announce', detail: 'Let Michael give his farewell speech after the inspector has gone, with at least 8 people listening.' },
    { id: 'spotless', title: 'Spotless tour', icon: 'check', detail: 'Score 90 or more on the inspection.' }
  ],
  suggest: {
    whisper: [
      { text: 'Is today really the day for a farewell speech?', for: ['michael'] as CastId[] },
      { text: 'My farewell speech can wait until the inspector has gone.', for: ['michael'] as CastId[], help: true },
      { text: 'I should wait in my office for the inspector.', for: ['michael'] as CastId[], help: true },
      { text: 'Security can wait. I should be at my desk.', for: ['dwight'] as CastId[], help: true }
    ],
    announce: ['Everyone back to your desks, the inspector is here!']
  },
  locked: 'Corporate is sending its own inspector today.',
  conviction: 'Today is the day to give a farewell speech in the break room.',
  officeConviction: 'I should wait in my office for the inspector.',
  practising: 'practising a farewell speech',
  hurrying: 'hurrying to the break room to give his speech',
  goingOffice: 'going to wait in his office',
  waitingOffice: 'waiting in his office for the inspector',
  fact: "Corporate's inspector arrives at 13:00 to decide whether this branch stays open. Michael plans a farewell speech.",
  before: 'The inspector comes at 13:00',
  talkedOut: 'Michael decides the speech can wait. He stops rehearsing it.',
  postponed: 'Michael decides to give his farewell speech after the inspector has gone.',
  stillSpeech: 'Michael likes the idea, but he is still set on giving his farewell speech today.',
  ignoresAnnounce: 'Michael does not move: he is busy rehearsing his farewell speech.',
  speech: 'Michael stands on a chair in the break room and calls everyone in for his farewell speech.',
  speechAfter: 'The inspector has gone. Michael stands on a chair in the break room and calls everyone in for his farewell speech.',
  speechLines: [
    'I have been your boss for a long time. Longer than some marriages.',
    'Whatever Corporate says, you will always be my family.'
  ],
  speechReply: { who: 'kevin', text: 'I am not crying. You are crying.' },
  speechWhy: 'Michael is giving a tearful farewell speech in the break room.',
  listening: "listening to Michael's farewell speech",
  goingToListen: "going to hear Michael's farewell speech",
  giving: 'giving a farewell speech',
  ovation: (n: number) => `${n} people listened to Michael's farewell speech, and they clapped.`,
  recall: 'Everyone hurries back to their desk.',
  recallDoing: 'hurrying back to the desk for the inspector',
  arrives: 'The inspector from Corporate arrives at the front door, right on time, with a clipboard.',
  cake: 'Michael has put a farewell cake and balloons in the break room, in case today is the last day.',
  stop: (n: number) => `Stop ${n} of 3`,
  score: (n: number) => `Score ${n}`,
  bullpen: (n: number, of: number, pts: number) => `Bullpen: ${n} of ${of} at their desks. ${pts} of 30.`,
  accounting: (n: number, of: number, pts: number) => `Accounting corner: ${n} of ${of} at their desks. ${pts} of 20.`,
  michael: (there: boolean) => (there ? "Michael's office: Michael was waiting for him. 30 of 30." : "Michael's office: Michael was not there. 0 of 30."),
  dangling: "Michael's office: Michael was dangling in mid-air. The inspector wrote that down. Minus 15.",
  calm: (ok: boolean) => (ok ? 'No incidents during the tour. 20 of 20.' : 'An incident during the tour. 0 of 20.'),
  passed: (n: number) => `The inspector took his notes and left. The office scored ${n} out of 100, enough to pass.`,
  failed: (n: number) => `The inspector took his notes and left. The office scored ${n} out of 100. It needed 60.`,
  never: 'The inspector never got round the office.',
  after: (n: number) => `The inspector has been and gone. The office scored ${n} out of 100. Corporate decides tonight.`,
  // The week's leftovers.
  apology: (name: string) => `${name}, caught yesterday, has sent Corporate an apology praising the branch. Plus 10.`,
  figgisNote: "Mr Figgis's thank-you note is pinned up in reception for the inspector to see. Plus 5.",
  boxes: [
    { who: 'stanley', text: 'I packed on Monday. Saves time.' },
    { who: 'jim', text: 'Stanley, it is not over.' },
    { who: 'stanley', text: 'It is for this box.' }
  ],
  problems: {
    dwight: {
      start: 'Dwight has made himself head of security. He plans to search the inspector at the front door.',
      conviction: 'I must search the inspector at the front door. Security comes first.',
      going: 'going to search the inspector',
      failed: 'Dwight searched the inspector at the front door. The inspector wrote it down. Minus 15.',
      lines: [{ who: 'dwight', text: 'Arms up. This is a random security check.' }, { who: 'visitor:inspector', text: 'I will be noting that.' }],
      fixed: {
        talk: 'Dwight forgets about the security check and gets back to work.',
        pickup: 'Dwight is too dizzy to search anyone, and sits back down at his desk.',
        power: 'Dwight is in no state to search anyone.'
      }
    },
    row: {
      start: "Angela and Oscar have started arguing about Tuesday's figures in the accounting corner. The inspector will see it at his second stop.",
      doing: 'arguing about the figures',
      lines: [{ who: 'angela', text: 'Your figures were wrong on Tuesday, Oscar, and they are wrong today.' }, { who: 'oscar', text: 'My figures are fine. Your adding is the problem.' }],
      failed: 'The inspector watched Angela and Oscar argue about the figures. Minus 15.',
      fixed: { talk: 'Angela and Oscar stop arguing and go back to their desks.', pickup: 'Angela and Oscar stop arguing.', power: 'Angela and Oscar stop arguing.' }
    },
    leak: {
      start: (name: string) => `Nobody caught ${name} yesterday. ${name} is planning one last page to Corporate during the tour, right under the inspector's nose.`,
      going: 'sneaking to the fax machine',
      sending: 'sending one last page to Corporate',
      failed: (name: string) => `${name}'s last page reached Corporate during the tour. Minus 10.`,
      fixed: (name: string) => `${name} gives up on the last page.`
    },
    sulk: {
      start: (name: string) => `${name} is still hurt about being blamed yesterday, and is sulking in the break room instead of working.`,
      doing: 'sulking in the break room',
      fixed: (name: string) => `${name} feels better and goes back to work.`
    }
  },
  topics: {
    before: 'The inspector comes at one. This may be the last day.',
    speech: 'Michael is planning a farewell speech for today.',
    tour: 'The inspector from Corporate is touring the office with a clipboard.'
  },
  warns: {
    disaster: 'A disaster during the tour costs the 20 points for no incidents.'
  },
  recap: {
    caught: (name: string) => `${name} was caught leaking yesterday, and has already sent Corporate an apology.`,
    escaped: (name: string) => `Nobody caught ${name} leaking yesterday, and ${name} may try one more page during the tour.`,
    wronged: (name: string) => `${name} is still hurt about being blamed yesterday.`,
    row: "Angela and Oscar are still arguing about Tuesday's figures.",
    calm: 'Angela and Oscar made up on Tuesday, so the accounting corner is calm.',
    figgis: "Mr Figgis's thank-you note is up in reception."
  },
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
export const ENDING_RULE = 'After Friday: 75 or more and a passed inspection keeps the branch open. Under 45 closes it. In between, it stays open with cuts.';

export const NOT_ENOUGH = (cost: number, left: number): string => `Not enough influence: this costs ${cost}, you have ${left}.`;
export const LOCKED_TODAY = 'Not available today.';

export interface WeekRecap {
  call?: boolean;
  accounts?: boolean;
  figgis?: boolean;
  leakName?: string;
  leakFound?: boolean;
  inspection?: number;
  /** Friday's inspection passed. */
  fridayWon?: boolean;
  /** Standing was high enough to stay open, but the inspection failed. */
  lostOnFriday?: boolean;
}

/** "a, b and c" */
function joinAnd(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const capFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** What went right and what went wrong this week, as short noun phrases. */
function weekParts(w: WeekRecap): { good: string[]; bad: string[] } {
  const good: string[] = [];
  const bad: string[] = [];
  const add = (v: boolean | undefined, yes: string, no: string): void => {
    if (v === true) good.push(yes);
    else if (v === false) bad.push(no);
  };
  add(w.call, "Monday's call with the whole office there", "Monday's missed call");
  add(w.accounts, 'the accounts arriving on time', 'the late accounts');
  add(w.figgis, 'the Figgis Hardware order', 'losing Figgis Hardware');
  if (w.leakName) add(w.leakFound, `catching ${w.leakName} leaking`, `the leak nobody caught`);
  if (w.inspection !== undefined) add(w.fridayWon, 'a good inspection', 'a poor inspection');
  return { good, bad };
}

/** One honest sentence on why the week ended the way it did ("thanks to" / "despite"). */
function weekLine(id: 'saved' | 'scraped' | 'closed', w: WeekRecap): string {
  const { good, bad } = weekParts(w);
  const g = joinAnd(good);
  const b = joinAnd(bad);
  if (id === 'saved') {
    if (!bad.length) return `${capFirst(g)}: it was a week to remember.`;
    return `Thanks to ${g}, Corporate could overlook ${b}.`;
  }
  if (id === 'scraped') {
    if (w.lostOnFriday) {
      return `The week had gone well, with ${g}, but the inspection had not, and Corporate does not overlook a poor inspection.`;
    }
    if (!good.length) return `${capFirst(b)} nearly finished the branch off.`;
    if (!bad.length) return `${capFirst(g)} kept the branch alive.`;
    return `${capFirst(g)} kept the branch alive, despite ${b}.`;
  }
  if (!good.length) return `${capFirst(b)} were too much for Corporate.`;
  if (!bad.length) return `${capFirst(g)} were not enough for Corporate.`;
  return `${capFirst(g)} ${good.length > 1 ? 'were' : 'was'} not enough: ${b} ${bad.length > 1 ? 'were' : 'was'} too much for Corporate.`;
}

export function endingText(id: 'saved' | 'scraped' | 'closed', w: WeekRecap): { title: string; text: string[] } {
  const inspected = w.inspection !== undefined ? `The inspector gave the office ${w.inspection} out of 100.` : '';
  const week = weekLine(id, w);
  switch (id) {
    case 'saved':
      return {
        title: 'THE BRANCH STAYS OPEN',
        text: [
          `On Friday evening Corporate rang to say the Scranton branch stays open. ${inspected}`.trim(),
          week,
          'Michael called everyone into the conference room to celebrate. For once, nobody minded.'
        ]
      };
    case 'scraped':
      return {
        title: 'OPEN, JUST',
        text: [
          `Corporate is keeping the Scranton branch open, but only just. ${inspected}`.trim(),
          week,
          'The budget is cut in half and Michael is on probation. He has already planned a probation party.'
        ]
      };
    default:
      return {
        title: 'CLOSING TIME',
        text: [
          `Corporate is closing the Scranton branch. ${inspected}`.trim(),
          week,
          'The staff packed their desks into boxes. Dwight took three staplers. Michael says this is not goodbye, it is see you later.'
        ]
      };
  }
}

/** What the week's data says about a few people, for the ending card (3 to 5 lines). */
export interface EpilogueFacts {
  leakName?: string;
  leakFound?: boolean;
  accounts?: boolean;
  figgis?: boolean;
  speech?: 'during' | 'after' | 'quiet' | 'never';
  wrongedName?: string;
  carried?: { name: string; times: number };
  whispers: number;
  announcements: number;
  powers: number;
}

export function epilogueLines(f: EpilogueFacts): string[] {
  const out: string[] = [];
  if (f.leakName) {
    out.push(f.leakFound
      ? `${f.leakName} has been moved to a desk with no fax machine in sight.`
      : `${f.leakName} still sends Corporate a page now and then. Nobody knows, except you.`);
  }
  if (f.carried && f.carried.times >= 3) out.push(`${f.carried.name} was picked up ${f.carried.times} times this week, and now keeps one hand on the desk at all times.`);
  if (f.wrongedName) out.push(`${f.wrongedName} has forgiven the office for Thursday's accusation. Mostly.`);
  if (f.speech === 'after') out.push("Michael's farewell speech got a standing ovation. He offers to give it again every Friday.");
  else if (f.speech === 'quiet') out.push("Michael gave his farewell speech to a nearly empty break room. He says it went well.");
  else if (f.speech === 'during') out.push("The inspector's report has a whole page on Michael's farewell speech.");
  else if (f.speech === 'never') out.push("Michael never gave his farewell speech. It is still in his desk drawer, just in case.");
  if (f.accounts === true) out.push("Angela and Oscar still check each other's figures, but now they do it over coffee.");
  else if (f.accounts === false) out.push('Angela and Oscar still speak to each other only through Kevin.');
  if (f.figgis === true) out.push('Mr Figgis comes in every Monday now, and brings his dog.');
  else if (f.figgis === false) out.push('Mr Figgis buys his paper somewhere else, and tells anyone who asks why.');
  const lines = out.slice(0, 4);
  const tools = f.whispers + f.announcements + f.powers;
  if (tools > 0) lines.push(`This week you whispered ${f.whispers} ${f.whispers === 1 ? 'time' : 'times'}, made ${f.announcements} ${f.announcements === 1 ? 'announcement' : 'announcements'} and used ${f.powers} ${f.powers === 1 ? 'power' : 'powers'}.`);
  return lines.slice(0, 5);
}

/** The last scene on the floor, before the ending card. */
export const FINALE = {
  vp: (text: string) => `Vice president, on the phone: "${text}"`,
  saved: {
    vp: 'Michael, we have decided. The Scranton branch stays open.',
    michael: "We're staying! Conference room! Everybody!",
    doing: 'celebrating in the conference room',
    lines: [
      { who: 'dwight', text: 'I never doubted us for a second. I doubted Jim.' },
      { who: 'kevin', text: 'Does this mean there is cake?' },
      { who: 'pam', text: 'We actually did it.' }
    ],
    leak: 'I have already emailed Corporate to say thank you. Just the once.'
  },
  scraped: {
    vp: 'Michael, you stay open. On probation, with half the budget.',
    michael: 'Probation party! Conference room! Bring your own chair!',
    doing: 'at the probation party',
    lines: [
      { who: 'kevin', text: 'Is there cake?' },
      { who: 'michael', text: 'There is half a cake.' }
    ]
  },
  closed: {
    vp: 'Michael, I am sorry. The branch closes tonight.',
    michael: 'Okay. Okay. Everyone, take a stapler.',
    doing: 'carrying a box out',
    last: 'This is not goodbye. It is see you later.'
  }
};
