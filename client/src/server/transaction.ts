import * as MapDir from '../twmap/mapdir'

// type DictKeys<T> = [keyof T]
// type ArrKeys<T> = [number, T]
// type Keys<D> = D extends Array<infer K> ? ArrKeys<K> : D extends Record<string, any> ? DictKeys<D> : []

// type Proto = {
//   map: {
//     info: 0,
//     envelopes: Omit<MapDir.Envelope, 'type'>[]
//   }
// }

// recursive version

interface Proto {
  map: {
    info: MapDir.Info,
    envelopes: MapDir.Envelope[],
    groups: {
      group: MapDir.Group,
      layers: MapDir.Layer[]
    }[]
  }
}

type DictKeys<T> = { [K in keyof T]: [K, ...Keys<T[K]>] }[keyof T]
type ArrKeys<T> = [number, ...Keys<T>]
type Keys<D> = D extends Array<infer K> ? ArrKeys<K> : D extends Record<string, any> ? DictKeys<D> : []
type ProtoPath = Keys<Proto>

// type DictKeys<T> = { [K in keyof T]: [K, ...Keys<T[K]>] }[keyof T]
// type ArrKeys<T> = [number, ...Keys<T>]
// type Keys<D> = D extends Array<infer K> ? ArrKeys<K> : D extends Record<string, any> ? DictKeys<D> : []
// type ProtoPath = Keys<Proto>

type Common<K extends Array<any>, S extends Array<any>> =
  K extends [infer K1, ...infer Kr] ?
    S extends [infer S1, ...infer Sr] ?
      K1 extends S1 ? Common<Kr, Sr> : false
    : true
  : false

// type FilterCommon<K extends Array<any>, S extends Array<any>> = 

// type Stops = ['map', 'info', 'settings']
// type M = Common<ProtoPath, Stops>