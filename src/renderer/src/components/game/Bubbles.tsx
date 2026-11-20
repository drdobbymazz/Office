// Speech bubbles over the floor. The only part of the overlay that updates
// every animation frame, so it skips React: it keeps its own DOM nodes, moves
// them with transforms and only rewrites text when another letter is revealed.
//
// Look: the existing thought cloud (scene/office/ThoughtBubble.ts): cream fill,
// hard 1 px ink outline, pixel font, a small tail. say = plain, shout = bigger,
// bold, jagged edge, small shake; whisper = smaller, dashed edge; think =
// italic with a trail of puffs.

import { MutableRefObject, useEffect, useRef } from 'react';
import type { Speech } from '@/game/core/types';
import { useGame } from './ctx';
import { readableOnCream } from './words';
import { displayName } from '@/game/core/cast';

export interface Bounds { left: number; right: number; top: number; bottom: number }

const MAX_W = 220;
const TAIL_H = 6;
const PUFF_H = 13;
const GAP = 4;

interface Node {
  sp: Speech;
  el: HTMLDivElement;
  rev: HTMLSpanElement;
  rest: HTMLSpanElement;
  tail: HTMLDivElement;
  w: number;
  h: number;
  shown: number;
  /** Smoothed extra lift from the overlap pass. */
  lift: number;
  slide: number;
  x: number;
  y: number;
  flipped: boolean;
  dying: boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function tailSvg(kind: Speech['kind'], flipped: boolean): string {
  if (kind === 'think') {
    // Two puffs trailing toward the head, the ThoughtBubble cue for "thinking".
    const y1 = flipped ? 7 : 0, y2 = flipped ? 0 : 8;
    return `<svg width="14" height="${PUFF_H}" viewBox="0 0 14 ${PUFF_H}" shape-rendering="crispEdges" style="display:block">
      <path d="M5 ${y1}h5v1h1v3h-1v1H5V${y1 + 4}H4V${y1 + 1}h1z" fill="var(--cth-ink-900)"/>
      <path d="M5 ${y1 + 1}h5v3H5z" fill="var(--cth-cream-50)"/>
      <path d="M2 ${y2}h3v1h1v2H5v1H2v-1H1V${y2 + 1}h1z" fill="var(--cth-ink-900)"/>
      <path d="M2 ${y2 + 1}h3v2H2z" fill="var(--cth-cream-50)"/>
    </svg>`;
  }
  const ink = kind === 'whisper' ? 'var(--cth-ink-500)' : 'var(--cth-ink-900)';
  // A stepped pixel triangle; its first row erases the box outline so they join.
  const rows = ['#wwwwwwwwww#', '.#wwwwwwww#.', '..#wwwwww#..', '...#wwww#...', '....#ww#....', '.....##.....'];
  const ordered = flipped ? rows.slice().reverse() : rows;
  let ink_d = '', fill_d = '';
  ordered.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      if (r[x] === '#') ink_d += `M${x} ${y}h1v1h-1z`;
      else if (r[x] === 'w') fill_d += `M${x} ${y}h1v1h-1z`;
    }
  });
  return `<svg width="12" height="${TAIL_H}" viewBox="0 0 12 ${TAIL_H}" shape-rendering="crispEdges" style="display:block">
    <path d="${fill_d}" fill="var(--cth-cream-50)"/><path d="${ink_d}" fill="${ink}"/></svg>`;
}

/** A jagged starburst outline for shouts, drawn once per bubble at its measured size. */
function shoutBg(w: number, h: number): SVGSVGElement {
  const pad = 4, tooth = 8, out = 3;
  const W = w + pad * 2, H = h + pad * 2;
  const pts: string[] = [];
  const x0 = pad, y0 = pad, x1 = pad + w, y1 = pad + h;
  for (let x = x0; x < x1; x += tooth) pts.push(`${x},${y0}`, `${Math.min(x + tooth / 2, x1)},${y0 - out}`);
  for (let y = y0; y < y1; y += tooth) pts.push(`${x1},${y}`, `${x1 + out},${Math.min(y + tooth / 2, y1)}`);
  for (let x = x1; x > x0; x -= tooth) pts.push(`${x},${y1}`, `${Math.max(x - tooth / 2, x0)},${y1 + out}`);
  for (let y = y1; y > y0; y -= tooth) pts.push(`${x0},${y}`, `${x0 - out},${Math.max(y - tooth / 2, y0)}`);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('class', 'gu-shout-bg');
  svg.style.left = `${-pad}px`;
  svg.style.top = `${-pad}px`;
  const poly = document.createElementNS(SVG_NS, 'polygon');
  poly.setAttribute('points', pts.join(' '));
  poly.setAttribute('fill', 'var(--cth-cream-50)');
  poly.setAttribute('stroke', 'var(--cth-ink-900)');
  poly.setAttribute('stroke-width', '2');
  poly.setAttribute('stroke-linejoin', 'miter');
  svg.appendChild(poly);
  return svg;
}

export function BubbleLayer({ bounds }: { bounds: MutableRefObject<Bounds> }) {
  const game = useGame();
  const layer = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = layer.current;
    if (!root) return;
    const nodes = new Map<string, Node>();
    const colorCache = new Map<string, { name: string; color: string }>();
    let raf = 0;
    // HUD pieces marked data-avoid (status strip, subtitle ...) count as obstacles; re-read twice a second.
    let avoid: { l: number; t: number; r: number; b: number }[] = [];
    let avoidAt = 0;

    const who = (id: string) => {
      let c = colorCache.get(id);
      if (!c) {
        const p = game.store.getState().people.find((x) => x.id === id);
        c = { name: p?.name ?? displayName(id), color: p ? readableOnCream(p.color) : 'var(--cth-ink-700)' };
        if (p) colorCache.set(id, c);
      }
      return c;
    };

    function make(sp: Speech): Node {
      const el = document.createElement('div');
      el.className = `gu-bubble k-${sp.kind}`;
      const pop = document.createElement('div');
      pop.className = 'gu-pop';
      const inner = document.createElement('div');
      inner.className = 'gu-bubble-inner';
      inner.style.position = 'relative';
      const box = document.createElement('div');
      box.className = 'gu-bubble-box';
      box.style.maxWidth = `${MAX_W}px`;
      box.style.width = 'max-content';
      const meta = who(sp.who);
      const name = document.createElement('span');
      name.className = 'gu-bubble-name';
      name.style.color = meta.color;
      name.textContent = sp.kind === 'whisper' ? `${meta.name}, quietly` : sp.kind === 'think' ? `${meta.name} thinks` : meta.name;
      const text = document.createElement('span');
      text.className = 'gu-bubble-text';
      const rev = document.createElement('span');
      const rest = document.createElement('span');
      rest.className = 'gu-rest';
      rest.textContent = sp.text;
      text.append(rev, rest);
      box.append(name, text);
      const tail = document.createElement('div');
      tail.style.position = 'absolute';
      inner.append(box, tail);
      pop.append(inner);
      el.append(pop);
      el.style.visibility = 'hidden';
      root!.append(el);
      // Measure once with the whole line laid out (unrevealed letters are transparent), then fix the size.
      // offsetWidth rounds to the nearest pixel, which can leave the box half a pixel too narrow and push
      // the last word (or the last letter of a name) onto a new line: measure exactly and round up.
      const w = Math.ceil(box.getBoundingClientRect().width) + 1;
      box.style.width = `${w}px`;
      const h = Math.ceil(box.getBoundingClientRect().height);
      if (sp.kind === 'shout') inner.insertBefore(shoutBg(w, h), box);
      const n: Node = { sp, el, rev, rest, tail, w, h, shown: 0, lift: 0, slide: 0, x: -999, y: -999, flipped: false, dying: false };
      setTail(n, false, w / 2);
      return n;
    }

    function setTail(n: Node, flipped: boolean, tx: number) {
      const k = n.sp.kind;
      const tw = k === 'think' ? 14 : 12;
      const th = k === 'think' ? PUFF_H : TAIL_H;
      if (flipped !== n.flipped || !n.tail.innerHTML) {
        n.tail.innerHTML = tailSvg(k, flipped);
        n.flipped = flipped;
      }
      const left = Math.round(Math.max(4, Math.min(n.w - tw - 4, tx - tw / 2)));
      const pad = k === 'shout' ? 3 : 0;
      n.tail.style.left = `${left}px`;
      n.tail.style.top = flipped ? `${-th + 1 - pad}px` : `${n.h - 1 + pad}px`;
    }

    function kill(id: string, n: Node) {
      if (n.dying) return;
      n.dying = true;
      n.el.style.transition = 'opacity 150ms steps(3)';
      n.el.style.opacity = '0';
      window.setTimeout(() => { n.el.remove(); nodes.delete(id); }, 170);
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const list = game.activeSpeech();
      const live = new Set<string>();
      for (const sp of list) {
        if (now < sp.startedAt || now > sp.startedAt + sp.durationMs) continue;
        live.add(sp.id);
        if (!nodes.has(sp.id)) nodes.set(sp.id, make(sp));
      }
      for (const [id, n] of nodes) if (!live.has(id)) kill(id, n);

      const b = bounds.current;
      const minX = b.left + 4, maxX = window.innerWidth - b.right - 4;
      const minY = b.top + 4, maxY = window.innerHeight - b.bottom - 4;
      type P = { n: Node; hx: number; hy: number; left: number; top: number; flipped: boolean; tailH: number };
      const placed: P[] = [];
      for (const [, n] of nodes) {
        if (n.dying) continue;
        const sp = n.sp;
        // typewriter
        const count = Math.max(0, Math.min(sp.text.length, Math.floor(((now - sp.startedAt) / 1000) * sp.cps)));
        if (count !== n.shown) {
          n.shown = count;
          n.rev.textContent = sp.text.slice(0, count);
          n.rest.textContent = sp.text.slice(count);
        }
        const head = game.headOnScreen(sp.who);
        if (!head.visible || head.x < minX - 20 || head.x > maxX + 20) { n.el.style.visibility = 'hidden'; continue; }
        n.el.style.visibility = 'visible';
        const tailH = (sp.kind === 'think' ? PUFF_H : TAIL_H) + (sp.kind === 'shout' ? 4 : 0);
        let top = head.y - GAP - tailH - n.h;
        let flipped = false;
        if (top < minY) { flipped = true; top = head.y + 40 * head.scale + tailH; }
        const left = Math.max(minX, Math.min(maxX - n.w, head.x - n.w / 2));
        placed.push({ n, hx: head.x, hy: head.y, left, top, flipped, tailH });
      }
      // Keep bubbles apart and off the HUD. Lowest bubble first; for each, try a handful of
      // spots (where it wants to be, above or below each thing already placed, slid
      // sideways) and take the one with the least overlap and the least travel. The tail
      // must still reach the head, so the bubble always spans the head's x.
      placed.sort((a, b2) => b2.top - a.top);
      if (now - avoidAt > 500) {
        avoidAt = now;
        avoid = Array.from(document.querySelectorAll('[data-avoid]')).map((e) => {
          const r = e.getBoundingClientRect();
          return { l: r.left, t: r.top, r: r.right, b: r.bottom };
        }).filter((r) => r.r > r.l);
      }
      const done: { l: number; t: number; r: number; b: number }[] = avoid.slice();
      for (const p of placed) {
        const w = p.n.w, h = p.n.h;
        const below = p.hy + 40 + p.tailH;
        const tops = [p.top, below];
        const lefts = [p.left];
        for (const d of done) {
          tops.push(d.t - h - 4, d.b + 4);
          lefts.push(d.l - w - 4, d.r + 4);
        }
        let best = { l: p.left, t: p.top, score: Infinity };
        for (const t0 of tops) {
          const t = Math.max(minY, Math.min(maxY - h, t0));
          // above the head or below it, never on top of it
          if (t + h > p.hy - p.tailH + 2 && t < p.hy + 30) continue;
          // and close enough that it still reads as theirs: better a small overlap than a stray bubble
          if (t < p.hy ? p.hy - (t + h) > 100 : t - p.hy > 130) continue;
          for (const l0 of lefts) {
            const l = Math.max(minX, Math.min(maxX - w, Math.max(p.hx - w + 12, Math.min(p.hx - 12, l0))));
            let overlap = 0;
            for (const d of done) {
              const ox = Math.min(l + w, d.r + 2) - Math.max(l, d.l - 2);
              const oy = Math.min(t + h, d.b + 2) - Math.max(t, d.t - 2);
              if (ox > 0 && oy > 0) overlap += ox * oy;
            }
            const score = overlap * 1.5 + Math.abs(t - p.top) + Math.abs(l - p.left) * 0.7 + (t > p.hy ? 30 : 0);
            if (score < best.score) best = { l, t, score };
          }
        }
        done.push({ l: best.l, t: best.t, r: best.l + w, b: best.t + h });
        // Ease the nudge so bubbles slide rather than jump.
        const wantY = best.t - p.top, wantX = best.l - p.left;
        p.n.lift += (wantY - p.n.lift) * 0.3;
        p.n.slide += (wantX - p.n.slide) * 0.3;
        if (Math.abs(wantY - p.n.lift) < 0.5) p.n.lift = wantY;
        if (Math.abs(wantX - p.n.slide) < 0.5) p.n.slide = wantX;
        const top = Math.round(p.top + p.n.lift);
        const x = Math.round(p.left + p.n.slide);
        if (x !== p.n.x || top !== p.n.y) {
          p.n.x = x; p.n.y = top;
          p.n.el.style.transform = `translate3d(${x}px, ${top}px, 0)`;
        }
        setTail(p.n, best.t > p.hy, p.hx - x);
      }
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      for (const [, n] of nodes) n.el.remove();
      nodes.clear();
    };
  }, [game, bounds]);

  return <div ref={layer} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />;
}
