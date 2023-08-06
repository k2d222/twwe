// types for the mapdir file format.
// current version: twmap 0.10.0

export type Point<T> = {
  x: T,
  y: T
}

export type Color<T> = {
  r: T,
  g: T,
  b: T,
  a: T,
}

type FixedNum = string

export interface Version {
  type: 'ddnet06'
  created_by: string
}

export interface Info {
  author: string
  version: string
  credits: string
  license: string
  settings: string[]
}

export interface Group {
  name: string,
  offset: Point<FixedNum>,
  parallax: Point<FixedNum>,
  clipping: boolean,
  clip: {
    x: FixedNum,
    y: FixedNum,
    w: FixedNum,
    h: FixedNum,
  }
}

export interface Quad {
  corners: Point<FixedNum>[], // length: 4
  position: Point<FixedNum>,
  colors: Color<number>[], // length: 4
  texture_coords: {
    u: FixedNum,
    v: FixedNum,
  }[], // length: 4
  position_env: number | null,
  position_env_offset: number,
  color_env: number | null,
  color_env_offset: number,
}

export enum LayerKind {
  Quads = 'quads',
  Tiles = 'tiles',
  Game = 'game',
  Tele = 'tele',
  Speedup = 'speedup',
  Front = 'front',
  Switch = 'switch',
  Tune = 'tune',
}

export interface LayerCommon {
  type: LayerKind,
  name: string,
  detail: boolean,
}

export interface QuadsLayer extends LayerCommon {
  type: LayerKind.Quads,
  quads: Quad[]
}

export interface TileCommon {
  x: number,
  y: number,
  id: number,
}

export interface Tile extends TileCommon {
  mirrored: boolean,
  rotation: number,
}

export interface Tele extends TileCommon {
  number: number
}

export interface Speedup extends TileCommon {
  force: number,
  max_speed: number,
  angle: number,
}

export interface Switch extends TileCommon {
  mirrored: boolean,
  rotation: number,
  number: number
  delay: number
}

export interface Tune extends TileCommon {
  number: number
}

export type AnyTile = Tile | Tele | Speedup | Switch | Tune

export interface AutomapperConfig {
  config: number | null,
  seed: number,
  automatic: boolean,
}

export interface TilesLayerCommon extends LayerCommon {
  width: number,
  height: number,
  tiles: AnyTile[]
}

export interface TilesLayer extends TilesLayerCommon {
  type: LayerKind.Tiles,
  color: Color<number>,
  color_env: number | null,
  color_env_offset: number,
  image: string,
  automapper_config: AutomapperConfig
}
export interface GameLayer extends TilesLayerCommon {
  type: LayerKind.Game,
}
export interface TeleLayer extends TilesLayerCommon {
  type: LayerKind.Tele,
}
export interface SpeedupLayer extends TilesLayerCommon {
  type: LayerKind.Speedup,
}
export interface FrontLayer extends TilesLayerCommon {
  type: LayerKind.Front,
}
export interface SwitchLayer extends TilesLayerCommon {
  type: LayerKind.Switch,
}
export interface TuneLayer extends TilesLayerCommon {
  type: LayerKind.Tune,
}

export type Layer =
  QuadsLayer | 
  TilesLayer | 
  GameLayer | 
  TeleLayer | 
  SpeedupLayer | 
  FrontLayer | 
  SwitchLayer | 
  TuneLayer

export enum EnvelopeType {
  Color = 'color',
  Position = 'position',
  Sound = 'sound',
}

export interface EnvelopeCommon {
  type: EnvelopeType,
  name: string,
  synchronized: boolean,
}

export enum CurveType {
  Step = 'step',
  Linear = 'linear',
  Slow = 'slow',
  Fast = 'fast',
  Smooth = 'smooth',
  Bezier = 'bezier',
}

export interface EnvelopePoint<T> {
  time: number,
  content: T
  type: CurveType
}

export interface ColorEnvelope extends EnvelopeCommon {
  type: EnvelopeType.Color,
  points: EnvelopePoint<Color<FixedNum>>[]
}

export interface PositionEnvelope extends EnvelopeCommon {
  type: EnvelopeType.Position,
  points: EnvelopePoint<Point<FixedNum>>[]
}

export interface SoundEnvelope extends EnvelopeCommon {
  type: EnvelopeType.Sound,
  points: EnvelopePoint<FixedNum>[]
}

export type Envelope = ColorEnvelope | PositionEnvelope | SoundEnvelope
