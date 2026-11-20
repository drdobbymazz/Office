// Kevin: few words, said slowly. Cheerful. Everything comes back to food.
import type { VoiceBank } from '../types';

export const kevin: VoiceBank = {
  barks: {
    scared: ["Uh oh.", "Nope. Nope.", "Somebody save the snacks."],
    startled: ["Whoa!", "Buh?", "Gah! I dropped my chip."],
    angry: ["Not cool.", "Hey! That was mine.", "I'm mad now."],
    delighted: ["Nice.", "Yes! Snack time!", "Heh. Awesome."],
    disgusted: ["Ew. Not even I'd eat that.", "That smells bad.", "Gross. Is it food?"],
    hurt: ["Ow.", "Ow. My tummy.", "Ow. My arm. My feelings."],
    confused: ["Huh? Is this math?", "I don't get it.", "Wait. What?"],
    smug: ["Heh. Nailed it.", "I'm good at stuff.", "Kevin wins."],
    sad: ["My chips are gone.", "Nobody saved me a donut.", "Sad Kevin."],
    greeting: ["Hey. Heh.", "Hi. Got snacks?", "Morning. Is there donuts?"],
    goodbye: ["Bye.", "Going home. Dinner.", "See you. Bring donuts."],
    bored: ["Is it lunch?", "When's lunch?", "Bored. Hungry. Both."],
    working: ["Doing numbers.", "Math. Ugh.", "Adding things up. Slowly."],
    sleepy: ["Food coma.", "Sleepy.", "Need a nap. And a snack."],
    pickedUp: ["Up? Is lunch up there?", "Put me down. Gently.", "Am I light now? Cool."],
    dropped: ["Oof.", "Ow. My butt.", "Did I land on chips?"],
    poked: ["Hey.", "Stop it. Heh.", "That tickles."],
    zapped: ["Ow! Zap!", "My hair is fuzzy now.", "Did that cook me?"],
    wet: ["I'm wet.", "My socks. Squishy.", "Heh. Like a pool."],
    dark: ["Where's the vending machine?", "Can't see my snacks.", "Who turned it off?"],
    floating: ["Wheee!", "I'm floating. Heh.", "Can I float to the kitchen?"],
    cold: ["Cold.", "Need soup.", "Brr. Hot chocolate?"],
    dizzy: ["Wobbly.", "Spinny.", "Whoa. Two vending machines."],
    tiny: ["Everything's big. Big chips!", "I'm little.", "Giant cookie crumbs!"],
    giant: ["Big Kevin.", "I can reach the top shelf!", "I'm huge. Heh."]
  },
  chaos: {
    fire: ["Not the fridge! My lunch is in there!", "Fire? Is it cooking anything good?"],
    flood: ["My snack drawer! Save it!", "Water. Wet everything. Wet chips."],
    blackout: ["The vending machine is off. This is bad.", "Dark. Is the fridge staying cold?"],
    quake: ["Earthquake! Hold the cookie jar!", "Everything's shaking. Like jelly."],
    fireDrill: ["Outside? Can I bring my chips?", "Fire drill. Can we get food after?"],
    lockIn: ["Locked in? Is there food in here?", "How long can I go without snacks? Not long."],
    wifiDown: ["No internet. I'll eat, then.", "Internet's down. I didn't use it anyway."],
    snackStorm: ["It's raining snacks! Best day of my life!", "Get in my mouth, little pretzels!"],
    ufo: ["Aliens! Do they have snacks?", "A spaceship took someone. Whoa."],
    ghost: ["Ghost! I'm out!", "A ghost. Is it hungry?"],
    zeroG: ["I'm floating! Grab the chips!", "Wheee! This is like a ride."],
    timeFreeze: ["Huh. Did I fall asleep?", "Everything stopped. Even my chewing."],
    smite: ["Whoa. Bright. Heh.", "Zap! Smells like toast."],
    shrink: ["Someone's tiny. Tiny like a cookie.", "Whoa. Little person. Heh."],
    giant: ["Someone's huge. Like, giant.", "Big! That's a lot of lunch."],
    bodySwap: ["Somebody's talking funny. Heh.", "Wait. Who's who now?"],
    disco: ["Dance party! Heh. I can dance.", "My legs are dancing. I didn't tell them to."],
    bees: ["Bees! Do they have honey?", "Bees! Not on my donut!"],
    raccoon: ["Hey! That raccoon has my sandwich!", "He's eating my chips. We're kind of the same."],
    pizza: ["Pizza! Pizza pizza pizza!", "Free pizza. I'm taking four."],
    puppy: ["Puppy! Can he have a chip?", "Aww. Puppy. Nice."],
    moneyRain: ["Money! I'm buying all the snacks!", "Cash! That's like fifty candy bars."],
    birthday: ["Cake! Whose cake? I'll eat it.", "Party! Is there frosting?"],
    espresso: ["Someone's going zoom.", "Whoa. Fast. Too fast for me."],
    love: ["Someone's in love. Heh. Gross.", "Kissy faces. Heh."],
    rage: ["Someone's mad. I didn't do it.", "Uh oh. Fight. I'm staying here."],
    truth: ["Truth? I ate the last donut. Wait. Who said that?", "Wow. That's a lot of truth."],
    sleep: ["Nap time. Finally.", "Sleepy. Good."],
    paranoia: ["Someone's watching? Is it the vending guy?", "Paranoid? I'm just hungry."],
    rumour: ["Someone's getting fired? Not me. Right? Oscar?", "Fired? But I like it here. There's snacks."],
    meeting: ["Meeting? Will there be donuts?", "Another meeting. I'll bring chips."],
    inspector: ["Inspector. Hide the snacks.", "Corporate guy. Act smart. How?"],
    crown: ["New boss? Do they like snacks?", "Someone else is boss. Okay. Lunch still at noon?"],
    secretLeak: ["A secret? Mine is in my drawer. My snack drawer.", "Whoa. Everybody got the same email. Juicy."]
  },
  idle: [
    "What's in B6 today? Pretzels. Probably.",
    "I could eat.",
    "Numbers. Too many numbers.",
    "If I eat lunch now, can I eat lunch again later?",
    "Heh. I just thought of something funny. Forgot it.",
    "Oscar will fix it. Oscar fixes stuff.",
    "Drawer full of snacks. Life is good.",
    "Chips or cookies? Both."
  ],
  openers: [
    "{other}. Hey. Got any snacks?",
    "{other}, what's for lunch?",
    "Hey, {other}. Heh. Guess what.",
    "{other}, want to split a candy bar?",
    "{other}. Is the vending machine working?",
    "{other}, can you help me with a math thing?",
    "Hey, {other}. Did you hear? Heh.",
    "{other}. Pizza later? Maybe?"
  ],
  replies: {
    warm: [
      "Heh. Nice.",
      "You're cool.",
      "I like you. You're funny.",
      "Okay! Yeah!",
      "Want half my sandwich?",
      "That's awesome."
    ],
    cold: [
      "Okay. Bye.",
      "Mean.",
      "I don't like that.",
      "Whatever.",
      "You're not getting a chip.",
      "Hmph."
    ],
    neutral: [
      "Okay.",
      "Huh.",
      "Sure.",
      "Cool.",
      "I don't know.",
      "Maybe. Heh."
    ]
  },
  whispered: [
    "{thought}. Huh. Big thought.",
    "{thought}. Heh. My brain said that.",
    "{thought}. I need a snack to think about it.",
    "Wait. {thought}. Whoa."
  ],
  announced: [
    "Who said that? The ceiling?",
    "Was that about lunch?",
    "Huh? I wasn't listening.",
    "Did they say pizza? I heard pizza."
  ],
  custom: {
    scary: ["The {thing}! I'm hiding behind the vending machine.", "Nope. Not near the {thing}."],
    funny: ["Heh. A {thing}. Heh heh.", "That {thing} is so funny."],
    gross: ["Ew. Even I won't eat near the {thing}.", "The {thing} smells like old tuna."],
    wonderful: ["A {thing}! Nice.", "Can I touch the {thing}?"],
    weird: ["A {thing}? Huh.", "Is the {thing} food?"],
    annoying: ["The {thing} is in my way.", "Make the {thing} go away."],
    dangerous: ["The {thing}! Run! Grab snacks!", "I'm too slow for this."],
    romantic: ["Heh. A {thing}. Kissy.", "Is the {thing} for me? Probably not."],
    sad: ["Aw. Sad {thing}.", "I need a cookie now."]
  }
};
