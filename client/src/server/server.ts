import type {
  Request,
  Response,
  RequestContent,
  ResponseContent,
  Broadcast,
  Query,
} from './protocol'

type QueryListener<K extends keyof ResponseContent> = (data: Response<K>) => void
type BroadcastListener<K extends keyof ResponseContent> = (data: ResponseContent[K]) => void

function isResponse(data: any): data is Response<any> {
  return 'id' in data
}

function isBroadcast(data: any): data is Broadcast<any> {
  return 'content' in data
}

export interface Server {
  // subscribe to a server event with a callback function
  on<K extends keyof ResponseContent>(type: K, fn: BroadcastListener<K>): void

  // unsubscribe to a server event
  off<K extends keyof ResponseContent>(type: K, fn: BroadcastListener<K>): void

  // send a request to the server
  send<K extends keyof RequestContent>(type: K, content?: RequestContent[K]): void

  // send a request to the server and capture the reply
  query<K extends Query>(
    type: K,
    content: RequestContent[K],
    timeout?: number
  ): Promise<ResponseContent[K]>
}

// a server using a websocket
export class WebSocketServer implements Server {
  socket: WebSocket
  queryListeners: { [key: number]: QueryListener<any> }
  broadcastListeners: { [K in keyof ResponseContent]: BroadcastListener<K>[] }

  private socketSend: (data: any) => void
  private deferredData: any[]

  constructor(wsUrl: string | URL) {
    this.socket = new WebSocket(wsUrl)
    this.socket.binaryType = 'arraybuffer'
    this.socket.onmessage = e => this.onMessage(e)
    this.queryListeners = {}
    this.broadcastListeners = {
      createmap: [],
      clonemap: [],
      joinmap: [],
      editmap: [],
      savemap: [],
      deletemap: [],
      leavemap: [],

      creategroup: [],
      editgroup: [],
      reordergroup: [],
      deletegroup: [],

      createlayer: [],
      editlayer: [],
      reorderlayer: [],
      deletelayer: [],

      edittile: [],
      edittiles: [],
      sendlayer: [],

      listautomappers: [],
      sendautomapper: [],
      deleteautomapper: [],
      uploadautomapper: [],
      applyautomapper: [],

      createquad: [],
      editquad: [],
      deletequad: [],

      createenvelope: [],
      editenvelope: [],
      deleteenvelope: [],

      sendmap: [],
      listusers: [],
      listmaps: [],
      uploadcomplete: [],
      createimage: [],
      sendimage: [],
      deleteimage: [],

      cursors: [],

      error: [],
    }

    this.deferredData = []
    this.makeDeferred()
  }

  private makeDeferred() {
    // while the server is connecting, put all requests in a cache.
    this.socketSend = this.socketDeferredSend.bind(this)
    this.socket.addEventListener('open', this.makeDirect.bind(this), { once: true })
  }

  private makeDirect() {
    for (const data of this.deferredData) {
      this.socket.send(data)
    }
    this.socketSend = this.socket.send.bind(this.socket)
  }

  private socketDeferredSend(data: any) {
    this.deferredData.push(data)
  }

  private generateID() {
    return Math.floor(Math.random() * Math.pow(2, 16))
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

  query<K extends Query>(
    type: K,
    content: RequestContent[K],
    timeout?: number
  ): Promise<ResponseContent[K]> {
    return new Promise((resolve, reject) => {
      let timeoutID = -1
      let reqID = this.generateID()

      const listener = (x: Response<K>) => {
        if (x.id && x.id === reqID) {
          window.clearTimeout(timeoutID)
          delete this.queryListeners[reqID]

          if ('ok' in x) resolve(x.ok.content)
          else reject(x.err)
        }
      }

      this.queryListeners[reqID] = listener

      if (timeout) {
        timeoutID = window.setTimeout(() => {
          delete this.queryListeners[reqID]
          reject('timeout reached')
        }, timeout)
      }

      this.sendQuery(type, content, reqID)
    })
  }

  private onMessage(e: MessageEvent) {
    if (e.data instanceof ArrayBuffer) {
      console.warn('received binary data from the ws server, is the server outdated?')
      return
    }

    const data = JSON.parse(e.data)
    // this is a query response
    if (isResponse(data)) {
      if (data.id !== 0) {
        const fn = this.queryListeners[data.id]
        fn(data)
      } else if ('ok' in data) {
        for (const fn of this.getBroadcastListeners(data.ok.type)) {
          fn(data.ok.content)
        }
      }
    } else if (isBroadcast(data)) {
      for (const fn of this.getBroadcastListeners(data.type)) {
        fn(data.content)
      }
    }
  }

  private sendQuery<K extends keyof RequestContent>(
    type: K,
    content: RequestContent[K],
    id: number
  ) {
    const req: Request<K> = {
      timestamp: Date.now(),
      id,
      type,
      content,
    }
    const message = JSON.stringify(req)
    this.socketSend(message)
  }

  send<K extends keyof RequestContent>(type: K, content?: RequestContent[K]) {
    const req: Request<K> = {
      timestamp: Date.now(),
      id: 0,
      type,
      content,
    }
    const message = JSON.stringify(req)
    this.socketSend(message)
  }
}
