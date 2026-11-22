// Stanley: flat, slow, cannot be bothered. Crossword until five. Pretzels move him.
import type { VoiceBank } from '../types';

export const stanley: VoiceBank = {
  story: {
    hiding: [
      "Michael's hiding. Best morning I've had in years.",
      "If Michael wants to stay in his office, let him. Let him stay forever.",
      "Something's up with Michael. Not my problem. Crossword's my problem."
    ],
    closure: [
      "If they close us, I retire early. I've had the calendar ready for years.",
      "Closing the branch. Fine. Does that mean I can go home now?",
      "I've survived four closures. I'll survive this one. Sitting down."
    ],
    feud: [
      "Angela and Oscar aren't speaking. Finally, some quiet in that corner.",
      "I don't care who started it. I care that it ends before five.",
      "Accounting is fighting. Wake me when it's lunch."
    ],
    client: [
      "Mr Figgis is my kind of man. Says nothing. Wants to leave.",
      "I'll sell to Figgis. I'll do it quick. Then I'm doing my crossword.",
      "Keep Michael away from the client. I'm not saying it twice."
    ],
    leak: [
      "Someone's emailing Corporate. Good for them. More work than I'd do.",
      "I don't care who the leak is. Unless they mentioned my crossword.",
      "Everyone's looking at each other funny. I'm looking at my puzzle."
    ],
    inspection: [
      "The inspector is here. I'm going to look busy. It's exhausting.",
      "If the inspector asks, I've been typing all day. Don't contradict me.",
      "Corporate sends a man with a clipboard. I've outlasted ten of them."
    ],
    waiting: [
      "The inspector's gone. Now we sit and wait. I'm good at sitting.",
      "Corporate decides tonight. I decided years ago. Five o'clock.",
      "Everyone's pacing. I'm not pacing. I'm doing seven across."
    ],
    verdict: [
      "Open or closed, I'm leaving at five.",
      "Whatever they decide, I'm taking my chair. It knows me.",
      "It's been a week. I'd like it to be over now."
    ]
  },
  barks: {
    scared: ["Not today.", "I'm too old for this.", "Lord, no."],
    startled: ["Hm.", "What now?", "Really?"],
    angry: ["Don't push me.", "I will end this conversation.", "Absolutely not today."],
    delighted: ["Pretzels?", "Hm. That's nice.", "Finally. Something good."],
    disgusted: ["Nope. Not today.", "Get that away from me.", "I'm not dealing with that."],
    hurt: ["Ow. Great.", "My back.", "Unbelievable."],
    confused: ["And?", "What is this?", "Did I ask?"],
    smug: ["Saw it coming.", "Twenty years. I know.", "Mm-hmm. Thought so."],
    sad: ["Long day.", "Is it five?", "Sigh."],
    greeting: ["Mm. Morning.", "Don't talk to me yet.", "I'm here. Barely."],
    goodbye: ["Five o'clock. Bye.", "I'm gone.", "Don't call me."],
    bored: ["Seven down. Nine letters.", "Crossword time.", "Wake me at five."],
    working: ["I'm on a call.", "Busy. Go away.", "Doing my job. The minimum."],
    sleepy: ["Just resting.", "Leave me be.", "Eyes closed. Still working."],
    pickedUp: ["Put me down. Now.", "I don't do heights.", "I'm not paid for this."],
    dropped: ["Ugh. My knees.", "Fine. I'll stay here.", "Somebody owes me."],
    poked: ["Don't.", "Touch me again. See.", "I felt that. Stop."],
    zapped: ["That's it. I'm going home.", "Lightning. Of course.", "My crossword is singed."],
    wet: ["My good shoes.", "Not paid enough for this.", "Wet. Wonderful."],
    dark: ["Good. Nap time.", "I'll wait.", "Wake me when it's back."],
    floating: ["No. I'm not doing this.", "Put me back in my chair.", "I refuse to float."],
    cold: ["Turn up the heat.", "Cold. Always cold.", "Somebody fix that."],
    dizzy: ["Need to sit.", "Floor, stop it.", "I'm going to lie down."],
    tiny: ["Don't. Just don't.", "Still not doing work.", "Put me on my chair."],
    giant: ["Still not moving.", "Don't ask me to reach things.", "Big. Fine. Whatever."]
  },
  chaos: {
    fire: ["If it reaches my desk, let me know.", "Somebody else will handle it. I'm finishing this clue."],
    flood: ["My feet are wet. I'm not moving.", "Water. Of course. Put it on the list."],
    blackout: ["Good. I'll rest my eyes.", "No lights, no work. Fine by me."],
    quake: ["I've survived twenty years here. I'll survive this.", "Still shaking? Wake me when it stops."],
    fireDrill: ["I'm taking my crossword.", "Outside is outside the office. I'll allow it."],
    lockIn: ["Locked in. Good. Nobody can bother me.", "Wake me when the door opens."],
    wifiDown: ["Didn't need it.", "I do my crossword on paper. Like a grown man."],
    snackStorm: ["Pretzels. Free. I'll take that.", "Don't let it hit my crossword."],
    ufo: ["A spaceship. Okay.", "If they take Michael, I'm not complaining."],
    ghost: ["A ghost. It can have my chair. Not my crossword.", "I've seen scarier performance reviews."],
    zeroG: ["I'm floating. I'm still not working.", "Put me back down. I was comfortable."],
    timeFreeze: ["Did I just nap standing up?", "Huh. Felt like five o'clock for a second."],
    smite: ["Lightning. Wake me if it hits me.", "Somebody got zapped. Not my problem."],
    shrink: ["Someone's tiny. Don't step on them, I guess.", "Small. Still has to do their job."],
    giant: ["Somebody's big. Don't block my light.", "Huge. Okay. Back to my puzzle."],
    bodySwap: ["Someone's acting weird. Weirder. Fine.", "I don't care who's who."],
    disco: ["I don't dance. My legs say otherwise.", "I'll dance. But I'm not happy about it."],
    bees: ["Bees. Don't make me get up.", "If they sting me, I'm going home."],
    raccoon: ["That raccoon's got more energy than this whole office.", "Leave it. It's not hurting me."],
    pizza: ["Now that's worth getting up for.", "Pizza. I'm moving. Don't make it weird."],
    puppy: ["A dog. Fine. It can sit by me. Quietly.", "Cute. Now go away, dog."],
    moneyRain: ["Money. Now I'm interested.", "That's my retirement right there."],
    birthday: ["A party. Cake? Then I'll stay.", "I'll sing. Quietly. For cake."],
    espresso: ["Someone's going too fast. Slow down.", "Too much coffee. That's a choice."],
    love: ["Somebody's in love. Leave me out of it.", "Mm. Whatever that is, keep it away from me."],
    rage: ["Somebody's yelling. Do it outside.", "I'm not getting involved."],
    truth: ["Truth? Fine. I don't like any of you.", "I'm not saying a word. Not one."],
    sleep: ["Finally. Something I'm good at.", "Nap time. Best part of the day."],
    paranoia: ["Someone's watched? Nobody watches me. Good.", "Paranoid. Do it at your own desk."],
    rumour: ["Layoffs. Good. Pay me to leave.", "If it's me, I'm going home early."],
    meeting: ["A meeting. Of course.", "I'll be in the back. Asleep."],
    inspector: ["Inspector. Act like you work.", "Corporate. Great. Now I have to look busy."],
    crown: ["New boss. Same desk. Same me.", "I don't care who's in charge. Leave me alone."],
    secretLeak: ["Leaked email. I've got a crossword.", "A secret. Mine stays in my drawer."]
  },
  idle: [
    "Twelve across. Five letters. Leave.",
    "Three hours till five.",
    "Phyllis is humming. I'll allow it.",
    "If nobody talks to me, it's a good day.",
    "Retirement can't come soon enough.",
    "Pretzels. That's what this day needs.",
    "I've done enough. For today.",
    "Michael's coming this way. Look down."
  ],
  openers: [
    "{other}. What do you want?",
    "{other}. Is this going to take long?",
    "{other}, keep it short.",
    "{other}. You're blocking my light.",
    "What is it, {other}?",
    "{other}. Nine-letter word for annoyance. Never mind, I'm looking at it.",
    "{other}, I'm on my break. Make it quick.",
    "Mm. {other}. What."
  ],
  replies: {
    warm: [
      "Mm. That's not bad.",
      "You're all right.",
      "Okay. I'll laugh at that.",
      "Fair. Sit down if you want.",
      "Hm. Good point.",
      "I like you. Don't spread it around."
    ],
    cold: [
      "No.",
      "I'm not doing this.",
      "Did you think I cared?",
      "Go away.",
      "Walk away. Keep walking.",
      "I have a crossword. Goodbye."
    ],
    neutral: [
      "Mm-hmm.",
      "Okay. And?",
      "Uh-huh. Sure.",
      "Whatever you say.",
      "Fine. Is that it?",
      "Noted. Bye."
    ]
  },
  whispered: [
    "{thought}. Hm. Not my problem.",
    "{thought}. I'll think about it after five.",
    "{thought}? Weird. Anyway.",
    "{thought}. Nope. Back to my puzzle."
  ],
  announced: [
    "Didn't hear it. Not doing it.",
    "Somebody's on the speaker. Ignoring it.",
    "Is that about pretzels? No? Then no.",
    "Too loud. Turn it down."
  ],
  custom: {
    scary: ["The {thing}. I'm leaving early today.", "I'm not getting up for the {thing}."],
    funny: ["Heh. A {thing}. Okay, that's funny.", "I'll admit it. That got me."],
    gross: ["Get the {thing} away from my desk.", "That {thing} is disgusting. Somebody else's problem."],
    wonderful: ["A {thing}. That's nice. Now, quiet.", "Hm. The {thing}. I like it."],
    weird: ["A {thing}. Okay.", "Not asking. Not caring."],
    annoying: ["The {thing} is too loud.", "Somebody shut the {thing} up."],
    dangerous: ["If the {thing} comes over here, I'm going home.", "Fine. I'll move. Slowly."],
    romantic: ["Keep the {thing} away from me.", "Love. Mm. Not at work."],
    sad: ["That's sad. Back to work.", "Mm. That {thing} has had a day."]
  }
};
