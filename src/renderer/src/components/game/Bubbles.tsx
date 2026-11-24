// Speech bubbles over the floor. The only part of the overlay that updates
// every animation frame, so it skips React: it keeps its own DOM nodes, moves
// them with transforms and only rewrites text when another letter is revealed.
//
// Look: the existing thought cloud (scene/office/ThoughtBubble.ts): cream fill,
// hard 1 px ink outline, pixel font, a small tail. say = plain, shout = bigger,
// bold, jagged edge, small shake; whisper = smaller, dashed edge; think = softer
// ink with a trail of puffs.
//
// Rules (bubbleLayout.ts): the newest line gets the best spot, at most three full
// bubbles at once, two text boxes never overlap, older finished lines dim, and a
// line with no room shows as a small "..." over the speaker until there is room.
// At the fitted zoom bubbles are narrower, so one does not cover a whole room.

import { MutableRefObject, useEffect, useRef } from 'react';
import type { Speech } from '@/game/core/types';
import { useGame } from './ctx';
import { readableOnCream } from './words';
import { displayName } from '@/game/core/cast';
import { layoutBubbles, type BubbleIn, type Box } from './bubbleLayout';

export interface Bounds { left: number; right: number; top: number; bottom: number }

/**
 * Lines the floor cannot show in full right now (speaker off screen or under the panel, or the line
 * folded into a "..." tag), by speech id. The subtitle carries exactly these, so every line can be
 * read somewhere and none is shown twice.
 */
export const unshownLines = new Set<string>();

const MAX_W = 260;
/** Bubble width when the camera shows the whole office (a person is a few pixels tall there). */
const MAX_W_FITTED = 204;
/** Zoom (CSS px per art px) above which bubbles may use their full width. */
const CLOSE_ZOOM = 1.6;
/** A line that lost its room stays a tag at least this long, so bubbles do not flicker. */
const TAG_HOLD_MS = 700;
const TAIL_H = 6;
const PUFF_H = 13;
const GAP = 4;

interface Node {
  sp: Speech;
  el: HTMLDivElement;
  inner: HTMLDivElement;
  box: HTMLDivElement;
  rev: HTMLSpanElement;
  rest: HTMLSpanElement;
  tail: HTMLDivElement;
  w: number;
  h: number;
  shown: number;
  typed: number;
  x: number;
  y: number;
  flipped: boolean;
  dying: boolean;
  /** Showing as a small "..." tag instead of the full bubble. */
  tag: boolean;
  tagUntil: number;
  dim: boolean;
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

    function make(sp: Speech, maxW: number): Node {
      const el = document.createElement('div');
      el.className = `gu-bubble k-${sp.kind}`;
      const pop = document.createElement('div');
      pop.className = 'gu-pop';
      const inner = document.createElement('div');
      inner.className = 'gu-bubble-inner';
      inner.style.position = 'relative';
      const box = document.createElement('div');
      box.className = 'gu-bubble-box';
      box.style.maxWidth = `${maxW}px`;
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
      const tag = document.createElement('div');
      tag.className = 'gu-bubble-tag';
      tag.textContent = '...';
      el.append(pop, tag);
      el.style.visibility = 'hidden';
      root!.append(el);
      // Measure width once across the whole line so text never jumps horizontally, then collapse `rest`
      // so the bubble grows height cleanly line by line as the typewriter reveals characters.
      const w = Math.ceil(box.getBoundingClientRect().width) + 1;
      box.style.width = `${w}px`;
      rest.style.display = 'none';
      const h = Math.ceil(box.getBoundingClientRect().height);
      if (sp.kind === 'shout') inner.insertBefore(shoutBg(w, h), box);
      const n: Node = { sp, el, inner, box, rev, rest, tail, w, h, shown: 0, typed: 0, x: -999, y: -999, flipped: false, dying: false, tag: false, tagUntil: 0, dim: false };
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

    let prevNow = performance.now();
    function frame() {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0, (now - prevNow) / 1000));
      prevNow = now;
      const st = game.store.getState();
      const rate = st.paused ? 0 : (st.speed || 1);
      const list = game.activeSpeech();
      const live = new Set<string>();
      for (const sp of list) {
        // A thought cleared by the game is an empty line: nothing to show (no "Michael thinks" over a blank box).
        if (!sp.text.trim()) continue;
        if (now < sp.startedAt) continue;
        live.add(sp.id);
        if (!nodes.has(sp.id)) {
          // Narrower at the fitted zoom, where a 220 px bubble would cover a room and a half.
          const zoom = game.headOnScreen(sp.who).scale;
          nodes.set(sp.id, make(sp, zoom < CLOSE_ZOOM ? MAX_W_FITTED : MAX_W));
        }
      }
      for (const [id, n] of nodes) if (!live.has(id)) kill(id, n);

      const b = bounds.current;
      const area = {
        minX: b.left + 4, maxX: window.innerWidth - b.right - 4,
        minY: b.top + 4, maxY: window.innerHeight - b.bottom - 4
      };
      if (now - avoidAt > 500) {
        avoidAt = now;
        avoid = Array.from(document.querySelectorAll('[data-avoid]')).map((e) => {
          const r = e.getBoundingClientRect();
          return { l: r.left, t: r.top, r: r.right, b: r.bottom };
        }).filter((r) => r.r > r.l);
      }

      const items: BubbleIn[] = [];
      const typedOut = new Map<string, boolean>();
      unshownLines.clear();
      for (const [id, n] of nodes) {
        if (n.dying) continue;
        const sp = n.sp;
        // typewriter
        n.typed = Math.min(sp.text.length, n.typed + dt * sp.cps * rate);
        const count = Math.floor(n.typed);
        if (count !== n.shown) {
          n.shown = count;
          n.rev.textContent = sp.text.slice(0, count);
          const nextH = Math.ceil(n.box.getBoundingClientRect().height);
          if (nextH !== n.h) {
            n.h = nextH;
            if (sp.kind === 'shout') {
              const oldBg = n.inner.querySelector('.gu-shout-bg');
              const nextBg = shoutBg(n.w, n.h);
              if (oldBg) oldBg.replaceWith(nextBg);
              else n.inner.insertBefore(nextBg, n.box);
            }
          }
        }
        typedOut.set(id, count >= sp.text.length);
        const head = game.headOnScreen(sp.who);
        if (!head.visible || head.x < area.minX - 20 || head.x > area.maxX + 20) {
          n.el.style.visibility = 'hidden';
          unshownLines.add(id);
          continue;
        }
        n.el.style.visibility = 'visible';
        const tailH = (sp.kind === 'think' ? PUFF_H : TAIL_H) + (sp.kind === 'shout' ? 4 : 0);
        items.push({
          id, hx: head.x, hy: head.y, w: n.w, h: n.h, tailH, below: 40 * Math.max(0.75, head.scale),
          startedAt: sp.startedAt, holdTag: n.tag && now < n.tagUntil
        });
      }

      const placed = layoutBubbles(items, avoid as Box[], area);
      // The newest full bubble reads at full strength; older ones that have finished typing step back.
      let newest = -Infinity;
      for (const p of placed) if (p.full) newest = Math.max(newest, nodes.get(p.id)?.sp.startedAt ?? -Infinity);
      for (const p of placed) {
        const n = nodes.get(p.id);
        if (!n) continue;
        const wasTag = n.tag;
        if (p.full === n.tag) {
          n.tag = !p.full;
          if (n.tag) n.tagUntil = now + TAG_HOLD_MS;
          n.el.classList.toggle('is-tag', n.tag);
        }
        if (!p.full) unshownLines.add(p.id);
        const dim = p.full && n.sp.startedAt < newest && !!typedOut.get(p.id);
        if (dim !== n.dim) { n.dim = dim; n.el.classList.toggle('is-dim', dim); }
        // Slide to the new spot (jump when it changes between tag and bubble).
        const jump = wasTag !== n.tag || n.x < -900;
        const x = jump ? p.left : n.x + (p.left - n.x) * 0.3;
        const y = jump ? p.top : n.y + (p.top - n.y) * 0.3;
        const rx = Math.abs(p.left - x) < 0.5 ? p.left : Math.round(x);
        const ry = Math.abs(p.top - y) < 0.5 ? p.top : Math.round(y);
        if (rx !== n.x || ry !== n.y) {
          n.x = rx; n.y = ry;
          n.el.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
        }
        if (p.full) {
          const it = items.find((q) => q.id === p.id);
          if (it) setTail(n, p.flipped, it.hx - rx);
        }
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
