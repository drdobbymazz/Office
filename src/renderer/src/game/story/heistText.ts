// Episode 3, "Inside Job": every word the player reads or hears. Plain ASCII only
// (no em dashes, curly quotes, emoji or ellipsis characters): the tests check it.
// The logic is in heistChapters.ts; the numbers it uses are passed in here.

import { CAST } from '@/game/core/cast';
import type { CastId, CharId, EmotionId } from '@/game/core/types';
import type { EndingId } from './rules';
import type { ScriptLine, WeekNotes } from './types';

export const VANE = 'visitor:vane';

export interface HeistLine {
  who: CharId;
  text: string;
  kind?: ScriptLine['kind'];
  emotion?: EmotionId;
  to?: CharId;
}

const name = (id: CharId): string => (CAST as Record<string, { name: string } | undefined>)[id]?.name ?? (id === VANE ? 'Ms Vane' : id);

/** "Two", "Three" ... for small counts at the start of a sentence; digits above ten. */
export function countWord(n: number): string {
  const w = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][n];
  return w ?? String(n);
}

/** "Kevin", "Kevin and Andy", "Kevin, Andy and Kelly". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The staff who crack easily under questions (nerve under one half), for the hints. */
export const LOW_NERVE: readonly CastId[] = (Object.keys(CAST) as CastId[]).filter((id) => CAST[id].temperament.nerve < 0.5);

export const HEIST_META = {
  title: 'Inside Job',
  subtitle: 'The Wrong Tape',
  tagline:
    'Michael posted Corporate the wrong tape. It is locked in a briefcase in the conference room, and the vice president watches it on Friday at two. Learn the lock\'s numbers, switch the tapes, and keep fifteen stories straight.',
  unitLabel: 'Day',
  standingLabel: 'Cover',
  standingNote: 'Cover is how well the office keeps its secret. It starts at 40 and moves with each day.',
  blurb: 'A caper in three days, Wednesday to Friday',
  spanLabel: 'The job',
  endHead: 'FRIDAY, 14:00',
  endSub: 'The screening is over',
  endNextLabel: 'See how the job ended',
} as const;

export const HEIST_ENDING_RULE =
  'If the wrong tape plays on Friday, the office is caught. If the right tape plays and no more than one person talked, Cover 60 or more is a clean getaway and less is a near thing. If the right tape plays but two or more people talked, Cover under 40 means Corporate learns everything, and 40 or more is a near thing.';

// ── The opening scene (before Wednesday) ─────────────────────────────────────

export const HEIST_INTRO = {
  beats: [
    'Wednesday morning. Corporate asked every branch for a short video called "Why Scranton". Michael posted his yesterday.',
    'The tape he posted is the one where he practises firing the vice president.',
    'Ms Vane from Corporate has that tape locked in a briefcase. The vice president watches it on Friday at two.',
  ],
  lines: [
    { who: 'michael', text: 'Nobody panic. I posted Corporate the wrong tape.', kind: 'shout', emotion: 'scared' },
    { who: 'jim', text: 'Which tape did you post, Michael?', emotion: 'suspicious' },
    { who: 'michael', text: 'The one where I practise firing the vice president.', emotion: 'embarrassed' },
    { who: 'dwight', text: 'Then we take it back. I have a plan and forty metres of rope.', emotion: 'determined' },
    { who: 'pam', text: 'Or we swap it for the right one before Friday.', emotion: 'determined' },
  ] satisfies HeistLine[],
  vane: { who: VANE, text: 'Good morning. The conference room is mine until Friday. Nobody touches this case.', emotion: 'suspicious' } satisfies HeistLine,
  michaelAfter: { who: 'michael', text: 'Welcome to Scranton! We love cases here. We never touch them.', emotion: 'nervous' } satisfies HeistLine,
};

// ── Wednesday: The Combination ───────────────────────────────────────────────

export const COMBO = {
  weekday: 'Wednesday',
  title: 'The Combination',
  intro: [
    'Michael posted Corporate the wrong tape: the one where he practises firing the vice president. The right tape is still on his desk.',
    'Ms Vane from Corporate keeps the wrong tape in a briefcase with a three-number lock. She opens it four times today. Whoever stands close to her, alone, sees one number.',
  ],
  goal: {
    id: 'code',
    title: 'Learn the three numbers',
    detail: 'Ms Vane opens her case at about 10:15, 11:45, 13:30 and 15:00. One person close to her, with nobody else around, sees one number. Learn all three before five.',
    icon: 'lock',
    stamp: ['CODE CRACKED', 'NO CODE'] as [string, string],
    room: 'meeting' as const,
  },
  extra: {
    id: 'unseen',
    title: 'Not once caught hovering',
    detail: 'Ms Vane never catches the same person watching her twice.',
    icon: 'inspector',
    atFive: 'won' as const,
  },
  change: ['The office learned the three numbers of the lock', 'The office did not learn the lock\'s numbers'] as [string, string],
  hints: [
    'When she opens the case, one person standing close to her sees a number. With two or more people around, she turns her back.',
    'She remembers faces. The same person hovering twice gets caught.',
    'Michael covers his eyes. He never sees a number and never gets in the way.',
    'Somebody who cannot keep a secret would say the number out loud.',
  ],
  help: [
    'A few minutes before each opening, pick someone up and drop them right beside Ms Vane, and carry anyone else near her away. Use a different person each time.',
    'Use Skip ahead to jump to a few minutes before each opening. Truth Serum on Ms Vane makes her read the next number out loud to whoever is in the room.',
  ],
  suggest: {
    whisper: [
      'Stand near Ms Vane, but do not stare at her case.',
      'Ask Ms Vane how her drive from New York was.',
      { text: 'Offer Ms Vane a coffee and stay with her while she drinks it.', help: true },
    ],
    announce: ['Everyone, please give our guest from Corporate some room today.'],
  },
  places: {
    kitchen: 'in the break room',
    meeting: 'in the conference room',
    annex: 'at the copier in the annex',
    boss: "in Michael's office",
  },
  arrive: 'Ms Vane from Corporate walks in with a locked briefcase and takes over the conference room.',
  heading: (place: string, time: string) => `Ms Vane is taking the case ${place}. She opens it there at about ${time}.`,
  opens: (place: string) => `Ms Vane opens the case ${place}.`,
  saw: (who: string, digit: number, n: number) => `${who} saw a number over Ms Vane's shoulder: ${digit}. Numbers known: ${n} of 3.`,
  crowd: (names: string[]) => `Too many people around Ms Vane (${listNames(names)}). She turns her back to open the case, and nobody sees a number.`,
  nobody: (place: string) => `Ms Vane opened the case ${place} with nobody close enough to see.`,
  caught: (who: string) => `Ms Vane noticed ${who} hovering again and snapped the case shut. Nobody saw a number, and she will not forget that face.`,
  carried: (who: string) => `${who} was carried off before the number could be read.`,
  truthOn: 'Ms Vane has had the truth serum. She cannot keep anything to herself now, so the next time she opens the case she will say the number out loud.',
  truthSaid: (digit: number, names: string[], n: number) => `Ms Vane reads the lock out loud as she opens it: "${digit}". ${listNames(names)} heard it. Numbers known: ${n} of 3.`,
  truthNobody: 'Ms Vane read the number out loud, but nobody was in the room to hear it.',
  grabbed: 'Ms Vane does not like being picked up. She grips the case and keeps it shut.',
  won: 'Three numbers, and the lock is cracked. Ms Vane has no idea.',
  lost: (n: number) =>
    n === 0
      ? 'Ms Vane opened the case for the last time today, and nobody saw a single number.'
      : `Ms Vane opened the case for the last time today. The office learned ${n} of the 3 numbers, not enough to open the lock.`,
  lostEarly: (n: number, left: number) =>
    `The office has ${n} of the 3 numbers and Ms Vane opens the case only ${left} more time${left === 1 ? '' : 's'} today. The lock stays a mystery.`,
  status: {
    next: (n: number, digits: string, place: string, time: string) => `Numbers known: ${n} of 3${digits}. Next: ${place} at about ${time}.`,
    now: (n: number, place: string) => `Numbers known: ${n} of 3. Ms Vane is opening the case ${place} now.`,
    waiting: 'Ms Vane arrives at about 09:10 with the case.',
    won: 'All three numbers known.',
    lost: (n: number) => `Only ${n} of the 3 numbers known.`,
  },
  lines: {
    arrive: { who: VANE, text: 'Please carry on as normal. I will be in the conference room.', emotion: 'neutral' } satisfies HeistLine,
    michael: { who: 'michael', text: 'We are being so normal right now. Look at us.', emotion: 'nervous' } satisfies HeistLine,
    open: {
      kitchen: 'Just checking it is all still here.',
      meeting: 'One more look before lunch.',
      annex: 'I need a copy of the label. Nobody look.',
      boss: 'Michael, your tape. Still safe with me.',
    } as Record<string, string>,
    turnsBack: 'Excuse me. A little privacy, please.',
    hovering: 'You again. Is there something you want?',
    seen: (digit: number) => `${digit}. Remember ${digit}.`,
  },
  topics: [
    'Ms Vane from Corporate will not let that briefcase out of her sight.',
    'The lock on her case has three numbers.',
    'Michael keeps saying the tape on his desk is the good one.',
  ],
};

// ── Thursday: The Switch ─────────────────────────────────────────────────────

export const SWITCH = {
  weekday: 'Thursday',
  title: 'The Switch',
  intro: [
    'Ms Vane has cabled the case to the conference table and sits with it. Michael has the right tape.',
    'She leaves the room three times: coffee at about 10:30, lunch at about 12:30, and a phone call at about 14:30. While she is out, whoever has the right tape must stand beside the case long enough to swap the tapes.',
  ],
  goal: {
    id: 'switch',
    title: 'Switch the tapes',
    detail: 'While Ms Vane is out of the conference room, get whoever has the right tape beside the case and keep them there until the tapes are swapped. If she catches them at it twice, the case goes to her hotel.',
    icon: 'play',
    stamp: ['TAPES SWITCHED', 'NO SWITCH'] as [string, string],
    room: 'meeting' as const,
  },
  extra: {
    id: 'shred',
    title: 'Shred the wrong tape',
    detail: 'After the switch, get whoever has the wrong tape into the annex, where the shredder is.',
    icon: 'secretLeak',
    atFive: 'lost' as const,
  },
  change: ['The tapes were switched', 'The tapes were not switched'] as [string, string],
  hints: [
    'Whoever has the tape passes it on: drop someone right beside them, or whisper to someone to take the tape.',
    'Dwight and Creed are quick with locks. Kevin and Michael fumble. Strong coffee helps anyone.',
    'Only the tape holder and one other person can be in the conference room while it happens. Any more and someone sees.',
    'Anyone standing next to Ms Vane when she turns to go back can keep her talking a little longer. Each person can do it once.',
  ],
  help: [
    'Before 10:30, drop Dwight beside Michael to take the tape, then drop Dwight by the conference room door. Whoever has the tape waits where you put them.',
    'When Ms Vane leaves the room, drop the tape holder beside the case on the table. Leave someone by the coffee machine to keep her talking.',
    'Nap Attack on the conference room puts her to sleep where she sits. Bring the tape holder in after it hits, not before.',
  ],
  suggest: {
    whisper: [
      'Take the tape from Michael and keep it safe.',
      'Wait outside the conference room with the tape.',
      'Keep Ms Vane talking at the coffee machine.',
      { text: 'Take the tape from Michael, then wait outside the conference room.', for: ['dwight', 'creed'], help: true },
    ],
    announce: ['Coffee is fresh in the break room, everybody.'],
  },
  recap: (n: WeekNotes, secs: number): string =>
    n.heistCode
      ? `On Wednesday the office learned all three numbers. With the code, opening the case takes ${secs} seconds.`
      : `On Wednesday the office learned only ${n.heistDigits ?? 0} of the 3 numbers. Without the code, picking the lock takes ${secs} seconds.`,
  absences: {
    coffee: { label: 'coffee', where: 'the coffee machine', leaving: 'Ms Vane leaves the conference room for a coffee. The case stays cabled to the table.' },
    lunch: { label: 'lunch', where: 'the break room fridge', leaving: 'Ms Vane goes to fetch her lunch from the break room fridge. The case stays cabled to the table.' },
    call: { label: 'a phone call', where: 'the bullpen', leaving: 'Corporate rings for Ms Vane, and she takes the call in the bullpen. The case stays cabled to the table.' },
  },
  setup: 'The case is cabled to the conference table and Ms Vane sits beside it. Michael has the right tape in his office.',
  talking: (who: string) => `${who} keeps Ms Vane talking. She stays a little longer.`,
  returning: 'Ms Vane heads back to the conference room.',
  handover: (from: string, to: string, wrong: boolean) => `${from} hands the ${wrong ? 'wrong' : 'right'} tape to ${to}.`,
  fetch: (to: string, from: string) => `${to} goes to get the tape from ${from}.`,
  waits: (who: string) => `${who} waits here with the tape.`,
  started: (who: string, secs: number) => `${who} starts on the case. It takes ${secs} seconds without a break.`,
  reset: (who: string) => `${who} stepped away from the case. The switch starts again from the beginning.`,
  crowded: 'Too many people in the conference room to switch the tapes without being seen.',
  nearMiss: (who: string) =>
    `Ms Vane walks back in and finds ${who} at her case. ${who} says they were looking for a pen. That was a near miss: once more and she moves the case.`,
  caughtTwice: (who: string) => `Ms Vane caught ${who} at the case a second time. She has the case moved to her hotel, and the wrong tape with it.`,
  switched: (who: string) => `${who} swapped the tapes. The right tape is in the case, and ${who} now has the wrong one.`,
  shredded: (who: string) => `${who} fed the wrong tape into the shredder in the annex. It is gone for good.`,
  emergency: 'Ms Vane grabs the case and takes it out with her.',
  caseBack: 'Ms Vane cables the case back to the conference table.',
  grabbed: 'Ms Vane does not like being picked up. She hurries back to the case and will keep her eyes on it for a while.',
  late: 'Five o\'clock came and the wrong tape is still in the case.',
  status: {
    holder: (who: string, what: string, time: string) => `${who} has the right tape. Ms Vane leaves for ${what} at about ${time}.`,
    noMore: (who: string) => `${who} has the right tape. Ms Vane will not leave the room again today.`,
    out: (who: string) => `Ms Vane is out of the room. Get ${who} beside the case.`,
    sleeping: (who: string) => `Ms Vane is not watching. Get ${who} beside the case.`,
    working: (secs: number, of: number) => `Switching the tapes: ${secs} of ${of} seconds.`,
    crowded: 'Too many people in the conference room.',
    caseOut: 'Ms Vane has the case with her.',
    won: 'The tapes are switched.',
    lost: 'The wrong tape is still in the case.',
  },
  lines: {
    leaving: { who: VANE, text: 'Back in a few minutes. Nobody touch the case.', emotion: 'suspicious' } satisfies HeistLine,
    bluff: 'I was looking for a pen. Do you have a pen?',
    vaneBluff: 'There are pens in the bullpen. Out, please.',
    caught: 'That is enough. This case is going to my hotel.',
    talkVane: 'I really must get back.',
    switched: 'Done. Act normal.',
    shoo: 'Step away from the case, please.',
  },
  topics: (holder: string, switched: boolean) =>
    switched
      ? ['The right tape is back in the case. Nobody says a word.', 'Ms Vane still guards her case like it is gold.']
      : [`${holder} has the right tape and is trying to look innocent.`, 'Ms Vane keeps the case cabled to the conference table.', 'Somebody has to get to that case while Ms Vane is out.'],
  tagHolder: (wrong: boolean) => (wrong ? 'has the wrong tape' : 'has the right tape'),
  tagVane: (guarding: boolean) => (guarding ? 'guarding the case' : 'away from the case'),
  warn: {
    fireDrill: 'Ms Vane takes the case outside with her during the drill.',
    pizza: 'Ms Vane goes for a slice too, but so does whoever has the tape.',
    meeting: 'Everyone crowds into the conference room for a while. Nobody can switch the tapes with that many people watching.',
    fireMeeting: 'A fire or burst pipe in the conference room makes Ms Vane take the case out with her.',
    sleep: 'If whoever has the tape is in the room, they fall asleep too.',
  },
};

// ── Friday: The Screening ────────────────────────────────────────────────────

/** Why someone talked, to follow "<name> talked" in the Log. */
const TALK_WHY: Record<string, string> = {
  none: '',
  truth: ': the truth serum left no choice',
  scared: ': too frightened to keep the story straight',
  sad: ': too upset to keep the story straight',
  nervous: ': too nervous, and nobody had whispered a steadying word',
  mood: ': in too bad a mood to cover for anyone',
  nerve: ': weak nerves, and nobody had whispered a steadying word',
};

export const SCREENING = {
  weekday: 'Friday',
  title: 'The Screening',
  intro: [
    'At two o\'clock the vice president watches the tape by video link in the conference room.',
    'Ms Vane suspects something. Before the screening she questions five people, one at a time, and Michael is always last. If two or more of them talk, she will know everything.',
  ],
  goal: {
    id: 'screening',
    title: 'The right tape plays',
    detail: 'At 14:00 the right tape must be in the case, and no more than one of the five people Ms Vane questions may talk.',
    icon: 'play',
    stamp: ['RIGHT TAPE', 'JOB BLOWN'] as [string, string],
    room: 'meeting' as const,
  },
  extra: {
    id: 'silent',
    title: 'Nobody talks',
    detail: 'All five people Ms Vane questions keep the story straight.',
    icon: 'whisper',
    atFive: 'won' as const,
  },
  change: ['The right tape played at the screening', 'The screening went wrong'] as [string, string],
  hints: [
    'A few minutes before each questioning, the Log says whom Ms Vane wants. A tag over that person says whether they would talk right now.',
    `${listNames(LOW_NERVE.map((id) => CAST[id].name))} have weak nerves and talk unless you whisper to them first. A whisper lasts all day.`,
    'Anyone scared, sad or in a bad mood talks whatever you whisper. Cheer them up, or carry them away: Ms Vane settles for whoever is nearest her.',
    'Two people talking is too many. One is a risk the office can take.',
  ],
  help: [
    'Whisper to each person Ms Vane wants before she reaches them, for example "Stay calm, you know nothing about a tape". Watch the tag over them turn to "steady now".',
    'If the tag still says "would talk now", they are scared, sad or in a bad mood. Carry them away and drop a steady person, like Dwight or Stanley, right beside Ms Vane.',
    'Whisper to Michael before 13:20. He is always last.',
  ],
  suggest: {
    whisper: [
      'Stay calm. You know nothing about a tape.',
      'If Ms Vane asks, you were at your desk all week.',
      { text: 'Michael, the tape is fine. Smile and say nothing.', for: ['michael'] },
    ],
    announce: ['Lovely weather today. Nothing else to report.'],
  },
  recapSwitched: (n: WeekNotes): string =>
    `On Thursday the tapes were switched${n.heistCloseCalls ? ', after a near miss' : ''}. Now everyone just has to keep quiet.`,
  recapNot: 'The tapes were never switched. Today is the last chance: Michael has the right tape again, and Ms Vane leaves the conference room each time she questions someone.',
  ahead: (time: string, who: string) => `At about ${time} Ms Vane wants a word with ${who}.`,
  looking: (who: string) => `Ms Vane goes looking for ${who}.`,
  settles: (who: string, other: string) => `Ms Vane cannot find ${who}, so she settles for ${other}, who is nearest.`,
  held: (who: string) => `${who} kept the story straight.`,
  talked: (who: string, k: number, why: 'truth' | 'scared' | 'sad' | 'nervous' | 'mood' | 'nerve' | null = null) =>
    `${who} talked${TALK_WHY[why ?? 'none']}. Ms Vane writes it all down. ${k === 1 ? 'One person has talked; two would be too many.' : `${k} people have talked.`}`,
  told: (who: string) => `${who} cannot keep a secret now, walks up to Ms Vane and tells her everything.`,
  leaked: (who: string) => `${who}'s secret went out to the whole office, and the plan to swap the tapes went out with it. Ms Vane has read it. That counts as one person talking.`,
  creedAside: 'Creed kept the story straight, and confessed to something else entirely.',
  callIn: 'Ms Vane calls everyone into the conference room for the screening.',
  caughtTwice: (who: string) => `Ms Vane caught ${who} at the case a second time. She keeps the case in her hand until the screening, with the wrong tape still in it.`,
  status: {
    next: (q: number, k: number, who: string, time: string, shaky: boolean | null = null) =>
      `Questioned ${q} of 5, ${k} talked. Next: ${who} at about ${time}${shaky === null ? '' : shaky ? ', who would talk right now' : ', who is steady right now'}.`,
    nextUnknown: (q: number, k: number, time: string) => `Questioned ${q} of 5, ${k} talked. She questions someone else at about ${time}.`,
    now: (who: string, q: number, k: number) => `Ms Vane is questioning ${who}. Questioned ${q} of 5, ${k} talked.`,
    looking: (who: string) => `Ms Vane is looking for ${who}.`,
    call: 'Everyone to the conference room. The tape plays at 14:00.',
    allAsked: (q: number, k: number) => `Questioned ${q} of 5, ${k} talked. At 13:45 everyone goes to the conference room for the screening.`,
    playing: 'The tape is playing.',
    holder: (who: string) => `${who} still has the right tape. Switch it while Ms Vane is out questioning.`,
    working: (secs: number, of: number) => `Switching the tapes: ${secs} of ${of} seconds.`,
    won: 'The right tape played.',
    lostWrong: 'The wrong tape played.',
    lostTalk: 'Ms Vane has the whole story.',
  },
  questions: [
    'Where were you yesterday at half past ten?',
    'Has anybody been near my case?',
    'Who in this office would want to swap a tape?',
    'Is there anything you would like to tell me?',
    'Michael. Is the tape in my case the tape you sent?',
  ],
  holds: [
    'I was at my desk all day. Ask anyone.',
    'A tape? People still use tapes?',
    'Your case? I have not been near it.',
    'No idea what you mean. I was working.',
  ],
  talks: [
    'Okay, okay. There might have been a tape. And a swap. I have said too much.',
    'It was not my idea! It was everybody\'s idea!',
    'I promised not to say anything about the tape. So I will not. Mostly.',
    'Fine. Somebody was at your case on Thursday. Please do not tell them I said so.',
  ],
  creed: 'Never touched your case. The forklift in the car park, yes. The case, no.',
  michaelHolds: 'Ms Vane, I am a regional manager. I do not even know where the tapes go in.',
  michaelTalks: 'Nobody swapped anything. Definitely not on Thursday. Or today. Why are you writing?',
  vaneAfterHold: 'Thank you. That will be all.',
  vaneAfterTalk: 'Interesting. Thank you very much.',
  vp: { name: 'The vice president (video link)', icon: 'phone', room: 'meeting' as const },
  tapeVoice: { name: 'Michael, on the tape', icon: 'play', room: 'meeting' as const },
  screening: {
    open: 'The vice president is on the line. Playing the Scranton tape now.',
    vpReady: 'Go ahead.',
    rightTape: 'Scranton. Where the paper is local and the people are family.',
    wrongTape: 'You are fired. No, wait. Louder. You are fired.',
    vpRight: 'That was lovely. Thank you, Scranton.',
    vpWrong: 'Michael, is that supposed to be me?',
    michaelWrong: 'That is a different tape.',
    vaneTalk: 'One more thing for the record. I know about Thursday. It is all in my notebook.',
    michaelRight: 'You are welcome.',
  },
  outcome: {
    won: (k: number) => `The right tape played at two. ${k === 0 ? 'Nobody told Ms Vane a thing.' : 'One person talked, but one story is not proof.'}`,
    wrong: 'The wrong tape played at two. The vice president watched Michael practise firing him.',
    talked: (k: number) => `The right tape played, but ${k} people talked. Ms Vane has the whole story in her notebook.`,
  },
  topics: (switched: boolean) =>
    switched
      ? ['Ms Vane is asking questions all morning.', 'Everyone has to keep their story straight until two.', 'Nobody knows anything about a tape. Nobody.']
      : ['The right tape is still not in the case.', 'Ms Vane is asking questions all morning.', 'Two o\'clock is getting nearer.'],
  tagVane: { looking: (who: string) => `looking for ${who}`, asking: (who: string) => `questioning ${who}` },
  tagWanted: (talks: boolean) => (talks ? 'wanted: would talk now' : 'wanted: steady now'),
  warn: 'Today this makes someone tell Ms Vane everything. It counts as one person talking.',
};

// ── Facts for the model, endings and the epilogue ────────────────────────────

export const HEIST_FACTS = {
  tape: 'Michael posted Corporate the wrong tape for its "Why Scranton" video: the one where he practises firing the vice president.',
  vane: 'Ms Vane from Corporate keeps that tape in a locked briefcase in the conference room until Friday.',
  screening: 'On Friday at two the vice president watches the tape by video link.',
  plan: 'The office is secretly trying to swap the wrong tape for the right one. Nobody must tell Ms Vane.',
  digits: (n: WeekNotes) =>
    n.heistCode ? 'On Wednesday the office learned all three numbers of the lock on her case.' : `On Wednesday the office learned only ${n.heistDigits ?? 0} of the three numbers of the lock.`,
  switched: (n: WeekNotes) =>
    n.heistSwitched === 'thursday'
      ? `On Thursday the tapes were switched while Ms Vane was out${n.heistCloseCalls ? ', after one near miss' : ''}.`
      : 'The tapes have not been switched yet.',
  shredded: 'The wrong tape went through the shredder in the annex.',
};

export const HEIST_FINALE = {
  saved: [
    { who: 'michael', text: 'That was the right tape. That was the right tape!', kind: 'shout', emotion: 'excited' },
    { who: 'pam', text: 'Nobody say anything until she is in the car.', emotion: 'happy' },
    { who: 'dwight', text: 'Flawless. I will burn the rope.', emotion: 'proud' },
  ] satisfies HeistLine[],
  scraped: [
    { who: VANE, text: 'Thank you, Scranton. My report will follow.', emotion: 'suspicious' },
    { who: 'jim', text: 'What is she writing?', emotion: 'nervous' },
    { who: 'michael', text: 'Nice things. Probably nice things.', emotion: 'nervous' },
  ] satisfies HeistLine[],
  closedWrong: [
    { who: 'michael', text: 'I can explain. I cannot explain.', emotion: 'embarrassed' },
    { who: VANE, text: 'I think the vice president has seen enough.', emotion: 'disgusted' },
    { who: 'kevin', text: 'He did the firing bit really well, though.', emotion: 'nervous' },
  ] satisfies HeistLine[],
  closedTalk: [
    { who: VANE, text: 'The tape was fine. Everything else goes in my report.', emotion: 'smug' },
    { who: 'michael', text: 'Can we pretend this week did not happen?', emotion: 'sad' },
  ] satisfies HeistLine[],
  captions: {
    saved: 'The right tape plays on the conference room screen. The vice president smiles.',
    scraped: 'Ms Vane writes in her notebook all the way to the front door.',
    closedWrong: 'On the screen, Michael fires the vice president. Again. In front of the vice president.',
    closedTalk: 'Ms Vane closes her notebook. It is full.',
  },
};

/** The ending card: built only from what the notes say happened. */
export function heistEndingText(id: EndingId, n: WeekNotes): { title: string; text: string[] } {
  const digits = n.heistCode ? 'cracked the lock on Wednesday' : `learned ${n.heistDigits ?? 0} of the lock's 3 numbers on Wednesday`;
  const when = n.heistSwitched === 'thursday' ? 'switched the tapes on Thursday' : n.heistSwitched === 'friday' ? 'switched the tapes on Friday, with hours to spare' : 'never managed to switch the tapes';
  const close = n.heistCloseCalls ? ` Ms Vane nearly caught the switch ${n.heistCloseCalls === 1 ? 'once' : n.heistCloseCalls === 2 ? 'twice' : `${n.heistCloseCalls} times`}.` : '';
  const cracks = n.heistCracks ?? 0;
  const talk = cracks === 0 ? 'Nobody told Ms Vane a thing.' : cracks === 1 ? 'One person talked to Ms Vane, and one story is not proof.' : `${countWord(cracks)} people talked to Ms Vane.`;
  const story = `The office ${digits} and ${when}.${close}`;
  if (id === 'saved') {
    return { title: 'CLEAN GETAWAY', text: [story, talk, 'The right tape played at two. Ms Vane went back to New York with nothing to report, and nobody ever found out.'] };
  }
  if (id === 'scraped') {
    const why = n.heistSwitched && cracks >= 2
      ? 'The right tape played at two, but Ms Vane heard enough. Her report says Scranton is "unusually creative", and Corporate is watching.'
      : 'The right tape played at two, but the office was not careful enough all week. Ms Vane\'s report raises questions, and Corporate is watching.';
    return { title: 'A NEAR THING', text: [story, talk, why] };
  }
  if (!n.heistSwitched) {
    return { title: 'CAUGHT ON TAPE', text: [story, 'At two o\'clock the vice president watched Michael practise firing him.', 'Michael is on a final warning, and the branch is famous at Corporate for all the wrong reasons.'] };
  }
  return { title: 'THE WHOLE STORY', text: [story, talk, 'The right tape played, but Ms Vane has the whole story, and the office had no cover left. Corporate knows everything.'] };
}

/** A few lines on how the week left people, from the notes. */
export function heistEpilogueLines(id: EndingId, n: WeekNotes): string[] {
  const out: string[] = [];
  if (n.heistSwitched) {
    out.push(n.heistShredded ? 'The wrong tape is confetti in the annex shredder.' : 'The wrong tape is still in a desk drawer somewhere. Nobody will say whose.');
  } else {
    out.push('Corporate keeps a copy of the wrong tape. It is very popular in New York.');
  }
  out.push(n.heistCode ? 'Nobody in the office will ever say the three numbers of that lock out loud.' : 'Nobody ever learned all three numbers. Dwight insists he could have used the rope.');
  if ((n.heistCloseCalls ?? 0) > 0) out.push('Whoever told Ms Vane they were looking for a pen now keeps a whole box of pens on their desk.');
  const cracks = n.heistCracks ?? 0;
  if (cracks === 0 && n.heistSwitched) out.push('Five people looked Ms Vane in the eye and said nothing. Michael wants a group photo of it.');
  else if (cracks > 0) out.push(`Ms Vane's notebook has ${cracks === 1 ? 'one page' : `${countWord(cracks)} pages`} about Scranton.`.replace(/has ([A-Z])/, (_m, c: string) => `has ${c.toLowerCase()}`));
  out.push(id === 'saved' ? 'Michael has started planning next year\'s video. Everyone has asked to hold the tape.' : id === 'scraped' ? 'Michael labels every tape now. Twice.' : 'Michael has given up tapes for good.');
  return out;
}

export { name as heistName };
