import { PARK_INTRO, type ParkLine } from './parkText';
import type { RoomId } from '@/game/core/types';
import type { Sim } from '@/game/sim';

export const PARK_INTRO_PREROLL = 28;

interface TimedCue {
  at: number;
  fired: boolean;
  run: () => void;
}

/**
 * Live two-part opening cinematic for Episode 2: Day in the Park.
 * Starts in the Office (Michael pitches Team Building -> staff march out the street exit),
 * triggers `onSwitchToPark()` to wipe and swap the world to Scranton Community Park,
 * then shows everyone streaming onto the Great Lawn.
 */
export class ParkIntroScene {
  private elapsed = 0;
  private switched = false;
  private _done = false;
  private officeCues: TimedCue[] = [];
  private parkCues: TimedCue[] = [];
  private parkTime = 0;
  readonly room: RoomId = 'bullpen';
  readonly length = 34;

  constructor(
    private sim: Sim,
    private onSwitchToPark: () => void,
    private onCaption?: (text: string) => void,
    private onSpeak?: (who: string, text: string) => void,
  ) {
    this.buildOfficeCues();
    this.startOfficeOpening();
  }

  get done(): boolean {
    return this._done;
  }

  get progress(): number {
    return Math.min(1, this.elapsed / this.length);
  }

  private speakLine(line: ParkLine): void {
    const s = this.sim;
    s.say(line.who, line.text, { kind: line.kind ?? 'say', emotion: line.emotion });
    if (line.emotion) s.feel(line.who, line.emotion, 0.75, 5);
    this.onSpeak?.(line.who, line.text);
  }

  private startOfficeOpening(): void {
    const s = this.sim;
    this.onCaption?.(PARK_INTRO.beats[0]);
    s.narrate(PARK_INTRO.beats[0], { icon: 'announce', room: 'bullpen', beat: true });
    s.goTo('michael', { room: 'bullpen' }, { style: 'run', doing: 'bursting into the bullpen with a magazine', stay: 24, stayDoing: 'holding up an airline magazine' });
    s.feel('michael', 'excited', 0.9, 18);
  }

  private buildOfficeCues(): void {
    const lines = PARK_INTRO.officeLines;
    const times = [0.8, 3.6, 6.2, 9.4, 11.8, 14.0, 16.0, 18.6];
    lines.forEach((line, idx) => {
      this.officeCues.push({
        at: times[idx] ?? 1 + idx * 2.5,
        fired: false,
        run: () => {
          this.speakLine(line);
          if (idx === 2) {
            this.onCaption?.(PARK_INTRO.beats[1]);
            this.sim.narrate(PARK_INTRO.beats[1], { icon: 'announce', room: 'bullpen', beat: true });
          }
          if (idx === 3) {
            this.sim.goTo('dwight', { near: 'michael' }, { style: 'run', doing: 'volunteering for park security', stay: 12 });
          }
        },
      });
    });

    // Walk everyone toward the street exit!
    this.officeCues.push({
      at: 20.6,
      fired: false,
      run: () => {
        const s = this.sim;
        for (const p of s.people()) {
          if (!p.isCast || !p.present) continue;
          const style = p.id === 'michael' || p.id === 'dwight' || p.id === 'kevin' ? 'run' : 'walk';
          s.goTo(p.id, { anchor: 'exit.street' }, { style, doing: 'heading out to the park cars', stay: 10, stayDoing: 'boarding cars' });
        }
      },
    });

    // Switch world to Scranton Community Park!
    this.officeCues.push({
      at: 24.4,
      fired: false,
      run: () => this.switchToPark(),
    });
  }

  private buildParkCues(): void {
    const lines = PARK_INTRO.parkLines;
    const times = [0.9, 3.8, 6.8];
    lines.forEach((line, idx) => {
      this.parkCues.push({
        at: times[idx] ?? 1 + idx * 3,
        fired: false,
        run: () => {
          this.speakLine(line);
          if (idx === 1) {
            this.sim.goTo('dwight', { room: 'annex' }, { style: 'walk', doing: 'scouting the Duck Pond perimeter', stay: 12 });
          }
        },
      });
    });
    this.parkCues.push({
      at: 9.4,
      fired: false,
      run: () => {
        this._done = true;
      },
    });
  }

  private switchToPark(): void {
    if (this.switched) return;
    this.switched = true;
    this.parkTime = 0;
    this.onSwitchToPark();
    this.onCaption?.(PARK_INTRO.beats[2]);
    this.sim.narrate(PARK_INTRO.beats[2], { icon: 'sparkle', room: 'bullpen', beat: true });
    for (const p of this.sim.people()) {
      if (!p.isCast || !p.present) continue;
      const room: RoomId = p.id === 'michael' ? 'boss' : p.id === 'dwight' ? 'annex' : 'bullpen';
      this.sim.goTo(p.id, { room }, { style: 'walk', doing: 'arriving at Scranton Community Park', stay: 14 });
    }
    this.buildParkCues();
  }

  update(dt: number): void {
    if (this._done) return;
    this.elapsed += dt;
    if (!this.switched) {
      for (const cue of this.officeCues) {
        if (!cue.fired && this.elapsed >= cue.at) {
          cue.fired = true;
          cue.run();
        }
      }
      return;
    }
    this.parkTime += dt;
    for (const cue of this.parkCues) {
      if (!cue.fired && this.parkTime >= cue.at) {
        cue.fired = true;
        cue.run();
      }
    }
  }

  skip(): void {
    if (this._done) return;
    if (!this.switched) this.switchToPark();
    this._done = true;
  }
}
