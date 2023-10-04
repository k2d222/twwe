const { VITE_SERVER_URLS } = import.meta.env

export interface ServerConfig {
  name: string
  host: string
  port: number
  encrypted: boolean
}

interface StorageSpec {
  servers: ServerConfig[]
  currentServer: number
}

interface StorageEntry<T> {
  clone: (inst: T) => T
  default: T
}

type StorageEntries = { [K in keyof StorageSpec]: StorageEntry<StorageSpec[K]> }

const entries: StorageEntries = {
  servers: {
    clone: function (confs: ServerConfig[]) {
      return confs.map(c => ({ ...c }))
    },
    default: VITE_SERVER_URLS
      .split(',')
      .map(url => url.split(':'))
      .map(([name, host, port, ssl]) => ({ name, host, port: parseInt(port), encrypted: ssl === '1' })),
  },
  currentServer: {
    clone: x => x,
    default: 0,
  },
}

const storage = {
  version: 3,
  init: function () {
    const storedVersion = parseInt(localStorage.getItem('version') ?? '0')
    if (storedVersion !== storage.version) {
      localStorage.clear()
      localStorage.setItem('version', '' + storage.version)
      for (const [key, entry] of Object.entries(entries)) {
        localStorage.setItem(key, JSON.stringify(entry.default))
      }
    }
  },
  load: function <K extends keyof StorageSpec>(key: K): StorageSpec[K] {
    return JSON.parse(localStorage.getItem(key) ?? '')
  },

  save: function <K extends keyof StorageSpec>(key: K, val: StorageSpec[K]) {
    localStorage.setItem(key, JSON.stringify(val))
  },
}

storage.init()
export default storage
