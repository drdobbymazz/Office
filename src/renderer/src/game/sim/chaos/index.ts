// Every Overseer power's script, in catalogue order. createSim registers the
// three reference scripts itself; register this list to get all 34.

import type { ChaosScript } from '@/game/core/simApi';
import { fireScript } from './fire';
import { floodScript } from './flood';
import { blackoutScript } from './blackout';
import { quakeScript } from './quake';
import { fireDrillScript } from './fireDrill';
import { lockInScript } from './lockIn';
import { wifiDownScript } from './wifiDown';
import { snackStormScript } from './snackStorm';
import { ufoScript } from './ufo';
import { ghostScript } from './ghost';
import { zeroGScript } from './zeroG';
import { timeFreezeScript } from './timeFreeze';
import { smiteScript } from './smite';
import { shrinkScript } from './shrink';
import { giantScript } from './giant';
import { bodySwapScript } from './bodySwap';
import { discoScript } from './disco';
import { beesScript } from './bees';
import { raccoonScript } from './raccoon';
import { pizzaScript } from './pizza';
import { puppyScript } from './puppy';
import { moneyRainScript } from './moneyRain';
import { birthdayScript } from './birthday';
import { espressoScript } from './espresso';
import { loveScript } from './love';
import { rageScript } from './rage';
import { truthScript } from './truth';
import { sleepScript } from './sleep';
import { paranoiaScript } from './paranoia';
import { rumourScript } from './rumour';
import { meetingScript } from './meeting';
import { inspectorScript } from './inspector';
import { crownScript } from './crown';
import { secretLeakScript } from './secretLeak';

export const CHAOS_SCRIPTS: ChaosScript[] = [
  fireScript, floodScript, blackoutScript, quakeScript, fireDrillScript, lockInScript, wifiDownScript, snackStormScript,
  ufoScript, ghostScript, zeroGScript, timeFreezeScript, smiteScript, shrinkScript, giantScript, bodySwapScript, discoScript, beesScript, raccoonScript,
  pizzaScript, puppyScript, moneyRainScript, birthdayScript, espressoScript,
  loveScript, rageScript, truthScript, sleepScript, paranoiaScript, rumourScript, meetingScript, inspectorScript, crownScript, secretLeakScript
];
