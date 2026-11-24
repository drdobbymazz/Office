// Monday, "The Memo", played on the real simulation and director with the
// no-model brain. Michael really hides (announcements alone never win), doing
// nothing loses, and several different plans win: fill the room and carry him in
// last, whisper him an idea about the conference room, lock him in, or carry
// everyone by hand. Creed going through Michael's bin is the morning's choice.
import { describe, expect, it } from 'vitest';
import type { CharId } from '@/game/core/types';
import { convictionLever, invitesPeople, keepsAway, stayedLine } from '@/game/director/summon';
import { MEMO } from '@/game/story/text';
import { STANDING } from '@/game/story';
import { play, storyAt, type Played } from './harness';

const othersInMeeting = (g: Played): number =>
  g.sim.people().filter((p) => p.isCast && p.present && p.id !== 'michael' && p.room === 'meeting').length;

/** Announce until most of the office is in the conference room (at most three times). */
async function fillTheRoom(g: Played, text = 'Everyone to the conference room, now!'): Promise<void> {
  for (let i = 0; i < 3 && othersInMeeting(g) < 11; i++) {
    expect(g.announce(text)).toBeNull();
    await g.until(() => othersInMeeting(g) >= 11, 14);
  }
}

/** Spots spread round the conference room table, so nobody is set down in Michael's office next door. */
const SPOTS = ['spot.meet1', 'spot.meet2', 'spot.meet3', 'spot.meet4', 'spot.meet5', 'spot.meet6', 'spot.meet7', 'spot.meet9', 'spot.meet13', 'spot.meet14'];
/** Where Michael is set down: the far end of the table, away from the door to his office. */
const MICHAEL_SPOT = 'spot.meet11';

async function settle(g: Played, by = 15 * 60 + 1): Promise<void> {
  await g.until(() => g.day.main !== 'open' || g.sim.clock >= by, 3000);
}

describe('Monday: The Memo', () => {
  it('sets the day up: Michael hides, sure of it; All-Hands is locked; the call comes between 14:00 and 15:00', async () => {
    const g = play(storyAt(1, 22));
    const m = g.sim.person('michael')!;
    expect(m.conviction?.text).toBe(MEMO.conviction);
    // His idea on his card does not give the news away.
    expect(MEMO.conviction).not.toMatch(/clos|branch|corporate/i);
    expect(g.sim.briefFor('michael', []).hidden).toBe(MEMO.hidden);
    expect(g.day.refusal('meeting')).toBe(MEMO.locked.meeting);
    expect(g.day.def.goal.detail).toContain('between 14:00 and 15:00');
    expect(MEMO.intro.join(' ')).toContain('Between 14:00 and 15:00');
    expect(g.day.def.help?.length).toBeGreaterThan(0);
    await g.toClock(10);
    expect(g.day.goalUi().status).toBe(MEMO.before);
    expect(g.day.goalUi().progress).toBe(0);
    expect(g.day.pinned('michael')).toBe(true);
    // Locked even when something else (a typed event) tries to set it off.
    expect(g.sim.startChaos('meeting', {}, { force: true })).toBe(MEMO.locked.meeting);
  });

  it('Michael really hides: no errands all day, and carried out he slips back after a moment', async () => {
    const g = play(storyAt(1, 21));
    await g.toClock(9, 10);
    let samples = 0;
    let atDesk = 0;
    while (g.sim.clock < 13 * 60) {
      await g.step(2);
      samples++;
      if (g.sim.person('michael')!.room === 'boss') atDesk++;
    }
    expect(atDesk / samples).toBeGreaterThan(0.95);
    await g.drop('michael', 'spot.kitchen2');
    expect(g.sim.person('michael')!.room).toBe('kitchen');
    await g.step(8);
    // A short moment to get his bearings ...
    expect(g.sim.person('michael')!.room).toBe('kitchen');
    // ... then back to his office, and the player is told so.
    expect(await g.until(() => g.sim.person('michael')!.room === 'boss', 45)).toBe(true);
    expect(g.feed).toContain(MEMO.slipBack);
  });

  for (const seed of [21, 22]) {
    it(`doing nothing loses: the vice president phones an empty room (seed ${seed})`, async () => {
      const g = play(storyAt(1, seed));
      await g.toEnd();
      expect(g.day.main).toBe('lost');
      // The loss says what the vice president actually found in the room.
      const found = g.feed.find((l) => l.startsWith('At 15:00 the vice president phoned'));
      expect(found).toBeDefined();
      // Everyone hears about the closure either way.
      expect(g.story.state.notes.closureKnown).toBe(true);
      const r = g.story.finishDay(g.day, g.sim.serialize());
      expect(r.won).toBe(false);
      expect(r.text).toEqual([found]);
      expect(r.changes[0]).toEqual({ text: MEMO.changeLost, delta: STANDING.lost });
      // No extra goal wins itself.
      expect(r.extras).toEqual([]);
    });
  }

  for (const seed of [21, 23]) {
    it(`announcements alone never win while he hides, and the loudspeaker says he stays put (seed ${seed})`, async () => {
      const g = play(storyAt(1, seed));
      await g.toClock(14);
      await fillTheRoom(g);
      expect(othersInMeeting(g)).toBeGreaterThanOrEqual(9);
      expect(g.feed.some((l) => /\bMichael\b.*\bstay/.test(l))).toBe(true);
      await settle(g);
      expect(g.day.main).toBe('lost');
      // People called for the call wait until it is over, and the loss names who was missing.
      expect(g.feed.some((l) => /of the staff were waiting, but Michael was not there/.test(l))).toBe(true);
    });
  }

  it('says what the vice president found: the words follow the room', () => {
    expect(MEMO.missed(0, false)).toMatch(/an empty conference room/);
    expect(MEMO.missed(11, false)).toMatch(/11 of the staff were waiting, but Michael was not there/);
    expect(MEMO.missed(4, true)).toMatch(/Michael and only 4 of the staff/);
    expect(MEMO.missed(1, false)).toMatch(/only 1 of the staff and no Michael/);
    expect(MEMO.missed(0, true)).toMatch(/Michael on his own/);
  });

  for (const seed of [21, 24, 27]) {
    it(`a whisper that names the conference room wins without a hand on Michael (seed ${seed})`, async () => {
      const g = play(storyAt(1, seed));
      await g.toClock(9, 20);
      expect(g.whisper('michael', 'I should be in the conference room at two.')).toBeNull();
      await g.step(10);
      expect(g.feed).toContain(MEMO.freedForCall);
      // Called at half past twelve, people are still there when the call window opens.
      await g.toClock(12, 35);
      await fillTheRoom(g);
      await g.toClock(13, 58);
      expect(othersInMeeting(g)).toBeGreaterThanOrEqual(9);
      // Just before two he walks there by himself.
      expect(await g.until(() => g.day.main === 'won', 80)).toBe(true);
    });
  }

  for (const seed of [21, 23, 25]) {
    it(`wins by filling the room, then carrying Michael in last (Quiet hands), seed ${seed}`, async () => {
      const g = play(storyAt(1, seed));
      await g.toClock(14);
      expect(g.feed).toContain(MEMO.two);
      expect(g.day.goalUi().status).toMatch(/Only Michael is missing|of 9 staff in the room, and no Michael yet/);
      await fillTheRoom(g);
      expect(othersInMeeting(g)).toBeGreaterThanOrEqual(9);
      await g.drop('michael', MICHAEL_SPOT);
      await g.until(() => g.day.main !== 'open', 10);
      expect(g.day.main).toBe('won');
      expect(g.feed).toContain(MEMO.ring);
      expect(g.sim.facts()).toContain(MEMO.closure);
      expect(g.sim.person('michael')!.conviction).toBeNull();
      expect(g.day.extraState('quiet')).toBe('won');
      // The vice president's call plays out on the speakerphone.
      await g.step(25);
      expect(g.feed).toContain(`${MEMO.vp}: "${MEMO.call.news}"`);
      expect(g.feed).toContain(MEMO.call.rally);
    });
  }

  for (const seed of [22, 25]) {
    it(`carrying Michael in early fails: he slips back long before the room is full (seed ${seed})`, async () => {
      const g = play(storyAt(1, seed));
      await g.toClock(13, 30);
      await g.drop('michael', MICHAEL_SPOT);
      // Left alone in an empty room, he is back at his desk within half a minute, and the player is told.
      expect(await g.until(() => g.sim.person('michael')!.room === 'boss', 45)).toBe(true);
      expect(g.feed).toContain(MEMO.slipBack);
      await g.toClock(14);
      await fillTheRoom(g);
      await settle(g);
      expect(g.day.main).toBe('lost');
    });
  }

  for (const seed of [24, 26]) {
    it(`wins with a whisper that sends Michael to the call himself, and announcements (seed ${seed})`, async () => {
      const g = play(storyAt(1, seed));
      await g.toClock(13, 40);
      expect(g.whisper('michael', 'I should be in the conference room when Corporate calls.')).toBeNull();
      await g.step(1);
      expect(g.feed).toContain(MEMO.freedForCall);
      expect(g.day.pinned('michael')).toBe(false);
      await g.toClock(14);
      await fillTheRoom(g);
      await settle(g);
      expect(g.day.main).toBe('won');
      expect(g.day.extraState('quiet')).toBe('won');
    });
  }

  it('wins by locking Michael in the conference room, then calling everyone in', async () => {
    const g = play(storyAt(1, 25));
    await g.toClock(13, 20);
    expect(g.power('lockIn', { who: 'michael', other: 'pam' })).toBeNull();
    expect(g.day.extraState('quiet')).toBe('lost');
    await g.until(() => !g.sim.activeChaos().some((c) => c.id === 'lockIn'), 120);
    await g.step(1);
    expect(g.feed).toContain(MEMO.lockedOut);
    expect(g.sim.person('michael')!.conviction).toBeNull();
    await g.toClock(14);
    await fillTheRoom(g);
    await settle(g);
    expect(g.day.main).toBe('won');
  });

  it('wins for free by carrying ten people and then Michael by hand', async () => {
    const g = play(storyAt(1, 27));
    await g.toClock(14);
    const ids: CharId[] = ['pam', 'jim', 'dwight', 'stanley', 'phyllis', 'andy', 'angela', 'oscar', 'toby', 'meredith'];
    for (let i = 0; i < ids.length; i++) expect(await g.drop(ids[i], SPOTS[i])).toBe(true);
    await g.drop('michael', MICHAEL_SPOT);
    await settle(g);
    expect(g.day.main).toBe('won');
    expect(g.day.influence.left).toBeGreaterThanOrEqual(g.day.influence.max);
  });

  it('Creed and the bin: left alone, the memo gets out and three people hide, each with a way in', async () => {
    const g = play(storyAt(1, 21));
    await g.toClock(10, 21);
    expect(g.feed).toContain(MEMO.bin.goes);
    await g.toClock(11, 30);
    expect(g.feed).toContain(MEMO.bin.found);
    expect(g.sim.facts()).toContain(MEMO.bin.fact);
    for (const st of MEMO.stragglers) expect(g.sim.person(st.id)!.conviction?.text).toBe(st.conviction);
    // Their ideas say what would move them, in plain words.
    expect(MEMO.stragglers.map((st) => convictionLever(st.conviction))).toEqual([{ kind: 'food' }, { kind: 'named' }, { kind: 'follow', who: 'ryan' }]);
    await g.toClock(13, 50);
    g.announce('Everyone to the conference room, please.');
    expect(g.feed.some((l) => /Kevin/.test(l) && /Ryan/.test(l) && /stay where they are/.test(l))).toBe(true);
    const doing = (id: CharId): string => g.sim.person(id)!.doing;
    expect(doing('kevin')).not.toMatch(/conference room/);
    g.announce('Free pizza in the conference room!');
    expect(doing('kevin')).toBe('heading to the conference room');
    g.announce('Ryan, please come to the conference room.');
    expect(doing('ryan')).toBe('heading to the conference room');
    expect(await g.until(() => /conference room/.test(doing('kelly')), 10)).toBe(true);
  });

  it('Creed and the bin: a whisper to Creed stops him, and nobody hides', async () => {
    const g = play(storyAt(1, 21));
    await g.toClock(10, 21);
    expect(g.whisper('creed', 'I should water the plants today.')).toBeNull();
    await g.step(1);
    expect(g.feed).toContain(MEMO.bin.stopped);
    await g.toClock(12);
    expect(g.feed).not.toContain(MEMO.bin.found);
    for (const st of MEMO.stragglers) expect(g.sim.person(st.id)!.conviction).toBeNull();
  });

  it('Full room: stop the memo getting out, fill the room, and bring Michael in last', async () => {
    let full = 0;
    for (const seed of [22, 25, 26]) {
      const g = play(storyAt(1, seed));
      await g.toClock(10, 21);
      g.whisper('creed', 'I should water the plants today.');
      await g.toClock(14);
      // Count heads and keep calling until twelve are in (the extra asks for it), then bring Michael in last.
      for (let i = 0; i < 5 && othersInMeeting(g) < 12; i++) {
        expect(g.announce('Everyone to the conference room, now!')).toBeNull();
        await g.until(() => othersInMeeting(g) >= 12, 14);
      }
      await g.drop('michael', MICHAEL_SPOT);
      await settle(g);
      expect(g.day.main).toBe('won');
      if (g.day.extraState('full') === 'won') full++;
    }
    expect(full).toBeGreaterThanOrEqual(2);
  });

  it('Time Freeze: people set down while time stands still stay put once it starts again', async () => {
    const g = play(storyAt(1, 21));
    await g.toClock(11);
    expect(g.power('timeFreeze')).toBeNull();
    for (const [id, at] of [['pam', 'spot.kitchen2'], ['jim', 'spot.kitchen3']] as const) await g.drop(id, at);
    await g.until(() => !g.sim.activeChaos().some((c) => c.id === 'timeFreeze'), 30);
    await g.step(3);
    for (const id of ['pam', 'jim'] as const) expect(g.sim.person(id)!.room).toBe('kitchen');
    // A while later they are still getting their bearings where they were put (unless the
    // conversation about what just happened gave one of them a plan of their own).
    await g.step(17);
    const stayed = (['pam', 'jim'] as const).filter((id) => g.sim.person(id)!.room === 'kitchen' && /bearings|talking/.test(g.sim.person(id)!.doing));
    expect(stayed.length).toBeGreaterThanOrEqual(1);
  });

  it('Quiet hands fails at the first power, and says so before you confirm one', async () => {
    const g = play(storyAt(1, 26));
    await g.toClock(10);
    expect(g.day.warnsUi().smite).toBe(MEMO.warnQuiet);
    expect(g.day.warnsUi().whisper).toBeUndefined();
    expect(g.power('smite', { who: 'dwight' })).toBeNull();
    await g.step(0.5);
    expect(g.day.extraState('quiet')).toBe('lost');
    expect(g.day.warnsUi()).toEqual({});
  });
});

describe('Monday: the loudspeaker', () => {
  it('reads a call in plain words: an event in a room invites people, a keep-away line does not', () => {
    expect(invitesPeople('The call from Corporate is in the conference room at three.')).toBe(true);
    expect(invitesPeople('Meeting in the annex in five minutes.')).toBe(true);
    expect(invitesPeople('The printer in the annex is broken.')).toBe(false);
    expect(invitesPeople('Nobody go to the break room!')).toBe(false);
    expect(keepsAway('Stay out of the conference room.')).toBe(true);
    expect(stayedLine(['Michael'])).toBe('Michael stays where he is.');
    expect(stayedLine(['Kevin', 'Kelly'])).toBe('Kevin and Kelly stay where they are.');
    expect(convictionLever('Oscar is plotting to get Angela fired.')).toBeNull();
  });

  it('a plain sentence about the call still sends people, and a keep-away line says nobody moves', async () => {
    const g = play(storyAt(1, 23));
    await g.toClock(13, 50);
    g.announce('The call from Corporate is in the conference room at three.');
    expect(g.sim.people().filter((p) => p.doing === 'heading to the conference room').length).toBeGreaterThanOrEqual(5);
    g.announce('Nobody go to the break room.');
    expect(g.feed).toContain('Nobody moves.');
  });
});
