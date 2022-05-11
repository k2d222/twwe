import { MapItemType, LayerType } from './types'
import { DataFile } from './datafile'
import { parseMapGroup, parseString } from './parser'
// import { Texture } from './texture'
import { Group } from './group'


export class Map {
  name: string
  groups: Group[]
  
  constructor(name: string, data: ArrayBuffer)  {
    this.name = name
    let df = new DataFile(name, data)
    // this.textures = this.loadTextures()
    this.groups = this.loadGroups(df)
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