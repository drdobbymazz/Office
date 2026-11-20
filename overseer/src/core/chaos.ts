// The Overseer's powers: everything the player can make happen.
// This catalogue is shared by the UI (cards), the sim (event logic), the FX
// layer (visuals), the audio layer and the prompts. The behaviour of each
// event lives in core/events/; this file is only the menu.

import type { ChaosCategory, ChaosId, ChaosTargetKind, TargetRoomId } from './types';

export interface ChaosDef {
  id: ChaosId;
  /** Card title. Two words at most. */
  name: string;
  category: ChaosCategory;
  target: ChaosTargetKind;
  /** Card subtitle: one plain sentence saying what it does. */
  blurb: string;
  /** For target 'person' / 'pair': the question shown while picking. */
  askWho?: string;
  /** For target 'pair': the question for the second pick. */
  askOther?: string;
  /** For events that always happen in one place. */
  fixedRoom?: TargetRoomId;
  /** Seconds before the same card can be played again. */
  cooldown: number;
  /** Rough length in seconds (0 = instant). For the UI timer only. */
  duration: number;
  /** Does it reset the "days without incident" board? */
  incident: boolean;
  /** How much it adds to the chaos meter (0..100 scale). */
  chaos: number;
}

const D = (
  id: ChaosId, name: string, category: ChaosCategory, target: ChaosTargetKind, blurb: string,
  cooldown: number, duration: number, incident: boolean, chaos: number, extra: Partial<ChaosDef> = {}
): ChaosDef => ({ id, name, category, target, blurb, cooldown, duration, incident, chaos, ...extra });

export const CHAOS: Record<ChaosId, ChaosDef> = {
  // ── disasters ──
  fire: D('fire', 'Fire', 'disaster', 'room', 'Something in the room catches fire. People run; someone has to put it out.', 45, 40, true, 30),
  flood: D('flood', 'Burst Pipe', 'disaster', 'room', 'A pipe bursts and the room starts to fill with water.', 45, 40, true, 22),
  blackout: D('blackout', 'Blackout', 'disaster', 'none', 'The power goes out in the whole building until someone resets the breaker.', 60, 45, true, 24),
  quake: D('quake', 'Earthquake', 'disaster', 'none', 'The whole building shakes for a few seconds.', 50, 10, true, 26),
  fireDrill: D('fireDrill', 'Fire Drill', 'disaster', 'none', 'The alarm goes off and everyone has to leave the building.', 90, 50, false, 14),
  liftJam: D('liftJam', 'Stuck Lift', 'disaster', 'pair', 'Two people are called to the lift, and it gets stuck with them inside.', 60, 45, true, 14, { askWho: 'Who gets stuck?', askOther: 'Stuck with whom?' }),
  wifiDown: D('wifiDown', 'Wi-Fi Down', 'disaster', 'none', 'The internet dies. Nobody can work, so they have to talk to each other.', 60, 45, false, 12),
  printerRampage: D('printerRampage', 'Printer Rampage', 'disaster', 'none', 'The big printer goes berserk and fires paper everywhere.', 50, 25, true, 18, { fixedRoom: 'copy' }),

  // ── weird ──
  ufo: D('ufo', 'Abduction', 'weird', 'person', 'A flying saucer beams someone up, then brings them back changed.', 75, 30, true, 30, { askWho: 'Who gets taken?' }),
  ghost: D('ghost', 'Haunting', 'weird', 'room', 'A ghost drifts through the room and scares whoever is in it.', 50, 25, true, 20),
  zeroG: D('zeroG', 'Zero Gravity', 'weird', 'none', 'Gravity switches off. Everyone floats, then drops.', 70, 18, true, 28),
  timeFreeze: D('timeFreeze', 'Time Freeze', 'weird', 'none', 'Everyone freezes in place. Drag them wherever you like before time restarts.', 70, 14, false, 10),
  smite: D('smite', 'Smite', 'weird', 'person', 'A bolt of lightning hits one person. They survive, frazzled.', 20, 4, true, 16, { askWho: 'Who gets zapped?' }),
  shrink: D('shrink', 'Shrink Ray', 'weird', 'person', 'One person shrinks to the size of a stapler for a while.', 45, 60, true, 14, { askWho: 'Who shrinks?' }),
  giant: D('giant', 'Embiggen', 'weird', 'person', 'One person grows huge for a while.', 45, 60, true, 14, { askWho: 'Who grows?' }),
  bodySwap: D('bodySwap', 'Body Swap', 'weird', 'pair', 'Two people swap minds for a while. Each talks like the other.', 80, 75, true, 18, { askWho: 'Swap who?', askOther: 'With whom?' }),
  disco: D('disco', 'Disco Fever', 'weird', 'none', 'The lights drop, a mirror ball appears, and nobody can stop dancing.', 60, 25, false, 12),
  bees: D('bees', 'Bees!', 'weird', 'room', 'A swarm of bees comes in through the vent.', 45, 22, true, 20),
  raccoon: D('raccoon', 'Raccoon', 'weird', 'room', 'A raccoon gets in and goes for the food.', 50, 35, true, 16),

  // ── treats ──
  pizza: D('pizza', 'Pizza Party', 'treat', 'none', 'Free pizza arrives in the Break Room. Everyone drops what they are doing.', 75, 40, false, -6, { fixedRoom: 'kitchen' }),
  puppy: D('puppy', 'Office Puppy', 'treat', 'room', 'A puppy wanders in. Almost everyone melts.', 60, 40, false, -8),
  moneyRain: D('moneyRain', 'Bonus Rain', 'treat', 'room', 'Banknotes fall from the ceiling. People grab what they can.', 60, 20, false, 10),
  birthday: D('birthday', 'Surprise Party', 'treat', 'person', 'Balloons, confetti and a cake for one person, whether they want it or not.', 80, 35, false, 4, { askWho: 'Whose birthday is it (now)?' }),
  espresso: D('espresso', 'Triple Espresso', 'treat', 'person', 'One person gets far too much caffeine and moves at double speed.', 35, 50, false, 8, { askWho: 'Who gets the espresso?' }),

  // ── mind games ──
  love: D('love', "Cupid's Arrow", 'mind', 'pair', 'One person falls hard for another, for a while.', 60, 90, false, 8, { askWho: 'Who falls in love?', askOther: 'With whom?' }),
  rage: D('rage', 'Grudge', 'mind', 'pair', 'One person becomes furious with another and goes to have it out.', 60, 60, false, 14, { askWho: 'Who gets angry?', askOther: 'At whom?' }),
  truth: D('truth', 'Truth Serum', 'mind', 'person', 'One person cannot lie or keep a secret for a while.', 60, 70, false, 10, { askWho: 'Who tells the truth?' }),
  sleep: D('sleep', 'Nap Attack', 'mind', 'room', 'Everyone in the room falls asleep where they stand.', 50, 25, false, 6),
  paranoia: D('paranoia', 'Paranoia', 'mind', 'person', 'One person becomes sure they are being watched. (They are.)', 50, 70, false, 10, { askWho: 'Who gets paranoid?' }),
  rumour: D('rumour', 'Layoff Rumour', 'mind', 'none', 'A rumour spreads that someone is getting sacked today.', 90, 60, false, 16),
  meeting: D('meeting', 'All-Hands', 'mind', 'none', 'Everyone is called to the Meeting Room, right now.', 90, 50, false, 6, { fixedRoom: 'meeting' }),
  inspector: D('inspector', 'Inspection', 'mind', 'none', 'An inspector from Head Office walks in unannounced.', 120, 70, false, 16),
  crown: D('crown', 'Boss for a Day', 'mind', 'person', 'One person is put in charge. Everyone else has to live with it.', 120, 120, false, 12, { askWho: 'Who is the boss now?' }),
  secretLeak: D('secretLeak', 'Leak a Secret', 'mind', 'person', "One person's secret is emailed to the whole office.", 90, 30, false, 16, { askWho: 'Whose secret gets out?' })
};

export const CHAOS_LIST: readonly ChaosDef[] = Object.values(CHAOS);

export const CHAOS_CATEGORIES: readonly { id: ChaosCategory; name: string; color: number }[] = [
  { id: 'disaster', name: 'Disasters', color: 0xe0483e },
  { id: 'weird', name: 'Weird', color: 0x8b5cf6 },
  { id: 'treat', name: 'Treats', color: 0x2fb170 },
  { id: 'mind', name: 'Mind Games', color: 0x2f8fe0 }
];
