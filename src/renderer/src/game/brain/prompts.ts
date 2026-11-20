// The words we send to the model.
//
// SYSTEM messages are built once per world and are byte-identical on every
// call of a kind. They all start with the same long block (the setting, the
// people, the writing rules), so Ollama's prompt cache keeps that prefix even
// when scene, minds and report requests alternate, and only the short USER
// message is read anew. At 7 tokens a second a cold re-read costs real seconds.

import { EMOTIONS, LINE_ACTS } from '@/game/core/types';
import type { InterpretRequest, MindsRequest, PersonBrief, ReportRequest, SceneRequest } from './api';
import { CUSTOM_LOOKS, CUSTOM_REACTIONS, CUSTOM_VIBES } from './api';
import { NameMap, firstName } from './names';
import type { BrainPersona } from './world';
import { WorldIndex } from './world';

export type RequestKind = 'scene' | 'minds' | 'interpret' | 'report';

/** Most words one person's entry in the system message may use. */
export const PERSONA_WORDS = 45;

const words = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0);
const firstSentence = (s: string): string => {
  const m = /^.*?[.!?](?=\s|$)/.exec(s.trim());
  return (m ? m[0] : s).trim();
};
const sentence = (s: string): string => {
  const t = s.trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/**
 * One compact line per person: name and role, who they are, how they talk,
 * and one example line, trimmed to PERSONA_WORDS. Pieces are added in order of
 * importance and shortened to their first sentence when they do not fit.
 */
export function personaEntry(p: BrainPersona): string {
  const head = `${firstName(p.name)}${p.role ? ` (${p.role})` : ''}:`;
  const parts: string[] = [head];
  const add = (full: string, prefix = ''): void => {
    const f = full.trim();
    if (!f) return;
    for (const candidate of [sentence(f), sentence(firstSentence(f))]) {
      const piece = prefix + candidate;
      if (words([...parts, piece].join(' ')) <= PERSONA_WORDS) {
        parts.push(piece);
        return;
      }
    }
  };
  add(p.summary);
  add(p.speech, 'Talks: ');
  const ex = p.examples.find((e) => e.trim());
  if (ex) {
    const piece = `"${ex.trim()}"`;
    if (words([...parts, piece].join(' ')) <= PERSONA_WORDS) parts.push(piece);
  }
  return parts.join(' ');
}

const PLAN_LIST =
  'work, talk, confront, flirt, gossip, prank, comfort (cheer someone up), coffee, snack, ' +
  "break (somewhere quiet), hide, wander, nap, fix (deal with the problem), flee, snoop (search the target's desk)";

const HOUSE_RULES =
  'HOUSE RULES\n' +
  'Workplace comedy for a general audience. Cartoon slapstick only: nobody is really hurt. ' +
  'Nothing sexual, hateful or gory. Never mention being an AI, a model, a game or a prompt.';

/** Builds the messages for one world. Construct once and reuse: the system text is cached. */
export class PromptBook {
  private readonly systems: Record<RequestKind, string>;
  readonly sharedPrefix: string;

  constructor(readonly index: WorldIndex) {
    const w = index.world;
    const roomList = w.rooms.map((r) => `${r.id} (${r.name})`).join(', ');
    const shared = [
      `You write for a comedy. ${w.setting.trim()}`,
      '',
      'THE PEOPLE',
      ...w.people.map((p) => `- ${personaEntry(p)}`),
      '',
      'HOW TO WRITE WHAT PEOPLE SAY',
      '- Each line is only the words the person says out loud, in their own voice. 18 words at most.',
      '- No narration, no stage directions, no actions in asterisks or brackets, no emojis.',
      '- React to what just happened and to each other. Say something specific, not generic.',
      '- Plain words. British English.',
      '- Do not repeat earlier lines.',
      '- People do not all agree. Let them clash.'
    ].join('\n');
    this.sharedPrefix = shared;

    const tails: Record<RequestKind, string> = {
      scene: [
        'YOUR TASK',
        'You are given a scene: when and where, what is happening, and who speaks. Write the next lines they say out loud, taking turns.',
        '',
        'REPLY FORMAT',
        'Reply with one JSON object and nothing else:',
        '{"lines":[{"who":"speaker\'s first name","say":"the words","feel":"emotion","to":"listener\'s first name, all, or none","act":"gesture"}],' +
          '"summary":"one plain sentence: who did what","shifts":[{"who":"name","about":"name","change":"kind of change"}],' +
          '"plans":[{"who":"name","plan":"plan","target":"name, room id, or none","about":"a few words"}]}',
        `- feel: ${EMOTIONS.join(', ')}.`,
        `- act: ${LINE_ACTS.join(', ')}.`,
        '- summary: what happened, in the past tense, naming people. It becomes their memory of it.',
        '- shifts: only a real change in how one person feels about another, because of this scene. Often none. ' +
          'change: likes_more, likes_less, trusts_more, trusts_less, admires, resents, fancies, fears.',
        `- plans: what someone now decides to do next. Often none. plan: ${PLAN_LIST}.`,
        `- Room ids: ${roomList}.`
      ].join('\n'),
      minds: [
        'YOUR TASK',
        'You are given people who are each on their own. For each one, write a short private thought in their own voice ' +
          '(12 words at most), how they feel, and what they decide to do next.',
        '',
        'REPLY FORMAT',
        'Reply with one JSON object and nothing else:',
        '{"minds":[{"who":"first name","thought":"the thought","feel":"emotion","plan":"plan","target":"name, room id, or none","about":"a few words"}]}',
        `- feel: ${EMOTIONS.join(', ')}.`,
        `- plan: ${PLAN_LIST}. Use only the plans allowed in the request.`,
        '- target: a person for talk, confront, flirt, gossip, prank, comfort and snoop; a room id or none for the rest.',
        `- Room ids: ${roomList}.`
      ].join('\n'),
      interpret: [
        'YOUR TASK',
        'The unseen force has made something happen, described in a few words. Turn it into something the office can show.',
        '',
        'REPLY FORMAT',
        'Reply with one JSON object and nothing else:',
        '{"title":"2 to 5 words, e.g. Horse in the Lobby","emoji":"one emoji showing the thing that appeared, or empty",' +
          '"room":"room id, or everywhere","fact":"one plain present-tense sentence of what is now true",' +
          '"vibe":"vibe","intensity":1,"reaction":"reaction","look":"effect","moves":true}',
        `- vibe: ${CUSTOM_VIBES.join(', ')}.`,
        '- intensity: 1 mild, 2 strong, 3 extreme.',
        `- reaction (how people nearby react with their bodies): ${CUSTOM_REACTIONS.join(', ')}.`,
        `- look (visual effect in the room): ${CUSTOM_LOOKS.join(', ')}.`,
        '- moves: true if the thing walks, flies or drifts about.',
        '- room: the room it names, or the best fit. Use everywhere only if it fills the whole building.'
      ].join('\n'),
      report: [
        'YOUR TASK',
        'A working day is over. Write the office newsletter about it from the log: plain, warm and a little funny.',
        '',
        'REPLY FORMAT',
        'Reply with one JSON object and nothing else:',
        '{"headline":"a short newspaper headline","paragraphs":["2 or 3 short plain paragraphs: who did what, what changed"],' +
          '"awards":[{"title":"a funny award name","who":"first name","why":"one sentence"}],' +
          '"takeaways":[{"who":"first name","text":"what this person takes away from the day, one short sentence"}]}',
        '- Only report things that are in the log. Name people. Say what changed.',
        '- Give 2 or 3 awards, and one takeaway for each person listed.'
      ].join('\n')
    };
    const sys = (k: RequestKind): string => `${shared}\n\n${tails[k]}\n\n${HOUSE_RULES}`;
    this.systems = { scene: sys('scene'), minds: sys('minds'), interpret: sys('interpret'), report: sys('report') };
  }

  /** The static system message for a kind of request. Byte-identical on every call. */
  system(kind: RequestKind): string {
    return this.systems[kind];
  }

  // ── User messages ─────────────────────────────────────────────────────────

  /** Name for anyone: from this request, else from the world, else the id tidied up. */
  private nameFor(id: string, names: NameMap): string {
    const n = names.has(id) ? names.name(id) : this.index.nameOf(id);
    return n ? n[0].toUpperCase() + n.slice(1) : id;
  }

  private personLines(p: PersonBrief, names: NameMap, extra?: string): string {
    const name = names.name(p.id);
    const parts: string[] = [`- ${name}${extra ? `, ${extra}` : ''}.`];
    if (!this.index.person(p.id) && p.name) parts.push(`(${p.name}, a visitor.)`);
    if (p.mindOf) {
      const mind = this.index.nameOf(p.mindOf);
      parts.push(
        `MIND SWAP: ${mind}'s mind is inside ${name}'s body. Write ${name}'s lines in ${mind}'s voice and personality; ` +
          `${mind} knows they are in the wrong body.`
      );
    }
    parts.push(`Mood: ${p.mood}.`);
    if (p.state.length) parts.push(sentence(p.state.join(', ')).replace(/^./, (c) => c.toUpperCase()));
    if (p.goal) parts.push(`Wants: ${sentence(p.goal)}`);
    for (const f of p.feelings) if (f.text) parts.push(`About ${this.nameFor(f.about, names)}: ${sentence(f.text)}`);
    if (p.memories.length) parts.push(`Remembers: ${p.memories.slice(0, 3).map((m) => m.trim().replace(/\.$/, '')).join('; ')}.`);
    if (p.secret) parts.push(`Secret (it may slip out now): ${sentence(p.secret)}`);
    return parts.join(' ');
  }

  private triggerNote(req: SceneRequest, names: NameMap): string {
    const first = req.people[0] ? names.name(req.people[0].id) : 'Someone';
    switch (req.trigger) {
      case 'event': return 'It is happening right now. React to it.';
      case 'aftermath': return 'It has just ended. They talk about what happened.';
      case 'whisper': return `The thought just popped into ${first}'s head. ${first} believes it is their own idea and acts on it.`;
      case 'announce': return 'Everyone heard it over the loudspeaker. Nobody knows who said it.';
      case 'cue': return `${first} suddenly feels like doing this, and does it, sure it was their own idea.`;
      case 'custom': return 'This is really happening. React to it.';
      case 'plan': return `${first} came over on purpose.`;
      default: return '';
    }
  }

  sceneUser(req: SceneRequest, names: NameMap): string {
    const out: string[] = [];
    out.push(`Day ${req.day}, ${req.clock}, in ${req.place}.`);
    if (req.why) out.push(`What is happening: ${sentence(req.why)}`);
    const note = this.triggerNote(req, names);
    if (note) out.push(note);
    out.push(req.people.length > 1 ? 'Speaking:' : 'Speaking (alone, or to whoever can hear):');
    for (const p of req.people) out.push(this.personLines(p, names));
    if (req.onlookers.length) out.push(`Also here, not speaking: ${req.onlookers.join(', ')}.`);
    if (req.facts.length) out.push(`True right now: ${req.facts.map(sentence).join(' ')}`);
    const recent = req.recent.slice(-6);
    if (recent.length) {
      out.push('Said just before:');
      for (const r of recent) out.push(`${r.who}: ${r.say}`);
    }
    const lo = Math.max(1, Math.min(req.minLines, req.maxLines));
    const hi = Math.max(lo, req.maxLines);
    const count = lo === hi ? `${lo} line${lo === 1 ? '' : 's'}` : `${lo} to ${hi} lines`;
    const who = req.people.map((p) => names.name(p.id));
    out.push(who.length > 1 ? `Write ${count}, taking turns: ${who.join(', ')}.` : `Write ${count}, all said by ${who[0] ?? 'them'}.`);
    return out.join('\n');
  }

  mindsUser(req: MindsRequest, names: NameMap, others: NameMap): string {
    const out: string[] = [];
    out.push(`Day ${req.day}, ${req.clock}.`);
    out.push('Each person is on their own:');
    for (const p of req.people) out.push(this.personLines(p, names, `in ${p.place}, ${p.doing || 'doing nothing much'}`));
    if (req.facts.length) out.push(`True right now: ${req.facts.map(sentence).join(' ')}`);
    if (req.others.length) out.push(`People they could go to: ${req.others.map((o) => `${others.name(o.id)} (${o.place})`).join(', ')}.`);
    out.push(`Plans allowed now: ${req.allowed.join(', ')}.`);
    out.push(`Write one entry for each of: ${req.people.map((p) => names.name(p.id)).join(', ')}.`);
    return out.join('\n');
  }

  interpretUser(req: InterpretRequest): string {
    const out: string[] = [];
    out.push(`The unseen force makes this happen: "${req.text.trim().replace(/"/g, "'").slice(0, 200)}"`);
    out.push('Rooms (id: name: who is there):');
    for (const r of req.rooms) out.push(`${r.id}: ${r.name}: ${r.people.length ? r.people.join(', ') : 'nobody'}`);
    return out.join('\n');
  }

  reportUser(req: ReportRequest, names: NameMap): string {
    const s = req.stats;
    const scale = (v: number): string => String(Math.round(v <= 1 && v >= 0 ? v * 100 : v));
    const out: string[] = [];
    out.push(`Day ${req.day} is over.`);
    out.push(
      `Incidents: ${s.incidents}. Stock: ${s.stockStart} at the start, ${s.stockEnd} at the end. ` +
        `Morale: ${scale(s.morale)} out of 100. Highest chaos: ${scale(s.chaosPeak)} out of 100.`
    );
    out.push('What happened, oldest first:');
    const log = req.log.length > 30 ? [...req.log.slice(0, 6), '...', ...req.log.slice(-24)] : req.log;
    for (const l of log) out.push(`- ${l.trim()}`);
    if (!log.length) out.push('- Nothing much.');
    out.push(`Staff at the end of the day: ${req.people.map((p) => `${names.name(p.id)} (${p.mood})`).join(', ')}.`);
    return out.join('\n');
  }
}
