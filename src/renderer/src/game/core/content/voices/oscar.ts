// Oscar: precise, patient, a bit smug. Corrects facts mid-crisis. "Actually."
import type { VoiceBank } from '../types';

export const oscar: VoiceBank = {
  barks: {
    scared: ["This is not ideal.", "Statistically, I should run.", "Okay. Okay. Breathe."],
    startled: ["Oh! Good grief.", "That was unnecessary.", "Who does that?"],
    angry: ["This is ridiculous.", "I'm surrounded by idiots.", "No. That's unacceptable."],
    delighted: ["Oh, that's genuinely lovely.", "Finally, something sensible.", "I didn't expect that. Nice."],
    disgusted: ["That's unhygienic.", "That's a health code violation.", "Who thought that was okay?"],
    hurt: ["Ow. That was avoidable.", "That will leave a mark.", "Ow. Ergonomically wrong."],
    confused: ["That doesn't follow.", "Walk me through it.", "Wait, that's not how it works."],
    smug: ["I did say this.", "Actually, I was right.", "For the record: called it."],
    sad: ["Nobody listens to me.", "I need a vacation.", "Why do I stay here?"],
    greeting: ["Good morning. Hm.", "Hello. What did I miss?", "Morning. Is it calm today?"],
    goodbye: ["Goodnight, everyone.", "Leaving before anything else happens.", "Off to book club."],
    bored: ["Is anything going to happen?", "I could be at a museum.", "Mind-numbing."],
    working: ["Auditing. Quietly.", "These figures don't add up.", "Working. Unlike some."],
    sleepy: ["The opera ran late.", "I need an espresso.", "Long night of reading."],
    pickedUp: ["This defies physics!", "Put me down, please!", "Who is holding me? Seriously?"],
    dropped: ["Ow. I demand an explanation.", "That floor is unforgiving.", "I'm fine. My pride isn't."],
    poked: ["Kevin, stop it.", "Whoever that is, it's juvenile.", "Is this a prank? It's lazy."],
    zapped: ["That's not how electricity works!", "My hair. Seriously?", "I'm grounded. Literally."],
    wet: ["These are suede!", "This shirt was dry-clean only.", "Why is water coming from there?"],
    dark: ["Circuit breaker. Obviously.", "Everybody stay still.", "Someone overloaded the outlet."],
    floating: ["This is scientifically impossible.", "Where has gravity gone?", "I'm filing a complaint with physics."],
    cold: ["The thermostat is set wrong.", "It's sixty degrees in here.", "Who keeps changing it?"],
    dizzy: ["Vertigo. Lovely.", "I need water.", "Inner ear. Sit down."],
    tiny: ["This violates biology.", "Actually, this is fascinating.", "Mind your step, please."],
    giant: ["My knees can't support this.", "This is biologically impossible.", "Mind your head. Mine."]
  },
  chaos: {
    fire: ["I said that toaster was a hazard. In writing.", "Actually, don't throw water on that. Use the extinguisher."],
    flood: ["I reported that pipe in March.", "Unplug things before you walk in! Basic physics."],
    blackout: ["It's the breaker. It's always the breaker.", "We overloaded the circuit. Predictably."],
    quake: ["Pennsylvania doesn't get earthquakes. Apparently it does.", "Get under a table. The doorway thing is a myth."],
    fireDrill: ["A drill. Good. Nobody here knows the exits.", "Actually, the meeting point is the parking lot, not the door."],
    lockIn: ["The latch is faulty. I've mentioned it.", "Locked in. Well. Let's be adults about it."],
    wifiDown: ["Did anyone try restarting the router?", "No internet. This office is helpless without a search engine."],
    snackStorm: ["That machine was overdue for maintenance.", "Please stop eating off the floor. Kevin."],
    ufo: ["That cannot be a spaceship. And yet.", "I'm going to need peer review for this."],
    ghost: ["There's a rational explanation. I just don't have it.", "Ghosts aren't real. That one seems real."],
    zeroG: ["This is impossible. I'm floating anyway.", "Gravity doesn't switch off. Clearly it does."],
    timeFreeze: ["I lost time. I'd like it noted.", "Something stopped us. That's not physics."],
    smite: ["Lightning indoors. That's not meteorologically possible.", "Someone just got hit by lightning. We need first aid."],
    shrink: ["Someone's shrunk. Biologically, that's absurd.", "Mind where you step. Seriously."],
    giant: ["That's not how growth works. At all.", "Someone's enormous. The floor has a weight limit."],
    bodySwap: ["They've swapped speech patterns. Fascinating.", "Something's very wrong with those two."],
    disco: ["I refuse to dance. Apparently I don't get a choice.", "This is a terrible playlist."],
    bees: ["Don't swat! It releases a pheromone!", "Bees. Through the vent. Which I reported."],
    raccoon: ["A raccoon. Could be rabid. Back away.", "Don't corner it. Nobody listens to me."],
    pizza: ["Free pizza. Who's paying for this, though?", "Corporate pizza. I'd like to see the receipt."],
    puppy: ["A puppy. Fine. It's adorable.", "Who brought a dog? It's actually very sweet."],
    moneyRain: ["That is not how bonuses work. Grab some anyway.", "Is this taxable? It's taxable."],
    birthday: ["Whose birthday? None are scheduled today. I'd know.", "A surprise party. Lovely. Also unbudgeted."],
    espresso: ["That's a dangerous amount of caffeine.", "Someone should check their heart rate."],
    love: ["Someone's infatuated. It's very obvious.", "That crush came out of nowhere. Interesting."],
    rage: ["Can we please de-escalate?", "Someone's furious. I'd like to watch. From over here."],
    truth: ["That's more honesty than this office can handle.", "Oh, this is going to be good."],
    sleep: ["Everyone's falling asleep. Check the vents. Seriously.", "I refuse to... this is... irrational..."],
    paranoia: ["Someone thinks they're watched. Classic anxiety.", "Paranoia is irrational. Usually."],
    rumour: ["Layoffs? Check the source first.", "It's a rumour. Let's not panic until it's a memo."],
    meeting: ["This could have been an email.", "An all-hands. I'll bring my laptop and ignore it."],
    inspector: ["Corporate. Good. Someone sensible.", "An inspector. Let him see the accounts. They're correct."],
    crown: ["A new boss? On what authority?", "This won't go well. I'd like that noted."],
    secretLeak: ["Oh. That was not meant for everyone.", "That email is going to cause problems. I read it twice."]
  },
  idle: [
    "I'd like one rational conversation today.",
    "Book club is going to love this.",
    "That spreadsheet is wrong. Not mine.",
    "Kevin will need help again. Of course.",
    "Nobody here reads. Nobody.",
    "If I left, the accounts would collapse.",
    "Michael misused 'literally' four times today.",
    "I could be teaching. Or anything."
  ],
  openers: [
    "{other}, actually, can I correct something?",
    "{other}, can we talk like adults?",
    "{other}. Did you hear what just happened?",
    "{other}, I need a sane opinion.",
    "So, {other}. I have a theory.",
    "{other}, quick question. Did you read the memo?",
    "{other}, please tell me you saw that too.",
    "{other}, you're one of the reasonable ones, right?"
  ],
  replies: {
    warm: [
      "That's actually very sensible.",
      "Thank you. Finally.",
      "You're right. And I don't say that often.",
      "Ha. Yes. Exactly.",
      "I appreciate that. Truly.",
      "See? Someone gets it."
    ],
    cold: [
      "Actually, no.",
      "That's factually wrong.",
      "I'm not going to dignify that.",
      "Please stop talking.",
      "That's not how anything works.",
      "I'll wait while you think about that."
    ],
    neutral: [
      "Hm. Possibly.",
      "That's one way to see it.",
      "Interesting. Not correct, but interesting.",
      "I'd need data.",
      "Okay. Go on.",
      "Mm. Fair point, I suppose."
    ]
  },
  whispered: [
    "{thought}. Hm. That's irrational. Isn't it?",
    "{thought}? Where is this coming from?",
    "{thought}. I don't usually think like that.",
    "{thought}. I'd like to see evidence."
  ],
  announced: [
    "Who's on the intercom? That's not protocol.",
    "That was oddly specific.",
    "I'd like to know who wrote that.",
    "Was that Corporate? It sounded rehearsed."
  ],
  custom: {
    scary: ["The {thing}. Okay. Rational, calm retreat.", "Nobody provoke it. Please."],
    funny: ["I'm not laughing. Okay, I'm laughing.", "There's a {thing}. That's absurd."],
    gross: ["That {thing} is a health hazard.", "Someone call a professional. Not Dwight."],
    wonderful: ["A {thing}. That's genuinely wonderful.", "I'll admit, the {thing} is lovely."],
    weird: ["A {thing}? There's a logical reason. Probably.", "That's... not explicable."],
    annoying: ["The {thing} is going to cost us.", "Can somebody qualified deal with the {thing}?"],
    dangerous: ["Everyone out. The {thing} is dangerous. Now.", "This is a liability nightmare."],
    romantic: ["A {thing}. Somebody's making a grand gesture.", "That's sweet. And a bit much."],
    sad: ["That {thing} is genuinely sad.", "I need a moment."]
  }
};
