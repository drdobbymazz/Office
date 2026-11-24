// Six distinct 5-day Season Arcs for Endless Saga (30 episode templates total).
// Every day gives the player complete sandbox freedom while tracking overarching
// goals, optional +3 bonus goals, and dynamic clues for the simulation.

import type { CastId } from '@/game/core/types';
import { createRng } from '@/game/sim/rng';
import type { SagaArcDef, SagaArcId, SagaExtraDef, SagaExtraKind } from './types';

export const SAGA_MOLE_CANDIDATES: readonly CastId[] = [
  'ryan', 'oscar', 'toby', 'creed', 'angela', 'andy', 'phyllis', 'kelly', 'dwight', 'stanley'
];

export const SAGA_EXTRAS: Record<SagaExtraKind, SagaExtraDef> = {
  wildcard: {
    id: 'wildcard',
    title: 'Overseer\'s signature',
    detail: 'Use at least two powers or Anything stunts today.',
    icon: 'powers'
  },
  whisper_net: {
    id: 'whisper_net',
    title: 'Voices in the dark',
    detail: 'Use Whispers, Tell them to, or Loudspeaker at least twice.',
    icon: 'whisper'
  },
  peak_mayhem: {
    id: 'peak_mayhem',
    title: 'Total bedlam',
    detail: 'Push the Chaos meter to 70% or higher today.',
    icon: 'quake'
  },
  full_house: {
    id: 'full_house',
    title: 'Packed room',
    detail: 'Get 8 or more people into the Conference Room or Break Room together.',
    icon: 'people'
  },
  good_vibes: {
    id: 'good_vibes',
    title: 'Damage softened',
    detail: 'Bring office morale up to 68% or higher at any point today.',
    icon: 'love'
  },
  hands_on: {
    id: 'hands_on',
    title: 'Invisible hand',
    detail: 'Pick up and relocate 3 different staff members.',
    icon: 'poke'
  },
  plot_twist: {
    id: 'plot_twist',
    title: 'Off the script',
    detail: 'Conjure a free-text Anything event of your own today.',
    icon: 'anything'
  }
};

export const SAGA_ARCS: readonly SagaArcDef[] = [
  // ── 1. Corporate Audit ─────────────────────────────────────────────────────
  {
    id: 'corporate_audit',
    title: 'The Surprise Audit',
    tagline: 'Head office sends an auditor with a sharp pencil.',
    premise: 'Corporate suspects Scranton has been cooking creative expense reports all quarter and wants answers by Friday.',
    chapters: [
      {
        chapter: 1,
        weekday: 'Monday',
        title: 'The Missing Receipts',
        intro: [
          'Corporate flagged three mysterious invoices from Michael\'s desk and wants a branch-wide briefing before three o\'clock.',
          'All your powers and whispers are unlocked, so herd the staff however you want: charms, chaos, or carrying them in by hand.'
        ],
        featured: [{ id: 'michael', face: 'nervous' }, { id: 'oscar', face: 'suspicious' }],
        goalInfo: {
          id: 'audit_mon',
          title: 'Emergency briefing',
          detail: 'Get Michael and at least 6 others into the Conference Room together before 15:00.',
          icon: 'meeting',
          stamp: ['BRIEFED', 'SCRAMBLED'],
          room: 'meeting'
        },
        goal: { kind: 'gather', room: 'meeting', need: 7, people: ['michael'], deadlineHour: 15 },
        extras: ['wildcard', 'hands_on'],
        hints: [
          'Announce a free lunch or an emergency in the conference room to draw a crowd fast.',
          'You can trigger All-Hands immediately, use Whisper or Tell them to, or drag stragglers through the doors.'
        ],
        suggest: {
          whisper: ['Go straight to the conference room and stall Corporate.'],
          announce: ['Everyone to the conference room right now, doughnuts included.']
        },
        fact: 'Corporate flagged three expense receipts and wants an emergency briefing.',
        topics: ['Someone spent petty cash on something embarrassing and Corporate noticed.', 'Michael insists nobody needs to panic about the audit.'],
        convictions: [{ who: 'michael', text: 'I only need a good excuse for those restaurant receipts.' }]
      },
      {
        chapter: 2,
        weekday: 'Tuesday',
        title: 'Accounting in Pieces',
        intro: [
          'Angela and Oscar are blaming each other for the audit discrepancies and barely speaking over their desks.',
          'Corporate checks tonight whether Accounting can even agree on one spreadsheet.'
        ],
        featured: [{ id: 'angela', face: 'angry' }, { id: 'oscar', face: 'angry' }, { id: 'kevin', face: 'nervous' }],
        goalInfo: {
          id: 'audit_tue',
          title: 'Patch up Accounting',
          detail: 'Raise how well Angela feels about Oscar by +8 today.',
          icon: 'love',
          stamp: ['UNITED', 'DIVIDED'],
          room: 'accounts'
        },
        goal: { kind: 'bond_shift', who: 'angela', about: 'oscar', direction: 'up', by: 8 },
        extras: ['whisper_net', 'good_vibes'],
        hints: [
          'Use Cupid\'s Arrow, Locked In (to force them to hash it out), or whisper warm thoughts to Angela.',
          'Boosting overall morale with Pizza Party or Office Puppy softens feuds quickly too.'
        ],
        suggest: {
          whisper: ['Go apologize to Oscar and settle the spreadsheet cleanly.', 'Tell Angela you value her standards.'],
          announce: ['Bonus cookies in Accounting for teamwork!']
        },
        fact: 'Angela and Oscar are locked in a bitter row over the audit numbers.',
        topics: ['Accounting cannot even look at each other over the missing ledger.', 'Kevin insists he invented a lucky number called keleven.'],
        sparkBond: [{ who: 'angela', about: 'oscar', delta: -12 }, { who: 'oscar', about: 'angela', delta: -10 }]
      },
      {
        chapter: 3,
        weekday: 'Wednesday',
        title: 'Morale Under Fire',
        intro: [
          'Mid-audit panic is cratering productivity across the bullpen as everyone quietly updates their resumes.',
          'If you lift office morale above 66%, Scranton can convince Corporate this ship is steady.'
        ],
        featured: [{ id: 'pam', face: 'nervous' }, { id: 'jim', face: 'smug' }, { id: 'kevin', face: 'happy' }],
        goalInfo: {
          id: 'audit_wed',
          title: 'Steady the nerves',
          detail: 'Lift average office morale to 66% or higher today.',
          icon: 'pizza',
          stamp: ['CHEERED UP', 'BURNT OUT']
        },
        goal: { kind: 'morale_rally', targetMorale: 66 },
        extras: ['full_house', 'plot_twist'],
        hints: [
          'Treats like Pizza Party, Office Puppy, Bonus Rain, and Surprise Party spike morale quickly.',
          'You can also conjure happy surprises with Anything, or whisper pep talks.'
        ],
        suggest: {
          whisper: ['Give Pam a genuine compliment and take a breather.'],
          announce: ['Half-day spirit celebration in the break room, everyone!']
        },
        fact: 'Everyone is anxious about Wednesday\'s audit check-in.',
        topics: ['People are quietly polishing their CVs near the copier.', 'A little celebration would go a long way today.']
      },
      {
        chapter: 4,
        weekday: 'Thursday',
        title: 'The Paper Trail',
        intro: [
          'Word leaked overnight that one employee secretly sent Corporate a tip-off dossier from the office fax.',
          'Track the gossip or crack them with Truth Serum, then open their card in People to accuse them.'
        ],
        featured: [],
        icon: 'secretLeak',
        goalInfo: {
          id: 'audit_thu',
          title: 'Spot the informant',
          detail: 'Tap a suspect on the floor or in People (3 tries) to unmask who leaked the dossier.',
          icon: 'secretLeak',
          stamp: ['EXPOSED', 'SLIPPED AWAY']
        },
        goal: { kind: 'accuse_mole', tries: 3, label: 'Name the whistleblower' },
        extras: ['whisper_net', 'wildcard'],
        hints: [
          'Use Truth Serum or Leak a Secret on suspects to uncover clues directly.',
          'Watch the Log and speech bubbles for nervous reactions around the copier.'
        ],
        suggest: {
          whisper: ['Admit why you used the fax machine last night.'],
          announce: ['Somebody left confidential fax pages on the break room table!']
        },
        fact: 'Someone in the building faxed an anonymous dossier to Corporate.',
        topics: ['Who sent that anonymous audit tip to head office?', 'Whoever leaked the receipts is looking awfully sweaty today.']
      },
      {
        chapter: 5,
        weekday: 'Friday',
        title: 'Inspection Day',
        intro: [
          'Corporate\'s Inspector steps through the front door today to pass final judgment on the branch.',
          'Keep the Inspector\'s tour orderly, or dazzle them enough that minor incidents barely register.'
        ],
        featured: [{ id: 'michael', face: 'nervous' }, { id: 'dwight', face: 'determined' }],
        goalInfo: {
          id: 'audit_fri',
          title: 'Survive the audit tour',
          detail: 'Get through the Inspector\'s visit with at most 1 incident (or keep morale above 55% by 17:00).',
          icon: 'inspector',
          stamp: ['PASSED AUDIT', 'FAILED AUDIT'],
          room: 'bullpen'
        },
        goal: { kind: 'finale_showdown', mode: 'calm_tour' },
        extras: ['good_vibes', 'hands_on'],
        hints: [
          'The Inspector arrives around 11:00. Keep fires, blackouts, and fistfights away until they leave!',
          'You can trigger Pizza Party or kindly whispers to boost morale beforehand.'
        ],
        suggest: {
          whisper: ['Act ultra-professional when the Inspector walks past.'],
          announce: ['Everyone look busy at your desks right now!']
        },
        fact: 'Corporate\'s Inspector is visiting Scranton today for the final verdict.',
        topics: ['If the Inspector sees one meltdown, head office shuts us down.', 'Michael rehearsed a tour speech in the mirror all morning.'],
        midday: { clock: 11 * 60, text: 'The Corporate Inspector steps in through the front doors, clipboard ready.', icon: 'inspector', room: 'bullpen', spawnInspector: true }
      }
    ]
  },

  // ── 2. Hostile Takeover ────────────────────────────────────────────────────
  {
    id: 'hostile_takeover',
    title: 'Hostile Takeover',
    tagline: 'A rival conglomerate eyes Munder Difflin.',
    premise: 'A predatory buyer wants to strip the Scranton branch for parts unless staff prove they are unbreakable.',
    chapters: [
      {
        chapter: 1,
        weekday: 'Monday',
        title: 'Power Vacuum',
        intro: [
          'A morning buyout rumour sends half the sales floor angling to be named the new branch boss.',
          'Shake up the hierarchy by staging two major power plays, secrets, or custom stunts today.'
        ],
        featured: [{ id: 'michael', face: 'scared' }, { id: 'dwight', face: 'mischievous' }, { id: 'andy', face: 'excited' }],
        goalInfo: {
          id: 'takeover_mon',
          title: 'Claim the throne',
          detail: 'Stage 2 bold power plays today (crown a boss, leak a secret, knock someone out, or cast Anything).',
          icon: 'crown',
          stamp: ['POWER PLAY', 'STALEMATE']
        },
        goal: { kind: 'drama_action', actions: ['boss_crown', 'secret', 'knockedOut', 'eliminated', 'custom'], count: 2 },
        extras: ['wildcard', 'peak_mayhem'],
        hints: [
          'Try Boss for a Day, Leak a Secret, Truth Serum, or free-text Anything stunts.',
          'Physical directives like "tell Dwight to take over as boss" or knocking rivals out also count!'
        ],
        suggest: {
          whisper: ['Demand to be named Acting Manager right now.', 'Leak a rumour about the buyout.'],
          announce: ['Management is up for grabs today, everybody!']
        },
        fact: 'Rumours of an outside buyout have everyone eyeing Michael\'s chair.',
        topics: ['Who runs Scranton if the buyout goes through?', 'Dwight has already drafted a succession decree.'],
        convictions: [{ who: 'dwight', text: 'Only I have the leadership toughness to survive a corporate takeover.' }]
      },
      {
        chapter: 2,
        weekday: 'Tuesday',
        title: 'Unlikely Allies',
        intro: [
          'The buyers are trying to divide Sales from the inside, starting with Dwight and Jim.',
          'Get Dwight and Jim onto the same side today to foil the split.'
        ],
        featured: [{ id: 'dwight', face: 'suspicious' }, { id: 'jim', face: 'amused' }],
        goalInfo: {
          id: 'takeover_tue',
          title: 'Dwight and Jim truce',
          detail: 'Raise how well Dwight feels about Jim by +8 today.',
          icon: 'love',
          stamp: ['ALLIANCE', 'RIVALRY'],
          room: 'bullpen'
        },
        goal: { kind: 'bond_shift', who: 'dwight', about: 'jim', direction: 'up', by: 8 },
        extras: ['whisper_net', 'hands_on'],
        hints: [
          'Cupid\'s Arrow, Locked In together in the conference room, or friendly whispers work fast.',
          'Drop them beside each other in the break room over free pizza!'
        ],
        suggest: {
          whisper: ['Team up with Jim to beat the buyout sharks.', 'Tell Dwight you actually respect his sales numbers.'],
          announce: ['All sales staff report to the break room for emergency strategy.']
        },
        fact: 'Buyers are hoping Dwight and Jim sabotage each other.',
        topics: ['If Dwight and Jim actually cooperated, nobody could touch this branch.', 'Jim says he prefers messing with Dwight over outsiders doing it.']
      },
      {
        chapter: 3,
        weekday: 'Wednesday',
        title: 'Scare the Suitors',
        intro: [
          'Word is the takeover scouts are watching Scranton remotely to see how compliant the office is.',
          'Make enough joyful chaos and spectacle that corporate sharks think twice.'
        ],
        featured: [{ id: 'creed', face: 'mischievous' }, { id: 'meredith', face: 'excited' }],
        goalInfo: {
          id: 'takeover_wed',
          title: 'Untameable office',
          detail: 'Push peak chaos to 60%+ AND trigger at least 2 events today.',
          icon: 'disco',
          stamp: ['UNGOVERNABLE', 'TAME']
        },
        goal: { kind: 'spectacle', chaosPeak: 60, eventsNeeded: 2 },
        extras: ['plot_twist', 'peak_mayhem'],
        hints: [
          'Mix weird powers (Zero Gravity, Disco Fever, Raccoon, Abduction) or Anything monsters.',
          'Fire, Quake, and Bees spike the chaos meter fast.'
        ],
        suggest: {
          whisper: ['Prove to head office nobody can tame this floor.'],
          announce: ['Today is an official no-rules chaos showcase!']
        },
        fact: 'Takeover analysts are scoring how tame the Scranton branch is today.',
        topics: ['Let\'s give those suits in New York something to choke on.', 'Creed says the best defence against a merger is utter madness.']
      },
      {
        chapter: 4,
        weekday: 'Thursday',
        title: 'Heart & Soul',
        intro: [
          'Yesterday\'s mayhem rattled the buyers, though half the office now worries their desks are on the chopping block.',
          'Boost office morale back up to 65% so everyone stands shoulder to shoulder.'
        ],
        featured: [{ id: 'pam', face: 'determined' }, { id: 'stanley', face: 'bored' }],
        goalInfo: {
          id: 'takeover_thu',
          title: 'Keep the crew loyal',
          detail: 'Raise average office morale to 65% or higher today.',
          icon: 'birthday',
          stamp: ['LOYAL', 'DEFLATED']
        },
        goal: { kind: 'morale_rally', targetMorale: 65 },
        extras: ['good_vibes', 'whisper_net'],
        hints: [
          'Bonus Rain, Surprise Party, Pizza Party, and Office Puppy lift spirits across rooms.',
          'Let characters share warm scenes or whisper reassurance.'
        ],
        suggest: {
          whisper: ['Remind everyone why Scranton beats a soulless conglomerate.'],
          announce: ['Free bonus cash and pizza in the break room for loyal staff!']
        },
        fact: 'Staff loyalty is being tested ahead of tomorrow\'s boardroom vote.',
        topics: ['Would anybody actually stay if the new owners took over?', 'Pam started passing around a branch loyalty card.']
      },
      {
        chapter: 5,
        weekday: 'Friday',
        title: 'The Boardroom Vote',
        intro: [
          'The takeover vote happens in the Conference Room before four o\'clock, and every seat counts.',
          'Pack Michael and at least 7 staff into the Conference Room to ratify the branch\'s survival.'
        ],
        featured: [{ id: 'michael', face: 'determined' }, { id: 'jim', face: 'determined' }, { id: 'dwight', face: 'determined' }],
        goalInfo: {
          id: 'takeover_fri',
          title: 'Full room vote',
          detail: 'Have Michael and at least 7 others in the Conference Room together before 16:00.',
          icon: 'meeting',
          stamp: ['VOTE CARRIED', 'BOUGHT OUT'],
          room: 'meeting'
        },
        goal: { kind: 'finale_showdown', mode: 'boardroom_vote' },
        extras: ['full_house', 'wildcard'],
        hints: [
          'Trigger All-Hands, use Loudspeaker ("Conference room vote!"), or pick people up.',
          'You can even carry staff while the clock is paused in Endless Saga!'
        ],
        suggest: {
          whisper: ['Get into the conference room and vote against the buyout!'],
          announce: ['Final takeover vote in the conference room, everyone in now!']
        },
        fact: 'Today\'s conference room vote decides whether Scranton stays independent.',
        topics: ['Everybody needs to show up in the conference room before four.', 'Michael promised the speech of a lifetime if people sit down.']
      }
    ]
  },

  // ── 3. Office Civil War ────────────────────────────────────────────────────
  {
    id: 'office_civil_war',
    title: 'Office Civil War',
    tagline: 'Sales versus Accounting, no prisoners.',
    premise: 'A petty dispute over printer toner boils over into an office-wide turf war between rival cliques.',
    chapters: [
      {
        chapter: 1,
        weekday: 'Monday',
        title: 'First Shot',
        intro: [
          'Someone stole the last cyan toner cartridge and pinned it on Jim, turning Monday morning electric.',
          'Fan the rivalry between Dwight and Jim downward to kick off the turf war.'
        ],
        featured: [{ id: 'dwight', face: 'angry' }, { id: 'jim', face: 'mischievous' }],
        goalInfo: {
          id: 'war_mon',
          title: 'Escalate the rivalry',
          detail: 'Drop how Dwight feels about Jim by 8 or more points today.',
          icon: 'rage',
          stamp: ['FEUD ON', 'PEACEFUL'],
          room: 'bullpen'
        },
        goal: { kind: 'bond_shift', who: 'dwight', about: 'jim', direction: 'down', by: 8 },
        extras: ['whisper_net', 'wildcard'],
        hints: [
          'Hit Dwight with Grudge toward Jim, whisper betrayal in his ear, or Tell him to shove/knock out Jim!',
          'Locked In works too if they are already glaring at each other.'
        ],
        suggest: {
          whisper: ['Jim hid your spare uniform and took the printer toner.'],
          announce: ['Somebody put Dwight\'s stapler in jelly again!']
        },
        fact: 'The missing toner cartridge has sparked open hostility across the bullpen.',
        topics: ['Who stole the cyan toner cartridge this morning?', 'Dwight has declared tactical alert level orange against Jim.'],
        sparkBond: [{ who: 'dwight', about: 'jim', delta: -6 }]
      },
      {
        chapter: 2,
        weekday: 'Tuesday',
        title: 'Break Room Border',
        intro: [
          'Accounting barricaded the fridge while Sales claimed the coffee pot, turning lunch into a standoff.',
          'Drag at least 7 staff into the Break Room at once for a chaotic truce summit.'
        ],
        featured: [{ id: 'kevin', face: 'angry' }, { id: 'stanley', face: 'determined' }],
        goalInfo: {
          id: 'war_tue',
          title: 'Break Room summit',
          detail: 'Get at least 7 people into the Break Room at the same time before 16:00.',
          icon: 'pizza',
          stamp: ['SUMMIT HELD', 'EMPTY ROOM'],
          room: 'kitchen'
        },
        goal: { kind: 'gather', room: 'kitchen', need: 7, deadlineHour: 16 },
        extras: ['full_house', 'hands_on'],
        hints: [
          'Pizza Party automatically pulls hungry staff straight into the Break Room.',
          'Announce free snacks in the Break Room or drag staff across the threshold.'
        ],
        suggest: {
          whisper: ['Claim your spot by the fridge before Accounting eats everything.'],
          announce: ['Free hot pizza and pretzels in the break room right now!']
        },
        fact: 'Both factions are eyeing the Break Room fridge like disputed territory.',
        topics: ['Nobody crosses into the kitchen without picking a side.', 'Stanley says whoever blocks the pretzels makes an enemy for life.']
      },
      {
        chapter: 3,
        weekday: 'Wednesday',
        title: 'Black Ops Wednesday',
        intro: [
          'Midnight sticky notes and leaked secrets are flying between desks as both camps play dirty.',
          'Unleash two major dirty tricks, secret leaks, knockouts, or custom stunts today.'
        ],
        featured: [{ id: 'phyllis', face: 'mischievous' }, { id: 'ryan', face: 'smug' }],
        goalInfo: {
          id: 'war_wed',
          title: 'Turn up the intrigue',
          detail: 'Cause 2 dramatic turns today (Leak a Secret, Truth Serum, knockouts, walkouts, or Anything).',
          icon: 'secretLeak',
          stamp: ['DIRTY TRICKS', 'QUIET DAY']
        },
        goal: { kind: 'drama_action', actions: ['secret', 'knockedOut', 'eliminated', 'quit', 'custom'], count: 2 },
        extras: ['plot_twist', 'peak_mayhem'],
        hints: [
          'Use Leak a Secret, Truth Serum, or tell characters to sabotage, steal, or brawl.',
          'Typing a wild scheme into Anything also counts toward today\'s drama.'
        ],
        suggest: {
          whisper: ['Dig up dirt at Oscar\'s desk and expose it.', 'Knock sense into whoever ruined the copier.'],
          announce: ['Check your inbox, everyone\'s secret folders just leaked!']
        },
        fact: 'Both office factions have escalated to leaking secrets and dirty tricks.',
        topics: ['Phyllis says half the bullpen has dirt on the other half.', 'Nobody trusts an unattended keyboard today.']
      },
      {
        chapter: 4,
        weekday: 'Thursday',
        title: 'The Double Agent',
        intro: [
          'Both sides realize somebody has been feeding battle plans to the other faction all week long.',
          'Root out the double agent before Friday\'s reckoning using clues or Truth Serum.'
        ],
        featured: [],
        icon: 'accuse',
        goalInfo: {
          id: 'war_thu',
          title: 'Catch the spy',
          detail: 'Tap a suspect on the floor or in People (3 tries) to expose the double agent.',
          icon: 'accuse',
          stamp: ['SPY CAUGHT', 'ESCAPED']
        },
        goal: { kind: 'accuse_mole', tries: 3, label: 'Name the double agent' },
        extras: ['whisper_net', 'wildcard'],
        hints: [
          'Cast Truth Serum or Leak a Secret to force clues into the log.',
          'Follow gossip around the water cooler before using your 3 accuses.'
        ],
        suggest: {
          whisper: ['Confess who you have been passing notes to!'],
          announce: ['There is a traitor sitting right in this bullpen!']
        },
        fact: 'Someone has been playing both sides of the Office Civil War.',
        topics: ['Who has been passing notes between Sales and Accounting?', 'Whoever the spy is will crack under Truth Serum.']
      },
      {
        chapter: 5,
        weekday: 'Friday',
        title: 'Treaty or Chaos',
        intro: [
          'By five o\'clock either the rival cliques call a truce, or you force them all into one room to hash it out.',
          'Unite at least 8 staff together in the Conference Room or Break Room, or mend Dwight & Jim\'s feud.'
        ],
        featured: [{ id: 'michael', face: 'determined' }, { id: 'pam', face: 'happy' }, { id: 'dwight', face: 'neutral' }],
        goalInfo: {
          id: 'war_fri',
          title: 'End the Civil War',
          detail: 'Bring 8+ people together in Meeting/Kitchen OR raise Dwight & Jim or Angela & Oscar bonds.',
          icon: 'meeting',
          stamp: ['PEACE TREATY', 'STILL AT WAR'],
          room: 'meeting'
        },
        goal: { kind: 'finale_showdown', mode: 'ceasefire' },
        extras: ['good_vibes', 'full_house'],
        hints: [
          'All-Hands, Pizza Party, or Disco Fever rapidly pulls 8+ staff into one shared room.',
          'Or hit feuding pairs with Cupid\'s Arrow to force a heartwarming truce.'
        ],
        suggest: {
          whisper: ['Call a ceasefire and hug it out like adults.'],
          announce: ['Mandatory peace summit in the conference room right now!']
        },
        fact: 'Friday is the deadline to end the Office Civil War.',
        topics: ['Everybody wants this ridiculous office war over by weekend.', 'Michael promises a trophy if both sides shake hands.']
      }
    ]
  },

  // ── 4. Going Viral (chaos-friendly) ────────────────────────────────────────
  {
    id: 'documentary_crew',
    title: 'Going Viral',
    tagline: 'A camera crew films Scranton for sweeps week.',
    premise: 'A documentary producer demands viral television gold all week—and high chaos boosts Branch Standing.',
    chaosFriendly: true,
    chapters: [
      {
        chapter: 1,
        weekday: 'Monday',
        title: 'Pilot Cold Open',
        intro: [
          'The camera crew arrived looking for an unforgettable opening scene, and normal typing is putting them to sleep.',
          'Push peak chaos past 58% with any wild event to hook the network.'
        ],
        featured: [{ id: 'michael', face: 'excited' }, { id: 'andy', face: 'proud' }],
        goalInfo: {
          id: 'viral_mon',
          title: 'Hook the cameras',
          detail: 'Reach 58%+ chaos and trigger at least 1 event today.',
          icon: 'fire',
          stamp: ['VIRAL HIT', 'BORING TV']
        },
        goal: { kind: 'spectacle', chaosPeak: 58, eventsNeeded: 1 },
        extras: ['peak_mayhem', 'plot_twist'],
        hints: [
          'In Going Viral, wild chaos raises Branch Standing instead of hurting it!',
          'Try Fire, Quake, Zero Gravity, Abduction, or type something bizarre into Anything.'
        ],
        suggest: {
          whisper: ['Do something dramatic right in front of the cameras!'],
          announce: ['Action! Show the network why Scranton is undefeated!']
        },
        fact: 'A documentary crew is filming Scranton all week; spectacle earns high ratings.',
        topics: ['Everyone is trying way too hard to get screen time.', 'The producers look thrilled whenever things catch fire.']
      },
      {
        chapter: 2,
        weekday: 'Tuesday',
        title: 'Main Character Energy',
        intro: [
          'Producers want a big bullpen ensemble shot centered on Michael surrounded by the entire cast.',
          'Gather Michael and 8 others into the Bullpen at once for Tuesday\'s centerpiece take.'
        ],
        featured: [{ id: 'michael', face: 'proud' }, { id: 'kelly', face: 'excited' }, { id: 'jim', face: 'amused' }],
        goalInfo: {
          id: 'viral_tue',
          title: 'Ensemble shot',
          detail: 'Have Michael and 8 others in the Bullpen together before 16:00.',
          icon: 'people',
          stamp: ['ON CAMERA', 'MISSED SHOT'],
          room: 'bullpen'
        },
        goal: { kind: 'gather', room: 'bullpen', need: 9, people: ['michael'], deadlineHour: 16 },
        extras: ['hands_on', 'wildcard'],
        hints: [
          'Announce "Everybody onto the bullpen floor!" or drop stragglers by Reception.',
          'Michael loves wandering to the Bullpen—whisper him to stage a grand speech there.'
        ],
        suggest: {
          whisper: ['Stand in the middle of the bullpen and hold court.'],
          announce: ['Camera crew wants everyone in the bullpen right now!']
        },
        fact: 'Producers are waiting to film a huge ensemble scene in the Bullpen.',
        topics: ['Kelly spent an hour picking her angle in the bullpen.', 'Michael keeps checking if the red camera light is on.']
      },
      {
        chapter: 3,
        weekday: 'Wednesday',
        title: 'Sweeps Stunt',
        intro: [
          'Ratings dipped slightly overnight, so the network begged for two genuine jaw-droppers on camera today.',
          'Trigger Anything custom madness, Boss for a Day, or knockouts to deliver sweeps gold.'
        ],
        featured: [{ id: 'creed', face: 'excited' }, { id: 'dwight', face: 'determined' }],
        goalInfo: {
          id: 'viral_wed',
          title: 'Steal the episode',
          detail: 'Deliver 2 viral stunts (Anything events, Boss for a Day, leaked secrets, or brawls).',
          icon: 'anything',
          stamp: ['TRENDING', 'SKIPPED']
        },
        goal: { kind: 'drama_action', actions: ['custom', 'boss_crown', 'secret', 'knockedOut', 'eliminated'], count: 2 },
        extras: ['plot_twist', 'peak_mayhem'],
        hints: [
          'Anything shines here: "a velociraptor joins sales", "Michael enters in a cape", etc.',
          'Crowning someone Boss or telling Dwight to tackle Jim creates instant viral clips.'
        ],
        suggest: {
          whisper: ['Pull an outrageous stunt while the lens is zoomed in!'],
          announce: ['Producers promised bonuses for whoever does the wildest thing!']
        },
        fact: 'Network producers demanded two unforgettable stunts for Sweeps Wednesday.',
        topics: ['Everybody is competing to be the clip that goes viral.', 'Creed claims he brought a circus stunt just in case.']
      },
      {
        chapter: 4,
        weekday: 'Thursday',
        title: 'The Wholesome Turn',
        intro: [
          'Critics accused the show of being all stunts with no heart, so the crew needs one genuine feel-good episode.',
          'Raise office morale above 68% before five to win critics over.'
        ],
        featured: [{ id: 'pam', face: 'happy' }, { id: 'jim', face: 'love' }],
        goalInfo: {
          id: 'viral_thu',
          title: 'Emmy bait',
          detail: 'Bring office morale up to 68% or higher today.',
          icon: 'love',
          stamp: ['HEARTWARMING', 'CYNICAL']
        },
        goal: { kind: 'morale_rally', targetMorale: 68 },
        extras: ['good_vibes', 'whisper_net'],
        hints: [
          'Office Puppy, Pizza Party, Surprise Party, and Bonus Rain soar morale quickly.',
          'Whispers telling characters to praise or comfort coworkers build warm moments.'
        ],
        suggest: {
          whisper: ['Tell Pam what her art means to this office.'],
          announce: ['Surprise appreciation party and puppies for everyone!']
        },
        fact: 'Critics want a genuine feel-good episode before Friday\'s finale.',
        topics: ['Maybe we really are kind of like a family under these fluorescent lights.', 'Even Angela melted at the thought of a wholesome finale.']
      },
      {
        chapter: 5,
        weekday: 'Friday',
        title: 'Season Finale Broadcast',
        intro: [
          'Millions are tuned in live for Friday\'s Season Finale—and nothing tops 75% peak chaos plus back-to-back spectacle.',
          'Unleash at least 2 powers or custom events and crack 75% chaos for a legendary finale.'
        ],
        featured: [{ id: 'michael', face: 'excited' }, { id: 'jim', face: 'excited' }, { id: 'kevin', face: 'excited' }],
        goalInfo: {
          id: 'viral_fri',
          title: 'Blow the roof off',
          detail: 'Reach 75%+ peak chaos AND trigger at least 2 powers/Anything events today.',
          icon: 'ufo',
          stamp: ['SMASH HIT', 'CANCELLED']
        },
        goal: { kind: 'finale_showdown', mode: 'peak_spectacle' },
        extras: ['peak_mayhem', 'plot_twist'],
        hints: [
          'Stack Zero Gravity, Disco Fever, Abduction, Bees, Fire, or Anything!',
          'No incident penalties apply in Going Viral—go all out!'
        ],
        suggest: {
          whisper: ['Make this final hour television history!'],
          announce: ['LIVE FINALE! Everybody dance like the ceiling is opening!']
        },
        fact: 'The live documentary Season Finale is broadcasting across the country right now.',
        topics: ['This is our shot to make TV history before five o\'clock!', 'Michael already practiced his award acceptance speech.']
      }
    ]
  },

  // ── 5. The Scranton Anomaly (chaos-friendly) ───────────────────────────────
  {
    id: 'cursed_building',
    title: 'The Scranton Anomaly',
    tagline: 'Something bizarre lurks beneath the carpet.',
    premise: 'Strange physics, ghosts, and cosmic interference haunt Munder Difflin—and feeding the anomaly drives the plot.',
    chaosFriendly: true,
    chapters: [
      {
        chapter: 1,
        weekday: 'Monday',
        title: 'Cold Spots',
        intro: [
          'Every clock in the annex stopped at 09:04 and the copier started printing Latin warnings.',
          'Push chaos past 55% or trigger an eerie phenomenon so nobody can shrug it off.'
        ],
        featured: [{ id: 'creed', face: 'excited' }, { id: 'oscar', face: 'confused' }],
        goalInfo: {
          id: 'anom_mon',
          title: 'Awaken the anomaly',
          detail: 'Reach 55%+ chaos or trigger a spooky/weird event (Haunting, Abduction, Blackout, Quake...).',
          icon: 'ghost',
          stamp: ['HAUNTED', 'DORMANT']
        },
        goal: { kind: 'spectacle', chaosPeak: 55, eventsNeeded: 1 },
        extras: ['wildcard', 'plot_twist'],
        hints: [
          'Haunting, Blackout, Abduction, Zero Gravity, Time Freeze, or Anything weird fits right in.',
          'Anomaly seasons reward dramatic chaos with +3 Standing!'
        ],
        suggest: {
          whisper: ['Investigate the cold spot near the break room vending machine.'],
          announce: ['Did anyone else see that shadow glide past Accounting?']
        },
        fact: 'Weird electrical glitches and cold spots are spreading across the office.',
        topics: ['Why is the copier spitting out Latin warnings?', 'Creed insists the building sits on an old wormhole.']
      },
      {
        chapter: 2,
        weekday: 'Tuesday',
        title: 'Convince the Skeptics',
        intro: [
          'Oscar and Angela are insisting the weird phenomena are just cheap pranks by Jim.',
          'Produce two undeniable supernatural stunts, secrets, or Anything manifestations today.'
        ],
        featured: [{ id: 'oscar', face: 'smug' }, { id: 'angela', face: 'disgusted' }, { id: 'jim', face: 'mischievous' }],
        goalInfo: {
          id: 'anom_tue',
          title: 'Break their denial',
          detail: 'Create 2 undeniable moments (Anything creatures/happenings, secrets, or boss proclamations).',
          icon: 'ufo',
          stamp: ['BELIEVERS', 'SKEPTICS']
        },
        goal: { kind: 'drama_action', actions: ['custom', 'chaos_any', 'secret', 'boss_crown'], count: 2 },
        extras: ['plot_twist', 'whisper_net'],
        hints: [
          'Use Anything ("a portal opens in Accounting") or Weird powers like Shrink Ray, Embiggen, or Body Swap!',
          'Truth Serum also counts if you want someone to blurt out what they saw.'
        ],
        suggest: {
          whisper: ['Admit you saw something impossible in the ceiling vents!'],
          announce: ['Look closely at Accounting—reality is bending!']
        },
        fact: 'Skeptics say the anomalies are fake; believers say something big is coming.',
        topics: ['Oscar still claims ghosts do not pay taxes so they cannot be real.', 'Somebody swears they saw a teacup levitate at nine.']
      },
      {
        chapter: 3,
        weekday: 'Wednesday',
        title: 'Evacuate the Floor',
        intro: [
          'A low hum rattled the foundations at sunrise, tempting everyone to bolt for fresh air outside.',
          'Clear at least 8 people out onto the street & parking lot at once before four o\'clock.'
        ],
        featured: [{ id: 'pam', face: 'scared' }, { id: 'dwight', face: 'determined' }],
        goalInfo: {
          id: 'anom_wed',
          title: 'Clear the building',
          detail: 'Get at least 8 people outside onto the street/lot at the same time before 16:00.',
          icon: 'fireDrill',
          stamp: ['EVACUATED', 'TRAPPED IN'],
          room: 'outside'
        },
        goal: { kind: 'gather', room: 'outside', need: 8, deadlineHour: 16 },
        extras: ['full_house', 'hands_on'],
        hints: [
          'Fire Drill sends the entire office rushing outside onto the pavement automatically!',
          'Or announce "Free trucks outside in the parking lot!" or drag people out.'
        ],
        suggest: {
          whisper: ['Run out the front door right now before the floor drops!'],
          announce: ['Emergency evacuation! Everybody outside to the parking lot now!']
        },
        fact: 'Strange tremors make the parking lot the safest spot in Scranton.',
        topics: ['Did anyone feel the floor hum just now?', 'Dwight has his bug-out whistle between his teeth.']
      },
      {
        chapter: 4,
        weekday: 'Thursday',
        title: 'Crisis Romance',
        intro: [
          'With cosmic weirdness rattling the walls, old hidden crushes are boiling straight to the surface.',
          'Bring Dwight and Angela closer by +8 bond today before whatever comes Friday.'
        ],
        featured: [{ id: 'dwight', face: 'love' }, { id: 'angela', face: 'nervous' }],
        goalInfo: {
          id: 'anom_thu',
          title: 'Hidden sparks',
          detail: 'Raise how well Angela feels about Dwight by +8 today.',
          icon: 'love',
          stamp: ['SMITTEN', 'FROSTY']
        },
        goal: { kind: 'bond_shift', who: 'angela', about: 'dwight', direction: 'up', by: 8 },
        extras: ['whisper_net', 'good_vibes'],
        hints: [
          'Hit Angela with Cupid\'s Arrow toward Dwight, Lock Them In together, or whisper romantic urges!',
          'Directing Angela "kiss Dwight" or "romance Dwight" triggers an instant reaction.'
        ],
        suggest: {
          whisper: ['Tell Dwight you trust only him to protect you from the anomaly.'],
          announce: ['Something romantic is humming through the office vents today!']
        },
        fact: 'Strange energy in the building makes secret feelings harder to hide.',
        topics: ['Has anyone noticed Angela glancing over at Dwight all morning?', 'Crisis makes weird couples out of coworkers.']
      },
      {
        chapter: 5,
        weekday: 'Friday',
        title: 'Total Convergence',
        intro: [
          'All anomalies converge at once today—cosmic rays, ghosts, and office madness peaking together.',
          'Hit 75%+ peak chaos with 2+ powers/Anything events to complete the season in unforgettable style.'
        ],
        featured: [{ id: 'michael', face: 'surprised' }, { id: 'creed', face: 'proud' }, { id: 'kevin', face: 'scared' }],
        goalInfo: {
          id: 'anom_fri',
          title: 'Unleash convergence',
          detail: 'Push peak chaos to 75%+ AND set off at least 2 powers or Anything stunts.',
          icon: 'zeroG',
          stamp: ['ASCENDED', 'FIZZLED OUT']
        },
        goal: { kind: 'finale_showdown', mode: 'peak_spectacle' },
        extras: ['peak_mayhem', 'plot_twist'],
        hints: [
          'Chain Zero Gravity, Abduction, Haunting, Lightning Smite, Bees, and Anything monsters!',
          'Zero penalty for big chaos here—push the needle into the red.'
        ],
        suggest: {
          whisper: ['Embrace the cosmic anomaly and lose your mind!'],
          announce: ['Gravity is optional today, Munder Difflin!']
        },
        fact: 'Friday marks peak anomalous convergence inside the Scranton branch.',
        topics: ['Creed says if the lights flicker three times, start floating.', 'Everything strange all week was building toward today.']
      }
    ]
  },

  // ── 6. The Scranton Saboteur (Mystery) ─────────────────────────────────────
  {
    id: 'murder_mystery',
    title: 'The Scranton Saboteur',
    tagline: 'Someone is systematically wrecking the branch.',
    premise: 'A mysterious insider keeps sabotaging equipment and framing coworkers—until Friday\'s parlor showdown.',
    chapters: [
      {
        chapter: 1,
        weekday: 'Monday',
        title: 'A Cold Morning',
        intro: [
          'Somebody cut the coffee machine cord before nine and left an unsigned warning note taped to reception.',
          'Kick off the mystery with 1 dramatic shock—knock someone out, leak a secret, or summon an Anything omen.'
        ],
        featured: [{ id: 'pam', face: 'scared' }, { id: 'dwight', face: 'determined' }],
        goalInfo: {
          id: 'myst_mon',
          title: 'First dramatic clue',
          detail: 'Trigger 1 dramatic beat (knockout, elimination, secret leak, custom event, or any chaos power).',
          icon: 'paranoia',
          stamp: ['MYSTERY SET', 'FALSE START']
        },
        goal: { kind: 'drama_action', actions: ['knockedOut', 'eliminated', 'secret', 'custom', 'chaos_any'], count: 1 },
        extras: ['whisper_net', 'wildcard'],
        hints: [
          'Whisper a physical threat, use Paranoia or Leak a Secret, or drop a bizarre Anything event.',
          'Any chaos power or Tell them to stunt also kicks off Monday\'s plot cleanly.'
        ],
        suggest: {
          whisper: ['Accuse somebody near the coffee pot of tampering with the cord!'],
          announce: ['Nobody touch the coffee pot—it might be tampered with!']
        },
        fact: 'A cryptic sabotage note appeared on Reception desk this morning.',
        topics: ['Who cut the coffee pot cable before nine o\'clock?', 'Dwight already dusted three mugs for fingerprints.']
      },
      {
        chapter: 2,
        weekday: 'Tuesday',
        title: 'Cornered in the Annex',
        intro: [
          'Whispers trace the saboteur\'s footprints back toward the Annex, where nobody ever checks who comes and goes.',
          'Herd at least 4 suspects into the Annex at the same time to shake loose alibis.'
        ],
        featured: [{ id: 'toby', face: 'nervous' }, { id: 'kelly', face: 'suspicious' }, { id: 'ryan', face: 'nervous' }],
        goalInfo: {
          id: 'myst_tue',
          title: 'Annex interrogation',
          detail: 'Get at least 4 staff into the Annex together before 16:00.',
          icon: 'paranoia',
          stamp: ['ALIBIS CHECKED', 'NO WITNESSES'],
          room: 'annex'
        },
        goal: { kind: 'gather', room: 'annex', need: 4, deadlineHour: 16 },
        extras: ['hands_on', 'plot_twist'],
        hints: [
          'Announce "Everybody to the Annex to check the files!" or drag suspects straight there.',
          'Whisper curious thoughts so people march into the Annex on their own.'
        ],
        suggest: {
          whisper: ['Go search the Annex desks right now for evidence.'],
          announce: ['Suspect line-up in the Annex, four people at least!']
        },
        fact: 'Footprints and torn memos point straight toward the Annex.',
        topics: ['Everyone avoids the Annex, which makes it the best place to hide evidence.', 'Toby swears he heard footsteps behind him yesterday.']
      },
      {
        chapter: 3,
        weekday: 'Wednesday',
        title: 'Pointing Fingers',
        intro: [
          'Half the branch thinks Dwight is behind it; Dwight is dead certain Toby is the mastermind.',
          'Turn Dwight\'s opinion of Toby downward by at least 8 points today.'
        ],
        featured: [{ id: 'dwight', face: 'angry' }, { id: 'toby', face: 'sad' }],
        goalInfo: {
          id: 'myst_wed',
          title: 'Fuel Dwight\'s suspicion',
          detail: 'Drop how Dwight feels about Toby by 8 or more points today.',
          icon: 'rage',
          stamp: ['SUSPECT NAMED', 'FORGIVEN']
        },
        goal: { kind: 'bond_shift', who: 'dwight', about: 'toby', direction: 'down', by: 8 },
        extras: ['whisper_net', 'peak_mayhem'],
        hints: [
          'Hit Dwight with Grudge toward Toby, or whisper "Toby was by your beet stash."',
          'Telling Dwight to chase, shove, or knock out Toby also tanks their bond fast.'
        ],
        suggest: {
          whisper: ['Toby sabotaged the branch and tried to frame you.'],
          announce: ['Someone saw Toby snooping by the printer tray!']
        },
        fact: 'Dwight is building a wall chart of Toby\'s suspicious coffee breaks.',
        topics: ['Is Toby really harmless, or the quietest mastermind here?', 'Dwight has not blinked while glaring toward HR all morning.']
      },
      {
        chapter: 4,
        weekday: 'Thursday',
        title: 'Unmask the Saboteur',
        intro: [
          'We now know the saboteur acted alone, and their sloppy trail stops today.',
          'Use Truth Serum, gossip, or detectives\' instinct—then open their card in People to accuse them.'
        ],
        featured: [],
        icon: 'secretLeak',
        goalInfo: {
          id: 'myst_thu',
          title: 'Solve the mystery',
          detail: 'Tap a suspect on the floor or in People (3 tries) to catch the real Saboteur.',
          icon: 'secretLeak',
          stamp: ['UNMASKED', 'AT LARGE']
        },
        goal: { kind: 'accuse_mole', tries: 3, label: 'Accuse the saboteur' },
        extras: ['wildcard', 'whisper_net'],
        hints: [
          'Cast Truth Serum or Leak a Secret on suspicious coworkers to uncover clues.',
          'Even if someone acts innocent, check how they react in the Log.'
        ],
        suggest: {
          whisper: ['Drop your alibi and tell everybody what you did Tuesday night!'],
          announce: ['Truth Serum is in the water cooler! Spill everything!']
        },
        fact: 'Thursday is the final chance to catch the Scranton Saboteur red-handed.',
        topics: ['Who has really been sabotaging Munder Difflin all week?', 'Whoever cracks first in the log is probably our culprit.']
      },
      {
        chapter: 5,
        weekday: 'Friday',
        title: 'The Parlor Showdown',
        intro: [
          'Time for the classic detective finale: gather everyone in the Conference Room, or deal with the Saboteur directly.',
          'Pull 7+ staff into the Conference Room OR confront/knock out/expose the Saboteur before five.'
        ],
        featured: [{ id: 'michael', face: 'determined' }, { id: 'jim', face: 'suspicious' }, { id: 'angela', face: 'suspicious' }],
        goalInfo: {
          id: 'myst_fri',
          title: 'Close the case',
          detail: 'Gather 7+ people in the Conference Room OR unmask/knock out/eliminate the Saboteur.',
          icon: 'check',
          stamp: ['CASE CLOSED', 'UNSOLVED'],
          room: 'meeting'
        },
        goal: { kind: 'finale_showdown', mode: 'verdict_trial' },
        extras: ['full_house', 'good_vibes'],
        hints: [
          'Trigger All-Hands or Disco Fever/announcements to gather 7+ staff into Meeting for the trial.',
          'Or use Truth Serum, Leak a Secret, or a physical takedown right on the culprit!'
        ],
        suggest: {
          whisper: ['Gather everyone for the dramatic mystery reveal!'],
          announce: ['Parlor reveal in the conference room right now—everybody in!']
        },
        fact: 'Today\'s showdown settles the Scranton Saboteur case once and for all.',
        topics: ['Michael insists on wearing a detective trench coat for the finale.', 'By five o\'clock we finally close the case on the saboteur.']
      }
    ]
  }
];

const ARC_MAP = new Map<SagaArcId, SagaArcDef>(SAGA_ARCS.map((a) => [a.id, a]));

export function arcById(id: string): SagaArcDef {
  return ARC_MAP.get(id as SagaArcId) ?? SAGA_ARCS[0];
}

/** Deterministic shuffled deck of all 6 arc IDs, never repeating `excludeFirst` on the first draw. */
export function pickArcDeck(seed: number, excludeFirst?: SagaArcId): SagaArcId[] {
  const rng = createRng((seed ^ 0x93b1a7) >>> 0 || 1);
  const deck = rng.shuffle(SAGA_ARCS.map((a) => a.id));
  if (excludeFirst && deck.length > 1 && deck[0] === excludeFirst) {
    const swap = 1 + Math.floor(rng() * (deck.length - 1));
    [deck[0], deck[swap]] = [deck[swap], deck[0]];
  }
  return deck;
}

export function pickSagaMole(seed: number, exclude?: readonly string[]): CastId {
  const rng = createRng((seed ^ 0x61c88647) >>> 0 || 1);
  const pool = SAGA_MOLE_CANDIDATES.filter((id) => !exclude?.includes(id));
  return rng.pick(pool.length ? pool : SAGA_MOLE_CANDIDATES);
}
