import * as Info from './types'
import { GameLayer, FrontLayer, TeleLayer, SpeedupLayer, SwitchLayer, TuneLayer } from './tilesLayer'
import { DataFile } from './datafile'
import { parseGroup, parseImage, parseEnvelope } from './parser'
import { Group } from './group'
import { Image } from './image'
import { ColorEnvelope, PositionEnvelope, SoundEnvelope } from './envelope'

export type Ctor<T> = new(...args: any[]) => T
export type PhysicsLayer = GameLayer | FrontLayer | TeleLayer | SpeedupLayer | SwitchLayer | TuneLayer
export type Envelope = ColorEnvelope | PositionEnvelope | SoundEnvelope

export class Map {
  name: string
  images: Image[]
  groups: Group[]
  envelopes: Envelope[]
  
  constructor(name: string, data: ArrayBuffer)  {
    this.name = name
    const df = new DataFile(name, data)
    this.images = this.loadImages(df)
    this.envelopes = this.loadEnvelopes(df)
    this.groups = this.loadGroups(df)
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
    return [ g, l ]
  }

  physicsLayer<T extends PhysicsLayer>(ctor: Ctor<T>): T {
    return this.physicsGroup().layers.find(l => l instanceof ctor) as T
  }
  
  private loadImages(df: DataFile) {
    const imagesInfo = df.getType(Info.ItemType.IMAGE)

    if (!imagesInfo)
      return []

    const images = []
    
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
    
    if (!groupsInfo)
      return []
    
    const groups = []

    for (let g = 0; g < groupsInfo.num; g++) {
      const groupItem = df.getItem(groupsInfo.start + g)
      const groupInfo = parseGroup(groupItem.data)

      const grp = new Group()
      grp.load(this, df, groupInfo)
      groups.push(grp)
    }

    return groups
  }
  
  loadEnvelopes(df: DataFile) {
    const envsInfo = df.getType(Info.ItemType.ENVELOPE)
    
    if (!envsInfo)
      return []
    
    const envelopes = []
    
    for (let e = 0; e < envsInfo.num; e++) {
      const envItem = df.getItem(envsInfo.start + e)
      const envInfo = parseEnvelope(envItem.data)
      
      if (envInfo.type == Info.EnvType.COLOR) {
        const env = new ColorEnvelope()
        env.load(this, df, envInfo)
        envelopes.push(env)
      }
      
      else {
        console.warn('unsupported envelope type: ', envInfo.type, envInfo)
      }
    }
    
    return envelopes
  }
}