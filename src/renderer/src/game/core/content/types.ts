// Shapes of the hand-written text the game ships with.
// Written text is used (a) for instant reflex lines while the model is still
// thinking, (b) as the whole "instinct" brain when no model is reachable, and
// (c) for UI suggestions and event narration.
//
// WRITING RULES (the player asked for this):
// - Plain words. Say who did what and what changed.
// - Wit is welcome as a touch, never in place of the fact.
// - Every line must sound like the person saying it (see core/cast.ts).
// - British English. No emojis. Spoken lines are 18 words at most.
// - Workplace comedy for a general audience: slapstick is fine; nothing sexual,
//   hateful or gory.

import type { CastId, ChaosId } from '@/game/core/types';
import type { BarkKind, CustomVibe } from '@/game/brain/api';

/** Everything one person can say without the model. */
export interface VoiceBank {
  /** Instant exclamations by situation. At least 3 each. */
  barks: Record<BarkKind, string[]>;
  /** First reaction when an event starts (as it affects THEM). At least 2 each. */
  chaos: Record<ChaosId, string[]>;
  /** Private thoughts when alone and nothing is happening. At least 8. */
  idle: string[];
  /** Ways they start a conversation. "{other}" is replaced by the other person's first name. At least 8. */
  openers: string[];
  /** Replies, by how they feel about the person they are answering. At least 6 each. */
  replies: { warm: string[]; cold: string[]; neutral: string[] };
  /** Reaction to a thought that appeared in their head. "{thought}" is the thought. At least 4. */
  whispered: string[];
  /** Reaction to a loudspeaker announcement. At least 4. */
  announced: string[];
  /** Reaction to a free-text event, by its vibe. "{thing}" is its short title. At least 2 each. */
  custom: Record<CustomVibe, string[]>;
}

export type InstinctBank = Record<CastId, VoiceBank>;

/**
 * Plain narration for each event. Placeholders: {room} (e.g. "the Break Room"),
 * {who}, {other} (first names).
 */
export interface ChaosText {
  /** Feed line when it starts: "Fire breaks out in {room}." */
  start: string;
  /** Feed line when it ends: "The fire in {room} is out." */
  end: string;
  /** A true statement while it lasts, for prompts: "{room} is on fire." */
  fact: string;
  /** What set off the scene people have about it afterwards: "The fire in {room} has just been put out." */
  aftermath: string;
  /** Short memory each witness keeps: "There was a fire in {room}." */
  memory: string;
}

/** Tappable suggestions in the Overseer's text boxes. */
export interface Suggestions {
  /** Thoughts to whisper. "{name}" = the chosen person, "{other}" = some other staff member. At least 24. */
  whispers: string[];
  /** Loudspeaker announcements. At least 16. */
  announcements: string[];
  /** Free-text events. At least 20. */
  customEvents: string[];
  /** Direct instructions to one person. "{other}" = some other staff member. At least 16. */
  cues: string[];
}

/** Short hints shown on the title screen and while paused. At least 12. */
export type Tips = string[];
