import type { Map, PhysicsLayer, Envelope } from '../twmap/map'
import type {
  EditTile,
  CreateQuad,
  EditQuad,
  DeleteQuad,
  CreateEnvelope,
  EditEnvelope,
  EditLayer,
  EditGroup,
  ReorderGroup,
  ReorderLayer,
  DeleteGroup,
  DeleteLayer,
  CreateGroup,
  CreateLayer,
} from '../server/protocol'
import type { RenderLayer } from './renderLayer'
import type { Quad } from '../twmap/quadsLayer'
import * as Info from '../twmap/types'
import { PositionEnvelope, ColorEnvelope, SoundEnvelope } from '../twmap/envelope'
import {
  TilesLayer,
  GameLayer,
  FrontLayer,
  SwitchLayer,
  SpeedupLayer,
  TeleLayer,
  TuneLayer,
  AnyTilesLayer,
} from '../twmap/tilesLayer'
import {
  RenderAnyTilesLayer,
  RenderGameLayer,
  RenderTilesLayer,
  RenderFrontLayer,
  RenderSwitchLayer,
  RenderSpeedupLayer,
  RenderTeleLayer,
  RenderTuneLayer,
} from './renderTilesLayer'
import { QuadsLayer } from '../twmap/quadsLayer'
import { Group } from '../twmap/group'
import { RenderGroup } from './renderGroup'
import { RenderQuadsLayer } from './renderQuadsLayer'
import { gl } from './global'
import { Image } from '../twmap/image'
import { Texture } from './texture'
import { isPhysicsLayer, type Ctor } from '../ui/lib/util'
import { Config as AutomapperConfig, automap } from '../twmap/automap'
import { colorFromJson, coordFromJson, curveTypeFromString, fromFixedNum, uvFromJson } from '../server/convert'
import type { Brush } from 'src/ui/lib/editor'

export type Range = {
  start: Info.Coord
  end: Info.Coord
}

export type RenderPhysicsLayer =
  | RenderGameLayer
  | RenderFrontLayer
  | RenderTeleLayer
  | RenderSpeedupLayer
  | RenderSwitchLayer
  | RenderTuneLayer

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
  activeLayer: RenderLayer | null

  brushGroup: RenderGroup
  brushPos: Info.Coord
  brushEnv: ColorEnvelope

  constructor(map: Map) {
    if (!gl)
      throw "no GL context was initialized"

    this.map = map
    this.textures = map.images.map(img => new Texture(img))
    this.blankTexture = createEditorTexture('', '/editor/blank.png')
    this.groups = map.groups.map(g => new RenderGroup(this, g))

    const [g, l] = this.map.physicsLayerIndex(GameLayer)
    this.physicsGroup = this.groups[g]

    this.brushGroup = new RenderGroup(this, new Group())
    this.brushPos = { x: 0, y: 0 }
    this.brushEnv = this.createBrushEnvelope()

    this.gameLayer = this.physicsGroup.layers[l] as RenderTilesLayer

    this.teleLayer = this.physicsLayer(RenderTeleLayer) || null
    this.speedupLayer = this.physicsLayer(RenderSpeedupLayer) || null
    this.frontLayer = this.physicsLayer(RenderFrontLayer) || null
    this.switchLayer = this.physicsLayer(RenderSwitchLayer) || null
    this.tuneLayer = this.physicsLayer(RenderTuneLayer) || null
    this.activeLayer = null
  }

  setActiveLayer(layer: RenderLayer | null) {
    if (this.activeLayer) this.activeLayer.active = false
    this.activeLayer = layer
    if (this.activeLayer) this.activeLayer.active = true
  }

  private physicsLayer<T extends PhysicsLayer, U extends RenderAnyTilesLayer<T>>(ctor: Ctor<U>): U {
    return this.physicsGroup.layers.find(l => l.layer instanceof ctor) as U
  }

  private createBrushEnvelope(): ColorEnvelope {
    const env = new ColorEnvelope()
    env.points = [
      {
        time: 0,
        content: { r: 1024, g: 1024, b: 1024, a: 1024 },
        type: Info.CurveType.BEZIER,
      },
      {
        time: 500,
        content: { r: 1024, g: 1024, b: 1024, a: 512 },
        type: Info.CurveType.BEZIER,
      },
      {
        time: 1000,
        content: { r: 1024, g: 1024, b: 1024, a: 1024 },
        type: Info.CurveType.BEZIER,
      },
    ]
    return env
  }

  setBrush(brush: Brush | null) {
    this.clearBrush()

    if (brush === null) {
      return
    }

    const rgroup = this.groups[brush.group]

    this.brushGroup.group.offX = rgroup.group.offX - this.brushPos.x * 32
    this.brushGroup.group.offY = rgroup.group.offY - this.brushPos.y * 32
    this.brushGroup.group.paraX = rgroup.group.paraX
    this.brushGroup.group.paraY = rgroup.group.paraY

    for (const blayer of brush.layers) {
      const rlayer = rgroup.layers[blayer.layer]
      const layer = rlayer.layer as AnyTilesLayer<any>
      const w = blayer.tiles[0].length
      const h = blayer.tiles.length
      
      const fill = (i: number) => {
        const x = i % w
        const y = Math.floor(i / w)
        return blayer.tiles[y][x] || layer.defaultTile()
      }

      // clone the type of the brush layer
      const brushLayer = new TilesLayer()
      let brushRlayer: RenderLayer
      brushLayer.init(w, h, fill)

      // COMBAK: these properties wont be reactive if source layer is changed.
      if (layer instanceof TilesLayer) {
        brushLayer.color = layer.color
      }
      brushLayer.colorEnv = this.brushEnv
      brushRlayer = new RenderTilesLayer(this, brushLayer)
      brushRlayer.texture = rlayer.texture
      brushRlayer.recompute()

      this.brushGroup.layers.push(brushRlayer)
    }
  }

  moveBrush(pos: Info.Coord) {
    const group = this.brushGroup.group
    group.offX = group.offX + this.brushPos.x * 32 - pos.x * 32
    group.offY = group.offY + this.brushPos.y * 32 - pos.y * 32
    this.brushPos.x = pos.x
    this.brushPos.y = pos.y
  }

  clearBrush() {
    this.brushGroup.layers = []
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
      change.kind === 'color'
        ? new ColorEnvelope()
        : change.kind === 'position'
        ? new PositionEnvelope()
        : change.kind === 'sound'
        ? new SoundEnvelope()
        : null
    env.name = change.name
    this.addEnvelope(env)
  }

  editEnvelope(change: EditEnvelope) {
    const env = this.map.envelopes[change.index]
    if ('name' in change) env.name = change.name
    if ('synchronized' in change) env.synchronized = change.synchronized
    if ('points' in change) {
      if (change.points.type === 'color')
        env.points = change.points.content.map(p => ({
          time: p.time,
          content: colorFromJson(p.content, 10),
          type: curveTypeFromString(p.type),
        }))
      else if (change.points.type === 'position')
        env.points = change.points.content.map(p => ({
          time: p.time,
          content: {
            x: fromFixedNum(p.content.x, 15),
            y: fromFixedNum(p.content.y, 15),
            rotation: fromFixedNum(p.content.rotation, 10),
          },
          type: curveTypeFromString(p.type),
        }))
      else if (change.points.type === 'sound')
        env.points = change.points.content.map(p => ({
          time: p.time,
          content: fromFixedNum(p.content, 10),
          type: curveTypeFromString(p.type),
        }))
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
      if (rlayer === this.gameLayer) this.gameLayer.recomputeChunk(change.x, change.y)
      else rlayer.recomputeChunk(change.x, change.y)
    }

    return changed
  }

  createQuad(change: CreateQuad) {
    const rgroup = this.groups[change.group]
    const rlayer = rgroup.layers[change.layer] as RenderQuadsLayer

    const quad: Quad = {
      points: [...change.corners.map(p => coordFromJson(p, 15)), coordFromJson(change.position, 15)],
      colors: change.colors,
      texCoords: change.texCoords.map(p => uvFromJson(p, 10)),
      posEnv:
        change.posEnv === null ? null : (this.map.envelopes[change.posEnv] as PositionEnvelope),
      posEnvOffset: change.posEnvOffset,
      colorEnv:
        change.colorEnv === null ? null : (this.map.envelopes[change.colorEnv] as ColorEnvelope),
      colorEnvOffset: change.colorEnvOffset,
    }

    rlayer.layer.quads.push(quad)
    rlayer.recompute()
  }

  editQuad(change: EditQuad) {
    const rgroup = this.groups[change.group]
    const rlayer = rgroup.layers[change.layer] as RenderQuadsLayer
    const quad = rlayer.layer.quads[change.quad]

    if ('position' in change) quad.points[4] =  coordFromJson(change.position, 15)
    if ('colors' in change) quad.colors = change.colors
    if ('texCoords' in change) quad.texCoords = change.texCoords.map(p => uvFromJson(p, 10))
    if ('posEnv' in change)
      quad.posEnv =
        change.posEnv === null ? null : (this.map.envelopes[change.posEnv] as PositionEnvelope)
    if ('posEnvOffset' in change) quad.posEnvOffset = change.posEnvOffset
    if ('colorEnv' in change)
      quad.colorEnv =
        change.colorEnv === null ? null : (this.map.envelopes[change.colorEnv] as ColorEnvelope)
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

    if ('offX' in change) rgroup.group.offX = fromFixedNum(change.offX, 5)
    if ('offY' in change) rgroup.group.offY = fromFixedNum(change.offY, 5)
    if ('paraX' in change) rgroup.group.paraX = change.paraX
    if ('paraY' in change) rgroup.group.paraY = change.paraY
    if ('clipping' in change) rgroup.group.clipping = change.clipping
    if ('clipX' in change) rgroup.group.clipX = fromFixedNum(change.clipX, 5)
    if ('clipY' in change) rgroup.group.clipY = fromFixedNum(change.clipY, 5)
    if ('clipW' in change) rgroup.group.clipW = fromFixedNum(change.clipW, 5)
    if ('clipH' in change) rgroup.group.clipH = fromFixedNum(change.clipH, 5)
    if ('name' in change) rgroup.group.name = change.name
  }

  reorderGroup(change: ReorderGroup) {
    const [group] = this.map.groups.splice(change.group, 1)
    const [rgroup] = this.groups.splice(change.group, 1)
    this.map.groups.splice(change.newGroup, 0, group)
    this.groups.splice(change.newGroup, 0, rgroup)
  }

  deleteGroup(change: DeleteGroup) {
    this.map.groups.splice(change.group, 1)
    const [rgroup] = this.groups.splice(change.group, 1)
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
      if ('colorEnv' in change)
        rlayer.layer.colorEnv =
          change.colorEnv === null ? null : this.map.envelopes[change.colorEnv]
      if ('colorEnvOffset' in change) rlayer.layer.colorEnvOffset = change.colorEnvOffset
      if ('image' in change) {
        if (change.image === null) {
          rlayer.layer.image = null
          rlayer.texture = this.blankTexture
        } else {
          rlayer.layer.image = this.map.images[change.image]
          rlayer.texture = this.textures[change.image]
        }
        rlayer.recompute()
      }
      if ('automapper' in change) {
        rlayer.layer.automapper.config = change.automapper.config === null ? -1 : change.automapper.config
        rlayer.layer.automapper.seed = change.automapper.seed
        rlayer.layer.automapper.automatic = change.automapper.automatic
      }
    } else if (rlayer instanceof RenderQuadsLayer) {
      if ('image' in change) {
        if (change.image === null) {
          rlayer.layer.image = null
          rlayer.texture = this.blankTexture
        } else {
          rlayer.layer.image = this.map.images[change.image]
          rlayer.texture = this.textures[change.image]
        }
      }
    }
  }

  reorderLayer(change: ReorderLayer) {
    const rgroup = this.groups[change.group]
    const [rlayer] = rgroup.layers.splice(change.layer, 1)
    const [layer] = rgroup.group.layers.splice(change.layer, 1)
    this.groups[change.newGroup].layers.splice(change.newLayer, 0, rlayer)
    this.groups[change.newGroup].group.layers.splice(change.newLayer, 0, layer)
  }

  deleteLayer(change: DeleteLayer) {
    this.map.groups[change.group].layers.splice(change.layer, 1)
    const [rlayer] = this.groups[change.group].layers.splice(change.layer, 1)
    return rlayer
  }

  createGroup(_change: CreateGroup) {
    const group = new Group()
    const rgroup = new RenderGroup(this, group)
    this.map.groups.push(group)
    this.groups.push(rgroup)
    return rgroup
  }

  private instLayer(
    kind: CreateLayer['kind']
  ): RenderTilesLayer | RenderPhysicsLayer | RenderQuadsLayer {
    if (kind === 'tiles') return new RenderTilesLayer(this, new TilesLayer())
    else if (kind === 'quads') return new RenderQuadsLayer(this, new QuadsLayer())
    else if (kind === 'front') return new RenderFrontLayer(this, new FrontLayer())
    else if (kind === 'tele') return new RenderTeleLayer(this, new TeleLayer())
    else if (kind === 'speedup') return new RenderSpeedupLayer(this, new SpeedupLayer())
    else if (kind === 'switch') return new RenderSwitchLayer(this, new SwitchLayer())
    else if (kind === 'tune') return new RenderTuneLayer(this, new TuneLayer())
    else throw 'cannot create layer kind ' + kind
  }

  createLayer(create: CreateLayer) {
    const group = this.map.groups[create.group]
    const rgroup = this.groups[create.group]

    const rlayer = this.instLayer(create.kind)
    const layer = rlayer.layer

    if (layer instanceof AnyTilesLayer) {
      const { width, height } = this.gameLayer.layer
      layer.init(width, height, layer.defaultTile as any)
      rlayer.recompute()
    }

    rlayer.layer.name = create.name
    group.layers.push(rlayer.layer)
    rgroup.layers.push(rlayer)
    return rlayer
  }

  automapLayer(g: number, l: number, automapper: AutomapperConfig, seed: number) {
    const rgroup = this.groups[g]
    const layer = rgroup.layers[l]
    if (!(layer instanceof RenderTilesLayer)) return

    automap(layer.layer, automapper, seed)
    layer.recompute()
  }

  render() {
    for (const group of this.groups) {
      if (group === this.physicsGroup) {
        // render only the non-physics layers
        group.renderLayers(
          group.layers.filter(l => {
            return !isPhysicsLayer(l.layer)
          })
        )
      } else {
        group.render()
      }
    }

    // render the physics layers on top of the rest.
    this.physicsGroup.renderLayers(
      this.physicsGroup.layers.filter(l => {
        return isPhysicsLayer(l.layer)
      })
    )

    // render the brush at last.
    this.brushEnv.update(Date.now())
    this.brushGroup.render()

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
    } else {
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
    } else {
      rlayer.layer.setHeight(height, rlayer.layer.defaultTile)
      rlayer.recompute()
    }
  }
}
