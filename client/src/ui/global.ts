import type { WebSocketServer } from '../server/server'
import type { ServerConfig } from '../storage'
import type { Map } from '../twmap/map'
import { writable, type Writable } from 'svelte/store'
import { RenderMap } from '../gl/renderMap'
import type { AutomapperDetail } from '../server/protocol'

export enum View {
  Layers, Automappers, Images, Sounds, Envelopes, Settings // TODO
}

export const server: Writable<WebSocketServer> = writable(null)
export const serverConfig: Writable<ServerConfig> = writable(null)
export const view: Writable<View> = writable(View.Layers)

// map
export const rmap: Writable<RenderMap> = writable(null)
export const map: Writable<Map> = writable(null)
export const selected: Writable<[number, number][]> = writable([])
export const visible: Writable<boolean[][]> = writable([])
export const automappers: Writable<Record<string, AutomapperDetail>> = writable({})
export const anim: Writable<boolean> = writable(false)

export const peers: Writable<number> = writable(0)
