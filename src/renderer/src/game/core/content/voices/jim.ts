// Jim: dry, understated, says less than he means. Pranks Dwight, likes Pam.
import type { VoiceBank } from '../types';

export const jim: VoiceBank = {
  barks: {
    scared: ["Okay. Not great.", "This seems bad.", "Yeah, I'm leaving."],
    startled: ["Whoa. Okay.", "Huh. Didn't see that coming.", "Well, that happened."],
    angry: ["Seriously?", "Cool. Really cool.", "Okay, that's annoying."],
    delighted: ["Oh, this is great.", "Best day in a while.", "I love this so much."],
    disgusted: ["That's not good.", "Nope. Hard pass.", "Why is it sticky?"],
    hurt: ["Ow. Okay.", "That's going to bruise.", "Ow. Noted."],
    confused: ["Sorry, what?", "I'm missing something.", "Is this a bit?"],
    smug: ["Not bad, right?", "Called it.", "I'll take that."],
    sad: ["Yeah. Cool. Fine.", "Another Tuesday.", "That's a bummer."],
    greeting: ["Hey.", "Oh, hey there.", "Morning. Let's do this. Or not."],
    goodbye: ["I'm out.", "See you tomorrow.", "Later. Don't touch my desk."],
    bored: ["Is it five yet?", "Riveting stuff.", "Clock's not moving."],
    working: ["Working. Ish.", "Selling paper. Thrilling.", "On a call. Kind of."],
    sleepy: ["Need coffee. Badly.", "Eyes closing. Not my fault.", "Long day. It's ten a.m."],
    pickedUp: ["Okay. I'm in the air. Sure.", "This is new.", "Huh. Put me down?"],
    dropped: ["Oof. Okay.", "Floor. Hi.", "That's fair."],
    poked: ["Was that you, Dwight?", "Hm? Who's there?", "Okay, who did that?"],
    zapped: ["My hair is standing up.", "Ow. Lightning. Sure.", "That's a new one."],
    wet: ["Great. Wet socks.", "So that's a new shirt.", "Love being damp at work."],
    dark: ["Well, that's ominous.", "Nobody move. Especially Dwight.", "Can't see. Can't work. Shame."],
    floating: ["Going to roll with this.", "Gravity's optional now. Okay.", "Hi, ceiling."],
    cold: ["Cool. Literally.", "Who set this to arctic?", "Can't feel my hands."],
    dizzy: ["Whoa. Room's moving.", "Seeing two Dwights. Nightmare.", "Everything's spinning. Cool."],
    tiny: ["So I'm small now.", "Everything's very tall.", "Don't step on me, guys."],
    giant: ["Mind your heads.", "So I'm huge now.", "Ceiling's closer than usual."]
  },
  chaos: {
    fire: ["So that's on fire. Great.", "Dwight, you're going to want to be in charge of this."],
    flood: ["Wet carpet. Smells amazing already.", "Good thing I wore my bad shoes."],
    blackout: ["Lights are out. Nobody tell Dwight it's not a drill.", "Well, I can't work now. Shame."],
    quake: ["Whoa. Okay. Earthquake in Scranton.", "Was that a truck? That was not a truck."],
    fireDrill: ["Fire drill. Best part of my day.", "Outside? Twist my arm."],
    lockIn: ["Locked in. Cool. Love that.", "So the door doesn't open. That's fun."],
    wifiDown: ["No internet. Guess we're talking now.", "Wi-Fi's down. I'm going to stare at Dwight until it's back."],
    snackStorm: ["The vending machine is attacking us. Okay.", "Got hit by a granola bar. Fair."],
    ufo: ["Did a spaceship just take someone? Okay.", "I'd like to say I'm surprised. I'm not."],
    ghost: ["Is that a ghost? That's a ghost.", "Cool. The office is haunted. Makes sense."],
    zeroG: ["Gravity's off. Sure. Why not.", "I'm floating at work. New low. Or high."],
    timeFreeze: ["Did I just lose a minute?", "Weird. Everyone stopped. Including me."],
    smite: ["That was lightning. Indoors.", "Huh. Someone made the weather angry."],
    shrink: ["Someone's the size of a stapler. Totally normal.", "That's small. That's very small."],
    giant: ["That's a lot of person.", "Someone grew. Like, a lot."],
    bodySwap: ["Something's off. They're talking wrong.", "Pretty sure those two switched. Somehow."],
    disco: ["A mirror ball. At work. Okay, I'm in.", "I can't stop dancing. This is my life now."],
    bees: ["Bees. Of course. Bees.", "Hey, Dwight, I think your bees are here."],
    raccoon: ["There's a raccoon eating someone's lunch. Probably Kevin's.", "That raccoon has a better work ethic than me."],
    pizza: ["Free pizza. Not going to question it.", "Pizza? Okay, today's not so bad."],
    puppy: ["There's a puppy. Work is over.", "Oh, hi buddy. Best coworker."],
    moneyRain: ["It's raining money. Don't tell accounting.", "Is this a bonus? Weird way to do it."],
    birthday: ["Surprise party. Wasn't me. Wish it was.", "Cake and balloons? Okay, sure, I'll sing."],
    espresso: ["Someone's had a lot of coffee.", "That's fast. That's way too fast."],
    love: ["Someone's looking at someone. A lot.", "That's a very specific crush happening."],
    rage: ["Oh, someone's furious. This should be good.", "Somebody's about to get yelled at. Not me, for once."],
    truth: ["Wow. Way too honest. I love it.", "That's more truth than I needed."],
    sleep: ["Everyone's asleep. Is it break time?", "Just going to close my eyes. For work."],
    paranoia: ["Someone thinks they're being watched. Relatable.", "Paranoid, huh? Have you met this office?"],
    rumour: ["Layoffs? I'm sure it's fine. Probably fine.", "Someone's getting fired? My money's on whoever started the rumour."],
    meeting: ["All-hands meeting. Can't wait.", "Another meeting. Great. Love meetings."],
    inspector: ["An inspector. Great. Dwight's going to salute him.", "An inspector. Quick, somebody hide Michael."],
    crown: ["New boss. This'll be great. Definitely.", "Oh, someone's in charge now. Good luck to us."],
    secretLeak: ["Somebody's secret is in my inbox. Huh.", "Oh no. Everyone got that. Everyone."]
  },
  idle: [
    "Wonder if Dwight noticed his desk is an inch to the left.",
    "Should probably make a sale today.",
    "Pam looks bored. I could fix that.",
    "Ten years selling paper. Wow.",
    "What if I hid Dwight's whole desk? The whole thing.",
    "Is this my life? Looks like it.",
    "Coffee or a prank? Why not both.",
    "I could leave at lunch. Nobody would notice."
  ],
  openers: [
    "Hey, {other}. Got a sec?",
    "{other}. Did you see that?",
    "So, {other}. How's your day going? Be honest.",
    "{other}, settle something for me.",
    "Hey, {other}. Want to help with something? It involves Dwight.",
    "{other}, is it me or is today extra weird?",
    "{other}. Quick question. Totally harmless.",
    "Morning, {other}. Survived so far?"
  ],
  replies: {
    warm: [
      "Ha. Yeah, I'm in.",
      "That's great. Seriously.",
      "Okay, you win today.",
      "You're the best part of this place.",
      "Love that. Keep going.",
      "See, this is why I come to work."
    ],
    cold: [
      "Cool. Great. Good talk.",
      "Yeah, I'm going to go.",
      "Sure. Absolutely. No.",
      "Fascinating. Truly.",
      "I'll think about it. I won't.",
      "Wow. That's a take."
    ],
    neutral: [
      "Huh. Okay.",
      "Yeah, that sounds about right.",
      "Fair.",
      "Sure, why not.",
      "Interesting. Weird, but interesting.",
      "Could be worse."
    ]
  },
  whispered: [
    "{thought}. Huh. Okay then.",
    "{thought}? Where'd that come from?",
    "Weird thought. {thought}. Not wrong, though.",
    "{thought}. I should not act on that. I might."
  ],
  announced: [
    "Okay, who's on the speaker?",
    "Was that Michael doing a voice?",
    "Huh. The ceiling has opinions.",
    "Dwight, was that you? Sounded like you."
  ],
  custom: {
    scary: ["Okay, the {thing} is not great.", "I'm going to slowly back away."],
    funny: ["There's a {thing}. In the office. Great.", "This is the best thing that's happened here."],
    gross: ["The {thing} is... yeah, no.", "Someone else is cleaning that."],
    wonderful: ["A {thing}? Okay, today's good.", "I'll be honest, I love this."],
    weird: ["So there's a {thing}. Sure.", "I'm not even going to ask."],
    annoying: ["The {thing}. Great. Love that.", "Can someone deal with the {thing}? Not me."],
    dangerous: ["Okay, everyone out. Calmly. Quickly.", "The {thing} looks dangerous. Let's go."],
    romantic: ["A {thing}? That's kind of sweet.", "Somebody's trying something. Bold."],
    sad: ["That {thing} is pretty sad.", "Yeah. That's rough."]
  }
};
