import { ClientEventMap, ServerEventMap } from './protocol'

type Listener<K extends keyof ServerEventMap> = (data: ServerEventMap[K]) => void

export class Server {
  socket: WebSocket
  listeners: { [K in keyof ServerEventMap]: Listener<K>[] }
    
  private constructor(address: string, port: number) {
    this.socket = new WebSocket(`ws://${address}:${port}/`)
    this.socket.binaryType = 'arraybuffer'
    this.socket.onmessage = (e) => this.onMessage(e)
    this.listeners = {
      'change': [],
      'map': [],
      'users': [],
    }
  }
  
  static create(address: string, port: number): Promise<Server> {
    return new Promise((resolve, reject) => {
      let server = new Server(address, port)
      
      let onopen = () => {
        server.socket.removeEventListener('error', onerror)
        resolve(server)
      }

      let onerror = (e: Event) => {
        reject(e)
      }

      server.socket.addEventListener('open', onopen, { once: true })
      server.socket.addEventListener('error', onerror, { once: true })
    })
  }

  on<K extends keyof ServerEventMap>(type: K, fn: Listener<K>) {
    this.listeners[type].push(fn)
  }

  private onMessage(e: MessageEvent) {
    let type: keyof ServerEventMap
    let content: any
    
    console.log(e.data)
    
    // binary messages from server are always maps.
    if (e.data instanceof ArrayBuffer) {
      type = 'map'
      content = e.data
    }
    
    // text messages from server are JSON and contains a content field.
    else {
      let data = JSON.parse(e.data)
      type = data.type
      content = data.content
    }
    
    for (let fn of this.listeners[type]) {
      fn(content)
    }
  }
  
  send<K extends keyof ClientEventMap>(type: K, content: ClientEventMap[K]) {
    let message = JSON.stringify({
      type, content
    })
    this.socket.send(message)
  }
}