// A person's "voice": short synthesized blips that play as their line types out.

export interface VoiceDef {
  /** Base pitch in Hz (about 100 very deep .. 360 high). */
  pitch: number;
  /** Tone colour. */
  wave: 'sine' | 'triangle' | 'square' | 'sawtooth';
  /** Random pitch spread per blip, in semitones. */
  spread: number;
  /** Talking speed multiplier (1 = normal). */
  speed: number;
}
