import type * as Info from '../twmap/types'
import type * as MapDir from '../twmap/mapdir'

// This file contains the type of messages sent and received via websocket.
// It must correspond with file protocol.rs in server.

// MAPS

type FixedNum = string

export type MapAccess = 'public' | 'unlisted'

export type MapConfig = {
  name: string
  access: MapAccess
}

export interface CreateMapBlank extends MapConfig {
  // version: MapVersion // TODO
  width: number
  height: number
  defaultLayers: boolean
}

export interface CreateMapClone extends MapConfig {
  clone: string
}

export type CreateMap = {
  blank: CreateMapBlank
} | {
  clone: CreateMapClone
} | {
  upload: MapConfig
}

export interface JoinMap {
  name: string
}

export interface MapListElement {
  author: string
  version: string
  credits: string
  license: string
  settings: string[]
}

export interface EditMap {
  // name: string, // TODO
  info: MapListElement
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
  group: number
  offX?: FixedNum
  offY?: FixedNum
  paraX?: number
  paraY?: number
  clipping?: boolean
  clipX?: FixedNum
  clipY?: FixedNum
  clipW?: FixedNum
  clipH?: FixedNum
  name?: string
}

export interface ReorderGroup {
  group: number
  newGroup: number
}

export interface DeleteGroup {
  group: number
}

// LAYERS

export type CreateLayer = {
  kind: 'tiles' | 'quads' | 'front' | 'tele' | 'speedup' | 'switch' | 'tune' | 'sounds'
  group: number
  name: string
}

export interface CommonLayerChange {
  group: number
  layer: number
  flags?: number
  name?: string
}

export interface EditTilesLayer extends CommonLayerChange {
  width?: number
  height?: number
  color?: Info.Color
  colorEnv?: number | null
  colorEnvOffset?: number
  image?: number | null
}

export interface EditQuadsLayer extends CommonLayerChange {
  // TODO
  image?: number
}

export type EditLayer = EditTilesLayer | EditQuadsLayer

export interface ReorderLayer {
  group: number
  layer: number
  newGroup: number
  newLayer: number
}

export interface DeleteLayer {
  group: number
  layer: number
}

export type EditTileParams =
  | (Info.Tile & { kind: 'tiles' })
  | (Info.Tile & { kind: 'game' })
  | (Info.Tile & { kind: 'front' })
  | (Info.Tele & { kind: 'tele' })
  | (Info.Speedup & { kind: 'speedup' })
  | (Info.Switch & { kind: 'switch' })
  | (Info.Tune & { kind: 'tune' })

export type EditTile = EditTileParams & {
  group: number
  layer: number
  x: number
  y: number
}

export type EditTiles = {
  group: number,
  layer: number,
  x: number,
  y: number,
  kind: 'tiles' | 'game' | 'front' | 'tele' | 'speedup' | 'switch' | 'tune'
  width: number,
  height: number,
  data: string, // binary data format in base64
}

export type CreateQuad = {
  group: number
  layer: number
  points: MapDir.Point<FixedNum>[]
  colors: Info.Color[]
  texCoords: MapDir.Point<FixedNum>[]
  posEnv: number | null
  posEnvOffset: number
  colorEnv: number | null
  colorEnvOffset: number
}

export type EditQuad = {
  group: number
  layer: number
  quad: number
  points: MapDir.Point<FixedNum>[]
  colors: Info.Color[]
  texCoords: MapDir.Point<FixedNum>[]
  posEnv: number | null
  posEnvOffset: number
  colorEnv: number | null
  colorEnvOffset: number
}

export interface DeleteQuad {
  group: number
  layer: number
  quad: number
}

// ENVELOPES

export type EnvType = 'invalid' | 'sound' | 'position' | 'color'
export const envTypes: EnvType[] = ['invalid', 'sound', 'invalid', 'position', 'color']

export interface CreateEnvelope {
  name: string
  kind: 'color' | 'position' | 'sound'
}

export type CurveTypeStr = 'step' | 'linear' | 'slow' | 'fast' | 'smooth' | 'bezier'
export const curveTypes: CurveTypeStr[] = ['step', 'linear', 'slow', 'fast', 'smooth', 'bezier']

export interface EnvPoint<T> {
  time: number
  content: T
  type: CurveTypeStr
}

export interface EditEnvelope {
  index: number
  name?: string
  synchronized?: boolean
  points?:
    | {
        type: 'color'
        content: EnvPoint<MapDir.Color<string>>[]
      }
    | {
        type: 'position'
        content: EnvPoint<{ x: FixedNum; y: FixedNum; rotation: FixedNum }>[]
      }
    | {
        type: 'sound'
        content: EnvPoint<FixedNum>[]
      }
}

export interface DeleteEnvelope {
  index: number
}

// MISC

export interface SendMap {
  name: string
}

export interface ListUsers {
  globalCount: number
  roomCount: number
}

export interface MapInfo {
  name: string
  users: number
}

export interface ListMaps {
  maps: MapInfo[]
}

export interface ListAutomappers {
  configs: { [k in string]: string[] }
}

export interface SendAutomapper {
  image: string
}

export interface UploadAutomapper {
  image: string
  content: string
}

// IMAGES

export interface ImageConfig {
  name: string
  index: number
}

export interface CreateImage {
  name: string
  index: number
  external: boolean
}

export interface DeleteImage {
  index: number
}

export interface SendImage {
  index: number
}

export interface ImageInfo {
  name: string
  index: number
  width: number
  height: number
}

export interface Cursor {
  point: Info.Coord
  group: number
  layer: number
}

export type Cursors = {
  [k: string]: Cursor
}

export type ServerError =
  | {
      serverError: null
    }
  | {
      mapError: string
    }

// queries (name and content type) that can be sent by the client
export interface RequestContent {
  createmap: CreateMapBlank
  clonemap: CreateMapClone
  joinmap: JoinMap
  leavemap: null
  editmap: EditMap
  savemap: SaveMap
  deletemap: DeleteMap

  creategroup: CreateGroup
  editgroup: EditGroup
  reordergroup: ReorderGroup
  deletegroup: DeleteGroup

  createlayer: CreateLayer
  editlayer: EditLayer
  reorderlayer: ReorderLayer
  deletelayer: DeleteLayer

  edittile: EditTile
  edittiles: EditTiles

  listautomappers: null
  sendautomapper: SendAutomapper
  uploadautomapper: UploadAutomapper

  createquad: CreateQuad
  editquad: EditQuad
  deletequad: DeleteQuad

  createenvelope: CreateEnvelope
  editenvelope: EditEnvelope
  deleteenvelope: DeleteEnvelope

  sendmap: SendMap
  listusers: null
  listmaps: null

  createimage: CreateImage
  sendimage: SendImage
  deleteimage: DeleteImage

  cursors: Cursor
}

// queries (name and content type) that can be received from the server
export interface ResponseContent {
  createmap: CreateMapBlank
  clonemap: CreateMapClone
  joinmap: JoinMap
  leavemap: null
  editmap: EditMap
  savemap: SaveMap
  deletemap: DeleteMap

  creategroup: CreateGroup
  editgroup: EditGroup
  reordergroup: ReorderGroup
  deletegroup: DeleteGroup

  createlayer: CreateLayer
  editlayer: EditLayer
  reorderlayer: ReorderLayer
  deletelayer: DeleteLayer

  edittile: EditTile
  edittiles: EditTiles

  listautomappers: ListAutomappers
  sendautomapper: UploadAutomapper
  uploadautomapper: null

  createquad: CreateQuad
  editquad: EditQuad
  deletequad: DeleteQuad

  createenvelope: CreateEnvelope
  editenvelope: EditEnvelope
  deleteenvelope: DeleteEnvelope

  sendmap: ArrayBuffer
  listusers: ListUsers
  listmaps: ListMaps
  uploadcomplete: null

  createimage: CreateImage
  sendimage: ImageInfo
  deleteimage: DeleteImage

  cursors: Cursors

  error: ServerError
}

export type Query = keyof ResponseContent & keyof RequestContent

export interface Request<K extends keyof RequestContent> {
  type: K
  timestamp: number
  id: number
  content: RequestContent[K]
}

export interface ResponseOk<K extends keyof ResponseContent> {
  ok: {
    type: K
    content: ResponseContent[K]
  }
}

export interface ResponseErr {
  err: string
}

export type Response<K extends keyof ResponseContent> = {
  timestamp: number
  id: number
} & (ResponseOk<K> | ResponseErr)

export interface Broadcast<K extends keyof ResponseContent> {
  type: K
  timestamp: number
  content: ResponseContent[K]
}
