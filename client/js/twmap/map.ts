import { MapItemType, LayerType } from './types'
import { DataFile } from './datafile'
import { parseMapGroup, parseMapImage } from './parser'
// import { Texture } from './texture'
import { Group } from './group'
import { Image } from './image'

export class Map {
  name: string
  images: Image[]
  groups: Group[]
  
  constructor(name: string, data: ArrayBuffer)  {
    this.name = name
    let df = new DataFile(name, data)
    this.images = this.loadImages(df)
    this.groups = this.loadGroups(df)
  }
  
  private loadImages(df: DataFile) {
    let imagesInfo = df.getType(MapItemType.IMAGE)
    let images = []
    
    for (let i = 0; i < imagesInfo.num; i++) {
      let imageItem = df.getItem(imagesInfo.start + i)
      let imageInfo = parseMapImage(imageItem.data)
      
      let img = new Image()
      img.load(df, imageInfo)
      images.push(img)
    }
    
    return images
  }
  
  private loadGroups(df: DataFile) {
    let groupsInfo = df.getType(MapItemType.GROUP)
    let groups = []

    for (let g = 0; g < groupsInfo.num; g++) {
    	let groupItem = df.getItem(groupsInfo.start + g)
    	let groupInfo = parseMapGroup(groupItem.data)

    	let grp = new Group()
      grp.load(df, groupInfo)
    	groups.push(grp)
    }

    return groups
  }
}