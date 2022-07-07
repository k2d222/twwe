import type { Map } from '../twmap/map'
import type { EditTile, EditLayer, EditGroup, ReorderGroup, ReorderLayer, DeleteGroup, DeleteLayer, CreateGroup, CreateLayer } from '../server/protocol'
import type { LayerTile } from '../twmap/types'
import { TileLayer } from '../twmap/tileLayer'
import { QuadLayer } from '../twmap/quadLayer'
import { Group } from '../twmap/group'
import { RenderGroup } from './renderGroup'
import { RenderTileLayer } from './renderTileLayer'
import { RenderQuadLayer } from './renderQuadLayer'
import { gl } from './global'
import { TileLayerFlags, LayerType } from '../twmap/types'
import { Image } from '../twmap/image'
import { Texture } from './texture'

function createEditorTexture(name: string, fname: string) {
  const image = new Image()
  image.loadExternal(`/editor/${fname}.png`)
  image.name = name
  return new Texture(image)
}

const PhysicsLayers = [
  TileLayerFlags.GAME,
  TileLayerFlags.FRONT,
  TileLayerFlags.TELE,
  TileLayerFlags.SPEEDUP,
  TileLayerFlags.SWITCH,
  TileLayerFlags.TUNE,
]

export class RenderMap {
  map: Map
  textures: Texture[] // analogous to Map images
  groups: RenderGroup[]
  physicsGroup: RenderGroup
  gameLayer: RenderTileLayer
  teleLayer: RenderTileLayer | null
  speedupLayer: RenderTileLayer | null
  frontLayer: RenderTileLayer | null
  switchLayer: RenderTileLayer | null
  tuneLayer: RenderTileLayer | null

  constructor(map: Map) {
    this.map = map
    this.textures = map.images.map(img => new Texture(img))
    this.groups = map.groups.map(g => new RenderGroup(this, g))

    const [ g, l ] = this.map.gameLayerID()
    this.physicsGroup = this.groups[g]

    this.gameLayer = this.physicsGroup.layers[l] as RenderTileLayer
    this.gameLayer.texture = createEditorTexture('Game', 'front')
    this.gameLayer.layer.image = this.gameLayer.texture.image
    
    this.teleLayer = this.findPhysicsLayer(TileLayerFlags.TELE) || null
    this.speedupLayer = this.findPhysicsLayer(TileLayerFlags.SPEEDUP) || null
    this.frontLayer = this.findPhysicsLayer(TileLayerFlags.FRONT) || null
    this.switchLayer = this.findPhysicsLayer(TileLayerFlags.SWITCH) || null
    this.tuneLayer = this.findPhysicsLayer(TileLayerFlags.TUNE) || null
    
    if (this.teleLayer) {
      this.teleLayer.texture = createEditorTexture('Tele', 'tele')
      this.teleLayer.layer.image = this.teleLayer.texture.image
    }
    if (this.speedupLayer) {
      this.speedupLayer.texture = createEditorTexture('Speedup', 'speedup')
      this.speedupLayer.layer.image = this.speedupLayer.texture.image
    }
    if (this.frontLayer) {
      this.frontLayer.texture = this.gameLayer.texture
      this.frontLayer.layer.image = this.frontLayer.texture.image
    }
    if (this.switchLayer) {
      this.switchLayer.texture = createEditorTexture('Switch', 'switch')
      this.switchLayer.layer.image = this.switchLayer.texture.image
    }
    if (this.tuneLayer) {
      this.tuneLayer.texture = createEditorTexture('Tune', 'tune')
      this.tuneLayer.layer.image = this.tuneLayer.texture.image
    }
  }
  
  findPhysicsLayer(flags: TileLayerFlags) {
    return this.physicsGroup.layers
      .find(l => l.layer instanceof TileLayer && l.layer.flags === flags) as RenderTileLayer
  }
  
  addImage(image: Image) {
    this.map.images.push(image)
    this.textures.push(new Texture(image))
    return this.textures.length - 1
  }
  
  removeImage(index: number) {
    this.map.images.splice(index, 1)
    this.textures.splice(index, 1)
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
      this.gameLayer.recomputeChunk(change.x, change.y)
    else
      rlayer.recomputeChunk(change.x, change.y)
    
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

    if (change.name) rlayer.layer.name = change.name

    if (rlayer instanceof RenderTileLayer) {
      if ('color' in change) rlayer.layer.color = change.color
      if ('width' in change) this.setLayerWidth(rgroup, rlayer, change.width)
      if ('height' in change) this.setLayerHeight(rgroup, rlayer, change.height)
      if ('image' in change) {
        rlayer.layer.image = this.map.images[change.image]
        rlayer.texture = this.textures[change.image]
        rlayer.recompute()
      }
    }
    else if (rlayer instanceof RenderQuadLayer) {
      if ('image' in change) {
        rlayer.layer.image = this.map.images[change.image]
        rlayer.texture = this.textures[change.image]
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
    const rgroup = new RenderGroup(this, group)
    this.map.groups.push(group)
    this.groups.push(rgroup)
    return rgroup
  }

  createLayer(create: CreateLayer) {
    const group = this.map.groups[create.group]
    const rgroup = this.groups[create.group]
    
    let layer: TileLayer | QuadLayer
    let rlayer: RenderTileLayer | RenderQuadLayer

    if (create.kind === 'tiles') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: LayerTile = { index: 0, flags: 0 }
      layer = TileLayer.create(width, height, defaultTile)
      rlayer = new RenderTileLayer(this, layer)
    } 
    else if (create.kind === 'quads') {
      layer = new QuadLayer()
      rlayer = new RenderQuadLayer(this, layer)
    }
    else if (create.kind === 'front') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: LayerTile = { index: 0, flags: 0 }
      layer = TileLayer.create(width, height, defaultTile)
      layer.flags = TileLayerFlags.FRONT
      layer.name = 'Front'
      rlayer = new RenderTileLayer(this, layer)
      rlayer.texture = createEditorTexture('Front', 'front')
      layer.image = rlayer.texture.image
    }
    else if (create.kind === 'tele') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: LayerTile = { index: 0, flags: 0 }
      layer = TileLayer.create(width, height, defaultTile)
      layer.flags = TileLayerFlags.TELE
      layer.name = 'Tele'
      rlayer = new RenderTileLayer(this, layer)
      rlayer.texture = createEditorTexture('Tele', 'tele')
      layer.image = rlayer.texture.image
    }
    else if (create.kind === 'speedup') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: LayerTile = { index: 0, flags: 0 }
      layer = TileLayer.create(width, height, defaultTile)
      layer.flags = TileLayerFlags.SPEEDUP
      layer.name = 'Speedup'
      rlayer = new RenderTileLayer(this, layer)
      rlayer.texture = createEditorTexture('Speedup', 'speedup')
      layer.image = rlayer.texture.image
    }
    else if (create.kind === 'switch') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: LayerTile = { index: 0, flags: 0 }
      layer = TileLayer.create(width, height, defaultTile)
      layer.flags = TileLayerFlags.SWITCH
      layer.name = 'Switch'
      rlayer = new RenderTileLayer(this, layer)
      rlayer.texture = createEditorTexture('Switch', 'switch')
      layer.image = rlayer.texture.image
    }
    else if (create.kind === 'tune') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: LayerTile = { index: 0, flags: 0 }
      layer = TileLayer.create(width, height, defaultTile)
      layer.flags = TileLayerFlags.TUNE
      layer.name = 'Tune'
      rlayer = new RenderTileLayer(this, layer)
      rlayer.texture = createEditorTexture('Tune', 'tune')
      layer.image = rlayer.texture.image
    }
    else {
      throw 'cannot create layer kind ' + create.kind
    }

    group.layers.push(layer)
    rgroup.layers.push(rlayer)
    return rlayer
  }
  
  render() {
    for (const group of this.groups) {
      if (group === this.physicsGroup) {
        group.renderLayers(group.layers.filter(l => {
          return l.layer.type === LayerType.QUADS
          || l instanceof RenderTileLayer && l.layer.flags === TileLayerFlags.TILES
        }))
      }
      else {
        group.render()
      }
    }
    
    // render the physics layers on top of the rest.
    this.physicsGroup.renderLayers(this.physicsGroup.layers.filter(l => {
      return l instanceof RenderTileLayer && l.layer.flags !== TileLayerFlags.TILES
    }))
    
    gl.bindTexture(gl.TEXTURE_2D, null)
  }
  
  private setLayerWidth(rgroup: RenderGroup, rlayer: RenderTileLayer, width: number) {
    const defaultTile: LayerTile = { index: 0, flags: 0 }

    // changing the size of any physics layer applies to all physics layers
    if (rlayer.layer.flags in PhysicsLayers) {
      for (let rlayer of rgroup.layers) {
        if (rlayer instanceof RenderTileLayer && rlayer.layer.flags in PhysicsLayers) {
          rlayer.layer.setWidth(width, defaultTile)
          rlayer.recompute()
        }
      }
    }
    else {
      this.setLayerWidth(rgroup, rlayer, width)
      rlayer.recompute()
    }
  }

  private setLayerHeight(rgroup: RenderGroup, rlayer: RenderTileLayer, height: number) {
    const defaultTile: LayerTile = { index: 0, flags: 0 }

    // changing the size of any physics layer applies to all physics layers
    if (rlayer.layer.flags in PhysicsLayers) {
      for (let rlayer of rgroup.layers) {
        if (rlayer instanceof RenderTileLayer && rlayer.layer.flags in PhysicsLayers) {
          rlayer.layer.setHeight(height, defaultTile)
          rlayer.recompute()
        }
      }
    }
    else {
      this.setLayerHeight(rgroup, rlayer, height)
      rlayer.recompute()
    }
  }
}
