import type { EditTile, EditTileParams } from '../../server/protocol'
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

// list of layers -> 2d array of tiles
export type Brush = {
  group: number,
  layers: {
    layer: number,
    tiles: EditTileParams[][],
  }[]
}

export type Range = {
  start: Coord
  end: Coord
}

export function getLayerImage(rmap: RenderMap, g: number, l: number) {
  return rmap.groups[g].layers[l].texture.image
}

// export function startBoxSelect(activeRgroup: RenderGroup) {
//   let off = activeRgroup.offset()
//   const x = Math.floor(viewport.mousePos.x - off[0])
//   const y = Math.floor(viewport.mousePos.y - off[1])

//   selection.start = { x, y }
// }

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

// export function endBoxSelect(activeRgroup: RenderGroup) {
//   let off = activeRgroup.offset()
//   const x = Math.floor(viewport.mousePos.x - off[0])
//   const y = Math.floor(viewport.mousePos.y - off[1])

//   selection.end = { x, y }

//   return normalizeRange(selection)
// }

function makeTileParams(layer: AnyTilesLayer<any>, x: number, y: number): EditTileParams {
  return layer instanceof TilesLayer
    ? { type: 'tile', ...layer.getTile(x, y) }
    : layer instanceof GameLayer
    ? { type: 'tile', ...layer.getTile(x, y) }
    : layer instanceof FrontLayer
    ? { type: 'tile', ...layer.getTile(x, y) }
    : layer instanceof TeleLayer
    ? { type: 'tele', ...layer.getTile(x, y) }
    : layer instanceof SwitchLayer
    ? { type: 'switch', ...layer.getTile(x, y) }
    : layer instanceof SpeedupLayer
    ? { type: 'speedup', ...layer.getTile(x, y) }
    : layer instanceof TuneLayer
    ? { type: 'tune', ...layer.getTile(x, y) }
    : null
}

function makeDefaultTileParams(layer: AnyTilesLayer<any>): EditTileParams {
  return layer instanceof TilesLayer
    ? { type: 'tile', ...layer.defaultTile() }
    : layer instanceof GameLayer
    ? { type: 'tile', ...layer.defaultTile() }
    : layer instanceof FrontLayer
    ? { type: 'tile', ...layer.defaultTile() }
    : layer instanceof TeleLayer
    ? { type: 'tele', ...layer.defaultTile() }
    : layer instanceof SwitchLayer
    ? { type: 'switch', ...layer.defaultTile() }
    : layer instanceof SpeedupLayer
    ? { type: 'speedup', ...layer.defaultTile() }
    : layer instanceof TuneLayer
    ? { type: 'tune', ...layer.defaultTile() }
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

export function placeTiles(
  server: WebSocketServer,
  rmap: RenderMap,
  pos: Coord,
  brush: Brush
) {
  let changes: EditTile[] = []

  for (const layer of brush.layers) {
    let [i, j] = [0, 0]

    for (const row of layer.tiles) {
      for (const tile of row) {
        const change: EditTile = {
          group: brush.group,
          layer: layer.layer,
          x: pos.x + i,
          y: pos.y + j,
          ...tile,
        }
        changes.push(change)
        i++
      }
      j++
      i = 0
    }
  }

  for (const change of changes) {
    const res = rmap.editTile(change)

    // only send change if succeeded e.g. not redundant
    if (res) server.send('edittile', change)
  }
}

export function fill(
  server: WebSocketServer,
  rmap: RenderMap,
  range: Range,
  brush: Brush
) {
  let changes: EditTile[] = []

  for (const layer of brush.layers) {
    for (let j = range.start.y; j <= range.end.y; j++) {
      for (let i = range.start.x; i <= range.end.x; i++) {
        const change: EditTile = {
          group: brush.group,
          layer: layer.layer,
          x: i,
          y: j,
          ...layer.tiles[(j - range.start.y) % layer.tiles.length][(i - range.start.x) % layer.tiles[0].length],
        }
        changes.push(change)
      }
    }
  }

  for (const change of changes) {
    const res = rmap.editTile(change)

    // only send change if succeeded e.g. not redundant
    if (res) server.send('edittile', change)
  }
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
    let changes: EditTile[] = []

    // TODO: avoid changing twice the same tile
    for (const layer of brush.layers) {
      let [i, j] = [0, 0]

      for (const row of layer.tiles) {
        for (const tile of row) {
          const change: EditTile = {
            group: brush.group,
            layer: layer.layer,
            x: point[0] + i,
            y: point[1] + j,
            ...tile,
          }
          changes.push(change)
          i++
        }
        j++
        i = 0
      }
    }

    for (const change of changes) {
      const res = rmap.editTile(change)

      // only send change if succeeded e.g. not redundant
      if (res) server.send('edittile', change)
    }
  }
}

// taken from https://github.com/thejonwithnoh/bresenham-js/blob/master/bresenham-js.js
export function bresenham(p1: [number, number], p2: [number, number]) {
  const delta = p2.map((val, index) => val - p1[index])
  const increment = delta.map(Math.sign)
  const absDelta = delta.map(Math.abs)
  const absDelta2 = absDelta.map(val => 2 * val)
  const maxIndex = absDelta.reduce((acc, val, index) => (val > absDelta[acc] ? index : acc), 0)
  const error = absDelta2.map(val => val - absDelta[maxIndex])

  var res = []
  var current = p1.slice()
  for (var j = 0; j < absDelta[maxIndex]; j++) {
    res.push(current.slice())
    for (var i = 0; i < error.length; i++) {
      if (error[i] > 0) {
        current[i] += increment[i]
        error[i] -= absDelta2[maxIndex]
      }
      error[i] += absDelta2[i]
    }
  }
  res.push(current.slice())
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
