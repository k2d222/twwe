import type { EditTile } from '../../server/protocol'
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

export function getLayerImage(rmap: RenderMap, groupID: number, layerID: number) {
  return rmap.groups[groupID].layers[layerID].texture.image
}

export function placeTile(rmap: RenderMap, group: number, layer: number, id: number) {
  let { x, y } = viewport.mousePos
  x = Math.floor(x)
  y = Math.floor(y)

  let change: EditTile = {
    group,
    layer,
    x,
    y,
    id,
  }

  const res = rmap.editTile(change)

  // only send change if succeeded e.g. not redundant
  if(res)
    server.send('edittile', change)
}

// export function setupCanvasEvents(canvas: HTMLCanvasElement) {
  
// }