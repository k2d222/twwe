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
  "get/users": MapGetReq['users']
  "get/cursors": MapGetReq['cursors']
  "get/map": MapGetReq['map']
  "get/images": MapGetReq['images']
  "get/image": MapGetReq['image']
  "get/envelopes": MapGetReq['envelopes']
  "get/envelope": MapGetReq['envelope']
  "get/groups": MapGetReq['groups']
  "get/group": MapGetReq['group']
  "get/layers": MapGetReq['layers']
  "get/layer": MapGetReq['layer']
  "get/tiles": MapGetReq['tiles']
  "get/quad": MapGetReq['quad']
  "get/automappers": MapGetReq['automappers']
  "get/automapper": MapGetReq['automapper']
  "create/image": MapCreateReq['image']
  "create/envelope": MapCreateReq['envelope']
  "create/group": MapCreateReq['group']
  "create/layer": MapCreateReq['layer']
  "create/quad": MapCreateReq['quad']
  "create/automapper": MapCreateReq['automapper']
  "edit/config": MapEditReq['config']
  "edit/info": MapEditReq['info']
  "edit/envelope": MapEditReq['envelope']
  "edit/group": MapEditReq['group']
  "edit/layer": MapEditReq['layer']
  "edit/tiles": MapEditReq['tiles']
  "edit/quad": MapEditReq['quad']
  "edit/automap": MapEditReq['automap']
  "move/envelope": MapReorderReq['envelope']
  "move/group": MapReorderReq['group']
  "move/layer": MapReorderReq['layer']
  "move/quad": MapReorderReq['quad']
  "delete/image": MapDelReq['image']
  "delete/envelope": MapDelReq['envelope']
  "delete/group": MapDelReq['group']
  "delete/layer": MapDelReq['layer']
  "delete/quad": MapDelReq['quad']
  "delete/automapper": MapDelReq['automapper']
  "cursor": Cursor
  "save": undefined
  "join": string
  "leave": string
  "create": EditReq['map']
  "delete": DeleteReq['map']
}

export interface Resp {
  "get/users": MapGetResp['users']
  "get/cursors": MapGetResp['cursors']
  "get/map": MapGetResp['map']
  "get/images": MapGetResp['images']
  "get/image": MapGetResp['image']
  "get/envelopes": MapGetResp['envelopes']
  "get/envelope": MapGetResp['envelope']
  "get/groups": MapGetResp['groups']
  "get/group": MapGetResp['group']
  "get/layers": MapGetResp['layers']
  "get/layer": MapGetResp['layer']
  "get/tiles": MapGetResp['tiles']
  "get/quad": MapGetResp['quad']
  "get/automappers": MapGetResp['automappers']
  "get/automapper": MapGetResp['automapper']
  "create/image": undefined
  "create/envelope": undefined
  "create/group": undefined
  "create/layer": undefined
  "create/quad": undefined
  "create/automapper": undefined
  "edit/config": undefined
  "edit/info": undefined
  "edit/envelope": undefined
  "edit/group": undefined
  "edit/layer": undefined
  "edit/tiles": undefined
  "edit/quad": undefined
  "edit/automap": undefined
  "move/envelope": undefined
  "move/group": undefined
  "move/layer": undefined
  "move/quad": undefined
  "delete/image": undefined
  "delete/envelope": undefined
  "delete/group": undefined
  "delete/layer": undefined
  "delete/quad": undefined
  "delete/automapper": undefined
  "cursor": undefined
  "save": undefined
  "join": undefined
  "leave": undefined
  "create": undefined
  "delete": undefined
}

export interface Recv {
  "create/image": MapCreateReq['image']
  "create/envelope": MapCreateReq['envelope']
  "create/group": MapCreateReq['group']
  "create/layer": MapCreateReq['layer']
  "create/quad": MapCreateReq['quad']
  "create/automapper": MapCreateReq['automapper']
  "edit/config": MapEditReq['config']
  "edit/info": MapEditReq['info']
  "edit/envelope": MapEditReq['envelope']
  "edit/group": MapEditReq['group']
  "edit/layer": MapEditReq['layer']
  "edit/tiles": MapEditReq['tiles']
  "edit/quad": MapEditReq['quad']
  "edit/automap": MapEditReq['automap']
  "move/envelope": MapReorderReq['envelope']
  "move/group": MapReorderReq['group']
  "move/layer": MapReorderReq['layer']
  "delete/image": MapDelReq['image']
  "delete/envelope": MapDelReq['envelope']
  "delete/group": MapDelReq['group']
  "delete/layer": MapDelReq['layer']
  "delete/quad": MapDelReq['quad']
  "delete/automapper": MapDelReq['automapper']
  "map_created": string
  "map_deleted": string
  "users": number
  "saved": undefined
}

export type Req = Send | Recv

export type SendKey = keyof Send
export type RecvKey = keyof Recv
export type ReqKey = keyof Req

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
