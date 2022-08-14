import type { Map, PhysicsLayer, Envelope } from '../twmap/map'
import type { EditTile, CreateQuad, EditQuad, DeleteQuad, CreateEnvelope, EditEnvelope, EditLayer, EditGroup, ReorderGroup, ReorderLayer, DeleteGroup, DeleteLayer, CreateGroup, CreateLayer } from '../server/protocol'
import type { RenderLayer } from './renderLayer'
import type { Quad } from '../twmap/quadsLayer'
import * as Info from '../twmap/types'
import { PositionEnvelope, ColorEnvelope, SoundEnvelope } from '../twmap/envelope'
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
import { envPointFromJson } from '../server/convert'

export type RenderPhysicsLayer = RenderGameLayer | RenderFrontLayer | RenderTeleLayer | RenderSpeedupLayer | RenderSwitchLayer | RenderTuneLayer

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
  
  private physicsLayer<T extends PhysicsLayer, U extends RenderAnyTilesLayer<T>>(ctor: Ctor<U>): U {
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
  
  addEnvelope(env: Envelope) {
    this.map.envelopes.push(env)
    return this.map.envelopes.length - 1
  }
  
  createEnvelope(change: CreateEnvelope) {
    const env =
      change.kind === 'color' ? new ColorEnvelope() : 
      change.kind === 'position' ? new PositionEnvelope() : 
      change.kind === 'sound' ? new SoundEnvelope() : null
    env.name = change.name
    this.addEnvelope(env)
  }
  
  editEnvelope(change: EditEnvelope) {
    const env = this.map.envelopes[change.index]
    if ('name' in change) env.name = change.name
    if ('synchronized' in change) env.synchronized = change.synchronized
    if ('points' in change) {
      if (change.points.type === 'color')
        env.points = change.points.content.map(envPointFromJson)
      else if (change.points.type === 'position')
        env.points = change.points.content.map(envPointFromJson)
      else if (change.points.type === 'sound')
        env.points = change.points.content.map(envPointFromJson)
    }
  }
  
  removeEnvelope(id: number) {
    this.map.envelopes.splice(id, 1)
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

  createQuad(change: CreateQuad) {
    const rgroup = this.groups[change.group]
    const rlayer = rgroup.layers[change.layer] as RenderQuadsLayer

    const quad: Quad = {
      points: change.points,
      colors: change.colors,
      texCoords: change.texCoords,
      posEnv: change.posEnv === null ? null : this.map.envelopes[change.posEnv] as PositionEnvelope,
      posEnvOffset: change.posEnvOffset,
      colorEnv: change.colorEnv === null ? null : this.map.envelopes[change.colorEnv] as ColorEnvelope,
      colorEnvOffset: change.colorEnvOffset,
    }
    
    rlayer.layer.quads.push(quad)
    rlayer.recompute()
  }
  
  editQuad(change: EditQuad) {
    const rgroup = this.groups[change.group]
    const rlayer = rgroup.layers[change.layer] as RenderQuadsLayer
    const quad = rlayer.layer.quads[change.quad]
    
    if ('points' in change) quad.points = change.points
    if ('colors' in change) quad.colors = change.colors
    if ('texCoords' in change) quad.texCoords = change.texCoords
    if ('posEnv' in change) quad.posEnv = change.posEnv === null ? null : this.map.envelopes[change.posEnv] as PositionEnvelope
    if ('posEnvOffset' in change) quad.posEnvOffset = change.posEnvOffset
    if ('colorEnv' in change) quad.colorEnv = change.colorEnv === null ? null : this.map.envelopes[change.colorEnv] as ColorEnvelope
    if ('colorEnvOffset' in change) quad.colorEnvOffset = change.colorEnvOffset

    rlayer.recompute()
  }
  
  deleteQuad(change: DeleteQuad) {
    const rgroup = this.groups[change.group]
    const rlayer = rgroup.layers[change.layer] as RenderQuadsLayer
    rlayer.layer.quads.splice(change.quad, 1)
    rlayer.recompute()
  }
  
  editGroup(change: EditGroup) {
    const rgroup = this.groups[change.group]
    
    if ('offX' in change) rgroup.group.offX = change.offX
    if ('offY' in change) rgroup.group.offY = change.offY
    if ('paraX' in change) rgroup.group.paraX = change.paraX
    if ('paraY' in change) rgroup.group.paraY = change.paraY
    if ('clipping' in change) rgroup.group.clipping = change.clipping
    if ('clipX' in change) rgroup.group.clipX = change.clipX
    if ('clipY' in change) rgroup.group.clipY = change.clipY
    if ('clipW' in change) rgroup.group.clipW = change.clipW
    if ('clipH' in change) rgroup.group.clipH = change.clipH
    if ('name' in change) rgroup.group.name = change.name
  }
  
  reorderGroup(change: ReorderGroup) {
    const [ group ] = this.map.groups.splice(change.group, 1)
    const [ rgroup ] = this.groups.splice(change.group, 1)
    this.map.groups.splice(change.newGroup, 0, group)
    this.groups.splice(change.newGroup, 0, rgroup)
  }
  
  deleteGroup(change: DeleteGroup) {
    this.map.groups.splice(change.group, 1)
    const [ rgroup ] = this.groups.splice(change.group, 1)
    return rgroup
  }
  
  editLayer(change: EditLayer) {
    const rgroup = this.groups[change.group]
    const rlayer = rgroup.layers[change.layer]

    if ('flags' in change) rlayer.layer.detail = (change.flags & Info.LayerFlags.DETAIL) === 1
    if ('name' in change) rlayer.layer.name = change.name

    if (rlayer instanceof RenderAnyTilesLayer) {
      if ('color' in change) rlayer.layer.color = change.color
      if ('width' in change) this.setLayerWidth(rgroup, rlayer, change.width)
      if ('height' in change) this.setLayerHeight(rgroup, rlayer, change.height)
      if ('colorEnv' in change) rlayer.layer.colorEnv = change.colorEnv === null ? null : this.map.envelopes[change.colorEnv]
      if ('colorEnvOffset' in change) rlayer.layer.colorEnvOffset = change.colorEnvOffset
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
    const [ rlayer ] = this.groups[change.group].layers.splice(change.layer, 1)
    return rlayer
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
    
    let rlayer: RenderTilesLayer | RenderPhysicsLayer | RenderQuadsLayer
    
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
      rlayer = new RenderTeleLayer(this, layer)
    }
    else if (create.kind === 'speedup') {
      const { width, height } = this.gameLayer.layer
      const layer = new SpeedupLayer()
      layer.init(width, height, layer.defaultTile)
      rlayer = new RenderSpeedupLayer(this, layer)
    }
    else if (create.kind === 'switch') {
      const { width, height } = this.gameLayer.layer
      const layer = new SwitchLayer()
      layer.init(width, height, layer.defaultTile)
      rlayer = new RenderSwitchLayer(this, layer)
    }
    else if (create.kind === 'tune') {
      const { width, height } = this.gameLayer.layer
      const layer = new TuneLayer()
      layer.init(width, height, layer.defaultTile)
      rlayer = new RenderTuneLayer(this, layer)
    }
    else {
      throw 'cannot create layer kind ' + create.kind
    }
  
    rlayer.layer.name = create.name
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
  
  private setLayerWidth(rgroup: RenderGroup, rlayer: RenderAnyTilesLayer<any>, width: number) {
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
      rlayer.layer.setWidth(width, rlayer.layer.defaultTile)
      rlayer.recompute()
    }
  }

  private setLayerHeight(rgroup: RenderGroup, rlayer: RenderAnyTilesLayer<any>, height: number) {
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
      rlayer.layer.setHeight(height, rlayer.layer.defaultTile)
      rlayer.recompute()
    }
  }
}
