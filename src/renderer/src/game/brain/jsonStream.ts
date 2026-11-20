// Reading JSON as it streams in, and forgiving parsing of what the model wrote.
//
// The model writes at about 7 tokens a second, so a three-line scene takes
// twenty seconds or more. ArrayItemStream hands over each complete item of the
// top-level array (e.g. "lines") the moment its closing brace arrives, so the
// first line can play while the rest is still being written.

interface Frame {
  t: '{' | '[';
  /** Key this container sits under in its parent object (null in arrays / root). */
  key: string | null;
  start: number;
  /** In an object: is the next string a key? */
  expectKey: boolean;
  pendingKey: string | null;
}

/** Remove reasoning blocks and markdown fences the model may wrap its reply in. */
export function stripNoise(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const open = t.search(/<think>/i);
  if (open >= 0) t = t.slice(0, open);
  t = t.replace(/^\s*```[a-zA-Z]*\s*$/gm, '');
  return t;
}

/** Remove reasoning blocks only (used on streaming text). */
export function stripThink(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const open = t.search(/<think>/i);
  if (open >= 0) t = t.slice(0, open);
  return t.replace(/^\s+/, '');
}

/**
 * Incremental extractor for the items of one array under the root object.
 * push(soFar) with the whole text so far; returns the raw JSON text of each
 * item that has completed since the last push. Copes with braces, brackets,
 * quotes and escapes inside strings, and with chatter before the root object.
 */
export class ArrayItemStream {
  private text = '';
  private pos = 0;
  private stack: Frame[] = [];
  private inStr = false;
  private esc = false;
  private strStart = -1;
  private rootDone = false;
  private found = 0;
  private emitted = 0;

  constructor(private readonly key: string) {}

  /** How many items have been handed out so far. */
  get count(): number {
    return this.emitted;
  }

  push(soFar: string): string[] {
    if (!soFar.startsWith(this.text)) this.reset();
    this.text = soFar;
    const out: string[] = [];
    const t = soFar;
    for (; this.pos < t.length && !this.rootDone; this.pos++) {
      const c = t[this.pos];
      const top = this.stack[this.stack.length - 1];
      if (!top) {
        if (c === '{') this.stack.push({ t: '{', key: null, start: this.pos, expectKey: true, pendingKey: null });
        continue;
      }
      if (this.inStr) {
        if (this.esc) this.esc = false;
        else if (c === '\\') this.esc = true;
        else if (c === '"') {
          this.inStr = false;
          if (top.t === '{' && top.expectKey) {
            const raw = t.slice(this.strStart, this.pos + 1);
            try {
              top.pendingKey = JSON.parse(raw) as string;
            } catch {
              top.pendingKey = raw.slice(1, -1);
            }
            top.expectKey = false;
          }
        }
        continue;
      }
      switch (c) {
        case '"':
          this.inStr = true;
          this.strStart = this.pos;
          break;
        case '{':
        case '[': {
          const key = top.t === '{' ? top.pendingKey : null;
          this.stack.push({ t: c, key, start: this.pos, expectKey: c === '{', pendingKey: null });
          break;
        }
        case '}':
        case ']': {
          const done = this.stack.pop()!;
          if (this.stack.length === 0) {
            this.rootDone = true;
            break;
          }
          // An object closing as an item of root.<key>[]: stack is [root, array].
          if (done.t === '{' && this.stack.length === 2) {
            const arr = this.stack[1];
            if (arr.t === '[' && arr.key === this.key) {
              this.found++;
              if (this.found > this.emitted) {
                out.push(t.slice(done.start, this.pos + 1));
                this.emitted++;
              }
            }
          }
          break;
        }
        case ',':
          if (top.t === '{') {
            top.expectKey = true;
            top.pendingKey = null;
          }
          break;
        default:
          break;
      }
    }
    return out;
  }

  private reset(): void {
    // The text was rewritten (e.g. a reasoning block was stripped). Rescan from
    // the start but never hand out an item twice.
    this.text = '';
    this.pos = 0;
    this.stack = [];
    this.inStr = false;
    this.esc = false;
    this.strStart = -1;
    this.rootDone = false;
    this.found = 0;
  }
}

/**
 * Forgiving parse of a whole reply: strips reasoning and fences, takes the
 * outermost JSON object, removes trailing commas, and when the reply was cut
 * off (token cap, dropped connection) closes it after the last complete
 * object or array, so complete lines survive.
 */
export function parseLoose(text: string): { value: Record<string, unknown>; repaired: boolean } | null {
  const t = stripNoise(text);
  const i = t.indexOf('{');
  if (i < 0) return null;

  const stack: ('{' | '[')[] = [];
  let inStr = false;
  let esc = false;
  let end = -1;
  let safePos = -1;
  let safeClosers = '';
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') {
      stack.pop();
      if (stack.length === 0) {
        end = j;
        break;
      }
      safePos = j + 1;
      safeClosers = stack
        .slice()
        .reverse()
        .map((s) => (s === '{' ? '}' : ']'))
        .join('');
    }
  }

  const attempt = (s: string): Record<string, unknown> | null => {
    for (const candidate of [s, s.replace(/,\s*([}\]])/g, '$1')]) {
      try {
        const v: unknown = JSON.parse(candidate);
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
      } catch {
        /* try the next form */
      }
    }
    return null;
  };

  if (end >= 0) {
    const v = attempt(t.slice(i, end + 1));
    if (v) return { value: v, repaired: false };
  }
  if (safePos < 0) return null;
  const body = t.slice(i, safePos).replace(/[\s,]+$/, '');
  const v = attempt(body + safeClosers);
  return v ? { value: v, repaired: true } : null;
}
