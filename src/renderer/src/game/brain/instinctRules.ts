// Plain rules and fallback words for the no-model brain.

import type { ChaosId, EmotionId, LineAct } from '@/game/core/types';

export type FixSkill = 'fire' | 'flood' | 'power' | 'wifi' | 'machine' | 'door' | 'pest';
import type { BarkKind, CustomKind, CustomLook, CustomPower, CustomReaction, CustomVibe, GuestLookWords } from './api';

/** Spot which event a sentence is about ("Fire breaks out in the Break Room."). Order matters: specific first. */
export const CHAOS_KEYWORDS: readonly [ChaosId, RegExp][] = [
  ['fireDrill', /fire drill|fire alarm|evacuat/i],
  ['snackStorm', /vending machine|snacks? (fly|fire|storm)|snack storm/i],
  ['lockIn', /locked in|doors? (jam|lock)|jammed shut/i],
  ['wifiDown', /wi-?fi|internet|network is down/i],
  ['blackout', /blackout|power (is )?(out|cut|off)|lights (go|went) out|power goes/i],
  ['quake', /quake|shak/i],
  ['flood', /flood|burst pipe|pipe bursts|water is rising|filling with water/i],
  ['fire', /\bfire\b|on fire|flames|blaze/i],
  ['ufo', /saucer|\bufo\b|abduct|beamed up|aliens?\b/i],
  ['ghost', /ghost|haunt/i],
  ['zeroG', /gravity|floating|float\b/i],
  ['timeFreeze', /time (is )?(stops|stopped|frozen|freezes)|time freeze/i],
  ['smite', /lightning|smite|zapped/i],
  ['shrink', /shr[iu]nk|size of a stapler/i],
  ['giant', /giant|grows huge|embiggen/i],
  ['bodySwap', /swap(ped)? minds|body swap|mind swap/i],
  ['disco', /disco|mirror ball/i],
  ['bees', /\bbees?\b|swarm/i],
  ['raccoon', /raccoon/i],
  ['pizza', /pizza/i],
  ['puppy', /puppy|\bdog\b/i],
  ['moneyRain', /banknotes|money|cash|bonus/i],
  ['birthday', /birthday|surprise party|balloons|confetti/i],
  ['espresso', /espresso|caffeine/i],
  ['inspector', /inspector|head office/i],
  ['secretLeak', /secret/i],
  ['crown', /in charge|boss for a day|crown/i],
  ['meeting', /all-hands|meeting room, right now|called to the meeting/i],
  ['rumour', /rumou?r|sacked|layoff|fired today/i],
  ['truth', /truth|cannot lie/i],
  ['paranoia', /watched|paranoi/i],
  ['sleep', /asleep|nap|falls? asleep/i],
  ['rage', /furious|grudge|rage/i],
  ['love', /falls? (hard )?for|in love|smitten/i]
];

export function detectChaos(text: string): ChaosId | null {
  for (const [id, re] of CHAOS_KEYWORDS) if (re.test(text)) return id;
  return null;
}

export const CHAOS_NOUN: Record<ChaosId, string> = {
  fire: 'the fire', flood: 'the burst pipe', blackout: 'the blackout', quake: 'the earthquake', fireDrill: 'the fire drill',
  lockIn: 'the jammed conference room doors', wifiDown: 'the Wi-Fi going down', snackStorm: 'the vending machine going berserk', ufo: 'the flying saucer',
  ghost: 'the ghost', zeroG: 'gravity switching off', timeFreeze: 'time stopping', smite: 'the lightning bolt', shrink: 'the shrink ray',
  giant: 'someone growing huge', bodySwap: 'the body swap', disco: 'the sudden disco', bees: 'the bees', raccoon: 'the raccoon',
  pizza: 'the free pizza', puppy: 'the puppy', moneyRain: 'the money falling from the ceiling', birthday: 'the surprise party',
  espresso: 'far too much espresso', love: 'a sudden crush', rage: 'a sudden grudge', truth: 'the truth coming out', sleep: 'everyone nodding off',
  paranoia: 'the feeling of being watched', rumour: 'the layoff rumour', meeting: 'the all-hands meeting', inspector: 'the inspector',
  crown: 'the new boss for the day', secretLeak: 'the leaked secret'
};

/** Which caretaking skill deals with which event. */
export const FIX_FOR: Partial<Record<ChaosId, FixSkill>> = {
  fire: 'fire', flood: 'flood', blackout: 'power', wifiDown: 'wifi', snackStorm: 'machine', lockIn: 'door', bees: 'pest', raccoon: 'pest'
};

export const DISASTERS: readonly ChaosId[] = ['fire', 'flood', 'blackout', 'quake', 'fireDrill', 'lockIn', 'wifiDown', 'snackStorm', 'ghost', 'bees', 'smite', 'ufo'];
export const TREATS: readonly ChaosId[] = ['pizza', 'puppy', 'moneyRain', 'birthday', 'espresso', 'disco'];

/** How a person feels when an event starts, given their nerve. */
export function chaosFeel(id: ChaosId, nerve: number): EmotionId {
  switch (id) {
    case 'love': return 'love';
    case 'rage': return 'angry';
    case 'sleep': return 'tired';
    case 'paranoia': return 'suspicious';
    case 'rumour': case 'inspector': return 'nervous';
    case 'truth': case 'secretLeak': return 'embarrassed';
    case 'crown': return 'smug';
    case 'timeFreeze': case 'bodySwap': case 'zeroG': return 'confused';
    default:
      if (TREATS.includes(id)) return 'excited';
      if (DISASTERS.includes(id)) return nerve < 0.45 ? 'scared' : nerve > 0.85 ? 'determined' : 'surprised';
      return 'surprised';
  }
}

export const ACT_FOR_FEEL: Partial<Record<EmotionId, readonly LineAct[]>> = {
  scared: ['cower', 'back_away', 'gasp'],
  surprised: ['gasp', 'point'],
  excited: ['cheer', 'wave'],
  happy: ['laugh', 'nod'],
  amused: ['laugh'],
  angry: ['point', 'stomp', 'shout'],
  love: ['step_closer'],
  confused: ['shrug'],
  suspicious: ['none', 'point'],
  disgusted: ['back_away', 'shake_head'],
  sad: ['cry', 'shake_head'],
  smug: ['shrug', 'none'],
  embarrassed: ['facepalm'],
  determined: ['point', 'nod'],
  nervous: ['none', 'back_away'],
  bored: ['shrug', 'none'],
  tired: ['none'],
  proud: ['cheer', 'none'],
  mischievous: ['laugh', 'whisper']
};

export const VIBE_FEEL: Record<CustomVibe, EmotionId> = {
  scary: 'scared', funny: 'amused', gross: 'disgusted', wonderful: 'excited', weird: 'confused',
  annoying: 'angry', dangerous: 'scared', romantic: 'love', sad: 'sad'
};

// ── Free-text events ────────────────────────────────────────────────────────

export interface ThingRule {
  re: RegExp;
  noun: string;
  emoji: string;
  vibe: CustomVibe;
  reaction: CustomReaction;
  look: CustomLook;
  moves: boolean;
}

const R = (re: RegExp, noun: string, emoji: string, vibe: CustomVibe, reaction: CustomReaction, look: CustomLook, moves: boolean): ThingRule =>
  ({ re, noun, emoji, vibe, reaction, look, moves });

/** First match wins. Nouns are used for titles ("Horse in the Lobby") and for {thing}. */
export const THING_RULES: readonly ThingRule[] = [
  // dangerous / scary first, so "a shark made of fire" reads as danger
  R(/\b(t-?rex|dinosaurs?)\b/i, 'dinosaur', '🦖', 'scary', 'flee', 'shake', true),
  R(/\bdragons?\b/i, 'dragon', '🐉', 'dangerous', 'flee', 'smoke', true),
  R(/\bsharks?\b/i, 'shark', '🦈', 'scary', 'flee', 'drip', true),
  R(/\bbears?\b/i, 'bear', '🐻', 'dangerous', 'flee', 'shake', true),
  R(/\b(lions?|tigers?)\b/i, 'big cat', '🦁', 'dangerous', 'flee', 'none', true),
  R(/\b(crocodiles?|alligators?)\b/i, 'crocodile', '🐊', 'dangerous', 'flee', 'drip', true),
  R(/\bsnakes?\b/i, 'snake', '🐍', 'scary', 'freeze', 'none', true),
  R(/\bspiders?\b/i, 'spider', '🕷️', 'scary', 'cower', 'none', true),
  R(/\bwolf|wolves\b/i, 'wolf', '🐺', 'scary', 'flee', 'none', true),
  R(/\bzombies?\b/i, 'zombie', '🧟', 'scary', 'flee', 'gloom', true),
  R(/\bskeletons?\b/i, 'skeleton', '💀', 'scary', 'cower', 'gloom', true),
  R(/\bclowns?\b/i, 'clown', '🤡', 'scary', 'freeze', 'confetti', true),
  R(/\bvampires?\b/i, 'vampire', '🧛', 'scary', 'cower', 'darken', true),
  R(/\bwitch(es)?\b/i, 'witch', '🧙', 'weird', 'investigate', 'sparkles', true),
  R(/\bwizards?\b/i, 'wizard', '🧙', 'wonderful', 'gather', 'sparkles', true),
  R(/\b(monsters?|yeti|bigfoot)\b/i, 'monster', '👹', 'scary', 'flee', 'shake', true),
  R(/\baliens?\b/i, 'alien', '👽', 'weird', 'investigate', 'flash', true),
  R(/\brobots?\b/i, 'robot', '🤖', 'weird', 'investigate', 'flash', true),
  R(/\bbombs?\b/i, 'bomb', '💣', 'dangerous', 'flee', 'smoke', false),
  R(/\b(lava|volcano)\b/i, 'lava', '🌋', 'dangerous', 'flee', 'smoke', false),
  R(/\b(meteor|asteroid|comet)s?\b/i, 'meteor', '☄️', 'dangerous', 'cower', 'shake', false),
  R(/\bfire\b|\bflames?\b/i, 'fire', '🔥', 'dangerous', 'flee', 'smoke', false),
  R(/\b(tornado|whirlwind)\b/i, 'tornado', '🌪️', 'dangerous', 'cower', 'shake', true),
  R(/\b(storm|thunder|lightning)\b/i, 'storm', '⛈️', 'scary', 'cower', 'flash', false),
  // animals
  R(/\b(horses?|pony|ponies)\b/i, 'horse', '🐴', 'funny', 'gather', 'none', true),
  R(/\bunicorns?\b/i, 'unicorn', '🦄', 'wonderful', 'gather', 'sparkles', true),
  R(/\b(puppy|puppies|dogs?)\b/i, 'dog', '🐶', 'wonderful', 'gather', 'hearts', true),
  R(/\b(kittens?|cats?)\b/i, 'cat', '🐱', 'wonderful', 'gather', 'hearts', true),
  R(/\bcows?\b/i, 'cow', '🐄', 'funny', 'investigate', 'none', true),
  R(/\b(pigs?|piglets?)\b/i, 'pig', '🐷', 'funny', 'laugh', 'none', true),
  R(/\bgoats?\b/i, 'goat', '🐐', 'funny', 'laugh', 'none', true),
  R(/\b(ducks?|ducklings?)\b/i, 'duck', '🦆', 'funny', 'gather', 'none', true),
  R(/\b(chickens?|hens?)\b/i, 'chicken', '🐔', 'funny', 'laugh', 'none', true),
  R(/\bpenguins?\b/i, 'penguin', '🐧', 'wonderful', 'gather', 'none', true),
  R(/\b(monkeys?|chimps?|gorillas?)\b/i, 'monkey', '🐒', 'funny', 'laugh', 'none', true),
  R(/\b(llamas?|alpacas?)\b/i, 'llama', '🦙', 'funny', 'gather', 'none', true),
  R(/\belephants?\b/i, 'elephant', '🐘', 'funny', 'investigate', 'shake', true),
  R(/\b(rats?|mice|mouse)\b/i, 'rat', '🐀', 'gross', 'flee', 'none', true),
  R(/\b(pigeons?|seagulls?|birds?)\b/i, 'bird', '🐦', 'annoying', 'investigate', 'none', true),
  R(/\bowls?\b/i, 'owl', '🦉', 'weird', 'investigate', 'none', true),
  R(/\bfrogs?\b/i, 'frog', '🐸', 'funny', 'laugh', 'none', true),
  R(/\boctopus\b/i, 'octopus', '🐙', 'weird', 'investigate', 'drip', true),
  R(/\bcrabs?\b/i, 'crab', '🦀', 'funny', 'flee', 'none', true),
  R(/\bfox(es)?\b/i, 'fox', '🦊', 'weird', 'investigate', 'none', true),
  R(/\bsquirrels?\b/i, 'squirrel', '🐿️', 'funny', 'investigate', 'none', true),
  R(/\braccoons?\b/i, 'raccoon', '🦝', 'annoying', 'investigate', 'none', true),
  R(/\bbees?\b|\bwasps?\b/i, 'bees', '🐝', 'scary', 'flee', 'none', true),
  R(/\bfish\b/i, 'fish', '🐟', 'weird', 'investigate', 'drip', true),
  // people and characters
  R(/\bpirates?\b/i, 'pirate', '🏴‍☠️', 'funny', 'gather', 'none', true),
  R(/\bninjas?\b/i, 'ninja', '🥷', 'weird', 'freeze', 'smoke', true),
  R(/\bcowboys?\b/i, 'cowboy', '🤠', 'funny', 'gather', 'none', true),
  R(/\bastronauts?\b/i, 'astronaut', '🧑‍🚀', 'wonderful', 'gather', 'sparkles', true),
  R(/\b(king|queen|royal)\b/i, 'royal visitor', '👑', 'wonderful', 'gather', 'sparkles', true),
  R(/\bmimes?\b/i, 'mime', '🎭', 'annoying', 'ignore', 'none', true),
  R(/\b(bagpipes?|trumpets?|drums?|brass band)\b/i, 'band', '🎺', 'annoying', 'dance', 'confetti', true),
  R(/\bghosts?\b/i, 'ghost', '👻', 'scary', 'cower', 'gloom', true),
  // weather and nature
  R(/\b(rainbows?)\b/i, 'rainbow', '🌈', 'wonderful', 'gather', 'sparkles', false),
  R(/\bsnow(ing|storm)?\b|\bblizzard\b/i, 'snow', '❄️', 'wonderful', 'cheer', 'sparkles', false),
  R(/\brain(ing|s)?\b|\bdrizzle\b/i, 'rain', '🌧️', 'annoying', 'argue', 'drip', false),
  R(/\bfog\b|\bmist\b/i, 'fog', '🌫️', 'weird', 'freeze', 'smoke', false),
  R(/\bsun(shine)?\b|heatwave/i, 'heatwave', '☀️', 'annoying', 'argue', 'flash', false),
  R(/\b(flowers?|roses?|bouquet)\b/i, 'flowers', '💐', 'romantic', 'gather', 'hearts', false),
  // food
  R(/\bcakes?\b/i, 'cake', '🎂', 'wonderful', 'gather', 'confetti', false),
  R(/\bpizzas?\b/i, 'pizza', '🍕', 'wonderful', 'gather', 'none', false),
  R(/\b(donuts?|doughnuts?)\b/i, 'doughnuts', '🍩', 'wonderful', 'gather', 'none', false),
  R(/\b(cookies?|biscuits?)\b/i, 'biscuits', '🍪', 'wonderful', 'gather', 'none', false),
  R(/\bice ?cream\b/i, 'ice cream', '🍦', 'wonderful', 'gather', 'none', false),
  R(/\b(tacos?|burritos?)\b/i, 'tacos', '🌮', 'wonderful', 'gather', 'none', false),
  R(/\bburgers?\b/i, 'burgers', '🍔', 'wonderful', 'gather', 'none', false),
  R(/\bcheese\b/i, 'cheese', '🧀', 'gross', 'investigate', 'stink', false),
  R(/\bbananas?\b/i, 'bananas', '🍌', 'funny', 'laugh', 'none', false),
  R(/\bchocolate\b/i, 'chocolate', '🍫', 'wonderful', 'gather', 'none', false),
  R(/\bjelly\b/i, 'jelly', '🟩', 'funny', 'laugh', 'drip', false),
  R(/\bsoup\b/i, 'soup', '🍲', 'weird', 'investigate', 'drip', false),
  // gross
  R(/\b(smell|stink|stench|fart|whiff)\b/i, 'smell', '💨', 'gross', 'flee', 'stink', false),
  R(/\bslime\b/i, 'slime', '🟢', 'gross', 'flee', 'drip', false),
  R(/\b(toilet|loo)\b/i, 'loo trouble', '🚽', 'gross', 'flee', 'stink', false),
  R(/\b(rubbish|bins?|garbage)\b/i, 'rubbish', '🗑️', 'gross', 'argue', 'stink', false),
  // wonderful things
  R(/\b(treasure|gold|diamonds?|jewels?)\b/i, 'treasure', '💎', 'wonderful', 'gather', 'sparkles', false),
  R(/\b(money|cash|banknotes?)\b/i, 'money', '💰', 'wonderful', 'gather', 'cash', false),
  R(/\bfireworks?\b/i, 'fireworks', '🎆', 'wonderful', 'cheer', 'confetti', false),
  R(/\bballoons?\b/i, 'balloons', '🎈', 'wonderful', 'cheer', 'confetti', true),
  R(/\b(music|song|singing|choir)\b/i, 'music', '🎵', 'funny', 'dance', 'confetti', false),
  R(/\bdisco|party\b/i, 'party', '🎉', 'funny', 'dance', 'confetti', false),
  // romance
  R(/\b(love letter|valentine|proposal|propose|ring)\b/i, 'love letter', '💌', 'romantic', 'gather', 'hearts', false),
  // sad / annoying
  R(/\b(violin|funeral|rain cloud)\b/i, 'sad music', '🎻', 'sad', 'freeze', 'gloom', false),
  R(/\b(alarm|siren|beeping)\b/i, 'alarm', '🚨', 'annoying', 'argue', 'flash', false),
  R(/\b(paper|printouts?|memos?)\b/i, 'paperwork', '📄', 'annoying', 'argue', 'paper', false)
];

/** Words that make an event bigger or smaller. */
export const INTENSE_RE = /\b(giant|huge|enormous|massive|hundreds|thousands|army|swarm|explod\w*|everywhere|stampede|herd|apocalyp\w*|on fire)\b/i;
export const MILD_RE = /\b(tiny|small|little|slight|a bit|faint|single|one small)\b/i;

export const EVERYWHERE_RE = /\b(everywhere|whole (office|building)|entire (office|building)|every room|all over)\b/i;

/** Barks that fit someone's lasting condition, for thoughts. */
export const STATE_BARKS: readonly [RegExp, BarkKind][] = [
  [/wet|soak|drench/i, 'wet'],
  [/tiny|shrunk|small/i, 'tiny'],
  [/giant|huge/i, 'giant'],
  [/float/i, 'floating'],
  [/cold|freez/i, 'cold'],
  [/dizzy/i, 'dizzy'],
  [/dark/i, 'dark'],
  [/sleep|tired/i, 'sleepy']
];

// ── What a typed event is, without a model ──────────────────────────────────

/** Words that mean someone who can talk. */
const CHARACTER_RE = /\b(man|woman|guy|girl|lady|gentleman|person|hero|superhero|villain|celebrity|singer|actor|actress|king|queen|prince|princess|president|prime minister|chef|pirate|ninja|cowboy|knight|doctor|nurse|policeman|policewoman|police officer|cop|firefighter|santa|elf|ghost|clown|vampire|witch|wizard|alien|robot|mime|magician|astronaut|ceo|lawyer|intern|influencer|rapper|footballer|wrestler|baby|toddler|grandma|grandpa|granny|nun|monk|sailor|soldier|spy|detective|mermaid|caveman|time traveller|superman|batman|spider-?man|wonder woman|elvis|shrek|gandalf|dracula|sherlock|darth vader|yoda)\b/i;
/** Things that happen rather than appear. */
const HAPPENING_RE = /\b(fire|flames?|lava|storm|thunder|lightning|tornado|whirlwind|rain|snow|fog|smell|stench|noise|music|silence|heatwave|cold snap|darkness|earthquake|flood)\b/i;

const POWER_RULES: readonly [RegExp, CustomPower][] = [
  [/\b(dragons?|flames?|lava|volcano|arson|on fire)\b/i, 'fire'],
  [/\b(flood(s|ed|ing)?|burst pipe|tsunami|sharks?)\b/i, 'flood'],
  [/\b(power cut|blackout|eclipse|lights go out)\b/i, 'blackout'],
  [/\b(earthquake|quake|stampede|meteor|asteroid|explosion|explodes)\b/i, 'quake'],
  [/\b(alarm|bomb|evacuat\w*|gas leak)\b/i, 'fireDrill'],
  [/\b(wi-?fi|internet|hackers?|computer virus)\b/i, 'wifiDown'],
  [/\b(dj|disco|rave|dance party)\b/i, 'disco'],
  [/\b(bees|wasps|hornets|swarm)\b/i, 'bees'],
  [/\b(pizza|donuts|doughnuts|buffet|free food|tacos|burgers)\b/i, 'pizza'],
  [/\b(money|cash|banknotes|gold coins|lottery)\b/i, 'moneyRain'],
  [/\b(sleeping gas|lullaby|hypnotis\w*|hypnotiz\w*)\b/i, 'sleep'],
  [/\b(zero gravity|anti-?gravity|everyone floats)\b/i, 'zeroG'],
  [/\b(time stops|time freezes|freezes time)\b/i, 'timeFreeze']
];

/** Looks for well-known characters; anyone else gets one from their name. */
const KNOWN_LOOKS: readonly [RegExp, GuestLookWords][] = [
  [/superman/i, { skin: 'light', hair: 'black', outfit: 'blue', trim: 'red', style: 'suit' }],
  [/batman/i, { skin: 'light', hair: 'black', outfit: 'black', trim: 'grey', style: 'suit' }],
  [/spider-?man/i, { skin: 'light', hair: 'brown', outfit: 'red', trim: 'blue', style: 'sweater' }],
  [/santa|father christmas/i, { skin: 'light', hair: 'white', outfit: 'red', trim: 'white', style: 'cardigan' }],
  [/elvis/i, { skin: 'light', hair: 'black', outfit: 'white', trim: 'gold', style: 'suit' }],
  [/shrek|ogre|zombie|alien|martian/i, { skin: 'green', hair: 'black', outfit: 'brown', trim: 'grey', style: 'shirt' }],
  [/ghost|spirit|phantom/i, { skin: 'grey', hair: 'white', outfit: 'white', trim: 'grey', style: 'shirt' }],
  [/robot|android|cyborg/i, { skin: 'grey', hair: 'silver', outfit: 'silver', trim: 'blue', style: 'suit' }],
  [/vampire|dracula/i, { skin: 'grey', hair: 'black', outfit: 'black', trim: 'red', style: 'suit' }],
  [/pirate/i, { skin: 'tan', hair: 'black', outfit: 'red', trim: 'gold', style: 'shirt' }],
  [/chef|doctor|nurse|scientist/i, { skin: 'tan', hair: 'brown', outfit: 'white', trim: 'blue', style: 'shirt' }],
  [/king|queen|prince|princess/i, { skin: 'light', hair: 'blonde', outfit: 'purple', trim: 'gold', style: 'suit' }]
];

function hashText(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function guestLookFor(text: string): GuestLookWords {
  const known = KNOWN_LOOKS.find(([re]) => re.test(text));
  if (known) return { ...known[1] };
  const h = hashText(text.toLowerCase());
  const skins = ['light', 'tan', 'brown', 'dark'] as const;
  const hairs = ['black', 'brown', 'blonde', 'grey', 'red'] as const;
  const outfits = ['red', 'blue', 'green', 'purple', 'orange', 'navy', 'pink', 'yellow', 'grey'] as const;
  const styles = ['suit', 'shirt', 'polo', 'sweater', 'cardigan', 'blouse'] as const;
  return {
    skin: skins[h % skins.length],
    hair: hairs[(h >>> 3) % hairs.length],
    outfit: outfits[(h >>> 7) % outfits.length],
    trim: outfits[(h >>> 11) % outfits.length],
    style: styles[(h >>> 15) % styles.length]
  };
}

export function powerFor(text: string): CustomPower {
  return POWER_RULES.find(([re]) => re.test(text))?.[1] ?? 'none';
}

/** Character, creature, thing or happening, and what to call it. */
export function kindFor(text: string, rule: ThingRule | null, noun: string): { kind: CustomKind; name: string } {
  const title = (s: string): string => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const character = CHARACTER_RE.exec(text);
  // A capitalised word after the first is probably a name: "a visit from Taylor Swift".
  const proper = /\s((?:[A-Z][a-z'-]+)(?:\s+[A-Z][a-z'-]+)*)/.exec(text);
  if (character || proper) {
    const name = proper ? proper[1] : character && /^(superman|batman|spider-?man|wonder woman|elvis|shrek|gandalf|dracula|sherlock|darth vader|yoda|santa)$/i.test(character[1]) ? title(character[1]) : `The ${title(character ? character[1] : noun)}`;
    return { kind: 'character', name: name.slice(0, 30) };
  }
  if (rule?.moves) return { kind: 'creature', name: `The ${title(rule.noun)}`.slice(0, 30) };
  if (HAPPENING_RE.test(text)) return { kind: 'happening', name: '' };
  return { kind: 'thing', name: '' };
}
