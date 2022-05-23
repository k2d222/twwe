import { Server } from "../server/server"
const { VITE_BACKEND_HOST, VITE_BACKEND_PORT } = import.meta.env

export const pServer = Server.create(VITE_BACKEND_HOST, parseInt(VITE_BACKEND_PORT, 10))
export let server: Server
pServer.then(s => server = s)