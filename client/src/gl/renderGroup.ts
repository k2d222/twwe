import type { Group } from '../twmap/group'
import type { RenderLayer } from './renderLayer'
import type { Layer } from '../twmap/layer'
import type { RenderMap } from './renderMap'
import { mat4 } from 'gl-matrix'
import { TilesLayer } from '../twmap/tilesLayer'
import { QuadsLayer } from '../twmap/quadsLayer'
import { RenderTilesLayer } from '../gl/renderTilesLayer'
import { RenderQuadsLayer } from '../gl/renderQuadsLayer'
import { gl, shader, viewport } from './global'

function createRenderLayer(rmap: RenderMap, layer: Layer) {
  if (layer instanceof TilesLayer)
    return new RenderTilesLayer(rmap, layer)
  else if (layer instanceof QuadsLayer)
    return new RenderQuadsLayer(rmap, layer)
  else
    throw new Error('not a layer type we can render at the moment')
}
  
export class RenderGroup {
  group: Group
  layers: RenderLayer[]
  visible: boolean
  
  constructor(rmap: RenderMap, group: Group) {
    this.group = group
    this.layers = group.layers.map(l => createRenderLayer(rmap, l))
    this.visible = true
  }
  
  private preRender() {
    // TODO: offset
    const { offX, offY, paraX, paraY } = this.group
    const { x1, x2, y1, y2 } = viewport.screen()
    const w = x2 - x1
    const h = y2 - y1
    
    const cx = (x1 + w / 2) * (1 - paraX / 100)
    const cy = (y1 + h / 2) * (1 - paraY / 100)
    
    // console.log(this.group.name, offX, offY, paraX, paraY)
    
    const mv = mat4.create()
    mat4.translate(mv, mv, [cx, cy, 0])
    // mat4.translate(mv, mv, [offX, offY, 0])
    gl.uniformMatrix4fv(shader.locs.unifs.uMVMatrix, false, mv)
  }
  
  renderLayers(layers: RenderLayer[]) {
    if (!this.visible)
      return
    
    this.preRender()

    for(const layer of layers)
      layer.render()
  }

  render() {
    this.renderLayers(this.layers)
  }
  
  
  renderLayer(layer: RenderLayer) {
    if (!this.visible)
      return
    
    this.preRender()
    
    layer.render()
  }
}

