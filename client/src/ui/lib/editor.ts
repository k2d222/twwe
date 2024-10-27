import type { RenderMap } from '../../gl/renderMap'
import type { AnyTilesLayer } from '../../twmap/tilesLayer'
import type { Coord } from '../../twmap/types'
import type { WebSocketServer } from '../../server/server'
import type { Map } from '../../twmap/map'
import * as Info from '../../twmap/types'
import * as MapDir from '../../twmap/mapdir'
import { tilesToData } from '../../server/convert'
import { layerKind } from './util'

// list of layers -> 2d array of tiles
export type Brush = {
  group: number
  layers: {
    layer: number
    kind: MapDir.LayerKind
    tiles: Info.AnyTile[][]
  }[]
}

// careful: range is sometime end-inclusive, sometimes exclusive
// TODO: make always exclusive
export type Range = {
  start: Coord
  end: Coord
}

export function normalizeRange(range: Range): Range {
  const minX = Math.min(range.start.x, range.end.x)
  const maxX = Math.max(range.start.x, range.end.x)
  const minY = Math.min(range.start.y, range.end.y)
  const maxY = Math.max(range.start.y, range.end.y)

  return {
    start: { x: minX, y: minY },
    end: { x: maxX, y: maxY },
  }
}

export function cloneRange(range: Range): Range {
  return {
    start: { x: range.start.x, y: range.start.y },
    end: { x: range.end.x, y: range.end.y },
  }
}

export function createRange(): Range {
  return {
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
  }
}

// function makeTileParams(layer: AnyTilesLayer<any>, x: number, y: number): Info.AnyTile {
//   return layer instanceof TilesLayer
//     ? { kind: MapDir.LayerKind.Tiles, ...layer.getTile(x, y) }
//     : layer instanceof GameLayer
//     ? { kind: MapDir.LayerKind.Game, ...layer.getTile(x, y) }
//     : layer instanceof FrontLayer
//     ? { kind: MapDir.LayerKind.Front, ...layer.getTile(x, y) }
//     : layer instanceof TeleLayer
//     ? { kind: MapDir.LayerKind.Tele, ...layer.getTile(x, y) }
//     : layer instanceof SwitchLayer
//     ? { kind: MapDir.LayerKind.Switch, ...layer.getTile(x, y) }
//     : layer instanceof SpeedupLayer
//     ? { kind: MapDir.LayerKind.Speedup, ...layer.getTile(x, y) }
//     : layer instanceof TuneLayer
//     ? { kind: MapDir.LayerKind.Tune, ...layer.getTile(x, y) }
//     : null
// }

// function makeDefaultTileParams(layer: AnyTilesLayer<any>): EditTileParams {
//   return layer instanceof TilesLayer
//     ? { kind: MapDir.LayerKind.Tiles, ...layer.defaultTile() }
//     : layer instanceof GameLayer
//     ? { kind: MapDir.LayerKind.Game, ...layer.defaultTile() }
//     : layer instanceof FrontLayer
//     ? { kind: MapDir.LayerKind.Front, ...layer.defaultTile() }
//     : layer instanceof TeleLayer
//     ? { kind: MapDir.LayerKind.Tele, ...layer.defaultTile() }
//     : layer instanceof SwitchLayer
//     ? { kind: MapDir.LayerKind.Switch, ...layer.defaultTile() }
//     : layer instanceof SpeedupLayer
//     ? { kind: MapDir.LayerKind.Speedup, ...layer.defaultTile() }
//     : layer instanceof TuneLayer
//     ? { kind: MapDir.LayerKind.Tune, ...layer.defaultTile() }
//     : null
// }

export function makeBoxSelection(map: Map, g: number, ll: number[], sel: Range): Brush {
  const res: Brush = {
    group: g,
    layers: [],
  }

  const group = map.groups[g]

  for (let l of ll) {
    const layer = group.layers[l] as AnyTilesLayer<any>
    const tiles: Info.AnyTile[][] = []

    for (let j = sel.start.y; j <= sel.end.y; j++) {
      const row = []
      for (let i = sel.start.x; i <= sel.end.x; i++) {
        row.push({ ...layer.getTile(i, j) })
      }
      tiles.push(row)
    }

    res.layers.push({
      layer: l,
      kind: layerKind(layer),
      tiles,
    })
  }

  return res
}

export function makeEmptySelection(map: Map, g: number, ll: number[], sel: Range): Brush {
  const res: Brush = {
    group: g,
    layers: [],
  }

  const group = map.groups[g]

  for (let l of ll) {
    const layer = group.layers[l] as AnyTilesLayer<any>
    const tiles: Info.AnyTile[][] = []

    for (let j = sel.start.y; j <= sel.end.y; j++) {
      const row = []
      for (let i = sel.start.x; i <= sel.end.x; i++) {
        row.push(layer.defaultTile())
      }
      tiles.push(row)
    }

    res.layers.push({
      layer: l,
      kind: layerKind(layer),
      tiles,
    })
  }

  return res
}

function tileKind(tile: Info.AnyTile): MapDir.LayerKind {
  if ('force' in tile) return MapDir.LayerKind.Speedup
  else if ('delay' in tile) return MapDir.LayerKind.Switch
  else if ('flags' in tile)
    return MapDir.LayerKind.Tiles // or Game or Front
  else return MapDir.LayerKind.Tele // or Tune
}

function adaptTile(tile: Info.AnyTile, kind: MapDir.LayerKind): Info.AnyTile {
  if (tileKind(tile) === kind) {
    // COMBAK
    return tile
  } else if (kind === MapDir.LayerKind.Tiles) {
    return {
      id: tile.id,
      flags: 0,
    }
  } else if (kind === MapDir.LayerKind.Front) {
    return {
      id: tile.id,
      flags: 0,
    }
  } else if (kind === MapDir.LayerKind.Game) {
    return {
      id: tile.id,
      flags: 0,
    }
  } else if (kind === MapDir.LayerKind.Speedup) {
    return {
      id: tile.id,
      force: 50,
      maxSpeed: 0,
      angle: 0,
    }
  } else if (kind === MapDir.LayerKind.Switch) {
    return {
      id: tile.id,
      flags: 0,
      delay: 0,
      number: 0,
    }
  } else if (kind === MapDir.LayerKind.Tele) {
    return {
      id: tile.id,
      number: 0,
    }
  } else if (kind === MapDir.LayerKind.Tune) {
    return {
      id: tile.id,
      number: 0,
    }
  } else {
    throw 'Unsupported layer kind ' + kind
  }
}

export function adaptTiles(tiles: Info.AnyTile[][], kind: MapDir.LayerKind): Info.AnyTile[][] {
  return tiles.map(row => row.map(tile => adaptTile(tile, kind)))
}

export function adaptBrushToLayers(map: Map, brush: Brush, g: number, ll: number[]): Brush {
  return {
    group: g,
    layers: ll.map(l => {
      const layer = brush.layers.find(x => brush.group === g && x.layer === l)
      if (layer) {
        return layer
      } else {
        const kind = layerKind(map.groups[g].layers[l])
        return {
          layer: l,
          kind,
          tiles: adaptTiles(brush.layers[0].tiles, kind),
        }
      }
    }),
  }
}

// truncate 2D array left-right-top-bottom
export function truncate<T>(arr: T[][], range: Range) {
  return arr.slice(range.start.y, range.end.y).map(arr => arr.slice(range.start.x, range.end.x))
}

// periodic repetition of 2D array
export function repeat<T>(arr: T[][], size: Coord) {
  const w = arr[0].length
  const h = arr.length
  return Array.from({ length: size.y }, (_, y) =>
    Array.from({ length: size.x }, (_, x) => arr[y % h][x % w])
  )
}

function clamp(cur: number, min: number, max: number) {
  return Math.min(Math.max(min, cur), max)
}

export function placeTiles(server: WebSocketServer, rmap: RenderMap, pos: Coord, brush: Brush) {
  for (let i = 0; i < brush.layers.length; ++i) {
    const brushLayer = brush.layers[i]
    const targetLayer = rmap.groups[brush.group].layers[brushLayer.layer]
      .layer as AnyTilesLayer<any>

    // make sure the brush is truncated on the edges of the layer
    const width = brushLayer.tiles[0].length
    const height = brushLayer.tiles.length
    const range = {
      start: {
        x: clamp(pos.x, 0, targetLayer.width) - pos.x,
        y: clamp(pos.y, 0, targetLayer.height) - pos.y,
      },
      end: {
        x: clamp(pos.x + width, 0, targetLayer.width) - pos.x,
        y: clamp(pos.y + height, 0, targetLayer.height) - pos.y,
      },
    }

    const tiles = truncate(brushLayer.tiles, range)
    const x = range.start.x + pos.x
    const y = range.start.y + pos.y
    const w = range.end.x - range.start.x
    const h = range.end.y - range.start.y

    function isChanged() {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          const tile = tiles[j - y][i - x]
          const targetTile = targetLayer.getTile(i, j)

          for (let key in targetTile) {
            if (key in tile && tile[key] !== targetTile[key]) {
              return true
            }
          }
        }
      }
      return false
    }

    if (isChanged()) {
      const data = tilesToData(tiles.flat())
      server.send('edit/tiles', [brush.group, brushLayer.layer, { x, y, w, h, tiles: data }])
    }
  }
}

export function fill(server: WebSocketServer, rmap: RenderMap, range: Range, brush: Brush) {
  const size = {
    x: range.end.x - range.start.x + 1,
    y: range.end.y - range.start.y + 1,
  }
  const expanded = {
    group: brush.group,
    layers: brush.layers.map(l => ({
      layer: l.layer,
      kind: l.kind,
      tiles: repeat(l.tiles, size),
    })),
  }
  placeTiles(server, rmap, range.start, expanded)
}

export function drawLine(
  server: WebSocketServer,
  rmap: RenderMap,
  start: Coord,
  end: Coord,
  brush: Brush
) {
  const points = bresenham([start.x, start.y], [end.x, end.y])

  for (const point of points) {
    placeTiles(server, rmap, { x: point[0], y: point[1] }, brush)
  }
}

// taken from https://github.com/thejonwithnoh/bresenham-js/blob/master/bresenham-js.js
export function bresenham(p1: [number, number], p2: [number, number]): [number, number][] {
  const delta = p2.map((val, index) => val - p1[index])
  const increment = delta.map(Math.sign)
  const absDelta = delta.map(Math.abs)
  const absDelta2 = absDelta.map(val => 2 * val)
  const maxIndex = absDelta.reduce((acc, val, index) => (val > absDelta[acc] ? index : acc), 0)
  const error = absDelta2.map(val => val - absDelta[maxIndex])

  var res: [number, number][] = []
  var current = p1.slice() as [number, number]
  for (var j = 0; j < absDelta[maxIndex]; j++) {
    res.push(current.slice() as [number, number])
    for (var i = 0; i < error.length; i++) {
      if (error[i] > 0) {
        current[i] += increment[i]
        error[i] -= absDelta2[maxIndex]
      }
      error[i] += absDelta2[i]
    }
  }
  res.push(current.slice() as [number, number])
  return res
}

type EventMap = HTMLElementEventMap
type EventTypes = keyof EventMap & ('keydown' | 'keyup' | 'keypress')
type EventCallback<K extends EventTypes> = (e: EventMap[K]) => any

const callbacks: { [K in EventTypes]: EventCallback<K>[] } = {
  keydown: [],
  keyup: [],
  keypress: [],
}

export function on<K extends EventTypes>(type: K, fn: EventCallback<K>) {
  callbacks[type].push(fn as any)
}

export function fire<K extends EventTypes>(type: K, e: EventMap[K]) {
  for (const fn of callbacks[type]) fn(e)
}
export function off<K extends EventTypes>(type: K, fn: EventCallback<K>) {
  const index = callbacks[type].indexOf(fn as any)
  if (index !== -1) callbacks[type].splice(index)
  else console.error('failed to remove', type, 'event')
}
