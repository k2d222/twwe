import type { RenderMap } from 'src/gl/renderMap'
import type { WebSocketServer } from 'src/server/server'
import type { ServerConfig } from 'src/storage'
import { writable, Writable } from 'svelte/store'

export const server: Writable<WebSocketServer> = writable(null)
export const serverConfig: Writable<ServerConfig> = writable(null)
export const rmap: Writable<RenderMap> = writable(null)
export const selected: Writable<[number, number][]> = writable([])
export const automappers: Writable<{ [image: string]: string[] }> = writable({})