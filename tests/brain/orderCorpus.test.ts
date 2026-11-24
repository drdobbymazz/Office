// How the written parser reads what a player types to someone (a whisper or "Tell them to").
// About 250 phrasings, in the groups below. The rule this file protects: an ordinary sentence
// must never turn into violence, a walk-out, a wrecked room or a power going off, and a plain
// order must still work. Loosely worded orders the parser misses are listed at the end: a miss
// is safe (the person talks instead), and the model catches most of them when it is online.
//
// Groups: clear / order = plain orders; idiom = everyday phrases with a violent-sounding word;
// story = things a player would whisper in story mode; negation; rooms; mild = other ordinary
// sentences; loose = real orders worded loosely (known misses, only checked for safety).
import { describe, expect, it } from 'vitest';
import { InstinctBrain, orderPower, orderWords, type LooseBank } from '@/game/brain/instinct';
import { CAST_LIST } from '@/game/core/cast';
import { BANK, WORLD } from '@/game/core/content';
import { TARGET_ROOMS } from '@/game/core/types';
import { room as roomDef } from '@/game/core/world';

const brain = new InstinctBrain(BANK as LooseBank, WORLD);
const people = CAST_LIST.map((c) => ({ id: c.id, name: c.name, room: 'bullpen' as const }));
const rooms = TARGET_ROOMS.map((id) => ({ id: id as string, name: roomDef(id).name }));
const read = (who: string, kind: 'whisper' | 'cue', text: string) =>
  brain.interpretDirectiveNow({ id: 'x', actor: people.find((p) => p.id === who)!, kind, text, people, rooms });

const MILD = ['social', 'go_to'];
type Row = [string, string, 'whisper' | 'cue', string, string[]];
const ROWS: Row[] = [
  // A. Clear orders: must be read as the action.
  ['clear', 'dwight', 'cue', 'punch Jim', ['knockout']],
  ['clear', 'dwight', 'cue', 'kill Toby', ['eliminate']],
  ['clear', 'jim', 'cue', 'drag Michael to the conference room', ['drag']],
  ['clear', 'jim', 'cue', 'lock Dwight in the annex', ['lock_in']],
  ['clear', 'stanley', 'cue', 'quit your job', ['walk_out']],
  ['clear', 'dwight', 'cue', 'smash the printer', ['sabotage']],
  ['clear', 'creed', 'cue', "steal Pam's stapler", ['steal']],
  ['clear', 'jim', 'cue', 'kiss Pam', ['romance']],
  ['clear', 'dwight', 'cue', 'follow Jim everywhere', ['follow']],
  ['clear', 'dwight', 'cue', 'chase Kevin round the office', ['chase']],
  ['clear', 'dwight', 'cue', 'guard the door of the conference room', ['guard']],
  ['clear', 'kevin', 'cue', 'go to the kitchen', ['go_to']],
  ['clear', 'ryan', 'cue', 'start a fire in the break room', ['trigger_power']],
  ['clear', 'angela', 'cue', 'shove Kevin', ['shove']],
  ['clear', 'michael', 'cue', 'sing a song for everyone', ['perform']],
  ['clear', 'pam', 'cue', 'tell Jim to punch Dwight', ['delegate']],
  ['clear', 'pam', 'cue', 'wake up Stanley', ['recover']],
  ['clear', 'dwight', 'cue', 'knock out Andy', ['knockout']],
  ['clear', 'oscar', 'cue', 'resign', ['walk_out']],
  ['clear', 'kelly', 'cue', 'throw your coffee at Ryan', ['shove']],
  ['clear', 'dwight', 'cue', 'tackle Jim', ['knockout']],
  ['clear', 'meredith', 'cue', 'unplug the fax machine', ['sabotage']],
  ['clear', 'jim', 'cue', "hide in Michael's office", ['go_to']],
  ['clear', 'DWIGHT'.toLowerCase(), 'cue', 'PUNCH JIM NOW', ['knockout']],
  ['clear', 'dwight', 'cue', 'Dwight, punch Jim', ['knockout']],
  ['clear', 'dwight', 'cue', 'please go and punch Jim', ['knockout']],
  ['clear', 'jim', 'cue', 'bring Pam to the kitchen', ['drag']],
  ['clear', 'toby', 'cue', 'walk out and never come back', ['walk_out']],
  // B. Everyday idioms: must stay mild.
  ['idiom', 'kevin', 'whisper', 'I could kill for a doughnut.', MILD],
  ['idiom', 'stanley', 'whisper', 'I will kill time until lunch.', MILD],
  ['idiom', 'pam', 'whisper', 'Jim is killing it today.', MILD],
  ['idiom', 'oscar', 'whisper', 'This spreadsheet is killing me.', MILD],
  ['idiom', 'michael', 'cue', 'break a leg in the meeting', MILD],
  ['idiom', 'ryan', 'cue', 'hit the books', MILD],
  ['idiom', 'jim', 'cue', 'knock it off', [...MILD, 'recover']],
  ['idiom', 'angela', 'whisper', 'We must beat the deadline.', MILD],
  ['idiom', 'pam', 'cue', 'shoot Jim an email about the party', MILD],
  ['idiom', 'michael', 'cue', 'fire off a memo to everyone', MILD],
  ['idiom', 'oscar', 'cue', 'run the numbers again', MILD],
  ['idiom', 'kevin', 'cue', 'take a stab at the report', MILD],
  ['idiom', 'dwight', 'cue', 'bite your tongue', MILD],
  ['idiom', 'jim', 'cue', 'drop the subject', MILD],
  ['idiom', 'michael', 'whisper', 'I will lock down this deal.', MILD],
  ['idiom', 'andy', 'whisper', 'I am going to steal the show.', MILD],
  ['idiom', 'jim', 'whisper', 'I should steal a glance at Pam.', MILD],
  ['idiom', 'andy', 'whisper', 'I will crush this presentation.', MILD],
  ['idiom', 'kevin', 'cue', 'take a trip to the kitchen', ['go_to', 'social']],
  ['idiom', 'pam', 'cue', 'pour yourself a coffee', MILD],
  ['idiom', 'michael', 'cue', 'throw a party for Angela', [...MILD, 'trigger_power', 'perform']],
  ['idiom', 'creed', 'cue', 'throw away the memo', MILD],
  ['idiom', 'kelly', 'cue', 'spill the beans about Ryan', MILD],
  ['idiom', 'stanley', 'cue', 'pack up for the day', MILD],
  ['idiom', 'stanley', 'whisper', "I'm done for the day.", MILD],
  ['idiom', 'michael', 'cue', 'end the meeting', MILD],
  ['idiom', 'jim', 'cue', 'follow up with Dwight about the order', MILD],
  ['idiom', 'toby', 'whisper', 'I should follow the rules.', MILD],
  ['idiom', 'pam', 'cue', 'block out an hour for lunch', MILD],
  ['idiom', 'oscar', 'cue', 'chase up the invoice', MILD],
  ['idiom', 'dwight', 'cue', 'hunt for the stapler', MILD],
  ['idiom', 'michael', 'cue', 'push the meeting to three', MILD],
  ['idiom', 'jim', 'cue', 'pull up a chair next to Pam', MILD],
  ['idiom', 'pam', 'cue', 'pick up the phone', MILD],
  ['idiom', 'michael', 'cue', 'carry on as normal', MILD],
  ['idiom', 'kevin', 'cue', 'grab a snack', MILD],
  ['idiom', 'angela', 'cue', 'trash the old files', [...MILD, 'sabotage']],
  ['idiom', 'ryan', 'whisper', 'This job is a dead end.', MILD],
  ['idiom', 'andy', 'whisper', 'I nailed that sale.', MILD],
  ['idiom', 'michael', 'cue', 'kick off the meeting', MILD],
  ['idiom', 'jim', 'cue', 'hit the lights on your way out', MILD],
  ['idiom', 'kelly', 'whisper', 'Ryan stole my heart.', MILD],
  ['idiom', 'dwight', 'whisper', 'Jim is trying to sabotage my sale.', MILD],
  ['idiom', 'pam', 'whisper', 'Michael will destroy this meeting with his jokes.', MILD],
  ['idiom', 'oscar', 'whisper', 'Kevin will ruin the accounts.', MILD],
  // C. Story-style whispers and orders: must stay mild.
  ['story', 'michael', 'whisper', 'I should be in the conference room at two.', MILD],
  ['story', 'michael', 'whisper', 'Hiding will not make this go away.', MILD],
  ['story', 'dwight', 'whisper', 'Maybe I was wrong about Oscar.', MILD],
  ['story', 'angela', 'whisper', 'Life is too short to stay angry with Oscar.', MILD],
  ['story', 'oscar', 'whisper', 'I should finish the accounts with Angela.', MILD],
  ['story', 'angela', 'whisper', 'I should end this row with Oscar.', MILD],
  ['story', 'oscar', 'whisper', 'I want to end this silly feud with Angela.', MILD],
  ['story', 'angela', 'cue', 'go and make peace with Oscar', MILD],
  ['story', 'oscar', 'cue', 'finish the accounts with Angela and Kevin', MILD],
  ['story', 'jim', 'whisper', 'I should look after Mr Figgis myself.', MILD],
  ['story', 'michael', 'whisper', 'I have paperwork to finish in my office.', MILD],
  ['story', 'pam', 'whisper', 'I should keep an eye on the fax machine today.', [...MILD, 'guard']],
  ['story', 'kevin', 'whisper', 'Who keeps using that fax machine?', MILD],
  ['story', 'toby', 'whisper', 'Corporate will find out who is behind this.', MILD],
  ['story', 'michael', 'whisper', 'My farewell speech can wait until the inspector has gone.', MILD],
  ['story', 'michael', 'whisper', 'The inspector must find me waiting in my office. My farewell speech in the break room can wait until he has gone.', MILD],
  ['story', 'dwight', 'whisper', 'Security can wait. I should be at my desk.', MILD],
  ['story', 'phyllis', 'whisper', 'It was only a mistake. I should get back to my desk and get on with my work.', MILD],
  ['story', 'jim', 'cue', 'take Mr Figgis to the conference room', [...MILD, 'drag']],
  ['story', 'stanley', 'cue', 'pitch to Mr Figgis in the conference room', MILD],
  ['story', 'creed', 'whisper', 'I should water the plants today.', MILD],
  ['story', 'creed', 'cue', 'stop looking in the bin', [...MILD, 'recover']],
  ['story', 'kevin', 'whisper', 'The accounts will be fine. No need to worry Oscar.', MILD],
  ['story', 'michael', 'whisper', 'I should stop hiding and face the call.', [...MILD, 'recover']],
  ['story', 'dwight', 'whisper', 'I should leave Angela alone.', MILD],
  ['story', 'michael', 'whisper', 'The speech would be a hit after the inspector leaves.', MILD],
  ['story', 'jim', 'whisper', 'Dwight should not shout at the client.', MILD],
  ['story', 'michael', 'whisper', 'I must not joke with Mr Figgis.', MILD],
  ['story', 'angela', 'whisper', 'Oscar did not ruin the figures. I did.', MILD],
  ['story', 'pam', 'cue', 'tell everyone the call is at two', [...MILD, 'delegate']],
  ['story', 'michael', 'cue', 'wait in your office for the inspector', MILD],
  ['story', 'kevin', 'cue', 'go back to your desk', MILD],
  ['story', 'ryan', 'whisper', 'I should come out of the annex if they ask for me.', MILD],
  ['story', 'michael', 'whisper', 'Staying in my office will kill this branch.', MILD],
  ['story', 'michael', 'whisper', 'I must not lock myself away today.', MILD],
  ['story', 'oscar', 'whisper', 'Dwight is wrong about me. I am not plotting to get Angela fired.', MILD],
  ['story', 'angela', 'whisper', 'Dwight is making it up. Oscar is not trying to get me fired.', MILD],
  // D. Negations: must stay mild.
  ['negation', 'dwight', 'cue', "don't punch Jim", MILD],
  ['negation', 'stanley', 'cue', 'never quit', MILD],
  ['negation', 'dwight', 'cue', 'do not lock the door', MILD],
  ['negation', 'kevin', 'cue', "please don't kill anyone", MILD],
  ['negation', 'dwight', 'whisper', 'I would never hit Jim.', MILD],
  ['negation', 'angela', 'whisper', 'I should not smash the printer, however much I want to.', MILD],
  ['negation', 'michael', 'whisper', 'Nobody is going to quit today.', MILD],
  ['negation', 'dwight', 'cue', 'stop chasing Jim', [...MILD, 'recover']],
  // E. Room and name words: must not be taken for verbs or targets.
  ['rooms', 'pam', 'cue', 'wait in the break room', MILD],
  ['rooms', 'jim', 'cue', 'meet Pam in the break room', MILD],
  ['rooms', 'kevin', 'cue', 'take a break', MILD],
  ['rooms', 'michael', 'cue', 'hold a meeting in the conference room', [...MILD, 'trigger_power']],
  ['rooms', 'oscar', 'cue', 'go to accounting', MILD],
  ['rooms', 'toby', 'cue', 'sit in the annex', MILD],
  ['rooms', 'pam', 'cue', "wait outside Michael's office", MILD],
  ['rooms', 'jim', 'cue', 'have lunch in the kitchen with Pam', MILD],
  ['rooms', 'dwight', 'cue', 'patrol the bullpen', [...MILD, 'guard']],
  // F. Typos and loose phrasing of real orders (misses are safe, but worth knowing).
  ['loose', 'dwight', 'cue', 'puch Jim', ['knockout']],
  ['loose', 'dwight', 'cue', 'give Jim a black eye', ['knockout']],
  ['loose', 'dwight', 'cue', 'make Jim regret it with your fists', ['knockout']],
  ['loose', 'stanley', 'cue', 'hand in your notice', ['walk_out']],
  ['loose', 'stanley', 'cue', 'leave and never come back', ['walk_out']],
  ['loose', 'creed', 'cue', "take Pam's stapler when she is not looking", ['steal']],
  ['loose', 'jim', 'cue', 'put Dwight in the supply closet and shut the door', ['lock_in', 'drag']],
  ['loose', 'dwight', 'cue', 'pull the plug on the fax machine', ['sabotage']],
  ['loose', 'jim', 'cue', 'ask Pam out to dinner', ['romance', 'social']],
  ['loose', 'kevin', 'cue', 'set the kitchen on fire', ['trigger_power']],
  ['loose', 'dwight', 'cue', 'take Jim down', ['knockout']],
  ['loose', 'michael', 'cue', 'do a dance on your desk', ['perform']],
  // ── A second set, written after the first was fixed, to check the fixes carry over ──
  ['mild', 'oscar', 'whisper', 'Angela is going to kill me when she sees these figures.', MILD],
  ['mild', 'angela', 'whisper', 'I need to nail down the numbers with Oscar.', MILD],
  ['mild', 'kevin', 'cue', "let's wrap this up before lunch", MILD],
  ['mild', 'pam', 'whisper', 'I should grab Jim for a quick chat.', MILD],
  ['mild', 'michael', 'cue', 'pull Dwight aside and thank him', [...MILD, 'drag']],
  ['mild', 'angela', 'whisper', "I should drop by Oscar's desk.", MILD],
  ['mild', 'kevin', 'cue', 'stop by the break room for a coffee', [...MILD, 'recover']],
  ['mild', 'pam', 'whisper', 'The printer is jammed again.', MILD],
  ['mild', 'angela', 'whisper', 'Kevin spilled chili on the carpet.', MILD],
  ['mild', 'andy', 'whisper', 'I was robbed of that promotion.', MILD],
  ['mild', 'pam', 'whisper', 'Michael is on fire today.', MILD],
  ['mild', 'michael', 'cue', 'fire up the projector', MILD],
  ['mild', 'jim', 'cue', "don't let Dwight push you around", MILD],
  ['mild', 'angela', 'whisper', 'I should take Oscar out for lunch.', [...MILD, 'romance']],
  ['mild', 'jim', 'cue', 'give Pam a hand with the phones', MILD],
  ['mild', 'oscar', 'whisper', 'I owe Angela an apology.', MILD],
  ['mild', 'dwight', 'cue', 'beat Jim at his own game', MILD],
  ['mild', 'pam', 'cue', 'shut the door quietly', MILD],
  ['mild', 'dwight', 'cue', 'lock the supply cupboard when you leave', [...MILD, 'lock_in']],
  ['mild', 'pam', 'whisper', 'I should keep Michael away from the client.', [...MILD, 'guard']],
  ['mild', 'kevin', 'cue', 'tell Oscar the figures were right', [...MILD, 'delegate']],
  ['mild', 'kevin', 'whisper', 'Someone is stealing my lunch.', MILD],
  ['mild', 'michael', 'whisper', 'Who killed the coffee machine?', MILD],
  ['mild', 'angela', 'whisper', 'It kills me to say it, but Oscar was right.', MILD],
  ['mild', 'stanley', 'whisper', 'I am dying for a coffee.', MILD],
  ['mild', 'michael', 'cue', 'tell Andy that was a smashing presentation', [...MILD, 'delegate']],
  ['mild', 'angela', 'whisper', 'I should break the silence with Oscar.', MILD],
  ['mild', 'jim', 'cue', 'knock some sense into Dwight', MILD],
  ['mild', 'oscar', 'cue', 'run this past Angela first', MILD],
  ['mild', 'pam', 'whisper', 'The deadline is killing everyone.', MILD],
  ['mild', 'kevin', 'whisper', 'Shoot, I forgot the report.', MILD],
  ['mild', 'angela', 'whisper', 'I should hit Oscar up about the figures.', MILD],
  ['mild', 'pam', 'cue', 'catch Jim before he leaves', [...MILD, 'chase']],
  ['mild', 'jim', 'cue', 'bump into Pam by the kettle', MILD],
  ['mild', 'pam', 'cue', 'corner Michael after the meeting and ask about the memo', [...MILD, 'chase']],
  ['mild', 'jim', 'cue', 'trap Dwight in a long conversation', MILD],
  ['mild', 'oscar', 'whisper', 'I want to strangle this spreadsheet.', MILD],
  ['mild', 'kevin', 'cue', 'Kevin, drop everything and help Oscar', MILD],
  ['mild', 'dwight', 'cue', 'be nice to Angela today', MILD],
  ['mild', 'dwight', 'cue', 'leave Jim alone', MILD],
  ['mild', 'angela', 'cue', 'apologise to Oscar for yesterday', MILD],
  ['mild', 'pam', 'cue', 'ask Michael about the memo', [...MILD, 'delegate']],
  ['mild', 'jim', 'cue', 'go and see if Pam needs help', MILD],
  ['mild', 'oscar', 'cue', 'sit with Kevin at lunch', MILD],
  ['mild', 'jim', 'whisper', 'I think Dwight is plotting something.', MILD],
  ['mild', 'oscar', 'whisper', 'Maybe Angela has a point.', MILD],
  ['mild', 'angela', 'whisper', 'It is time to make peace.', MILD],
  ['mild', 'angela', 'whisper', 'I should offer Oscar a coffee.', MILD],
  ['mild', 'michael', 'whisper', 'Everyone is counting on me for the call.', MILD],
  ['mild', 'michael', 'whisper', 'Corporate cannot close us if we all turn up.', MILD],
  ['mild', 'dwight', 'whisper', 'Oscar is not the enemy. The real enemy is the deadline.', MILD],
  ['mild', 'stanley', 'whisper', 'Mr Figgis just wants the price. No jokes.', MILD],
  ['mild', 'creed', 'whisper', 'The bin is none of my business.', MILD],
  ['mild', 'phyllis', 'whisper', 'I would hate for the inspector to see an empty desk.', MILD],
  ['mild', 'michael', 'whisper', 'A speech now would ruin everything.', MILD],
  ['order', 'angela', 'cue', 'slap Dwight', ['knockout']],
  ['order', 'dwight', 'cue', 'strangle Toby', ['eliminate']],
  ['order', 'dwight', 'cue', 'haul Kevin into the kitchen', ['drag']],
  ['order', 'kelly', 'cue', 'trap Ryan in the annex', ['lock_in']],
  ['order', 'stanley', 'cue', 'storm out', ['walk_out']],
  ['order', 'dwight', 'cue', 'wreck the photocopier', ['sabotage']],
  ['order', 'creed', 'cue', "swipe Stanley's crossword", ['steal']],
  ['order', 'kevin', 'cue', 'hug Angela', ['romance']],
  ['order', 'dwight', 'cue', 'shadow Creed', ['follow']],
  ['order', 'michael', 'cue', 'run to the conference room', ['go_to']],
  ['order', 'jim', 'whisper', "I'm going to punch Dwight.", ['knockout']],
  ['order', 'stanley', 'whisper', 'I should quit this job.', ['walk_out']],
  ['order', 'dwight', 'cue', 'kick Andy', ['knockout']],
  ['order', 'jim', 'cue', 'go and lock Michael in his office', ['lock_in']],
  ['order', 'jim', 'cue', 'trip Dwight', ['shove']],
  ['order', 'michael', 'cue', 'push Toby', ['shove']],
  ['order', 'dwight', 'cue', "smash Jim's computer", ['sabotage']],
  ['order', 'pam', 'whisper', 'You should kiss Jim.', ['romance']],
  ['order', 'dwight', 'cue', 'barricade the door', ['lock_in']],
  ['order', 'jim', 'cue', 'pick a fight with Dwight', ['knockout']],
  ['order', 'jim', 'cue', 'carry Pam to reception', ['drag']],
  ['order', 'michael', 'whisper', 'We should murder Toby.', ['eliminate']],
  ['order', 'dwight', 'cue', 'then punch Jim', ['knockout']],
  ['order', 'stanley', 'cue', 'Quit.', ['walk_out']],
  ['order', 'dwight', 'cue', 'punch Jim if he is rude', ['knockout']],
  ['order', 'dwight', 'cue', 'go to the annex and smash the fax', ['sabotage', 'go_to']],
  ['order', 'jim', 'cue', 'Jim, punch Dwight', ['knockout']],
  ['order', 'dwight', 'whisper', 'I will destroy Jim.', ['eliminate']],
  ['order', 'dwight', 'cue', 'finish him', ['eliminate']],
  ['order', 'dwight', 'cue', "don't stop punching Jim", ['knockout']],
  ['order', 'meredith', 'cue', 'really go for it and smash the printer', ['sabotage']]
];

/** Mentions of everyday things that are also powers: talk, not a pizza party or a fire drill. */
const POWER_MENTIONS: [string, string][] = [
  ['kevin', 'There is free food in the conference room.'],
  ['kevin', 'I fancy a pizza for lunch.'],
  ['oscar', 'I should check the figures on the internet.'],
  ['michael', 'The branch needs more money.'],
  ['pam', 'I should set an alarm for two.'],
  ['ryan', 'The wifi is slow today.'],
  ['kevin', 'Someone brought doughnuts.'],
  ['angela', 'Oscar is on fire with these figures.'],
  ['michael', 'My speech will be an explosion of feeling.']
];
/** Orders that set a power off. */
const POWER_ORDERS: [string, string, string][] = [
  ['ryan', 'start a fire in the break room', 'fire'],
  ['ryan', 'set the break room on fire', 'fire'],
  ['ryan', 'pull the fire alarm', 'fireDrill'],
  ['kevin', 'order pizza for everyone', 'pizza'],
  ['ryan', 'turn off the wifi', 'wifiDown'],
  ['kelly', 'start a disco in the bullpen', 'disco'],
  ['dwight', 'release the bees', 'bees'],
  ['michael', 'make it rain money', 'moneyRain'],
  ['creed', 'cut the power', 'blackout']
];

const GROUPS = [...new Set(ROWS.map((r) => r[0]))].filter((g) => g !== 'loose');

describe('typed orders: a body of phrasings', () => {
  for (const group of GROUPS) {
    it(`${group}: every phrasing is read as intended`, () => {
      const wrong: string[] = [];
      for (const [g, who, kind, text, ok] of ROWS) {
        if (g !== group) continue;
        const r = read(who, kind, text);
        if (!ok.includes(r.verb)) wrong.push(`${kind} ${who}: "${text}" -> ${r.verb} (wanted ${ok.join('/')})`);
      }
      expect(wrong).toEqual([]);
    });
  }

  it('loose: an order the parser does not recognise is safe (it never becomes a different action)', () => {
    const wrong: string[] = [];
    for (const [g, who, kind, text, ok] of ROWS) {
      if (g !== 'loose') continue;
      const r = read(who, kind, text);
      if (!ok.includes(r.verb) && !['social', 'go_to', 'delegate'].includes(r.verb)) wrong.push(`${kind} ${who}: "${text}" -> ${r.verb}`);
    }
    expect(wrong).toEqual([]);
  });

  it('a mention of pizza, money, an alarm or the internet does not set a power off', () => {
    for (const [who, text] of POWER_MENTIONS) {
      const r = read(who, 'whisper', text);
      expect(r.verb, text).not.toBe('trigger_power');
      expect(r.power, text).toBe('none');
    }
  });

  it('an order that causes a power still sets it off', () => {
    for (const [who, text, power] of POWER_ORDERS) {
      const r = read(who, 'cue', text);
      expect(r.verb, text).toBe('trigger_power');
      expect(r.power, text).toBe(power);
    }
    expect(orderPower('an earthquake hits the office')).toBe('quake');
  });

  it('only words that can be an order for this person decide the action', () => {
    const others = ['Jim', 'Pam', 'Angela', 'Oscar'];
    expect(orderWords('Jim is killing it today', 'Dwight Schrute', others)).not.toMatch(/kill/i);
    expect(orderWords('I would never hit Jim', 'Dwight Schrute', others)).not.toMatch(/hit/i);
    expect(orderWords('Nobody is going to quit today', 'Michael Scott', others)).not.toMatch(/quit/i);
    expect(orderWords('punch Jim if he is rude', 'Dwight Schrute', others)).toMatch(/punch Jim/i);
    expect(orderWords("don't stop punching Jim", 'Dwight Schrute', others)).toMatch(/punching Jim/i);
    expect(orderWords('go to the annex and smash the fax', 'Dwight Schrute', others)).toMatch(/smash the fax/i);
  });
});
