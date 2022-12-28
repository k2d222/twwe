import { WebSocketServer } from '../server/server'
import storage from '../storage'

const conf = storage.load('defaultServer')
export const server = new WebSocketServer(conf.url)
