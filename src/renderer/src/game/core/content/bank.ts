// Every person's hand-written voice, keyed by id. Used for instant reflex
// lines and as the whole brain when no model is reachable.
import type { InstinctBank, LooseVoiceBank } from './types';
import { michael } from './voices/michael';
import { jim } from './voices/jim';
import { pam } from './voices/pam';
import { dwight } from './voices/dwight';
import { kevin } from './voices/kevin';
import { angela } from './voices/angela';
import { oscar } from './voices/oscar';
import { stanley } from './voices/stanley';
import { phyllis } from './voices/phyllis';
import { andy } from './voices/andy';
import { kelly } from './voices/kelly';
import { ryan } from './voices/ryan';
import { toby } from './voices/toby';
import { creed } from './voices/creed';
import { meredith } from './voices/meredith';
import { VISITOR_VOICES } from './voices/visitors';

/** The fifteen staff. */
export const BANK: InstinctBank = {
  michael, jim, pam, dwight, kevin, angela, oscar, stanley,
  phyllis, andy, kelly, ryan, toby, creed, meredith
};

/** The staff plus the visitors who matter to the story (Mr Figgis, the inspector): what the game hands the brain. */
export const VOICES: InstinctBank & Record<string, LooseVoiceBank> = {
  ...BANK,
  ...Object.fromEntries(Object.entries(VISITOR_VOICES).map(([id, v]) => [id, v.bank]))
};
