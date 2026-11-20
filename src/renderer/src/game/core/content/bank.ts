// Every person's hand-written voice, keyed by id. Used for instant reflex
// lines and as the whole brain when no model is reachable.
import type { InstinctBank } from './types';
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

export const BANK: InstinctBank = {
  michael, jim, pam, dwight, kevin, angela, oscar, stanley,
  phyllis, andy, kelly, ryan, toby, creed, meredith
};
