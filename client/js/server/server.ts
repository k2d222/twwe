import { ClientEventMap, ServerEventMap, Query, ServerQueryMap } from './protocol'

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
      'maps': [],
      'join': [],
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
  
  // to help typescript a little
  private getListeners<K extends keyof ServerEventMap>(type: K) {
    return this.listeners[type] as Listener<K>[]
  }

  on<K extends keyof ServerEventMap>(type: K, fn: Listener<K>) {
    this.getListeners(type).push(fn)
  }

  once<K extends keyof ServerEventMap>(type: K, fn: Listener<K>, timeout?: number) {
    let timeoutID = -1
    let onceListener = (x: ServerEventMap[K]) => {
      window.clearTimeout(timeoutID)
      let index = this.getListeners(type).indexOf(onceListener)
      this.getListeners(type).splice(index)
      fn(x)
    }
    this.getListeners(type).push(onceListener)
    
    if (timeout) {
      timeoutID = window.setTimeout(() => {
        let index = this.getListeners(type).indexOf(onceListener)
        this.getListeners(type).splice(index)
      }, timeout)
    }
  }

  query<K extends Query>(type: K, content?: ClientEventMap[K], timeout = 10000): Promise<ServerQueryMap[K]> {
    return new Promise((resolve, reject) => {
      let timeoutID = -1

      let onceListener = (x: ServerEventMap[K]) => {
        window.clearTimeout(timeoutID)
        let index = this.getListeners(type).indexOf(onceListener)
        this.getListeners(type).splice(index)
        resolve(x)
      }

      this.getListeners(type).push(onceListener)
    
      if (timeout) {
        timeoutID = window.setTimeout(() => {
          let index = this.getListeners(type).indexOf(onceListener)
          this.getListeners(type).splice(index)
          reject("timeout reached")
        }, timeout)
      }

      this.send(type, content)
    })
  }

  private onMessage(e: MessageEvent) {
    // binary messages from server are always maps.
    if (e.data instanceof ArrayBuffer) {
      for (let fn of this.listeners['map']) {
        fn(e.data)
      }
    }
    
    // text messages from server are JSON and contains a content field.
    else {
      let data = JSON.parse(e.data)
      console.log(data)
      for (let fn of this.listeners[data.type]) {
        fn(data.content)
      }
    }
  }
  
  send<K extends keyof ClientEventMap>(type: K, content?: ClientEventMap[K]) {
    let message = JSON.stringify({
      type, content
    })
    this.socket.send(message)
  }
}