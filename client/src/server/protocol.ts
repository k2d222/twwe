import type * as Info from '../twmap/types'

// This file contains the type of messages sent and received via websocket.
// It must correspond with file protocol.rs in server.

// MAPS

export interface CreateBlankParams {
  // version: MapVersion // TODO
  width: number,
  height: number,
  defaultLayers: boolean,
}

export interface CreateCloneParams {
  clone: string,
}

export interface CreateUploadParams {
}

export type CreateMap = {
  name: string,
} & (
  { blank: CreateBlankParams } |
  { clone: CreateCloneParams } |
  { upload: CreateUploadParams }
)


export interface JoinMap {
  name: string,
}

export interface MapListElement {
  author: string,
  version: string,
  credits: string,
  license: string,
  settings: string[],
}

export interface EditMap {
  // name: string, // TODO
  info: MapListElement
}

export interface SaveMap {
  name: string,
}

export interface DeleteMap {
  name: string,
}

// GROUPS

export interface CreateGroup {
  name: string
}

// must have exactly one of the optional fields
export interface EditGroup {
  group: number,
  offX?: number,
  offY?: number,
  paraX?: number,
  paraY?: number,
  clipping?: boolean,
  clipX?: number,
  clipY?: number,
  clipW?: number,
  clipH?: number,
  name?: string,
}

export interface ReorderGroup {
  group: number,
  newGroup: number,
}

export interface DeleteGroup {
  group: number,
}

// LAYERS

export type CreateLayer = {
  kind: 'tiles' | 'quads' | 'front' | 'tele' | 'speedup' | 'switch' | 'tune' | 'sounds', 
  group: number,
  name: string,
}

export interface CommonLayerChange {
  group: number,
  layer: number,
  flags?: number,
  name?: string,
}

export interface EditTilesLayer extends CommonLayerChange {
  width?: number,
  height?: number,
  color?: Info.Color,
  colorEnv?: number | null,
  colorEnvOffset?: number,
  image?: number | null,
}

export interface EditQuadsLayer extends CommonLayerChange {
  // TODO
  image?: number,
}

export type EditLayer = EditTilesLayer | EditQuadsLayer

export interface ReorderLayer {
  group: number,
  layer: number,
  newGroup: number,
  newLayer: number,
}

export interface DeleteLayer {
  group: number,
  layer: number,
}

export type EditTileParams = 
  Info.Tile & { type: 'tile' } |
  Info.Tele & { type: 'tele' } |
  Info.Speedup & { type: 'speedup' } |
  Info.Switch & { type: 'switch' } |
  Info.Tune & { type: 'tune' }

export type EditTile = EditTileParams & {
  group: number,
  layer: number,
  x: number,
  y: number,
}

export type CreateQuad = {
  group: number,
  layer: number,
  points: Info.Coord[],
  colors: Info.Color[],
  texCoords: Info.Coord[],
  posEnv: number | null,
  posEnvOffset: number,
  colorEnv: number | null,
  colorEnvOffset: number,
}

export type EditQuad = {
  group: number,
  layer: number,
  quad: number,
  points: Info.Coord[],
  colors: Info.Color[],
  texCoords: Info.Coord[],
  posEnv: number | null,
  posEnvOffset: number,
  colorEnv: number | null,
  colorEnvOffset: number,
}

export interface DeleteQuad {
  group: number,
  layer: number,
  quad: number,
}


// ENVELOPES

export type EnvType = 'invalid' | 'sound' | 'position' | 'color'
export const envTypes: EnvType[] = [ 'invalid', 'sound', 'invalid', 'position', 'color' ]

export interface CreateEnvelope {
  name: string,
  kind: 'color' | 'position' | 'sound',
}

export type CurveTypeStr = 'step' | 'linear' | 'slow' | 'fast' | 'smooth' | 'bezier'
export const curveTypes: CurveTypeStr[] = [ 'step', 'linear', 'slow', 'fast', 'smooth', 'bezier' ]

export interface EnvPoint<T> {
  time: number,
  content: T,
  type: CurveTypeStr,
}

export interface EditEnvelope {
  index: number,
  name?: string,
  synchronized?: boolean,
  points?: {
    type: 'color',
    content: EnvPoint<Info.Color>[],
  } | {
    type: 'position',
    content: EnvPoint<{ x: number, y: number, rotation: number }>[],
  } | {
    type: 'sound',
    content: EnvPoint<number>[],
  }
}

export interface DeleteEnvelope {
  index: number
}

// MISC

export interface SendMap {
  name: string,
}

export interface ListUsers {
  globalCount: number,
  roomCount: number,
}

export interface MapInfo {
  name: string,
  users: number,
}

export interface ListMaps {
  maps: MapInfo[],
}

export interface CreateImage {
  name: string,
  index: number,
  external: boolean,
}

export interface DeleteImage {
  index: number,
}

export interface SendImage {
  index: number,
}

export interface ImageInfo {
  name: string,
  index: number,
  width: number,
  height: number,
}

export type ServerError = {
  serverError: null,
} | {
  mapError: string,
}

// queries (name and content type) that can be sent by the client
export interface RequestContent {
  'createmap': CreateMap
  'joinmap': JoinMap
  'editmap': EditMap
  'savemap': SaveMap
  'deletemap': DeleteMap
  
  'creategroup': CreateGroup
  'editgroup': EditGroup
  'reordergroup': ReorderGroup
  'deletegroup': DeleteGroup
  
  'createlayer': CreateLayer
  'editlayer': EditLayer
  'reorderlayer': ReorderLayer
  'deletelayer': DeleteLayer
  
  'edittile': EditTile

  'createquad': CreateQuad
  'editquad': EditQuad
  'deletequad': DeleteQuad

  'createenvelope': CreateEnvelope
  'editenvelope': EditEnvelope
  'deleteenvelope': DeleteEnvelope

  'sendmap': SendMap
  'listusers': null
  'listmaps': null

  'createimage': CreateImage
  'sendimage': SendImage
  'deleteimage': DeleteImage
}

// queries (name and content type) that can be received from the server
export interface ResponseContent {
  'createmap': CreateMap
  'joinmap': JoinMap
  'editmap': EditMap
  'savemap': SaveMap
  'deletemap': DeleteMap
  
  'creategroup': CreateGroup
  'editgroup': EditGroup
  'reordergroup': ReorderGroup
  'deletegroup': DeleteGroup
  
  'createlayer': CreateLayer
  'editlayer': EditLayer
  'reorderlayer': ReorderLayer
  'deletelayer': DeleteLayer
  
  'edittile': EditTile

  'createquad': CreateQuad
  'editquad': EditQuad
  'deletequad': DeleteQuad

  'createenvelope': CreateEnvelope
  'editenvelope': EditEnvelope
  'deleteenvelope': DeleteEnvelope

  'sendmap': ArrayBuffer
  'listusers': ListUsers
  'listmaps': ListMaps
  'uploadcomplete': null

  'createimage': CreateImage
  'sendimage': ImageInfo
  'deleteimage': DeleteImage
  
  'error': ServerError
}

export type Query = keyof ResponseContent & keyof RequestContent 

export interface Request<K extends keyof RequestContent> {
  type: K,
  timestamp: number,
  id: number,
  content: RequestContent[K],
}

export interface ResponseOk<K extends keyof ResponseContent> {
  ok: {
    type: K,
    content: ResponseContent[K],
  }
}

export interface ResponseErr {
  err: string
}

export type Response<K extends keyof ResponseContent> = {
  timestamp: number,
  id: number,
} & (ResponseOk<K> | ResponseErr)

export interface Broadcast<K extends keyof ResponseContent> {
  type: K,
  timestamp: number,
  content: ResponseContent[K]
}
