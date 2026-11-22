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
  topics: {
    start: 'Someone has been faxing Corporate. People are wondering who.',
    beeps: 'The fax machine keeps beeping. Someone is sending pages to Corporate.',
    caught: (name: string) => `${name} was the leak all along. Nobody can believe it.`,
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
