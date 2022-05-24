import type { Color } from '../twmap/types'

// this file contains the type of messages sent and received via websocket.

// TODO: for now, can only edit tile id of tile layers.
export type TileChange = {
  group: number,
  layer: number,
  x: number,
  y: number,
  id: number,
}
 
export type GroupChange = {
  group: number,
  order?: number,
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
 
export type LayerChange = {
  group: number,
  layer: number,
  // width?: number,
  // height?: number,
  // flags?: number,
  color?: Color,
  // colorEnv?: number, // TODO
  // colorEnvOffset?: number, // TODO
  // image: number, // TODO
  name?: string
}
 
export type UsersData = {
  count: number
}

export type MapInfo = {
  name: string,
  users: number,
}

// queries (name and content type) that can be received from the server
export interface ServerQueryMap {
  'maps': MapInfo[]
  'join': boolean
  'map': ArrayBuffer
}

// queries (name and content type) that can be sent by the client
export interface ClientQueryMap {
  'maps': null
  'join': string
  'map': null
}

export type Query = keyof ServerQueryMap & keyof ClientQueryMap 

// events (name and content type) that can be received from the server
export interface ServerEventMap extends ServerQueryMap {
  'change': TileChange
  'users': UsersData
  'maps': MapInfo[]
}

// events (name and content type) that can be sent by the client
export interface ClientEventMap extends ClientQueryMap {
  'change': TileChange
  'join': string // string is map_name
  'save': null
}

