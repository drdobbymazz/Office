import type { RoomId } from '@/game/core/types';
import type { Sim } from '@/game/sim';
import type { EndingId } from './rules';
import { PARK_FINALE, type ParkLine } from './parkText';
import type { WeekNotes } from './types';

interface Cue {
  at: number;
  fired: boolean;
  run: () => void;
}

/** Ending showcase staged live on the Scranton Community Park map. */
export class ParkFinaleScene {
  readonly room: RoomId;
  readonly length = 13;
  private elapsed = 0;
  private _done = false;
  private cues: Cue[] = [];

  constructor(private sim: Sim, private ending: EndingId, private notes: WeekNotes) {
    this.room = ending === 'closed' ? 'outside' : 'boss';
    this.stage();
  }

  get done(): boolean {
    return this._done;
  }

  private stage(): void {
    const s = this.sim;
    const gatherRoom: RoomId = this.ending === 'closed' ? 'outside' : 'bullpen';
    for (const p of s.people()) {
      if (!p.present) continue;
      const target: RoomId = p.id === 'michael' && this.ending !== 'closed' ? 'boss' : gatherRoom;
      s.goTo(p.id, { room: target }, {
        style: this.ending === 'closed' ? 'walk' : 'run',
        doing: this.ending === 'closed' ? 'packing coolers back to the cars' : 'gathering after a day in the park',
        stay: 30,
      });
      s.feel(p.id, this.ending === 'closed' ? 'sad' : this.ending === 'saved' ? 'happy' : 'amused', 0.75, 20);
    }
    if (this.ending === 'saved') {
      s.addEffect({ id: 'park-finale-balloons', kind: 'balloons', room: 'bullpen', count: 5 });
      s.sfx('party');
    }
    const lines: readonly ParkLine[] = PARK_FINALE.lines[this.ending];
    lines.forEach((line, idx) => {
      this.cues.push({
        at: 1.2 + idx * 3.5,
        fired: false,
        run: () => {
          s.say(line.who, line.text, { kind: line.kind ?? 'say', emotion: line.emotion });
        },
      });
    });
    if ((this.notes.parkInspection ?? 0) < 2 && this.ending === 'closed') {
      s.narrate('Ranger Miller locks the park gate behind the last sedan.', { icon: 'warn', room: 'outside', beat: true });
    }
    this.cues.push({
      at: this.length,
      fired: false,
      run: () => {
        this._done = true;
      },
    });
  }

  update(dt: number): void {
    if (this._done) return;
    this.elapsed += dt;
    for (const cue of this.cues) {
      if (!cue.fired && this.elapsed >= cue.at) {
        cue.fired = true;
        cue.run();
      }
    }
  }

  skip(): void {
    this._done = true;
  }
}
