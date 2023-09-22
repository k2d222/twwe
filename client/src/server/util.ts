import type { Readable, Writable } from "svelte/store"
import type { Recv, RecvKey, Send, SendKey } from "./protocol"
import type { Server } from "./server"

export const skip: unique symbol = Symbol()
type Skip = typeof skip

// a svelte store factory that provides a Writable synced with the server.
// TODO: match like the read() store
export function sync<Q extends SendKey & RecvKey, T>(
  val: T,
  opts: {
    server: Server,
    query: Q,
    send?: (val: T) => Send[Q] | Skip,
    recv: (e: Recv[Q]) => T | Skip
  }): Writable<T>
{
  let subs: ((val: T) => void)[] = []
  if (!opts.send) opts.send = () => skip

  const cb = (e: Recv[Q]) => {
    const newVal = opts.recv(e)
    if (newVal !== skip && newVal !== val) {
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
    const send = opts.send(val)
    if (send !== skip) {
      try {
        await opts.server.query(opts.query, send)
      }
      catch {
        val = oldVal
        subs.forEach(sub => sub(val))
      }
    }
  }

  function update(cb: (val: T) => T) {
    set(cb(val))
  }

  return { subscribe, set, update }
}

export const pick: unique symbol = Symbol()
type Pick = typeof pick

export const cont: unique symbol = Symbol()
type Cont = typeof cont

function patternValue(pat: any, val: any) {
  if (pat === pick) {
    return val
  }
  else if (pat === skip) {
    return skip
  }
  else if (typeof val !== typeof pat) {
    return skip
  }
  else if (typeof val === 'object') {
    for (const k in pat) {
      if (k in val) {
        const v = patternValue(pat[k], val[k])
        if (v !== cont)
          return v
      }
    }
    return cont
  }
  else if (val === pat) {
    return cont
  }
  else {
    return skip
  }
}

type Pattern<T> = Skip | Pick | (T extends Object ? { [K in keyof T]?: Pattern<T[K]> } : T)

type ReadOpt<Q extends SendKey & RecvKey, T> = {
  query: Q,
  match?: Pattern<Recv[Q]>,
  apply?: (v: any) => T
}

// a svelte store factory that provides a Writable synced with the server.
export function read<Q extends SendKey & RecvKey, T>(
  server: Server,
  val: T,
  opts: ReadOpt<Q, T> | ReadOpt<Q, T>[]): Readable<T>
{
  if (!Array.isArray(opts))
    opts = [opts]

  for (const opt of opts)
    if (!opt.apply)
      opt.apply = (v: any) => v

  for (const opt of opts)
    if (!opt.match)
      opt.match = pick

  function cb (opt: ReadOpt<Q, T>) {
    return (e: Recv[Q]) => {
      let val = patternValue(opt.match, e)
      if (val !== skip && val !== cont) {
        val = opt.apply(val)
        subs.forEach(sub => sub(val))
      }
    }
  }

  const callbacks = opts.map(cb)

  function on() {
    for (const k in opts) {
      server.on(opts[k].query, callbacks[k])
    }
  }
  function off() {
    for (const k in opts) {
      server.off(opts[k].query, callbacks[k])
    }
  }

  let subs: ((val: T) => void)[] = []

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

  return { subscribe }
}

export function sync2<Q extends SendKey & RecvKey, T>(
  server: Server,
  val: T,
  opts: ReadOpt<Q, T> | ReadOpt<Q, T>[],
  send: (val: T) => [Q, Send[Q]] | Skip): Writable<T>
{
  if (!Array.isArray(opts))
    opts = [opts]

  for (const opt of opts)
    if (!opt.apply)
      opt.apply = (v: any) => v

  for (const opt of opts)
    if (!opt.match)
      opt.match = pick

  function cb (opt: ReadOpt<Q, T>) {
    return (e: Recv[Q]) => {
      let val = patternValue(opt.match, e)
      if (val !== skip && val !== cont) {
        val = opt.apply(val)
        subs.forEach(sub => sub(val))
      }
    }
  }

  const callbacks = opts.map(cb)

  function on() {
    for (const k in opts) {
      server.on(opts[k].query, callbacks[k])
    }
  }
  function off() {
    for (const k in opts) {
      server.off(opts[k].query, callbacks[k])
    }
  }

  let subs: ((val: T) => void)[] = []

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
    const query = send(val)
    if (query !== skip) {
      try {
        await server.query(...query)
      }
      catch {
        val = oldVal
        subs.forEach(sub => sub(val))
      }
    }
  }

  function update(cb: (val: T) => T) {
    set(cb(val))
  }

  return { subscribe, set, update }
}
