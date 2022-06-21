import type { ClientEventMap, ServerEventMap, Query, ServerQueryMap } from './protocol'

type Listener<K extends keyof ServerEventMap> = (data: ServerEventMap[K]) => void

export class Server {
  socket: WebSocket
  listeners: { [K in keyof ServerEventMap]: Listener<K>[] }
    
  private constructor(address: string, port: number) {
    this.socket = new WebSocket(`ws://${address}:${port}/`)
    this.socket.binaryType = 'arraybuffer'
    this.socket.onmessage = (e) => this.onMessage(e)
    this.listeners = {
      'groupchange': [],
      'layerchange': [],
      'tilechange': [],
      'map': [],
      'users': [],
      'maps': [],
      'join': [],
      'refused': [],
      'creategroup': [],
      'createlayer': [],
      'uploadcomplete': [],
      'createmap': [],
      'deletemap': [],
    }
  }
  
  static create(address: string, port: number): Promise<Server> {
    return new Promise((resolve, reject) => {
      const server = new Server(address, port)
      
      const onopen = () => {
        server.socket.removeEventListener('error', onerror)
        resolve(server)
      }

      const onerror = (e: Event) => {
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

  off<K extends keyof ServerEventMap>(type: K, fn: Listener<K>) {
    const index = this.getListeners(type).indexOf(fn)
    this.getListeners(type).splice(index, 1)
  }

  once<K extends keyof ServerEventMap>(type: K, fn: Listener<K>, timeout?: number) {
    let timeoutID = -1
    const onceListener = (x: ServerEventMap[K]) => {
      window.clearTimeout(timeoutID)
      const index = this.getListeners(type).indexOf(onceListener)
      this.getListeners(type).splice(index)
      fn(x)
    }
    this.getListeners(type).push(onceListener)
    
    if (timeout) {
      timeoutID = window.setTimeout(() => {
        const index = this.getListeners(type).indexOf(onceListener)
        this.getListeners(type).splice(index)
      }, timeout)
    }
  }

  query<K extends Query>(type: K, content?: ClientEventMap[K], timeout = 10000): Promise<ServerQueryMap[K]> {
    return new Promise((resolve, reject) => {
      let timeoutID = -1

      const onceListener = (x: ServerEventMap[K]) => {
        window.clearTimeout(timeoutID)
        const index = this.getListeners(type).indexOf(onceListener)
        this.getListeners(type).splice(index)
        resolve(x)
      }

      this.getListeners(type).push(onceListener)
    
      if (timeout) {
        timeoutID = window.setTimeout(() => {
          const index = this.getListeners(type).indexOf(onceListener)
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
      for (const fn of this.listeners['map']) {
        fn(e.data)
      }
    }
    
    // text messages from server are JSON and contains a content field.
    else {
      const data = JSON.parse(e.data)
      for (const fn of this.listeners[data.type]) {
        fn(data.content)
      }
    }
  }
  
  send<K extends keyof ClientEventMap>(type: K, content?: ClientEventMap[K]) {
    const message = JSON.stringify({
      type, content
    })
    this.socket.send(message)
  }

  sendBinaryBlocking(data: ArrayBuffer, onProgress?: (_: number) => any): Promise<void> {
    const bytes = data.byteLength
    return new Promise((resolve) => {
      this.socket.send(data)
      const interval = setInterval(() => {
        if (this.socket.bufferedAmount === 0) {
          clearInterval(interval)
          resolve()
        }
        else {
          if (onProgress) onProgress(bytes - this.socket.bufferedAmount)
        }
      }, 200)
    })
  }
}