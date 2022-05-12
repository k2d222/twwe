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
    // TODO? initMapScreen
    let mv = mat4.create()
    mat4.translate(mv, mv, [this.group.offX, this.group.offY, 0])
    gl.uniformMatrix4fv(shader.locs.unifs.uMVMatrix, false, mv)

    for(let layer of this.layers)
      layer.render()
  }
}

