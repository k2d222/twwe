import type { Writable } from "svelte/store"
import type { Query, RequestContent, ResponseContent } from "./protocol"
import type { Server } from "./server"

// a svelte store factory that provides a Writable synced with the server.
export function sync<Q extends Query, T>(val: T, opts: { server: Server, query: Q, send: (val: T) => RequestContent[Q] | null, recv: (e: ResponseContent[Q]) => T | null }): Writable<T> {
  let subs: ((val: T) => void)[] = []

  function cb(e: ResponseContent[Q]) {
    const newVal = opts.recv(e)
    if (newVal !== null) {
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
    subs.forEach(sub => sub(newVal))
    try {
      await opts.server.query(opts.query, opts.send(newVal))
      val = newVal
    }
    catch {
      subs.forEach(sub => sub(val))
    }
  }

  function update(cb: (val: T) => T) {
    set(cb(val))
  }

  return { subscribe, set, update }
}
