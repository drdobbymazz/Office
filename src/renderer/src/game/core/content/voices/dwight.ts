// Dwight: loud certainty, rules, survival skills, the farm. Everything is a threat.
import type { VoiceBank } from '../types';

export const dwight: VoiceBank = {
  story: {
    hiding: [
      "Michael has sealed himself in his office. Standard emergency procedure. What emergency?",
      "I will guard Michael's door. Nobody passes without the password. There is no password.",
      "Michael is not hiding. He is in a defensive position. Big difference."
    ],
    closure: [
      "If Corporate closes us, I will buy the building. With beet money. Lots of beet money.",
      "Closing this branch would be a mistake. I have filed a complaint. With myself.",
      "False alarm or real alarm, I am prepared. I have supplies hidden everywhere."
    ],
    feud: [
      "Oscar is plotting against Angela. I have no proof. That is how good he is.",
      "Accounting is divided. A divided department falls. I read that in a war book.",
      "Angela and Oscar must reconcile. For the branch. Not for feelings. Feelings are weak."
    ],
    client: [
      "I will handle Mr Figgis. I know hardware. I own four hammers.",
      "Mr Figgis respects strength. I will shake his hand until he signs.",
      "Michael must not talk to the client. That is an order. From me."
    ],
    leak: [
      "There is a mole in this office. I will find it. I have studied moles.",
      "Nobody leaves the building. Everyone is a suspect. Except me. I'm the investigator.",
      "The leak uses the fax machine. Old technology. Leaves no trace. Except paper."
    ],
    inspection: [
      "Inspection protocol. Desks clean, faces blank, nobody mention the beets.",
      "I will escort the inspector. He does not need an escort. I will escort him anyway.",
      "Stand up straight. Corporate measures posture. Probably."
    ],
    waiting: [
      "The inspection is over. Now we wait. I have waited out storms. Real storms.",
      "Corporate decides tonight. I have written two speeches. One victory, one revenge.",
      "Waiting is a test of discipline. I am passing. I am passing very hard."
    ],
    verdict: [
      "Whatever the verdict, I was the best Assistant Regional Manager this branch ever had.",
      "If this is the end, I am taking the stapler. It has served well.",
      "Win or lose, nobody saw me cry. Because I did not. Mostly."
    ]
  },
  barks: {
    scared: ["Retreat! Tactical retreat!", "This is not fear. It's strategy.", "Defensive positions!"],
    startled: ["Ambush!", "Who goes there?", "Identify yourself!"],
    angry: ["Unacceptable!", "Somebody will pay for this.", "Jim! Was this you?"],
    delighted: ["Victory!", "Excellent. Most excellent.", "As I foretold!"],
    disgusted: ["Weakness. Disgusting.", "Filth. I'm reporting it.", "That is a violation."],
    hurt: ["Pain is merely information.", "Merely a flesh wound.", "Ow! I mean, nothing."],
    confused: ["Explain. Immediately.", "That makes no sense. Yet.", "Is this a test? I'll pass."],
    smug: ["Correct, as always.", "I was prepared.", "I knew. I always know."],
    sad: ["A warrior does not weep.", "Nobody salutes anymore.", "Michael didn't notice."],
    greeting: ["State your business.", "Good morning. You're late.", "Report."],
    goodbye: ["Dismissed.", "Back to the farm.", "Guard my desk."],
    bored: ["No threats today. Suspicious.", "Inspecting the perimeter again.", "Idleness breeds weakness."],
    working: ["Closing sales. Crushing them.", "Do not disturb. Selling.", "Productivity at maximum."],
    sleepy: ["Sleep is for the weak.", "Not tired. Conserving energy.", "A farmer rests standing."],
    pickedUp: ["Unhand me, fiend!", "Abduction attempt! I resist!", "I will not be lifted!"],
    dropped: ["Landed like a hawk. Ow.", "I meant to land there.", "Tactical landing. Complete."],
    poked: ["Who touched me?", "Show yourself, coward!", "Halpert! I felt that!"],
    zapped: ["I absorbed it. I'm stronger.", "Lightning! I am conductive!", "Hair is fine. Report nothing."],
    wet: ["Waterproofing compromised!", "Wet is only a feeling.", "Damp. I've been damper."],
    dark: ["Night vision engaged.", "Nobody move. I have a flashlight.", "Freeze! Ambush protocol!"],
    floating: ["Zero gravity drill! Finally!", "I trained for this.", "Swim, Schrute, swim!"],
    cold: ["Farm winters are colder.", "Cold is a mindset.", "Thermostat sabotage! Who?"],
    dizzy: ["Balance. Find balance.", "The floor is attacking me.", "Inner ear compromised."],
    tiny: ["Small but deadly.", "Size is irrelevant!", "Small and ready to bite!"],
    giant: ["Finally, the proper size.", "Bow before me!", "I can see every desk!"]
  },
  chaos: {
    fire: ["I am taking command. Everyone line up behind me!", "Fire! Stop, drop and obey me!"],
    flood: ["Flood! Women, children and Michael first!", "Get to high ground! The desks are high ground!"],
    blackout: ["Power's out. I know where the breaker is. I always know.", "Nobody move. This is how ambushes start."],
    quake: ["Earthquake! Doorways! Get in the doorways!", "Remain calm! I have survived worse on the farm!"],
    fireDrill: ["Drill! Single file! I'm timing you!", "Exit in order of seniority. That's me, then Michael."],
    lockIn: ["Locked in? I can pick this lock. Give me time.", "We ration the water. Nobody touches my emergency beets."],
    wifiDown: ["Internet down. Typical. I use paper. I sell it.", "Wi-Fi sabotage. Jim, where were you at ten?"],
    snackStorm: ["Snack attack! Take cover behind the table!", "The machine has turned on us. I'll handle it."],
    ufo: ["Alien attack! I knew this day would come!", "They took someone! Get the bat from under my desk!"],
    ghost: ["A ghost! I've trained for this. Salt! Where's the salt?", "Spirit, leave this branch at once!"],
    zeroG: ["Grab something bolted down! Like me!", "Gravity has failed. I have not."],
    timeFreeze: ["Something stopped time. That's a security breach.", "Why did I freeze? I'm reporting the building."],
    smite: ["Lightning! Inside! Who is responsible?", "A bolt from above! Enemy weapon, or a sign?"],
    shrink: ["Someone shrank! Nobody step on them! Unless it's Jim.", "Shrinking? That's chemical warfare."],
    giant: ["Giant on the floor! Defensive positions!", "Someone is enormous. Recalculate the fire exits."],
    bodySwap: ["Imposters! Nobody trust anybody!", "Their speech patterns are wrong. Mind swap. Classic."],
    disco: ["Dancing is forbidden during work hours! My feet disagree!", "I will not dance! I am dancing!"],
    bees: ["Bees! Nobody move! Bees respect stillness!", "I keep bees. Let me talk to them."],
    raccoon: ["Raccoon! I'll get the net!", "That animal is a thief. Fetch my net."],
    pizza: ["Pizza! One slice each! I'm counting!", "Nobody touch it! It could be poisoned! Give me a slice."],
    puppy: ["A dog! It can be trained to guard the branch.", "Sit. Good. He respects me."],
    moneyRain: ["Money! Secure the cash! Nobody pocket anything!", "This is either a bonus or a trap. Grab it."],
    birthday: ["A party? Unscheduled festivities are a security risk.", "Cake! I will supervise the cutting."],
    espresso: ["Somebody is moving too fast. That's suspicious.", "Caffeine overdose! Walk it off, soldier!"],
    love: ["Romance in the workplace. That's against the rules.", "Lovesick behavior detected. Weak."],
    rage: ["A fight! Let them settle it with honor!", "Anger is fuel. Use it well."],
    truth: ["Finally, honesty! Now confess everything!", "Truth! I welcome it. Ask me anything. Not that."],
    sleep: ["Nobody sleep! Sleep is for the weak!", "Must... stay... alert..."],
    paranoia: ["Someone feels watched? Good. You should.", "Being watched is normal. I watch everyone."],
    rumour: ["Layoffs? I'll be the one who survives.", "Someone's getting fired? I hope it's Jim."],
    meeting: ["Meeting! I'll take notes! Nobody else takes notes!", "All hands to the conference room! Move!"],
    inspector: ["Inspector! Everybody look busy! I'll show him my files.", "Corporate! Finally, someone who will appreciate my reports."],
    crown: ["A new boss? There must be a recount.", "I accept the role of second in command. Naturally."],
    secretLeak: ["A leak! I will find the source!", "This is why I encrypt everything."]
  },
  idle: [
    "Check the perimeter. Then check it again.",
    "Jim is planning something. I can feel it.",
    "Note: buy more beets.",
    "If Michael falls, I rise. I don't want him to fall.",
    "Twenty push-ups. Now.",
    "Somebody touched my stapler. I'll find them.",
    "My emergency supplies are well hidden. Good.",
    "Angela. No. Focus."
  ],
  openers: [
    "{other}. Report.",
    "{other}, a word. In private.",
    "{other}! Where were you at nine fifteen?",
    "{other}, I'm testing staff readiness. Answer quickly.",
    "{other}, do you know where the fire extinguishers are? I do.",
    "Listen up, {other}. I'm in charge of this.",
    "{other}, have you seen Jim? He's planning something.",
    "{other}. Your posture is weak. Fix it."
  ],
  replies: {
    warm: [
      "Acceptable. More than acceptable.",
      "You have earned my respect. Temporarily.",
      "Good. Very good. I approve.",
      "Finally, someone sensible.",
      "You would survive on my farm.",
      "Agreed. We are allies now."
    ],
    cold: [
      "False.",
      "Your opinion is noted and rejected.",
      "I'm writing that down. In my file on you.",
      "Weak. Very weak.",
      "Leave my desk area.",
      "I don't negotiate with idiots."
    ],
    neutral: [
      "Noted.",
      "Explain further.",
      "Interesting. I'll investigate.",
      "Hmm. Possibly.",
      "That is technically correct.",
      "I'll allow it."
    ]
  },
  whispered: [
    "{thought}. My instincts are never wrong.",
    "{thought}? I knew it. I always knew it.",
    "A message. {thought}. I will act.",
    "{thought}. Is this a test of loyalty?"
  ],
  announced: [
    "Who has access to the intercom? I demand a list.",
    "Unauthorized announcement! Trace it!",
    "That voice was not Michael's. Security breach.",
    "I'll comply. Then investigate."
  ],
  custom: {
    scary: ["The {thing}! I'll handle it! Stand back!", "Nobody move. It senses fear."],
    funny: ["That {thing} is not funny. It's a threat.", "Jim. Did you bring the {thing}?"],
    gross: ["The {thing} is a biohazard. Seal the room!", "I've seen worse on the farm. Much worse."],
    wonderful: ["The {thing}! Finally, a worthy sight.", "Excellent. I claim it for the branch."],
    weird: ["A {thing}. Highly suspicious.", "I'll need to interrogate the {thing}."],
    annoying: ["That {thing} is in violation of policy.", "Remove the {thing}. Immediately."],
    dangerous: ["Everyone behind me! I'll take the {thing}!", "Evacuate! I'll stay. I have to."],
    romantic: ["Romance? In the workplace? Report it.", "The {thing} means nothing to me. Nothing."],
    sad: ["A warrior does not cry at a {thing}.", "Weakness. I feel weakness."]
  }
};
