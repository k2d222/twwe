import type { Map } from '../twmap/map'
import type { EditTile, EditLayer, EditGroup, ReorderGroup, ReorderLayer, DeleteGroup, DeleteLayer, CreateGroup, CreateLayer } from '../server/protocol'
import type { RenderLayer } from './renderLayer'
import * as Info from '../twmap/types'
import { TilesLayer } from '../twmap/tilesLayer'
import { QuadsLayer } from '../twmap/quadsLayer'
import { Group } from '../twmap/group'
import { RenderGroup } from './renderGroup'
import { RenderTilesLayer } from './renderTilesLayer'
import { RenderQuadsLayer } from './renderQuadsLayer'
import { gl } from './global'
import { Image } from '../twmap/image'
import { Texture } from './texture'
import { isPhysicsLayer } from '../ui/lib/util'


export function isPhysicsRenderLayer(rlayer: RenderLayer): rlayer is RenderTilesLayer {
  return isPhysicsLayer(rlayer.layer)
}

function createEditorTexture(name: string, file: string) {
  const image = new Image()
  image.loadExternal(file)
  image.name = name
  return new Texture(image)
}

export class RenderMap {
  map: Map
  textures: Texture[] // analogous to Map images
  blankTexture: Texture // texture displayed when the layer has no image
  groups: RenderGroup[]
  physicsGroup: RenderGroup
  gameLayer: RenderTilesLayer
  teleLayer: RenderTilesLayer | null
  speedupLayer: RenderTilesLayer | null
  frontLayer: RenderTilesLayer | null
  switchLayer: RenderTilesLayer | null
  tuneLayer: RenderTilesLayer | null

  constructor(map: Map) {
    this.map = map
    this.textures = map.images.map(img => new Texture(img))
    this.blankTexture = createEditorTexture('', '/editor/blank.png')
    this.groups = map.groups.map(g => new RenderGroup(this, g))

    const [ g, l ] = this.map.gameLayerID()
    this.physicsGroup = this.groups[g]

    this.gameLayer = this.physicsGroup.layers[l] as RenderTilesLayer
    this.gameLayer.texture = createEditorTexture('Game', '/entities/DDNet.png')
    this.gameLayer.layer.image = this.gameLayer.texture.image
    
    this.teleLayer = this.findPhysicsLayer(Info.TilesLayerFlags.TELE) || null
    this.speedupLayer = this.findPhysicsLayer(Info.TilesLayerFlags.SPEEDUP) || null
    this.frontLayer = this.findPhysicsLayer(Info.TilesLayerFlags.FRONT) || null
    this.switchLayer = this.findPhysicsLayer(Info.TilesLayerFlags.SWITCH) || null
    this.tuneLayer = this.findPhysicsLayer(Info.TilesLayerFlags.TUNE) || null
    
    if (this.teleLayer) {
      this.teleLayer.texture = createEditorTexture('Tele', '/editor/tele.png')
      this.teleLayer.layer.image = this.teleLayer.texture.image
    }
    if (this.speedupLayer) {
      this.speedupLayer.texture = createEditorTexture('Speedup', '/editor/speedup.png')
      this.speedupLayer.layer.image = this.speedupLayer.texture.image
    }
    if (this.frontLayer) {
      this.frontLayer.texture = createEditorTexture('Front', '/editor/front.png')
      this.frontLayer.layer.image = this.frontLayer.texture.image
    }
    if (this.switchLayer) {
      this.switchLayer.texture = createEditorTexture('Switch', '/editor/switch.png')
      this.switchLayer.layer.image = this.switchLayer.texture.image
    }
    if (this.tuneLayer) {
      this.tuneLayer.texture = createEditorTexture('Tune', '/editor/tune.png')
      this.tuneLayer.layer.image = this.tuneLayer.texture.image
    }
  }
  
  findPhysicsLayer(flags: Info.TilesLayerFlags) {
    return this.physicsGroup.layers
      .find(l => l.layer instanceof TilesLayer && l.layer.flags === flags) as RenderTilesLayer
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
    const rlayer = rgroup.layers[change.layer] as RenderTilesLayer
    
    if (change.x < 0 || change.y < 0 || change.x >= rlayer.layer.width || change.y >= rlayer.layer.height)
      return false
    
    const tile = rlayer.layer.getTile(change.x, change.y)

    if (tile.index === change.id)
      return false

    tile.index = change.id

    if (rlayer.layer instanceof TilesLayer && rlayer.layer.flags === Info.TilesLayerFlags.GAME)
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

    if (rlayer instanceof RenderTilesLayer) {
      if ('color' in change) rlayer.layer.color = change.color
      if ('width' in change) this.setLayerWidth(rgroup, rlayer, change.width)
      if ('height' in change) this.setLayerHeight(rgroup, rlayer, change.height)
      if ('image' in change) {
        if (change.image === null) {
          rlayer.layer.image = null
          rlayer.texture = this.blankTexture
        }
        else {
          rlayer.layer.image = this.map.images[change.image]
          rlayer.texture = this.textures[change.image]
        }
        rlayer.recompute()
      }
    }
    else if (rlayer instanceof RenderQuadsLayer) {
      if ('image' in change) {
        if (change.image === null) {
          rlayer.layer.image = null
          rlayer.texture = this.blankTexture
        }
        else {
          rlayer.layer.image = this.map.images[change.image]
          rlayer.texture = this.textures[change.image]
        }
      }
    }
  }
  
  reorderLayer(change: ReorderLayer) {
    const rgroup = this.groups[change.group]
    const [ rlayer ] = rgroup.layers.splice(change.layer, 1)
    const [ layer ] = rgroup.group.layers.splice(change.layer, 1)
    this.groups[change.newGroup].layers.splice(change.newLayer, 0, rlayer)
    this.groups[change.newGroup].group.layers.splice(change.newLayer, 0, layer)
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
    
    let layer: TilesLayer | QuadsLayer
    let rlayer: RenderTilesLayer | RenderQuadsLayer

    if (create.kind === 'tiles') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: Info.Tile = { index: 0, flags: 0 }
      layer = TilesLayer.create(width, height, defaultTile)
      rlayer = new RenderTilesLayer(this, layer)
    } 
    else if (create.kind === 'quads') {
      layer = new QuadsLayer()
      rlayer = new RenderQuadsLayer(this, layer)
    }
    else if (create.kind === 'front') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: Info.Tile = { index: 0, flags: 0 }
      layer = TilesLayer.create(width, height, defaultTile)
      layer.flags = Info.TilesLayerFlags.FRONT
      layer.name = 'Front'
      rlayer = new RenderTilesLayer(this, layer)
      rlayer.texture = createEditorTexture('Front', 'front')
      layer.image = rlayer.texture.image
    }
    else if (create.kind === 'tele') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: Info.Tile = { index: 0, flags: 0 }
      layer = TilesLayer.create(width, height, defaultTile)
      layer.flags = Info.TilesLayerFlags.TELE
      layer.name = 'Tele'
      rlayer = new RenderTilesLayer(this, layer)
      rlayer.texture = createEditorTexture('Tele', 'tele')
      layer.image = rlayer.texture.image
    }
    else if (create.kind === 'speedup') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: Info.Tile = { index: 0, flags: 0 }
      layer = TilesLayer.create(width, height, defaultTile)
      layer.flags = Info.TilesLayerFlags.SPEEDUP
      layer.name = 'Speedup'
      rlayer = new RenderTilesLayer(this, layer)
      rlayer.texture = createEditorTexture('Speedup', 'speedup')
      layer.image = rlayer.texture.image
    }
    else if (create.kind === 'switch') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: Info.Tile = { index: 0, flags: 0 }
      layer = TilesLayer.create(width, height, defaultTile)
      layer.flags = Info.TilesLayerFlags.SWITCH
      layer.name = 'Switch'
      rlayer = new RenderTilesLayer(this, layer)
      rlayer.texture = createEditorTexture('Switch', 'switch')
      layer.image = rlayer.texture.image
    }
    else if (create.kind === 'tune') {
      const { width, height } = this.gameLayer.layer
      const defaultTile: Info.Tile = { index: 0, flags: 0 }
      layer = TilesLayer.create(width, height, defaultTile)
      layer.flags = Info.TilesLayerFlags.TUNE
      layer.name = 'Tune'
      rlayer = new RenderTilesLayer(this, layer)
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
          return l.layer.type === Info.LayerType.QUADS
          || l instanceof RenderTilesLayer && l.layer.flags === Info.TilesLayerFlags.TILES
        }))
      }
      else {
        group.render()
      }
    }
    
    // render the physics layers on top of the rest.
    this.physicsGroup.renderLayers(this.physicsGroup.layers.filter(l => {
      return l instanceof RenderTilesLayer && l.layer.flags !== Info.TilesLayerFlags.TILES
    }))
    
    gl.bindTexture(gl.TEXTURE_2D, null)
  }
  
  private setLayerWidth(rgroup: RenderGroup, rlayer: RenderTilesLayer, width: number) {
    const defaultTile: Info.Tile = { index: 0, flags: 0 }

    // changing the size of any physics layer applies to all physics layers
    if (isPhysicsLayer(rlayer.layer)) {
      for (let rlayer of rgroup.layers) {
        if (isPhysicsRenderLayer(rlayer)) {
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

  private setLayerHeight(rgroup: RenderGroup, rlayer: RenderTilesLayer, height: number) {
    const defaultTile: Info.Tile = { index: 0, flags: 0 }

    // changing the size of any physics layer applies to all physics layers
    if (isPhysicsLayer(rlayer.layer)) {
      for (let rlayer of rgroup.layers) {
        if (isPhysicsRenderLayer(rlayer)) {
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
