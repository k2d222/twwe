import type { TileChange } from '../../server/protocol'
import { server } from '../global'
import { Map } from '../../twmap/map'
import { viewport, renderer, init as glInit } from '../../gl/global'
import { RenderMap } from '../../gl/renderMap'
import { LayerType } from '../../twmap/types'


export async function loadMap(mapName: string) {
  const joined = server.query('join', mapName)
  if (!joined)
    throw "failed to join room"
  const buf = await server.query('map')
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
  const buf = await server.query('map')
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a');
  link.href = url;
  link.download = mapName + '.map';

  document.body.append(link);
  link.click();
  link.remove();
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

  let change: TileChange = {
    group,
    layer,
    x,
    y,
    id,
  }

  const res = rmap.applyTileChange(change)

  // only send change if succeeded e.g. not redundant
  if(res)
    server.send('change', change)
}

// export function setupCanvasEvents(canvas: HTMLCanvasElement) {
  
// }