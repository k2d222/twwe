import type { EditTile, EditTileParams } from '../../server/protocol'
import type { RenderMap } from '../../gl/renderMap'
import type { RenderGroup } from '../../gl/renderGroup'
import type { AnyTilesLayer } from '../../twmap/tilesLayer'
import type { Coord } from '../../twmap/types'
import {
  TilesLayer,
  GameLayer,
  FrontLayer,
  TeleLayer,
  SwitchLayer,
  SpeedupLayer,
  TuneLayer,
} from '../../twmap/tilesLayer'
import { server } from '../global'
import { viewport } from '../../gl/global'
import { queryMapBinary } from '../lib/util'

export type Brush = EditTileParams[][]

export type Range = {
  start: Coord
  end: Coord
}

export async function downloadMap(mapName: string) {
  const buf = await queryMapBinary({ name: mapName })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = mapName + '.map'

  document.body.append(link)
  link.click()
  link.remove()
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

export function makeBoxSelection(layer: AnyTilesLayer<any>, sel: Range): Brush {
  const res: Brush = []

  for (let j = sel.start.y; j <= sel.end.y; j++) {
    const row = []
    for (let i = sel.start.x; i <= sel.end.x; i++) {
      row.push(makeTileParams(layer, i, j))
    }
    res.push(row)
  }

  return res
}

export function makeEmptySelection(layer: AnyTilesLayer<any>, sel: Range): Brush {
  const res: Brush = []

  for (let j = sel.start.y; j <= sel.end.y; j++) {
    const row = []
    for (let i = sel.start.x; i <= sel.end.x; i++) {
      row.push(makeDefaultTileParams(layer))
    }
    res.push(row)
  }

  return res
}

export function placeTiles(rmap: RenderMap, g: number, l: number, pos: Coord, tiles: Brush) {
  let [i, j] = [0, 0]
  let changes: EditTile[] = []

  for (const row of tiles) {
    for (const tile of row) {
      const change: EditTile = {
        group: g,
        layer: l,
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

  for (const change of changes) {
    const res = rmap.editTile(change)

    // only send change if succeeded e.g. not redundant
    if (res) server.send('edittile', change)
  }
}

export function fill(rmap: RenderMap, g: number, l: number, range: Range, tiles: Brush) {
  let changes: EditTile[] = []

  for (let j = range.start.y; j <= range.end.y; j++) {
    for (let i = range.start.x; i <= range.end.x; i++) {
      const change: EditTile = {
        group: g,
        layer: l,
        x: i,
        y: j,
        ...tiles[(j - range.start.y) % tiles.length][(i - range.start.x) % tiles[0].length],
      }
      changes.push(change)
    }
  }

  for (const change of changes) {
    const res = rmap.editTile(change)

    // only send change if succeeded e.g. not redundant
    if (res) server.send('edittile', change)
  }
}

export function drawLine(
  rmap: RenderMap,
  g: number,
  l: number,
  start: Coord,
  end: Coord,
  tiles: Brush
) {
  const points = bresenham([start.x, start.y], [end.x, end.y])

  for (const point of points) {
    let [i, j] = [0, 0]
    let changes: EditTile[] = []

    // TODO: avoid changing twice the same tile
    for (const row of tiles) {
      for (const tile of row) {
        const change: EditTile = {
          group: g,
          layer: l,
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
