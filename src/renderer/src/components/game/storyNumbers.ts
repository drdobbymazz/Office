// The story's thresholds, read from the story rules so the screens never disagree with them.
//
// The rules are being reworked on another branch at the same time (the endings move to 75 and 45,
// with a sentence for the screens). Until that lands, the rules only have the old numbers inline,
// so this reads the new names when they exist and falls back to the old ones. After the merge it
// simply follows the rules.

import * as rules from '@/game/story/rules';
import * as text from '@/game/story/text';

const R = rules as unknown as { ENDING?: { saved: number; closedBelow: number } };
const T = text as unknown as { ENDING_RULE?: string };

/** The branch stays open at this standing or more (with Friday won, under the new rules). */
export const SAVED_AT: number = R.ENDING?.saved ?? 65;
/** The branch closes under this standing. */
export const CLOSED_BELOW: number = R.ENDING?.closedBelow ?? 40;

/** How the week ends, in one plain sentence. */
export const ENDING_RULE_TEXT: string = T.ENDING_RULE
  ?? `After Friday: ${SAVED_AT} or more keeps the branch open. Under ${CLOSED_BELOW} closes it.`;
