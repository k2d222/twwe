import { Map } from '../twmap/map'
import { RenderGroup } from './renderGroup'
import { RenderTileLayer } from './renderTileLayer'
import { gl } from './global'
import { LayerType } from '../twmap/types'
import { Image } from '../twmap/image'
import { Texture } from './texture'
import { ChangeData } from '../server/protocol'

function createGameTexture() {
	const image = new Image()
	image.name = 'Game'
	image.loadExternal('entities/DDNet.png')
	return new Texture(image)
}

export class RenderMap {
  map: Map
  groups: RenderGroup[]
  gameLayer: RenderTileLayer
  gameGroup: RenderGroup
  
  constructor(map: Map) {
    this.map = map
    this.groups = map.groups.map(g => new RenderGroup(g))

    // COMBAK: this is hacky but I don't see other ways to handle the
    // game layer edge-case for now.
    this.gameGroup = this.groups.find(g => g.group.name === 'Game')
    const gameLayerIndex = this.gameGroup.group.layers.findIndex(l => l.type === LayerType.GAME)
    const gameLayer = this.gameGroup.layers[gameLayerIndex] as RenderTileLayer
    this.gameLayer = new RenderTileLayer(gameLayer.layer)
    this.gameLayer.texture = createGameTexture()
    this.gameGroup.layers[gameLayerIndex] = this.gameLayer
  }
  
  applyChange(change: ChangeData) {
    const group = this.groups[change.group]
    const layer = group.layers[change.layer] as RenderTileLayer
    
    
    const tile = layer.layer.getTile(change.x, change.y)

    if (tile.index == change.id)
      return false

    tile.index = change.id

    if (layer.layer.type === LayerType.GAME)
      this.gameLayer.recompute(change.x, change.y)
    else
      layer.recompute(change.x, change.y)
    
    return true
  }
  
  render() {
    for (const group of this.groups)
      group.render()
    
    // render the game layer on top of the rest.
    if (this.gameGroup.visible && this.gameLayer.visible)
      this.gameLayer.render()
    
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
