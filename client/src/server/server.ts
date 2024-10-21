import type {
  SendPacket,
  Result,
  SendKey,
  RecvKey,
  Recv,
  Send,
  Resp,
  RecvPacket,
  RespPacket,
} from './protocol'
import { History } from './history'

type QueryFn<K extends SendKey> = (resp: Result<Resp[K]>) => unknown
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

type Listener<E> = (evt: E, promise: Promise<void>) => unknown

export class EventDispatcher<E extends Record<string, any>> {
  private listeners: { [K in keyof E]?: Listener<E[K]>[] }

  constructor() {
    this.listeners = {}
  }

  on<K extends keyof E>(type: K, fn: Listener<E[K]>, priority: boolean = false) {
    if (this.listeners[type] === undefined) this.listeners[type] = []

    if (priority) this.listeners[type].unshift(fn)
    else this.listeners[type].push(fn)
  }

  off<K extends keyof E>(type: K, fn: Listener<E[K]>) {
    if (this.listeners[type] === undefined) console.error('server.off(): could not find listener')

    const index = this.listeners[type].indexOf(fn)
    if (index !== -1) this.listeners[type].splice(index, 1)
    else console.error('server.off(): could not find listener')
  }

  dispatch<K extends keyof E>(type: K, evt: E[K], promise: Promise<void> = Promise.resolve()) {
    if (this.listeners[type] !== undefined) {
      for (const fn of this.listeners[type]) {
        fn.call(undefined, evt, promise)
      }
    }
  }
}

// a server using a websocket
export class WebSocketServer extends EventDispatcher<Recv> implements Server {
  socket: WebSocket

  errorListener: (e: string) => unknown
  queryListeners: { [key: number]: QueryFn<any> }

  history: History

  private socketSend: (data: any) => void
  private deferredData: any[]

  constructor(wsUrl: string | URL) {
    super()

    this.socket = new WebSocket(wsUrl)
    this.socket.binaryType = 'arraybuffer'
    this.socket.onmessage = e => this.handleMessage(e)

    this.errorListener = () => {}
    this.queryListeners = {}

    this.history = new History()

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
    // this.socketSend = (x) => setTimeout(() => this.socket.send(x), 1000)
    this.socketSend = this.socket.send.bind(this.socket)
  }

  private socketDeferredSend(data: any) {
    this.deferredData.push(data)
  }

  private generateID() {
    return Math.floor(Math.random() * Math.pow(2, 16))
  }

  onError(fn: (e: any) => unknown) {
    this.errorListener = fn
  }

  query<K extends SendKey>(type: K, content: Send[K], timeout?: number): Promise<Resp[K]> {
    let timeoutID = -1
    let id = this.generateID()

    const packet: SendPacket<K> = {
      timestamp: Date.now(),
      id,
      type,
      content,
    }

    this.history.send(packet)

    const promise: Promise<Resp[K]> = new Promise((resolve, reject) => {
      const listener: QueryFn<K> = (x: Result<Resp[K]>) => {
        window.clearTimeout(timeoutID)
        delete this.queryListeners[id]

        if ('ok' in x) resolve(x.ok)
        else if ('err' in x) reject(x.err)
        else console.error('query packet with no result', x)
      }

      this.queryListeners[id] = listener

      if (timeout) {
        timeoutID = window.setTimeout(() => {
          delete this.queryListeners[id]
          reject('timeout reached')
        }, timeout)
      }
    })

    // we predict an ok response from the server and dispatch right away.
    this.dispatch(type as any, content, promise.then())

    const message = JSON.stringify(packet)
    this.socketSend.call(undefined, message)

    return promise
  }

  private handleResp(resp: RespPacket<SendKey>) {
    const listener = this.queryListeners[resp.id]
    if (listener) {
      listener.call(undefined, resp)

      if ('err' in resp) {
        this.errorListener.call(undefined, resp.err)
      }
    } else {
      console.error('query response with no listener', resp)
    }
  }

  private handleMessage(e: MessageEvent) {
    if (e.data instanceof ArrayBuffer) {
      console.warn('received binary data from the ws server, is the server outdated?')
      return
    }

    const data = JSON.parse(e.data) as RespPacket<SendKey> | RecvPacket<RecvKey>

    if ('id' in data) {
      const ops = this.history.resp(data)
      if (ops) for (const [type, content] of ops) this.dispatch(type, content)

      this.handleResp(data)
    } else if ('err' in data) {
      this.errorListener.call(undefined, data.err)
    } else {
      const ops = this.history.recv(data)
      if (ops) for (const [type, content] of ops) this.dispatch(type, content)
      else this.dispatch(data.type, data.content)
    }
  }

  send<K extends SendKey>(type: K, content: Send[K]) {
    this.query(type, content)
  }

  undo() {
    const op = this.history.undo()
    if (op) {
      this.send(...op)
      return true
    } else {
      return false
    }
  }

  redo() {
    const op = this.history.redo()
    if (op) {
      this.send(...op)
      return true
    } else {
      return false
    }
  }
}
