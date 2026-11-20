// Small helpers shared by the brain: randomness, text, averages.

export type Rng = () => number;

export const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

export function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** "Marcus", "Marcus and Rosa", "Marcus, Rosa and Tobi". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? 'Someone';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Rolling average of the last few samples. */
export class Rolling {
  private samples: number[] = [];
  constructor(private size = 6) {}
  add(v: number | undefined): void {
    if (v === undefined || !Number.isFinite(v) || v <= 0) return;
    this.samples.push(v);
    if (this.samples.length > this.size) this.samples.shift();
  }
  get value(): number | undefined {
    if (!this.samples.length) return undefined;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }
}
