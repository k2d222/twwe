import type { EditTile, EditTileParams } from '../../server/protocol'
import type { Map } from '../../twmap/map'
import { server } from '../global'
import { viewport, renderer, init as glInit } from '../../gl/global'
import { RenderMap } from '../../gl/renderMap'

export function createRenderMap(canvas: HTMLCanvasElement, map: Map) {
  glInit(canvas)
  const rmap = new RenderMap(map)

  function loop() {
    renderer.render(rmap)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
  return rmap
}

export async function downloadMap(mapName: string) {
  const buf = await server.query('sendmap', { name: mapName })
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

export function release() {
  pressed = false
}

export function placeTile(rmap: RenderMap, g: number, l: number, tile: EditTileParams) {
  if (!pressed) {
    lastPos = { ...viewport.mousePos }
    pressed = true
  }
  
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