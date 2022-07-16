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

export function placeTile(rmap: RenderMap, g: number, l: number, tile: EditTileParams) {
  let { x, y } = viewport.mousePos
  x = Math.floor(x)
  y = Math.floor(y)
  
  let change: EditTile = {
    group: g,
    layer: l,
    x,
    y,
    ...tile
  }

  const res = rmap.editTile(change)

  // only send change if succeeded e.g. not redundant
  if(res)
    server.send('edittile', change)
}

// export function setupCanvasEvents(canvas: HTMLCanvasElement) {
  
// }