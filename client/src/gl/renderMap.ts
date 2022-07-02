import type { Map } from '../twmap/map'
import type { EditTile, EditLayer, EditGroup, ReorderGroup, ReorderLayer, DeleteGroup, DeleteLayer, CreateGroup, CreateLayer } from '../server/protocol'
import type { RenderLayer } from './renderLayer'
import type { LayerTile } from '../twmap/types'
import { TileLayer } from '../twmap/tileLayer'
import { QuadLayer } from '../twmap/quadLayer'
import { Group } from '../twmap/group'
import { RenderGroup } from './renderGroup'
import { RenderTileLayer } from './renderTileLayer'
import { RenderQuadLayer } from './renderQuadLayer'
import { gl } from './global'
import { TileLayerFlags } from '../twmap/types'
import { Image } from '../twmap/image'
import { Texture } from './texture'

function createGameTexture() {
  const image = new Image()
  image.name = 'Game'
  image.loadExternal('/entities/DDNet.png')
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
    const [ g, l ] = this.map.gameLayerID()
    this.gameGroup = this.groups[g]
    const gameLayer = this.gameGroup.layers[l] as RenderTileLayer
    this.gameLayer = new RenderTileLayer(gameLayer.layer)
    this.gameLayer.texture = createGameTexture()
    this.gameGroup.layers[l] = this.gameLayer
  }
  
  editTile(change: EditTile) {
    const rgroup = this.groups[change.group]
    const rlayer = rgroup.layers[change.layer] as RenderTileLayer
    
    if (change.x < 0 || change.y < 0 || change.x >= rlayer.layer.width || change.y >= rlayer.layer.height)
      return false
    
    const tile = rlayer.layer.getTile(change.x, change.y)

    if (tile.index === change.id)
      return false

    tile.index = change.id

    if (rlayer.layer instanceof TileLayer && rlayer.layer.flags === TileLayerFlags.GAME)
      this.gameLayer.recompute(change.x, change.y)
    else
      rlayer.recompute(change.x, change.y)
    
    return true
  }
  
  editGroup(change: EditGroup) {
    const rgroup = this.groups[change.group]
    
    if (change.offX) rgroup.group.offX = change.offX
    if (change.offY) rgroup.group.offY = change.offY
    if (change.paraX) rgroup.group.paraX = change.paraX
    if (change.paraY) rgroup.group.paraY = change.paraY
    if (change.name) rgroup.group.name = change.name
  }
  
  reorderGroup(change: ReorderGroup) {
    const [ group ] = this.map.groups.splice(change.group, 1)
    const [ rgroup ] = this.groups.splice(change.group, 1)
    this.map.groups.splice(change.newGroup, 0, group)
    this.groups.splice(change.newGroup, 0, rgroup)
  }
  
  deleteGroup(change: DeleteGroup) {
    this.map.groups.splice(change.group, 1)
    this.groups.splice(change.group, 1)
  }
  
  editLayer(change: EditLayer) {
    const rgroup = this.groups[change.group]
    const rlayer = rgroup.layers[change.layer]
    const defaultTile: LayerTile = { index: 0, flags: 0 }

    if (change.name) rlayer.layer.name = change.name

    if (rlayer instanceof RenderTileLayer) {
      if ('color' in change) rlayer.layer.color = change.color
      if ('width' in change) {
        rlayer.layer.setWidth(change.width, defaultTile)
        // COMBAK: easiest is to rebuild the whole layer...
        const newLayer = new RenderTileLayer(rlayer.layer)
        rgroup.layers[change.layer] = newLayer
        if (rlayer === this.gameLayer) {
          newLayer.texture = this.gameLayer.texture
          newLayer.texture.loaded = false // again, a trick
          this.gameLayer = newLayer
        }
      }
      if ('height' in change) {
        rlayer.layer.setHeight(change.height, defaultTile)
        // COMBAK: easiest is to rebuild the whole layer...
        const newLayer = new RenderTileLayer(rlayer.layer)
        rgroup.layers[change.layer] = newLayer
        if (rlayer === this.gameLayer) {
          newLayer.texture = this.gameLayer.texture
          newLayer.texture.loaded = false // again, a trick
          this.gameLayer = newLayer
        }
      }
    }
  }
  
  reorderLayer(change: ReorderLayer) {
    const group = this.groups[change.group]
    const layer = group.layers[change.layer]

    group.layers.splice(change.layer, 1)
    this.groups[change.newGroup].layers.splice(change.newLayer, 0, layer)
  }
  
  deleteLayer(change: DeleteLayer) {
    this.map.groups[change.group].layers.splice(change.layer, 1)
    this.groups[change.group].layers.splice(change.layer, 1)
  }
  
  createGroup(_change: CreateGroup) {
    const group = new Group()
    const rgroup = new RenderGroup(group)
    this.map.groups.push(group)
    this.groups.push(rgroup)
    return rgroup
  }

  createLayer(create: CreateLayer) {
    const group = this.map.groups[create.group]
    const rgroup = this.groups[create.group]
    
    let layer: TileLayer | QuadLayer
    let rlayer: RenderLayer

    if (create.kind === 'tiles') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: LayerTile = { index: 0, flags: 0 }
      layer = TileLayer.create(width, height, defaultTile)
      rlayer = new RenderTileLayer(layer)
    } 
    else if (create.kind === 'quads') {
      layer = new QuadLayer()
      rlayer = new RenderQuadLayer(layer)
    } 

    group.layers.push(layer)
    rgroup.layers.push(rlayer)
    return rlayer
  }
  
  render() {
    for (const group of this.groups)
      group.render()
    
    // render the game layer on top of the rest.
    this.gameGroup.renderLayer(this.gameLayer)
    
    gl.bindTexture(gl.TEXTURE_2D, null)
  }
}
