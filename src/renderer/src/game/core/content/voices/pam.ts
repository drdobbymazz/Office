// Pam: gentle and shy, kind, with a quiet edge and dry asides. Artist at heart.
import type { VoiceBank } from '../types';

export const pam: VoiceBank = {
  barks: {
    scared: ["Oh my God. Oh my God.", "Okay, okay, okay.", "Jim? Jim!"],
    startled: ["Oh! Jeez.", "Oh my God. Okay. Hi.", "You scared me."],
    angry: ["Are you kidding me?", "Okay, that's not okay.", "I'm not mad. Okay, I'm mad."],
    delighted: ["Oh, that's so nice!", "Aw, I love that.", "This made my whole day."],
    disgusted: ["Oh, that's gross.", "Ew. Who did that?", "I didn't need to see that."],
    hurt: ["Ow. Okay, ow.", "That actually hurt.", "Ow, my drawing hand."],
    confused: ["Sorry, I was doodling. What?", "I'm sorry, what's happening?", "Is that... normal?"],
    smug: ["Told you.", "I'm just saying, I was right.", "Not bad for a receptionist."],
    sad: ["Cool. I'll just answer phones.", "Nobody even looked.", "I'll just draw something."],
    greeting: ["Hi! Morning.", "Hey, you.", "Oh, hi! Come on in."],
    goodbye: ["Bye, guys.", "Okay, I'm heading out.", "Night, everybody."],
    bored: ["So, nothing's happening.", "I've sorted the pens twice.", "Phone, please ring."],
    working: ["Munder Difflin, this is Pam.", "Just filing. Fun.", "One sec, I'm on the phone."],
    sleepy: ["Nap under reception? Tempting.", "Is there coffee left?", "My eyes keep closing."],
    pickedUp: ["Oh my God, put me down!", "Somebody, um, help? Please?", "Why am I in the air?"],
    dropped: ["Ow. I'm fine.", "I think I'm okay?", "Did anyone see that?"],
    poked: ["Jim? Was that you?", "Um, hello?", "Who's poking me?"],
    zapped: ["Ow! What was that?", "That was lightning. Right?", "I'm okay! Kind of."],
    wet: ["Oh no, my sweater.", "I'm soaked. Great.", "My sketchbook!"],
    dark: ["Oh, the lights.", "Okay, nobody grab me.", "Hello? Is anyone there?"],
    floating: ["This is so weird.", "Oh my God, I'm floating.", "Somebody grab my foot."],
    cold: ["Brr. Is a window open?", "I need my cardigan.", "Fingers frozen. Can't draw."],
    dizzy: ["Whoa. Head rush.", "Everything's spinning a little.", "Is the floor moving, or me?"],
    tiny: ["Oh no, I'm tiny.", "Please watch your feet.", "Hi. Down here. Hello?"],
    giant: ["Oh no, I'm huge.", "Sorry! Sorry, ceiling.", "I don't fit anywhere."]
  },
  chaos: {
    fire: ["Oh my God, fire! Is everyone out?", "Grab the phones. No, forget the phones. Run."],
    flood: ["My sketchbook is under that desk!", "Okay, the carpet is squishing. That's bad."],
    blackout: ["Oh, the lights. Okay. Nobody panic.", "I can't see. Jim, where are you?"],
    quake: ["Was that an earthquake? In Scranton?", "Get under the desk. Is that what you do?"],
    fireDrill: ["Fire drill. At least it's sunny.", "Okay, everybody, outside. Calmly. Please."],
    lockIn: ["The door's stuck. Okay. Okay. It's fine.", "Well, we're locked in. We could talk, I guess."],
    wifiDown: ["No internet? I'll actually get some drawing done.", "The phones still work. Lucky me."],
    snackStorm: ["Snacks are flying. Like, actually flying.", "Ow! A pretzel just hit me in the face."],
    ufo: ["Was that a flying saucer? Over our office?", "Okay. I'm going to need a minute."],
    ghost: ["Oh my God. That's a ghost.", "I'm not going in there. Nope."],
    zeroG: ["Oh my God, my pens are floating. And me.", "This is so weird. Kind of pretty, though."],
    timeFreeze: ["Did everyone just stop? Or was that just me?", "That was strange. I lost a second."],
    smite: ["Oh my God, lightning! Is everyone okay?", "Did someone just get struck by lightning? At work?"],
    shrink: ["Oh no. Someone is so small. Watch your feet!", "That's tiny. Okay, nobody sit down."],
    giant: ["Oh wow. That's... very big.", "Okay, someone's huge. Mind the ceiling tiles."],
    bodySwap: ["Why does that sound like someone else talking?", "Okay, that's not their voice. That's weird."],
    disco: ["A disco ball? Okay, I'm dancing. Don't look.", "My feet won't stop. Oh my God."],
    bees: ["Bees! Oh my God, bees!", "Nobody swat them! You'll make them mad!"],
    raccoon: ["Is that a raccoon? It looks so pleased with itself.", "It's eating someone's yogurt. Wow."],
    pizza: ["Free pizza? Okay, I'm not going to argue.", "Oh, pizza! Save me a plain one."],
    puppy: ["A puppy! Oh my God, look at his face!", "Hi, baby! Who's a good boy?"],
    moneyRain: ["Is that real money? Is it ours?", "Okay, I'm taking two. Just two."],
    birthday: ["A party? That's so sweet. Whose is it?", "Oh, cake! Somebody did all this?"],
    espresso: ["Someone's going really fast. Is that safe?", "Wow. Somebody needs to drink some water."],
    love: ["Aw. Someone's got a crush. A big one.", "That's actually kind of sweet. In a weird way."],
    rage: ["Okay, someone's really angry. Let's all breathe.", "Please don't fight. Please. Okay, they're fighting."],
    truth: ["Wow. That was very honest.", "Okay, maybe some things should stay unsaid."],
    sleep: ["Why is everyone yawning? Oh no, me too.", "I'll just rest my head on the desk."],
    paranoia: ["Being watched? Oh God. Are we?", "Okay, now I feel watched too."],
    rumour: ["Someone's getting fired? Oh no. Who?", "I'm sure it's just a rumour. Right?"],
    meeting: ["Another meeting. I'll bring my sketchbook.", "All hands? Okay. Grabbing a pen."],
    inspector: ["Corporate's here. Okay, everybody smile.", "Michael, please don't do a bit."],
    crown: ["New boss? Okay. Let's be supportive.", "This is going to be a long day."],
    secretLeak: ["Oh no. That should not have gone to everyone.", "I'm not reading it. Okay, I read it."]
  },
  idle: [
    "I should really finish that painting.",
    "Jim's been quiet. That's suspicious.",
    "If the phone rings, I'm not here.",
    "Draw the vending machine again? Sure.",
    "Art class is Thursday. Don't forget.",
    "Michael's door is closed. That's a good sign.",
    "I wonder if anyone would buy my drawings.",
    "One more coffee. Then I'll be nice."
  ],
  openers: [
    "Hey, {other}. Can I ask you something?",
    "{other}, did you see that? Tell me you saw that.",
    "Hi, {other}. How are you holding up?",
    "{other}, quick question. Don't laugh.",
    "Oh, {other}! I was just thinking about you.",
    "{other}, can I show you a drawing? It's not finished.",
    "{other}, do you need anything? I'm doing a supply run.",
    "Hey, {other}. Want to hide in the break room with me?"
  ],
  replies: {
    warm: [
      "Aw, that's really sweet.",
      "Ha! Okay, that's funny.",
      "You always know what to say.",
      "I'm so glad you're here.",
      "Stop it. You're making me blush.",
      "Yes. Totally. I'm in."
    ],
    cold: [
      "Okay. Sure.",
      "I'm going to go back to my desk.",
      "Mm-hmm. Great.",
      "I'll pretend I didn't hear that.",
      "Wow. Okay then.",
      "That's... a choice."
    ],
    neutral: [
      "Oh, okay. Cool.",
      "Yeah, that makes sense.",
      "Huh. I didn't know that.",
      "Sure, I guess.",
      "Maybe? I'll think about it.",
      "Right. Okay."
    ]
  },
  whispered: [
    "{thought}. Oh my God, where did that come from?",
    "{thought}? I'm not saying that out loud.",
    "Wait. {thought}. Huh.",
    "{thought}. I should draw that. Somehow."
  ],
  announced: [
    "Who was that? That wasn't Michael.",
    "Did the speaker just talk on its own?",
    "I'm the one who does the announcements.",
    "Okay, that was creepy."
  ],
  custom: {
    scary: ["Oh my God, the {thing}! Get behind the desk!", "I'm not going near the {thing}."],
    funny: ["There's a {thing} in here! I can't stop laughing.", "Somebody take a picture of the {thing}."],
    gross: ["Oh, the {thing} is so gross.", "I'm going to be sick. Nope."],
    wonderful: ["Oh, the {thing}! It's beautiful.", "I want to paint the {thing}."],
    weird: ["Is that... a {thing}? In here?", "I'm going to pretend that's normal."],
    annoying: ["The {thing} again? Really?", "Can someone please do something about the {thing}?"],
    dangerous: ["Everybody out! The {thing}!", "Okay, that {thing} could hurt someone."],
    romantic: ["Aw, a {thing}! Who's it for?", "That's actually really romantic."],
    sad: ["Aw. Somebody give the {thing} a hug.", "That's so sad. I need a minute."]
  }
};
