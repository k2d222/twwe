import type { Map, PhysicsLayer, Envelope } from '../twmap/map'
import type { RenderLayer } from './renderLayer'
import type { Quad } from '../twmap/quadsLayer'
import * as Info from '../twmap/types'
import * as MapDir from '../twmap/mapdir'
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
import { type Config as AutomapperConfig, automap } from '../twmap/automap'
import { colorFromJson, coordFromJson, curveTypeFromString, fromFixedNum, stringToResIndex, uvFromJson } from '../server/convert'
import type { Brush } from '../ui/lib/editor'
import type { EditTile, Recv } from '../server/protocol'

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

  createEnvelope(part: Recv['create/envelope']) {
    let env: Envelope
      if (part.type === 'color')
        env = new ColorEnvelope()
      else if (part.type === 'position')
        env = new PositionEnvelope()
      else if (part.type === 'sound')
        env = new SoundEnvelope()
      else {
        const _unreachable: never = part
        return _unreachable
      }

    if (part.name !== undefined)
      env.name = part.name
    this.addEnvelope(env)
  }

  editEnvelope(...[e, part]: Recv['edit/envelope']) {
    const env = this.map.envelopes[e]
    if (part.name !== undefined) env.name = part.name
    if (part.synchronized !== undefined) env.synchronized = part.synchronized
    if (part.points !== undefined) {
      if (part.type === 'color')
        env.points = part.points.map(p => ({
          time: p.time,
          content: colorFromJson(p.content, 10),
          type: curveTypeFromString(p.type),
        }))
      else if (part.type === 'position')
        env.points = part.points.map(p => ({
          time: p.time,
          content: {
            x: fromFixedNum(p.content.x, 15),
            y: fromFixedNum(p.content.y, 15),
            rotation: fromFixedNum(p.content.rotation, 10),
          },
          type: curveTypeFromString(p.type),
        }))
      else if (part.type === 'sound')
        env.points = part.points.map(p => ({
          time: p.time,
          content: fromFixedNum(p.content, 10),
          type: curveTypeFromString(p.type),
        }))
    }
  }

  removeEnvelope(id: number) {
    this.map.envelopes.splice(id, 1)
  }

  editTile(e: EditTile) {
    const rgroup = this.groups[e.g]
    const rlayer = rgroup.layers[e.l] as RenderAnyTilesLayer<PhysicsLayer | TilesLayer>
    const layer = rlayer.layer

    if (e.x < 0 || e.y < 0 || e.x >= layer.width || e.y >= layer.height)
      return false

    const tile = layer.getTile(e.x, e.y)

    let changed = false

    for (let key in tile) {
      if (key in e && e[key] !== tile[key]) {
        tile[key] = e[key]
        changed = true
      }
    }

    if (changed) {
      if (rlayer === this.gameLayer) this.gameLayer.recomputeChunk(e.x, e.y)
      else rlayer.recomputeChunk(e.x, e.y)
    }

    return changed
  }

  createQuad(...[g, l, part]: Recv['create/quad']) {
    const rgroup = this.groups[g]
    const rlayer = rgroup.layers[l] as RenderQuadsLayer

    const quad: Quad = {
      points: [...part.corners.map(p => coordFromJson(p, 15)), coordFromJson(part.position, 15)],
      colors: part.colors,
      texCoords: part.texture_coords.map(p => uvFromJson(p, 10)),
      posEnv:
        part.position_env === null ? null : (this.map.envelopes[stringToResIndex(part.position_env)[0]] as PositionEnvelope),
      posEnvOffset: part.position_env_offset,
      colorEnv:
        part.color_env === null ? null : (this.map.envelopes[stringToResIndex(part.color_env)[0]] as ColorEnvelope),
      colorEnvOffset: part.color_env_offset,
    }

    rlayer.layer.quads.push(quad)
    rlayer.recompute()
  }

  editQuad(...[g, l, q, part]: Recv['edit/quad']) {
    const rgroup = this.groups[g]
    const rlayer = rgroup.layers[l] as RenderQuadsLayer
    const quad = rlayer.layer.quads[q]

    if ('position' in part)
      quad.points[4] =  coordFromJson(part.position, 15)
    if ('corners' in part)
      quad.points = [...part.corners.map(c => coordFromJson(c, 15)), quad.points[4]]
    if ('colors' in part)
      quad.colors = part.colors
    if ('texture_coords' in part)
      quad.texCoords = part.texture_coords.map(p => uvFromJson(p, 10))
    if ('posEnv' in part)
      quad.posEnv = part.position_env === null ? null : (this.map.envelopes[stringToResIndex(part.position_env)[0]] as PositionEnvelope)
    if ('position_env_offset' in part)
      quad.posEnvOffset = part.position_env_offset
    if ('colorEnv' in part)
      quad.colorEnv = part.color_env === null ? null : (this.map.envelopes[stringToResIndex(part.color_env)[0]] as ColorEnvelope)
    if ('color_env_offset' in part)
      quad.colorEnvOffset = part.color_env_offset

    rlayer.recompute()
  }

  deleteQuad(...[g, l, q]: Recv['delete/quad']) {
    const rgroup = this.groups[g]
    const rlayer = rgroup.layers[l] as RenderQuadsLayer
    rlayer.layer.quads.splice(q, 1)
    rlayer.recompute()
  }

  editGroup(...[g, part]: Recv['edit/group']) {
    const rgroup = this.groups[g]

    if (part.offset !== undefined) {
      rgroup.group.offX = fromFixedNum(part.offset.x, 5)
      rgroup.group.offY = fromFixedNum(part.offset.y, 5)
    } 
    if (part.parallax !== undefined) {
      rgroup.group.paraX = part.parallax.x
      rgroup.group.paraY = part.parallax.y
    } 
    if (part.clipping !== undefined)
      rgroup.group.clipping = part.clipping
    if (part.clip !== undefined) {
      rgroup.group.clipX = fromFixedNum(part.clip.x, 5)
      rgroup.group.clipY = fromFixedNum(part.clip.y, 5)
      rgroup.group.clipW = fromFixedNum(part.clip.w, 5)
      rgroup.group.clipH = fromFixedNum(part.clip.h, 5)
    }
    if (part.name !== undefined)
      rgroup.group.name = part.name
  }

  reorderGroup(...[src, tgt]: Recv['move/group']) {
    const [group] = this.map.groups.splice(src, 1)
    const [rgroup] = this.groups.splice(src, 1)
    this.map.groups.splice(tgt, 0, group)
    this.groups.splice(tgt, 0, rgroup)
  }

  deleteGroup(g: Recv['delete/group']) {
    this.map.groups.splice(g, 1)
    const [rgroup] = this.groups.splice(g, 1)
    return rgroup
  }

  editLayer(...[g, l, part]: Recv['edit/layer']) {
    const rgroup = this.groups[g]
    const rlayer = rgroup.layers[l]

    if (part.detail !== undefined)
      rlayer.layer.detail = part.detail
    if (part.name !== undefined)
      rlayer.layer.name = part.name

    if (rlayer instanceof RenderTilesLayer && part.type === MapDir.LayerKind.Tiles) {
      if (part.color !== undefined)
        rlayer.layer.color = part.color
      if (part.width !== undefined)
        this.setLayerWidth(rgroup, rlayer, part.width)
      if (part.height !== undefined)
        this.setLayerHeight(rgroup, rlayer, part.height)
      if (part.color_env !== undefined)
        rlayer.layer.colorEnv = part.color_env === null ? null : this.map.envelopes[stringToResIndex(part.color_env)[0]] as ColorEnvelope
      if (part.color_env_offset !== undefined)
        rlayer.layer.colorEnvOffset = part.color_env_offset
      if (part.image !== undefined) {
        if (part.image === null) {
          rlayer.layer.image = null
          rlayer.texture = this.blankTexture
        }
        else {
          const index = stringToResIndex(part.image)[0]
          rlayer.layer.image = this.map.images[index]
          rlayer.texture = this.textures[index]
        }
        rlayer.recompute()
      }
      if (part.automapper_config !== undefined) {
        rlayer.layer.automapper.config = part.automapper_config.config === null ? -1 : part.automapper_config.config
        rlayer.layer.automapper.seed = part.automapper_config.seed
        rlayer.layer.automapper.automatic = part.automapper_config.automatic
      }
    }
    else if (rlayer instanceof RenderQuadsLayer && part.type === MapDir.LayerKind.Quads) {
      if (part.image !== undefined) {
        if (part.image === null) {
          rlayer.layer.image = null
          rlayer.texture = this.blankTexture
        }
        else {
          rlayer.layer.image = this.map.images[stringToResIndex(part.image)[0]]
          rlayer.texture = this.textures[stringToResIndex(part.image)[0]]
        }
      }
    }
  }

  reorderLayer(...[[g1, l1], [g2, l2]]: Recv['move/layer']) {
    const rgroup = this.groups[g1]
    const [rlayer] = rgroup.layers.splice(l1, 1)
    const [layer] = rgroup.group.layers.splice(l1, 1)
    this.groups[g2].layers.splice(l2, 0, rlayer)
    this.groups[g2].group.layers.splice(l2, 0, layer)
  }

  deleteLayer(...[g, l]: Recv['delete/layer']) {
    this.map.groups[g].layers.splice(l, 1)
    const [rlayer] = this.groups[g].layers.splice(l, 1)
    return rlayer
  }

  createGroup(part: Recv['create/group']) {
    const group = new Group()
    const rgroup = new RenderGroup(this, group)
    this.map.groups.push(group)
    this.groups.push(rgroup)
    this.editGroup(this.groups.length - 1, part)
    return rgroup
  }

  private instLayer(kind: MapDir.LayerKind): RenderTilesLayer | RenderPhysicsLayer | RenderQuadsLayer {
    if (kind === 'tiles') return new RenderTilesLayer(this, new TilesLayer())
    else if (kind === 'quads') return new RenderQuadsLayer(this, new QuadsLayer())
    else if (kind === 'front') return new RenderFrontLayer(this, new FrontLayer())
    else if (kind === 'tele') return new RenderTeleLayer(this, new TeleLayer())
    else if (kind === 'speedup') return new RenderSpeedupLayer(this, new SpeedupLayer())
    else if (kind === 'switch') return new RenderSwitchLayer(this, new SwitchLayer())
    else if (kind === 'tune') return new RenderTuneLayer(this, new TuneLayer())
    else throw 'cannot create layer kind ' + kind
  }

  createLayer(...[g, part]: Recv['create/layer']) {
    const group = this.map.groups[g]
    const rgroup = this.groups[g]

    const rlayer = this.instLayer(part.type)
    const layer = rlayer.layer

    if (layer instanceof AnyTilesLayer) {
      const { width, height } = this.gameLayer.layer
      layer.init(width, height, layer.defaultTile as any)
      rlayer.recompute()
    }

    group.layers.push(rlayer.layer)
    rgroup.layers.push(rlayer)
    this.editLayer(g, group.layers.length - 1, part)
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
