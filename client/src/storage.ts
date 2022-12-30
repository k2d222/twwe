const { VITE_WEBSOCKET_URL } = import.meta.env

export interface ServerConfig {
  name: string,
  url: string,
}

interface StorageSpec {
  servers: ServerConfig[],
  currentServer: number,
}

interface StorageEntry<T> {
  clone: (inst: T) => T
  default: T
}

type StorageEntries = { [K in keyof StorageSpec]: StorageEntry<StorageSpec[K]> }

function cloneServerConf(conf: ServerConfig) {
  const { url, name } = conf
  return { url, name }
}

const entries: StorageEntries = {
  servers: {
    clone: function (confs: ServerConfig[]) {
      return confs.map(cloneServerConf)
    },
    default: [{ name: "Default Server", url: VITE_WEBSOCKET_URL }]
  },
  currentServer: {
    clone: (x) => x,
    default: 0
  }
}

const storage = {
  version: 1,
  init: function() {
    const storedVersion = parseInt(localStorage.getItem('version'))
    if (storedVersion !== storage.version) {
      localStorage.clear()
      localStorage.setItem('version', '' + storage.version)
      for (const [key, entry] of Object.entries(entries)) {
        localStorage.setItem(key, JSON.stringify(entry.default))
      }
    }
  },
  load: function<K extends keyof StorageSpec> (key: K): StorageSpec[K] {
    return JSON.parse(localStorage.getItem(key))
  },

  save: function<K extends keyof StorageSpec> (key: K, val: StorageSpec[K]) {
    localStorage.setItem(key, JSON.stringify(val))
  }
}

storage.init()
export default storage
