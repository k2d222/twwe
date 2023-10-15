const { VITE_SERVER_URLS } = import.meta.env

export interface ServerConfig {
  name: string
  host: string
  port: number
  encrypted: boolean
  path?: string
}

interface StorageSpec {
  servers: ServerConfig[]
  currentServer: number
}

interface StorageEntry<T> {
  clone: (inst: T) => T
  default: T
  sanitize: (entry: any) => boolean
}

type StorageEntries = { [K in keyof StorageSpec]: StorageEntry<StorageSpec[K]> }

function isServerConfig(entry: any): entry is ServerConfig {
  return typeof entry === 'object' && ['name', 'host', 'port', 'encrypted'].every(k => entry.hasOwnProperty(k))
}

const entries: StorageEntries = {
  servers: {
    clone: (confs: ServerConfig[]) => confs.map(c => ({ ...c })),
    default: VITE_SERVER_URLS
      .split(',')
      .map(url => url.split(':'))
      .map(([name, host, port, ssl]) => ({ name, host, port: parseInt(port), encrypted: ssl === '1' })),
    sanitize: (entry: any) =>  Array.isArray(entry) && entry.every(e => isServerConfig(e))
  },
  currentServer: {
    clone: x => x,
    default: 0,
    sanitize: (entry: any) => typeof entry === 'number' && entry < storage.load('servers').length
  },
}

const storage = {
  version: 3,
  reset: function () {
    localStorage.clear()
    localStorage.setItem('version', '' + storage.version)
    for (const [key, entry] of Object.entries(entries)) {
      localStorage.setItem(key, JSON.stringify(entry.default))
    }
  },
  init: function () {
    const storedVersion = parseInt(localStorage.getItem('version') ?? '0')
    if (storedVersion !== storage.version) {
      storage.reset()
    }
  },
  load: function <K extends keyof StorageSpec>(key: K): StorageSpec[K] {
    try {
      const res = JSON.parse(localStorage.getItem(key))
      if (entries[key].sanitize(res)) {
        return res
      }
      else {
        throw 'sanitization failed'
      }
    }
    catch (e) {
      console.error('localstorage failure:', e)
      storage.reset()
      return storage.load(key)
    }
  },

  save: function <K extends keyof StorageSpec>(key: K, val: StorageSpec[K]) {
    localStorage.setItem(key, JSON.stringify(val))
  },
}

storage.init()
export default storage
