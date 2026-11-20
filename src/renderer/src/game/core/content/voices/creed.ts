// Creed: calm, cryptic, faintly shady. Never surprised. Gets names wrong.
import type { VoiceBank } from '../types';

export const creed: VoiceBank = {
  barks: {
    scared: ["Not again.", "I've got a bag packed.", "Where's the back exit?"],
    startled: ["Ah. That again.", "Hm. Thought you were a cop.", "Seen it."],
    angry: ["You'll regret that. Eventually.", "I know people.", "I know where you park."],
    delighted: ["Ha. Nice.", "That's a keeper.", "Haven't seen that since the seventies."],
    disgusted: ["Smells like Portugal.", "I've had worse for lunch.", "Reminds me of the bus station."],
    hurt: ["Ow. That's my good side.", "Felt that in my old life.", "Ow. Second time this week."],
    confused: ["Which year is it?", "Who are you again?", "Is this the bank?"],
    smug: ["Saw that coming. Years ago.", "Creed knows.", "Told the other guy."],
    sad: ["Nobody remembers my name.", "Miss my old van.", "Different life, same sadness."],
    greeting: ["Hello, new guy.", "Hey, you. Whoever.", "Morning, Phil."],
    goodbye: ["Don't follow me.", "Going home. One of them.", "Gone. I was never here."],
    bored: ["Time for a scheme.", "Counting ceiling tiles. Forty.", "Quiet. Too quiet. Good."],
    working: ["Quality assured.", "Checking quality. Of something.", "Very busy. Ask no questions."],
    sleepy: ["Nap time. Back of the van.", "Up all night. Don't ask.", "Sleeping with one eye open."],
    pickedUp: ["Ah. Abduction. Again.", "Easy. I bruise like a peach.", "Not the first time."],
    dropped: ["Landed. Like the old days.", "Ow. Off the record.", "Floor's familiar."],
    poked: ["Who's that? Mother?", "Spirits. Back off.", "Hands where I can see them."],
    zapped: ["Same as nineteen seventy-one.", "Tingly. Nice.", "That reset something."],
    wet: ["Like the river crossing.", "Wet again. Classic.", "This happens to me."],
    dark: ["I work best in the dark.", "Good. Now I can leave.", "Nobody saw anything."],
    floating: ["This is my third time.", "Ah. Weightless. Like Morocco.", "Grab my wallet if it floats."],
    cold: ["Colder in the mountains.", "This is nothing.", "I've slept in snow."],
    dizzy: ["Spinning. Like old times.", "Ooh. Colors.", "Like a ship deck."],
    tiny: ["Small. Easier to hide.", "I could live in a drawer.", "Been smaller."],
    giant: ["Big. Hard to hide now.", "Been bigger.", "I can see over the fence."]
  },
  chaos: {
    fire: ["Fire. I'll grab my things. From several desks.", "Not my first fire. Not my first building."],
    flood: ["Water. Good. Washes away the evidence.", "Flooded. I'll just float out."],
    blackout: ["Lights out. Perfect time to borrow things.", "Darkness. I can finally work."],
    quake: ["Earthquake. Like the one in Peru. I left before it.", "Shaking. Seen bigger. Felt bigger."],
    fireDrill: ["Drill. I'll be outside. Then much farther outside.", "Leaving. Might come back."],
    lockIn: ["Locked in. I know a way out. Not telling.", "Stuck in a room. Done that. Twice."],
    wifiDown: ["Internet's down. Good. They can't track me.", "I never used it. They watch it."],
    snackStorm: ["Free snacks. Fill your pockets.", "Machine's angry. I know the feeling."],
    ufo: ["They're back. I told them not to come here.", "They took someone. Better them than me again."],
    ghost: ["That ghost owes me money.", "Hey, it's Gary. Hi, Gary."],
    zeroG: ["Weightless again. Like the old days.", "Floating. Somebody hold my wallet."],
    timeFreeze: ["Time stopped. Happens to me Tuesdays.", "Lost a minute. Lost worse."],
    smite: ["Lightning. They found me.", "Struck by lightning. My fourth time."],
    shrink: ["Someone's small. Could fit in a suitcase.", "Tiny. Good for getting through vents."],
    giant: ["Someone's huge. Saw that in a circus once.", "Big fella. We could use him."],
    bodySwap: ["Swapped bodies. I've done that. Long story.", "Whoever's in there, they owe me twenty."],
    disco: ["Disco. I invented this move.", "Mirror ball. Takes me back. To a bad place."],
    bees: ["Bees. They remember me.", "I used to keep bees. They used to keep me."],
    raccoon: ["A raccoon. Hi, buddy. Remember me?", "Don't worry. He's with me."],
    pizza: ["Pizza. I'll take one to go. And one more.", "Free food. Never ask who paid."],
    puppy: ["A puppy. I'll take him home.", "Nice dog. Whose is it? Not anymore."],
    moneyRain: ["Cash. Untraceable. Grab it.", "Money falling. Like my last job."],
    birthday: ["Party. Is it mine? Could be.", "Cake. I'll take the corner piece. All of them."],
    espresso: ["Fast. Like me in the sixties.", "Coffee. That's how it starts."],
    love: ["Love. Seen it ruin better men.", "Someone's smitten. Hide the money."],
    rage: ["Fight. My money's on the angry one.", "Let them go at it. I'll hold the coats."],
    truth: ["Truth? I'm leaving. Now.", "Nobody ask me anything."],
    sleep: ["Sleep. I'll take the couch.", "Nap time. Lock your drawers."],
    paranoia: ["Being watched? Yeah. They're everywhere.", "Feels watched? Smart. Keep moving."],
    rumour: ["Layoffs? They'll never find my file.", "Firing someone? Not me. I'm not in the system."],
    meeting: ["Meeting. I'll sit near the door.", "All hands. I'll be the one in the back."],
    inspector: ["Inspector. Quick, which one am I again?", "Corporate. I was never here."],
    crown: ["New boss. I'll call them Steve.", "Whoever's in charge, I'm in Quality."],
    secretLeak: ["Secrets out. Not mine. I have no records.", "Leaks happen. I'm changing my name."]
  },
  idle: [
    "Is my passport in this drawer?",
    "Who is the guy at Jim's desk? Oh. Jim.",
    "Quality. I should assure some.",
    "Did I leave the van running? Doesn't matter.",
    "I sold that chair yesterday. Nobody noticed.",
    "Sometimes I forget which name I'm using.",
    "The fridge has my lunch. Somebody's lunch.",
    "Phone's ringing. Not answering. Could be them."
  ],
  openers: [
    "Hey, Stan. Oh. {other}.",
    "{other}. You didn't see me today.",
    "{other}. Want to buy a watch? Hardly used.",
    "{other}, are you the new guy?",
    "{other}. Do you know a good lawyer?",
    "{other}. I need a ride. To the border.",
    "{other}. What do you do here?",
    "{other}. You remind me of my old cellmate."
  ],
  replies: {
    warm: [
      "You're all right. Whoever you are.",
      "I like you. You never ask questions.",
      "Ha. That's good. Real good.",
      "We should go into business.",
      "You can have my chair when I vanish.",
      "Good. Very good. Keep it quiet."
    ],
    cold: [
      "You don't want me as an enemy.",
      "I'll remember you. Under another name.",
      "Careful.",
      "Mm. You'll keep.",
      "We're done here.",
      "I've outlived people like you."
    ],
    neutral: [
      "Uh-huh. Interesting.",
      "Could be.",
      "Seen it before.",
      "If you say so, Bob.",
      "Hm. I've heard worse.",
      "That's one theory."
    ]
  },
  whispered: [
    "{thought}. Yeah. I've heard that voice before.",
    "{thought}. Same voice as Tuesday.",
    "{thought}. Good. That's useful.",
    "{thought}. Noted. For the file."
  ],
  announced: [
    "Ceiling's talking again.",
    "That voice. It's them.",
    "Don't answer it.",
    "I didn't hear anything. Neither did you."
  ],
  custom: {
    scary: ["The {thing}. Seen worse. Still leaving.", "I've got a bag packed for this."],
    funny: ["A {thing}. Ha. I've owned one.", "Ha. That never gets old."],
    gross: ["The {thing}? I've eaten worse.", "Smells like the old warehouse."],
    wonderful: ["The {thing}. I'll take it home.", "Nice {thing}. Who do I pay?"],
    weird: ["A {thing}. Normal Tuesday.", "Not even the weirdest thing today."],
    annoying: ["The {thing} needs to go. I can make it go.", "I'll sell the {thing}. Give me an hour."],
    dangerous: ["The {thing}. I'm out the back.", "Grab your passports."],
    romantic: ["A {thing}. That's how my second marriage started.", "Romance. Keep your wallet close."],
    sad: ["Sad {thing}. Reminds me of me.", "Seen sadder. In Nevada."]
  }
};
