// Homeostatic needs: what a person wants right now, separate from mood.
//
// Values are deficits: 0 = satisfied, 1 = urgent. They drift up on their own,
// are relieved by doing things, and feed the routine's utility weights, the
// language-model brief, the inspector, and the romance impulses.

import type { Person } from './people';
import type { Job } from './jobs';

export interface Needs {
  /** Company, conversation, being noticed. */
  social: number;
  /** Novelty, gossip, mischief, something happening. */
  stimulation: number;
  /** Food and coffee. */
  hunger: number;
  /** Washing up / feeling presentable. */
  hygiene: number;
  /** Quiet, a break, getting away from the noise. */
  calm: number;
  /** Getting actual work done. */
  focus: number;
  /** Intimacy, flirting, being wanted. */
  desire: number;
}

export type NeedKey = keyof Needs;

export const NEED_KEYS: readonly NeedKey[] = ['social', 'stimulation', 'hunger', 'hygiene', 'calm', 'focus', 'desire'];

const LABEL: Record<NeedKey, string> = {
  social: 'company',
  stimulation: 'something interesting',
  hunger: 'food',
  hygiene: 'a wash',
  calm: 'a quiet minute',
  focus: 'to get work done',
  desire: 'intimacy'
};

/** Short bar label for the inspector. */
export const NEED_NAME: Record<NeedKey, string> = {
  social: 'Company',
  stimulation: 'Stimulation',
  hunger: 'Food',
  hygiene: 'Hygiene',
  calm: 'Calm',
  focus: 'Focus',
  desire: 'Intimacy'
};

export function newNeeds(seed = 0): Needs {
  const j = (n: number): number => Math.max(0, Math.min(0.35, seed + n));
  return { social: j(0.22), stimulation: j(0.2), hunger: j(0.16), hygiene: j(0.1), calm: j(0.12), focus: j(0.18), desire: j(0.12) };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function relieve(p: Person, key: NeedKey, amount: number): void {
  p.needs[key] = clamp01(p.needs[key] - amount);
}

/** Drift needs upward. Stress feeds the need for calm; chemistry feeds desire. */
export function tickNeeds(p: Person, dt: number): void {
  const n = p.needs;
  const soc = p.def ? p.def.temperament.sociability : 0.5;
  const mis = p.def ? p.def.temperament.mischief : 0.5;
  n.social = clamp01(n.social + dt * (0.0016 + soc * 0.0018));
  n.stimulation = clamp01(n.stimulation + dt * (0.0012 + mis * 0.0018));
  n.hunger = clamp01(n.hunger + dt * 0.0026);
  n.hygiene = clamp01(n.hygiene + dt * 0.0011);
  n.calm = clamp01(n.calm + dt * (0.0012 + p.stress * 0.0055));
  n.focus = clamp01(n.focus + dt * 0.002);
  n.desire = clamp01(n.desire + dt * (0.0009 + (p.has('aroused') ? 0.0045 : 0)));

  // Being wired or exhausted changes what they want.
  if (p.has('caffeinated')) { n.calm = clamp01(n.calm + dt * 0.002); n.stimulation = clamp01(n.stimulation + dt * 0.002); }
  if (p.has('sleepy') || p.has('asleep')) { n.calm = clamp01(n.calm + dt * 0.004); n.social = clamp01(n.social - dt * 0.001); }
  if (p.has('afterglow')) n.desire = clamp01(n.desire - dt * 0.006);
  if (p.has('flustered')) n.desire = clamp01(n.desire + dt * 0.003);
  if (p.has('bound') || p.has('dominated')) { n.desire = clamp01(n.desire + dt * 0.003); n.social = clamp01(n.social + dt * 0.002); }
  if (p.has('scandal')) n.social = clamp01(n.social - dt * 0.0015);
  if (p.notoriety > 0.4) n.calm = clamp01(n.calm + dt * p.notoriety * 0.004);
}

/** The most urgent need, or null when nothing is pressing. */
export function topNeed(p: Person, threshold = 0.72): NeedKey | null {
  let best: NeedKey | null = null;
  let bestV = threshold;
  for (const k of NEED_KEYS) {
    const v = p.needs[k];
    if (v > bestV) { bestV = v; best = k; }
  }
  return best;
}

/** Human-readable need, for prompts and the inspector. */
export function needLabel(p: Person, key: NeedKey): string {
  const v = p.needs[key];
  if (v < 0.35) return '';
  if (key === 'hunger') return v > 0.82 ? 'starving' : 'peckish';
  if (key === 'social') return v > 0.82 ? 'desperate for company' : 'wants company';
  if (key === 'stimulation') return v > 0.82 ? 'desperate for something to happen' : 'restless';
  if (key === 'hygiene') return v > 0.82 ? 'feeling gross' : 'wants to freshen up';
  if (key === 'calm') return v > 0.82 ? 'frazzled and desperate for quiet' : 'wants a quiet minute';
  if (key === 'focus') return v > 0.82 ? 'itching to get work done' : 'trying to focus';
  if (key === 'desire') return v > 0.82 ? 'aching for intimacy' : 'feeling flirty';
  return `needs ${LABEL[key]}`;
}

/** Up to two plain need sentences for the model brief. */
export function needWords(p: Person): string[] {
  const out: string[] = [];
  const ranked = [...NEED_KEYS].sort((a, b) => p.needs[b] - p.needs[a]);
  for (const k of ranked) {
    if (p.needs[k] < 0.55) break;
    const w = needLabel(p, k);
    if (w) out.push(w);
    if (out.length >= 2) break;
  }
  return out;
}

/** Does this job's destination/act plausibly address the need? */
export function jobAddresses(job: Job, key: NeedKey): boolean {
  const id = job.want.kind === 'anchor' ? job.want.id : '';
  const doing = `${job.act?.doing ?? ''} ${job.doing ?? ''}`.toLowerCase();
  const anim = job.act?.anim;
  switch (key) {
    case 'hunger': return anim === 'eat' || anim === 'drink' || /fridge|vending|coffee|snack|food|lunch|eat|drink/.test(`${id} ${doing}`);
    case 'social': return job.want.kind === 'near' || job.kind === 'gather' || /talk|chat|visit|hanging|see |cafe|near/.test(doing);
    case 'stimulation': return job.want.kind === 'room' || /wander|look around|stroll|party|dance/.test(doing);
    case 'hygiene': return /cooler|wash|freshen|sink/.test(`${id} ${doing}`);
    case 'calm': return /break|quiet|hide|keeping clear|cower|rest/.test(doing);
    case 'focus': return anim === 'type' || anim === 'operate' || /work|desk|paper|typing|report/.test(doing);
    case 'desire': return job.want.kind === 'near' && /flirt|gaze|love|hover|see /.test(doing);
  }
}

/** Relief applied when a job finishes (called from jobs.ts). */
export function relieveForJob(p: Person, job: Job): void {
  const id = job.want.kind === 'anchor' ? job.want.id : '';
  const doing = `${job.act?.doing ?? ''} ${job.doing ?? ''}`.toLowerCase();
  const anim = job.act?.anim;
  if (anim === 'eat' || /snack|lunch|eat/.test(doing) || /fridge|vending/.test(id)) relieve(p, 'hunger', 0.55);
  if (anim === 'drink' || /coffee|water|cooler/.test(id)) { relieve(p, 'hunger', 0.22); relieve(p, 'hygiene', 0.08); }
  if (/break|quiet|hide|keeping clear|rest/.test(doing)) relieve(p, 'calm', 0.45);
  if (/wander|look around|stroll/.test(doing)) relieve(p, 'stimulation', 0.38);
  if (job.want.kind === 'near' || job.kind === 'gather' || /talk|chat|visit|hanging/.test(doing)) relieve(p, 'social', 0.42);
  if (job.want.kind === 'near' && /flirt|gaze|love/.test(doing)) { relieve(p, 'desire', 0.35); relieve(p, 'social', 0.15); }
  if (anim === 'type' || anim === 'operate') relieve(p, 'focus', 0.32);
  if (anim === 'sleep') { relieve(p, 'calm', 0.25); relieve(p, 'focus', 0.1); }
  if (/freshen|wash|sink/.test(doing)) relieve(p, 'hygiene', 0.65);
}
