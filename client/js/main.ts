import { Map } from './twmap/map'
import { RenderMap } from './gl/renderMap'
import { init as glInit, viewport, renderer } from './gl/global'

const MAP_URL = '/maps/Sunny Side Up.map'

async function loadMapData(mapURL: string) {
  let res = await fetch(mapURL)
  return await res.arrayBuffer()
}

let rmap: RenderMap

function loop() {
  viewport.update()
  renderer.render(rmap)
  // requestAnimationFrame(loop)
}

async function main() {
  let canvas = document.querySelector('canvas')
  glInit(canvas)
  let mapData = await loadMapData(MAP_URL)
  let map = new Map("Sunny Side Up", mapData)
  rmap = new RenderMap(map)
  
  // requestAnimationFrame(loop)
  setInterval(loop, 10)
}


main()