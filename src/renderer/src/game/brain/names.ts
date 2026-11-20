// Names: the model writes first names; the game uses ids.

/** Lower-case letters only: "The Inspector" -> "theinspector". */
export function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** "The Inspector" -> "Inspector", "Diane Kowalski" -> "Diane". */
export function firstName(name: string): string {
  const n = name.trim().replace(/^the\s+/i, '');
  return n.split(/\s+/)[0] || name.trim();
}

/**
 * The people in one request, by the first names used in the prompt and JSON.
 * The model writes names; we map them back to ids loosely (any case, full
 * name, "the Inspector", "Marcus Bell").
 */
export class NameMap {
  readonly names: string[] = [];
  readonly ids: string[] = [];
  private byKey = new Map<string, string>();
  private nameById = new Map<string, string>();

  constructor(people: readonly { id: string; name: string }[] = []) {
    for (const p of people) this.add(p.id, p.name);
  }

  add(id: string, name: string): void {
    if (this.nameById.has(id)) return;
    let fn = firstName(name || id);
    if (this.names.some((n) => normName(n) === normName(fn))) fn = name.trim();
    if (this.names.some((n) => normName(n) === normName(fn))) fn = `${fn} (${id})`;
    this.names.push(fn);
    this.ids.push(id);
    this.nameById.set(id, fn);
    for (const key of [fn, name, id, id.replace(/^[a-z]+:/i, '')]) {
      const k = normName(key);
      if (k && !this.byKey.has(k)) this.byKey.set(k, id);
    }
  }

  name(id: string): string {
    return this.nameById.get(id) ?? firstName(id.replace(/^[a-z]+:/i, ''));
  }

  has(id: string): boolean {
    return this.nameById.has(id);
  }

  resolve(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const n = normName(raw);
    if (!n) return null;
    const exact = this.byKey.get(n);
    if (exact) return exact;
    // Loose: "marcusbell" starts with "marcus"; very short fragments are not trusted.
    for (const [k, id] of this.byKey) {
      if (k.length >= 3 && n.startsWith(k)) return id;
      if (n.length >= 4 && k.startsWith(n)) return id;
    }
    return null;
  }
}
