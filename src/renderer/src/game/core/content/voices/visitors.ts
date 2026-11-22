// Visitors who matter to the story: Mr Figgis (Wednesday's client) and the inspector from
// Corporate (Friday). Each has a small bank for the no-model brain, plus how they talk and a few
// example lines for the model's prompt. Anything missing falls back to the generic voice.
import type { VisitorVoice } from '../types';

/** Mr Figgis: gruff, wants a straight answer and a fair price, hates jokes and noise, loves dogs. */
export const figgis: VisitorVoice = {
  speech: 'Short and blunt. No small talk and no jokes. Asks for the price.',
  examples: ["Straight answer, please. What's the price?", "I don't do jokes.", 'Now that is a good dog.'],
  bank: {
    story: {
      client: [
        "I want a straight answer and a fair price. That's all I came for.",
        "I didn't drive all this way for jokes.",
        "Your branch is lucky I'm still sitting here.",
        'Another year depends on what I hear in the next ten minutes.'
      ],
      closure: [
        'I hear Corporate wants to shut this place. Give me a reason they are wrong.',
        "If this branch closes, I'll buy my paper elsewhere. Simple as that.",
        "I don't sign with a branch that won't be here next month."
      ]
    },
    barks: {
      scared: ['Is this building safe?', 'Good grief!', 'Get me out of here.'],
      startled: ['What was that?', 'What on earth?', 'Hey!'],
      angry: ["That's it. I'm done here.", 'Unbelievable.', "I've had enough of this."],
      delighted: ["Well. That's more like it.", 'Good. Very good.', 'Now that is a fine thing.'],
      disgusted: ['Disgraceful.', 'What a mess.', 'Not in front of me.'],
      hurt: ['Ow!', 'Watch it!', 'That hurt.'],
      confused: ['What is going on here?', 'Is this normal?', 'I beg your pardon?'],
      sad: ['What a day.', "This isn't how I do business.", 'Hm.'],
      greeting: ["Figgis. I'm expected.", 'Morning.', "Let's get on with it."],
      goodbye: ["I'll be off.", "We're done here.", 'Good day.'],
      bored: ["I'm still waiting.", 'Is anyone coming?', "Clock's ticking."],
      pickedUp: ['Put me down this instant!', 'Hands off!', "I'm leaving!"],
      dropped: ['Ow. My back.', 'This place is a madhouse.', 'Unacceptable.'],
      poked: ["Don't touch me.", 'Hands off.', 'Watch it.']
    },
    chaos: {
      puppy: ['Now that is a good dog.', 'Come here, boy. Good boy.'],
      pizza: ["Free pizza? I'll take one slice.", 'Pizza. Fine. Just the one.'],
      disco: ['Turn that racket off!', 'What is this noise?'],
      fire: ["Fire! I'm out of here!", 'Is nobody going to do something?'],
      inspector: ['Corporate is here too? Busy place.', 'Another suit. Wonderful.'],
      meeting: ["I'm not here for a meeting about meetings.", 'Make it quick.']
    },
    idle: [
      'Ten minutes. Then I am gone.',
      'Who chose this carpet?',
      'I could be at the shop right now.',
      'They had better have a fair price.'
    ],
    openers: [
      "{other}. Straight answer. What's the price?",
      '{other}, I have ten minutes. Use them.',
      'Are you the one I talk to, {other}?',
      "{other}. I'm not here for a chat.",
      "Let's hear it, {other}. Numbers first."
    ],
    replies: {
      warm: ["That's a fair answer.", 'Good. Go on.', "Now we're talking.", 'I like that. Plain and simple.'],
      cold: ["Was that a joke? I don't do jokes.", "I've heard enough.", "Don't waste my time.", "That's not an answer."],
      neutral: ['Hm. Go on.', 'Numbers, please.', "I'll think about it.", 'Get to the point.']
    },
    announced: ["Who's on the speaker?", 'Loud. Too loud.', 'What kind of place is this?'],
    whispered: ['{thought}. Hm. Plain enough.', '{thought}. Fair point.']
  }
};

/** The inspector from Corporate: flat, formal, humourless, writes everything down. */
export const inspector: VisitorVoice = {
  speech: 'Flat and formal. Short sentences. Writes everything down.',
  examples: ['Carry on. Pretend I am not here.', 'I will be noting that.', 'Is it always this quiet?'],
  bank: {
    story: {
      inspection: [
        "I'm here to see how this branch really works.",
        'Desks, people, and the manager. In that order.',
        'Everything I see goes in the report.',
        'Please, carry on as normal. I mean normal.'
      ],
      closure: [
        "My report helps Corporate decide. That's all I can say.",
        "I don't decide anything. I write it down.",
        'Whether this branch stays open is not up to me. Entirely.'
      ]
    },
    barks: {
      scared: ['This is not in my brief.', 'Is that safe?', 'Good heavens.'],
      startled: ['Good heavens.', 'What was that?', 'Most irregular.'],
      angry: ['This is unacceptable.', 'I have seen enough.', 'Most unprofessional.'],
      delighted: ['Hm. Not bad.', 'That is acceptable.', 'Satisfactory.'],
      disgusted: ['Disgraceful.', 'That is going in the report.', 'I see.'],
      hurt: ['Ow. Noted.', 'That will be in my report.', 'Please stop.'],
      confused: ['Is this a regular occurrence?', 'I need a moment.', 'Explain that, please.'],
      greeting: ["I'm from Corporate. Carry on.", "Don't mind me.", 'Good afternoon.'],
      goodbye: ['That will be all.', 'My report will follow.', 'Good day.'],
      bored: ['Is there more?', 'Hm.', 'Next.'],
      pickedUp: ['Put me down at once!', 'This will be in my report!', 'Most irregular!'],
      dropped: ['That will be noted.', 'My clipboard!', 'Unacceptable.'],
      poked: ['Do not touch the inspector.', 'Hands to yourself.', 'Noted.']
    },
    chaos: {
      inspector: ['Carry on. Pretend I am not here.', 'I will just be making a few notes.', "Don't let me interrupt the work. If there is any."],
      fire: ['Is there a procedure for this?', 'This will be in my report.'],
      puppy: ['Is that animal on the payroll?', 'A dog. In an office. Noted.'],
      pizza: ['Is this a working lunch?', "No, thank you. I'm working."],
      disco: ['Is this a regular occurrence?', 'I will need a moment to write all this down.'],
      meeting: ['A meeting. I will observe.', 'Go ahead. I am only taking notes.']
    },
    idle: [
      'Desks first. Then the manager.',
      'Column one, tidy. Column two, not tidy.',
      'Is it always like this here?',
      'So much to note. So little clipboard.'
    ],
    openers: [
      '{other}. Is this your desk?',
      '{other}, what exactly do you do here?',
      'A moment, {other}. For my notes.',
      '{other}. Name and job, please.'
    ],
    replies: {
      warm: ['Noted. In a good way.', 'That is satisfactory.', 'Thank you. That is helpful.'],
      cold: ['I will be writing that down.', 'That is not reassuring.', 'Interesting. Not in a good way.'],
      neutral: ['Noted.', 'I see.', 'Carry on.']
    },
    announced: ['Is that a regular announcement?', 'Noted.', 'Who said that?'],
    whispered: ['{thought}. That will go in the report.', '{thought}. Noted.']
  }
};

/** Visitors' voices by their id on the floor. */
export const VISITOR_VOICES: Record<string, VisitorVoice> = {
  'visitor:figgis': figgis,
  'visitor:inspector': inspector
};
