import type { Writable } from "svelte/store"
import type { Recv, RecvKey, Send, SendKey } from "./protocol"
import type { Server } from "./server"

// a svelte store factory that provides a Writable synced with the server.
export function sync<Q extends SendKey & RecvKey, T>(val: T, opts: { server: Server, query: Q, send: (val: T) => Send[Q] | null, recv: (e: Recv[Q]) => T | null }): Writable<T> {
  let subs: ((val: T) => void)[] = []

  const cb = (e: Recv[Q]) => {
    const newVal = opts.recv(e)
    if (newVal !== null && newVal !== val) {
      val = newVal
      subs.forEach(sub => sub(val))
    }
  }

  function on() {
    opts.server.on(opts.query, cb)
  }
  function off() {
    opts.server.off(opts.query, cb)
  }

  function subscribe(sub: (val: T) => void) {
    if (subs.length === 0)
      on()
    sub(val)
    subs.push(sub)
    return () => {
      subs.splice(subs.indexOf(sub), 1)
      if (subs.length === 0)
        off()
    }
  }

  async function set(newVal: T) {
    if (newVal === val)
      return
    const oldVal = val
    val = newVal
    subs.forEach(sub => sub(val))
    try {
      console.log(opts, opts.query, val)
      await opts.server.query(opts.query, opts.send(val))
    }
    catch {
      val = oldVal
      subs.forEach(sub => sub(val))
    }
  }

  function update(cb: (val: T) => T) {
    set(cb(val))
  }

  return { subscribe, set, update }
}
