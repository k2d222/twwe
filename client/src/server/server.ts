import type { SendPacket, Result, SendKey, RecvKey, Recv, Send, Resp, RecvPacket, RespPacket } from './protocol'

type QueryFn<K extends SendKey> = (resp: Result<Resp[K]>) => K
type ListenFn<K extends RecvKey> = (resp: Recv[K]) => unknown

export interface Server {
  // subscribe to a server event with a callback function
  on<K extends RecvKey>(type: K, fn: ListenFn<K>): void

  // unsubscribe to a server event
  off<K extends RecvKey>(type: K, fn: ListenFn<K>): void

  // send a request to the server
  send<K extends SendKey>(type: K, content?: Send[K]): void

  // send a request to the server and capture the reply
  query<K extends SendKey>(type: K, content: Send[K], timeout?: number): Promise<Resp[K]>
}

// a server using a websocket
export class WebSocketServer implements Server {
  socket: WebSocket
  errorListener: (e: string) => unknown
  queryListeners: { [key: number]: QueryFn<any> }
  broadcastListeners: { [K in RecvKey]: ListenFn<K>[] }

  private socketSend: (data: any) => void
  private deferredData: any[]

  constructor(wsUrl: string | URL) {
    this.socket = new WebSocket(wsUrl)
    this.socket.binaryType = 'arraybuffer'
    this.socket.onmessage = e => this.onMessage(e)
    this.errorListener = () => {}
    this.queryListeners = {}
    this.broadcastListeners = {
      "map/put/image": [],
      "map/put/envelope": [],
      "map/put/group": [],
      "map/put/layer": [],
      "map/put/quad": [],
      "map/put/automapper": [],
      "map/post/config": [],
      "map/post/info": [],
      "map/post/envelope": [],
      "map/post/group": [],
      "map/post/layer": [],
      "map/post/tiles": [],
      "map/post/quad": [],
      "map/post/automap": [],
      "map/patch/envelope": [],
      "map/patch/group": [],
      "map/patch/layer": [],
      "map/delete/image": [],
      "map/delete/envelope": [],
      "map/delete/group": [],
      "map/delete/layer": [],
      "map/delete/quad": [],
      "map/delete/automapper": [],
      "post/map": [],
      "delete/map": [],
      "map_created": [],
      "map_deleted": [],
      "users": [],
      "saved": [],
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
    this.socketSend = (x) => setTimeout(() => this.socket.send(x), 1000)
    // this.socketSend = this.socket.send.bind(this.socket)
  }

  private socketDeferredSend(data: any) {
    this.deferredData.push(data)
  }

  private generateID() {
    return Math.floor(Math.random() * Math.pow(2, 16))
  }

  // to help typescript a little
  private getBroadcastListeners<K extends RecvKey>(type: K) {
    return this.broadcastListeners[type] as ListenFn<K>[]
  }

  onError(fn: (e: any) => unknown) {
    this.errorListener = fn
  }

  on<K extends RecvKey>(type: K, fn: ListenFn<K>, priority: boolean = false) {
    if (priority)
      this.getBroadcastListeners(type).unshift(fn)
    else
      this.getBroadcastListeners(type).push(fn)
  }

  off<K extends RecvKey>(type: K, fn: ListenFn<K>) {
    const index = this.getBroadcastListeners(type).indexOf(fn)
    if (index !== -1)
      this.getBroadcastListeners(type).splice(index, 1)
    else
      console.error('server.off(): could not find listener')
  }

  query<K extends SendKey>(type: K, content: Send[K], timeout?: number): Promise<Resp[K]> {
    return new Promise((resolve, reject) => {
      let timeoutID = -1
      let reqID = this.generateID()

      const listener: QueryFn<K> = (x: Result<Resp[K]>) => {
        window.clearTimeout(timeoutID)
        delete this.queryListeners[reqID]

        if ('ok' in x) resolve(x.ok)
        else if ('err' in x) reject(x.err)
        else console.error('query packet with no result', x)
        return type
      }

      this.queryListeners[reqID] = listener

      if (timeout) {
        timeoutID = window.setTimeout(() => {
          delete this.queryListeners[reqID]
          reject('timeout reached')
        }, timeout)
      }

      if (type in this.broadcastListeners) {
        for (const fn of this.broadcastListeners[type as any]) {
          fn(content)
        }
      }

      this.sendQuery(type, content, reqID)
    })
  }

  private onMessage(e: MessageEvent) {
    if (e.data instanceof ArrayBuffer) {
      console.warn('received binary data from the ws server, is the server outdated?')
      return
    }

    const data = JSON.parse(e.data) as RespPacket<any> | RecvPacket<any>
    
    if ('id' in data) {
      const fn = this.queryListeners[data.id]
      if (fn) {
        const type = fn(data)
        if ('ok' in data && type in this.broadcastListeners) {
          // TODO: ensure transaction
          // const pkt = {
          //   timestamp: data.timestamp,
          //   type,
          //   content: data.ok
          // }
          // for (const fn of this.broadcastListeners[type]) {
          //   fn(pkt)
          // }
        }
        else if ('err' in data) {
          this.errorListener.call(undefined, data.err)
        }
      }
      else {
        console.error('query response with no listener', data)
      }
    }
    else {
      for (const fn of this.getBroadcastListeners(data.type)) {
        fn(data.content)
      }
    }
  }

  private sendQuery<K extends SendKey>(type: K, content: Send[K], id: number) {
    const x: SendPacket<K> = {
      timestamp: Date.now(),
      id,
      type,
      content,
    }
    const message = JSON.stringify(x)
    this.socketSend(message)
  }

  send<K extends SendKey>(type: K, content: Send[K]) {
    this.query(type, content)
  }
}
