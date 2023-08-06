import type { EditTile, EditTileParams, EditTiles } from '../../server/protocol'
import type { RenderMap } from '../../gl/renderMap'
import type { AnyTilesLayer } from '../../twmap/tilesLayer'
import type { Coord } from '../../twmap/types'
import type { WebSocketServer } from 'src/server/server'
import type { Map } from '../../twmap/map'
import {
  TilesLayer,
  GameLayer,
  FrontLayer,
  TeleLayer,
  SwitchLayer,
  SpeedupLayer,
  TuneLayer,
} from '../../twmap/tilesLayer'
import { dataToTiles, tilesToData, tileToData } from '../../server/convert'
import type * as MapDir from '../../twmap/mapdir'
import type { RenderAnyTilesLayer } from 'src/gl/renderTilesLayer'

// list of layers -> 2d array of tiles
export type Brush = {
  group: number,
  layers: {
    layer: number,
    tiles: EditTileParams[][],
  }[]
}

// careful: range is sometime end-inclusive, sometimes exclusive
// TODO: make always exclusive
export type Range = {
  start: Coord
  end: Coord
}

export function getLayerImage(rmap: RenderMap, g: number, l: number) {
  return rmap.groups[g].layers[l].texture.image
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

function makeTileParams(layer: AnyTilesLayer<any>, x: number, y: number): EditTileParams {
  return layer instanceof TilesLayer
    ? { kind: 'tiles', ...layer.getTile(x, y) }
    : layer instanceof GameLayer
    ? { kind: 'game', ...layer.getTile(x, y) }
    : layer instanceof FrontLayer
    ? { kind: 'front', ...layer.getTile(x, y) }
    : layer instanceof TeleLayer
    ? { kind: 'tele', ...layer.getTile(x, y) }
    : layer instanceof SwitchLayer
    ? { kind: 'switch', ...layer.getTile(x, y) }
    : layer instanceof SpeedupLayer
    ? { kind: 'speedup', ...layer.getTile(x, y) }
    : layer instanceof TuneLayer
    ? { kind: 'tune', ...layer.getTile(x, y) }
    : null
}

function makeDefaultTileParams(layer: AnyTilesLayer<any>): EditTileParams {
  return layer instanceof TilesLayer
    ? { kind: 'tiles', ...layer.defaultTile() }
    : layer instanceof GameLayer
    ? { kind: 'game', ...layer.defaultTile() }
    : layer instanceof FrontLayer
    ? { kind: 'front', ...layer.defaultTile() }
    : layer instanceof TeleLayer
    ? { kind: 'tele', ...layer.defaultTile() }
    : layer instanceof SwitchLayer
    ? { kind: 'switch', ...layer.defaultTile() }
    : layer instanceof SpeedupLayer
    ? { kind: 'speedup', ...layer.defaultTile() }
    : layer instanceof TuneLayer
    ? { kind: 'tune', ...layer.defaultTile() }
    : null
}

export function makeBoxSelection(map: Map, g: number, ll: number[], sel: Range): Brush {
  const res: Brush = {
    group: g,
    layers: [],
  }

  const group = map.groups[g]

  for (let l of ll) {
    const layer = group.layers[l] as AnyTilesLayer<any>
    const tiles: EditTileParams[][] = []

    for (let j = sel.start.y; j <= sel.end.y; j++) {
      const row = []
      for (let i = sel.start.x; i <= sel.end.x; i++) {
        row.push(makeTileParams(layer, i, j))
      }
      tiles.push(row)
    }

    res.layers.push({ layer: l, tiles })
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
    const tiles: EditTileParams[][] = []

    for (let j = sel.start.y; j <= sel.end.y; j++) {
      const row = []
      for (let i = sel.start.x; i <= sel.end.x; i++) {
        row.push(makeDefaultTileParams(layer))
      }
      tiles.push(row)
    }

    res.layers.push({ layer: l, tiles })
  }

  return res
}

// truncate 2D array left-right-top-bottom
export function truncate<T>(arr: T[][], range: Range) {
  return arr.slice(range.start.y, range.end.y)
    .map(arr => arr.slice(range.start.x, range.end.x))
}

// periodic repetition of 2D array
export function repeat<T>(arr: T[][], size: Coord) {
  const w = arr[0].length
  const h = arr.length
  return Array.from({ length: size.y }, (_, y) => Array.from({ length: size.x }, (_, x) => arr[y % h][x % w]))
}

function clamp(cur: number, min: number, max: number) {
  return Math.min(Math.max(min, cur), max)
}

export function placeTiles(
  server: WebSocketServer,
  rmap: RenderMap,
  pos: Coord,
  brush: Brush
) {
  for (let i = 0; i < brush.layers.length; ++i) {
    const brushLayer = brush.layers[i]
    const targetLayer = rmap.groups[brush.group].layers[brushLayer.layer].layer as AnyTilesLayer<any>

    // make sure the brush is truncated on the edges of the layer
    const w = brushLayer.tiles[0].length
    const h = brushLayer.tiles.length
    const range = {
      start: {
        x: clamp(pos.x, 0, targetLayer.width) - pos.x,
        y: clamp(pos.y, 0, targetLayer.height) - pos.y
      },
      end: {
        x: clamp(pos.x + w, 0, targetLayer.width) - pos.x,
        y: clamp(pos.y + h, 0, targetLayer.height) - pos.y,
      }
    }
    const width = range.end.x - range.start.x
    const height = range.end.y - range.start.y
    let changed = false

    for (let y = 0; y < height; ++y) {
      for (let x = 0; x < width; ++x) {

        const edit: EditTile = {
          group: brush.group,
          layer: brushLayer.layer,
          x: range.start.x + pos.x + x,
          y: range.start.y + pos.y + y,
          ...brushLayer.tiles[range.start.y + y][range.start.x + x]
        }
        changed = rmap.editTile(edit) || changed

      }
    }

    // only send change if succeeded e.g. not redundant
    if (changed) {
      const tiles = truncate(brushLayer.tiles, range)
      const data = tilesToData(tiles.flat())
      server.send('edittiles', {
        group: brush.group,
        layer: brushLayer.layer,
        x: range.start.x + pos.x,
        y: range.start.y + pos.y,
        kind: brushLayer.tiles[0][0].kind,
        width,
        height,
        data,
      })
    }

  }
}

export function fill(
  server: WebSocketServer,
  rmap: RenderMap,
  range: Range,
  brush: Brush
) {
  const size = {
    x: range.end.x - range.start.x + 1,
    y: range.end.y - range.start.y + 1,
  }
  const expanded = {
    group: brush.group,
    layers: brush.layers.map(l => ({
      layer: l.layer,
      tiles: repeat(l.tiles, size),
    }))
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
