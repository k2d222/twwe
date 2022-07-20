import type { Group } from '../twmap/group'
import type { RenderLayer } from './renderLayer'
import type { Layer } from '../twmap/layer'
import type { RenderMap } from './renderMap'
import { mat4 } from 'gl-matrix'
import { TilesLayer, GameLayer, FrontLayer, TuneLayer, TeleLayer, SpeedupLayer, SwitchLayer } from '../twmap/tilesLayer'
import { QuadsLayer } from '../twmap/quadsLayer'
import { RenderTilesLayer, RenderGameLayer, RenderFrontLayer, RenderTuneLayer, RenderTeleLayer, RenderSpeedupLayer, RenderSwitchLayer } from '../gl/renderTilesLayer'
import { RenderQuadsLayer } from '../gl/renderQuadsLayer'
import { gl, shader, viewport } from './global'

function createRenderLayer(rmap: RenderMap, layer: Layer) {
  if (layer instanceof QuadsLayer)
    return new RenderQuadsLayer(rmap, layer)
  else if (layer instanceof GameLayer)
    return new RenderGameLayer(rmap, layer)
  else if (layer instanceof FrontLayer)
    return new RenderFrontLayer(rmap, layer)
  else if (layer instanceof TilesLayer)
    return new RenderTilesLayer(rmap, layer)
  else if (layer instanceof TeleLayer)
    return new RenderTeleLayer(rmap, layer)
  else if (layer instanceof SpeedupLayer)
    return new RenderSpeedupLayer(rmap, layer)
  else if (layer instanceof SwitchLayer)
    return new RenderSwitchLayer(rmap, layer)
  else if (layer instanceof TuneLayer)
    return new RenderTuneLayer(rmap, layer)
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
  
  offset(): [number, number] {
    const { offX, offY, paraX, paraY } = this.group
    const { x1, x2, y1, y2 } = viewport.screen()
    const w = x2 - x1
    const h = y2 - y1
    
    // parallax
    let cx = (x1 + w / 2) * (1 - paraX / 100)
    let cy = (y1 + h / 2) * (1 - paraY / 100)
    
    // offset
    cx -= offX / 32
    cy -= offY / 32
    
    return [ cx, cy ]
  }
  
  private preRender() {
    const { x1, x2, y1, y2 } = viewport.screen()
    const [ cx, cy ] = this.offset()

    const mv = mat4.create()
    mat4.translate(mv, mv, [cx, cy, 0])
    gl.uniformMatrix4fv(shader.locs.unifs.uMVMatrix, false, mv)
    
    if (this.group.clipping) {
      let { clipX, clipY, clipW, clipH } = this.group
      clipX /= 32
      clipY /= 32
      clipW /= 32
      clipH /= 32
      gl.enable(gl.SCISSOR_TEST)
      const [ cx1, cy1 ] = viewport.worldToCanvas(clipX, clipY)
      const [ cx2, cy2 ] = viewport.worldToCanvas(clipX + clipW, clipY + clipH)
      gl.scissor(cx1, viewport.canvas.height - cy2, cx2 - cx1, cy2 - cy1)
      // console.log(cx1, cy2, cx2 - cx1, cy2 - cy1)
    }

    return {
      x1: x1 - cx,
      x2: x2 - cx,
      y1: y1 - cy,
      y2: y2 - cy,
    }
  }
  
  renderLayers(layers: RenderLayer[]) {
    if (!this.visible)
      return
    
    const viewBox = this.preRender()

    for(const layer of layers)
      layer.render(viewBox)
    
    gl.disable(gl.SCISSOR_TEST)
  }

  render() {
    this.renderLayers(this.layers)
  }
  
  
  renderLayer(layer: RenderLayer) {
    if (!this.visible)
      return
    
    const viewBox = this.preRender()
    
    layer.render(viewBox)
  }
}

