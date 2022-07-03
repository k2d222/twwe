export enum TileFlag {
  VFLIP  = 1,
  HFLIP  = 2,
  OPAQUE = 4,
  ROTATE = 8,
}

export enum LayerType {
  INVALID = 0,
  TILES   = 2,
  QUADS   = 3,
}

export enum TileLayerFlags {
  TILES = 0,
  GAME = 1,
  TELE = 2,
  SPEEDUP = 4,
  FRONT = 8,
  SWITCH = 16,
  TUNE = 32,
}

export enum MapItemType {
  VERSION   = 0,
  INFO      = 1,
  IMAGE     = 2,
  ENVELOPE  = 3,
  GROUP     = 4,
  LAYER     = 5,
  ENVPOINTS = 6,
}

export type Color = {
  r: number,
  g: number,
  b: number,
  a: number,
}

export type Coord = {
  x: number,
  y: number,
}

export type MapObj = {
  version: number,
}

export type MapGroupObj = MapObj & {
  offX: number,
  offY: number,
  paraX: number,
  paraY: number,
  startLayer: number,
  numLayers: number,
  useClipping: number,
  clipX: number,
  clipY: number,
  clipW: number,
  clipH: number,

  // version 3 extension
  name: string,
}

export type MapLayer = MapObj & {
  type: LayerType,
  flags: number,
}

export type MapLayerQuads = MapObj & {
  numQuads: number,
  data: number,
  image: number,
  
  // version 3 extension
  name: string,
}

export type MapLayerTiles = MapObj & {
  version: number,
  width: number,
  height: number,
  flags: TileLayerFlags,
  color: Color,
  colorEnv: number,
  colorEnvOffset: number,
  image: number,
  data: number,
  
  // version 3 extension
  name: string
}

export type MapImage = MapObj & {
  width: number,
  height: number,
  external: number,
  name: number,
  data: number,
}

export type LayerQuad = {
  points: Coord[],
  colors: Color[],
  texCoords: Coord[],
  posEnv: number,
  posEnvOffset: number,
  colorEnv: number,
  colorEnvOffset: number,
}

export type LayerTile = {
  index: number,
  flags: number,
}
