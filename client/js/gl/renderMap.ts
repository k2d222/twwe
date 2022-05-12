import { Map } from '../twmap/map'
import { RenderGroup } from './renderGroup'
import { RenderTileLayer } from './renderTileLayer'
import { gl } from './global'
import { LayerType } from '../twmap/types'
import { Image } from '../twmap/image'
import { Texture } from './texture'
import { ChangeData } from '../server/protocol'

function createGameTexture() {
	let image = new Image()
	image.name = 'Game'
	image.loadExternal('entities/DDNet.png')
	return new Texture(image)
}

export class RenderMap {
  map: Map
  groups: RenderGroup[]
  gameLayer: RenderTileLayer
  
  constructor(map: Map) {
    this.map = map
    this.groups = map.groups.map(g => new RenderGroup(g))

    // COMBAK: this is hacky but I don't see other ways to handle the
    // game layer edge-case for now.
    let gameGroup = this.groups.find(g => g.group.name === 'Game')
    let gameLayerIndex = gameGroup.group.layers.findIndex(l => l.type === LayerType.GAME)
    let gameLayer = gameGroup.layers[gameLayerIndex] as RenderTileLayer
    this.gameLayer = new RenderTileLayer(gameLayer.layer)
    this.gameLayer.texture = createGameTexture()
  }
  
  applyChange(change: ChangeData) {
    let group  = this.groups[change.group]
    let layer  = group.layers[change.layer] as RenderTileLayer
    let tile   = layer.layer.getTile(change.x, change.y)
    tile.index = change.id
    layer.recompute()

    // we could test if change is on game layer, but the laziest is just to recompute
    this.gameLayer.recompute()
  }
  
  render() {
    for(let group of this.groups)
      group.render()
    
    // render the game layer on top of the rest.
    this.gameLayer.render()
    
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
