import { mat4 } from 'gl-matrix'
import { Group } from '../twmap/group'
import { RenderLayer } from './renderLayer'
import { Layer } from '../twmap/layer'
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
    throw new Error("not a layer type we can render at the moment")
}
  
export class RenderGroup {
  group: Group
  layers: RenderLayer[]
  
  constructor(group: Group) {
    this.group = group
    this.layers = group.layers.map(l => createRenderLayer(l))
  }
  
  render() {
    // TODO: offset
    let mv = mat4.create()
    let { offX, offY, paraX, paraY } = this.group
    let { x1, x2, y1, y2 } = viewport.screen()
    let w = x2 - x1
    let h = y2 - y1
    
    let cx = (x1 + w / 2) * (1 - paraX / 100)
    let cy = (y1 + h / 2) * (1 - paraY / 100)
    
    // console.log(this.group.name, offX, offY, paraX, paraY)
    
    mat4.translate(mv, mv, [cx, cy, 0])
    // mat4.translate(mv, mv, [offX, offY, 0])
    gl.uniformMatrix4fv(shader.locs.unifs.uMVMatrix, false, mv)

    for(let layer of this.layers)
      layer.render()
  }
}

