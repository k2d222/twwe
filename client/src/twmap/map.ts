import { ItemType } from './types'
import { GameLayer, FrontLayer, TeleLayer, SpeedupLayer, SwitchLayer, TuneLayer } from './tilesLayer'
import { DataFile } from './datafile'
import { parseGroup, parseImage } from './parser'
import { Group } from './group'
import { Image } from './image'

export type Ctor<T> = new(...args: any[]) => T
export type PhysicsLayer = GameLayer | FrontLayer | TeleLayer | SpeedupLayer | SwitchLayer | TuneLayer

export interface Info {
  author: string,
  version: string,
  credits: string,
  license: string,
  settings: string[],
}

export class Map {
  name: string
  images: Image[]
  groups: Group[]
  info: Info
  
  constructor(name: string, data: ArrayBuffer)  {
    this.name = name
    const df = new DataFile(name, data)
    this.images = this.loadImages(df)
    this.groups = this.loadGroups(df)
    this.info = {
      author: '',
      version: '',
      credits: '',
      license: '',
      settings: [],
    }
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
    const imagesInfo = df.getType(ItemType.IMAGE)

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
    const groupsInfo = df.getType(ItemType.GROUP)
    
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
}