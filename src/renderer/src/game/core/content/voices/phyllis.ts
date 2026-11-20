// Phyllis: sweet and unhurried, a quiet dig inside. Knits, gossips, mentions Bob.
import type { VoiceBank } from '../types';

export const phyllis: VoiceBank = {
  barks: {
    scared: ["Oh dear. Oh dear.", "Bob! Where's Bob?", "Oh, I don't like this."],
    startled: ["Oh my goodness!", "Oh! You startled me.", "Goodness gracious."],
    angry: ["Well, isn't that nice.", "I'll remember that.", "Bob will hear about this."],
    delighted: ["Oh, how lovely!", "Isn't that sweet?", "Well, aren't we lucky."],
    disgusted: ["Oh, that's just awful.", "Some people.", "My, my. Who did that?"],
    hurt: ["Oh! My hip.", "Ow. Careful, dear.", "That stung a bit."],
    confused: ["I'm sorry, dear?", "What's all this?", "Oh. I don't follow."],
    smug: ["Well, I heard first.", "I knew before anyone.", "I won't say I told you."],
    sad: ["Nobody asked me.", "Oh well. Never mind.", "I'll just knit."],
    greeting: ["Morning, dear.", "Hello, sweetie.", "Oh, hi there."],
    goodbye: ["Bob's picking me up.", "Bye-bye, everyone.", "See you tomorrow, dear."],
    bored: ["Another row.", "Knit one, purl two.", "Quiet day. Too quiet."],
    working: ["Just finishing a call.", "Making my sales, dear.", "One more order."],
    sleepy: ["Oh, I could nap.", "Just resting my eyes, dear.", "Long night. Bob snores."],
    pickedUp: ["Oh! Oh my! Put me down!", "Mind my knitting!", "Goodness, I'm in the air!"],
    dropped: ["Oof. My back.", "Well, that was rude.", "Oh. I'm on the floor."],
    poked: ["Oh! Who's there?", "Stop that, please.", "Was that you, Stanley?"],
    zapped: ["Oh! My perm!", "Ooh, that tingled.", "Well, that woke me up."],
    wet: ["My yarn is soaked!", "Oh, my good cardigan.", "Wet as a dishrag."],
    dark: ["Oh, the lights went.", "Hold my hand, dear.", "I can't see my needles."],
    floating: ["Oh my, I'm floating!", "My skirt! Goodness!", "Bob won't believe this."],
    cold: ["Good thing I knit.", "Chilly, isn't it?", "I'll get my shawl, dear."],
    dizzy: ["Oh, I'm woozy.", "The room is twirling.", "I need to sit, dear."],
    tiny: ["Oh dear, I'm tiny.", "Don't squash me, sweetie.", "My needles are huge."],
    giant: ["Oh, I'm enormous.", "Mind the ceiling, dear.", "Well. This is new."]
  },
  chaos: {
    fire: ["Oh dear, fire. Bob always said this building was a tinderbox.", "My knitting bag! Somebody grab my knitting!"],
    flood: ["Oh, my shoes. Bob bought me these.", "Water everywhere. At least my desk is dry. Angela's isn't."],
    blackout: ["Goodness, it's dark. Stanley, is that you?", "Lights out. Now's when the secrets come out."],
    quake: ["Oh! Oh my! Hold on to something!", "Bob felt one in Ohio once. This is bigger."],
    fireDrill: ["A drill? I'll bring my knitting.", "Fresh air. Lovely. Stanley, walk with me."],
    lockIn: ["Locked in. Well. Plenty of time to talk.", "Stuck in here? I hope someone brought snacks."],
    wifiDown: ["No internet? I'll just knit.", "Well, now we'll have to actually talk. How lovely."],
    snackStorm: ["Oh! A candy bar hit me! I'll keep it.", "Snacks everywhere. Kevin must be thrilled."],
    ufo: ["Oh my. Was that a spaceship?", "I wonder who they took. I'll find out."],
    ghost: ["A ghost! Oh, I've got goosebumps.", "Oh dear. I'll say a little prayer."],
    zeroG: ["Oh! My yarn is floating away!", "My skirt! Gentlemen, eyes up."],
    timeFreeze: ["Oh. I lost my place. In my knitting.", "Did everything just stop? Funny feeling."],
    smite: ["Oh goodness! Somebody's hair is smoking!", "My, that was a bolt. Somebody's being punished."],
    shrink: ["Oh, someone's so small! Like a little doll.", "Tiny! I could knit them a sweater."],
    giant: ["My goodness, someone's grown!", "That's a big one. Like Bob's brother."],
    bodySwap: ["They're acting funny. Like someone else.", "Something's not right with those two. I'll find out."],
    disco: ["Oh! I haven't danced since my wedding!", "My hips! Oh, well, why not."],
    bees: ["Bees! Oh, they're in my yarn!", "Bees! Stay still, dear. Very still."],
    raccoon: ["A raccoon! Oh, he's got Kevin's lunch.", "Shoo, shoo! Bob would know what to do."],
    pizza: ["Pizza! Oh, how nice. Somebody save me a slice.", "Free pizza. I'll have one. Maybe two."],
    puppy: ["Oh, a puppy! Come here, sweetie.", "What a sweet little face. Nicer than some."],
    moneyRain: ["Money! Oh, I'll put some in my bag.", "Bob says never turn down free money."],
    birthday: ["A party! Whose? I didn't hear. I always hear.", "Oh, a cake. Angela didn't plan this, did she?"],
    espresso: ["Oh my, someone's in a hurry.", "Slow down, dear. You'll hurt yourself."],
    love: ["Oh! Someone's sweet on someone. Who?", "Young love. Or whatever that is."],
    rage: ["Oh, someone's upset. How interesting.", "Somebody's angry. I wonder what they heard."],
    truth: ["Oh, this will be juicy.", "Honesty. How refreshing. For some people."],
    sleep: ["Oh, I'm so drowsy.", "A little nap. Just a little one."],
    paranoia: ["Someone's feeling watched. Well, I am watching.", "Paranoid? Somebody has a reason, then."],
    rumour: ["A layoff? I heard it first. Of course.", "Oh, who could it be? I have ideas."],
    meeting: ["A meeting. I'll bring my needles.", "All of us? Oh, this must be important. Or silly."],
    inspector: ["Corporate. Oh, look sharp, everyone.", "An inspector. Angela will love this."],
    crown: ["Someone new in charge? Well. We'll see.", "Oh, a new boss. How exciting. For them."],
    secretLeak: ["Oh! A secret! Let me read that again.", "Well, I didn't spread it. This time."]
  },
  idle: [
    "Bob's taking me to dinner tonight.",
    "Angela thinks she's so organized.",
    "I know something about Kelly. Hm.",
    "This scarf is for Stanley. Don't tell.",
    "Nobody notices me. That's useful.",
    "One more row and then lunch.",
    "Michael was crying in his office again. Poor thing.",
    "I wonder who I should tell first."
  ],
  openers: [
    "{other}, dear. Have you heard?",
    "Oh, {other}. Sit with me a minute.",
    "{other}, I'm not one to gossip, but...",
    "{other}, sweetie, how's your day?",
    "Hello, {other}. Bob says hello.",
    "{other}, can you keep a secret?",
    "{other}, that's a nice shirt. Is it new?",
    "Oh, {other}. I was just talking about you."
  ],
  replies: {
    warm: [
      "Oh, aren't you sweet.",
      "That's lovely, dear.",
      "Oh, I'm so glad.",
      "You're a good one.",
      "Bob would love you.",
      "Come here, sweetie. Hug."
    ],
    cold: [
      "Well, isn't that something.",
      "Hm. Interesting. For you.",
      "I'll remember you said that.",
      "Oh, bless your heart.",
      "Is that so, dear?",
      "How nice. For some people."
    ],
    neutral: [
      "Oh, really?",
      "Hm. Is that right?",
      "Well, well.",
      "I see.",
      "Oh, how about that.",
      "Mm. Go on, dear."
    ]
  },
  whispered: [
    "{thought}. Oh my. That's a juicy one.",
    "{thought}. Well, I'll keep that to myself. For now.",
    "{thought}? Oh, goodness, where did that come from?",
    "{thought}. Who should I tell first?"
  ],
  announced: [
    "Oh, who was that?",
    "Somebody's playing with the speaker.",
    "Oh, I'll tell Bob about that.",
    "Was that about Angela? It sounded like it."
  ],
  custom: {
    scary: ["Oh dear, the {thing}! Somebody get Bob!", "I'll hide behind Stanley."],
    funny: ["Oh, a {thing}! Isn't that a hoot.", "Somebody tell Bob about the {thing}."],
    gross: ["Oh, the {thing}. That's just awful.", "Somebody should clean that. Angela, perhaps."],
    wonderful: ["Oh, the {thing}! How lovely.", "What a treat. Bob would love the {thing}."],
    weird: ["A {thing}? Well, I never.", "How odd. I wonder who's behind it."],
    annoying: ["That {thing} is getting on my nerves.", "Oh, the {thing}. Of course."],
    dangerous: ["Oh, the {thing}! Everyone out, dears!", "Mind yourselves. That {thing} is trouble."],
    romantic: ["Oh, a {thing}! Who's the lucky one?", "That's romantic. Bob did that once."],
    sad: ["Oh, the poor {thing}.", "That's so sad. I'll knit something."]
  }
};
