import type { Request, Response, RequestContent, ResponseContent, Broadcast, Query, SendMap, SendImage } from './protocol'

type QueryListener<K extends keyof ResponseContent> = (data: Response<K>) => void
type BroadcastListener<K extends keyof ResponseContent> = (data: ResponseContent[K]) => void
type BinaryListener = (data: ArrayBuffer) => any

function isResponse(data: any): data is Response<any> {
  return "id" in data
}

function isBroadcast(data: any): data is Broadcast<any> {
  return "content" in data
}

export class Server {
  socket: WebSocket
  queryListeners: { [key: number]: QueryListener<any> }
  broadcastListeners: { [K in keyof ResponseContent]: BroadcastListener<K>[] }
  binaryListeners: BinaryListener[]
    
  private constructor(address: string, port: number) {
    this.socket = new WebSocket(`ws://${address}:${port}/`)
    this.socket.binaryType = 'arraybuffer'
    this.socket.onmessage = (e) => this.onMessage(e)
    this.queryListeners = {}
    this.broadcastListeners = {
      'createmap': [],
      'joinmap': [],
      // 'editmap': [],
      'savemap': [],
      'deletemap': [],
  
      'creategroup': [],
      'editgroup': [],
      'reordergroup': [],
      'deletegroup': [],
  
      'createlayer': [],
      'editlayer': [],
      'reorderlayer': [],
      'deletelayer': [],
  
      'edittile': [],

      'sendmap': [],
      'listusers': [],
      'listmaps': [],
      'uploadcomplete': [],
      'addimage': [],
      'sendimage': [],
    }
    this.binaryListeners = []
  }
  
  private generateID() {
    return Math.floor(Math.random() * Math.pow(2, 16))
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
  private getBroadcastListeners<K extends keyof ResponseContent>(type: K) {
    return this.broadcastListeners[type] as BroadcastListener<K>[]
  }

  on<K extends keyof ResponseContent>(type: K, fn: BroadcastListener<K>) {
    this.getBroadcastListeners(type).push(fn)
  }

  off<K extends keyof ResponseContent>(type: K, fn: BroadcastListener<K>) {
    const index = this.getBroadcastListeners(type).indexOf(fn)
    this.getBroadcastListeners(type).splice(index)
  }

  query<K extends Query>(type: K, content: RequestContent[K], timeout?: number): Promise<ResponseContent[K]> {
    return new Promise((resolve, reject) => {
      let timeoutID = -1
      let reqID = this.generateID()

      const listener = (x: Response<K>) => {
        if (x.id && x.id === reqID) {
          window.clearTimeout(timeoutID)
          delete this.queryListeners[reqID]
          
          if ('ok' in x)
            resolve(x.ok.content)
          else
            reject(x.err)
        }
      }

      this.queryListeners[reqID] = listener
    
      if (timeout) {
        timeoutID = window.setTimeout(() => {
          delete this.queryListeners[reqID]
          reject("timeout reached")
        }, timeout)
      }
      
      this.sendQuery(type, content, reqID)
    })
  }
  
  private onMessage(e: MessageEvent) {
    // binary messages from server are always maps.
    if (e.data instanceof ArrayBuffer) {
      for (const fn of this.binaryListeners) {
        fn(e.data)
      }
    }
    
    // text messages from server are JSON and contains a content field.
    else {
      const data = JSON.parse(e.data)
      // this is a query response
      if (isResponse(data)) {
        if (data.id !== 0) {
          const fn = this.queryListeners[data.id]
          fn(data)
        }
        else if ("ok" in data) {
          for (const fn of this.getBroadcastListeners(data.ok.type)) {
            fn(data.ok.content)
          }
        }
      }
      else if (isBroadcast(data)) {
        for (const fn of this.getBroadcastListeners(data.type)) {
          fn(data.content)
        }
      }
    }
  }
  
  private sendQuery<K extends keyof RequestContent>(type: K, content: RequestContent[K], id: number) {
    const req: Request<K> = {
      timestamp: Date.now(),
      id,
      type,
      content
    }
    const message = JSON.stringify(req)
    this.socket.send(message)
  }

  send<K extends keyof RequestContent>(type: K, content?: RequestContent[K]) {
    const req: Request<K> = {
      timestamp: Date.now(),
      id: 0,
      type,
      content
    }
    const message = JSON.stringify(req)
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
  
  uploadFile(data: ArrayBuffer, onProgress?: (_: number) => any) {
    return new Promise<void>((resolve, reject) => {
      const listener = (x: Response<'uploadcomplete'>) => {
        delete this.queryListeners[1]
        if ('ok' in x)
          resolve()
        else
          reject(x.err)
      }
      this.queryListeners[1] = listener
      this.sendBinaryBlocking(data, onProgress)
    })
  }
}