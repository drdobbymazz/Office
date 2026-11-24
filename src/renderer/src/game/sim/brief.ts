// Plain-words views of the sim for the language model's prompts: person
// briefs, true facts, recent lines.

import type { CharId, EmotionId, StatusEffect } from '@/game/core/types';
import { formatClock, isCastId } from '@/game/core/types';
import { CAST, VISITORS } from '@/game/core/cast';
import { VISITOR_VOICES } from '@/game/core/content/voices/visitors';
import type { PersonBrief } from '@/game/brain/api';
import type { Person } from './people';
import type { SimCore } from './core';

export function statusWords(core: SimCore, s: StatusEffect): string | null {
  const t = s.target ? core.nameOf(s.target) : 'someone';
  switch (s.kind) {
    case 'wet': return 'soaking wet';
    case 'sooty': return 'covered in soot';
    case 'frizzy': return 'hair standing on end from a lightning strike';
    case 'tiny': return 'shrunk to the size of a stapler';
    case 'giant': return 'grown to the size of a giant, head brushing the ceiling';
    case 'love': return `hopelessly in love with ${t}`;
    case 'rage': return `furious with ${t}`;
    case 'truth': return 'unable to tell a lie or keep a secret';
    case 'paranoid': return 'sure that someone is watching them';
    case 'caffeinated': return 'wired on far too much espresso';
    case 'sleepy': return 'very sleepy';
    case 'asleep': return 'fast asleep';
    case 'swapped': return `has swapped minds with ${t}`;
    case 'crowned': return 'in charge of the office for the day';
    case 'party': return 'the guest of honour at a surprise party';
    case 'rich': return 'clutching a fistful of bonus cash';
    case 'spooked': return 'shaken after seeing a ghost';
    case 'abducted': return 'just back from a ride in a flying saucer';
    case 'stung': return 'stung by a bee and swelling up';
    case 'dizzy': return 'dizzy';
    case 'frozen': return 'frozen in time';
    case 'knockedOut': return 'knocked out cold on the floor';
    case 'eliminated': return `eliminated by ${t}`;
    case 'guilty': return `just took out ${t} and everyone saw`;
    case 'quit': return 'stormed out and quit for the day';
    case 'naked': return 'completely naked in the office, shamelessly flashing everyone with zero clothes on';
    case 'flustered': return 'blushing, breathless, and visibly worked up after a shamelessly steamy moment';
    case 'aroused': return 'visibly hot and bothered, eyeing coworkers with shameless sexual tension and lowered inhibitions';
    case 'afterglow': return 'messy-haired, shirt rumpled, and glowing straight out of a steamy office hookup';
    case 'scandal': return 'at the center of explicit office sex-and-exposure gossip (any earlier stripping or hookup already ended - react to the juicy scandal in past tense)';
    default: return null;
  }
}

/** Their visible feeling, from emotion plus mood. */
export function moodWord(p: Person): EmotionId {
  return p.emotion;
}

export function goalOf(core: SimCore, p: Person): string {
  if (p.plan) {
    const t = p.plan.target ? core.nameOf(String(p.plan.target)) : '';
    const about = p.plan.about ? ` about ${p.plan.about}` : '';
    switch (p.plan.kind) {
      case 'talk': return `wants to talk to ${t}${about}`;
      case 'confront': return `wants to confront ${t}${about}`;
      case 'flirt': return `wants to flirt with ${t}`;
      case 'gossip': return `wants to tell ${t} some gossip${about}`;
      case 'prank': return `wants to prank ${t}`;
      case 'comfort': return `wants to cheer ${t} up`;
      case 'snoop': return `wants to go through ${t}'s desk`;
      case 'work': return `wants to get back to work${about ? ` (${p.plan.about!.trim()})` : ''}`;
      case 'coffee': return 'wants a coffee';
      case 'snack': return 'wants a snack';
      case 'break': return 'wants a break somewhere quiet';
      case 'nap': return 'wants a nap';
      case 'hide': return 'wants to hide';
      case 'wander': return p.plan.about ? `is wandering about, ${p.plan.about.trim()}` : 'wants to wander about';
      case 'fix': return `wants to deal with ${p.plan.about?.trim() || 'the problem'}`;
      case 'flee': return `wants to get away${p.plan.about?.trim() ? ` from ${p.plan.about.trim()}` : ''}`;
      default: return `wants to ${p.plan.kind}${about}`;
    }
  }
  return p.doing || 'getting on with the day';
}

export function briefFor(core: SimCore, who: CharId, others: readonly CharId[]): PersonBrief {
  const p = core.byId(who);
  const name = p ? p.name : core.nameOf(who);
  const state: string[] = [];
  let mindOf: CharId | undefined;
  if (p) {
    for (const s of p.statuses) {
      const w = statusWords(core, s);
      if (w) state.push(w);
      if (s.kind === 'swapped' && s.target) mindOf = s.target;
    }
    if (p.held) state.push('being held up in the air by an invisible hand');
    if (p.energy < 0.25) state.push('exhausted');
    if (p.stress > 0.75) state.push('very stressed');
  }
  const feelings = others
    .filter((o) => o !== who)
    .map((o) => {
      const love = p?.statuses.find((s) => s.kind === 'love' && s.target === o);
      const rage = p?.statuses.find((s) => s.kind === 'rage' && s.target === o);
      const b = core.bondsTable.get(who, o);
      const oName = core.nameOf(o);
      let text = love ? `is hopelessly in love with ${oName}` : rage ? `is furious with ${oName}` : `${core.bondsTable.label(who, o)} ${oName}`;
      if (b.note && !love) text += ` (${b.note})`;
      const chem = core.chemistry(who, o);
      const chemLabel = core.chemistryBook.label(who, o);
      if (core.isFling(who, o)) text += `; currently having a secret office fling with ${oName} (chemistry ${chem}/100)`;
      else if (chemLabel && !love) text += `; ${chemLabel} ${oName} (chemistry ${chem}/100)`;
      return { about: o, text };
    });
  const memories = core.memory.relevant(who, others, core.day, core.clock, 3);
  const brief: PersonBrief = {
    id: who,
    name,
    mood: p ? p.emotion : 'neutral',
    state,
    goal: p ? goalOf(core, p) : '',
    feelings,
    memories
  };
  if (isCastId(who) && p && (p.has('truth') || core.secretOut(who))) brief.secret = CAST[who].persona.secret;
  if (mindOf) brief.mindOf = mindOf;
  if (p?.conviction) brief.conviction = { text: p.conviction.text, since: formatClock(p.conviction.since) };
  const visitor = !isCastId(who) ? VISITORS[who] : undefined;
  if (visitor?.summary) {
    const extra = [visitor.wants ? `Wants ${visitor.wants}.` : '', visitor.fears ? `Cannot stand ${visitor.fears}.` : '', visitor.quirk ? `${visitor.quirk.replace(/^./, (c) => c.toUpperCase())}.` : ''];
    // How they talk, so the model gives a visitor who matters to the story a voice of their own.
    const voice = VISITOR_VOICES[who];
    if (voice) extra.push(`Talks: ${voice.speech}`, voice.examples.length ? `Says things like "${voice.examples[0]}"` : '');
    brief.about = [visitor.summary, ...extra].filter(Boolean).join(' ');
  }
  if (p?.hiddenNote) brief.hidden = p.hiddenNote;
  return brief;
}

export function factsOf(core: SimCore): string[] {
  const out: string[] = [`It is ${core.weekday}, ${formatClock(core.clock)}.`];
  // Newest first: whoever reads only the top of the list should see what has just happened.
  out.push(...[...core.factMap.values()].reverse());
  for (const p of core.list) {
    if (!p.onFloor) continue;
    for (const s of p.statuses) {
      if (s.kind === 'dizzy' || s.kind === 'sleepy') continue;
      const w = statusWords(core, s);
      if (w) out.push(`${p.name} is ${w}.`);
    }
  }
  for (const id of core.revealedList()) out.push(`Everyone now knows ${CAST[id].name}'s secret: ${CAST[id].persona.secret}.`);
  if (core.list.some((p) => p.onFloor && p.has('party'))) {
    out.push('There is a lively party atmosphere in the office right now.');
  }
  return out.slice(0, 24);
}
