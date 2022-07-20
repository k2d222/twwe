export enum TileFlags {
  NONE   = 0,
  VFLIP  = 1,
  HFLIP  = 2,
  OPAQUE = 4,
  ROTATE = 8,
}

export enum LayerFlags {
  NONE = 0,
  DETAIL = 1,
}

export enum LayerType {
  INVALID = 0,
  TILES   = 2,
  QUADS   = 3,
}

export enum TilesLayerFlags {
  TILES = 0,
  GAME = 1,
  TELE = 2,
  SPEEDUP = 4,
  FRONT = 8,
  SWITCH = 16,
  TUNE = 32,
}

export enum ItemType {
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

export type Group = MapObj & {
  version: number,
  offX: number,
  offY: number,
  paraX: number,
  paraY: number,
  startLayer: number,
  numLayers: number,
  clipping: boolean,
  clipX: number,
  clipY: number,
  clipW: number,
  clipH: number,

  // version 3 extension
  name?: string,
}

export type Layer = MapObj & {
  type: LayerType,
  flags: number,
}

export type QuadsLayer = MapObj & {
  numQuads: number,
  data: number,
  image: number,
  
  // version 3 extension
  name?: string,
}

export type TilesLayer = MapObj & {
  version: number,
  width: number,
  height: number,
  flags: TilesLayerFlags,
  color: Color,
  colorEnv: number,
  colorEnvOffset: number,
  image: number,
  data: number,
  
  // version 3 extension
  name?: string
  
  // ddnet extension
  dataTele?: number
  dataSpeedup?: number
  dataFront?: number
  dataSwitch?: number
  dataTune?: number
}

export type Image = MapObj & {
  width: number,
  height: number,
  external: number,
  name: number,
  data: number,
}

export type Quad = {
  points: Coord[],
  colors: Color[],
  texCoords: Coord[],
  posEnv: number,
  posEnvOffset: number,
  colorEnv: number,
  colorEnvOffset: number,
}

export type Tile = {
  id: number,
  flags: number,
}

export type Tele = {
  number: number,
  id: number,
}

export type Speedup = {
  force: number,
  maxSpeed: number,
  id: number,
  angle: number,
}

export type Switch = {
  number: number,
  id: number,
  flags: number,
  delay: number,
}

export type Tune = {
  number: number,
  id: number,
}

export type AnyTile = Tile | Tele | Speedup | Switch | Tune
