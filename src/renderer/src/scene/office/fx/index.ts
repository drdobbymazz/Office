// The effects layer for the office floor: everything the Overseer can make
// happen, drawn as pixel art at the map's resolution.
//
//   sync(effects)  every frame: create, follow and retire lasting effects
//   cue(c)         one-shots
//   update(dt, f)  advance everything; f.people drives emotes and status marks

import { Container } from 'pixi.js';
import type { CreateFxView, EffectInstance, FxCue, FxFrame, FxView, ViewRect } from '@/game/view/api';
import { WORLD_H, WORLD_W } from '@/game/core/world';
import type { Env, Lasting } from './core';
import { DarkLayer } from './dark';
import { Particles } from './particles';
import { emitDrift, emitSplash } from './emit';
import { Cues } from './cues';
import { Statuses } from './statuses';
import { Balloons, Barrier, Bees, CensorCloud, Cloud, Emoji, Fire, Flood, Item, Quake, Rain, Screens, Smoke, Spray, Sprinklers } from './lasting';
import { Creature, Ghost, Ufo } from './beings';
import { Alarm, Beam, Dark, Daylight, Disco, Light, TimeFreeze, ZeroG } from './overlays';

type AnyLasting = Lasting<EffectInstance>;

function make(inst: EffectInstance, env: Env): AnyLasting {
  switch (inst.kind) {
    case 'fire': return new Fire(inst, env) as unknown as AnyLasting;
    case 'smoke': return new Smoke(inst, env) as unknown as AnyLasting;
    case 'sprinklers': return new Sprinklers(inst, env) as unknown as AnyLasting;
    case 'flood': return new Flood(inst, env) as unknown as AnyLasting;
    case 'dark': return new Dark(inst, env) as unknown as AnyLasting;
    case 'light': return new Light(inst, env) as unknown as AnyLasting;
    case 'alarm': return new Alarm(inst, env) as unknown as AnyLasting;
    case 'quake': return new Quake(inst, env) as unknown as AnyLasting;
    case 'spray': return new Spray(inst, env) as unknown as AnyLasting;
    case 'ufo': return new Ufo(inst, env) as unknown as AnyLasting;
    case 'ghost': return new Ghost(inst, env) as unknown as AnyLasting;
    case 'creature': return new Creature(inst, env) as unknown as AnyLasting;
    case 'bees': return new Bees(inst, env) as unknown as AnyLasting;
    case 'disco': return new Disco(inst, env) as unknown as AnyLasting;
    case 'rain': return new Rain(inst, env) as unknown as AnyLasting;
    case 'balloons': return new Balloons(inst, env) as unknown as AnyLasting;
    case 'item': return new Item(inst, env) as unknown as AnyLasting;
    case 'emoji': return new Emoji(inst, env) as unknown as AnyLasting;
    case 'timeFreeze': return new TimeFreeze(inst, env) as unknown as AnyLasting;
    case 'zeroG': return new ZeroG(inst, env) as unknown as AnyLasting;
    case 'beam': return new Beam(inst, env) as unknown as AnyLasting;
    case 'cloud': return new Cloud(inst, env) as unknown as AnyLasting;
    case 'barrier': return new Barrier(inst, env) as unknown as AnyLasting;
    case 'screens': return new Screens(inst, env) as unknown as AnyLasting;
    case 'censorCloud': return new CensorCloud(inst, env) as unknown as AnyLasting;
    case 'daylight': return new Daylight(inst, env) as unknown as AnyLasting;
  }
}

const FULL_VIEW: ViewRect = { x0: 0, y0: 0, x1: WORLD_W, y1: WORLD_H, zoom: 1 };

export const createFxView: CreateFxView = (_renderer, sorted) => {
  const floor = new Container();
  floor.label = 'fx.floor';
  const air = new Container();
  air.label = 'fx.air';
  const airLow = new Container();
  const tint = new Container();
  const high = new Container();
  air.addChild(airLow, tint, high);
  const screen = new Container();
  screen.label = 'fx.screen';

  const dark = new DarkLayer();
  // Darkness sits over the washes (disco, alarm) but under lightning and marks.
  tint.addChild(dark.sprite);
  const tintFx = new Container();
  tint.addChildAt(tintFx, 0);

  const parts = new Particles({ floor, sorted, air: airLow, high });
  const env: Env = {
    floor, sorted, air: airLow, tint: tintFx, high, screen, parts, dark,
    time: 0, view: FULL_VIEW, people: [], frame: null,
    cue: (c) => cues.fire(c)
  };
  parts.onSplash = (x, y, fx) => {
    if (fx === 1) emitDrift(parts, x, y, 1, 1.5, 0xd8ccb4, 0, 0, 3, 0.35, 0.8);
    else emitSplash(parts, x, y);
  };
  const cues = new Cues(env);
  const statuses = new Statuses(env);
  const live = new Map<string, AnyLasting>();
  const seen = new Set<string>();

  const view: FxView = {
    floor,
    air,
    screen,

    sync(effects: readonly EffectInstance[]): void {
      seen.clear();
      for (let i = 0; i < effects.length; i++) {
        const inst = effects[i];
        seen.add(inst.id);
        let e = live.get(inst.id);
        if (e && e.inst.kind !== inst.kind) {
          e.dispose();
          live.delete(inst.id);
          e = undefined;
        }
        if (!e) {
          try {
            e = make(inst, env);
          } catch (err) {
            console.error('[fx] could not create', inst.kind, err);
            continue;
          }
          live.set(inst.id, e);
        } else {
          e.dying = false;
          e.apply(inst);
        }
      }
      for (const [id, e] of live) if (!seen.has(id)) e.dying = true;
    },

    cue(c: FxCue): void {
      try {
        cues.fire(c);
      } catch (err) {
        console.error('[fx] cue failed', c.kind, err);
      }
    },

    update(dt: number, frame: FxFrame): void {
      const step = Math.max(0, Math.min(0.1, dt));
      env.time += step;
      env.frame = frame;
      env.view = frame.view;
      env.people = frame.people;
      dark.begin();
      for (const [id, e] of live) {
        e.age += step;
        if (e.dying) e.vis = Math.max(0, e.vis - step / e.outroT);
        else e.vis = Math.min(1, e.vis + step / e.introT);
        e.tick(step);
        if (e.dying && e.vis <= 0) {
          e.dispose();
          live.delete(id);
        }
      }
      cues.update(step);
      statuses.update(step);
      parts.update(step, frame.view);
      dark.end(step);
    },

    clear(): void {
      for (const e of live.values()) e.dispose();
      live.clear();
      cues.clear();
      statuses.clear();
      parts.clear();
      dark.clear();
    },

    destroy(): void {
      view.clear();
      parts.destroy();
      dark.destroy();
      floor.destroy({ children: true });
      air.destroy({ children: true });
      screen.destroy({ children: true });
    }
  };
  return view;
};
