import type { Layer } from './layer'
import * as Info from './types'
import {
  GameLayer,
  FrontLayer,
  TeleLayer,
  SpeedupLayer,
  SwitchLayer,
  TuneLayer,
  TilesLayer,
} from './tilesLayer'
import { DataFile } from './datafile'
import {
  parseGroup,
  parseImage,
  parseEnvelope,
  parseInfo,
  parseString,
  parseAutomapper,
} from './parser'
import { Group } from './group'
import { Image } from './image'
import { ColorEnvelope, PositionEnvelope, SoundEnvelope } from './envelope'
import { fromString as UuidFromString } from './uuid'
import { QuadsLayer } from './quadsLayer'

export type Ctor<T> = new (...args: any[]) => T
export type PhysicsLayer =
  | GameLayer
  | FrontLayer
  | TeleLayer
  | SpeedupLayer
  | SwitchLayer
  | TuneLayer
export type Envelope = ColorEnvelope | PositionEnvelope | SoundEnvelope

export interface MapInfo {
  author: string
  version: string
  credits: string
  license: string
  settings: string[]
}

export class Map {
  name: string
  images: Image[]
  envelopes: Envelope[]
  groups: Group[]
  info: MapInfo

  constructor() {
    this.name = ''
    this.images = []
    this.envelopes = []
    this.groups = []
    this.info = {
      author: '',
      version: '',
      credits: '',
      license: '',
      settings: [],
    }
  }

  load(name: string, data: ArrayBuffer) {
    const df = new DataFile(data)
    this.name = name
    this.images = this.loadImages(df)
    this.envelopes = this.loadEnvelopes(df)
    this.groups = this.loadGroups(df)
    this.info = this.loadInfo(df)
    const amConfigs = this.loadAutomapperConfigs(df)

    for (const config of amConfigs) {
      const layer = this.groups[config.group].layers[config.layer] as TilesLayer
      layer.automapper.automatic = (config.flags & 0b1) === 1
      layer.automapper.config = config.config
      layer.automapper.seed = config.seed
    }
  }

  groupIndex(group: Group): number {
    return this.groups.indexOf(group)
  }

  layerIndex(layer: Layer): [number, number] {
    for (let g = 0; g < this.groups.length; g++) {
      const group = this.groups[g]
      const l = group.layers.indexOf(layer)
      if (l !== -1) return [g, l]
    }
    return [-1, -1]
  }

  physicsGroupIndex(): number {
    return this.groups.findIndex(g => g.layers.findIndex(l => l instanceof GameLayer) !== -1)
  }

  physicsGroup(): Group {
    return this.groups[this.physicsGroupIndex()]
  }

  physicsLayerIndex<T extends PhysicsLayer>(ctor: Ctor<T>): [number, number] {
    const g = this.physicsGroupIndex()
    const l = this.groups[g].layers.findIndex(l => l instanceof ctor)
    return [g, l]
  }

  physicsLayer<T extends PhysicsLayer>(ctor: Ctor<T>): T {
    return this.physicsGroup().layers.find(l => l instanceof ctor) as T
  }

  imageInUse(image: number | Image) {
    if (typeof image === 'number') image = this.images[image]

    return (
      this.groups.findIndex(
        g =>
          g.layers.findIndex(
            l => (l instanceof TilesLayer || l instanceof QuadsLayer) && l.image === image
          ) !== -1
      ) !== -1
    )
  }

  private loadInfo(df: DataFile) {
    const info: MapInfo = {
      author: '',
      version: '',
      credits: '',
      license: '',
      settings: [],
    }

    const typ = df.getType(Info.ItemType.INFO)

    if (!typ || typ.num !== 1) return info

    const mapInfoItem = df.getItem(typ.start)
    const mapInfo = parseInfo(mapInfoItem.data)

    if (mapInfo.author !== -1) {
      const data = df.getData(mapInfo.author)
      info.author = parseString(data)
    }
    if (mapInfo.version !== -1) {
      const data = df.getData(mapInfo.version)
      info.version = parseString(data)
    }
    if (mapInfo.credits !== -1) {
      const data = df.getData(mapInfo.credits)
      info.credits = parseString(data)
    }
    if (mapInfo.license !== -1) {
      const data = df.getData(mapInfo.license)
      info.license = parseString(data)
    }
    if (mapInfo.settings !== -1) {
      let data = df.getData(mapInfo.settings)
      let str = parseString(data)
      while (str !== '') {
        info.settings.push(str)
        data = data.slice(str.length + 1)
        str = parseString(data)
      }
    }

    return info
  }

  private loadImages(df: DataFile) {
    const imagesInfo = df.getType(Info.ItemType.IMAGE)

    if (!imagesInfo) return []

    const images: Image[] = []

    for (let i = 0; i < imagesInfo.num; i++) {
      const imageItem = df.getItem(imagesInfo.start + i)
      const imageInfo = parseImage(imageItem.data)

      const img = new Image()
      img.load(df, imageInfo)
      images.push(img)
    }

    return images
  }

  private loadGroups(df: DataFile) {
    const groupsInfo = df.getType(Info.ItemType.GROUP)

    if (!groupsInfo) return []

    const groups: Group[] = []

    for (let g = 0; g < groupsInfo.num; g++) {
      const groupItem = df.getItem(groupsInfo.start + g)
      const groupInfo = parseGroup(groupItem.data)

      const grp = new Group()
      grp.load(this, df, groupInfo)
      groups.push(grp)
    }

    return groups
  }

  private loadEnvelopes(df: DataFile) {
    const envsInfo = df.getType(Info.ItemType.ENVELOPE)

    if (!envsInfo) return []

    const envelopes: Envelope[] = []

    for (let e = 0; e < envsInfo.num; e++) {
      const envItem = df.getItem(envsInfo.start + e)
      const envInfo = parseEnvelope(envItem.data)

      if (envInfo.type == Info.EnvType.COLOR) {
        const env = new ColorEnvelope()
        env.load(this, df, envInfo)
        envelopes.push(env)
      } else if (envInfo.type === Info.EnvType.POSITION) {
        const env = new PositionEnvelope()
        env.load(this, df, envInfo)
        envelopes.push(env)
      } else {
        console.warn('unsupported envelope type: ', envInfo.type, envInfo)
      }
    }

    return envelopes
  }

  private loadAutomapperConfigs(df: DataFile) {
    const uuid = UuidFromString('mapitemtype-automapper-config@ddnet.tw')
    const automappersInfo = df.findUuidType(uuid)

    if (!automappersInfo) return []

    const automappers: Info.Automapper[] = []

    for (let i = 0; i < automappersInfo.num; i++) {
      const item = df.getItem(automappersInfo.start + i)
      const automapperInfo = parseAutomapper(item.data)
      automappers.push(automapperInfo)
    }

    return automappers
  }
}
