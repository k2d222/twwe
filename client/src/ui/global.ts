import { Server } from '../server/server'
const { VITE_WEBSOCKET_URL } = import.meta.env

export const pServer = Server.create(VITE_WEBSOCKET_URL)
export let server: Server
pServer.then(s => (server = s))
