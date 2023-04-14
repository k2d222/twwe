import type { WebSocketServer } from 'src/server/server'
import type { ServerConfig } from 'src/storage'
import { writable, Writable } from 'svelte/store'

export const server: Writable<WebSocketServer> = writable(null)
export const serverConfig: Writable<ServerConfig> = writable(null)
