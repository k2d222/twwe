import type { Color } from '../twmap/types'

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

export interface SaveMap {
  name: string
}

export interface DeleteMap {
  name: string
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
  // useClipping?: number, // TODO
  // clipX?: number,
  // clipY?: number,
  // clipW?: number,
  // clipH?: number,
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
  kind: 'tiles' | 'quads',
  group: number,
  name: string,
}

export interface CommonLayerChange {
  group: number,
  layer: number,
  name?: string
}

export interface EditTileLayer extends CommonLayerChange {
  width?: number,
  height?: number,
  // flags?: number,
  color?: Color,
  // colorEnv?: number, // TODO
  // colorEnvOffset?: number, // TODO
  image?: number | null,
}

export interface EditQuadLayer extends CommonLayerChange {
  // TODO
  image?: number,
}

export type EditLayer = EditTileLayer | EditQuadLayer

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

// TODO: for now, can only edit tile id of tile layers.
export interface EditTile {
  group: number,
  layer: number,
  x: number,
  y: number,
  id: number,
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

// queries (name and content type) that can be sent by the client
export interface RequestContent {
  'createmap': CreateMap
  'joinmap': JoinMap
  // 'editmap': EditMap
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
  // 'editmap': EditMap
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

  'sendmap': ArrayBuffer
  'listusers': ListUsers
  'listmaps': ListMaps
  'uploadcomplete': null

  'createimage': CreateImage
  'sendimage': ImageInfo
  'deleteimage': DeleteImage
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
