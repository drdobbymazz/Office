// The opening scene of Episode 3, played once before Wednesday on the office floor
// (no change of place): Michael runs out of his office with the right tape and owns
// up, the office starts plotting, and Ms Vane walks in with the case. About 24
// seconds, skippable. Driven by game.ts while UiState.intro is set.

import type { RoomId } from '@/game/core/types';
import type { Sim } from '@/game/sim';
import { registerVane } from './heistChapters';
import { HEIST_INTRO, VANE, type HeistLine } from './heistText';

/** Seconds of office time to run (quietly) first, so everyone is in when it starts. */
export const HEIST_INTRO_PREROLL = 28;

interface Cue {
  at: number;
  fired: boolean;
  run: () => void;
}

export class HeistIntroScene {
  readonly room: RoomId = 'bullpen';
  readonly length = 24;
  private elapsed = 0;
  private _done = false;
  private cues: Cue[] = [];

  constructor(
    private sim: Sim,
    private onCaption?: (text: string) => void,
    private onSpeak?: (who: string, text: string) => void,
  ) {
    registerVane();
    this.build();
  }

  get done(): boolean {
    return this._done;
  }

  get progress(): number {
    return Math.min(1, this.elapsed / this.length);
  }

  private at(t: number, run: () => void): void {
    this.cues.push({ at: t, fired: false, run });
  }

  private caption(i: number): void {
    const text = HEIST_INTRO.beats[i];
    this.onCaption?.(text);
    // The intro card shows it; the Log keeps it (no second caption on the floor).
    this.sim.narrate(text, { icon: 'play', room: 'bullpen' });
  }

  private speak(line: HeistLine): void {
    const s = this.sim;
    if (!s.person(line.who)?.present) return;
    s.say(line.who, line.text, { kind: line.kind ?? 'say', emotion: line.emotion, to: line.to ?? null });
    if (line.emotion) s.feel(line.who, line.emotion, 0.8, 6);
    this.onSpeak?.(line.who, line.text);
  }

  private build(): void {
    const s = this.sim;
    const [michael, jim, michael2, dwight, pam] = HEIST_INTRO.lines;
    this.at(0.2, () => {
      this.caption(0);
      s.setProp('michael', 'tape');
      s.feel('michael', 'scared', 0.9, 12);
      s.goTo('michael', { anchor: 'spot.bullpen8' }, { style: 'run', doing: 'running out of his office with a tape', stay: 30, stayDoing: 'holding up a tape' });
    });
    this.at(2.6, () => this.speak(michael));
    this.at(4.2, () => {
      s.goTo('jim', { near: 'michael' }, { style: 'walk', doing: 'coming over to Michael', stay: 24 });
      s.goTo('pam', { near: 'michael' }, { style: 'walk', doing: 'coming over to Michael', stay: 24 });
    });
    this.at(5.4, () => this.speak(jim));
    this.at(8.0, () => {
      this.caption(1);
      this.speak(michael2);
    });
    this.at(10.4, () => s.goTo('dwight', { near: 'michael' }, { style: 'run', doing: 'volunteering a plan', stay: 20 }));
    this.at(11.2, () => this.speak(dwight));
    this.at(14.0, () => this.speak(pam));
    this.at(16.0, () => {
      this.caption(2);
      s.spawnVisitor(VANE, { anchor: 'door.entrance' });
      s.setProp(VANE, 'case');
      s.sfx('doorOpen');
      s.goTo(VANE, { anchor: 'spot.bullpen9' }, { style: 'walk', doing: 'walking in with a briefcase', stay: 30, stayDoing: 'holding her briefcase' });
    });
    this.at(18.6, () => this.speak(HEIST_INTRO.vane));
    this.at(21.6, () => this.speak(HEIST_INTRO.michaelAfter));
    this.at(this.length, () => {
      this._done = true;
    });
  }

  update(dt: number): void {
    if (this._done) return;
    this.elapsed += Math.max(0, dt);
    for (const cue of this.cues) {
      if (!cue.fired && this.elapsed >= cue.at) {
        cue.fired = true;
        try {
          cue.run();
        } catch (err) {
          console.error('[intro] cue failed', err);
        }
      }
    }
  }

  skip(): void {
    this._done = true;
  }
}
