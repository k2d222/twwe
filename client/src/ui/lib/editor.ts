import type { EditTile } from '../../server/protocol'
import { server } from '../global'
import { Map } from '../../twmap/map'
import { viewport, renderer, init as glInit } from '../../gl/global'
import { RenderMap } from '../../gl/renderMap'
import { LayerType } from '../../twmap/types'


export async function loadMap(mapName: string) {
  await server.query('joinmap', { name: mapName })
  const buf = await server.queryMap({ name: mapName })
  return new Map(mapName, buf)
}

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
  const map = rmap.map
  const layer = map.groups[groupID].layers[layerID]
  let image = layer.image
  if (layer.type === LayerType.GAME)
    image = rmap.gameLayer.texture.image
  return image
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