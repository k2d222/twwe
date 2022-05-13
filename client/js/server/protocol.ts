// this file contains the type of messages sent and received via websocket.

// TODO: for now, can only edit tile id of tile layers.
export type ChangeData = {
  map_name: string,
  group: number,
  layer: number,
  x: number,
  y: number,
  id: number,
}
 
export type UsersData = {
  count: number
}

export interface ServerEventMap {
  'change': ChangeData
  'users': UsersData
}

export interface ClientEventMap {
  'change': ChangeData
  'save': string // string is map_name
}

