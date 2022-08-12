import type { EditTile, EditTileParams } from '../../server/protocol'
import type { RenderMap } from '../../gl/renderMap'
import type { RenderGroup } from '../../gl/renderGroup'
import type { AnyTilesLayer } from '../../twmap/tilesLayer'
import type { Coord } from '../../twmap/types'
import { TilesLayer, GameLayer, FrontLayer, TeleLayer, SwitchLayer, SpeedupLayer, TuneLayer } from '../../twmap/tilesLayer'
import { server } from '../global'
import { viewport } from '../../gl/global'
import { queryMapBinary } from '../lib/util'

export type Range = {
  start: Coord,
  end: Coord,
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

let pressed = false
let lastPos = { x: 0, y: 0 }
let selection: Range = {
  start: { x: 0, y: 0 },
  end: { x: 0, y: 0 },
}

export function press() {
  lastPos = { ...viewport.mousePos }
  pressed = true
}

export function release() {
  pressed = false
}

export function startBoxSelect(activeRgroup: RenderGroup) {
  let off = activeRgroup.offset()
  const x = Math.floor(viewport.mousePos.x - off[0])
  const y = Math.floor(viewport.mousePos.y - off[1])

  selection.start = { x, y }
}

function normalizeRange(range: Range): Range {
  const minX = Math.min(range.start.x, range.end.x)
  const maxX = Math.max(range.start.x, range.end.x)
  const minY = Math.min(range.start.y, range.end.y)
  const maxY = Math.max(range.start.y, range.end.y)

  return {
    start: { x: minX, y: minY },
    end: { x: maxX, y: maxY },
  }
}

export function endBoxSelect(activeRgroup: RenderGroup) {
  let off = activeRgroup.offset()
  const x = Math.floor(viewport.mousePos.x - off[0])
  const y = Math.floor(viewport.mousePos.y - off[1])

  selection.end = { x, y }
  
  return normalizeRange(selection)
}

function makeTileParams(layer: AnyTilesLayer<any>, x: number, y: number): EditTileParams {
  return layer instanceof TilesLayer ? { type: 'tile', ...layer.getTile(x, y) } :
         layer instanceof GameLayer ? { type: 'tile', ...layer.getTile(x, y) } :
         layer instanceof FrontLayer ? { type: 'tile', ...layer.getTile(x, y) } :
         layer instanceof TeleLayer ? { type: 'tele', ...layer.getTile(x, y) } :
         layer instanceof SwitchLayer ? { type: 'switch', ...layer.getTile(x, y) } :
         layer instanceof SpeedupLayer ? { type: 'speedup', ...layer.getTile(x, y) } :
         layer instanceof TuneLayer ? { type: 'tune', ...layer.getTile(x, y) } :
         null
}

export function makeBoxSelection(layer: AnyTilesLayer<any>, sel: Range): EditTileParams[][] {
  const res: EditTileParams[][] = []

  for (let j = sel.start.y; j <= sel.end.y; j++) {
    const row  = []
    for (let i = sel.start.x; i <= sel.end.x; i++) {
      row.push(makeTileParams(layer, i, j))
    }
    res.push(row)
  }
  
  return res
}

export function placeTile(rmap: RenderMap, g: number, l: number, tile: EditTileParams) {
  if (!pressed)
    return

  const rgroup = rmap.groups[g]
  let off = rgroup.offset()

  let p1: [number, number] = [ lastPos.x, lastPos.y ]
  let p2: [number, number] = [ viewport.mousePos.x, viewport.mousePos.y ]
  p1 = p1.map((v, i) => Math.floor(v - off[i])) as [number, number]
  p2 = p2.map((v, i) => Math.floor(v - off[i])) as [number, number]
  
  lastPos = { ...viewport.mousePos }
  
  const points = bresenham(p1, p2)

  for (const point of points) {
    const change: EditTile = {
      group: g,
      layer: l,
      x: point[0],
      y: point[1],
      ...tile
    }

    const res = rmap.editTile(change)

    // only send change if succeeded e.g. not redundant
    if(res)
      server.send('edittile', change)
  }
}

export function placeTiles(rmap: RenderMap, g: number, l: number, tiles: EditTileParams[][]) {
  if (!pressed)
    return
  
  const rgroup = rmap.groups[g]
  let off = rgroup.offset()

  let p1: [number, number] = [ lastPos.x, lastPos.y ]
  let p2: [number, number] = [ viewport.mousePos.x, viewport.mousePos.y ]
  p1 = p1.map((v, i) => Math.floor(v - off[i])) as [number, number]
  p2 = p2.map((v, i) => Math.floor(v - off[i])) as [number, number]
  
  lastPos = { ...viewport.mousePos }
  
  const points = bresenham(p1, p2)
  
  for (const point of points) {
    let [ i, j ] = [ 0, 0 ]
    let changes: EditTile[] = []

    for (const row of tiles) {
      for (const tile of row) {
        const change: EditTile = {
          group: g,
          layer: l,
          x: point[0] + i,
          y: point[1] + j,
          ...tile
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
      if(res)
        server.send('edittile', change)
    }
  }
}

// taken from https://github.com/thejonwithnoh/bresenham-js/blob/master/bresenham-js.js
export function bresenham(p1: [number, number], p2: [number, number]) {
  const delta = p2.map((val, index) => val - p1[index]);
  const increment = delta.map(Math.sign);
  const absDelta = delta.map(Math.abs);
  const absDelta2 = absDelta.map(val => 2 * val);
  const maxIndex = absDelta.reduce((acc, val, index) => val > absDelta[acc] ? index : acc, 0);
  const error = absDelta2.map(val => val - absDelta[maxIndex]);

  var res = [];
  var current = p1.slice();
  for (var j = 0; j < absDelta[maxIndex]; j++) {
    res.push(current.slice());
    for (var i = 0; i < error.length; i++) {
      if (error[i] > 0) {
        current[i] += increment[i];
        error[i] -= absDelta2[maxIndex];
      }
      error[i] += absDelta2[i];
    }
  }
  res.push(current.slice());
  return res;
}