import type { Group } from '../twmap/group'
import type { RenderLayer } from './renderLayer'
import type { Layer } from '../twmap/layer'
import { mat4 } from 'gl-matrix'
import { TileLayer } from '../twmap/tileLayer'
import { QuadLayer } from '../twmap/quadLayer'
import { RenderTileLayer } from '../gl/renderTileLayer'
import { RenderQuadLayer } from '../gl/renderQuadLayer'
import { gl, shader, viewport } from './global'

function createRenderLayer(layer: Layer) {
  if (layer instanceof TileLayer)
    return new RenderTileLayer(layer)
  else if (layer instanceof QuadLayer)
    return new RenderQuadLayer(layer)
  else
    throw new Error('not a layer type we can render at the moment')
}
  
export class RenderGroup {
  group: Group
  layers: RenderLayer[]
  visible: boolean
  
  constructor(group: Group) {
    this.group = group
    this.layers = group.layers.map(l => createRenderLayer(l))
    this.visible = true
  }
  
  render() {
    if (!this.visible)
      return    
    
    // TODO: offset
    const mv = mat4.create()
    const { offX, offY, paraX, paraY } = this.group
    const { x1, x2, y1, y2 } = viewport.screen()
    const w = x2 - x1
    const h = y2 - y1
    
    const cx = (x1 + w / 2) * (1 - paraX / 100)
    const cy = (y1 + h / 2) * (1 - paraY / 100)
    
    // console.log(this.group.name, offX, offY, paraX, paraY)
    
    mat4.translate(mv, mv, [cx, cy, 0])
    // mat4.translate(mv, mv, [offX, offY, 0])
    gl.uniformMatrix4fv(shader.locs.unifs.uMVMatrix, false, mv)

    for(const layer of this.layers)
      layer.render()
  }
}

