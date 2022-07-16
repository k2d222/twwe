import type { Map, PhysicsLayer } from '../twmap/map'
import type { EditTile, EditLayer, EditGroup, ReorderGroup, ReorderLayer, DeleteGroup, DeleteLayer, CreateGroup, CreateLayer } from '../server/protocol'
import type { RenderLayer } from './renderLayer'
import * as Info from '../twmap/types'
import { TilesLayer, GameLayer, FrontLayer, SwitchLayer, SpeedupLayer, TeleLayer, TuneLayer } from '../twmap/tilesLayer'
import { RenderAnyTilesLayer, RenderGameLayer, RenderTilesLayer, RenderFrontLayer, RenderSwitchLayer, RenderSpeedupLayer, RenderTeleLayer, RenderTuneLayer } from './renderTilesLayer'
import { QuadsLayer } from '../twmap/quadsLayer'
import { Group } from '../twmap/group'
import { RenderGroup } from './renderGroup'
import { RenderQuadsLayer } from './renderQuadsLayer'
import { gl } from './global'
import { Image } from '../twmap/image'
import { Texture } from './texture'
import { isPhysicsLayer, Ctor } from '../ui/lib/util'


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
  gameLayer: RenderGameLayer
  teleLayer: RenderTeleLayer | null
  speedupLayer: RenderSpeedupLayer | null
  frontLayer: RenderFrontLayer | null
  switchLayer: RenderSwitchLayer | null
  tuneLayer: RenderTuneLayer | null

  constructor(map: Map) {
    this.map = map
    this.textures = map.images.map(img => new Texture(img))
    this.blankTexture = createEditorTexture('', '/editor/blank.png')
    this.groups = map.groups.map(g => new RenderGroup(this, g))

    const [ g, l ] = this.map.physicsLayerIndex(GameLayer)
    this.physicsGroup = this.groups[g]

    this.gameLayer = this.physicsGroup.layers[l] as RenderTilesLayer
    
    this.teleLayer = this.physicsLayer(RenderTeleLayer) || null
    this.speedupLayer = this.physicsLayer(RenderSpeedupLayer) || null
    this.frontLayer = this.physicsLayer(RenderFrontLayer) || null
    this.switchLayer = this.physicsLayer(RenderSwitchLayer) || null
    this.tuneLayer = this.physicsLayer(RenderTuneLayer) || null
  }
  
  physicsLayer<T extends PhysicsLayer, U extends RenderAnyTilesLayer<T>>(ctor: Ctor<U>): U {
    return this.physicsGroup.layers.find(l => l.layer instanceof ctor) as U
  }
  
  addImage(image: Image) {
    this.map.images.push(image)
    this.textures.push(new Texture(image))
    return this.textures.length - 1
  }
  
  removeImage(id: number) {
    this.map.images.splice(id, 1)
    this.textures.splice(id, 1)
  }
  
  editTile(change: EditTile) {
    const rgroup = this.groups[change.group]
    const rlayer = rgroup.layers[change.layer] as RenderAnyTilesLayer<PhysicsLayer | TilesLayer>
    const layer = rlayer.layer

    if (change.x < 0 || change.y < 0 || change.x >= layer.width || change.y >= layer.height)
      return false

    const tile = layer.getTile(change.x, change.y)
    
    let changed = false

    for (let key in tile) {
      if (key in change && change[key] !== tile[key]) {
        tile[key] = change[key]
        changed = true
      }
    }

    if (changed) {
      if (rlayer === this.gameLayer)
        this.gameLayer.recomputeChunk(change.x, change.y)
      else
        rlayer.recomputeChunk(change.x, change.y)
    }

    return changed
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
    
    let rlayer: RenderTilesLayer | RenderGameLayer | RenderFrontLayer | RenderQuadsLayer

    if (create.kind === 'tiles') {
      const { width, height } = this.gameLayer.layer
      const layer = new TilesLayer()
      const fill = () => { return { id: 0, flags: 0 } }
      layer.init(width, height, fill)
      rlayer = new RenderTilesLayer(this, layer)
    } 
    else if (create.kind === 'quads') {
      const layer = new QuadsLayer()
      rlayer = new RenderQuadsLayer(this, layer)
    }
    else if (create.kind === 'front') {
      const { width, height } = this.gameLayer.layer
      const layer = new FrontLayer()
      const fill = () => { return { id: 0, flags: 0 } }
      layer.init(width, height, fill)
      rlayer = new RenderFrontLayer(this, layer)
    }
    else if (create.kind === 'tele') {
      const { width, height } = this.gameLayer.layer
      const layer = new TeleLayer()
      layer.init(width, height, layer.defaultTile)
      // rlayer = new RenderTilesLayer(this, layer)
      // rlayer.texture = createEditorTexture('Tele', 'tele')
    }
    else if (create.kind === 'speedup') {
      const { width, height } = this.gameLayer.layer
      const layer = new SpeedupLayer()
      layer.init(width, height, layer.defaultTile)
      // rlayer = new RenderTilesLayer(this, layer)
      // rlayer.texture = createEditorTexture('Speedup', 'speedup')
    }
    else if (create.kind === 'switch') {
      const { width, height } = this.gameLayer.layer
      const layer = new SwitchLayer()
      layer.init(width, height, layer.defaultTile)
      // rlayer = new RenderTilesLayer(this, layer)
      // rlayer.texture = createEditorTexture('Switch', 'switch')
    }
    else if (create.kind === 'tune') {
      const { width, height } = this.gameLayer.layer
      const layer = new TuneLayer()
      layer.init(width, height, layer.defaultTile)
      // rlayer = new RenderTilesLayer(this, layer)
      // rlayer.texture = createEditorTexture('Tune', 'tune')
    }
    else {
      throw 'cannot create layer kind ' + create.kind
    }

    group.layers.push(rlayer.layer)
    rgroup.layers.push(rlayer)
    return rlayer
  }
  
  render() {
    for (const group of this.groups) {
      if (group === this.physicsGroup) {
        // render only the non-physics layers
        group.renderLayers(group.layers.filter(l => {
          return !isPhysicsLayer(l.layer)
        }))
      }
      else {
        group.render()
      }
    }
    
    // render the physics layers on top of the rest.
    this.physicsGroup.renderLayers(this.physicsGroup.layers.filter(l => {
      return isPhysicsLayer(l.layer)
    }))
    
    gl.bindTexture(gl.TEXTURE_2D, null)
  }
  
  private setLayerWidth(rgroup: RenderGroup, rlayer: RenderTilesLayer, width: number) {
    // changing the size of any physics layer applies to all physics layers
    if (isPhysicsLayer(rlayer.layer)) {
      for (let rlayer of rgroup.layers) {
        if (isPhysicsRenderLayer(rlayer)) {
          rlayer.layer.setWidth(width, rlayer.layer.defaultTile)
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
    // changing the size of any physics layer applies to all physics layers
    if (isPhysicsLayer(rlayer.layer)) {
      for (let rlayer of rgroup.layers) {
        if (isPhysicsRenderLayer(rlayer)) {
          rlayer.layer.setHeight(height, rlayer.layer.defaultTile)
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
