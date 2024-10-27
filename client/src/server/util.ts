import type { Readable, Writable } from 'svelte/store'
import type { Recv, RecvKey, Send, SendKey } from './protocol'
import type { Server } from './server'

export const skip: unique symbol = Symbol()
type Skip = typeof skip

export const pick: unique symbol = Symbol()
type Pick = typeof pick

export const cont: unique symbol = Symbol()
type Cont = typeof cont
export const _: Cont = cont // alias for placeholder

function patternValue(pat: any, val: any): any {
  if (pat === pick) {
    return val
  } else if (pat === skip || pat === cont) {
    return pat
  } else if (typeof val !== typeof pat) {
    return skip
  } else if (typeof val === 'object') {
    for (const k in pat) {
      if (k in val) {
        const v = patternValue(pat[k], val[k])
        if (v !== cont) return v
      }
    }
    return cont
  } else if (val === pat) {
    return cont
  } else {
    return skip
  }
}

type Pattern<T> = Skip | Pick | Cont | (T extends Object ? { [K in keyof T]?: Pattern<T[K]> } : T)

type ReadOpt<Q extends SendKey & RecvKey, T> = {
  query: Q
  match?: Pattern<Recv[Q]>
  apply?: (v: any) => T
}

/** a svelte store factory that provides a Readable synced with the server.
 * @param val - initial value
 * @param opts.query - which server query to sync with
 * @param opts.match - an optional pattern to match the server response with and extract data from
 * @param opts.apply - an optional transform to perform after match
 */
export function read<Q extends SendKey & RecvKey, T>(
  server: Server,
  val: T,
  opts: ReadOpt<Q, T> | ReadOpt<Q, T>[]
): Readable<T> {
  if (!Array.isArray(opts)) opts = [opts]

  for (const opt of opts) if (!opt.apply) opt.apply = (v: any) => v

  for (const opt of opts) if (!opt.match) opt.match = pick

  function cb(opt: ReadOpt<Q, T>) {
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
    if (subs.length === 0) on()
    sub(val)
    subs.push(sub)
    return () => {
      subs.splice(subs.indexOf(sub), 1)
      if (subs.length === 0) off()
    }
  }

  return { subscribe }
}

type SyncOpt<Q extends SendKey & RecvKey, T> = {
  query: Q
  match?: Pattern<Recv[Q]>
  apply?: (v: any) => T
  send?: (val: T) => Send[Q] | Skip
}

export type Syncable<T> = Writable<T> & {
  sync: (val: T) => void
}

/** a svelte store factory that provides a Writable synced with the server.
 * @param val - initial value
 * @param opts.query - which server query to sync with
 * @param opts.match - an optional pattern to match the server response with and extract data from
 * @param opts.apply - an optional transform to perform after match
 * @param opts.send - a functon returning the query to send to the server when the store value is updated
 */
export function sync<Q extends SendKey & RecvKey, T>(
  server: Server,
  val: T,
  opt: SyncOpt<Q, T>
): Syncable<T> {
  if (!opt.match) opt.match = pick

  if (!opt.apply) opt.apply = (v: any) => v

  if (!opt.send) opt.send = (v: T) => v as any

  const cb = (e: Recv[Q]) => {
    let val = patternValue(opt.match, e)
    if (val !== skip && val !== cont) {
      val = opt.apply(val)
      subs.forEach(sub => sub(val))
    }
  }

  function on() {
    server.on(opt.query, cb)
  }
  function off() {
    server.off(opt.query, cb)
  }

  let subs: ((val: T) => void)[] = []

  function subscribe(sub: (val: T) => void) {
    if (subs.length === 0) on()
    sub(val)
    subs.push(sub)
    return () => {
      subs.splice(subs.indexOf(sub), 1)
      if (subs.length === 0) off()
    }
  }

  async function set(newVal: T) {
    if (newVal === val) {
      // console.warn(opt.query, newVal)
      return
    }
    const oldVal = val
    val = newVal
    subs.forEach(sub => sub(val))
    const query = opt.send(val)
    if (query !== skip) {
      try {
        await server.query(opt.query, query)
      } catch {
        val = oldVal
        subs.forEach(sub => sub(val))
      }
    }
  }

  async function sync(newVal: T) {
    const oldVal = val
    val = newVal
    subs.forEach(sub => sub(val))
    const query = opt.send(val)
    if (query !== skip) {
      try {
        await server.query(opt.query, query)
      } catch {
        val = oldVal
        subs.forEach(sub => sub(val))
      }
    }
  }

  function update(cb: (val: T) => T) {
    set(cb(val))
  }

  return { subscribe, set, update, sync }
}
