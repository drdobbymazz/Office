// Plain narration for every Overseer event (British spelling: this is interface text).
// {room} only appears for events with a room (target 'room' or a fixedRoom);
// {who} / {other} only for events aimed at a person or a pair. For pairs, {who}
// is the one it happens to and {other} the one it is about.
// `fact` may be dropped mid-sentence; the game fixes the capital letter.
import type { ChaosId } from '@/game/core/types';
import type { ChaosText } from './types';

export const CHAOS_TEXT: Record<ChaosId, ChaosText> = {
  // ── disasters ──
  fire: {
    start: 'Fire breaks out in {room}.',
    end: 'The fire in {room} is out.',
    fact: '{room} is on fire.',
    aftermath: 'The fire in {room} has just been put out.',
    memory: 'There was a fire in {room}.'
  },
  flood: {
    start: 'A pipe bursts and water pours into {room}.',
    end: 'The burst pipe in {room} is fixed and the water drains away.',
    fact: '{room} is flooding from a burst pipe.',
    aftermath: 'The burst pipe in {room} has just been fixed.',
    memory: 'A pipe burst and flooded {room}.'
  },
  blackout: {
    start: 'The power goes out across the whole building.',
    end: 'The power comes back on.',
    fact: 'The power is out across the whole building.',
    aftermath: 'The power has just come back on after a blackout.',
    memory: 'The power went out and the office sat in the dark.'
  },
  quake: {
    start: 'An earthquake shakes the building.',
    end: 'The shaking stops.',
    fact: 'The building is shaking in an earthquake.',
    aftermath: 'An earthquake has just shaken the building.',
    memory: 'An earthquake shook the office.'
  },
  fireDrill: {
    start: 'The fire alarm goes off and everyone has to leave the building.',
    end: 'The fire drill is over and everyone heads back inside.',
    fact: 'A fire drill is on and everyone has to wait outside.',
    aftermath: 'A fire drill has just ended.',
    memory: 'Everyone had to stand outside for a fire drill.'
  },
  lockIn: {
    start: '{who} and {other} are called to {room}, and the doors jam shut behind them.',
    end: 'The doors of {room} finally open and {who} and {other} are let out.',
    fact: '{who} and {other} are locked in {room} together.',
    aftermath: '{who} and {other} have just been let out after being locked in {room} together.',
    memory: '{who} and {other} were locked in {room} together.'
  },
  wifiDown: {
    start: 'The Wi-Fi goes down across the office.',
    end: 'The Wi-Fi is back.',
    fact: 'The Wi-Fi is down, so nobody can work.',
    aftermath: 'The Wi-Fi has just come back after an outage.',
    memory: 'The Wi-Fi went down and people had to talk to each other.'
  },
  snackStorm: {
    start: 'The vending machine goes berserk and fires snacks across {room}.',
    end: 'The vending machine in {room} runs out of snacks to throw.',
    fact: 'The vending machine is firing snacks across {room}.',
    aftermath: 'The vending machine in {room} has just stopped firing snacks.',
    memory: 'The vending machine fired snacks all over {room}.'
  },

  // ── weird ──
  ufo: {
    start: 'A flying saucer beams {who} up through the ceiling.',
    end: 'The saucer drops {who} back in the office, a little changed.',
    fact: '{who} has been taken aboard a flying saucer.',
    aftermath: '{who} has just been brought back by a flying saucer.',
    memory: 'A flying saucer took {who} away and brought them back.'
  },
  ghost: {
    start: 'A ghost drifts into {room}.',
    end: 'The ghost fades away.',
    fact: 'A ghost is drifting through {room}.',
    aftermath: 'The ghost in {room} has just vanished.',
    memory: 'A ghost haunted {room}.'
  },
  zeroG: {
    start: 'Gravity switches off and everyone floats into the air.',
    end: 'Gravity comes back and everyone drops to the floor.',
    fact: 'Gravity is off and everyone is floating.',
    aftermath: 'Gravity has just come back and dropped everyone on the floor.',
    memory: 'Gravity switched off and everyone floated.'
  },
  timeFreeze: {
    start: 'Time stops and everyone freezes in place.',
    end: 'Time starts again.',
    fact: 'Time has stopped and everyone is frozen in place.',
    aftermath: 'Time has just started again, and some people are not where they were.',
    memory: 'Time stopped for a moment, and some people woke up somewhere else.'
  },
  smite: {
    start: 'A bolt of lightning hits {who}.',
    end: '{who} stops smoking.',
    fact: '{who} has just been struck by lightning and is frazzled.',
    aftermath: '{who} has just been hit by a bolt of lightning, indoors.',
    memory: '{who} was struck by lightning in the office.'
  },
  shrink: {
    start: '{who} shrinks to the size of a stapler.',
    end: '{who} grows back to normal size.',
    fact: '{who} has shrunk to the size of a stapler.',
    aftermath: '{who} has just grown back after being the size of a stapler.',
    memory: '{who} was shrunk to the size of a stapler.'
  },
  giant: {
    start: '{who} grows to giant size.',
    end: '{who} shrinks back to normal size.',
    fact: '{who} has grown to giant size.',
    aftermath: '{who} has just shrunk back after being a giant.',
    memory: '{who} grew to giant size.'
  },
  bodySwap: {
    start: '{who} and {other} swap minds.',
    end: '{who} and {other} are back in their own heads.',
    fact: '{who} and {other} have swapped minds, so each talks like the other.',
    aftermath: '{who} and {other} have just swapped back after sharing each other\'s heads.',
    memory: '{who} and {other} swapped minds for a while.'
  },
  disco: {
    start: 'The lights drop, a mirror ball appears and everyone starts dancing.',
    end: 'The mirror ball vanishes and the dancing stops.',
    fact: 'A mirror ball is spinning and nobody can stop dancing.',
    aftermath: 'A disco has just ended and everyone has stopped dancing.',
    memory: 'Everyone was made to dance under a mirror ball.'
  },
  bees: {
    start: 'A swarm of bees pours out of the vent in {room}.',
    end: 'The bees leave {room}.',
    fact: '{room} is full of bees.',
    aftermath: 'A swarm of bees has just left {room}.',
    memory: 'A swarm of bees got into {room}.'
  },
  raccoon: {
    start: 'A raccoon gets into {room} and goes for the food.',
    end: 'The raccoon runs off.',
    fact: 'A raccoon is loose in {room}.',
    aftermath: 'The raccoon in {room} has just run off.',
    memory: 'A raccoon got into {room} and raided the food.'
  },

  // ── treats ──
  pizza: {
    start: 'Free pizza arrives in {room}.',
    end: 'The pizza in {room} is all gone.',
    fact: 'There is free pizza in {room}.',
    aftermath: 'The free pizza in {room} has just been finished.',
    memory: 'Free pizza turned up in {room}.'
  },
  puppy: {
    start: 'A puppy wanders into {room}.',
    end: 'The puppy trots off home.',
    fact: 'A puppy is wandering around {room}.',
    aftermath: 'The puppy in {room} has just gone home.',
    memory: 'A puppy visited {room}.'
  },
  moneyRain: {
    start: 'Banknotes start falling from the ceiling of {room}.',
    end: 'The money stops falling in {room}.',
    fact: 'Money is raining from the ceiling of {room}.',
    aftermath: 'Money has just stopped raining from the ceiling of {room}.',
    memory: 'Money fell from the ceiling of {room}.'
  },
  birthday: {
    start: 'Balloons, confetti and a cake appear for a surprise party for {who}.',
    end: 'The surprise party for {who} winds down.',
    fact: 'There is a surprise party going on for {who}.',
    aftermath: 'The surprise party for {who} has just ended.',
    memory: 'There was a surprise party for {who}.'
  },
  espresso: {
    start: '{who} downs a triple espresso and speeds up.',
    end: 'The caffeine wears off and {who} slows down.',
    fact: '{who} has had far too much espresso and is moving at double speed.',
    aftermath: '{who} has just come down from a triple espresso.',
    memory: '{who} had far too much espresso.'
  },

  // ── mind games ──
  love: {
    start: '{who} falls head over heels for {other}.',
    end: '{who} gets over {other}.',
    fact: '{who} is madly in love with {other}.',
    aftermath: '{who} has just stopped being in love with {other}.',
    memory: '{who} fell madly in love with {other}.'
  },
  rage: {
    start: '{who} is suddenly furious with {other}.',
    end: '{who} calms down about {other}.',
    fact: '{who} is furious with {other} and wants to have it out.',
    aftermath: '{who} has just calmed down after being furious with {other}.',
    memory: '{who} was furious with {other}.'
  },
  truth: {
    start: '{who} suddenly cannot tell a lie.',
    end: '{who} can lie again.',
    fact: '{who} cannot lie or keep a secret.',
    aftermath: '{who} can lie again after a spell of total honesty.',
    memory: '{who} could not stop telling the truth.'
  },
  sleep: {
    start: 'Everyone in {room} falls asleep where they stand.',
    end: 'Everyone in {room} wakes up.',
    fact: 'Everyone in {room} is fast asleep.',
    aftermath: 'Everyone in {room} has just woken up from a sudden nap.',
    memory: 'Everyone in {room} fell asleep at once.'
  },
  paranoia: {
    start: '{who} becomes sure that someone is watching them.',
    end: '{who} stops feeling watched.',
    fact: '{who} is sure they are being watched.',
    aftermath: '{who} has just stopped feeling watched.',
    memory: '{who} was sure someone was watching them.'
  },
  rumour: {
    start: 'A rumour spreads that someone is getting sacked today.',
    end: 'The layoff rumour dies down.',
    fact: 'A rumour is going round that someone is getting sacked today.',
    aftermath: 'The rumour about someone getting sacked has just died down.',
    memory: 'There was a rumour that someone was getting sacked.'
  },
  meeting: {
    start: 'Everyone is called to {room} for an all-hands meeting.',
    end: 'The all-hands meeting in {room} breaks up.',
    fact: 'An all-hands meeting is under way in {room}.',
    aftermath: 'An all-hands meeting in {room} has just ended.',
    memory: 'Everyone was called to an all-hands meeting in {room}.'
  },
  inspector: {
    start: 'An inspector from Corporate walks in unannounced.',
    end: 'The inspector from Corporate leaves.',
    fact: 'An inspector from Corporate is watching everyone and taking notes.',
    aftermath: 'The inspector from Corporate has just left.',
    memory: 'An inspector from Corporate came to check on the office.'
  },
  crown: {
    start: '{who} is put in charge of the office.',
    end: '{who} is no longer the boss.',
    fact: '{who} is the boss for the day.',
    aftermath: '{who} has just stopped being the boss.',
    memory: '{who} was put in charge of the office for a day.'
  },
  secretLeak: {
    start: 'An email revealing {who}\'s secret goes to the whole office.',
    end: 'The fuss over {who}\'s secret dies down.',
    fact: 'Everyone has read an email revealing {who}\'s secret.',
    aftermath: 'Everyone has just read {who}\'s secret in an office-wide email.',
    memory: '{who}\'s secret was emailed to everyone.'
  }
};
