import { WebSocketServer } from '../server/server'
const { VITE_WEBSOCKET_URL } = import.meta.env


export const webSocketUrl: string = localStorage.getItem('websocket-url') || VITE_WEBSOCKET_URL
export const server = new WebSocketServer(webSocketUrl)