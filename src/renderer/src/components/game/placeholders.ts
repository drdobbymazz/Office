// A small stand-in set of suggestions and tips until the writer's real ones land.
// GameUI takes the real ones as props; these are only for the harness and as a fallback.

import type { Suggestions, Tips } from '@/game/core/content/types';

export const PLACEHOLDER_SUGGESTIONS: Suggestions = {
  whispers: [
    '{other} has been talking about you behind your back.',
    'You deserve a pay rise. Go and ask for one.',
    'There is free cake in the break room.',
    'You left the oven on at home.',
    '{other} is secretly in love with you.',
    'Today is the day you finally say what you really think.'
  ],
  announcements: [
    'Would the owner of a silver car please move it. It is on fire.',
    'Free doughnuts in the break room. First come, first served.',
    'Corporate is visiting at three. Look busy.',
    'The fridge will be cleared out at noon. Everything goes.'
  ],
  customEvents: [
    'a horse walks into the office',
    'the printer starts printing love letters',
    'a mariachi band arrives for Michael',
    'all the chairs disappear',
    'the coffee machine starts talking'
  ],
  cues: [
    'tell {other} the truth',
    'go and get everyone a coffee',
    'start a conga line',
    'challenge {other} to an arm wrestle',
    'confess to eating the last doughnut'
  ]
};

export const PLACEHOLDER_TIPS: Tips = [
  'Press and hold someone to pick them up. Drop them anywhere.',
  'A whisper feels like their own idea. Use it gently, or not.',
  'Some powers need a target. Tap a room or a person on the floor to aim.',
  'Fast-forward to skip the quiet bits.',
  'Open People to see what someone is thinking right now.',
  'Fires do not put themselves out. Somebody has to step up.'
];
