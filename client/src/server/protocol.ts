import type * as Info from '../twmap/types'
import type * as MapDir from '../twmap/mapdir'

// This file contains the type of messages sent and received via websocket.
// It must correspond with file protocol.rs in server.

// MAPS

export type RecPartial<T> = T extends Array<any> ? T : T extends Object ? { [K in keyof T]?: RecPartial<T[K]> } : T
export type Require<T, U extends keyof T> = Partial<T> & Pick<T, U>

type Base64 = string

export interface Config {
  name: string
  access: 'public' | 'unlisted'
}

export interface MapDetail {
  name: string
  users: number
}

export interface Tiles {
  x: number
  y: number
  w: number
  h: number
  tiles: Base64
}

// TODO
export type EditTile = Info.AnyTile & {
  g: number
  l: number
  x: number
  y: number
}

export interface Cursor {
  x: number
  y: number
  g: number
  l: number
}

export type Cursors = Record<string, Cursor>

export enum AutomapperKind {
  DDNet = 'rules',
  Teeworlds = 'json',
  RulesPP = 'rpp',
}

export interface AutomapperDetail {
  name: string
  image: string
  kind: AutomapperKind
  file?: string
  configs?: string[]
}

export type MapCreation = {
  version: 'ddnet06' | 'teeworlds07'
  access: 'public' | 'unlisted'
} & ({
  clone: string
} | {
  blank: {
    w: number,
    h: number
  } 
} | {
  upload: Base64
})

export interface MapGetReq {
  users: undefined
  cursors: undefined
  map: undefined
  images: undefined
  image: number
  envelopes: undefined
  envelope: number
  groups: undefined
  group: number
  layers: number
  layer: [number, number]
  tiles: [number, number]
  quad: [number, number, number]
  automappers: undefined
  automapper: string
}

export interface MapGetResp {
  users: number
  cursors: Cursors
  map: Base64
  images: string[]
  image: Base64
  envelopes: string[]
  envelope: MapDir.Envelope
  groups: string[]
  group: MapDir.Group
  layers: string[]
  layer: MapDir.Layer
  tiles: Base64
  quad: MapDir.Quad
  automappers: AutomapperDetail[]
  automapper: string
}

export interface MapCreateReq {
  image: [string, Base64 | MapDir.ExternalImage]
  envelope: Require<MapDir.Envelope, "type">
  group: Partial<MapDir.Group>
  layer: [number, Require<MapDir.Layer, "type">]
  quad: [number, number, MapDir.Quad]
  automapper: [string, string]
}

export interface MapEditReq {
  config: Partial<Config>
  info: Partial<MapDir.Info>
  envelope: [number, Require<MapDir.Envelope, "type">]
  group: [number, Partial<MapDir.Group>]
  layer: [number, number, Require<MapDir.Layer, "type">]
  tiles: [number, number, Tiles]
  quad: [number, number, number, MapDir.Quad]
  automap: [number, number]
}

export interface MapReorderReq {
  image: [number, number]
  envelope: [number, number]
  group: [number, number]
  layer: [[number, number], [number, number]]
  quad: [[number, number, number], [number, number, number]]
}

export interface MapDelReq {
  image: number
  envelope: number
  group: number
  layer: [number, number]
  quad: [number, number, number]
  automapper: string
}

export interface MapReq {
  cursor: Cursor
  save: undefined
  get: MapGetReq
  create: MapCreateReq
  edit: MapEditReq
  move: MapReorderReq
  delete: MapDelReq
}

export interface GetReq {
  map: string
}

export interface GetResp {
  map: Base64
}

export interface EditReq {
  map: [string, MapCreation]
}

export interface DeleteReq {
  map: string
}

export interface Request {
  map: MapReq
  get: GetReq
  edit: EditReq
  delete: DeleteReq
  join: string
  leave: string
}

export interface Broadcast {
  map_created: string
  map_deleted: string
  users: number
  saved: undefined
}

export type Result<T> = {
  ok: T
} | {
  err: string
}

export interface Send {
  "map/get/users": MapGetReq['users']
  "map/get/cursors": MapGetReq['cursors']
  "map/get/map": MapGetReq['map']
  "map/get/images": MapGetReq['images']
  "map/get/image": MapGetReq['image']
  "map/get/envelopes": MapGetReq['envelopes']
  "map/get/envelope": MapGetReq['envelope']
  "map/get/groups": MapGetReq['groups']
  "map/get/group": MapGetReq['group']
  "map/get/layers": MapGetReq['layers']
  "map/get/layer": MapGetReq['layer']
  "map/get/tiles": MapGetReq['tiles']
  "map/get/quad": MapGetReq['quad']
  "map/get/automappers": MapGetReq['automappers']
  "map/get/automapper": MapGetReq['automapper']
  "map/create/image": MapCreateReq['image']
  "map/create/envelope": MapCreateReq['envelope']
  "map/create/group": MapCreateReq['group']
  "map/create/layer": MapCreateReq['layer']
  "map/create/quad": MapCreateReq['quad']
  "map/create/automapper": MapCreateReq['automapper']
  "map/edit/config": MapEditReq['config']
  "map/edit/info": MapEditReq['info']
  "map/edit/envelope": MapEditReq['envelope']
  "map/edit/group": MapEditReq['group']
  "map/edit/layer": MapEditReq['layer']
  "map/edit/tiles": MapEditReq['tiles']
  "map/edit/quad": MapEditReq['quad']
  "map/edit/automap": MapEditReq['automap']
  "map/move/envelope": MapReorderReq['envelope']
  "map/move/group": MapReorderReq['group']
  "map/move/layer": MapReorderReq['layer']
  "map/move/quad": MapReorderReq['quad']
  "map/delete/image": MapDelReq['image']
  "map/delete/envelope": MapDelReq['envelope']
  "map/delete/group": MapDelReq['group']
  "map/delete/layer": MapDelReq['layer']
  "map/delete/quad": MapDelReq['quad']
  "map/delete/automapper": MapDelReq['automapper']
  "map/cursor": Cursor
  "map/save": undefined
  "join": string
  "leave": string
  "create": EditReq['map']
  "delete": DeleteReq['map']
}

export interface Resp {
  "map/get/users": MapGetResp['users']
  "map/get/cursors": MapGetResp['cursors']
  "map/get/map": MapGetResp['map']
  "map/get/images": MapGetResp['images']
  "map/get/image": MapGetResp['image']
  "map/get/envelopes": MapGetResp['envelopes']
  "map/get/envelope": MapGetResp['envelope']
  "map/get/groups": MapGetResp['groups']
  "map/get/group": MapGetResp['group']
  "map/get/layers": MapGetResp['layers']
  "map/get/layer": MapGetResp['layer']
  "map/get/tiles": MapGetResp['tiles']
  "map/get/quad": MapGetResp['quad']
  "map/get/automappers": MapGetResp['automappers']
  "map/get/automapper": MapGetResp['automapper']
  "map/create/image": undefined
  "map/create/envelope": undefined
  "map/create/group": undefined
  "map/create/layer": undefined
  "map/create/quad": undefined
  "map/create/automapper": undefined
  "map/edit/config": undefined
  "map/edit/info": undefined
  "map/edit/envelope": undefined
  "map/edit/group": undefined
  "map/edit/layer": undefined
  "map/edit/tiles": undefined
  "map/edit/quad": undefined
  "map/edit/automap": undefined
  "map/move/envelope": undefined
  "map/move/group": undefined
  "map/move/layer": undefined
  "map/move/quad": undefined
  "map/delete/image": undefined
  "map/delete/envelope": undefined
  "map/delete/group": undefined
  "map/delete/layer": undefined
  "map/delete/quad": undefined
  "map/delete/automapper": undefined
  "map/cursor": undefined
  "map/save": undefined
  "join": undefined
  "leave": undefined
  "create": undefined
  "delete": undefined
}

export interface Recv {
  "map/create/image": MapCreateReq['image']
  "map/create/envelope": MapCreateReq['envelope']
  "map/create/group": MapCreateReq['group']
  "map/create/layer": MapCreateReq['layer']
  "map/create/quad": MapCreateReq['quad']
  "map/create/automapper": MapCreateReq['automapper']
  "map/edit/config": MapEditReq['config']
  "map/edit/info": MapEditReq['info']
  "map/edit/envelope": MapEditReq['envelope']
  "map/edit/group": MapEditReq['group']
  "map/edit/layer": MapEditReq['layer']
  "map/edit/tiles": MapEditReq['tiles']
  "map/edit/quad": MapEditReq['quad']
  "map/edit/automap": MapEditReq['automap']
  "map/move/envelope": MapReorderReq['envelope']
  "map/move/group": MapReorderReq['group']
  "map/move/layer": MapReorderReq['layer']
  "map/delete/image": MapDelReq['image']
  "map/delete/envelope": MapDelReq['envelope']
  "map/delete/group": MapDelReq['group']
  "map/delete/layer": MapDelReq['layer']
  "map/delete/quad": MapDelReq['quad']
  "map/delete/automapper": MapDelReq['automapper']
  "map_created": string
  "map_deleted": string
  "users": number
  "saved": undefined
}

export type SendKey = keyof Send
export type RecvKey = keyof Recv

export interface SendPacket<K extends SendKey> {
  timestamp: number
  id: number
  type: K
  content: Send[K]
}

export type RespPacket<K extends SendKey> = {
  timestamp: number
  id: number
} & Result<Resp[K]> 

export interface RecvPacket<K extends RecvKey> {
  timestamp: number
  type: K
  content: Recv[K]
  err?: any
}
