import type { CharId, EmotionId } from '@/game/core/types';
import type { EndingId } from './rules';
import type { ScriptLine, WeekNotes } from './types';

// No em dashes, curly quotes, or emoji in Park episode copy (UI / content tests enforce ASCII prose).

export interface ParkLine {
  who: CharId;
  text: string;
  kind?: ScriptLine['kind'];
  emotion?: EmotionId;
  to?: CharId;
}

export const PARK_EPISODE_META = {
  id: 'park' as const,
  number: 2,
  title: 'Day in the Park',
  subtitle: 'Team Building Outing',
  tagline: 'Michael pulls the branch out from under the ceiling tiles and marches everyone to Scranton Community Park.',
  unitLabel: 'Act',
  standingLabel: 'Team Spirit',
  standingNote: 'Branch morale after three outdoor acts -- below 40 gets the permit pulled, 60 or higher wins an honorary park pass.',
} as const;

export const PARK_ENDING_RULE = 'Team Spirit 60+ wins the Honorary Park Pass; 40-59 survives with a warning; under 40 gets the branch banned until autumn.';

/** Scripted Office-to-Park bridge beats shown before Act 1 begins. */
export const PARK_INTRO = {
  caption: 'Scranton Branch -> Scranton Community Park',
  beats: [
    'Michael discovers an airline magazine article about outdoor synergy.',
    'The bullpen is drafted into an unscheduled Tuesday field trip.',
    'Twelve reluctant commuters arrive at Scranton Community Park.',
  ],
  officeLines: [
    { who: 'michael', text: 'Stop typing. All of you. I just had a breakthrough in the magazine rack.', emotion: 'excited' },
    { who: 'jim', text: 'Did it come with a coupon, Michael, or are we switching glue brands?', emotion: 'amused' },
    { who: 'michael', text: 'Walls kill synergy. Ceilings press down on dreams. Today we move operations to Scranton Community Park!', emotion: 'excited' },
    { who: 'dwight', text: 'Finally. I have forty metres of paracord and a snakebite kit in the Trans Am.', emotion: 'determined' },
    { who: 'stanley', text: 'Does the park have swivel chairs. Does the park have air conditioning.', emotion: 'bored' },
    { who: 'kevin', text: 'Wait. Will there be charcoal burgers?', emotion: 'happy' },
    { who: 'michael', text: 'Burgers, shade, ducks, three-legged glory! Grab your jackets. Follow the Regional Manager to fresh air!', emotion: 'proud' },
    { who: 'angela', text: 'Outdoor potlucks are how mild-mannered accountants contract Lyme disease.', emotion: 'disgusted' },
  ] satisfies ParkLine[],
  parkLines: [
    { who: 'michael', text: 'Breathe that in! Zero walls, zero toner dust, pure civic lawn.', emotion: 'happy' },
    { who: 'dwight', text: 'Perimeter check: fourteen maple trees, six picnic benches, and hostile waterfowl at nine o clock.', emotion: 'suspicious' },
    { who: 'pam', text: 'Honestly, just seeing daylight before five feels illegal.', emotion: 'amused' },
  ] satisfies ParkLine[],
};

export const PARK_RALLY = {
  id: 1,
  title: 'Mandatory Fun',
  weekday: 'Morning',
  intro: [
    'Michael wants seven colleagues gathered on the Great Lawn before noon, and half the branch has already drifted toward the grill and trees.',
    'Coax people out onto the grass without letting the morning turn ugly.',
  ],
  goal: {
    id: 'rally',
    title: 'Morning rally on the Great Lawn',
    detail: 'Gather Michael plus seven colleagues on the Great Lawn and hold the huddle for 6 seconds.',
    icon: 'announce' as const,
  },
  extra: {
    id: 'calmGrill',
    title: 'Keep the BBQ free of fire or raccoons',
    detail: 'Finish the morning without a grill blaze or raccoon raid stealing attention.',
    icon: 'pizza' as const,
    atFive: 'won' as const,
  },
  change: ['Morning rally pulled the branch together', 'Morning rally broke up across the grass'] as [string, string],
  hints: [
    'Use Summon or Ask to bring wandering staff onto the Great Lawn around Michael.',
    'Stanley and Angela need a light touch -- ordering them bluntly sends their mood sideways.',
    'Watch the BBQ stand if Kevin hovers near an unattended grill.',
  ],
  help: [
    'Get Michael plus at least seven staff onto the Great Lawn together and hold the huddle for 6 seconds until his pep talk lands.',
  ],
  suggest: {
    whisper: [
      'Tell Stanley there are doughnuts on the Great Lawn.',
      'Remind Michael he left his megaphone on the grass.',
    ],
    announce: [
      'Everyone meet Michael on the Great Lawn for a quick team huddle!',
    ],
  },
  beats: {
    start: 'Michael climbs onto a folded blanket with his megaphone while staff scatter across the park.',
    warning: 'A sudden commotion near the trees breaks half the crowd\'s focus!',
    rallyDone: 'Michael delivers the loudest synergy speech Scranton Community Park has ever heard.',
    timeout: 'Noon passes with half the branch still hiding in the Quiet Grove.',
  },
  lines: {
    kickoff: { who: 'michael', text: 'Circle up on the Great Lawn! Nobody gets a hot dog until we hold eye contact in nature!', emotion: 'excited' } satisfies ScriptLine,
    stanleyDrag: { who: 'stanley', text: 'I walked twenty yards across damp clover. That is my quarterly cardio.', emotion: 'tired' } satisfies ScriptLine,
    dwightScout: { who: 'dwight', text: 'Look at those ducks. Unregulated. Watching us.', emotion: 'suspicious' } satisfies ScriptLine,
    win: { who: 'michael', text: 'Look at this turnout! Feel the grass! We are practically wolves now!', emotion: 'proud' } satisfies ScriptLine,
    loss: { who: 'michael', text: 'Fine. Maybe ducks are better listeners than mid-level paper reps anyway.', emotion: 'sad' } satisfies ScriptLine,
  },
  outcome: {
    won: 'Seven tired employees actually stood in a circle on the grass while Michael saluted a squirrel.',
    lost: 'By noon half the staff had vanished behind the oak trees and Michael was shouting at two indifferent mallards.',
  },
};

export const PARK_TRUCE = {
  id: 2,
  title: 'The Three-Legged Truce',
  weekday: 'Midday',
  intro: [
    'Michael promised a three-legged race as the climax of picnic day, and Jim and Dwight would rather saw their own shoelaces off than run together.',
    'Smooth down the feud before the lunch whistle blows.',
  ],
  goal: {
    id: 'truce',
    title: 'Bring Jim and Dwight to a truce',
    detail: 'Raise mutual goodwill enough for both to agree calmly on the Great Lawn.',
    icon: 'love' as const,
  },
  extra: {
    id: 'grill',
    title: 'Feed Kevin cleanly at the BBQ stand',
    detail: 'Let Kevin grab a peaceful plate at the BBQ & Snack Stand with zero chaos.',
    icon: 'pizza' as const,
    atFive: 'lost' as const,
  },
  change: ['Jim and Dwight called a picnic truce', 'Jim and Dwight kept feuding at the relay'] as [string, string],
  hints: [
    'Use Whisper or a friendly surprise to lift Jim and Dwight\'s mood before letting them cross paths.',
    'Pam can soften Jim in one chat; Michael praising Dwight works faster than lecturing him.',
    'Check the BBQ & Snack Stand once in a while so Kevin gets a proper plate instead of raid chaos.',
  ],
  help: [
    'Raise Jim and Dwight\'s mutual goodwill enough for both to stand calmly together without starting a shouting match.',
  ],
  suggest: {
    whisper: [
      'Tell Jim that winning the race annoys Ryan twice as much.',
      'Tell Dwight Michael expects him to lead the three-legged team.',
    ],
    announce: [
      'Free burgers by the BBQ stand once partners line up on the lawn!',
    ],
  },
  beats: {
    start: 'Jim swaps Dwight\'s whistle for a squeaky duck toy; Dwight retaliates by hiding Jim\'s thermos.',
    clash: 'Jim and Dwight cross paths in foul spirits and launch straight into a shouting match!',
    truce: 'Reluctantly, shoulders stiff, Jim and Dwight agree to tie their ankles together for one lap.',
    timeout: 'The lunch whistle blows while Jim and Dwight are still arguing beside the cone lane.',
  },
  lines: {
    spark: { who: 'dwight', text: 'Step away from my cooler, Halpert. Those beets are load-bearing.', emotion: 'angry' } satisfies ScriptLine,
    retort: { who: 'jim', text: 'Relax, Dwight, I only checked if your potato salad had a security clearance.', emotion: 'smug' } satisfies ScriptLine,
    truceJim: { who: 'jim', text: 'Alright, truce for ten minutes. Don\'t pull my ankle off.', emotion: 'amused' } satisfies ScriptLine,
    truceDwight: { who: 'dwight', text: 'Agreed. Left foot, right foot, victory. And no sudden sideways jokes.', emotion: 'determined' } satisfies ScriptLine,
    kevGrill: { who: 'kevin', text: 'Best burger in Scranton. Zero charcoal crimes.', emotion: 'happy' } satisfies ScriptLine,
    loss: { who: 'michael', text: 'Nobody wants to hop together. What happened to trust falls over gravel?', emotion: 'sad' } satisfies ScriptLine,
  },
  outcome: {
    won: 'Jim and Dwight gritted their teeth, hopped twelve clumsy yards in step, and only fell once near the finish cone.',
    lost: 'Jim tossed Dwight\'s whistle into a bush, Dwight confiscated the potato salad, and the race died at the starting cones.',
  },
};

export const PARK_RANGER = {
  id: 3,
  title: 'The Park Ranger',
  weekday: 'Afternoon',
  intro: [
    'Ranger Miller caught wind of an unpermitted corporate outing and is walking the main path from the pond to the gazebo.',
    'Keep every stop tidy, calm, and hazard-free while the ranger passes through.',
  ],
  goal: {
    id: 'ranger',
    title: 'Pass Ranger Miller\'s park inspection',
    detail: 'Score clean marks across Great Lawn, BBQ Stand, Duck Pond, and Gazebo.',
    icon: 'inspector' as const,
  },
  extra: {
    id: 'noTrace',
    title: 'Leave no trace during patrol',
    detail: 'Finish the afternoon tour with zero park fires, raccoon raids, or bee swarms.',
    icon: 'sparkle' as const,
    atFive: 'won' as const,
  },
  change: ['Ranger Miller approved the gazebo permit', 'Ranger Miller cited the branch outing'] as [string, string],
  hints: [
    'Ranger Miller stops at the Great Lawn, BBQ & Snack Stand, Duck Pond, and Gazebo in order.',
    'Clear any bee, raccoon, or fire trouble before the ranger reaches that zone.',
    'Friendly or settled staff near the ranger help; shouting, sulking, or chaos earns a citation.',
  ],
  help: [
    'Keep people cheerful and hazards away from whichever zone Ranger Miller is inspecting. Three clean marks save the permit.',
  ],
  suggest: {
    whisper: [
      'Remind Kevin to put the cooler lid back down.',
      'Tell Michael not to lecture the ranger about ducks.',
    ],
    announce: [
      'Everyone smile politely and tidy your picnic spot for the park ranger!',
    ],
  },
  stops: {
    bullpen: 'Great Lawn',
    kitchen: 'BBQ & Snack Stand',
    annex: 'Duck Pond',
    boss: 'Gazebo',
  } as const,
  beats: {
    arrive: 'Ranger Miller steps through the Park Gate with a steel clipboard and a dim view of corporate picnics.',
    stopClean: 'Ranger Miller nods at the clean turf and checks off a box without frowning.',
    stopRough: 'Ranger Miller circles a violation on the clipboard in thick red ink.',
    pass: 'Ranger Miller snaps the clipboard shut: "Honestly? Better behaved than the rotary club."',
    fail: 'Ranger Miller taps the red permit slip: "Pack the coolers. Outing is over."',
  },
  lines: {
    arrive: { who: 'visitor:ranger', text: 'Afternoon. Parks and Rec spot check. Let us see how your "team building" treats public grass.', emotion: 'suspicious' } satisfies ScriptLine,
    michaelBluff: { who: 'michael', text: 'Ranger! Technically geese are municipal employees too, so this counts as an interagency summit.', emotion: 'nervous' } satisfies ScriptLine,
    cleanLawn: { who: 'visitor:ranger', text: 'No loose wrappers, cones in a neat row. Good start.', emotion: 'happy' } satisfies ScriptLine,
    cleanGrill: { who: 'visitor:ranger', text: 'Buckets of water by the coals, lids shut. Somebody read the sign.', emotion: 'happy' } satisfies ScriptLine,
    cleanPond: { who: 'visitor:ranger', text: 'Ducks look relaxed. Nobody throwing stale bagels. Rare.', emotion: 'amused' } satisfies ScriptLine,
    roughStop: { who: 'visitor:ranger', text: 'That goes straight on the citation sheet. Unbelievable.', emotion: 'angry' } satisfies ScriptLine,
    pass: { who: 'visitor:ranger', text: 'Alright, Dunder Mifflin. Leave the lawn tidy and you can book the gazebo again.', emotion: 'proud' } satisfies ScriptLine,
    fail: { who: 'visitor:ranger', text: 'Permit revoked. Load the cars before I call the county truck.', emotion: 'angry' } satisfies ScriptLine,
  },
  outcome: {
    won: 'Ranger Miller signed the clean pass in the Gazebo while Michael bowed three times too deeply.',
    lost: 'Ranger Miller stapled an orange warning slip to the Gazebo post and marched the branch back to the car park.',
  },
};

export const PARK_CHANGES = {
  chapterWon: 'Clean act',
  chapterLost: 'Act fell apart',
  extra: 'Bonus objective',
  chaosPenalty: 'Park mishap',
} as const;

export const PARK_FINALE = {
  lines: {
    saved: [
      { who: 'michael', text: 'Look at us. Fresh air, zero citations, and nobody fell in the pond!', emotion: 'proud' },
      { who: 'stanley', text: 'Fine. I will say it once. The shade under that oak tree was acceptable.', emotion: 'amused' },
      { who: 'pam', text: 'Best Tuesday outside the bullpen this year.', emotion: 'happy' },
    ] satisfies ParkLine[],
    scraped: [
      { who: 'michael', text: 'Okay, slight sunburn, minor grill warning, huge moral victory!', emotion: 'happy' },
      { who: 'dwight', text: 'We forfeited no territory to the geese. I call that a draw.', emotion: 'determined' },
    ] satisfies ParkLine[],
    closed: [
      { who: 'visitor:ranger', text: 'Clear the tables. Come back when you learn how a trash bin works.', emotion: 'angry' },
      { who: 'michael', text: 'Back to fluorescent tubes, everybody. Do not look the ducks in the eye.', emotion: 'sad' },
    ] satisfies ParkLine[],
  },
};

export function parkEndingText(ending: EndingId, notes: WeekNotes): { title: string; text: string[] } {
  if (ending === 'saved') {
    const grillBonus = notes.parkGrill === true ? 'Even Kevin\'s grill station drew compliments.' : '';
    return {
      title: 'Honorary Park Pass',
      text: [
        'A banner day under open sky.',
        `Michael's outdoor gamble actually worked. Ranger Miller left smiling and next summer's pavilion booking is already pencilled in.${grillBonus ? ` ${grillBonus}` : ''}`,
      ],
    };
  }
  if (ending === 'scraped') {
    return {
      title: 'Sunburned & Even',
      text: [
        'A sloppy picnic that still held together.',
        'A couple of sharp tempers and one warning slip later, the branch packed up its coolers with nobody fired and no ducks traumatised.',
      ],
    };
  }
  return {
    title: 'Banned Until Autumn',
    text: [
      'Parks and Rec pulled the plug early.',
      'Between roaming tempers, smoke, and an unimpressed ranger, the branch got escorted back to the car park before four.',
    ],
  };
}

export function parkEpilogueLines(ending: EndingId, notes: WeekNotes): string[] {
  const wonRally = notes.parkRally === true;
  const wonTruce = notes.parkTruce === true;
  const wonRanger = (notes.parkInspection ?? 0) >= 2;
  return [
    ending === 'saved'
      ? 'Michael ordered matching "Dunder Mifflin: Outdoor Division" lanyards before dinner.'
      : ending === 'scraped'
        ? 'Michael framed the minor noise warning next to his Dundee.'
        : 'Michael blamed the lawn for having "bad acoustics".',
    wonTruce
      ? 'Dwight admitted in private that Jim\'s stride cadence was "tolerable under fire".'
      : 'Dwight patrolled the car park perimeter for bold geese.',
    wonTruce
      ? 'Jim taped one shoelace from the three-legged race inside his top drawer.'
      : 'Jim replaced the spare whistle in Dwight\'s glovebox with a rubber duck.',
    wonRally
      ? 'Stanley found the exact oak shade and slept for twenty-five undisturbed minutes.'
      : 'Stanley put a folding camping chair in his trunk in case Michael tries this again.',
    notes.parkGrill === true
      ? 'Kevin guarded two spotless burgers with tears of quiet gratitude.'
      : 'Kevin checked his pockets twice for missing burger buns.',
    wonRanger
      ? 'Ranger Miller logged Scranton Branch as "Surprisingly Tidy" in the county binder.'
      : 'Ranger Miller pinned an orange warning photocopy beside the gazebo lockbox.',
  ];
}
