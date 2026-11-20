// Loads the office map and its tilesets and builds the existing TiledMapRenderer.
// Shared by the game floor and the dev harness pages so they all draw the same office.

import { Texture } from 'pixi.js';
import { TiledMapRenderer, type TiledMap } from './TiledMapRenderer';

import officeTilesetUrl from '@/assets/tilesets/office-tileset.png?url';
import a5FloorsWallsUrl from '@/assets/tilesets/a5-office-floors-walls.png?url';
import interiorsUrl from '@/assets/tilesets/interiors.png?url';
import officeMapRaw from '@/assets/maps/office.tmj?raw';

const officeMapData = JSON.parse(officeMapRaw) as TiledMap;

/** Patch the map's external tileset refs with the inline metadata the renderer needs (as OfficeFloor does). */
function resolveMap(): TiledMap {
  const m = officeMapData;
  return {
    ...m,
    tilesets: [
      m.tilesets[0],
      { firstgid: 513, image: 'a5', imagewidth: 256, imageheight: 512, tilewidth: 16, tileheight: 16, columns: 16, tilecount: 512 } as never,
      { firstgid: 1025, image: 'interiors', imagewidth: 256, imageheight: 1424, tilewidth: 16, tileheight: 16, columns: 16, tilecount: 1424 } as never
    ]
  };
}

/** Load a texture through an <img>, which also copes with the data: URLs Vite inlines small assets as. */
function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const tex = Texture.from(img);
      tex.source.scaleMode = 'nearest';
      resolve(tex);
    };
    img.onerror = () => reject(new Error('failed to load ' + url.slice(0, 40)));
    img.src = url;
  });
}

/** The drawn office: `getContainer()` holds the tile layers, `getCharacterContainer()` is the y-sorted layer on top of them. */
export async function loadOfficeMap(): Promise<TiledMapRenderer> {
  const textures = await Promise.all([officeTilesetUrl, a5FloorsWallsUrl, interiorsUrl].map(loadTexture));
  return new TiledMapRenderer(resolveMap(), textures);
}
