// Explicit R-rated workplace comedy dialogue and summaries for InstinctBrain
// when scenes involve hookups, walk-ins, streaking, bold physical flirting,
// love-triangle jealousy, or HR Love Contract fallout. Strict ASCII prose only.

import type { DelegateTone, SceneLine, SceneRequest } from './api';
import type { CharId, EmotionId, LineAct } from '@/game/core/types';

export type SpicyTopic =
  | 'caught'
  | 'hr_contract'
  | 'rendezvous'
  | 'expose'
  | 'jealousy'
  | 'bold'
  | 'flirt'
  | 'ambient_spicy';

interface LineSpec {
  say: string;
  feel: EmotionId;
  act: LineAct;
}

const pickOne = <T,>(arr: readonly T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)] ?? arr[0];

const fillPlace = (s: string, p: { actor?: string; partner?: string; walker?: string; place?: string }): string =>
  s
    .replace(/\{actor\}/g, p.actor ?? 'someone')
    .replace(/\{partner\}/g, p.partner ?? 'them')
    .replace(/\{walker\}/g, p.walker ?? 'someone')
    .replace(/\{place\}/g, p.place ?? 'the office');

export function detectSpicyTopic(req: SceneRequest): SpicyTopic | null {
  const why = req.why.toLowerCase();
  const facts = req.facts.join(' ').toLowerCase();
  const states = req.people.map((p) => p.state.join(' ').toLowerCase()).join(' ');
  const combined = `${why} ${facts} ${states}`;

  if (why.includes('half-undressed') || why.includes('caught') || (why.includes('in the act') && req.trigger === 'aftermath')) {
    return 'caught';
  }
  if (why.includes('relationship disclosure form') || why.includes('love contract')) {
    return 'hr_contract';
  }
  if (why.includes('secret hookup') || why.includes('secret romantic rendezvous') || why.includes('stumble out') || why.includes('afterglow')) {
    return 'rendezvous';
  }
  if (why.includes('did not ask anyone else to strip') || why.includes('exposed themselves') || why.includes('stripped completely naked') || why.includes('completely naked')) {
    return 'expose';
  }
  if (why.includes('jealous') || why.includes('glares jealously')) {
    return 'jealousy';
  }
  if (
    req.trigger === 'aftermath' &&
    /\b(seduces?|kisses?|kissing|makes? out|massag|lap dance|spanks?|gropes?|straddles?|cuddles?|slow danc|hands-on|shamelessly, physically)\b/i.test(why)
  ) {
    return 'bold';
  }
  if (
    req.trigger === 'aftermath' &&
    /\b(flirt|flirted|winks?|winked|sweet talk|compliment)\b/i.test(why)
  ) {
    return 'flirt';
  }
  if (
    /\b(hot and bothered|pent-up sexual tension|messy hair and rumpled|explicit office sex|secret office hookups|blushing and breathless|steamy moment)\b/i.test(combined)
  ) {
    return 'ambient_spicy';
  }
  return null;
}

const CAUGHT_WALKER: Partial<Record<CharId, LineSpec[]>> = {
  angela: [
    { say: 'Good Lord! Button your clothes right now, this is an office, not a cheap motel!', feel: 'disgusted', act: 'point' },
    { say: 'I am literally shaking - put your pants back on before I call corporate!', feel: 'disgusted', act: 'facepalm' }
  ],
  toby: [
    { say: 'Oh god... please put your shirts back on. HR does not have a form big enough for this.', feel: 'nervous', act: 'facepalm' },
    { say: 'Hey guys, seriously, clothes on. The drywall in here is paper thin.', feel: 'embarrassed', act: 'back_away' }
  ],
  michael: [
    { say: 'Whoa! Hey! No clothes? In my conference room? At least lock the door next time, amateurs!', feel: 'surprised', act: 'gasp' },
    { say: 'Oh yeah, boom, busted! Wait - was this happening on company time without inviting me?', feel: 'amused', act: 'point' }
  ],
  kelly: [
    { say: 'OH MY GOD, you two were totally hooking up in here! Tell me EVERY dirty detail right now!', feel: 'excited', act: 'gasp' },
    { say: 'Wait, stop, your shirts are inside out! Oh my god this is better than reality TV!', feel: 'excited', act: 'laugh' }
  ],
  meredith: [
    { say: 'Hey, dont stop on my account - wait, do you guys need a lookout or a third?', feel: 'amused', act: 'laugh' },
    { say: 'Nice! Finally somebody around here knows how to blow off some steam on the clock.', feel: 'happy', act: 'cheer' }
  ],
  creed: [
    { say: 'Cool, cool. Keep going, I forgot my glasses in the nineties anyway.', feel: 'amused', act: 'shrug' },
    { say: 'Nice hustle, kids. I had two bucks on you getting caught before lunch.', feel: 'smug', act: 'nod' }
  ],
  dwight: [
    { say: 'Halt! Cover yourselves immediately! Unsanctioned coitus on company property is a Class-A violation!', feel: 'angry', act: 'point' }
  ],
  jim: [
    { say: 'Oof. Yeah, I am just going to back slowly out of here and pretend my retinas did not see that.', feel: 'amused', act: 'back_away' }
  ]
};

const CAUGHT_BUSTED: Partial<Record<CharId, LineSpec[]>> = {
  pam: [
    { say: 'Oh my god, knock first! Give me two seconds to fix my top!', feel: 'embarrassed', act: 'gasp' },
    { say: 'We were just... okay fine, just turn around for five seconds while I zip up!', feel: 'embarrassed', act: 'facepalm' }
  ],
  jim: [
    { say: 'Hey! Ever heard of knocking? We are... doing a very hands-on inventory check.', feel: 'embarrassed', act: 'shrug' },
    { say: 'Alright, yep, busting in without knocking is kind of on you at this point.', feel: 'amused', act: 'laugh' }
  ],
  angela: [
    { say: 'Shut that door right now! You saw nothing! If you tell a single soul I will ruin you!', feel: 'angry', act: 'point' },
    { say: 'We were... inspecting the filing system! Close the damn door!', feel: 'embarrassed', act: 'stomp' }
  ],
  dwight: [
    { say: 'Turn around! Do not look at my bare torso! This is private reproductive business!', feel: 'angry', act: 'point' },
    { say: 'Leave! Now! What happens behind closed doors during break is between two consenting coworkers!', feel: 'determined', act: 'stomp' }
  ],
  meredith: [
    { say: 'Oh relax, you act like you have never seen two coworkers fooling around half-naked before.', feel: 'smug', act: 'laugh' }
  ],
  ryan: [
    { say: 'Bro, seriously? Knock! Take a picture, it will last longer - actually do NOT take a picture.', feel: 'embarrassed', act: 'facepalm' }
  ],
  kelly: [
    { say: 'Shut the door! You totally ruined the mood right when things were getting good!', feel: 'angry', act: 'stomp' }
  ]
};

const EXPOSE_ACTOR: Partial<Record<CharId, LineSpec[]>> = {
  meredith: [
    { say: 'Boom! Casual Friday just got real, baby! Look all you want, its free!', feel: 'excited', act: 'cheer' },
    { say: 'What? Its hot in here and my bra was pinching. Deal with it!', feel: 'mischievous', act: 'laugh' }
  ],
  creed: [
    { say: 'Feels good to let the breeze hit the undercarriage. Just like Woodstock.', feel: 'happy', act: 'shrug' }
  ],
  michael: [
    { say: 'Behold, the male form in its peak regional-manager glory! Are you not entertained?!', feel: 'proud', act: 'cheer' }
  ],
  kelly: [
    { say: 'Look at this body! Tell me honestly, do I look hot right now? Everyone look!', feel: 'excited', act: 'cheer' }
  ],
  angela: [
    { say: 'Stop staring at me! Look away this instant! I cannot believe I just took everything off!', feel: 'embarrassed', act: 'back_away' }
  ],
  dwight: [
    { say: 'Witness peak beet-fed musculature! This is zero-percent body fat confidence right here!', feel: 'proud', act: 'cheer' }
  ]
};

const EXPOSE_WITNESS: Partial<Record<CharId, LineSpec[]>> = {
  angela: [
    { say: 'Cover your filthy body right now! My eyes are burning!', feel: 'disgusted', act: 'facepalm' },
    { say: 'Put your damn clothes on! This is an accounting office, not a strip club!', feel: 'angry', act: 'point' }
  ],
  toby: [
    { say: 'Please... somebody hand them a coat. Any coat. HR cannot survive another lawsuit.', feel: 'nervous', act: 'facepalm' }
  ],
  meredith: [
    { say: 'Hell yeah! Work it! Somebody grab the dollar bills out of petty cash!', feel: 'excited', act: 'laugh' }
  ],
  kevin: [
    { say: 'Whoa. Niiice. Wait - am I allowed to look or do I get fired if I look?', feel: 'amused', act: 'gasp' }
  ],
  oscar: [
    { say: 'I did not sign up to see my coworker stark naked over morning spreadsheets.', feel: 'disgusted', act: 'shake_head' }
  ],
  stanley: [
    { say: 'I am too old to be looking at bare ass in {place} before five o clock.', feel: 'disgusted', act: 'facepalm' }
  ],
  jim: [
    { say: 'Yep. That is definitely an eyeful I am going to be paying a therapist to erase.', feel: 'surprised', act: 'facepalm' }
  ],
  kelly: [
    { say: 'Oh my god, they actually stripped all the way down! Wait, are you chilly or just showing off?', feel: 'excited', act: 'gasp' }
  ],
  michael: [
    { say: 'Oh my god, nobody look! Actually wait - why is everybody kinda looking?', feel: 'surprised', act: 'gasp' }
  ]
};

const RENDEZVOUS_LINES: Partial<Record<CharId, LineSpec[]>> = {
  jim: [
    { say: 'Okay, straighten your shirt - my hair definitely looks like we were just fooling around.', feel: 'amused', act: 'laugh' },
    { say: 'Worth it. Even if everybody out there totally knows what we were just doing in {place}.', feel: 'love', act: 'step_closer' }
  ],
  pam: [
    { say: 'My lipstick is completely smeared... stop grinning like that, everybody is going to tell!', feel: 'embarrassed', act: 'laugh' },
    { say: 'That was way riskier than usual, and honestly I am still catching my breath.', feel: 'love', act: 'step_closer' }
  ],
  dwight: [
    { say: 'Fix your skirt, tuck your blouse. Walk out separately in ten seconds and deny all physical contact.', feel: 'determined', act: 'nod' },
    { say: 'Acceptable stamina. Now wipe that smirk off before accounting gets suspicious.', feel: 'smug', act: 'step_closer' }
  ],
  angela: [
    { say: 'Do not touch me out here! Smooth your hair down and walk ten feet behind me right now.', feel: 'nervous', act: 'point' },
    { say: 'Nobody heard anything... right? Tell me you did not leave buttons undone.', feel: 'embarrassed', act: 'gasp' }
  ],
  kelly: [
    { say: 'That was SO hot, {partner}! Wait, does my neck have a hickey? Check my neck!', feel: 'excited', act: 'gasp' }
  ],
  ryan: [
    { say: 'Keep it cool, babe. If anybody asks, we were brainstorming synergy in {place}.', feel: 'smug', act: 'shrug' }
  ],
  meredith: [
    { say: 'Whew! Tell you what, best twenty minutes I have spent on company time all month.', feel: 'happy', act: 'laugh' }
  ]
};

const BOLD_ACTOR: Partial<Record<CharId, LineSpec[]>> = {
  michael: [
    { say: 'Come here, {partner} - feel the raw animal magnetism of regional management!', feel: 'love', act: 'step_closer' },
    { say: 'Oh yeah, nobody in {place} can resist these hands. Just relax and let it happen!', feel: 'mischievous', act: 'step_closer' }
  ],
  dwight: [
    { say: 'Hold still, {partner}. My grip and technique are superior to every beta male in this building!', feel: 'determined', act: 'step_closer' }
  ],
  jim: [
    { say: 'Careful, {partner}, keep looking at me like that and HR is going to have a field day.', feel: 'love', act: 'step_closer' }
  ],
  pam: [
    { say: 'Come closer, {partner}. I am way past caring who in {place} sees us right now.', feel: 'love', act: 'step_closer' }
  ],
  meredith: [
    { say: 'Get over here, {partner}! Take your shirt off or let me get my hands on you!', feel: 'mischievous', act: 'laugh' }
  ],
  kelly: [
    { say: 'Kiss me right now, {partner}, and make sure everybody in {place} watches!', feel: 'excited', act: 'step_closer' }
  ]
};

const BOLD_PARTNER: Partial<Record<CharId, LineSpec[]>> = {
  pam: [
    { say: 'Whoa - {actor}, everybody in {place} is staring! At least warn me before grabbing me!', feel: 'embarrassed', act: 'gasp' }
  ],
  angela: [
    { say: 'Get your filthy hands off me right now, {actor}, or I will stab you with a letter opener!', feel: 'disgusted', act: 'back_away' }
  ],
  jim: [
    { say: 'Alright, well, that just escalated in front of the entire sales floor.', feel: 'amused', act: 'laugh' }
  ],
  meredith: [
    { say: 'Ooh, yes! Put your hands right there, {actor} - do not hold back!', feel: 'excited', act: 'laugh' }
  ],
  kelly: [
    { say: 'Wait - are we doing this right here in front of everyone?! Because I am kind of into it!', feel: 'excited', act: 'gasp' }
  ],
  ryan: [
    { say: 'Whoa, easy, {actor} - my shirt is designer, if you wrinkle it you owe me.', feel: 'surprised', act: 'back_away' }
  ]
};

const HR_LINES: Partial<Record<CharId, LineSpec[]>> = {
  toby: [
    { say: 'Look, I hate doing this, okay? You have to sign the Relationship Disclosure Form before people start fooling around on desks.', feel: 'tired', act: 'shrug' },
    { say: 'Corporate wants signatures on the Love Contract today. Please just... keep your clothes on in {place}.', feel: 'nervous', act: 'point' }
  ],
  angela: [
    { say: 'Sign this morals disclosure immediately! Your disgusting hormone circus stops right now!', feel: 'angry', act: 'point' }
  ],
  michael: [
    { say: 'Oh boo, Toby! Let people love! Love is not an HR violation unless you make it weird with clipboards!', feel: 'angry', act: 'stomp' }
  ],
  meredith: [
    { say: 'I am not signing a damn Love Contract, Toby. Half the fun is sneaking around!', feel: 'amused', act: 'laugh' }
  ],
  jim: [
    { say: 'Great, nothing kills office romance faster than Toby waving three pages of legal consent.', feel: 'amused', act: 'facepalm' }
  ]
};

const JEALOUS_LINES: Partial<Record<CharId, LineSpec[]>> = {
  kelly: [
    { say: 'Oh, so we are just shamelessly rubbing up on other people in {place} now?! Unbelievable!', feel: 'angry', act: 'stomp' }
  ],
  toby: [
    { say: 'Yeah... no, totally cool seeing that right in front of me. Just going to stare at my desk and die inside.', feel: 'sad', act: 'back_away' }
  ],
  jim: [
    { say: 'Excuse me? Keep your hands off unless you want this stapler somewhere unpleasant.', feel: 'angry', act: 'point' }
  ],
  dwight: [
    { say: 'Back away immediately! Touch what is mine again and you will regret entering {place}!', feel: 'angry', act: 'stomp' }
  ],
  angela: [
    { say: 'Shameless. Filthy. Disgusting. Get your hands off them before I make both of you miserable.', feel: 'disgusted', act: 'point' }
  ]
};

const GENERIC_SPICY: Record<SpicyTopic, readonly LineSpec[]> = {
  caught: [
    { say: 'Nobody saw anything - now zip up and walk out before HR shows up!', feel: 'embarrassed', act: 'gasp' },
    { say: 'Are you two seriously hooking up in {place} with the door unlocked?!', feel: 'surprised', act: 'point' }
  ],
  hr_contract: [
    { say: 'Just sign the Love Contract so we can pretend this office still has rules.', feel: 'tired', act: 'facepalm' },
    { say: 'Wait, do we have to list EVERY hookup on this form or just the ones people caught?', feel: 'nervous', act: 'shrug' }
  ],
  rendezvous: [
    { say: 'Fix your collar - you have hooked-up hair written all over your face.', feel: 'amused', act: 'laugh' },
    { say: 'Five minutes alone in {place} and you walk out looking like that. Classic.', feel: 'smug', act: 'laugh' }
  ],
  expose: [
    { say: 'Put some clothes on before Corporate shuts the whole branch down!', feel: 'surprised', act: 'facepalm' },
    { say: 'I cannot believe they just stripped bare right there in front of everyone!', feel: 'amused', act: 'gasp' }
  ],
  jealousy: [
    { say: 'Keep your hands to yourself before somebody loses it right here in {place}!', feel: 'angry', act: 'point' },
    { say: 'Oh, this love triangle is about to explode in front of everybody.', feel: 'surprised', act: 'gasp' }
  ],
  bold: [
    { say: 'Get a room! Or at least wait until five o clock before getting that handsy!', feel: 'surprised', act: 'point' },
    { say: 'Whoa, {actor} is going straight for it with zero shame in {place}!', feel: 'amused', act: 'laugh' }
  ],
  flirt: [
    { say: 'Smooth, {actor}. Subtle as a brick, and everybody here sees the chemistry.', feel: 'amused', act: 'laugh' },
    { say: 'Careful, keep talking like that and you two will end up sneaking into the annex.', feel: 'mischievous', act: 'step_closer' }
  ],
  ambient_spicy: [
    { say: 'The sexual tension in {place} today is thick enough to choke a horse.', feel: 'mischievous', act: 'laugh' },
    { say: 'Everybody knows who has been sneaking off for quickies in {place} this week.', feel: 'amused', act: 'step_closer' }
  ]
};

export function spicySceneLines(
  req: SceneRequest,
  topic: SpicyTopic,
  names: { name: (id: CharId) => string },
  rng: () => number,
  count: number
): SceneLine[] {
  const ppl = req.people;
  const actor = names.name(ppl[0].id);
  const partner = ppl[1] ? names.name(ppl[1].id) : 'everyone';
  const walker = topic === 'caught' ? actor : undefined;
  const ctx = { actor, partner, walker, place: req.place };

  const out: SceneLine[] = [];
  const used = new Set<string>();

  for (let i = 0; i < count && i < ppl.length * 2; i++) {
    const idx = i % ppl.length;
    const sp = ppl[idx];
    const nextSp = ppl[(idx + 1) % ppl.length];
    const to: CharId | 'all' | null = ppl.length > 1 ? (i === 0 && ppl.length > 2 ? 'all' : nextSp.id) : null;

    let pool: readonly LineSpec[] | undefined;
    if (topic === 'caught') {
      pool = idx === 0 ? CAUGHT_WALKER[sp.id] : CAUGHT_BUSTED[sp.id];
    } else if (topic === 'expose') {
      pool = idx === 0 ? EXPOSE_ACTOR[sp.id] : EXPOSE_WITNESS[sp.id];
    } else if (topic === 'rendezvous') {
      pool = RENDEZVOUS_LINES[sp.id];
    } else if (topic === 'hr_contract') {
      pool = HR_LINES[sp.id];
    } else if (topic === 'jealousy') {
      pool = idx >= ppl.length - 1 ? JEALOUS_LINES[sp.id] : BOLD_ACTOR[sp.id];
    } else if (topic === 'bold' || topic === 'flirt') {
      pool = idx === 0 ? BOLD_ACTOR[sp.id] : idx === 1 ? BOLD_PARTNER[sp.id] : EXPOSE_WITNESS[sp.id];
    } else {
      pool = RENDEZVOUS_LINES[sp.id] ?? BOLD_ACTOR[sp.id];
    }
    const chosenPool = pool && pool.length ? pool : GENERIC_SPICY[topic];
    let pick = pickOne(chosenPool, rng);
    if (used.has(pick.say) && chosenPool.length > 1) {
      pick = chosenPool.find((x) => !used.has(x.say)) ?? pickOne(GENERIC_SPICY[topic], rng);
    }
    used.add(pick.say);
    out.push({
      who: sp.id,
      say: fillPlace(pick.say, ctx),
      feel: pick.feel,
      to: to === sp.id ? null : to,
      act: pick.act
    });
  }
  return out;
}

export function spicyDelegationReply(
  targetId: CharId,
  askerName: string,
  complies: boolean,
  isExpose: boolean,
  isPerm: boolean,
  delTone: DelegateTone,
  rng: () => number
): { say: string; feel: EmotionId; act: LineAct } {
  if (complies) {
    if (isExpose) {
      if (targetId === 'meredith') {
        return { say: pickOne(['Hell yeah, shirts off! Watch and weep, babies!', 'You do not have to ask me twice - watch this strip show!'], rng), feel: 'excited', act: 'cheer' };
      }
      if (targetId === 'creed') {
        return { say: 'Sure, clothes are basically social prisons anyway.', feel: 'amused', act: 'shrug' };
      }
      if (targetId === 'angela') {
        return { say: `Fine, ${askerName}... close the damn blinds first so nobody sees my bra.`, feel: 'embarrassed', act: 'step_closer' };
      }
      return { say: `Screw it, ${askerName} - brace yourself, everything is coming off.`, feel: 'mischievous', act: 'laugh' };
    }
    if (isPerm) {
      if (targetId === 'meredith') return { say: `Oh hell yes, ${askerName}. Put those hands to work!`, feel: 'excited', act: 'laugh' };
      if (targetId === 'angela') return { say: `Quickly, ${askerName}, before anyone looks over here... yes.`, feel: 'love', act: 'nod' };
      return { say: pickOne([`Finally you asked, ${askerName}. Get over here.`, `Yes, ${askerName} - just do not hold back.`], rng), feel: 'love', act: 'step_closer' };
    }
    if (targetId === 'meredith') return { say: 'Ooh, now we are talking! Come get a piece of this!', feel: 'excited', act: 'laugh' };
    if (targetId === 'angela') return { say: `Hurry up, ${askerName}, slip away with me before accounting notices.`, feel: 'love', act: 'step_closer' };
    if (delTone === 'dare') return { say: `Oh, you dared me? Watch how fast I do it, ${askerName}.`, feel: 'mischievous', act: 'laugh' };
    return { say: pickOne([`Honestly, ${askerName}? Yes. Come here right now.`, `You do not have to ask twice, ${askerName}.`], rng), feel: 'love', act: 'step_closer' };
  }

  if (isExpose) {
    if (targetId === 'angela') return { say: `Take my clothes off?! Are you a pervert, ${askerName}? Keep your distance!`, feel: 'disgusted', act: 'shake_head' };
    if (targetId === 'pam') return { say: `Yeah, absolutely NOT, ${askerName}. Keep your creepiness to yourself.`, feel: 'disgusted', act: 'shake_head' };
    if (targetId === 'toby') return { say: `Please stop, ${askerName}. If anyone strips, I have to write a forty-page incident report.`, feel: 'nervous', act: 'facepalm' };
    return { say: `Keep dreaming, ${askerName} - nobody here is taking their clothes off for you.`, feel: 'disgusted', act: 'shake_head' };
  }

  if (isPerm) {
    return {
      say: pickOne([
        `Keep your hands off me, ${askerName}. Seriously, no chance.`,
        `Ugh, gross, ${askerName} - do not touch me!`,
        `Are you out of your mind, ${askerName}? Not in a million years.`
      ], rng),
      feel: 'disgusted',
      act: 'shake_head'
    };
  }
  return {
    say: pickOne([
      `Hard pass, ${askerName}. Take that horniness somewhere else.`,
      `No chance, ${askerName}. I am calling HR if you ask again.`
    ], rng),
    feel: 'disgusted',
    act: 'shake_head'
  };
}

export function spicySummary(req: SceneRequest, topic: SpicyTopic, names: { name: (id: CharId) => string }): string {
  const a = names.name(req.people[0]?.id ?? '');
  const b = req.people[1] ? names.name(req.people[1].id) : null;
  const place = req.place;
  switch (topic) {
    case 'caught':
      return b
        ? `${a} burst into ${place} and caught ${b} half-undressed in the act.`
        : `${a} caught someone half-undressed in ${place}.`;
    case 'expose':
      return `${a} stripped completely bare in ${place} while everyone lost their minds.`;
    case 'rendezvous':
      return b
        ? `${a} and ${b} emerged from ${place} rumpled and breathless after hooking up.`
        : `${a} walked out of ${place} looking fresh from a secret hookup.`;
    case 'hr_contract':
      return `${a} marched in with an HR Love Contract to stop the hookup chaos in ${place}.`;
    case 'jealousy':
      return b
        ? `Jealous tension boiled over between ${a} and ${b} in ${place}.`
        : `Jealous romance drama erupted in ${place}.`;
    case 'bold':
      return b
        ? `${a} got shamelessly hands-on with ${b} right in front of ${place}.`
        : `${a} put on a shamelessly steamy display in ${place}.`;
    case 'flirt':
      return b
        ? `${a} shamelessly flirted with ${b} in ${place}, turning heads across the room.`
        : `${a} kept up shameless flirting in ${place}.`;
    default:
      return b
        ? `${a} and ${b} traded spicy gossip about office hookups in ${place}.`
        : `${a} muttered about the sexual tension in ${place}.`;
  }
}
