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
    whisper: ['My farewell speech can wait until the inspector has gone.', 'I should wait in my office for the inspector.', 'Security can wait. I should be at my desk.'],
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
  add(w.call, "Monday's call with the whole office there", "Monday's empty conference room");
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
  return `Despite ${g}, ${b} ${bad.length > 1 ? 'were' : 'was'} too much for Corporate.`;
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
          'The staff packed their desks into boxes. Dwight took the stapler. Michael says this is not goodbye, it is see you later.'
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
  speech?: 'during' | 'after' | 'never';
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
  if (f.wrongedName) out.push(`${f.wrongedName} has forgiven you for Thursday. Mostly.`);
  if (f.speech === 'after') out.push("Michael's farewell speech got a standing ovation. He offers to give it again every Friday.");
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
