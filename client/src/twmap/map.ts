import { ItemType, TilesLayerFlags } from './types'
import { TilesLayer } from './tilesLayer'
import { DataFile } from './datafile'
import { parseGroup, parseImage } from './parser'
// import { Texture } from './texture'
import { Group } from './group'
import { Image } from './image'

export class Map {
  name: string
  images: Image[]
  groups: Group[]
  
  constructor(name: string, data: ArrayBuffer)  {
    this.name = name
    const df = new DataFile(name, data)
    this.images = this.loadImages(df)
    this.groups = this.loadGroups(df)
  }
  
  // return [ groupID, layerID ]
  gameLayerID(): [number, number] {
    for (let i = 0; i < this.groups.length; i++) {
      let g = this.groups[i]
      for (let j = 0; j < g.layers.length; j++) {
        let l = g.layers[j]
        if (l instanceof TilesLayer && l.flags == TilesLayerFlags.GAME) {
          return [ i, j ]
        }
      }
    }
    
    return [ -1, -1 ]
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