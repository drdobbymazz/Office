// Toby: quiet, apologetic, defeated. Trails off. Should probably file a report.
import type { VoiceBank } from '../types';

export const toby: VoiceBank = {
  barks: {
    scared: ["Oh. Oh no. Oh gosh.", "I should probably... run?", "This isn't... okay."],
    startled: ["Oh! Sorry.", "Oh, gosh.", "I didn't... sorry."],
    angry: ["That's... not great.", "I'm upset. Quietly.", "Can we not... okay."],
    delighted: ["Oh. Oh, that's nice.", "I'm... happy? I'm happy.", "Oh, wow. For me?"],
    disgusted: ["That's... a violation.", "Oh, that's... no.", "Someone should report that."],
    hurt: ["Ow. That's... fine.", "I'll just fill out a form.", "That hurt. It's okay."],
    confused: ["Sorry, I'm... lost.", "Is that... allowed?", "I don't... follow?"],
    smug: ["Policy was clear.", "I did warn people.", "Huh. I was right."],
    sad: ["Nobody asked me. Again.", "Same as always.", "It's... it's fine."],
    greeting: ["Oh, hi.", "Hey. Hi. Sorry.", "Morning. If that's okay."],
    goodbye: ["I'll just... head out.", "Bye. Bye, everyone.", "See you. Or not."],
    bored: ["Another form.", "Quiet. Nice. Lonely.", "Filing. Again."],
    working: ["Updating the handbook.", "Just... filing things.", "Compliance training. Again."],
    sleepy: ["Up late writing. Never mind.", "So tired. Sorry.", "Just... a minute."],
    pickedUp: ["Oh! Oh no, please...", "This isn't... in the handbook.", "Put me... thank you?"],
    dropped: ["Ow. Okay. Okay.", "I'm... fine, I think.", "That's a workplace injury."],
    poked: ["Hello? Michael?", "Oh. Sorry. My fault?", "Who's... okay."],
    zapped: ["Ow. I should report... ow.", "My hair. It was flat.", "That's an electrical... hazard."],
    wet: ["Oh. I'm wet.", "My notes. My forms.", "Okay. Okay. Wet."],
    dark: ["Um. Hello?", "I'll just... stay here.", "Is anyone...? No?"],
    floating: ["This is... unusual.", "Oh. Up. Okay.", "Nobody's... going to help."],
    cold: ["It's cold. Sorry.", "I'll get a sweater.", "Chilly. Again."],
    dizzy: ["Oh. The room is... tilting.", "I'll just... lie down here.", "Sitting. Down now."],
    tiny: ["Oh. I'm small.", "Nobody notices. Even less now.", "Please... watch out."],
    giant: ["Oh. I'm in the way.", "Sorry. Sorry. Big.", "This... can't be compliant."]
  },
  chaos: {
    fire: ["There's a fire. I should file a... okay, running.", "Everyone, the exits are... nobody's listening."],
    flood: ["That's water damage. There's a form for that.", "I did mention the pipes. In a memo. Nobody read it."],
    blackout: ["Power's out. Is everyone... okay?", "I'll just wait here. In the dark. Alone."],
    quake: ["Oh. Oh, that's an earthquake.", "Under the desks, everyone, if you... okay."],
    fireDrill: ["This is actually... my drill. Not that anyone asked.", "Please, the meeting point is... never mind."],
    lockIn: ["Locked in. Okay. At least it's quiet.", "Should I knock? I'll knock. Quietly."],
    wifiDown: ["No internet. I'll file on paper.", "That's... fine. I have forms."],
    snackStorm: ["Snacks are flying. That's a hazard.", "Ow. A pretzel. It's okay."],
    ufo: ["Was that a... spaceship?", "I should write that down. Nobody will believe me."],
    ghost: ["A ghost. Of course. It's... it's fine.", "Hello? Ghost? I'm from HR."],
    zeroG: ["I'm floating. Is that... covered?", "Gravity's gone. There's no form for this."],
    timeFreeze: ["Did I... lose a moment?", "Strange. Nobody moved. Including me."],
    smite: ["Lightning. Is everyone... is everyone okay?", "That needs an incident report. A big one."],
    shrink: ["Someone's very small. Please don't... step.", "There's no policy for shrinking. I checked."],
    giant: ["Someone grew. The doorways aren't... compliant.", "That's... a lot of person to insure."],
    bodySwap: ["They're not... themselves. I think.", "Identity's... complicated today."],
    disco: ["I don't really... okay, I'm dancing.", "Dancing at work is... technically fine."],
    bees: ["Bees. I'll get the... first aid kit.", "Everyone stay calm. Please. Bees."],
    raccoon: ["A raccoon. I'll call animal control. They never call back.", "Please don't touch it. It's... wild."],
    pizza: ["Pizza. Oh. Can I... have one?", "Nobody saved me a slice. Oh, there's one."],
    puppy: ["Oh. A puppy. He likes me.", "A dog. Finally. Somebody who's happy to see me."],
    moneyRain: ["Money. Where do I... log this?", "Oh. Cash. I should report this."],
    birthday: ["A party. Oh. I wasn't... invited. Or was I?", "Cake. Is it okay if I... thanks."],
    espresso: ["That's a lot of caffeine. Maybe some water?", "Someone's very fast. Please slow... okay."],
    love: ["Office romance. There's a disclosure form.", "Someone's smitten. I should... mention the policy."],
    rage: ["Conflict. I can mediate. If anyone wants... no.", "Raised voices. I'll get the... complaint form."],
    truth: ["Oh. Honesty. That's... a lot.", "I'm not going to say anything. Truthfully."],
    sleep: ["Everyone's sleeping. Actually... me too.", "Sleeping at work is... technically..."],
    paranoia: ["Someone feels watched? That's... not unreasonable.", "I always feel watched. By Michael."],
    rumour: ["Layoffs? HR wasn't told. HR is never told.", "Nobody's getting... I don't actually know."],
    meeting: ["All-hands. I'll sit at the back.", "Should I... come too? Okay."],
    inspector: ["An inspector. Oh good. Someone who reads forms.", "Corporate. Please, everyone, follow procedure."],
    crown: ["A new boss. Is there paperwork? There should be.", "Oh. Okay. I'll update the org chart."],
    secretLeak: ["Oh no. That's a privacy violation.", "Please, everyone, don't forward that. Okay."]
  },
  idle: [
    "Chapter nine. The manager never sees it coming.",
    "Maybe I'll eat lunch with someone today.",
    "Pam said hi. That was nice.",
    "There's a form for this. There's a form for everything.",
    "Michael made a face at me again.",
    "A quiet beach. Someday.",
    "I should file a report. About the reports.",
    "Nobody reads the handbook. Nobody."
  ],
  openers: [
    "Hey, {other}. Sorry, have you got a minute?",
    "{other}, um. Quick question. If that's okay.",
    "{other}, I just need a signature. Sorry.",
    "Oh, {other}. Hi. How are... things?",
    "{other}, can I... never mind.",
    "{other}, did you get my memo? No one gets my memo.",
    "Hey, {other}. Would you want to have lunch? No pressure.",
    "{other}, I'm required to ask. Are you okay?"
  ],
  replies: {
    warm: [
      "Oh. That's really nice.",
      "Thanks. That means... a lot.",
      "Ha. Yeah. That's good.",
      "You're kind. Nobody's kind.",
      "I'd like that. A lot.",
      "Oh, wow. Okay. Thank you."
    ],
    cold: [
      "Okay. Sorry.",
      "I'll just... go.",
      "That's... noted. In writing.",
      "I'm going to file that.",
      "That's not... very nice.",
      "Right. Of course."
    ],
    neutral: [
      "Oh. Okay.",
      "Sure. I think.",
      "That's... fair.",
      "Hmm. Maybe.",
      "Right. Right.",
      "I'll look into it."
    ]
  },
  whispered: [
    "{thought}. I should... write that down.",
    "{thought}? That's... not like me.",
    "{thought}. Is that... allowed?",
    "{thought}. Huh. Okay. Huh."
  ],
  announced: [
    "That announcement didn't go through HR.",
    "Who... authorized that?",
    "Nobody listens when I use the speaker.",
    "Should I make a note? I'll make a note."
  ],
  custom: {
    scary: ["The {thing}. I'll just... hide.", "Please don't... make eye contact with it."],
    funny: ["A {thing}. Ha. That's... funny.", "I shouldn't laugh. Ha."],
    gross: ["The {thing} is a health violation.", "I'll need gloves. And a form."],
    wonderful: ["A {thing}. Oh. That's lovely.", "That's nice. Nice things don't happen to me."],
    weird: ["A {thing}? Is that... allowed?", "There's no policy on the {thing}."],
    annoying: ["The {thing}. I'll file a complaint. Nobody reads them.", "Could someone... the {thing}... okay."],
    dangerous: ["The {thing} is dangerous. Everybody... please...", "Evacuate. Calmly. If that's okay."],
    romantic: ["A {thing}. There's a disclosure form for that.", "Romance. For other people."],
    sad: ["That {thing} is sad. Like me.", "I know how the {thing} feels."]
  }
};
