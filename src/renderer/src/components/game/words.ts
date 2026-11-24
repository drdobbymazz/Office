// Interface words and small lookups. Plain, short, British English.

import type { AccentColorName } from '@/design/tokens';
import type { ChaosId, EmotionId, FeedKind, StatusKind } from '@/game/core/types';
import type { GIconName } from './icons';

export type TabId = 'director' | 'powers' | 'people' | 'log' | 'settings';

export const TABS: { id: TabId; label: string; icon: GIconName; accent: AccentColorName }[] = [
  { id: 'director', label: 'Director', icon: 'director', accent: 'lemon' },
  { id: 'powers', label: 'Powers', icon: 'powers', accent: 'coral' },
  { id: 'people', label: 'People', icon: 'people', accent: 'sky' },
  { id: 'log', label: 'Log', icon: 'log', accent: 'mint' },
  { id: 'settings', label: 'Settings', icon: 'gear', accent: 'lilac' }
];

/** What the big confirm button says. */
export const CONFIRM: Record<ChaosId, string> = {
  fire: 'Start the fire', flood: 'Burst the pipe', blackout: 'Cut the power', quake: 'Shake the building',
  fireDrill: 'Sound the alarm', lockIn: 'Lock them in', wifiDown: 'Kill the Wi-Fi', snackStorm: 'Break the vending machine',
  ufo: 'Send the saucer', ghost: 'Send the ghost', zeroG: 'Switch off gravity', timeFreeze: 'Stop time',
  smite: 'Strike them', shrink: 'Fire the shrink ray', giant: 'Make them huge', bodySwap: 'Swap their minds',
  disco: 'Start the disco', bees: 'Let the bees in', raccoon: 'Let the raccoon in', pizza: 'Order the pizza',
  puppy: 'Send in the puppy', moneyRain: 'Make it rain', birthday: 'Throw the party', espresso: 'Pour the espresso',
  love: 'Fire the arrow', rage: 'Start the grudge', truth: 'Give the serum', sleep: 'Put them to sleep',
  paranoia: 'Make them paranoid', rumour: 'Start the rumour', meeting: 'Call the meeting',
  inspector: 'Send the inspector', crown: 'Crown them', secretLeak: 'Leak the secret'
};

export const EMOTION_WORD: Record<EmotionId, string> = {
  neutral: 'calm', happy: 'happy', excited: 'excited', amused: 'amused', smug: 'smug', love: 'smitten',
  sad: 'sad', angry: 'angry', scared: 'scared', surprised: 'surprised', confused: 'confused',
  embarrassed: 'embarrassed', disgusted: 'disgusted', bored: 'bored', tired: 'tired', suspicious: 'suspicious',
  nervous: 'nervous', proud: 'proud', mischievous: 'up to something', determined: 'determined'
};

export const STATUS_WORD: Record<StatusKind, string> = {
  love: 'in love', rage: 'furious', truth: 'cannot lie', paranoid: 'paranoid', caffeinated: 'wired',
  sleepy: 'sleepy', asleep: 'asleep', tiny: 'tiny', giant: 'huge', swapped: 'swapped', crowned: 'boss',
  party: 'birthday', rich: 'rich', spooked: 'spooked', abducted: 'abducted', stung: 'stung', dizzy: 'dizzy',
  wet: 'soaked', sooty: 'sooty', frizzy: 'frizzy', frozen: 'frozen',
  knockedOut: 'knocked out', eliminated: 'eliminated', guilty: 'wanted', quit: 'quit', naked: 'naked'
};

export const FEED_ICON: Record<FeedKind, GIconName> = {
  say: 'tell', think: 'brain', event: 'warn', overseer: 'powers', shift: 'morale', system: 'gear'
};

/** Short room names for the mini plan. */
export const ROOM_SHORT: Record<string, string> = {
  boss: 'Boss', meeting: 'Meeting', annex: 'Annex', accounts: 'Accounts', bullpen: 'Bullpen', kitchen: 'Kitchen',
  outside: 'Outside'
};

/** Room names for the tiles of the mini plan (they wrap onto two short lines in the narrow tiles). */
export const ROOM_TILE: Record<string, string> = {
  boss: "Michael's office", meeting: 'Conference room', annex: 'Annex', accounts: 'Accounts', bullpen: 'Bullpen', kitchen: 'Break room',
  outside: 'Outside'
};

/** Words in an activity that already say where someone is ("hiding in his office", "waiting at the door"). */
const PLACE_IN_DOING = /\b(in|at|into|inside|outside)\b|\b(office|room|kitchen|bullpen|annex|accounts|corner|desk|door|lift|pavement|building|home|loo|toilet|stairs)\b/i;

/**
 * One sentence on what someone is doing and where, saying the place once: "Typing in the bullpen."
 * but "Hiding in his office." (not "Hiding in his office in the bullpen.").
 */
export function doingWhere(doing: string, roomName: string): string {
  const d = cap((doing || 'standing about').trim().replace(/\.$/, ''));
  if (!roomName || PLACE_IN_DOING.test(doing)) return `${d}.`;
  // "the pavement outside" is somewhere you are on, not in.
  const prep = /^the pavement/i.test(roomName) ? 'on' : 'in';
  return `${d} ${prep} ${roomName}.`;
}

/** Darken a '#rrggbb' cast colour until it reads on cream (names in their colour). */
export function readableOnCream(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (rr: number, gg: number, bb: number) => (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
  let i = 0;
  while (lum(r, g, b) > 0.36 && i < 12) {
    r = Math.round(r * 0.85); g = Math.round(g * 0.85); b = Math.round(b * 0.85); i++;
  }
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** "the break room" -> "The break room" when it starts a line. */
export function fill(template: string, name: string, other: string): string {
  return template.split('{name}').join(name).split('{other}').join(other);
}
