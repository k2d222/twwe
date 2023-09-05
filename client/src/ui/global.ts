import type { RenderMap } from 'src/gl/renderMap'
import type { WebSocketServer } from 'src/server/server'
import type { ServerConfig } from 'src/storage'
import { writable, Writable } from 'svelte/store'

export enum View {
  Layers, Automappers, Images, Sounds, Envelopes, Settings // TODO
}

export const server: Writable<WebSocketServer> = writable(null)
export const serverConfig: Writable<ServerConfig> = writable(null)
export const rmap: Writable<RenderMap> = writable(null)
export const view: Writable<View> = writable(View.Layers)
export const selected: Writable<[number, number][]> = writable([])
export const automappers: Writable<{ [image: string]: string[] }> = writable({})
export const peers: Writable<number> = writable(0)
export const anim: Writable<boolean> = writable(false)
